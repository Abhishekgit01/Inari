"""Training integration — use HyperAgents in training loops without API."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from src.hyperagents.config import HyperAgentConfig
from src.hyperagents.domain_bridge import HyperEnvironmentBridge
from src.hyperagents.red_hyper import HyperRedAgent
from src.hyperagents.blue_hyper import HyperBlueAgent
from src.hyperagents.strategy_evolver import StrategyEvolver
from src.hyperagents.safety_sandbox import SafetySandbox

logger = logging.getLogger(__name__)

try:
    from src.environment.cyber_env import CyberSecurityEnv
except ImportError:
    CyberSecurityEnv = None  # type: ignore[assignment,misc]
    logger.warning("CyberSecurityEnv not available — training will use stub observations.")


async def train_with_hyperagents(
    num_episodes: int = 10,
    max_steps_per_episode: int = 50,
    config: HyperAgentConfig | None = None,
    self_reflect_every: int = 5,
) -> dict[str, Any]:
    """Run a training loop using HyperAgent-wrapped agents.

    The base agents still do the actual action selection; the HyperAgent
    layer provides strategic guidance and self-improvement.

    Returns a summary dict with scores and improvement metrics.
    """
    cfg = config or HyperAgentConfig()

    # Create env (real or stub)
    env = None
    if CyberSecurityEnv is not None:
        try:
            env = CyberSecurityEnv()
        except Exception as exc:
            logger.warning(f"Failed to create CyberSecurityEnv: {exc}")

    bridge = HyperEnvironmentBridge(env)
    red = HyperRedAgent(bridge, cfg)
    blue = HyperBlueAgent(bridge, cfg)
    red_evolver = StrategyEvolver("red", cfg)
    blue_evolver = StrategyEvolver("blue", cfg)

    episode_results: list[dict[str, Any]] = []

    for episode in range(1, num_episodes + 1):
        red_score = 0.0
        blue_score = 0.0

        # Reset env if available
        if env is not None:
            try:
                obs, _ = env.reset()
            except Exception:
                obs = _stub_obs()
        else:
            obs = _stub_obs()

        for step in range(1, max_steps_per_episode + 1):
            bridge.update_observation(obs, step=step)

            red_action = await red.select_action(obs, env)
            blue_action = await blue.select_action(obs, env)

            # Step env if available
            if env is not None:
                try:
                    # CyberSecurityEnv.step expects red_action then blue_action
                    obs, reward, terminated, truncated, info = env.step(red_action)
                    red_score += float(reward) if isinstance(reward, (int, float)) else 0.0
                    if terminated or truncated:
                        break
                except Exception:
                    obs = _stub_obs(step)
                    red_score += 0.5
                    blue_score += 0.5
            else:
                import random
                obs = _stub_obs(step)
                red_score += random.uniform(0.5, 2.0)
                blue_score += random.uniform(0.5, 2.0)

        # Record episode results
        red_evolver.record_episode(red.params.model_dump(), red_score, {"won": red_score > blue_score})
        blue_evolver.record_episode(blue.params.model_dump(), blue_score, {"won": blue_score > red_score})

        episode_results.append({
            "episode": episode,
            "red_score": red_score,
            "blue_score": blue_score,
            "red_params": red.params.model_dump(),
            "blue_params": blue.params.model_dump(),
        })

        logger.info(f"Episode {episode}: Red={red_score:.1f}, Blue={blue_score:.1f}")

        # Self-reflect every M episodes
        if episode % self_reflect_every == 0:
            red_reflection = await red.meta.self_reflect()
            blue_reflection = await blue.meta.self_reflect()
            logger.info(f"Red self-reflection: {red_reflection.self_assessment[:80]}")
            logger.info(f"Blue self-reflection: {blue_reflection.self_assessment[:80]}")

        # Evolve strategies
        if episode % 3 == 0 and cfg.strategy_evolution_enabled:
            new_red = red_evolver.evolve(red.meta)
            new_blue = blue_evolver.evolve(blue.meta)
            logger.info(f"Evolved {len(new_red)} red strategies, {len(new_blue)} blue strategies")

    # Persist state
    red.meta.persist_state(cfg.state_dir + "/red_meta.json")
    blue.meta.persist_state(cfg.state_dir + "/blue_meta.json")

    return {
        "episodes": episode_results,
        "red_evolution": red_evolver.get_evolution_report().model_dump(),
        "blue_evolution": blue_evolver.get_evolution_report().model_dump(),
        "red_improvements": len(red.meta.improvement_log),
        "blue_improvements": len(blue.meta.improvement_log),
    }


def _stub_obs(step: int = 0) -> dict:
    """Fallback observation when CyberSecurityEnv is unavailable."""
    import numpy as np
    return {
        "network_topology": np.eye(20, 20),
        "host_status": np.random.rand(20).astype(np.float32),
        "traffic_matrix": np.random.rand(20, 20).astype(np.float32),
        "alert_scores": np.random.rand(20, 1).astype(np.float32),
        "time_step": np.array([step], dtype=np.int32),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    summary = asyncio.run(train_with_hyperagents(num_episodes=5))
    print(f"\nTraining complete: {len(summary['episodes'])} episodes")
    print(f"Red improvements: {summary['red_improvements']}, Blue improvements: {summary['blue_improvements']}")
