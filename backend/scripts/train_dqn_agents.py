"""Train real DQN agents for Red and Blue teams.

Produces valid .pt model files that can be loaded at runtime,
replacing the LLM proxy + heuristic fallback chain.

Usage:
    python -m scripts.train_dqn_agents --episodes 5000
    python -m scripts.train_dqn_agents --episodes 5000 --red-only
    python -m scripts.train_dqn_agents --episodes 5000 --blue-only
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

# Ensure backend root on path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents.dqn_wrapper_envs import RedAgentEnv, BlueAgentEnv, _flatten_obs, _obs_dim


def train_dqn(
    agent_type: str,
    num_episodes: int = 5000,
    max_steps: int = 100,
    learning_rate: float = 1e-3,
    buffer_size: int = 50_000,
    learning_starts: int = 1_000,
    batch_size: int = 64,
    gamma: float = 0.99,
    tau: float = 0.005,
    target_update_interval: int = 500,
    train_freq: int = 4,
    exploration_fraction: float = 0.3,
    exploration_initial_eps: float = 1.0,
    exploration_final_eps: float = 0.05,
    verbose: int = 1,
) -> dict:
    """Train a DQN agent and save the model + training history."""
    from stable_baselines3 import DQN

    EnvClass = RedAgentEnv if agent_type == "red" else BlueAgentEnv
    env = EnvClass(num_hosts=20, max_steps=max_steps)

    model = DQN(
        policy="MlpPolicy",
        env=env,
        learning_rate=learning_rate,
        buffer_size=buffer_size,
        learning_starts=learning_starts,
        batch_size=batch_size,
        gamma=gamma,
        tau=tau,
        target_update_interval=target_update_interval,
        train_freq=train_freq,
        exploration_fraction=exploration_fraction,
        exploration_initial_eps=exploration_initial_eps,
        exploration_final_eps=exploration_final_eps,
        verbose=verbose,
        seed=42,
    )

    print(f"\n{'='*60}")
    print(f"Training {agent_type.upper()} DQN agent for {num_episodes} episodes")
    print(f"{'='*60}")

    start_time = time.time()

    # Calculate total timesteps from episodes
    total_timesteps = num_episodes * max_steps

    model.learn(total_timesteps=total_timesteps, progress_bar=True)

    elapsed = time.time() - start_time
    print(f"\nTraining complete in {elapsed:.1f}s")

    # Save model
    models_dir = Path(__file__).resolve().parents[1] / "models"
    models_dir.mkdir(exist_ok=True)

    model_path = models_dir / f"{agent_type}_agent_dqn_v7"
    model.save(str(model_path))
    print(f"Model saved to {model_path}.zip")

    # Evaluate trained agent
    print(f"\nEvaluating {agent_type} agent over 10 episodes...")
    eval_rewards = []
    for ep in range(10):
        obs, _ = env.reset()
        ep_reward = 0.0
        for _ in range(max_steps):
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, _ = env.step(action)
            ep_reward += reward
            if terminated or truncated:
                break
        eval_rewards.append(ep_reward)

    avg_reward = np.mean(eval_rewards)
    std_reward = np.std(eval_rewards)
    print(f"  Average reward: {avg_reward:.1f} ± {std_reward:.1f}")

    # Build training history
    history = {
        "agent_type": agent_type,
        "num_episodes": num_episodes,
        "max_steps_per_episode": max_steps,
        "total_timesteps": total_timesteps,
        "training_duration_seconds": round(elapsed, 1),
        "hyperparameters": {
            "learning_rate": learning_rate,
            "buffer_size": buffer_size,
            "batch_size": batch_size,
            "gamma": gamma,
            "tau": tau,
            "exploration_fraction": exploration_fraction,
            "exploration_initial_eps": exploration_initial_eps,
            "exploration_final_eps": exploration_final_eps,
        },
        "evaluation": {
            "avg_reward": round(float(avg_reward), 2),
            "std_reward": round(float(std_reward), 2),
            "episode_rewards": [round(float(r), 2) for r in eval_rewards],
        },
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    return history, model_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Train DQN agents for CyberGuardian")
    parser.add_argument("--episodes", type=int, default=5000, help="Number of training episodes")
    parser.add_argument("--max-steps", type=int, default=100, help="Max steps per episode")
    parser.add_argument("--red-only", action="store_true", help="Train only Red agent")
    parser.add_argument("--blue-only", action="store_true", help="Train only Blue agent")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--verbose", type=int, default=1, help="SB3 verbose level")
    args = parser.parse_args()

    histories = {}

    if not args.blue_only:
        red_hist, red_path = train_dqn(
            agent_type="red",
            num_episodes=args.episodes,
            max_steps=args.max_steps,
            learning_rate=args.lr,
            verbose=args.verbose,
        )
        histories["red"] = red_hist

    if not args.red_only:
        blue_hist, blue_path = train_dqn(
            agent_type="blue",
            num_episodes=args.episodes,
            max_steps=args.max_steps,
            learning_rate=args.lr,
            verbose=args.verbose,
        )
        histories["blue"] = blue_hist

    # Save combined training history
    models_dir = Path(__file__).resolve().parents[1] / "models"
    hist_path = models_dir / "training_history.json"
    with open(hist_path, "w") as f:
        json.dump(histories, f, indent=2, default=str)
    print(f"\nTraining history saved to {hist_path}")

    # Print summary
    print(f"\n{'='*60}")
    print("TRAINING SUMMARY")
    print(f"{'='*60}")
    for agent_type, hist in histories.items():
        eval_data = hist["evaluation"]
        print(f"  {agent_type.upper()}: avg_reward={eval_data['avg_reward']:.1f} "
              f"± {eval_data['std_reward']:.1f}, "
              f"trained in {hist['training_duration_seconds']}s")


if __name__ == "__main__":
    main()
