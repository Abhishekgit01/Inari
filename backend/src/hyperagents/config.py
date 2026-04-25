"""HyperAgents configuration — all tunables in one place."""

from __future__ import annotations

import os
from pydantic import BaseModel, Field


class HyperAgentConfig(BaseModel):
    """Configuration for the HyperAgent self-improvement layer."""

    enabled: bool = Field(default=True, description="Master switch — when False, base agents run untouched")

    # LLM backend
    llm_backend: str = Field(default="nvidia", description="nvidia | openai | anthropic | huggingface")
    llm_model: str = Field(default="nvidia/llama-3.1-nemotron-70b-instruct", description="Model identifier for the meta-agent")
    llm_api_key_env: str = Field(default="NVIDIA_API_KEY", description="Env var name holding the API key")
    llm_temperature: float = Field(default=0.4, ge=0.0, le=2.0)
    llm_max_tokens: int = Field(default=512, ge=64, le=4096)

    # Self-improvement cadence
    improvement_interval_steps: int = Field(default=15, ge=5, le=100, description="Evaluate strategy every N steps")
    self_reflect_interval_episodes: int = Field(default=5, ge=1, le=50, description="Meta-reflection every M episodes")

    # Strategy archive
    max_strategy_archive: int = Field(default=50, ge=10, le=200)
    strategy_population_size: int = Field(default=8, ge=4, le=20)

    # Safety limits
    max_modifications_per_episode: int = Field(default=5, ge=1, le=20)
    min_steps_between_modifications: int = Field(default=10, ge=5, le=50)
    divergence_threshold: float = Field(default=0.30, ge=0.1, le=0.5, description="Auto-rollback if score drops >X from baseline")
    modification_timeout_seconds: float = Field(default=10.0, ge=1.0, le=60.0)

    # Cost tracking
    estimated_api_calls_per_episode: int = Field(default=0, description="Running counter, not a limit")

    # Feature flags
    red_hyper_enabled: bool = Field(default=True)
    blue_hyper_enabled: bool = Field(default=True)
    strategy_evolution_enabled: bool = Field(default=True)
    safety_sandbox_enabled: bool = Field(default=True)

    # Persistence
    state_dir: str = Field(default="hyperagent_state", description="Directory for persisting meta-engine state")

    def get_api_key(self) -> str | None:
        return os.environ.get(self.llm_api_key_env, "").strip() or None


DEFAULT_CONFIG = HyperAgentConfig()
