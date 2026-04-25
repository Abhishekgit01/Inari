"""Bridge between existing CyberSecurityEnv and the HyperAgent meta-layer."""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

try:
    from ..environment.cyber_env import CyberSecurityEnv
    from ..environment.network import NetworkTopology
    from ..config.constants import RED_ACTIONS, BLUE_ACTIONS
except ImportError:
    CyberSecurityEnv = None  # type: ignore[assignment,misc]
    NetworkTopology = None  # type: ignore[assignment,misc]
    RED_ACTIONS = {0: "scan", 1: "exploit", 2: "lateral_move", 3: "exfiltrate", 4: "beacon", 5: "wait"}
    BLUE_ACTIONS = {0: "monitor", 1: "isolate", 2: "patch", 3: "block_ip", 4: "reset_creds", 5: "investigate"}
    logger.warning("Could not import existing env modules; HyperAgents will run in stub mode.")


# ── Network layer mapping ────────────────────────────────────────────────────

NETWORK_LAYERS: dict[str, list[int]] = {
    "internet": [0, 1],       # DMZ hosts double as internet-facing
    "dmz": [0, 1],
    "app": [2, 3, 4, 5, 6],
    "db": [7, 8, 9],
    "workstation": list(range(10, 20)),
}

HOST_LAYER: dict[int, str] = {}
for _layer, _hosts in NETWORK_LAYERS.items():
    for _h in _hosts:
        if _h not in HOST_LAYER:
            HOST_LAYER[_h] = _layer


# ── Pydantic models ─────────────────────────────────────────────────────────

class NetworkNarrative(BaseModel):
    """Natural-language description of current network state."""
    total_hosts: int = 20
    compromised_hosts: list[int] = Field(default_factory=list)
    detected_hosts: list[int] = Field(default_factory=list)
    high_alert_hosts: list[int] = Field(default_factory=list)
    layer_summary: dict[str, dict[str, Any]] = Field(default_factory=dict)
    narrative: str = ""


class BattleNarrative(BaseModel):
    """Natural-language description of recent combat events."""
    recent_red_actions: list[str] = Field(default_factory=list)
    recent_blue_actions: list[str] = Field(default_factory=list)
    red_score: float = 0.0
    blue_score: float = 0.0
    step: int = 0
    narrative: str = ""


# ── Bridge class ─────────────────────────────────────────────────────────────

class HyperEnvironmentBridge:
    """Wraps the existing CyberSecurityEnv without modifying it.

    Translates env observations into rich text for the meta-agent and
    translates meta-agent strategic decisions back into [host_id, action_id].
    """

    def __init__(self, env: Any = None) -> None:
        self.env = env
        self._obs: dict[str, Any] = {}
        self._info: dict[str, Any] = {}
        self._step: int = 0

    # ── Observation ingestion ────────────────────────────────────────────

    def update_observation(self, obs: dict[str, Any], info: dict[str, Any] | None = None, step: int = 0) -> None:
        """Call this each env step so the bridge stays in sync."""
        self._obs = obs
        self._info = info or {}
        self._step = step

    # ── Narrative builders ───────────────────────────────────────────────

    def get_network_narrative(self) -> NetworkNarrative:
        """Describe the current network state in natural language."""
        import numpy as np

        obs = self._obs
        host_status = np.asarray(obs.get("host_status", np.zeros(20)))
        alert_scores = np.asarray(obs.get("alert_scores", np.zeros((20, 1))))

        compromised: list[int] = []
        detected: list[int] = []
        high_alert: list[int] = []

        for hid in range(min(20, len(host_status))):
            if host_status[hid] > 0.5:
                compromised.append(hid)
            if host_status[hid] > 0.2:
                detected.append(hid)
            if alert_scores.ndim >= 1 and hid < len(alert_scores):
                peak = float(alert_scores[hid].max()) if alert_scores[hid].size else 0.0
                if peak >= 0.6:
                    high_alert.append(hid)

        layer_summary: dict[str, dict[str, Any]] = {}
        for layer, hosts in NETWORK_LAYERS.items():
            layer_comp = [h for h in hosts if h in compromised]
            layer_det = [h for h in hosts if h in detected]
            layer_summary[layer] = {
                "hosts": hosts,
                "compromised_count": len(layer_comp),
                "detected_count": len(layer_det),
                "compromised_ids": layer_comp,
            }

        lines: list[str] = [f"Step {self._step}. Network has {len(host_status)} hosts."]
        if compromised:
            lines.append(f"Compromised hosts: {compromised} — attacker has foothold.")
        if high_alert:
            lines.append(f"High-alert hosts: {high_alert} — defender should focus here.")
        for layer, info_d in layer_summary.items():
            if info_d["compromised_count"]:
                lines.append(f"  {layer.upper()} layer: {info_d['compromised_count']}/{len(info_d['hosts'])} compromised ({info_d['compromised_ids']})")

        return NetworkNarrative(
            total_hosts=int(len(host_status)),
            compromised_hosts=compromised,
            detected_hosts=detected,
            high_alert_hosts=high_alert,
            layer_summary=layer_summary,
            narrative=" ".join(lines),
        )

    def get_battle_narrative(self, recent_red: list[dict] | None = None, recent_blue: list[dict] | None = None, red_score: float = 0.0, blue_score: float = 0.0) -> BattleNarrative:
        """Describe recent combat events in natural language."""
        red_lines = []
        for a in (recent_red or [])[-5:]:
            host = a.get("target_host_id", "?")
            action = RED_ACTIONS.get(a.get("action_id", -1), "unknown")
            success = "succeeded" if a.get("success") else "failed"
            red_lines.append(f"Red {action} on host {host} {success}")

        blue_lines = []
        for a in (recent_blue or [])[-5:]:
            host = a.get("target_host_id", "?")
            action = BLUE_ACTIONS.get(a.get("action_id", -1), "unknown")
            success = "succeeded" if a.get("success") else "failed"
            blue_lines.append(f"Blue {action} on host {host} {success}")

        narrative_parts = [f"Step {self._step}. Red score: {red_score:.1f}, Blue score: {blue_score:.1f}."]
        if red_lines:
            narrative_parts.append("Recent Red: " + "; ".join(red_lines))
        if blue_lines:
            narrative_parts.append("Recent Blue: " + "; ".join(blue_lines))

        return BattleNarrative(
            recent_red_actions=red_lines,
            recent_blue_actions=blue_lines,
            red_score=red_score,
            blue_score=blue_score,
            step=self._step,
            narrative=" ".join(narrative_parts),
        )

    # ── Action translation ───────────────────────────────────────────────

    @staticmethod
    def translate_action(host_id: int, action_id: int) -> tuple[int, int]:
        """Validate and clamp a meta-agent decision into valid [host_id, action_id]."""
        clamped_host = max(0, min(19, host_id))
        clamped_action = max(0, min(5, action_id))
        return clamped_host, clamped_action

    @staticmethod
    def host_layer(host_id: int) -> str:
        """Return the network layer for a given host."""
        return HOST_LAYER.get(max(0, min(19, host_id)), "workstation")
