"""HyperRedAgent — wraps existing LLMRedAgent with self-improving meta-layer."""

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
    from ..agents.llm_red_agent import LLMRedAgent
    from ..agents.strategy_manager import RedStrategyManager
except ImportError:
    LLMRedAgent = None  # type: ignore[assignment,misc]
    RedStrategyManager = None  # type: ignore[assignment,misc]
    logger.warning("Could not import existing Red agent — HyperRedAgent will run in stub mode.")


# ── Runtime strategy parameters ──────────────────────────────────────────────

class RedStrategyParams(BaseModel):
    """Runtime-tunable parameters for the Red agent (modified by meta-agent, NOT code)."""
    target_priority_weights: dict[str, float] = Field(
        default={"dmz": 0.15, "app": 0.25, "db": 0.40, "workstation": 0.20},
        description="Priority weight per network layer",
    )
    aggression_level: float = Field(default=0.5, ge=0.0, le=1.0, description="Higher = more exploits vs scans")
    stealth_priority: float = Field(default=0.3, ge=0.0, le=1.0, description="Higher = more beacons/wait")
    lateral_move_threshold: float = Field(default=0.4, ge=0.0, le=1.0, description="When to pivot vs dig deeper")
    exfiltration_urgency: float = Field(default=0.3, ge=0.0, le=1.0, description="When to start data theft")


# ── HyperRedAgent ────────────────────────────────────────────────────────────

class HyperRedAgent:
    """Self-improving Red agent that wraps the existing LLMRedAgent.

    The existing agent does the actual action selection; this layer provides
    strategic guidance by tuning runtime parameters every N steps.
    """

    def __init__(self, bridge: HyperEnvironmentBridge, config: HyperAgentConfig | None = None) -> None:
        self.config = config or HyperAgentConfig()
        self.bridge = bridge

        # Compose (not inherit) the existing agent
        if LLMRedAgent is not None:
            self.base_agent = LLMRedAgent()
        else:
            self.base_agent = None

        self.meta = MetaEngine(agent_type="red", config=self.config)
        self.safety = SafetySandbox(agent_type="red", config=self.config) if self.config.safety_sandbox_enabled else None

        # Runtime params (modified by meta-agent)
        self.params = RedStrategyParams()
        self._step_counter: int = 0
        self._recent_results: list[dict[str, Any]] = []
        self._last_modification_step: int = 0

    async def select_action(self, obs: dict[str, Any], env: Any = None) -> list[int]:
        """Main entry point — delegates to base agent after optional meta-tuning."""
        self._step_counter += 1
        self.bridge.update_observation(obs, step=self._step_counter)

        # Every N steps, ask meta-agent for strategy improvement
        should_evaluate = (
            self.config.red_hyper_enabled
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
                logger.warning(f"Base Red agent predict failed: {exc} — using fallback.")
                result = self._heuristic_action(obs)
        else:
            result = self._heuristic_action(obs)

        # Record for meta-agent learning
        self._recent_results.append({
            "step": self._step_counter,
            "action": result,
            "params_snapshot": self.params.model_dump(),
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
                    logger.info(f"Red meta-update rejected by safety: {violations}")
                    return
                # Clamp values
                for key in list(update.param_changes.keys()):
                    if isinstance(update.param_changes[key], float):
                        update.param_changes[key] = max(0.0, min(1.0, update.param_changes[key]))

            # Apply to runtime params
            old_params = self.params.model_dump()
            applied = self.meta.apply_improvement(update, self.params.model_dump())
            if applied:
                # Re-load from modified dict
                try:
                    self.params = RedStrategyParams(**self.params.model_dump())
                except Exception:
                    self.params = RedStrategyParams(**old_params)
                    applied = False

            if self.safety and applied:
                self.safety.log_modification("red", old_params, self.params.model_dump(), update.reasoning)

            self._last_modification_step = self._step_counter

            # Feed new attack sequences to existing RedStrategyManager
            if update.new_attack_sequence and RedStrategyManager is not None:
                try:
                    mgr = RedStrategyManager()
                    for seq in update.new_attack_sequence[:3]:
                        mgr.record_action(seq)
                    mgr.commit_episode(score=0.0)
                except Exception:
                    pass

        except Exception as exc:
            logger.warning(f"Red meta-evaluation failed: {exc}")

    def _heuristic_action(self, obs: dict[str, Any]) -> list[int]:
        """Fallback heuristic that respects current runtime params."""
        import numpy as np

        host_status = np.asarray(obs.get("host_status", np.zeros(20)))
        alert_scores = np.asarray(obs.get("alert_scores", np.zeros((20, 1))))
        time_step = int(np.asarray(obs.get("time_step", [0]))[0]) if "time_step" in obs else self._step_counter

        # Target selection weighted by layer priorities
        desirability = np.zeros(20)
        for hid in range(20):
            layer = self.bridge.host_layer(hid)
            weight = self.params.target_priority_weights.get(layer, 0.2)
            vuln = 1.0 - float(host_status[hid]) if hid < len(host_status) else 0.5
            alert = float(alert_scores[hid].max()) if hid < len(alert_scores) and alert_scores[hid].size else 0.0
            desirability[hid] = weight * (vuln + 0.3 * (1.0 - alert))

        target = int(np.argmax(desirability))

        # Action selection influenced by runtime params
        if time_step >= 28 and self.params.exfiltration_urgency > 0.3:
            action = 3  # exfiltrate
        elif self.params.aggression_level > 0.6 and time_step < 25:
            action = 1  # exploit
        elif self.params.stealth_priority > 0.5:
            action = 4  # beacon
        elif time_step >= 10 and self.params.lateral_move_threshold < 0.5:
            action = 2  # lateral_move
        else:
            action = 0  # scan

        return [target, action]

    def get_strategy(self) -> dict[str, Any]:
        """Return current strategy params for API/dashboard."""
        return {
            "agent_type": "red",
            "params": self.params.model_dump(),
            "step": self._step_counter,
            "improvements_count": len(self.meta.improvement_log),
            "meta_tuning": {
                "evaluation_focus": self.meta.evaluation_focus,
                "change_magnitude": self.meta.change_magnitude,
                "improvement_frequency": self.meta.improvement_frequency,
            },
        }
