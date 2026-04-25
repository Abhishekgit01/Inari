"""HyperBlueAgent — wraps existing LLMBlueAgent with self-improving meta-layer."""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, Field

from .config import HyperAgentConfig
from .domain_bridge import HyperEnvironmentBridge
from .meta_engine import MetaEngine, ParameterUpdate, StrategyEvaluation
from .safety_sandbox import SafetySandbox

logger = logging.getLogger(__name__)

try:
    from ..agents.llm_blue_agent import LLMBlueAgent
    from ..detection.correlator import CrossLayerCorrelator
except ImportError:
    LLMBlueAgent = None  # type: ignore[assignment,misc]
    CrossLayerCorrelator = None  # type: ignore[assignment,misc]
    logger.warning("Could not import existing Blue agent — HyperBlueAgent will run in stub mode.")


# ── Runtime strategy parameters ──────────────────────────────────────────────

class BlueStrategyParams(BaseModel):
    """Runtime-tunable parameters for the Blue agent (modified by meta-agent, NOT code)."""
    alert_threshold_isolate: float = Field(default=0.82, ge=0.0, le=1.0)
    alert_threshold_investigate: float = Field(default=0.60, ge=0.0, le=1.0)
    alert_threshold_patch: float = Field(default=0.40, ge=0.0, le=1.0)
    monitoring_focus: list[int] = Field(default_factory=list, description="Host IDs to prioritize for monitoring")
    patrol_pattern: list[int] = Field(default_factory=lambda: list(range(20)), description="Order of hosts to cycle monitoring through")
    false_positive_tolerance: float = Field(default=0.15, ge=0.0, le=1.0, description="Higher = more aggressive filtering")


# ── HyperBlueAgent ────────────────────────────────────────────────────────────

class HyperBlueAgent:
    """Self-improving Blue agent that wraps the existing LLMBlueAgent.

    The existing agent does the actual action selection; this layer provides
    strategic guidance by tuning runtime thresholds every N steps.
    """

    def __init__(self, bridge: HyperEnvironmentBridge, config: HyperAgentConfig | None = None) -> None:
        self.config = config or HyperAgentConfig()
        self.bridge = bridge

        # Compose (not inherit) the existing agent
        if LLMBlueAgent is not None:
            self.base_agent = LLMBlueAgent()
        else:
            self.base_agent = None

        self.meta = MetaEngine(agent_type="blue", config=self.config)
        self.safety = SafetySandbox(agent_type="blue", config=self.config) if self.config.safety_sandbox_enabled else None

        # Runtime params (modified by meta-agent)
        self.params = BlueStrategyParams()
        self._step_counter: int = 0
        self._recent_results: list[dict[str, Any]] = []
        self._last_modification_step: int = 0
        self._detection_hits: int = 0
        self._detection_misses: int = 0

    async def select_action(self, obs: dict[str, Any], env: Any = None) -> list[int]:
        """Main entry point — delegates to base agent after optional meta-tuning."""
        self._step_counter += 1
        self.bridge.update_observation(obs, step=self._step_counter)

        # Every N steps, ask meta-agent for strategy improvement
        should_evaluate = (
            self.config.blue_hyper_enabled
            and self.config.enabled
            and self._step_counter % self.config.improvement_interval_steps == 0
            and (self._step_counter - self._last_modification_step) >= self.config.min_steps_between_modifications
        )

        if should_evaluate and self._recent_results:
            await self._meta_evaluate_and_apply()

        # Delegate actual action selection to the existing agent
        if self.base_agent is not None:
            try:
                action_arr, _ = self.base_agent.predict(obs)
                host_id = int(action_arr[0]) if hasattr(action_arr, '__len__') else int(action_arr)
                action_id = int(action_arr[1]) if hasattr(action_arr, '__len__') else 0
                result = [host_id, action_id]
            except Exception as exc:
                logger.warning(f"Base Blue agent predict failed: {exc} — using fallback.")
                result = self._heuristic_action(obs)
        else:
            result = self._heuristic_action(obs)

        # Record for meta-agent learning
        self._recent_results.append({
            "step": self._step_counter,
            "action": result,
            "params_snapshot": self.params.model_dump(),
            "detection_hits": self._detection_hits,
            "detection_misses": self._detection_misses,
        })

        return result

    async def _meta_evaluate_and_apply(self) -> None:
        """Run meta-evaluation and apply safe improvements."""
        try:
            evaluation = await self.meta.evaluate_strategy(
                current_params=self.params.model_dump(),
                recent_results=self._recent_results[-20:],
            )
            update = await self.meta.generate_improvement(evaluation)

            # Validate through safety sandbox
            if self.safety:
                valid, violations = self.safety.validate_params(update.param_changes)
                if not valid:
                    logger.info(f"Blue meta-update rejected by safety: {violations}")
                    return
                # Clamp threshold values
                for key in list(update.param_changes.keys()):
                    if isinstance(update.param_changes[key], float):
                        update.param_changes[key] = max(0.0, min(1.0, update.param_changes[key]))

            # Apply to runtime params
            old_params = self.params.model_dump()
            applied = self.meta.apply_improvement(update, self.params.model_dump())
            if applied:
                try:
                    self.params = BlueStrategyParams(**self.params.model_dump())
                except Exception:
                    self.params = BlueStrategyParams(**old_params)
                    applied = False

            if self.safety and applied:
                self.safety.log_modification("blue", old_params, self.params.model_dump(), update.reasoning)

            self._last_modification_step = self._step_counter

            # Suggest correlation rules to existing CrossLayerCorrelator
            if update.new_attack_sequence and CrossLayerCorrelator is not None:
                logger.info(f"Blue meta-agent suggests correlation context: {update.new_attack_sequence[:3]}")

        except Exception as exc:
            logger.warning(f"Blue meta-evaluation failed: {exc}")

    def _heuristic_action(self, obs: dict[str, Any]) -> list[int]:
        """Fallback heuristic that respects current runtime params."""
        import numpy as np

        alert_scores = np.asarray(obs.get("alert_scores", np.zeros((20, 1))))
        if not alert_scores.size:
            return [0, 0]

        host_risk = alert_scores.max(axis=1) if alert_scores.ndim >= 2 else alert_scores
        target = int(np.argmax(host_risk))
        peak_risk = float(host_risk[target]) if host_risk.size else 0.0

        # Use runtime thresholds instead of hardcoded ones
        if peak_risk >= self.params.alert_threshold_isolate:
            action = 1  # isolate
        elif peak_risk >= self.params.alert_threshold_investigate:
            action = 5  # investigate
        elif peak_risk >= self.params.alert_threshold_patch:
            action = 2  # patch
        else:
            action = 0  # monitor

        # Override target if monitoring_focus is set
        if self.params.monitoring_focus and peak_risk < self.params.alert_threshold_patch:
            focus_hosts = [h for h in self.params.monitoring_focus if 0 <= h < 20]
            if focus_hosts:
                patrol_idx = self._step_counter % len(self.params.patrol_pattern)
                target = self.params.patrol_pattern[patrol_idx] if patrol_idx < len(self.params.patrol_pattern) else focus_hosts[0]
                action = 0  # monitor

        return [target, action]

    def record_detection(self, hit: bool) -> None:
        """Record whether the last action was a detection hit or miss."""
        if hit:
            self._detection_hits += 1
        else:
            self._detection_misses += 1

    def get_strategy(self) -> dict[str, Any]:
        """Return current strategy params for API/dashboard."""
        return {
            "agent_type": "blue",
            "params": self.params.model_dump(),
            "step": self._step_counter,
            "detection_hits": self._detection_hits,
            "detection_misses": self._detection_misses,
            "improvements_count": len(self.meta.improvement_log),
            "meta_tuning": {
                "evaluation_focus": self.meta.evaluation_focus,
                "change_magnitude": self.meta.change_magnitude,
                "improvement_frequency": self.meta.improvement_frequency,
            },
        }
