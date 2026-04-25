"""Core self-improvement engine — the heart of HyperAgents."""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from .config import HyperAgentConfig

logger = logging.getLogger(__name__)

# ── LLM client abstraction ──────────────────────────────────────────────────

try:
    import openai
except ImportError:
    openai = None  # type: ignore[assignment]

try:
    import anthropic
except ImportError:
    anthropic = None  # type: ignore[assignment]

try:
    from huggingface_hub import InferenceClient
except ImportError:
    InferenceClient = None  # type: ignore[assignment]


# ── Pydantic models ─────────────────────────────────────────────────────────

class StrategyEvaluation(BaseModel):
    analysis: str = ""
    working: list[str] = Field(default_factory=list)
    failing: list[str] = Field(default_factory=list)
    recommendation: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ParameterUpdate(BaseModel):
    param_changes: dict[str, float | int | str | list[Any]] = Field(default_factory=dict)
    new_attack_sequence: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reasoning: str = ""


class MetaImprovement(BaseModel):
    self_assessment: str = ""
    patterns_noticed: list[str] = Field(default_factory=list)
    meta_changes: dict[str, str] = Field(default_factory=dict)
    confidence_in_self_assessment: float = Field(default=0.0, ge=0.0, le=1.0)


class ImprovementRecord(BaseModel):
    step: int = 0
    episode: int = 0
    agent_type: str = ""
    evaluation: StrategyEvaluation = Field(default_factory=StrategyEvaluation)
    update: ParameterUpdate = Field(default_factory=ParameterUpdate)
    applied: bool = False
    score_before: float = 0.0
    score_after: float = 0.0
    timestamp: float = Field(default_factory=time.time)


# ── MetaEngine ──────────────────────────────────────────────────────────────

class MetaEngine:
    """Self-referential self-improvement engine.

    Uses an LLM to evaluate strategies, generate parameter updates, and
    reflect on its own improvement history.
    """

    def __init__(self, agent_type: str, config: HyperAgentConfig | None = None) -> None:
        self.agent_type = agent_type  # "red" or "blue"
        self.config = config or HyperAgentConfig()
        self.strategy_history: list[dict[str, Any]] = []
        self.improvement_log: list[ImprovementRecord] = []
        self._episode_counter: int = 0
        self._llm_client: Any = None
        self._init_llm_client()

        # Self-referential tuning (modified by self_reflect)
        self.evaluation_focus: str = "score_delta"
        self.change_magnitude: str = "moderate"
        self.improvement_frequency: str = "normal"

    # ── LLM setup ────────────────────────────────────────────────────────

    def _init_llm_client(self) -> None:
        api_key = self.config.get_api_key()
        if not api_key:
            logger.info("No API key for meta-agent LLM — will use heuristic fallback.")
            return

        backend = self.config.llm_backend
        try:
            if backend == "openai" and openai:
                self._llm_client = openai.OpenAI(api_key=api_key)
            elif backend == "anthropic" and anthropic:
                self._llm_client = anthropic.Anthropic(api_key=api_key)
            elif backend == "huggingface" and InferenceClient:
                self._llm_client = InferenceClient(token=api_key)
            else:
                logger.warning(f"LLM backend '{backend}' unavailable — heuristic fallback.")
        except Exception as exc:
            logger.warning(f"Failed to init LLM client: {exc} — heuristic fallback.")

    # ── LLM call ─────────────────────────────────────────────────────────

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str | None:
        if not self._llm_client:
            return None
        try:
            backend = self.config.llm_backend
            if backend == "openai" and isinstance(self._llm_client, openai.OpenAI):
                resp = self._llm_client.chat.completions.create(
                    model=self.config.llm_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=self.config.llm_temperature,
                    max_tokens=self.config.llm_max_tokens,
                )
                return resp.choices[0].message.content
            elif backend == "anthropic" and isinstance(self._llm_client, anthropic.Anthropic):
                resp = self._llm_client.messages.create(
                    model=self.config.llm_model,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                    temperature=self.config.llm_temperature,
                    max_tokens=self.config.llm_max_tokens,
                )
                return resp.content[0].text
            elif backend == "huggingface" and InferenceClient and isinstance(self._llm_client, InferenceClient):
                resp = self._llm_client.chat_completion(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=self.config.llm_max_tokens,
                )
                return resp.choices[0].message.content
        except Exception as exc:
            logger.warning(f"LLM call failed: {exc}")
        return None

    # ── Core methods ─────────────────────────────────────────────────────

    async def evaluate_strategy(self, current_params: dict[str, Any], recent_results: list[dict[str, Any]]) -> StrategyEvaluation:
        """Ask LLM to evaluate current strategy given recent results."""
        prompt_dir = Path(__file__).parent / "prompts"
        system_file = prompt_dir / f"{self.agent_type}_meta_system.txt"
        system_prompt = system_file.read_text() if system_file.exists() else f"You are a {self.agent_type} meta-strategist for a cybersecurity simulation."

        user_prompt = (
            f"CURRENT PARAMETERS:\n{json.dumps(current_params, indent=2)}\n\n"
            f"RECENT RESULTS ({len(recent_results)} steps):\n{json.dumps(recent_results[-10:], indent=2, default=str)}\n\n"
            f"Analyze the strategy and suggest improvements. Respond with JSON."
        )

        raw = await self._call_llm(system_prompt, user_prompt)
        if raw:
            try:
                data = json.loads(raw)
                return StrategyEvaluation(
                    analysis=data.get("analysis", ""),
                    working=data.get("working", []),
                    failing=data.get("failing", []),
                    recommendation=data.get("recommendation", ""),
                    confidence=float(data.get("confidence", 0.5)),
                )
            except (json.JSONDecodeError, ValueError):
                pass

        # Heuristic fallback
        return StrategyEvaluation(
            analysis="LLM unavailable — using heuristic evaluation.",
            working=[],
            failing=[],
            recommendation="Consider adjusting target weights based on compromised host distribution.",
            confidence=0.3,
        )

    async def generate_improvement(self, evaluation: StrategyEvaluation) -> ParameterUpdate:
        """Ask LLM to generate specific parameter changes from an evaluation."""
        user_prompt = (
            f"EVALUATION:\n{evaluation.model_dump_json(indent=2)}\n\n"
            f"Generate specific parameter changes. Respond with JSON containing 'param_changes', "
            f"'new_attack_sequence', 'confidence', and 'reasoning'."
        )

        prompt_dir = Path(__file__).parent / "prompts"
        system_file = prompt_dir / f"{self.agent_type}_meta_system.txt"
        system_prompt = system_file.read_text() if system_file.exists() else f"You are a {self.agent_type} meta-strategist."

        raw = await self._call_llm(system_prompt, user_prompt)
        if raw:
            try:
                data = json.loads(raw)
                return ParameterUpdate(
                    param_changes=data.get("param_changes", {}),
                    new_attack_sequence=data.get("new_attack_sequence", []),
                    confidence=float(data.get("confidence", 0.3)),
                    reasoning=data.get("reasoning", ""),
                )
            except (json.JSONDecodeError, ValueError):
                pass

        # Heuristic fallback: small random perturbation
        import random
        if self.agent_type == "red":
            return ParameterUpdate(
                param_changes={"aggression_level": round(random.uniform(0.3, 0.7), 2)},
                confidence=0.2,
                reasoning="Heuristic fallback — minor aggression adjustment.",
            )
        else:
            return ParameterUpdate(
                param_changes={"alert_threshold_investigate": round(random.uniform(0.5, 0.7), 2)},
                confidence=0.2,
                reasoning="Heuristic fallback — minor threshold adjustment.",
            )

    def apply_improvement(self, update: ParameterUpdate, agent_params: dict[str, Any]) -> bool:
        """Apply parameter changes to the agent's runtime config dict."""
        try:
            for key, value in update.param_changes.items():
                if key in agent_params:
                    if isinstance(value, (int, float)) and isinstance(agent_params[key], (int, float)):
                        agent_params[key] = value
                    elif isinstance(value, list):
                        agent_params[key] = value
                    elif isinstance(value, str):
                        agent_params[key] = value
            return True
        except Exception as exc:
            logger.warning(f"Failed to apply improvement: {exc}")
            return False

    async def self_reflect(self, history_window: int = 20) -> MetaImprovement:
        """THE KEY HYPERAGENT FEATURE: examine own improvement history."""
        recent = self.improvement_log[-history_window:]
        if not recent:
            return MetaImprovement(self_assessment="No improvement history yet.")

        history_text = "\n".join(
            f"  Step {r.step}: applied={r.applied}, confidence={r.update.confidence:.2f}, "
            f"score_before={r.score_before:.1f}, score_after={r.score_after:.1f}"
            for r in recent
        )

        prompt_dir = Path(__file__).parent / "prompts"
        system_file = prompt_dir / f"self_improve_{self.agent_type}.txt"
        system_prompt = system_file.read_text() if system_file.exists() else "You are reflecting on your own performance as a meta-strategist."

        user_prompt = (
            f"YOUR IMPROVEMENT HISTORY ({len(recent)} records):\n{history_text}\n\n"
            f"Reflect on your own performance. Respond with JSON."
        )

        raw = await self._call_llm(system_prompt, user_prompt)
        if raw:
            try:
                data = json.loads(raw)
                improvement = MetaImprovement(
                    self_assessment=data.get("self_assessment", ""),
                    patterns_noticed=data.get("patterns_noticed", []),
                    meta_changes=data.get("meta_changes", {}),
                    confidence_in_self_assessment=float(data.get("confidence_in_self_assessment", 0.3)),
                )
                # Apply meta-changes to own tuning
                if "evaluation_focus" in improvement.meta_changes:
                    self.evaluation_focus = improvement.meta_changes["evaluation_focus"]
                if "change_magnitude" in improvement.meta_changes:
                    self.change_magnitude = improvement.meta_changes["change_magnitude"]
                if "improvement_frequency" in improvement.meta_changes:
                    self.improvement_frequency = improvement.meta_changes["improvement_frequency"]
                return improvement
            except (json.JSONDecodeError, ValueError):
                pass

        return MetaImprovement(self_assessment="LLM unavailable — no self-reflection.", confidence_in_self_assessment=0.1)

    # ── Persistence ──────────────────────────────────────────────────────

    def persist_state(self, filepath: str | Path) -> None:
        """Save accumulated knowledge to disk."""
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        state = {
            "agent_type": self.agent_type,
            "strategy_history": self.strategy_history[-self.config.max_strategy_archive:],
            "improvement_log": [r.model_dump() for r in self.improvement_log[-100:]],
            "evaluation_focus": self.evaluation_focus,
            "change_magnitude": self.change_magnitude,
            "improvement_frequency": self.improvement_frequency,
            "episode_counter": self._episode_counter,
        }
        path.write_text(json.dumps(state, indent=2, default=str))

    def load_state(self, filepath: str | Path) -> None:
        """Load accumulated knowledge from disk."""
        path = Path(filepath)
        if not path.exists():
            return
        try:
            state = json.loads(path.read_text())
            self.strategy_history = state.get("strategy_history", [])
            self.improvement_log = [ImprovementRecord(**r) for r in state.get("improvement_log", [])]
            self.evaluation_focus = state.get("evaluation_focus", self.evaluation_focus)
            self.change_magnitude = state.get("change_magnitude", self.change_magnitude)
            self.improvement_frequency = state.get("improvement_frequency", self.improvement_frequency)
            self._episode_counter = state.get("episode_counter", 0)
        except Exception as exc:
            logger.warning(f"Failed to load meta-engine state: {exc}")

    def record_episode(self) -> int:
        self._episode_counter += 1
        return self._episode_counter
