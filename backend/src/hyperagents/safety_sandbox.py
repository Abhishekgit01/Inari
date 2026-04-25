"""Safety sandbox — validates and audits all self-modifications."""

from __future__ import annotations

import copy
import logging
import time
from typing import Any

from pydantic import BaseModel, Field

from .config import HyperAgentConfig

logger = logging.getLogger(__name__)


class ModificationRecord(BaseModel):
    timestamp: float = Field(default_factory=time.time)
    agent_type: str = ""
    old_params: dict[str, Any] = Field(default_factory=dict)
    new_params: dict[str, Any] = Field(default_factory=dict)
    reason: str = ""


# ── Parameter bounds ─────────────────────────────────────────────────────────

PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    # Red params
    "aggression_level": (0.0, 1.0),
    "stealth_priority": (0.0, 1.0),
    "lateral_move_threshold": (0.0, 1.0),
    "exfiltration_urgency": (0.0, 1.0),
    # Blue params
    "alert_threshold_isolate": (0.0, 1.0),
    "alert_threshold_investigate": (0.0, 1.0),
    "alert_threshold_patch": (0.0, 1.0),
    "false_positive_tolerance": (0.0, 1.0),
    # Shared
    "confidence": (0.0, 1.0),
}

LAYER_WEIGHT_BOUNDS = (0.0, 5.0)
VALID_HOST_IDS = set(range(20))
VALID_RED_ACTIONS = set(range(6))
VALID_BLUE_ACTIONS = set(range(6))


class SafetySandbox:
    """Validates all parameter changes are within safe bounds.

    Maintains an audit log of ALL modifications and can rollback.
    Auto-rollback if performance drops >30% from baseline.
    """

    def __init__(self, agent_type: str, config: HyperAgentConfig | None = None) -> None:
        self.agent_type = agent_type
        self.config = config or HyperAgentConfig()
        self.audit_trail: list[ModificationRecord] = []
        self._param_snapshots: list[dict[str, Any]] = []
        self._baseline_score: float | None = None
        self._modifications_this_episode: int = 0

    def validate_params(self, params: dict[str, Any]) -> tuple[bool, list[str]]:
        """Validate parameter changes are within safe bounds.

        Returns (is_valid, list_of_violations).
        """
        violations: list[str] = []

        for key, value in params.items():
            # Check float bounds
            if key in PARAM_BOUNDS and isinstance(value, (int, float)):
                lo, hi = PARAM_BOUNDS[key]
                if not (lo <= float(value) <= hi):
                    violations.append(f"{key}={value} outside [{lo}, {hi}]")

            # Check target_priority_weights
            if key == "target_priority_weights" and isinstance(value, dict):
                for layer, weight in value.items():
                    if not isinstance(weight, (int, float)):
                        violations.append(f"target_priority_weights.{layer} is not numeric")
                    elif not (LAYER_WEIGHT_BOUNDS[0] <= float(weight) <= LAYER_WEIGHT_BOUNDS[1]):
                        violations.append(f"target_priority_weights.{layer}={weight} outside {LAYER_WEIGHT_BOUNDS}")
                total = sum(float(w) for w in value.values() if isinstance(w, (int, float)))
                if total <= 0:
                    violations.append("target_priority_weights sum must be > 0")

            # Check monitoring_focus host IDs
            if key == "monitoring_focus" and isinstance(value, list):
                for hid in value:
                    if not isinstance(hid, int) or hid not in VALID_HOST_IDS:
                        violations.append(f"monitoring_focus contains invalid host_id {hid}")

            # Check patrol_pattern host IDs
            if key == "patrol_pattern" and isinstance(value, list):
                for hid in value:
                    if not isinstance(hid, int) or hid not in VALID_HOST_IDS:
                        violations.append(f"patrol_pattern contains invalid host_id {hid}")

            # Negative values check
            if isinstance(value, (int, float)) and float(value) < 0:
                violations.append(f"{key}={value} is negative")

        # Episode modification limit
        if self._modifications_this_episode >= self.config.max_modifications_per_episode:
            violations.append(f"Max modifications per episode reached ({self.config.max_modifications_per_episode})")

        return len(violations) == 0, violations

    def log_modification(self, agent_type: str, old_params: dict[str, Any], new_params: dict[str, Any], reason: str) -> None:
        """Record a modification in the audit trail."""
        self.audit_trail.append(ModificationRecord(
            agent_type=agent_type,
            old_params=copy.deepcopy(old_params),
            new_params=copy.deepcopy(new_params),
            reason=reason,
        ))
        self._param_snapshots.append(copy.deepcopy(old_params))
        self._modifications_this_episode += 1
        logger.info(f"SafetySandbox: logged modification for {agent_type} — {reason}")

    def rollback(self, agent_type: str, steps_back: int = 1) -> dict[str, Any] | None:
        """Rollback to a previous parameter state.

        Returns the old params dict, or None if no snapshot available.
        """
        idx = len(self._param_snapshots) - steps_back
        if 0 <= idx < len(self._param_snapshots):
            restored = copy.deepcopy(self._param_snapshots[idx])
            logger.info(f"SafetySandbox: rolled back {agent_type} by {steps_back} steps.")
            return restored
        logger.warning(f"SafetySandbox: cannot rollback {steps_back} steps — not enough snapshots.")
        return None

    def get_audit_trail(self, agent_type: str | None = None) -> list[dict[str, Any]]:
        """Return audit trail, optionally filtered by agent type."""
        records = self.audit_trail
        if agent_type:
            records = [r for r in records if r.agent_type == agent_type]
        return [r.model_dump() for r in records]

    def check_divergence(self, current_score: float, baseline_score: float) -> bool:
        """If performance drops >threshold from baseline, recommend auto-rollback.

        Returns True if divergence detected (caller should rollback).
        """
        if baseline_score <= 0:
            return False
        drop = (baseline_score - current_score) / baseline_score
        if drop > self.config.divergence_threshold:
            logger.warning(f"SafetySandbox: divergence detected — score dropped {drop:.1%} from baseline.")
            return True
        return False

    def set_baseline(self, score: float) -> None:
        self._baseline_score = score

    def reset_episode_counter(self) -> None:
        """Call at the start of each episode."""
        self._modifications_this_episode = 0
