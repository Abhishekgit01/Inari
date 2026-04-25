"""Single-agent wrapper envs for training Red and Blue DQN agents separately.

CyberSecurityEnv has a Dict action space (red_action + blue_action).
These wrappers flatten it so each agent can be trained independently with
a flat Discrete action space and a flat Box observation space.

Action encoding: flat_int = host_id * 6 + action_id  (total = 120 actions)
Action decoding: host_id = flat_int // 6, action_id = flat_int % 6
"""

from __future__ import annotations

import numpy as np
from gymnasium import spaces
from typing import Any

from ..environment.cyber_env import CyberSecurityEnv

NUM_HOSTS = 20
NUM_ACTIONS = 6
FLAT_ACTION_DIM = NUM_HOSTS * NUM_ACTIONS  # 120


def _flatten_obs(obs: dict[str, Any], num_hosts: int = 20) -> np.ndarray:
    """Flatten dict observation into a single 1-D float32 vector."""
    parts = [
        np.asarray(obs["network_topology"], dtype=np.float32).flatten(),
        np.asarray(obs["host_status"], dtype=np.float32).flatten(),
        np.asarray(obs["traffic_matrix"], dtype=np.float32).flatten(),
        np.asarray(obs["alert_scores"], dtype=np.float32).flatten(),
        np.asarray(obs["time_step"], dtype=np.float32).flatten(),
    ]
    return np.concatenate(parts)


def _obs_dim(num_hosts: int = 20) -> int:
    """Calculate flattened observation dimension."""
    return num_hosts * num_hosts + num_hosts + num_hosts * num_hosts + num_hosts * 4 + 1


def decode_flat_action(flat_action: int) -> tuple[int, int]:
    """Decode flat discrete action → (host_id, action_id)."""
    flat = int(flat_action)
    host_id = flat // NUM_ACTIONS
    action_id = flat % NUM_ACTIONS
    return host_id, action_id


def encode_flat_action(host_id: int, action_id: int) -> int:
    """Encode (host_id, action_id) → flat discrete action."""
    return host_id * NUM_ACTIONS + action_id


class RedAgentEnv(CyberSecurityEnv):
    """Wrapper that trains only the Red agent.

    Blue agent uses a simple heuristic (monitor highest-alert host).
    Action space: Discrete(120) — decoded as host_id * 6 + action_id
    Observation space: Box(flat)
    Reward: red reward from the base env.
    """

    def __init__(self, num_hosts: int = 20, max_steps: int = 100, **kwargs: Any):
        self._num_hosts = num_hosts
        super().__init__(num_hosts=num_hosts, max_steps=max_steps, **kwargs)
        dim = _obs_dim(num_hosts)
        self.action_space = spaces.Discrete(FLAT_ACTION_DIM)
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(dim,), dtype=np.float32
        )

    def reset(self, seed: int | None = None, options: dict[str, Any] | None = None):
        obs, info = super().reset(seed=seed, options=options)
        return _flatten_obs(obs, self._num_hosts), info

    def step(self, action):
        host_id, action_id = decode_flat_action(int(action))
        red_action = np.array([host_id, action_id], dtype=np.int64)
        # Blue heuristic: target highest-alert host, choose action by threshold
        blue_obs = super()._get_observation()
        alert_scores = np.asarray(blue_obs.get("alert_scores", np.zeros((self._num_hosts, 1))))
        host_risk = alert_scores.max(axis=1) if alert_scores.size else np.zeros(self._num_hosts)
        blue_target = int(np.argmax(host_risk))
        peak = float(host_risk[blue_target]) if host_risk.size else 0.0
        if peak >= 0.82:
            blue_act = 1  # isolate
        elif peak >= 0.6:
            blue_act = 5  # investigate
        elif peak >= 0.4:
            blue_act = 2  # patch
        else:
            blue_act = 0  # monitor
        blue_action = np.array([blue_target, blue_act], dtype=np.int64)

        combined = {"red_action": red_action, "blue_action": blue_action}
        obs, rewards, terminated, truncated, info = super().step(combined)
        return _flatten_obs(obs, self._num_hosts), rewards["red"], terminated, truncated, info


class BlueAgentEnv(CyberSecurityEnv):
    """Wrapper that trains only the Blue agent.

    Red agent uses a simple heuristic (scan → exploit → lateral → exfil).
    Action space: Discrete(120) — decoded as host_id * 6 + action_id
    Observation space: Box(flat)
    Reward: blue reward from the base env.
    """

    def __init__(self, num_hosts: int = 20, max_steps: int = 100, **kwargs: Any):
        self._num_hosts = num_hosts
        super().__init__(num_hosts=num_hosts, max_steps=max_steps, **kwargs)
        dim = _obs_dim(num_hosts)
        self.action_space = spaces.Discrete(FLAT_ACTION_DIM)
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(dim,), dtype=np.float32
        )

    def reset(self, seed: int | None = None, options: dict[str, Any] | None = None):
        obs, info = super().reset(seed=seed, options=options)
        return _flatten_obs(obs, self._num_hosts), info

    def _red_heuristic(self, obs_dict: dict[str, Any]) -> np.ndarray:
        """Simple red heuristic: progressive attack pattern."""
        time_step = int(np.asarray(obs_dict.get("time_step", [0])).flat[0])
        compromised = list(self.compromised_hosts) if hasattr(self, 'compromised_hosts') else []

        if time_step < 5:
            return np.array([0, 0], dtype=np.int64)  # scan DMZ
        elif time_step < 15:
            target = 0 if 0 not in compromised else (2 if 2 not in compromised else 5)
            return np.array([target, 1], dtype=np.int64)  # exploit
        elif time_step < 30:
            unexplored = [h for h in range(self._num_hosts) if h not in compromised]
            target = unexplored[0] if unexplored else 0
            return np.array([target, 2], dtype=np.int64)  # lateral_move
        else:
            if compromised:
                db_hosts = [h for h in [7, 8, 9] if h in compromised]
                target = db_hosts[0] if db_hosts else compromised[0]
            else:
                target = 0
            return np.array([target, 3], dtype=np.int64)  # exfiltrate

    def step(self, action):
        host_id, action_id = decode_flat_action(int(action))
        blue_action = np.array([host_id, action_id], dtype=np.int64)
        red_obs = super()._get_observation()
        red_action = self._red_heuristic(red_obs)

        combined = {"red_action": red_action, "blue_action": blue_action}
        obs, rewards, terminated, truncated, info = super().step(combined)
        return _flatten_obs(obs, self._num_hosts), rewards["blue"], terminated, truncated, info
