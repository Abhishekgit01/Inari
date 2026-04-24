"""
Kill Chain Velocity Tracker + Breach Countdown Oracle

Maps SIEM events to Lockheed Martin Kill Chain stages and computes:
  1. Current kill chain stage
  2. Attacker velocity (stage progression rate)
  3. Dwell time estimate (how long has attacker been inside?)
  4. Breach countdown (estimated time to data exfiltration)
  5. Threat DNA signature (behavioral fingerprint for APT attribution)
"""

import numpy as np
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import time

# ─── KILL CHAIN STAGE DEFINITIONS ─────────────────────────────────────────────

KILL_CHAIN_STAGES = {
    1: {
        "name": "Reconnaissance",
        "description": "Attacker scanning and probing targets",
        "color": "#00e5ff",
        "mitre_tactics": ["TA0043"],
        "event_types": ["scan", "port_probe", "service_enum"],
    },
    2: {
        "name": "Weaponization",
        "description": "Exploit preparation and payload staging",
        "color": "#00ff88",
        "mitre_tactics": ["TA0042"],
        "event_types": ["payload_drop", "exploit_prep"],
    },
    3: {
        "name": "Delivery",
        "description": "Attack vector delivered to target",
        "color": "#ffcc00",
        "mitre_tactics": ["TA0001"],
        "event_types": ["exploit", "brute_force", "phish"],
    },
    4: {
        "name": "Exploitation",
        "description": "Vulnerability exploited, initial foothold gained",
        "color": "#ff9900",
        "mitre_tactics": ["TA0002"],
        "event_types": ["exploit_success", "code_execution", "privilege_esc"],
    },
    5: {
        "name": "Installation",
        "description": "Persistence mechanisms established",
        "color": "#ff6600",
        "mitre_tactics": ["TA0003", "TA0005"],
        "event_types": ["beacon", "c2_beacon", "persistence_install"],
    },
    6: {
        "name": "C2 & Lateral Movement",
        "description": "Command channel active, spreading across network",
        "color": "#ff3300",
        "mitre_tactics": ["TA0011", "TA0008"],
        "event_types": ["lateral_move", "c2_communication", "credential_dump"],
    },
    7: {
        "name": "Actions on Objectives",
        "description": "Exfiltration — attacker achieving final goal",
        "color": "#ff0044",
        "mitre_tactics": ["TA0009", "TA0010"],
        "event_types": ["exfiltrate", "data_theft", "ransomware_deploy"],
    },
}

# Map RL environment action types to kill chain stages
EVENT_TO_STAGE = {
    "scan":          1,
    "port_probe":    1,
    "exploit":       3,
    "exploit_success": 4,
    "brute_force":   3,
    "lateral_move":  6,
    "beacon":        5,
    "c2_beacon":     5,
    "exfiltrate":    7,
    "data_exfil":    7,
    "monitor":       0,
    "isolate":       0,
    "patch":         0,
    "block_ip":      0,
    "reset_creds":   0,
    "investigate":   0,
}


@dataclass
class KillChainState:
    """Current state of the kill chain tracker"""
    current_stage: int = 1
    max_stage_reached: int = 1

    # Timestamps (in simulation steps)
    stage_entry_times: Dict[int, int] = field(default_factory=dict)
    stage_dwell_times: Dict[int, int] = field(default_factory=dict)

    # Velocity metrics
    velocity: float = 0.0
    acceleration: float = 0.0

    # Breach prediction
    estimated_steps_to_breach: Optional[float] = None
    breach_confidence: float = 0.0
    breach_countdown_seconds: Optional[float] = None

    # Dwell time
    estimated_dwell_time_steps: int = 0
    first_seen_step: Optional[int] = None

    # Threat DNA
    threat_dna: Dict[str, float] = field(default_factory=dict)
    apt_similarity: Dict[str, float] = field(default_factory=dict)

    # History for sparklines
    velocity_history: List[float] = field(default_factory=list)
    stage_history: List[int] = field(default_factory=list)


class KillChainTracker:
    """
    Tracks attacker progression through the Lockheed Martin Kill Chain.
    Uses RL Red Agent's learned transition probabilities to predict breach time.
    """

    def __init__(
        self,
        red_model=None,
        env=None,
        step_duration_seconds: float = 2.0,
        monte_carlo_rollouts: int = 50,
    ):
        self.red_model = red_model
        self.env = env
        self.step_duration = step_duration_seconds
        self.mc_rollouts = monte_carlo_rollouts

        self.state = KillChainState()
        self.event_buffer = deque(maxlen=100)
        self.current_step = 0

        self.apt_signatures = self._load_apt_signatures()

    def ingest_event(self, event: dict, step: int) -> KillChainState:
        self.current_step = step

        event_type = event.get("action_type", event.get("event_type", "unknown"))
        stage = EVENT_TO_STAGE.get(event_type, 0)

        if stage == 0:
            return self.state

        self.event_buffer.append({
            "stage": stage,
            "event_type": event_type,
            "step": step,
            "host_id": event.get("host_id", event.get("source_host", -1)),
        })

        self._update_stage(stage, step)
        self._compute_velocity()
        self._estimate_dwell_time(stage, step)

        if self.red_model is not None:
            self._predict_breach_rl(step)
        else:
            self._predict_breach_heuristic(step)

        self._compute_threat_dna()
        self._compute_apt_similarity()

        return self.state

    def _update_stage(self, new_stage: int, step: int):
        if new_stage > self.state.current_stage:
            self.state.current_stage = new_stage
            self.state.stage_entry_times[new_stage] = step

            if new_stage > self.state.max_stage_reached:
                self.state.max_stage_reached = new_stage

        if self.state.first_seen_step is None and new_stage >= 3:
            self.state.first_seen_step = step

        self.state.stage_history.append(self.state.current_stage)

    def _compute_velocity(self):
        if len(self.event_buffer) < 3:
            return

        recent = list(self.event_buffer)[-20:]
        if len(recent) < 2:
            return

        stage_delta = recent[-1]["stage"] - recent[0]["stage"]
        step_delta = recent[-1]["step"] - recent[0]["step"]

        if step_delta > 0:
            new_velocity = stage_delta / step_delta
            self.state.acceleration = new_velocity - self.state.velocity
            self.state.velocity = new_velocity

        self.state.velocity_history.append(self.state.velocity)

    def _estimate_dwell_time(self, current_stage: int, step: int):
        if self.state.first_seen_step is None:
            return

        detected_dwell = step - self.state.first_seen_step

        if self.state.velocity > 0:
            pre_detection_stages = max(0, self.state.first_seen_step - 1)
            pre_detection_steps = pre_detection_stages / max(self.state.velocity, 0.01)
            self.state.estimated_dwell_time_steps = int(detected_dwell + pre_detection_steps)
        else:
            self.state.estimated_dwell_time_steps = detected_dwell

    def _predict_breach_rl(self, step: int):
        if self.env is None:
            self._predict_breach_heuristic(step)
            return

        steps_to_breach = []

        try:
            current_obs = self.env._get_observation()
        except Exception:
            self._predict_breach_heuristic(step)
            return

        for rollout in range(self.mc_rollouts):
            steps = self._single_rollout(current_obs, max_steps=50)
            if steps is not None:
                steps_to_breach.append(steps)

        if steps_to_breach:
            mean_steps = np.mean(steps_to_breach)
            success_rate = len(steps_to_breach) / self.mc_rollouts

            self.state.estimated_steps_to_breach = mean_steps
            self.state.breach_confidence = success_rate
            self.state.breach_countdown_seconds = mean_steps * self.step_duration
        else:
            self.state.estimated_steps_to_breach = None
            self.state.breach_confidence = 0.1
            self.state.breach_countdown_seconds = None

    def _single_rollout(self, initial_obs, max_steps: int) -> Optional[int]:
        try:
            obs = initial_obs
            for step in range(max_steps):
                action, _ = self.red_model.predict(obs, deterministic=False)
                target_host, action_type = action if hasattr(action, '__iter__') else (action, 0)
                if action_type == 3:
                    return step + 1
            return None
        except Exception:
            return None

    def _predict_breach_heuristic(self, step: int):
        remaining_stages = 7 - self.state.current_stage

        if remaining_stages <= 0:
            self.state.estimated_steps_to_breach = 0
            self.state.breach_confidence = 0.95
            self.state.breach_countdown_seconds = 0
            return

        if self.state.velocity > 0:
            steps_per_stage = 1.0 / self.state.velocity
            estimated_steps = remaining_stages * steps_per_stage
            data_confidence = min(0.85, len(self.event_buffer) / 20)
            self.state.estimated_steps_to_breach = estimated_steps
            self.state.breach_confidence = data_confidence
            self.state.breach_countdown_seconds = estimated_steps * self.step_duration
        else:
            self.state.estimated_steps_to_breach = remaining_stages * 8
            self.state.breach_confidence = 0.25
            self.state.breach_countdown_seconds = remaining_stages * 8 * self.step_duration

    def _compute_threat_dna(self):
        if len(self.event_buffer) < 5:
            return

        events = list(self.event_buffer)

        stage_counts = defaultdict(int)
        for e in events:
            stage_counts[e["stage"]] += 1
        total = len(events)
        stage_dist = {f"stage_{k}": v/total for k, v in stage_counts.items()}

        action_counts = defaultdict(int)
        for e in events:
            action_counts[e["event_type"]] += 1
        action_dist = {f"action_{k}": v/total for k, v in action_counts.items()}

        speed_feature = {
            "velocity": min(1.0, self.state.velocity),
            "max_stage": self.state.max_stage_reached / 7,
            "dwell": min(1.0, self.state.estimated_dwell_time_steps / 50),
        }

        self.state.threat_dna = {**stage_dist, **action_dist, **speed_feature}

    def _compute_apt_similarity(self):
        if not self.state.threat_dna:
            return

        similarities = {}
        for apt_name, signature in self.apt_signatures.items():
            similarity = self._cosine_similarity(self.state.threat_dna, signature)
            similarities[apt_name] = round(similarity, 2)

        self.state.apt_similarity = dict(
            sorted(similarities.items(), key=lambda x: x[1], reverse=True)
        )

    def _cosine_similarity(self, vec_a: dict, vec_b: dict) -> float:
        keys = set(vec_a.keys()) | set(vec_b.keys())
        if not keys:
            return 0.0

        a = np.array([vec_a.get(k, 0.0) for k in keys])
        b = np.array([vec_b.get(k, 0.0) for k in keys])

        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(np.dot(a, b) / (norm_a * norm_b))

    def _load_apt_signatures(self) -> Dict[str, Dict[str, float]]:
        return {
            "APT29 (Cozy Bear)": {
                "stage_1": 0.30,
                "stage_5": 0.25,
                "stage_6": 0.20,
                "action_scan": 0.25,
                "action_beacon": 0.30,
                "action_lateral_move": 0.20,
                "velocity": 0.1,
                "max_stage": 0.7,
                "dwell": 0.9,
            },
            "APT28 (Fancy Bear)": {
                "stage_3": 0.35,
                "stage_4": 0.30,
                "stage_6": 0.20,
                "action_exploit": 0.35,
                "action_brute_force": 0.30,
                "action_lateral_move": 0.20,
                "velocity": 0.5,
                "max_stage": 0.9,
                "dwell": 0.3,
            },
            "Lazarus Group": {
                "stage_6": 0.25,
                "stage_7": 0.40,
                "action_lateral_move": 0.20,
                "action_exfiltrate": 0.40,
                "action_beacon": 0.15,
                "velocity": 0.35,
                "max_stage": 1.0,
                "dwell": 0.5,
            },
            "Carbanak": {
                "stage_5": 0.30,
                "stage_6": 0.35,
                "stage_7": 0.20,
                "action_beacon": 0.30,
                "action_lateral_move": 0.35,
                "action_exfiltrate": 0.20,
                "velocity": 0.15,
                "max_stage": 0.85,
                "dwell": 0.80,
            },
            "Generic Opportunistic": {
                "stage_1": 0.50,
                "stage_3": 0.30,
                "action_scan": 0.50,
                "action_exploit": 0.30,
                "velocity": 0.6,
                "max_stage": 0.4,
                "dwell": 0.1,
            },
        }

    def get_breach_countdown_payload(self) -> dict:
        state = self.state

        countdown_display = self._format_countdown(state.breach_countdown_seconds)

        if state.breach_countdown_seconds is None:
            urgency = "low"
            urgency_color = "#00e5ff"
        elif state.breach_countdown_seconds < 60:
            urgency = "critical"
            urgency_color = "#ff0044"
        elif state.breach_countdown_seconds < 180:
            urgency = "high"
            urgency_color = "#ff6600"
        elif state.breach_countdown_seconds < 300:
            urgency = "medium"
            urgency_color = "#ffcc00"
        else:
            urgency = "low"
            urgency_color = "#00ff88"

        top_apt = None
        top_apt_score = 0.0
        if state.apt_similarity:
            top_apt = list(state.apt_similarity.keys())[0]
            top_apt_score = list(state.apt_similarity.values())[0]

        return {
            "current_stage": state.current_stage,
            "current_stage_name": KILL_CHAIN_STAGES.get(state.current_stage, {}).get("name", "Unknown"),
            "max_stage_reached": state.max_stage_reached,
            "stage_color": KILL_CHAIN_STAGES.get(state.current_stage, {}).get("color", "#fff"),
            "kill_chain_progress": state.current_stage / 7,

            "velocity": round(state.velocity, 3),
            "velocity_history": state.velocity_history[-20:],
            "acceleration": round(state.acceleration, 3),
            "velocity_label": self._velocity_label(state.velocity),

            "dwell_time_steps": state.estimated_dwell_time_steps,
            "dwell_time_seconds": state.estimated_dwell_time_steps * self.step_duration,
            "dwell_time_display": self._format_countdown(
                state.estimated_dwell_time_steps * self.step_duration
            ),

            "breach_countdown_seconds": state.breach_countdown_seconds,
            "breach_countdown_display": countdown_display,
            "breach_confidence": round(state.breach_confidence, 2),
            "urgency": urgency,
            "urgency_color": urgency_color,

            "top_apt_match": top_apt,
            "top_apt_score": round(top_apt_score, 2),
            "apt_similarity": state.apt_similarity,
            "stage_history": state.stage_history[-30:],
        }

    def _format_countdown(self, seconds: Optional[float]) -> str:
        if seconds is None:
            return "--:--"
        if seconds <= 0:
            return "00:00"
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes:02d}:{secs:02d}"

    def _velocity_label(self, velocity: float) -> str:
        if velocity <= 0:
            return "DORMANT"
        if velocity < 0.1:
            return "STEALTHY"
        if velocity < 0.3:
            return "MODERATE"
        if velocity < 0.6:
            return "AGGRESSIVE"
        return "BLITZ"
