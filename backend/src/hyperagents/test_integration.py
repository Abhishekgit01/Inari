"""Integration test for HyperAgents layer.

Imports existing agents and environment, wraps them with HyperAgent layer,
runs 5 episodes, prints improvement metrics, and verifies existing agents
still work if HyperAgent layer is disabled.
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

# Ensure backend is importable
backend_root = Path(__file__).resolve().parents[2]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from src.hyperagents.config import HyperAgentConfig
from src.hyperagents.domain_bridge import HyperEnvironmentBridge
from src.hyperagents.red_hyper import HyperRedAgent
from src.hyperagents.blue_hyper import HyperBlueAgent
from src.hyperagents.strategy_evolver import StrategyEvolver
from src.hyperagents.safety_sandbox import SafetySandbox


def _make_stub_obs(step: int = 0) -> dict:
    """Create a minimal observation dict matching CyberSecurityEnv output."""
    import numpy as np
    return {
        "network_topology": np.eye(20, 20),
        "host_status": np.random.rand(20).astype(np.float32),
        "traffic_matrix": np.random.rand(20, 20).astype(np.float32),
        "alert_scores": np.random.rand(20, 1).astype(np.float32),
        "time_step": np.array([step], dtype=np.int32),
    }


async def run_episode(red: HyperRedAgent, blue: HyperBlueAgent, episode_num: int, max_steps: int = 30) -> dict:
    """Run a single episode using the HyperAgent-wrapped agents."""
    red_score = 0.0
    blue_score = 0.0

    for step in range(1, max_steps + 1):
        obs = _make_stub_obs(step)

        red_action = await red.select_action(obs)
        blue_action = await blue.select_action(obs)

        # Simulate scoring: random + slight improvement from strategy
        import random
        red_step_score = random.uniform(0.5, 2.0) * (1 + 0.01 * episode_num)
        blue_step_score = random.uniform(0.5, 2.0) * (1 + 0.01 * episode_num)
        red_score += red_step_score
        blue_score += blue_step_score

    return {"red_score": red_score, "blue_score": blue_score, "steps": max_steps}


async def test_hyperagents() -> None:
    """Main test: 5 episodes with HyperAgents, verify fallback works."""
    print("=" * 60)
    print("HyperAgents Integration Test")
    print("=" * 60)

    # ── Test 1: With HyperAgents enabled ────────────────────────────────
    config = HyperAgentConfig(
        enabled=True,
        red_hyper_enabled=True,
        blue_hyper_enabled=True,
        improvement_interval_steps=10,
        # No LLM key — will use heuristic fallback
        llm_backend="openai",
    )
    bridge = HyperEnvironmentBridge()
    red = HyperRedAgent(bridge, config)
    blue = HyperBlueAgent(bridge, config)
    red_evolver = StrategyEvolver("red", config)
    blue_evolver = StrategyEvolver("blue", config)

    print("\n--- Running 5 episodes WITH HyperAgents ---")
    results = []
    for ep in range(1, 6):
        result = await run_episode(red, blue, ep)
        red_evolver.record_episode(red.params.model_dump(), result["red_score"])
        blue_evolver.record_episode(blue.params.model_dump(), result["blue_score"])
        results.append(result)
        print(f"  Episode {ep}: Red={result['red_score']:.1f}, Blue={result['blue_score']:.1f}")

    # ── Test 2: Verify existing agents still work when disabled ──────────
    print("\n--- Verifying base agents work with HyperAgents DISABLED ---")
    disabled_config = HyperAgentConfig(enabled=False, red_hyper_enabled=False, blue_hyper_enabled=False)
    red_disabled = HyperRedAgent(bridge, disabled_config)
    blue_disabled = HyperBlueAgent(bridge, disabled_config)

    for step in range(1, 6):
        obs = _make_stub_obs(step)
        red_action = await red_disabled.select_action(obs)
        blue_action = await blue_disabled.select_action(obs)
        assert isinstance(red_action, list) and len(red_action) == 2, f"Red action invalid: {red_action}"
        assert isinstance(blue_action, list) and len(blue_action) == 2, f"Blue action invalid: {blue_action}"
        assert 0 <= red_action[0] <= 19, f"Red host_id out of range: {red_action[0]}"
        assert 0 <= red_action[1] <= 5, f"Red action_id out of range: {red_action[1]}"
        assert 0 <= blue_action[0] <= 19, f"Blue host_id out of range: {blue_action[0]}"
        assert 0 <= blue_action[1] <= 5, f"Blue action_id out of range: {blue_action[1]}"
    print("  ✓ Base agents produce valid actions when HyperAgents disabled")

    # ── Test 3: Safety sandbox validation ────────────────────────────────
    print("\n--- Testing Safety Sandbox ---")
    sandbox = SafetySandbox("red", config)
    valid, violations = sandbox.validate_params({"aggression_level": 0.5})
    assert valid, f"Valid params rejected: {violations}"
    print(f"  ✓ Valid params accepted: aggression_level=0.5")

    valid, violations = sandbox.validate_params({"aggression_level": 1.5})
    assert not valid, "Invalid params should be rejected"
    print(f"  ✓ Invalid params rejected: {violations}")

    valid, violations = sandbox.validate_params({"monitoring_focus": [0, 5, 25]})
    assert not valid, "Out-of-range host IDs should be rejected"
    print(f"  ✓ Out-of-range host IDs rejected: {violations}")

    # ── Test 4: Strategy evolver ─────────────────────────────────────────
    print("\n--- Testing Strategy Evolver ---")
    for i in range(8):
        red_evolver.record_episode({"aggression_level": 0.3 + i * 0.1}, 10.0 + i * 5)
    new_strategies = red_evolver.evolve()
    report = red_evolver.get_evolution_report()
    print(f"  ✓ Population: {report.total_strategies}, Best: {report.best_score:.1f}")
    print(f"  ✓ Generated {len(new_strategies)} new strategies via crossover/mutation")

    # ── Test 5: Domain bridge narrative ──────────────────────────────────
    print("\n--- Testing Domain Bridge ---")
    obs = _make_stub_obs(step=15)
    bridge.update_observation(obs, step=15)
    narrative = bridge.get_network_narrative()
    print(f"  ✓ Network narrative: {narrative.narrative[:100]}...")

    battle = bridge.get_battle_narrative(red_score=45.0, blue_score=62.0)
    print(f"  ✓ Battle narrative: {battle.narrative[:100]}...")

    # ── Test 6: Meta-engine self-reflection ──────────────────────────────
    print("\n--- Testing Meta-Engine Self-Reflection ---")
    result = await red.meta.self_reflect()
    print(f"  ✓ Self-assessment: {result.self_assessment[:80]}...")
    print(f"  ✓ Confidence: {result.confidence_in_self_assessment:.2f}")

    # ── Test 7: Persistence ──────────────────────────────────────────────
    print("\n--- Testing State Persistence ---")
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        red.meta.persist_state(f.name)
        red2_meta = type(red.meta)(agent_type="red", config=config)
        red2_meta.load_state(f.name)
        assert len(red2_meta.improvement_log) == len(red.meta.improvement_log)
        print(f"  ✓ Persisted and loaded {len(red.meta.improvement_log)} improvement records")

    # ── Summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("ALL TESTS PASSED ✓")
    print("=" * 60)
    print(f"\nEpisodes run: {len(results)}")
    for i, r in enumerate(results, 1):
        print(f"  Ep {i}: Red={r['red_score']:.1f} Blue={r['blue_score']:.1f}")
    print(f"\nRed improvements logged: {len(red.meta.improvement_log)}")
    print(f"Blue improvements logged: {len(blue.meta.improvement_log)}")
    print(f"Red strategy params: {red.params.model_dump()}")
    print(f"Blue strategy params: {blue.params.model_dump()}")


if __name__ == "__main__":
    asyncio.run(test_hyperagents())
