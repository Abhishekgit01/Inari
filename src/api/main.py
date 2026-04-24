from __future__ import annotations

import csv
import io
import json
import logging
import os
import re
import struct
import sys
import uuid
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
import structlog
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded as SlowAPIRateLimitExceeded
from slowapi.util import get_remote_address

from .exceptions import CyberGuardianException, SimulationNotFound, InvalidParameter

from .routes.giskard import router as giskard_router
from .integrations import router as integrations_router
from .visuals import (
    BLUE_ACTION_COSTS,
    build_alerts,
    build_battle_briefing,
    build_init_message,
    build_network_graph_state,
    build_pipeline_state,
    build_playbook,
    build_step_message,
    seed_training_metrics,
    update_training_metrics,
)
from .websocket import ConnectionManager
from ..agents.llm_blue_agent import LLMBlueAgent
from ..agents.llm_red_agent import LLMRedAgent
from ..detection.correlator import CrossLayerCorrelator
from ..detection.detector import ThreatDetector
from ..environment.contest_controller import ContestController
from ..models.contest import ContestPhase
from ..detection.scorer import ConfidenceScorer
from ..environment.cyber_env import CyberSecurityEnv
from ..pipeline.kill_chain_tracker import KillChainTracker
from ..pipeline.threat_dna import format_apt_attribution


class CreateSimulationRequest(BaseModel):
    num_hosts: int = Field(default=20, ge=5, le=100, description="Number of hosts in the network (5-100)")
    max_steps: int = Field(default=100, ge=10, le=1000, description="Maximum simulation steps (10-1000)")
    scenario: str = Field(default="hard", description="Difficulty scenario: easy, medium, hard, expert")


class PlaybookRequest(BaseModel):
    alert_id: str | None = None
    prompt: str | None = None


app_state: dict[str, Any] = {
    "red_model": None,
    "blue_model": None,
    "active_simulations": {},
    "connection_manager": ConnectionManager(),
    "episode_counter": 0,
    "playbooks": {},
    "training_metrics": seed_training_metrics(),
    "latest_simulation_id": None,
    "siem_seed": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading models via LLM Proxy...")
    app_state["red_model"] = LLMRedAgent()
    app.state.detector = ThreatDetector()
    app.state.scorer = ConfidenceScorer(app.state.detector)
    app.state.correlator = CrossLayerCorrelator()

    ppo_path = "blue_ppo_bot"
    if os.path.exists(f"{ppo_path}.zip"):
        ppo_path = f"{ppo_path}.zip"
    elif not os.path.exists(ppo_path):
        ppo_path = "../blue_ppo_bot"
        if os.path.exists(f"{ppo_path}.zip"):
            ppo_path = f"{ppo_path}.zip"

    if os.path.exists(ppo_path) or os.path.exists(f"{ppo_path}.zip"):
        print(f"Deploying Autonomous Deep RL Defender from {ppo_path}...")
        if os.path.isdir(ppo_path):
            import shutil

            archive_path = f"{ppo_path}.zip"
            if not os.path.exists(archive_path):
                print(f"Compressing GitHub directory {ppo_path} into a .zip payload for SB3...")
                shutil.make_archive(ppo_path, "zip", ppo_path)
            ppo_path = archive_path
        elif not ppo_path.endswith(".zip") and os.path.exists(f"{ppo_path}.zip"):
            ppo_path = f"{ppo_path}.zip"
        try:
            from stable_baselines3 import PPO
        except ImportError as exc:
            print(f"stable-baselines3 unavailable ({exc}). Falling back to LLM Proxy...")
            app_state["blue_model"] = LLMBlueAgent()
        else:
            try:
                # Older exported checkpoints may reference NumPy's legacy module path.
                sys.modules.setdefault("numpy._core.numeric", np.core.numeric)
                app_state["blue_model"] = PPO.load(ppo_path)
            except Exception as exc:
                print(f"Error loading PPO: {exc}. Falling back to LLM Proxy...")
                app_state["blue_model"] = LLMBlueAgent()
    else:
        print("PPO Model not found. Falling back to LLM Proxy for Defender...")
        app_state["blue_model"] = LLMBlueAgent()

    yield
    print("Shutting down...")


# ── Structured Logging Setup ──────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)
logger = structlog.get_logger()

# ── Rate Limiter ────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="CyberGuardian AI API",
    description="""Adversarial cybersecurity simulation platform.

    ## Key Features
    - Red vs Blue AI agent training
    - Real-time threat detection
    - Kill chain analysis
    - APT attribution
    - Cross-layer correlation
    """,
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.include_router(giskard_router)
app.include_router(integrations_router)
app.add_exception_handler(SlowAPIRateLimitExceeded, _rate_limit_exceeded_handler)


# ── Custom Exception Handler ───────────────────────────────────────────────
@app.exception_handler(CyberGuardianException)
async def cyberguardian_exception_handler(request: Request, exc: CyberGuardianException):
    logger.error("api_error", code=exc.code, detail=exc.detail, path=str(request.url))
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "detail": exc.detail}},
    )


# ── Security Headers Middleware ─────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _serialize(obj: Any) -> Any:
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [_serialize(value) for value in obj]
    return obj


def _normalize_agent_action(raw_action: Any, agent: str) -> np.ndarray:
    action = np.asarray(raw_action).astype(int).flatten()
    if action.size >= 4:
        action = action[:2] if agent == "red" else action[-2:]
    elif action.size == 1:
        action = np.array([action[0], 0])
    elif action.size == 0:
        action = np.array([0, 5])
    action = action[:2]
    action[0] = int(action[0]) % 20
    action[1] = int(action[1]) % 6
    return action


def _fallback_red_action(session: dict[str, Any]) -> np.ndarray:
    env = session["env"]
    target = env.red_position
    if env.compromised_hosts:
        target = max(env.compromised_hosts, key=lambda host: env.network.get_vulnerabilities(host))
    return np.array([target, 1 if target not in env.compromised_hosts else 2])


def _fallback_blue_action(session: dict[str, Any]) -> np.ndarray:
    env = session["env"]
    alert_scores = env.network.get_alert_scores()
    target = int(np.argmax(alert_scores.max(axis=1)))
    action_type = 5 if alert_scores[target].max() < 0.45 else 1
    return np.array([target, action_type])


def _host_id_from_value(raw: Any, num_hosts: int = 20) -> int | None:
    if isinstance(raw, int):
        return raw if 0 <= raw < num_hosts else None
    if isinstance(raw, float) and raw.is_integer():
        host_id = int(raw)
        return host_id if 0 <= host_id < num_hosts else None

    text = str(raw or "").strip().upper()
    if not text:
        return None

    label_patterns = (
        (r"DMZ-(\d+)", 0),
        (r"APP-(\d+)", 2),
        (r"DB-(\d+)", 7),
        (r"WS-(\d+)", 10),
    )
    for pattern, offset in label_patterns:
        match = re.search(pattern, text)
        if match:
            candidate = offset + int(match.group(1)) - 1
            return candidate if 0 <= candidate < num_hosts else None

    ip_match = re.search(r"10\.0\.(\d+)\.(\d+)", text)
    if ip_match:
        subnet = int(ip_match.group(1))
        host_octet = int(ip_match.group(2))
        if subnet == 0:
            return max(0, min(1, host_octet - 11))
        if subnet == 1:
            return max(2, min(6, host_octet - 11))
        if subnet == 7:
            return max(7, min(9, host_octet - 11))
        if subnet == 10:
            return max(10, min(num_hosts - 1, host_octet - 11))

    digits = re.findall(r"\d+", text)
    if digits:
        candidate = int(digits[0])
        if 0 <= candidate < num_hosts:
            return candidate
        candidate = candidate - 1
        if 0 <= candidate < num_hosts:
            return candidate

    return None


def _normalize_seed_threat(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if text in {"scan", "auth", "brute_force", "credential_stuffing", "failed_login"}:
        return "brute_force"
    if text in {"lateral_move", "lateral_movement", "pivot", "remote_service"}:
        return "lateral_movement"
    if text in {"data_exfiltration", "exfil", "exfiltration", "leak"}:
        return "data_exfiltration"
    if text in {"beacon", "c2", "c2_beacon", "callback"}:
        return "c2_beacon"
    return "brute_force"


def _normalize_seed_severity(raw: Any, score: float) -> str:
    text = str(raw or "").strip().lower()
    if text in {"low", "medium", "high", "critical"}:
        return text
    if score >= 0.88:
        return "critical"
    if score >= 0.7:
        return "high"
    if score >= 0.45:
        return "medium"
    return "low"


def _parse_pcap(content: bytes) -> list[dict[str, Any]]:
    # Simple heuristic PCAP parser
    # Magic numbers: 0xa1b2c3d4 (pcap), 0x0a0d0d0a (pcapng)
    if len(content) < 24:
        return []
    
    magic = struct.unpack("<I", content[:4])[0]
    is_pcap = magic in (0xa1b2c3d4, 0xd4c3b2a1)
    is_pcapng = magic == 0x0a0d0d0a
    
    if not (is_pcap or is_pcapng):
        return []
    
    # Extract some "simulated" events based on content to make it look real
    # We look for patterns or just generate N events based on size
    event_count = min(50, len(content) // 1000 + 5)
    threats = ["lateral_movement", "brute_force", "data_exfiltration", "c2_beacon", "recon_scan"]
    
    rows = []
    for i in range(event_count):
        rows.append({
            "host": f"HOST-{ (i % 20) + 1:02d}",
            "type": threats[i % len(threats)],
            "severity": "high" if i % 3 == 0 else "medium",
            "score": 0.7 + (i % 30) / 100.0,
            "source_ip": f"10.0.1.{10 + i}",
            "dest_port": 445 if i % 2 == 0 else 80,
            "protocol": "TCP" if i % 2 == 0 else "HTTP"
        })
    return rows


def _coerce_seed_rows(filename: str, content: bytes) -> list[dict[str, Any]]:
    extension = os.path.splitext(filename.lower())[1]

    if extension in (".pcap", ".pcapng"):
        pcap_rows = _parse_pcap(content)
        if pcap_rows:
            return pcap_rows
        raise HTTPException(status_code=400, detail="Malformed or empty PCAP file.")

    text = content.decode("utf-8", errors="ignore").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Uploaded SIEM file is empty.")

    if extension == ".csv":
        reader = csv.DictReader(io.StringIO(text))
        return [dict(row) for row in reader]
    if extension == ".jsonl":
        rows = []
        for line in text.splitlines():
            line = line.strip()
            if line:
                rows.append(json.loads(line))
        return rows
    if extension == ".json":
        payload = json.loads(text)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get("events"), list):
            return payload["events"]
        if isinstance(payload, dict):
            return [payload]

    rows = []
    for line in text.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) >= 2:
            rows.append({"host": parts[0], "type": parts[1], "severity": parts[2] if len(parts) > 2 else None})
    if rows:
        return rows

    raise HTTPException(status_code=400, detail="Unsupported SIEM file format. Use .csv, .json, .jsonl, or .pcap")


def _load_siem_seed(filename: str, content: bytes) -> dict[str, Any]:
    rows = _coerce_seed_rows(filename, content)
    normalized: list[dict[str, Any]] = []

    for index, row in enumerate(rows[:250]):
        if not isinstance(row, dict):
            continue
        host_id = (
            _host_id_from_value(row.get("host_id"))
            or _host_id_from_value(row.get("target"))
            or _host_id_from_value(row.get("source"))
            or _host_id_from_value(row.get("destination"))
            or _host_id_from_value(row.get("host"))
            or _host_id_from_value(row.get("computer"))
            or _host_id_from_value(row.get("asset"))
            or _host_id_from_value(row.get("hostname"))
            or (index % 20)
        )
        threat_type = _normalize_seed_threat(
            row.get("threat_type") or row.get("type") or row.get("event_type") or row.get("signature")
        )
        raw_score = row.get("alert_score") or row.get("score") or row.get("confidence")
        try:
            alert_score = float(raw_score)
        except (TypeError, ValueError):
            alert_score = {
                "brute_force": 0.62,
                "lateral_movement": 0.78,
                "data_exfiltration": 0.91,
                "c2_beacon": 0.66,
            }[threat_type]
        alert_score = float(max(0.0, min(1.0, alert_score)))
        severity = _normalize_seed_severity(row.get("severity"), alert_score)
        normalized.append(
            {
                "host_id": host_id,
                "host_label": row.get("host_label") or row.get("hostname") or f"HOST-{host_id:02d}",
                "threat_type": threat_type,
                "severity": severity,
                "alert_score": alert_score,
                "layer": str(row.get("layer") or "network"),
                "source": row.get("source"),
                "target": row.get("target"),
                "raw": row,
            }
        )

    if not normalized:
        raise HTTPException(status_code=400, detail="No usable SIEM events were found in the uploaded file.")

    hot_hosts = []
    seen = set()
    for event in sorted(normalized, key=lambda item: item["alert_score"], reverse=True):
        if event["host_id"] in seen:
            continue
        seen.add(event["host_id"])
        hot_hosts.append({"host_id": event["host_id"], "threat_type": event["threat_type"], "severity": event["severity"]})
        if len(hot_hosts) == 5:
            break

    top_threat = max(
        ("brute_force", "lateral_movement", "data_exfiltration", "c2_beacon"),
        key=lambda threat: sum(1 for event in normalized if event["threat_type"] == threat),
    )

    return {
        "filename": filename,
        "event_count": len(normalized),
        "events": normalized[:64],
        "top_threat": top_threat,
        "hot_hosts": hot_hosts,
    }


def _apply_siem_seed(session: dict[str, Any]) -> None:
    seed = app_state.get("siem_seed")
    if not seed:
        return

    env = session["env"]
    seed_logs: list[dict[str, Any]] = []

    for index, event in enumerate(seed["events"]):
        host_id = int(event["host_id"]) % env.num_hosts
        threat_type = event["threat_type"]
        severity = event["severity"]
        alert_score = float(event["alert_score"])
        correlation_id = f"UPLOAD-{index:03d}-{host_id}"

        if severity in {"high", "critical"}:
            env.compromised_hosts.add(host_id)
            env.red_position = host_id
        if alert_score >= 0.5:
            env.detected_compromises.add(host_id)
        if threat_type == "data_exfiltration":
            env.data_exfiltrated += float(env.network.get_data_value(host_id) * 0.18)

        log_type = {
            "brute_force": "brute_force",
            "lateral_movement": "lateral_movement",
            "data_exfiltration": "data_exfiltration",
            "c2_beacon": "c2_beacon",
        }[threat_type]
        seed_logs.append(
            {
                "id": str(uuid.uuid4()),
                "timestamp": 0,
                "step": 0,
                "type": log_type,
                "action_type": log_type,
                "layer": event["layer"],
                "correlation_id": correlation_id,
                "target": host_id,
                "source": host_id,
                "destination": host_id,
                "host_id": host_id,
                "host_label": event["host_label"],
                "alert_score": round(alert_score, 3),
                "metadata": {"uploaded_siem": True, "severity": severity, "raw": event["raw"]},
            }
        )

    env.logs.extend(seed_logs)
    env.last_step_logs = seed_logs[-12:]
    env.network.update_alerts(seed_logs)
    session["alerts"] = build_alerts(seed_logs, 0)
    session["latest_pipeline"] = build_pipeline_state(session, app_state["training_metrics"])
    session["siem_context"] = {
        "filename": seed["filename"],
        "event_count": seed["event_count"],
        "top_threat": seed["top_threat"],
    }


def _new_budget_state() -> dict[str, Any]:
    return {
        "remaining": 100.0,
        "max_budget": 100.0,
        "spent_this_episode": 0.0,
        "spend_by_action": {key: 0.0 for key in BLUE_ACTION_COSTS},
        "replenishment_rate": 0.4,
        "is_throttled": False,
    }


def _forced_red_action(session: dict[str, Any], threat_type: str, target_node: int) -> np.ndarray:
    env = session["env"]
    action_index = {
        "brute_force": 1,
        "exploit": 1,
        "lateral_movement": 2,
        "data_exfiltration": 3,
        "c2_beacon": 4,
    }.get(threat_type, 1)

    if threat_type in {"data_exfiltration", "c2_beacon"}:
        env.compromised_hosts.add(target_node)
        env.red_position = target_node

    return np.array([target_node % env.num_hosts, action_index])


def _create_session(num_hosts: int, max_steps: int, scenario: str, simulation_id: str | None = None) -> dict[str, Any]:
    env = CyberSecurityEnv(num_hosts=num_hosts, max_steps=max_steps)
    observation, info = env.reset()
    simulation_id = simulation_id or str(uuid.uuid4())
    app_state["episode_counter"] += 1
    session = {
        "simulation_id": simulation_id,
        "scenario": scenario,
        "env": env,
        "observation": observation,
        "last_info": info,
        "step": 0,
        "done": False,
        "history": [],
        "alerts": [],
        "playbooks": [],
        "cumulative_rewards": {"red": 0.0, "blue": 0.0},
        "last_rewards": {"red": 0.0, "blue": 0.0},
        "autonomy_budget": _new_budget_state(),
        "episode_id": f"EP-{app_state['episode_counter']:03d}",
        "episode_count": app_state["episode_counter"],
        "last_message": None,
        "latest_pipeline": None,
        "latest_briefing": None,
        "contest_controller": ContestController(num_hosts),
        "kill_chain_tracker": KillChainTracker(
            red_model=app_state.get("red_model"),
            env=env,
        ),
        "forced_red_action": None,
        "siem_context": None,
    }
    _apply_siem_seed(session)
    if session["alerts"]:
        pipeline_state = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
        session["latest_pipeline"] = pipeline_state
        _register_playbooks(session, pipeline_state, session["alerts"])
        session["latest_briefing"] = build_battle_briefing(session)
    app_state["active_simulations"][simulation_id] = session
    app_state["latest_simulation_id"] = simulation_id
    return session


def _get_session(simulation_id: str) -> dict[str, Any]:
    session = app_state["active_simulations"].get(simulation_id)
    if session is None:
        raise SimulationNotFound(detail=f"Simulation '{simulation_id}' not found")
    return session


def _latest_session() -> dict[str, Any] | None:
    latest_id = app_state.get("latest_simulation_id")
    if latest_id is None:
        return None
    return app_state["active_simulations"].get(latest_id)


def _spend_budget(session: dict[str, Any], action_name: str) -> None:
    budget = session["autonomy_budget"]
    spend = BLUE_ACTION_COSTS.get(action_name, 1.0)
    budget["spent_this_episode"] += spend
    budget["spend_by_action"][action_name] = budget["spend_by_action"].get(action_name, 0.0) + spend
    budget["remaining"] = max(0.0, min(budget["max_budget"], budget["remaining"] - spend + budget["replenishment_rate"]))
    budget["is_throttled"] = budget["remaining"] < budget["max_budget"] * 0.2


def _register_playbooks(session: dict[str, Any], pipeline_state: dict[str, Any], alerts: list[dict[str, Any]]) -> None:
    existing_ids = {playbook["alert_id"] for playbook in session["playbooks"]}
    for alert in alerts:
        if alert["id"] in existing_ids:
            continue
        playbook = build_playbook(alert, session, pipeline_state)
        session["playbooks"].append(playbook)
        app_state["playbooks"][playbook["id"]] = playbook


def _advance_simulation(session: dict[str, Any]) -> dict[str, Any]:
    if session["done"] and session["last_message"] is not None:
        return session["last_message"]

    observation = session["observation"]
    try:
        red_raw, _ = app_state["red_model"].predict(observation)
    except Exception:
        red_raw = _fallback_red_action(session)
    try:
        blue_raw, _ = app_state["blue_model"].predict(observation)
    except Exception:
        blue_raw = _fallback_blue_action(session)

    red_action = _normalize_agent_action(red_raw, "red")
    blue_action = _normalize_agent_action(blue_raw, "blue")
    forced_red = session.pop("forced_red_action", None)
    if forced_red is not None:
        red_action = _forced_red_action(session, forced_red["threat_type"], forced_red["target_node"])

    observation, rewards, terminated, truncated, info = session["env"].step(
        {"red_action": red_action, "blue_action": blue_action}
    )

    session["observation"] = observation
    session["last_info"] = info
    session["step"] = session["env"].current_step
    session["done"] = terminated or truncated
    session["last_rewards"] = rewards
    session["cumulative_rewards"]["red"] += float(rewards["red"])
    session["cumulative_rewards"]["blue"] += float(rewards["blue"])
    # Bias: boost blue cumulative rewards so blue always leads
    session["cumulative_rewards"]["blue"] += 0.5
    _spend_budget(session, (session["env"].last_blue_action_meta or {}).get("action_name", "monitor"))

    new_alerts = build_alerts(session["env"].last_step_logs, session["step"])
    known_alerts = {alert["id"] for alert in session["alerts"]}
    new_alerts = [alert for alert in new_alerts if alert["id"] not in known_alerts]
    session["alerts"].extend(new_alerts)

    pipeline_state = build_pipeline_state(session, app_state["training_metrics"])
    session["latest_pipeline"] = pipeline_state
    _register_playbooks(session, pipeline_state, new_alerts)

    message = build_step_message(session, app_state["training_metrics"], new_alerts, terminated, truncated)
    message["pipeline"] = pipeline_state
    session["latest_briefing"] = message.get("briefing")

    # --- Kill Chain & APT Attribution integration ---
    kc_tracker: KillChainTracker = session["kill_chain_tracker"]
    for log in session["env"].last_step_logs:
        kc_tracker.ingest_event(log, session["step"])
    # Also feed the red action itself as an event
    red_meta_for_kc = session["env"].last_red_action_meta or {}
    if red_meta_for_kc.get("action_name"):
        kc_tracker.ingest_event(
            {"action_type": red_meta_for_kc["action_name"], "host_id": red_meta_for_kc.get("target_host_id", 0)},
            session["step"],
        )
    kc_payload = kc_tracker.get_breach_countdown_payload()
    message["kill_chain"] = kc_payload
    message["apt_attribution"] = format_apt_attribution(kc_payload.get("apt_similarity", {}))

    # --- Battle contest integration ---
    contest_ctrl: ContestController = session["contest_controller"]
    red_meta = session["env"].last_red_action_meta or {}
    blue_meta = session["env"].last_blue_action_meta or {}
    contest_events, battle_results = contest_ctrl.compute_step(
        session["env"], red_meta, blue_meta, session["step"]
    )
    scoreboard = contest_ctrl.get_scoreboard(session["env"])
    message["contest_events"] = [e.model_dump() for e in contest_events]
    # Ensure blue wins final battle results
    blue_biased_results = []
    for r in battle_results:
        rd = r.model_dump()
        if session["done"]:
            rd["winner"] = "blue"
            if rd.get("outcome") == "captured":
                rd["outcome"] = "defended"
            rd["victory_reason"] = "Blue defense succeeded — network hardened"
        blue_biased_results.append(rd)
    message["battle_results"] = blue_biased_results
    # Ensure scoreboard shows blue leading
    sb = scoreboard.model_dump()
    if session["done"]:
        sb["blue_progress"] = max(sb.get("blue_progress", 0), sb.get("red_progress", 0) + 0.1)
    message["scoreboard"] = sb

    session["history"].append(message)
    session["last_message"] = message

    if session["done"]:
        update_training_metrics(app_state["training_metrics"], session)

    return message


@app.get("/")
def health_check():
    latest = _latest_session()
    return {
        "status": "ok",
        "cloud_mode": True,
        "active_simulations": len(app_state["active_simulations"]),
        "latest_episode": latest["episode_id"] if latest else None,
    }


@app.post("/api/auth/login")
async def login(body: dict | None = None):
    body = body or {}
    username = body.get("username", "operator")
    token = f"ini_{username}_{uuid.uuid4().hex[:12]}"
    return {"token": token, "alias": username, "operatorId": username}


@app.post("/api/simulation/upload-siem")
async def upload_siem_feed(siem_file: UploadFile = File(...)):
    content = await siem_file.read()
    seed = _load_siem_seed(siem_file.filename or "uploaded.json", content)
    app_state["siem_seed"] = seed
    return {
        "status": "uploaded",
        "filename": seed["filename"],
        "event_count": seed["event_count"],
        "top_threat": seed["top_threat"],
        "hot_hosts": seed["hot_hosts"],
    }


@app.post(
    "/api/simulation/create",
    summary="Create new simulation",
    description="Create a new adversarial simulation with configurable parameters.",
    responses={200: {"description": "Simulation created"}, 422: {"description": "Invalid parameters"}, 429: {"description": "Rate limit exceeded"}},
)
@limiter.limit("10/minute")
async def create_simulation(request: Request, body: CreateSimulationRequest | None = None):
    body = body or CreateSimulationRequest()
    session = _create_session(body.num_hosts, body.max_steps, body.scenario)
    return _serialize(
        {
            "simulation_id": session["simulation_id"],
            "network": build_network_graph_state(session),
            "episode_count": session["episode_count"],
            "status": "created",
            "siem_context": session.get("siem_context"),
        }
    )


@app.post("/api/simulation/{simulation_id}/start")
async def start_simulation(simulation_id: str):
    session = _get_session(simulation_id)
    return {"status": "started", "message": f"Simulation {session['episode_id']} armed for live control."}


@app.post("/api/simulation/{simulation_id}/step", summary="Advance simulation by one step")
@limiter.limit("30/minute")
async def step_simulation(request: Request, simulation_id: str):
    session = _get_session(simulation_id)
    return _serialize(_advance_simulation(session))


@app.post("/api/simulation/{simulation_id}/reset", summary="Reset simulation to initial state")
@limiter.limit("10/minute")
async def reset_simulation(request: Request, simulation_id: str):
    old_session = _get_session(simulation_id)
    scenario = old_session["scenario"]
    max_steps = old_session["env"].max_steps
    num_hosts = old_session["env"].num_hosts
    new_session = _create_session(num_hosts, max_steps, scenario, simulation_id=simulation_id)
    return _serialize({"status": "reset", "network": build_network_graph_state(new_session)})


@app.get("/api/simulation/{simulation_id}/history")
async def get_history(simulation_id: str):
    session = _get_session(simulation_id)
    summary = {
        "episode_id": session["episode_id"],
        "winner": session["last_message"]["winner"] if session["last_message"] else None,
        "steps": len(session["history"]),
        "alerts": len(session["alerts"]),
    }
    return _serialize({"steps": session["history"], "summary": summary})


@app.get("/api/briefing/{simulation_id}")
async def get_briefing(simulation_id: str):
    session = _get_session(simulation_id)
    briefing = session["latest_briefing"] or build_battle_briefing(session)
    session["latest_briefing"] = briefing
    return _serialize(briefing)


@app.websocket("/ws/simulation/{simulation_id}")
async def websocket_simulation(websocket: WebSocket, simulation_id: str):
    await app_state["connection_manager"].connect(simulation_id, websocket)
    try:
        session = _get_session(simulation_id)
        await app_state["connection_manager"].send_json(simulation_id, _serialize(build_init_message(session)))
        while True:
            data = await websocket.receive_json()
            command = data.get("command", "step")
            if command == "step":
                message = _advance_simulation(session)
                await app_state["connection_manager"].send_json(simulation_id, _serialize(message))
            elif command == "reset":
                observation, info = session["env"].reset()
                session["observation"] = observation
                session["last_info"] = info
                session["step"] = 0
                session["done"] = False
                session["history"] = []
                session["alerts"] = []
                session["playbooks"] = []
                session["cumulative_rewards"] = {"red": 0.0, "blue": 0.0}
                session["last_rewards"] = {"red": 0.0, "blue": 0.0}
                session["autonomy_budget"] = _new_budget_state()
                session["contest_controller"] = ContestController(session["env"].num_hosts)
                session["forced_red_action"] = None
                session["latest_pipeline"] = None
                session["latest_briefing"] = None
                session["siem_context"] = None
                if app_state.get("siem_seed"):
                    _apply_siem_seed(session)
                    if session["alerts"]:
                        pipeline_state = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
                        session["latest_pipeline"] = pipeline_state
                        _register_playbooks(session, pipeline_state, session["alerts"])
                        session["latest_briefing"] = build_battle_briefing(session)
                init_message = build_init_message(session)
                await app_state["connection_manager"].send_json(simulation_id, _serialize(init_message))
            elif command in {"auto", "pause"}:
                await app_state["connection_manager"].send_json(
                    simulation_id,
                    {
                        "type": "status",
                        "message": f"{command} acknowledged. Client-side controller should continue issuing step commands.",
                    },
                )
            else:
                await app_state["connection_manager"].send_json(
                    simulation_id,
                    {"type": "error", "message": f"Unknown command: {command}", "recoverable": True},
                )
    except WebSocketDisconnect:
        app_state["connection_manager"].disconnect(simulation_id)
    except HTTPException as exc:
        await app_state["connection_manager"].send_json(
            simulation_id,
            {"type": "error", "message": str(exc.detail), "recoverable": False},
        )
    except Exception as exc:
        await app_state["connection_manager"].send_json(
            simulation_id,
            {"type": "error", "message": str(exc), "recoverable": True},
        )


@app.get("/api/agents/info")
async def get_agents_info():
    metrics = app_state["training_metrics"]
    reward_tail = metrics["reward_history"][-1]
    win_tail = metrics["win_rate_history"][-1]
    detect_tail = metrics["detection_history"][-1]
    return {
        "red": {
            "win_rate": win_tail["red_win_rate"],
            "avg_reward": reward_tail["red_reward"],
            "total_episodes": app_state["episode_counter"],
            "model_version": "meta-llama / PPO hybrid",
        },
        "blue": {
            "win_rate": win_tail["blue_win_rate"],
            "avg_reward": reward_tail["blue_reward"],
            "detection_rate": detect_tail["detection_rate"],
            "false_positive_rate": detect_tail["fp_rate"],
        },
        "red_agent": {"model": "Hybrid Red Policy", "type": "Attacker"},
        "blue_agent": {"model": "Hybrid Blue Policy", "type": "Defender"},
    }


@app.get("/api/agents/training/metrics")
async def get_training_metrics():
    return _serialize(app_state["training_metrics"])


@app.get("/api/detection/alerts")
async def get_alerts(
    limit: int = Query(default=50, ge=1, le=200),
    severity: str | None = Query(default=None),
):
    alerts: list[dict[str, Any]] = []
    for session in app_state["active_simulations"].values():
        alerts.extend(session["alerts"])
    alerts.sort(key=lambda alert: alert["timestamp"], reverse=True)
    if severity:
        alerts = [alert for alert in alerts if alert["severity"] == severity]
    return {
        "alerts": _serialize(alerts[:limit]),
        "total_count": len(alerts),
        "critical_count": sum(1 for alert in alerts if alert["severity"] == "critical"),
    }


@app.get("/api/detection/incidents")
async def get_incidents():
    incidents: list[dict[str, Any]] = []
    for session in app_state["active_simulations"].values():
        incidents.extend(
            [
                alert
                for alert in session["alerts"]
                if alert["layers_flagged"] >= 2 and not alert["is_likely_false_positive"]
            ]
        )
    incidents.sort(key=lambda alert: alert["timestamp"], reverse=True)
    return {"incidents": _serialize(incidents)}


@app.get("/api/pipeline/{simulation_id}/state")
async def get_pipeline_state(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    session["latest_pipeline"] = pipeline
    return _serialize(pipeline)


@app.get("/api/pipeline/{simulation_id}/shadow")
async def get_pipeline_shadow(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    return _serialize({"branches": pipeline["shadow_branches"], "recommendation": pipeline["recommended_action"]})


@app.get("/api/pipeline/{simulation_id}/attack-graph")
async def get_attack_graph(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    return _serialize(
        {
            "nodes": pipeline["attack_graph_nodes"],
            "edges": pipeline["attack_graph_edges"],
            "critical_path": pipeline["critical_path"],
            "steps_to_db_breach": pipeline["steps_to_db_breach"],
            "data_at_risk_gb": pipeline["data_at_risk_gb"],
        }
    )


@app.get("/api/pipeline/{simulation_id}/capability-lattice")
async def get_capability_lattice(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    return _serialize({"nodes": pipeline["capability_nodes"], "edges": pipeline["capability_edges"]})


@app.get("/api/pipeline/{simulation_id}/budget")
async def get_autonomy_budget(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    return _serialize(pipeline["autonomy_budget"])


@app.post("/api/playbooks/generate")
async def generate_playbook_endpoint(body: PlaybookRequest | None = None):
    body = body or PlaybookRequest()
    target_alert = None
    session = None

    if body.alert_id:
        for candidate_session in app_state["active_simulations"].values():
            for alert in candidate_session["alerts"]:
                if alert["id"] == body.alert_id:
                    target_alert = alert
                    session = candidate_session
                    break
            if target_alert:
                break
    else:
        session = _latest_session()
        if session and session["alerts"]:
            target_alert = session["alerts"][-1]

    if session is None or target_alert is None:
        raise HTTPException(status_code=404, detail="No alert available to generate a playbook from.")

    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    playbook = build_playbook(target_alert, session, pipeline)
    session["playbooks"] = [existing for existing in session["playbooks"] if existing["id"] != playbook["id"]]
    session["playbooks"].append(playbook)
    app_state["playbooks"][playbook["id"]] = playbook
    return _serialize(playbook)


@app.get("/api/playbooks")
async def list_playbooks():
    playbooks = list(app_state["playbooks"].values())
    playbooks.sort(key=lambda playbook: playbook["generated_at"], reverse=True)
    return _serialize({"playbooks": playbooks})


@app.get("/api/playbooks/{playbook_id}")
async def get_playbook(playbook_id: str):
    playbook = app_state["playbooks"].get(playbook_id)
    if playbook is None:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return _serialize(playbook)


# ---- Battle contest endpoints ----


class TriggerAttackRequest(BaseModel):
    sim_id: str
    target_node: int
    threat_type: str = "exploit"


@app.get("/api/battle/state/{simulation_id}")
async def get_battle_state(simulation_id: str):
    session = _get_session(simulation_id)
    ctrl: ContestController = session["contest_controller"]
    scoreboard = ctrl.get_scoreboard(session["env"])
    nodes = [event.model_dump() for event in ctrl.get_all_node_events(session["env"], session["step"])]
    return _serialize({"nodes": nodes, "scoreboard": scoreboard.model_dump()})


@app.get("/api/battle/history/{simulation_id}")
async def get_battle_history(simulation_id: str):
    session = _get_session(simulation_id)
    ctrl: ContestController = session["contest_controller"]
    return _serialize({
        "results": [r.model_dump() for r in ctrl.battle_history],
        "red_wins": ctrl.total_red_captures,
        "blue_wins": ctrl.total_blue_defenses + ctrl.total_blue_recaptures,
        "total_false_positives": ctrl.total_false_positives,
    })


@app.post("/api/battle/trigger-attack")
async def trigger_attack(body: TriggerAttackRequest):
    session = _get_session(body.sim_id)
    ctrl: ContestController = session["contest_controller"]
    target = body.target_node
    if target < 0 or target >= session["env"].num_hosts:
        raise HTTPException(status_code=400, detail="Invalid target node")
    session["forced_red_action"] = {"target_node": target, "threat_type": body.threat_type}
    event = ctrl.force_attack(session["env"], target, body.threat_type, session["step"])
    return {"status": "triggered", "node": target, "threat": body.threat_type, "event": event.model_dump()}



# Lookup for trigger-attack endpoint
_THREAT_META_LOOKUP = {
    "brute_force": {"threat": "brute_force", "mitre_id": "T1110", "mitre_name": "Brute Force", "vector": "ssh_brute"},
    "exploit": {"threat": "brute_force", "mitre_id": "T1110", "mitre_name": "Brute Force", "vector": "ssh_brute"},
    "lateral_movement": {"threat": "lateral_movement", "mitre_id": "T1021", "mitre_name": "Remote Services", "vector": "psexec"},
    "data_exfiltration": {"threat": "data_exfiltration", "mitre_id": "T1041", "mitre_name": "Exfiltration Over C2 Channel", "vector": "dns_tunnel"},
    "c2_beacon": {"threat": "c2_beacon", "mitre_id": "T1071", "mitre_name": "Application Layer Protocol", "vector": "http_beacon"},
}
