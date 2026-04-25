"""
Seeds the database with 3 pre-run episodes:
  - easy:   Brute force only
  - medium: Brute force (host 0) + C2 beacon (host 5) SIMULTANEOUSLY  <- PS requirement
  - hard:   Full APT chain + false positive

Run: python -m scripts.seed_demo_data
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.environment.cyber_env import CyberSecurityEnv


def run_seeded_episode(
    scenario_name: str,
    force_red_actions: list[tuple[int, int, int]] | None = None,
    max_steps: int = 50,
) -> list[dict]:
    """
    Run a scripted episode with forced Red Agent actions.
    force_red_actions: list of (step, target, action_type) tuples to inject.
    """
    env = CyberSecurityEnv(num_hosts=20, max_steps=max_steps)
    obs, info = env.reset()

    episode_logs: list[dict] = []
    episode_steps: list[dict] = []

    for step in range(max_steps):
        # Inject forced actions for demo scenarios
        forced = None
        if force_red_actions:
            forced = next((a for a in force_red_actions if a[0] == step), None)

        if forced:
            _, target, action_type = forced
            red_action = [target, action_type]
        else:
            # Default: scan then exploit then beacon
            if step < 5:
                red_action = [0, 0]   # scan DMZ-01
            elif step < 10:
                red_action = [0, 1]   # exploit DMZ-01
            elif step < 20:
                red_action = [2, 2]   # lateral move to APP-01
            else:
                red_action = [2, 4]   # beacon from APP-01

        blue_action = [0, 0]   # Blue monitors (for seeding purposes)

        action = {"red_action": red_action, "blue_action": blue_action}
        obs, rewards, terminated, truncated, info = env.step(action)

        episode_logs.extend(info.get("all_logs", info.get("logs", [])))
        episode_steps.append({
            "step": step,
            "red_action": red_action,
            "blue_action": blue_action,
            "rewards": rewards,
            "new_alerts": info.get("new_alerts", []),
            "logs": info.get("logs", []),
        })

        if terminated or truncated:
            break

    print(f"  Scenario '{scenario_name}': {len(episode_steps)} steps, "
          f"{len(episode_logs)} logs, "
          f"{sum(len(s['new_alerts']) for s in episode_steps)} alerts")
    return episode_steps


# MEDIUM SCENARIO: TWO SIMULTANEOUS ATTACKS
# Attack 1: Brute force on DMZ-01 (steps 0-10)
# Attack 2: C2 beacon from HOST-05 (steps 5 onwards — OVERLAPPING with attack 1)
MEDIUM_SCENARIO_ACTIONS: list[tuple[int, int, int]] = [
    # Steps 0-4: Scan + Brute force on DMZ-01
    (0, 0, 0),   # scan DMZ-01
    (1, 0, 0),   # scan DMZ-01 again
    (2, 0, 1),   # exploit DMZ-01 (brute force — may fail)
    (3, 0, 1),   # exploit DMZ-01 again
    (4, 0, 1),   # exploit DMZ-01 again
    # Steps 5 onwards: SIMULTANEOUSLY start C2 beacon from a DIFFERENT host
    (5, 0, 1),   # brute force continues on DMZ-01
    (6, 5, 4),   # beacon from HOST-05
    (7, 0, 1),   # brute force continues
    (8, 5, 4),   # beacon continues
    (9, 0, 2),   # lateral move after exploit succeeds
    (10, 5, 4),  # beacon still going
]


if __name__ == "__main__":
    print("Seeding demo scenarios...")
    run_seeded_episode("easy", force_red_actions=[(0, 0, 1), (1, 0, 1), (2, 0, 1)], max_steps=30)
    run_seeded_episode("medium", force_red_actions=MEDIUM_SCENARIO_ACTIONS, max_steps=50)
    run_seeded_episode("hard", force_red_actions=None, max_steps=100)
    print("\nAll demo scenarios seeded. Ready for hackathon.")
