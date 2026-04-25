"""HyperAgent API routes — optionally mountable under /api/hyper."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .config import HyperAgentConfig
from .domain_bridge import HyperEnvironmentBridge
from .red_hyper import HyperRedAgent
from .blue_hyper import HyperBlueAgent
from .strategy_evolver import StrategyEvolver
from .safety_sandbox import SafetySandbox

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hyper", tags=["hyperagents"])

# ── Global state (shared across routes) ──────────────────────────────────────

_config = HyperAgentConfig()
_bridge = HyperEnvironmentBridge()
_red_agent: HyperRedAgent | None = None
_blue_agent: HyperBlueAgent | None = None
_red_evolver: StrategyEvolver | None = None
_blue_evolver: StrategyEvolver | None = None


def _ensure_agents() -> tuple[HyperRedAgent, HyperBlueAgent]:
    global _red_agent, _blue_agent, _red_evolver, _blue_evolver
    if _red_agent is None:
        _red_agent = HyperRedAgent(_bridge, _config)
        _red_evolver = StrategyEvolver("red", _config)
    if _blue_agent is None:
        _blue_agent = HyperBlueAgent(_bridge, _config)
        _blue_evolver = StrategyEvolver("blue", _config)
    return _red_agent, _blue_agent


class ToggleRequest(BaseModel):
    enabled: bool = True
    red_enabled: bool | None = None
    blue_enabled: bool | None = None


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def hyper_status() -> dict[str, Any]:
    """HyperAgent system status."""
    red, blue = _ensure_agents()
    return {
        "enabled": _config.enabled,
        "red_hyper_enabled": _config.red_hyper_enabled,
        "blue_hyper_enabled": _config.blue_hyper_enabled,
        "llm_backend": _config.llm_backend,
        "llm_model": _config.llm_model,
        "improvement_interval_steps": _config.improvement_interval_steps,
        "red": red.get_strategy(),
        "blue": blue.get_strategy(),
    }


@router.get("/red/strategy")
async def red_strategy() -> dict[str, Any]:
    """Current Red meta-agent strategy and parameters."""
    red, _ = _ensure_agents()
    return red.get_strategy()


@router.get("/blue/strategy")
async def blue_strategy() -> dict[str, Any]:
    """Current Blue meta-agent strategy and parameters."""
    _, blue = _ensure_agents()
    return blue.get_strategy()


@router.get("/evolution")
async def evolution_report() -> dict[str, Any]:
    """Strategy evolution history and trends."""
    _ensure_agents()
    red_report = _red_evolver.get_evolution_report() if _red_evolver else None
    blue_report = _blue_evolver.get_evolution_report() if _blue_evolver else None
    return {
        "red": red_report.model_dump() if red_report else {},
        "blue": blue_report.model_dump() if blue_report else {},
    }


@router.get("/audit")
async def audit_trail(agent_type: str | None = None) -> dict[str, Any]:
    """Safety audit trail."""
    red, blue = _ensure_agents()
    records: list[dict[str, Any]] = []
    if red.safety:
        records.extend(red.safety.get_audit_trail(agent_type))
    if blue.safety:
        records.extend(blue.safety.get_audit_trail(agent_type))
    return {"audit_trail": records[-50:], "total_records": len(records)}


@router.post("/toggle")
async def toggle_hyperagents(req: ToggleRequest) -> dict[str, Any]:
    """Enable/disable HyperAgent layer."""
    global _config
    _config.enabled = req.enabled
    if req.red_enabled is not None:
        _config.red_hyper_enabled = req.red_enabled
    if req.blue_enabled is not None:
        _config.blue_hyper_enabled = req.blue_enabled
    return {
        "enabled": _config.enabled,
        "red_hyper_enabled": _config.red_hyper_enabled,
        "blue_hyper_enabled": _config.blue_hyper_enabled,
    }


@router.get("/improvements")
async def improvements_list(agent_type: str | None = None) -> dict[str, Any]:
    """List of all self-improvements made."""
    red, blue = _ensure_agents()
    records: list[dict[str, Any]] = []
    for r in red.meta.improvement_log:
        if agent_type and r.agent_type != agent_type:
            continue
        records.append(r.model_dump())
    for r in blue.meta.improvement_log:
        if agent_type and r.agent_type != agent_type:
            continue
        records.append(r.model_dump())
    records.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return {"improvements": records[:50], "total": len(records)}


@router.get("/meta-insights")
async def meta_insights() -> dict[str, Any]:
    """Meta-agent's self-reflections."""
    red, blue = _ensure_agents()
    return {
        "red": {
            "evaluation_focus": red.meta.evaluation_focus,
            "change_magnitude": red.meta.change_magnitude,
            "improvement_frequency": red.meta.improvement_frequency,
            "strategy_history_count": len(red.meta.strategy_history),
            "improvement_log_count": len(red.meta.improvement_log),
        },
        "blue": {
            "evaluation_focus": blue.meta.evaluation_focus,
            "change_magnitude": blue.meta.change_magnitude,
            "improvement_frequency": blue.meta.improvement_frequency,
            "strategy_history_count": len(blue.meta.strategy_history),
            "improvement_log_count": len(blue.meta.improvement_log),
        },
    }


@router.websocket("/ws/live")
async def hyper_live_ws(ws: WebSocket) -> None:
    """WebSocket for real-time meta-agent thinking stream."""
    await ws.accept()
    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                cmd = msg.get("command", "")
                if cmd == "status":
                    red, blue = _ensure_agents()
                    await ws.send_json({
                        "type": "hyper_status",
                        "red": red.get_strategy(),
                        "blue": blue.get_strategy(),
                    })
                elif cmd == "reflect":
                    agent_type = msg.get("agent", "red")
                    red, blue = _ensure_agents()
                    agent = red if agent_type == "red" else blue
                    result = await agent.meta.self_reflect()
                    await ws.send_json({
                        "type": "meta_reflection",
                        "agent": agent_type,
                        "self_assessment": result.self_assessment,
                        "patterns_noticed": result.patterns_noticed,
                        "meta_changes": result.meta_changes,
                        "confidence": result.confidence_in_self_assessment,
                    })
                else:
                    await ws.send_json({"type": "error", "message": f"Unknown command: {cmd}"})
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON"})
    except WebSocketDisconnect:
        logger.info("HyperAgent WebSocket disconnected")
    except Exception as exc:
        logger.warning(f"HyperAgent WebSocket error: {exc}")
