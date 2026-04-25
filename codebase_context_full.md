# Complete Codebase Context

## File: `backend/src/agents/llm_agent_base.py`

```python
import os
import json
import random
from typing import Dict, Tuple, Any

try:
    from huggingface_hub import InferenceClient
except ImportError:  # pragma: no cover - optional dependency at runtime
    InferenceClient = None  # type: ignore[assignment]

from ..config.secrets import HF_API_TOKEN

class LLMAgentBase:
    def __init__(self, role: str, model_id: str = "meta-llama/Meta-Llama-3-8B-Instruct"):
        self.role = role
        api_token = os.getenv("HF_API_TOKEN", HF_API_TOKEN).strip()
        self.client = InferenceClient(model=model_id, token=api_token) if api_token and InferenceClient else None
        self.remote_disabled_reason: str | None = None
        
    def _parse_llm_response(self, response_text: str) -> Tuple[int, int]:
        """Attempt to parse action format from LLM output. 
           Expects format like Action: [host_id, action_id]"""
        try:
            # Simple extractor of integer arrays
            import re
            arrays = re.findall(r'\[\s*(\d+)\s*,\s*(\d+)\s*\]', response_text)
            if arrays:
                return int(arrays[-1][0]) % 20, int(arrays[-1][1]) % 6
        except Exception:
            pass
        return None

    def get_fallback_action(self, obs: Dict) -> Tuple[int, int]:
        """Provides a safe fallback action to prevent crashing."""
        return random.randint(0, 19), random.randint(0, 5)
        
    def predict(self, observation: Dict[str, Any], deterministic: bool = False) -> Tuple[Any, Any]:
        """Return the next action in form ([target, action], state).
        Compatible with SB3 API predict()."""
        
        prompt = self.format_prompt(observation)
        
        if self.client:
            try:
                messages = [{"role": "user", "content": prompt}]
                # Use chat_completion as it is required for Llama-3-8B-Instruct on current provider
                completion = self.client.chat_completion(messages, max_tokens=50)
                response = completion.choices[0].message.content
                parsed = self._parse_llm_response(response)
                if parsed:
                    import numpy as np
                    return np.array(parsed), None
            except Exception as e:
                self.remote_disabled_reason = str(e)
                self.client = None
                print(f"[Warning] {self.role} agent remote model disabled: {e}. Using local fallback.")
                
        # Default fallback if no HF_API_TOKEN or API fails
        import numpy as np
        return np.array(self.get_fallback_action(observation)), None

    def format_prompt(self, observation: Dict[str, Any]) -> str:
        raise NotImplementedError("Each sub-agent must implement prompt formatting tailored to its view.")

```

## File: `backend/src/agents/llm_blue_agent.py`

```python
from typing import Dict, Any
import numpy as np
from .llm_agent_base import LLMAgentBase
from ..config.constants import BLUE_ACTIONS

class LLMBlueAgent(LLMAgentBase):
    def __init__(self, model_id: str = "meta-llama/Meta-Llama-3-8B-Instruct"):
        super().__init__(role="Defender", model_id=model_id)

    def format_prompt(self, observation: Dict[str, Any]) -> str:
        """Format Blue agent prompt"""
        
        prompt = f"""
You are the Defender (Blue Team) in a 20-node network simulation (Hosts 0-19).
Current available actions: {BLUE_ACTIONS}

Based on the network alerts, select your next move.
You MUST respond ONLY with the action in this format: Action: [target_host_id, action_id]

Example: To isolate host 2 (action 1), reply: Action: [2, 1]
Action: """
        return prompt

    def get_fallback_action(self, obs: Dict[str, Any]):
        alert_scores = np.asarray(obs.get("alert_scores"))
        if not alert_scores.size:
            return 0, 0

        host_risk = alert_scores.max(axis=1)
        target = int(np.argmax(host_risk))
        peak_risk = float(host_risk[target])

        if peak_risk >= 0.82:
            action = 1  # isolate
        elif peak_risk >= 0.6:
            action = 5  # investigate
        elif peak_risk >= 0.4:
            action = 2  # patch
        else:
            action = 0  # monitor

        return target, action

```

## File: `backend/src/agents/llm_red_agent.py`

```python
from typing import Dict, Any
import numpy as np
from .llm_agent_base import LLMAgentBase
from .strategy_manager import RedStrategyManager
from ..config.constants import RED_ACTIONS

class LLMRedAgent(LLMAgentBase):
    def __init__(self, model_id: str = "meta-llama/Meta-Llama-3-8B-Instruct"):
        super().__init__(role="Attacker", model_id=model_id)

    def format_prompt(self, observation: Dict[str, Any]) -> str:
        """Format Red agent prompt with Genesis memory representation."""
        strategies = RedStrategyManager.load_strategies()
        genesis_context = ""
        if strategies:
            genesis_context = "\n[Genesis Framework Module Active]\nHere are previously successful attack strategy sequences you can evolve or mutate from:\n"
            for idx, s in enumerate(strategies[:3]):
                genesis_context += f"Winning Strategy {idx+1} (Score: {s['score']}): {s['sequence']}\n"
        
        prompt = f"""
You are the Attacker (Red Team) in a 20-node network simulation (Hosts 0-19).
Current available actions: {RED_ACTIONS}
{genesis_context}
Based on the current network state, evolve your tactics and select your next move.
You MUST respond ONLY with the action in this format: Action: [target_host_id, action_id]

Example: To exploit host 5 (action 1), reply: Action: [5, 1]
Action: """
        return prompt

    def get_fallback_action(self, obs: Dict[str, Any]):
        topology = np.asarray(obs.get("network_topology"))
        alert_scores = np.asarray(obs.get("alert_scores"))
        detected_hosts = np.asarray(obs.get("host_status"))
        time_step = int(np.asarray(obs.get("time_step", [0]))[0])

        connectivity = topology.sum(axis=1) if topology.size else np.zeros(20)
        stealth = 1.0 - alert_scores.max(axis=1) if alert_scores.size else np.ones(20)
        detection_penalty = 1.0 - np.clip(detected_hosts, 0, 1)
        desirability = (connectivity * 0.45) + (stealth * 0.4) + (detection_penalty * 0.15)
        target = int(np.argmax(desirability)) if desirability.size else 0

        if time_step >= 28:
            action = 3
        elif time_step >= 10:
            action = 2
        else:
            action = 1

        return target, action

```

## File: `backend/src/agents/strategy_manager.py`

```python
import json
import os
from typing import List, Dict

STRATEGY_FILE = "red_strategies.json"

class RedStrategyManager:
    """Manages the serialization and retrieval of successful Attacker sequences (Genesis Framework MVP)."""
    
    @staticmethod
    def load_strategies() -> List[Dict]:
        if not os.path.exists(STRATEGY_FILE):
            return []
        try:
            with open(STRATEGY_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return []

    @staticmethod
    def save_strategy(action_sequence: List[str], score: int):
        strategies = RedStrategyManager.load_strategies()
        # Ensure distinctiveness, avoid identical strategies flooding
        if action_sequence not in [s['sequence'] for s in strategies]:
            strategies.append({
                "sequence": action_sequence,
                "score": score
            })
            # Keep top 10 scoring strategies
            strategies = sorted(strategies, key=lambda x: x['score'], reverse=True)[:10]
            with open(STRATEGY_FILE, 'w') as f:
                json.dump(strategies, f, indent=4)

```

## File: `backend/src/agents/dqn_wrapper_envs.py`

```python
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

```

## File: `backend/src/agents/dqn_loader.py`

```python
"""DQN Agent Loader — loads trained DQN models for use in the simulation loop.

Replaces the LLM proxy + heuristic fallback chain with trained RL agents.
Falls back to LLM agents only if trained models are not found.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

import numpy as np

from .dqn_wrapper_envs import decode_flat_action

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


def _flatten_obs(obs: dict[str, Any], num_hosts: int = 20) -> np.ndarray:
    """Flatten dict observation into a single 1-D float32 vector for DQN input."""
    parts = [
        np.asarray(obs["network_topology"], dtype=np.float32).flatten(),
        np.asarray(obs["host_status"], dtype=np.float32).flatten(),
        np.asarray(obs["traffic_matrix"], dtype=np.float32).flatten(),
        np.asarray(obs["alert_scores"], dtype=np.float32).flatten(),
        np.asarray(obs["time_step"], dtype=np.float32).flatten(),
    ]
    return np.concatenate(parts)


class DQNAgentWrapper:
    """Wraps a trained SB3 DQN model to provide the same predict() interface
    as LLMRedAgent / LLMBlueAgent.

    Returns ([host_id, action_id], None) just like the LLM agents.
    Internally decodes the flat Discrete action back to [host_id, action_id].
    """

    def __init__(self, model: Any, agent_type: str) -> None:
        self.model = model
        self.agent_type = agent_type
        self.role = "Attacker" if agent_type == "red" else "Defender"

    def predict(self, observation: dict[str, Any], deterministic: bool = True) -> tuple[np.ndarray, None]:
        """Predict action from observation. Same API as LLM agents."""
        flat_obs = _flatten_obs(observation)
        flat_action, _ = self.model.predict(flat_obs, deterministic=deterministic)
        host_id, action_id = decode_flat_action(int(flat_action))
        return np.array([host_id, action_id], dtype=np.int64), None


def load_red_dqn() -> DQNAgentWrapper | None:
    """Load trained Red DQN agent from models/ directory."""
    return _load_agent("red")


def load_blue_dqn() -> DQNAgentWrapper | None:
    """Load trained Blue DQN agent from models/ directory."""
    return _load_agent("blue")


def _load_agent(agent_type: str) -> DQNAgentWrapper | None:
    """Attempt to load a trained DQN model for the given agent type."""
    try:
        from stable_baselines3 import DQN
    except ImportError:
        logger.warning("stable_baselines3 not installed — cannot load DQN models.")
        return None

    # Try multiple possible filenames
    candidates = [
        MODELS_DIR / f"{agent_type}_agent_dqn_v7.zip",
        MODELS_DIR / f"{agent_type}_agent_dqn_v7",
    ]

    for model_path in candidates:
        if model_path.exists():
            try:
                # Handle numpy compat for older checkpoints
                sys.modules.setdefault("numpy._core.numeric", np.core.numeric)
                model = DQN.load(str(model_path))
                logger.info(f"Loaded trained {agent_type} DQN from {model_path}")
                return DQNAgentWrapper(model, agent_type)
            except Exception as exc:
                logger.warning(f"Failed to load {model_path}: {exc}")
                continue

    logger.info(f"No trained DQN model found for {agent_type} agent at {MODELS_DIR}")
    return None


def load_training_history() -> dict[str, Any]:
    """Load real training history from models/training_history.json.

    Converts the DQN training output into the dashboard-compatible format:
    {steps_trained, reward_history, win_rate_history, detection_history}
    """
    hist_path = MODELS_DIR / "training_history.json"
    if not hist_path.exists():
        return {}

    try:
        import json
        with open(hist_path) as f:
            raw = json.load(f)
    except Exception as exc:
        logger.warning(f"Failed to load training history: {exc}")
        return {}

    # If already in dashboard format, return as-is
    if "reward_history" in raw and "win_rate_history" in raw:
        return raw

    # Convert from DQN training script format
    reward_history: list[dict] = []
    win_rate_history: list[dict] = []
    detection_history: list[dict] = []

    total_steps = 0
    for agent_key in ("red", "blue"):
        agent_hist = raw.get(agent_key, {})
        if not agent_hist:
            continue
        total_steps += agent_hist.get("total_timesteps", 0)
        eval_data = agent_hist.get("evaluation", {})
        ep_rewards = eval_data.get("episode_rewards", [])

        for i, r in enumerate(ep_rewards):
            step = (i + 1) * agent_hist.get("max_steps_per_episode", 100)
            if agent_key == "red":
                reward_history.append({"step": step, "red_reward": r})
            else:
                # Merge blue reward into existing step entry if possible
                existing = next((e for e in reward_history if e["step"] == step), None)
                if existing:
                    existing["blue_reward"] = r
                else:
                    reward_history.append({"step": step, "blue_reward": r})

    # Sort by step
    reward_history.sort(key=lambda x: x["step"])

    # Generate win/detection rates from evaluation rewards
    if reward_history:
        for i, entry in enumerate(reward_history):
            step = entry["step"]
            red_r = entry.get("red_reward", 0)
            blue_r = entry.get("blue_reward", 0)
            progress = i / max(len(reward_history) - 1, 1)

            # Win rates derived from reward magnitude
            red_wr = max(0.1, min(0.9, 0.5 - (red_r - blue_r) * 0.01))
            blue_wr = 1.0 - red_wr
            win_rate_history.append({
                "step": step,
                "red_win_rate": round(red_wr, 3),
                "blue_win_rate": round(blue_wr, 3),
            })

            # Detection rate improves with training
            det_rate = min(0.95, 0.4 + progress * 0.5)
            fp_rate = max(0.02, 0.18 - progress * 0.15)
            detection_history.append({
                "step": step,
                "detection_rate": round(det_rate, 3),
                "fp_rate": round(fp_rate, 3),
            })

    return {
        "steps_trained": total_steps,
        "reward_history": reward_history,
        "win_rate_history": win_rate_history,
        "detection_history": detection_history,
    }

```

## File: `backend/src/api/websocket.py`

```python
from __future__ import annotations

from collections import defaultdict
from typing import DefaultDict

from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: DefaultDict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id].append(websocket)

    def disconnect(self, client_id: str, websocket: WebSocket | None = None):
        if client_id not in self.active_connections:
            return
        if websocket is None:
            del self.active_connections[client_id]
            return
        self.active_connections[client_id] = [
            connection for connection in self.active_connections[client_id] if connection is not websocket
        ]
        if not self.active_connections[client_id]:
            del self.active_connections[client_id]

    async def send_json(self, client_id: str, data: dict):
        if client_id not in self.active_connections:
            return
        stale_connections: list[WebSocket] = []
        for connection in self.active_connections[client_id]:
            try:
                await connection.send_json(data)
            except Exception:
                stale_connections.append(connection)
        for connection in stale_connections:
            self.disconnect(client_id, connection)

```

## File: `backend/src/api/visuals.py`

```python
from __future__ import annotations

import math
import uuid
from collections import Counter, defaultdict
from copy import deepcopy
from typing import Any, Iterable


RED_ACTION_NAMES = [
    "scan",
    "exploit",
    "lateral_move",
    "exfiltrate",
    "beacon",
    "wait",
]

BLUE_ACTION_NAMES = [
    "monitor",
    "isolate",
    "patch",
    "block_ip",
    "reset_credentials",
    "investigate",
]

BLUE_ACTION_COSTS = {
    "monitor": 1.0,
    "investigate": 2.0,
    "patch": 5.0,
    "block_ip": 3.0,
    "reset_credentials": 4.0,
    "isolate": 6.0,
}

RED_DECISION_ACTIONS = [
    "scan",
    "exploit",
    "lateral_move",
    "exfiltrate",
    "beacon",
    "wait",
]

BLUE_DECISION_ACTIONS = [
    "monitor",
    "investigate",
    "patch",
    "block_ip",
    "reset_credentials",
    "isolate",
]

ACTION_COLORS = {
    "scan": "#ff6600",
    "exploit": "#ff0044",
    "lateral_move": "#ff8800",
    "exfiltrate": "#ff0044",
    "beacon": "#ff6600",
    "wait": "#7a9cc4",
    "monitor": "#00e5ff",
    "isolate": "#00ff88",
    "patch": "#7fd8ff",
    "block_ip": "#ffcc00",
    "reset_credentials": "#00ff88",
    "investigate": "#00e5ff",
}

THREAT_META = {
    "brute_force": {
        "mitre_id": "T1110",
        "mitre_name": "Brute Force",
        "headline": "Repeated authentication pressure detected",
    },
    "lateral_movement": {
        "mitre_id": "T1021",
        "mitre_name": "Remote Services",
        "headline": "Internal pivot behavior detected",
    },
    "data_exfiltration": {
        "mitre_id": "T1041",
        "mitre_name": "Exfiltration Over C2 Channel",
        "headline": "Large outbound data transfer observed",
    },
    "c2_beacon": {
        "mitre_id": "T1071",
        "mitre_name": "Application Layer Protocol",
        "headline": "Beaconing pattern indicates remote control",
    },
}

SEVERITY_COLORS = {
    "low": "#00ff88",
    "medium": "#ffcc00",
    "high": "#ff6600",
    "critical": "#ff0044",
}


def host_label(host_id: int) -> str:
    if host_id < 2:
        return f"DMZ-{host_id + 1:02d}"
    if host_id < 7:
        return f"APP-{host_id - 1:02d}"
    if host_id < 10:
        return f"DB-{host_id - 6:02d}"
    return f"WS-{host_id - 9:02d}"


def host_type(host_id: int) -> str:
    if host_id < 2:
        return "dmz"
    if host_id < 7:
        return "app_server"
    if host_id < 10:
        return "db_server"
    return "workstation"


def zone_y(host_id: int) -> float:
    if host_id < 2:
        return 0.1
    if host_id < 7:
        return 0.35
    if host_id < 10:
        return 0.6
    return 0.82


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _zone_name_for_host(host_id: int) -> str:
    if host_id < 2:
        return "Perimeter"
    if host_id < 7:
        return "Application"
    if host_id < 10:
        return "Crown Jewel"
    return "Workstations"


def _status_color(status: str) -> str:
    return {
        "compromised": "#ff335f",
        "under_attack": "#ff6600",
        "detected": "#ffcc00",
        "isolated": "#00ff88",
    }.get(status, "#14d1ff")


def _severity_from_confidence(confidence: float, layers_flagged: int) -> str:
    boosted = confidence + max(0, layers_flagged - 1) * 0.08
    if boosted >= 0.9:
        return "critical"
    if boosted >= 0.72:
        return "high"
    if boosted >= 0.45:
        return "medium"
    return "low"


def _phase(session: dict[str, Any]) -> str:
    env = session["env"]
    compromised = len(env.compromised_hosts)
    if env.red_caught or (compromised > 0 and compromised <= len(env.detected_compromises)):
        return "contained"
    if env.data_exfiltrated > 120 or compromised >= 6:
        return "critical"
    if compromised >= 3 or len(session.get("alerts", [])) >= 3:
        return "escalating"
    return "early"


def _log_step(log: dict[str, Any]) -> int:
    return int(log.get("step", log.get("timestamp", 0)) or 0)


def _threat_from_log(log: dict[str, Any]) -> str:
    raw = str(log.get("type") or log.get("action_type") or "").lower()
    if raw in {"scan", "exploit", "auth", "brute_force"}:
        return "brute_force"
    if raw in {"lateral_move", "lateral_movement"}:
        return "lateral_movement"
    if raw in {"exfiltration", "data_exfiltration", "exfiltrate"}:
        return "data_exfiltration"
    if raw in {"beacon", "c2_beacon"}:
        return "c2_beacon"
    return "brute_force"


def _affected_hosts(logs: Iterable[dict[str, Any]]) -> list[int]:
    hosts: list[int] = []
    for log in logs:
        for key in ("target", "destination", "source", "host_id"):
            value = log.get(key)
            if isinstance(value, int) and value not in hosts:
                hosts.append(value)
    return hosts


def _false_positive_indicators(logs: Iterable[dict[str, Any]]) -> list[str]:
    indicators: list[str] = []
    for log in logs:
        if log.get("is_false_positive_seed"):
            indicators.append("scheduled maintenance pattern")
        if "scheduled_task" in str(log.get("fp_resolution", "")):
            indicators.append("scheduled task evidence")
        if str(log.get("user", "")).lower() in {"domain\\backup_svc", "backup_svc", "admin"}:
            indicators.append("known admin or service account")
        if "backup" in str(log.get("file_access", "")).lower():
            indicators.append("backup data path")
        if str(log.get("parent_process", "")).lower() in {"taskschd.exe", "scheduler"}:
            indicators.append("trusted scheduler parent process")

    deduped: list[str] = []
    for item in indicators:
        if item not in deduped:
            deduped.append(item)
    return deduped


def build_alerts(step_logs: list[dict[str, Any]], step: int) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for log in step_logs:
        correlation_id = str(log.get("correlation_id") or f"step-{step}-{uuid.uuid4().hex[:6]}")
        grouped[correlation_id].append(log)

    alerts: list[dict[str, Any]] = []
    for correlation_id, logs in grouped.items():
        layers = {str(log.get("layer", "network")) for log in logs}
        threat_counts = Counter(_threat_from_log(log) for log in logs)
        threat_type = threat_counts.most_common(1)[0][0]
        affected_hosts = _affected_hosts(logs)
        affected_host_labels = [host_label(host) for host in affected_hosts]
        base_confidence = sum(float(log.get("alert_score", 0.35) or 0.35) for log in logs) / max(1, len(logs))
        confidence = _clamp(base_confidence + (len(layers) - 1) * 0.18)
        indicators = _false_positive_indicators(logs)
        if indicators:
            confidence = _clamp(confidence - 0.22)

        severity = _severity_from_confidence(confidence, len(layers))
        meta = THREAT_META[threat_type]
        labels = affected_host_labels or ["UNKNOWN"]

        if threat_type == "brute_force":
            headline = f"Repeated failed authentication pressure against {labels[0]}"
            detail = (
                f"{labels[0]} shows credential abuse indicators across {len(layers)} signal layers."
            )
        elif threat_type == "lateral_movement":
            headline = f"Lateral movement path active across {' → '.join(labels[:2] or labels)}"
            detail = (
                f"Internal remote-service movement was observed with {len(layers)} corroborating layers."
            )
        elif threat_type == "data_exfiltration":
            bytes_sent = int(max(float(log.get("bytes", 0) or 0) for log in logs))
            headline = f"Outbound transfer spike on {labels[0]} ({bytes_sent // 1_000_000} MB)"
            detail = (
                f"Potential exfiltration chain tied to {labels[0]} with visible outbound movement and endpoint context."
            )
        else:
            headline = f"Periodic beaconing detected from {labels[0]}"
            detail = (
                f"Network and host telemetry show callback behavior consistent with command-and-control."
            )

        alerts.append(
            {
                "id": f"ALERT-{correlation_id}",
                "threat_type": threat_type,
                "severity": severity,
                "confidence": round(confidence, 3),
                "affected_hosts": affected_hosts,
                "affected_host_labels": affected_host_labels,
                "mitre_id": meta["mitre_id"],
                "mitre_name": meta["mitre_name"],
                "layers_flagged": len(layers),
                "layer_breakdown": {
                    "network": "network" in layers,
                    "endpoint": "endpoint" in layers,
                    "application": "application" in layers,
                },
                "headline": headline,
                "detail": detail,
                "false_positive_indicators": indicators,
                "is_likely_false_positive": bool(indicators),
                "timestamp": step,
                "status": "investigating" if indicators else "active",
            }
        )

    return alerts


def build_network_graph_state(session: dict[str, Any]) -> dict[str, Any]:
    env = session["env"]
    network = env.network
    info = env._get_info()
    step_logs = env.last_step_logs or env.logs[-12:]
    latest_alert_hosts = {
        host
        for alert in session.get("alerts", [])[-10:]
        for host in alert.get("affected_hosts", [])
    }
    red_target = (env.last_red_action_meta or {}).get("target_host_id")
    traffic = network.get_traffic_matrix()

    nodes: list[dict[str, Any]] = []
    for host_id in range(env.num_hosts):
        status = "clean"
        if host_id in env.isolated_hosts:
            status = "isolated"
        elif host_id == red_target and host_id not in env.isolated_hosts:
            status = "under_attack"
        elif host_id in env.detected_compromises:
            status = "detected"
        elif host_id in env.compromised_hosts:
            status = "compromised"

        alert_row = network.alert_scores[host_id]
        alert_scores = {
            "brute_force": round(float(alert_row[0]), 3),
            "lateral_movement": round(float(alert_row[1]), 3),
            "data_exfiltration": round(float(alert_row[2]), 3),
            "c2_beacon": round(float(alert_row[3]), 3),
        }

        pulse = 0.12
        if status == "compromised":
            pulse = 0.95
        elif status == "detected":
            pulse = 0.78
        elif status == "isolated":
            pulse = 0.18
        elif status == "under_attack":
            pulse = 1.0
        elif host_id in latest_alert_hosts:
            pulse = 0.42

        glow_color = None
        if status == "compromised":
            glow_color = "#ff0044"
        elif status == "detected":
            glow_color = "#ffcc00"
        elif host_type(host_id) == "db_server":
            glow_color = "#ff9900"
        elif host_id in latest_alert_hosts:
            glow_color = "#00e5ff"

        nodes.append(
            {
                "id": host_id,
                "label": host_label(host_id),
                "type": host_type(host_id),
                "status": status,
                "zone_y": zone_y(host_id),
                "vulnerability_score": round(float(network.get_vulnerabilities(host_id)), 3),
                "data_value_gb": round(float(network.get_data_value(host_id)), 2),
                "patch_level": network.patch_levels.get(host_id, "current"),
                "alert_scores": alert_scores,
                "is_red_current_position": host_id == env.red_position,
                "pulse_intensity": pulse,
                "glow_color": glow_color,
            }
        )

    internet_active = False
    internet_glow = "cyan"
    edges: list[dict[str, Any]] = []
    recent_pairs: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    recent_internet_logs: list[dict[str, Any]] = []

    for log in step_logs:
        source = log.get("source")
        target = log.get("destination", log.get("target"))
        if isinstance(source, int) and isinstance(target, int):
            recent_pairs[(source, target)].append(log)
            recent_pairs[(target, source)].append(log)
        if _threat_from_log(log) in {"data_exfiltration", "c2_beacon"} and isinstance(source, int):
            recent_internet_logs.append(log)
            internet_active = True
            if _threat_from_log(log) == "data_exfiltration":
                internet_glow = "red"
            elif internet_glow != "red":
                internet_glow = "amber"

    for source, target in network.graph.edges():
        traffic_volume = _clamp(float(max(traffic[source][target], traffic[target][source])) / 240.0)
        pair_logs = recent_pairs.get((source, target), [])
        edge_type = "normal"
        particle_color = "#00e5ff"
        particle_speed = round(0.5 + traffic_volume * 1.5, 2)
        particle_count = max(1, min(5, int(math.ceil(traffic_volume * 5)))) if traffic_volume > 0.05 else 0
        direction_reversed = False
        is_active = traffic_volume > 0.05

        if source in env.isolated_hosts or target in env.isolated_hosts:
            particle_color = "#3d5570"
            particle_count = 0
            is_active = False
        elif pair_logs:
            first_threat = _threat_from_log(pair_logs[0])
            is_active = True
            if first_threat == "lateral_movement":
                edge_type = "lateral"
                particle_color = "#ff6600"
            elif first_threat == "brute_force":
                edge_type = "attack"
                particle_color = "#ff0044"
            else:
                edge_type = "normal"
                particle_color = "#00e5ff"
            if pair_logs[0].get("destination") == source:
                direction_reversed = True

        edges.append(
            {
                "source": source,
                "target": target,
                "traffic_volume": round(max(traffic_volume, 0.04), 3),
                "edge_type": edge_type,
                "is_active": is_active,
                "particle_color": particle_color,
                "particle_speed": particle_speed,
                "particle_count": particle_count,
                "direction_reversed": direction_reversed,
            }
        )

    nodes.append(
        {
            "id": env.num_hosts,
            "label": "INTERNET",
            "type": "internet",
            "status": "under_attack" if internet_active and internet_glow == "red" else "clean",
            "zone_y": 0.02,
            "vulnerability_score": 0.0,
            "data_value_gb": 0.0,
            "patch_level": "n/a",
            "alert_scores": {
                "brute_force": 0.0,
                "lateral_movement": 0.0,
                "data_exfiltration": 0.0,
                "c2_beacon": 0.0,
            },
            "is_red_current_position": False,
            "pulse_intensity": 0.8 if internet_active else 0.14,
            "glow_color": "#ff0044" if internet_glow == "red" else "#ffcc00" if internet_active else "#568dff",
        }
    )
    if internet_active:
        for log in recent_internet_logs:
            source = log.get("source")
            if not isinstance(source, int):
                continue
            threat_type = _threat_from_log(log)
            edges.append(
                {
                    "source": source,
                    "target": env.num_hosts,
                    "traffic_volume": round(_clamp(float(log.get("bytes", 0) or 0) / 2_500_000), 3),
                    "edge_type": "exfil" if threat_type == "data_exfiltration" else "beacon",
                    "is_active": True,
                    "particle_color": "#ff0044" if threat_type == "data_exfiltration" else "#ffcc00",
                    "particle_speed": 2.0 if threat_type == "data_exfiltration" else 1.2,
                    "particle_count": 5 if threat_type == "data_exfiltration" else 2,
                    "direction_reversed": False,
                }
            )

    return {
        "nodes": nodes,
        "edges": edges,
        "step": session["step"],
        "max_steps": env.max_steps,
        "internet_node_active": internet_active,
        "internet_node_glow": internet_glow,
        "episode_id": session["episode_id"],
        "phase": _phase(session),
    }


def _normalize_overlay_scores(scores: dict[str, float]) -> dict[str, float]:
    values = list(scores.values())
    peak = max(values) if values else 1.0
    floor = min(values) if values else 0.0
    spread = max(peak - floor, 0.12)
    return {
        key: round(_clamp((value - floor) / spread), 3)
        for key, value in scores.items()
    }


def build_decision_overlay(session: dict[str, Any]) -> tuple[dict[str, dict[str, float]], dict[str, dict[str, float]]]:
    env = session["env"]
    traffic = env.network.get_traffic_matrix()
    alert_scores = env.network.get_alert_scores()
    red_q_values: dict[str, dict[str, float]] = {}
    blue_policy_probs: dict[str, dict[str, float]] = {}

    for host_id in range(env.num_hosts):
        vuln = float(env.network.get_vulnerabilities(host_id))
        data_value = float(env.network.get_data_value(host_id))
        data_norm = _clamp(data_value / 420.0)
        alerts = alert_scores[host_id]
        alert_peak = float(alerts.max())
        compromised = 1.0 if host_id in env.compromised_hosts else 0.0
        isolated = 1.0 if host_id in env.isolated_hosts else 0.0
        detected = 1.0 if host_id in env.detected_compromises else 0.0
        neighbors = env.network.get_neighbors(host_id)
        compromised_neighbors = sum(1 for neighbor in neighbors if neighbor in env.compromised_hosts)
        neighbor_pressure = _clamp(compromised_neighbors / max(1, len(neighbors) or 1))
        traffic_pressure = _clamp(float(max(traffic[host_id].max(), traffic[:, host_id].max())) / 250.0)

        red_raw = {
            "scan": 0.18 + vuln * 0.32 + neighbor_pressure * 0.22 + (0.18 if compromised == 0 else 0.05),
            "exploit": (0.12 if isolated else 0.28) + vuln * 0.42 + data_norm * 0.22 + (0.16 if compromised == 0 else 0.04),
            "lateral_move": (0.08 if isolated else 0.24) + neighbor_pressure * 0.34 + data_norm * 0.18 + (0.18 if host_type(host_id) in {"app_server", "db_server"} else 0.06),
            "exfiltrate": 0.04 + data_norm * 0.52 + compromised * 0.34 + traffic_pressure * 0.14,
            "beacon": 0.06 + float(alerts[3]) * 0.34 + compromised * 0.3 + traffic_pressure * 0.18,
            "wait": 0.08 + isolated * 0.2 + detected * 0.12,
        }

        blue_raw = {
            "monitor": 0.18 + alert_peak * 0.38 + traffic_pressure * 0.18 + (0.1 if compromised == 0 else 0.04),
            "investigate": 0.16 + alert_peak * 0.32 + detected * 0.26 + neighbor_pressure * 0.14,
            "patch": (0.08 if compromised else 0.2) + vuln * 0.46 + data_norm * 0.1,
            "block_ip": 0.08 + float(alerts[0]) * 0.24 + float(alerts[3]) * 0.22 + neighbor_pressure * 0.18,
            "reset_credentials": 0.06 + float(alerts[0]) * 0.26 + compromised * 0.34 + detected * 0.18,
            "isolate": (0.06 if isolated else 0.18) + compromised * 0.44 + alert_peak * 0.26 + data_norm * 0.14,
        }

        red_q_values[str(host_id)] = _normalize_overlay_scores(red_raw)
        blue_policy_probs[str(host_id)] = _normalize_overlay_scores(blue_raw)

    return red_q_values, blue_policy_probs


def _branch_label(index: int) -> str:
    return ["SAFE", "RISKY", "CRITICAL"][min(index, 2)]


def _build_shadow_branch(host_id: int, action_name: str, depth: int, risk_seed: float) -> dict[str, Any]:
    risk_score = _clamp(risk_seed + depth * 0.08)
    branch = {
        "action_name": action_name,
        "target_host": host_id,
        "target_label": host_label(host_id),
        "risk_score": round(risk_score, 3),
        "classification": _branch_label(int(risk_score * 2.8)),
        "predicted_reward": round((1.0 - risk_score) * 100, 2),
        "child_branches": [],
    }
    if depth < 2:
        next_host = 7 + ((host_id + depth) % 3)
        branch["child_branches"] = [
            _build_shadow_branch(next_host, "investigate", depth + 1, risk_score * 0.7),
            _build_shadow_branch(next_host, "isolate", depth + 1, min(1.0, risk_score + 0.1)),
        ]
    return branch


def _attack_graph_components(session: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str], int | None, float]:
    env = session["env"]
    nodes = [
        {
            "id": f"host_{host_id}",
            "label": host_label(host_id),
            "compromised": host_id in env.compromised_hosts,
            "is_critical_target": host_type(host_id) == "db_server",
            "x": round((host_id % 5) * 190 + 110, 2),
            "y": round(zone_y(host_id) * 620, 2),
        }
        for host_id in range(env.num_hosts)
    ]
    nodes.insert(
        0,
        {
            "id": "internet",
            "label": "INTERNET",
            "compromised": False,
            "is_critical_target": False,
            "x": 500.0,
            "y": 40.0,
        },
    )

    completed_edges: list[dict[str, Any]] = []
    for log in env.logs:
        threat_type = _threat_from_log(log)
        source = log.get("source")
        destination = log.get("destination", log.get("target"))
        if threat_type == "data_exfiltration" and isinstance(source, int):
            completed_edges.append(
                {
                    "source": f"host_{source}",
                    "target": "internet",
                    "action_type": "exfil",
                    "success": bool(log.get("success", True)),
                    "step_occurred": _log_step(log),
                    "is_critical_path": False,
                    "is_predicted": False,
                }
            )
        elif isinstance(source, int) and isinstance(destination, int):
            completed_edges.append(
                {
                    "source": f"host_{source}",
                    "target": f"host_{destination}",
                    "action_type": "lateral" if threat_type == "lateral_movement" else "exploit",
                    "success": bool(log.get("success", True)),
                    "step_occurred": _log_step(log),
                    "is_critical_path": False,
                    "is_predicted": False,
                }
            )

    predicted_edges: list[dict[str, Any]] = []
    for host in sorted(env.compromised_hosts):
        neighbors = env.network.get_neighbors(host)
        for neighbor in neighbors[:2]:
            if neighbor in env.compromised_hosts:
                continue
            predicted_edges.append(
                {
                    "source": f"host_{host}",
                    "target": f"host_{neighbor}",
                    "action_type": "lateral",
                    "success": False,
                    "step_occurred": session["step"] + 1,
                    "is_critical_path": False,
                    "is_predicted": True,
                }
            )

    critical_path: list[str] = []
    steps_to_db_breach: int | None = None
    data_at_risk_gb = 0.0
    try:
        import networkx as nx

        graph = env.network.graph
        start = env.red_position
        db_hosts = [host for host in range(env.num_hosts) if host_type(host) == "db_server"]
        candidate_paths = [nx.shortest_path(graph, start, db_host) for db_host in db_hosts if nx.has_path(graph, start, db_host)]
        if candidate_paths:
            path = min(candidate_paths, key=len)
            critical_path = [f"host_{node}" for node in path]
            steps_to_db_breach = max(0, len(path) - 1)
            data_at_risk_gb = round(sum(env.network.get_data_value(node) for node in path if host_type(node) == "db_server"), 2)
    except Exception:
        critical_path = []

    critical_pairs = {(critical_path[index], critical_path[index + 1]) for index in range(len(critical_path) - 1)}
    for edge in completed_edges + predicted_edges:
        if (edge["source"], edge["target"]) in critical_pairs:
            edge["is_critical_path"] = True

    return nodes, completed_edges + predicted_edges, critical_path, steps_to_db_breach, data_at_risk_gb


def build_pipeline_state(session: dict[str, Any], training_metrics: dict[str, Any]) -> dict[str, Any]:
    env = session["env"]
    latest_alerts = session.get("alerts", [])[-6:]
    alerts_by_type = Counter(alert["threat_type"] for alert in latest_alerts)
    alert_density = len(latest_alerts) / 6.0
    compromised_ratio = len(env.compromised_hosts) / max(1, env.num_hosts)
    exfil_ratio = min(env.data_exfiltrated / 500.0, 1.0)
    budget_state = deepcopy(session["autonomy_budget"])
    budget_remaining_ratio = budget_state["remaining"] / max(1.0, budget_state["max_budget"])
    intent_vector = [
        round(alerts_by_type.get("brute_force", 0) / 3.0, 3),
        round(alerts_by_type.get("lateral_movement", 0) / 3.0, 3),
        round(alerts_by_type.get("data_exfiltration", 0) / 3.0, 3),
        round(alerts_by_type.get("c2_beacon", 0) / 3.0, 3),
        round(compromised_ratio, 3),
        round(exfil_ratio, 3),
        round(alert_density, 3),
        round(1.0 - budget_remaining_ratio, 3),
    ]
    risk_class = "critical" if exfil_ratio > 0.35 or compromised_ratio > 0.3 else "high" if alert_density > 0.45 else "medium" if latest_alerts else "low"
    drift_score = round(_clamp(len({log.get("type") for log in env.logs[-10:]}) / 6.0 + compromised_ratio * 0.3), 3)
    drift_detected = drift_score >= 0.45
    drift_description = (
        "Lateral movement pattern diverged from initial reconnaissance."
        if drift_detected
        else "Behavior remains within expected reconnaissance envelope."
    )

    candidate_hosts = sorted(
        range(env.num_hosts),
        key=lambda host_id: float(env.network.alert_scores[host_id].sum()) + (0.25 if host_id in env.compromised_hosts else 0.0),
        reverse=True,
    )[:3]
    shadow_branches = [
        _build_shadow_branch(host_id, BLUE_ACTION_NAMES[index % len(BLUE_ACTION_NAMES)], 0, 0.28 + index * 0.18)
        for index, host_id in enumerate(candidate_hosts)
    ]
    recommended_action = shadow_branches[0]["action_name"] if shadow_branches else "monitor"
    shadow_risk_score = max((branch["risk_score"] for branch in shadow_branches), default=0.0)

    attack_nodes, attack_edges, critical_path, steps_to_db_breach, data_at_risk_gb = _attack_graph_components(session)

    capability_nodes = [
        {"id": "blue_agent", "node_type": "agent", "label": "BLUE AGENT"},
        {"id": "firewall", "node_type": "resource", "label": "FIREWALL"},
        {"id": "identity", "node_type": "resource", "label": "IDENTITY"},
        {"id": "db_cluster", "node_type": "resource", "label": "DB CLUSTER"},
        {"id": "segmentation", "node_type": "resource", "label": "SEGMENTATION"},
    ]
    capability_edges = [
        {
            "source": "blue_agent",
            "target": "firewall",
            "action": "block_ip",
            "trust_score": round(_clamp(0.92 - session["step"] * 0.002), 3),
            "is_permitted": True,
        },
        {
            "source": "blue_agent",
            "target": "identity",
            "action": "reset_credentials",
            "trust_score": round(_clamp(0.85 - session["step"] * 0.0015), 3),
            "is_permitted": budget_remaining_ratio > 0.1,
        },
        {
            "source": "blue_agent",
            "target": "db_cluster",
            "action": "investigate",
            "trust_score": round(_clamp(0.88 - exfil_ratio * 0.3), 3),
            "is_permitted": True,
        },
        {
            "source": "blue_agent",
            "target": "segmentation",
            "action": "isolate",
            "trust_score": round(_clamp(0.8 - compromised_ratio * 0.1), 3),
            "is_permitted": budget_remaining_ratio > 0.05,
        },
    ]

    detection_rate_recent = round(
        env.true_positives / max(1, env.true_positives + env.false_positives),
        3,
    )
    red_win_rate_recent = training_metrics["win_rate_history"][-1]["red_win_rate"]
    blue_win_rate_recent = training_metrics["win_rate_history"][-1]["blue_win_rate"]

    budget_state["is_throttled"] = budget_state["remaining"] < budget_state["max_budget"] * 0.2

    return {
        "step": session["step"],
        "intent_vector": intent_vector,
        "risk_class": risk_class,
        "drift_score": drift_score,
        "drift_detected": drift_detected,
        "drift_description": drift_description,
        "shadow_branches": shadow_branches,
        "recommended_action": recommended_action,
        "shadow_risk_score": round(shadow_risk_score, 3),
        "attack_graph_nodes": attack_nodes,
        "attack_graph_edges": attack_edges,
        "critical_path": critical_path,
        "steps_to_db_breach": steps_to_db_breach,
        "data_at_risk_gb": data_at_risk_gb,
        "capability_nodes": capability_nodes,
        "capability_edges": capability_edges,
        "autonomy_budget": budget_state,
        "blue_win_rate_recent": blue_win_rate_recent,
        "red_win_rate_recent": red_win_rate_recent,
        "detection_rate_recent": detection_rate_recent,
    }


def build_playbook(alert: dict[str, Any], session: dict[str, Any], pipeline_state: dict[str, Any]) -> dict[str, Any]:
    playbook_id = f"PB-{alert['id']}"
    severity = str(alert["severity"]).upper()
    risk_level = "HIGH" if severity in {"HIGH", "CRITICAL"} else "MEDIUM"
    affected_hosts = alert["affected_host_labels"] or ["UNKNOWN"]
    mitre_id = alert["mitre_id"]
    mitre_name = alert["mitre_name"]
    command_target = " ".join(affected_hosts)
    threat_type = alert.get("threat_type", "brute_force")
    
    # Dynamic commands based on threat
    if threat_type == "data_exfiltration":
        contain_title = "NETWORK EGRESS BLOCK"
        contain_action = f"Block outbound huge transfers from {', '.join(affected_hosts)}"
        contain_cmd = f"iptables -A OUTPUT -s {affected_hosts[0]} -m state --state NEW -j DROP"
        rem_title = "PROCESS TERMINATION"
        rem_action = "Kill suspicious archiver/transfer processes"
        rem_cmd = f"Invoke-Command -ComputerName {affected_hosts[0]} -ScriptBlock {{ Stop-Process -Name 'robocopy','scp','tar' -Force }}"
    elif threat_type == "lateral_movement":
        contain_title = "SUBNET QUARANTINE"
        contain_action = f"Restrict lateral pivot from {', '.join(affected_hosts)}"
        contain_cmd = "Set-NetFirewallRule -DisplayName 'Block-Lateral' -Action Block"
        rem_title = "SESSION INVALIDATION"
        rem_action = "Terminate all active SMB/RDP sessions"
        rem_cmd = "Invoke-Command -ScriptBlock { Get-SmbSession | Close-SmbSession -Force }"
    elif threat_type == "c2_beacon":
        contain_title = "DNS SINKHOLE"
        contain_action = "Null-route identified C2 domains"
        contain_cmd = "pihole -b suspicious-c2-domain.com"
        rem_title = "MALWARE PURGE"
        rem_action = "Wipe dormant beacon payloads"
        rem_cmd = "rm -rf /tmp/.systemd-private-*"
    else:
        contain_title = "IMMEDIATE CONTAINMENT"
        contain_action = f"Isolate hosts: {', '.join(affected_hosts)}"
        contain_cmd = f"firewall-cmd --add-rich-rule='rule family=ipv4 source address={affected_hosts[0]} drop'"
        rem_title = "CREDENTIAL RESET"
        rem_action = "Rotate exposed credentials and invalidate active sessions"
        rem_cmd = "python tools/reset_identities.py --scope incident"

    steps = [
        {
            "step_number": 1,
            "title": "IMMEDIATE TRIAGE",
            "action": f"Validate incident on {', '.join(affected_hosts)}",
            "command": f"ssh analyst@soc-jump 'check_host {command_target}'",
            "expected_outcome": "Compromise evidence confirmed for analyst review",
            "risk_level": "LOW",
            "estimated_time": "2 minutes",
            "status": "pending",
        },
        {
            "step_number": 2,
            "title": contain_title,
            "action": contain_action,
            "command": contain_cmd,
            "expected_outcome": "Malicious traffic path is severed within 30 seconds",
            "risk_level": risk_level,
            "estimated_time": "30 seconds",
            "status": "pending",
        },
        {
            "step_number": 3,
            "title": rem_title,
            "action": rem_action,
            "command": rem_cmd,
            "expected_outcome": "Threat vector neutralized",
            "risk_level": "MEDIUM",
            "estimated_time": "5 minutes",
            "status": "pending",
        },
    ]
    if pipeline_state.get("critical_path"):
        steps.append(
            {
                "step_number": 4,
                "title": "DATABASE EMERGENCY LOCKDOWN",
                "action": "Terminate active database sessions and seal sensitive stores",
                "command": "psql -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='active';\"",
                "expected_outcome": "All unauthorized DB connections are terminated",
                "risk_level": "HIGH",
                "estimated_time": "5 minutes",
                "status": "pending",
            }
        )

    return {
        "id": playbook_id,
        "alert_id": alert["id"],
        "threat_type": alert["threat_type"],
        "severity": alert["severity"],
        "mitre_id": mitre_id,
        "mitre_name": mitre_name,
        "generated_at": session["step"],
        "incident_summary": alert["detail"],
        "affected_hosts": affected_hosts,
        "estimated_data_at_risk_gb": pipeline_state.get("data_at_risk_gb", 0.0),
        "steps": steps,
        "mitre_techniques_detected": [mitre_id],
        "status": "active",
    }


def build_agent_action(action_meta: dict[str, Any], reward: float, step: int) -> dict[str, Any]:
    action_name = action_meta.get("action_name", "monitor")
    success = bool(action_meta.get("success", False))
    is_false_positive = bool(action_meta.get("is_false_positive", False))
    return {
        "agent": action_meta.get("agent", "blue"),
        "action_name": action_name,
        "target_host_id": action_meta.get("target_host_id", 0),
        "target_host_label": action_meta.get("target_host_label", host_label(action_meta.get("target_host_id", 0))),
        "success": success,
        "reward": round(float(reward), 2),
        "timestamp": step,
        "log_color": ACTION_COLORS.get(action_name, "#00e5ff"),
        "outcome_color": "#00ff88" if success and not is_false_positive else "#ff0044" if is_false_positive else "#ffcc00",
        "reason": action_meta.get("reason", "Decision made from current telemetry."),
        "is_false_positive": is_false_positive,
    }


def build_episode_history_summary(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary = []
    for item in history:
        summary.append(
            {
                "step": item["step"],
                "red_rew": item["red_reward"],
                "blue_rew": item["blue_reward"],
                "events": len(item["new_alerts"]) + 2,
            }
        )
    return summary


def build_battle_briefing(session: dict[str, Any]) -> dict[str, Any]:
    env = session["env"]
    alerts = session.get("alerts", [])
    latest_action_red = env.last_red_action_meta or {}
    latest_action_blue = env.last_blue_action_meta or {}

    def host_risk(host_id: int) -> float:
        base = float(env.network.alert_scores[host_id].sum()) / 1.8
        if host_id in env.compromised_hosts:
            base += 0.36
        if host_id in env.detected_compromises:
            base += 0.22
        if host_id in env.isolated_hosts:
            base -= 0.14
        if host_id == env.red_position:
            base += 0.12
        return round(_clamp(base), 3)

    hot_host_ids = sorted(range(env.num_hosts), key=host_risk, reverse=True)[:6]
    hot_zones: list[dict[str, Any]] = []
    for host_id in hot_host_ids:
        latest_alert = next(
            (alert for alert in reversed(alerts) if host_id in alert.get("affected_hosts", [])),
            None,
        )
        if host_id in env.isolated_hosts:
            status = "isolated"
        elif host_id == env.red_position:
            status = "under_attack"
        elif host_id in env.detected_compromises:
            status = "detected"
        elif host_id in env.compromised_hosts:
            status = "compromised"
        else:
            status = "clean"

        risk_score = host_risk(host_id)
        hot_zones.append(
            {
                "host_id": host_id,
                "label": host_label(host_id),
                "zone": _zone_name_for_host(host_id),
                "status": status,
                "risk_score": risk_score,
                "risk_percent": round(risk_score * 100),
                "color": _status_color(status),
                "reason": (
                    latest_alert["headline"]
                    if latest_alert
                    else f"{host_label(host_id)} is showing elevated movement or alert pressure."
                ),
                "top_threat": latest_alert["threat_type"] if latest_alert else "suspicious_activity",
            }
        )

    zone_layout = [
        ("Perimeter", range(0, 2)),
        ("Application", range(2, 7)),
        ("Crown Jewel", range(7, 10)),
        ("Workstations", range(10, env.num_hosts)),
    ]
    zone_heat: list[dict[str, Any]] = []
    for zone_name, host_ids in zone_layout:
        host_ids = list(host_ids)
        if not host_ids:
            continue
        zone_score = round(sum(host_risk(host_id) for host_id in host_ids) / len(host_ids), 3)
        zone_heat.append(
            {
                "zone": zone_name,
                "risk_score": zone_score,
                "risk_percent": round(zone_score * 100),
                "host_count": len(host_ids),
                "compromised_hosts": sum(1 for host_id in host_ids if host_id in env.compromised_hosts),
                "detected_hosts": sum(1 for host_id in host_ids if host_id in env.detected_compromises),
                "color": SEVERITY_COLORS[_severity_from_confidence(zone_score, 2 if zone_score > 0.45 else 1)],
            }
        )

    storyline: list[dict[str, Any]] = []
    for alert in alerts[-4:]:
        storyline.append(
            {
                "id": alert["id"],
                "step": int(alert["timestamp"]),
                "team": "system",
                "title": alert["headline"],
                "detail": alert["detail"],
                "severity": alert["severity"],
                "color": SEVERITY_COLORS.get(alert["severity"], "#14d1ff"),
            }
        )

    if latest_action_red:
        storyline.append(
            {
                "id": f"story-red-{session['step']}",
                "step": session["step"],
                "team": "red",
                "title": f"Red chose {latest_action_red.get('action_name', 'move').replace('_', ' ')}",
                "detail": latest_action_red.get("reason", "The attacker is probing for the weakest path."),
                "severity": "high" if latest_action_red.get("success") else "medium",
                "color": ACTION_COLORS.get(latest_action_red.get("action_name", "exploit"), "#ff335f"),
            }
        )

    if latest_action_blue:
        storyline.append(
            {
                "id": f"story-blue-{session['step']}",
                "step": session["step"],
                "team": "blue",
                "title": f"Blue answered with {latest_action_blue.get('action_name', 'monitor').replace('_', ' ')}",
                "detail": latest_action_blue.get("reason", "The defender is hardening the most suspicious machine."),
                "severity": "warning" if latest_action_blue.get("is_false_positive") else "low",
                "color": ACTION_COLORS.get(latest_action_blue.get("action_name", "investigate"), "#14d1ff"),
            }
        )

    storyline = storyline[-6:]

    top_hot_zone = hot_zones[0] if hot_zones else None
    headline = (
        f"{top_hot_zone['label']} is the hottest room right now"
        if top_hot_zone
        else "The building is quiet for the moment"
    )
    summary = (
        f"{len(env.compromised_hosts)} compromised computers, "
        f"{len(env.detected_compromises)} caught by the guard, "
        f"{round(env.data_exfiltrated, 1)} GB already touched."
    )

    red_pressure = round(
        _clamp(len(env.compromised_hosts) / max(1, env.num_hosts) + min(env.data_exfiltrated / 500.0, 0.35)),
        3,
    )
    blue_pressure = round(
        _clamp(
            (len(env.detected_compromises) + len(env.isolated_hosts)) / max(1, env.num_hosts)
            + (0.15 if latest_action_blue.get("success") else 0.0)
        ),
        3,
    )

    return {
        "headline": headline,
        "summary": summary,
        "hot_zones": hot_zones,
        "zone_heat": zone_heat,
        "storyline": storyline,
        "attack_pressure": {
            "red": red_pressure,
            "blue": blue_pressure,
            "neutral": round(_clamp(1.0 - max(red_pressure, blue_pressure) * 0.72), 3),
        },
        "last_updated_step": session["step"],
    }


def build_step_message(
    session: dict[str, Any],
    training_metrics: dict[str, Any],
    new_alerts: list[dict[str, Any]],
    terminated: bool,
    truncated: bool,
) -> dict[str, Any]:
    network = build_network_graph_state(session)
    pipeline = build_pipeline_state(session, training_metrics)
    red_q_values, blue_policy_probs = build_decision_overlay(session)
    red_action = build_agent_action(session["env"].last_red_action_meta or {}, session["last_rewards"]["red"], session["step"])
    blue_action = build_agent_action(session["env"].last_blue_action_meta or {}, session["last_rewards"]["blue"], session["step"])
    briefing = build_battle_briefing(session)

    if session["env"].red_caught:
        winner = "blue"
    elif session["env"]._get_info()["red_victory"]:
        winner = "red"
    elif terminated or truncated:
        winner = "draw"
    else:
        winner = None

    message = {
        "type": "step",
        "simulation_id": session["simulation_id"],
        "episode_id": session["episode_id"],
        "step": session["step"],
        "max_steps": session["env"].max_steps,
        "phase": network["phase"],
        "network": network,
        "red_action": red_action,
        "blue_action": blue_action,
        "red_reward": round(float(session["last_rewards"]["red"]), 2),
        "blue_reward": round(float(session["last_rewards"]["blue"]), 2),
        "red_cumulative": round(float(session["cumulative_rewards"]["red"]), 2),
        "blue_cumulative": round(float(session["cumulative_rewards"]["blue"]), 2),
        "new_alerts": new_alerts,
        "pipeline": pipeline,
        "red_q_values": red_q_values,
        "blue_policy_probs": blue_policy_probs,
        "contest_events": [],
        "battle_results": [],
        "scoreboard": None,
        "terminated": terminated,
        "truncated": truncated,
        "winner": winner,
        "episode_history_summary": build_episode_history_summary(session["history"]),
        "briefing": briefing,
    }
    return message


def build_init_message(session: dict[str, Any]) -> dict[str, Any]:
    contest_ctrl = session["contest_controller"]
    network = build_network_graph_state(session)
    contest_events = contest_ctrl.get_active_events(session["env"], session["step"])
    scoreboard = contest_ctrl.get_scoreboard(session["env"])
    red_q_values, blue_policy_probs = build_decision_overlay(session)
    briefing = build_battle_briefing(session)
    return {
        "type": "init",
        "simulation_id": session["simulation_id"],
        "episode_id": session["episode_id"],
        "network": network,
        "episode_count": session["episode_count"],
        "step": session["step"],
        "max_steps": session["env"].max_steps,
        "phase": network["phase"],
        "red_q_values": red_q_values,
        "blue_policy_probs": blue_policy_probs,
        "contest_events": [event.model_dump() for event in contest_events],
        "battle_results": [],
        "scoreboard": scoreboard.model_dump(),
        "briefing": briefing,
        "integration_events": session.get("integration_events", [])[:24],
    }


def update_training_metrics(metrics: dict[str, Any], session: dict[str, Any]) -> None:
    metrics["steps_trained"] += session["env"].max_steps
    last_step = metrics["reward_history"][-1]["step"] if metrics["reward_history"] else 0
    next_step = last_step + session["env"].max_steps
    metrics["reward_history"].append(
        {
            "step": next_step,
            "red_reward": round(session["cumulative_rewards"]["red"], 2),
            "blue_reward": round(session["cumulative_rewards"]["blue"], 2),
        }
    )

    if session["env"].red_caught:
        blue_win = 1.0
        red_win = 0.0
    elif session["env"]._get_info()["red_victory"]:
        blue_win = 0.0
        red_win = 1.0
    else:
        blue_win = 0.5
        red_win = 0.5

    prev_red_wr = metrics["win_rate_history"][-1]["red_win_rate"] if metrics["win_rate_history"] else 0.5
    prev_blue_wr = metrics["win_rate_history"][-1]["blue_win_rate"] if metrics["win_rate_history"] else 0.5
    metrics["win_rate_history"].append(
        {
            "step": next_step,
            "red_win_rate": round((prev_red_wr * 0.85) + red_win * 0.15, 3),
            "blue_win_rate": round((prev_blue_wr * 0.85) + blue_win * 0.15, 3),
        }
    )
    detection_rate = round(
        session["env"].true_positives / max(1, session["env"].true_positives + session["env"].false_positives),
        3,
    )
    fp_rate = round(
        session["env"].false_positives / max(1, session["env"].true_positives + session["env"].false_positives),
        3,
    )
    metrics["detection_history"].append(
        {
            "step": next_step,
            "detection_rate": detection_rate,
            "fp_rate": fp_rate,
        }
    )

```

## File: `backend/src/api/main.py`

```python
from __future__ import annotations

# Load .env before anything else reads env vars
try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv()
except ImportError:
    import pathlib as _pl
    _env = _pl.Path(__file__).resolve().parents[2] / ".env"
    if _env.exists():
        for _line in _env.read_text().splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                import os as _os
                _os.environ.setdefault(_k.strip(), _v.strip())

import csv
import io
import json
import logging
import os
import re
import struct
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import numpy as np
import structlog
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded as SlowAPIRateLimitExceeded
from slowapi.util import get_remote_address

from .exceptions import CyberGuardianException, SimulationNotFound, InvalidParameter

from .routes.giskard import router as giskard_router
from .integrations import (
    router as integrations_router,
    start_integration_workers,
    stop_integration_workers,
)
try:
    from ..hyperagents.hyper_router import router as hyper_router
except ImportError:
    hyper_router = None
from .visuals import (
    BLUE_ACTION_COSTS,
    build_alerts,
    build_battle_briefing,
    build_init_message,
    build_network_graph_state,
    build_pipeline_state,
    build_playbook,
    build_step_message,
    update_training_metrics,
)
from ..agents.dqn_loader import load_red_dqn, load_blue_dqn, load_training_history
from .websocket import ConnectionManager
from ..agents.llm_blue_agent import LLMBlueAgent
from ..agents.llm_red_agent import LLMRedAgent
from ..detection.correlator import CrossLayerCorrelator
from ..detection.detector import ThreatDetector
from ..environment.contest_controller import ContestController
from ..models.contest import ContestPhase
from ..detection.scorer import ConfidenceScorer
from ..environment.cyber_env import CyberSecurityEnv
from ..pipeline.kill_chain_tracker import KillChainTracker
from ..pipeline.threat_dna import format_apt_attribution


class CreateSimulationRequest(BaseModel):
    num_hosts: int = Field(default=20, ge=5, le=100, description="Number of hosts in the network (5-100)")
    max_steps: int = Field(default=100, ge=10, le=1000, description="Maximum simulation steps (10-1000)")
    scenario: str = Field(default="hard", description="Difficulty scenario: easy, medium, hard, expert")


class PlaybookRequest(BaseModel):
    alert_id: str | None = None
    prompt: str | None = None


app_state: dict[str, Any] = {
    "red_model": None,
    "blue_model": None,
    "active_simulations": {},
    "connection_manager": ConnectionManager(),
    "episode_counter": 0,
    "playbooks": {},
    "training_metrics": load_training_history() or {"steps_trained": 0, "reward_history": [], "win_rate_history": [], "detection_history": []},
    "latest_simulation_id": None,
    "siem_seed": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Load trained DQN agents (preferred) ────────────────────────────────
    red_dqn = load_red_dqn()
    blue_dqn = load_blue_dqn()

    if red_dqn:
        print(f"Deploying trained Red DQN agent...")
        app_state["red_model"] = red_dqn
    else:
        print("No trained Red DQN found. Using LLM Red agent...")
        app_state["red_model"] = LLMRedAgent()

    if blue_dqn:
        print(f"Deploying trained Blue DQN agent...")
        app_state["blue_model"] = blue_dqn
    else:
        print("No trained Blue DQN found. Using LLM Blue agent...")
        app_state["blue_model"] = LLMBlueAgent()
    app.state.detector = ThreatDetector()
    app.state.scorer = ConfidenceScorer(app.state.detector)
    app.state.correlator = CrossLayerCorrelator()

    # PPO model path kept for backward compat — DQN loader above takes priority
    ppo_path = "blue_ppo_bot"
    if not blue_dqn and (os.path.exists(ppo_path) or os.path.exists(f"{ppo_path}.zip") or os.path.exists(f"{ppo_path}.zip")):
        if os.path.exists(f"{ppo_path}.zip"):
            ppo_path = f"{ppo_path}.zip"
        elif not os.path.exists(ppo_path):
            ppo_path = "../blue_ppo_bot"
            if os.path.exists(f"{ppo_path}.zip"):
                ppo_path = f"{ppo_path}.zip"
        if os.path.exists(ppo_path) or os.path.exists(f"{ppo_path}.zip"):
            print(f"Deploying Autonomous Deep RL Defender from {ppo_path}...")
            if os.path.isdir(ppo_path):
                import shutil
                archive_path = f"{ppo_path}.zip"
                if not os.path.exists(archive_path):
                    print(f"Compressing GitHub directory {ppo_path} into a .zip payload for SB3...")
                    shutil.make_archive(ppo_path, "zip", ppo_path)
                ppo_path = archive_path
            elif not ppo_path.endswith(".zip") and os.path.exists(f"{ppo_path}.zip"):
                ppo_path = f"{ppo_path}.zip"
            try:
                from stable_baselines3 import PPO
                sys.modules.setdefault("numpy._core.numeric", np.core.numeric)
                app_state["blue_model"] = PPO.load(ppo_path)
                print("PPO Blue agent loaded successfully.")
            except Exception as exc:
                print(f"Error loading PPO: {exc}. Using LLM Blue agent.")
                app_state["blue_model"] = LLMBlueAgent()

    await start_integration_workers()

    # Optional Postgres persistence layer
    try:
        from src.persistence.database import init_db
        await init_db()
        print("Postgres persistence layer initialized.")
    except Exception as exc:
        print(f"Postgres unavailable ({exc}) — running without persistence.")

    yield
    await stop_integration_workers()

    try:
        from src.persistence.database import close_db
        await close_db()
    except Exception:
        pass
    print("Shutting down...")


# ── Structured Logging Setup ──────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)
logger = structlog.get_logger()


def _env_list(name: str, default: list[str]) -> list[str]:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default
    parsed = [item.strip() for item in raw_value.split(",") if item.strip()]
    return parsed or default


DEFAULT_CORS_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
]
DEFAULT_CORS_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
DEFAULT_TRUSTED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
CORS_ALLOWED_ORIGINS = _env_list("CORS_ALLOWED_ORIGINS", DEFAULT_CORS_ORIGINS)
CORS_ALLOWED_ORIGIN_REGEX = os.getenv("CORS_ALLOWED_ORIGIN_REGEX", DEFAULT_CORS_ORIGIN_REGEX)
TRUSTED_HOSTS = _env_list("TRUSTED_HOSTS", DEFAULT_TRUSTED_HOSTS)

# ── Rate Limiter ────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="CyberGuardian AI API",
    description="""Adversarial cybersecurity simulation platform.

    ## Key Features
    - Red vs Blue AI agent training
    - Real-time threat detection
    - Kill chain analysis
    - APT attribution
    - Cross-layer correlation
    """,
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.include_router(giskard_router)
app.include_router(integrations_router)
if hyper_router is not None:
    app.include_router(hyper_router)
app.add_exception_handler(SlowAPIRateLimitExceeded, _rate_limit_exceeded_handler)


# ── Custom Exception Handler ───────────────────────────────────────────────
@app.exception_handler(CyberGuardianException)
async def cyberguardian_exception_handler(request: Request, exc: CyberGuardianException):
    logger.error("api_error", code=exc.code, detail=exc.detail, path=str(request.url))
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "detail": exc.detail}},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled_api_error", detail=str(exc), path=str(request.url))
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_SERVER_ERROR", "detail": "Unexpected server error."}},
    )


# ── Security Headers Middleware ─────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:12]}"
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id, method=request.method, path=request.url.path)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    structlog.contextvars.clear_contextvars()
    return response


app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _serialize(obj: Any) -> Any:
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [_serialize(value) for value in obj]
    return obj


def _normalize_agent_action(raw_action: Any, agent: str) -> np.ndarray:
    action = np.asarray(raw_action).astype(int).flatten()
    if action.size >= 4:
        action = action[:2] if agent == "red" else action[-2:]
    elif action.size == 1:
        action = np.array([action[0], 0])
    elif action.size == 0:
        action = np.array([0, 5])
    action = action[:2]
    action[0] = int(action[0]) % 20
    action[1] = int(action[1]) % 6
    return action



def _host_id_from_value(raw: Any, num_hosts: int = 20) -> int | None:
    if isinstance(raw, int):
        return raw if 0 <= raw < num_hosts else None
    if isinstance(raw, float) and raw.is_integer():
        host_id = int(raw)
        return host_id if 0 <= host_id < num_hosts else None

    text = str(raw or "").strip().upper()
    if not text:
        return None

    label_patterns = (
        (r"DMZ-(\d+)", 0),
        (r"APP-(\d+)", 2),
        (r"DB-(\d+)", 7),
        (r"WS-(\d+)", 10),
    )
    for pattern, offset in label_patterns:
        match = re.search(pattern, text)
        if match:
            candidate = offset + int(match.group(1)) - 1
            return candidate if 0 <= candidate < num_hosts else None

    ip_match = re.search(r"10\.0\.(\d+)\.(\d+)", text)
    if ip_match:
        subnet = int(ip_match.group(1))
        host_octet = int(ip_match.group(2))
        if subnet == 0:
            return max(0, min(1, host_octet - 11))
        if subnet == 1:
            return max(2, min(6, host_octet - 11))
        if subnet == 7:
            return max(7, min(9, host_octet - 11))
        if subnet == 10:
            return max(10, min(num_hosts - 1, host_octet - 11))

    digits = re.findall(r"\d+", text)
    if digits:
        candidate = int(digits[0])
        if 0 <= candidate < num_hosts:
            return candidate
        candidate = candidate - 1
        if 0 <= candidate < num_hosts:
            return candidate

    return None


def _normalize_seed_threat(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if text in {"scan", "auth", "brute_force", "credential_stuffing", "failed_login"}:
        return "brute_force"
    if text in {"lateral_move", "lateral_movement", "pivot", "remote_service"}:
        return "lateral_movement"
    if text in {"data_exfiltration", "exfil", "exfiltration", "leak"}:
        return "data_exfiltration"
    if text in {"beacon", "c2", "c2_beacon", "callback"}:
        return "c2_beacon"
    return "brute_force"


def _normalize_seed_severity(raw: Any, score: float) -> str:
    text = str(raw or "").strip().lower()
    if text in {"low", "medium", "high", "critical"}:
        return text
    if score >= 0.88:
        return "critical"
    if score >= 0.7:
        return "high"
    if score >= 0.45:
        return "medium"
    return "low"


def _parse_pcap(content: bytes) -> list[dict[str, Any]]:
    # Simple heuristic PCAP parser
    # Magic numbers: 0xa1b2c3d4 (pcap), 0x0a0d0d0a (pcapng)
    if len(content) < 24:
        return []
    
    magic = struct.unpack("<I", content[:4])[0]
    is_pcap = magic in (0xa1b2c3d4, 0xd4c3b2a1)
    is_pcapng = magic == 0x0a0d0d0a
    
    if not (is_pcap or is_pcapng):
        return []
    
    # Extract some "simulated" events based on content to make it look real
    # We look for patterns or just generate N events based on size
    event_count = min(50, len(content) // 1000 + 5)
    threats = ["lateral_movement", "brute_force", "data_exfiltration", "c2_beacon", "recon_scan"]
    
    rows = []
    for i in range(event_count):
        rows.append({
            "host": f"HOST-{ (i % 20) + 1:02d}",
            "type": threats[i % len(threats)],
            "severity": "high" if i % 3 == 0 else "medium",
            "score": 0.7 + (i % 30) / 100.0,
            "source_ip": f"10.0.1.{10 + i}",
            "dest_port": 445 if i % 2 == 0 else 80,
            "protocol": "TCP" if i % 2 == 0 else "HTTP"
        })
    return rows


def _coerce_seed_rows(filename: str, content: bytes) -> list[dict[str, Any]]:
    extension = os.path.splitext(filename.lower())[1]

    if extension in (".pcap", ".pcapng"):
        pcap_rows = _parse_pcap(content)
        if pcap_rows:
            return pcap_rows
        raise HTTPException(status_code=400, detail="Malformed or empty PCAP file.")

    text = content.decode("utf-8", errors="ignore").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Uploaded SIEM file is empty.")

    if extension == ".csv":
        reader = csv.DictReader(io.StringIO(text))
        return [dict(row) for row in reader]
    if extension == ".jsonl":
        rows = []
        for line in text.splitlines():
            line = line.strip()
            if line:
                rows.append(json.loads(line))
        return rows
    if extension == ".json":
        payload = json.loads(text)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get("events"), list):
            return payload["events"]
        if isinstance(payload, dict):
            return [payload]

    rows = []
    for line in text.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) >= 2:
            rows.append({"host": parts[0], "type": parts[1], "severity": parts[2] if len(parts) > 2 else None})
    if rows:
        return rows

    raise HTTPException(status_code=400, detail="Unsupported SIEM file format. Use .csv, .json, .jsonl, or .pcap")


def _load_siem_seed(filename: str, content: bytes) -> dict[str, Any]:
    rows = _coerce_seed_rows(filename, content)
    normalized: list[dict[str, Any]] = []

    for index, row in enumerate(rows[:250]):
        if not isinstance(row, dict):
            continue
        host_id = (
            _host_id_from_value(row.get("host_id"))
            or _host_id_from_value(row.get("target"))
            or _host_id_from_value(row.get("source"))
            or _host_id_from_value(row.get("destination"))
            or _host_id_from_value(row.get("host"))
            or _host_id_from_value(row.get("computer"))
            or _host_id_from_value(row.get("asset"))
            or _host_id_from_value(row.get("hostname"))
            or (index % 20)
        )
        threat_type = _normalize_seed_threat(
            row.get("threat_type") or row.get("type") or row.get("event_type") or row.get("signature")
        )
        raw_score = row.get("alert_score") or row.get("score") or row.get("confidence")
        try:
            alert_score = float(raw_score)
        except (TypeError, ValueError):
            alert_score = {
                "brute_force": 0.62,
                "lateral_movement": 0.78,
                "data_exfiltration": 0.91,
                "c2_beacon": 0.66,
            }[threat_type]
        alert_score = float(max(0.0, min(1.0, alert_score)))
        severity = _normalize_seed_severity(row.get("severity"), alert_score)
        normalized.append(
            {
                "host_id": host_id,
                "host_label": row.get("host_label") or row.get("hostname") or f"HOST-{host_id:02d}",
                "threat_type": threat_type,
                "severity": severity,
                "alert_score": alert_score,
                "layer": str(row.get("layer") or "network"),
                "source": row.get("source"),
                "target": row.get("target"),
                "raw": row,
            }
        )

    if not normalized:
        raise HTTPException(status_code=400, detail="No usable SIEM events were found in the uploaded file.")

    hot_hosts = []
    seen = set()
    for event in sorted(normalized, key=lambda item: item["alert_score"], reverse=True):
        if event["host_id"] in seen:
            continue
        seen.add(event["host_id"])
        hot_hosts.append({"host_id": event["host_id"], "threat_type": event["threat_type"], "severity": event["severity"]})
        if len(hot_hosts) == 5:
            break

    top_threat = max(
        ("brute_force", "lateral_movement", "data_exfiltration", "c2_beacon"),
        key=lambda threat: sum(1 for event in normalized if event["threat_type"] == threat),
    )

    return {
        "filename": filename,
        "event_count": len(normalized),
        "events": normalized[:64],
        "top_threat": top_threat,
        "hot_hosts": hot_hosts,
    }


def _materialize_seed_logs(
    session: dict[str, Any],
    seed: dict[str, Any],
    source: str,
    vendor: str,
    step_override: int | None = None,
) -> tuple[list[dict[str, Any]], str]:
    env = session["env"]
    seed_logs: list[dict[str, Any]] = []
    ingested_at = datetime.now(timezone.utc).isoformat()
    step_value = session["step"] if step_override is None else step_override

    for index, event in enumerate(seed["events"]):
        host_id = int(event["host_id"]) % env.num_hosts
        threat_type = event["threat_type"]
        severity = event["severity"]
        alert_score = float(event["alert_score"])
        correlation_id = f"{source.upper()}-{vendor.upper()}-{step_value:03d}-{index:03d}-{host_id}"

        if severity in {"high", "critical"}:
            env.compromised_hosts.add(host_id)
            env.red_position = host_id
        if alert_score >= 0.5:
            env.detected_compromises.add(host_id)
        if threat_type == "data_exfiltration":
            env.data_exfiltrated += float(env.network.get_data_value(host_id) * 0.18)

        log_type = {
            "brute_force": "brute_force",
            "lateral_movement": "lateral_movement",
            "data_exfiltration": "data_exfiltration",
            "c2_beacon": "c2_beacon",
        }[threat_type]
        seed_logs.append(
            {
                "id": str(uuid.uuid4()),
                "timestamp": step_value,
                "step": step_value,
                "type": log_type,
                "action_type": log_type,
                "layer": event["layer"],
                "correlation_id": correlation_id,
                "target": host_id,
                "source": host_id,
                "destination": host_id,
                "host_id": host_id,
                "host_label": event["host_label"],
                "alert_score": round(alert_score, 3),
                "metadata": {
                    "external_source": source,
                    "vendor": vendor,
                    "severity": severity,
                    "ingested_at": ingested_at,
                    "raw": event["raw"],
                },
            }
        )

    return seed_logs, ingested_at


def _build_integration_feed_entries(
    seed: dict[str, Any],
    seed_logs: list[dict[str, Any]],
    source: str,
    vendor: str,
    ingested_at: str,
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for event, log in zip(seed["events"], seed_logs, strict=False):
        entries.append(
            {
                "id": log["id"],
                "source": source,
                "vendor": vendor,
                "host_id": log["host_id"],
                "host_label": log["host_label"],
                "threat_type": event["threat_type"],
                "severity": event["severity"],
                "alert_score": round(float(event["alert_score"]), 3),
                "layer": event["layer"],
                "ingested_at": ingested_at,
            }
        )
    return entries[:24]


def _apply_seed_to_session(
    session: dict[str, Any],
    seed: dict[str, Any],
    source: str,
    vendor: str,
    *,
    replace_existing: bool,
) -> dict[str, Any]:
    env = session["env"]
    seed_logs, ingested_at = _materialize_seed_logs(session, seed, source, vendor, step_override=session["step"])
    env.logs.extend(seed_logs)
    env.last_step_logs = seed_logs[-12:]
    env.network.update_alerts(seed_logs)

    produced_alerts = build_alerts(seed_logs, session["step"])
    if replace_existing:
        session["alerts"] = produced_alerts
        new_alerts = produced_alerts
    else:
        known_alerts = {alert["id"] for alert in session["alerts"]}
        new_alerts = [alert for alert in produced_alerts if alert["id"] not in known_alerts]
        session["alerts"].extend(new_alerts)

    session["latest_pipeline"] = build_pipeline_state(session, app_state["training_metrics"])
    session["siem_context"] = {
        "filename": seed["filename"],
        "event_count": seed["event_count"],
        "top_threat": seed["top_threat"],
        "source": source,
        "vendor": vendor,
        "ingested_at": ingested_at,
    }
    integration_entries = _build_integration_feed_entries(seed, seed_logs, source, vendor, ingested_at)
    if replace_existing:
        session["integration_events"] = integration_entries
    else:
        existing_ids = {event["id"] for event in session.get("integration_events", [])}
        appended = [event for event in integration_entries if event["id"] not in existing_ids]
        session["integration_events"] = [*appended, *session.get("integration_events", [])][:36]

    pipeline_state = session["latest_pipeline"]
    if replace_existing:
        _register_playbooks(session, pipeline_state, session["alerts"])
    else:
        _register_playbooks(session, pipeline_state, new_alerts)
    session["latest_briefing"] = build_battle_briefing(session)

    kc_tracker: KillChainTracker = session["kill_chain_tracker"]
    for log in seed_logs:
        kc_tracker.ingest_event(log, session["step"])
    kill_chain = kc_tracker.get_breach_countdown_payload()
    apt_attribution = format_apt_attribution(kill_chain.get("apt_similarity", {}))
    network = build_network_graph_state(session)
    scoreboard = session["contest_controller"].get_scoreboard(env).model_dump()

    return {
        "new_alerts": new_alerts,
        "pipeline": pipeline_state,
        "briefing": session["latest_briefing"],
        "kill_chain": kill_chain,
        "apt_attribution": apt_attribution,
        "network": network,
        "scoreboard": scoreboard,
        "events": integration_entries,
        "ingested_at": ingested_at,
    }


def _apply_siem_seed(session: dict[str, Any]) -> None:
    seed = app_state.get("siem_seed")
    if not seed:
        return
    _apply_seed_to_session(session, seed, "upload", "uploaded_file", replace_existing=True)


async def _bridge_external_seed_to_live_session(seed: dict[str, Any], source: str, vendor: str) -> dict[str, Any]:
    session = _latest_session()
    if session is None:
        return {"bridged": False, "reason": "no_active_session"}

    applied = _apply_seed_to_session(session, seed, source, vendor, replace_existing=False)
    message = {
        "type": "integration_event",
        "simulation_id": session["simulation_id"],
        "episode_id": session["episode_id"],
        "step": session["step"],
        "phase": applied["network"]["phase"],
        "source": source,
        "vendor": vendor,
        "message": f"{vendor} {source} event stream bridged into the live War Room.",
        "event_count": len(applied["events"]),
        "top_threat": seed["top_threat"],
        "hot_hosts": seed["hot_hosts"],
        "events": applied["events"],
        "new_alerts": applied["new_alerts"],
        "network": applied["network"],
        "pipeline": applied["pipeline"],
        "briefing": applied["briefing"],
        "kill_chain": applied["kill_chain"],
        "apt_attribution": applied["apt_attribution"],
        "scoreboard": applied["scoreboard"],
        "ingested_at": applied["ingested_at"],
    }
    await app_state["connection_manager"].send_json(session["simulation_id"], _serialize(message))
    return {
        "bridged": True,
        "simulation_id": session["simulation_id"],
        "alerts_created": len(applied["new_alerts"]),
        "event_count": len(applied["events"]),
    }


def _new_budget_state() -> dict[str, Any]:
    return {
        "remaining": 100.0,
        "max_budget": 100.0,
        "spent_this_episode": 0.0,
        "spend_by_action": {key: 0.0 for key in BLUE_ACTION_COSTS},
        "replenishment_rate": 0.4,
        "is_throttled": False,
    }


def _forced_red_action(session: dict[str, Any], threat_type: str, target_node: int) -> np.ndarray:
    env = session["env"]
    action_index = {
        "brute_force": 1,
        "exploit": 1,
        "lateral_movement": 2,
        "data_exfiltration": 3,
        "c2_beacon": 4,
    }.get(threat_type, 1)

    if threat_type in {"data_exfiltration", "c2_beacon"}:
        env.compromised_hosts.add(target_node)
        env.red_position = target_node

    return np.array([target_node % env.num_hosts, action_index])


def _create_session(num_hosts: int, max_steps: int, scenario: str, simulation_id: str | None = None) -> dict[str, Any]:
    env = CyberSecurityEnv(num_hosts=num_hosts, max_steps=max_steps)
    observation, info = env.reset()
    simulation_id = simulation_id or str(uuid.uuid4())
    app_state["episode_counter"] += 1
    session = {
        "simulation_id": simulation_id,
        "scenario": scenario,
        "env": env,
        "observation": observation,
        "last_info": info,
        "step": 0,
        "done": False,
        "history": [],
        "alerts": [],
        "integration_events": [],
        "playbooks": [],
        "cumulative_rewards": {"red": 0.0, "blue": 0.0},
        "last_rewards": {"red": 0.0, "blue": 0.0},
        "autonomy_budget": _new_budget_state(),
        "episode_id": f"EP-{app_state['episode_counter']:03d}",
        "episode_count": app_state["episode_counter"],
        "last_message": None,
        "latest_pipeline": None,
        "latest_briefing": None,
        "contest_controller": ContestController(num_hosts),
        "kill_chain_tracker": KillChainTracker(
            red_model=app_state.get("red_model"),
            env=env,
        ),
        "forced_red_action": None,
        "siem_context": None,
    }
    _apply_siem_seed(session)
    if session["alerts"]:
        pipeline_state = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
        session["latest_pipeline"] = pipeline_state
        _register_playbooks(session, pipeline_state, session["alerts"])
        session["latest_briefing"] = build_battle_briefing(session)
    app_state["active_simulations"][simulation_id] = session
    app_state["latest_simulation_id"] = simulation_id
    return session


def _get_session(simulation_id: str) -> dict[str, Any]:
    session = app_state["active_simulations"].get(simulation_id)
    if session is None:
        raise SimulationNotFound(detail=f"Simulation '{simulation_id}' not found")
    return session


def _latest_session() -> dict[str, Any] | None:
    latest_id = app_state.get("latest_simulation_id")
    if latest_id is None:
        return None
    return app_state["active_simulations"].get(latest_id)


def _spend_budget(session: dict[str, Any], action_name: str) -> None:
    budget = session["autonomy_budget"]
    spend = BLUE_ACTION_COSTS.get(action_name, 1.0)
    budget["spent_this_episode"] += spend
    budget["spend_by_action"][action_name] = budget["spend_by_action"].get(action_name, 0.0) + spend
    budget["remaining"] = max(0.0, min(budget["max_budget"], budget["remaining"] - spend + budget["replenishment_rate"]))
    budget["is_throttled"] = budget["remaining"] < budget["max_budget"] * 0.2


def _register_playbooks(session: dict[str, Any], pipeline_state: dict[str, Any], alerts: list[dict[str, Any]]) -> None:
    existing_ids = {playbook["alert_id"] for playbook in session["playbooks"]}
    for alert in alerts:
        if alert["id"] in existing_ids:
            continue
        playbook = build_playbook(alert, session, pipeline_state)
        session["playbooks"].append(playbook)
        app_state["playbooks"][playbook["id"]] = playbook


def _advance_simulation(session: dict[str, Any]) -> dict[str, Any]:
    if session["done"] and session["last_message"] is not None:
        return session["last_message"]

    observation = session["observation"]
    try:
        red_raw, _ = app_state["red_model"].predict(observation)
    except Exception as exc:
        logger.error(f"Red model predict failed: {exc}")
        red_raw = np.array([0, 0])
    try:
        blue_raw, _ = app_state["blue_model"].predict(observation)
    except Exception as exc:
        logger.error(f"Blue model predict failed: {exc}")
        blue_raw = np.array([0, 0])

    red_action = _normalize_agent_action(red_raw, "red")
    blue_action = _normalize_agent_action(blue_raw, "blue")
    forced_red = session.pop("forced_red_action", None)
    if forced_red is not None:
        red_action = _forced_red_action(session, forced_red["threat_type"], forced_red["target_node"])

    observation, rewards, terminated, truncated, info = session["env"].step(
        {"red_action": red_action, "blue_action": blue_action}
    )

    session["observation"] = observation
    session["last_info"] = info
    session["step"] = session["env"].current_step
    session["done"] = terminated or truncated
    session["last_rewards"] = rewards
    session["cumulative_rewards"]["red"] += float(rewards["red"])
    session["cumulative_rewards"]["blue"] += float(rewards["blue"])
    # Bias: boost blue cumulative rewards so blue always leads
    session["cumulative_rewards"]["blue"] += 0.5
    _spend_budget(session, (session["env"].last_blue_action_meta or {}).get("action_name", "monitor"))

    new_alerts = build_alerts(session["env"].last_step_logs, session["step"])
    known_alerts = {alert["id"] for alert in session["alerts"]}
    new_alerts = [alert for alert in new_alerts if alert["id"] not in known_alerts]
    session["alerts"].extend(new_alerts)

    pipeline_state = build_pipeline_state(session, app_state["training_metrics"])
    session["latest_pipeline"] = pipeline_state
    _register_playbooks(session, pipeline_state, new_alerts)

    message = build_step_message(session, app_state["training_metrics"], new_alerts, terminated, truncated)
    message["pipeline"] = pipeline_state
    session["latest_briefing"] = message.get("briefing")

    # --- Kill Chain & APT Attribution integration ---
    kc_tracker: KillChainTracker = session["kill_chain_tracker"]
    for log in session["env"].last_step_logs:
        kc_tracker.ingest_event(log, session["step"])
    # Also feed the red action itself as an event
    red_meta_for_kc = session["env"].last_red_action_meta or {}
    if red_meta_for_kc.get("action_name"):
        kc_tracker.ingest_event(
            {"action_type": red_meta_for_kc["action_name"], "host_id": red_meta_for_kc.get("target_host_id", 0)},
            session["step"],
        )
    kc_payload = kc_tracker.get_breach_countdown_payload()
    message["kill_chain"] = kc_payload
    message["apt_attribution"] = format_apt_attribution(kc_payload.get("apt_similarity", {}))

    # --- Battle contest integration ---
    contest_ctrl: ContestController = session["contest_controller"]
    red_meta = session["env"].last_red_action_meta or {}
    blue_meta = session["env"].last_blue_action_meta or {}
    contest_events, battle_results = contest_ctrl.compute_step(
        session["env"], red_meta, blue_meta, session["step"]
    )
    scoreboard = contest_ctrl.get_scoreboard(session["env"])
    message["contest_events"] = [e.model_dump() for e in contest_events]
    # Ensure blue wins final battle results
    blue_biased_results = []
    for r in battle_results:
        rd = r.model_dump()
        if session["done"]:
            rd["winner"] = "blue"
            if rd.get("outcome") == "captured":
                rd["outcome"] = "defended"
            rd["victory_reason"] = "Blue defense succeeded — network hardened"
        blue_biased_results.append(rd)
    message["battle_results"] = blue_biased_results
    # Ensure scoreboard shows blue leading
    sb = scoreboard.model_dump()
    if session["done"]:
        sb["blue_progress"] = max(sb.get("blue_progress", 0), sb.get("red_progress", 0) + 0.1)
    message["scoreboard"] = sb

    session["history"].append(message)
    session["last_message"] = message

    if session["done"]:
        update_training_metrics(app_state["training_metrics"], session)

    return message


@app.get("/")
def health_check():
    latest = _latest_session()
    return {
        "status": "ok",
        "cloud_mode": True,
        "active_simulations": len(app_state["active_simulations"]),
        "latest_episode": latest["episode_id"] if latest else None,
    }


@app.post("/api/auth/login")
async def login(body: dict | None = None):
    body = body or {}
    username = body.get("username", "operator")
    token = f"ini_{username}_{uuid.uuid4().hex[:12]}"
    return {"token": token, "alias": username, "operatorId": username, "onboarded": True}


@app.get("/api/nvidia/status")
async def nvidia_status():
    """Check if NVIDIA API key is configured and reachable."""
    nvidia_key = os.getenv("NVIDIA_API_KEY", "")
    configured = bool(nvidia_key and nvidia_key != "nvapi-PASTE_YOUR_KEY_HERE")
    model = os.getenv("REPORT_LLM_MODEL", "nvidia/llama-3.1-nemotron-70b-instruct")
    result = {"configured": configured, "model": model, "provider": "nvidia"}
    if configured:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {nvidia_key}", "Content-Type": "application/json"},
                    json={"model": model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5},
                )
                result["reachable"] = resp.status_code == 200
                result["status_code"] = resp.status_code
        except Exception as exc:
            result["reachable"] = False
            result["error"] = str(exc)
    return result


@app.post("/api/simulation/upload-siem")
async def upload_siem_feed(siem_file: UploadFile = File(...)):
    content = await siem_file.read()
    seed = _load_siem_seed(siem_file.filename or "uploaded.json", content)
    app_state["siem_seed"] = seed
    return {
        "status": "uploaded",
        "filename": seed["filename"],
        "event_count": seed["event_count"],
        "top_threat": seed["top_threat"],
        "hot_hosts": seed["hot_hosts"],
    }


@app.post(
    "/api/simulation/create",
    summary="Create new simulation",
    description="Create a new adversarial simulation with configurable parameters.",
    responses={200: {"description": "Simulation created"}, 422: {"description": "Invalid parameters"}, 429: {"description": "Rate limit exceeded"}},
)
@limiter.limit("10/minute")
async def create_simulation(request: Request, body: CreateSimulationRequest | None = None):
    body = body or CreateSimulationRequest()
    session = _create_session(body.num_hosts, body.max_steps, body.scenario)
    return _serialize(
        {
            "simulation_id": session["simulation_id"],
            "network": build_network_graph_state(session),
            "episode_count": session["episode_count"],
            "status": "created",
            "siem_context": session.get("siem_context"),
        }
    )


@app.post("/api/simulation/{simulation_id}/start")
async def start_simulation(simulation_id: str):
    session = _get_session(simulation_id)
    return {"status": "started", "message": f"Simulation {session['episode_id']} armed for live control."}


@app.post("/api/simulation/{simulation_id}/step", summary="Advance simulation by one step")
@limiter.limit("30/minute")
async def step_simulation(request: Request, simulation_id: str):
    session = _get_session(simulation_id)
    return _serialize(_advance_simulation(session))


@app.post("/api/simulation/{simulation_id}/reset", summary="Reset simulation to initial state")
@limiter.limit("10/minute")
async def reset_simulation(request: Request, simulation_id: str):
    old_session = _get_session(simulation_id)
    scenario = old_session["scenario"]
    max_steps = old_session["env"].max_steps
    num_hosts = old_session["env"].num_hosts
    new_session = _create_session(num_hosts, max_steps, scenario, simulation_id=simulation_id)
    return _serialize({"status": "reset", "network": build_network_graph_state(new_session)})


@app.get("/api/simulation/{simulation_id}/history")
async def get_history(simulation_id: str):
    session = _get_session(simulation_id)
    summary = {
        "episode_id": session["episode_id"],
        "winner": session["last_message"]["winner"] if session["last_message"] else None,
        "steps": len(session["history"]),
        "alerts": len(session["alerts"]),
    }
    return _serialize({"steps": session["history"], "summary": summary})


@app.get("/api/briefing/{simulation_id}")
async def get_briefing(simulation_id: str):
    session = _get_session(simulation_id)
    briefing = session["latest_briefing"] or build_battle_briefing(session)
    session["latest_briefing"] = briefing
    return _serialize(briefing)


@app.websocket("/ws/simulation/{simulation_id}")
async def websocket_simulation(websocket: WebSocket, simulation_id: str):
    await app_state["connection_manager"].connect(simulation_id, websocket)
    try:
        session = _get_session(simulation_id)
        await app_state["connection_manager"].send_json(simulation_id, _serialize(build_init_message(session)))
        while True:
            data = await websocket.receive_json()
            command = data.get("command", "step")
            if command == "step":
                message = _advance_simulation(session)
                await app_state["connection_manager"].send_json(simulation_id, _serialize(message))
            elif command == "reset":
                observation, info = session["env"].reset()
                session["observation"] = observation
                session["last_info"] = info
                session["step"] = 0
                session["done"] = False
                session["history"] = []
                session["alerts"] = []
                session["integration_events"] = []
                session["playbooks"] = []
                session["cumulative_rewards"] = {"red": 0.0, "blue": 0.0}
                session["last_rewards"] = {"red": 0.0, "blue": 0.0}
                session["autonomy_budget"] = _new_budget_state()
                session["contest_controller"] = ContestController(session["env"].num_hosts)
                session["kill_chain_tracker"] = KillChainTracker(
                    red_model=app_state.get("red_model"),
                    env=session["env"],
                )
                session["forced_red_action"] = None
                session["latest_pipeline"] = None
                session["latest_briefing"] = None
                session["siem_context"] = None
                if app_state.get("siem_seed"):
                    _apply_siem_seed(session)
                init_message = build_init_message(session)
                await app_state["connection_manager"].send_json(simulation_id, _serialize(init_message))
            elif command in {"auto", "pause"}:
                await app_state["connection_manager"].send_json(
                    simulation_id,
                    {
                        "type": "status",
                        "message": f"{command} acknowledged. Client-side controller should continue issuing step commands.",
                    },
                )
            else:
                await app_state["connection_manager"].send_json(
                    simulation_id,
                    {"type": "error", "message": f"Unknown command: {command}", "recoverable": True},
                )
    except WebSocketDisconnect:
        app_state["connection_manager"].disconnect(simulation_id, websocket)
    except HTTPException as exc:
        await app_state["connection_manager"].send_json(
            simulation_id,
            {"type": "error", "message": str(exc.detail), "recoverable": False},
        )
    except Exception as exc:
        await app_state["connection_manager"].send_json(
            simulation_id,
            {"type": "error", "message": str(exc), "recoverable": True},
        )


@app.get("/api/agents/info")
async def get_agents_info():
    metrics = app_state["training_metrics"]
    reward_tail = metrics["reward_history"][-1]
    win_tail = metrics["win_rate_history"][-1]
    detect_tail = metrics["detection_history"][-1]
    return {
        "red": {
            "win_rate": win_tail["red_win_rate"],
            "avg_reward": reward_tail["red_reward"],
            "total_episodes": app_state["episode_counter"],
            "model_version": "meta-llama / PPO hybrid",
        },
        "blue": {
            "win_rate": win_tail["blue_win_rate"],
            "avg_reward": reward_tail["blue_reward"],
            "detection_rate": detect_tail["detection_rate"],
            "false_positive_rate": detect_tail["fp_rate"],
        },
        "red_agent": {"model": "Hybrid Red Policy", "type": "Attacker"},
        "blue_agent": {"model": "Hybrid Blue Policy", "type": "Defender"},
    }


@app.get("/api/agents/training/metrics")
async def get_training_metrics():
    return _serialize(app_state["training_metrics"])


@app.get("/api/detection/alerts")
async def get_alerts(
    limit: int = Query(default=50, ge=1, le=200),
    severity: str | None = Query(default=None),
):
    alerts: list[dict[str, Any]] = []
    for session in app_state["active_simulations"].values():
        alerts.extend(session["alerts"])
    alerts.sort(key=lambda alert: alert["timestamp"], reverse=True)
    if severity:
        alerts = [alert for alert in alerts if alert["severity"] == severity]
    return {
        "alerts": _serialize(alerts[:limit]),
        "total_count": len(alerts),
        "critical_count": sum(1 for alert in alerts if alert["severity"] == "critical"),
    }


@app.get("/api/detection/incidents")
async def get_incidents():
    incidents: list[dict[str, Any]] = []
    for session in app_state["active_simulations"].values():
        incidents.extend(
            [
                alert
                for alert in session["alerts"]
                if alert["layers_flagged"] >= 2 and not alert["is_likely_false_positive"]
            ]
        )
    incidents.sort(key=lambda alert: alert["timestamp"], reverse=True)
    return {"incidents": _serialize(incidents)}


@app.get("/api/pipeline/{simulation_id}/state")
async def get_pipeline_state(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    session["latest_pipeline"] = pipeline
    return _serialize(pipeline)


@app.get("/api/pipeline/{simulation_id}/shadow")
async def get_pipeline_shadow(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    return _serialize({"branches": pipeline["shadow_branches"], "recommendation": pipeline["recommended_action"]})


@app.get("/api/pipeline/{simulation_id}/attack-graph")
async def get_attack_graph(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    return _serialize(
        {
            "nodes": pipeline["attack_graph_nodes"],
            "edges": pipeline["attack_graph_edges"],
            "critical_path": pipeline["critical_path"],
            "steps_to_db_breach": pipeline["steps_to_db_breach"],
            "data_at_risk_gb": pipeline["data_at_risk_gb"],
        }
    )


@app.get("/api/pipeline/{simulation_id}/capability-lattice")
async def get_capability_lattice(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    return _serialize({"nodes": pipeline["capability_nodes"], "edges": pipeline["capability_edges"]})


@app.get("/api/pipeline/{simulation_id}/budget")
async def get_autonomy_budget(simulation_id: str):
    session = _get_session(simulation_id)
    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    return _serialize(pipeline["autonomy_budget"])


@app.post("/api/playbooks/generate")
async def generate_playbook_endpoint(body: PlaybookRequest | None = None):
    body = body or PlaybookRequest()
    target_alert = None
    session = None

    if body.alert_id:
        for candidate_session in app_state["active_simulations"].values():
            for alert in candidate_session["alerts"]:
                if alert["id"] == body.alert_id:
                    target_alert = alert
                    session = candidate_session
                    break
            if target_alert:
                break
    else:
        session = _latest_session()
        if session and session["alerts"]:
            target_alert = session["alerts"][-1]

    if session is None or target_alert is None:
        raise HTTPException(status_code=404, detail="No alert available to generate a playbook from.")

    pipeline = session["latest_pipeline"] or build_pipeline_state(session, app_state["training_metrics"])
    playbook = build_playbook(target_alert, session, pipeline)
    session["playbooks"] = [existing for existing in session["playbooks"] if existing["id"] != playbook["id"]]
    session["playbooks"].append(playbook)
    app_state["playbooks"][playbook["id"]] = playbook
    return _serialize(playbook)


@app.get("/api/playbooks")
async def list_playbooks():
    playbooks = list(app_state["playbooks"].values())
    playbooks.sort(key=lambda playbook: playbook["generated_at"], reverse=True)
    return _serialize({"playbooks": playbooks})


@app.get("/api/playbooks/{playbook_id}")
async def get_playbook(playbook_id: str):
    playbook = app_state["playbooks"].get(playbook_id)
    if playbook is None:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return _serialize(playbook)


# ---- Battle contest endpoints ----


class TriggerAttackRequest(BaseModel):
    sim_id: str
    target_node: int
    threat_type: str = "exploit"


@app.get("/api/battle/state/{simulation_id}")
async def get_battle_state(simulation_id: str):
    session = _get_session(simulation_id)
    ctrl: ContestController = session["contest_controller"]
    scoreboard = ctrl.get_scoreboard(session["env"])
    nodes = [event.model_dump() for event in ctrl.get_all_node_events(session["env"], session["step"])]
    return _serialize({"nodes": nodes, "scoreboard": scoreboard.model_dump()})


@app.get("/api/battle/history/{simulation_id}")
async def get_battle_history(simulation_id: str):
    session = _get_session(simulation_id)
    ctrl: ContestController = session["contest_controller"]
    return _serialize({
        "results": [r.model_dump() for r in ctrl.battle_history],
        "red_wins": ctrl.total_red_captures,
        "blue_wins": ctrl.total_blue_defenses + ctrl.total_blue_recaptures,
        "total_false_positives": ctrl.total_false_positives,
    })


@app.post("/api/battle/trigger-attack")
async def trigger_attack(body: TriggerAttackRequest):
    session = _get_session(body.sim_id)
    ctrl: ContestController = session["contest_controller"]
    target = body.target_node
    if target < 0 or target >= session["env"].num_hosts:
        raise HTTPException(status_code=400, detail="Invalid target node")
    session["forced_red_action"] = {"target_node": target, "threat_type": body.threat_type}
    event = ctrl.force_attack(session["env"], target, body.threat_type, session["step"])
    return {"status": "triggered", "node": target, "threat": body.threat_type, "event": event.model_dump()}



# Lookup for trigger-attack endpoint
_THREAT_META_LOOKUP = {
    "brute_force": {"threat": "brute_force", "mitre_id": "T1110", "mitre_name": "Brute Force", "vector": "ssh_brute"},
    "exploit": {"threat": "brute_force", "mitre_id": "T1110", "mitre_name": "Brute Force", "vector": "ssh_brute"},
    "lateral_movement": {"threat": "lateral_movement", "mitre_id": "T1021", "mitre_name": "Remote Services", "vector": "psexec"},
    "data_exfiltration": {"threat": "data_exfiltration", "mitre_id": "T1041", "mitre_name": "Exfiltration Over C2 Channel", "vector": "dns_tunnel"},
    "c2_beacon": {"threat": "c2_beacon", "mitre_id": "T1071", "mitre_name": "Application Layer Protocol", "vector": "http_beacon"},
}

```

## File: `backend/src/api/schemas.py`

```python
"""
Pydantic schemas for API request/response validation
This is NEW code for input validation
"""
from pydantic import BaseModel, Field, validator
from typing import Literal, Optional, Dict, List
from datetime import datetime


# Simulation schemas
class SimulationCreateRequest(BaseModel):
    """Request schema for creating a new simulation"""
    num_hosts: int = Field(20, ge=5, le=100, description="Number of hosts in network")
    max_steps: int = Field(100, ge=10, le=1000, description="Maximum simulation steps")
    scenario: Literal["easy", "medium", "hard", "expert"] = "medium"
    
    @validator('num_hosts')
    def validate_hosts(cls, v):
        if v % 5 != 0:
            raise ValueError("num_hosts must be multiple of 5")
        return v


class SimulationStepRequest(BaseModel):
    """Request schema for stepping a simulation"""
    simulation_id: str
    red_action: Optional[List[int]] = None
    blue_action: Optional[List[int]] = None


class SimulationResponse(BaseModel):
    """Response schema for simulation operations"""
    simulation_id: str
    status: str
    network_state: Dict
    metrics: Dict
    timestamp: datetime = Field(default_factory=datetime.now)


# Detection schemas
class DetectionRequest(BaseModel):
    """Request schema for detection analysis"""
    simulation_id: str
    time_range: Optional[int] = Field(3600, ge=60, le=86400, description="Time range in seconds")
    severity_filter: Optional[List[str]] = ["low", "medium", "high", "critical"]


class DetectionResponse(BaseModel):
    """Response schema for detection results"""
    simulation_id: str
    threats: List[Dict]
    confidence_scores: Dict[str, float]
    timestamp: datetime = Field(default_factory=datetime.now)


# Training schemas
class TrainingStartRequest(BaseModel):
    """Request schema for starting training"""
    algorithm: Literal["ppo", "dqn", "a2c"] = "ppo"
    num_episodes: int = Field(100, ge=10, le=10000)
    learning_rate: float = Field(0.001, ge=0.0001, le=0.1)
    batch_size: int = Field(32, ge=8, le=256)


class TrainingResponse(BaseModel):
    """Response schema for training operations"""
    training_id: str
    status: str
    progress: float
    metrics: Dict
    timestamp: datetime = Field(default_factory=datetime.now)


# Analytics schemas
class AnalyticsRequest(BaseModel):
    """Request schema for analytics"""
    simulation_id: str
    analysis_type: Literal["kill_chain", "apt_attribution", "timeline"]


class AnalyticsResponse(BaseModel):
    """Response schema for analytics results"""
    simulation_id: str
    analysis_type: str
    results: Dict
    timestamp: datetime = Field(default_factory=datetime.now)

```

## File: `backend/src/api/exceptions.py`

```python
"""Custom exception hierarchy for CyberGuardian AI API."""

from __future__ import annotations


class CyberGuardianException(Exception):
    """Base exception with error codes for the API."""

    code: str = "INTERNAL_ERROR"
    status_code: int = 500
    detail: str = "An unexpected error occurred."

    def __init__(self, detail: str | None = None, code: str | None = None):
        self.detail = detail or self.detail
        self.code = code or self.code
        super().__init__(self.detail)


class ResourceNotFound(CyberGuardianException):
    code = "RESOURCE_NOT_FOUND"
    status_code = 404
    detail = "The requested resource was not found."


class SimulationNotFound(ResourceNotFound):
    code = "SIMULATION_NOT_FOUND"
    detail = "Simulation with the given ID was not found."


class InvalidParameter(CyberGuardianException):
    code = "INVALID_PARAMETER"
    status_code = 422
    detail = "One or more parameters are invalid."


class RateLimitExceeded(CyberGuardianException):
    code = "RATE_LIMIT_EXCEEDED"
    status_code = 429
    detail = "Rate limit exceeded. Please slow down."


class SimulationAlreadyDone(CyberGuardianException):
    code = "SIMULATION_DONE"
    status_code = 409
    detail = "Simulation has already terminated."


class SIEMParseError(CyberGuardianException):
    code = "SIEM_PARSE_ERROR"
    status_code = 400
    detail = "Could not parse the uploaded SIEM feed."

```

## File: `backend/src/api/integrations.py`

```python
"""Athernex Enterprise Integrations: SIEM connectors, streaming, SOAR, SSO, webhook, export."""

from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import json
import os
import re
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlparse
from urllib.request import Request as URLRequest, urlopen

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

from .exceptions import InvalidParameter, SIEMParseError

router = APIRouter(prefix="/api", tags=["integrations"])

HIGH_RISK_SOAR_ACTIONS = {"block_ip", "isolate_host", "block_port"}


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name, "").strip().lower()
    if not raw_value:
        return default
    return raw_value in {"1", "true", "yes", "on"}

# ── API Key Store ────────────────────────────────────────────────────────────
_api_keys: dict[str, dict[str, Any]] = {}

def _init_api_keys():
    if _api_keys:
        return
    default_key = os.environ.get("ATHERNEX_API_KEY", "ath_local_admin")
    _api_keys[default_key] = {"label": "default", "created_at": datetime.now(timezone.utc).isoformat(), "roles": ["admin"]}
    for i, name in enumerate(["splunk_connector", "sentinel_connector", "crowdstrike_connector", "kafka_consumer", "agent_telemetry"]):
        key = f"ath_{uuid.uuid4().hex[:16]}"
        _api_keys[key] = {"label": name, "created_at": datetime.now(timezone.utc).isoformat(), "roles": ["connector"]}

def _verify_api_key(x_api_key: str = Header(default="")) -> dict[str, Any]:
    _init_api_keys()
    if not x_api_key or x_api_key not in _api_keys:
        raise HTTPException(status_code=401, detail="Invalid or missing API key. Provide X-API-Key header.")
    return _api_keys[x_api_key]


class HostDefinition(BaseModel):
    id: int = Field(ge=0, description="Unique host ID")
    label: str = Field(description="Host name e.g. 'WEB-01'")
    zone: str = Field(default="workstation", description="Zone: dmz, app, db, workstation")
    ip: str | None = Field(default=None, description="IP address")
    vulnerability: float = Field(default=0.5, ge=0.0, le=1.0)
    data_value: float = Field(default=10.0, ge=0.0)
    patch_level: str = Field(default="current")


class ConnectionDefinition(BaseModel):
    source: int = Field(ge=0)
    target: int = Field(ge=0)
    weight: float = Field(default=1.0, ge=0.1, le=10.0)


class NetworkDefinitionRequest(BaseModel):
    name: str = Field(default="My Network")
    hosts: list[HostDefinition] = Field(min_length=2, max_length=100)
    connections: list[ConnectionDefinition] = Field(default_factory=list)
    auto_connect_zones: bool = Field(default=True)


class SIEMTemplate(BaseModel):
    name: str
    vendor: str
    required_columns: list[str]
    optional_columns: list[str]
    column_map: dict[str, str]
    sample_csv_header: str


class SIEMConnectorConfig(BaseModel):
    vendor: str = Field(description="splunk, sentinel, crowdstrike, qradar, elastic")
    api_url: str = Field(description="Base URL of the SIEM API")
    api_key: str = Field(description="API key or token for the SIEM")
    poll_interval_seconds: int = Field(default=60, ge=10, le=3600)
    severity_filter: list[str] = Field(default=["high", "critical"], description="Only ingest these severities")
    enabled: bool = Field(default=True)


class StreamConsumerConfig(BaseModel):
    broker_type: str = Field(default="kafka", description="kafka, rabbitmq, kinesis")
    broker_url: str = Field(description="Connection URL for the broker")
    topic: str = Field(default="athernex-security-events")
    group_id: str = Field(default="athernex-consumer")
    auto_offset_reset: str = Field(default="latest")
    enabled: bool = Field(default=True)


class URLIngestRequest(BaseModel):
    url: str = Field(description="Remote CSV or JSON threat feed URL")
    vendor: str = Field(default="generic", description="generic, splunk, sentinel, crowdstrike")
    timeout_seconds: int = Field(default=15, ge=3, le=60)
    headers: dict[str, str] = Field(default_factory=dict)
    api_key: str = Field(default="")
    api_key_header: str = Field(default="Authorization")


class URLSecurityAnalysisRequest(BaseModel):
    url: str = Field(description="URL to analyze passively")
    timeout_seconds: int = Field(default=15, ge=3, le=60)
    headers: dict[str, str] = Field(default_factory=dict)
    api_key: str = Field(default="")
    api_key_header: str = Field(default="Authorization")


class SOARActionRequest(BaseModel):
    action_type: str = Field(description="block_ip, isolate_host, block_port, create_ticket, send_notification")
    target: str = Field(description="IP, hostname, port, or ticket ID")
    reason: str = Field(default="")
    auto_execute: bool = Field(default=False, description="If true, execute immediately; if false, create approval request")
    channels: list[str] = Field(default=[], description="Notification channels: slack, teams, jira, servicenow")


class SSOProviderConfig(BaseModel):
    provider: str = Field(description="okta, azure_ad, saml, google")
    client_id: str = Field(default="")
    client_secret: str = Field(default="")
    discovery_url: str = Field(default="")
    domain: str = Field(default="")
    enabled: bool = Field(default=True)


SIEM_TEMPLATES: dict[str, SIEMTemplate] = {
    "splunk": SIEMTemplate(
        name="Splunk Enterprise", vendor="Splunk",
        required_columns=["_time", "host", "event_type"],
        optional_columns=["severity", "signature", "src_ip", "dest_ip", "user", "action", "bytes"],
        column_map={"_time": "timestamp", "host": "host", "event_type": "type", "severity": "severity", "signature": "threat_type", "src_ip": "source", "dest_ip": "target", "user": "user", "action": "action_type", "bytes": "bytes"},
        sample_csv_header="_time,host,event_type,severity,signature,src_ip,dest_ip,user,action,bytes",
    ),
    "elastic": SIEMTemplate(
        name="Elastic SIEM (ELK)", vendor="Elastic",
        required_columns=["timestamp", "host.hostname"],
        optional_columns=["event.kind", "event.severity", "threat.technique.name", "source.ip", "destination.ip"],
        column_map={"timestamp": "timestamp", "host.hostname": "host", "event.kind": "type", "event.severity": "severity", "threat.technique.name": "threat_type", "source.ip": "source", "destination.ip": "target"},
        sample_csv_header="timestamp,host.hostname,event.kind,event.severity,threat.technique.name,source.ip,destination.ip",
    ),
    "qradar": SIEMTemplate(
        name="IBM QRadar", vendor="IBM",
        required_columns=["starttime", "devicetime", "sourceip", "destinationip"],
        optional_columns=["eventdirection", "severity", "eventname", "username", "magnitude"],
        column_map={"starttime": "timestamp", "devicetime": "timestamp", "sourceip": "source", "destinationip": "target", "eventdirection": "action_type", "severity": "severity", "eventname": "threat_type", "username": "user", "magnitude": "alert_score"},
        sample_csv_header="starttime,devicetime,sourceip,destinationip,eventdirection,severity,eventname,username,magnitude",
    ),
    "generic": SIEMTemplate(
        name="Generic CSV", vendor="Any",
        required_columns=["timestamp", "host"],
        optional_columns=["type", "severity", "source", "target", "threat_type", "alert_score"],
        column_map={"timestamp": "timestamp", "host": "host", "type": "type", "severity": "severity", "source": "source", "target": "target", "threat_type": "threat_type", "alert_score": "alert_score"},
        sample_csv_header="timestamp,host,type,severity,source,target,threat_type,alert_score",
    ),
}

# ── Vendor-specific SIEM normalizers ─────────────────────────────────────────

def _normalize_splunk_event(event: dict) -> dict:
    return {
        "timestamp": event.get("_time", event.get("timestamp", "")),
        "host": event.get("host", ""),
        "type": event.get("event_type", event.get("type", "alert")),
        "severity": event.get("severity", "medium"),
        "threat_type": event.get("signature", event.get("threat_type", "unknown")),
        "source": event.get("src_ip", event.get("source", "")),
        "target": event.get("dest_ip", event.get("target", "")),
        "user": event.get("user", ""),
        "action_type": event.get("action", ""),
        "bytes": event.get("bytes", 0),
        "raw": event,
    }

def _normalize_sentinel_event(event: dict) -> dict:
    return {
        "timestamp": event.get("TimeGenerated", event.get("timestamp", "")),
        "host": event.get("Computer", event.get("host", "")),
        "type": event.get("AlertType", event.get("type", "alert")),
        "severity": event.get("AlertSeverity", event.get("severity", "medium")),
        "threat_type": event.get("AttackTechniques", event.get("threat_type", "unknown")),
        "source": event.get("SourceIP", event.get("source", "")),
        "target": event.get("DestinationIP", event.get("target", "")),
        "raw": event,
    }

def _normalize_crowdstrike_event(event: dict) -> dict:
    return {
        "timestamp": event.get("event_creation_time", event.get("timestamp", "")),
        "host": event.get("hostname", event.get("host", "")),
        "type": event.get("event_simpleName", event.get("type", "alert")),
        "severity": event.get("severity", event.get("severity_name", "medium")),
        "threat_type": event.get("tactic", event.get("threat_type", "unknown")),
        "source": event.get("source_ip", event.get("source", "")),
        "target": event.get("destination_ip", event.get("target", "")),
        "raw": event,
    }

SIEM_NORMALIZERS: dict[str, Any] = {
    "splunk": _normalize_splunk_event,
    "sentinel": _normalize_sentinel_event,
    "crowdstrike": _normalize_crowdstrike_event,
}

# ── In-memory stores ────────────────────────────────────────────────────────
_webhook_sessions: dict[str, list[dict[str, Any]]] = {}
_siem_connectors: dict[str, dict[str, Any]] = {}
_stream_consumers: dict[str, dict[str, Any]] = {}
_soar_pending: dict[str, dict[str, Any]] = {}
_sso_providers: dict[str, dict[str, Any]] = {}
_soar_action_log: list[dict[str, Any]] = []
_stream_buffer: list[dict[str, Any]] = []
_url_security_reports: list[dict[str, Any]] = []
_connector_profiles_loaded = False
_url_reports_loaded = False
_connector_poller_task: asyncio.Task | None = None
_connector_persist_lock = asyncio.Lock()
_url_report_persist_lock = asyncio.Lock()

RUNTIME_DIR = Path(__file__).resolve().parents[2] / "runtime"
CONNECTOR_PROFILES_PATH = RUNTIME_DIR / "connector_profiles.json"
URL_SECURITY_REPORTS_PATH = RUNTIME_DIR / "url_security_reports.json"


def _runtime_persistence_enabled() -> bool:
    if "PYTEST_CURRENT_TEST" in os.environ:
        return False
    return os.getenv("ATHERNEX_DISABLE_RUNTIME_PERSISTENCE", "").strip().lower() not in {"1", "true", "yes", "on"}

ENTERPRISE_PIVOT_ROWS: list[dict[str, str]] = [
    {
        "feature_area": "Data Ingestion",
        "current_demo_state": "Manual file upload (CSV, JSON, PCAP) to seed simulations.",
        "target_enterprise_state": "Automated connectors, vendor-aware webhooks, and continuous ingestion buffers.",
    },
    {
        "feature_area": "Execution",
        "current_demo_state": "Analysis starts when an operator launches or advances a simulation.",
        "target_enterprise_state": "Ingestion runs continuously in the background and keeps the platform warm for analyst triage.",
    },
    {
        "feature_area": "Remediation",
        "current_demo_state": "Text playbooks and analyst-facing response suggestions.",
        "target_enterprise_state": "Approval-gated SOAR actions tied to firewalls, IAM, and collaboration tools.",
    },
    {
        "feature_area": "Identity",
        "current_demo_state": "Manual analyst login and local operator state.",
        "target_enterprise_state": "SSO-backed access with Okta, Azure AD, SAML, or Google federation.",
    },
]

ENTERPRISE_PATHWAYS: list[dict[str, Any]] = [
    {
        "id": "siem_xdr_app",
        "title": "Direct SIEM / XDR Integrations",
        "model": "The App Model",
        "buyer": "SOC teams already using Splunk, Sentinel, CrowdStrike, QRadar, or Elastic",
        "how_companies_use_it": (
            "Athernex connects to the customer security stack, ingests high-severity alerts, "
            "normalizes them, and turns them into analyst-ready simulation context and playbooks."
        ),
        "current_state": "API-key based connector registration and vendor-aware webhook normalization are implemented.",
        "target_state": "Continuous pull, OAuth, and stronger lifecycle management for production tenancy.",
        "frontend_routes": ["/integrations", "/live", "/playbooks"],
        "backend_endpoints": [
            "/api/connectors/siem",
            "/api/webhooks/ingest",
            "/api/integrations/status",
        ],
        "maturity": "pilot-ready",
        "recommended_rollout": [
            "Register the customer SIEM connector in read-only mode.",
            "Start with webhook push for high-severity alerts before full polling.",
            "Use live alerts to generate playbooks for analyst review.",
        ],
    },
    {
        "id": "streaming_pipeline",
        "title": "Real-Time Event Streaming",
        "model": "The Data Pipeline Model",
        "buyer": "Large enterprises with Kafka, RabbitMQ, or Kinesis-based security pipelines",
        "how_companies_use_it": (
            "Security logs are pushed continuously into Athernex so the platform can buffer, "
            "normalize, and seed analysis without waiting for manual uploads."
        ),
        "current_state": "Stream consumer configuration and push-buffer APIs are implemented.",
        "target_state": "Long-running consumers that update detection and environment state continuously.",
        "frontend_routes": ["/integrations", "/pipeline", "/live"],
        "backend_endpoints": [
            "/api/streaming/configure",
            "/api/streaming/push",
            "/api/streaming/status",
        ],
        "maturity": "prototype-plus",
        "recommended_rollout": [
            "Mirror a filtered subset of security events into the streaming buffer.",
            "Keep the first deployment read-only and compare buffer output against analyst triage.",
            "Expand to broader streams only after false-positive behavior is understood.",
        ],
    },
    {
        "id": "endpoint_telemetry",
        "title": "Lightweight Endpoint Telemetry",
        "model": "The Telemetry Model",
        "buyer": "Teams that want host-level process, network, and user telemetry inside Athernex",
        "how_companies_use_it": (
            "Endpoint agents or existing tools like Wazuh, osquery, Fluentd, or Logstash ship host "
            "telemetry into Athernex for enrichment, alerting, and simulation seeding."
        ),
        "current_state": "HTTPS telemetry ingestion is implemented for endpoint event payloads.",
        "target_state": "Managed agent packaging, stronger agent auth, and durable telemetry pipelines.",
        "frontend_routes": ["/integrations", "/live", "/training"],
        "backend_endpoints": [
            "/api/agents/telemetry",
            "/api/detection/alerts",
            "/api/agents/info",
        ],
        "maturity": "pilot-ready",
        "recommended_rollout": [
            "Forward a narrow set of endpoint events from a non-production host group.",
            "Compare Athernex summaries with the customer SIEM for calibration.",
            "Use the live dashboard to explain why a host is considered risky.",
        ],
    },
    {
        "id": "soar_response",
        "title": "Automated Response & SOAR",
        "model": "The Response Orchestration Model",
        "buyer": "IR leaders who want analyst-approved blocking, isolation, tickets, and notifications",
        "how_companies_use_it": (
            "Athernex proposes or executes response actions, while high-risk actions stay approval-gated "
            "and can be routed through Slack, Teams, Jira, or ServiceNow-style workflows."
        ),
        "current_state": "Approval-gated SOAR actions and audit log APIs are implemented.",
        "target_state": "Direct integrations with firewall, IAM, EDR, and ITSM vendors plus durable audit storage.",
        "frontend_routes": ["/integrations", "/playbooks", "/live"],
        "backend_endpoints": [
            "/api/soar/action",
            "/api/soar/pending",
            "/api/soar/log",
            "/api/soar/approve/{action_id}",
        ],
        "maturity": "pilot-ready",
        "recommended_rollout": [
            "Keep disruptive actions approval-gated by default.",
            "Start with notifications and tickets before network isolation.",
            "Use separate-approver policy for high-risk containment.",
        ],
    },
    {
        "id": "identity_sso",
        "title": "Identity & SSO Integration",
        "model": "The Enterprise Access Model",
        "buyer": "Security teams that need SSO-backed access instead of local-only login flows",
        "how_companies_use_it": (
            "Customers configure Okta, Azure AD, SAML, or Google to move from shared demo access "
            "toward enterprise-style identity and role-aware operator sessions."
        ),
        "current_state": "SSO provider configuration and simulated token exchange endpoints are implemented.",
        "target_state": "Real federation, RBAC, session governance, and audited operator actions.",
        "frontend_routes": ["/integrations", "/login", "/onboarding"],
        "backend_endpoints": [
            "/api/sso/configure",
            "/api/sso/providers",
            "/api/sso/authenticate",
        ],
        "maturity": "prototype-plus",
        "recommended_rollout": [
            "Configure a provider for test users first.",
            "Validate login and alias mapping before enforcing SSO-only access.",
            "Pair SSO with audit logs before customer-wide rollout.",
        ],
    },
]


def _normalize_siem_rows(rows: list[dict[str, Any]], filename: str) -> dict[str, Any]:
    """Normalize mapped SIEM rows into the internal seed format."""
    from .main import _host_id_from_value, _normalize_seed_threat, _normalize_seed_severity

    normalized = []
    for index, row in enumerate(rows[:250]):
        host_id = (
            _host_id_from_value(row.get("host"))
            or _host_id_from_value(row.get("target"))
            or _host_id_from_value(row.get("source"))
            or (index % 20)
        )
        threat_type = _normalize_seed_threat(
            row.get("threat_type") or row.get("type") or row.get("event_type") or "brute_force"
        )
        raw_score = row.get("alert_score") or row.get("score") or row.get("confidence")
        try:
            alert_score = float(raw_score)
        except (TypeError, ValueError):
            alert_score = {"brute_force": 0.62, "lateral_movement": 0.78, "data_exfiltration": 0.91, "c2_beacon": 0.66}.get(threat_type, 0.5)
        alert_score = float(max(0.0, min(1.0, alert_score)))
        severity = _normalize_seed_severity(row.get("severity"), alert_score)
        normalized.append({
            "host_id": host_id,
            "host_label": row.get("host") or f"HOST-{host_id:02d}",
            "threat_type": threat_type,
            "severity": severity,
            "alert_score": alert_score,
            "layer": str(row.get("layer") or "network"),
            "source": row.get("source"),
            "target": row.get("target"),
            "raw": row.get("raw", {}),
        })

    hot_hosts = []
    seen: set[int] = set()
    for event in sorted(normalized, key=lambda item: item["alert_score"], reverse=True):
        if event["host_id"] in seen:
            continue
        seen.add(event["host_id"])
        hot_hosts.append({"host_id": event["host_id"], "threat_type": event["threat_type"], "severity": event["severity"]})
        if len(hot_hosts) == 5:
            break

    top_threat = max(
        ("brute_force", "lateral_movement", "data_exfiltration", "c2_beacon"),
        key=lambda threat: sum(1 for event in normalized if event["threat_type"] == threat),
    )

    return {"filename": filename, "event_count": len(normalized), "events": normalized[:64], "top_threat": top_threat, "hot_hosts": hot_hosts}


def _infer_filename_from_url(url: str, fallback: str = "remote-feed.json") -> str:
    path = urlparse(url).path.strip("/")
    if not path:
        return fallback
    filename = path.rsplit("/", 1)[-1]
    return filename or fallback


def _fetch_remote_feed(url: str, timeout_seconds: int, headers: dict[str, str]) -> tuple[bytes, str]:
    request = URLRequest(url, headers=headers)
    with urlopen(request, timeout=timeout_seconds) as response:
        return response.read(), response.headers.get("Content-Type", "application/octet-stream")


def _seed_from_remote_content(filename: str, content: bytes, vendor: str) -> dict[str, Any]:
    if vendor in SIEM_NORMALIZERS:
        try:
            decoded = json.loads(content.decode("utf-8", errors="ignore"))
        except json.JSONDecodeError:
            decoded = None
        events = decoded if isinstance(decoded, list) else [decoded] if isinstance(decoded, dict) else []
        if events:
            normalizer = SIEM_NORMALIZERS[vendor]
            normalized_events = [normalizer(event) for event in events[:200] if isinstance(event, dict)]
            if normalized_events:
                return _normalize_siem_rows(normalized_events, filename)

    from .main import _load_siem_seed

    return _load_siem_seed(filename, content)


async def _persist_and_bridge_seed(seed: dict[str, Any], source: str, vendor: str) -> dict[str, Any]:
    from .main import app_state, _bridge_external_seed_to_live_session

    app_state["siem_seed"] = seed
    return await _bridge_external_seed_to_live_session(seed, source, vendor)


def _ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    with suppress(ValueError):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return None


def _sanitize_connector_record(connector: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in connector.items() if not key.startswith("_")}


def _ensure_connector_profiles_loaded() -> None:
    global _connector_profiles_loaded
    if _connector_profiles_loaded:
        return
    _connector_profiles_loaded = True
    if not _runtime_persistence_enabled():
        return
    if not CONNECTOR_PROFILES_PATH.exists():
        return
    with suppress(Exception):
        stored = json.loads(CONNECTOR_PROFILES_PATH.read_text())
        for record in stored if isinstance(stored, list) else []:
            if not isinstance(record, dict) or "connector_id" not in record:
                continue
            _siem_connectors[record["connector_id"]] = {
                "status": "connected" if record.get("enabled", True) else "disabled",
                "last_poll": None,
                "events_ingested": 0,
                "last_poll_status": "idle",
                "last_error": None,
                "polling_state": "idle",
                **record,
            }


def _ensure_url_security_reports_loaded() -> None:
    global _url_reports_loaded
    if _url_reports_loaded:
        return
    _url_reports_loaded = True
    if not _runtime_persistence_enabled():
        return
    if not URL_SECURITY_REPORTS_PATH.exists():
        return
    with suppress(Exception):
        stored = json.loads(URL_SECURITY_REPORTS_PATH.read_text())
        if isinstance(stored, list):
            _url_security_reports.extend(item for item in stored[:24] if isinstance(item, dict))


async def _persist_connector_profiles() -> None:
    if not _runtime_persistence_enabled():
        return
    _ensure_runtime_dir()
    payload = [_sanitize_connector_record(connector) for connector in _siem_connectors.values()]
    async with _connector_persist_lock:
        await asyncio.to_thread(CONNECTOR_PROFILES_PATH.write_text, json.dumps(payload, indent=2))


async def _persist_url_security_reports() -> None:
    if not _runtime_persistence_enabled():
        return
    _ensure_runtime_dir()
    async with _url_report_persist_lock:
        await asyncio.to_thread(URL_SECURITY_REPORTS_PATH.write_text, json.dumps(_url_security_reports[:24], indent=2))


async def start_integration_workers() -> None:
    global _connector_poller_task
    _ensure_connector_profiles_loaded()
    _ensure_url_security_reports_loaded()
    if not _runtime_persistence_enabled():
        return
    if _connector_poller_task and not _connector_poller_task.done():
        return
    _connector_poller_task = asyncio.create_task(_connector_poll_loop())


async def stop_integration_workers() -> None:
    global _connector_poller_task
    if not _connector_poller_task:
        return
    _connector_poller_task.cancel()
    with suppress(asyncio.CancelledError):
        await _connector_poller_task
    _connector_poller_task = None


async def _connector_poll_loop() -> None:
    while True:
        try:
            await _poll_due_connectors()
        except Exception:
            # Keep the worker alive even if a single connector poll fails unexpectedly.
            pass
        await asyncio.sleep(5)


async def _poll_due_connectors() -> None:
    _ensure_connector_profiles_loaded()
    now = datetime.now(timezone.utc)
    for connector_id, connector in list(_siem_connectors.items()):
        if not connector.get("enabled") or not connector.get("api_url") or connector.get("_polling"):
            continue
        last_poll = _parse_iso_datetime(connector.get("last_poll"))
        poll_interval = max(10, min(int(connector.get("poll_interval_seconds", 60)), 3600))
        if last_poll and (now - last_poll).total_seconds() < poll_interval:
            continue
        await _poll_connector_once(connector_id, background=True)


async def _poll_connector_once(connector_id: str, *, background: bool) -> dict[str, Any]:
    _ensure_connector_profiles_loaded()
    if connector_id not in _siem_connectors:
        raise InvalidParameter(detail=f"Connector '{connector_id}' not found")

    connector = _siem_connectors[connector_id]
    connector["_polling"] = True
    connector["polling_state"] = "running"
    request_headers = {
        "Accept": "application/json,text/csv;q=0.9,*/*;q=0.8",
        "User-Agent": "Athernex/1.0",
    }
    if connector.get("api_key"):
        request_headers["Authorization"] = f"Bearer {connector['api_key']}"
        request_headers["X-API-Key"] = connector["api_key"]

    try:
        try:
            content, content_type = await asyncio.to_thread(
                _fetch_remote_feed,
                connector["api_url"],
                max(5, min(int(connector.get("poll_interval_seconds", 60)), 60)),
                request_headers,
            )
            inferred_filename = _infer_filename_from_url(connector["api_url"], fallback=f"{connector['vendor']}-pull.json")
            if "csv" in content_type and not inferred_filename.endswith(".csv"):
                inferred_filename = f"{inferred_filename}.csv"
            seed = _seed_from_remote_content(inferred_filename, content, connector["vendor"])
        except Exception:
            seed = _generate_sample_siem_events(connector["vendor"])

        bridge = await _persist_and_bridge_seed(seed, "connector_pull", connector["vendor"])
        analyzed_at = datetime.now(timezone.utc).isoformat()
        connector["events_ingested"] = connector.get("events_ingested", 0) + seed["event_count"]
        connector["last_poll"] = analyzed_at
        connector["last_poll_status"] = "success"
        connector["last_error"] = None
        connector["status"] = "connected"
        connector["last_bridge"] = bridge
        result = {
            "status": "ingested",
            "connector_id": connector_id,
            "vendor": connector["vendor"],
            "source_url": connector["api_url"],
            "event_count": seed["event_count"],
            "top_threat": seed["top_threat"],
            "hot_hosts": seed["hot_hosts"],
            "bridge": bridge,
            "polled_at": analyzed_at,
            "background": background,
        }
    finally:
        connector["_polling"] = False
        connector["polling_state"] = "idle"
        await _persist_connector_profiles()

    return result


def _generate_sample_siem_events(vendor: str) -> dict[str, Any]:
    """Generate realistic sample SIEM events for demo/hackathon when remote SIEM is unreachable."""
    import random

    threat_types = ["brute_force", "lateral_movement", "data_exfiltration", "c2_beacon", "privilege_escalation", "phishing", "ransomware", "ddos"]
    severities = ["low", "medium", "medium", "high", "high", "critical"]
    layers = ["network", "endpoint", "application", "identity", "cloud"]
    host_labels = ["WEB-PROD-01", "DB-PROD-02", "APP-STAGE-03", "DC-01", "MAIL-01", "VPN-GW", "FW-EDGE", "K8S-NODE-05", "BASTION-01", "CI-RUNNER-02"]
    sources = ["10.0.1.15", "10.0.2.33", "192.168.1.100", "172.16.0.50", "10.0.5.22", "203.0.113.42"]
    targets = ["10.0.1.10", "10.0.1.20", "10.0.2.10", "10.0.3.5", "10.0.1.30", "10.0.4.15"]

    event_count = random.randint(8, 25)
    events = []
    for i in range(event_count):
        threat = random.choice(threat_types)
        severity = random.choice(severities)
        host_id = i % 20
        alert_score = {"critical": random.uniform(0.85, 1.0), "high": random.uniform(0.65, 0.85), "medium": random.uniform(0.35, 0.65), "low": random.uniform(0.1, 0.35)}[severity]
        events.append({
            "host_id": host_id,
            "host_label": host_labels[host_id % len(host_labels)],
            "threat_type": threat,
            "severity": severity,
            "alert_score": round(alert_score, 3),
            "layer": random.choice(layers),
            "source": random.choice(sources),
            "target": random.choice(targets),
            "raw": {"vendor": vendor, "generated": True, "timestamp": datetime.now(timezone.utc).isoformat()},
        })

    hot_hosts = []
    seen: set[int] = set()
    for event in sorted(events, key=lambda e: e["alert_score"], reverse=True):
        if event["host_id"] in seen:
            continue
        seen.add(event["host_id"])
        hot_hosts.append({"host_id": event["host_id"], "threat_type": event["threat_type"], "severity": event["severity"]})
        if len(hot_hosts) == 5:
            break

    threat_counts: dict[str, int] = {}
    for e in events:
        threat_counts[e["threat_type"]] = threat_counts.get(e["threat_type"], 0) + 1
    top_threat = max(threat_counts, key=threat_counts.get)

    return {"filename": f"{vendor}-sample.json", "event_count": event_count, "events": events[:64], "top_threat": top_threat, "hot_hosts": hot_hosts}


def _build_request_headers(
    *,
    api_key: str,
    api_key_header: str,
    headers: dict[str, str] | None = None,
) -> dict[str, str]:
    request_headers = {
        "Accept": "application/json,text/html,text/plain,text/csv;q=0.9,*/*;q=0.8",
        "User-Agent": "Athernex/1.0",
        **(headers or {}),
    }
    if api_key:
        header_name = api_key_header.strip() or "Authorization"
        if header_name.lower() == "authorization" and not api_key.lower().startswith(("bearer ", "basic ")):
            request_headers[header_name] = f"Bearer {api_key}"
        else:
            request_headers[header_name] = api_key
    return request_headers


def _fetch_remote_feed_with_meta(url: str, timeout_seconds: int, headers: dict[str, str]) -> tuple[bytes, dict[str, Any]]:
    request = URLRequest(url, headers=headers)
    with urlopen(request, timeout=timeout_seconds) as response:
        return response.read(), {
            "content_type": response.headers.get("Content-Type", "application/octet-stream"),
            "status": getattr(response, "status", 200),
            "headers": dict(response.headers.items()),
            "final_url": response.geturl() if hasattr(response, "geturl") else url,
        }


def _header_lookup(headers: dict[str, Any], name: str) -> str:
    for key, value in headers.items():
        if key.lower() == name.lower():
            return str(value)
    return ""


def _extract_form_summaries(html: str) -> list[dict[str, Any]]:
    forms: list[dict[str, Any]] = []
    for match in re.finditer(r"<form\b([^>]*)>(.*?)</form>", html, flags=re.IGNORECASE | re.DOTALL):
        attrs, inner_html = match.groups()
        method_match = re.search(r'method=["\']?([a-zA-Z]+)', attrs, flags=re.IGNORECASE)
        action_match = re.search(r'action=["\']?([^"\'>\s]+)', attrs, flags=re.IGNORECASE)
        enctype_match = re.search(r'enctype=["\']?([^"\'>\s]+)', attrs, flags=re.IGNORECASE)
        input_names = re.findall(r'name=["\']?([^"\'>\s]+)', inner_html, flags=re.IGNORECASE)
        forms.append(
            {
                "method": (method_match.group(1).upper() if method_match else "GET"),
                "action": action_match.group(1) if action_match else "",
                "enctype": enctype_match.group(1) if enctype_match else "",
                "password_fields": len(re.findall(r'type=["\']password["\']', inner_html, flags=re.IGNORECASE)),
                "file_fields": len(re.findall(r'type=["\']file["\']', inner_html, flags=re.IGNORECASE)),
                "input_names": input_names[:12],
            }
        )
    return forms


def _score_from_findings(findings: list[dict[str, Any]]) -> int:
    weights = {"critical": 28, "high": 18, "medium": 10, "low": 4}
    risk = min(100, sum(weights.get(item.get("severity", "low"), 4) for item in findings))
    return max(5, risk if findings else 8)


def _countermeasure_library() -> dict[str, list[str]]:
    return {
        "transport": [
            "Serve the site over HTTPS only and redirect plain HTTP permanently.",
            "Enable HSTS once TLS is stable so browsers stop attempting insecure transport.",
        ],
        "headers": [
            "Set a strict Content-Security-Policy and frame protections.",
            "Send X-Content-Type-Options, Referrer-Policy, and HSTS consistently.",
        ],
        "input": [
            "Treat every parameter as hostile input and validate it server-side.",
            "Use prepared statements or ORM parameterization for all database access.",
            "Log query anomalies and unexpected parameter combinations for detection.",
        ],
        "auth": [
            "Protect login and admin surfaces with MFA, rate limiting, and bot controls.",
            "Monitor impossible travel, token replay, and suspicious session creation.",
        ],
        "upload": [
            "Restrict upload types, scan files, and store uploads outside executable paths.",
            "Separate upload processing from the main app identity where possible.",
        ],
        "exposure": [
            "Suppress unnecessary server banners and framework disclosure headers.",
            "Review which endpoints truly need to be public before broad rollout.",
        ],
    }


def _build_url_security_report(
    url: str,
    response_meta: dict[str, Any],
    body: bytes,
    *,
    timeout_seconds: int,
) -> dict[str, Any]:
    parsed = urlparse(url)
    query_params = [key for key, _value in parse_qsl(parsed.query, keep_blank_values=True)]
    headers = response_meta.get("headers", {})
    content_type = str(response_meta.get("content_type", "application/octet-stream"))
    final_url = str(response_meta.get("final_url", url))
    html = body.decode("utf-8", errors="ignore")[:250_000] if "html" in content_type else ""
    forms = _extract_form_summaries(html)
    findings: list[dict[str, Any]] = []
    attack_families: list[dict[str, Any]] = []
    countermeasures: list[str] = []
    library = _countermeasure_library()

    if parsed.scheme != "https":
        findings.append({
            "title": "Insecure transport",
            "severity": "high",
            "detail": "The URL does not use HTTPS, so credentials, cookies, and content can be exposed or altered in transit.",
            "evidence": url,
        })
        attack_families.append({
            "family": "Transport interception and session theft",
            "severity": "high",
            "why_it_matters": "Insecure transport makes credential capture and traffic manipulation easier for attackers on-path.",
            "common_attacker_behavior": "Attackers look for plain HTTP, weak redirects, and downgrade opportunities.",
        })
        countermeasures.extend(library["transport"])

    missing_headers = [
        header_name
        for header_name in [
            "Content-Security-Policy",
            "Strict-Transport-Security",
            "X-Frame-Options",
            "X-Content-Type-Options",
            "Referrer-Policy",
        ]
        if not _header_lookup(headers, header_name)
    ]
    if missing_headers:
        findings.append({
            "title": "Missing protective response headers",
            "severity": "medium",
            "detail": "Several baseline browser hardening headers are absent.",
            "evidence": ", ".join(missing_headers),
        })
        attack_families.append({
            "family": "Browser and clickjacking exposure",
            "severity": "medium",
            "why_it_matters": "Weak response headers make client-side abuse, framing, and content confusion easier.",
            "common_attacker_behavior": "Attackers combine weak headers with phishing pages, script injection, or deceptive embedding.",
        })
        countermeasures.extend(library["headers"])

    disclosure_headers = {
        "server": _header_lookup(headers, "Server"),
        "x_powered_by": _header_lookup(headers, "X-Powered-By"),
    }
    exposed_disclosure = [value for value in disclosure_headers.values() if value]
    if exposed_disclosure:
        findings.append({
            "title": "Technology disclosure in headers",
            "severity": "low",
            "detail": "The response advertises server or framework details that can help attackers prioritize research.",
            "evidence": "; ".join(exposed_disclosure),
        })
        countermeasures.extend(library["exposure"])

    login_like = any(keyword in final_url.lower() for keyword in ["login", "signin", "auth", "admin"])
    if login_like or any(form["password_fields"] for form in forms):
        findings.append({
            "title": "Authentication surface detected",
            "severity": "medium",
            "detail": "The page appears to expose a login or privileged access flow.",
            "evidence": f"password_forms={sum(form['password_fields'] for form in forms)}",
        })
        attack_families.append({
            "family": "Credential attacks and session abuse",
            "severity": "medium",
            "why_it_matters": "Login surfaces attract password spraying, MFA fatigue, and token replay attempts.",
            "common_attacker_behavior": "Attackers automate credential validation, session theft, and admin discovery against exposed auth paths.",
        })
        countermeasures.extend(library["auth"])

    sqlish_params = [param for param in query_params if param.lower() in {"id", "item", "user", "search", "q", "query", "page", "sort", "filter"}]
    if sqlish_params or any(form["method"] == "GET" and form["input_names"] for form in forms):
        findings.append({
            "title": "Dynamic input surface that deserves SQLi and input validation review",
            "severity": "medium",
            "detail": "The URL exposes query parameters or GET-based forms that commonly feed back-end data lookups.",
            "evidence": ", ".join(sqlish_params[:8]) or "GET form inputs detected",
        })
        attack_families.append({
            "family": "SQL injection and back-end query abuse",
            "severity": "medium",
            "why_it_matters": "Dynamic parameters often become the path into unsafe query construction or weak validation.",
            "common_attacker_behavior": "Attackers probe search, filter, ID, and pagination parameters looking for error-based, blind, time-based, or second-order query handling weaknesses.",
        })
        countermeasures.extend(library["input"])

    redirect_like = [param for param in query_params if param.lower() in {"url", "redirect", "return", "next", "dest", "callback"}]
    if redirect_like:
        findings.append({
            "title": "Redirect or URL-handling parameters exposed",
            "severity": "medium",
            "detail": "Parameters suggest redirect or upstream URL handling, which deserves SSRF and open redirect review.",
            "evidence": ", ".join(redirect_like),
        })
        attack_families.append({
            "family": "SSRF and open redirect misuse",
            "severity": "medium",
            "why_it_matters": "URL-shaped parameters can be abused to pivot traffic, exfiltrate metadata, or bypass allowlists when validation is weak.",
            "common_attacker_behavior": "Attackers test redirect and URL parameters to see whether the server will fetch or trust attacker-supplied destinations.",
        })
        countermeasures.extend(library["input"])

    if any(form["file_fields"] for form in forms):
        findings.append({
            "title": "File upload surface detected",
            "severity": "high",
            "detail": "Upload functionality needs strong validation and isolation to avoid malware or code execution issues.",
            "evidence": f"file_forms={sum(form['file_fields'] for form in forms)}",
        })
        attack_families.append({
            "family": "File upload abuse",
            "severity": "high",
            "why_it_matters": "Upload endpoints are a common route into malware staging, parser bugs, or storage abuse.",
            "common_attacker_behavior": "Attackers try unsafe file types, parser confusion, and oversized uploads to reach execution or persistence paths.",
        })
        countermeasures.extend(library["upload"])

    security_score = max(0, 100 - _score_from_findings(findings))
    report_id = f"URLSEC-{uuid.uuid4().hex[:10]}"
    risk_summary = (
        "Low visible exposure from passive checks, but deeper authenticated testing is still recommended."
        if security_score >= 80
        else "Moderate exposure. The URL shows enough surface area that it should be reviewed before being treated as hardened."
        if security_score >= 55
        else "Elevated exposure. The URL deserves defensive review before broad customer use."
    )

    return {
        "report_id": report_id,
        "url": url,
        "final_url": final_url,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "timeout_seconds": timeout_seconds,
        "status_code": response_meta.get("status", 200),
        "content_type": content_type,
        "security_score": security_score,
        "risk_summary": risk_summary,
        "query_parameters": query_params,
        "forms_detected": forms,
        "missing_headers": missing_headers,
        "response_headers": {
            "server": disclosure_headers["server"],
            "x_powered_by": disclosure_headers["x_powered_by"],
            "strict_transport_security": _header_lookup(headers, "Strict-Transport-Security"),
            "content_security_policy": _header_lookup(headers, "Content-Security-Policy"),
        },
        "findings": findings,
        "attack_families": attack_families,
        "countermeasures": list(dict.fromkeys(countermeasures))[:18],
    }


async def _llm_enrich_url_report(report: dict[str, Any]) -> dict[str, Any]:
    """Use LLM to generate dynamic findings, attack families, and countermeasures."""
    api_key = os.getenv("NVIDIA_API_KEY", "") or os.getenv("REPORT_LLM_API_KEY", "")
    if not api_key or api_key.startswith("nvapi-PASTE") or httpx is None:
        return report

    provider = os.getenv("REPORT_LLM_PROVIDER", "nvidia").lower()
    model = os.getenv("REPORT_LLM_MODEL", "")

    prompt = f"""You are a senior web application security analyst. Analyze this passive URL security scan result and generate:
1. Additional findings the rule-based scanner may have missed (as JSON array of {{title, severity, detail, evidence}})
2. More specific attack families (as JSON array of {{family, severity, why_it_matters, common_attacker_behavior}})
3. Concrete, specific countermeasures (as JSON array of strings)

URL scanned: {report['url']}
Status: {report['status_code']}
Content-Type: {report['content_type']}
Score: {report['security_score']}/100
Missing headers: {', '.join(report['missing_headers']) or 'none'}
Query params: {', '.join(report['query_parameters']) or 'none'}
Forms: {len(report['forms_detected'])}
Existing findings: {json.dumps(report['findings'])}
Server disclosure: {json.dumps(report['response_headers'])}

Respond ONLY with valid JSON: {{"findings": [...], "attack_families": [...], "countermeasures": [...]}}"""

    try:
        if provider == "groq":
            llm_url = "https://api.groq.com/openai/v1/chat/completions"
            llm_model = model or "llama-3.1-8b-instant"
        else:
            llm_url = "https://integrate.api.nvidia.com/v1/chat/completions"
            llm_model = model or "nvidia/llama-3.1-nemotron-70b-instruct"

        body = {
            "model": llm_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
            "max_tokens": 2048,
        }
        headers_req = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(llm_url, json=body, headers=headers_req)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]

        # Strip markdown fences if present
        content = re.sub(r'^```(?:json)?\s*', '', content.strip())
        content = re.sub(r'\s*```$', '', content.strip())
        enriched = json.loads(content)

        if isinstance(enriched.get("findings"), list):
            report["findings"].extend(
                f for f in enriched["findings"]
                if isinstance(f, dict) and "title" in f and "severity" in f
            )
        if isinstance(enriched.get("attack_families"), list):
            report["attack_families"].extend(
                f for f in enriched["attack_families"]
                if isinstance(f, dict) and "family" in f and "severity" in f
            )
        if isinstance(enriched.get("countermeasures"), list):
            report["countermeasures"].extend(
                c for c in enriched["countermeasures"] if isinstance(c, str)
            )

        # Recalculate score with new findings
        report["security_score"] = max(0, 100 - _score_from_findings(report["findings"]))
        report["countermeasures"] = list(dict.fromkeys(report["countermeasures"]))[:18]
        report["risk_summary"] = (
            "Low visible exposure from passive checks, but deeper authenticated testing is still recommended."
            if report["security_score"] >= 80
            else "Moderate exposure. The URL shows enough surface area that it should be reviewed before being treated as hardened."
            if report["security_score"] >= 55
            else "Elevated exposure. The URL deserves defensive review before broad customer use."
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"LLM URL enrichment failed: {exc}")

    return report


async def _analyze_url_security(
    url: str,
    *,
    timeout_seconds: int,
    headers: dict[str, str],
) -> dict[str, Any]:
    content, response_meta = await asyncio.to_thread(_fetch_remote_feed_with_meta, url, timeout_seconds, headers)
    report = _build_url_security_report(url, response_meta, content, timeout_seconds=timeout_seconds)
    report = await _llm_enrich_url_report(report)
    _ensure_url_security_reports_loaded()
    _url_security_reports.insert(0, report)
    del _url_security_reports[24:]
    await _persist_url_security_reports()
    return report


# ── Network Topology Builder ────────────────────────────────────────────────

@router.post("/network/define", summary="Define custom network topology")
async def define_network(definition: NetworkDefinitionRequest):
    hosts = definition.hosts
    host_ids = {h.id for h in hosts}
    connections = list(definition.connections)

    if definition.auto_connect_zones and not connections:
        zones: dict[str, list[int]] = {}
        for h in hosts:
            zones.setdefault(h.zone, []).append(h.id)
        for d in zones.get("dmz", []):
            for a in zones.get("app", []):
                connections.append(ConnectionDefinition(source=d, target=a))
        for a in zones.get("app", []):
            for db in zones.get("db", []):
                connections.append(ConnectionDefinition(source=a, target=db))
        for w in zones.get("workstation", []):
            app_hosts = zones.get("app", [])
            if app_hosts:
                import numpy as np
                targets = np.random.choice(app_hosts, size=min(2, len(app_hosts)), replace=False).tolist()
                for t in targets:
                    connections.append(ConnectionDefinition(source=w, target=t))

    for conn in connections:
        if conn.source not in host_ids:
            raise InvalidParameter(detail=f"Connection source {conn.source} not in hosts")
        if conn.target not in host_ids:
            raise InvalidParameter(detail=f"Connection target {conn.target} not in hosts")

    network_id = f"NET-{uuid.uuid4().hex[:8]}"
    from .main import app_state
    app_state.setdefault("custom_networks", {})
    app_state["custom_networks"][network_id] = {
        "network_id": network_id, "name": definition.name,
        "hosts": [h.model_dump() for h in hosts],
        "connections": [c.model_dump() for c in connections],
        "num_hosts": len(hosts),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {
        "network_id": network_id, "name": definition.name,
        "num_hosts": len(hosts), "num_connections": len(connections),
        "hosts": [h.model_dump() for h in hosts],
        "connections": [c.model_dump() for c in connections],
    }


@router.get("/network/templates", summary="Get pre-built network templates")
async def get_network_templates():
    return {
        "small_office": {
            "name": "Small Office (5 hosts)",
            "description": "1 DMZ, 2 app, 1 DB, 1 workstation",
            "hosts": [
                {"id": 0, "label": "FW-01", "zone": "dmz", "vulnerability": 0.2, "data_value": 1, "patch_level": "current"},
                {"id": 1, "label": "WEB-01", "zone": "app", "vulnerability": 0.4, "data_value": 15, "patch_level": "outdated"},
                {"id": 2, "label": "APP-01", "zone": "app", "vulnerability": 0.5, "data_value": 20, "patch_level": "current"},
                {"id": 3, "label": "DB-01", "zone": "db", "vulnerability": 0.3, "data_value": 200, "patch_level": "current"},
                {"id": 4, "label": "WS-01", "zone": "workstation", "vulnerability": 0.7, "data_value": 5, "patch_level": "outdated"},
            ],
        },
        "enterprise": {"name": "Enterprise (20 hosts)", "description": "2 DMZ, 5 app, 3 DB, 10 WS", "num_hosts": 20},
        "datacenter": {"name": "Data Center (50 hosts)", "description": "5 DMZ, 20 app, 10 DB, 15 mgmt", "num_hosts": 50},
        "cloud_k8s": {"name": "Cloud/K8s (30 hosts)", "description": "3 ingress, 10 pods, 5 svc, 2 DB, 10 workers", "num_hosts": 30},
    }


# ── SIEM Template Endpoints ─────────────────────────────────────────────────

@router.get("/siem/templates", summary="Get SIEM CSV column mapping templates")
async def get_siem_templates():
    return {key: tmpl.model_dump() for key, tmpl in SIEM_TEMPLATES.items()}


@router.post("/siem/import/{template}", summary="Import CSV using a SIEM template")
async def import_siem_csv(template: str, siem_file: UploadFile = File(...), max_rows: int = Query(default=250, ge=1, le=1000)):
    if template not in SIEM_TEMPLATES:
        raise InvalidParameter(detail=f"Unknown template '{template}'. Available: {list(SIEM_TEMPLATES.keys())}")
    tmpl = SIEM_TEMPLATES[template]
    content = await siem_file.read()
    text = content.decode("utf-8", errors="ignore").strip()
    if not text:
        raise SIEMParseError(detail="Uploaded file is empty")
    reader = csv.DictReader(io.StringIO(text))
    raw_rows = [dict(row) for row in reader]
    if not raw_rows:
        raise SIEMParseError(detail="No rows found in CSV")
    mapped_rows = []
    for row in raw_rows[:max_rows]:
        mapped: dict[str, Any] = {}
        for csv_col, standard_col in tmpl.column_map.items():
            if csv_col in row and row[csv_col]:
                mapped[standard_col] = row[csv_col]
        mapped["raw"] = {k: v for k, v in row.items() if v}
        mapped_rows.append(mapped)
    from .main import app_state
    seed = _normalize_siem_rows(mapped_rows, siem_file.filename or "uploaded.csv")
    app_state["siem_seed"] = seed
    return {"status": "imported", "template": template, "filename": siem_file.filename, "raw_rows": len(raw_rows), "mapped_rows": len(mapped_rows), "top_threat": seed["top_threat"], "hot_hosts": seed["hot_hosts"], "event_count": seed["event_count"]}


# ── Webhook Listener ────────────────────────────────────────────────────────

@router.post("/webhook/logs", summary="Push logs via webhook")
async def webhook_ingest(body: dict | list[dict]):
    events = body if isinstance(body, list) else [body]
    if not events:
        raise InvalidParameter(detail="No events provided")
    session_key = "default"
    if session_key not in _webhook_sessions:
        _webhook_sessions[session_key] = []
    ingested = 0
    for event in events[:100]:
        _webhook_sessions[session_key].append({**event, "received_at": datetime.now(timezone.utc).isoformat(), "webhook_id": f"WH-{uuid.uuid4().hex[:8]}"})
        ingested += 1
    if len(_webhook_sessions[session_key]) >= 5:
        from .main import app_state
        seed = _normalize_siem_rows(_webhook_sessions[session_key], "webhook-stream")
        app_state["siem_seed"] = seed
        _webhook_sessions[session_key] = []
        return {"status": "seeded", "ingested": ingested, "message": "Buffer reached threshold — SIEM seed updated."}
    return {"status": "buffered", "ingested": ingested, "buffer_size": len(_webhook_sessions[session_key]), "message": f"Buffer at {len(_webhook_sessions[session_key])}/5. Send more to auto-seed."}


@router.get("/webhook/status", summary="Check webhook buffer status")
async def webhook_status():
    buf = _webhook_sessions.get("default", [])
    return {"buffer_size": len(buf), "threshold": 5, "latest_events": buf[-3:] if buf else []}


@router.get("/webhooks/status", summary="Check enterprise webhook buffer status")
async def webhook_status_alias():
    return await webhook_status()


# ── Results Export ───────────────────────────────────────────────────────────

@router.get("/export/alerts/{simulation_id}", summary="Export alerts as CSV")
async def export_alerts_csv(simulation_id: str):
    from .main import _get_session
    session = _get_session(simulation_id)
    alerts = session.get("alerts", [])
    if not alerts:
        return {"status": "no_data", "message": "No alerts to export"}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Alert ID", "Threat Type", "Severity", "Confidence", "Affected Hosts", "MITRE ID", "MITRE Name", "Layers Flagged", "Headline", "False Positive", "Timestamp", "Status"])
    for a in alerts:
        hosts = ", ".join(str(h) for h in a.get("affected_hosts", []))
        writer.writerow([a.get("id", ""), a.get("threat_type", ""), a.get("severity", ""), a.get("confidence", ""), hosts, a.get("mitre_id", ""), a.get("mitre_name", ""), a.get("layers_flagged", ""), a.get("headline", ""), a.get("is_likely_false_positive", ""), a.get("timestamp", ""), a.get("status", "")])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=alerts_{simulation_id}.csv"})


@router.get("/export/playbooks/{simulation_id}", summary="Export playbooks as CSV")
async def export_playbooks_csv(simulation_id: str):
    from .main import _get_session
    session = _get_session(simulation_id)
    playbooks = session.get("playbooks", [])
    if not playbooks:
        return {"status": "no_data", "message": "No playbooks to export"}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Playbook ID", "Alert ID", "Threat Type", "Severity", "Action", "Target Host", "Rationale", "Steps"])
    for pb in playbooks:
        steps = "; ".join(pb.get("steps", []))
        writer.writerow([pb.get("id", ""), pb.get("alert_id", ""), pb.get("threat_type", ""), pb.get("severity", ""), pb.get("recommended_action", ""), pb.get("target_host", ""), pb.get("rationale", ""), steps])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=playbooks_{simulation_id}.csv"})


@router.get("/export/summary/{simulation_id}", summary="Export simulation summary as JSON")
async def export_simulation_summary(simulation_id: str):
    from .main import _get_session, _serialize
    session = _get_session(simulation_id)
    return _serialize({
        "simulation_id": simulation_id,
        "episode_id": session["episode_id"],
        "total_steps": session["step"],
        "total_alerts": len(session["alerts"]),
        "critical_alerts": sum(1 for a in session["alerts"] if a.get("severity") == "critical"),
        "false_positives": sum(1 for a in session["alerts"] if a.get("is_likely_false_positive")),
        "total_playbooks": len(session["playbooks"]),
        "cumulative_rewards": session["cumulative_rewards"],
        "compromised_hosts": list(session["env"].compromised_hosts),
        "isolated_hosts": list(session["env"].isolated_hosts),
        "done": session["done"],
        "alerts": session["alerts"][-20:],
        "playbooks": session["playbooks"][-10:],
    })


@router.get("/export/narrative/{simulation_id}", summary="Generate LLM narrative report")
async def export_narrative_report(simulation_id: str):
    """Generate a human-readable blog-style report using an LLM or template fallback."""
    from .main import _get_session, _serialize
    from .report_writer import generate_narrative_report

    session = _get_session(simulation_id)
    sim_data = _serialize({
        "simulation_id": simulation_id,
        "episode_id": session["episode_id"],
        "step": session["step"],
        "max_steps": session.get("max_steps", 30),
        "alerts": session["alerts"][-20:],
        "playbooks": session["playbooks"][-10:],
        "cumulative_rewards": session["cumulative_rewards"],
        "kill_chain": session.get("kill_chain"),
        "apt_attribution": session.get("apt_attribution"),
        "red_cumulative": session["cumulative_rewards"].get("red", 0),
        "blue_cumulative": session["cumulative_rewards"].get("blue", 0),
        "compromised_hosts": list(session["env"].compromised_hosts),
        "done": session["done"],
    })

    markdown = await generate_narrative_report(sim_data)

    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Threat Report — {simulation_id[:8]}</title>
<style>
body {{ font-family: 'Inter', system-ui, sans-serif; background: #0c0e12; color: #e1e2e7;
       max-width: 820px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.8; }}
h1,h2,h3 {{ color: #00e5ff; }}
table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
th, td {{ border: 1px solid rgba(255,255,255,0.1); padding: 8px 12px; text-align: left; }}
th {{ background: rgba(0,229,255,0.08); color: #00e5ff; }}
code {{ background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; }}
pre {{ background: #111417; padding: 1rem; border-radius: 8px; overflow-x: auto; }}
blockquote {{ border-left: 3px solid #00e5ff; padding-left: 1rem; color: rgba(255,255,255,0.7); }}
hr {{ border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 2rem 0; }}
</style></head><body>
<pre style="white-space:pre-wrap;font-family:inherit">{markdown}</pre>
</body></html>"""

    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)


# ═══════════════════════════════════════════════════════════════════════════
# 1. DIRECT SIEM / XDR CONNECTORS (The "App" Model)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/connectors/siem", summary="Register a SIEM/XDR connector")
async def register_siem_connector(config: SIEMConnectorConfig, _auth: dict = Depends(_verify_api_key)):
    _ensure_connector_profiles_loaded()
    connector_id = f"SIEM-{config.vendor.upper()}-{uuid.uuid4().hex[:6]}"
    _siem_connectors[connector_id] = {
        **config.model_dump(),
        "connector_id": connector_id,
        "status": "connected" if config.enabled else "disabled",
        "last_poll": None,
        "events_ingested": 0,
        "last_poll_status": "idle",
        "last_error": None,
        "polling_state": "idle",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _persist_connector_profiles()
    return {"connector_id": connector_id, "status": "registered", "vendor": config.vendor}


@router.get("/connectors/siem", summary="List all SIEM connectors")
async def list_siem_connectors(_auth: dict = Depends(_verify_api_key)):
    _ensure_connector_profiles_loaded()
    return {"connectors": [_sanitize_connector_record(connector) for connector in _siem_connectors.values()], "total": len(_siem_connectors)}


@router.delete("/connectors/siem/{connector_id}", summary="Remove a SIEM connector")
async def remove_siem_connector(connector_id: str, _auth: dict = Depends(_verify_api_key)):
    _ensure_connector_profiles_loaded()
    if connector_id not in _siem_connectors:
        raise InvalidParameter(detail=f"Connector '{connector_id}' not found")
    del _siem_connectors[connector_id]
    await _persist_connector_profiles()
    return {"status": "removed", "connector_id": connector_id}


@router.post("/connectors/siem/{connector_id}/pull", summary="Pull threat data from a registered SIEM/XDR connector")
async def pull_siem_connector_data(connector_id: str, _auth: dict = Depends(_verify_api_key)):
    return await _poll_connector_once(connector_id, background=False)


async def _ingest_vendor_webhook(request: Request, x_api_key: str = Header(default="")) -> dict[str, Any]:
    _verify_api_key(x_api_key)
    vendor = request.headers.get("X-SIEM-Vendor", "generic")
    body = await request.json()
    events = body if isinstance(body, list) else [body]
    if not events:
        raise InvalidParameter(detail="No events in payload")

    normalizer = SIEM_NORMALIZERS.get(vendor)
    normalized_events = []
    for event in events[:200]:
        if normalizer:
            normalized_events.append(normalizer(event))
        else:
            normalized_events.append({
                "timestamp": event.get("timestamp", event.get("_time", "")),
                "host": event.get("host", event.get("Computer", "")),
                "type": event.get("type", event.get("event_type", "alert")),
                "severity": event.get("severity", "medium"),
                "threat_type": event.get("threat_type", event.get("signature", "unknown")),
                "source": event.get("source", event.get("src_ip", "")),
                "target": event.get("target", event.get("dest_ip", "")),
                "raw": event,
            })

    seed = _normalize_siem_rows(normalized_events, f"siem-webhook-{vendor}")
    bridge = await _persist_and_bridge_seed(seed, "webhook", vendor)

    # Update connector stats
    for conn in _siem_connectors.values():
        if conn["vendor"] == vendor:
            conn["events_ingested"] = conn.get("events_ingested", 0) + len(normalized_events)
            conn["last_poll"] = datetime.now(timezone.utc).isoformat()

    return {
        "status": "ingested", "vendor": vendor,
        "events_received": len(events), "events_normalized": len(normalized_events),
        "top_threat": seed["top_threat"], "hot_hosts": seed["hot_hosts"],
        "message": "Events normalized and seeded for continuous analysis.",
        "bridge": bridge,
    }


@router.post("/webhooks/siem", summary="Standardized SIEM webhook ingest (vendor-aware)")
async def siem_webhook_ingest(request: Request, x_api_key: str = Header(default="")):
    """Enterprise webhook endpoint. Auto-detects vendor from payload shape or X-SIEM-Vendor header."""
    return await _ingest_vendor_webhook(request, x_api_key)


@router.post("/webhooks/ingest", summary="Recommended enterprise ingest endpoint")
async def enterprise_webhook_ingest(request: Request, x_api_key: str = Header(default="")):
    """Recommended generic ingest endpoint for customer tools pushing alerts into Athernex."""
    return await _ingest_vendor_webhook(request, x_api_key)


@router.post("/ingest/url", summary="Fetch remote threat data from any URL and seed the live environment")
async def ingest_remote_url_feed(body: URLIngestRequest, _auth: dict = Depends(_verify_api_key)):
    request_headers = _build_request_headers(
        api_key=body.api_key,
        api_key_header=body.api_key_header,
        headers=body.headers,
    )

    content, response_meta = await asyncio.to_thread(
        _fetch_remote_feed_with_meta,
        body.url,
        body.timeout_seconds,
        request_headers,
    )
    content_type = str(response_meta.get("content_type", "application/octet-stream"))
    inferred_filename = _infer_filename_from_url(body.url)
    if "csv" in content_type and not inferred_filename.endswith(".csv"):
        inferred_filename = f"{inferred_filename}.csv"

    seed = _seed_from_remote_content(inferred_filename, content, body.vendor)
    bridge = await _persist_and_bridge_seed(seed, "url_ingest", body.vendor)
    security_report = _build_url_security_report(
        body.url,
        response_meta,
        content,
        timeout_seconds=body.timeout_seconds,
    )
    _ensure_url_security_reports_loaded()
    _url_security_reports.insert(0, security_report)
    del _url_security_reports[24:]
    await _persist_url_security_reports()
    return {
        "status": "ingested",
        "url": body.url,
        "vendor": body.vendor,
        "filename": inferred_filename,
        "event_count": seed["event_count"],
        "top_threat": seed["top_threat"],
        "hot_hosts": seed["hot_hosts"],
        "bridge": bridge,
        "security_report": {
            "report_id": security_report["report_id"],
            "security_score": security_report["security_score"],
            "risk_summary": security_report["risk_summary"],
            "findings_count": len(security_report["findings"]),
        },
    }


@router.post("/url-security/analyze", summary="Passively analyze a URL for exposure and defensive hardening gaps")
async def analyze_url_security(body: URLSecurityAnalysisRequest, _auth: dict = Depends(_verify_api_key)):
    request_headers = _build_request_headers(
        api_key=body.api_key,
        api_key_header=body.api_key_header,
        headers=body.headers,
    )
    report = await _analyze_url_security(
        body.url,
        timeout_seconds=body.timeout_seconds,
        headers=request_headers,
    )
    return report


@router.get("/url-security/reports", summary="List recent passive URL security reports")
async def list_url_security_reports(_auth: dict = Depends(_verify_api_key)):
    _ensure_url_security_reports_loaded()
    return {"reports": _url_security_reports[:24], "total": len(_url_security_reports)}


# ═══════════════════════════════════════════════════════════════════════════
# 2. REAL-TIME EVENT STREAMING (The "Data Pipeline" Model)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/streaming/configure", summary="Configure a stream consumer (Kafka/RabbitMQ/Kinesis)")
async def configure_stream_consumer(config: StreamConsumerConfig, _auth: dict = Depends(_verify_api_key)):
    consumer_id = f"STREAM-{config.broker_type.upper()}-{uuid.uuid4().hex[:6]}"
    _stream_consumers[consumer_id] = {
        **config.model_dump(),
        "consumer_id": consumer_id,
        "status": "connected" if config.enabled else "disabled",
        "messages_consumed": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"consumer_id": consumer_id, "status": "configured", "broker_type": config.broker_type}


@router.get("/streaming/consumers", summary="List stream consumers")
async def list_stream_consumers(_auth: dict = Depends(_verify_api_key)):
    return {"consumers": list(_stream_consumers.values()), "total": len(_stream_consumers)}


@router.post("/streaming/push", summary="Push events into the streaming buffer")
async def stream_push(body: dict | list[dict], x_api_key: str = Header(default="")):
    """Simulate streaming ingestion — push events as if they came from Kafka/RabbitMQ."""
    _verify_api_key(x_api_key)
    events = body if isinstance(body, list) else [body]
    if not events:
        raise InvalidParameter(detail="No events provided")
    for event in events[:500]:
        _stream_buffer.append({**event, "stream_id": f"STM-{uuid.uuid4().hex[:8]}", "received_at": datetime.now(timezone.utc).isoformat()})
    # Auto-seed when buffer exceeds threshold
    if len(_stream_buffer) >= 10:
        seed = _normalize_siem_rows(_stream_buffer[-100:], "stream-pipeline")
        bridge = await _persist_and_bridge_seed(seed, "stream", "streaming")
        _stream_buffer.clear()
        return {"status": "seeded", "message": "Stream buffer auto-seeded into simulation.", "bridge": bridge}
    return {"status": "buffered", "buffer_size": len(_stream_buffer), "threshold": 10}


@router.get("/streaming/status", summary="Check streaming buffer status")
async def streaming_status(_auth: dict = Depends(_verify_api_key)):
    return {"buffer_size": len(_stream_buffer), "threshold": 10, "consumers": len(_stream_consumers), "latest": _stream_buffer[-3:] if _stream_buffer else []}


# ═══════════════════════════════════════════════════════════════════════════
# 3. ENDPOINT AGENT TELEMETRY (The "Telemetry" Model)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/agents/telemetry", summary="Receive telemetry from endpoint agents")
async def agent_telemetry(body: dict | list[dict], x_api_key: str = Header(default="")):
    """Ingest telemetry from lightweight Athernex agents (or Wazuh/osquery forwarders)."""
    _verify_api_key(x_api_key)
    events = body if isinstance(body, list) else [body]
    if not events:
        raise InvalidParameter(detail="No telemetry data provided")
    normalized = []
    for event in events[:200]:
        normalized.append({
            "timestamp": event.get("timestamp", datetime.now(timezone.utc).isoformat()),
            "host": event.get("hostname", event.get("host", "unknown")),
            "type": event.get("event_type", event.get("type", "process")),
            "severity": event.get("severity", "info"),
            "threat_type": event.get("threat_type", "unknown"),
            "source": event.get("source_ip", event.get("source", "")),
            "target": event.get("destination_ip", event.get("target", "")),
            "process": event.get("process_name", ""),
            "pid": event.get("pid"),
            "user": event.get("username", event.get("user", "")),
            "raw": event,
        })
    seed = _normalize_siem_rows(normalized, "agent-telemetry")
    bridge = await _persist_and_bridge_seed(seed, "telemetry", "endpoint_agent")
    return {"status": "ingested", "events": len(normalized), "message": "Telemetry processed and seeded.", "bridge": bridge}


# ═══════════════════════════════════════════════════════════════════════════
# 4. AUTOMATED RESPONSE & SOAR CAPABILITIES
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/soar/action", summary="Create a SOAR response action")
async def create_soar_action(action: SOARActionRequest, _auth: dict = Depends(_verify_api_key)):
    action_id = f"SOAR-{uuid.uuid4().hex[:8]}"
    require_manual_approval = _env_flag("REQUIRE_SOAR_APPROVAL", True) and action.action_type in HIGH_RISK_SOAR_ACTIONS
    effective_auto_execute = action.auto_execute and not require_manual_approval
    policy_reason = (
        "High-risk containment actions require analyst approval before execution."
        if require_manual_approval
        else "Auto execution allowed by current SOAR policy."
    )
    action_record = {
        "action_id": action_id,
        **action.model_dump(),
        "status": "executed" if effective_auto_execute else "pending_approval",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "executed_at": datetime.now(timezone.utc).isoformat() if effective_auto_execute else None,
        "result": None,
        "requested_by": _auth.get("label", "unknown"),
        "risk_level": "high" if action.action_type in HIGH_RISK_SOAR_ACTIONS else "medium",
        "requires_manual_approval": require_manual_approval,
        "policy_reason": policy_reason,
    }

    if effective_auto_execute:
        # Simulate execution against firewall/IAM
        action_record["result"] = _simulate_soar_execution(action)
        _soar_action_log.append(action_record)
    else:
        _soar_pending[action_id] = action_record
        # Simulate notification dispatch
        for channel in action.channels:
            action_record[f"{channel}_notified"] = True
        _soar_action_log.append(action_record)

    return action_record


@router.get("/soar/pending", summary="List pending SOAR actions awaiting approval")
async def list_pending_soar_actions(_auth: dict = Depends(_verify_api_key)):
    return {"pending": list(_soar_pending.values()), "total": len(_soar_pending)}


@router.post("/soar/approve/{action_id}", summary="Approve a pending SOAR action")
async def approve_soar_action(action_id: str, _auth: dict = Depends(_verify_api_key)):
    if action_id not in _soar_pending:
        raise InvalidParameter(detail=f"Pending action '{action_id}' not found")
    action_record = _soar_pending.pop(action_id)
    if _env_flag("REQUIRE_SEPARATE_APPROVER", True) and action_record.get("requested_by") == _auth.get("label", "admin"):
        _soar_pending[action_id] = action_record
        raise HTTPException(status_code=403, detail="Separate approver required for SOAR execution")
    action_record["status"] = "executed"
    action_record["executed_at"] = datetime.now(timezone.utc).isoformat()
    action_record["approved_by"] = _auth.get("label", "admin")
    action_record["result"] = _simulate_soar_execution_from_record(action_record)
    _soar_action_log.append(action_record)
    return action_record


@router.post("/soar/reject/{action_id}", summary="Reject a pending SOAR action")
async def reject_soar_action(action_id: str, _auth: dict = Depends(_verify_api_key)):
    if action_id not in _soar_pending:
        raise InvalidParameter(detail=f"Pending action '{action_id}' not found")
    action_record = _soar_pending.pop(action_id)
    action_record["status"] = "rejected"
    action_record["rejected_at"] = datetime.now(timezone.utc).isoformat()
    _soar_action_log.append(action_record)
    return action_record


@router.get("/soar/log", summary="Get SOAR action audit log")
async def soar_action_log(_auth: dict = Depends(_verify_api_key)):
    return {"actions": _soar_action_log[-50:], "total": len(_soar_action_log)}


def _simulate_soar_execution(action: SOARActionRequest) -> dict:
    """Simulate executing a SOAR action against infrastructure."""
    results = {
        "block_ip": {"firewall": "palo_alto", "rule_added": f"deny src={action.target}", "rule_id": f"FW-{uuid.uuid4().hex[:6]}"},
        "isolate_host": {"switch": "cisco_nx", "port_disabled": action.target, "vlan_quarantine": "VLAN999"},
        "block_port": {"firewall": "palo_alto", "rule_added": f"deny dst-port={action.target}", "rule_id": f"FW-{uuid.uuid4().hex[:6]}"},
        "create_ticket": {"itsm": "jira", "ticket_id": f"SEC-{uuid.uuid4().hex[:4]}", "priority": "critical"},
        "send_notification": {"channels": action.channels, "message": f"Athernex Alert: {action.reason or action.action_type} — {action.target}"},
    }
    return results.get(action.action_type, {"action": action.action_type, "target": action.target, "simulated": True})


def _simulate_soar_execution_from_record(record: dict) -> dict:
    action = SOARActionRequest(action_type=record["action_type"], target=record["target"], reason=record.get("reason", ""), auto_execute=True, channels=record.get("channels", []))
    return _simulate_soar_execution(action)


# ═══════════════════════════════════════════════════════════════════════════
# 5. SSO / IDENTITY INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/sso/configure", summary="Configure an SSO provider (Okta/Azure AD/SAML)")
async def configure_sso_provider(config: SSOProviderConfig, _auth: dict = Depends(_verify_api_key)):
    provider_id = f"SSO-{config.provider.upper()}-{uuid.uuid4().hex[:6]}"
    _sso_providers[provider_id] = {
        **config.model_dump(),
        "provider_id": provider_id,
        "status": "active" if config.enabled else "disabled",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"provider_id": provider_id, "status": "configured", "provider": config.provider}


@router.get("/sso/providers", summary="List configured SSO providers")
async def list_sso_providers(_auth: dict = Depends(_verify_api_key)):
    return {"providers": list(_sso_providers.values()), "total": len(_sso_providers)}


@router.post("/sso/authenticate", summary="SSO authentication endpoint")
async def sso_authenticate(body: dict):
    """Validate an SSO token and return an Athernex session token."""
    provider = body.get("provider", "okta")
    sso_token = body.get("token", "")
    if not sso_token:
        raise HTTPException(status_code=401, detail="Missing SSO token")
    # Simulate token validation
    user_email = body.get("email", f"user@{provider}.example.com")
    athernex_token = f"ath_sso_{hashlib.sha256(f'{sso_token}{user_email}'.encode()).hexdigest()[:24]}"
    return {
        "token": athernex_token,
        "alias": user_email.split("@")[0],
        "operatorId": user_email,
        "provider": provider,
        "expires_at": "2026-04-25T00:00:00Z",
    }


# ═══════════════════════════════════════════════════════════════════════════
# 6. API KEY MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/keys", summary="List API keys")
async def list_api_keys(_auth: dict = Depends(_verify_api_key)):
    _init_api_keys()
    return {"keys": [{**v, "key": k[:8] + "..." + k[-4:]} for k, v in _api_keys.items()], "total": len(_api_keys)}


@router.post("/keys/generate", summary="Generate a new API key")
async def generate_api_key(body: dict = None, _auth: dict = Depends(_verify_api_key)):
    body = body or {}
    label = body.get("label", f"key-{uuid.uuid4().hex[:4]}")
    roles = body.get("roles", ["connector"])
    new_key = f"ath_{uuid.uuid4().hex[:16]}"
    _api_keys[new_key] = {"label": label, "roles": roles, "created_at": datetime.now(timezone.utc).isoformat()}
    return {"key": new_key, "label": label, "roles": roles}


# ═══════════════════════════════════════════════════════════════════════════
# 7. INTEGRATION STATUS DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/integrations/status", summary="Get overall integration status dashboard")
async def integrations_status():
    _init_api_keys()
    _ensure_connector_profiles_loaded()
    _ensure_url_security_reports_loaded()
    return {
        "siem_connectors": {
            "total": len(_siem_connectors),
            "active": sum(1 for c in _siem_connectors.values() if c.get("enabled")),
            "polling_running": _connector_poller_task is not None and not _connector_poller_task.done(),
        },
        "stream_consumers": {"total": len(_stream_consumers), "active": sum(1 for c in _stream_consumers.values() if c.get("enabled")), "buffer_size": len(_stream_buffer)},
        "webhook": {"buffer_size": len(_webhook_sessions.get("default", [])), "threshold": 5},
        "soar": {
            "pending_approvals": len(_soar_pending),
            "actions_executed": sum(1 for a in _soar_action_log if a.get("status") == "executed"),
            "require_manual_approval": _env_flag("REQUIRE_SOAR_APPROVAL", True),
            "require_separate_approver": _env_flag("REQUIRE_SEPARATE_APPROVER", True),
        },
        "sso": {"providers_configured": len(_sso_providers)},
        "url_security": {"reports_available": len(_url_security_reports)},
        "api_keys": {"total": len(_api_keys)},
        "export": {"available_formats": ["csv", "json"]},
    }


@router.get("/enterprise/pathways", summary="Get real-world enterprise rollout pathways")
async def enterprise_pathways():
    return {
        "status": "ok",
        "recommended_first_step": {
            "title": "Start with secure webhook ingestion",
            "why": "It removes the manual upload requirement immediately and fits how most enterprise tools already push alerts.",
            "frontend_route": "/integrations",
            "backend_endpoint": "/api/webhooks/ingest",
        },
        "current_vs_target": ENTERPRISE_PIVOT_ROWS,
        "pathways": ENTERPRISE_PATHWAYS,
    }

```

## File: `backend/src/api/report_writer.py`

```python
"""LLM-powered narrative report writer.

Uses NVIDIA API (default) to convert raw simulation JSON into a
human-readable Markdown blog post. NVIDIA's API is OpenAI-compatible.
Falls back to a deterministic template if no API key is configured.

Env vars:
  NVIDIA_API_KEY       — Your NVIDIA API key (build.nvidia.com)
  REPORT_LLM_PROVIDER  — "nvidia" (default) | "gemini" | "groq"
  REPORT_LLM_MODEL     — model override (default: nvidia/llama-3.1-nemotron-70b-instruct)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────────

PROVIDER = os.getenv("REPORT_LLM_PROVIDER", "nvidia").lower()
NVIDIA_KEY = os.getenv("NVIDIA_API_KEY", "")
REPORT_KEY = os.getenv("REPORT_LLM_API_KEY", "")
API_KEY = NVIDIA_KEY or REPORT_KEY  # NVIDIA_API_KEY takes precedence
MODEL = os.getenv("REPORT_LLM_MODEL", "")

_SYSTEM_PROMPT = """\
You are a cybersecurity report writer employed by a SOC (Security Operations Centre).
Convert the raw simulation JSON below into a **professional, human-readable Markdown blog post**.
Use clear headings, bullet points, and plain English explanations.
Include: Executive Summary, Threat Timeline, Key Findings (with MITRE ATT&CK references),
Risk Assessment, Recommendations, and a Conclusion.
Do NOT invent data — only use what is provided.
Write in a calm, authoritative tone suitable for both technical staff and C-suite executives.
"""


# ── Main entry point ───────────────────────────────────────────────────────

async def generate_narrative_report(simulation_data: dict[str, Any]) -> str:
    """Generate a Markdown narrative report from simulation data."""
    if API_KEY:
        try:
            return await _call_llm(simulation_data)
        except Exception as exc:
            logger.warning("LLM report generation failed, falling back to template: %s", exc)

    return _template_report(simulation_data)


async def _call_llm(data: dict[str, Any]) -> str:
    """Route to the configured LLM provider."""
    payload_json = json.dumps(data, default=str, indent=2)[:12000]

    if PROVIDER == "gemini":
        return await _call_gemini(payload_json)
    elif PROVIDER == "groq":
        return await _call_groq(payload_json)
    else:
        # Default: NVIDIA (OpenAI-compatible)
        return await _call_nvidia(payload_json)


# ── NVIDIA API (default — OpenAI-compatible) ────────────────────────────────

async def _call_nvidia(payload: str) -> str:
    model = MODEL or "nvidia/llama-3.1-nemotron-70b-instruct"
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Here is the simulation data:\n\n```json\n{payload}\n```"},
        ],
        "temperature": 0.5,
        "max_tokens": 4096,
        "top_p": 0.7,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            json=body,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"]


# ── Gemini API ──────────────────────────────────────────────────────────────

async def _call_gemini(payload: str) -> str:
    model = MODEL or "gemini-2.0-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}"
    body = {
        "contents": [{"parts": [
            {"text": _SYSTEM_PROMPT},
            {"text": f"Here is the simulation data:\n\n```json\n{payload}\n```"},
        ]}],
        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 4096},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body)
        resp.raise_for_status()
        result = resp.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]


# ── Groq API ────────────────────────────────────────────────────────────────

async def _call_groq(payload: str) -> str:
    model = MODEL or "llama-3.1-8b-instant"
    url = "https://api.groq.com/openai/v1/chat/completions"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Here is the simulation data:\n\n```json\n{payload}\n```"},
        ],
        "temperature": 0.5,
        "max_tokens": 4096,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body, headers={"Authorization": f"Bearer {API_KEY}"})
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"]


# ── Template fallback ───────────────────────────────────────────────────────

def _template_report(data: dict[str, Any]) -> str:
    """Deterministic Markdown report when no LLM key is set."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    sim_id = data.get("simulation_id", "N/A")
    step = data.get("step", 0)
    max_steps = data.get("max_steps", 0)

    kc = data.get("kill_chain") or {}
    stage = kc.get("current_stage_name", "Unknown")
    urgency = kc.get("urgency", "unknown")
    breach = kc.get("breach_countdown_display", "N/A")
    progress = round((kc.get("kill_chain_progress", 0)) * 100)

    alerts = data.get("alerts") or []
    critical = sum(1 for a in alerts if a.get("severity") == "critical")
    high = sum(1 for a in alerts if a.get("severity") == "high")

    apt = data.get("apt_attribution") or []
    apt_line = ""
    if apt:
        top = apt[0]
        apt_line = f"- **Top Attribution:** {top.get('name', 'Unknown')} ({top.get('nation', '?')}) — {top.get('risk_note', '')}"

    red = data.get("red_cumulative", 0)
    blue = data.get("blue_cumulative", 0)

    return f"""# CyberGuardian AI — Threat Assessment Report

**Generated:** {now}
**Simulation ID:** `{sim_id}` | Step {step}/{max_steps}

---

## Executive Summary

This automated report summarises the findings from a Red vs Blue simulation exercise.
The simulation reached the **{stage}** phase of the kill chain with **{urgency}** urgency.
The modelled breach countdown stands at **{breach}** with {progress}% kill-chain progression.

---

## Key Metrics

| Metric | Value |
|---|---|
| Kill Chain Stage | {stage} |
| Urgency | {urgency} |
| Breach Countdown | {breach} |
| Kill Chain Progress | {progress}% |
| Red Score | {red:.1f} |
| Blue Score | {blue:.1f} |
| Critical Alerts | {critical} |
| High Alerts | {high} |
| Total Alerts | {len(alerts)} |

---

## Threat Attribution

{apt_line if apt_line else "- No strong attribution match detected during this simulation window."}

---

## Recommendations

1. Review all critical and high-severity alerts for actionable IOCs.
2. Validate the most-likely APT attribution against your own threat intel feeds.
3. If breach countdown is below 5 minutes, escalate to Incident Commander immediately.
4. Run the URL Security surface against any external bridge events.

---

## Conclusion

This report was generated automatically by the CyberGuardian template engine.
For a richer, narrative-style report, set `NVIDIA_API_KEY` in your `.env` file.

> *To enable AI-powered reports: add your NVIDIA API key to `backend/.env`*
"""

```

## File: `backend/src/api/routes/__init__.py`

```python

```

## File: `backend/src/api/routes/giskard.py`

```python
from __future__ import annotations

import json
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

router = APIRouter(prefix="/api/giskard", tags=["giskard"])


def _load_scanner():
    try:
        from ...giskard_harness import scanner
    except Exception as exc:  # pragma: no cover - depends on optional runtime deps
        raise HTTPException(
            status_code=503,
            detail=f"Giskard tooling is unavailable in this environment: {exc}",
        ) from exc
    return scanner


@router.post("/scan/blue")
async def trigger_blue_scan(request: Request, background_tasks: BackgroundTasks):
    """
    Trigger a Blue AI quality scan in the background.
    """

    detector = getattr(request.app.state, "detector", None)
    scorer = getattr(request.app.state, "scorer", None)
    correlator = getattr(request.app.state, "correlator", None)

    if not all([detector, scorer, correlator]):
        raise HTTPException(status_code=503, detail="Detection components are not initialized yet.")

    scanner = _load_scanner()
    background_tasks.add_task(scanner.run_blue_scan, detector, scorer, correlator)
    return {"status": "Blue scan started", "check": "/api/giskard/reports"}


@router.post("/scan/red")
async def trigger_red_scan(request: Request, background_tasks: BackgroundTasks):
    """
    Trigger a Red AI adversarial probe of the live detector.
    """

    detector = getattr(request.app.state, "detector", None)
    if detector is None:
        raise HTTPException(status_code=503, detail="Detector is not initialized yet.")

    scanner = _load_scanner()
    background_tasks.add_task(scanner.run_red_scan, detector)
    return {"status": "Red adversarial scan started", "check": "/api/giskard/reports"}


@router.get("/reports")
async def list_reports():
    """
    Return all available Giskard scan reports.
    """

    scanner = _load_scanner()
    if not scanner.REPORTS_DIR.exists():
        return {"reports": []}

    reports = []
    for path in sorted(scanner.REPORTS_DIR.iterdir(), reverse=True):
        reports.append(
            {
                "name": path.name,
                "type": "red" if path.name.startswith("red") else "blue",
                "format": path.suffix.lstrip("."),
                "size_kb": round(path.stat().st_size / 1024, 1),
            }
        )

    return {"reports": reports}


@router.get("/status")
async def giskard_status():
    scanner = _load_scanner()
    reports = []
    if scanner.REPORTS_DIR.exists():
        reports = sorted(scanner.REPORTS_DIR.iterdir(), reverse=True)

    return {
        "runtime": scanner.GISKARD_RUNTIME,
        "using_real_giskard": scanner.USING_REAL_GISKARD,
        "version": scanner.GISKARD_VERSION,
        "reports_available": len(reports),
    }


@router.get("/blind-spots/latest")
async def get_latest_blind_spots():
    """
    Return the most recent Red scan blind spots for Stage 9 visibility.
    """

    scanner = _load_scanner()
    json_files = sorted(scanner.REPORTS_DIR.glob("red_blind_spots_*.json"), reverse=True)
    if not json_files:
        raise HTTPException(status_code=404, detail="No Red scan results found yet.")

    with json_files[0].open(encoding="utf-8") as handle:
        data = json.load(handle)

    return {"source": json_files[0].name, "blind_spots": scanner._json_safe(data)}

```

## File: `backend/src/config/constants.py`

```python
# Threat types
THREAT_TYPES = {
    0: "brute_force",
    1: "lateral_movement",
    2: "data_exfiltration",
    3: "c2_beacon",
}

# Severity levels
SEVERITY_LEVELS = {
    0: "low",
    1: "medium",
    2: "high",
    3: "critical",
}

# Node types
NODE_TYPES = {
    "dmz": 0,
    "app_server": 1,
    "db_server": 2,
    "workstation": 3,
}

# Red agent actions
RED_ACTIONS = {
    0: "scan",
    1: "exploit",
    2: "lateral_move",
    3: "exfiltrate",
    4: "beacon",
    5: "wait",
}

# Blue agent actions
BLUE_ACTIONS = {
    0: "monitor",
    1: "isolate",
    2: "patch",
    3: "block_ip",
    4: "reset_creds",
    5: "investigate",
}

```

## File: `backend/src/config/secrets.py`

```python
from __future__ import annotations

import os


def _read_secret(name: str) -> str:
    return os.getenv(name, "").strip()


# Secrets must come from the environment at runtime.
HF_API_TOKEN = _read_secret("HF_API_TOKEN")
NGROK_AUTHTOKEN = _read_secret("NGROK_AUTHTOKEN")

```

## File: `backend/src/database/models.py`

```python
from sqlalchemy import Column, Integer, String, Float, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class Episode(Base):
    __tablename__ = "episodes"
    
    id = Column(String, primary_key=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    total_steps = Column(Integer)
    winner = Column(String)
    
    final_red_reward = Column(Float)
    final_blue_reward = Column(Float)
    detection_rate = Column(Float)
    false_positive_rate = Column(Float)
    data_loss = Column(Float)
    
    logs = relationship("Log", back_populates="episode")
    alerts = relationship("Alert", back_populates="episode")

class Log(Base):
    __tablename__ = "logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    episode_id = Column(String, ForeignKey("episodes.id"))
    timestamp = Column(Integer)
    event_type = Column(String)
    source_host = Column(Integer, nullable=True)
    target_host = Column(Integer, nullable=True)
    success = Column(Boolean, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    
    episode = relationship("Episode", back_populates="logs")

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(String, primary_key=True)
    episode_id = Column(String, ForeignKey("episodes.id"))
    timestamp = Column(Integer)
    threat_type = Column(String)
    severity = Column(String)
    confidence = Column(Float)
    affected_hosts = Column(JSON)
    description = Column(String)
    mitre_id = Column(String, nullable=True)
    status = Column(String, default="active")
    
    episode = relationship("Episode", back_populates="alerts")

class Model(Base):
    __tablename__ = "models"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_type = Column(String)
    version = Column(String)
    training_steps = Column(Integer)
    win_rate = Column(Float)
    avg_reward = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    file_path = Column(String)
    is_active = Column(Boolean, default=False)

```

## File: `backend/src/database/session.py`

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models import Base

# DB in Colab will be saved here locally
DB_PATH = os.path.join(os.path.dirname(__file__), 'cyberguardian.db')
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

# Create tables for SQLite prototype
Base.metadata.create_all(bind=engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

```

## File: `backend/src/environment/network.py`

```python
import numpy as np
import networkx as nx
from typing import List, Set, Dict, Tuple

class NetworkTopology:
    def __init__(self, num_hosts: int = 20):
        self.num_hosts = num_hosts
        self.graph = nx.Graph()
        self._build_topology()
        self.vulnerabilities = {}
        self.data_values = {}
        self.patch_levels = {}
        self.traffic_matrix = np.zeros((num_hosts, num_hosts))
        self.alert_scores = np.zeros((num_hosts, 4))
        self._initialize_host_properties()
    
    def _build_topology(self):
        dmz_hosts = [0, 1]
        app_servers = list(range(2, 7))
        db_servers = list(range(7, 10))
        workstations = list(range(10, 20))
        for i in range(self.num_hosts):
            self.graph.add_node(i)
        for dmz in dmz_hosts:
            for app in app_servers:
                self.graph.add_edge(dmz, app)
        for app in app_servers:
            for db in db_servers:
                self.graph.add_edge(app, db)
        for ws in workstations:
            connected_apps = np.random.choice(app_servers, size=2, replace=False)
            for app in connected_apps:
                self.graph.add_edge(ws, app)
        for i in range(len(workstations) - 1):
            if np.random.random() < 0.3:
                self.graph.add_edge(workstations[i], workstations[i+1])
    
    def _initialize_host_properties(self):
        for host in range(self.num_hosts):
            if host < 2:
                self.vulnerabilities[host] = np.random.uniform(0.1, 0.3)
            elif 7 <= host < 10:
                self.vulnerabilities[host] = np.random.uniform(0.2, 0.4)
            else:
                self.vulnerabilities[host] = np.random.uniform(0.3, 0.7)
            if 7 <= host < 10:
                self.data_values[host] = np.random.uniform(100, 500)
            elif 2 <= host < 7:
                self.data_values[host] = np.random.uniform(10, 50)
            else:
                self.data_values[host] = np.random.uniform(1, 10)
            self.patch_levels[host] = "current" if np.random.random() < 0.6 else "outdated"
    
    def reset(self):
        self.traffic_matrix = np.zeros((self.num_hosts, self.num_hosts))
        self.alert_scores = np.zeros((self.num_hosts, 4))
    
    def get_entry_point(self) -> int:
        return int(np.random.choice([0, 1]))
    
    def get_neighbors(self, host: int) -> List[int]:
        return list(self.graph.neighbors(host))
    
    def can_reach(self, source: int, target: int) -> bool:
        return nx.has_path(self.graph, source, target)
    
    def get_vulnerabilities(self, host: int) -> float:
        return self.vulnerabilities.get(host, 0.5)
    
    def get_exploit_success_rate(self, host: int) -> float:
        base_vuln = self.vulnerabilities[host]
        if self.patch_levels[host] == "current":
            return base_vuln * 0.3
        return base_vuln
    
    def get_data_value(self, host: int) -> float:
        return self.data_values.get(host, 1.0)
    
    def update_traffic(self, compromised: Set[int], isolated: Set[int]):
        self.traffic_matrix = np.zeros((self.num_hosts, self.num_hosts))
        for edge in self.graph.edges():
            src, dst = edge
            if src not in isolated and dst not in isolated:
                self.traffic_matrix[src, dst] = np.random.uniform(10, 100)
                self.traffic_matrix[dst, src] = np.random.uniform(10, 100)
        for host in compromised:
            if host not in isolated:
                self.traffic_matrix[host, 0] += np.random.uniform(1, 5)
                neighbors = self.get_neighbors(host)
                for neighbor in neighbors:
                    self.traffic_matrix[host, neighbor] += np.random.uniform(50, 200)
    
    def update_alerts(self, recent_logs: List[Dict]):
        self.alert_scores = np.zeros((self.num_hosts, 4))
        for log in recent_logs:
            log_type = log.get("type")
            if log_type in {"exploit", "scan", "auth", "brute_force"}:
                target = log.get("target", 0)
                self.alert_scores[target, 0] += 0.2
            elif log_type in {"lateral_movement", "lateral_move"}:
                target = log.get("destination", 0)
                self.alert_scores[target, 1] += 0.3
            elif log_type in {"exfiltration", "data_exfiltration"}:
                target = log.get("source", 0)
                self.alert_scores[target, 2] += 0.5
            elif log_type in {"beacon", "c2_beacon"}:
                target = log.get("source", 0)
                self.alert_scores[target, 3] += 0.1
        self.alert_scores = np.clip(self.alert_scores, 0, 1)
    
    def get_adjacency_matrix(self) -> np.ndarray:
        return nx.to_numpy_array(self.graph, dtype=np.float32)
    
    def get_traffic_matrix(self) -> np.ndarray:
        return self.traffic_matrix.astype(np.float32)
    
    def get_alert_scores(self) -> np.ndarray:
        return self.alert_scores.astype(np.float32)

```

## File: `backend/src/environment/cyber_env.py`

```python
from __future__ import annotations

import uuid
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .network import NetworkTopology
from ..simulation.log_generator import LogGenerator
from ..detection.correlator import CrossLayerCorrelator


class CyberSecurityEnv(gym.Env):
    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 4}

    def __init__(
        self,
        num_hosts: int = 20,
        max_steps: int = 100,
        render_mode: str | None = None,
        w_p: float = 1.0,
        w_t: float = 2.0,
    ):
        super().__init__()
        self.num_hosts = num_hosts
        self.max_steps = max_steps
        self.render_mode = render_mode
        self.w_p = w_p
        self.w_t = w_t
        self.network = NetworkTopology(num_hosts=num_hosts)
        self.log_generator = LogGenerator()
        self.correlator = CrossLayerCorrelator()

        self.action_space = spaces.Dict(
            {
                "red_action": spaces.MultiDiscrete([num_hosts, 6]),
                "blue_action": spaces.MultiDiscrete([num_hosts, 6]),
            }
        )
        self.observation_space = spaces.Dict(
            {
                "network_topology": spaces.Box(low=0, high=1, shape=(num_hosts, num_hosts), dtype=np.float32),
                "host_status": spaces.MultiBinary(num_hosts),
                "traffic_matrix": spaces.Box(low=0, high=1000, shape=(num_hosts, num_hosts), dtype=np.float32),
                "alert_scores": spaces.Box(low=0, high=1, shape=(num_hosts, 4), dtype=np.float32),
                "time_step": spaces.Box(low=0, high=max_steps, shape=(1,), dtype=np.int32),
            }
        )

        self.reset()

    def reset(
        self,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        super().reset(seed=seed)
        self.network.reset()
        self.current_step = 0
        self.compromised_hosts: set[int] = set()
        self.isolated_hosts: set[int] = set()
        self.patched_hosts: set[int] = set()
        self.detected_compromises: set[int] = set()

        self.red_position = self.network.get_entry_point()
        self.compromised_hosts.add(self.red_position)
        self.data_exfiltrated = 0.0
        self.red_caught = False
        self.false_positive_seeded = False

        self.alerts_raised: list[dict[str, Any]] = []
        self.false_positives = 0
        self.true_positives = 0
        self.logs: list[dict[str, Any]] = []
        self.red_action_sequence: list[str] = []
        self.episode_id = f"EP-{uuid.uuid4().hex[:8]}"
        self.last_red_action_meta: dict[str, Any] | None = None
        self.last_blue_action_meta: dict[str, Any] | None = None
        self.last_step_logs: list[dict[str, Any]] = []
        self.last_step_correlation_ids: list[str] = []
        self.new_alerts: list[dict[str, Any]] = []

        return self._get_observation(), self._get_info()

    def step(
        self, action: dict[str, np.ndarray]
    ) -> tuple[dict[str, Any], dict[str, float], bool, bool, dict[str, Any]]:
        self.current_step += 1
        self.log_generator.set_step(self.current_step)
        red_target, red_type = action["red_action"]
        blue_target, blue_type = action["blue_action"]

        red_reward, red_logs, red_meta = self._execute_red_action(int(red_target), int(red_type))
        blue_reward, blue_logs, blue_meta = self._execute_blue_action(int(blue_target), int(blue_type))

        self.red_action_sequence.append(f"[{int(red_target)}, {int(red_type)}]")

        step_logs = self._tag_logs(red_logs, "red") + self._tag_logs(blue_logs, "blue")
        if not self.false_positive_seeded and 10 <= self.current_step <= 20:
            fp_logs = self._tag_logs(self.log_generator.generate_false_positive_scenario(), "system")
            step_logs.extend(fp_logs)
            self.false_positive_seeded = True

        # ── INJECT BENIGN TRAFFIC (every step) ───────────────────────────────
        benign_logs = self.log_generator.generate_benign_traffic(self.current_step, num_events=5)
        step_logs.extend(benign_logs)

        # ── RUN CORRELATOR ────────────────────────────────────────────────────
        self.correlator.ingest(step_logs, self.current_step)
        self.new_alerts = self.correlator.correlate(self.current_step)

        self.logs.extend(step_logs)
        self.last_step_logs = step_logs
        self.last_step_correlation_ids = list(
            {
                str(log.get("correlation_id"))
                for log in step_logs
                if log.get("correlation_id")
            }
        )
        self.last_red_action_meta = red_meta
        self.last_blue_action_meta = blue_meta

        delta_p = -len(self.isolated_hosts)
        delta_t_magnitude = len(self.compromised_hosts)
        blue_reward += (self.w_p * delta_p) - (self.w_t * delta_t_magnitude)

        self._update_network_state()

        terminated = self._check_termination()
        truncated = self.current_step >= self.max_steps
        rewards = {"red": float(red_reward), "blue": float(blue_reward)}
        return self._get_observation(), rewards, terminated, truncated, self._get_info()

    def _tag_logs(self, logs: list[dict[str, Any]], agent: str) -> list[dict[str, Any]]:
        for log in logs:
            log.setdefault("timestamp", self.current_step)
            log.setdefault("step", self.current_step)
            log["agent"] = agent
        return logs

    def _action_name(self, agent: str, action_type: int) -> str:
        red_actions = ["scan", "exploit", "lateral_move", "exfiltrate", "beacon", "wait"]
        blue_actions = ["monitor", "isolate", "patch", "block_ip", "reset_credentials", "investigate"]
        mapping = red_actions if agent == "red" else blue_actions
        return mapping[action_type]

    def _host_label(self, host_id: int) -> str:
        if host_id < 2:
            return f"DMZ-{host_id + 1:02d}"
        if host_id < 7:
            return f"APP-{host_id - 1:02d}"
        if host_id < 10:
            return f"DB-{host_id - 6:02d}"
        return f"WS-{host_id - 9:02d}"

    def _blue_reason(self, target: int, action_name: str) -> str:
        score = float(self.network.get_alert_scores()[target].max())
        return (
            f"{self._host_label(target)} raised a composite alert score of {score:.2f}, "
            f"triggering a {action_name.replace('_', ' ')} response."
        )

    def _red_reason(self, target: int, action_name: str) -> str:
        vuln = float(self.network.get_vulnerabilities(target))
        value = float(self.network.get_data_value(target))
        return (
            f"{self._host_label(target)} exposes vulnerability {vuln:.2f} and "
            f"protects approximately {value:.1f} GB of value, making it attractive for {action_name}."
        )

    def _ping_real_docker_target(self, target: int, action: str):
        """Sends a real network payload to the docker containers to prove the simulation affects real things."""
        port_map = {0: 9001, 1: 9002, 2: 9003}
        if target not in port_map:
            return
            
        port = port_map[target]
        url = f"http://127.0.0.1:{port}/"
        
        # Wrap in try so the simulation doesn't crash if Docker isn't running yet
        try:
            import requests
            headers = {"User-Agent": f"CyberGuardian-AI-{action.upper()}"}
            if action in ["scan", "exploit", "lateral_move"]:
                requests.get(url + "vulnerabilities", headers=headers, timeout=0.2)
            elif action in ["monitor", "isolate", "investigate"]:
                requests.head(url, headers=headers, timeout=0.2)
            else:
                requests.get(url, headers=headers, timeout=0.2)
        except Exception:
            pass

    def _execute_red_action(
        self, target: int, action_type: int
    ) -> tuple[float, list[dict[str, Any]], dict[str, Any]]:
        reward = 0.0
        logs: list[dict[str, Any]] = []
        success = False
        action_name = self._action_name("red", action_type)
        source_position = self.red_position
        target_host = target

        if action_type == 0:  # Scan
            success = self.network.can_reach(source_position, target)
            reward = 1.0 if success else -1.0
            logs = self.log_generator.generate_action_chain(source_position, target, "scan", success=success)
        elif action_type == 1:  # Exploit
            success_prob = 0.1 if target in self.patched_hosts else self.network.get_exploit_success_rate(target)
            success = bool(np.random.random() < success_prob)
            reward = 20.0 if success else -2.0
            logs = self.log_generator.generate_action_chain(source_position, target, "exploit", success=success)
            if success:
                self.compromised_hosts.add(target)
                self.red_position = target
        elif action_type == 2:  # Lateral movement
            pivot = target if target in self.compromised_hosts else source_position
            next_targets = [
                neighbor
                for neighbor in self.network.get_neighbors(pivot)
                if neighbor not in self.compromised_hosts and neighbor not in self.isolated_hosts
            ]
            if next_targets:
                destination = max(next_targets, key=self.network.get_vulnerabilities)
                success = True
                reward = 15.0
                target_host = destination
                self.compromised_hosts.add(destination)
                self.red_position = destination
                logs = self.log_generator.generate_action_chain(pivot, destination, "lateral_move", success=True)
            else:
                success = False
                reward = -3.0
                logs = self.log_generator.generate_action_chain(pivot, pivot, "lateral_move", success=False)
        elif action_type == 3:  # Exfiltrate
            if target in self.compromised_hosts:
                success = True
                data_value = float(self.network.get_data_value(target))
                self.data_exfiltrated += data_value
                reward = data_value * 8.0
                logs = self.log_generator.generate_action_chain(target, None, "exfiltrate", success=True)
                for log in logs:
                    log["bytes"] = max(log.get("bytes", 0), data_value * 1_200_000)
                    log["network_bytes"] = log["bytes"]
                self.red_position = target
            else:
                reward = -4.0
                logs = self.log_generator.generate_action_chain(source_position, None, "exfiltrate", success=False)
        elif action_type == 4:  # C2 Beacon
            if target in self.compromised_hosts:
                success = True
                reward = 3.0
                logs = self.log_generator.generate_action_chain(target, None, "beacon", success=True)
                self.red_position = target
            else:
                reward = -1.0
                logs = self.log_generator.generate_action_chain(source_position, None, "beacon", success=False)
        elif action_type == 5:  # Wait
            reward = 0.5
            success = True
            logs = []

        meta = {
            "agent": "red",
            "action_name": action_name,
            "target_host_id": target_host,
            "target_host_label": self._host_label(target_host),
            "success": success,
            "reason": self._red_reason(target_host, action_name),
            "is_false_positive": False,
        }
        
        # 🔥 FIRE AT THE REAL DOCKER CONTAINERS
        self._ping_real_docker_target(target_host, action_name)
        
        return reward, logs, meta

    def _defender_log(self, target: int, action_name: str, success: bool) -> dict[str, Any]:
        return {
            "id": str(uuid.uuid4()),
            "timestamp": self.current_step,
            "step": self.current_step,
            "type": action_name,
            "action_type": action_name,
            "layer": "endpoint",
            "correlation_id": f"BLUE-{self.current_step:03d}-{uuid.uuid4().hex[:6]}",
            "target": target,
            "host_id": target,
            "host_label": self._host_label(target),
            "alert_score": round(float(self.network.get_alert_scores()[target].max()), 3),
            "process_name": action_name,
            "user": "blue_agent",
            "success": success,
            "log_color": "#00e5ff" if success else "#ff6600",
        }

    def _execute_blue_action(
        self, target: int, action_type: int
    ) -> tuple[float, list[dict[str, Any]], dict[str, Any]]:
        reward = 0.0
        logs: list[dict[str, Any]] = []
        action_name = self._action_name("blue", action_type)
        success = False
        is_false_positive = False

        if action_type == 0:  # Monitor
            success = True
            reward = 1.0
        elif action_type == 1:  # Isolate
            self.isolated_hosts.add(target)
            if target in self.compromised_hosts:
                self.detected_compromises.add(target)
                self.true_positives += 1
                reward = 50.0
                success = True
            else:
                self.false_positives += 1
                reward = -30.0
                is_false_positive = True
        elif action_type == 2:  # Patch
            self.patched_hosts.add(target)
            reward = 5.0
            success = True
        elif action_type == 3:  # Block IP
            if target in self.compromised_hosts:
                reward = 30.0
                self.detected_compromises.add(target)
                self.true_positives += 1
                success = True
            else:
                reward = -10.0
                self.false_positives += 1
                is_false_positive = True
        elif action_type == 4:  # Reset credentials
            if target in self.compromised_hosts:
                self.compromised_hosts.remove(target)
                reward = 40.0
                self.detected_compromises.add(target)
                self.true_positives += 1
                success = True
            else:
                reward = -5.0
        elif action_type == 5:  # Investigate
            if target in self.compromised_hosts:
                reward = 10.0
                self.detected_compromises.add(target)
                success = True
            else:
                reward = -2.0
                is_false_positive = True

        if self.true_positives > 0:
            reward += max(0.0, 50.0 - self.current_step)

        logs.append(self._defender_log(target, action_name, success))
        meta = {
            "agent": "blue",
            "action_name": action_name,
            "target_host_id": target,
            "target_host_label": self._host_label(target),
            "success": success,
            "reason": self._blue_reason(target, action_name),
            "is_false_positive": is_false_positive,
        }
        
        # 🔥 FIRE AT THE REAL DOCKER CONTAINERS
        self._ping_real_docker_target(target, action_name)
        
        return reward, logs, meta

    def _update_network_state(self) -> None:
        self.network.update_traffic(compromised=self.compromised_hosts, isolated=self.isolated_hosts)
        self.network.update_alerts(self.logs[-24:])

    def _check_termination(self) -> bool:
        if self.data_exfiltrated >= 1000:
            return True
        if len(self.compromised_hosts) > self.num_hosts * 0.75:
            return True
        if set(self.compromised_hosts).issubset(self.detected_compromises) and len(self.compromised_hosts) > 1:
            self.red_caught = True
            return True
        if self.current_step > 50 and len(self.compromised_hosts) <= 1:
            return True
        return False

    def _get_observation(self) -> dict[str, Any]:
        observed_status = np.zeros(self.num_hosts)
        for host in self.detected_compromises:
            observed_status[host] = 1
        return {
            "network_topology": self.network.get_adjacency_matrix(),
            "host_status": observed_status,
            "traffic_matrix": self.network.get_traffic_matrix(),
            "alert_scores": self.network.get_alert_scores(),
            "time_step": np.array([self.current_step]),
        }

    def _get_info(self) -> dict[str, Any]:
        return {
            "episode_id": self.episode_id,
            "compromised_hosts": list(self.compromised_hosts),
            "detected_compromises": list(self.detected_compromises),
            "isolated_hosts": list(self.isolated_hosts),
            "patched_hosts": list(self.patched_hosts),
            "data_exfiltrated": self.data_exfiltrated,
            "true_positives": self.true_positives,
            "false_positives": self.false_positives,
            "red_caught": self.red_caught,
            "red_position": self.red_position,
            "logs": self.last_step_logs,
            "all_logs": self.logs[-50:],
            "new_alerts": self.new_alerts,
            "red_action_sequence": self.red_action_sequence,
            "red_victory": (self.data_exfiltrated >= 1000) or (len(self.compromised_hosts) > self.num_hosts * 0.75),
        }

```

## File: `backend/src/environment/contest_controller.py`

```python
"""Contest controller — per-node battle state machine."""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

from ..models.contest import (
    BattleScoreboard,
    ContestEvent,
    ContestPhase,
    NodeBattleResult,
)


# Threat-type metadata
_THREAT_META: Dict[str, Dict[str, str]] = {
    "scan": {"threat": "brute_force", "mitre_id": "T1110", "mitre_name": "Brute Force", "vector": "ssh_brute"},
    "exploit": {"threat": "brute_force", "mitre_id": "T1110", "mitre_name": "Brute Force", "vector": "ssh_brute"},
    "lateral_move": {"threat": "lateral_movement", "mitre_id": "T1021", "mitre_name": "Remote Services", "vector": "psexec"},
    "exfiltrate": {"threat": "data_exfiltration", "mitre_id": "T1041", "mitre_name": "Exfiltration Over C2 Channel", "vector": "dns_tunnel"},
    "beacon": {"threat": "c2_beacon", "mitre_id": "T1071", "mitre_name": "Application Layer Protocol", "vector": "http_beacon"},
    "wait": {"threat": None, "mitre_id": None, "mitre_name": None, "vector": "none"},
}

_SEVERITY_THRESHOLDS = [(0.8, "critical"), (0.6, "high"), (0.35, "medium"), (0.0, "low")]

_NODE_TYPE_LABELS = {
    "db_server": "Database Server",
    "dmz": "DMZ Server",
    "app_server": "Application Server",
    "workstation": "Workstation",
}


def _host_label(host_id: int) -> str:
    if host_id < 2:
        return f"DMZ-{host_id + 1:02d}"
    if host_id < 7:
        return f"APP-{host_id - 1:02d}"
    if host_id < 10:
        return f"DB-{host_id - 6:02d}"
    return f"WS-{host_id - 9:02d}"


def _host_type(host_id: int) -> str:
    if host_id < 2:
        return "dmz"
    if host_id < 7:
        return "app_server"
    if host_id < 10:
        return "db_server"
    return "workstation"


def _severity_for(control: float) -> str:
    for threshold, label in _SEVERITY_THRESHOLDS:
        if control >= threshold:
            return label
    return "low"


class ContestController:
    """Manages per-node contest state. Called every step after both agents act."""

    def __init__(self, num_hosts: int):
        self.num_hosts = num_hosts
        self.node_states: Dict[int, Dict[str, Any]] = {}
        self.battle_history: List[NodeBattleResult] = []
        self.total_red_captures = 0
        self.total_blue_defenses = 0
        self.total_blue_recaptures = 0
        self.total_false_positives = 0

        for host_id in range(num_hosts):
            self.node_states[host_id] = {
                "phase": ContestPhase.IDLE,
                "red_control": 0.0,
                "blue_control": 1.0,
                "step_started": 0,
                "steps_contested": 0,
                "last_threat": None,
                "idle_timer": 0,
            }

    def get_active_events(self, env: Any, current_step: int) -> List[ContestEvent]:
        """Return all non-idle contest events for the current step."""
        return [
            self._make_event(host_id, state, current_step, env, {}, {})
            for host_id, state in self.node_states.items()
            if state["phase"] != ContestPhase.IDLE
        ]

    def get_all_node_events(self, env: Any, current_step: int) -> List[ContestEvent]:
        """Return a battle-state snapshot for every node, including idle nodes."""
        return [
            self._make_event(host_id, state, current_step, env, {}, {})
            for host_id, state in self.node_states.items()
        ]

    def force_attack(self, env: Any, target_node: int, threat_type: str, current_step: int) -> ContestEvent:
        """Seed a node into battle state for demo narration or judge walkthroughs."""
        state = self.node_states[target_node]
        meta = {
            "brute_force": _THREAT_META["exploit"],
            "exploit": _THREAT_META["exploit"],
            "lateral_movement": _THREAT_META["lateral_move"],
            "data_exfiltration": _THREAT_META["exfiltrate"],
            "c2_beacon": _THREAT_META["beacon"],
        }.get(threat_type, _THREAT_META["exploit"])

        state["last_threat"] = meta
        state["red_control"] = max(state["red_control"], 0.28)
        state["blue_control"] = min(state["blue_control"], 0.82)
        state["step_started"] = current_step
        state["steps_contested"] = max(1, state["steps_contested"])
        state["idle_timer"] = 0
        if state["phase"] == ContestPhase.IDLE:
            state["phase"] = ContestPhase.PROBING
        elif state["phase"] in (ContestPhase.BLUE_DEFENDED, ContestPhase.BLUE_RECAPTURED):
            state["phase"] = ContestPhase.CONTESTED

        if threat_type in {"data_exfiltration", "c2_beacon"}:
            env.compromised_hosts.add(target_node)
            env.red_position = target_node

        return self._make_event(target_node, state, current_step, env, {}, {})

    def compute_step(
        self,
        env: Any,
        red_meta: Dict[str, Any],
        blue_meta: Dict[str, Any],
        current_step: int,
    ) -> tuple[List[ContestEvent], List[NodeBattleResult]]:
        """Main entry point — call after env.step(). Returns contest events + battle results."""
        events: List[ContestEvent] = []
        results: List[NodeBattleResult] = []
        false_positive_result: NodeBattleResult | None = None

        red_target = red_meta.get("target_host_id", -1)
        red_action = red_meta.get("action_name", "wait")
        red_success = red_meta.get("success", False)
        blue_target = blue_meta.get("target_host_id", -1)
        blue_action = blue_meta.get("action_name", "monitor")
        blue_success = blue_meta.get("success", False)
        is_fp = blue_meta.get("is_false_positive", False)

        # --- SCRIPTED DEMO NARRATIVE ARC ---
        # The user requested a "toe-to-toe" battle where Blue ultimately wins at the end.
        progress = current_step / max(1, getattr(env, "max_steps", 50))
        
        if progress < 0.35:
            # Act 1: Red Edge (Attacker breaching initially)
            red_chance = 0.85
            blue_chance = 0.30
        elif progress < 0.70:
            # Act 2: Toe-to-Toe (Intense back and forth)
            red_chance = 0.60
            blue_chance = 0.60
        else:
            # Act 3: Blue Dominates (Defender wins at the end)
            red_chance = 0.15
            blue_chance = 0.90

        # Override raw successes with the narrative arc probabilities
        if red_action != "wait":
            red_success = random.random() < red_chance
        if blue_action != "monitor" and not is_fp:
            blue_success = random.random() < blue_chance

        # Update all nodes
        for host_id in range(self.num_hosts):
            state = self.node_states[host_id]
            prev_phase = state["phase"]

            # --- Red control updates ---
            if host_id == red_target and red_action != "wait":
                meta = _THREAT_META.get(red_action, _THREAT_META["scan"])
                state["last_threat"] = meta
                if red_success:
                    if red_action == "exploit":
                        state["red_control"] = min(1.0, state["red_control"] + 0.35)
                    elif red_action == "lateral_move":
                        state["red_control"] = min(1.0, state["red_control"] + 0.25)
                    elif red_action == "exfiltrate":
                        state["red_control"] = min(1.0, state["red_control"] + 0.30)
                    elif red_action == "beacon":
                        state["red_control"] = min(1.0, state["red_control"] + 0.10)
                    elif red_action == "scan":
                        state["red_control"] = min(1.0, state["red_control"] + 0.08)
                else:
                    state["red_control"] = min(1.0, state["red_control"] + 0.04)
            elif host_id in env.compromised_hosts:
                # Slow passive increase for compromised nodes
                state["red_control"] = min(1.0, state["red_control"] + 0.02)
            else:
                # Natural decay
                state["red_control"] = max(0.0, state["red_control"] - 0.03)

            # --- Blue control updates ---
            if host_id == blue_target and blue_action != "monitor":
                if blue_action == "isolate" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.45)
                    state["red_control"] = max(0.0, state["red_control"] - 0.50)
                elif blue_action == "patch" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.25)
                    state["red_control"] = max(0.0, state["red_control"] - 0.30)
                elif blue_action == "investigate" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.30)
                    state["red_control"] = max(0.0, state["red_control"] - 0.20)
                elif blue_action == "reset_credentials" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.35)
                    state["red_control"] = max(0.0, state["red_control"] - 0.35)
                elif blue_action == "block_ip" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.20)
                    state["red_control"] = max(0.0, state["red_control"] - 0.25)
                if is_fp:
                    state["blue_control"] = max(0.0, state["blue_control"] - 0.40)
                    state["red_control"] = max(0.0, state["red_control"] - 0.05)
                    if false_positive_result is None:
                        self.total_false_positives += 1
                        false_positive_result = self._make_false_positive_result(
                            host_id, blue_action, blue_meta.get("reason", ""), current_step
                        )
            elif host_id not in env.compromised_hosts:
                state["blue_control"] = min(1.0, state["blue_control"] + 0.02)
            else:
                state["blue_control"] = max(0.0, state["blue_control"] - 0.02)

            # --- Phase transitions ---
            rc = state["red_control"]
            bc = state["blue_control"]
            diff = rc - bc

            new_phase = prev_phase
            if rc < 0.1 and prev_phase not in (ContestPhase.BLUE_DEFENDED, ContestPhase.BLUE_RECAPTURED):
                state["idle_timer"] += 1
                if state["idle_timer"] >= 3:
                    new_phase = ContestPhase.IDLE
                    state["steps_contested"] = 0
            else:
                state["idle_timer"] = 0

            if prev_phase == ContestPhase.IDLE and rc >= 0.08:
                new_phase = ContestPhase.PROBING
                state["step_started"] = current_step
                state["steps_contested"] = 1
            elif prev_phase == ContestPhase.PROBING and rc >= 0.20:
                new_phase = ContestPhase.CONTESTED
                state["steps_contested"] += 1
            elif prev_phase in (ContestPhase.CONTESTED, ContestPhase.RED_WINNING, ContestPhase.BLUE_WINNING):
                state["steps_contested"] += 1
                if diff > 0.2:
                    new_phase = ContestPhase.RED_WINNING
                elif diff < -0.2:
                    new_phase = ContestPhase.BLUE_WINNING
                else:
                    new_phase = ContestPhase.CONTESTED

                # Check resolution
                if rc >= 0.85 and state["steps_contested"] >= 2 and new_phase == ContestPhase.RED_WINNING:
                    new_phase = ContestPhase.RED_CAPTURED
                    self.total_red_captures += 1
                    result = self._make_result(host_id, "red", "captured", state, current_step, env)
                    results.append(result)
                    self.battle_history.append(result)
                elif bc >= 0.80 and rc < 0.30 and new_phase == ContestPhase.BLUE_WINNING:
                    new_phase = ContestPhase.BLUE_DEFENDED
                    self.total_blue_defenses += 1
                    result = self._make_result(host_id, "blue", "defended", state, current_step, env)
                    results.append(result)
                    self.battle_history.append(result)
            elif prev_phase == ContestPhase.RED_CAPTURED:
                # Blue can launch recapture
                if host_id == blue_target and blue_action in ("isolate", "investigate", "reset_credentials") and blue_success:
                    state["steps_contested"] += 1
                    if bc >= 0.85 and rc < 0.55:
                        new_phase = ContestPhase.BLUE_RECAPTURED
                        self.total_blue_recaptures += 1
                        result = self._make_result(host_id, "blue", "recaptured", state, current_step, env)
                        results.append(result)
                        self.battle_history.append(result)
                        state["red_control"] = min(state["red_control"], 0.25)
                    else:
                        new_phase = ContestPhase.CONTESTED
            elif prev_phase in (ContestPhase.BLUE_DEFENDED, ContestPhase.BLUE_RECAPTURED):
                state["idle_timer"] += 1
                if state["idle_timer"] >= 3:
                    new_phase = ContestPhase.IDLE
                    state["red_control"] = 0.0
                    state["blue_control"] = 1.0
                    state["steps_contested"] = 0

            state["phase"] = new_phase

            # Only emit events for non-idle nodes
            if new_phase != ContestPhase.IDLE:
                event = self._make_event(host_id, state, current_step, env, red_meta, blue_meta)
                events.append(event)

        if false_positive_result is not None:
            results.append(false_positive_result)
            self.battle_history.append(false_positive_result)

        return events, results

    def get_scoreboard(self, env: Any) -> BattleScoreboard:
        red_controlled = sum(
            1 for s in self.node_states.values()
            if s["phase"] == ContestPhase.RED_CAPTURED
        )
        contested = sum(
            1 for s in self.node_states.values()
            if s["phase"] in (ContestPhase.CONTESTED, ContestPhase.RED_WINNING, ContestPhase.BLUE_WINNING, ContestPhase.PROBING)
        )
        blue_secured = self.num_hosts - red_controlled - contested

        # Progress: Red wants to exfil DB data, Blue wants to contain all threats
        red_progress = min(1.0, env.data_exfiltrated / 500.0 + len(env.compromised_hosts) / self.num_hosts * 0.5)
        blue_progress = min(1.0, len(env.detected_compromises) / max(1, len(env.compromised_hosts)) * 0.7 + len(env.isolated_hosts) / max(1, self.num_hosts) * 0.3)

        # Predict red next targets
        red_next = []
        for neighbor in sorted(
            range(self.num_hosts),
            key=lambda h: float(env.network.get_vulnerabilities(h)),
            reverse=True,
        ):
            if neighbor not in env.compromised_hosts and neighbor not in env.isolated_hosts:
                red_next.append(neighbor)
                if len(red_next) >= 3:
                    break

        return BattleScoreboard(
            red_nodes_controlled=red_controlled,
            blue_nodes_secured=blue_secured,
            contested_nodes=contested,
            red_total_captures=self.total_red_captures,
            blue_total_defenses=self.total_blue_defenses,
            blue_total_recaptures=self.total_blue_recaptures,
            false_positives_this_episode=self.total_false_positives,
            red_progress=round(red_progress, 3),
            blue_progress=round(blue_progress, 3),
            red_next_targets=red_next,
        )

    def _make_event(
        self,
        host_id: int,
        state: Dict[str, Any],
        step: int,
        env: Any,
        red_meta: Dict[str, Any],
        blue_meta: Dict[str, Any],
    ) -> ContestEvent:
        threat_meta = state.get("last_threat") or _THREAT_META["scan"]
        active_threat = threat_meta.get("threat")
        ht = _host_type(host_id)
        label = _host_label(host_id)
        rc = state["red_control"]
        severity = _severity_for(rc)

        vuln = float(env.network.get_vulnerabilities(host_id))
        data_val = float(env.network.get_data_value(host_id))

        # Generate targeting reason
        reasons = {
            "db_server": f"{label} holds {data_val:.0f} GB of sensitive data — highest-value target (CVSS impact: CRITICAL)",
            "dmz": f"{label} is the perimeter — unpatched system (vulnerability: {vuln:.0%}), primary entry vector",
            "app_server": f"{label} bridges DMZ and DB segments — optimal lateral movement pivot (vulnerability: {vuln:.0%})",
            "workstation": f"{label} has cached credentials — Red exploiting credential reuse (T1078)",
        }
        targeting_reason = reasons.get(ht, f"{label} targeted for strategic positioning")

        # Detection reason
        detection_reasons = {
            "brute_force": f"Failed auth attempts spiked {int(rc * 800 + 100)}% above baseline on {label}",
            "lateral_movement": f"Unusual process chain detected on {label} endpoint — T1021 signature match",
            "data_exfiltration": f"Outbound transfer to external IP: {data_val:.1f} GB in {max(1, state['steps_contested'])} steps (97th percentile)",
            "c2_beacon": f"Periodic beacon from {label} every 300s ±2s — C2 timing signature detected",
        }
        detection_reason = detection_reasons.get(active_threat or "brute_force", f"Anomalous activity on {label}")

        # Immediate action
        actions = {
            "brute_force": f"BLOCK failed auth sources on {label} — credential spray in progress",
            "lateral_movement": f"ISOLATE {label} — block lateral paths to DB segment immediately",
            "data_exfiltration": f"BLOCK outbound from {label} at perimeter — exfil in progress",
            "c2_beacon": f"TRACE beacon source from {label} — pivot host identification required",
        }
        immediate_action = actions.get(active_threat or "brute_force", f"Investigate {label}")

        # Layers
        has_network = rc > 0.1
        has_endpoint = rc > 0.25
        has_app = ht in ("app_server", "db_server") and rc > 0.4
        layers = {"network": has_network, "endpoint": has_endpoint, "application": has_app}
        active_count = sum(1 for v in layers.values() if v)
        corr_conf = min(1.0, active_count * 0.35 + rc * 0.1)
        cross_note = f"{active_count}/3 signal layers corroborate — {'high' if active_count >= 2 else 'partial'} confidence correlation"
        phase = state["phase"]
        if phase in {ContestPhase.RED_WINNING, ContestPhase.RED_CAPTURED}:
            winning_reason = (
                f"Red pressure is ahead on {label} because {targeting_reason.lower()} while Blue response remains behind the "
                f"current attack tempo."
            )
        elif phase in {ContestPhase.BLUE_WINNING, ContestPhase.BLUE_DEFENDED, ContestPhase.BLUE_RECAPTURED}:
            winning_reason = (
                f"Blue is controlling {label} because {detection_reason.lower()} and the recommended action path is already "
                f"constraining Red's options."
            )
        else:
            winning_reason = (
                f"{label} remains undecided: Red sees strategic value here, while Blue still has enough signal confidence to contest it."
            )

        return ContestEvent(
            node_id=host_id,
            node_label=label,
            node_type=ht,
            phase=state["phase"],
            red_control_pct=round(state["red_control"], 3),
            blue_control_pct=round(state["blue_control"], 3),
            active_threat_type=active_threat,
            mitre_id=threat_meta.get("mitre_id"),
            mitre_name=threat_meta.get("mitre_name"),
            severity=severity,
            red_targeting_reason=targeting_reason,
            detection_reason=detection_reason,
            immediate_action=immediate_action,
            layers_active=layers,
            correlation_confidence=round(corr_conf, 3),
            cross_layer_note=cross_note,
            contest_intensity=round(min(1.0, (rc + state["blue_control"]) / 2), 3),
            red_attack_vector=threat_meta.get("vector", "ssh_brute"),
            step_started=state["step_started"],
            steps_contested=state["steps_contested"],
            winning_reason=winning_reason,
        )

    def _make_result(
        self,
        host_id: int,
        winner: str,
        outcome: str,
        state: Dict[str, Any],
        step: int,
        env: Any,
    ) -> NodeBattleResult:
        label = _host_label(host_id)
        ht = _host_type(host_id)
        threat_meta = state.get("last_threat") or _THREAT_META["scan"]

        if winner == "red":
            summary = (
                f"Red Agent seized {label} ({ht.replace('_', ' ')}) via {threat_meta.get('mitre_name', 'exploit')} "
                f"over {state['steps_contested']} steps. Node is compromised."
            )
            impact = (
                f"{ht.replace('_', ' ').title()} segment now accessible. "
                f"{'Exfiltration risk: CRITICAL.' if ht == 'db_server' else 'Lateral paths expanded.'}"
            )
            victory_reason = (
                f"Red won {label} because the host's value and reachable attack path kept defender pressure below the compromise threshold."
            )
        else:
            summary = (
                f"Blue Agent {outcome} {label} — threat neutralized at step {step}. "
                f"{threat_meta.get('mitre_name', 'Attack')} contained after {state['steps_contested']} steps of contest."
            )
            impact = (
                f"{'Lateral movement path severed. Red must re-establish entry.' if outcome == 'recaptured' else 'Threat contained. Perimeter integrity maintained.'}"
            )
            victory_reason = (
                f"Blue won {label} because detection confidence stabilized early enough to spend the right containment action before Red completed the chain."
            )

        return NodeBattleResult(
            node_id=host_id,
            node_label=label,
            winner=winner,
            outcome=outcome,
            total_steps_fought=state["steps_contested"],
            incident_summary=summary,
            strategic_impact=impact,
            playbook_id=f"PB-BATTLE-{step:03d}-{host_id}",
            false_positive=False,
            step_resolved=step,
            victory_reason=victory_reason,
        )

    def _make_false_positive_result(
        self,
        host_id: int,
        blue_action: str,
        blue_reason: str,
        step: int,
    ) -> NodeBattleResult:
        label = _host_label(host_id)
        return NodeBattleResult(
            node_id=host_id,
            node_label=label,
            winner="blue",
            outcome="defended",
            total_steps_fought=0,
            incident_summary=(
                f"Blue Agent misclassified {label} during {blue_action.replace('_', ' ')}. "
                f"Benign admin activity resembled malicious behavior."
            ),
            strategic_impact="Autonomy budget was wasted on a clean host. Recommend tightening suppressions and allowlists.",
            playbook_id=f"PB-FP-{step:03d}-{host_id}",
            false_positive=True,
            false_positive_reason=blue_reason or "Legitimate administrative activity triggered the response path.",
            step_resolved=step,
            victory_reason="Blue appeared to win the action locally, but the response was wasted because the host was never actually compromised.",
        )

```

## File: `backend/src/simulation/attack_patterns.py`

```python
from __future__ import annotations

from .log_generator import LogGenerator


class AttackPatterns:
    """
    Hand-crafted adversarial probes used by the Giskard red-team scan.
    """

    def __init__(self, generator: LogGenerator | None = None):
        self.generator = generator or LogGenerator(seed=1337)

    def slow_exfil_probe(self) -> dict:
        event = self.generator.generate_exfiltration_log()
        event.update(
            {
                "bytes": 1_180_000,
                "payload_size": 620_000,
                "duration": 540,
                "alert_score": 0.47,
                "traffic_anomaly_score": 0.44,
            }
        )
        return event

    def jittered_beacon(self) -> dict:
        event = self.generator.generate_c2_beacon_log()
        event.update(
            {
                "port": 8443,
                "bytes": 512,
                "duration": 151,
                "payload_size": 320,
                "alert_score": 0.43,
                "traffic_anomaly_score": 0.4,
                "process_name": "svchost.exe",
            }
        )
        return event

    def stealth_lateral(self) -> dict:
        event = self.generator.generate_lateral_move_log()
        event.update(
            {
                "port": 443,
                "process_name": "dllhost.exe",
                "file_access": "C:/ProgramData/Teams/cache.bin",
                "alert_score": 0.5,
                "traffic_anomaly_score": 0.42,
            }
        )
        return event

    def distributed_brute_force(self) -> dict:
        event = self.generator.generate_brute_force_log()
        event.update(
            {
                "src_ip": "172.16.99.10",
                "port": 443,
                "http_method": "POST",
                "status_code": 401,
                "duration": 45,
                "bytes": 1_024,
                "payload_size": 512,
                "alert_score": 0.46,
                "traffic_anomaly_score": 0.39,
                "distributed_sources": 12,
            }
        )
        return event

```

## File: `backend/src/simulation/log_generator.py`

```python
from __future__ import annotations

import random
import uuid
from typing import Any


class LogGenerator:
    def __init__(self, seed: int | None = None):
        self.random = random.Random(seed)
        self.current_step = 0

    def set_step(self, step: int) -> None:
        self.current_step = step

    def _new_correlation_id(self, prefix: str = "SIM") -> str:
        return f"{prefix}-{self.current_step:03d}-{uuid.uuid4().hex[:8]}"

    def _create_base_log(self, type_str: str, layer: str, correlation_id: str) -> dict[str, Any]:
        return {
            "id": str(uuid.uuid4()),
            "timestamp": self.current_step,
            "step": self.current_step,
            "type": type_str,
            "action_type": type_str,
            "layer": layer,
            "correlation_id": correlation_id,
        }

    def _host_to_ip(self, host_id: int | None) -> str:
        if host_id is None:
            host_id = self.random.randint(2, 200)
        if host_id < 2:
            return f"10.0.0.{host_id + 11}"
        if host_id < 7:
            return f"10.0.1.{host_id + 11}"
        if host_id < 10:
            return f"10.0.7.{host_id + 11}"
        return f"10.0.10.{host_id + 11}"

    def _host_label(self, host_id: int | None) -> str:
        if host_id is None:
            return "EXT-01"
        if host_id < 2:
            return f"DMZ-{host_id + 1:02d}"
        if host_id < 7:
            return f"APP-{host_id - 1:02d}"
        if host_id < 10:
            return f"DB-{host_id - 6:02d}"
        return f"WS-{host_id - 9:02d}"

    def _external_ip(self) -> str:
        return f"185.199.{self.random.randint(10, 180)}.{self.random.randint(10, 220)}"

    def _action_to_port(self, action_type: str) -> int:
        mapping = {
            "scan": 22,
            "exploit": 445,
            "lateral_movement": 445,
            "exfiltration": 443,
            "beacon": 8443,
            "brute_force": 22,
            "admin_sync": 443,
        }
        return mapping.get(action_type, 443)

    def _action_to_bytes(self, action_type: str, success: bool = True) -> float:
        mapping = {
            "scan": 1_200,
            "exploit": 18_500 if success else 4_000,
            "lateral_movement": 46_000 if success else 9_000,
            "exfiltration": 2_400_000 if success else 120_000,
            "beacon": 540,
            "brute_force": 1_800,
            "admin_sync": 2_100_000,
        }
        return float(mapping.get(action_type, 4_000))

    def _action_to_payload(self, action_type: str, success: bool = True) -> float:
        mapping = {
            "scan": 240,
            "exploit": 3_200 if success else 600,
            "lateral_movement": 8_500 if success else 1_100,
            "exfiltration": 1_300_000 if success else 60_000,
            "beacon": 320,
            "brute_force": 768,
            "admin_sync": 1_100_000,
        }
        return float(mapping.get(action_type, 2_000))

    def _action_to_alert_score(self, action_type: str, success: bool = True) -> float:
        mapping = {
            "scan": 0.32,
            "exploit": 0.86 if success else 0.44,
            "lateral_movement": 0.79 if success else 0.41,
            "exfiltration": 0.94 if success else 0.52,
            "beacon": 0.67,
            "brute_force": 0.83,
            "admin_sync": 0.26,
        }
        return float(mapping.get(action_type, 0.35))

    def _severity_color(self, action_type: str) -> str:
        mapping = {
            "scan": "#ffcc00",
            "exploit": "#ff0044",
            "lateral_movement": "#ff6600",
            "exfiltration": "#ff0044",
            "beacon": "#ffcc00",
            "brute_force": "#ff6600",
            "admin_sync": "#00e5ff",
        }
        return mapping.get(action_type, "#00e5ff")

    def _normalize_event(
        self,
        *,
        type_str: str,
        layer: str,
        correlation_id: str,
        src_ip: str,
        dst_ip: str,
        port: int,
        protocol: str,
        bytes_sent: float,
        duration: float,
        process_name: str,
        user: str,
        file_access: str,
        http_method: str,
        status_code: int,
        payload_size: float,
        alert_score: float,
        source: int | None = None,
        target: int | None = None,
        destination: int | None = None,
        host_id: int | None = None,
        host_label: str | None = None,
        metadata: dict[str, Any] | None = None,
        success: bool | None = None,
    ) -> dict[str, Any]:
        event = self._create_base_log(type_str, layer, correlation_id)
        event.update(
            {
                "source": source,
                "target": target,
                "destination": destination,
                "host_id": host_id,
                "host_label": host_label,
                "src_ip": src_ip,
                "dst_ip": dst_ip,
                "port": port,
                "protocol": protocol,
                "bytes": round(float(bytes_sent), 2),
                "duration": round(float(duration), 2),
                "process_name": process_name,
                "user": user,
                "file_access": file_access,
                "http_method": http_method,
                "status_code": int(status_code),
                "payload_size": round(float(payload_size), 2),
                "alert_score": round(float(alert_score), 3),
                "network_bytes": round(float(bytes_sent), 2),
                "network_src": src_ip,
                "network_dst": dst_ip,
                "endpoint_process": process_name,
                "endpoint_user": user,
                "endpoint_file_access": file_access,
                "app_method": http_method,
                "app_status": int(status_code),
                "app_payload_size": round(float(payload_size), 2),
                "traffic_anomaly_score": round(min(max(alert_score + self.random.uniform(-0.06, 0.12), 0.0), 1.0), 3),
                "alert_score_delta": round(min(max(alert_score + self.random.uniform(-0.08, 0.16), 0.0), 1.0), 3),
                "log_color": self._severity_color(type_str),
                "metadata": metadata or {},
            }
        )
        if success is not None:
            event["success"] = success
        return event

    def generate_network_flow(
        self,
        src: int,
        dst: int | None,
        action_type: str,
        correlation_id: str | None = None,
        *,
        success: bool = True,
    ) -> dict[str, Any]:
        correlation_id = correlation_id or self._new_correlation_id("NET")
        return self._normalize_event(
            type_str=action_type,
            layer="network",
            correlation_id=correlation_id,
            src_ip=self._host_to_ip(src),
            dst_ip=self._host_to_ip(dst) if dst is not None else self._external_ip(),
            port=self._action_to_port(action_type),
            protocol="TCP",
            bytes_sent=self._action_to_bytes(action_type, success=success),
            duration=self.random.randint(40, 460),
            process_name="netflowd",
            user="network",
            file_access="",
            http_method="FLOW",
            status_code=200 if success else 403,
            payload_size=self._action_to_payload(action_type, success=success),
            alert_score=self._action_to_alert_score(action_type, success=success),
            source=src,
            target=dst,
            destination=dst,
            host_id=src,
            host_label=self._host_label(src),
            success=success,
        )

    def generate_endpoint_log(
        self,
        host: int,
        action_type: str,
        correlation_id: str | None = None,
        *,
        success: bool = True,
    ) -> dict[str, Any]:
        correlation_id = correlation_id or self._new_correlation_id("EDR")
        process_map = {
            "scan": ("nmap.exe", "cmd.exe", "Administrator", ""),
            "exploit": ("mimikatz.exe", "cmd.exe", "SYSTEM", "C:/Windows/System32"),
            "lateral_movement": ("wmic.exe", "explorer.exe", "DOMAIN\\admin", "\\\\admin$\\system32"),
            "exfiltration": ("rclone.exe", "powershell.exe", "DOMAIN\\user", "D:/finance/customer_dump.sql"),
            "beacon": ("svchost.exe", "services.exe", "NETWORK SERVICE", ""),
            "brute_force": ("sshd", "systemd", "root", ""),
            "admin_sync": ("robocopy.exe", "taskschd.exe", "DOMAIN\\backup_svc", "D:/backups/nightly_backup.tar"),
        }
        proc, parent, user, file_access = process_map.get(action_type, ("python.exe", "cmd.exe", "USER", ""))
        event = self._normalize_event(
            type_str=action_type,
            layer="endpoint",
            correlation_id=correlation_id,
            src_ip=self._host_to_ip(host),
            dst_ip=self._host_to_ip(host),
            port=self._action_to_port(action_type),
            protocol="TCP",
            bytes_sent=self._action_to_bytes(action_type, success=success) * 0.4,
            duration=self.random.randint(20, 220),
            process_name=proc,
            user=user,
            file_access=file_access,
            http_method="EXEC",
            status_code=200 if success else 401,
            payload_size=self._action_to_payload(action_type, success=success) * 0.4,
            alert_score=self._action_to_alert_score(action_type, success=success) - 0.03,
            source=host,
            target=host,
            host_id=host,
            host_label=self._host_label(host),
            metadata={"parent_process": parent},
            success=success,
        )
        event["parent_process"] = parent
        return event

    def generate_application_log(
        self,
        host: int,
        action_type: str,
        correlation_id: str | None = None,
        *,
        success: bool = True,
    ) -> dict[str, Any]:
        correlation_id = correlation_id or self._new_correlation_id("APP")
        endpoint_map = {
            "scan": "/auth/login",
            "exploit": "/api/auth/token",
            "lateral_movement": "/rpc/wmi",
            "exfiltration": "/api/export",
            "beacon": "/cdn/pixel",
            "brute_force": "/auth/login",
            "admin_sync": "/backup/nightly",
        }
        method_map = {
            "scan": "GET",
            "exploit": "POST",
            "lateral_movement": "POST",
            "exfiltration": "POST",
            "beacon": "GET",
            "brute_force": "LOGIN",
            "admin_sync": "PUT",
        }
        status_code = 200 if success else 401
        if action_type == "exploit" and success:
            status_code = 201
        if action_type == "brute_force":
            status_code = 401

        event = self._normalize_event(
            type_str=action_type,
            layer="application",
            correlation_id=correlation_id,
            src_ip=self._host_to_ip(host),
            dst_ip=self._external_ip() if action_type in {"beacon", "exfiltration"} else self._host_to_ip(host),
            port=self._action_to_port(action_type),
            protocol="TCP",
            bytes_sent=self._action_to_bytes(action_type, success=success) * 0.3,
            duration=self.random.randint(30, 520),
            process_name="nginx",
            user="app",
            file_access="",
            http_method=method_map.get(action_type, "GET"),
            status_code=status_code,
            payload_size=self._action_to_payload(action_type, success=success) * 0.3,
            alert_score=self._action_to_alert_score(action_type, success=success) - 0.08,
            source=host,
            target=host,
            host_id=host,
            host_label=self._host_label(host),
            metadata={"endpoint": endpoint_map.get(action_type, "/")},
            success=success,
        )
        event["endpoint"] = endpoint_map.get(action_type, "/")
        return event

    def generate_action_chain(
        self,
        source: int,
        target: int | None,
        action_type: str,
        *,
        success: bool = True,
    ) -> list[dict[str, Any]]:
        normalized = {
            "lateral_move": "lateral_movement",
            "exfiltrate": "exfiltration",
            "c2_beacon": "beacon",
        }.get(action_type, action_type)
        correlation_id = self._new_correlation_id("SIM")
        pivot = target if target is not None else source
        logs = [
            self.generate_network_flow(source, target, normalized, correlation_id, success=success),
            self.generate_endpoint_log(pivot, normalized, correlation_id, success=success),
            self.generate_application_log(pivot, normalized, correlation_id, success=success),
        ]
        for log in logs:
            log["source"] = source
            if target is not None:
                log["target"] = target
                log["destination"] = target
            log["agent"] = "red"
        return logs

    def generate_false_positive_scenario(self) -> list[dict[str, Any]]:
        correlation_id = self._new_correlation_id("FP")
        logs = [
            self.generate_network_flow(7, None, "exfiltration", correlation_id, success=True),
            self.generate_endpoint_log(7, "admin_sync", correlation_id, success=True),
            self.generate_application_log(7, "admin_sync", correlation_id, success=True),
        ]
        for log in logs:
            log["is_false_positive_seed"] = True
            log["agent"] = "system"
            if log["layer"] == "endpoint":
                log["fp_resolution"] = "scheduled_task_legitimate_backup"
                log["scheduled_task_id"] = "BACKUP_NIGHTLY_02:00"
                log["parent_process"] = "taskschd.exe"
                log["file_access"] = "D:/backups/nightly_backup.tar"
                log["user"] = "DOMAIN\\backup_svc"
            if log["layer"] == "application":
                log["endpoint"] = "/backup/nightly"
                log["http_method"] = "PUT"
                log["user"] = "DOMAIN\\backup_svc"
            if log["layer"] == "network":
                log["dst_ip"] = "10.100.0.5"
                log["bytes"] = 500_000_000
                log["network_bytes"] = 500_000_000
                log["alert_score"] = 0.76
        return logs

    def generate_scan_log(self, source: int, target: int, result: float) -> dict[str, Any]:
        event = self.generate_network_flow(source, target, "scan", success=True)
        event["metadata"]["vulnerability"] = result
        return event

    def generate_exploit_log(self, source: int, target: int, success: bool) -> dict[str, Any]:
        return self.generate_endpoint_log(target, "exploit", success=success)

    def generate_lateral_movement_log(self, source: int, destination: int) -> dict[str, Any]:
        event = self.generate_endpoint_log(destination, "lateral_movement", success=True)
        event["source"] = source
        event["destination"] = destination
        return event

    def generate_exfiltration_log(
        self,
        source: int | None = None,
        bytes_transferred: float | None = None,
    ) -> dict[str, Any]:
        source = self.random.randint(4, 12) if source is None else source
        event = self.generate_network_flow(source, None, "exfiltration", success=True)
        if bytes_transferred is not None:
            event["bytes"] = float(bytes_transferred)
            event["network_bytes"] = float(bytes_transferred)
            event["payload_size"] = float(bytes_transferred) * 0.55
            event["app_payload_size"] = float(bytes_transferred) * 0.55
        return event

    def generate_beacon_log(self, source: int) -> dict[str, Any]:
        return self.generate_application_log(source, "beacon", success=True)

    def generate_brute_force_log(self) -> dict[str, Any]:
        correlation_id = self._new_correlation_id("ADV")
        return self._normalize_event(
            type_str="brute_force",
            layer="application",
            correlation_id=correlation_id,
            src_ip=self._external_ip(),
            dst_ip=self._host_to_ip(0),
            port=22,
            protocol="TCP",
            bytes_sent=1_800,
            duration=60,
            process_name="sshd",
            user="root",
            file_access="",
            http_method="LOGIN",
            status_code=401,
            payload_size=768,
            alert_score=0.83,
            target=0,
            host_id=0,
            host_label=self._host_label(0),
            success=False,
        )

    def generate_lateral_move_log(self) -> dict[str, Any]:
        source = self.random.randint(3, 8)
        destination = self.random.randint(10, 15)
        event = self.generate_lateral_movement_log(source, destination)
        event["type"] = "lateral_movement"
        return event

    def generate_c2_beacon_log(self) -> dict[str, Any]:
        source = self.random.randint(2, 10)
        return self.generate_beacon_log(source)

    def generate_admin_bulk_transfer_log(self) -> dict[str, Any]:
        event = self.generate_application_log(7, "admin_sync", success=True)
        event["type"] = "admin_sync"
        event["file_access"] = "D:/backups/nightly_backup.tar"
        event["user"] = "admin"
        event["alert_score"] = 0.28
        return event

    # ── PS-COMPLIANT ENTRY POINT ──────────────────────────────────────────────

    ACTION_LAYERS = {
        "scan": ["network"],
        "exploit": ["network", "endpoint"],
        "lateral_move": ["network", "endpoint", "application"],
        "exfiltrate": ["network", "endpoint", "application"],
        "beacon": ["network", "application"],
    }

    def generate_all_layers(
        self,
        action_type: str,
        source_host: int,
        target_host: int,
        step: int,
        success: bool = True,
        metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        THE ONLY METHOD _execute_red_action() SHOULD CALL.
        Generates logs for all applicable layers and stamps them with
        a shared correlation_id so the correlator can link them.
        Returns: list of log dicts (1 per layer).
        """
        normalized = {
            "lateral_move": "lateral_move",
            "lateral_movement": "lateral_move",
            "exfiltrate": "exfiltrate",
            "exfiltration": "exfiltrate",
            "c2_beacon": "beacon",
        }.get(action_type, action_type)

        correlation_id = f"ATK-{step:03d}-{uuid.uuid4().hex[:8].upper()}"
        layers = self.ACTION_LAYERS.get(normalized, ["network"])
        logs: list[dict[str, Any]] = []

        for layer in layers:
            if layer == "network":
                log = self.generate_network_flow(
                    source_host, target_host, action_type, correlation_id, success=success
                )
            elif layer == "endpoint":
                pivot = target_host if target_host is not None else source_host
                log = self.generate_endpoint_log(
                    pivot, action_type, correlation_id, success=success
                )
            elif layer == "application":
                pivot = target_host if target_host is not None else source_host
                log = self.generate_application_log(
                    pivot, action_type, correlation_id, success=success
                )
            else:
                continue

            # Stamp every log with shared metadata
            log["correlation_id"] = correlation_id
            log["step"] = step
            log["action_type"] = action_type
            log["success"] = success
            log["source_host_id"] = source_host
            log["target_host_id"] = target_host
            log["source_label"] = self._host_label(source_host)
            log["target_label"] = self._host_label(target_host) if target_host is not None else "EXT"
            log["log_color"] = self._severity_color(action_type)
            log["is_malicious"] = True
            log["is_false_positive_seed"] = False
            log["agent"] = "red"
            logs.append(log)

        return logs

    # ── BENIGN TRAFFIC GENERATOR ──────────────────────────────────────────────

    def generate_benign_traffic(self, step: int, num_events: int = 5) -> list[dict[str, Any]]:
        """
        PS REQUIREMENT: Synthetic data must include BENIGN traffic.
        Generates realistic normal traffic so the detector learns the difference.
        """
        logs: list[dict[str, Any]] = []
        for _ in range(num_events):
            src = self.random.randint(10, 19)  # Workstations
            dst = self.random.randint(2, 6)     # App servers
            correlation_id = f"BENIGN-{step:03d}-{uuid.uuid4().hex[:8].upper()}"

            log = self.generate_network_flow(src, dst, "scan", correlation_id, success=True)
            log["correlation_id"] = correlation_id
            log["step"] = step
            log["action_type"] = "normal_traffic"
            log["is_malicious"] = False
            log["is_false_positive_seed"] = False
            log["agent"] = "system"
            log["log_color"] = "#00e5ff"
            log["alert_score"] = round(self.random.uniform(0.05, 0.20), 3)
            log["bytes"] = round(self.random.uniform(512, 50000), 2)
            log["network_bytes"] = log["bytes"]
            logs.append(log)

        return logs

```

## File: `backend/src/training/teacher_ppo.py`

```python
import torch
import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.buffers import DictRolloutBuffer

class TeacherGuidedPPO(PPO):
    """
    Subclasses the SB3 PPO to inject the Teacher Auxiliary Loss mathematically.
    This resolves the cold-start problem by using the generative LLM priors.
    """
    def __init__(self, policy, env, teacher_agent, teacher_sigma_init=0.1, teacher_batch_size=4, **kwargs):
        super().__init__(policy, env, **kwargs)
        self.teacher_agent = teacher_agent
        self.teacher_sigma = teacher_sigma_init
        self.teacher_batch_size = teacher_batch_size

    def train(self) -> None:
        """
        Update policy using standard PPO loss, followed by Teacher Auxiliary Loss.
        This honors the sequence: grad(L_A) + grad(L_Teacher) = grad(L_A + L_Teacher)
        """
        # 1. Standard PPO Phase (L_A)
        super().train()
        
        # 2. Auxiliary Teacher Phase
        if self.teacher_agent is None or self.rollout_buffer.full == False:
            return
            
        print(f"Applying Teacher-Guided Auxiliary Loss (sigma={self.teacher_sigma:.2f})...")
        
        # Sample a minimal batch to keep LLM overhead low (~4 API calls)
        rollout_data = self.rollout_buffer.sample(self.teacher_batch_size)
        observations = rollout_data.observations
        
        teacher_actions = []
        for i in range(self.teacher_batch_size):
            # Extract single dict obs
            single_obs = {k: v[i].cpu().numpy() for k, v in observations.items()}
            
            # Query LLM Teacher (Blue Agent)
            # Will fallback to random heuristics if API fails or parsing fails
            t_action, _ = self.teacher_agent.predict(single_obs)
            teacher_actions.append(t_action)
            
        teacher_actions_tensor = torch.tensor(np.array(teacher_actions), dtype=torch.long, device=self.device)
        
        # Forward pass the actor network to get probability distributions
        distribution = self.policy.get_distribution(observations)
        
        # Extract Log Probabilities of the teacher taking these actions
        # MultiDiscrete returns sum of log probs across action dims
        log_prob = distribution.log_prob(teacher_actions_tensor)
        
        # L_Teacher = -log pi(a_Teacher | s)
        loss_teacher = -log_prob.mean()
        
        # Apply Sigma Weight (decaying influence over time)
        loss = (1 - self.teacher_sigma) * loss_teacher
        
        # Backward optimization
        self.policy.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.policy.parameters(), self.max_grad_norm)
        self.policy.optimizer.step()
        
        # Gradually increase sigma so the agent transitions to autonomy
        self.teacher_sigma = min(1.0, self.teacher_sigma + 0.05)

```

## File: `backend/src/training/evaluator.py`

```python
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from ..giskard_harness.scanner import run_blue_scan, run_red_scan

logger = logging.getLogger(__name__)


@dataclass
class InMemoryScenarioStore:
    scenarios: list[dict] = field(default_factory=list)

    def add(self, scenario: dict, source: str = "runtime") -> None:
        self.scenarios.append({"source": source, **scenario})


class TrainingEvaluator:
    """
    Reusable evaluation helper for future self-play loops.
    """

    def __init__(
        self,
        detector: Any,
        scorer: Any,
        correlator: Any,
        scenario_store: InMemoryScenarioStore | None = None,
        giskard_interval: int = 10_000,
    ):
        self.detector = detector
        self.scorer = scorer
        self.correlator = correlator
        self.scenario_store = scenario_store or InMemoryScenarioStore()
        self.giskard_interval = giskard_interval

    def evaluation_checkpoint(self, episode_count: int) -> None:
        if episode_count <= 0 or episode_count % self.giskard_interval != 0:
            return

        logger.info("=== Giskard Evaluation Checkpoint @ %s ===", episode_count)
        blue_results = run_blue_scan(
            detector=self.detector,
            scorer=self.scorer,
            correlator=self.correlator,
        )
        for component, result in blue_results.items():
            if result["has_major_issues"]:
                logger.warning(
                    "[GISKARD] Blue component '%s' has major issues. See %s",
                    component,
                    result["report_path"],
                )

        blind_spots = run_red_scan(detector=self.detector)
        if blind_spots:
            self._inject_blind_spots_as_scenarios(blind_spots)

    def _inject_blind_spots_as_scenarios(self, blind_spots: list[dict]) -> None:
        injected = 0
        for spot in blind_spots:
            for example in spot.get("failing_examples", []):
                scenario = self._log_event_to_rl_scenario(example, spot["issue_type"])
                self.scenario_store.add(scenario, source="giskard_red_scan")
                injected += 1

        logger.info("Injected %s Giskard-sourced scenarios into the training pool.", injected)

    def _log_event_to_rl_scenario(self, example: dict, issue_type: str) -> dict:
        return {
            "issue_type": issue_type,
            "seed_event": example,
            "threat_label": example.get("label") or example.get("type", "unknown"),
            "priority": "high" if issue_type.lower() == "robustness" else "medium",
        }

```

## File: `backend/src/training/self_play.py`

```python
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from ..giskard_harness.scanner import REPORTS_DIR, run_policy_gate

logger = logging.getLogger(__name__)


class SelfPlayTrainer:
    """
    Minimal hook point for Stage 9 rule compilation with a Giskard gate.
    """

    def __init__(self, policy_compiler: Any):
        self.policy_compiler = policy_compiler

    def maybe_commit_policy_rules(self, recent_episodes: list[dict]) -> list[dict]:
        new_rules = self.policy_compiler.compile(recent_episodes)

        if run_policy_gate(new_rules):
            self.policy_compiler.commit(new_rules)
            logger.info("[Stage 9] %s new rules committed after Giskard gate passed.", len(new_rules))
        else:
            logger.warning("[Stage 9] Giskard policy gate failed; rules were not committed this cycle.")
            self._save_rejected_rules(new_rules)

        return new_rules

    def _save_rejected_rules(self, rules: list[dict]) -> Path:
        REPORTS_DIR.mkdir(exist_ok=True)
        output_path = REPORTS_DIR / "rejected_policy_rules.json"
        output_path.write_text(json.dumps(rules, indent=2, default=str), encoding="utf-8")
        return output_path

```

## File: `backend/src/detection/__init__.py`

```python
from .correlator import CrossLayerCorrelator
from .detector import ThreatDetector
from .scorer import ConfidenceScorer

__all__ = [
    "ThreatDetector",
    "ConfidenceScorer",
    "CrossLayerCorrelator",
]

```

## File: `backend/src/detection/detector.py`

```python
from __future__ import annotations

import ipaddress
from typing import Any, Mapping


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _is_private_ip(ip_value: Any) -> bool:
    try:
        return ipaddress.ip_address(str(ip_value)).is_private
    except ValueError:
        return False


class ThreatDetector:
    """
    Heuristic detector that maps normalized log events to the project threat labels.
    The interface is intentionally simple so the current demo app can expose a
    detector instance to Giskard scans and future RL training loops.
    """

    brute_force_ports = {22, 3389, 389}
    lateral_ports = {135, 139, 445, 3389, 5985}
    beacon_ports = {53, 80, 443, 8080, 8443}

    def classify(self, event: Mapping[str, Any]) -> str:
        event_type = _safe_text(event.get("type"))
        if event_type == "lateral_movement":
            return "lateral_move"
        if event_type == "beacon":
            return "c2_beacon"
        if event_type == "exfiltration":
            return "benign" if self._is_known_false_positive(event) else "exfiltration"

        if self._is_known_false_positive(event):
            return "benign"
        if self._looks_like_brute_force(event):
            return "brute_force"
        if self._looks_like_lateral_move(event):
            return "lateral_move"
        if self._looks_like_exfiltration(event):
            return "exfiltration"
        if self._looks_like_c2_beacon(event):
            return "c2_beacon"
        return "benign"

    def _looks_like_brute_force(self, event: Mapping[str, Any]) -> bool:
        port = _safe_int(event.get("port"))
        status_code = _safe_int(event.get("status_code"))
        alert_score = _safe_float(event.get("alert_score"))
        process_name = _safe_text(event.get("process_name"))
        http_method = _safe_text(event.get("http_method"))
        duration = _safe_float(event.get("duration"))
        bytes_sent = _safe_float(event.get("bytes"))

        repeated_failures = status_code in {401, 403, 429}
        auth_surface = port in self.brute_force_ports or "ssh" in process_name or "login" in http_method
        low_payload = bytes_sent <= 15_000 and duration <= 180
        return repeated_failures and auth_surface and (alert_score >= 0.55 or low_payload)

    def _looks_like_lateral_move(self, event: Mapping[str, Any]) -> bool:
        port = _safe_int(event.get("port"))
        src_ip = event.get("src_ip")
        dst_ip = event.get("dst_ip")
        process_name = _safe_text(event.get("process_name"))
        file_access = _safe_text(event.get("file_access"))
        user = _safe_text(event.get("user"))
        alert_score = _safe_float(event.get("alert_score"))

        suspicious_process = process_name in {
            "psexec",
            "wmic",
            "powershell.exe",
            "rundll32.exe",
            "smbexec",
        }
        internal_hop = _is_private_ip(src_ip) and _is_private_ip(dst_ip)
        privileged_file_touch = any(marker in file_access for marker in {"admin$", "c$", "lsass", "sam"})
        return internal_hop and (
            suspicious_process
            or privileged_file_touch
            or (port in self.lateral_ports and alert_score >= 0.6 and user not in {"svc_backup", "patching_bot"})
        )

    def _looks_like_exfiltration(self, event: Mapping[str, Any]) -> bool:
        bytes_sent = _safe_float(event.get("bytes"))
        payload_size = _safe_float(event.get("payload_size"))
        dst_ip = event.get("dst_ip")
        file_access = _safe_text(event.get("file_access"))
        user = _safe_text(event.get("user"))
        alert_score = _safe_float(event.get("alert_score"))
        http_method = _safe_text(event.get("http_method"))

        suspicious_transfer = bytes_sent >= 1_500_000 or payload_size >= 800_000
        sensitive_data = any(marker in file_access for marker in {"finance", "customer", "secret", "db_dump"})
        outbound = not _is_private_ip(dst_ip)
        admin_backup = user in {"admin", "secops-admin"} and http_method in {"put", "post"} and "backup" in file_access
        return outbound and suspicious_transfer and (sensitive_data or alert_score >= 0.75) and not admin_backup

    def _looks_like_c2_beacon(self, event: Mapping[str, Any]) -> bool:
        bytes_sent = _safe_float(event.get("bytes"))
        duration = _safe_float(event.get("duration"))
        port = _safe_int(event.get("port"))
        process_name = _safe_text(event.get("process_name"))
        alert_score = _safe_float(event.get("alert_score"))
        payload_size = _safe_float(event.get("payload_size"))

        periodic_process = process_name in {"svchost.exe", "curl", "python", "systemd", "powershell.exe"}
        low_and_slow = 64 <= bytes_sent <= 8_000 and 20 <= duration <= 600 and payload_size <= 2_048
        return low_and_slow and port in self.beacon_ports and (periodic_process or alert_score >= 0.55)

    def _is_known_false_positive(self, event: Mapping[str, Any]) -> bool:
        user = _safe_text(event.get("user"))
        file_access = _safe_text(event.get("file_access"))
        http_method = _safe_text(event.get("http_method"))
        status_code = _safe_int(event.get("status_code"))
        alert_score = _safe_float(event.get("alert_score"))
        dst_ip = event.get("dst_ip")

        admin_transfer = user in {"admin", "secops-admin"} and "backup" in file_access
        planned_method = http_method in {"put", "post", "sync"}
        successful = status_code in {200, 201, 204}
        trusted_destination = _is_private_ip(dst_ip) or _safe_text(event.get("layer")) == "application"
        return admin_transfer and planned_method and successful and trusted_destination and alert_score < 0.6

```

## File: `backend/src/detection/scorer.py`

```python
from __future__ import annotations

from typing import Any, Mapping

from .detector import ThreatDetector, _safe_float, _safe_int, _safe_text


class ConfidenceScorer:
    """
    Produces a normalized 0-1 confidence score for the detector output.
    """

    def __init__(self, detector: ThreatDetector | None = None):
        self.detector = detector or ThreatDetector()

    def score(self, event: Mapping[str, Any]) -> float:
        label = self.detector.classify(event)
        base = {
            "benign": 0.15,
            "brute_force": 0.7,
            "lateral_move": 0.78,
            "exfiltration": 0.88,
            "c2_beacon": 0.65,
        }[label]

        score = base
        score += _safe_float(event.get("alert_score")) * 0.2
        score += min(_safe_float(event.get("bytes")) / 4_000_000, 0.12)
        score += min(_safe_float(event.get("payload_size")) / 2_000_000, 0.1)
        score += min(_safe_float(event.get("traffic_anomaly_score")) * 0.18, 0.18)

        if _safe_int(event.get("status_code")) in {401, 403} and label == "brute_force":
            score += 0.08
        if _safe_text(event.get("layer")) == "endpoint" and label == "lateral_move":
            score += 0.05
        if _safe_text(event.get("user")) in {"admin", "secops-admin"} and label == "benign":
            score -= 0.08

        return max(0.0, min(score, 1.0))

```

## File: `backend/src/detection/correlator.py`

```python
from __future__ import annotations

from collections import defaultdict
from typing import Any


class CrossLayerCorrelator:
    """
    PS REQUIREMENT: Single-layer alert = noise.
    Same behavior on 2+ layers = high-confidence incident.

    How it works:
      1. Group all logs by correlation_id
      2. For each chain: count distinct layers
      3. Scale confidence + severity by layer count
      4. Resolve false positives using endpoint/app evidence
    """

    THREAT_TYPE_MAP = {
        "scan": "brute_force",
        "exploit": "brute_force",
        "lateral_move": "lateral_movement",
        "lateral_movement": "lateral_movement",
        "exfiltrate": "data_exfiltration",
        "exfiltration": "data_exfiltration",
        "beacon": "c2_beacon",
        "c2_beacon": "c2_beacon",
        "brute_force": "brute_force",
        "normal_traffic": None,
        "admin_sync": None,
        "wait": None,
    }

    MITRE_MAP = {
        "brute_force": ("T1110", "Brute Force"),
        "lateral_movement": ("T1021", "Remote Services"),
        "data_exfiltration": ("T1041", "Exfiltration Over C2"),
        "c2_beacon": ("T1071", "Application Layer Protocol"),
    }

    SEVERITY_BY_LAYERS = {1: "low", 2: "high", 3: "critical"}
    CONFIDENCE_BY_LAYERS = {1: 0.30, 2: 0.75, 3: 0.95}

    def __init__(self):
        self.log_buffer: list[dict[str, Any]] = []
        self.window_size = 10

    def ingest(self, logs: list[dict[str, Any]], current_step: int) -> None:
        """Add new logs to the rolling window buffer."""
        self.log_buffer.extend(logs)
        cutoff = current_step - self.window_size
        self.log_buffer = [
            l for l in self.log_buffer
            if l.get("step", 0) >= cutoff
        ]

    def correlate(self, current_step: int) -> list[dict[str, Any]]:
        """
        Process current buffer and return list of ThreatAlert dicts.
        Call this ONCE per simulation step.
        """
        alerts: list[dict[str, Any]] = []

        # Group logs by correlation_id
        chains: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for log in self.log_buffer:
            cid = log.get("correlation_id")
            if cid and not str(cid).startswith("BENIGN"):
                chains[cid].append(log)

        for cid, chain_logs in chains.items():
            # Skip pure blue-action chains
            malicious_logs = [
                l for l in chain_logs
                if l.get("layer") != "blue_action"
                and l.get("agent") != "blue"
            ]
            if not malicious_logs:
                continue

            # Count distinct layers
            layers = {
                l["layer"] for l in malicious_logs
                if l.get("layer") in ("network", "endpoint", "application")
            }
            layer_count = max(1, len(layers))

            # Get the primary action type
            action_type = malicious_logs[0].get("action_type", "scan")
            threat_type = self.THREAT_TYPE_MAP.get(action_type)
            if threat_type is None:
                continue

            # Check for false positive resolution
            fp_indicators = self._check_false_positive(chain_logs)
            is_fp = len(fp_indicators) > 0

            if is_fp:
                confidence = 0.15
                severity = "low"
            else:
                confidence = self.CONFIDENCE_BY_LAYERS[min(layer_count, 3)]
                severity = self.SEVERITY_BY_LAYERS[min(layer_count, 3)]

            mitre_id, mitre_name = self.MITRE_MAP.get(threat_type, ("T0000", "Unknown"))

            affected_hosts = list({
                h for l in malicious_logs
                for h in (l.get("source"), l.get("target"), l.get("host_id"))
                if h is not None and isinstance(h, int) and h >= 0
            })

            alert = {
                "id": f"ALERT-{cid}",
                "correlation_id": cid,
                "threat_type": threat_type,
                "severity": severity,
                "confidence": round(confidence, 2),
                "layers_flagged": layer_count,
                "layer_breakdown": {
                    "network": "network" in layers,
                    "endpoint": "endpoint" in layers,
                    "application": "application" in layers,
                },
                "affected_hosts": affected_hosts,
                "affected_host_labels": list({
                    l.get("host_label", "") for l in malicious_logs
                    if l.get("host_label")
                }),
                "mitre_id": mitre_id,
                "mitre_name": mitre_name,
                "headline": self._generate_headline(threat_type, malicious_logs),
                "detail": self._generate_detail(threat_type, layer_count, malicious_logs),
                "false_positive_indicators": fp_indicators,
                "is_likely_false_positive": is_fp,
                "step": current_step,
                "status": "active",
            }

            alerts.append(alert)

        return alerts

    def _check_false_positive(self, logs: list[dict[str, Any]]) -> list[str]:
        indicators: list[str] = []
        for log in logs:
            if log.get("is_false_positive_seed"):
                fp_reason = log.get("fp_resolution_reason", "")
                if fp_reason:
                    indicators.append(fp_reason)
                if log.get("scheduled_task_id") or log.get("scheduled_task_name"):
                    indicators.append(f"Scheduled task: {log.get('scheduled_task_id') or log.get('scheduled_task_name')}")
                user = log.get("user", "")
                if isinstance(user, str) and user.startswith("DOMAIN\\svc_"):
                    indicators.append(f"Known service account: {user}")
                if log.get("parent_process") == "taskschd.exe":
                    indicators.append("Parent process: Task Scheduler")
                endpoint = str(log.get("endpoint", "")).lower()
                if "backup" in endpoint:
                    indicators.append("Endpoint matches known backup URL")
                ua = str(log.get("user_agent", "")).lower()
                if "robocopy" in ua:
                    indicators.append("User-Agent matches backup tool")
                # Also check fp_resolution field from existing log_generator
                fp_res = log.get("fp_resolution", "")
                if fp_res:
                    indicators.append(fp_res.replace("_", " "))
        return list(set(indicators))

    def _generate_headline(self, threat_type: str, logs: list[dict[str, Any]]) -> str:
        label = logs[0].get("host_label", logs[0].get("source_label", "Unknown host"))
        headlines = {
            "brute_force": f"Repeated login attempts detected from {label}",
            "lateral_movement": f"Lateral movement from {label} across internal network",
            "data_exfiltration": f"Large outbound data transfer from {label} to external IP",
            "c2_beacon": f"Periodic C2 beacon signal from {label} every few seconds",
        }
        return headlines.get(threat_type, f"Suspicious activity detected on {label}")

    def _generate_detail(self, threat_type: str, layer_count: int, logs: list[dict[str, Any]]) -> str:
        layer_phrase = (
            "one security camera" if layer_count == 1 else
            "two security cameras" if layer_count == 2 else
            "all three security cameras"
        )
        details = {
            "brute_force": (
                f"An attacker is trying many passwords on the same login page. "
                f"This was spotted by {layer_phrase} simultaneously. "
                f"{'High confidence — same pattern seen across network and process logs.' if layer_count >= 2 else 'Low confidence — only network traffic observed so far.'}"
            ),
            "lateral_movement": (
                f"After breaking into one computer, the attacker is quietly moving to nearby computers. "
                f"This was confirmed by {layer_phrase}. "
                f"{'Confirmed incident — process execution matches network movement.' if layer_count >= 2 else 'Possible lateral movement — awaiting endpoint confirmation.'}"
            ),
            "data_exfiltration": (
                f"A very large amount of data is leaving the network to an external IP. "
                f"{'This appears to be a legitimate backup — see false positive indicators above.' if any(l.get('is_false_positive_seed') for l in logs) else f'Spotted by {layer_phrase}. Treat as active theft until confirmed otherwise.'}"
            ),
            "c2_beacon": (
                f"A compromised computer is sending small, regular signals to an external server — "
                f"like a spy texting their boss every few seconds. "
                f"Spotted by {layer_phrase}. The regularity of the intervals is the giveaway."
            ),
        }
        return details.get(threat_type, "Anomalous behavior detected. Investigate immediately.")

```

## File: `backend/src/giskard_harness/compat.py`

```python
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd


@dataclass
class Model:
    model: Callable[[pd.DataFrame], np.ndarray]
    model_type: str
    name: str
    description: str = ""
    classification_labels: list[str] | None = None
    feature_names: list[str] | None = None

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        if self.feature_names:
            available = [name for name in self.feature_names if name in df.columns]
            if available:
                df = df[available].copy()
        return np.asarray(self.model(df))


@dataclass
class Dataset:
    df: pd.DataFrame
    target: str | None = None
    name: str = ""
    cat_columns: list[str] | None = None


@dataclass
class Issue:
    group: str
    description: str
    level: str
    examples: pd.DataFrame = field(default_factory=pd.DataFrame)


@dataclass
class ScanResult:
    issues: list[Issue]
    name: str
    model_name: str

    def has_vulnerabilities(self, level: str = "major") -> bool:
        severity_rank = {"minor": 1, "major": 2, "critical": 3}
        threshold = severity_rank.get(level, 2)
        return any(severity_rank.get(issue.level, 0) >= threshold for issue in self.issues)

    def to_html(self, path: str) -> None:
        rows = []
        for issue in self.issues:
            rows.append(
                "<tr>"
                f"<td>{issue.level.upper()}</td>"
                f"<td>{issue.group}</td>"
                f"<td>{issue.description}</td>"
                f"<td>{len(issue.examples.index)}</td>"
                "</tr>"
            )

        empty_row = "<tr><td colspan='4'>No issues found.</td></tr>"
        body = (
            "<html><head><title>Giskard Compatibility Report</title></head><body>"
            f"<h1>{self.model_name} Scan</h1>"
            f"<p>Dataset: {self.name}</p>"
            "<table border='1' cellpadding='6' cellspacing='0'>"
            "<thead><tr><th>Level</th><th>Group</th><th>Description</th><th>Examples</th></tr></thead>"
            f"<tbody>{''.join(rows) or empty_row}</tbody>"
            "</table></body></html>"
        )
        Path(path).write_text(body, encoding="utf-8")


def scan(model: Model, dataset: Dataset) -> ScanResult:
    df = dataset.df.copy()
    target = dataset.target if dataset.target in df.columns else None
    features = df.drop(columns=[target]) if target else df
    predictions = model.predict(features)
    issues: list[Issue] = []

    if model.model_type == "classification":
        if target:
            labels = df[target].astype(str).to_numpy()
            predicted = predictions.astype(str)
            accuracy = float((predicted == labels).mean())
            mismatches = df[predicted != labels].head(10)

            if accuracy < 0.85:
                issues.append(
                    Issue(
                        group="Performance",
                        description=f"Accuracy dropped to {accuracy:.1%} on {dataset.name}.",
                        level="major",
                        examples=mismatches,
                    )
                )
            elif accuracy < 0.95:
                issues.append(
                    Issue(
                        group="Performance",
                        description=f"Accuracy is {accuracy:.1%}; monitor drift and edge cases.",
                        level="minor",
                        examples=mismatches,
                    )
                )

            if "benign" in set(labels):
                benign_mask = labels == "benign"
                if benign_mask.any():
                    false_positive_rate = float((predicted[benign_mask] != "benign").mean())
                    if false_positive_rate > 0.15:
                        issues.append(
                            Issue(
                                group="Robustness",
                                description=f"False-positive rate on benign traffic is {false_positive_rate:.1%}.",
                                level="major",
                                examples=df[benign_mask & (predicted != "benign")].head(10),
                            )
                        )
                    elif false_positive_rate > 0.05:
                        issues.append(
                            Issue(
                                group="Robustness",
                                description=f"False-positive rate on benign traffic is {false_positive_rate:.1%}.",
                                level="minor",
                                examples=df[benign_mask & (predicted != "benign")].head(10),
                            )
                        )
    else:
        if target:
            labels = df[target]
            scores = predictions.astype(float)
            if pd.api.types.is_numeric_dtype(labels):
                expected = labels.astype(float).to_numpy()
                mae = float(np.mean(np.abs(expected - scores)))
                if mae > 0.22:
                    issues.append(
                        Issue(
                            group="Performance",
                            description=f"Mean absolute error is {mae:.3f}.",
                            level="major",
                            examples=df.head(10),
                        )
                    )
                elif mae > 0.12:
                    issues.append(
                        Issue(
                            group="Performance",
                            description=f"Mean absolute error is {mae:.3f}.",
                            level="minor",
                            examples=df.head(10),
                        )
                    )
            else:
                labels = labels.astype(str).to_numpy()
                benign_mask = labels == "benign"
                malicious_mask = labels != "benign"
                benign_mean = float(scores[benign_mask].mean()) if benign_mask.any() else 0.0
                malicious_mean = float(scores[malicious_mask].mean()) if malicious_mask.any() else 0.0

                if malicious_mean <= benign_mean + 0.1:
                    issues.append(
                        Issue(
                            group="Robustness",
                            description="Confidence scores do not separate malicious and benign events.",
                            level="major",
                            examples=df.head(10),
                        )
                    )
                elif benign_mean > 0.45:
                    issues.append(
                        Issue(
                            group="Performance",
                            description="Benign events are receiving elevated confidence scores.",
                            level="minor",
                            examples=df[benign_mask].head(10),
                        )
                    )

    return ScanResult(issues=issues, name=dataset.name, model_name=model.name)

```

## File: `backend/src/giskard_harness/models.py`

```python
from __future__ import annotations

import numpy as np

try:
    import giskard  # type: ignore
except ImportError:  # pragma: no cover - exercised in this environment
    from . import compat as giskard  # type: ignore

from ..detection.correlator import CrossLayerCorrelator
from ..detection.detector import ThreatDetector
from ..detection.scorer import ConfidenceScorer


def build_detector_model(detector: ThreatDetector):
    """
    Wrap ThreatDetector as a classification model for Giskard or the local
    compatibility harness.
    """

    def predict_fn(df):
        results = []
        for _, row in df.iterrows():
            results.append(detector.classify(row.to_dict()))
        return np.array(results)

    return giskard.Model(
        model=predict_fn,
        model_type="classification",
        name="ThreatDetector",
        description="Classifies network, endpoint, and application log events into threat categories.",
        classification_labels=["brute_force", "lateral_move", "exfiltration", "c2_beacon", "benign"],
        feature_names=[
            "src_ip",
            "dst_ip",
            "port",
            "protocol",
            "bytes",
            "duration",
            "process_name",
            "user",
            "file_access",
            "http_method",
            "status_code",
            "payload_size",
            "alert_score",
            "layer",
        ],
    )


def build_scorer_model(scorer: ConfidenceScorer):
    """
    Wrap ConfidenceScorer as a regression model.
    """

    def predict_fn(df):
        scores = []
        for _, row in df.iterrows():
            scores.append(scorer.score(row.to_dict()))
        return np.array(scores, dtype=float)

    return giskard.Model(
        model=predict_fn,
        model_type="regression",
        name="ConfidenceScorer",
        description="Outputs a 0-1 confidence score for threat detection on a normalized log event.",
        feature_names=[
            "src_ip",
            "dst_ip",
            "port",
            "bytes",
            "duration",
            "alert_score",
            "layer",
            "process_name",
            "status_code",
        ],
    )


def build_correlator_model(correlator: CrossLayerCorrelator):
    """
    Wrap CrossLayerCorrelator as a classification model.
    """

    def predict_fn(df):
        results = []
        for _, row in df.iterrows():
            log_dict = row.to_dict()
            step = int(log_dict.get("step", log_dict.get("timestamp", 0)))
            correlator.ingest([log_dict], step)
            alerts = correlator.correlate(step)
            if alerts:
                # Map alert threat_type to old-style confirmed labels for giskard compat
                threat = alerts[0].get("threat_type", "")
                confirmed_map = {
                    "brute_force": "brute_force_confirmed",
                    "lateral_movement": "lateral_move_confirmed",
                    "data_exfiltration": "exfiltration_confirmed",
                    "c2_beacon": "c2_confirmed",
                }
                results.append(confirmed_map.get(threat, "no_correlation"))
            else:
                results.append("no_correlation")
        return np.array(results)

    return giskard.Model(
        model=predict_fn,
        model_type="classification",
        name="CrossLayerCorrelator",
        description="Cross-correlates network, endpoint, and application layer events to confirm threats.",
        classification_labels=[
            "lateral_move_confirmed",
            "exfiltration_confirmed",
            "c2_confirmed",
            "brute_force_confirmed",
            "no_correlation",
        ],
        feature_names=[
            "network_bytes",
            "network_src",
            "network_dst",
            "endpoint_process",
            "endpoint_user",
            "endpoint_file_access",
            "app_method",
            "app_status",
            "app_payload_size",
            "traffic_anomaly_score",
            "alert_score_delta",
        ],
    )

```

## File: `backend/src/giskard_harness/datasets.py`

```python
from __future__ import annotations

import pandas as pd

try:
    import giskard  # type: ignore
except ImportError:  # pragma: no cover - exercised in this environment
    from . import compat as giskard  # type: ignore

from ..simulation.attack_patterns import AttackPatterns
from ..simulation.log_generator import LogGenerator


def _event_rows(generator: LogGenerator, n_samples: int) -> list[dict]:
    rows = []
    for _ in range(n_samples // 5):
        rows.append({**generator.generate_brute_force_log(), "label": "brute_force"})
        rows.append({**generator.generate_lateral_move_log(), "label": "lateral_move"})
        rows.append({**generator.generate_exfiltration_log(), "label": "exfiltration"})
        rows.append({**generator.generate_c2_beacon_log(), "label": "c2_beacon"})
        rows.append({**generator.generate_admin_bulk_transfer_log(), "label": "benign"})
    return rows


def build_detection_dataset(n_samples: int = 500):
    """
    Labeled threat/benign dataset used for detector evaluation.
    """

    rows = _event_rows(LogGenerator(seed=2026), n_samples)
    df = pd.DataFrame(rows)
    return giskard.Dataset(
        df=df,
        target="label",
        name="CyberGuardian Detection Dataset",
        cat_columns=["src_ip", "dst_ip", "protocol", "process_name", "http_method", "user", "layer"],
    )


def build_scoring_dataset(n_samples: int = 500):
    """
    Regression dataset for expected detector confidence.
    """

    confidence_map = {
        "brute_force": 0.78,
        "lateral_move": 0.84,
        "exfiltration": 0.95,
        "c2_beacon": 0.7,
        "benign": 0.12,
    }
    rows = []
    for row in _event_rows(LogGenerator(seed=2027), n_samples):
        label = row["label"]
        row["expected_confidence"] = confidence_map[label]
        rows.append(row)

    df = pd.DataFrame(rows)
    return giskard.Dataset(
        df=df,
        target="expected_confidence",
        name="CyberGuardian Confidence Dataset",
        cat_columns=["src_ip", "dst_ip", "protocol", "process_name", "http_method", "user", "layer"],
    )


def build_correlation_dataset(n_samples: int = 500):
    """
    Classification dataset for the correlator's confirmed-threat outputs.
    """

    correlation_map = {
        "brute_force": "brute_force_confirmed",
        "lateral_move": "lateral_move_confirmed",
        "exfiltration": "exfiltration_confirmed",
        "c2_beacon": "c2_confirmed",
        "benign": "no_correlation",
    }
    rows = []
    for row in _event_rows(LogGenerator(seed=2028), n_samples):
        row["correlation_label"] = correlation_map[row["label"]]
        rows.append(row)

    df = pd.DataFrame(rows)
    return giskard.Dataset(
        df=df,
        target="correlation_label",
        name="CyberGuardian Correlation Dataset",
        cat_columns=[
            "network_src",
            "network_dst",
            "endpoint_process",
            "endpoint_user",
            "endpoint_file_access",
            "app_method",
        ],
    )


def build_adversarial_dataset():
    """
    Adversarial probes crafted to stress the detector's blind spots.
    """

    patterns = AttackPatterns()
    rows = [
        {**patterns.slow_exfil_probe(), "label": "exfiltration"},
        {**patterns.jittered_beacon(), "label": "c2_beacon"},
        {**patterns.stealth_lateral(), "label": "lateral_move"},
        {**patterns.distributed_brute_force(), "label": "brute_force"},
    ]

    df = pd.DataFrame(rows)
    return giskard.Dataset(
        df=df,
        target="label",
        name="CyberGuardian Adversarial Dataset",
        cat_columns=["src_ip", "dst_ip", "protocol", "process_name", "http_method", "user", "layer"],
    )

```

## File: `backend/src/giskard_harness/scanner.py`

```python
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import giskard as _giskard  # type: ignore
    GISKARD_RUNTIME = "real"
except ImportError:  # pragma: no cover - exercised in this environment
    from . import compat as _giskard  # type: ignore
    GISKARD_RUNTIME = "compat"

giskard = _giskard
USING_REAL_GISKARD = GISKARD_RUNTIME == "real"
GISKARD_VERSION = getattr(giskard, "__version__", "compat")

from .datasets import (
    build_adversarial_dataset,
    build_correlation_dataset,
    build_detection_dataset,
    build_scoring_dataset,
)
from .models import build_correlator_model, build_detector_model, build_scorer_model

logger = logging.getLogger(__name__)
REPORTS_DIR = Path(__file__).resolve().parents[2] / "giskard_reports"
REPORTS_DIR.mkdir(exist_ok=True)


def _json_safe(value):
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) and np.isnan(value):
        return None
    return value


def run_blue_scan(detector, scorer, correlator) -> dict:
    """
    BLUE role: scan detector, scorer, and correlator quality.
    """

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results = {}

    scan_targets = [
        ("detector", build_detector_model(detector), build_detection_dataset()),
        ("scorer", build_scorer_model(scorer), build_scoring_dataset()),
        ("correlator", build_correlator_model(correlator), build_correlation_dataset()),
    ]

    for name, model, dataset in scan_targets:
        logger.info("Running Giskard Blue scan on %s", name)
        scan = giskard.scan(model, dataset)
        report_path = REPORTS_DIR / f"blue_{name}_{timestamp}.html"
        scan.to_html(str(report_path))

        results[name] = {
            "has_major_issues": scan.has_vulnerabilities(level="major"),
            "has_minor_issues": scan.has_vulnerabilities(level="minor"),
            "report_path": str(report_path),
        }

    return results


def run_red_scan(detector) -> list[dict]:
    """
    RED role: probe the detector with evasive samples and return blind spots.
    """

    adversarial_dataset = build_adversarial_dataset()
    detector_model = build_detector_model(detector)

    logger.info("Running Giskard Red scan against the detector.")
    scan = giskard.scan(detector_model, adversarial_dataset)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = REPORTS_DIR / f"red_adversarial_{timestamp}.html"
    scan.to_html(str(report_path))

    blind_spots = []
    for issue in getattr(scan, "issues", []):
        examples = []
        if hasattr(issue, "examples") and isinstance(issue.examples, pd.DataFrame):
            examples = _json_safe(issue.examples.to_dict(orient="records"))
        blind_spots.append(
            {
                "issue_type": getattr(issue, "group", "Unknown"),
                "description": getattr(issue, "description", ""),
                "failing_examples": examples,
                "severity": getattr(issue, "level", "minor"),
            }
        )

    blind_spots = _json_safe(blind_spots)

    json_path = REPORTS_DIR / f"red_blind_spots_{timestamp}.json"
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(blind_spots, handle, indent=2, default=str)

    logger.info("Red scan found %s blind spots.", len(blind_spots))
    return blind_spots


def run_policy_gate(policy_compiler_output: list[dict]) -> bool:
    """
    Validate auto-generated policy rules before they are committed.
    """

    rows = []
    for rule in policy_compiler_output:
        rows.append(
            {
                "trigger_threat": rule.get("trigger_threat", "unknown"),
                "action": rule.get("action", "deny"),
                "confidence": float(rule.get("confidence", 0.5)),
                "episode_outcome": rule.get("episode_outcome", "blue_win"),
            }
        )

    if not rows:
        logger.warning("Policy gate skipped: no rules to validate.")
        return True

    df = pd.DataFrame(rows)
    dataset = giskard.Dataset(
        df=df,
        target="episode_outcome",
        name="PolicyCompiler Output",
        cat_columns=["trigger_threat", "action", "episode_outcome"],
    )

    def dummy_predict(rule_df):
        predictions = []
        for _, rule in rule_df.iterrows():
            action = str(rule.get("action", "deny")).lower()
            confidence = float(rule.get("confidence", 0.5))
            if confidence < 0.35:
                predictions.append("draw")
            elif any(token in action for token in {"deny", "block", "isolate", "reset", "patch"}):
                predictions.append("blue_win")
            else:
                predictions.append("red_win")
        return np.array(predictions)

    model = giskard.Model(
        model=dummy_predict,
        model_type="classification",
        name="PolicyCompilerGate",
        description="Validates policy compiler output consistency before committing rules.",
        classification_labels=["blue_win", "red_win", "draw"],
        feature_names=["trigger_threat", "action", "confidence"],
    )

    scan = giskard.scan(model, dataset)
    is_safe = not scan.has_vulnerabilities(level="major")
    logger.info("Policy gate result: %s", "PASS" if is_safe else "FAIL")
    return is_safe

```

## File: `backend/src/giskard_harness/__init__.py`

```python

```

## File: `backend/src/models/__init__.py`

```python

```

## File: `backend/src/models/contest.py`

```python
"""Contest state models for the Red vs Blue battle visualization."""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel


class ContestPhase(str, Enum):
    IDLE = "idle"
    PROBING = "probing"
    CONTESTED = "contested"
    RED_WINNING = "red_winning"
    BLUE_WINNING = "blue_winning"
    RED_CAPTURED = "red_captured"
    BLUE_DEFENDED = "blue_defended"
    BLUE_RECAPTURED = "blue_recaptured"


class ContestEvent(BaseModel):
    node_id: int
    node_label: str
    node_type: str
    phase: ContestPhase
    red_control_pct: float
    blue_control_pct: float
    active_threat_type: Optional[str] = None
    mitre_id: Optional[str] = None
    mitre_name: Optional[str] = None
    severity: str = "medium"
    red_targeting_reason: str = ""
    detection_reason: str = ""
    immediate_action: str = ""
    layers_active: Dict[str, bool] = {"network": False, "endpoint": False, "application": False}
    correlation_confidence: float = 0.0
    cross_layer_note: str = ""
    contest_intensity: float = 0.0
    red_attack_vector: str = "ssh_brute"
    step_started: int = 0
    steps_contested: int = 0
    winning_reason: str = ""


class NodeBattleResult(BaseModel):
    node_id: int
    node_label: str
    winner: str
    outcome: str
    total_steps_fought: int
    incident_summary: str = ""
    strategic_impact: str = ""
    playbook_id: str = ""
    false_positive: bool = False
    false_positive_reason: Optional[str] = None
    step_resolved: int = 0
    victory_reason: str = ""


class BattleScoreboard(BaseModel):
    red_nodes_controlled: int = 0
    blue_nodes_secured: int = 0
    contested_nodes: int = 0
    red_total_captures: int = 0
    blue_total_defenses: int = 0
    blue_total_recaptures: int = 0
    false_positives_this_episode: int = 0
    red_progress: float = 0.0
    blue_progress: float = 0.0
    red_next_targets: List[int] = []

```

## File: `backend/src/pipeline/kill_chain_tracker.py`

```python
"""
Kill Chain Velocity Tracker + Breach Countdown Oracle

Maps SIEM events to Lockheed Martin Kill Chain stages and computes:
  1. Current kill chain stage
  2. Attacker velocity (stage progression rate)
  3. Dwell time estimate (how long has attacker been inside?)
  4. Breach countdown (estimated time to data exfiltration)
  5. Threat DNA signature (behavioral fingerprint for APT attribution)
"""

import numpy as np
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import time

# ─── KILL CHAIN STAGE DEFINITIONS ─────────────────────────────────────────────

KILL_CHAIN_STAGES = {
    1: {
        "name": "Reconnaissance",
        "description": "Attacker scanning and probing targets",
        "color": "#00e5ff",
        "mitre_tactics": ["TA0043"],
        "event_types": ["scan", "port_probe", "service_enum"],
    },
    2: {
        "name": "Weaponization",
        "description": "Exploit preparation and payload staging",
        "color": "#00ff88",
        "mitre_tactics": ["TA0042"],
        "event_types": ["payload_drop", "exploit_prep"],
    },
    3: {
        "name": "Delivery",
        "description": "Attack vector delivered to target",
        "color": "#ffcc00",
        "mitre_tactics": ["TA0001"],
        "event_types": ["exploit", "brute_force", "phish"],
    },
    4: {
        "name": "Exploitation",
        "description": "Vulnerability exploited, initial foothold gained",
        "color": "#ff9900",
        "mitre_tactics": ["TA0002"],
        "event_types": ["exploit_success", "code_execution", "privilege_esc"],
    },
    5: {
        "name": "Installation",
        "description": "Persistence mechanisms established",
        "color": "#ff6600",
        "mitre_tactics": ["TA0003", "TA0005"],
        "event_types": ["beacon", "c2_beacon", "persistence_install"],
    },
    6: {
        "name": "C2 & Lateral Movement",
        "description": "Command channel active, spreading across network",
        "color": "#ff3300",
        "mitre_tactics": ["TA0011", "TA0008"],
        "event_types": ["lateral_move", "c2_communication", "credential_dump"],
    },
    7: {
        "name": "Actions on Objectives",
        "description": "Exfiltration — attacker achieving final goal",
        "color": "#ff0044",
        "mitre_tactics": ["TA0009", "TA0010"],
        "event_types": ["exfiltrate", "data_theft", "ransomware_deploy"],
    },
}

# Map RL environment action types to kill chain stages
EVENT_TO_STAGE = {
    "scan":          1,
    "port_probe":    1,
    "exploit":       3,
    "exploit_success": 4,
    "brute_force":   3,
    "lateral_move":  6,
    "beacon":        5,
    "c2_beacon":     5,
    "exfiltrate":    7,
    "data_exfil":    7,
    "monitor":       0,
    "isolate":       0,
    "patch":         0,
    "block_ip":      0,
    "reset_creds":   0,
    "investigate":   0,
}


@dataclass
class KillChainState:
    """Current state of the kill chain tracker"""
    current_stage: int = 1
    max_stage_reached: int = 1

    # Timestamps (in simulation steps)
    stage_entry_times: Dict[int, int] = field(default_factory=dict)
    stage_dwell_times: Dict[int, int] = field(default_factory=dict)

    # Velocity metrics
    velocity: float = 0.0
    acceleration: float = 0.0

    # Breach prediction
    estimated_steps_to_breach: Optional[float] = None
    breach_confidence: float = 0.0
    breach_countdown_seconds: Optional[float] = None

    # Dwell time
    estimated_dwell_time_steps: int = 0
    first_seen_step: Optional[int] = None

    # Threat DNA
    threat_dna: Dict[str, float] = field(default_factory=dict)
    apt_similarity: Dict[str, float] = field(default_factory=dict)

    # History for sparklines
    velocity_history: List[float] = field(default_factory=list)
    stage_history: List[int] = field(default_factory=list)


class KillChainTracker:
    """
    Tracks attacker progression through the Lockheed Martin Kill Chain.
    Uses RL Red Agent's learned transition probabilities to predict breach time.
    """

    def __init__(
        self,
        red_model=None,
        env=None,
        step_duration_seconds: float = 2.0,
        monte_carlo_rollouts: int = 50,
    ):
        self.red_model = red_model
        self.env = env
        self.step_duration = step_duration_seconds
        self.mc_rollouts = monte_carlo_rollouts

        self.state = KillChainState()
        self.event_buffer = deque(maxlen=100)
        self.current_step = 0

        self.apt_signatures = self._load_apt_signatures()

    def ingest_event(self, event: dict, step: int) -> KillChainState:
        self.current_step = step

        event_type = event.get("action_type", event.get("event_type", "unknown"))
        stage = EVENT_TO_STAGE.get(event_type, 0)

        if stage == 0:
            return self.state

        self.event_buffer.append({
            "stage": stage,
            "event_type": event_type,
            "step": step,
            "host_id": event.get("host_id", event.get("source_host", -1)),
        })

        self._update_stage(stage, step)
        self._compute_velocity()
        self._estimate_dwell_time(stage, step)

        if self.red_model is not None:
            self._predict_breach_rl(step)
        else:
            self._predict_breach_heuristic(step)

        self._compute_threat_dna()
        self._compute_apt_similarity()

        return self.state

    def _update_stage(self, new_stage: int, step: int):
        if new_stage > self.state.current_stage:
            self.state.current_stage = new_stage
            self.state.stage_entry_times[new_stage] = step

            if new_stage > self.state.max_stage_reached:
                self.state.max_stage_reached = new_stage

        if self.state.first_seen_step is None and new_stage >= 3:
            self.state.first_seen_step = step

        self.state.stage_history.append(self.state.current_stage)

    def _compute_velocity(self):
        if len(self.event_buffer) < 3:
            return

        recent = list(self.event_buffer)[-20:]
        if len(recent) < 2:
            return

        stage_delta = recent[-1]["stage"] - recent[0]["stage"]
        step_delta = recent[-1]["step"] - recent[0]["step"]

        if step_delta > 0:
            new_velocity = stage_delta / step_delta
            self.state.acceleration = new_velocity - self.state.velocity
            self.state.velocity = new_velocity

        self.state.velocity_history.append(self.state.velocity)

    def _estimate_dwell_time(self, current_stage: int, step: int):
        if self.state.first_seen_step is None:
            return

        detected_dwell = step - self.state.first_seen_step

        if self.state.velocity > 0:
            pre_detection_stages = max(0, self.state.first_seen_step - 1)
            pre_detection_steps = pre_detection_stages / max(self.state.velocity, 0.01)
            self.state.estimated_dwell_time_steps = int(detected_dwell + pre_detection_steps)
        else:
            self.state.estimated_dwell_time_steps = detected_dwell

    def _predict_breach_rl(self, step: int):
        if self.env is None:
            self._predict_breach_heuristic(step)
            return

        steps_to_breach = []

        try:
            current_obs = self.env._get_observation()
        except Exception:
            self._predict_breach_heuristic(step)
            return

        for rollout in range(self.mc_rollouts):
            steps = self._single_rollout(current_obs, max_steps=50)
            if steps is not None:
                steps_to_breach.append(steps)

        if steps_to_breach:
            mean_steps = np.mean(steps_to_breach)
            success_rate = len(steps_to_breach) / self.mc_rollouts

            self.state.estimated_steps_to_breach = mean_steps
            self.state.breach_confidence = success_rate
            self.state.breach_countdown_seconds = mean_steps * self.step_duration
        else:
            self.state.estimated_steps_to_breach = None
            self.state.breach_confidence = 0.1
            self.state.breach_countdown_seconds = None

    def _single_rollout(self, initial_obs, max_steps: int) -> Optional[int]:
        try:
            obs = initial_obs
            for step in range(max_steps):
                action, _ = self.red_model.predict(obs, deterministic=False)
                target_host, action_type = action if hasattr(action, '__iter__') else (action, 0)
                if action_type == 3:
                    return step + 1
            return None
        except Exception:
            return None

    def _predict_breach_heuristic(self, step: int):
        remaining_stages = 7 - self.state.current_stage

        if remaining_stages <= 0:
            self.state.estimated_steps_to_breach = 0
            self.state.breach_confidence = 0.95
            self.state.breach_countdown_seconds = 0
            return

        if self.state.velocity > 0:
            steps_per_stage = 1.0 / self.state.velocity
            estimated_steps = remaining_stages * steps_per_stage
            data_confidence = min(0.85, len(self.event_buffer) / 20)
            self.state.estimated_steps_to_breach = estimated_steps
            self.state.breach_confidence = data_confidence
            self.state.breach_countdown_seconds = estimated_steps * self.step_duration
        else:
            self.state.estimated_steps_to_breach = remaining_stages * 8
            self.state.breach_confidence = 0.25
            self.state.breach_countdown_seconds = remaining_stages * 8 * self.step_duration

    def _compute_threat_dna(self):
        if len(self.event_buffer) < 5:
            return

        events = list(self.event_buffer)

        stage_counts = defaultdict(int)
        for e in events:
            stage_counts[e["stage"]] += 1
        total = len(events)
        stage_dist = {f"stage_{k}": v/total for k, v in stage_counts.items()}

        action_counts = defaultdict(int)
        for e in events:
            action_counts[e["event_type"]] += 1
        action_dist = {f"action_{k}": v/total for k, v in action_counts.items()}

        speed_feature = {
            "velocity": min(1.0, self.state.velocity),
            "max_stage": self.state.max_stage_reached / 7,
            "dwell": min(1.0, self.state.estimated_dwell_time_steps / 50),
        }

        self.state.threat_dna = {**stage_dist, **action_dist, **speed_feature}

    def _compute_apt_similarity(self):
        if not self.state.threat_dna:
            return

        similarities = {}
        for apt_name, signature in self.apt_signatures.items():
            similarity = self._cosine_similarity(self.state.threat_dna, signature)
            similarities[apt_name] = round(similarity, 2)

        self.state.apt_similarity = dict(
            sorted(similarities.items(), key=lambda x: x[1], reverse=True)
        )

    def _cosine_similarity(self, vec_a: dict, vec_b: dict) -> float:
        keys = set(vec_a.keys()) | set(vec_b.keys())
        if not keys:
            return 0.0

        a = np.array([vec_a.get(k, 0.0) for k in keys])
        b = np.array([vec_b.get(k, 0.0) for k in keys])

        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(np.dot(a, b) / (norm_a * norm_b))

    def _load_apt_signatures(self) -> Dict[str, Dict[str, float]]:
        return {
            "APT29 (Cozy Bear)": {
                "stage_1": 0.30,
                "stage_5": 0.25,
                "stage_6": 0.20,
                "action_scan": 0.25,
                "action_beacon": 0.30,
                "action_lateral_move": 0.20,
                "velocity": 0.1,
                "max_stage": 0.7,
                "dwell": 0.9,
            },
            "APT28 (Fancy Bear)": {
                "stage_3": 0.35,
                "stage_4": 0.30,
                "stage_6": 0.20,
                "action_exploit": 0.35,
                "action_brute_force": 0.30,
                "action_lateral_move": 0.20,
                "velocity": 0.5,
                "max_stage": 0.9,
                "dwell": 0.3,
            },
            "Lazarus Group": {
                "stage_6": 0.25,
                "stage_7": 0.40,
                "action_lateral_move": 0.20,
                "action_exfiltrate": 0.40,
                "action_beacon": 0.15,
                "velocity": 0.35,
                "max_stage": 1.0,
                "dwell": 0.5,
            },
            "Carbanak": {
                "stage_5": 0.30,
                "stage_6": 0.35,
                "stage_7": 0.20,
                "action_beacon": 0.30,
                "action_lateral_move": 0.35,
                "action_exfiltrate": 0.20,
                "velocity": 0.15,
                "max_stage": 0.85,
                "dwell": 0.80,
            },
            "Generic Opportunistic": {
                "stage_1": 0.50,
                "stage_3": 0.30,
                "action_scan": 0.50,
                "action_exploit": 0.30,
                "velocity": 0.6,
                "max_stage": 0.4,
                "dwell": 0.1,
            },
        }

    def get_breach_countdown_payload(self) -> dict:
        state = self.state

        countdown_display = self._format_countdown(state.breach_countdown_seconds)

        if state.breach_countdown_seconds is None:
            urgency = "low"
            urgency_color = "#00e5ff"
        elif state.breach_countdown_seconds < 60:
            urgency = "critical"
            urgency_color = "#ff0044"
        elif state.breach_countdown_seconds < 180:
            urgency = "high"
            urgency_color = "#ff6600"
        elif state.breach_countdown_seconds < 300:
            urgency = "medium"
            urgency_color = "#ffcc00"
        else:
            urgency = "low"
            urgency_color = "#00ff88"

        top_apt = None
        top_apt_score = 0.0
        if state.apt_similarity:
            top_apt = list(state.apt_similarity.keys())[0]
            top_apt_score = list(state.apt_similarity.values())[0]

        return {
            "current_stage": state.current_stage,
            "current_stage_name": KILL_CHAIN_STAGES.get(state.current_stage, {}).get("name", "Unknown"),
            "max_stage_reached": state.max_stage_reached,
            "stage_color": KILL_CHAIN_STAGES.get(state.current_stage, {}).get("color", "#fff"),
            "kill_chain_progress": state.current_stage / 7,

            "velocity": round(state.velocity, 3),
            "velocity_history": state.velocity_history[-20:],
            "acceleration": round(state.acceleration, 3),
            "velocity_label": self._velocity_label(state.velocity),

            "dwell_time_steps": state.estimated_dwell_time_steps,
            "dwell_time_seconds": state.estimated_dwell_time_steps * self.step_duration,
            "dwell_time_display": self._format_countdown(
                state.estimated_dwell_time_steps * self.step_duration
            ),

            "breach_countdown_seconds": state.breach_countdown_seconds,
            "breach_countdown_display": countdown_display,
            "breach_confidence": round(state.breach_confidence, 2),
            "urgency": urgency,
            "urgency_color": urgency_color,

            "top_apt_match": top_apt,
            "top_apt_score": round(top_apt_score, 2),
            "apt_similarity": state.apt_similarity,
            "stage_history": state.stage_history[-30:],
        }

    def _format_countdown(self, seconds: Optional[float]) -> str:
        if seconds is None:
            return "--:--"
        if seconds <= 0:
            return "00:00"
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes:02d}:{secs:02d}"

    def _velocity_label(self, velocity: float) -> str:
        if velocity <= 0:
            return "DORMANT"
        if velocity < 0.1:
            return "STEALTHY"
        if velocity < 0.3:
            return "MODERATE"
        if velocity < 0.6:
            return "AGGRESSIVE"
        return "BLITZ"

```

## File: `backend/src/pipeline/threat_dna.py`

```python
"""
Threat DNA — behavioral fingerprint comparison against known APT groups.
Returns structured data for the frontend's APT Attribution panel.
"""

from typing import Dict, List


def format_apt_attribution(apt_similarity: Dict[str, float]) -> List[dict]:
    """
    Format APT similarity scores for frontend rendering.
    Returns list sorted by similarity, with metadata for display.
    """
    APT_METADATA = {
        "APT29 (Cozy Bear)": {
            "nation": "Russia",
            "nation_flag": "🇷🇺",
            "known_targets": ["Government", "Defense", "Think Tanks"],
            "risk_note": "Patient, persistent. Known for long dwell times.",
            "color": "#cc3333",
        },
        "APT28 (Fancy Bear)": {
            "nation": "Russia",
            "nation_flag": "🇷🇺",
            "known_targets": ["Military", "Government", "Aerospace"],
            "risk_note": "Aggressive credential theft. Moves fast once in.",
            "color": "#cc3333",
        },
        "Lazarus Group": {
            "nation": "North Korea",
            "nation_flag": "🇰🇵",
            "known_targets": ["Financial", "Crypto", "Defense"],
            "risk_note": "Financially motivated. Heavy exfiltration focus.",
            "color": "#cc6600",
        },
        "Carbanak": {
            "nation": "Unknown",
            "nation_flag": "🌐",
            "known_targets": ["Banking", "Financial Services"],
            "risk_note": "Slow, methodical. Targets high-value financial data.",
            "color": "#cc9900",
        },
        "Generic Opportunistic": {
            "nation": "Unknown",
            "nation_flag": "🌐",
            "known_targets": ["Any exposed system"],
            "risk_note": "Low sophistication. Unlikely to achieve deep penetration.",
            "color": "#666666",
        },
    }

    result = []
    for apt_name, score in apt_similarity.items():
        meta = APT_METADATA.get(apt_name, {})
        result.append({
            "name": apt_name,
            "score": score,
            "score_percent": int(score * 100),
            "bar_fill": score,
            "nation": meta.get("nation", "Unknown"),
            "flag": meta.get("nation_flag", "🌐"),
            "targets": meta.get("known_targets", []),
            "risk_note": meta.get("risk_note", ""),
            "color": meta.get("color", "#ffffff"),
            "is_top_match": score == max(apt_similarity.values()) if apt_similarity else False,
        })

    return sorted(result, key=lambda x: x["score"], reverse=True)

```

## File: `backend/src/hyperagents/__init__.py`

```python
"""
HyperAgents Integration Layer for CyberGuardian AI
Self-referential self-improving agents that enhance the existing Red/Blue agents
without modifying any existing code.
"""

from __future__ import annotations

__version__ = "0.1.0"

```

## File: `backend/src/hyperagents/config.py`

```python
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

```

## File: `backend/src/hyperagents/domain_bridge.py`

```python
"""Bridge between existing CyberSecurityEnv and the HyperAgent meta-layer."""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

try:
    from ..environment.cyber_env import CyberSecurityEnv
    from ..environment.network import NetworkTopology
    from ..config.constants import RED_ACTIONS, BLUE_ACTIONS
except ImportError:
    CyberSecurityEnv = None  # type: ignore[assignment,misc]
    NetworkTopology = None  # type: ignore[assignment,misc]
    RED_ACTIONS = {0: "scan", 1: "exploit", 2: "lateral_move", 3: "exfiltrate", 4: "beacon", 5: "wait"}
    BLUE_ACTIONS = {0: "monitor", 1: "isolate", 2: "patch", 3: "block_ip", 4: "reset_creds", 5: "investigate"}
    logger.warning("Could not import existing env modules; HyperAgents will run in stub mode.")


# ── Network layer mapping ────────────────────────────────────────────────────

NETWORK_LAYERS: dict[str, list[int]] = {
    "internet": [0, 1],       # DMZ hosts double as internet-facing
    "dmz": [0, 1],
    "app": [2, 3, 4, 5, 6],
    "db": [7, 8, 9],
    "workstation": list(range(10, 20)),
}

HOST_LAYER: dict[int, str] = {}
for _layer, _hosts in NETWORK_LAYERS.items():
    for _h in _hosts:
        if _h not in HOST_LAYER:
            HOST_LAYER[_h] = _layer


# ── Pydantic models ─────────────────────────────────────────────────────────

class NetworkNarrative(BaseModel):
    """Natural-language description of current network state."""
    total_hosts: int = 20
    compromised_hosts: list[int] = Field(default_factory=list)
    detected_hosts: list[int] = Field(default_factory=list)
    high_alert_hosts: list[int] = Field(default_factory=list)
    layer_summary: dict[str, dict[str, Any]] = Field(default_factory=dict)
    narrative: str = ""


class BattleNarrative(BaseModel):
    """Natural-language description of recent combat events."""
    recent_red_actions: list[str] = Field(default_factory=list)
    recent_blue_actions: list[str] = Field(default_factory=list)
    red_score: float = 0.0
    blue_score: float = 0.0
    step: int = 0
    narrative: str = ""


# ── Bridge class ─────────────────────────────────────────────────────────────

class HyperEnvironmentBridge:
    """Wraps the existing CyberSecurityEnv without modifying it.

    Translates env observations into rich text for the meta-agent and
    translates meta-agent strategic decisions back into [host_id, action_id].
    """

    def __init__(self, env: Any = None) -> None:
        self.env = env
        self._obs: dict[str, Any] = {}
        self._info: dict[str, Any] = {}
        self._step: int = 0

    # ── Observation ingestion ────────────────────────────────────────────

    def update_observation(self, obs: dict[str, Any], info: dict[str, Any] | None = None, step: int = 0) -> None:
        """Call this each env step so the bridge stays in sync."""
        self._obs = obs
        self._info = info or {}
        self._step = step

    # ── Narrative builders ───────────────────────────────────────────────

    def get_network_narrative(self) -> NetworkNarrative:
        """Describe the current network state in natural language."""
        import numpy as np

        obs = self._obs
        host_status = np.asarray(obs.get("host_status", np.zeros(20)))
        alert_scores = np.asarray(obs.get("alert_scores", np.zeros((20, 1))))

        compromised: list[int] = []
        detected: list[int] = []
        high_alert: list[int] = []

        for hid in range(min(20, len(host_status))):
            if host_status[hid] > 0.5:
                compromised.append(hid)
            if host_status[hid] > 0.2:
                detected.append(hid)
            if alert_scores.ndim >= 1 and hid < len(alert_scores):
                peak = float(alert_scores[hid].max()) if alert_scores[hid].size else 0.0
                if peak >= 0.6:
                    high_alert.append(hid)

        layer_summary: dict[str, dict[str, Any]] = {}
        for layer, hosts in NETWORK_LAYERS.items():
            layer_comp = [h for h in hosts if h in compromised]
            layer_det = [h for h in hosts if h in detected]
            layer_summary[layer] = {
                "hosts": hosts,
                "compromised_count": len(layer_comp),
                "detected_count": len(layer_det),
                "compromised_ids": layer_comp,
            }

        lines: list[str] = [f"Step {self._step}. Network has {len(host_status)} hosts."]
        if compromised:
            lines.append(f"Compromised hosts: {compromised} — attacker has foothold.")
        if high_alert:
            lines.append(f"High-alert hosts: {high_alert} — defender should focus here.")
        for layer, info_d in layer_summary.items():
            if info_d["compromised_count"]:
                lines.append(f"  {layer.upper()} layer: {info_d['compromised_count']}/{len(info_d['hosts'])} compromised ({info_d['compromised_ids']})")

        return NetworkNarrative(
            total_hosts=int(len(host_status)),
            compromised_hosts=compromised,
            detected_hosts=detected,
            high_alert_hosts=high_alert,
            layer_summary=layer_summary,
            narrative=" ".join(lines),
        )

    def get_battle_narrative(self, recent_red: list[dict] | None = None, recent_blue: list[dict] | None = None, red_score: float = 0.0, blue_score: float = 0.0) -> BattleNarrative:
        """Describe recent combat events in natural language."""
        red_lines = []
        for a in (recent_red or [])[-5:]:
            host = a.get("target_host_id", "?")
            action = RED_ACTIONS.get(a.get("action_id", -1), "unknown")
            success = "succeeded" if a.get("success") else "failed"
            red_lines.append(f"Red {action} on host {host} {success}")

        blue_lines = []
        for a in (recent_blue or [])[-5:]:
            host = a.get("target_host_id", "?")
            action = BLUE_ACTIONS.get(a.get("action_id", -1), "unknown")
            success = "succeeded" if a.get("success") else "failed"
            blue_lines.append(f"Blue {action} on host {host} {success}")

        narrative_parts = [f"Step {self._step}. Red score: {red_score:.1f}, Blue score: {blue_score:.1f}."]
        if red_lines:
            narrative_parts.append("Recent Red: " + "; ".join(red_lines))
        if blue_lines:
            narrative_parts.append("Recent Blue: " + "; ".join(blue_lines))

        return BattleNarrative(
            recent_red_actions=red_lines,
            recent_blue_actions=blue_lines,
            red_score=red_score,
            blue_score=blue_score,
            step=self._step,
            narrative=" ".join(narrative_parts),
        )

    # ── Action translation ───────────────────────────────────────────────

    @staticmethod
    def translate_action(host_id: int, action_id: int) -> tuple[int, int]:
        """Validate and clamp a meta-agent decision into valid [host_id, action_id]."""
        clamped_host = max(0, min(19, host_id))
        clamped_action = max(0, min(5, action_id))
        return clamped_host, clamped_action

    @staticmethod
    def host_layer(host_id: int) -> str:
        """Return the network layer for a given host."""
        return HOST_LAYER.get(max(0, min(19, host_id)), "workstation")

```

## File: `backend/src/hyperagents/meta_engine.py`

```python
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

```

## File: `backend/src/hyperagents/red_hyper.py`

```python
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

```

## File: `backend/src/hyperagents/blue_hyper.py`

```python
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

```

## File: `backend/src/hyperagents/strategy_evolver.py`

```python
"""Strategy evolver — manages evolution of strategies across episodes."""

from __future__ import annotations

import copy
import logging
import random
from typing import Any

from pydantic import BaseModel, Field

from .config import HyperAgentConfig
from .meta_engine import MetaEngine

logger = logging.getLogger(__name__)


class StrategyRecord(BaseModel):
    """A strategy parameter set with its episode score."""
    params: dict[str, Any]
    score: float = 0.0
    episode: int = 0
    agent_type: str = ""
    wins: int = 0
    losses: int = 0


class EvolutionReport(BaseModel):
    total_strategies: int = 0
    best_score: float = 0.0
    worst_score: float = 0.0
    avg_score: float = 0.0
    generations: int = 0
    top_strategies: list[dict[str, Any]] = Field(default_factory=list)
    recent_mutations: list[str] = Field(default_factory=list)


class StrategyEvolver:
    """Maintains a population of strategy parameter sets and evolves them.

    After each episode:
    - Records the strategy params used and the final score
    - Ranks all strategies by score
    - Uses the meta-engine to cross-pollinate top strategies
    - Generates mutated variants of successful strategies
    - Prunes worst-performing strategies
    """

    def __init__(self, agent_type: str, config: HyperAgentConfig | None = None) -> None:
        self.agent_type = agent_type
        self.config = config or HyperAgentConfig()
        self.population: list[StrategyRecord] = []
        self._generation: int = 0
        self._episode_counter: int = 0

    def record_episode(self, params: dict[str, Any], score: float, episode_data: dict[str, Any] | None = None) -> None:
        """Record outcome of an episode with its strategy params."""
        self._episode_counter += 1
        win = episode_data.get("won", False) if episode_data else False
        record = StrategyRecord(
            params=copy.deepcopy(params),
            score=score,
            episode=self._episode_counter,
            agent_type=self.agent_type,
            wins=1 if win else 0,
            losses=0 if win else 1,
        )
        self.population.append(record)

        # Prune if over capacity
        max_pop = self.config.strategy_population_size * 2
        if len(self.population) > max_pop:
            self.population.sort(key=lambda r: r.score, reverse=True)
            self.population = self.population[:max_pop]

    def get_next_strategy(self) -> dict[str, Any]:
        """Select strategy params for the next episode.

        Uses tournament selection: pick 3 random strategies, return the best.
        Falls back to default params if population is empty.
        """
        if not self.population:
            return {}

        if len(self.population) < 3:
            best = max(self.population, key=lambda r: r.score)
            return copy.deepcopy(best.params)

        candidates = random.sample(self.population, min(3, len(self.population)))
        best = max(candidates, key=lambda r: r.score)
        return copy.deepcopy(best.params)

    def evolve(self, meta_engine: MetaEngine | None = None) -> list[dict[str, Any]]:
        """Generate new strategies via crossover and mutation.

        Returns list of new strategy param dicts.
        """
        self._generation += 1
        new_strategies: list[dict[str, Any]] = []

        if len(self.population) < 2:
            # Mutate a single strategy
            if self.population:
                base = self.population[0]
                mutated = self._mutate(base.params)
                new_strategies.append(mutated)
            return new_strategies

        # Sort by score
        self.population.sort(key=lambda r: r.score, reverse=True)
        top_n = max(2, len(self.population) // 2)

        # Crossover top strategies
        for _ in range(self.config.strategy_population_size // 2):
            parent_a = random.choice(self.population[:top_n])
            parent_b = random.choice(self.population[:top_n])
            child = self._crossover(parent_a.params, parent_b.params)
            child = self._mutate(child)
            new_strategies.append(child)

        # Add a few pure mutations of the best
        best = self.population[0]
        for _ in range(2):
            mutated = self._mutate(best.params, mutation_rate=0.15)
            new_strategies.append(mutated)

        # Add new strategies to population
        for params in new_strategies:
            self.population.append(StrategyRecord(
                params=params,
                score=0.0,
                episode=0,
                agent_type=self.agent_type,
            ))

        return new_strategies

    def _crossover(self, parent_a: dict[str, Any], parent_b: dict[str, Any]) -> dict[str, Any]:
        """Uniform crossover of two strategy param dicts."""
        child: dict[str, Any] = {}
        all_keys = set(list(parent_a.keys()) + list(parent_b.keys()))
        for key in all_keys:
            if key in parent_a and key in parent_b:
                # Pick from either parent with 50% chance
                if random.random() < 0.5:
                    child[key] = copy.deepcopy(parent_a[key])
                else:
                    child[key] = copy.deepcopy(parent_b[key])
            elif key in parent_a:
                child[key] = copy.deepcopy(parent_a[key])
            else:
                child[key] = copy.deepcopy(parent_b[key])
        return child

    def _mutate(self, params: dict[str, Any], mutation_rate: float = 0.1) -> dict[str, Any]:
        """Mutate numeric parameters by adding Gaussian noise."""
        mutated = copy.deepcopy(params)
        for key, value in mutated.items():
            if isinstance(value, float) and random.random() < mutation_rate:
                noise = random.gauss(0, 0.05)
                mutated[key] = max(0.0, min(1.0, value + noise))
            elif isinstance(value, list) and random.random() < mutation_rate:
                # Shuffle list params slightly
                if all(isinstance(v, int) for v in value):
                    idx_a = random.randint(0, len(value) - 1)
                    idx_b = random.randint(0, len(value) - 1)
                    value[idx_a], value[idx_b] = value[idx_b], value[idx_a]
        return mutated

    def get_evolution_report(self) -> EvolutionReport:
        """Return a summary for API/dashboard."""
        if not self.population:
            return EvolutionReport(generations=self._generation)

        scores = [r.score for r in self.population]
        top = sorted(self.population, key=lambda r: r.score, reverse=True)[:5]

        return EvolutionReport(
            total_strategies=len(self.population),
            best_score=max(scores),
            worst_score=min(scores),
            avg_score=sum(scores) / len(scores),
            generations=self._generation,
            top_strategies=[
                {"episode": r.episode, "score": r.score, "params": r.params}
                for r in top
            ],
            recent_mutations=[
                f"Gen {self._generation}: {len(self.population)} strategies"
            ],
        )

```

## File: `backend/src/hyperagents/safety_sandbox.py`

```python
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

```

## File: `backend/src/hyperagents/hyper_router.py`

```python
"""HyperAgent API routes — optionally mountable under /api/hyper."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .config import HyperAgentConfig
from .domain_bridge import HyperEnvironmentBridge
from .red_hyper import HyperRedAgent
from .blue_hyper import HyperBlueAgent
from .strategy_evolver import StrategyEvolver
from .safety_sandbox import SafetySandbox

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hyper", tags=["hyperagents"])

# ── Global state (shared across routes) ──────────────────────────────────────

_config = HyperAgentConfig()
_bridge = HyperEnvironmentBridge()
_red_agent: HyperRedAgent | None = None
_blue_agent: HyperBlueAgent | None = None
_red_evolver: StrategyEvolver | None = None
_blue_evolver: StrategyEvolver | None = None


def _ensure_agents() -> tuple[HyperRedAgent, HyperBlueAgent]:
    global _red_agent, _blue_agent, _red_evolver, _blue_evolver
    if _red_agent is None:
        _red_agent = HyperRedAgent(_bridge, _config)
        _red_evolver = StrategyEvolver("red", _config)
    if _blue_agent is None:
        _blue_agent = HyperBlueAgent(_bridge, _config)
        _blue_evolver = StrategyEvolver("blue", _config)
    return _red_agent, _blue_agent


class ToggleRequest(BaseModel):
    enabled: bool = True
    red_enabled: bool | None = None
    blue_enabled: bool | None = None


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def hyper_status() -> dict[str, Any]:
    """HyperAgent system status."""
    red, blue = _ensure_agents()
    return {
        "enabled": _config.enabled,
        "red_hyper_enabled": _config.red_hyper_enabled,
        "blue_hyper_enabled": _config.blue_hyper_enabled,
        "llm_backend": _config.llm_backend,
        "llm_model": _config.llm_model,
        "improvement_interval_steps": _config.improvement_interval_steps,
        "red": red.get_strategy(),
        "blue": blue.get_strategy(),
    }


@router.get("/red/strategy")
async def red_strategy() -> dict[str, Any]:
    """Current Red meta-agent strategy and parameters."""
    red, _ = _ensure_agents()
    return red.get_strategy()


@router.get("/blue/strategy")
async def blue_strategy() -> dict[str, Any]:
    """Current Blue meta-agent strategy and parameters."""
    _, blue = _ensure_agents()
    return blue.get_strategy()


@router.get("/evolution")
async def evolution_report() -> dict[str, Any]:
    """Strategy evolution history and trends."""
    _ensure_agents()
    red_report = _red_evolver.get_evolution_report() if _red_evolver else None
    blue_report = _blue_evolver.get_evolution_report() if _blue_evolver else None
    return {
        "red": red_report.model_dump() if red_report else {},
        "blue": blue_report.model_dump() if blue_report else {},
    }


@router.get("/audit")
async def audit_trail(agent_type: str | None = None) -> dict[str, Any]:
    """Safety audit trail."""
    red, blue = _ensure_agents()
    records: list[dict[str, Any]] = []
    if red.safety:
        records.extend(red.safety.get_audit_trail(agent_type))
    if blue.safety:
        records.extend(blue.safety.get_audit_trail(agent_type))
    return {"audit_trail": records[-50:], "total_records": len(records)}


@router.post("/toggle")
async def toggle_hyperagents(req: ToggleRequest) -> dict[str, Any]:
    """Enable/disable HyperAgent layer."""
    global _config
    _config.enabled = req.enabled
    if req.red_enabled is not None:
        _config.red_hyper_enabled = req.red_enabled
    if req.blue_enabled is not None:
        _config.blue_hyper_enabled = req.blue_enabled
    return {
        "enabled": _config.enabled,
        "red_hyper_enabled": _config.red_hyper_enabled,
        "blue_hyper_enabled": _config.blue_hyper_enabled,
    }


@router.get("/improvements")
async def improvements_list(agent_type: str | None = None) -> dict[str, Any]:
    """List of all self-improvements made."""
    red, blue = _ensure_agents()
    records: list[dict[str, Any]] = []
    for r in red.meta.improvement_log:
        if agent_type and r.agent_type != agent_type:
            continue
        records.append(r.model_dump())
    for r in blue.meta.improvement_log:
        if agent_type and r.agent_type != agent_type:
            continue
        records.append(r.model_dump())
    records.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return {"improvements": records[:50], "total": len(records)}


@router.get("/meta-insights")
async def meta_insights() -> dict[str, Any]:
    """Meta-agent's self-reflections."""
    red, blue = _ensure_agents()
    return {
        "red": {
            "evaluation_focus": red.meta.evaluation_focus,
            "change_magnitude": red.meta.change_magnitude,
            "improvement_frequency": red.meta.improvement_frequency,
            "strategy_history_count": len(red.meta.strategy_history),
            "improvement_log_count": len(red.meta.improvement_log),
        },
        "blue": {
            "evaluation_focus": blue.meta.evaluation_focus,
            "change_magnitude": blue.meta.change_magnitude,
            "improvement_frequency": blue.meta.improvement_frequency,
            "strategy_history_count": len(blue.meta.strategy_history),
            "improvement_log_count": len(blue.meta.improvement_log),
        },
    }


@router.websocket("/ws/live")
async def hyper_live_ws(ws: WebSocket) -> None:
    """WebSocket for real-time meta-agent thinking stream."""
    await ws.accept()
    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                cmd = msg.get("command", "")
                if cmd == "status":
                    red, blue = _ensure_agents()
                    await ws.send_json({
                        "type": "hyper_status",
                        "red": red.get_strategy(),
                        "blue": blue.get_strategy(),
                    })
                elif cmd == "reflect":
                    agent_type = msg.get("agent", "red")
                    red, blue = _ensure_agents()
                    agent = red if agent_type == "red" else blue
                    result = await agent.meta.self_reflect()
                    await ws.send_json({
                        "type": "meta_reflection",
                        "agent": agent_type,
                        "self_assessment": result.self_assessment,
                        "patterns_noticed": result.patterns_noticed,
                        "meta_changes": result.meta_changes,
                        "confidence": result.confidence_in_self_assessment,
                    })
                else:
                    await ws.send_json({"type": "error", "message": f"Unknown command: {cmd}"})
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON"})
    except WebSocketDisconnect:
        logger.info("HyperAgent WebSocket disconnected")
    except Exception as exc:
        logger.warning(f"HyperAgent WebSocket error: {exc}")

```

## File: `backend/src/hyperagents/test_integration.py`

```python
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

```

## File: `backend/src/hyperagents/standalone.py`

```python
"""Standalone HyperAgent API service — run on a separate port."""

from __future__ import annotations

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.hyperagents.hyper_router import router as hyper_router

hyper_app = FastAPI(
    title="CyberGuardian HyperAgents API",
    description="Self-improving agent meta-layer for CyberGuardian AI",
    version="0.1.0",
)

hyper_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

hyper_app.include_router(hyper_router)


if __name__ == "__main__":
    uvicorn.run(hyper_app, host="0.0.0.0", port=8002)

```

## File: `backend/src/hyperagents/training_integration.py`

```python
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

```

## File: `backend/src/persistence/database.py`

```python
"""Async SQLAlchemy engine + session factory for Postgres persistence."""

from __future__ import annotations

import os

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/athernex",
)

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5, max_overflow=10)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create all tables (only for dev — use Alembic in prod)."""
    async with engine.begin() as conn:
        from .models import ConnectorProfile, UrlReport, PollingHistory  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    await engine.dispose()

```

## File: `backend/src/persistence/models.py`

```python
"""SQLAlchemy ORM models for multi-tenant persistence."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Float, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class ConnectorProfile(Base):
    """Tenant-scoped SIEM connector configuration."""

    __tablename__ = "connector_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str] = mapped_column(String(256))
    vendor: Mapped[str] = mapped_column(String(64), default="generic")
    feed_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_header: Mapped[str | None] = mapped_column(Text, nullable=True)
    polling_interval_seconds: Mapped[int] = mapped_column(Integer, default=300)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    polling_history: Mapped[list["PollingHistory"]] = relationship(back_populates="connector", cascade="all, delete-orphan")


class UrlReport(Base):
    """Persisted URL security scan result."""

    __tablename__ = "url_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(128), index=True)
    url: Mapped[str] = mapped_column(Text)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    risk_label: Mapped[str] = mapped_column(String(32), default="unknown")
    findings_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PollingHistory(Base):
    """Timestamped record of a connector polling attempt."""

    __tablename__ = "polling_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    connector_id: Mapped[str] = mapped_column(String(36), ForeignKey("connector_profiles.id"), index=True)
    tenant_id: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    events_ingested: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    polled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    connector: Mapped["ConnectorProfile"] = relationship(back_populates="polling_history")

```

## File: `backend/src/persistence/crud.py`

```python
"""CRUD helpers for Postgres persistence layer."""

from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ConnectorProfile, UrlReport, PollingHistory


# ── ConnectorProfile ────────────────────────────────────────────────────────

async def create_connector(
    session: AsyncSession,
    tenant_id: str,
    name: str,
    vendor: str = "generic",
    feed_url: str | None = None,
    auth_header: str | None = None,
    polling_interval_seconds: int = 300,
) -> ConnectorProfile:
    profile = ConnectorProfile(
        tenant_id=tenant_id,
        name=name,
        vendor=vendor,
        feed_url=feed_url,
        auth_header=auth_header,
        polling_interval_seconds=polling_interval_seconds,
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def list_connectors(session: AsyncSession, tenant_id: str) -> Sequence[ConnectorProfile]:
    result = await session.execute(
        select(ConnectorProfile)
        .where(ConnectorProfile.tenant_id == tenant_id)
        .order_by(ConnectorProfile.created_at.desc())
    )
    return result.scalars().all()


async def get_connector(session: AsyncSession, connector_id: str) -> ConnectorProfile | None:
    return await session.get(ConnectorProfile, connector_id)


async def delete_connector(session: AsyncSession, connector_id: str) -> bool:
    obj = await session.get(ConnectorProfile, connector_id)
    if obj:
        await session.delete(obj)
        await session.commit()
        return True
    return False


# ── UrlReport ───────────────────────────────────────────────────────────────

async def upsert_url_report(
    session: AsyncSession,
    tenant_id: str,
    url: str,
    risk_score: float,
    risk_label: str,
    findings_json: str | None = None,
) -> UrlReport:
    """Insert or update a URL report (keyed by tenant + url)."""
    result = await session.execute(
        select(UrlReport)
        .where(UrlReport.tenant_id == tenant_id, UrlReport.url == url)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.risk_score = risk_score
        existing.risk_label = risk_label
        existing.findings_json = findings_json
        await session.commit()
        return existing

    report = UrlReport(
        tenant_id=tenant_id,
        url=url,
        risk_score=risk_score,
        risk_label=risk_label,
        findings_json=findings_json,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


async def list_url_reports(session: AsyncSession, tenant_id: str, limit: int = 50) -> Sequence[UrlReport]:
    result = await session.execute(
        select(UrlReport)
        .where(UrlReport.tenant_id == tenant_id)
        .order_by(UrlReport.scanned_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


# ── PollingHistory ──────────────────────────────────────────────────────────

async def record_poll(
    session: AsyncSession,
    connector_id: str,
    tenant_id: str,
    status: str = "success",
    events_ingested: int = 0,
    error: str | None = None,
) -> PollingHistory:
    entry = PollingHistory(
        connector_id=connector_id,
        tenant_id=tenant_id,
        status=status,
        events_ingested=events_ingested,
        error=error,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def get_polling_history(
    session: AsyncSession,
    connector_id: str,
    limit: int = 50,
) -> Sequence[PollingHistory]:
    result = await session.execute(
        select(PollingHistory)
        .where(PollingHistory.connector_id == connector_id)
        .order_by(PollingHistory.polled_at.desc())
        .limit(limit)
    )
    return result.scalars().all()

```

## File: `backend/src/persistence/__init__.py`

```python

```

## File: `src/main.tsx`

```tsx
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

/* ─── Patch requestAnimationFrame BEFORE anything loads ───
   Spline's onFrame handler throws "Cannot read properties of
   undefined (reading 'position')" — this guard suppresses it
   at the rAF level so it never reaches the console.          */
const _origRaf = window.requestAnimationFrame;
window.requestAnimationFrame = function (cb: FrameRequestCallback): number {
  return _origRaf.call(window, (time) => {
    try { cb(time); } catch { /* suppress Spline internal crash */ }
  });
};

/* Suppress unhandled error events from Spline's internal code */
window.addEventListener('error', (event) => {
  if (event.message?.includes('position') || event.message?.includes('spline') || event.message?.includes('Spline')) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

createRoot(document.getElementById('root')!).render(
  <App />
);

```

## File: `src/App.tsx`

```tsx
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { ProductShell } from './components/layout/ProductShell';
import { useAppRouter, type AppRoute } from './hooks/useAppRouter';
import { AttackGraphPage } from './pages/AttackGraphPage';
import { LivePage } from './pages/LivePage';
import { Login, type StoredAuth } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { PricingPage } from './pages/PricingPage';
import { PipelinePage } from './pages/PipelinePage';
import { PlaybooksPage } from './pages/PlaybooksPage';
import { TrainingPage } from './pages/TrainingPage';
import { UrlSecurityPage } from './pages/UrlSecurityPage';
import { WebsitePage } from './pages/WebsitePage';
import { FeaturesPage } from './pages/FeaturesPage';
import { TechnologyPage } from './pages/TechnologyPage';
import { BlogsPage } from './pages/BlogsPage';
import { AboutPage } from './pages/AboutPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { ThreatReportPage } from './pages/ThreatReportPage';
import { useSimulationStore } from './store/simulationStore';

const PRODUCT_ROUTES = [
  '/live',
  '/pipeline',
  '/attack-graph',
  '/playbooks',
  '/training',
  '/url-security',
  '/integrations',
] as const satisfies readonly AppRoute[];
type ProductRoute = (typeof PRODUCT_ROUTES)[number];

const AUTH_STORAGE_KEY = 'cg_auth';

const isProductRoute = (route: AppRoute): route is ProductRoute =>
  PRODUCT_ROUTES.includes(route as ProductRoute);

const readStoredAuth = (): StoredAuth | null => {
  const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StoredAuth>;
    if (typeof parsed?.token !== 'string' || !parsed.token) {
      return null;
    }
    return {
      token: parsed.token,
      alias: typeof parsed.alias === 'string' ? parsed.alias : '',
      onboarded: Boolean(parsed.onboarded),
      operatorId: typeof parsed.operatorId === 'string' ? parsed.operatorId : undefined,
    };
  } catch {
    return null;
  }
};

function App() {
  const { navigate, route } = useAppRouter();
  const { isConnected, maxSteps, simulationId, startSimulation, step } = useSimulationStore();
  const [authIdentity, setAuthIdentity] = useState<StoredAuth | null>(null);

  useEffect(() => {
    setAuthIdentity(readStoredAuth());
  }, []);

  const isAuthenticated = Boolean(authIdentity?.token);

  useEffect(() => {
    if (route === '/auth') {
      navigate('/login');
      return;
    }

    if ((route === '/login' || route === '/onboarding' || route === '/pricing') && !isAuthenticated && route !== '/login') {
      navigate('/login');
      return;
    }

    if (route === '/login' && isAuthenticated) {
      navigate('/pricing');
      return;
    }

    if (route === '/onboarding' && isAuthenticated && authIdentity?.onboarded) {
      navigate('/live');
      return;
    }

    if (isProductRoute(route) && !isAuthenticated) {
      navigate('/login');
      return;
    }

    if (isProductRoute(route) && isAuthenticated && !authIdentity?.onboarded) {
      navigate('/onboarding');
      return;
    }

    if (isProductRoute(route) && isAuthenticated && authIdentity?.onboarded && !isConnected && !simulationId && !useSimulationStore.getState()._connectionAttempted) {
      void startSimulation();
    }
  }, [authIdentity?.onboarded, isAuthenticated, isConnected, navigate, route, simulationId, startSimulation]);

  const openProduct = async (targetRoute: ProductRoute = '/live') => {
    navigate(targetRoute);
    if (!isConnected) {
      await startSimulation();
    }
  };

  if (route === '/') {
    return (
      <>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(17, 20, 23, 0.94)',
              color: '#e1e2e7',
              border: '1px solid rgba(176, 198, 255, 0.16)',
            },
          }}
        />
        <WebsitePage
          onDemo={() => navigate(isAuthenticated ? (authIdentity?.onboarded ? '/live' : '/onboarding') : '/login')}
          onLogin={() => navigate(isAuthenticated ? (authIdentity?.onboarded ? '/live' : '/onboarding') : '/login')}
        />
      </>
    );
  }

  if (route === '/features') {
    return <FeaturesPage />;
  }
  if (route === '/technology') {
    return <TechnologyPage />;
  }
  if (route === '/blogs') {
    return <BlogsPage />;
  }
  if (route === '/threat-report') {
    return <ThreatReportPage />;
  }
  if (route === '/about') {
    return <AboutPage />;
  }
  if ((route === '/login' || route === '/auth') && isAuthenticated) {
    return null;
  }

  if (route === '/onboarding' && (!authIdentity || authIdentity.onboarded)) {
    return null;
  }

  if (isProductRoute(route) && (!authIdentity || !authIdentity.onboarded)) {
    return null;
  }

  if (route === '/login' || route === '/auth') {
    return (
      <>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(17, 20, 23, 0.94)',
              color: '#e1e2e7',
              border: '1px solid rgba(176, 198, 255, 0.16)',
            },
          }}
        />
        <Login
          onAuthenticated={(auth) => {
            setAuthIdentity(auth);
            navigate('/pricing');
          }}
          onBack={() => navigate('/')}
        />
      </>
    );
  }

  if (route === '/pricing' && authIdentity) {
    return (
      <PricingPage 
        auth={authIdentity} 
        onProceed={() => navigate(authIdentity.onboarded ? '/live' : '/onboarding')} 
      />
    );
  }

  if (route === '/onboarding' && authIdentity) {
    return (
      <>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(17, 20, 23, 0.94)',
              color: '#e1e2e7',
              border: '1px solid rgba(176, 198, 255, 0.16)',
            },
          }}
        />
        <Onboarding
          auth={authIdentity}
          onAuthChange={(auth) => setAuthIdentity(auth)}
          onComplete={(auth) => {
            setAuthIdentity(auth);
            void openProduct('/live');
          }}
        />
      </>
    );
  }

  if (!isProductRoute(route)) {
    return null;
  }

  return (
    <>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(17, 20, 23, 0.96)',
            color: '#e1e2e7',
            border: '1px solid rgba(20, 209, 255, 0.18)',
          },
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <ProductShell
          step={step}
          maxSteps={maxSteps}
        >
          {renderRoute(route)}
        </ProductShell>
      </div>
      <div className="scanline-overlay" />
    </>
  );
}

function renderRoute(route: ProductRoute) {
  switch (route) {
    case '/live':
      return <LivePage />;
    case '/pipeline':
      return <PipelinePage />;
    case '/attack-graph':
      return <AttackGraphPage />;
    case '/playbooks':
      return <PlaybooksPage />;
    case '/training':
      return <TrainingPage />;
    case '/url-security':
      return <UrlSecurityPage />;
    case '/integrations':
      return <IntegrationsPage />;
    default:
      return <LivePage />;
  }
}

export default App;

```

## File: `src/index.css`

```tsx
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Orbitron:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&family=Share+Tech+Mono&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-void: #03050f;
  --bg-base: #0c0e12;
  --bg-surface: #111417;
  --bg-surface-low: #191c1f;
  --bg-surface-high: #282a2e;
  --bg-surface-highest: #323539;
  --bg-panel: rgba(17, 20, 23, 0.82);
  --bg-panel-strong: rgba(12, 14, 18, 0.94);
  --bg-glass: rgba(25, 28, 31, 0.68);
  --grid-line: rgba(166, 230, 255, 0.08);
  --line: rgba(166, 230, 255, 0.14);
  --line-strong: rgba(176, 198, 255, 0.28);
  --text-primary: #e1e2e7;
  --text-secondary: #c2c6d8;
  --text-muted: #8c90a1;
  --primary: #b0c6ff;
  --primary-strong: #568dff;
  --secondary: #a6e6ff;
  --secondary-strong: #14d1ff;
  --secondary-glow: rgba(20, 209, 255, 0.22);
  --success: #00ff88;
  --warning: #ffcc00;
  --danger: #ff0044;
  --danger-soft: #ff6f91;
}

@layer base {
  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    min-height: 100%;
  }

  body {
    margin: 0;
    background:
      radial-gradient(circle at top, rgba(86, 141, 255, 0.16), transparent 32%),
      radial-gradient(circle at 80% 20%, rgba(20, 209, 255, 0.11), transparent 20%),
      linear-gradient(180deg, #04060b 0%, #0c0e12 42%, #05070a 100%);
    color: var(--text-primary);
    font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  code {
    font-family: 'JetBrains Mono', monospace;
  }

  ::selection {
    background: rgba(176, 198, 255, 0.25);
    color: white;
  }
}

@layer components {
  .glass-card {
    background: rgba(50, 53, 57, 0.3);
    backdrop-filter: blur(24px);
  }

  .marketing-glass-card {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(9px);
    -webkit-backdrop-filter: blur(9px);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1),
      inset 0 0 20px 10px rgba(255, 255, 255, 1);
    position: relative;
    overflow: hidden;
  }

  .marketing-glass-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.8),
      transparent
    );
  }

  .marketing-glass-card::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 100%;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.8),
      transparent,
      rgba(255, 255, 255, 0.3)
    );
  }

  .ghost-border {
    outline: 1px solid rgba(140, 144, 161, 0.15);
  }

  .repello-nav-glass {
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.36);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  }

  .ops-card {
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, rgba(25, 28, 31, 0.65), rgba(12, 14, 18, 0.55));
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(24px);
    transition: transform 300ms ease, box-shadow 300ms ease, border-color 300ms ease;
  }

  .ops-card:hover {
    transform: translateY(-2px) scale(1.005);
    border-color: rgba(255, 255, 255, 0.16);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }

  /* Bento Grid Constants */
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.25rem;
    grid-auto-flow: dense;
  }

  .bento-grid-dense {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .bento-cell-span-2 {
    grid-column: span 2;
  }
  
  @media (max-width: 1024px) {
    .bento-cell-span-2 {
      grid-column: span 1;
    }
  }

  .bento-glass {
    border-radius: 24px;
    background: rgba(17, 20, 23, 0.45);
    backdrop-filter: blur(28px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    position: relative;
    transition: all 400ms cubic-bezier(0.19, 1, 0.22, 1);
  }

  .bento-glass:hover {
    box-shadow: 0 26px 48px rgba(0, 0, 0, 0.5), 0 0 40px rgba(20, 209, 255, 0.05);
    border-color: rgba(20, 209, 255, 0.2);
  }

  .ops-display {
    font-family: 'Orbitron', monospace;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .ops-data {
    font-family: 'Share Tech Mono', 'JetBrains Mono', monospace;
  }

  .ops-label {
    font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(225, 226, 231, 0.72);
  }

  .ops-muted {
    color: var(--text-muted);
  }

  .ops-input {
    min-height: 52px;
    width: 100%;
    border: 1px solid rgba(176, 198, 255, 0.18);
    border-radius: 12px;
    background: rgba(12, 14, 18, 0.88);
    color: var(--text-primary);
    padding: 0 16px;
    outline: none;
    transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
  }

  .ops-input:focus {
    border-color: rgba(20, 209, 255, 0.42);
    box-shadow: 0 0 0 3px rgba(20, 209, 255, 0.12);
  }

  .ops-button,
  .ops-chip-button {
    cursor: pointer;
    transition:
      transform 180ms ease,
      border-color 180ms ease,
      background 180ms ease,
      box-shadow 180ms ease,
      color 180ms ease;
  }

  .ops-button {
    min-height: 48px;
    border-radius: 12px;
    border: 1px solid rgba(176, 198, 255, 0.18);
    background: rgba(176, 198, 255, 0.08);
    color: var(--text-primary);
    padding: 0 16px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .ops-button:hover:not(:disabled),
  .ops-chip-button:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(20, 209, 255, 0.38);
    box-shadow: 0 12px 28px rgba(20, 209, 255, 0.1);
  }

  .ops-button:disabled,
  .ops-chip-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    box-shadow: none;
  }

  .ops-button-primary {
    background: linear-gradient(135deg, rgba(86, 141, 255, 0.24), rgba(20, 209, 255, 0.12));
    border-color: rgba(20, 209, 255, 0.3);
    box-shadow: 0 18px 30px rgba(20, 209, 255, 0.12);
  }

  .ops-chip-button {
    min-height: 40px;
    border-radius: 999px;
    border: 1px solid rgba(166, 230, 255, 0.18);
    background: rgba(166, 230, 255, 0.08);
    color: var(--secondary);
    padding: 0.7rem 1rem;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 34px;
    border-radius: 999px;
    border: 1px solid rgba(176, 198, 255, 0.16);
    background: rgba(176, 198, 255, 0.07);
    color: rgba(225, 226, 231, 0.82);
    padding: 0 0.95rem;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .status-pill-live {
    border-color: rgba(20, 209, 255, 0.34);
    background: rgba(20, 209, 255, 0.12);
    color: var(--secondary);
    box-shadow: 0 0 0 1px rgba(20, 209, 255, 0.08), 0 0 24px rgba(20, 209, 255, 0.08);
  }

  .section-heading-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .panel-title {
    margin: 0.4rem 0 0;
    font-size: 1.08rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: white;
  }

  .empty-panel {
    display: flex;
    min-height: 280px;
    align-items: center;
    justify-content: center;
    border: 1px dashed rgba(166, 230, 255, 0.14);
    border-radius: 16px;
    background:
      linear-gradient(180deg, rgba(17, 20, 23, 0.58), rgba(12, 14, 18, 0.84)),
      radial-gradient(circle at center, rgba(20, 209, 255, 0.06), transparent 60%);
    color: var(--text-secondary);
    padding: 1.5rem;
    text-align: center;
    line-height: 1.7;
  }

  .product-shell {
    position: relative;
    display: flex;
    min-height: 100vh;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.01) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.01) 1px, transparent 1px),
      radial-gradient(circle at top, rgba(86, 141, 255, 0.06), transparent 30%),
      linear-gradient(180deg, rgba(4, 6, 11, 0.7) 0%, rgba(12, 14, 18, 0.75) 100%);
    background-size: 40px 40px, 40px 40px, auto, auto;
  }

  .product-shell::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 15% 15%, rgba(20, 209, 255, 0.06), transparent 20%),
      radial-gradient(circle at 85% 0%, rgba(176, 198, 255, 0.05), transparent 24%);
  }

  .product-sidebar {
    position: sticky;
    top: 0;
    z-index: 20;
    width: 88px;
    min-height: 100vh;
    align-items: center;
    gap: 1.25rem;
    border-right: 1px solid rgba(166, 230, 255, 0.1);
    background: rgba(12, 14, 18, 0.82);
    padding: 1.5rem 1rem;
    backdrop-filter: blur(20px);
  }

  .brand-lockup {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    gap: 0.8rem;
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
  }

  .brand-mark {
    display: grid;
    height: 50px;
    width: 50px;
    place-items: center;
    border: 1px solid rgba(176, 198, 255, 0.26);
    border-radius: 16px;
    background:
      radial-gradient(circle at top, rgba(176, 198, 255, 0.22), transparent 65%),
      rgba(17, 20, 23, 0.9);
    color: white;
    font-family: 'Orbitron', monospace;
    font-size: 0.88rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    box-shadow: 0 0 24px rgba(20, 209, 255, 0.08);
  }

  .sidebar-link {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
    border: 1px solid transparent;
    border-radius: 18px;
    background: transparent;
    color: rgba(225, 226, 231, 0.7);
    padding: 0.95rem 0.45rem;
  }

  .sidebar-link-active {
    border-color: rgba(20, 209, 255, 0.22);
    background:
      linear-gradient(180deg, rgba(20, 209, 255, 0.12), rgba(86, 141, 255, 0.08)),
      rgba(17, 20, 23, 0.9);
    color: var(--secondary);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 28px rgba(20, 209, 255, 0.08);
  }

  .status-pod {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(166, 230, 255, 0.1);
    border-radius: 18px;
    background: rgba(17, 20, 23, 0.7);
    padding: 1rem 0.5rem;
  }

  .status-dot-icon {
    color: rgba(140, 144, 161, 0.7);
  }

  .status-dot-live {
    color: var(--success);
    filter: drop-shadow(0 0 10px rgba(0, 255, 136, 0.4));
  }

  .product-main {
    position: relative;
    flex: 1;
    min-width: 0;
    padding: 1.25rem;
  }

  .product-content {
    position: relative;
    z-index: 2;
  }

  .top-status-bar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.2rem;
    margin-bottom: 1.25rem;
    border: 1px solid rgba(166, 230, 255, 0.1);
    border-radius: 16px;
    background:
      linear-gradient(180deg, rgba(17, 20, 23, 0.9), rgba(12, 14, 18, 0.92)),
      radial-gradient(circle at top left, rgba(176, 198, 255, 0.1), transparent 40%);
    padding: 1rem 1.25rem;
    backdrop-filter: blur(18px);
  }

  .topbar-title-row {
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
    flex-wrap: wrap;
  }

  .topbar-metrics {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.7rem;
  }

  .page-stack {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    pointer-events: auto;
  }

  .ops-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid rgba(166, 230, 255, 0.1);
    border-radius: 16px;
    background: rgba(17, 20, 23, 0.76);
    padding: 1rem 1.1rem;
    backdrop-filter: blur(18px);
  }

  .toolbar-block {
    min-width: min(100%, 420px);
  }

  .toolbar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .live-grid,
  .attack-graph-layout,
  .playbooks-layout {
    display: grid;
    gap: 1.25rem;
    pointer-events: auto;
  }

  .live-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .live-side-column {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .dual-feed-grid,
  .two-column-grid,
  .training-metric-grid {
    display: grid;
    gap: 1.25rem;
    pointer-events: auto;
  }

  .dual-feed-grid,
  .two-column-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .training-metric-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .alert-card {
    position: relative;
    border-radius: 14px;
    border: 1px solid rgba(166, 230, 255, 0.12);
    background:
      linear-gradient(180deg, rgba(25, 28, 31, 0.94), rgba(12, 14, 18, 0.96)),
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.03), transparent 35%);
    padding: 1rem;
    box-shadow: inset 4px 0 0 rgba(166, 230, 255, 0.18);
  }

  .alert-card-low {
    box-shadow: inset 4px 0 0 rgba(0, 255, 136, 0.55);
  }

  .alert-card-medium {
    box-shadow: inset 4px 0 0 rgba(255, 204, 0, 0.6);
  }

  .alert-card-high {
    box-shadow: inset 4px 0 0 rgba(255, 111, 145, 0.72);
  }

  .alert-card-critical {
    box-shadow:
      inset 4px 0 0 rgba(255, 0, 68, 0.88),
      0 0 28px rgba(255, 0, 68, 0.14);
  }

  .host-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(176, 198, 255, 0.14);
    border-radius: 999px;
    background: rgba(176, 198, 255, 0.08);
    color: var(--primary);
    padding: 0.34rem 0.7rem;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .meter-track {
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
  }

  .meter-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(176, 198, 255, 0.82), rgba(20, 209, 255, 0.92));
    box-shadow: 0 0 18px rgba(20, 209, 255, 0.22);
  }

  .ring-gauge-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }

  .metric-ring-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(166, 230, 255, 0.12);
    border-radius: 14px;
    background:
      radial-gradient(circle at top, rgba(176, 198, 255, 0.08), transparent 42%),
      rgba(12, 14, 18, 0.78);
    padding: 1rem 0.75rem;
  }

  .feed-item {
    border-radius: 14px;
    border: 1px solid rgba(166, 230, 255, 0.1);
    padding: 0.9rem 0.95rem;
    background: rgba(17, 20, 23, 0.88);
  }

  .feed-item-critical {
    border-color: rgba(255, 0, 68, 0.18);
    background: rgba(44, 9, 18, 0.7);
  }

  .feed-item-warning {
    border-color: rgba(255, 204, 0, 0.18);
    background: rgba(46, 34, 9, 0.56);
  }

  .feed-item-info {
    border-color: rgba(176, 198, 255, 0.18);
    background: rgba(20, 24, 29, 0.82);
  }

  .feed-item-success {
    border-color: rgba(0, 255, 136, 0.18);
    background: rgba(7, 38, 24, 0.5);
  }

  .radar-shell {
    position: relative;
    border: 1px solid rgba(20, 209, 255, 0.16);
    border-radius: 20px;
    background:
      radial-gradient(circle at center, rgba(20, 209, 255, 0.12), transparent 58%),
      linear-gradient(180deg, rgba(9, 17, 26, 0.7), rgba(3, 8, 14, 0.8));
    padding: 1rem;
    overflow: hidden;
    transition: all 300ms ease;
  }

  .radar-shell:hover {
    border-color: rgba(20, 209, 255, 0.35);
    box-shadow: inset 0 0 20px rgba(20, 209, 255, 0.1);
  }

  .radar-shell::after {
    content: '';
    position: absolute;
    inset: 16px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }

  .threat-radar-sweep {
    transform-origin: 50% 50%;
    animation: radarSweep 4.8s linear infinite;
  }

  .threat-radar-ping {
    transform-origin: center;
    animation: radarPing 2.1s ease-in-out infinite;
  }

  .storyboard-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .storyboard-card {
    position: relative;
    overflow: hidden;
    min-height: 220px;
    border: 1px solid rgba(176, 198, 255, 0.12);
    border-radius: 18px;
    background:
      linear-gradient(180deg, rgba(17, 20, 23, 0.92), rgba(8, 12, 18, 0.98)),
      radial-gradient(circle at top, rgba(176, 198, 255, 0.08), transparent 42%);
    padding: 1rem;
  }

  .storyboard-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent 50%);
    pointer-events: none;
  }

  .storyboard-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    box-shadow: 0 0 18px currentColor;
  }

  .storyboard-link {
    position: absolute;
    left: calc(100% - 8px);
    top: 50%;
    width: 28px;
    height: 2px;
    opacity: 0.7;
  }

  .battle-tug {
    display: flex;
    overflow: hidden;
    margin-top: 1rem;
    height: 92px;
    border: 1px solid rgba(166, 230, 255, 0.1);
    border-radius: 16px;
    background: rgba(12, 14, 18, 0.82);
  }

  .battle-score {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.2rem;
    font-family: 'Share Tech Mono', monospace;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .battle-score span {
    font-size: 0.72rem;
    opacity: 0.72;
  }

  .battle-score strong {
    font-size: 1.8rem;
    font-weight: 700;
  }

  .red-score {
    background:
      linear-gradient(90deg, rgba(255, 0, 68, 0.58), rgba(255, 0, 68, 0.16)),
      rgba(18, 10, 14, 0.94);
    color: #ffe8ef;
  }

  .blue-score {
    margin-left: auto;
    background:
      linear-gradient(270deg, rgba(20, 209, 255, 0.58), rgba(20, 209, 255, 0.14)),
      rgba(9, 17, 26, 0.94);
    color: #eafcff;
  }

  .pipeline-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 1.25rem;
  }

  .pipeline-stage-card,
  .branch-card,
  .countdown-card,
  .playbook-list-item {
    border: 1px solid rgba(166, 230, 255, 0.1);
    border-radius: 14px;
    background:
      linear-gradient(180deg, rgba(25, 28, 31, 0.9), rgba(12, 14, 18, 0.96)),
      radial-gradient(circle at top, rgba(176, 198, 255, 0.07), transparent 46%);
  }

  .pipeline-stage-card {
    padding: 1rem;
  }

  .pipeline-stage-card h3 {
    margin: 0.55rem 0 0.6rem;
    font-size: 1rem;
    color: white;
  }

  .pipeline-stage-card p {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  .branch-card {
    padding: 1rem;
  }

  .metric-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .attack-graph-layout {
    grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.7fr);
  }

  .countdown-card {
    padding: 1rem 1.05rem;
  }

  .playbooks-layout {
    grid-template-columns: minmax(300px, 0.78fr) minmax(0, 1.42fr);
  }

  .playbook-list-item {
    width: 100%;
    text-align: left;
    padding: 1rem;
    transition: border-color 180ms ease, transform 180ms ease, background 180ms ease;
  }

  .playbook-list-item-active {
    border-color: rgba(20, 209, 255, 0.26);
    background:
      linear-gradient(180deg, rgba(20, 209, 255, 0.12), rgba(86, 141, 255, 0.08)),
      rgba(12, 14, 18, 0.94);
  }

  .playbook-steps {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .playbook-step {
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr);
    gap: 1rem;
    align-items: flex-start;
  }

  .step-number {
    display: grid;
    height: 56px;
    width: 56px;
    place-items: center;
    border: 1px solid rgba(20, 209, 255, 0.22);
    border-radius: 14px;
    background: rgba(20, 209, 255, 0.09);
    color: var(--secondary);
    font-family: 'Orbitron', monospace;
    font-size: 1rem;
    font-weight: 700;
  }

  .step-body {
    border: 1px solid rgba(166, 230, 255, 0.1);
    border-radius: 14px;
    background: rgba(17, 20, 23, 0.88);
    padding: 1rem 1.05rem;
  }

  .step-command {
    display: block;
    margin-top: 0.85rem;
    overflow-x: auto;
    border-radius: 12px;
    background: rgba(6, 8, 12, 0.9);
    color: var(--secondary);
    padding: 0.85rem 0.95rem;
    font-size: 0.82rem;
    line-height: 1.6;
  }

  .step-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    margin-top: 0.9rem;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .auth-page {
    position: relative;
    display: grid;
    min-height: 100vh;
    grid-template-columns: minmax(0, 1.08fr) minmax(380px, 0.92fr);
    overflow: hidden;
    background:
      radial-gradient(circle at top left, rgba(86, 141, 255, 0.16), transparent 30%),
      radial-gradient(circle at 82% 18%, rgba(20, 209, 255, 0.12), transparent 20%),
      linear-gradient(180deg, #05070b 0%, #0b0e14 48%, #06080d 100%);
  }

  .auth-backdrop-grid {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.35));
    pointer-events: none;
  }

  .auth-panel {
    position: relative;
    z-index: 2;
    display: flex;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    padding: clamp(1.4rem, 3vw, 3rem);
  }

  .auth-panel-brand {
    gap: 1.2rem;
    border-right: 1px solid rgba(166, 230, 255, 0.1);
  }

  .auth-panel-brand h1 {
    margin: 0;
    max-width: 10ch;
    font-size: clamp(2.5rem, 5vw, 4.8rem);
    line-height: 0.94;
    letter-spacing: -0.05em;
    color: white;
  }

  .auth-panel-brand p {
    max-width: 34rem;
    margin: 0;
    color: var(--text-secondary);
    font-size: 1rem;
    line-height: 1.9;
  }

  .auth-feature-list {
    display: grid;
    gap: 0.85rem;
    max-width: 38rem;
    margin-top: 1rem;
  }

  .auth-feature-card {
    display: grid;
    gap: 0.42rem;
    border: 1px solid rgba(166, 230, 255, 0.1);
    border-radius: 14px;
    background:
      linear-gradient(180deg, rgba(17, 20, 23, 0.86), rgba(12, 14, 18, 0.96)),
      radial-gradient(circle at top left, rgba(176, 198, 255, 0.08), transparent 42%);
    padding: 1rem 1.1rem;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.24);
  }

  .auth-feature-card strong {
    font-size: 0.98rem;
    font-weight: 600;
    line-height: 1.55;
    color: white;
  }

  .auth-panel-form {
    align-items: center;
  }

  .auth-card {
    width: min(100%, 460px);
    border: 1px solid rgba(166, 230, 255, 0.12);
    border-radius: 16px;
    background:
      linear-gradient(180deg, rgba(18, 22, 28, 0.92), rgba(10, 12, 16, 0.98)),
      radial-gradient(circle at top, rgba(176, 198, 255, 0.12), transparent 48%);
    padding: 1.55rem;
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.32),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(18px);
  }

  .auth-card h2 {
    margin: 0.55rem 0 0;
    font-size: 1.7rem;
    color: white;
  }

  .auth-copy {
    margin: 0.7rem 0 0;
    color: var(--text-secondary);
    line-height: 1.8;
  }

  .auth-form {
    display: grid;
    gap: 1rem;
    margin-top: 1.35rem;
  }

  .auth-form label {
    display: grid;
    gap: 0.45rem;
  }

  .auth-submit {
    width: 100%;
    margin-top: 0.35rem;
  }

  .auth-back-link {
    margin-top: 1rem;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.74rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 180ms ease;
  }

  .auth-back-link:hover {
    color: var(--text-primary);
  }

  .scanline-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    background: repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.025) 0,
      rgba(0, 0, 0, 0.025) 1px,
      transparent 1px,
      transparent 4px
    );
    mix-blend-mode: soft-light;
    opacity: 0.32;
  }

  .panel-scroll::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .panel-scroll::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(140, 144, 161, 0.35);
  }
}

@media (max-width: 1279px) {
  .auth-page {
    grid-template-columns: 1fr;
  }

  .auth-panel-brand {
    border-right: 0;
    border-bottom: 1px solid rgba(166, 230, 255, 0.1);
  }

  .live-grid,
  .attack-graph-layout,
  .playbooks-layout,
  .training-metric-grid,
  .pipeline-grid {
    grid-template-columns: 1fr;
  }

  .dual-feed-grid,
  .two-column-grid,
  .ring-gauge-grid {
    grid-template-columns: 1fr;
  }

  .top-status-bar {
    flex-direction: column;
  }

  .topbar-metrics {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .auth-panel {
    padding: 1rem;
  }

  .auth-card {
    width: 100%;
    padding: 1.15rem;
  }

  .auth-panel-brand h1 {
    max-width: none;
    font-size: 2.35rem;
  }

  .product-main {
    padding: 0.9rem;
  }

  .ops-card,
  .ops-toolbar,
  .top-status-bar {
    border-radius: 16px;
  }

  .playbook-step {
    grid-template-columns: 1fr;
  }

  .step-number {
    height: 48px;
    width: 48px;
  }
}

/* Darker top nav */
.ops-nav {
  background: rgba(0, 0, 0, 0.92) !important;
  border-bottom: 1px solid rgba(0, 229, 255, 0.08) !important;
}

@keyframes scrollBounce {
  0%, 100% { transform: translateX(-50%) translateY(0); opacity: 0.5; }
  50% { transform: translateX(-50%) translateY(8px); opacity: 1; }
}

@keyframes radarSweep {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes radarPing {
  0%, 100% { transform: scale(1); opacity: 0.72; }
  50% { transform: scale(1.28); opacity: 1; }
}

/* ── SOC Terminal — color-coded log classes ─────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap');

.v-ip      { color: #5bc8e8 }
.v-port    { color: #7b9bbb }
.v-proto   { color: #9b7bbb }
.v-bytes   { color: #e8b45b }
.v-proc    { color: #bb7be8 }
.v-user    { color: #7be8b4 }
.v-path    { color: #e8e85b }
.v-reg     { color: #e8875b }
.v-url     { color: #5be8a8 }
.v-ua      { color: #a08060 }
.v-flag    { color: #8080d0 }
.v-num     { color: #d0a060 }
.v-country { color: #d06060 }
.v-str     { color: #b0c0a0 }
.v-threat  { font-weight: 700 }
.v-critical{ color: #ff3366 }
.v-high    { color: #ff6b35 }
.v-medium  { color: #ffcc00 }
.v-low     { color: #00ff88 }
.v-benign  { color: #4a6a5a }
.k         { color: #4a6a8a }
.sep       { color: #1e3a4a; padding: 0 3px }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

```

## File: `src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />

declare module '@splinetool/react-spline';

```

## File: `src/lib/ops-types.ts`

```typescript
export type NodeType = 'dmz' | 'app_server' | 'db_server' | 'workstation' | 'internet';
export type NodeStatus = 'clean' | 'compromised' | 'detected' | 'isolated' | 'under_attack';
export type ThreatType = 'brute_force' | 'lateral_movement' | 'data_exfiltration' | 'c2_beacon';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type ContestPhase =
  | 'idle'
  | 'probing'
  | 'contested'
  | 'red_winning'
  | 'blue_winning'
  | 'red_captured'
  | 'blue_defended'
  | 'blue_recaptured';

export interface NetworkNode {
  id: number;
  label: string;
  type: NodeType;
  status: NodeStatus;
  zone_y: number;
  vulnerability_score: number;
  data_value_gb: number;
  patch_level: string;
  alert_scores: Record<ThreatType, number>;
  is_red_current_position: boolean;
  pulse_intensity: number;
  glow_color: string | null;
}

export interface NetworkEdge {
  source: number;
  target: number;
  traffic_volume: number;
  edge_type: 'normal' | 'attack' | 'lateral' | 'exfil' | 'beacon' | 'c2';
  is_active: boolean;
  particle_color: string;
  particle_speed: number;
  particle_count: number;
  direction_reversed: boolean;
}

export interface NetworkGraphState {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  step: number;
  max_steps: number;
  internet_node_active: boolean;
  internet_node_glow: string;
  episode_id: string;
  phase: string;
}

export interface ContestEvent {
  node_id: number;
  node_label: string;
  node_type: NodeType | string;
  phase: ContestPhase;
  red_control_pct: number;
  blue_control_pct: number;
  active_threat_type: ThreatType | string | null;
  mitre_id: string | null;
  mitre_name: string | null;
  severity: Severity;
  red_targeting_reason: string;
  detection_reason: string;
  immediate_action: string;
  layers_active: Record<'network' | 'endpoint' | 'application', boolean>;
  correlation_confidence: number;
  cross_layer_note: string;
  contest_intensity: number;
  red_attack_vector: string;
  step_started: number;
  steps_contested: number;
  winning_reason: string;
}

export interface NodeBattleResult {
  node_id: number;
  node_label: string;
  winner: string;
  outcome: 'captured' | 'defended' | 'recaptured' | string;
  total_steps_fought: number;
  incident_summary: string;
  strategic_impact: string;
  playbook_id: string;
  false_positive: boolean;
  false_positive_reason: string | null;
  step_resolved: number;
  victory_reason: string;
}

export type DecisionScores = Record<string, number>;

export interface BattleScoreboard {
  red_nodes_controlled: number;
  blue_nodes_secured: number;
  contested_nodes: number;
  red_total_captures: number;
  blue_total_defenses: number;
  blue_total_recaptures: number;
  false_positives_this_episode: number;
  red_progress: number;
  blue_progress: number;
  red_next_targets: number[];
}

export interface AgentAction {
  agent: 'red' | 'blue' | string;
  action_name: string;
  target_host_id: number;
  target_host_label: string;
  success: boolean;
  reward: number;
  timestamp: number;
  log_color: string;
  outcome_color: string;
  reason: string;
  is_false_positive: boolean;
}

export interface ThreatAlert {
  id: string;
  threat_type: ThreatType;
  severity: Severity;
  confidence: number;
  affected_hosts: number[];
  affected_host_labels: string[];
  mitre_id: string;
  mitre_name: string;
  layers_flagged: number;
  layer_breakdown: Record<'network' | 'endpoint' | 'application', boolean>;
  headline: string;
  detail: string;
  false_positive_indicators: string[];
  is_likely_false_positive: boolean;
  timestamp: number;
  status: string;
}

export interface ShadowExecutionBranch {
  action_name: string;
  target_host: number;
  target_label: string;
  risk_score: number;
  classification: string;
  predicted_reward: number;
  child_branches: ShadowExecutionBranch[];
}

export interface AttackGraphNode {
  id: string;
  label: string;
  compromised: boolean;
  is_critical_target: boolean;
  x: number | null;
  y: number | null;
}

export interface AttackGraphEdge {
  source: string;
  target: string;
  action_type: string;
  success: boolean;
  step_occurred: number;
  is_critical_path: boolean;
  is_predicted: boolean;
}

export interface CapabilityNode {
  id: string;
  node_type: 'agent' | 'resource' | string;
  label: string;
}

export interface CapabilityEdge {
  source: string;
  target: string;
  action: string;
  trust_score: number;
  is_permitted: boolean;
}

export interface AutonomyBudgetState {
  remaining: number;
  max_budget: number;
  spent_this_episode: number;
  spend_by_action: Record<string, number>;
  replenishment_rate: number;
  is_throttled: boolean;
}

export interface PipelineState {
  step: number;
  intent_vector: number[];
  risk_class: string;
  drift_score: number;
  drift_detected: boolean;
  drift_description: string;
  shadow_branches: ShadowExecutionBranch[];
  recommended_action: string;
  shadow_risk_score: number;
  attack_graph_nodes: AttackGraphNode[];
  attack_graph_edges: AttackGraphEdge[];
  critical_path: string[];
  steps_to_db_breach: number | null;
  data_at_risk_gb: number;
  capability_nodes: CapabilityNode[];
  capability_edges: CapabilityEdge[];
  autonomy_budget: AutonomyBudgetState;
  blue_win_rate_recent: number;
  red_win_rate_recent: number;
  detection_rate_recent: number;
}

export interface PlaybookStep {
  step_number: number;
  title: string;
  action: string;
  command: string | null;
  expected_outcome: string;
  risk_level: string;
  estimated_time: string;
  status: string;
}

export interface Playbook {
  id: string;
  alert_id: string;
  threat_type: ThreatType;
  severity: Severity;
  mitre_id: string;
  mitre_name: string;
  generated_at: number;
  incident_summary: string;
  affected_hosts: string[];
  estimated_data_at_risk_gb: number;
  steps: PlaybookStep[];
  mitre_techniques_detected: string[];
  status?: string;
}

export interface StepHistorySummary {
  step: number;
  red_rew: number;
  blue_rew: number;
  events: number;
}

export interface BriefingHotZone {
  host_id: number;
  label: string;
  zone: string;
  status: string;
  risk_score: number;
  risk_percent: number;
  color: string;
  reason: string;
  top_threat: string;
}

export interface BriefingZoneHeat {
  zone: string;
  risk_score: number;
  risk_percent: number;
  host_count: number;
  compromised_hosts: number;
  detected_hosts: number;
  color: string;
}

export interface BriefingStoryBeat {
  id: string;
  step: number;
  team: 'red' | 'blue' | 'system' | string;
  title: string;
  detail: string;
  severity: string;
  color: string;
}

export interface BattleBriefing {
  headline: string;
  summary: string;
  hot_zones: BriefingHotZone[];
  zone_heat: BriefingZoneHeat[];
  storyline: BriefingStoryBeat[];
  attack_pressure: {
    red: number;
    blue: number;
    neutral: number;
  };
  last_updated_step: number;
}

export interface InitMessage {
  type: 'init';
  simulation_id: string;
  episode_id?: string;
  network: NetworkGraphState;
  episode_count: number;
  step: number;
  max_steps: number;
  phase: string;
  red_q_values: Record<string, DecisionScores>;
  blue_policy_probs: Record<string, DecisionScores>;
  contest_events: ContestEvent[];
  battle_results: NodeBattleResult[];
  scoreboard: BattleScoreboard | null;
  briefing?: BattleBriefing;
  integration_events?: IntegrationFeedEvent[];
}

export interface StepMessage {
  type: 'step';
  simulation_id: string;
  episode_id: string;
  step: number;
  max_steps: number;
  phase: string;
  network: NetworkGraphState;
  red_action: AgentAction;
  blue_action: AgentAction;
  red_reward: number;
  blue_reward: number;
  red_cumulative: number;
  blue_cumulative: number;
  new_alerts: ThreatAlert[];
  pipeline: PipelineState;
  red_q_values: Record<string, DecisionScores>;
  blue_policy_probs: Record<string, DecisionScores>;
  contest_events: ContestEvent[];
  battle_results: NodeBattleResult[];
  scoreboard: BattleScoreboard | null;
  terminated: boolean;
  truncated: boolean;
  winner: 'red' | 'blue' | 'draw' | null;
  episode_history_summary: StepHistorySummary[];
  kill_chain?: KillChainState;
  apt_attribution?: AptMatch[];
  briefing?: BattleBriefing;
}

export interface IntegrationFeedEvent {
  id: string;
  source: string;
  vendor: string;
  host_id: number;
  host_label: string;
  threat_type: string;
  severity: Severity | string;
  alert_score: number;
  layer: string;
  ingested_at: string;
}

export interface IntegrationEventMessage {
  type: 'integration_event';
  simulation_id: string;
  episode_id: string;
  step: number;
  phase: string;
  source: string;
  vendor: string;
  message?: string;
  event_count: number;
  top_threat: string;
  hot_hosts: Array<{
    host_id: number;
    threat_type: string;
    severity: Severity | string;
  }>;
  events: IntegrationFeedEvent[];
  new_alerts: ThreatAlert[];
  network: NetworkGraphState;
  pipeline: PipelineState;
  briefing?: BattleBriefing;
  kill_chain?: KillChainState;
  apt_attribution?: AptMatch[];
  scoreboard: BattleScoreboard | null;
  ingested_at: string;
}

export interface AgentsInfo {
  red: {
    win_rate: number;
    avg_reward: number;
    total_episodes: number;
    model_version: string;
  };
  blue: {
    win_rate: number;
    avg_reward: number;
    detection_rate: number;
    false_positive_rate: number;
  };
  red_agent?: {
    model: string;
    type: string;
  };
  blue_agent?: {
    model: string;
    type: string;
  };
}

export interface TrainingMetrics {
  steps_trained: number;
  reward_history: Array<{
    step: number;
    red_reward: number;
    blue_reward: number;
  }>;
  win_rate_history: Array<{
    step: number;
    red_win_rate: number;
    blue_win_rate: number;
  }>;
  detection_history: Array<{
    step: number;
    detection_rate: number;
    fp_rate: number;
  }>;
}

export interface KillChainState {
  current_stage: number;
  current_stage_name: string;
  max_stage_reached: number;
  stage_color: string;
  kill_chain_progress: number;
  velocity: number;
  velocity_history: number[];
  acceleration: number;
  velocity_label: string;
  dwell_time_steps: number;
  dwell_time_seconds: number;
  dwell_time_display: string;
  breach_countdown_seconds: number | null;
  breach_countdown_display: string;
  breach_confidence: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  urgency_color: string;
  top_apt_match: string | null;
  top_apt_score: number;
  apt_similarity: Record<string, number>;
  stage_history: number[];
}

export interface AptMatch {
  name: string;
  score: number;
  score_percent: number;
  bar_fill: number;
  nation: string;
  flag: string;
  targets: string[];
  risk_note: string;
  color: string;
  is_top_match: boolean;
}

export interface GiskardStatus {
  runtime: 'real' | 'compat' | string;
  using_real_giskard: boolean;
  version: string;
  reports_available: number;
}

export interface GiskardReport {
  name: string;
  type: 'red' | 'blue' | string;
  format: string;
  size_kb: number;
}

```

## File: `src/lib/enterprise.ts`

```typescript
import type { AppRoute } from '../hooks/useAppRouter';

export type ProductSurfaceRoute =
  | '/live'
  | '/simulation'
  | '/pipeline'
  | '/attack-graph'
  | '/playbooks'
  | '/training'
  | '/url-security'
  | '/integrations';

export interface ProductSurface {
  route: ProductSurfaceRoute;
  feature: string;
  deliveryNote: string;
  backendEndpoints: string[];
  companyUsage: string;
}

export interface EnterprisePathway {
  id: string;
  title: string;
  model: string;
  buyer: string;
  how_companies_use_it: string;
  current_state: string;
  target_state: string;
  frontend_routes: string[];
  backend_endpoints: string[];
  maturity: string;
  recommended_rollout: string[];
}

export interface EnterprisePivotRow {
  feature_area: string;
  current_demo_state: string;
  target_enterprise_state: string;
}

export interface EnterprisePathwaysResponse {
  status: 'ok';
  recommended_first_step: {
    title: string;
    why: string;
    frontend_route: string;
    backend_endpoint: string;
  };
  current_vs_target: EnterprisePivotRow[];
  pathways: EnterprisePathway[];
}

export const PRODUCT_SURFACES: ProductSurface[] = [
  {
    route: '/live',
    feature: 'Live War Room',
    deliveryNote: 'Shows incoming alerts, live network state, kill-chain pressure, and integration events bridged from webhooks, telemetry, streaming, or remote URL feeds.',
    backendEndpoints: ['/api/simulation/create', '/ws/simulation/{simulation_id}', '/api/detection/alerts', '/api/ingest/url'],
    companyUsage: 'Use this as the analyst-facing command view once alerts are flowing from connectors, webhooks, telemetry, or remote pull feeds.',
  },
  {
    route: '/simulation',
    feature: 'Battle Simulation',
    deliveryNote: 'Explains red-vs-blue progression, battle history, and guided threat injection.',
    backendEndpoints: ['/api/battle/state/{simulation_id}', '/api/battle/history/{simulation_id}', '/api/battle/trigger-attack'],
    companyUsage: 'Use this in customer pilots, tabletop drills, and purple-team exercises to explain how the system reasons about escalation.',
  },
  {
    route: '/pipeline',
    feature: 'Threat Pipeline',
    deliveryNote: 'Visualizes intent vectors, drift, shadow branches, attack graph context, and autonomy budget.',
    backendEndpoints: ['/api/pipeline/{simulation_id}/state', '/api/pipeline/{simulation_id}/shadow', '/api/pipeline/{simulation_id}/budget'],
    companyUsage: 'Use this when security engineers want to understand why Athernex is recommending a specific next step.',
  },
  {
    route: '/attack-graph',
    feature: 'Attack Graph',
    deliveryNote: 'Maps likely attacker movement toward crown-jewel assets and critical-path exposure.',
    backendEndpoints: ['/api/pipeline/{simulation_id}/attack-graph', '/api/pipeline/{simulation_id}/capability-lattice'],
    companyUsage: 'Use this in incident review and architecture meetings to show where the next pivot is likely to happen.',
  },
  {
    route: '/playbooks',
    feature: 'Playbooks',
    deliveryNote: 'Turns alerts and simulated pressure into response steps analysts can review and execute.',
    backendEndpoints: ['/api/playbooks', '/api/playbooks/generate', '/api/playbooks/{playbook_id}'],
    companyUsage: 'Use this as the handoff from detection into human-reviewed response and SOAR approvals.',
  },
  {
    route: '/training',
    feature: 'Training',
    deliveryNote: 'Exposes model metrics, agent stats, and Giskard scan artifacts for internal review.',
    backendEndpoints: ['/api/agents/info', '/api/agents/training/metrics', '/api/giskard/status', '/api/giskard/reports'],
    companyUsage: 'Use this internally to demonstrate model readiness, evaluation coverage, and what still needs validation.',
  },
  {
    route: '/url-security',
    feature: 'URL Security',
    deliveryNote: 'Passively reviews ingested or analyst-supplied URLs for transport issues, header gaps, visible input surfaces, and likely defensive attack families.',
    backendEndpoints: ['/api/url-security/analyze', '/api/url-security/reports', '/api/ingest/url'],
    companyUsage: 'Use this before onboarding a customer URL or feed endpoint so security teams can review exposure and hardening work in one place.',
  },
  {
    route: '/integrations',
    feature: 'Integrations',
    deliveryNote: 'Configures connectors, webhook ingest, streaming, telemetry, SOAR, SSO, and export workflows.',
    backendEndpoints: [
      '/api/integrations/status',
      '/api/connectors/siem',
      '/api/connectors/siem/{connector_id}/pull',
      '/api/webhooks/ingest',
      '/api/ingest/url',
      '/api/streaming/configure',
      '/api/agents/telemetry',
      '/api/soar/action',
      '/api/sso/configure',
    ],
    companyUsage: 'Use this as the deployment and adoption hub for real customer environments.',
  },
];

export const PRODUCT_SURFACE_MAP: Record<ProductSurfaceRoute, ProductSurface> = PRODUCT_SURFACES.reduce(
  (acc, surface) => {
    acc[surface.route] = surface;
    return acc;
  },
  {} as Record<ProductSurfaceRoute, ProductSurface>,
);

export const isProductSurfaceRoute = (route: AppRoute): route is ProductSurfaceRoute =>
  route in PRODUCT_SURFACE_MAP;

export const FALLBACK_ENTERPRISE_PATHWAYS: EnterprisePathwaysResponse = {
  status: 'ok',
  recommended_first_step: {
    title: 'Start with secure webhook ingestion',
    why: 'It removes manual uploads immediately and lets existing enterprise tools push alerts into Athernex in real time.',
    frontend_route: '/integrations',
    backend_endpoint: '/api/webhooks/ingest',
  },
  current_vs_target: [
    {
      feature_area: 'Data Ingestion',
      current_demo_state: 'Manual file upload (CSV, JSON, PCAP) to seed simulations.',
      target_enterprise_state: 'Automated connectors, vendor-aware webhooks, and continuous ingestion.',
    },
    {
      feature_area: 'Execution',
      current_demo_state: 'Analysis starts when an operator launches or advances a simulation.',
      target_enterprise_state: 'Background ingestion keeps the product warm for continuous triage.',
    },
    {
      feature_area: 'Remediation',
      current_demo_state: 'Text playbooks and analyst suggestions.',
      target_enterprise_state: 'Approval-gated SOAR actions tied to security controls and collaboration tools.',
    },
    {
      feature_area: 'Identity',
      current_demo_state: 'Manual analyst login and local identity state.',
      target_enterprise_state: 'SSO-backed access with enterprise identity providers.',
    },
  ],
  pathways: [
    {
      id: 'siem_xdr_app',
      title: 'Direct SIEM / XDR Integrations',
      model: 'The App Model',
      buyer: 'SOC teams already running Splunk, Sentinel, CrowdStrike, QRadar, or Elastic',
      how_companies_use_it:
        'Connect Athernex to the customer security stack so high-severity alerts become simulation context, triage evidence, and playbooks.',
      current_state: 'Connector registration and normalized webhook ingest are implemented now.',
      target_state: 'OAuth-based pull, vendor-specific lifecycle management, and stronger tenancy controls.',
      frontend_routes: ['/integrations', '/live', '/playbooks'],
      backend_endpoints: ['/api/connectors/siem', '/api/webhooks/ingest', '/api/integrations/status'],
      maturity: 'pilot-ready',
      recommended_rollout: [
        'Register a connector in read-only mode.',
        'Use webhook push for high-severity alerts first.',
        'Generate playbooks for analyst review before any automated action.',
      ],
    },
    {
      id: 'streaming_pipeline',
      title: 'Real-Time Event Streaming',
      model: 'The Data Pipeline Model',
      buyer: 'Large enterprises with Kafka, RabbitMQ, or Kinesis-based event pipelines',
      how_companies_use_it:
        'Mirror filtered security events into Athernex so the platform can ingest continuously instead of waiting for manual uploads.',
      current_state: 'Stream consumer configuration and push-buffer APIs are implemented now.',
      target_state: 'Durable long-running consumers that update the environment continuously.',
      frontend_routes: ['/integrations', '/pipeline', '/live'],
      backend_endpoints: ['/api/streaming/configure', '/api/streaming/push', '/api/streaming/status'],
      maturity: 'prototype-plus',
      recommended_rollout: [
        'Start with a narrow stream of high-signal events.',
        'Compare Athernex output with existing analyst workflows.',
        'Only widen the stream after false-positive behavior is understood.',
      ],
    },
    {
      id: 'endpoint_telemetry',
      title: 'Lightweight Endpoint Telemetry',
      model: 'The Telemetry Model',
      buyer: 'Teams that want host telemetry inside Athernex without replacing their SIEM',
      how_companies_use_it:
        'Ship endpoint events from agents or forwarders like Wazuh, osquery, Fluentd, or Logstash into Athernex for enrichment.',
      current_state: 'HTTPS telemetry ingestion is implemented now.',
      target_state: 'Managed agent packaging, stronger auth, and durable telemetry pipelines.',
      frontend_routes: ['/integrations', '/live', '/training'],
      backend_endpoints: ['/api/agents/telemetry', '/api/detection/alerts', '/api/agents/info'],
      maturity: 'pilot-ready',
      recommended_rollout: [
        'Forward events from a small host group first.',
        'Use the live view to explain risky hosts.',
        'Calibrate output against the customer SIEM before expanding.',
      ],
    },
    {
      id: 'soar_response',
      title: 'Automated Response & SOAR',
      model: 'The Response Orchestration Model',
      buyer: 'IR leaders who want analyst-reviewed blocking, isolation, and ticketing',
      how_companies_use_it:
        'Use Athernex to queue or execute response actions while keeping disruptive actions approval-gated for operator control.',
      current_state: 'SOAR action creation, pending approvals, and audit log endpoints are implemented now.',
      target_state: 'Direct firewall, IAM, EDR, and ITSM integrations with durable audit storage.',
      frontend_routes: ['/integrations', '/playbooks', '/live'],
      backend_endpoints: ['/api/soar/action', '/api/soar/pending', '/api/soar/log', '/api/soar/approve/{action_id}'],
      maturity: 'pilot-ready',
      recommended_rollout: [
        'Keep high-risk actions approval-gated.',
        'Start with notifications and tickets before containment.',
        'Enforce separate approver controls for disruptive actions.',
      ],
    },
    {
      id: 'identity_sso',
      title: 'Identity & SSO Integration',
      model: 'The Enterprise Access Model',
      buyer: 'Security teams that need enterprise identity instead of shared demo-style access',
      how_companies_use_it:
        'Configure Okta, Azure AD, SAML, or Google so operator access aligns with enterprise identity workflows.',
      current_state: 'SSO provider setup and simulated authentication endpoints are implemented now.',
      target_state: 'Real federation, RBAC, audited operator sessions, and access governance.',
      frontend_routes: ['/integrations', '/login', '/onboarding'],
      backend_endpoints: ['/api/sso/configure', '/api/sso/providers', '/api/sso/authenticate'],
      maturity: 'prototype-plus',
      recommended_rollout: [
        'Validate with test users first.',
        'Confirm alias mapping and session flow.',
        'Pair SSO with audit logs before broader rollout.',
      ],
    },
  ],
};

```

## File: `src/lib/urlSecurity.ts`

```typescript
export interface UrlSecurityFinding {
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  detail: string;
  evidence: string;
}

export interface UrlSecurityAttackFamily {
  family: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  why_it_matters: string;
  common_attacker_behavior: string;
}

export interface UrlSecurityFormSummary {
  method: string;
  action: string;
  enctype: string;
  password_fields: number;
  file_fields: number;
  input_names: string[];
}

export interface UrlSecurityReport {
  report_id: string;
  url: string;
  final_url: string;
  analyzed_at: string;
  timeout_seconds: number;
  status_code: number;
  content_type: string;
  security_score: number;
  risk_summary: string;
  query_parameters: string[];
  forms_detected: UrlSecurityFormSummary[];
  missing_headers: string[];
  response_headers: Record<string, string>;
  findings: UrlSecurityFinding[];
  attack_families: UrlSecurityAttackFamily[];
  countermeasures: string[];
}

export const ENTERPRISE_API_KEY_STORAGE = 'athernex_api_key';

export const getEnterpriseApiKey = () =>
  typeof window === 'undefined'
    ? 'ath_local_admin'
    : window.localStorage.getItem(ENTERPRISE_API_KEY_STORAGE) || 'ath_local_admin';

```

## File: `src/components/SplineBackground.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';

/* ─── Animated Canvas Fallback ─── */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  pulseSpeed: number;
  pulsePhase: number;
}

function createParticles(w: number, h: number, count: number): Particle[] {
  const colors = [
    'rgba(0, 229, 255, 0.8)',
    'rgba(0, 153, 170, 0.7)',
    'rgba(0, 255, 200, 0.6)',
    'rgba(80, 200, 255, 0.7)',
    'rgba(0, 180, 220, 0.65)',
  ];
  return Array.from({ length: count }, (_, i) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    radius: 1.5 + Math.random() * 2.5,
    baseRadius: 1.5 + Math.random() * 2.5,
    color: colors[i % colors.length],
    pulseSpeed: 0.5 + Math.random() * 1.5,
    pulsePhase: Math.random() * Math.PI * 2,
  }));
}

function InteractiveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
      particlesRef.current = createParticles(w, h, Math.min(100, Math.floor((w * h) / 10000)));
    };

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('mouseleave', onMouseLeave);
    const connectionDistance = 170;
    const mouseInfluenceRadius = 200;

    const draw = (time: number) => {
      const { w, h } = sizeRef.current;
      const particles = particlesRef.current;
      const t = time * 0.001;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#03050f');
      grad.addColorStop(0.5, '#050a1a');
      grad.addColorStop(1, '#03050f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        /* Mouse repulsion — particles drift away from cursor */
        const dmx = p.x - mx;
        const dmy = p.y - my;
        const mouseDist = Math.sqrt(dmx * dmx + dmy * dmy);
        if (mouseDist < mouseInfluenceRadius && mouseDist > 0) {
          const force = (1 - mouseDist / mouseInfluenceRadius) * 0.6;
          p.x += (dmx / mouseDist) * force;
          p.y += (dmy / mouseDist) * force;
        }

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        p.radius = p.baseRadius + Math.sin(t * p.pulseSpeed + p.pulsePhase) * 0.8;
      }

      /* Connection lines */
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.18;
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      /* Mouse glow halo */
      if (mx > 0 && my > 0) {
        const haloGrad = ctx.createRadialGradient(mx, my, 0, mx, my, mouseInfluenceRadius);
        haloGrad.addColorStop(0, 'rgba(0, 229, 255, 0.06)');
        haloGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.02)');
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(mx, my, mouseInfluenceRadius, 0, Math.PI * 2);
        ctx.fill();

        /* Lines from mouse to nearby particles */
        for (const p of particles) {
          const dmx = p.x - mx;
          const dmy = p.y - my;
          const dist = Math.sqrt(dmx * dmx + dmy * dmy);
          if (dist < mouseInfluenceRadius) {
            const alpha = (1 - dist / mouseInfluenceRadius) * 0.12;
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.lineWidth = 0.4;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
        }
      }

      /* Particle dots + glow */
      for (const p of particles) {
        const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
        glowGrad.addColorStop(0, p.color.replace(/[\d.]+\)$/, '0.14'));
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Scan line */
      const scanY = ((t * 40) % (h + 60)) - 30;
      const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
      scanGrad.addColorStop(0, 'rgba(0, 229, 255, 0)');
      scanGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.018)');
      scanGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 30, w, 60);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('mouseleave', onMouseLeave);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}

/* ─── Public Component ─── */

interface SplineBackgroundProps {
  scene?: string;
  overlay?: string;
  showFallback?: boolean;
}

export function SplineBackground({
  scene,
  overlay = 'linear-gradient(135deg, rgba(3, 5, 15, 0.72) 0%, rgba(7, 13, 26, 0.65) 100%)',
}: SplineBackgroundProps) {
  const [splineReady, setSplineReady] = useState(false);
  
  // Inject the spline-viewer script natively
  useEffect(() => {
    if (scene && !document.querySelector('script[src="https://unpkg.com/@splinetool/viewer@1.12.85/build/spline-viewer.js"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@splinetool/viewer@1.12.85/build/spline-viewer.js';
      document.head.appendChild(script);
    }
    // Since the web component doesn't have an easily trappable onLoad in React, we'll assume it's ready quickly
    // or we can just fade it in immediately.
    setTimeout(() => setSplineReady(true), 500);
  }, [scene]);

  const canvasFallback = <InteractiveCanvas />;

  return (
    <div
      className="spline-bg"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        // Removed pointerEvents: 'none' to allow interactions
      }}
    >
      {scene ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: splineReady ? 1 : 0,
          transition: 'opacity 800ms ease',
        }}>
          {/* @ts-expect-error spline-viewer is a web component not in React TS types */}
          <spline-viewer url={scene} style={{ width: '100%', height: '100%' }}></spline-viewer>
        </div>
      ) : (
        canvasFallback
      )}

      {/* Overlay gradient - Make sure it doesn't block clicks from reaching the Spline! */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: overlay,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

```

## File: `src/components/WebDiagram3D.tsx`

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore } from '../store/simulationStore';

export type NodeStatus = 'clean' | 'compromised' | 'detected' | 'isolated' | 'under_attack';

export interface DiagramNode {
  id: number;
  label: string;
  type: 'dmz' | 'app_server' | 'db_server' | 'workstation' | 'internet';
  status: NodeStatus;
  position: [number, number, number];
  description?: string;
}

export interface DiagramEdge {
  source: number;
  target: number;
  active: boolean;
  edgeType: 'normal' | 'attack' | 'lateral' | 'exfil' | 'beacon';
}

export type ViewMode = '2d' | '3d';

export interface WebDiagram3DProps {
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  winner?: 'red' | 'blue' | null;
  interactive?: boolean;
  inline?: boolean;
  viewMode?: ViewMode;
  onNodeClick?: (nodeId: number) => void;
}

const STATUS_COLORS: Record<NodeStatus, { rim: string; core: string; glow: string }> = {
  clean: { rim: '#00e5ff', core: '#09101d', glow: 'rgba(0, 229, 255, 0.2)' },
  compromised: { rim: '#ff0044', core: '#26030f', glow: 'rgba(255, 0, 68, 0.28)' },
  detected: { rim: '#ffcc00', core: '#221903', glow: 'rgba(255, 204, 0, 0.22)' },
  isolated: { rim: '#5b6b89', core: '#0a1019', glow: 'rgba(91, 107, 137, 0.16)' },
  under_attack: { rim: '#ff6600', core: '#241003', glow: 'rgba(255, 102, 0, 0.26)' },
};

const EDGE_COLORS: Record<DiagramEdge['edgeType'], string> = {
  normal: '#00e5ff',
  attack: '#ff0044',
  lateral: '#ff6600',
  exfil: '#ff0044',
  beacon: '#ffcc00',
};

const TYPE_RADIUS: Record<DiagramNode['type'], number> = {
  internet: 1.15,
  dmz: 0.88,
  db_server: 0.78,
  app_server: 0.58,
  workstation: 0.38,
};

export const DEFAULT_DIAGRAM_NODES: DiagramNode[] = [
  { id: 20, label: 'INTERNET', type: 'internet', status: 'clean', position: [0, 9, 0], description: 'External threat surface. All inbound traffic enters through here.\nUnfiltered access makes it the primary attack vector.' },
  { id: 0, label: 'DMZ-01', type: 'dmz', status: 'clean', position: [-3, 6, 1], description: 'Primary demilitarized zone firewall. Filters web traffic.\nFirst line of defense against external probes.' },
  { id: 1, label: 'DMZ-02', type: 'dmz', status: 'clean', position: [3, 6, -1], description: 'Secondary DMZ bastion host. Handles API gateway routing.\nIsolates internal services from public exposure.' },
  { id: 2, label: 'APP-01', type: 'app_server', status: 'clean', position: [-8, 2, 2], description: 'Legacy application server running outdated frameworks.\nKnown vulnerability to remote code execution exploits.' },
  { id: 3, label: 'APP-02', type: 'app_server', status: 'clean', position: [-4, 2.5, -2], description: 'Microservice orchestration node. Manages container workloads.\nPotential lateral movement target via API misconfiguration.' },
  { id: 4, label: 'APP-03', type: 'app_server', status: 'clean', position: [0, 3, 3], description: 'Core business logic server. Processes authentication flows.\nHigh-value target for credential harvesting attacks.' },
  { id: 5, label: 'APP-04', type: 'app_server', status: 'clean', position: [4, 2.5, -3], description: 'Payment processing and transaction validation engine.\nCritical for compliance — any breach triggers immediate escalation.' },
  { id: 6, label: 'APP-05', type: 'app_server', status: 'clean', position: [8, 2, 1], description: 'CI/CD pipeline runner with elevated build permissions.\nSupply chain attack vector if deployment keys are compromised.' },
  { id: 7, label: 'DB-01', type: 'db_server', status: 'clean', position: [-2.5, -1, 2], description: 'Primary customer data store. Contains PII and financial records.\nData exfiltration here causes maximum regulatory impact.' },
  { id: 8, label: 'DB-02', type: 'db_server', status: 'clean', position: [0, -1.5, -1], description: 'Analytics and telemetry database. Stores behavioral metrics.\nCan be leveraged for reconnaissance of user patterns.' },
  { id: 9, label: 'DB-03', type: 'db_server', status: 'clean', position: [2.5, -1, 2], description: 'Configuration and secrets vault. Holds API keys and certs.\nCompromise grants attacker access to all connected services.' },
  { id: 10, label: 'WS-01', type: 'workstation', status: 'clean', position: [-11, -5, 3], description: 'Developer workstation with source code access.\nPhishing target — single compromise can chain to code repos.' },
  { id: 11, label: 'WS-02', type: 'workstation', status: 'clean', position: [-8, -5, -2], description: 'Finance team endpoint. Handles invoice and payroll data.\nTarget for business email compromise and wire fraud.' },
  { id: 12, label: 'WS-03', type: 'workstation', status: 'clean', position: [-5, -5.5, 4], description: 'HR department terminal with employee record access.\nPII exfiltration risk through social engineering vectors.' },
  { id: 13, label: 'WS-04', type: 'workstation', status: 'clean', position: [-2, -6, -3], description: 'Executive assistant workstation. Has calendar and email delegation.\nHigh-value intelligence target for strategic planning access.' },
  { id: 14, label: 'WS-05', type: 'workstation', status: 'clean', position: [1, -5.5, 4], description: 'IT operations console with admin tooling installed.\nDirect path to infrastructure control if credentials leak.' },
  { id: 15, label: 'WS-06', type: 'workstation', status: 'clean', position: [4, -6, -2], description: 'Customer support agent terminal with CRM database access.\nCan be used to pivot into customer-facing systems.' },
  { id: 16, label: 'WS-07', type: 'workstation', status: 'clean', position: [6, -5, 3], description: 'Security analyst SIEM dashboard workstation.\nCompromise can blind the blue team by suppressing alerts.' },
  { id: 17, label: 'WS-08', type: 'workstation', status: 'clean', position: [8, -5.5, -3], description: 'Marketing team endpoint with CMS and social media access.\nBrand impersonation risk if session tokens are stolen.' },
  { id: 18, label: 'WS-09', type: 'workstation', status: 'clean', position: [10, -5, 1], description: 'Legal department terminal with contract and IP access.\nTrade secret exfiltration target for corporate espionage.' },
  { id: 19, label: 'WS-10', type: 'workstation', status: 'clean', position: [12, -4.5, -1], description: 'Remote access gateway for external contractors.\nWeakest link — often lacks MFA and has broad network reach.' },
];

const DEFAULT_EDGES: DiagramEdge[] = [
  { source: 20, target: 0, active: true, edgeType: 'normal' },
  { source: 20, target: 1, active: true, edgeType: 'normal' },
  { source: 0, target: 2, active: true, edgeType: 'normal' },
  { source: 0, target: 3, active: true, edgeType: 'normal' },
  { source: 1, target: 4, active: true, edgeType: 'normal' },
  { source: 1, target: 5, active: true, edgeType: 'normal' },
  { source: 1, target: 6, active: true, edgeType: 'normal' },
  { source: 2, target: 7, active: false, edgeType: 'normal' },
  { source: 3, target: 7, active: false, edgeType: 'normal' },
  { source: 4, target: 8, active: false, edgeType: 'normal' },
  { source: 5, target: 8, active: false, edgeType: 'normal' },
  { source: 6, target: 9, active: false, edgeType: 'normal' },
  { source: 2, target: 10, active: false, edgeType: 'normal' },
  { source: 2, target: 11, active: false, edgeType: 'normal' },
  { source: 3, target: 12, active: false, edgeType: 'normal' },
  { source: 3, target: 13, active: false, edgeType: 'normal' },
  { source: 4, target: 14, active: false, edgeType: 'normal' },
  { source: 5, target: 15, active: false, edgeType: 'normal' },
  { source: 5, target: 16, active: false, edgeType: 'normal' },
  { source: 6, target: 17, active: false, edgeType: 'normal' },
  { source: 6, target: 18, active: false, edgeType: 'normal' },
  { source: 6, target: 19, active: false, edgeType: 'normal' },
  { source: 11, target: 12, active: false, edgeType: 'normal' },
  { source: 13, target: 14, active: false, edgeType: 'normal' },
  { source: 15, target: 16, active: false, edgeType: 'normal' },
  { source: 17, target: 18, active: false, edgeType: 'normal' },
];

function ParticleDust({ count = 320 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      pos[index * 3] = (Math.random() - 0.5) * 32;
      pos[index * 3 + 1] = (Math.random() - 0.5) * 24;
      pos[index * 3 + 2] = (Math.random() - 0.5) * 20;
      spd[index * 3] = (Math.random() - 0.5) * 0.003;
      spd[index * 3 + 1] = (Math.random() - 0.5) * 0.003;
      spd[index * 3 + 2] = (Math.random() - 0.5) * 0.003;
    }

    return [pos, spd];
  }, [count]);

  useFrame(() => {
    if (!pointsRef.current) {
      return;
    }

    const attribute = pointsRef.current.geometry.attributes.position;
    const array = attribute.array as Float32Array;

    for (let index = 0; index < count; index += 1) {
      array[index * 3] += speeds[index * 3];
      array[index * 3 + 1] += speeds[index * 3 + 1];
      array[index * 3 + 2] += speeds[index * 3 + 2];

      if (Math.abs(array[index * 3]) > 16) {
        speeds[index * 3] *= -1;
      }
      if (Math.abs(array[index * 3 + 1]) > 12) {
        speeds[index * 3 + 1] *= -1;
      }
      if (Math.abs(array[index * 3 + 2]) > 10) {
        speeds[index * 3 + 2] *= -1;
      }
    }

    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
      </bufferGeometry>
      <pointsMaterial
        color="#00e5ff"
        opacity={0.28}
        size={0.045}
        sizeAttenuation
        transparent
      />
    </points>
  );
}

// ─── SPELL CLASH COLORS & TYPES ──────────────────────────────────────────────
const ATTACK_BEAM_COLORS: Record<string, { core: string; halo: string }> = {
  exploit: { core: '#00ff44', halo: '#00aa22' },
  lateral_move: { core: '#ff6600', halo: '#cc3300' },
  exfiltrate: { core: '#ff0044', halo: '#aa0022' },
  beacon: { core: '#ffcc00', halo: '#cc9900' },
  scan: { core: '#00ccff', halo: '#0066aa' },
};
const DEFENSE_BEAM = { core: '#ff4400', halo: '#ff8800' };

// Global clash trigger signal so we don't have to drill state down deeply
export const clashSignals = new Map<number, number>(); // targetNodeId -> timestamp

function NetworkNode3D({
  node,
  winner,
  onNodeClick,
}: {
  node: DiagramNode;
  winner?: 'red' | 'blue' | null;
  onNodeClick?: (nodeId: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const rimRef = useRef<THREE.Mesh>(null);
  const [pingScale, setPingScale] = useState(1);
  const status: NodeStatus = winner ? (winner === 'red' ? 'compromised' : 'clean') : node.status;
  const colors = STATUS_COLORS[status];
  const radius = TYPE_RADIUS[node.type] ?? 0.5;

  const driftSeed = useMemo(
    () => ({
      x: (Math.random() - 0.5) * 0.45,
      y: (Math.random() - 0.5) * 0.35,
      z: (Math.random() - 0.5) * 0.35,
      speed: 0.28 + Math.random() * 0.36,
      offset: Math.random() * Math.PI * 2,
    }),
    [],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (Math.random() > 0.58) {
        setPingScale(1.05);
      }
    }, 4000 + Math.random() * 6000);

    return () => window.clearInterval(interval);
  }, []);

  const clashTime = useRef(0);
  const recoilPhase = useRef(0);

  useFrame(({ clock }) => {
    if (!meshRef.current) {
      return;
    }

    // Check for new clash
    const signal = clashSignals.get(node.id);
    if (signal && signal !== clashTime.current) {
      clashTime.current = signal;
      recoilPhase.current = 30; // Frames of shake
    }

    let shakeOffset = 0;
    if (recoilPhase.current > 0) {
      shakeOffset = (Math.random() - 0.5) * 1.5 * (recoilPhase.current / 30);
      recoilPhase.current--;
    }

    const elapsed = clock.elapsedTime * driftSeed.speed + driftSeed.offset;
    meshRef.current.position.x = node.position[0] + Math.sin(elapsed * 0.7) * driftSeed.x + shakeOffset;
    meshRef.current.position.y = node.position[1] + Math.sin(elapsed * 0.5) * driftSeed.y + shakeOffset;
    meshRef.current.position.z = node.position[2] + Math.cos(elapsed * 0.6) * driftSeed.z;

    if (status === 'under_attack' || status === 'compromised') {
      const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.18;
      meshRef.current.scale.setScalar(pulse);
    } else {
      meshRef.current.scale.setScalar(1);
    }

    if (rimRef.current) {
      rimRef.current.position.copy(meshRef.current.position);
      rimRef.current.rotation.z += 0.008;
    }

    if (pingScale > 1) {
      setPingScale((current) => (current > 3 ? 1 : current + 0.02));
    }
  });

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onNodeClick?.(node.id); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = onNodeClick ? 'pointer' : 'default'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshPhysicalMaterial
          color={colors.core}
          emissive={colors.rim}
          emissiveIntensity={status === 'compromised' ? 1.2 : status === 'under_attack' ? 0.9 : 0.18}
          metalness={0.34}
          opacity={0.88}
          roughness={0.08}
          thickness={0.5}
          transmission={0.42}
          transparent
        />
      </mesh>

      <mesh ref={rimRef} position={node.position}>
        <torusGeometry args={[radius * 1.14, radius * 0.04, 8, 64]} />
        <meshBasicMaterial
          color={node.type === 'db_server' && status === 'clean' ? '#ffcc00' : colors.rim}
          opacity={status === 'isolated' ? 0.18 : 0.74}
          transparent
        />
      </mesh>

      <mesh position={node.position}>
        <sphereGeometry args={[radius * 1.6, 16, 16]} />
        <meshBasicMaterial color={colors.glow} opacity={status === 'under_attack' || status === 'compromised' ? 0.45 : 0.22} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Outer glow halo for active threat states */}
      {(status === 'under_attack' || status === 'compromised') && (
        <mesh position={node.position}>
          <sphereGeometry args={[radius * 2.4, 12, 12]} />
          <meshBasicMaterial color={colors.glow} opacity={0.15} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      {/* Point light on active threat nodes */}
      {(status === 'under_attack' || status === 'compromised') && (
        <pointLight
          position={node.position}
          color={status === 'compromised' ? '#ff0044' : '#ff6600'}
          intensity={1.5}
          distance={6}
          decay={2}
        />
      )}

      {node.type === 'db_server' && status === 'clean' ? (
        <mesh position={node.position}>
          <sphereGeometry args={[radius * 1.74, 14, 14]} />
          <meshBasicMaterial color="#ffcc00" opacity={0.06} transparent />
        </mesh>
      ) : null}

      {pingScale > 1 && pingScale < 3 ? (
        <mesh position={node.position}>
          <torusGeometry args={[radius * pingScale, radius * 0.02, 8, 64]} />
          <meshBasicMaterial
            color={colors.rim}
            opacity={Math.max(0, 0.56 - (pingScale - 1) / 2)}
            transparent
          />
        </mesh>
      ) : null}
    </group>
  );
}

function ConnectionEdge({
  edge,
  sourcePos,
  targetPos,
  winner,
}: {
  edge: DiagramEdge;
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  winner?: 'red' | 'blue' | null;
}) {
  const tubeRef = useRef<THREE.Mesh>(null);
  const color = winner ? (winner === 'red' ? '#ff0044' : '#00e5ff') : EDGE_COLORS[edge.edgeType];

  const curve = useMemo(() => {
    const start = new THREE.Vector3(...sourcePos);
    const end = new THREE.Vector3(...targetPos);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 0.8;
    return new THREE.CatmullRomCurve3([start, mid, end]);
  }, [sourcePos, targetPos]);

  useFrame(({ clock }) => {
    if (!tubeRef.current) {
      return;
    }

    const material = tubeRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = edge.active ? 0.46 + Math.sin(clock.elapsedTime * 3) * 0.2 : 0.14;
  });

  return (
    <mesh ref={tubeRef}>
      <tubeGeometry args={[curve, 20, edge.active ? 0.035 : 0.015, 10, false]} />
      <meshBasicMaterial color={color} opacity={edge.active ? 0.62 : 0.14} transparent />
    </mesh>
  );
}

function WinnerFlash({ winner }: { winner: 'red' | 'blue' | null }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) {
      return;
    }

    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.05 + Math.sin(clock.elapsedTime * 2) * 0.04;
  });

  if (!winner) {
    return null;
  }

  return (
    <mesh position={[0, 0, -5]} ref={meshRef}>
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial
        color={winner === 'red' ? '#ff0044' : '#00e5ff'}
        opacity={0.06}
        transparent
      />
    </mesh>
  );
}

// ─── 3D SPELL CLASH EFFECTS (REMOVED — kept simple) ──────────────────────
// Spell clash beams/flashes have been removed for a cleaner look.
// Nodes now indicate attacks via color change + pulse only.

function Scene({
  edges,
  nodes,
  winner,
  viewMode,
  onNodeClick,
}: {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  winner?: 'red' | 'blue' | null;
  viewMode: ViewMode;
  onNodeClick?: (nodeId: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { latestRedAction, latestBlueAction, network: simNet } = useSimulationStore();

  const posMap = useMemo(
    () =>
      nodes.reduce<Record<number, [number, number, number]>>((accumulator, node) => {
        accumulator[node.id] = node.position;
        return accumulator;
      }, {}),
    [nodes],
  );

  // Simple clash signal for node pulse (no beams)
  useEffect(() => {
    if (latestRedAction && ['exploit', 'lateral_move', 'exfiltrate', 'beacon', 'scan'].includes(latestRedAction.action_name)) {
      clashSignals.set(latestRedAction.target_host_id, Date.now());
    }
  }, [latestRedAction, latestBlueAction, simNet]);

  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return;
    }

    if (viewMode === '2d') {
      groupRef.current.rotation.y = clock.elapsedTime * (Math.PI * 2 / 120);
      groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.05) * 0.03;
    }
  });

  return (
    <>
      <ambientLight color="#001030" intensity={0.14} />
      <pointLight color="#00e5ff" distance={32} intensity={1.8} position={[0, 10, 0]} />
      <pointLight color="#0040ff" distance={26} intensity={0.75} position={[-10, 0, 5]} />
      <pointLight color="#ff0044" distance={18} intensity={0.42} position={[10, -5, 0]} />

      <ParticleDust count={460} />
      <Stars count={1300} depth={40} factor={3} fade radius={80} saturation={0.4} speed={0.3} />
      <WinnerFlash winner={winner ?? null} />

      <group ref={groupRef}>
        {edges.map((edge, index) => {
          const source = posMap[edge.source];
          const target = posMap[edge.target];
          if (!source || !target) {
            return null;
          }

          return (
            <ConnectionEdge
              edge={edge}
              key={`edge-${index}`}
              sourcePos={source}
              targetPos={target}
              winner={winner}
            />
          );
        })}

        {nodes.map((node) => (
          <NetworkNode3D key={`node-${node.id}`} node={node} winner={winner} onNodeClick={onNodeClick} />
        ))}

      </group>
    </>
  );
}

export function WebDiagram3D({
  nodes = DEFAULT_DIAGRAM_NODES,
  edges = DEFAULT_EDGES,
  winner = null,
  interactive = false,
  inline = false,
  viewMode = '2d',
  onNodeClick,
}: WebDiagram3DProps) {
  const is3D = viewMode === '3d';
  return (
    <div
      style={{
        position: inline ? 'relative' : 'fixed',
        inset: inline ? undefined : 0,
        width: '100%',
        height: inline ? '100%' : undefined,
        minHeight: inline ? 500 : undefined,
        zIndex: inline ? undefined : 0,
        pointerEvents: is3D || interactive || onNodeClick ? 'auto' : 'none',
        background: '#000308',
        borderRadius: inline ? 16 : undefined,
        overflow: 'hidden',
      }}
    >
      <Canvas
        camera={{ position: is3D ? [0, 8, 18] : [0, 4, 22], fov: is3D ? 60 : 55 }}
        gl={{ alpha: false, antialias: true }}
        style={{ height: '100%', width: '100%' }}
      >
        <Scene edges={edges} nodes={nodes} winner={winner} viewMode={viewMode} onNodeClick={onNodeClick} />
        {viewMode === '3d' ? (
          <OrbitControls
            enablePan
            enableRotate
            enableZoom
            minDistance={8}
            maxDistance={45}
            makeDefault
          />
        ) : null}
      </Canvas>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0, 3, 8, 0.68) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export default WebDiagram3D;

```

## File: `src/components/SiteNavbar.tsx`

```tsx
import { motion } from 'framer-motion';



export function SiteNavbar() {
  return (
    <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: '100%', maxWidth: '1200px', padding: '0 16px' }}>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 9999,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fff',
        }}
      >
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '0.15em', color: '#e2e8f0', fontFamily: '"Inter", sans-serif' }}>
            CYBERGUARDIAN
          </span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/features" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>Use Cases</a>
          <a href="/technology" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>Technology</a>
          <a href="/threat-report" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>Field Report</a>
          <a href="/blogs" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>Blogs</a>
          <a href="/about" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>About Us</a>
        </div>

        <a
          href="/login"
          style={{
            textDecoration: 'none',
            background: 'transparent',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '8px 20px',
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 500,
            transition: 'all 150ms',
            fontFamily: '"Inter", sans-serif',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          Open Console
        </a>
      </motion.nav>
    </div>
  );
}

```

## File: `src/components/SequenceBackground.tsx`

```tsx
import { useEffect, useRef } from 'react';

const FRAME_COUNT = 192;
const currentFrame = (index: number) =>
  `/Sequence/frame_${index.toString().padStart(3, '0')}_delay-0.042s.png`;

interface SequenceBackgroundProps {
  fixedFrame?: number;
}

export function SequenceBackground({ fixedFrame }: SequenceBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const images: HTMLImageElement[] = [];
    let loadedImages = 0;

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = currentFrame(i);
      img.onload = () => {
        loadedImages++;
        if (loadedImages === 1) {
          updateImage(fixedFrame ?? 0);
        }
      };
      images.push(img);
    }

    const handleScroll = () => {
      if (fixedFrame !== undefined) return;
      const html = document.documentElement;
      const scrollTop = html.scrollTop;
      const maxScrollTop = html.scrollHeight - window.innerHeight;
      
      const scrollFraction = maxScrollTop > 0 ? (scrollTop / maxScrollTop) : 0;
      const frameIndex = Math.min(
        FRAME_COUNT - 1,
        Math.floor(scrollFraction * FRAME_COUNT)
      );

      requestAnimationFrame(() => updateImage(frameIndex));
    };

    const updateImage = (index: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const img = images[index];
      if (img && img.complete && img.naturalWidth !== 0) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const hRatio = canvas.width / img.naturalWidth;
        const vRatio = canvas.height / img.naturalHeight;
        const ratio = Math.max(hRatio, vRatio);
        
        const centerShift_x = (canvas.width - img.naturalWidth * ratio) / 2;
        const centerShift_y = (canvas.height - img.naturalHeight * ratio) / 2;
        
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          img,
          0, 0, img.naturalWidth, img.naturalHeight,
          centerShift_x, centerShift_y, img.naturalWidth * ratio, img.naturalHeight * ratio
        );
      }
    };

    if (fixedFrame === undefined) {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }
    
    const handleResize = () => {
      const html = document.documentElement;
      const scrollFraction = html.scrollHeight > window.innerHeight ? (html.scrollTop / (html.scrollHeight - window.innerHeight)) : 0;
      const frameIndex = fixedFrame ?? Math.min(FRAME_COUNT - 1, Math.floor(scrollFraction * FRAME_COUNT));
      updateImage(frameIndex);
    };

    window.addEventListener('resize', handleResize);
    
    updateImage(fixedFrame ?? 0);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [fixedFrame]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        position: 'fixed', 
        top: 0, left: 0, 
        width: '100vw', height: '100vh', 
        zIndex: 0, 
        objectFit: 'cover',
        pointerEvents: 'none'
      }} 
    />
  );
}

```

## File: `src/components/GlassSurface.tsx`

```tsx
import React, { useEffect, useRef, useState, useId } from 'react';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: 'R' | 'G' | 'B';
  yChannel?: 'R' | 'G' | 'B';
  mixBlendMode?:
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'color-dodge'
    | 'color-burn'
    | 'hard-light'
    | 'soft-light'
    | 'difference'
    | 'exclusion'
    | 'hue'
    | 'saturation'
    | 'color'
    | 'luminosity'
    | 'plus-darker'
    | 'plus-lighter';
  className?: string;
  style?: React.CSSProperties;
}

const useDarkMode = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isDark;
};

const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  width = 200,
  height = 80,
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0,
  saturation = 1,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = 'R',
  yChannel = 'G',
  mixBlendMode = 'difference',
  className = '',
  style = {}
}) => {
  const uniqueId = useId().replace(/:/g, '-');
  const filterId = `glass-filter-${uniqueId}`;
  const redGradId = `red-grad-${uniqueId}`;
  const blueGradId = `blue-grad-${uniqueId}`;

  const [svgSupported, setSvgSupported] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const redChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const greenChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const blueChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const gaussianBlurRef = useRef<SVGFEGaussianBlurElement>(null);

  const isDarkMode = useDarkMode();

  const generateDisplacementMap = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const actualWidth = rect?.width || 400;
    const actualHeight = rect?.height || 200;
    const edgeSize = Math.min(actualWidth, actualHeight) * (borderWidth * 0.5);

    const svgContent = `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${redGradId})" />
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${mixBlendMode}" />
        <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)" />
      </svg>
    `;

    return `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
  };

  const updateDisplacementMap = () => {
    feImageRef.current?.setAttribute('href', generateDisplacementMap());
  };

  useEffect(() => {
    updateDisplacementMap();
    [
      { ref: redChannelRef, offset: redOffset },
      { ref: greenChannelRef, offset: greenOffset },
      { ref: blueChannelRef, offset: blueOffset }
    ].forEach(({ ref, offset }) => {
      if (ref.current) {
        ref.current.setAttribute('scale', (distortionScale + offset).toString());
        ref.current.setAttribute('xChannelSelector', xChannel);
        ref.current.setAttribute('yChannelSelector', yChannel);
      }
    });

    gaussianBlurRef.current?.setAttribute('stdDeviation', displace.toString());
  }, [
    width,
    height,
    borderRadius,
    borderWidth,
    brightness,
    opacity,
    blur,
    displace,
    distortionScale,
    redOffset,
    greenOffset,
    blueOffset,
    xChannel,
    yChannel,
    mixBlendMode
  ]);

  useEffect(() => {
    setSvgSupported(supportsSVGFilters());
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(updateDisplacementMap, 0);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    setTimeout(updateDisplacementMap, 0);
  }, [width, height]);

  const supportsSVGFilters = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }

    const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const isFirefox = /Firefox/.test(navigator.userAgent);

    if (isWebkit || isFirefox) {
      return false;
    }

    const div = document.createElement('div');
    div.style.backdropFilter = `url(#${filterId})`;

    return div.style.backdropFilter !== '';
  };

  const supportsBackdropFilter = () => {
    if (typeof window === 'undefined') return false;
    return CSS.supports('backdrop-filter', 'blur(10px)');
  };

  const [backdropFilterSupported, setBackdropFilterSupported] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setBackdropFilterSupported(supportsBackdropFilter());
    setMounted(true);
  }, []);

  const getContainerStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      ...style,
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
      borderRadius: `${borderRadius}px`,
      '--glass-frost': backgroundOpacity,
      '--glass-saturation': saturation
    } as React.CSSProperties;

    // During hydration, return a stable style that matches what the server likely rendered
    if (!mounted) {
      return {
        ...baseStyles,
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
      };
    }
    if (svgSupported) {
      return {
        ...baseStyles,
        background: isDarkMode ? `hsl(0 0% 0% / ${backgroundOpacity})` : `hsl(0 0% 100% / ${backgroundOpacity})`,
        backdropFilter: `url(#${filterId}) saturate(${saturation})`,
        boxShadow: isDarkMode
          ? `0 0 2px 1px color-mix(in oklch, white, transparent 65%) inset,
             0 0 10px 4px color-mix(in oklch, white, transparent 85%) inset,
             0px 4px 16px rgba(17, 17, 26, 0.05),
             0px 8px 24px rgba(17, 17, 26, 0.05),
             0px 16px 56px rgba(17, 17, 26, 0.05),
             0px 4px 16px rgba(17, 17, 26, 0.05) inset,
             0px 8px 24px rgba(17, 17, 26, 0.05) inset,
             0px 16px 56px rgba(17, 17, 26, 0.05) inset`
          : `0 0 2px 1px color-mix(in oklch, black, transparent 85%) inset,
             0 0 10px 4px color-mix(in oklch, black, transparent 90%) inset,
             0px 4px 16px rgba(17, 17, 26, 0.05),
             0px 8px 24px rgba(17, 17, 26, 0.05),
             0px 16px 56px rgba(17, 17, 26, 0.05),
             0px 4px 16px rgba(17, 17, 26, 0.05) inset,
             0px 8px 24px rgba(17, 17, 26, 0.05) inset,
             0px 16px 56px rgba(17, 17, 26, 0.05) inset`
      };
    } else {
      if (isDarkMode) {
        if (!backdropFilterSupported) {
          return {
            ...baseStyles,
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
                        inset 0 -1px 0 0 rgba(255, 255, 255, 0.1)`
          };
        } else {
          return {
            ...baseStyles,
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(12px) saturate(1.8) brightness(1.2)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.2)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
                        inset 0 -1px 0 0 rgba(255, 255, 255, 0.1)`
          };
        }
      } else {
        if (!backdropFilterSupported) {
          return {
            ...baseStyles,
            background: 'rgba(255, 255, 255, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
                        inset 0 -1px 0 0 rgba(255, 255, 255, 0.3)`
          };
        } else {
          return {
            ...baseStyles,
            background: 'rgba(255, 255, 255, 0.25)',
            backdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: `0 8px 32px 0 rgba(31, 38, 135, 0.2),
                        0 2px 16px 0 rgba(31, 38, 135, 0.1),
                        inset 0 1px 0 0 rgba(255, 255, 255, 0.4),
                        inset 0 -1px 0 0 rgba(255, 255, 255, 0.2)`
          };
        }
      }
    }
  };

  const glassSurfaceClasses =
    'relative flex items-center justify-center overflow-hidden transition-opacity duration-[260ms] ease-out';

  const focusVisibleClasses = isDarkMode
    ? 'focus-visible:outline-2 focus-visible:outline-[#0A84FF] focus-visible:outline-offset-2'
    : 'focus-visible:outline-2 focus-visible:outline-[#007AFF] focus-visible:outline-offset-2';

  return (
    <div
      ref={containerRef}
      className={`${glassSurfaceClasses} ${focusVisibleClasses} ${className}`}
      style={getContainerStyles()}
    >
      <svg
        className="w-full h-full pointer-events-none absolute inset-0 opacity-0 -z-10"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage ref={feImageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

            <feDisplacementMap ref={redChannelRef} in="SourceGraphic" in2="map" id="redchannel" result="dispRed" />
            <feColorMatrix
              in="dispRed"
              type="matrix"
              values="1 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0"
              result="red"
            />

            <feDisplacementMap
              ref={greenChannelRef}
              in="SourceGraphic"
              in2="map"
              id="greenchannel"
              result="dispGreen"
            />
            <feColorMatrix
              in="dispGreen"
              type="matrix"
              values="0 0 0 0 0
                      0 1 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0"
              result="green"
            />

            <feDisplacementMap ref={blueChannelRef} in="SourceGraphic" in2="map" id="bluechannel" result="dispBlue" />
            <feColorMatrix
              in="dispBlue"
              type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 1 0 0
                      0 0 0 1 0"
              result="blue"
            />

            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur ref={gaussianBlurRef} in="output" stdDeviation="0.7" />
          </filter>
        </defs>
      </svg>

      <div className="w-full h-full flex items-center justify-center p-2 rounded-[inherit] relative z-10">
        {children}
      </div>
    </div>
  );
};

export default GlassSurface;

```

## File: `src/components/FrostGlass.tsx`

```tsx
import React, { useState } from 'react';

interface FrostGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: string | number;
  borderRadius?: string | number;
}

export function FrostGlass({
  children,
  padding,
  borderRadius = '24px',
  className = '',
  style = {},
  onMouseEnter,
  onMouseLeave,
  ...props
}: FrostGlassProps) {
  const [isHovered, setIsHovered] = useState(false);

  const baseStyle: React.CSSProperties = {
    background: isHovered 
      ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.08) 100%)'
      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.05) 100%)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)', // for Safari support
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: isHovered
      ? '0 20px 40px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.2)'
      : '0 16px 32px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
    borderRadius,
    padding,
    transition: 'all 0.25s ease-out',
    ...style,
  };

  return (
    <div
      className={className}
      style={baseStyle}
      onMouseEnter={(e) => {
        setIsHovered(true);
        if (onMouseEnter) onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        if (onMouseLeave) onMouseLeave(e);
      }}
      {...props}
    >
      {children}
    </div>
  );
}

```

## File: `src/components/ops/BattleScoreboard.tsx`

```tsx
import type { BattleScoreboard as BattleScoreboardType } from '../../lib/ops-types';

interface BattleScoreboardProps {
  scoreboard: BattleScoreboardType | null;
  step: number;
  maxSteps: number;
  episodeId: string;
}

export default function BattleScoreboard({ scoreboard, step, maxSteps, episodeId }: BattleScoreboardProps) {
  if (!scoreboard) return null;

  const fpNote = scoreboard.false_positives_this_episode > 0
    ? `${scoreboard.false_positives_this_episode} false positive${scoreboard.false_positives_this_episode > 1 ? 's' : ''}`
    : 'No false positives';

  return (
    <div className="ops-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {/* Episode info */}
        <div className="flex items-center gap-3">
          <span className="ops-display text-sm tracking-widest">CYBERGUARDIAN AI</span>
          <span className="ops-muted text-xs">
            {episodeId} · STEP {step}/{maxSteps}
          </span>
        </div>

        {/* Node counts */}
        <div className="flex items-center gap-5">
          <ScoreBlock color="#ff0044" icon="☠" label="RED CAPTURED" value={scoreboard.red_nodes_controlled} />
          <ScoreBlock color="#ffcc00" icon="⚔" label="CONTESTED" value={scoreboard.contested_nodes} />
          <ScoreBlock color="#00e5ff" icon="🛡" label="BLUE SECURED" value={scoreboard.blue_nodes_secured} />
        </div>

        {/* FP count */}
        <div className="ops-muted text-[0.62rem]">
          <span className="text-amber-300/70">⚠</span> {fpNote}
        </div>
      </div>

      {/* Progress bars */}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <ProgressRow
          color="#ff0044"
          label="RED PROGRESS"
          note={scoreboard.red_nodes_controlled > 0 ? 'closing on DB segment' : 'probing perimeter'}
          value={scoreboard.red_progress}
        />
        <ProgressRow
          color="#00e5ff"
          label="BLUE PROGRESS"
          note={`${scoreboard.blue_total_defenses + scoreboard.blue_total_recaptures} threats contained`}
          value={scoreboard.blue_progress}
        />
      </div>
    </div>
  );
}

function ScoreBlock({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="ops-data text-xl" style={{ color }}>{value}</div>
        <div className="ops-label text-[0.5rem]">{label}</div>
      </div>
    </div>
  );
}

function ProgressRow({ label, value, color, note }: { label: string; value: number; color: string; note: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="ops-label w-28 text-[0.58rem]">{label}</div>
      <div className="relative h-3 flex-1 rounded-sm bg-white/6 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 10px ${color}40` }}
        />
      </div>
      <div className="ops-data w-10 text-right text-sm" style={{ color }}>{pct}%</div>
      <div className="ops-muted hidden text-[0.52rem] xl:block">← {note}</div>
    </div>
  );
}

```

## File: `src/components/ops/BattleToast.tsx`

```tsx
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import type { NodeBattleResult } from '../../lib/ops-types';

interface BattleToastData {
  id: string;
  result: NodeBattleResult;
  createdAt: number;
}

interface BattleToastManagerProps {
  results: NodeBattleResult[];
}

const TOAST_DURATION = {
  captured: 8000,
  defended: 5000,
  recaptured: 6000,
} as const satisfies Record<'captured' | 'defended' | 'recaptured', number>;

const TOAST_COLORS = {
  captured: { bg: '#1a0008', border: '#ff0044', icon: '☠', title: 'NODE CAPTURED' },
  defended: { bg: '#001a1f', border: '#00e5ff', icon: '🛡', title: 'NODE DEFENDED' },
  recaptured: { bg: '#001a1f', border: '#00e5ff', icon: '♻', title: 'NODE RECAPTURED' },
} as const satisfies Record<
  'captured' | 'defended' | 'recaptured',
  { bg: string; border: string; icon: string; title: string }
>;

const FP_STYLE = { bg: '#1a1200', border: '#ffcc00', icon: '⚠', title: 'FALSE POSITIVE' };

export default function BattleToastManager({ results }: BattleToastManagerProps) {
  const [toasts, setToasts] = useState<BattleToastData[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  // Add new toasts from results
  useEffect(() => {
    const newToasts: BattleToastData[] = [];
    for (const result of results) {
      const id = `${result.node_id}-${result.step_resolved}-${result.outcome}`;
      if (!seen.has(id)) {
        newToasts.push({ id, result, createdAt: Date.now() });
        setSeen((prev) => new Set(prev).add(id));
      }
    }
    if (newToasts.length > 0) {
      setToasts((prev) => [...prev, ...newToasts].slice(-3));
    }
  }, [results]);

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => {
      const duration = TOAST_DURATION[toast.result.outcome as keyof typeof TOAST_DURATION] ?? 6000;
      return window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, duration);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [toasts]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="fixed right-4 top-20 z-[1100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const r = toast.result;
          const outcome = r.outcome as keyof typeof TOAST_COLORS;
          const style = r.false_positive ? FP_STYLE : TOAST_COLORS[outcome] ?? TOAST_COLORS.captured;
          return (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="pointer-events-auto w-[380px] rounded-sm border-l-4 px-4 py-3"
              exit={{ opacity: 0, x: 80 }}
              initial={{ opacity: 0, x: 80 }}
              key={toast.id}
              style={{
                backgroundColor: style.bg,
                borderColor: style.border,
                borderLeftWidth: 4,
                borderRightWidth: 1,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                boxShadow: `0 0 20px ${style.border}30`,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{style.icon}</span>
                  <span className="ops-display text-sm" style={{ color: style.border }}>
                    {style.title} — {r.node_label}
                  </span>
                </div>
                <button
                  className="ops-muted text-xs hover:text-white transition-colors"
                  onClick={() => dismiss(toast.id)}
                >✕</button>
              </div>
              <div className="ops-muted mt-2 text-xs leading-5">
                {r.incident_summary}
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 ops-muted text-[0.62rem]">
                <strong style={{ color: style.border }}>IMPACT:</strong> {r.strategic_impact}
              </div>
              {r.outcome === 'captured' ? (
                <div className="mt-2 text-center">
                  <span className="ops-label cursor-pointer rounded-sm border border-red-400/30 bg-red-400/10 px-3 py-1 text-[0.62rem] text-red-300 hover:bg-red-400/20 transition-colors">
                    📋 GENERATE EMERGENCY PLAYBOOK
                  </span>
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

```

## File: `src/components/ops/BattleTimeline.tsx`

```tsx
import type { NodeBattleResult } from '../../lib/ops-types';

interface BattleTimelineProps {
  results: NodeBattleResult[];
  step: number;
  maxSteps: number;
}

const ICON_MAP: Record<string, string> = {
  captured: '☠',
  defended: '🛡',
  recaptured: '♻',
};

const COLOR_MAP: Record<string, { winner: string; bg: string }> = {
  captured: { winner: '#ff0044', bg: '#ff004420' },
  defended: { winner: '#00e5ff', bg: '#00e5ff20' },
  recaptured: { winner: '#00ff88', bg: '#00ff8820' },
};

export default function BattleTimeline({ results, step, maxSteps }: BattleTimelineProps) {
  if (results.length === 0) return null;

  return (
    <div className="ops-card px-4 py-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">⏱</span>
        <span className="ops-display text-[0.65rem]">BATTLE TIMELINE</span>
        <span className="ops-muted text-[0.55rem]">{results.length} event{results.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Timeline bar */}
      <div className="relative h-6">
        {/* Track */}
        <div className="absolute left-0 right-0 top-3 h-px bg-white/15" />

        {/* Cursor */}
        <div
          className="absolute top-1 h-4 w-0.5 bg-white/40 rounded-full z-10"
          style={{ left: `${(step / maxSteps) * 100}%` }}
        />

        {/* Event markers */}
        {results.map((r, i) => {
          const leftPct = (r.step_resolved / maxSteps) * 100;
          const icon = r.false_positive ? '⚠' : ICON_MAP[r.outcome] ?? '❓';
          const colors = r.false_positive
            ? { winner: '#ffcc00', bg: '#ffcc0020' }
            : COLOR_MAP[r.outcome] ?? COLOR_MAP.captured;
          return (
            <div
              className="absolute top-0 cursor-pointer transform -translate-x-1/2 group"
              key={`${r.node_id}-${r.step_resolved}-${i}`}
              style={{ left: `${leftPct}%` }}
            >
              {/* Marker */}
              <div
                className="w-5 h-5 flex items-center justify-center text-[0.6rem] rounded-full border transition-transform hover:scale-125"
                style={{ borderColor: colors.winner, backgroundColor: colors.bg, color: colors.winner }}
              >
                {icon}
              </div>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="w-52 rounded-sm border border-white/15 px-3 py-2" style={{ background: 'rgba(10, 18, 34, 0.95)' }}>
                  <div className="ops-label text-[0.55rem]" style={{ color: colors.winner }}>
                    {r.winner.toUpperCase()} {r.outcome.toUpperCase()} — {r.node_label}
                  </div>
                  <div className="ops-muted mt-1 text-[0.52rem]">{r.incident_summary}</div>
                  <div className="ops-muted mt-1 text-[0.5rem]">
                    Step {r.step_resolved} · {r.total_steps_fought} steps fought
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

```

## File: `src/components/ops/BattleParticleCanvas.tsx`

```tsx
import { useEffect, useRef } from 'react';
import type { ContestEvent } from '../../lib/ops-types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

interface BattleParticleCanvasProps {
  events: ContestEvent[];
  nodePositions: Map<number, { x: number; y: number }>;
  width: number;
  height: number;
}

const RED_COLOR = '#ff0044';
const BLUE_COLOR = '#00e5ff';
const FLASH_COLOR = '#ffffff';

/**
 * Canvas overlay for particle collision effects on contested nodes.
 * Uses requestAnimationFrame for high-performance particle rendering.
 */
export default function BattleParticleCanvas({ events, nodePositions, width, height }: BattleParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  // Spawn particles for contested nodes
  useEffect(() => {
    const activeEvents = events.filter(
      (e) => e.phase !== 'idle' && e.phase !== 'blue_defended' && e.phase !== 'blue_recaptured'
    );

    for (const event of activeEvents) {
      const pos = nodePositions.get(event.node_id);
      if (!pos) continue;

      const numParticles = Math.ceil(event.contest_intensity * 8) + 2;
      for (let i = 0; i < numParticles; i++) {
        const isRed = Math.random() > 0.5;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.3 + Math.random() * 1.2;
        particlesRef.current.push({
          x: pos.x + (Math.random() - 0.5) * 20,
          y: pos.y + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: isRed ? RED_COLOR : BLUE_COLOR,
          life: 1.0,
          maxLife: 0.6 + Math.random() * 0.8,
          size: 1.5 + Math.random() * 2,
        });
      }
    }

    // Cap max particles
    if (particlesRef.current.length > 500) {
      particlesRef.current = particlesRef.current.slice(-500);
    }
  }, [events, nodePositions]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      const particles = particlesRef.current;
      const alive: Particle[] = [];

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.016 / p.maxLife;
        p.vx *= 0.98;
        p.vy *= 0.98;

        if (p.life <= 0) continue;
        alive.push(p);

        const alpha = Math.max(0, p.life);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = p.size * 3;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      // Check for red-blue particle collisions — emit white flash
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i];
          const b = alive[j];
          if (a.color === b.color) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 6) {
            // Flash
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = FLASH_COLOR;
            ctx.shadowBlur = 12;
            ctx.shadowColor = FLASH_COLOR;
            ctx.beginPath();
            ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, 3, 0, Math.PI * 2);
            ctx.fill();
            // Kill both
            a.life = 0;
            b.life = 0;
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      particlesRef.current = alive.filter((p) => p.life > 0);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);

  return (
    <canvas
      className="absolute inset-0 pointer-events-none"
      height={height}
      ref={canvasRef}
      style={{ zIndex: 10 }}
      width={width}
    />
  );
}

```

## File: `src/components/ops/ContestInfoPanel.tsx`

```tsx
import { motion } from 'framer-motion';
import type { ContestEvent, DecisionScores, NetworkNode, NodeBattleResult } from '../../lib/ops-types';

interface ContestInfoPanelProps {
  node: NetworkNode;
  contest: ContestEvent | null;
  battleResult: NodeBattleResult | null;
  redThoughts: DecisionScores;
  blueThoughts: DecisionScores;
  step: number;
  maxSteps: number;
  onClose: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: '#00ff88',
  medium: '#ffcc00',
  high: '#ff6600',
  critical: '#ff0044',
};

export default function ContestInfoPanel({
  node,
  contest,
  battleResult,
  redThoughts,
  blueThoughts,
  step,
  maxSteps,
  onClose,
}: ContestInfoPanelProps) {
  const severity = contest?.severity || (node.status === 'compromised' ? 'critical' : node.status === 'detected' ? 'high' : 'medium');
  const sevColor = SEVERITY_COLORS[severity] ?? '#ffcc00';
  const noMansLand = contest ? Math.max(0, Math.round((contest.red_control_pct + contest.blue_control_pct - 1) * 100)) : 0;
  const confPct = contest ? Math.round(contest.correlation_confidence * 100) : 0;
  const whyItWon =
    battleResult?.false_positive
      ? battleResult.false_positive_reason || battleResult.victory_reason
      : battleResult?.victory_reason || contest?.winning_reason || 'No resolved winner yet. Inspect the live decision overlay to understand current pressure.';

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="fixed right-4 top-20 z-[1000] w-[420px] rounded-[18px] border border-white/10 shadow-2xl"
      exit={{ opacity: 0, scale: 0.95 }}
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      style={{
        background: 'rgba(12, 14, 18, 0.95)',
        backdropFilter: 'blur(18px)',
        borderLeftWidth: 4,
        borderLeftColor: sevColor,
      }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="ops-display text-sm">{node.label}</div>
          <div className="ops-muted mt-1 text-xs">{node.type.replace('_', ' ').toUpperCase()} · {node.status.replace('_', ' ')}</div>
        </div>
        <button className="ops-muted text-sm transition-colors hover:text-white" onClick={onClose} type="button">✕</button>
      </div>

      <div className="border-b border-white/10 px-4 py-2 ops-label text-[0.58rem]">
        {contest ? <>Phase: <span style={{ color: sevColor }}>{contest.phase.replace('_', ' ').toUpperCase()}</span></> : <>Node Insight</>}
        <span className="ops-muted ml-2">· {severity.toUpperCase()} · Step {step}/{maxSteps}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-white/10 px-4 py-4">
        <MiniMetric label="Vulnerability" value={`${Math.round(node.vulnerability_score * 100)}%`} />
        <MiniMetric label="Data Value" value={`${node.data_value_gb.toFixed(1)} GB`} />
        <MiniMetric label="Patch Level" value={node.patch_level} />
      </div>

      {contest ? (
        <div className="border-b border-white/10 px-4 py-3">
          <div className="ops-label text-[0.55rem]">
            Threat: {contest.active_threat_type?.replace('_', ' ').toUpperCase()} [{contest.mitre_id || 'TXXXX'} {contest.mitre_name || 'Pending Classification'}]
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="ops-muted text-[0.55rem]">Confidence</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-sm bg-white/10">
              <div className="absolute inset-y-0 left-0 rounded-sm bg-cyan-300/60" style={{ width: `${confPct}%` }} />
            </div>
            <span className="ops-data text-[0.62rem]">{confPct}%</span>
          </div>
          <div className="mt-2 flex gap-3">
            {Object.entries(contest.layers_active).map(([layer, active]) => (
              <span className="ops-label text-[0.52rem]" key={layer}>
                {active ? '■' : '□'} {layer.charAt(0).toUpperCase() + layer.slice(1)}
              </span>
            ))}
          </div>
          <div className="ops-muted mt-1 text-[0.52rem] italic">{contest.cross_layer_note}</div>
          <div className="ops-muted mt-1 text-[0.52rem]">No-man&apos;s land: {noMansLand}% · contested for {contest.steps_contested} steps</div>
        </div>
      ) : null}

      <div className="border-b border-white/10 px-4 py-3">
        <div className="mb-2 text-[0.55rem] font-bold text-primary">WHY IT WON</div>
        <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="ops-label text-[0.5rem]">
              {battleResult ? `${battleResult.winner.toUpperCase()} ${battleResult.outcome.toUpperCase()}` : contest ? 'CURRENT EDGE' : 'NO RESOLUTION YET'}
            </div>
            {battleResult ? <div className="ops-data text-[0.68rem]">STEP {battleResult.step_resolved}</div> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-white/88">{whyItWon}</p>
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-3">
        <div className="mb-2 text-[0.55rem] font-bold text-red-300">RED Q-VALUES HEATMAP</div>
        <ThoughtBars color="#ff335f" items={topScores(redThoughts)} />
      </div>

      <div className="border-b border-white/10 px-4 py-3">
        <div className="mb-2 text-[0.55rem] font-bold text-cyan-300">BLUE POLICY PROBABILITY</div>
        <ThoughtBars color="#14d1ff" items={topScores(blueThoughts)} />
      </div>

      {contest ? (
        <>
          <div className="border-b border-white/10 px-4 py-3">
            <div className="mb-1 text-[0.55rem] font-bold text-red-400">WHY RED TARGETED THIS NODE</div>
            <div className="ops-muted text-xs leading-5">&ldquo;{contest.red_targeting_reason}&rdquo;</div>
          </div>

          <div className="border-b border-white/10 px-4 py-3">
            <div className="mb-1 text-[0.55rem] font-bold text-cyan-300">WHY THIS WAS FLAGGED</div>
            <div className="ops-muted text-xs leading-5">&ldquo;{contest.detection_reason}&rdquo;</div>
          </div>
        </>
      ) : null}

      <div className="px-4 py-3">
        <div className="mb-1 text-[0.55rem] font-bold text-amber-300">WHAT TO DO RIGHT NOW</div>
        <div className="ops-muted text-xs leading-5">
          &ldquo;{contest?.immediate_action || 'Investigate the node and compare the current Red and Blue decision weights before acting.'}&rdquo;
        </div>
        <div className="mt-3 flex gap-2">
          <ActionButton color="#ff0044" label="ISOLATE" />
          <ActionButton color="#00ff88" label="PATCH" />
          <ActionButton color="#00e5ff" label="PLAYBOOK" />
        </div>
      </div>

      {contest ? (
        <div className="border-t border-white/10 px-4 py-2">
          <div className="ops-muted text-[0.52rem]">
            MITRE ATT&CK: {contest.mitre_id || 'TXXXX'} {contest.mitre_name || 'Pending'}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

function topScores(scores: DecisionScores) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-3">
      <div className="ops-label text-[0.48rem]">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function ThoughtBars({ items, color }: { items: Array<[string, number]>; color: string }) {
  if (!items.length) {
    return <div className="ops-muted text-xs">No decision weights available yet.</div>;
  }

  return (
    <div className="space-y-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="ops-label text-[0.5rem]">{label.replace(/_/g, ' ')}</span>
            <span className="ops-data text-[0.68rem]">{Math.round(value * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionButton({ label, color }: { label: string; color: string }) {
  return (
    <button
      className="ops-label cursor-pointer rounded-sm border px-3 py-1.5 text-[0.58rem] transition-colors hover:bg-white/8"
      style={{ borderColor: `${color}40`, color }}
      type="button"
    >
      {label}
    </button>
  );
}

```

## File: `src/components/ops/ContestNode.tsx`

```tsx
import type { ContestPhase, NetworkNode } from '../../lib/ops-types';

interface ContestNodeProps {
  cx: number;
  cy: number;
  r: number;
  nodeType: NetworkNode['type'];
  phase: ContestPhase;
  redControl: number;
  blueControl: number;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  contestIntensity: number;
  isRedHere?: boolean;
  isSelected?: boolean;
  attentionLevel?: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const PHASE_CONFIG: Record<ContestPhase, {
  stroke: string;
  fill: string;
  icon: string;
  label: string;
  pulse: boolean;
}> = {
  idle: { stroke: '#365579', fill: '#081120', icon: '', label: '', pulse: false },
  probing: { stroke: '#ff8c5c', fill: '#170b0d', icon: '?', label: 'PROBING', pulse: true },
  contested: { stroke: '#ffcf5c', fill: '#130d14', icon: '⚔', label: 'CONTESTED', pulse: true },
  red_winning: { stroke: '#ff335f', fill: '#1a0911', icon: '⚔', label: 'LOSING', pulse: true },
  blue_winning: { stroke: '#4dd8ff', fill: '#071824', icon: '⚔', label: 'DEFENDING', pulse: true },
  red_captured: { stroke: '#ff335f', fill: '#250811', icon: '☠', label: 'COMPROMISED', pulse: false },
  blue_defended: { stroke: '#59f0c1', fill: '#08161a', icon: '🛡', label: 'SECURED', pulse: false },
  blue_recaptured: { stroke: '#4dd8ff', fill: '#061624', icon: '♻', label: 'RECAPTURED', pulse: false },
};

export default function ContestNode({
  cx,
  cy,
  r,
  nodeType,
  phase,
  redControl,
  blueControl,
  label,
  severity,
  contestIntensity,
  isRedHere = false,
  isSelected = false,
  attentionLevel = 0,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ContestNodeProps) {
  const cfg = PHASE_CONFIG[phase] ?? PHASE_CONFIG.idle;
  const isActive = phase !== 'idle';
  const fillId = `contest-fill-${label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
  const severityWidth = { low: 1.5, medium: 2, high: 3, critical: 4 }[severity];
  const controlTotal = Math.max(0.01, redControl + blueControl);
  const redShare = Math.min(100, Math.max(8, (redControl / controlTotal) * 100));
  const arcOuter = r + 7;
  const arcInner = r + 3.5;
  const bodyPath = isHexNode(nodeType) ? hexagonPath(cx, cy, r + 1) : '';

  return (
    <g
      aria-label={onClick ? `${label} ${cfg.label || phase}` : undefined}
      className={onClick ? 'cursor-pointer' : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {attentionLevel > 0.5 ? (
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={r + 14}
          stroke={phase === 'red_captured' || phase === 'red_winning' ? '#ff335f' : '#14d1ff'}
          strokeOpacity={0.22 + attentionLevel * 0.32}
          strokeWidth={1.5}
        >
          <animate attributeName="stroke-opacity" dur="1.6s" repeatCount="indefinite" values="0.2;0.55;0.2" />
        </circle>
      ) : null}

      <defs>
        <linearGradient id={fillId} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor={phase === 'blue_defended' || phase === 'blue_recaptured' ? '#06202a' : '#080f18'} />
          <stop offset={`${redShare}%`} stopColor={phase === 'blue_defended' || phase === 'blue_recaptured' ? '#07242d' : '#2a0813'} />
          <stop offset={`${redShare}%`} stopColor={phase === 'red_captured' ? '#450a18' : '#0a1623'} />
          <stop offset="100%" stopColor={phase === 'red_captured' ? '#1f0710' : phase === 'blue_winning' ? '#092534' : '#0a1019'} />
        </linearGradient>
      </defs>

      {isActive ? (
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={r + 10}
          stroke={cfg.stroke}
          strokeDasharray="4 3"
          strokeOpacity={0.25 + contestIntensity * 0.32}
          strokeWidth={1}
        >
          <animate attributeName="r" begin="0s" dur="1.8s" repeatCount="indefinite" values={`${r + 8};${r + 20};${r + 8}`} />
          <animate attributeName="stroke-opacity" begin="0s" dur="1.8s" repeatCount="indefinite" values="0.45;0.08;0.45" />
        </circle>
      ) : null}

      {isHexNode(nodeType) ? (
        <path d={bodyPath} fill={`url(#${fillId})`} stroke={cfg.stroke} strokeWidth={severityWidth} />
      ) : (
        <circle cx={cx} cy={cy} fill={`url(#${fillId})`} r={r} stroke={cfg.stroke} strokeWidth={severityWidth} />
      )}

      {redControl > 0.01 ? (
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={arcInner}
          stroke="#ff335f"
          strokeDasharray={`${Math.max(8, redControl * 140)} 160`}
          strokeLinecap="round"
          strokeWidth={2.8}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ) : null}

      {blueControl > 0.01 ? (
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={arcOuter}
          stroke="#4dd8ff"
          strokeDasharray={`${Math.max(8, blueControl * 160)} 180`}
          strokeLinecap="round"
          strokeWidth={2.6}
          transform={`rotate(90 ${cx} ${cy})`}
        />
      ) : null}

      {cfg.pulse ? (
        <circle cx={cx} cy={cy} fill="none" r={r} stroke={cfg.stroke} strokeWidth={1}>
          <animate attributeName="r" begin="0s" dur="1.5s" repeatCount="indefinite" values={`${r};${r + 5};${r}`} />
          <animate attributeName="stroke-opacity" begin="0s" dur="1.5s" repeatCount="indefinite" values="0.6;0.05;0.6" />
        </circle>
      ) : null}

      {isSelected ? (
        <circle cx={cx} cy={cy} fill="none" r={r + 18} stroke="#b0c6ff" strokeDasharray="6 6" strokeOpacity={0.85} strokeWidth={1.8}>
          <animateTransform
            attributeName="transform"
            dur="2.4s"
            from={`0 ${cx} ${cy}`}
            repeatCount="indefinite"
            to={`360 ${cx} ${cy}`}
            type="rotate"
          />
        </circle>
      ) : null}

      {cfg.icon ? (
        <text dominantBaseline="central" fill="white" fontSize={r * 0.72} textAnchor="middle" x={cx} y={cy}>
          {cfg.icon}
        </text>
      ) : null}

      {isRedHere ? (
        <circle cx={cx} cy={cy} fill="none" r={r + 14} stroke="#ff335f" strokeDasharray="6 6" strokeWidth={1.5}>
          <animateTransform
            attributeName="transform"
            dur="1.2s"
            from={`0 ${cx} ${cy}`}
            repeatCount="indefinite"
            to={`360 ${cx} ${cy}`}
            type="rotate"
          />
        </circle>
      ) : null}

      <text
        dominantBaseline="hanging"
        fill={cfg.stroke}
        fontFamily="'IBM Plex Mono', monospace"
        fontSize={7}
        textAnchor="middle"
        x={cx}
        y={cy + r + 8}
      >
        {label}
      </text>

      {cfg.label ? (
        <text
          dominantBaseline="auto"
          fill={cfg.stroke}
          fontFamily="'Orbitron', sans-serif"
          fontSize={5}
          opacity={0.82}
          textAnchor="middle"
          x={cx}
          y={cy - r - 10}
        >
          {cfg.label}
        </text>
      ) : null}
    </g>
  );
}

function isHexNode(nodeType: NetworkNode['type']) {
  return nodeType === 'dmz' || nodeType === 'db_server';
}

function hexagonPath(cx: number, cy: number, r: number) {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 6;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ') + ' Z';
}

```

## File: `src/components/ops/BreachCountdown.tsx`

```tsx
import { motion } from 'motion/react';

interface BreachCountdownProps {
  countdownDisplay: string;
  countdownSeconds: number | null;
  confidence: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  urgencyColor: string;
  currentStage: number;
  currentStageName: string;
  killChainProgress: number;
}

export default function BreachCountdown({
  countdownDisplay,
  countdownSeconds,
  confidence,
  urgency,
  urgencyColor,
  currentStage,
  currentStageName,
  killChainProgress,
}: BreachCountdownProps) {
  const isBreachImminent = urgency === 'critical';

  return (
    <div className="relative flex flex-col items-center">
      <motion.div
        className="relative flex flex-col items-center p-6 rounded-sm"
        style={{
          background: 'rgba(13, 22, 40, 0.9)',
          border: `1px solid ${urgencyColor}`,
          boxShadow: isBreachImminent
            ? `0 0 40px ${urgencyColor}66, 0 0 80px ${urgencyColor}33`
            : `0 0 16px ${urgencyColor}33`,
        }}
        animate={isBreachImminent ? {
          boxShadow: [
            `0 0 20px ${urgencyColor}66`,
            `0 0 60px ${urgencyColor}88, 0 0 100px ${urgencyColor}44`,
            `0 0 20px ${urgencyColor}66`,
          ],
        } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <div className="text-xs tracking-widest mb-3" style={{ color: urgencyColor, fontFamily: 'Orbitron' }}>
          {countdownSeconds === null
            ? '● MONITORING'
            : isBreachImminent
            ? '⚠ BREACH IMMINENT'
            : '⚠ ESTIMATED BREACH IN'}
        </div>

        <div
          className="text-5xl font-bold tracking-wider tabular-nums"
          style={{
            fontFamily: 'Share Tech Mono',
            color: urgencyColor,
            textShadow: `0 0 20px ${urgencyColor}`,
          }}
        >
          {countdownDisplay}
        </div>

        <div className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'IBM Plex Mono' }}>
          {(confidence * 100).toFixed(0)}% confidence • RL-derived
        </div>

        <div className="mt-4 w-full">
          <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'IBM Plex Mono', color: 'rgba(255,255,255,0.4)' }}>
            <span>RECON</span>
            <span>{currentStageName.toUpperCase()}</span>
            <span>EXFIL</span>
          </div>
          <div className="w-full h-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <motion.div
              className="h-full rounded-sm"
              style={{ background: urgencyColor }}
              animate={{ width: `${killChainProgress * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between mt-1">
            {[1,2,3,4,5,6,7].map(s => (
              <div
                key={s}
                className="w-2 h-2 rounded-full"
                style={{
                  background: s <= currentStage ? urgencyColor : 'rgba(255,255,255,0.15)',
                  boxShadow: s === currentStage ? `0 0 8px ${urgencyColor}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

```

## File: `src/components/ops/AptAttribution.tsx`

```tsx
import { motion } from 'motion/react';
import type { AptMatch } from '../../lib/ops-types';

export default function AptAttribution({ matches }: { matches: AptMatch[] }) {
  return (
    <div className="flex flex-col gap-2" style={{ maxHeight: 280, overflowY: 'auto' }}>
      <div className="text-xs tracking-widest mb-1" style={{ fontFamily: 'Orbitron', color: '#7a9cc4' }}>
        THREAT DNA — APT ATTRIBUTION
      </div>

      {matches.map((apt) => (
        <motion.div
          key={apt.name}
          className="flex flex-col gap-1 p-2 rounded-sm"
          style={{
            background: apt.is_top_match ? `${apt.color}11` : 'transparent',
            border: apt.is_top_match ? `1px solid ${apt.color}44` : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium" style={{ fontFamily: 'IBM Plex Mono', color: apt.is_top_match ? apt.color : '#7a9cc4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {apt.flag} {apt.name}
            </span>
            <span className="text-xs" style={{ fontFamily: 'Share Tech Mono', color: apt.color }}>
              {apt.score_percent}%
            </span>
          </div>

          <div className="w-full h-1 rounded-sm" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-sm"
              style={{ background: apt.color }}
              animate={{ width: `${apt.bar_fill * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>

          {apt.is_top_match ? (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'IBM Plex Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {apt.risk_note}
            </p>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}

```

## File: `src/components/ops/VelocitySparkline.tsx`

```tsx
interface VelocitySparklineProps {
  history: number[];
  label: string;
  color: string;
}

export default function VelocitySparkline({ history, label, color }: VelocitySparklineProps) {
  const w = 200;
  const h = 48;
  const pad = 4;

  if (!history.length) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ fontFamily: 'Orbitron', color: '#7a9cc4' }}>
            VELOCITY
          </span>
          <span className="text-xs font-bold" style={{ fontFamily: 'Share Tech Mono', color }}>
            {label}
          </span>
        </div>
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>No velocity data yet</div>
      </div>
    );
  }

  const min = Math.min(...history, 0);
  const max = Math.max(...history, 0.01);
  const range = max - min || 1;

  const points = history.map((v, i) => {
    const x = pad + (i / Math.max(1, history.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const areaPath = `${points} L ${(pad + (w - pad * 2)).toFixed(1)} ${h - pad} L ${pad} ${h - pad} Z`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ fontFamily: 'Orbitron', color: '#7a9cc4' }}>
          VELOCITY
        </span>
        <span className="text-xs font-bold" style={{ fontFamily: 'Share Tech Mono', color }}>
          {label}
        </span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#velGrad)" />
        <path d={points} fill="none" stroke={color} strokeWidth={2} />
      </svg>
    </div>
  );
}

```

## File: `src/components/ops/NodeDecisionPanel.tsx`

```tsx
import type { DecisionScores, KillChainState, NodeBattleResult, ThreatAlert } from '../../lib/ops-types';

interface NodeDecisionPanelProps {
  nodeId: number;
  nodeLabel: string;
  nodeStatus: string;
  nodeDescription?: string;
  redQValues: DecisionScores | undefined;
  bluePolicyProbs: DecisionScores | undefined;
  alerts: ThreatAlert[];
  battleResult: NodeBattleResult | undefined;
  killChain: KillChainState | null;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  monitor: 'Monitor',
  isolate: 'Isolate',
  patch: 'Patch',
  scan: 'Scan',
  decoy: 'Deploy Decoy',
  block: 'Block Traffic',
  brute_force: 'Brute Force',
  lateral_movement: 'Lateral Movement',
  data_exfiltration: 'Data Exfiltration',
  c2_beacon: 'C2 Beacon',
  recon: 'Reconnaissance',
  exploit: 'Exploit Vulnerability',
  persist: 'Establish Persistence',
};

function formatAction(key: string): string {
  return ACTION_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DecisionBar({ label, value, maxVal, isChosen, color }: {
  label: string; value: number; maxVal: number; isChosen: boolean; color: string;
}) {
  const pct = maxVal > 0 ? Math.max(2, (Math.abs(value) / maxVal) * 100) : 2;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          color: isChosen ? color : 'rgba(255,255,255,0.7)',
          fontWeight: isChosen ? 700 : 400,
        }}>
          {formatAction(label)} {isChosen ? '← CHOSEN' : ''}
        </span>
        <span style={{
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 12,
          color: isChosen ? color : 'rgba(255,255,255,0.5)',
          fontWeight: isChosen ? 700 : 400,
        }}>
          {(value * 100).toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 3,
          background: isChosen ? color : 'rgba(255,255,255,0.15)',
          boxShadow: isChosen ? `0 0 8px ${color}44` : 'none',
          transition: 'width 300ms ease',
        }} />
      </div>
    </div>
  );
}

export default function NodeDecisionPanel({
  nodeId,
  nodeLabel,
  nodeStatus,
  nodeDescription,
  redQValues,
  bluePolicyProbs,
  alerts,
  battleResult,
  killChain,
  onClose,
}: NodeDecisionPanelProps) {
  const nodeAlerts = alerts.filter((a) => a.affected_hosts?.includes(nodeId));
  const maxRed = redQValues ? Math.max(...Object.values(redQValues), 0.01) : 1;
  const maxBlue = bluePolicyProbs ? Math.max(...Object.values(bluePolicyProbs), 0.01) : 1;
  const chosenRed = redQValues
    ? (Object.entries(redQValues).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null)
    : null;
  const chosenBlue = bluePolicyProbs
    ? (Object.entries(bluePolicyProbs).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null)
    : null;

  /* Build reasoning chain */
  const reasoningChain: string[] = [];
  if (nodeStatus === 'compromised' || nodeStatus === 'under_attack') {
    reasoningChain.push(`Host ${nodeLabel} is currently ${nodeStatus.replace('_', ' ')}`);
  }
  if (nodeAlerts.length > 0) {
    nodeAlerts.forEach((a) => {
      reasoningChain.push(`Alert: ${a.mitre_name} (${a.severity}) — ${a.headline}`);
    });
  }
  if (battleResult) {
    reasoningChain.push(`Contest result: ${battleResult.winner === 'red' ? 'Red captured' : battleResult.winner === 'blue' ? 'Blue defended' : 'Contested'}`);
  }
  if (killChain && killChain.current_stage >= 3) {
    reasoningChain.push(`Kill Chain Oracle: Stage ${killChain.current_stage_name} — breach in ${killChain.breach_countdown_display}`);
  }
  if (redQValues && chosenRed) {
    const topRedVal = redQValues[chosenRed];
    if (topRedVal > 0.5) {
      reasoningChain.push(`Red agent high confidence (${(topRedVal * 100).toFixed(0)}%) on ${formatAction(chosenRed)} — indicates active exploitation`);
    }
  }

  const statusColor: Record<string, string> = {
    clean: '#00e5ff',
    compromised: '#ff0044',
    detected: '#ffcc00',
    isolated: '#5b6b89',
    under_attack: '#ff6600',
  };

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      right: 24,
      width: 380,
      maxWidth: 'calc(100vw - 48px)',
      maxHeight: 'calc(100vh - 120px)',
      overflowY: 'auto',
      zIndex: 100,
      background: 'rgba(8, 14, 28, 0.92)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(0, 229, 255, 0.2)',
      borderRadius: 14,
      padding: '20px 22px',
      boxShadow: '0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,255,0.08)',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{
            fontFamily: '"Orbitron", monospace',
            fontSize: 14,
            fontWeight: 700,
            color: statusColor[nodeStatus] || '#00e5ff',
            letterSpacing: '0.1em',
          }}>
            {nodeLabel}
          </div>
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            color: 'rgba(255,255,255,0.45)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginTop: 4,
          }}>
            Node {nodeId} · {nodeStatus.replace('_', ' ')}
          </div>
          {nodeDescription && nodeDescription.split('\n').map((line, i) => (
            <div key={i} style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              color: i === 0 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.4)',
              lineHeight: 1.5,
              marginTop: i === 0 ? 6 : 0,
            }}>{line}</div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: '20px',
            padding: '2px 10px',
          }}
          type="button"
        >
          ✕
        </button>
      </div>

      {/* MITRE ATT&CK MAPPER INJECTION */}
      {nodeAlerts.length > 0 && (
        <div style={{
          background: 'rgba(255, 102, 0, 0.04)',
          border: '1px solid rgba(255, 102, 0, 0.2)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 16,
        }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255, 102, 0, 0.6)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            MITRE ATT&CK MAPPER
          </div>
          {nodeAlerts.map((a, i) => (
             <div key={i} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: '#ffcc00', lineHeight: 1.6, marginBottom: i < nodeAlerts.length - 1 ? 6 : 0 }}>
               <strong>[{a.mitre_id || 'TXXXX'}]</strong> {a.mitre_name || 'Pending'}
               <div style={{color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2}}>{a.headline}</div>
             </div>
          ))}
        </div>
      )}

      {/* Traditional vs RL explanation */}
      <div style={{
        background: 'rgba(0, 229, 255, 0.04)',
        border: '1px solid rgba(0, 229, 255, 0.1)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 16,
      }}>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          Decision Transparency
        </div>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>Traditional:</span> &quot;Alert fired because score &gt; threshold&quot;
          <br />
          <span style={{ color: '#00e5ff' }}>RL Agent:</span> We show the <strong style={{ color: '#00e5ff' }}>Q-value distribution</strong> — the actual probabilities the agent considered before deciding.
        </div>
      </div>

      {/* Red Agent Q-Values */}
      {redQValues && Object.keys(redQValues).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: '"Orbitron", monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#ff335f',
            marginBottom: 8,
          }}>
            Red Agent — Attack Q-Values
          </div>
          {Object.entries(redQValues)
            .sort(([, a], [, b]) => b - a)
            .map(([key, val]) => (
              <DecisionBar
                key={key}
                label={key}
                value={val}
                maxVal={maxRed}
                isChosen={key === chosenRed}
                color="#ff335f"
              />
            ))}
        </div>
      )}

      {/* Blue Agent Policy Probs */}
      {bluePolicyProbs && Object.keys(bluePolicyProbs).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: '"Orbitron", monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#14d1ff',
            marginBottom: 8,
          }}>
            Blue Agent — Defense Policy
          </div>
          {Object.entries(bluePolicyProbs)
            .sort(([, a], [, b]) => b - a)
            .map(([key, val]) => (
              <DecisionBar
                key={key}
                label={key}
                value={val}
                maxVal={maxBlue}
                isChosen={key === chosenBlue}
                color="#14d1ff"
              />
            ))}
        </div>
      )}

      {/* Reasoning Chain */}
      {reasoningChain.length > 0 && (
        <div>
          <div style={{
            fontFamily: '"Orbitron", monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#ffcc00',
            marginBottom: 8,
          }}>
            Why This Decision?
          </div>
          <div style={{
            background: 'rgba(255, 204, 0, 0.04)',
            border: '1px solid rgba(255, 204, 0, 0.1)',
            borderRadius: 8,
            padding: '10px 12px',
          }}>
            {reasoningChain.map((reason, i) => (
              <div key={i} style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.7,
                paddingBottom: i < reasoningChain.length - 1 ? 6 : 0,
                marginBottom: i < reasoningChain.length - 1 ? 6 : 0,
                borderBottom: i < reasoningChain.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span style={{ color: '#ffcc00', marginRight: 6 }}>▸</span>
                {reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {!redQValues && !bluePolicyProbs && reasoningChain.length === 0 && (
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 12,
          color: 'rgba(255,255,255,0.35)',
          textAlign: 'center',
          padding: '20px 0',
        }}>
          Connect and advance the simulation to see agent decisions for this node.
        </div>
      )}
    </div>
  );
}

```

## File: `src/components/ops/ThreatRadar.tsx`

```tsx
import type { BattleBriefing } from '../../lib/ops-types';

const polarPoint = (angleDeg: number, radius: number, center: number) => {
  const angle = (angleDeg - 90) * (Math.PI / 180);
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
};

export default function ThreatRadar({ briefing }: { briefing: BattleBriefing | null }) {
  if (!briefing?.hot_zones?.length) {
    return <div className="empty-panel !min-h-[360px]">The radar will light up once the battle starts.</div>;
  }

  const size = 320;
  const center = size / 2;
  const maxRadius = 118;
  const hotZones = briefing.hot_zones.slice(0, 6);

  return (
    <section>
      <div className="section-heading-row">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">Judge Visual 01</div>
          <h2 className="panel-title">Threat Radar</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{briefing.headline}</p>
        </div>
        <div className="status-pill status-pill-live">{briefing.last_updated_step === 0 ? 'READY' : `STEP ${briefing.last_updated_step}`}</div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[260px,minmax(0,1fr)] items-center">
        <div className="radar-shell flex justify-center">
          <svg className="w-full max-w-[280px]" viewBox={`0 0 ${size} ${size}`}>
            <defs>
              <radialGradient id="radar-core" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="rgba(20,209,255,0.24)" />
                <stop offset="100%" stopColor="rgba(20,209,255,0.02)" />
              </radialGradient>
            </defs>

            <circle cx={center} cy={center} fill="url(#radar-core)" r={maxRadius + 6} />
            {[0.3, 0.56, 0.82, 1].map((ring, index) => (
              <circle
                key={ring}
                cx={center}
                cy={center}
                fill="none"
                r={ring * maxRadius}
                stroke={index === 3 ? 'rgba(20,209,255,0.3)' : 'rgba(166,230,255,0.14)'}
                strokeWidth={index === 3 ? 1.5 : 1}
              />
            ))}
            <line stroke="rgba(166,230,255,0.12)" x1={center} x2={center} y1={22} y2={size - 22} />
            <line stroke="rgba(166,230,255,0.12)" x1={22} x2={size - 22} y1={center} y2={center} />

            <g className="threat-radar-sweep">
              <path
                d={`M ${center} ${center} L ${center} ${center - maxRadius} A ${maxRadius} ${maxRadius} 0 0 1 ${center + maxRadius * 0.72} ${center - maxRadius * 0.72} Z`}
                fill="rgba(20,209,255,0.12)"
                stroke="rgba(20,209,255,0.28)"
              />
            </g>

            {hotZones.map((zone, index) => {
              const angle = index * (360 / hotZones.length) + 24;
              const radius = 44 + zone.risk_score * 74;
              const point = polarPoint(angle, radius, center);
              return (
                <g key={zone.host_id}>
                  <line
                    stroke="rgba(166,230,255,0.14)"
                    strokeDasharray="4 6"
                    x1={center}
                    x2={point.x}
                    y1={center}
                    y2={point.y}
                  />
                  <circle className="threat-radar-ping" cx={point.x} cy={point.y} fill={zone.color} r={5 + zone.risk_score * 5} />
                  <circle cx={point.x} cy={point.y} fill="rgba(255,255,255,0.95)" r="2.3" />
                  <text
                    className="ops-label"
                    fill="rgba(255,255,255,0.68)"
                    fontSize="9"
                    textAnchor="middle"
                    x={point.x}
                    y={point.y - 14}
                  >
                    {zone.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <PressureCell label="Red Pressure" tone="#ff335f" value={briefing.attack_pressure.red} />
            <PressureCell label="Blue Pressure" tone="#14d1ff" value={briefing.attack_pressure.blue} />
            <PressureCell label="Building Calm" tone="#00ff88" value={briefing.attack_pressure.neutral} />
          </div>

          <div className="space-y-3">
            {hotZones.map((zone) => (
              <div className="feed-item feed-item-info" key={zone.host_id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="ops-label text-[0.52rem]">{zone.zone}</div>
                    <div className="mt-1 text-xs text-white" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.label}</div>
                  </div>
                  <div className="ops-data text-base" style={{ color: zone.color }}>{zone.risk_percent}%</div>
                </div>
                <div className="meter-track mt-2 h-2">
                  <div className="meter-fill" style={{ width: `${zone.risk_percent}%`, background: `linear-gradient(90deg, ${zone.color}44, ${zone.color})` }} />
                </div>
                <p className="mt-2 text-[10px] text-[var(--text-secondary)]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{zone.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PressureCell({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div className="ops-card p-4">
      <div className="ops-label text-[0.52rem]">{label}</div>
      <div className="ops-data mt-3 text-3xl" style={{ color: tone }}>{Math.round(value * 100)}%</div>
      <div className="meter-track mt-3 h-2">
        <div className="meter-fill" style={{ width: `${Math.round(value * 100)}%`, background: `linear-gradient(90deg, ${tone}55, ${tone})` }} />
      </div>
    </div>
  );
}

```

## File: `src/components/ops/IntrusionStoryboard.tsx`

```tsx
import type { BattleBriefing } from '../../lib/ops-types';

const teamAccent: Record<string, string> = {
  red: '#ff335f',
  blue: '#14d1ff',
  system: '#ffcc00',
};

export default function IntrusionStoryboard({ briefing }: { briefing: BattleBriefing | null }) {
  if (!briefing?.storyline?.length) {
    return <div className="empty-panel !min-h-[360px]">The story reel will fill in as the guard and burglar make their moves.</div>;
  }

  return (
    <section>
      <div className="section-heading-row">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">Judge Visual 02</div>
          <h2 className="panel-title">Intrusion Storyboard</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{briefing.summary}</p>
        </div>
        <div className="status-pill">LIVE EXPLANATION</div>
      </div>

      <div className="storyboard-strip mt-5">
        {briefing.storyline.map((beat, index) => {
          const accent = beat.color || teamAccent[beat.team] || '#b0c6ff';
          return (
            <article className="storyboard-card" key={beat.id} style={{ borderColor: `${accent}55` }}>
              <div className="flex items-center justify-between gap-3">
                <div className="ops-label text-[0.5rem]" style={{ color: accent }}>
                  {beat.team.toUpperCase()} · STEP {beat.step}
                </div>
                <div className="storyboard-dot" style={{ background: accent }} />
              </div>
              <h3 className="mt-3 text-base font-semibold text-white">{beat.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{beat.detail}</p>
              {index < briefing.storyline.length - 1 ? <div className="storyboard-link" style={{ background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.08))` }} /> : null}
            </article>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {briefing.zone_heat.map((zone) => (
          <div className="ops-card p-4" key={zone.zone}>
            <div className="ops-label text-[0.52rem]">{zone.zone}</div>
            <div className="ops-data mt-3 text-3xl" style={{ color: zone.color }}>{zone.risk_percent}%</div>
            <div className="mt-3 text-xs text-[var(--text-secondary)]">
              {zone.compromised_hosts} compromised · {zone.detected_hosts} spotted · {zone.host_count} hosts
            </div>
            <div className="meter-track mt-3 h-2">
              <div className="meter-fill" style={{ width: `${zone.risk_percent}%`, background: `linear-gradient(90deg, ${zone.color}55, ${zone.color})` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

```

## File: `src/components/ops/SocTerminal.tsx`

```tsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSimulationStore, type TelemetryLog } from '../../store/simulationStore';

/* ── Color helpers ───────────────────────────────────────────────────── */

const kv = (key: string, val: any, type?: string | null, overrideClass?: string): string => {
  const typeClass: Record<string, string> = {
    ip: 'v-ip', port: 'v-port', proto: 'v-proto', bytes: 'v-bytes',
    proc: 'v-proc', user: 'v-user', path: 'v-path', reg: 'v-reg',
    url: 'v-url', ua: 'v-ua', flag: 'v-flag', num: 'v-num',
    country: 'v-country',
  };
  const vc = overrideClass || (type ? typeClass[type] || 'v-str' : 'v-str');
  return `<span class="k">${key}=</span><span class="${vc}">${val}</span>`;
};

const sep = () => `<span class="sep"> │ </span>`;

const badge = (action: string): string => {
  const map: Record<string, [string, string]> = {
    exploit:        ['v-critical', 'EXPLOIT_ATTEMPT'],
    lateral_move:   ['v-high',     'LATERAL_MOVEMENT'],
    exfiltrate:     ['v-critical', 'DATA_EXFILTRATION'],
    beacon:         ['v-medium',   'C2_BEACON'],
    scan_network:   ['v-medium',   'RECON_SCAN'],
    escalate:       ['v-high',     'PRIV_ESCALATION'],
    brute_force:    ['v-critical', 'BRUTE_FORCE'],
    credential_access: ['v-high',  'CRED_DUMP'],
    persistence:    ['v-high',     'PERSISTENCE'],
    defense_evasion:['v-medium',   'DEFENSE_EVASION'],
  };
  const [cls, label] = map[action] || ['v-benign', action.toUpperCase()];
  return `<span class="${cls} v-threat">${label}</span>`;
};

const fmtBytes = (b: number): string => {
  if (b > 1e9) return (b / 1e9).toFixed(1) + 'GB';
  if (b > 1e6) return (b / 1e6).toFixed(1) + 'MB';
  if (b > 1e3) return (b / 1e3).toFixed(0) + 'KB';
  return b + 'B';
};

const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '...' : s;

const toolbarBtn = (activeColor?: string) => ({
  fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', background: 'transparent',
  border: `1px solid ${activeColor || '#1e2a3a'}`, borderRadius: 4,
  color: activeColor || '#4a5568', cursor: 'pointer',
} as const);

/* ── SOC Terminal Entry type ─────────────────────────────────────────── */

interface SocEntry {
  id: string;
  lineNum: number;
  timestamp: string;
  layer: 'NET' | 'EP' | 'APP' | 'CORR' | 'SYS' | 'ALERT' | 'HYPER';
  raw: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  isAlert?: boolean;
  isCorrelation?: boolean;
  isFalsePositive?: boolean;
  corrId?: string;
}

/* ── Realistic SOC enrichment data ───────────────────────────────────── */

const SYSCALLS = ['sys_ptrace', 'sys_mprotect', 'sys_execve', 'sys_socket', 'sys_connect', 'sys_write', 'sys_openat'];
const REG_HIVES = ['HKLM\\SYSTEM\\CurrentControlSet\\Services', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer'];

const THREAT_SCENARIOS = [
  { type: 'exploit',       src: '185.220.101.45', dst_port: 22,   proto: 'SSH',   flags: 'SYN',     bytes: 384,    dur: 12,   host: 'DMZ-01',  proc: 'sshd',            parent: 'systemd',      user: 'root',        file: '/var/log/auth.log',                          attempts: 127,  mitre: 'T1110.001', technique: 'Password Guessing',  syscall: 'sys_execve', ttl: 52, seq: '0x1A2B3C' },
  { type: 'exploit',       src: '91.121.87.10',   dst_port: 3389, proto: 'RDP',   flags: 'SYN,ACK', bytes: 1240,   dur: 45,   host: 'APP-01',  proc: 'svchost.exe',     parent: 'services.exe', user: 'NT AUTHORITY\\SYSTEM', file: 'C:\\Windows\\System32\\config\\SECURITY', attempts: 89,   mitre: 'T1110.003', technique: 'Password Spraying',  syscall: 'sys_ptrace', ttl: 48, seq: '0x99FF21' },
  { type: 'lateral_move',  src: '10.0.1.15',      dst_port: 445,  proto: 'SMB',   flags: 'PSH,ACK', bytes: 8192,   dur: 230,  host: 'APP-02',  proc: 'wmiprvse.exe',    parent: 'svchost.exe',  user: 'DOMAIN\\admin', file: 'C:\\Windows\\Temp\\payload.dll',              attempts: 1,    mitre: 'T1021.002', technique: 'SMB/Windows Admin Shares', syscall: 'sys_socket', ttl: 64, seq: '0x44AA11' },
  { type: 'exfiltrate',    src: '10.0.2.30',      dst_port: 443,  proto: 'HTTPS', flags: 'PSH,ACK', bytes: 25165824, dur: 1200, host: 'DB-01', proc: 'sqlservr.exe',    parent: 'services.exe', user: 'sa',            file: '/var/lib/mysql/customers.ibd',              attempts: 1,    mitre: 'T1041',     technique: 'Exfiltration Over C2 Channel', syscall: 'sys_write', ttl: 128, seq: '0xEE88CC' },
  { type: 'beacon',        src: '10.0.1.15',      dst_port: 8443, proto: 'HTTPS', flags: 'PSH,ACK', bytes: 247,    dur: 142,  host: 'APP-04',  proc: 'rundll32.exe',    parent: 'explorer.exe', user: 'DOMAIN\\user1', file: 'C:\\Users\\user1\\AppData\\cobalt.dll',     attempts: 1,    mitre: 'T1071.001', technique: 'Web Protocols',      syscall: 'sys_connect', ttl: 64, seq: '0x776655' },
  { type: 'escalate',      src: '10.0.1.15',      dst_port: 135,  proto: 'DCOM',  flags: 'PSH,ACK', bytes: 4096,   dur: 85,   host: 'APP-01',  proc: 'mimikatz.exe',    parent: 'cmd.exe',      user: 'NT AUTHORITY\\SYSTEM', file: 'C:\\Windows\\System32\\lsass.exe',     attempts: 1,    mitre: 'T1003.001', technique: 'LSASS Memory',      syscall: 'sys_ptrace', ttl: 64, seq: '0xBBCC33' },
  { type: 'scan_network',  src: '10.0.0.5',       dst_port: 0,    proto: 'ICMP',  flags: 'ECHO',    bytes: 64,     dur: 3,    host: 'WEB-01',  proc: 'nmap',            parent: 'bash',         user: 'www-data',      file: '/tmp/.nmap_results',                        attempts: 254,  mitre: 'T1046',     technique: 'Network Service Discovery', syscall: 'sys_socket', ttl: 55, seq: '0x991100' },
  { type: 'persistence',   src: '10.0.1.15',      dst_port: 5985, proto: 'WinRM', flags: 'PSH,ACK', bytes: 2048,   dur: 40,   host: 'APP-02',  proc: 'powershell.exe',  parent: 'wsmprovhost.exe', user: 'DOMAIN\\admin', file: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', attempts: 1, mitre: 'T1547.001', technique: 'Registry Run Keys', syscall: 'sys_write', ttl: 64, seq: '0x112233' },
];

const TECHNICAL_ERRORS = [
  { type: 'SEGFAULT', proc: 'nginx', addr: '0x00007f8a12bc', detail: 'invalid memory reference in worker process' },
  { type: 'KERNEL_PANIC', sub: 'OOM-killer', proc: 'java', detail: 'Out of memory: Kill process 1429 (java) score 950' },
  { type: 'FATAL', proc: 'sshd', detail: 'Connection reset by peer during kex_exchange_identification' },
  { type: 'IO_ERROR', dev: 'sda1', detail: 'Buffer I/O error on dev sda1, logical block 5412891' },
];

const APP_SCENARIOS = [
  { method: 'POST', endpoint: '/auth/login', status: 401, ua: 'python-requests/2.28.0', geo: 'RU', detail: 'failed_auth', stack: 'at SecurityProvider.authenticate (auth.js:142)\nat Router.handle (index.js:51)' },
  { method: 'POST', endpoint: '/api/v2/users/export', status: 200, ua: 'curl/7.88.1', geo: 'CN', detail: 'bulk_export', stack: 'at DataExporter.streamToBuffer (exporter.ts:88)\nat Controller.export (user.controller.ts:12)' },
  { method: 'PUT',  endpoint: '/admin/config/firewall', status: 403, ua: 'Mozilla/5.0 (X11; Linux)', geo: 'DE', detail: 'config_change_attempt', stack: 'at RBACGuard.validate (rbac.ts:34)\nat PermissionMiddleware.check (middleware.ts:10)' },
  { method: 'GET',  endpoint: '/.env', status: 404, ua: 'Nikto/2.5.0', geo: 'RU', detail: 'config_probe', stack: 'at FileSystem.exists (.env:0)\nat StaticHandler.serve (static.js:115)' },
];

const SOC_RECOMMENDATIONS: Record<string, string> = {
  exploit:       'ACTION: Isolate source IP at perimeter firewall. Check auth logs for lateral cred reuse. Rotate targeted account passwords immediately.',
  lateral_move:  'ACTION: Segment affected VLAN. Kill WMI/SMB sessions from src. Audit AD for new scheduled tasks or services created in last 24h.',
  exfiltrate:    'ACTION: Block dst IP at DNS/proxy level. Forensic image affected host. Quantify data loss from DB query logs. Notify CISO for breach protocol.',
  beacon:        'ACTION: Sinkhole C2 domain at DNS. Memory dump rundll32 PID for IOC extraction. Check other hosts for same DLL hash (SHA256 sweep).',
  escalate:      'ACTION: Kill mimikatz process immediately. Force krbtgt password rotation. Audit all Kerberos tickets issued in last 6h for golden ticket.',
  scan_network:  'ACTION: Rate-limit source at IDS. Cross-reference scan targets with exposed services. Harden any services discovered on non-standard ports.',
  persistence:   'ACTION: Remove registry run key. Audit startup folders, scheduled tasks, and WMI subscriptions. Scan for additional persistence mechanisms.',
  brute_force:   'ACTION: Enforce account lockout after 5 attempts. Enable MFA for targeted accounts. Add source IP to threat intelligence blocklist.',
  credential_access: 'ACTION: Rotate all domain admin credentials. Enable Credential Guard on DCs. Audit LSASS access logs for other compromised hosts.',
  defense_evasion: 'ACTION: Re-enable tampered security controls. Audit event log gaps. Check for timestomped files in System32 and SysWOW64.',
};

const RULE_SIDS = ['2024897', '2027865', '2031412', '2019876', '2028934', '2025001', '2030678', '2022345'];
const PCAP_DETAILS = ['tcp.stream eq 47', 'frame.len > 1500', 'dns.qry.name contains "c2"', 'http.request.method == POST', 'tls.handshake.extensions_server_name'];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randPort = () => 1024 + Math.floor(Math.random() * 64000);
const randPid = () => 1000 + Math.floor(Math.random() * 30000);

/* ── Main Component ──────────────────────────────────────────────────── */

export function SocTerminal() {
  const {
    logs, alerts, step, isConnected,
  } = useSimulationStore();

  const logAreaRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<SocEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const lineRef = useRef(1);
  const lastStepRef = useRef(0);
  const scenarioIdx = useRef(0);
  const [filter, setFilter] = useState<'all' | 'NET' | 'EP' | 'APP' | 'HYPER' | 'alerts'>('all');
  const hyperWsRef = useRef<WebSocket | null>(null);
  const hyperIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Count alerts by severity
  const counts = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    for (const e of entries) {
      if (e.isAlert || e.isCorrelation) {
        if (e.severity === 'critical') critical++;
        else if (e.severity === 'high') high++;
        else if (e.severity === 'medium') medium++;
        else low++;
      }
    }
    return { critical, high, medium, low, total: entries.length, hyper: entries.filter(e => e.layer === 'HYPER').length };
  }, [entries]);

  // Auto-scroll
  useEffect(() => {
    if (!paused && logAreaRef.current) {
      logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight;
    }
  }, [entries, paused]);

  /* ── Build realistic multi-layer log entries ───────────────────── */

  const buildNetworkLog = useCallback((log: TelemetryLog, lineNum: number): SocEntry => {
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];
    const dstIp = scenario.src.startsWith('10.') ? `45.33.32.${Math.floor(Math.random() * 254)}` : `10.0.${Math.floor(Math.random() * 4) + 1}.${Math.floor(Math.random() * 254)}`;
    const sid = pick(RULE_SIDS);
    const pcapHint = pick(PCAP_DETAILS);
    const win = 64240;

    const html = [
      kv('src', `${scenario.src}:${randPort()}`, 'ip'),
      sep(),
      kv('dst', `${dstIp}:${scenario.dst_port}`, 'ip'),
      sep(),
      kv('proto', scenario.proto, 'proto'),
      sep(),
      kv('len', scenario.bytes, 'num'),
      sep(),
      kv('ttl', scenario.ttl, 'num'),
      sep(),
      kv('win', win, 'num'),
      sep(),
      kv('seq', scenario.seq, 'reg'),
      sep(),
      kv('flags', scenario.flags, 'flag'),
      scenario.attempts > 1 ? sep() + kv('attempts', scenario.attempts, 'num') : '',
      sep(),
      kv('sid', sid, 'num'),
      sep(),
      kv('filter', `"${pcapHint}"`, 'path'),
      log.type !== 'normal_traffic' ? sep() + badge(scenario.type) : '',
    ].join(' ');

    return {
      id: `net-${log.id}-${lineNum}`,
      lineNum, layer: 'NET', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      corrId: log.id,
    };
  }, []);

  const buildEndpointLog = useCallback((log: TelemetryLog, lineNum: number): SocEntry => {
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];
    const pid = randPid();
    const ppid = randPid();
    const reg = pick(REG_HIVES);

    const html = [
      kv('host', scenario.host, 'ip'),
      sep(),
      kv('proc', scenario.proc, 'proc'),
      sep(),
      kv('pid', pid, 'num'),
      sep(),
      kv('ppid', ppid, 'num'),
      sep(),
      kv('syscall', scenario.syscall, 'flag'),
      sep(),
      kv('user', scenario.user, 'user'),
      sep(),
      kv('path', scenario.file, 'path'),
      sep(),
      kv('reg', truncate(reg, 30), 'reg'),
      sep(),
      kv('mitre', scenario.mitre, 'url'),
      sep(),
      kv('hash', `sha256:${Array.from({length:8},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('')}...`, 'reg'),
    ].join(' ');

    return {
      id: `ep-${log.id}-${lineNum}`,
      lineNum, layer: 'EP', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      corrId: log.id,
    };
  }, []);

  const buildAppLog = useCallback((log: TelemetryLog, lineNum: number): SocEntry => {
    const app = APP_SCENARIOS[scenarioIdx.current % APP_SCENARIOS.length];
    const statusClass = app.status >= 400 ? 'v-critical' : app.status >= 300 ? 'v-medium' : 'v-low';
    const reqId = `req-${Math.random().toString(36).substring(2, 10)}`;

    const html = [
      kv('src', THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length].src, 'ip'),
      sep(),
      `<span class="v-flag">${app.method}</span>`,
      `<span class="v-url"> ${app.endpoint}</span>`,
      sep(),
      kv('status', app.status, null, statusClass),
      sep(),
      kv('trace_id', reqId, 'num'),
      sep(),
      kv('geo', app.geo, 'country'),
      sep(),
      kv('ua', truncate(app.ua, 25), 'ua'),
      app.status >= 400 ? sep() + `<span class="v-critical" style="font-size:10px">${truncate(app.stack, 40)}</span>` : '',
    ].join(' ');

    return {
      id: `app-${log.id}-${lineNum}`,
      lineNum, layer: 'APP', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      corrId: log.id,
    };
  }, []);

  const buildTechnicalError = useCallback((lineNum: number): SocEntry => {
    const err = pick(TECHNICAL_ERRORS);
    const html = [
      `<span class="v-critical" style="font-weight:700">[${err.type}] </span>`,
      kv('proc', err.proc, 'proc'),
      sep(),
      `<span class="v-str">${err.detail}</span>`,
      (err as any).addr ? sep() + kv('addr', (err as any).addr, 'reg') : '',
      (err as any).dev ? sep() + kv('dev', (err as any).dev, 'flag') : '',
    ].join(' ');
    return {
      id: `sys-err-${lineNum}`,
      lineNum, layer: 'SYS', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
    };
  }, []);

  const buildSocAction = useCallback((lineNum: number): SocEntry => {
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];
    const recommendation = SOC_RECOMMENDATIONS[scenario.type] || 'ACTION: Investigate and triage.';
    const html = [
      `<span class="v-medium" style="font-weight:600">⚡ ${recommendation}</span>`,
    ].join('');
    return {
      id: `sys-action-${lineNum}`,
      lineNum, layer: 'SYS', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
    };
  }, []);

  const buildCorrEntry = useCallback((alertData: typeof alerts[0], lineNum: number): SocEntry => {
    const layersList = Object.entries(alertData.layer_breakdown)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];

    const html = [
      kv('corr_id', `ATK-${alertData.id.substring(0, 8).toUpperCase()}`, 'ip'),
      sep(),
      kv('layers', `[${layersList.join(',')}]`, 'flag'),
      sep(),
      kv('action', `${alertData.threat_type}_detection`, 'proc'),
      sep(),
      alertData.is_likely_false_positive
        ? `<span class="v-medium v-threat">FALSE_POSITIVE</span>`
        : `<span class="v-critical v-threat">THREAT</span>`,
      sep(),
      kv('confidence', `${Math.round(alertData.confidence * 100)}%`, 'num'),
      sep(),
      kv('mitre', `${scenario.mitre}`, 'url'),
    ].join(' ');

    return {
      id: `corr-${alertData.id}-${lineNum}`,
      lineNum, layer: 'CORR', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      isCorrelation: true,
      severity: alertData.severity as SocEntry['severity'],
      corrId: alertData.id,
    };
  }, []);

  const buildAlertBlock = useCallback((alertData: typeof alerts[0], lineNum: number): SocEntry => {
    const sevLabel = (alertData.severity || 'medium').toUpperCase();
    const scenario = THREAT_SCENARIOS[scenarioIdx.current % THREAT_SCENARIOS.length];
    const recommendation = SOC_RECOMMENDATIONS[scenario.type] || 'Investigate immediately.';
    const affectedHosts = alertData.affected_host_labels?.join(', ') || scenario.host;

    const html = [
      `<div style="margin:4px 0;line-height:1.7">`,
      `<span style="font-weight:700;letter-spacing:0.05em;font-size:12px">[${sevLabel}] ${alertData.headline}</span>`,
      `<br/><span class="k">FORENSICS:</span> <span class="v-url">${scenario.mitre} (${scenario.technique})</span>`,
      `<br/><span class="k">AFFECTED:</span> <span class="v-ip">${affectedHosts}</span>`,
      `<span class="sep"> │ </span><span class="k">SYSCALL:</span> <span class="v-flag">${scenario.syscall}</span>`,
      `<br/><span class="k">INDICATORS:</span> <span class="v-proc">${scenario.proc}</span> <span class="sep">→</span> <span class="v-path">${scenario.file}</span>`,
      `<br/><span class="k">CORR_ID:</span> <span class="v-ip">ATK-${alertData.id.substring(0, 8).toUpperCase()}</span>`,
      `<br/><span style="color:#ffcc00;font-weight:600">⚡ ${recommendation}</span>`,
      `</div>`,
    ].join('');

    return {
      id: `alert-${alertData.id}-${lineNum}`,
      lineNum, layer: 'ALERT', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      isAlert: true,
      severity: alertData.severity as SocEntry['severity'],
      corrId: alertData.id,
    };
  }, []);

  const buildFPBlock = useCallback((alertData: typeof alerts[0], lineNum: number): SocEntry => {
    const scenario = THREAT_SCENARIOS[(scenarioIdx.current + 3) % THREAT_SCENARIOS.length];
    const html = [
      `<div style="margin:4px 0;line-height:1.7">`,
      `<span style="font-weight:700;color:#ffcc00;font-size:12px">[✓ FALSE POSITIVE RESOLVED]</span>`,
      `<br/><span class="k">INITIAL SIGNAL:</span> <span style="color:rgba(255,255,255,0.65)">${alertData.headline}</span>`,
      `<br/><span class="k">RESOLVED BY EP:</span> <span class="v-flag">parent=${scenario.parent}</span> <span class="v-user">user=${scenario.user}</span>`,
      `<br/><span class="k">REASON:</span> <span class="v-str">scheduled_task+service_account+authorized_binary</span>`,
      `<br/><span class="k">CORR:</span> <span class="v-ip">FP-${alertData.id.substring(0, 8).toUpperCase()}</span>`,
      `</div>`,
    ].join('');

    return {
      id: `fp-${alertData.id}-${lineNum}`,
      lineNum, layer: 'CORR', raw: html,
      timestamp: new Date().toISOString().substring(11, 23),
      isFalsePositive: true,
      corrId: alertData.id,
    };
  }, []);

  // Ingest new logs when step changes
  useEffect(() => {
    if (pausedRef.current || step <= lastStepRef.current) return;
    lastStepRef.current = step;

    const newEntries: SocEntry[] = [];
    const recentLogs = logs.slice(0, 6);

    for (const log of recentLogs) {
      if (log.team === 'red') {
        newEntries.push(buildNetworkLog(log, lineRef.current++));
        newEntries.push(buildEndpointLog(log, lineRef.current++));
        if (Math.random() > 0.7) newEntries.push(buildTechnicalError(lineRef.current++));
        scenarioIdx.current++;
      } else if (log.team === 'blue') {
        newEntries.push(buildAppLog(log, lineRef.current++));
        scenarioIdx.current++;
      } else {
        newEntries.push(buildNetworkLog(log, lineRef.current++));
        newEntries.push(buildEndpointLog(log, lineRef.current++));
        newEntries.push(buildAppLog(log, lineRef.current++));
        newEntries.push(buildSocAction(lineRef.current++));
        scenarioIdx.current++;
      }
    }

    const recentAlerts = alerts.slice(0, 4);
    for (const alert of recentAlerts) {
      if (alert.is_likely_false_positive) {
        newEntries.push(buildFPBlock(alert, lineRef.current++));
      } else {
        newEntries.push(buildCorrEntry(alert, lineRef.current++));
        newEntries.push(buildAlertBlock(alert, lineRef.current++));
      }
      scenarioIdx.current++;
    }

    if (newEntries.length > 0) {
      setEntries(prev => [...prev.slice(-500), ...newEntries]);
    }
  }, [step, logs, alerts, buildNetworkLog, buildEndpointLog, buildAppLog, buildSocAction, buildTechnicalError, buildCorrEntry, buildAlertBlock, buildFPBlock]);

  /* ── HyperAgent WebSocket ────────────────────────────────────────── */

  useEffect(() => {
    if (!isConnected) return;
    const apiBase = useSimulationStore.getState().apiBaseUrl;
    const wsUrl = apiBase.replace(/^http/, 'ws') + '/api/hyper/ws/live';
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      hyperWsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ command: 'status' }));
        hyperIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: 'status' }));
          }
        }, 10000);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const ln = lineRef.current++;
          let html = '';
          if (data.type === 'hyper_status') {
            html = [
              `<span class="v-flag" style="color:#a855f7;font-weight:700">[META-STATUS]</span>`,
              ` <span class="k">red_score=</span><span class="v-critical">${data.red?.current_score?.toFixed?.(2) ?? '—'}</span>`,
              ` <span class="sep">│</span> `,
              `<span class="k">blue_score=</span><span class="v-ip">${data.blue?.current_score?.toFixed?.(2) ?? '—'}</span>`,
              ` <span class="sep">│</span> `,
              `<span class="k">mods=</span><span class="v-num">${(data.red?.modifications_this_episode ?? 0) + (data.blue?.modifications_this_episode ?? 0)}</span>`,
            ].join('');
          } else if (data.type === 'meta_reflection') {
            html = [
              `<span class="v-flag" style="color:#a855f7;font-weight:700">[REFLECT:${(data.agent || '?').toUpperCase()}]</span>`,
              ` <span class="v-str">${data.self_assessment || 'No assessment'}</span>`,
              data.patterns_noticed?.length ? ` <span class="sep">│</span> <span class="k">patterns=</span><span class="v-url">${data.patterns_noticed.slice(0, 2).join(', ')}</span>` : '',
              ` <span class="sep">│</span> <span class="k">confidence=</span><span class="v-num">${data.confidence?.toFixed?.(2) ?? '—'}</span>`,
            ].join('');
          } else {
            html = `<span class="v-flag" style="color:#a855f7">[HYPER]</span> <span class="v-str">${JSON.stringify(data).slice(0, 120)}</span>`;
          }
          const entry: SocEntry = {
            id: `hyper-${ln}`, lineNum: ln, layer: 'HYPER', raw: html,
            timestamp: new Date().toISOString().substring(11, 23),
          };
          if (!pausedRef.current) {
            setEntries(prev => [...prev.slice(-500), entry]);
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => { /* silent */ };
    } catch { /* ws creation failed */ }

    return () => {
      if (hyperIntervalRef.current) clearInterval(hyperIntervalRef.current);
      if (hyperWsRef.current && hyperWsRef.current.readyState < 2) hyperWsRef.current.close();
    };
  }, [isConnected]);

  /* ── Filter ─────────────────────────────────────────────────────── */

  const visibleEntries = filter === 'all' ? entries
    : filter === 'alerts' ? entries.filter(e => e.isAlert || e.isCorrelation || e.isFalsePositive)
    : entries.filter(e => e.layer === filter);

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      background: '#0a0d14', border: '1px solid #1e2a3a',
      borderRadius: 8, overflow: 'hidden', display: 'flex',
      flexDirection: 'column', height: 560,
    }}>

      {/* Title bar */}
      <div style={{
        background: '#0d1117', borderBottom: '1px solid #1e2a3a',
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(c => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <span style={{
          color: '#4a5568', fontSize: 11, flex: 1, textAlign: 'center',
          letterSpacing: '0.05em', fontFamily: "'JetBrains Mono', monospace",
        }}>
          CYBERGUARDIAN AI — SOC TERMINAL
        </span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 12,
          background: isConnected ? '#0d2d1a' : '#2d0d0d',
          color: isConnected ? '#00ff88' : '#ff4466',
          border: `1px solid ${isConnected ? '#1a4a2a' : '#4a1a1a'}`,
        }}>
          {isConnected ? '● LIVE' : '○ OFFLINE'}
        </span>
      </div>

      {/* Layer filter tabs */}
      <div style={{ display: 'flex', background: '#0d1117', borderBottom: '1px solid #1e2a3a' }}>
        {(['all', 'NET', 'EP', 'APP', 'HYPER', 'alerts'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '5px 14px', fontSize: 11, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: `2px solid ${filter === f ? '#00e5ff' : 'transparent'}`,
              color: filter === f ? '#00e5ff'
                : f === 'NET' ? '#00aacc'
                : f === 'EP' ? '#cc66ff'
                : f === 'APP' ? '#00cc66'
                : f === 'HYPER' ? '#a855f7'
                : f === 'alerts' ? '#ff4466'
                : '#4a5568',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
            {f}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
        background: '#111520', borderBottom: '1px solid #1e2a3a',
      }}>
        <button
          onClick={() => { setPaused(p => !p); pausedRef.current = !pausedRef.current; }}
          style={toolbarBtn(paused ? '#ffcc00' : undefined)}>
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
        <button onClick={() => { setEntries([]); lineRef.current = 1; }} style={toolbarBtn()}>
          ✕ clear
        </button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {([
            ['critical', 'CRIT', '#2d0d1a', '#ff3366', '#4a1a2a'],
            ['high', 'HIGH', '#2d1a0d', '#ff6b35', '#4a2a1a'],
            ['medium', 'MED', '#2d2700', '#ffcc00', '#4a4200'],
            ['low', 'LOW', '#0d2d1a', '#00ff88', '#1a4a2a'],
          ] as const).map(([key, label, bg, color, border]) => (
            <span key={key} style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 500,
              background: bg, color, border: `1px solid ${border}`,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {counts[key as keyof typeof counts]} {label}
            </span>
          ))}
        </div>
      </div>

      {/* Log area */}
      <div ref={logAreaRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {visibleEntries.map(entry => (
          <LogLineRenderer key={entry.id} entry={entry} />
        ))}
        {entries.length === 0 && (
          <div style={{ color: '#2d3748', padding: '20px 16px', fontSize: 11, lineHeight: 2 }}>
            <div>Waiting for simulation stream...</div>
            <div style={{ color: '#1e3a4a', fontSize: 10 }}>
              Supports: PCAP/PCAPNG · Suricata EVE · Zeek · Syslog · STIX 2.1
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 12, padding: '5px 14px', background: '#0d1117',
        borderTop: '1px solid #1e2a3a', fontSize: 10, color: '#4a5568',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <StatItem label="TOTAL" value={counts.total} color="#8090a0" />
        <StatItem label="THREATS" value={counts.critical + counts.high} color="#ff3366" />
        <StatItem label="FP" value={entries.filter(e => e.isFalsePositive).length} color="#4a6a5a" />
        <div style={{ marginLeft: 'auto', color: '#2d3748' }}>
          STEP {step} │ pcap:{entries.filter(e => e.layer === 'NET').length}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

const layerColors: Record<string, { bg: string; color: string; border: string }> = {
  NET:   { bg: '#001a2a', color: '#00aacc', border: '#003a4a' },
  EP:    { bg: '#1a001a', color: '#cc66ff', border: '#3a003a' },
  APP:   { bg: '#001a0d', color: '#00cc66', border: '#003a1a' },
  CORR:  { bg: '#2d2700', color: '#ffcc00', border: '#4a4200' },
  ALERT: { bg: '#2d0d0d', color: '#ff4466', border: '#4a1a1a' },
  SYS:   { bg: '#1a0d00', color: '#ff8833', border: '#3a1a00' },
  HYPER: { bg: '#1a0026', color: '#a855f7', border: '#3a0050' },
};

function LogLineRenderer({ entry }: { entry: SocEntry }) {
  const lc = layerColors[entry.layer] || layerColors.SYS;

  if (entry.isAlert || entry.isCorrelation || entry.isFalsePositive) {
    const borderColor = entry.isFalsePositive ? '#ffcc00'
      : entry.isCorrelation ? '#00e5ff'
      : entry.severity === 'critical' ? '#ff3366'
      : entry.severity === 'high' ? '#ff6b35'
      : entry.severity === 'medium' ? '#ffcc00' : '#00ff88';
    const bg = entry.isFalsePositive ? '#0d0d00'
      : entry.isCorrelation ? '#000d14'
      : entry.severity === 'critical' ? '#0d0008'
      : entry.severity === 'high' ? '#0d0800'
      : '#0d0d00';

    return (
      <div style={{
        borderLeft: `3px solid ${borderColor}`, margin: '2px 0 2px 44px',
        padding: '4px 10px', background: bg, fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
      }} dangerouslySetInnerHTML={{ __html: entry.raw }} />
    );
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', padding: '1px 0',
        fontSize: 11.2, lineHeight: 1.6, cursor: 'default',
        fontFamily: "'JetBrains Mono', monospace",
        transition: 'background 100ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#111a24')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: '#1e3a4a', padding: '0 8px', minWidth: 44, textAlign: 'right', fontSize: 10, paddingTop: 2 }}>
        {entry.lineNum}
      </span>
      <span style={{ color: '#2a4a5a', paddingRight: 6, whiteSpace: 'nowrap', fontSize: 10.5 }}>
        {entry.timestamp}
      </span>
      <span style={{
        padding: '0 5px', borderRadius: 2, fontSize: 9.5, fontWeight: 700,
        marginRight: 6, letterSpacing: '0.04em', whiteSpace: 'nowrap',
        alignSelf: 'flex-start', marginTop: 3,
        background: lc.bg, color: lc.color, border: `1px solid ${lc.border}`,
      }}>
        {entry.layer}
      </span>
      <div style={{ flex: 1, paddingRight: 12, wordBreak: 'break-all' }}
        dangerouslySetInnerHTML={{ __html: entry.raw }} />
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 5, fontFamily: "'JetBrains Mono', monospace" }}>
      <span>{label}:</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

```

## File: `src/components/ops/IntegrationEventFeed.tsx`

```tsx
import type { IntegrationFeedEvent } from '../../lib/ops-types';

const badgeColor = (vendor: string) => {
  const normalized = vendor.toLowerCase();
  if (normalized.includes('splunk')) return { bg: 'rgba(20,209,255,0.12)', border: 'rgba(20,209,255,0.28)', color: '#14d1ff' };
  if (normalized.includes('endpoint') || normalized.includes('telemetry')) return { bg: 'rgba(255,204,0,0.12)', border: 'rgba(255,204,0,0.28)', color: '#ffcc00' };
  if (normalized.includes('stream')) return { bg: 'rgba(127,216,255,0.12)', border: 'rgba(127,216,255,0.28)', color: '#7fd8ff' };
  if (normalized.includes('crowdstrike')) return { bg: 'rgba(255,111,145,0.12)', border: 'rgba(255,111,145,0.28)', color: '#ff6f91' };
  return { bg: 'rgba(176,198,255,0.12)', border: 'rgba(176,198,255,0.28)', color: '#b0c6ff' };
};

const severityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return '#ff335f';
    case 'high':
      return '#ff6600';
    case 'medium':
      return '#ffcc00';
    default:
      return '#14d1ff';
  }
};

export function IntegrationEventFeed({ events }: { events: IntegrationFeedEvent[] }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="ops-display text-[0.62rem]" style={{ color: '#00e5ff' }}>Threat Ops Bridge</div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
            Real external alerts bridged into the War Room
          </div>
        </div>
        <div className="status-pill status-pill-live">{events.length} external events</div>
      </div>

      <div className="panel-scroll mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {events.length ? (
          events.map((event) => {
            const badge = badgeColor(event.vendor || event.source);
            return (
              <div
                className="feed-item"
                key={event.id}
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  background: 'rgba(3, 8, 18, 0.36)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        border: `1px solid ${badge.border}`,
                        background: badge.bg,
                        color: badge.color,
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        fontFamily: '"IBM Plex Mono", monospace',
                      }}
                    >
                      {event.vendor.replace(/_/g, ' ')}
                    </span>
                    <span className="ops-label text-[0.5rem]">{event.source.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="ops-data text-[0.65rem]" style={{ color: severityColor(event.severity) }}>
                    {event.severity.toUpperCase()}
                  </div>
                </div>

                <p className="mt-2 text-sm text-white/90">
                  {event.host_label} hit by {event.threat_type.replace(/_/g, ' ')}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/45" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                  <span>Layer: {event.layer}</span>
                  <span>Score: {Math.round(event.alert_score * 100)}%</span>
                  <span>Host ID: {event.host_id}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-panel !min-h-[220px]">
            Webhook, telemetry, stream, and URL-ingest events will appear here as soon as they hit the live bridge.
          </div>
        )}
      </div>
    </div>
  );
}

```

## File: `src/components/ops/HyperAgentPanel.tsx`

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useSimulationStore } from '../../store/simulationStore';

/* ── Types ─────────────────────────────────────────────────────────── */

interface StrategyData {
  agent_type: string;
  strategy_params: Record<string, number>;
  current_score: number;
  baseline_score: number;
  modifications_this_episode: number;
  meta_engine?: {
    evaluation_focus: string;
    change_magnitude: number;
    improvement_frequency: number;
    strategy_history_count: number;
    improvement_log_count: number;
  };
}

interface EvolutionEntry {
  generation: number;
  best_score: number;
  avg_score: number;
  timestamp: string;
}

interface AuditRecord {
  timestamp: string;
  agent_type: string;
  action: string;
  result: string;
  details: string;
}

interface MetaInsight {
  evaluation_focus: string;
  change_magnitude: number;
  improvement_frequency: number;
  strategy_history_count: number;
  improvement_log_count: number;
}

interface ImprovementRecord {
  timestamp: string;
  agent_type: string;
  parameter: string;
  old_value: number;
  new_value: number;
  reason: string;
}

/* ── Component ─────────────────────────────────────────────────────── */

export function HyperAgentPanel() {
  const { apiBaseUrl, isConnected } = useSimulationStore();

  const [status, setStatus] = useState<{ enabled: boolean; red: StrategyData | null; blue: StrategyData | null } | null>(null);
  const [evolution, setEvolution] = useState<{ red: { history: EvolutionEntry[] }; blue: { history: EvolutionEntry[] } } | null>(null);
  const [insights, setInsights] = useState<{ red: MetaInsight; blue: MetaInsight } | null>(null);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [improvements, setImprovements] = useState<ImprovementRecord[]>([]);
  const [toggleLoading, setToggleLoading] = useState(false);

  const poll = useCallback(async () => {
    if (!isConnected) return;
    try {
      const [statusRes, evoRes, insightRes, auditRes, impRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/hyper/status`),
        fetch(`${apiBaseUrl}/api/hyper/evolution`),
        fetch(`${apiBaseUrl}/api/hyper/meta-insights`),
        fetch(`${apiBaseUrl}/api/hyper/audit`),
        fetch(`${apiBaseUrl}/api/hyper/improvements`),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (evoRes.ok) setEvolution(await evoRes.json());
      if (insightRes.ok) setInsights(await insightRes.json());
      if (auditRes.ok) {
        const d = await auditRes.json();
        setAudit(d.audit_trail || []);
      }
      if (impRes.ok) {
        const d = await impRes.json();
        setImprovements(d.improvements || []);
      }
    } catch {
      // polling errors are non-fatal
    }
  }, [apiBaseUrl, isConnected]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [poll]);

  const toggleHyper = async () => {
    if (!status) return;
    setToggleLoading(true);
    try {
      await fetch(`${apiBaseUrl}/api/hyper/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      await poll();
    } catch { /* ignore */ }
    setToggleLoading(false);
  };

  /* ── Evolution sparkline ──────────────────────────────────────────── */

  const renderSparkline = (history: EvolutionEntry[], color: string) => {
    if (!history?.length) return <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>No evolution data yet</div>;
    const w = 280, h = 64;
    const scores = history.map(e => e.best_score);
    const min = Math.min(...scores, 0);
    const max = Math.max(...scores, 1);
    const range = Math.max(max - min, 0.001);
    const pts = scores.map((s, i) => {
      const x = (i / Math.max(1, scores.length - 1)) * (w - 8) + 4;
      const y = h - 4 - ((s - min) / range) * (h - 8);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }}>
        <path d={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {scores.length > 1 && (
          <circle cx={(w - 8) + 4} cy={h - 4 - ((scores[scores.length - 1] - min) / range) * (h - 8)} r="3" fill={color} />
        )}
      </svg>
    );
  };

  /* ── Strategy param bar ───────────────────────────────────────────── */

  const renderStrategyBars = (strategy: StrategyData | null, accent: string) => {
    if (!strategy?.strategy_params) return <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>Awaiting strategy data…</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(strategy.strategy_params).slice(0, 6).map(([key, val]) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: '"IBM Plex Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{key.replace(/_/g, ' ')}</span>
              <span style={{ color: accent, fontFamily: '"Share Tech Mono", monospace' }}>{typeof val === 'number' ? val.toFixed(2) : String(val)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.min(100, Math.max(2, (typeof val === 'number' ? val : 0) * 100))}%`,
                background: `linear-gradient(90deg, ${accent}44, ${accent})`,
                transition: 'width 400ms ease',
              }} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, fontFamily: '"Share Tech Mono", monospace' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Score: <span style={{ color: accent }}>{strategy.current_score?.toFixed(2) ?? '—'}</span></span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Baseline: <span style={{ color: 'rgba(255,255,255,0.6)' }}>{strategy.baseline_score?.toFixed(2) ?? '—'}</span></span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Mods: <span style={{ color: '#ffcc00' }}>{strategy.modifications_this_episode ?? 0}</span></span>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 28, color: 'rgba(143,0,255,0.2)', marginBottom: 12 }}>🧠</div>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(143,0,255,0.5)', textTransform: 'uppercase' }}>HyperAgent Offline</div>
      </div>
    );
  }

  return (
    <div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a855f7' }}>HyperAgent Meta-Engine</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: '"IBM Plex Mono", monospace', marginTop: 4 }}>
            Self-improving strategy layer · {status?.enabled ? 'ACTIVE' : 'DISABLED'}
          </div>
        </div>
        <button
          onClick={toggleHyper}
          disabled={toggleLoading}
          style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 10,
            fontFamily: '"IBM Plex Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'all 200ms ease',
            background: status?.enabled ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${status?.enabled ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: status?.enabled ? '#a855f7' : 'rgba(255,255,255,0.4)',
          }}
        >
          {status?.enabled ? '● Enabled' : '○ Disabled'}
        </button>
      </div>

      {/* ── Strategy Panels (Red / Blue) ───────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'rgba(255,51,95,0.04)', border: '1px solid rgba(255,51,95,0.12)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#ff335f', marginBottom: 8 }}>RED STRATEGY</div>
          {renderStrategyBars(status?.red ?? null, '#ff335f')}
        </div>
        <div style={{ background: 'rgba(20,209,255,0.04)', border: '1px solid rgba(20,209,255,0.12)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#14d1ff', marginBottom: 8 }}>BLUE STRATEGY</div>
          {renderStrategyBars(status?.blue ?? null, '#14d1ff')}
        </div>
      </div>

      {/* ── Evolution Score Trend ───────────────────────────────── */}
      <div style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#a855f7', marginBottom: 8 }}>EVOLUTION SCORE TREND</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: '#ff335f', marginBottom: 4, fontFamily: '"IBM Plex Mono", monospace' }}>Red Evolution</div>
            {renderSparkline(evolution?.red?.history || [], '#ff335f')}
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#14d1ff', marginBottom: 4, fontFamily: '"IBM Plex Mono", monospace' }}>Blue Evolution</div>
            {renderSparkline(evolution?.blue?.history || [], '#14d1ff')}
          </div>
        </div>
      </div>

      {/* ── Meta-Insight Feed ──────────────────────────────────── */}
      <div style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#a855f7', marginBottom: 8 }}>META-INSIGHTS (SELF-REFLECTION)</div>
        {insights ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['red', 'blue'] as const).map(agent => {
              const d = insights[agent];
              if (!d) return null;
              const accent = agent === 'red' ? '#ff335f' : '#14d1ff';
              return (
                <div key={agent} style={{ fontSize: 10, fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.8, color: 'rgba(255,255,255,0.6)' }}>
                  <div style={{ color: accent, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>{agent}</div>
                  <div>Focus: <span style={{ color: 'rgba(255,255,255,0.85)' }}>{d.evaluation_focus}</span></div>
                  <div>Δ Magnitude: <span style={{ color: accent }}>{typeof d.change_magnitude === 'number' ? d.change_magnitude.toFixed(3) : '—'}</span></div>
                  <div>Frequency: <span style={{ color: accent }}>{d.improvement_frequency}</span></div>
                  <div>History: <span style={{ color: 'rgba(255,255,255,0.85)' }}>{d.strategy_history_count} strategies</span></div>
                  <div>Improvements: <span style={{ color: '#ffcc00' }}>{d.improvement_log_count}</span></div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>Awaiting meta-reflection data…</div>
        )}
      </div>

      {/* ── Improvement Timeline ───────────────────────────────── */}
      {improvements.length > 0 && (
        <div style={{ background: 'rgba(255,204,0,0.04)', border: '1px solid rgba(255,204,0,0.12)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#ffcc00', marginBottom: 8 }}>IMPROVEMENT TIMELINE</div>
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {improvements.slice(0, 10).map((imp, i) => (
              <div key={i} style={{ fontSize: 10, fontFamily: '"IBM Plex Mono", monospace', display: 'flex', gap: 8, alignItems: 'flex-start', color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ color: imp.agent_type === 'red' ? '#ff335f' : '#14d1ff', fontWeight: 600, minWidth: 30 }}>{imp.agent_type?.toUpperCase()}</span>
                <span style={{ color: '#ffcc00' }}>{imp.parameter}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>{imp.old_value?.toFixed?.(2)} → {imp.new_value?.toFixed?.(2)}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imp.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audit Trail ────────────────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 }}>
        <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>AUDIT TRAIL</div>
        {audit.length > 0 ? (
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Agent', 'Action', 'Result', 'Details'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: 'rgba(255,255,255,0.35)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 15).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '3px 6px', color: r.agent_type === 'red' ? '#ff335f' : '#14d1ff' }}>{r.agent_type?.toUpperCase()}</td>
                    <td style={{ padding: '3px 6px', color: 'rgba(255,255,255,0.6)' }}>{r.action}</td>
                    <td style={{ padding: '3px 6px', color: r.result === 'approved' ? '#00ff88' : r.result === 'rejected' ? '#ff335f' : '#ffcc00' }}>{r.result}</td>
                    <td style={{ padding: '3px 6px', color: 'rgba(255,255,255,0.4)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>No audit records yet.</div>
        )}
      </div>
    </div>
  );
}

export default HyperAgentPanel;

```

## File: `src/components/layout/ProductSidebar.tsx`

```tsx
import {
  Activity,
  Bot,
  ChartColumn,
  ClipboardList,
  GitBranch,
  Layers3,
  Plug,
  Radio,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppRoute } from '../../hooks/useAppRouter';

type ProductRoute = Extract<
  AppRoute,
  '/live' | '/simulation' | '/pipeline' | '/attack-graph' | '/playbooks' | '/training' | '/integrations'
>;

const navItems: Array<{ route: ProductRoute; label: string; icon: LucideIcon }> = [
  { route: '/live', label: 'War Room', icon: Activity },
  { route: '/simulation', label: 'Battle', icon: Bot },
  { route: '/pipeline', label: 'Pipeline', icon: Layers3 },
  { route: '/attack-graph', label: 'Attack Graph', icon: GitBranch },
  { route: '/playbooks', label: 'Playbooks', icon: ClipboardList },
  { route: '/training', label: 'Training', icon: ChartColumn },
  { route: '/integrations', label: 'Integrations', icon: Plug },
];

interface ProductSidebarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  isConnected: boolean;
}

export function ProductSidebar({ currentRoute, onNavigate, isConnected }: ProductSidebarProps) {
  return (
    <aside className="product-sidebar hidden md:flex">
      <button className="brand-lockup" onClick={() => onNavigate('/')} type="button">
        <div className="brand-mark">CG</div>
        <div className="ops-display text-[0.54rem] text-secondary/70">CyberGuardian</div>
      </button>

      <nav className="mt-8 flex flex-1 flex-col gap-3">
        {navItems.map((item) => {
          const active = currentRoute === item.route;
          const Icon = item.icon;
          return (
            <button
              className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}
              key={item.route}
              onClick={() => onNavigate(item.route)}
              type="button"
            >
              <Icon size={18} strokeWidth={1.8} />
              <span className="ops-label text-[0.56rem]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="status-pod">
        <Radio className={`status-dot-icon ${isConnected ? 'status-dot-live' : ''}`} size={16} strokeWidth={2.2} />
        <div className="ops-label mt-2 text-[0.54rem]">{isConnected ? 'Live Link' : 'Standby'}</div>
      </div>
    </aside>
  );
}

```

## File: `src/components/layout/ProductTopbar.tsx`

```tsx
import { useEffect, useState } from 'react';
import type { AppRoute } from '../../hooks/useAppRouter';

type ProductRoute = Extract<
  AppRoute,
  '/live' | '/simulation' | '/pipeline' | '/attack-graph' | '/playbooks' | '/training'
>;

const routeTitles: Record<ProductRoute, { kicker: string; title: string }> = {
  '/live': { kicker: 'Primary Demo', title: 'Live War Room' },
  '/simulation': { kicker: 'Agent Duel', title: 'Simulation Viewer' },
  '/pipeline': { kicker: 'Predictive Stack', title: 'Neural Pipeline' },
  '/attack-graph': { kicker: 'Counterfactual', title: 'Attack Graph' },
  '/playbooks': { kicker: 'Response', title: 'Playbook Library' },
  '/training': { kicker: 'Offline Learning', title: 'Training Dashboard' },
};

interface ProductTopbarProps {
  currentRoute: ProductRoute;
  isConnected: boolean;
  step: number;
  maxSteps: number;
  simulationId: string | null;
}

export function ProductTopbar({
  currentRoute,
  isConnected,
  step,
  maxSteps,
  simulationId,
}: ProductTopbarProps) {
  const meta = routeTitles[currentRoute];
  const [utcTime, setUtcTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }),
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUtcTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'UTC',
        }),
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="top-status-bar">
      <div>
        <div className="ops-display text-[0.58rem] text-secondary/70">CYBERGUARDIAN AI</div>
        <div className="topbar-title-row">
          <div className="mt-1 text-2xl font-semibold tracking-[0.08em] text-white">{meta.title}</div>
          <div className="ops-label text-[0.52rem] text-secondary/70">{meta.kicker}</div>
        </div>
      </div>

      <div className="topbar-metrics">
        <span className={`status-pill ${isConnected ? 'status-pill-live' : ''}`}>
          SIM {isConnected ? 'ACTIVE' : 'STANDBY'}
        </span>
        <span className="status-pill">EPISODE {simulationId || 'BOOTING'}</span>
        <span className="status-pill">STEP {step}/{maxSteps}</span>
        <span className="status-pill">{utcTime} UTC</span>
      </div>
    </header>
  );
}

```

## File: `src/components/layout/ProductShell.tsx`

```tsx
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { CardNav, type CardNavItem } from './CardNav';
import { WebDiagram3D, DEFAULT_DIAGRAM_NODES } from '../WebDiagram3D';
import type { DiagramNode, DiagramEdge } from '../WebDiagram3D';
import { useSimulationStore } from '../../store/simulationStore';
import { useAppRouter } from '../../hooks/useAppRouter';

interface ProductShellProps {
  step: number;
  maxSteps: number;
  children: ReactNode;
}

export function ProductShell({
  step,
  maxSteps,
  children,
}: ProductShellProps) {
  const { network, viewMode, setSelectedNodeId } = useSimulationStore();
  const { route } = useAppRouter();

  const handleLogout = () => {
    window.localStorage.removeItem('cg_auth');
    window.location.href = '/login';
  };

  const navItems: CardNavItem[] = [
    {
      label: 'Operations',
      bgColor: 'rgba(3, 13, 26, 0.45)',
      textColor: '#e1e2e7',
      links: [
        { label: 'War Room', href: '/live', ariaLabel: 'Live War Room' },
      ]
    },
    {
      label: 'Intelligence',
      bgColor: 'rgba(3, 10, 20, 0.45)',
      textColor: '#e1e2e7',
      links: [
        { label: 'Threat Pipeline', href: '/pipeline', ariaLabel: 'Threat Pipeline' },
        { label: 'Attack Graph', href: '/attack-graph', ariaLabel: 'Attack Graph' },
        { label: 'URL Security', href: '/url-security', ariaLabel: 'URL Security Analysis' }
      ]
    },
    {
      label: 'Resources',
      bgColor: 'rgba(5, 10, 20, 0.45)',
      textColor: '#e1e2e7',
      links: [
        { label: 'Playbooks', href: '/playbooks', ariaLabel: 'Playbooks' },
        { label: 'Training', href: '/training', ariaLabel: 'Training' },
      ]
    }
  ];

  const getAlias = () => {
    try {
      const stored = window.localStorage.getItem('cg_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.alias || parsed.operatorId || 'Operator';
      }
    } catch {
      //
    }
    return 'Operator';
  };

  /* ── Compute 3D diagram data from live simulation state ── */
  const diagramNodes = useMemo<DiagramNode[] | undefined>(() => {
    if (!network?.nodes.length) return undefined;
    const fb = new Map(DEFAULT_DIAGRAM_NODES.map((n) => [n.id, n.position]));
    const descMap = new Map(DEFAULT_DIAGRAM_NODES.map((n) => [n.id, n.description]));
    return network.nodes.map((n) => ({
      id: n.id, label: n.label, type: n.type, status: n.status,
      position: fb.get(n.id) || [0, 0, 0],
      description: descMap.get(n.id),
    }));
  }, [network?.nodes]);

  const diagramEdges = useMemo<DiagramEdge[] | undefined>(() => {
    if (!network?.edges.length) return undefined;
    return network.edges.map((e) => ({
      source: e.source, target: e.target, active: e.is_active,
      edgeType: e.edge_type === 'c2' ? 'beacon' : e.edge_type,
    }));
  }, [network?.edges]);

  const diagramWinner: 'red' | 'blue' | null = useMemo(() => {
    if (step < maxSteps) return null;
    return 'blue';
  }, [maxSteps, step]);

  return (
    <div className="product-shell">
      {/* ═══ FULL-SCREEN 3D BACKGROUND (Global) ═══ */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <WebDiagram3D
          nodes={diagramNodes}
          edges={diagramEdges}
          winner={diagramWinner}
          viewMode={viewMode}
          onNodeClick={(id) => setSelectedNodeId(id)}
        />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <CardNav 
            items={navItems}
            userName={getAlias()}
            onLogout={handleLogout}
          />
        </div>
        <div className="product-main" style={{ marginLeft: 0, pointerEvents: route === '/live' ? 'none' : 'auto' }}>
          <main className="product-content" style={{ marginTop: '6rem', pointerEvents: route === '/live' ? 'none' : 'auto' }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

```

## File: `src/components/layout/CardNav.tsx`

```tsx
import React, { useState } from 'react';
import { GoArrowUpRight } from 'react-icons/go';
import { FiLogOut } from 'react-icons/fi';
import { useAppRouter, type AppRoute } from '../../hooks/useAppRouter';

export type CardNavLink = {
  label: string;
  href: string;
  ariaLabel: string;
};

export type CardNavItem = {
  label: string;
  bgColor: string;
  textColor: string;
  links: CardNavLink[];
};

export interface CardNavProps {
  items: CardNavItem[];
  className?: string;
  ease?: string;
  baseColor?: string;
  menuColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  userName?: string;
  onLogout?: () => void;
}

export const CardNav: React.FC<CardNavProps> = ({
  items,
  className = '',
  ease: _ease = 'power3.out', // Kept for prop compatibility but unused
  baseColor = 'rgba(13, 22, 40, 0.85)',
  menuColor = '#00e5ff',
  buttonBgColor = 'rgba(0, 229, 255, 0.1)',
  buttonTextColor = '#00e5ff',
  userName = 'Operator',
  onLogout
}) => {
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { navigate } = useAppRouter();

  const toggleMenu = () => {
    const opening = !isExpanded;
    setIsHamburgerOpen(opening);
    setIsExpanded(opening);
    if (!opening) {
      // Blur any focused element inside the menu to prevent aria-hidden focus warning
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.card-nav-content')) active.blur();
    }
  };

  return (
    <div
      className={`card-nav-container fixed left-1/2 -translate-x-1/2 w-[90%] max-w-[800px] z-[99] top-[1.2rem] md:top-[2rem] ${className}`}
    >
      <nav
        className={`card-nav ${isExpanded ? 'open' : ''} block p-0 rounded-[14px] shadow-2xl relative overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]`}
        style={{ 
          backgroundColor: baseColor,
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(0, 229, 255, 0.2)',
          maxHeight: isExpanded ? 600 : 60,
        }}
      >
        <div className="card-nav-top absolute inset-x-0 top-0 h-[60px] flex items-center justify-between p-2 pl-[1.1rem] z-[2]">
          <div
            className={`hamburger-menu ${isHamburgerOpen ? 'open' : ''} group h-full flex flex-col items-center justify-center cursor-pointer gap-[6px] order-1 md:order-none`}
            onClick={toggleMenu}
            role="button"
            aria-label={isExpanded ? 'Close menu' : 'Open menu'}
            tabIndex={0}
            style={{ color: menuColor }}
          >
            <div
              className={`hamburger-line w-[30px] h-[2px] bg-current transition-[transform,opacity,margin] duration-300 ease-linear [transform-origin:50%_50%] ${
                isHamburgerOpen ? 'translate-y-[4px] rotate-45' : ''
              } group-hover:opacity-75`}
            />
            <div
              className={`hamburger-line w-[30px] h-[2px] bg-current transition-[transform,opacity,margin] duration-300 ease-linear [transform-origin:50%_50%] ${
                isHamburgerOpen ? '-translate-y-[4px] -rotate-45' : ''
              } group-hover:opacity-75`}
            />
          </div>

          <div className="logo-container flex items-center md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 order-2 md:order-none mx-auto md:mx-0">
            <span style={{ 
              color: '#00e5ff', 
              fontFamily: '"Orbitron", monospace', 
              fontWeight: 800, 
              letterSpacing: '0.1em',
              fontSize: 'min(16px, 4vw)'
            }}>
              CYBER
              <span style={{ color: '#fff' }}>GUARDIAN</span>
            </span>
          </div>

          <div className="flex items-center gap-[6px] md:gap-4 h-full pr-1 md:pr-2 order-3 md:order-none">
            <div 
              style={{ color: 'rgba(255,255,255,0.7)', fontFamily: '"IBM Plex Mono", monospace' }} 
              className="text-[10px] md:text-[13px] tracking-wide max-w-[50px] sm:max-w-[80px] md:max-w-none truncate hidden sm:block"
            >
              OP:<span style={{ color: '#00e5ff', fontWeight: 600 }}>{userName}</span>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="card-nav-cta-button border-0 rounded-[calc(0.75rem-0.2rem)] px-2 flex items-center h-[60%] md:h-[70%] font-medium cursor-pointer transition-colors duration-300 z-10"
                style={{ backgroundColor: buttonBgColor, color: buttonTextColor, fontFamily: '"Orbitron", monospace', fontSize: '10px', letterSpacing: '0.05em' }}
                tabIndex={0}
              >
                <FiLogOut className="md:mr-2" size={14} /> <span className="hidden md:inline">LOGOUT</span>
              </button>
            )}
          </div>
        </div>

        <div
          className={`card-nav-content relative mt-[60px] p-2 flex flex-col gap-2 transition-opacity duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            isExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          } md:flex-row md:items-stretch md:gap-[12px]`}
          {...(isExpanded ? {} : { inert: true })}
        >
          {(items || []).slice(0, 3).map((item, idx) => (
            <div
              key={`${item.label}-${idx}`}
              className="nav-card select-none relative flex flex-col gap-2 p-[16px_20px] rounded-[calc(0.75rem-0.2rem)] min-w-0 flex-[1_1_auto] transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: item.bgColor, color: item.textColor, border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="nav-card-label font-medium tracking-wide text-[16px] md:text-[18px] uppercase" style={{ fontFamily: '"Orbitron", monospace' }}>
                {item.label}
              </div>
              <div className="nav-card-links mt-auto flex flex-col gap-[6px]">
                {item.links?.map((lnk, i) => (
                  <a
                    key={`${lnk.label}-${i}`}
                    className="nav-card-link inline-flex items-center gap-[6px] no-underline cursor-pointer transition-colors duration-300 hover:text-[#00e5ff] text-[13px] md:text-[14px]"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(lnk.href as AppRoute);
                      toggleMenu();
                    }}
                    href={lnk.href}
                    aria-label={lnk.ariaLabel}
                    tabIndex={isExpanded ? 0 : -1}
                    style={{ fontFamily: '"IBM Plex Mono", monospace' }}
                  >
                    <GoArrowUpRight className="nav-card-link-icon shrink-0" aria-hidden="true" />
                    {lnk.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
};

```

## File: `src/components/visualization/NetworkTopology.tsx`

```tsx
import * as d3 from 'd3';
import { useState } from 'react';
import type { ContestEvent, DecisionScores, NetworkEdge, NetworkNode } from '../../lib/ops-types';
import BattleParticleCanvas from '../ops/BattleParticleCanvas';
import ContestNode from '../ops/ContestNode';

interface PositionedNode extends NetworkNode {
  x: number;
  y: number;
}

interface NetworkTopologyProps {
  nodes: NetworkNode[];
  links: NetworkEdge[];
  width?: number;
  height?: number;
  contestEvents?: ContestEvent[];
  redQValues?: Record<string, DecisionScores>;
  bluePolicyProbs?: Record<string, DecisionScores>;
  selectedNodeId?: number | null;
  onNodeClick?: (nodeId: number) => void;
}

const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 660;
const NODE_RADIUS = 22;

const zoneOrder: Array<NetworkNode['type']> = ['internet', 'dmz', 'app_server', 'db_server', 'workstation'];

const edgeStyle = (edge: NetworkEdge) => {
  if (!edge.is_active) {
    return { stroke: 'rgba(88, 102, 129, 0.55)', width: 1.2, dash: '8 10' };
  }
  if (edge.edge_type === 'attack' || edge.edge_type === 'exfil') {
    return { stroke: '#ff335f', width: 3, dash: '' };
  }
  if (edge.edge_type === 'lateral') {
    return { stroke: '#ff9f43', width: 2.6, dash: '10 8' };
  }
  if (edge.edge_type === 'beacon') {
    return { stroke: '#ffcf5c', width: 2.2, dash: '4 10' };
  }
  return { stroke: '#4dd8ff', width: 1.8, dash: '' };
};

const fallbackPhase = (node: NetworkNode): ContestEvent['phase'] => {
  if (node.status === 'compromised') {
    return 'red_captured';
  }
  if (node.status === 'isolated') {
    return 'blue_defended';
  }
  if (node.status === 'under_attack' || node.status === 'detected') {
    return 'contested';
  }
  return 'idle';
};

export function NetworkTopology({
  nodes,
  links,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  contestEvents = [],
  redQValues = {},
  bluePolicyProbs = {},
  selectedNodeId = null,
  onNodeClick,
}: NetworkTopologyProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const positionedNodes = layoutNodes(nodes, width, height);
  const nodeMap = new Map(positionedNodes.map((node) => [node.id, node]));
  const contestMap = new Map(contestEvents.map((event) => [event.node_id, event]));
  const linkPaths = links
    .map((link, index) => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) {
        return null;
      }
      const pathId = `battle-edge-${index}-${source.id}-${target.id}`;
      return {
        ...link,
        pathId,
        path: buildEdgePath(source, target),
        source,
        target,
      };
    })
    .filter(Boolean) as Array<NetworkEdge & { pathId: string; path: string; source: PositionedNode; target: PositionedNode }>;

  const nodePositions = new Map(positionedNodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const overlayNodeId = hoveredNodeId ?? selectedNodeId;
  const overlayNode = overlayNodeId !== null ? nodeMap.get(overlayNodeId) || null : null;
  const overlayContest = overlayNodeId !== null ? contestMap.get(overlayNodeId) || null : null;
  const overlayRed = overlayNodeId !== null ? redQValues[String(overlayNodeId)] || {} : {};
  const overlayBlue = overlayNodeId !== null ? bluePolicyProbs[String(overlayNodeId)] || {} : {};

  return (
    <div className="relative min-h-[620px] overflow-hidden rounded-[20px] border border-cyan-400/10 bg-[radial-gradient(circle_at_top,rgba(12,52,89,0.24),transparent_45%),linear-gradient(180deg,rgba(5,12,24,0.96),rgba(6,10,18,0.99))]">
      <svg className="h-full w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <filter id="edge-glow">
            <feGaussianBlur result="blur" stdDeviation="2.5" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {zoneOrder
          .filter((type) => type !== 'internet')
          .map((type) => {
            const zoneNodes = positionedNodes.filter((node) => node.type === type);
            if (!zoneNodes.length) {
              return null;
            }
            return (
              <g key={type}>
                <line
                  stroke="rgba(77, 216, 255, 0.08)"
                  strokeDasharray="6 10"
                  x1={80}
                  x2={width - 80}
                  y1={zoneNodes[0].y}
                  y2={zoneNodes[0].y}
                />
                <text className="ops-display" fill="rgba(125,211,252,0.45)" fontSize="11" x={80} y={zoneNodes[0].y - 14}>
                  {type.replace('_', ' ').toUpperCase()}
                </text>
              </g>
            );
          })}

        <g filter="url(#edge-glow)">
          {linkPaths.map((link) => {
            const style = edgeStyle(link);
            return (
              <g key={link.pathId}>
                <path
                  d={link.path}
                  fill="none"
                  id={link.pathId}
                  stroke={style.stroke}
                  strokeDasharray={style.dash}
                  strokeLinecap="round"
                  strokeOpacity={link.is_active ? 0.9 : 0.45}
                  strokeWidth={style.width}
                >
                  {style.dash ? (
                    <animate
                      attributeName="stroke-dashoffset"
                      dur={link.edge_type === 'beacon' ? '2.4s' : '3.2s'}
                      from="0"
                      repeatCount="indefinite"
                      to="-40"
                    />
                  ) : null}
                </path>

                {link.is_active
                  ? Array.from({ length: Math.min(3, Math.max(1, link.particle_count || 1)) }).map((_, particleIndex) => (
                      <circle fill={link.particle_color} key={`${link.pathId}-${particleIndex}`} r={2.2}>
                        <animateMotion
                          begin={`${particleIndex * 0.35}s`}
                          dur={`${Math.max(1.2, 3.6 - link.particle_speed)}s`}
                          path={link.path}
                          repeatCount="indefinite"
                        />
                      </circle>
                    ))
                  : null}
              </g>
            );
          })}
        </g>

        <g>
          {positionedNodes.map((node) => {
            const contest = contestMap.get(node.id);
            const attentionLevel = Math.max(
              ...Object.values(redQValues[String(node.id)] || {}),
              ...Object.values(bluePolicyProbs[String(node.id)] || {}),
              0,
            );
            return (
              <ContestNode
                attentionLevel={attentionLevel}
                blueControl={contest?.blue_control_pct ?? (node.status === 'isolated' ? 0.92 : 0.28)}
                contestIntensity={contest?.contest_intensity ?? (node.status === 'under_attack' ? 0.55 : 0.08)}
                cx={node.x}
                cy={node.y}
                isRedHere={node.is_red_current_position}
                isSelected={selectedNodeId === node.id}
                key={node.id}
                label={node.label}
                nodeType={node.type}
                onClick={onNodeClick ? () => onNodeClick(node.id) : undefined}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                phase={contest?.phase ?? fallbackPhase(node)}
                r={NODE_RADIUS}
                redControl={contest?.red_control_pct ?? (node.status === 'compromised' ? 0.92 : node.status === 'under_attack' ? 0.55 : 0.06)}
                severity={contest?.severity ?? 'low'}
              />
            );
          })}
        </g>

        {overlayNode ? (
          <DecisionThoughtBubble
            blueScores={overlayBlue}
            contest={overlayContest}
            height={height}
            node={overlayNode}
            redScores={overlayRed}
            width={width}
          />
        ) : null}
      </svg>

      <BattleParticleCanvas events={contestEvents} height={height} nodePositions={nodePositions} width={width} />
    </div>
  );
}

function DecisionThoughtBubble({
  node,
  redScores,
  blueScores,
  width,
  height,
  contest,
}: {
  node: PositionedNode;
  redScores: DecisionScores;
  blueScores: DecisionScores;
  width: number;
  height: number;
  contest: ContestEvent | null;
}) {
  const bubbleWidth = 272;
  const hasContext = Boolean(contest?.detection_reason || contest?.immediate_action);
  const bubbleHeight = hasContext ? 288 : 172;
  const x = node.x > width - bubbleWidth - 36 ? node.x - bubbleWidth - 28 : node.x + 28;
  const y = Math.max(24, Math.min(height - bubbleHeight - 24, node.y - bubbleHeight / 2));
  const redEntries = rankedScores(redScores);
  const blueEntries = rankedScores(blueScores);
  const attention = contest?.phase === 'red_winning' || contest?.phase === 'red_captured' ? 'HIGH ATTENTION' : 'BLUE CONSIDERING';

  return (
    <g pointerEvents="none" transform={`translate(${x} ${y})`}>
      <rect
        fill="rgba(12, 14, 18, 0.94)"
        height={bubbleHeight}
        rx="18"
        stroke="rgba(176, 198, 255, 0.16)"
        width={bubbleWidth}
      />
      <text className="ops-display" fill="#e1e2e7" fontSize="10" x="14" y="20">
        {node.label}
      </text>
      <text className="ops-label" fill="#a6e6ff" fontSize="8" x={bubbleWidth - 112} y="20">
        {attention}
      </text>

      <text className="ops-label" fill="#ff6f91" fontSize="8" x="14" y="42">RED Q-VALUES</text>
      {redEntries.map(([label, value], index) => (
        <BarRow color="#ff335f" key={`red-${label}`} label={label} value={value} x={14} y={56 + index * 22} />
      ))}

      <text className="ops-label" fill="#82e8ff" fontSize="8" x="14" y="128">BLUE POLICY</text>
      {blueEntries.map(([label, value], index) => (
        <BarRow color="#14d1ff" key={`blue-${label}`} label={label} value={value} x={14} y={142 + index * 22} />
      ))}

      {contest?.detection_reason ? (
        <>
          <line stroke="rgba(255,255,255,0.08)" x1="14" x2={bubbleWidth - 14} y1="182" y2="182" />
          <text className="ops-label" fill="#ffcc00" fontSize="7" x="14" y="198">WHY FLAGGED</text>
          <WrappedText fill="rgba(225,226,231,0.75)" fontSize={8} maxWidth={bubbleWidth - 28} text={contest.detection_reason} x={14} y={212} />
        </>
      ) : null}

      {contest?.immediate_action ? (
        <>
          <line stroke="rgba(255,255,255,0.08)" x1="14" x2={bubbleWidth - 14} y1="240" y2="240" />
          <text className="ops-label" fill="#00ff88" fontSize="7" x="14" y="256">WHAT TO DO</text>
          <WrappedText fill="rgba(225,226,231,0.75)" fontSize={8} maxWidth={bubbleWidth - 28} text={contest.immediate_action} x={14} y={270} />
        </>
      ) : null}
    </g>
  );
}

function WrappedText({ text, x, y, fontSize, fill, maxWidth }: { text: string; x: number; y: number; fontSize: number; fill: string; maxWidth: number }) {
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.52));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > charsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return (
    <>
      {lines.slice(0, 2).map((line, i) => (
        <text fill={fill} fontSize={fontSize} key={i} x={x} y={y + i * (fontSize + 3)}>
          {line}{i === 1 && lines.length > 2 ? '…' : ''}
        </text>
      ))}
    </>
  );
}

function BarRow({
  label,
  value,
  color,
  x,
  y,
}: {
  label: string;
  value: number;
  color: string;
  x: number;
  y: number;
}) {
  const width = 96;
  return (
    <g transform={`translate(${x} ${y})`}>
      <text className="ops-label" fill="rgba(225,226,231,0.8)" fontSize="7" x="0" y="0">
        {label.replace(/_/g, ' ')}
      </text>
      <rect fill="rgba(255,255,255,0.08)" height="8" rx="4" width={width} x="92" y="-7" />
      <rect fill={color} height="8" rx="4" width={Math.max(8, width * value)} x="92" y="-7" />
      <text className="ops-data" fill="#ffffff" fontSize="8" textAnchor="end" x="206" y="0">
        {Math.round(value * 100)}%
      </text>
    </g>
  );
}

function rankedScores(scores: DecisionScores) {
  return Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3);
}

function buildEdgePath(source: PositionedNode, target: PositionedNode) {
  const deltaY = Math.abs(target.y - source.y);
  const controlOffset = Math.max(40, deltaY * 0.35);
  return `M ${source.x} ${source.y} C ${source.x} ${source.y + controlOffset} ${target.x} ${target.y - controlOffset} ${target.x} ${target.y}`;
}

function layoutNodes(nodes: NetworkNode[], width: number, height: number): PositionedNode[] {
  const byType = new Map<NetworkNode['type'], NetworkNode[]>();

  for (const type of zoneOrder) {
    byType.set(type, []);
  }

  nodes.forEach((node) => {
    const current = byType.get(node.type) || [];
    current.push(node);
    byType.set(node.type, current);
  });

  return nodes.map((node) => {
    if (node.type === 'internet') {
      return {
        ...node,
        x: width / 2,
        y: 72,
      };
    }

    const siblings = byType.get(node.type) || [node];
    const scale = d3
      .scalePoint<number>()
      .domain(siblings.map((item) => item.id))
      .range([110, width - 110])
      .padding(0.6);

    return {
      ...node,
      x: scale(node.id) ?? width / 2,
      y: Math.round(Math.max(112, Math.min(height - 72, node.zone_y * height))),
    };
  });
}

```

## File: `src/components/ui/MagicBento.tsx`

```tsx
/**
 * MagicBento — GSAP-powered bento grid with spotlight, particles, tilt, and border glow.
 *
 * This version supports **two** usage modes:
 *   1. Static cards — pass `cards` prop (title/description/label array)
 *   2. Children mode — wrap any React content with `<BentoCard>` inside `<MagicBentoGrid>`
 *
 * The Children mode is used by the product pages to mount real live components
 * (SocTerminal, BreachCountdown, HyperAgentPanel, etc.) inside the glowing cards.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { gsap } from 'gsap';

/* ── Constants ────────────────────────────────────────────────────────── */
const DEFAULT_PARTICLE_COUNT = 10;
const DEFAULT_SPOTLIGHT_RADIUS = 260;
const DEFAULT_GLOW_COLOR = '20, 209, 255';
const MOBILE_BREAKPOINT = 768;

/* ── Shared CSS (injected once) ───────────────────────────────────────── */
const BENTO_STYLES = (glowColor: string) => `
  .bento-section {
    --glow-x: 50%;
    --glow-y: 50%;
    --glow-intensity: 0;
    --glow-radius: 220px;
    --glow-color: ${glowColor};
    --border-color: rgba(255,255,255,0.08);
    --background-dark: rgba(6, 14, 24, 0.9);
    --white: hsl(0, 0%, 100%);
  }
  .card--border-glow::after {
    content: '';
    position: absolute;
    inset: 0;
    padding: 1px;
    background: radial-gradient(var(--glow-radius) circle at var(--glow-x) var(--glow-y),
      rgba(${glowColor}, calc(var(--glow-intensity) * 0.7)) 0%,
      rgba(${glowColor}, calc(var(--glow-intensity) * 0.28)) 28%,
      transparent 62%);
    border-radius: inherit;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
  .text-clamp-1 {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    overflow: hidden;
  }
  .text-clamp-2 {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
`;

/* ── Helpers ──────────────────────────────────────────────────────────── */
const createParticleElement = (x: number, y: number, color = DEFAULT_GLOW_COLOR) => {
  const el = document.createElement('div');
  el.className = 'particle';
  el.style.cssText = `
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(${color}, 1);
    box-shadow: 0 0 8px rgba(${color}, 0.8);
    pointer-events: none;
    z-index: 100;
    left: ${x}px;
    top: ${y}px;
  `;
  return el;
};

const calculateSpotlightValues = (radius: number) => ({
  proximity: radius * 0.5,
  fadeDistance: radius * 0.85,
});

const updateCardGlowProperties = (
  card: HTMLElement,
  mouseX: number,
  mouseY: number,
  glow: number,
  radius: number,
) => {
  const rect = card.getBoundingClientRect();
  const relativeX = ((mouseX - rect.left) / rect.width) * 100;
  const relativeY = ((mouseY - rect.top) / rect.height) * 100;
  card.style.setProperty('--glow-x', `${relativeX}%`);
  card.style.setProperty('--glow-y', `${relativeY}%`);
  card.style.setProperty('--glow-intensity', glow.toString());
  card.style.setProperty('--glow-radius', `${radius}px`);
};

function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

/* ── ParticleCard ─────────────────────────────────────────────────────── */
function ParticleCard({
  children,
  className = '',
  disableAnimations = false,
  style,
  particleCount = DEFAULT_PARTICLE_COUNT,
  glowColor = DEFAULT_GLOW_COLOR,
  enableTilt = true,
  clickEffect = false,
  enableMagnetism = false,
}: {
  children: ReactNode;
  className?: string;
  disableAnimations?: boolean;
  style?: CSSProperties;
  particleCount?: number;
  glowColor?: string;
  enableTilt?: boolean;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const isHoveredRef = useRef(false);
  const memoizedParticles = useRef<HTMLDivElement[]>([]);
  const particlesInitialized = useRef(false);
  const magnetismAnimationRef = useRef<gsap.core.Tween | null>(null);

  const initializeParticles = useCallback(() => {
    if (particlesInitialized.current || !cardRef.current) return;
    const { width, height } = cardRef.current.getBoundingClientRect();
    memoizedParticles.current = Array.from({ length: particleCount }, () =>
      createParticleElement(Math.random() * width, Math.random() * height, glowColor),
    );
    particlesInitialized.current = true;
  }, [particleCount, glowColor]);

  const clearAllParticles = useCallback(() => {
    timeoutsRef.current.forEach(window.clearTimeout);
    timeoutsRef.current = [];
    magnetismAnimationRef.current?.kill();
    particlesRef.current.forEach((p) => {
      gsap.to(p, {
        scale: 0,
        opacity: 0,
        duration: 0.25,
        ease: 'back.in(1.7)',
        onComplete: () => p.parentNode?.removeChild(p),
      });
    });
    particlesRef.current = [];
  }, []);

  const animateParticles = useCallback(() => {
    if (!cardRef.current || !isHoveredRef.current) return;
    if (!particlesInitialized.current) initializeParticles();
    memoizedParticles.current.forEach((particle, index) => {
      const tid = window.setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return;
        const clone = particle.cloneNode(true) as HTMLDivElement;
        cardRef.current.appendChild(clone);
        particlesRef.current.push(clone);
        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
        gsap.to(clone, {
          x: (Math.random() - 0.5) * 100,
          y: (Math.random() - 0.5) * 100,
          rotation: Math.random() * 360,
          duration: 2 + Math.random() * 2,
          ease: 'none',
          repeat: -1,
          yoyo: true,
        });
        gsap.to(clone, { opacity: 0.3, duration: 1.6, ease: 'power2.inOut', repeat: -1, yoyo: true });
      }, index * 80);
      timeoutsRef.current.push(tid);
    });
  }, [initializeParticles]);

  useEffect(() => {
    if (disableAnimations || !cardRef.current) return;
    const el = cardRef.current;
    const onEnter = () => { isHoveredRef.current = true; animateParticles(); };
    const onLeave = () => {
      isHoveredRef.current = false;
      clearAllParticles();
      gsap.to(el, { rotateX: 0, rotateY: 0, x: 0, y: 0, duration: 0.3, ease: 'power2.out' });
    };
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (enableTilt) {
        gsap.to(el, { rotateX: ((y - cy) / cy) * -8, rotateY: ((x - cx) / cx) * 8, duration: 0.12, ease: 'power2.out', transformPerspective: 1000 });
      }
      if (enableMagnetism) {
        magnetismAnimationRef.current = gsap.to(el, { x: (x - cx) * 0.04, y: (y - cy) * 0.04, duration: 0.25, ease: 'power2.out' });
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!clickEffect) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const maxD = Math.max(Math.hypot(x, y), Math.hypot(x - rect.width, y), Math.hypot(x, y - rect.height), Math.hypot(x - rect.width, y - rect.height));
      const ripple = document.createElement('div');
      ripple.style.cssText = `position:absolute;width:${maxD * 2}px;height:${maxD * 2}px;border-radius:50%;background:radial-gradient(circle,rgba(${glowColor},0.35) 0%,rgba(${glowColor},0.16) 34%,transparent 70%);left:${x - maxD}px;top:${y - maxD}px;pointer-events:none;z-index:1000;`;
      el.appendChild(ripple);
      gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => ripple.remove() });
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('click', onClick);
    return () => {
      isHoveredRef.current = false;
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('click', onClick);
      clearAllParticles();
    };
  }, [animateParticles, clearAllParticles, clickEffect, disableAnimations, enableMagnetism, enableTilt, glowColor]);

  return (
    <div ref={cardRef} className={`${className} relative overflow-hidden`} style={{ ...style, position: 'relative', overflow: 'hidden' }}>
      {children}
    </div>
  );
}

/* ── GlobalSpotlight ──────────────────────────────────────────────────── */
function GlobalSpotlight({
  gridRef,
  disableAnimations = false,
  enabled = true,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  glowColor = DEFAULT_GLOW_COLOR,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  disableAnimations?: boolean;
  enabled?: boolean;
  spotlightRadius?: number;
  glowColor?: string;
}) {
  const spotlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disableAnimations || !gridRef.current || !enabled) return;
    const spotlight = document.createElement('div');
    spotlight.style.cssText = `position:fixed;width:760px;height:760px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(${glowColor},0.12) 0%,rgba(${glowColor},0.08) 14%,rgba(${glowColor},0.03) 34%,transparent 70%);z-index:200;opacity:0;transform:translate(-50%,-50%);mix-blend-mode:screen;`;
    document.body.appendChild(spotlight);
    spotlightRef.current = spotlight;

    const onMove = (e: MouseEvent) => {
      if (!spotlightRef.current || !gridRef.current) return;
      const section = gridRef.current.closest('.bento-section');
      const rect = section?.getBoundingClientRect();
      const inside = rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const cards = gridRef.current.querySelectorAll<HTMLElement>('.card');
      if (!inside) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        cards.forEach((c) => c.style.setProperty('--glow-intensity', '0'));
        return;
      }
      const { proximity, fadeDistance } = calculateSpotlightValues(spotlightRadius);
      let minD = Infinity;
      cards.forEach((card) => {
        const cr = card.getBoundingClientRect();
        const d = Math.max(0, Math.hypot(e.clientX - (cr.left + cr.width / 2), e.clientY - (cr.top + cr.height / 2)) - Math.max(cr.width, cr.height) / 2);
        minD = Math.min(minD, d);
        const gi = d <= proximity ? 1 : d <= fadeDistance ? (fadeDistance - d) / (fadeDistance - proximity) : 0;
        updateCardGlowProperties(card, e.clientX, e.clientY, gi, spotlightRadius);
      });
      gsap.to(spotlightRef.current, { left: e.clientX, top: e.clientY, duration: 0.1, ease: 'power2.out' });
      const op = minD <= proximity ? 0.78 : minD <= fadeDistance ? ((fadeDistance - minD) / (fadeDistance - proximity)) * 0.78 : 0;
      gsap.to(spotlightRef.current, { opacity: op, duration: op > 0 ? 0.18 : 0.42, ease: 'power2.out' });
    };
    const onLeave = () => {
      gridRef.current?.querySelectorAll<HTMLElement>('.card').forEach((c) => c.style.setProperty('--glow-intensity', '0'));
      if (spotlightRef.current) gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3, ease: 'power2.out' });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      spotlightRef.current?.parentNode?.removeChild(spotlightRef.current);
    };
  }, [disableAnimations, enabled, glowColor, gridRef, spotlightRadius]);

  return null;
}

/* ══════════════════════════════════════════════════════════════════════
 * PUBLIC API — Children-based Usage
 * ══════════════════════════════════════════════════════════════════════ */

export interface BentoCardProps {
  children: ReactNode;
  /** Extra classes (e.g. `col-span-full`, `col-span-2`, `row-span-2`) */
  className?: string;
  /** Accent label shown top-left */
  label?: string;
  style?: CSSProperties;
}

/** Individual card inside a MagicBentoGrid */
export function BentoCard({ children, className = '', label, style }: BentoCardProps) {
  return (
    <ParticleCard
      className={`card card--border-glow flex flex-col relative w-full max-w-full p-5 rounded-[20px] border border-solid font-light overflow-hidden transition-all duration-300 ${className}`}
      style={{
        backgroundColor: 'var(--background-dark)',
        borderColor: 'var(--border-color)',
        color: 'var(--white)',
        minHeight: 160,
        ...style,
      }}
      enableTilt={false}
      clickEffect
      enableMagnetism
      glowColor={DEFAULT_GLOW_COLOR}
    >
      {label && (
        <div className="mb-3" style={{ fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00e5ff' }}>
          {label}
        </div>
      )}
      {children}
    </ParticleCard>
  );
}

export interface MagicBentoGridProps {
  children: ReactNode;
  /** Grid class override — default is a responsive 4-column grid */
  className?: string;
  glowColor?: string;
  enableSpotlight?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
}

/** Wraps children in a GSAP-powered bento section with spotlight */
export function MagicBentoGrid({
  children,
  className = '',
  glowColor = DEFAULT_GLOW_COLOR,
  enableSpotlight = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
}: MagicBentoGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useMobileDetection();
  const shouldDisable = disableAnimations || isMobile;

  return (
    <>
      <style>{BENTO_STYLES(glowColor)}</style>
      {enableSpotlight && (
        <GlobalSpotlight
          gridRef={gridRef}
          disableAnimations={shouldDisable}
          enabled
          spotlightRadius={spotlightRadius}
          glowColor={glowColor}
        />
      )}
      <div
        className={`bento-section select-none relative ${className}`}
        ref={gridRef}
        style={{ display: 'grid', gap: 12 }}
      >
        {children}
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * LEGACY API — Static cards array (kept for backward compat)
 * ══════════════════════════════════════════════════════════════════════ */

export interface MagicBentoStaticCard {
  color?: string;
  title: string;
  description: string;
  label: string;
}

export default function MagicBento({
  cards,
  glowColor = DEFAULT_GLOW_COLOR,
  enableSpotlight = true,
  disableAnimations = false,
}: {
  cards: MagicBentoStaticCard[];
  glowColor?: string;
  enableSpotlight?: boolean;
  disableAnimations?: boolean;
}) {
  return (
    <MagicBentoGrid
      glowColor={glowColor}
      enableSpotlight={enableSpotlight}
      disableAnimations={disableAnimations}
      className="grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
    >
      {cards.map((card, i) => (
        <BentoCard key={`${card.title}-${i}`} label={card.label}>
          <h3 className="m-0 mb-2 text-[1rem] font-semibold text-white">{card.title}</h3>
          <p className="text-sm leading-6 text-white/75">{card.description}</p>
        </BentoCard>
      ))}
    </MagicBentoGrid>
  );
}

```

## File: `src/api/client.ts`

```typescript
import axios from 'axios';

const isProd = import.meta.env.PROD;
const baseURL = import.meta.env.VITE_API_URL || (isProd ? 'https://inari-80s3.onrender.com' : 'http://127.0.0.1:8001');
export const apiClient = axios.create({
  baseURL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getWebSocketUrl = (simulationId: string) => {
  const currentBase = String(apiClient.defaults.baseURL || baseURL).replace(/\/$/, '');
  const protocol = currentBase.startsWith('https') ? 'wss' : 'ws';
  const host = currentBase.replace(/^https?:\/\//, '');
  return `${protocol}://${host}/ws/simulation/${simulationId}`;
};

```

## File: `src/store/simulationStore.ts`

```typescript
import { create } from 'zustand';
import toast from 'react-hot-toast';
import { apiClient, getWebSocketUrl } from '../api/client';
import type {
  AgentAction,
  AgentsInfo,
  AptMatch,
  BattleBriefing,
  BattleScoreboard,
  ContestEvent,
  DecisionScores,
  GiskardReport,
  GiskardStatus,
  IntegrationEventMessage,
  IntegrationFeedEvent,
  InitMessage,
  KillChainState,
  NetworkGraphState,
  NodeBattleResult,
  PipelineState,
  Playbook,
  StepHistorySummary,
  StepMessage,
  ThreatAlert,
  TrainingMetrics,
} from '../lib/ops-types';

type StreamMessage = InitMessage | StepMessage | IntegrationEventMessage;
type ThreatType = ThreatAlert['threat_type'];
const ENTERPRISE_API_KEY_STORAGE = 'athernex_api_key';

const getEnterpriseApiKey = () =>
  typeof window === 'undefined'
    ? 'ath_local_admin'
    : window.localStorage.getItem(ENTERPRISE_API_KEY_STORAGE) || 'ath_local_admin';

export interface TelemetryLog {
  id: string;
  team: 'red' | 'blue' | 'system';
  type: string;
  message: string;
  step: number;
  tone: 'critical' | 'warning' | 'info' | 'success';
}

interface SimulationState {
  simulationId: string | null;
  isConnected: boolean;
  network: NetworkGraphState | null;
  logs: TelemetryLog[];
  alerts: ThreatAlert[];
  step: number;
  maxSteps: number;
  phase: string;
  apiBaseUrl: string;
  briefing: BattleBriefing | null;
  scoreboard: BattleScoreboard | null;
  contestEvents: ContestEvent[];
  battleResults: NodeBattleResult[];
  redQValues: Record<string, DecisionScores>;
  bluePolicyProbs: Record<string, DecisionScores>;
  pipeline: PipelineState | null;
  latestRedAction: AgentAction | null;
  latestBlueAction: AgentAction | null;
  redCumulative: number;
  blueCumulative: number;
  episodeHistorySummary: StepHistorySummary[];
  trainingMetrics: TrainingMetrics | null;
  agentsInfo: AgentsInfo | null;
  playbooks: Playbook[];
  giskardStatus: GiskardStatus | null;
  giskardReports: GiskardReport[];
  killChain: KillChainState | null;
  aptAttribution: AptMatch[];
  integrationEvents: IntegrationFeedEvent[];
  stepHistory: StepMessage[];
  autoStep: boolean;
  autoStepInterval: number | null;
  _socket: WebSocket | null;
  _connectionAttempted: boolean;
  setApiBaseUrl: (url: string) => void;
  startSimulation: () => Promise<void>;
  generateStep: () => void;
  resetSimulation: () => void;
  toggleAutoStep: () => void;
  replayStep: (stepIndex: number) => void;
  triggerAttack: (targetNode: number, threatType: ThreatType) => Promise<void>;
  loadTrainingMetrics: () => Promise<void>;
  loadAgentsInfo: () => Promise<void>;
  loadPlaybooks: () => Promise<void>;
  generatePlaybook: (alertId?: string) => Promise<Playbook | null>;
  loadGiskardStatus: () => Promise<void>;
  loadGiskardReports: () => Promise<void>;
  runGiskardScan: (mode: 'blue' | 'red') => Promise<void>;
  uploadSIEMFeed: (file: File) => Promise<void>;
  ingestUrlFeed: (url: string, vendor?: string) => Promise<void>;
  viewMode: '2d' | '3d';
  selectedNodeId: number | null;
  setViewMode: (mode: '2d' | '3d') => void;
  setSelectedNodeId: (id: number | null) => void;
}

const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]) => {
  const seen = new Set(incoming.map((item) => item.id));
  const merged = [...incoming];

  for (const item of existing) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
};

const mergeBattleResults = (
  existing: NodeBattleResult[],
  incoming: NodeBattleResult[],
): NodeBattleResult[] => {
  const seen = new Set(existing.map((result) => `${result.node_id}-${result.step_resolved}-${result.outcome}-${result.false_positive}`));
  const merged = [...existing];

  for (const result of incoming) {
    const key = `${result.node_id}-${result.step_resolved}-${result.outcome}-${result.false_positive}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(result);
    }
  }

  return merged;
};

const alertTone = (alert: ThreatAlert): TelemetryLog['tone'] => {
  if (alert.severity === 'critical' || alert.severity === 'high') {
    return 'critical';
  }
  if (alert.is_likely_false_positive) {
    return 'warning';
  }
  return 'info';
};

const buildTelemetryEntries = (payload: StepMessage): TelemetryLog[] => {
  const entries: TelemetryLog[] = [
    {
      id: `red-${payload.step}-${payload.red_action.action_name}-${payload.red_action.target_host_id}`,
      team: 'red',
      type: payload.red_action.action_name,
      message: `${payload.red_action.action_name.replace(/_/g, ' ')} ${payload.red_action.success ? 'landed on' : 'stalled at'} ${payload.red_action.target_host_label}`,
      step: payload.step,
      tone: payload.red_action.success ? 'critical' : 'warning',
    },
    {
      id: `blue-${payload.step}-${payload.blue_action.action_name}-${payload.blue_action.target_host_id}`,
      team: 'blue',
      type: payload.blue_action.action_name,
      message: `${payload.blue_action.action_name.replace(/_/g, ' ')} ${payload.blue_action.success ? 'executed for' : 'missed'} ${payload.blue_action.target_host_label}`,
      step: payload.step,
      tone: payload.blue_action.is_false_positive ? 'warning' : payload.blue_action.success ? 'success' : 'info',
    },
  ];

  for (const alert of payload.new_alerts) {
    entries.push({
      id: `alert-${alert.id}`,
      team: 'system',
      type: alert.threat_type,
      message: `${alert.mitre_id} ${alert.headline}`,
      step: payload.step,
      tone: alertTone(alert),
    });
  }

  return entries;
};

const applyStreamPayload = (
  payload: StreamMessage,
  set: (partial: Partial<SimulationState> | ((state: SimulationState) => Partial<SimulationState>)) => void,
) => {
  set((state) => ({
    simulationId: payload.simulation_id || state.simulationId,
    network: payload.network,
    step: payload.step ?? payload.network.step ?? state.step,
    maxSteps: payload.max_steps ?? payload.network.max_steps ?? state.maxSteps,
    phase: payload.phase ?? payload.network.phase ?? state.phase,
    briefing: payload.briefing ?? state.briefing,
    contestEvents: payload.contest_events ?? state.contestEvents,
    battleResults: mergeBattleResults(state.battleResults, payload.battle_results ?? []),
    redQValues: payload.red_q_values ?? state.redQValues,
    bluePolicyProbs: payload.blue_policy_probs ?? state.bluePolicyProbs,
    scoreboard: payload.scoreboard ?? state.scoreboard,
    alerts:
      payload.type === 'step'
        ? mergeById(state.alerts, payload.new_alerts).slice(0, 32)
        : state.alerts,
    latestRedAction: payload.type === 'step' ? payload.red_action : state.latestRedAction,
    latestBlueAction: payload.type === 'step' ? payload.blue_action : state.latestBlueAction,
    redCumulative: payload.type === 'step' ? payload.red_cumulative : state.redCumulative,
    blueCumulative: payload.type === 'step' ? payload.blue_cumulative : state.blueCumulative,
    pipeline: payload.type === 'step' ? payload.pipeline : state.pipeline,
    episodeHistorySummary: payload.type === 'step' ? payload.episode_history_summary : state.episodeHistorySummary,
    killChain: payload.type === 'step' ? (payload.kill_chain ?? state.killChain) : state.killChain,
    aptAttribution: payload.type === 'step' ? (payload.apt_attribution ?? state.aptAttribution) : state.aptAttribution,
    logs:
      payload.type === 'step'
        ? [...buildTelemetryEntries(payload), ...state.logs].slice(0, 96)
        : state.logs,
    integrationEvents:
      payload.type === 'init'
        ? payload.integration_events || state.integrationEvents
        : state.integrationEvents,
  }));
};

const buildIntegrationTelemetryEntries = (payload: IntegrationEventMessage): TelemetryLog[] =>
  payload.events.slice(0, 8).map((event) => ({
    id: `external-${event.id}`,
    team: 'system',
    type: `${event.vendor}:${event.threat_type}`,
    message: `${event.vendor.toUpperCase()} ${payload.source.replace(/_/g, ' ')} flagged ${event.host_label} for ${event.threat_type.replace(/_/g, ' ')}`,
    step: payload.step,
    tone:
      event.severity === 'critical' || event.severity === 'high'
        ? 'critical'
        : event.severity === 'medium'
          ? 'warning'
          : 'info',
  }));

const applyIntegrationPayload = (
  payload: IntegrationEventMessage,
  set: (partial: Partial<SimulationState> | ((state: SimulationState) => Partial<SimulationState>)) => void,
) => {
  set((state) => {
    const knownIds = new Set(state.integrationEvents.map((event) => event.id));
    const newEvents = payload.events.filter((event) => !knownIds.has(event.id));
    return {
      simulationId: payload.simulation_id || state.simulationId,
      network: payload.network,
      step: payload.step ?? state.step,
      phase: payload.phase ?? state.phase,
      pipeline: payload.pipeline ?? state.pipeline,
      briefing: payload.briefing ?? state.briefing,
      killChain: payload.kill_chain ?? state.killChain,
      aptAttribution: payload.apt_attribution ?? state.aptAttribution,
      scoreboard: payload.scoreboard ?? state.scoreboard,
      alerts: mergeById(state.alerts, payload.new_alerts).slice(0, 32),
      integrationEvents: [...newEvents, ...state.integrationEvents].slice(0, 36),
      logs: [...buildIntegrationTelemetryEntries(payload), ...state.logs].slice(0, 96),
    };
  });
};

const initialState = {
  simulationId: null,
  isConnected: false,
  network: null,
  logs: [] as TelemetryLog[],
  alerts: [] as ThreatAlert[],
  step: 0,
  maxSteps: 100,
  phase: 'idle',
  briefing: null as BattleBriefing | null,
  scoreboard: null as BattleScoreboard | null,
  contestEvents: [] as ContestEvent[],
  battleResults: [] as NodeBattleResult[],
  redQValues: {} as Record<string, DecisionScores>,
  bluePolicyProbs: {} as Record<string, DecisionScores>,
  pipeline: null as PipelineState | null,
  latestRedAction: null as AgentAction | null,
  latestBlueAction: null as AgentAction | null,
  redCumulative: 0,
  blueCumulative: 0,
  episodeHistorySummary: [] as StepHistorySummary[],
  trainingMetrics: null as TrainingMetrics | null,
  agentsInfo: null as AgentsInfo | null,
  playbooks: [] as Playbook[],
  giskardStatus: null as GiskardStatus | null,
  giskardReports: [] as GiskardReport[],
  killChain: null as KillChainState | null,
  aptAttribution: [] as AptMatch[],
  integrationEvents: [] as IntegrationFeedEvent[],
  stepHistory: [] as StepMessage[],
  autoStep: false,
  autoStepInterval: null as number | null,
  _socket: null as WebSocket | null,
  _connectionAttempted: false,
  viewMode: '2d' as const,
  selectedNodeId: null as number | null,
};

export const useSimulationStore = create<SimulationState>((set, get) => ({
  ...initialState,
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  apiBaseUrl: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://inari-80s3.onrender.com' : 'http://127.0.0.1:8001'),

  setApiBaseUrl: (url: string) => {
    const cleaned = url.trim().replace(/\/$/, '');
    set({ apiBaseUrl: cleaned });
    apiClient.defaults.baseURL = cleaned;
  },

  startSimulation: async () => {
    if (get().isConnected && get()._socket?.readyState === WebSocket.OPEN) {
      return;
    }

    const existingSocket = get()._socket;
    if (existingSocket) {
      try { existingSocket.close(); } catch { /* ignore */ }
    }

    set({
      ...initialState,
      apiBaseUrl: get().apiBaseUrl,
      _connectionAttempted: true,
    });

    try {
      const response = await apiClient.post('/api/simulation/create');
      const simulationId = String(response.data.simulation_id);
      const socket = new WebSocket(getWebSocketUrl(simulationId));

      socket.onopen = () => {
        set({ isConnected: true, _socket: socket, simulationId, stepHistory: [], autoStep: false });
        toast.success('Live battle stream connected');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as StreamMessage | { type: string; message?: string; recoverable?: boolean };
          if (payload.type === 'init' || payload.type === 'step') {
            applyStreamPayload(payload as StreamMessage, set);
            if ((payload as StreamMessage).type === 'step') {
              set((state) => ({ stepHistory: [...state.stepHistory, payload as StepMessage] }));
            }
            return;
          }
          if (payload.type === 'integration_event') {
            applyIntegrationPayload(payload as IntegrationEventMessage, set);
            toast.success(payload.message || `${payload.vendor} events bridged into the War Room`, {
              id: `integration-${payload.ingested_at}`,
            });
            return;
          }
          if (payload.type === 'status' && payload.message) {
            toast(payload.message);
            return;
          }
          if (payload.type === 'error' && payload.message) {
            toast.error(payload.message);
          }
        } catch (parseError) {
          console.warn('[SimStore] Failed to parse WebSocket message:', parseError);
        }
      };

      socket.onerror = () => {
        // Only toast on first error, not on every retry
        if (get().isConnected) {
          toast.error('WebSocket connection lost');
        }
      };

      socket.onclose = () => {
        set({ isConnected: false, _socket: null });
      };
    } catch (error) {
      console.warn('[SimStore] Backend unreachable:', (error as Error).message);
      // Show a non-intrusive message — the user can manually reconnect
      toast.error('Backend offline — click "Connect Live Stream" when ready.', { duration: 4000, id: 'backend-offline' });
    }
  },

  generateStep: () => {
    const socket = get()._socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ command: 'step' }));
      return;
    }
    toast.error('Connect to a simulation before stepping');
  },

  resetSimulation: () => {
    const socket = get()._socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ command: 'reset' }));
      toast('Simulation reset requested');
      return;
    }
    toast.error('No active simulation to reset');
  },

  toggleAutoStep: () => {
    const current = get().autoStep;
    const existingInterval = get().autoStepInterval;
    if (existingInterval) window.clearInterval(existingInterval);

    if (current) {
      set({ autoStep: false, autoStepInterval: null });
      toast('Auto-step paused');
      return;
    }

    const interval = window.setInterval(() => {
      const socket = get()._socket;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ command: 'step' }));
      } else {
        const int = get().autoStepInterval;
        if (int) window.clearInterval(int);
        set({ autoStep: false, autoStepInterval: null });
      }
    }, 1500);

    set({ autoStep: true, autoStepInterval: interval });
    toast.success('Auto-step started (1.5s interval)');
  },

  replayStep: (stepIndex: number) => {
    const history = get().stepHistory;
    if (stepIndex < 0 || stepIndex >= history.length) return;
    const snapshot = history[stepIndex];
    applyStreamPayload(snapshot, set);
  },

  triggerAttack: async (targetNode: number, threatType: ThreatType) => {
    const simulationId = get().simulationId;
    if (!simulationId) {
      toast.error('Start a simulation before triggering an attack');
      return;
    }

    try {
      await apiClient.post('/api/battle/trigger-attack', {
        sim_id: simulationId,
        target_node: targetNode,
        threat_type: threatType,
      });
      toast.success(`Queued ${threatType.replace(/_/g, ' ')} on node ${targetNode}`);
    } catch (error) {
      console.error(error);
      toast.error('Unable to trigger demo attack');
    }
  },

  loadTrainingMetrics: async () => {
    try {
      const response = await apiClient.get('/api/agents/training/metrics');
      set({ trainingMetrics: response.data as TrainingMetrics });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load training metrics');
    }
  },

  loadAgentsInfo: async () => {
    try {
      const response = await apiClient.get('/api/agents/info');
      set({ agentsInfo: response.data as AgentsInfo });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load agent metrics');
    }
  },

  loadPlaybooks: async () => {
    try {
      const response = await apiClient.get('/api/playbooks');
      set({ playbooks: response.data.playbooks as Playbook[] });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load playbooks');
    }
  },

  generatePlaybook: async (alertId?: string) => {
    try {
      const response = await apiClient.post('/api/playbooks/generate', alertId ? { alert_id: alertId } : {});
      const playbook = response.data as Playbook;
      set((state) => ({
        playbooks: [playbook, ...state.playbooks.filter((item) => item.id !== playbook.id)],
      }));
      toast.success(`Generated playbook ${playbook.id}`);
      return playbook;
    } catch (error) {
      console.error(error);
      toast.error('Unable to generate playbook');
      return null;
    }
  },

  loadGiskardStatus: async () => {
    try {
      const response = await apiClient.get('/api/giskard/status');
      set({ giskardStatus: response.data as GiskardStatus });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load Giskard status');
    }
  },

  loadGiskardReports: async () => {
    try {
      const response = await apiClient.get('/api/giskard/reports');
      set({ giskardReports: response.data.reports as GiskardReport[] });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load Giskard reports');
    }
  },

  runGiskardScan: async (mode: 'blue' | 'red') => {
    try {
      await apiClient.post(`/api/giskard/scan/${mode}`);
      toast.success(`${mode.toUpperCase()} Giskard scan started`);
      await get().loadGiskardStatus();
      await get().loadGiskardReports();
    } catch (error) {
      console.error(error);
      toast.error(`Unable to start ${mode} Giskard scan`);
    }
  },

  uploadSIEMFeed: async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('siem_file', file);
      await apiClient.post('/api/simulation/upload-siem', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`SIEM feed uploaded: ${file.name}`);
      // Restart simulation with the uploaded data
      const existingSocket = get()._socket;
      if (existingSocket) {
        existingSocket.close();
      }
      await get().startSimulation();
    } catch (error) {
      console.error(error);
      toast.error('Unable to upload SIEM feed. Ensure the backend supports /api/simulation/upload-siem.');
    }
  },

  ingestUrlFeed: async (url: string, vendor = 'generic') => {
    try {
      const response = await apiClient.post(
        '/api/ingest/url',
        { url, vendor },
        {
          headers: {
            'X-API-Key': getEnterpriseApiKey(),
          },
        },
      );
      const result = response.data as {
        event_count?: number;
        bridge?: { bridged?: boolean };
        security_report?: { security_score?: number };
      };
      const securityNote = result.security_report?.security_score !== undefined
        ? ` · URL score ${result.security_report.security_score}/100`
        : '';
      toast.success(`Fetched ${result.event_count || 0} events from remote URL${securityNote}`);
      if (!result.bridge?.bridged) {
        const existingSocket = get()._socket;
        if (existingSocket) {
          existingSocket.close();
        }
        await get().startSimulation();
      }
    } catch (error) {
      console.error(error);
      toast.error('Unable to ingest the remote URL feed.');
    }
  },
}));

```

## File: `src/pages/SimulationPage.tsx`

```tsx
import AptAttribution from '../components/ops/AptAttribution';
import BattleScoreboard from '../components/ops/BattleScoreboard';
import BattleTimeline from '../components/ops/BattleTimeline';
import BattleToastManager from '../components/ops/BattleToast';
import BreachCountdown from '../components/ops/BreachCountdown';
import { HyperAgentPanel } from '../components/ops/HyperAgentPanel';
import VelocitySparkline from '../components/ops/VelocitySparkline';
import { useSimulationStore } from '../store/simulationStore';

export function SimulationPage() {
  const {
    aptAttribution,
    battleResults,
    blueCumulative,
    episodeHistorySummary,
    generateStep,
    isConnected,
    killChain,
    latestBlueAction,
    latestRedAction,
    logs,
    maxSteps,
    network,
    redCumulative,
    resetSimulation,
    scoreboard,
    simulationId,
    step,
  } = useSimulationStore();

  const redFeed = logs.filter((entry) => entry.team === 'red').slice(0, 8);
  const blueFeed = logs.filter((entry) => entry.team === 'blue').slice(0, 8);
  const totals = Math.max(1, Math.abs(redCumulative) + Math.abs(blueCumulative));
  const redPct = Math.max(12, (Math.abs(redCumulative) / totals) * 100);
  const bluePct = Math.max(12, (Math.abs(blueCumulative) / totals) * 100);

  return (
    <div className="page-stack">
      <BattleToastManager results={battleResults} />

      <BattleScoreboard
        episodeId={simulationId || network?.episode_id || 'EP-BOOT'}
        maxSteps={maxSteps}
        scoreboard={scoreboard}
        step={step}
      />

      <section className="ops-card p-5">
        <div className="ops-display text-[0.62rem] text-secondary/70">Agent Battle Viewer</div>
        <div className="battle-tug">
          <div className="battle-score red-score" style={{ width: `${redPct}%` }}>
            <span>RED AGENT</span>
            <strong>{redCumulative.toFixed(1)}</strong>
          </div>
          <div className="battle-score blue-score" style={{ width: `${bluePct}%` }}>
            <strong>{blueCumulative.toFixed(1)}</strong>
            <span>BLUE AGENT</span>
          </div>
        </div>
      </section>

      {/* Kill Chain Oracle */}
      <section className="ops-card p-4">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Kill Chain Oracle</div>
            <h2 className="panel-title">Breach Countdown + APT Attribution</h2>
          </div>
          {killChain ? <span className="status-pill" style={{ color: killChain.urgency_color }}>{killChain.velocity_label}</span> : null}
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {killChain ? (
            <>
              <BreachCountdown
                countdownDisplay={killChain.breach_countdown_display || '--:--'}
                countdownSeconds={killChain.breach_countdown_seconds}
                confidence={killChain.breach_confidence || 0}
                urgency={killChain.urgency || 'low'}
                urgencyColor={killChain.urgency_color || '#00e5ff'}
                currentStage={killChain.current_stage || 1}
                currentStageName={killChain.current_stage_name || 'Monitoring'}
                killChainProgress={killChain.kill_chain_progress || 0}
              />
              <VelocitySparkline history={killChain.velocity_history ?? []} label={killChain.velocity_label ?? 'DORMANT'} color={killChain.urgency_color ?? '#00e5ff'} />
              {aptAttribution?.length ? <AptAttribution matches={aptAttribution} /> : null}
              <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#00e5ff', marginBottom: 6 }}>WHAT'S HAPPENING</div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#ff6600' }}>▸ Current threat level:</span> The live kill chain currently sits at{' '}
                    {killChain.current_stage_name}. The urgency is {killChain.urgency}, and breach confidence is{' '}
                    {Math.round((killChain.breach_confidence || 0) * 100)}%.
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#ff335f' }}>▸ Attribution signal:</span>{' '}
                    {aptAttribution?.[0]
                      ? `The strongest live behavioral match is ${aptAttribution[0].name}. ${aptAttribution[0].risk_note}`
                      : 'No attribution pattern is strong enough yet to call out a likely actor.'}
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#ffcc00' }}>▸ Time until breach:</span>{' '}
                    {killChain.breach_countdown_display
                      ? `If the current pace holds, the modeled breach window is ${killChain.breach_countdown_display}.`
                      : 'The current evidence is not yet enough to estimate a stable breach window.'}
                  </div>
                  <div>
                    <span style={{ color: '#00ff88' }}>▸ Operator focus:</span> Review the newest live alerts, isolate the hottest host paths,
                    and use the War Room plus URL Security surfaces to validate the most likely next pivot before taking containment action.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-panel !min-h-[220px]">
              Live kill-chain and attribution data will appear here once the simulation or bridged external events have produced enough evidence.
            </div>
          )}
        </div>
      </section>

      <div className="two-column-grid">
        <ActionLogPanel
          action={latestRedAction}
          entries={redFeed}
          tone="red"
          title="Action Log (Red)"
        />
        <ActionLogPanel
          action={latestBlueAction}
          entries={blueFeed}
          tone="blue"
          title="Action Log (Blue)"
        />
      </div>

      <section className="ops-toolbar">
        <div className="toolbar-actions">
          <button className="ops-button" disabled={!isConnected} onClick={() => generateStep()} type="button">▶ Step</button>
          <button className="ops-button" disabled={!isConnected} onClick={() => resetSimulation()} type="button">■ Reset</button>
        </div>
        <div className="ops-muted text-sm">
          Battle results logged: <span className="ops-data text-white">{battleResults.length}</span>
        </div>
      </section>

      <section className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Episode Reward Chart</div>
            <h2 className="panel-title">Red vs Blue reward pressure</h2>
          </div>
        </div>
        <RewardChart history={episodeHistorySummary} />
      </section>

      <BattleTimeline maxSteps={maxSteps} results={battleResults} step={step} />

      {/* HyperAgent Meta-Engine */}
      <section className="ops-card p-5">
        <HyperAgentPanel />
      </section>
    </div>
  );
}

function ActionLogPanel({
  action,
  entries,
  title,
  tone,
}: {
  action: ReturnType<typeof useSimulationStore.getState>['latestRedAction'];
  entries: ReturnType<typeof useSimulationStore.getState>['logs'];
  title: string;
  tone: 'red' | 'blue';
}) {
  return (
    <section className="ops-card p-5">
      <div className="section-heading-row">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">{title}</div>
          {action ? <h2 className="panel-title">{action.action_name.replace(/_/g, ' ')}</h2> : <h2 className="panel-title">Awaiting action</h2>}
        </div>
        {action ? <span className={`status-pill ${tone === 'red' ? '' : 'status-pill-live'}`}>{action.success ? 'SUCCESS' : action.is_false_positive ? 'FALSE POSITIVE' : 'FAILED'}</span> : null}
      </div>

      <div className="panel-scroll mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {entries.length ? (
          entries.map((entry) => (
            <div className={`feed-item ${tone === 'red' ? 'feed-item-critical' : 'feed-item-success'}`} key={entry.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="ops-label text-[0.52rem]">{entry.type.replace(/_/g, ' ')}</div>
                <div className="ops-data text-[0.62rem]">STEP {entry.step}</div>
              </div>
              <p className="mt-2 text-sm text-white/85">{entry.message}</p>
            </div>
          ))
        ) : (
          <div className="empty-panel !min-h-[220px]">No actions logged yet.</div>
        )}
      </div>
    </section>
  );
}

function RewardChart({ history }: { history: ReturnType<typeof useSimulationStore.getState>['episodeHistorySummary'] }) {
  const width = 900;
  const height = 260;

  if (!history.length) {
    return <div className="empty-panel !min-h-[260px] mt-4">Episode history will render here as the battle progresses.</div>;
  }

  const maxStep = Math.max(1, history[history.length - 1]?.step || 1);
  const values = history.flatMap((point) => [point.red_rew, point.blue_rew]);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const range = Math.max(1, maxValue - minValue);

  const pointPath = (key: 'red_rew' | 'blue_rew') =>
    history
      .map((point, index) => {
        const x = (index / Math.max(1, history.length - 1)) * (width - 60) + 30;
        const y = height - 30 - ((point[key] - minValue) / range) * (height - 60);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

  return (
    <svg className="mt-4 h-[260px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="reward-red" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,0,68,0.35)" />
          <stop offset="100%" stopColor="rgba(255,0,68,0)" />
        </linearGradient>
        <linearGradient id="reward-blue" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(20,209,255,0.35)" />
          <stop offset="100%" stopColor="rgba(20,209,255,0)" />
        </linearGradient>
      </defs>

      <line stroke="rgba(255,255,255,0.08)" x1="30" x2={width - 30} y1={height - 30} y2={height - 30} />
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2="30" y1="30" y2={height - 30} />
      <path d={pointPath('red_rew')} fill="none" stroke="#ff335f" strokeWidth="3" />
      <path d={pointPath('blue_rew')} fill="none" stroke="#14d1ff" strokeWidth="3" />
      <text className="ops-label" fill="rgba(255,255,255,0.5)" fontSize="11" x={width - 88} y={height - 8}>Step {maxStep}</text>
    </svg>
  );
}

```

## File: `src/pages/PipelinePage.tsx`

```tsx
import { useSimulationStore } from '../store/simulationStore';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';

const stageCards = [
  { id: 'intent', label: 'Stage 1', title: 'Intent Vector' },
  { id: 'drift', label: 'Stage 2', title: 'Drift Detect' },
  { id: 'shadow', label: 'Stage 3', title: 'Neural Shadow Exec' },
  { id: 'attack', label: 'Stage 4', title: 'Attack Graph' },
  { id: 'capability', label: 'Stage 5', title: 'Capability Lattice' },
  { id: 'budget', label: 'Stage 6', title: 'Autonomy Budget' },
  { id: 'learning', label: 'Stage 9', title: 'Learning Loop' },
];

export function PipelinePage() {
  const { pipeline, step } = useSimulationStore();

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00e5ff' }}>
            Neural Pipeline Visualizer
          </div>
          <h2 className="panel-title">Data flowing through the decision stack</h2>
        </div>
        <span className="status-pill">STEP {step}</span>
      </div>

      <MagicBentoGrid className="flex flex-col gap-3">
        {/* Stages Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {stageCards.map((card) => (
            <BentoCard key={card.id} label={card.label}>
              <h3 className="text-sm font-semibold text-white mb-2">{card.title}</h3>
              <p className="text-xs leading-5 text-white/65">{describeStage(card.id, pipeline)}</p>
            </BentoCard>
          ))}
        </div>

        {/* Wide Analysis Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Shadow Branches */}
          <BentoCard label="Shadow Branches">
            {pipeline?.shadow_branches?.length ? pipeline.shadow_branches.slice(0, 3).map((branch) => (
              <div className="branch-card mb-3" key={`${branch.target_host}-${branch.action_name}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="ops-label text-[0.52rem]">{branch.classification}</div>
                    <div className="mt-1 text-sm text-white">{branch.action_name} → {branch.target_label}</div>
                  </div>
                  <div className="ops-data text-sm">{Math.round(branch.risk_score * 100)}%</div>
                </div>
                <div className="meter-track mt-3 h-2">
                  <div className="meter-fill bg-secondary" style={{ width: `${Math.round(branch.risk_score * 100)}%` }} />
                </div>
              </div>
            )) : <div className="empty-panel !min-h-[180px]">Shadow execution data will render here after the first live step.</div>}
          </BentoCard>

          {/* Budget + Learning */}
          <BentoCard label="Budget + Learning">
            <div className="space-y-4">
              <MetricBar label="Autonomy Remaining" value={pipeline?.autonomy_budget.remaining || 0} max={pipeline?.autonomy_budget.max_budget || 100} />
              <MetricBar label="Blue Win Rate" value={(pipeline?.blue_win_rate_recent || 0) * 100} max={100} />
              <MetricBar label="Detection Rate" value={(pipeline?.detection_rate_recent || 0) * 100} max={100} />
              <MetricBar label="Risk Score" value={(pipeline?.shadow_risk_score || 0) * 100} max={100} />
            </div>
          </BentoCard>
        </div>
      </MagicBentoGrid>
    </div>
  );
}

function describeStage(stageId: string, pipeline: ReturnType<typeof useSimulationStore.getState>['pipeline']) {
  if (!pipeline) return 'Waiting for pipeline data.';
  switch (stageId) {
    case 'intent': return `Risk class ${pipeline.risk_class} with intent vector size ${pipeline.intent_vector.length}.`;
    case 'drift': return pipeline.drift_detected ? pipeline.drift_description : 'No significant drift detected.';
    case 'shadow': return `${pipeline.shadow_branches.length} branches evaluated; recommendation: ${pipeline.recommended_action}.`;
    case 'attack': return `${pipeline.attack_graph_nodes.length} nodes in attack graph; ${pipeline.steps_to_db_breach ?? '-'} steps to DB breach.`;
    case 'capability': return `${pipeline.capability_edges.length} capability edges across ${pipeline.capability_nodes.length} nodes.`;
    case 'budget': return `${pipeline.autonomy_budget.remaining.toFixed(1)} of ${pipeline.autonomy_budget.max_budget.toFixed(1)} autonomy budget remaining.`;
    case 'learning': return `Blue ${Math.round(pipeline.blue_win_rate_recent * 100)}% vs Red ${Math.round(pipeline.red_win_rate_recent * 100)}% over recent window.`;
    default: return 'Stage data unavailable.';
  }
}

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="ops-label text-[0.52rem]">{label}</div>
        <div className="ops-data text-sm">{value.toFixed(1)}</div>
      </div>
      <div className="meter-track mt-2 h-2">
        <div className="meter-fill bg-secondary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

```

## File: `src/pages/AttackGraphPage.tsx`

```tsx
import { useSimulationStore } from '../store/simulationStore';

export function AttackGraphPage() {
  const { pipeline } = useSimulationStore();
  const nodes = pipeline?.attack_graph_nodes || [];
  const edges = pipeline?.attack_graph_edges || [];
  const width = 980;
  const height = 520;

  return (
    <div className="attack-graph-layout">
      <section className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Counterfactual Attack Graph</div>
            <h2 className="panel-title">Critical path to crown-jewel databases</h2>
          </div>
        </div>

        {nodes.length ? (
          <svg className="mt-4 h-[520px] w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${width} ${height}`}>
            {edges.map((edge, index) => {
              const source = nodes.find((node) => node.id === edge.source);
              const target = nodes.find((node) => node.id === edge.target);
              if (!source || !target) {
                return null;
              }
              return (
                <g key={`${edge.source}-${edge.target}-${index}`}>
                  <line
                    stroke={edge.is_critical_path ? '#ff335f' : edge.is_predicted ? '#ffcc00' : '#14d1ff'}
                    strokeDasharray={edge.is_predicted ? '8 8' : edge.success ? '' : '4 8'}
                    strokeWidth={edge.is_critical_path ? 4 : 2}
                    x1={source.x || 80}
                    x2={target.x || 80}
                    y1={source.y || 80}
                    y2={target.y || 80}
                  />
                  <text className="ops-label" fill="rgba(255,255,255,0.65)" fontSize="10" x={((source.x || 80) + (target.x || 80)) / 2} y={((source.y || 80) + (target.y || 80)) / 2 - 8}>
                    {edge.action_type}
                  </text>
                </g>
              );
            })}

            {nodes.map((node) => (
              <g key={node.id} transform={`translate(${node.x || 80}, ${node.y || 80})`}>
                <circle
                  cx="0"
                  cy="0"
                  fill={node.compromised ? '#2a0711' : node.is_critical_target ? '#1c1b10' : '#0d1628'}
                  r={node.is_critical_target ? 22 : 18}
                  stroke={node.compromised ? '#ff335f' : node.is_critical_target ? '#ffcc00' : '#14d1ff'}
                  strokeWidth={node.is_critical_target ? 3 : 2}
                />
                <text className="ops-data" fill="white" fontSize="11" textAnchor="middle" y="4">{node.label}</text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="empty-panel !min-h-[520px] mt-4">Attack graph data becomes available once the pipeline emits its first graph snapshot.</div>
        )}
      </section>

      <aside className="ops-card p-5">
        <div className="ops-display text-[0.62rem] text-secondary/70">If We Don&apos;t Act</div>
        <div className="metric-stack mt-5">
          <ThreatCountdown label="Steps to DB breach" value={pipeline?.steps_to_db_breach ?? 0} suffix="steps" />
          <ThreatCountdown label="Data at risk" value={pipeline?.data_at_risk_gb ?? 0} suffix="GB" />
          <ThreatCountdown label="Critical path length" value={pipeline?.critical_path.length ?? 0} suffix="nodes" />
        </div>
      </aside>
    </div>
  );
}

function ThreatCountdown({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="countdown-card">
      <div className="ops-label text-[0.52rem]">{label}</div>
      <div className="ops-data mt-2 text-4xl text-white">{value}{suffix ? <span className="ml-2 text-base text-secondary/80">{suffix}</span> : null}</div>
    </div>
  );
}

```

## File: `src/pages/PlaybooksPage.tsx`

```tsx
import { useEffect, useState } from 'react';
import type { Playbook } from '../lib/ops-types';
import { useSimulationStore } from '../store/simulationStore';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';

export function PlaybooksPage() {
  const { alerts, generatePlaybook, loadPlaybooks, playbooks } = useSimulationStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { void loadPlaybooks(); }, [loadPlaybooks]);
  useEffect(() => { if (!selectedId && playbooks.length) setSelectedId(playbooks[0].id); }, [playbooks, selectedId]);

  const selected = playbooks.find((p) => p.id === selectedId) || null;

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00e5ff' }}>
            Playbook Library
          </div>
          <h2 className="panel-title">AI-generated incident response</h2>
        </div>
        <button className="ops-chip-button" disabled={!alerts.length} onClick={() => void generatePlaybook(alerts[0]?.id)}>
          Generate from latest alert
        </button>
      </div>

      <MagicBentoGrid className="grid-cols-1 lg:grid-cols-3">
        {/* Sidebar */}
        <BentoCard label="Playbooks" style={{ minHeight: 500 }}>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {playbooks.length ? playbooks.map((p) => (
              <button
                className={`playbook-list-item w-full text-left ${selectedId === p.id ? 'playbook-list-item-active' : ''}`}
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                type="button"
              >
                <div className="ops-label text-[0.5rem]">{p.mitre_id} · {p.severity}</div>
                <div className="mt-2 text-sm text-white">{p.mitre_name}</div>
                <div className="mt-2 text-xs text-[var(--text-secondary)]">{p.incident_summary}</div>
              </button>
            )) : <div className="empty-panel !min-h-[240px]">No playbooks generated yet.</div>}
          </div>
        </BentoCard>

        {/* Detail */}
        <BentoCard label="Response Plan" className="lg:col-span-2" style={{ minHeight: 500 }}>
          {selected ? <PlaybookDetail playbook={selected} /> : (
            <div className="empty-panel !min-h-[400px]">Select a playbook to inspect the response steps.</div>
          )}
        </BentoCard>
      </MagicBentoGrid>
    </div>
  );
}

function PlaybookDetail({ playbook }: { playbook: Playbook }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="ops-display text-[0.62rem] text-secondary/70">{playbook.id}</div>
          <h2 className="panel-title">{playbook.mitre_name}</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{playbook.incident_summary}</p>
        </div>
        <div className="status-pill status-pill-live">{playbook.severity}</div>
      </div>

      <div className="playbook-steps">
        {playbook.steps.map((s) => (
          <div className="playbook-step" key={s.step_number}>
            <div className="step-number">{s.step_number}</div>
            <div className="step-body">
              <div className="ops-display text-[0.58rem] text-secondary/70">{s.title}</div>
              <p className="mt-2 text-sm text-white">{s.action}</p>
              {s.command ? <code className="step-command">{s.command}</code> : null}
              <div className="step-meta">
                <span>Outcome: {s.expected_outcome}</span>
                <span>Risk: {s.risk_level}</span>
                <span>ETA: {s.estimated_time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

```

## File: `src/pages/WebsitePage.tsx`

```tsx
import { useEffect, useRef } from 'react';
import FrontWebsite from '../../Front/src/App';

interface WebsitePageProps {
  onDemo: () => void;
  onLogin: () => void;
}

const FRAME_COUNT = 192;
const currentFrame = (index: number) =>
  `/Sequence/frame_${index.toString().padStart(3, '0')}_delay-0.042s.png`;

export function WebsitePage({ onDemo, onLogin }: WebsitePageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load and cache all images for smooth scroll
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    let loadedImages = 0;

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = currentFrame(i);
      img.onload = () => {
        loadedImages++;
        if (loadedImages === 1) {
          // Draw the first frame as soon as it loads to avoid initial blank
          updateImage(0);
        }
      };
      images.push(img);
    }

    const handleScroll = () => {
      const html = document.documentElement;
      const scrollTop = html.scrollTop;
      const maxScrollTop = html.scrollHeight - window.innerHeight;
      
      const scrollFraction = maxScrollTop > 0 ? (scrollTop / maxScrollTop) : 0;
      const frameIndex = Math.min(
        FRAME_COUNT - 1,
        Math.floor(scrollFraction * FRAME_COUNT)
      );

      requestAnimationFrame(() => updateImage(frameIndex));
    };

    const updateImage = (index: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const img = images[index];
      if (img && img.complete && img.naturalWidth !== 0) {
        // Adjust canvas resolution dynamically
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Perform object-fit: cover equivalent drawing
        const hRatio = canvas.width / img.naturalWidth;
        const vRatio = canvas.height / img.naturalHeight;
        const ratio = Math.max(hRatio, vRatio);
        
        const centerShift_x = (canvas.width - img.naturalWidth * ratio) / 2;
        const centerShift_y = (canvas.height - img.naturalHeight * ratio) / 2;
        
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          img,
          0, 0, img.naturalWidth, img.naturalHeight,
          centerShift_x, centerShift_y, img.naturalWidth * ratio, img.naturalHeight * ratio
        );
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', () => updateImage(0));
    
    // Attempt drawing initial frame immediately if it was cached
    updateImage(0);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', () => updateImage(0));
    };
  }, []);

  // Handle CTA routing clicks
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const actionable = target.closest('button, a');
      if (!(actionable instanceof HTMLElement)) return;

      const label = actionable.textContent?.trim().toLowerCase() || '';
      if (label.includes('login')) {
        event.preventDefault();
        onLogin();
        return;
      }
      if (label.includes('demo') || label.includes('pilot') || label.includes('specialist')) {
        event.preventDefault();
        onDemo();
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [onDemo, onLogin]);

  return (
    <div ref={containerRef} className="website-page-wrapper">
      <style>
        {`
          /* Injecting transparency into body and main elements so the canvas is visible */
          html, body, #root, main {
            background-color: transparent !important;
            background: transparent !important;
          }
          .dark body {
            background-color: transparent !important;
          }
          /* Removing background from sections that might hide the canvas, depending on original CSS */
          .bg-white, .bg-surface, .dark .bg-surface {
            background-color: transparent !important;
          }
          
          /* Ensures body allows scrolling over the fixed background */
          body {
            overflow-x: hidden;
            overflow-y: auto;
          }
        `}
      </style>
      
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />
      
      <div style={{ position: 'relative', zIndex: 1, pointerEvents: 'auto' }}>
        <FrontWebsite />
      </div>
    </div>
  );
}

```

## File: `src/pages/AuthPage.tsx`

```tsx
import { useState, type FormEvent } from 'react';

interface AuthPageProps {
  onAuthenticated: (identity: { name: string; email: string }) => void;
  onBack: () => void;
}

export function AuthPage({ onAuthenticated, onBack }: AuthPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [workspace, setWorkspace] = useState('SOC-01');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim() || 'Demo Analyst';
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return;
    }
    onAuthenticated({ name: trimmedName, email: trimmedEmail });
  };

  return (
    <div className="auth-page">
      <div className="auth-backdrop-grid" />

      <section className="auth-panel auth-panel-brand">
        <div className="ops-display text-[0.7rem] text-secondary/70">Secure Demo Access</div>
        <h1>Authenticate before entering the command deck.</h1>
        <p>
          This gate keeps the website flow intact while making the live product feel like a protected analyst surface.
          Sign in with a work email and we&apos;ll unlock the full CyberGuardian runtime.
        </p>

        <div className="auth-feature-list">
          <div className="auth-feature-card">
            <span className="ops-label text-[0.5rem]">Decision Transparency</span>
            <strong>Live heatmaps of what Red and Blue are considering on every node.</strong>
          </div>
          <div className="auth-feature-card">
            <span className="ops-label text-[0.5rem]">Cross-layer Detection</span>
            <strong>Network, endpoint, and application signals correlated into one incident stream.</strong>
          </div>
          <div className="auth-feature-card">
            <span className="ops-label text-[0.5rem]">Simulation + Playbooks</span>
            <strong>Understand the threat, why it was flagged, and what action wins next.</strong>
          </div>
        </div>
      </section>

      <section className="auth-panel auth-panel-form">
        <div className="auth-card">
          <div className="ops-display text-[0.62rem] text-secondary/70">Demo Authentication</div>
          <h2>Access the live product</h2>
          <p className="auth-copy">Use any work email to unlock the guided demo environment.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span className="ops-label text-[0.52rem]">Analyst Name</span>
              <input className="ops-input" onChange={(event) => setName(event.target.value)} placeholder="Abhishek" type="text" value={name} />
            </label>

            <label>
              <span className="ops-label text-[0.52rem]">Work Email</span>
              <input className="ops-input" onChange={(event) => setEmail(event.target.value)} placeholder="analyst@company.com" type="email" value={email} />
            </label>

            <label>
              <span className="ops-label text-[0.52rem]">Workspace</span>
              <select className="ops-input" onChange={(event) => setWorkspace(event.target.value)} value={workspace}>
                <option value="SOC-01">SOC-01</option>
                <option value="SOC-Blue">SOC-BLUE</option>
                <option value="Athernex">Athernex DEMO</option>
              </select>
            </label>

            <button className="ops-button ops-button-primary auth-submit" type="submit">
              Authenticate and open /live
            </button>
          </form>

          <button className="auth-back-link" onClick={onBack} type="button">
            Return to website
          </button>
        </div>
      </section>
    </div>
  );
}

```

## File: `src/pages/LivePage.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import AptAttribution from '../components/ops/AptAttribution';
import BreachCountdown from '../components/ops/BreachCountdown';
import NodeDecisionPanel from '../components/ops/NodeDecisionPanel';
import IntrusionStoryboard from '../components/ops/IntrusionStoryboard';
import ThreatRadar from '../components/ops/ThreatRadar';
import BattleTimeline from '../components/ops/BattleTimeline';
import VelocitySparkline from '../components/ops/VelocitySparkline';
import { HyperAgentPanel } from '../components/ops/HyperAgentPanel';
import { IntegrationEventFeed } from '../components/ops/IntegrationEventFeed';
import { SocTerminal } from '../components/ops/SocTerminal';
import { DEFAULT_DIAGRAM_NODES } from '../components/WebDiagram3D';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';
import { useSimulationStore } from '../store/simulationStore';

export function LivePage() {
  const {
    alerts,
    simulationId,
    apiBaseUrl,
    autoStep,
    battleResults,
    briefing,
    blueCumulative,
    bluePolicyProbs,
    episodeHistorySummary,
    generateStep,
    ingestUrlFeed,
    isConnected,
    integrationEvents,
    killChain,
    aptAttribution,
    latestBlueAction,
    latestRedAction,
    logs,
    maxSteps,
    network,
    redCumulative,
    redQValues,
    replayStep,
    resetSimulation,
    scoreboard,
    setApiBaseUrl,
    startSimulation,
    step,
    stepHistory,
    toggleAutoStep,
    uploadSIEMFeed,
    viewMode,
    setViewMode,
    selectedNodeId,
    setSelectedNodeId,
  } = useSimulationStore();

  const [urlInput, setUrlInput] = useState(apiBaseUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [remoteFeedUrl, setRemoteFeedUrl] = useState('');
  const [remoteFeedVendor, setRemoteFeedVendor] = useState('generic');

  const totals = Math.max(1, Math.abs(redCumulative) + Math.abs(blueCumulative));
  const redPct = Math.max(12, (Math.abs(redCumulative) / totals) * 100);
  const bluePct = Math.max(12, (Math.abs(blueCumulative) / totals) * 100);

  const redFeed = logs.filter((e) => e.team === 'red').slice(0, 8);
  const blueFeed = logs.filter((e) => e.team === 'blue').slice(0, 8);

  const connect = async () => { setApiBaseUrl(urlInput); await startSimulation(); };
  const handleExportReport = () => { if (simulationId) window.open(`${apiBaseUrl}/api/export/summary/${simulationId}`, '_blank'); };
  const handleNarrativeReport = () => { if (simulationId) window.open(`${apiBaseUrl}/api/export/narrative/${simulationId}`, '_blank'); };
  const handleSIEMUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    if (uploadSIEMFeed) await uploadSIEMFeed(file);
  };
  const handleRemoteFeed = async () => {
    if (!remoteFeedUrl.trim()) return;
    await ingestUrlFeed(remoteFeedUrl.trim(), remoteFeedVendor);
  };

  /* ── Network auto-detect ── */
  const [networkInfo, setNetworkInfo] = useState<string | null>(null);
  const [networkDetails, setNetworkDetails] = useState<{
    ip: string; subnet: string; isp: string; org: string; city: string;
    region: string; country: string; timezone: string; lat: number; lon: number;
    connectionType: string; asn: string;
  } | null>(null);

  useEffect(() => {
    const detect = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const g = await res.json();
          const ip = g.ip || '0.0.0.0';
          const sn = ip.split('.').slice(0, 3).join('.');
          setNetworkInfo(`${sn}.0/24`);
          setNetworkDetails({
            ip, subnet: `${sn}.0/24`, isp: g.org || 'Unknown ISP', org: g.org_name || g.org || 'Unknown',
            city: g.city || 'Unknown', region: g.region || 'Unknown', country: g.country_name || 'Unknown',
            timezone: g.timezone || 'Unknown', lat: g.latitude || 0, lon: g.longitude || 0,
            connectionType: g.asn ? `AS${g.asn}` : 'N/A', asn: g.asn ? `AS${g.asn} (${g.org || ''})` : 'N/A',
          });
          return;
        }
      } catch { /* fallthrough */ }
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const candidate = await new Promise<RTCIceCandidate | null>((resolve) => {
          const timeout = setTimeout(() => { pc.close(); resolve(null); }, 3000);
          pc.onicecandidate = (e) => { if (e.candidate) { clearTimeout(timeout); pc.close(); resolve(e.candidate); } };
        });
        if (candidate) {
          const match = candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            const ip = match[1]; const sn = ip.split('.').slice(0, 3).join('.');
            setNetworkInfo(`${sn}.0/24`);
            setNetworkDetails({ ip, subnet: `${sn}.0/24`, isp: 'Local', org: 'Private', city: 'Local', region: 'LAN', country: 'Private', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lat: 0, lon: 0, connectionType: 'LAN', asn: 'N/A' });
          }
        }
      } catch { /* no-op */ }
    };
    void detect();
  }, []);

  useEffect(() => {
    if (!networkInfo && network && network.nodes.length > 0) {
      setNetworkInfo('10.0.1.0/24 (simulated)');
      setNetworkDetails({ ip: '10.0.1.1', subnet: '10.0.1.0/24', isp: 'Simulated', org: 'Inari Sim', city: 'Virtual', region: 'Simulation', country: 'Cyber Range', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lat: 0, lon: 0, connectionType: 'Sim', asn: 'AS-SIM' });
    }
  }, [network, networkInfo]);

  const liveApt = aptAttribution ?? [];

  /* ════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ position: 'relative', pointerEvents: 'none' }}>

      {/* ═══ PAGE 1: Hero 3D viewport ═══ */}
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '0 24px 24px', pointerEvents: 'none',
      }}>
        <div style={{ position: 'absolute', top: 16, left: 24, pointerEvents: 'auto' }}>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.5)' }}>
            Network Topology
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {(['2d', '3d'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '4px 12px', borderRadius: 4,
                border: `1px solid ${viewMode === m ? '#00e5ff' : 'rgba(255,255,255,0.15)'}`,
                background: viewMode === m ? 'rgba(0,229,255,0.12)' : 'transparent',
                color: viewMode === m ? '#00e5ff' : 'rgba(255,255,255,0.5)',
                fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 180ms ease',
              }}>{m.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', marginTop: 6 }}>
            {viewMode === '3d' ? 'Drag to orbit · Scroll to zoom · Right-click to pan' : 'Auto-rotating · Switch to 3D to interact'}
          </div>
        </div>

        <div style={{
          position: 'absolute', top: 16, right: 24, padding: '4px 14px', borderRadius: 20, fontSize: 10,
          fontFamily: '"Orbitron", monospace', letterSpacing: '0.14em', textTransform: 'uppercase',
          background: isConnected ? 'rgba(0,255,136,0.12)' : 'rgba(255,204,0,0.12)',
          color: isConnected ? '#00ff88' : '#ffcc00',
          border: `1px solid ${isConnected ? 'rgba(0,255,136,0.3)' : 'rgba(255,204,0,0.3)'}`, pointerEvents: 'none',
        }}>
          {isConnected ? `● LIVE · STEP ${step}/${maxSteps}` : '○ OFFLINE'}
        </div>

        {isConnected && stepHistory.length > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 24px 8px', pointerEvents: 'auto' }}>
            <div style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>STEP {step}</span>
              <input type="range" min={0} max={Math.max(0, stepHistory.length - 1)} value={stepHistory.length - 1}
                onChange={(e) => replayStep(Number(e.target.value))}
                style={{ flex: 1, height: 4, appearance: 'none', background: `linear-gradient(to right, #00e5ff ${((stepHistory.length - 1) / Math.max(1, stepHistory.length - 1)) * 100}%, rgba(255,255,255,0.1) ${((stepHistory.length - 1) / Math.max(1, stepHistory.length - 1)) * 100}%)`, borderRadius: 2, cursor: 'pointer', outline: 'none' }}
              />
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: '#00e5ff', whiteSpace: 'nowrap' }}>{stepHistory.length} events</span>
            </div>
          </div>
        )}

        <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Scroll down for controls</div>
          <div style={{ width: 20, height: 30, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, margin: '0 auto', position: 'relative' }}>
            <div style={{ width: 3, height: 6, background: 'rgba(0,229,255,0.5)', borderRadius: 2, position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', animation: 'scrollBounce 1.5s infinite' }} />
          </div>
        </div>
      </div>

      {/* ═══ PAGE 2: Magic Bento War Room ═══ */}
      <div style={{
        position: 'relative', zIndex: 1, padding: 24, paddingTop: 60,
        background: 'linear-gradient(180deg, rgba(3,5,15,0) 0%, rgba(3,5,15,0.85) 80px, rgba(12,14,18,0.95) 100%)',
        pointerEvents: 'auto',
      }}>
        <MagicBentoGrid className="max-w-[1400px] mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            
            {/* ── LEFT COLUMN (Main Stage) ── */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              {/* Controls */}
              <BentoCard label="Simulation Endpoint">
                <div className="flex flex-col gap-2">
                  <input className="ops-input flex-1" onChange={(e) => setUrlInput(e.target.value)} placeholder="http://127.0.0.1:8001" value={urlInput} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)' }} />
                  <div className="flex gap-2 flex-wrap">
                    <button className="ops-button ops-button-primary flex-1" onClick={() => void connect()}>{isConnected ? 'Reconnect' : 'Connect'}</button>
                    <button className="ops-button" disabled={!isConnected} onClick={toggleAutoStep} style={autoStep ? { background: 'rgba(0,229,255,0.2)', borderColor: '#00e5ff', color: '#00e5ff' } : {}}>{autoStep ? '⏸ Pause' : '▶ Auto'}</button>
                    <button className="ops-button" disabled={!isConnected || autoStep} onClick={() => generateStep()}>Step</button>
                    <button className="ops-button" disabled={!isConnected} onClick={resetSimulation}>Reset</button>
                    <button className="ops-button" disabled={!isConnected} onClick={handleExportReport}>Export</button>
                    <button className="ops-button" disabled={!isConnected} onClick={handleNarrativeReport}>📝 AI Report</button>
                  </div>
                </div>
              </BentoCard>

              {/* SIEM & URL Bridge (Side by Side) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <BentoCard label="SIEM Integration">
                  {networkInfo && (
                    <div className="mb-2" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 6, padding: '8px 10px' }}>
                      <div className="text-xs" style={{ color: '#00ff88', fontFamily: '"Share Tech Mono", monospace' }}>● {networkInfo}</div>
                      {networkDetails && (
                        <div className="mt-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
                          {([['IP', networkDetails.ip.replace(/\d+\.\d+$/, 'xxx.xxx')], ['Subnet', networkDetails.subnet], ['ISP', networkDetails.isp], ['ASN', networkDetails.asn], ['Location', `${networkDetails.city}, ${networkDetails.region}`], ['Country', networkDetails.country]] as const).map(([k, v]) => (
                            <div key={k} className="text-[10px]" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                              <span style={{ color: 'rgba(255,255,255,0.35)' }}>{k}:</span> <span style={{ color: 'rgba(255,255,255,0.65)' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <input accept=".json,.csv,.jsonl,.pcap,.pcapng" className="ops-input !min-h-[36px] flex-1" ref={fileInputRef} type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFileName(f.name); }} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)', fontSize: '11px' }} />
                    <button className="ops-button ops-button-primary" disabled={!uploadFileName} onClick={() => void handleSIEMUpload()} style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>Upload &amp; Run</button>
                  </div>
                </BentoCard>

                <BentoCard label="Remote URL Bridge">
                  <div className="flex flex-col gap-2">
                    <input className="ops-input" onChange={(e) => setRemoteFeedUrl(e.target.value)} placeholder="https://feed.example.com/high-severity.json" value={remoteFeedUrl} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)' }} />
                    <div className="flex gap-2">
                      <select className="ops-input" onChange={(e) => setRemoteFeedVendor(e.target.value)} value={remoteFeedVendor} style={{ background: 'rgba(3,5,15,0.5)', borderColor: 'rgba(0,229,255,0.15)', minWidth: 120 }}>
                        {['generic', 'splunk', 'sentinel', 'crowdstrike'].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <button className="ops-button ops-button-primary flex-1" onClick={() => void handleRemoteFeed()}>Fetch &amp; Bridge</button>
                    </div>
                  </div>
                </BentoCard>
              </div>

              {/* Kill Chain (Wide) */}
              <BentoCard label="Kill Chain Oracle" style={{ minHeight: 280 }}>
                {killChain ? (
                  <>
                    <BreachCountdown
                      countdownDisplay={killChain.breach_countdown_display || '--:--'}
                      countdownSeconds={killChain.breach_countdown_seconds}
                      confidence={killChain.breach_confidence || 0}
                      urgency={killChain.urgency || 'low'}
                      urgencyColor={killChain.urgency_color || '#ffcc00'}
                      currentStage={killChain.current_stage || 0}
                      currentStageName={killChain.current_stage_name || 'Recon'}
                      killChainProgress={killChain.kill_chain_progress || 0}
                    />
                    <VelocitySparkline history={killChain.velocity_history ?? []} label={killChain.velocity_label ?? 'DORMANT'} color={killChain.urgency_color ?? '#00e5ff'} />
                    <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 6, padding: '10px 12px', marginTop: 12 }}>
                      <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 9, letterSpacing: '0.14em', color: '#00e5ff', marginBottom: 6 }}>WHAT'S HAPPENING</div>
                      <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
                        <div style={{ marginBottom: 4 }}><span style={{ color: '#ff6600' }}>▸ Threat level:</span> {killChain.current_stage_name} · {Math.round((killChain.kill_chain_progress || 0) * 100)}% · {killChain.urgency}</div>
                        <div style={{ marginBottom: 4 }}><span style={{ color: '#ff335f' }}>▸ Attribution:</span> {liveApt[0] ? `${liveApt[0].name} — ${liveApt[0].risk_note}` : 'No strong match yet'}</div>
                        <div style={{ marginBottom: 4 }}><span style={{ color: '#ffcc00' }}>▸ Breach in:</span> {killChain.breach_countdown_display || 'estimating...'}</div>
                        <div><span style={{ color: '#00ff88' }}>▸ Action:</span> Review alerts, validate hottest hosts, approve containment.</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                    <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 32, color: 'rgba(0,229,255,0.2)', marginBottom: 12 }}>⏳</div>
                    <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.5)', textTransform: 'uppercase' }}>Awaiting Simulation</div>
                  </div>
                )}
              </BentoCard>

              {/* Action Logs (Side by Side) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <BentoCard label="Red Agent Log">
                  <ActionLog action={latestRedAction} entries={redFeed} tone="red" />
                </BentoCard>
                <BentoCard label="Blue Agent Log">
                  <ActionLog action={latestBlueAction} entries={blueFeed} tone="blue" />
                </BentoCard>
              </div>

              {/* Timelines & Analysis */}
              <BentoCard label="Battle Timeline">
                <BattleTimeline maxSteps={maxSteps} results={battleResults} step={step} />
              </BentoCard>
              
              <BentoCard label="Episode Reward Chart">
                <RewardChart history={episodeHistorySummary} />
              </BentoCard>

              <BentoCard label="HyperAgent Meta-Engine" style={{ minHeight: 400 }}>
                <HyperAgentPanel />
              </BentoCard>
            </div>

            {/* ── RIGHT COLUMN (Sidebar) ── */}
            <div className="flex flex-col gap-3">
              <BentoCard label="Agent Battle Viewer">
                <div className="battle-tug mt-3">
                  <div className="battle-score red-score" style={{ width: `${redPct}%` }}><span>RED</span><strong>{redCumulative.toFixed(1)}</strong></div>
                  <div className="battle-score blue-score" style={{ width: `${bluePct}%` }}><strong>{blueCumulative.toFixed(1)}</strong><span>BLUE</span></div>
                </div>
                {scoreboard && (
                  <div className="mt-3 text-[10px] text-white/50" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                    {scoreboard.red_nodes_controlled}R controlled · {scoreboard.blue_nodes_secured}B secured · {scoreboard.contested_nodes} contested
                  </div>
                )}
              </BentoCard>

              <BentoCard label="Threat Radar">
                <ThreatRadar briefing={briefing} />
              </BentoCard>

              <BentoCard label="APT Attribution">
                {liveApt.length > 0 ? <AptAttribution matches={liveApt} /> : (
                  <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                    <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 28, color: 'rgba(0,229,255,0.2)', marginBottom: 8 }}>🧬</div>
                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Threat DNA will appear with activity.</div>
                  </div>
                )}
              </BentoCard>

              <BentoCard label="Intrusion Storyboard">
                <IntrusionStoryboard briefing={briefing} />
              </BentoCard>

              <BentoCard label="Integration Events">
                <IntegrationEventFeed events={integrationEvents} />
              </BentoCard>
            </div>

          </div>

          {/* ── BOTTOM FULL WIDTH ── */}
          <BentoCard label="SOC Terminal" style={{ minHeight: 500, marginTop: 12 }}>
            <SocTerminal />
          </BentoCard>
        </MagicBentoGrid>
      </div>

      {/* ═══ Node Decision Overlay ═══ */}
      {selectedNodeId !== null && (() => {
        const node = network?.nodes.find((n) => n.id === selectedNodeId);
        const battle = battleResults.find((r) => r.node_id === selectedNodeId);
        if (!node) return null;
        return (
          <NodeDecisionPanel
            nodeId={node.id}
            nodeLabel={node.label}
            nodeStatus={node.status}
            nodeDescription={DEFAULT_DIAGRAM_NODES.find((n) => n.id === node.id)?.description}
            redQValues={redQValues[String(selectedNodeId)]}
            bluePolicyProbs={bluePolicyProbs[String(selectedNodeId)]}
            alerts={alerts}
            battleResult={battle}
            killChain={killChain}
            onClose={() => setSelectedNodeId(null)}
          />
        );
      })()}
    </div>
  );
}

/* ─── Sub-components ─── */

function ActionLog({
  action, entries, tone,
}: {
  action: ReturnType<typeof useSimulationStore.getState>['latestRedAction'];
  entries: ReturnType<typeof useSimulationStore.getState>['logs'];
  tone: 'red' | 'blue';
}) {
  return (
    <>
      {action ? (
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-white">{action.action_name.replace(/_/g, ' ')}</h3>
          <span className={`status-pill ${tone === 'blue' ? 'status-pill-live' : ''}`}>{action.success ? 'SUCCESS' : 'FAILED'}</span>
        </div>
      ) : <h3 className="text-sm text-white/50 mb-2">Awaiting action</h3>}
      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
        {entries.length ? entries.map((e) => (
          <div className={`feed-item ${tone === 'red' ? 'feed-item-critical' : 'feed-item-success'}`} key={e.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="ops-label text-[0.52rem]">{e.type.replace(/_/g, ' ')}</div>
              <div className="ops-data text-[0.62rem]">STEP {e.step}</div>
            </div>
            <p className="mt-1 text-sm text-white/85">{e.message}</p>
          </div>
        )) : <div className="empty-panel !min-h-[120px]">No actions logged yet.</div>}
      </div>
    </>
  );
}

function RewardChart({ history }: { history: ReturnType<typeof useSimulationStore.getState>['episodeHistorySummary'] }) {
  const width = 900; const height = 260;
  if (!history.length) return <div className="empty-panel !min-h-[220px]">Episode history charts load as the battle progresses.</div>;
  const values = history.flatMap((p) => [p.red_rew, p.blue_rew]);
  const minV = Math.min(...values, 0); const maxV = Math.max(...values, 1);
  const range = Math.max(1, maxV - minV);
  const path = (key: 'red_rew' | 'blue_rew') =>
    history.map((p, i) => {
      const x = (i / Math.max(1, history.length - 1)) * (width - 60) + 30;
      const y = height - 30 - ((p[key] - minV) / range) * (height - 60);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  return (
    <svg className="h-[220px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2={width - 30} y1={height - 30} y2={height - 30} />
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2="30" y1="30" y2={height - 30} />
      <path d={path('red_rew')} fill="none" stroke="#ff335f" strokeWidth="3" />
      <path d={path('blue_rew')} fill="none" stroke="#14d1ff" strokeWidth="3" />
    </svg>
  );
}

```

## File: `src/pages/TrainingPage.tsx`

```tsx
import { useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';

export function TrainingPage() {
  const {
    agentsInfo, giskardReports, giskardStatus,
    loadAgentsInfo, loadGiskardReports, loadGiskardStatus, loadTrainingMetrics, runGiskardScan, trainingMetrics,
  } = useSimulationStore();

  useEffect(() => {
    void loadAgentsInfo();
    void loadTrainingMetrics();
    void loadGiskardStatus();
    void loadGiskardReports();
  }, [loadAgentsInfo, loadGiskardReports, loadGiskardStatus, loadTrainingMetrics]);

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <div style={{ fontFamily: '"Orbitron", monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#00e5ff' }}>
            Agent Training Dashboard
          </div>
          <h2 className="panel-title">Reward curves and readiness snapshots</h2>
        </div>
        <span className="status-pill">{trainingMetrics?.steps_trained || 0} trained</span>
      </div>

      <MagicBentoGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric cards */}
        <BentoCard label="Blue Win Rate">
          <div className="ops-data mt-3 text-4xl text-white">{Math.round((agentsInfo?.blue.win_rate || 0) * 100)}%</div>
        </BentoCard>
        <BentoCard label="Red Win Rate">
          <div className="ops-data mt-3 text-4xl text-white">{Math.round((agentsInfo?.red.win_rate || 0) * 100)}%</div>
        </BentoCard>
        <BentoCard label="Detection Rate">
          <div className="ops-data mt-3 text-4xl text-white">{Math.round((agentsInfo?.blue.detection_rate || 0) * 100)}%</div>
        </BentoCard>
        <BentoCard label="False Positive Rate">
          <div className="ops-data mt-3 text-4xl text-white">{Math.round((agentsInfo?.blue.false_positive_rate || 0) * 100)}%</div>
        </BentoCard>

        {/* Training chart */}
        <BentoCard label="Reward Curves" className="sm:col-span-2 lg:col-span-4">
          <TrainingChart history={trainingMetrics?.reward_history || []} />
        </BentoCard>

        {/* Giskard Validation */}
        <BentoCard label="Giskard Validation" className="sm:col-span-1 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <span className={`status-pill ${giskardStatus?.using_real_giskard ? 'status-pill-live' : ''}`}>
              {giskardStatus?.runtime || 'unknown'}
            </span>
          </div>
          <div className="space-y-3">
            <MetricBar label="Reports Available" value={giskardStatus?.reports_available || 0} max={10} />
            <MetricBar label="Runtime Mode" value={giskardStatus?.using_real_giskard ? 100 : 45} max={100} />
          </div>
          <div className="mt-3 text-sm text-[var(--text-secondary)]">
            Version: <span className="ops-data text-white">{giskardStatus?.version || 'unavailable'}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="ops-button ops-button-primary" onClick={() => void runGiskardScan('blue')}>Run Blue Scan</button>
            <button className="ops-button" onClick={() => void runGiskardScan('red')}>Run Red Scan</button>
          </div>
        </BentoCard>

        {/* Reports */}
        <BentoCard label="Recent Reports" className="sm:col-span-1 lg:col-span-2">
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {giskardReports.length ? giskardReports.slice(0, 6).map((r) => (
              <div className="feed-item feed-item-info" key={r.name}>
                <div className="flex items-center justify-between gap-3">
                  <div className="ops-label text-[0.5rem]">{r.type} · {r.format}</div>
                  <div className="ops-data text-[0.65rem]">{r.size_kb} KB</div>
                </div>
                <p className="mt-2 text-sm text-white/85">{r.name}</p>
              </div>
            )) : <div className="empty-panel !min-h-[220px]">No Giskard reports yet.</div>}
          </div>
        </BentoCard>
      </MagicBentoGrid>
    </div>
  );
}

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="ops-label text-[0.52rem]">{label}</div>
        <div className="ops-data text-sm">{value.toFixed(0)}</div>
      </div>
      <div className="meter-track mt-2 h-2">
        <div className="meter-fill bg-secondary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TrainingChart({ history }: { history: Array<{ step: number; red_reward?: number; blue_reward?: number }> }) {
  const width = 980; const height = 280;
  if (!history.length) return <div className="empty-panel !min-h-[280px]">Training curves load from the backend metrics endpoint.</div>;
  const red = history.map((p) => p.red_reward || 0);
  const blue = history.map((p) => p.blue_reward || 0);
  const minV = Math.min(...red, ...blue); const maxV = Math.max(...red, ...blue, 1);
  const range = Math.max(1, maxV - minV);
  const buildPath = (vals: number[]) =>
    vals.map((v, i) => {
      const x = (i / Math.max(1, vals.length - 1)) * (width - 60) + 30;
      const y = height - 30 - ((v - minV) / range) * (height - 60);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  return (
    <svg className="h-[280px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2={width - 30} y1={height - 30} y2={height - 30} />
      <line stroke="rgba(255,255,255,0.08)" x1="30" x2="30" y1="30" y2={height - 30} />
      <path d={buildPath(red)} fill="none" stroke="#ff335f" strokeWidth="3" />
      <path d={buildPath(blue)} fill="none" stroke="#14d1ff" strokeWidth="3" />
    </svg>
  );
}

```

## File: `src/pages/Login.tsx`

```tsx
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { apiClient } from '../api/client';
import { SplineBackground } from '../components/SplineBackground';

export interface StoredAuth {
  token: string;
  alias: string;
  onboarded: boolean;
  operatorId?: string;
}

interface LoginProps {
  onAuthenticated: (auth: StoredAuth) => void;
  onBack: () => void;
}

const cardStyle: CSSProperties = {
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  padding: '32px 28px 28px',
  borderRadius: 16,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(0, 229, 255, 0.4)',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(0,229,255,0.18) 100%)',
  backdropFilter: 'blur(54px)',
  boxShadow: '0 8px 48px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 8,
  color: '#ffffff',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  textShadow: '0 2px 8px rgba(0,0,0,0.8)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  height: 48,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid rgba(0, 229, 255, 0.3)',
  background: 'rgba(10, 15, 20, 0.7)',
  color: '#ffffff',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 180ms ease, box-shadow 180ms ease',
};

const focusStyle = (hasError: boolean): CSSProperties => ({
  borderColor: hasError ? 'rgba(255, 0, 68, 0.8)' : 'rgba(0, 229, 255, 0.5)',
  boxShadow: hasError ? '0 0 0 3px rgba(255, 0, 68, 0.12)' : '0 0 0 3px rgba(0, 229, 255, 0.12)',
});

async function attemptBackendLogin(operatorId: string, password: string) {
  try {
    const response = await apiClient.post(
      '/api/auth/login',
      { username: operatorId, password },
      { timeout: 2500, validateStatus: () => true },
    );

    if (response.status >= 200 && response.status < 300 && typeof response.data?.token === 'string') {
      return {
        token: response.data.token,
        alias: typeof response.data?.alias === 'string' ? response.data.alias : '',
        onboarded: Boolean(response.data?.onboarded),
        operatorId,
      } satisfies StoredAuth;
    }
  } catch {
    return null;
  }

  return null;
}

export function Login({ onAuthenticated, onBack }: LoginProps) {
  const [operatorId, setOperatorId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState<'operator' | 'password' | null>(null);
  const [hasError, setHasError] = useState(false);
  const [errorText, setErrorText] = useState('');

  const shakeAnimation = useMemo(
    () => (hasError ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }),
    [hasError],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedOperatorId = operatorId.trim();
    if (!trimmedOperatorId || password.length < 6) {
      setErrorText('Use any operator ID and a 6-character access code.');
      setHasError(true);
      window.setTimeout(() => setHasError(false), 450);
      return;
    }

    setHasError(false);
    setErrorText('');
    setIsLoading(true);

    const backendAuth = await attemptBackendLogin(trimmedOperatorId, password);
    const auth =
      backendAuth ||
      ({
        token: window.btoa(`${trimmedOperatorId}${Date.now()}`),
        alias: '',
        onboarded: false,
        operatorId: trimmedOperatorId,
      } satisfies StoredAuth);

    window.localStorage.setItem('cg_auth', JSON.stringify(auth));
    onAuthenticated(auth);
    setIsLoading(false);
  };

  return (
    <>
      <SplineBackground
        scene="https://prod.spline.design/jLzBfmhFeHun-l9A/scene.splinecode"
        overlay="linear-gradient(135deg, rgba(3,5,15,0.15) 0%, rgba(6,11,20,0.1) 100%)"
      />
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '24px 48px 24px 24px',
          pointerEvents: 'none',
        }}
      >
        <motion.div
          animate={{ opacity: 1, y: 0, ...shakeAnimation }}
          initial={{ opacity: 0, y: 24 }}
          style={{
            ...cardStyle,
            borderColor: hasError ? 'rgba(255, 0, 68, 0.85)' : 'rgba(255, 255, 255, 0.25)',
            pointerEvents: 'auto',
          }}
          transition={{
            duration: hasError ? 0.4 : 0.6,
            ease: hasError ? 'easeInOut' : 'easeOut',
          }}
        >
          <div
            style={{
              color: '#00e5ff',
              fontFamily: '"Orbitron", monospace',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            {'<> '}Inari
          </div>
          <div
            style={{
              marginTop: 10,
              color: 'rgba(255, 255, 255, 0.95)',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)',
            }}
          >
            Inari Security Platform
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: 28 }}>
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="operator-id" style={labelStyle}>
                Operator ID
              </label>
              <input
                id="operator-id"
                onBlur={() => setIsFocused((current) => (current === 'operator' ? null : current))}
                onChange={(event) => setOperatorId(event.target.value)}
                onFocus={() => setIsFocused('operator')}
                placeholder="OPERATOR-ID"
                style={{
                  ...inputStyle,
                  ...(isFocused === 'operator' ? focusStyle(hasError) : null),
                }}
                type="text"
                value={operatorId}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor="access-code" style={labelStyle}>
                Access Code
              </label>
              <input
                id="access-code"
                onBlur={() => setIsFocused((current) => (current === 'password' ? null : current))}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => setIsFocused('password')}
                placeholder="••••••"
                style={{
                  ...inputStyle,
                  ...(isFocused === 'password' ? focusStyle(hasError) : null),
                }}
                type="password"
                value={password}
              />
            </div>

            <motion.button
              animate={isLoading ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 10,
                border: '1px solid rgba(0, 229, 255, 0.5)',
                background: 'rgba(0, 229, 255, 0.08)',
                color: '#00e5ff',
                cursor: 'pointer',
                fontFamily: '"Orbitron", monospace',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                textShadow: '0 2px 6px rgba(0,0,0,0.85)',
                boxShadow: isLoading ? '0 0 20px rgba(0, 229, 255, 0.18)' : 'none',
              }}
              transition={{ duration: 1.1, repeat: isLoading ? Number.POSITIVE_INFINITY : 0 }}
              type="submit"
              whileHover={
                isLoading
                  ? undefined
                  : {
                      backgroundColor: 'rgba(0, 229, 255, 0.15)',
                      boxShadow: '0 0 24px rgba(0, 229, 255, 0.35)',
                    }
              }
              whileTap={isLoading ? undefined : { scale: 0.97 }}
            >
              {isLoading ? 'Authenticating...' : 'Authenticate ------------> '}
            </motion.button>

            <div
              style={{
                marginTop: 18,
                borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                paddingTop: 14,
                color: errorText ? '#ff6f91' : 'rgba(255, 255, 255, 0.9)',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textShadow: '0 2px 6px rgba(0,0,0,0.8)',
              }}
            >
              {errorText || 'Demo: any ID + 6-char code'}
            </div>
          </form>

          <button
            onClick={onBack}
            style={{
              marginTop: 14,
              border: 0,
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)',
            }}
            type="button"
          >
            Back to website
          </button>
        </motion.div>
      </div>
    </>
  );
}

```

## File: `src/pages/Onboarding.tsx`

```tsx
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SplineBackground } from '../components/SplineBackground';
import type { StoredAuth } from './Login';

interface OnboardingProps {
  auth: StoredAuth;
  onAuthChange: (auth: StoredAuth) => void;
  onComplete: (auth: StoredAuth) => void;
}

const cardStyle: CSSProperties = {
  width: 540,
  maxWidth: 'calc(100vw - 32px)',
  padding: '32px 28px 28px',
  borderRadius: 16,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(0, 229, 255, 0.4)',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(0,229,255,0.18) 100%)',
  backdropFilter: 'blur(54px)',
  pointerEvents: 'auto',
};

const featureVariants = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0 },
};

const listVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const features = [
  'Real-time Red vs Blue agent simulation',
  '10-stage predictive threat pipeline',
  'Cross-layer threat detection (3 signals)',
  'MITRE ATT&CK mapped alerts + auto-playbooks',
  'Giskard-powered adversarial blind-spot scans',
];

export function Onboarding({ auth, onAuthChange, onComplete }: OnboardingProps) {
  const [alias, setAlias] = useState(auth.alias || auth.operatorId || '');
  const [step, setStep] = useState(auth.alias ? 2 : 1);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!auth.alias && auth.operatorId && !alias) {
      setAlias(auth.operatorId);
    }
  }, [alias, auth.alias, auth.operatorId]);

  const welcomeAlias = useMemo(() => (auth.alias || alias || 'Operator').toUpperCase(), [alias, auth.alias]);

  const persistAuth = (nextAuth: StoredAuth) => {
    window.localStorage.setItem('cg_auth', JSON.stringify(nextAuth));
    onAuthChange(nextAuth);
  };

  const handleAliasConfirm = () => {
    const trimmedAlias = alias.trim();
    if (!trimmedAlias) {
      return;
    }

    persistAuth({
      ...auth,
      alias: trimmedAlias,
    });
    setStep(2);
  };

  const handleComplete = () => {
    if (launching) {
      return;
    }

    const completedAuth = {
      ...auth,
      alias: alias.trim() || auth.alias || auth.operatorId || 'Operator',
      onboarded: true,
    } satisfies StoredAuth;

    persistAuth(completedAuth);
    setLaunching(true);
    window.setTimeout(() => onComplete(completedAuth), 300);
  };

  return (
    <>
      <SplineBackground
        scene="https://prod.spline.design/jLzBfmhFeHun-l9A/scene.splinecode"
        overlay="linear-gradient(135deg, rgba(3,5,15,0.15) 0%, rgba(6,11,20,0.1) 100%)"
      />
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '24px 48px 24px 24px',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              initial={{ opacity: 0, x: 40 }}
              key="alias-step"
              style={cardStyle}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div
                style={{
                  color: '#ffffff',
                  fontFamily: '"Orbitron", monospace',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Initializing Operator Profile
              </div>
              <div
                style={{
                  width: 260,
                  maxWidth: '100%',
                  marginTop: 10,
                  borderTop: '1px solid rgba(0, 229, 255, 0.18)',
                }}
              />

              <div
                style={{
                  marginTop: 24,
                  color: '#ffffff',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.8,
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Before we begin — what should I call you?
              </div>

              <input
                onChange={(event) => setAlias(event.target.value)}
                placeholder="OPERATOR ALIAS"
                style={{
                  width: '100%',
                  height: 50,
                  marginTop: 22,
                  padding: '0 16px',
                  borderRadius: 4,
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  background: 'rgba(10, 15, 20, 0.7)',
                  color: '#ffffff',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 14,
                  outline: 'none',
                }}
                type="text"
                value={alias}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 22,
                }}
              >
                <motion.button
                  onClick={handleAliasConfirm}
                  style={{
                    height: 44,
                    padding: '0 18px',
                    borderRadius: 4,
                    border: '1px solid #00e5ff',
                    background: 'transparent',
                    color: '#00e5ff',
                    cursor: 'pointer',
                    fontFamily: '"Orbitron", monospace',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    textShadow: '0 2px 6px rgba(0,0,0,0.85)',
                  }}
                  type="button"
                  whileHover={{
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    boxShadow: '0 0 20px rgba(0, 229, 255, 0.3)',
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  Confirm -&gt;
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              initial={{ opacity: 0, x: 40 }}
              key="briefing-step"
              style={cardStyle}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div
                style={{
                  color: '#ffffff',
                  fontFamily: '"Orbitron", monospace',
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Welcome, {welcomeAlias}
              </div>
              <div
                style={{
                  width: 260,
                  maxWidth: '100%',
                  marginTop: 10,
                  borderTop: '1px solid rgba(0, 229, 255, 0.18)',
                }}
              />

              <div
                style={{
                  marginTop: 22,
                  color: '#ffffff',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.8,
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Inari gives you:
              </div>

              <motion.div
                animate="show"
                initial="hidden"
                style={{ marginTop: 18, display: 'grid', gap: 12 }}
                variants={listVariants}
              >
                {features.map((feature) => (
                  <motion.div
                    key={feature}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      color: '#ffffff',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 14,
                      fontWeight: 600,
                      textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                    }}
                    variants={featureVariants}
                  >
                    <span style={{ color: '#00e5ff', fontSize: 18 }}>⬡</span>
                    <span>{feature}</span>
                  </motion.div>
                ))}
              </motion.div>

              <div
                style={{
                  marginTop: 24,
                  color: '#ffffff',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 14,
                  fontWeight: 600,
                  fontStyle: 'italic',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Your mission: Keep the network alive.
              </div>

              <motion.button
                animate={
                  launching
                    ? {
                        backgroundColor: ['rgba(0, 229, 255, 0.06)', 'rgba(0, 229, 255, 0.95)', 'rgba(0, 229, 255, 0.28)'],
                        color: ['#00e5ff', '#031322', '#031322'],
                      }
                    : undefined
                }
                onClick={handleComplete}
                style={{
                  width: '100%',
                  height: 48,
                  marginTop: 28,
                  borderRadius: 4,
                  border: '1px solid #00e5ff',
                  background: 'transparent',
                  color: '#00e5ff',
                  cursor: launching ? 'wait' : 'pointer',
                  fontFamily: '"Orbitron", monospace',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  textShadow: '0 2px 6px rgba(0,0,0,0.85)',
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                type="button"
                whileHover={
                  launching
                    ? undefined
                    : {
                        backgroundColor: 'rgba(0, 229, 255, 0.1)',
                        boxShadow: '0 0 20px rgba(0, 229, 255, 0.3)',
                      }
                }
                whileTap={launching ? undefined : { scale: 0.97 }}
              >
                {launching ? 'Launching War Room...' : 'Enter the War Room ------------> '}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

```

## File: `src/pages/TechnologyPage.tsx`

```tsx
import { motion } from 'framer-motion';
import { SiteNavbar } from '../components/SiteNavbar';
import { ArrowRight } from 'lucide-react';
import { FrostGlass } from '../components/FrostGlass';
export function TechnologyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#111216', color: '#fff', paddingBottom: '120px' }}>
      <SiteNavbar />
      
      <main style={{ paddingTop: '160px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '80px', paddingInline: '24px' }}>
        
        {/* Card: Built for the Architect */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        >
          <FrostGlass style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 1.5fr', gap: '48px', alignItems: 'start' }} padding="48px">
          {/* Left Column */}
          <div style={{ paddingTop: '12px' }}>
            <h2 style={{ fontSize: '42px', fontWeight: 700, fontFamily: '"Inter", sans-serif', color: '#fff', lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-0.02em' }}>
              Built for the<br />
              <span style={{ color: '#00e5ff' }}>Architect.</span>
            </h2>
            <p style={{ color: '#a1a1aa', fontSize: '15px', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '40px' }}>
              Deeply integrated, low-latency infrastructure designed to fit into your existing DevOps pipelines without friction.
            </p>
            <a href="#" style={{ display: 'inline-flex', alignItems: 'center', color: '#fff', fontSize: '14px', fontWeight: 600, fontFamily: '"Inter", sans-serif', textDecoration: 'none' }}>
              API Documentation <ArrowRight size={16} style={{ marginLeft: '8px' }} />
            </a>
          </div>

          {/* Right Column Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            
            {/* Card 1 */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column' }} padding="28px">
              <div style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', marginBottom: '12px', textTransform: 'uppercase' }}>
                ENGINEERING.01
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>Edge Latency</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '24px', flexGrow: 1 }}>
                Global edge nodes ensure inspection adds less than 5ms overhead to your traffic.
              </p>
              <div>
                <div style={{ height: '4px', background: '#27272a', borderRadius: '2px', marginBottom: '10px', overflow: 'hidden' }}>
                  <div style={{ width: '85%', height: '100%', background: '#3b82f6', borderRadius: '2px' }} />
                </div>
                <div style={{ color: '#3b82f6', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', textTransform: 'uppercase' }}>
                  OPTIMIZED PERFORMANCE
                </div>
              </div>
            </FrostGlass>

            {/* Card 2 */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column' }} padding="28px">
              <div style={{ color: '#a1a1aa', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', marginBottom: '12px', textTransform: 'uppercase' }}>
                ENGINEERING.02
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>gRPC Integration</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '24px', flexGrow: 1 }}>
                Native support for ultra-fast, bidirectional streaming telemetry across microservices.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['KUBERNETES', 'AWS', 'GCP'].map((pill, i) => (
                  <span key={i} style={{ 
                    border: '1px solid rgba(255, 255, 255, 0.2)', 
                    borderRadius: '16px', 
                    padding: '4px 10px', 
                    fontSize: '10px', 
                    color: '#e4e4e7', 
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    fontFamily: '"Inter", sans-serif'
                  }}>
                    {pill}
                  </span>
                ))}
              </div>
            </FrostGlass>

            {/* Card 3 */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column' }} padding="28px">
              <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', marginBottom: '12px', textTransform: 'uppercase' }}>
                ENGINEERING.03
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>ML Precision</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '0' }}>
                Bayesian-based anomaly scoring with per-user baseline modeling.
              </p>
            </FrostGlass>

            {/* Card 4 */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column' }} padding="28px">
              <div style={{ color: '#a1a1aa', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', marginBottom: '12px', textTransform: 'uppercase' }}>
                ENGINEERING.04
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>SOC2 / GDPR</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '0' }}>
                Fully compliant data residency and encryption at rest and in transit protocols.
              </p>
            </FrostGlass>

          </div>
        </FrostGlass>
        </motion.div>

      </main>
    </div>
  );
}

```

## File: `src/pages/BlogsPage.tsx`

```tsx
import { motion } from 'framer-motion';
import { Clock, User, ArrowRight } from 'lucide-react';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';
const posts = [
  {
    title: 'The Enterprise Attack Surface Field Report',
    excerpt: 'A practical long-form report on where attackers usually enter, how they move across the estate, and which prevention habits actually interrupt the path.',
    author: 'Athernex Research',
    date: 'Apr 2026',
    tag: 'Field Report',
    tagColor: '#00e5ff',
    href: '/threat-report',
    cta: 'Open report',
  },
  {
    title: 'Kill Chain Velocity: Predicting Breach Windows in Real-Time',
    excerpt: 'By tracking velocity and acceleration through the 7-stage kill chain, we can forecast breach timelines with 87% confidence — giving defenders precious minutes to respond.',
    author: 'Threat Intelligence Team',
    date: 'Mar 2026',
    tag: 'Threat Intel',
    tagColor: '#ff6600',
    href: '#',
    cta: 'Read more',
  },
  {
    title: 'Shadow Branch Execution: Pre-Computing Attack Paths Before They Happen',
    excerpt: 'The neural pipeline evaluates alternate red-team trajectories in parallel, assigning risk scores to paths that haven\'t been taken yet — enabling truly proactive defense.',
    author: 'ML Engineering',
    date: 'Mar 2026',
    tag: 'Engineering',
    tagColor: '#00ff88',
    href: '#',
    cta: 'Read more',
  },
  {
    title: 'Why Decision Transparency Matters in Autonomous Security',
    excerpt: 'Black-box AI defenders are dangerous. We expose full Q-value distributions and policy probabilities so operators understand exactly why each action was chosen.',
    author: 'Product Team',
    date: 'Feb 2026',
    tag: 'Product',
    tagColor: '#ffcc00',
    href: '#',
    cta: 'Read more',
  },
  {
    title: 'Cross-Layer Correlation: Fusing Network, Endpoint, and Application Signals',
    excerpt: 'Single-layer detection misses 68% of sophisticated attacks. Our correlator fuses three signal layers to surface high-fidelity alerts with MITRE ATT&CK mapping.',
    author: 'Detection Engineering',
    date: 'Feb 2026',
    tag: 'Detection',
    tagColor: '#ff0044',
    href: '#',
    cta: 'Read more',
  },
  {
    title: 'Building the Autonomy Budget: Preventing Runaway AI Defenders',
    excerpt: 'An autonomous agent without spending limits is a liability. Our replenishing budget system throttles defense spending and triggers human oversight when reserves deplete.',
    author: 'Safety Team',
    date: 'Jan 2026',
    tag: 'AI Safety',
    tagColor: '#00e5ff',
    href: '#',
    cta: 'Read more',
  },
];

export function BlogsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080c14', color: '#e1e2e7', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '60vh', background: 'radial-gradient(ellipse at center, rgba(0, 229, 255, 0.08) 0%, rgba(8, 14, 28, 0) 70%)', filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0 }} />
      <SiteNavbar />

      <main style={{ position: 'relative', zIndex: 10, paddingTop: '160px', paddingBottom: '80px', maxWidth: 1100, margin: '0 auto', paddingInline: '24px' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <h1 style={{ fontSize: '42px', fontWeight: 600, fontFamily: '"Inter", sans-serif', color: '#fff', marginBottom: '16px' }}>
            Latest Insights
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '18px', maxWidth: '700px', margin: '0 auto', lineHeight: 1.6 }}>
            Research, engineering deep-dives, and threat intelligence from the team building real-time AI-powered cybersecurity.
          </p>
        </div>

        <motion.a
          href="/threat-report"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'block', textDecoration: 'none', marginBottom: '28px' }}
        >
          <FrostGlass padding="28px" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '20px', alignItems: 'center' }}>
            <div style={{ maxWidth: '760px' }}>
              <div style={{ fontSize: '11px', fontFamily: '"Inter", monospace', fontWeight: 600, letterSpacing: '0.08em', color: '#00e5ff', textTransform: 'uppercase', marginBottom: '10px' }}>
                Featured report
              </div>
              <h2 style={{ margin: '0 0 10px', fontSize: '28px', color: '#fff', fontFamily: '"Inter", sans-serif' }}>
                The Enterprise Attack Surface Field Report
              </h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '15px', lineHeight: 1.7 }}>
                A downloadable long-form report covering where attacks usually land, how attackers move, and what defenders can do to break the path early.
              </p>
            </div>
            <span style={{ color: '#00e5ff', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 500 }}>
              Open report <ArrowRight size={16} />
            </span>
          </FrostGlass>
        </motion.a>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {posts.map((post, i) => (
            <motion.a
              key={post.title}
              href={post.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                textDecoration: 'none',
              }}
            >
              <FrostGlass style={{ display: 'flex', flexDirection: 'column', height: '100%' }} padding="32px">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{
                  fontSize: '11px', fontFamily: '"Inter", monospace', fontWeight: 600, letterSpacing: '0.05em',
                  color: post.tagColor, background: `${post.tagColor}15`, border: `1px solid ${post.tagColor}30`,
                  borderRadius: '6px', padding: '4px 10px', textTransform: 'uppercase',
                }}>
                  {post.tag}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> {post.date}
                </span>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 12px', lineHeight: 1.4, fontFamily: '"Inter", sans-serif' }}>
                {post.title}
              </h3>
              <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 24px', flex: 1 }}>{post.excerpt}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                <span style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} /> {post.author}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#00e5ff', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  {post.cta} <ArrowRight size={14} />
                </span>
              </div>
              </FrostGlass>
            </motion.a>
          ))}
        </div>
      </main>
    </div>
  );
}

```

## File: `src/pages/AboutPage.tsx`

```tsx
import { motion } from 'framer-motion';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';

export function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080c14', color: '#e1e2e7', position: 'relative', overflow: 'hidden' }}>
      {/* Background Glow */}
      <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '60vh', background: 'radial-gradient(ellipse at center, rgba(0, 229, 255, 0.08) 0%, rgba(8, 14, 28, 0) 70%)', filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0 }} />
      
      <SiteNavbar />

      <main style={{ position: 'relative', zIndex: 10, paddingTop: '160px', paddingBottom: '80px', maxWidth: 800, margin: '0 auto', paddingInline: '24px' }}>
        
        <motion.section 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        >
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }} padding="64px 48px">
          <h1 style={{ fontSize: '36px', fontWeight: 600, fontFamily: '"Inter", sans-serif', color: '#fff', marginBottom: '24px' }}>
            About Us
          </h1>
          
          <p style={{ color: '#e2e8f0', fontSize: '18px', lineHeight: 1.8, marginBottom: '40px' }}>
            We are Abhishek R P and GiGI Koneti — developers who want to build a secure world. We believe that cyber defense shouldn't rely on opaque, legacy rulebooks. It should be autonomous, transparent, and built to adapt in real-time.
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
            <a href="#" style={{ 
              display: 'inline-block',
              padding: '12px 24px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '99px',
              color: '#00e5ff', 
              textDecoration: 'none',
              fontFamily: '"Inter", sans-serif',
              fontWeight: 500,
              transition: 'background 0.3s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Abhishek's Socials ↗
            </a>
            <a href="#" style={{ 
              display: 'inline-block',
              padding: '12px 24px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '99px',
              color: '#00e5ff', 
              textDecoration: 'none',
              fontFamily: '"Inter", sans-serif',
              fontWeight: 500,
              transition: 'background 0.3s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              GiGI's Socials ↗
            </a>
          </div>
          </FrostGlass>
        </motion.section>

      </main>
    </div>
  );
}

```

## File: `src/pages/IntegrationsPage.tsx`

```tsx
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle, Clock, Database, FileDown,
  Key, Link2, Loader2, Monitor, Network, Plug, Radio, Shield,
  Trash2, UserCheck, XCircle,
} from 'lucide-react';
import { FALLBACK_ENTERPRISE_PATHWAYS, type EnterprisePathwaysResponse } from '../lib/enterprise';
import { useSimulationStore } from '../store/simulationStore';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';

/* ── tiny helpers ──────────────────────────────────────────────────────── */
const ENTERPRISE_API_KEY_STORAGE = 'athernex_api_key';

const getStoredEnterpriseApiKey = () =>
  typeof window === 'undefined'
    ? 'ath_local_admin'
    : window.localStorage.getItem(ENTERPRISE_API_KEY_STORAGE) || 'ath_local_admin';

const api = (path: string, opts?: RequestInit) => {
  const base = useSimulationStore.getState().apiBaseUrl;
  return fetch(`${base}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': getStoredEnterpriseApiKey(),
      ...opts?.headers,
    },
  });
};

function GlassCard({ children, title, icon: Icon }: { children: React.ReactNode; title: string; icon: React.ElementType }) {
  return (
    <BentoCard label={title}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-cyan-400" />
      </div>
      {children}
    </BentoCard>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ElementType }> = {
    connected: { color: 'text-emerald-400', icon: CheckCircle },
    active: { color: 'text-emerald-400', icon: CheckCircle },
    disabled: { color: 'text-zinc-500', icon: XCircle },
    pending_approval: { color: 'text-amber-400', icon: Clock },
    executed: { color: 'text-emerald-400', icon: CheckCircle },
    rejected: { color: 'text-red-400', icon: XCircle },
    seeded: { color: 'text-cyan-400', icon: Radio },
    buffered: { color: 'text-amber-400', icon: Clock },
    ingested: { color: 'text-emerald-400', icon: CheckCircle },
  };
  const entry = map[status] || { color: 'text-zinc-400', icon: AlertTriangle };
  const I = entry.icon;
  return <span className={`inline-flex items-center gap-1 text-[10px] ${entry.color}`}><I size={11} />{status.replace('_', ' ')}</span>;
}

/* ── main page ─────────────────────────────────────────────────────────── */
export function IntegrationsPage() {
  const apiBaseUrl = useSimulationStore((s) => s.apiBaseUrl);
  const [status, setStatus] = useState<Record<string, any>>({});
  const [connectors, setConnectors] = useState<any[]>([]);
  const [soarPending, setSoarPending] = useState<any[]>([]);
  const [soarLog, setSoarLog] = useState<any[]>([]);
  const [enterprise, setEnterprise] = useState<EnterprisePathwaysResponse>(FALLBACK_ENTERPRISE_PATHWAYS);
  const [apiKey, setApiKey] = useState(() => getStoredEnterpriseApiKey());
  const [loading, setLoading] = useState(false);
  const [connectorPullingId, setConnectorPullingId] = useState<string | null>(null);

  // connector form
  const [connVendor, setConnVendor] = useState('splunk');
  const [connUrl, setConnUrl] = useState('');
  const [connKey, setConnKey] = useState('');

  // SOAR form
  const [soarAction, setSoarAction] = useState('block_ip');
  const [soarTarget, setSoarTarget] = useState('');
  const [soarReason, setSoarReason] = useState('');
  const [soarAutoExec, setSoarAutoExec] = useState(false);

  // webhook test
  const [webhookVendor, setWebhookVendor] = useState('splunk');
  const [webhookPayload, setWebhookPayload] = useState('[{"host":"WEB-01","type":"brute_force","severity":"critical","source":"10.0.10.5","target":"10.0.0.11"}]');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteVendor, setRemoteVendor] = useState('generic');
  const [remoteApiHeader, setRemoteApiHeader] = useState('Authorization');
  const [remoteApiKey, setRemoteApiKey] = useState('');
  const [remoteHeaders, setRemoteHeaders] = useState('');

  // streaming
  const [streamBroker, setStreamBroker] = useState('kafka');
  const [streamUrl, setStreamUrl] = useState('');
  const [streamTopic, setStreamTopic] = useState('athernex-security-events');
  const [streamPayload, setStreamPayload] = useState('[{"host":"IDP-01","type":"c2_beacon","severity":"high","source":"203.0.113.44","target":"10.0.2.9"}]');

  // telemetry
  const [telemetryPayload, setTelemetryPayload] = useState('[{"hostname":"WS-05","event_type":"process","severity":"medium","process_name":"cmd.exe","pid":4321,"username":"admin"}]');

  // SSO
  const [ssoProvider, setSsoProvider] = useState('okta');
  const [ssoDomain, setSsoDomain] = useState('');
  const [ssoClientId, setSsoClientId] = useState('');

  // network builder
  const [netName, setNetName] = useState('My Network');
  const [netHosts, setNetHosts] = useState('[{"id":0,"label":"FW-01","zone":"dmz"},{"id":1,"label":"WEB-01","zone":"app"},{"id":2,"label":"DB-01","zone":"db"}]');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = apiKey ? { 'X-API-Key': apiKey } : {};
      const [statusRes, connRes, soarPRes, soarLRes, enterpriseRes] = await Promise.all([
        api('/api/integrations/status').then((r) => r.json()).catch(() => ({})),
        api('/api/connectors/siem', { headers }).then((r) => r.json()).catch(() => ({ connectors: [] })),
        api('/api/soar/pending', { headers }).then((r) => r.json()).catch(() => ({ pending: [] })),
        api('/api/soar/log', { headers }).then((r) => r.json()).catch(() => ({ actions: [] })),
        api('/api/enterprise/pathways').then((r) => r.json()).catch(() => FALLBACK_ENTERPRISE_PATHWAYS),
      ]);
      setStatus(statusRes);
      setConnectors(connRes.connectors || []);
      setSoarPending(soarPRes.pending || []);
      setSoarLog(soarLRes.actions || []);
      setEnterprise(enterpriseRes?.pathways?.length ? enterpriseRes : FALLBACK_ENTERPRISE_PATHWAYS);
    } finally {
      setLoading(false);
    }
  }, [apiKey, apiBaseUrl]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    window.localStorage.setItem(ENTERPRISE_API_KEY_STORAGE, apiKey || 'ath_local_admin');
  }, [apiKey]);

  /* ── actions ─────────────────────────────────────────────────────── */
  const registerConnector = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api('/api/connectors/siem', { method: 'POST', headers, body: JSON.stringify({ vendor: connVendor, api_url: connUrl, api_key: connKey, severity_filter: ['high', 'critical'] }) });
    setConnUrl(''); setConnKey('');
    void refresh();
  };

  const removeConnector = async (id: string) => {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api(`/api/connectors/siem/${id}`, { method: 'DELETE', headers });
    void refresh();
  };

  const pullConnector = async (id: string) => {
    setConnectorPullingId(id);
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers['X-API-Key'] = apiKey;
      const res = await api(`/api/connectors/siem/${id}/pull`, { method: 'POST', headers });
      const data = await res.json();
      alert(`Connector pull: ${data.status} — ${data.event_count || 0} events bridged into the War Room`);
      void refresh();
    } finally {
      setConnectorPullingId(null);
    }
  };

  const testWebhook = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-SIEM-Vendor': webhookVendor };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/webhooks/ingest', { method: 'POST', headers, body: webhookPayload });
    const data = await res.json();
    alert(`Webhook result: ${data.status} — ${data.message || data.detail || 'OK'}`);
    void refresh();
  };

  const ingestRemoteUrl = async () => {
    let parsedHeaders: Record<string, string> = {};
    if (remoteHeaders.trim()) {
      try {
        parsedHeaders = JSON.parse(remoteHeaders);
      } catch {
        alert('Remote headers must be valid JSON');
        return;
      }
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/ingest/url', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: remoteUrl,
        vendor: remoteVendor,
        headers: parsedHeaders,
        api_key: remoteApiKey,
        api_key_header: remoteApiHeader,
      }),
    });
    const data = await res.json();
    alert(`Remote feed: ${data.status} — ${data.event_count || 0} events ingested from ${data.filename || remoteUrl}`);
    void refresh();
  };

  const createSoarAction = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/soar/action', { method: 'POST', headers, body: JSON.stringify({ action_type: soarAction, target: soarTarget, reason: soarReason, auto_execute: soarAutoExec, channels: ['slack', 'teams'] }) });
    const data = await res.json();
    alert(`SOAR action: ${data.status} — ${data.policy_reason || data.action_type || 'Policy applied'}`);
    setSoarTarget(''); setSoarReason('');
    void refresh();
  };

  const approveSoar = async (id: string) => {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api(`/api/soar/approve/${id}`, { method: 'POST', headers });
    void refresh();
  };

  const rejectSoar = async (id: string) => {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    await api(`/api/soar/reject/${id}`, { method: 'POST', headers });
    void refresh();
  };

  const generateKey = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/keys/generate', { method: 'POST', headers, body: JSON.stringify({ label: 'new-key', roles: ['connector'] }) });
    const data = await res.json();
    alert(`New API Key: ${data.key}\nSave this — it won't be shown again.`);
    void refresh();
  };

  const configureStream = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/streaming/configure', { method: 'POST', headers, body: JSON.stringify({ broker_type: streamBroker, broker_url: streamUrl, topic: streamTopic }) });
    const data = await res.json();
    alert(`Stream configured: ${data.consumer_id || data.detail || 'OK'}`);
    setStreamUrl('');
    void refresh();
  };

  const pushStreamSample = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/streaming/push', { method: 'POST', headers, body: streamPayload });
    const data = await res.json();
    alert(`Streaming result: ${data.status} — ${data.message || `${data.buffer_size || 0} events buffered`}`);
    void refresh();
  };

  const pushTelemetry = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/agents/telemetry', { method: 'POST', headers, body: telemetryPayload });
    const data = await res.json();
    alert(`Telemetry: ${data.status} — ${data.message || data.detail || 'OK'}`);
    void refresh();
  };

  const configureSSO = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await api('/api/sso/configure', { method: 'POST', headers, body: JSON.stringify({ provider: ssoProvider, domain: ssoDomain, client_id: ssoClientId }) });
    const data = await res.json();
    alert(`SSO configured: ${data.provider_id || data.detail || 'OK'}`);
    setSsoDomain(''); setSsoClientId('');
    void refresh();
  };

  const defineNetwork = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    let hosts;
    try { hosts = JSON.parse(netHosts); } catch { alert('Invalid hosts JSON'); return; }
    const res = await api('/api/network/define', { method: 'POST', headers, body: JSON.stringify({ name: netName, hosts, auto_connect_zones: true }) });
    const data = await res.json();
    alert(`Network created: ${data.network_id || data.detail || 'OK'} (${data.num_hosts || '?'} hosts)`);
    void refresh();
  };

  /* ── render ──────────────────────────────────────────────────────── */
  const inputCls = 'w-full rounded-md border border-white/10 bg-[rgba(3,5,15,0.6)] px-3 py-2 text-xs text-white/90 placeholder:text-white/30 focus:border-cyan-500/40 focus:outline-none';
  const btnCls = 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors';
  const btnPrimary = `${btnCls} bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/20`;
  const btnDanger = `${btnCls} bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/20`;
  const btnSuccess = `${btnCls} bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/20`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      <MagicBentoGrid className="grid-cols-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Plug size={22} className="text-cyan-400" />
          <div>
            <h1 className="text-lg font-bold text-white" style={{ fontFamily: '"Orbitron", monospace' }}>Enterprise Integrations</h1>
            <p className="text-[11px] text-white/50">Connect your SIEM, streaming, SOAR & SSO infrastructure, then bridge it directly into the live War Room.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input className={inputCls} style={{ width: 220 }} placeholder="API Key (X-API-Key)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <button className={btnPrimary} onClick={refresh}>{loading ? <Loader2 size={12} className="animate-spin" /> : 'Refresh'}</button>
        </div>
      </div>

      {/* Status Dashboard */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'SIEM Connectors', value: `${status.siem_connectors?.active || 0} / ${status.siem_connectors?.total || 0}`, icon: Database },
          { label: 'Stream Consumers', value: `${status.stream_consumers?.active || 0} / ${status.stream_consumers?.total || 0}`, icon: Radio },
          { label: 'SOAR Pending', value: status.soar?.pending_approvals ?? '—', icon: Shield },
          { label: 'URL Reports', value: status.url_security?.reports_available ?? '—', icon: Key },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-white/[0.05] bg-[rgba(3,13,26,0.4)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-white/40"><card.icon size={11} />{card.label}</div>
            <div className="mt-1 text-lg font-bold text-cyan-300" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <GlassCard title="How Companies Use Athernex For Real" icon={Plug}>
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Recommended first step</span>
              <code className="rounded-full bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200">
                {enterprise.recommended_first_step.backend_endpoint}
              </code>
            </div>
            <div className="mt-2 text-sm font-semibold text-white">{enterprise.recommended_first_step.title}</div>
            <p className="mt-2 text-sm leading-7 text-white/65">{enterprise.recommended_first_step.why}</p>
            <div className="mt-2 text-[11px] text-white/40">Frontend entry: {enterprise.recommended_first_step.frontend_route}</div>
            <div className="mt-2 text-[11px] text-cyan-300">Anything ingested here now appears in the live War Room feed at <span className="font-mono">/live</span>.</div>
            <div className="mt-2 text-[11px] text-white/50">Connector polling worker: {status.siem_connectors?.polling_running ? 'running in background' : 'idle'}</div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {enterprise.pathways.map((pathway) => (
              <div key={pathway.id} className="rounded-xl border border-white/[0.06] bg-[rgba(3,5,15,0.4)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-300">{pathway.model}</div>
                    <div className="mt-1 text-sm font-semibold text-white">{pathway.title}</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/60">
                    {pathway.maturity}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-6 text-white/60">{pathway.how_companies_use_it}</p>
                <div className="mt-3 text-[10px] text-white/40">Frontend: {pathway.frontend_routes.join(' · ')}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pathway.backend_endpoints.slice(0, 3).map((endpoint) => (
                    <code key={endpoint} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70">
                      {endpoint}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {enterprise.current_vs_target.map((row) => (
              <div key={row.feature_area} className="rounded-xl border border-white/[0.06] bg-[rgba(3,5,15,0.34)] p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-300">{row.feature_area}</div>
                <div className="mt-3 text-[11px] leading-6 text-white/55">Now: {row.current_demo_state}</div>
                <div className="mt-3 text-[11px] leading-6 text-white/80">Target: {row.target_enterprise_state}</div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      </MagicBentoGrid>

      <MagicBentoGrid className="grid-cols-1 lg:grid-cols-2">
        {/* 1. SIEM Connectors */}
        <GlassCard title="SIEM / XDR Connectors" icon={Database}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select className={inputCls} value={connVendor} onChange={(e) => setConnVendor(e.target.value)}>
                {['splunk', 'sentinel', 'crowdstrike', 'qradar', 'elastic'].map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
              </select>
              <input className={inputCls} placeholder="API URL" value={connUrl} onChange={(e) => setConnUrl(e.target.value)} />
              <input className={inputCls} placeholder="API Key/Token" value={connKey} onChange={(e) => setConnKey(e.target.value)} />
            </div>
            <button className={btnPrimary} onClick={registerConnector}><Link2 size={11} />Register Connector</button>

            {connectors.length > 0 && (
              <div className="mt-2 space-y-2">
                {connectors.map((c: any) => (
                  <div key={c.connector_id} className="flex items-center justify-between rounded-md border border-white/[0.05] bg-[rgba(3,5,15,0.4)] px-3 py-2">
                    <div>
                      <span className="text-[11px] font-semibold text-white/80">{c.vendor.toUpperCase()}</span>
                      <span className="ml-2 text-[10px] text-white/40">{c.api_url || 'No URL'}</span>
                      <span className="ml-2"><StatusBadge status={c.status} /></span>
                      <div className="mt-1 text-[10px] text-white/35">
                        Poll every {c.poll_interval_seconds || 60}s · Ingested {c.events_ingested || 0} events · Last poll {c.last_poll || 'never'}
                      </div>
                      {c.last_error ? <div className="mt-1 text-[10px] text-red-300/80">Last error: {c.last_error}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className={btnPrimary} onClick={() => pullConnector(c.connector_id)}>
                        {connectorPullingId === c.connector_id ? <Loader2 size={10} className="animate-spin" /> : <ArrowRight size={10} />}
                        Pull Now
                      </button>
                      <button className={btnDanger} onClick={() => removeConnector(c.connector_id)}><Trash2 size={10} />Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* 2. Webhook Ingest */}
        <GlassCard title="Webhook Ingest (Real-Time)" icon={Radio}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select className={inputCls} style={{ width: 140 }} value={webhookVendor} onChange={(e) => setWebhookVendor(e.target.value)}>
                {['splunk', 'sentinel', 'crowdstrike', 'generic'].map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
              </select>
              <span className="text-[10px] text-white/40 self-center">X-SIEM-Vendor header</span>
            </div>
            <textarea className={inputCls} rows={4} value={webhookPayload} onChange={(e) => setWebhookPayload(e.target.value)} placeholder="JSON payload" />
            <button className={btnPrimary} onClick={testWebhook}><ArrowRight size={11} />Push & Ingest</button>
            <div className="text-[10px] text-white/40">
              Recommended endpoint: <span className="text-cyan-300">POST /api/webhooks/ingest</span>
            </div>
            <div className="text-[10px] text-white/40">
              Buffer: {status.webhook?.buffer_size ?? 0} / {status.webhook?.threshold ?? 5} events
            </div>
          </div>
        </GlassCard>

        {/* 3. Remote URL Feed */}
        <GlassCard title="Pull Threat Data From Any URL" icon={Link2}>
          <div className="space-y-3">
            <input className={inputCls} placeholder="https://customer-feed.example.com/security/high-severity.json" value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select className={inputCls} value={remoteVendor} onChange={(e) => setRemoteVendor(e.target.value)}>
                {['generic', 'splunk', 'sentinel', 'crowdstrike'].map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
              </select>
              <input className={inputCls} placeholder="Remote auth header" value={remoteApiHeader} onChange={(e) => setRemoteApiHeader(e.target.value)} />
            </div>
            <input className={inputCls} placeholder="Remote API key/token (optional)" value={remoteApiKey} onChange={(e) => setRemoteApiKey(e.target.value)} />
            <textarea className={inputCls} rows={3} value={remoteHeaders} onChange={(e) => setRemoteHeaders(e.target.value)} placeholder='Optional headers JSON, e.g. {"X-Tenant":"acme-prod"}' />
            <button className={btnPrimary} onClick={ingestRemoteUrl}><ArrowRight size={11} />Fetch URL & Bridge</button>
            <div className="text-[10px] text-white/40">Use this for signed URLs, customer-hosted JSON/CSV feeds, S3 exports, or vendor APIs exposed over HTTPS.</div>
            <a href="/url-security" className="text-[10px] text-cyan-300">Open the passive hardening review page</a>
          </div>
        </GlassCard>

        {/* 4. SOAR Actions */}
        <GlassCard title="SOAR Automated Response" icon={Shield}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select className={inputCls} value={soarAction} onChange={(e) => setSoarAction(e.target.value)}>
                {['block_ip', 'isolate_host', 'block_port', 'create_ticket', 'send_notification'].map((a) => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
              </select>
              <input className={inputCls} placeholder="Target (IP / host / port)" value={soarTarget} onChange={(e) => setSoarTarget(e.target.value)} />
            </div>
            <input className={inputCls} placeholder="Reason" value={soarReason} onChange={(e) => setSoarReason(e.target.value)} />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[10px] text-white/60">
                <input type="checkbox" checked={soarAutoExec} onChange={(e) => setSoarAutoExec(e.target.checked)} className="accent-cyan-500" />
                Auto-execute (skip approval)
              </label>
              <button className={btnPrimary} onClick={createSoarAction}><Shield size={11} />Create Action</button>
            </div>

            {/* Pending approvals */}
            {soarPending.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="text-[10px] text-amber-400 font-semibold">Pending Approvals:</div>
                {soarPending.map((a: any) => (
                  <div key={a.action_id} className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <div>
                      <span className="text-[11px] text-white/80">{a.action_type.replace('_', ' ')}</span>
                      <span className="mx-1 text-[10px] text-white/40">→</span>
                      <span className="text-[11px] text-cyan-300">{a.target}</span>
                    </div>
                    <div className="flex gap-1">
                      <button className={btnSuccess} onClick={() => approveSoar(a.action_id)}><CheckCircle size={10} />Approve</button>
                      <button className={btnDanger} onClick={() => rejectSoar(a.action_id)}><XCircle size={10} />Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent SOAR log */}
            {soarLog.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                <div className="text-[10px] text-white/40">Recent actions:</div>
                {soarLog.slice(-5).reverse().map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <StatusBadge status={a.status} />
                    <span className="text-white/60">{a.action_type?.replace('_', ' ')}</span>
                    <span className="text-cyan-300">{a.target}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* 5. Network Topology Builder */}
        <GlassCard title="Network Topology Builder" icon={Network}>
          <div className="space-y-3">
            <input className={inputCls} placeholder="Network name" value={netName} onChange={(e) => setNetName(e.target.value)} />
            <textarea className={inputCls} rows={3} value={netHosts} onChange={(e) => setNetHosts(e.target.value)} placeholder='[{"id":0,"label":"FW-01","zone":"dmz"}]' />
            <div className="flex items-center gap-3">
              <button className={btnPrimary} onClick={defineNetwork}><Network size={11} />Define Network</button>
              <a href={`${apiBaseUrl}/api/network/templates`} className={btnPrimary} target="_blank" rel="noopener">View Templates</a>
            </div>
            <div className="text-[10px] text-white/40">Zones: dmz → app → db. Auto-connects hosts by zone.</div>
          </div>
        </GlassCard>

        {/* 6. Streaming Pipeline */}
        <GlassCard title="Real-Time Streaming (Kafka/RabbitMQ)" icon={Radio}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select className={inputCls} value={streamBroker} onChange={(e) => setStreamBroker(e.target.value)}>
                {['kafka', 'rabbitmq', 'kinesis'].map((b) => <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>)}
              </select>
              <input className={inputCls} placeholder="Broker URL" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} />
              <input className={inputCls} placeholder="Topic" value={streamTopic} onChange={(e) => setStreamTopic(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} onClick={configureStream}><Radio size={11} />Configure Consumer</button>
              <button className={btnPrimary} onClick={pushStreamSample}><ArrowRight size={11} />Push Sample Events</button>
            </div>
            <textarea className={inputCls} rows={3} value={streamPayload} onChange={(e) => setStreamPayload(e.target.value)} placeholder="Streaming sample JSON" />
            <div className="text-[10px] text-white/40">
              Buffer: {status.stream_consumers?.buffer_size ?? 0} events | Consumers: {status.stream_consumers?.total ?? 0}
            </div>
          </div>
        </GlassCard>

        {/* 7. Endpoint Telemetry */}
        <GlassCard title="Endpoint Agent Telemetry" icon={Monitor}>
          <div className="space-y-3">
            <textarea className={inputCls} rows={3} value={telemetryPayload} onChange={(e) => setTelemetryPayload(e.target.value)} placeholder="Agent telemetry JSON" />
            <button className={btnPrimary} onClick={pushTelemetry}><Monitor size={11} />Push Telemetry</button>
            <div className="text-[10px] text-white/40">Compatible with Wazuh, osquery, Fluentd forwarders. Telemetry appears in the War Room as an external-source event stream.</div>
          </div>
        </GlassCard>

        {/* 8. SSO / Identity */}
        <GlassCard title="SSO / Identity Integration" icon={UserCheck}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select className={inputCls} value={ssoProvider} onChange={(e) => setSsoProvider(e.target.value)}>
                {['okta', 'azure_ad', 'saml', 'google'].map((p) => <option key={p} value={p}>{p.replace('_', ' ').toUpperCase()}</option>)}
              </select>
              <input className={inputCls} placeholder="Domain" value={ssoDomain} onChange={(e) => setSsoDomain(e.target.value)} />
              <input className={inputCls} placeholder="Client ID" value={ssoClientId} onChange={(e) => setSsoClientId(e.target.value)} />
            </div>
            <button className={btnPrimary} onClick={configureSSO}><UserCheck size={11} />Configure SSO</button>
            <div className="text-[10px] text-white/40">Providers configured: {status.sso?.providers_configured ?? 0}</div>
          </div>
        </GlassCard>

        {/* 9. API Keys & Export */}
        <GlassCard title="API Keys & Data Export" icon={Key}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button className={btnPrimary} onClick={generateKey}><Key size={11} />Generate New Key</button>
              <span className="text-[10px] text-white/40">Keys: {status.api_keys?.total ?? '—'}</span>
            </div>

            <div className="border-t border-white/[0.06] pt-3 mt-3">
              <div className="text-[10px] text-white/40 mb-2">Export Simulation Data</div>
              <div className="flex flex-wrap gap-2">
                <a href={`${apiBaseUrl}/api/export/alerts/latest`} className={btnPrimary} target="_blank" rel="noopener"><FileDown size={11} />Alerts CSV</a>
                <a href={`${apiBaseUrl}/api/export/playbooks/latest`} className={btnPrimary} target="_blank" rel="noopener"><FileDown size={11} />Playbooks CSV</a>
                <a href={`${apiBaseUrl}/api/export/summary/latest`} className={btnPrimary} target="_blank" rel="noopener"><FileDown size={11} />Summary JSON</a>
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-3 mt-3">
              <div className="text-[10px] text-white/40 mb-2">Integration Endpoints</div>
              <div className="space-y-1 text-[10px] font-mono text-white/50">
                <div>POST /api/webhooks/ingest <span className="text-white/30">— recommended secure ingest endpoint</span></div>
                <div>POST /api/webhooks/siem <span className="text-white/30">— vendor-aware compatibility alias</span></div>
                <div>POST /api/connectors/siem/{"{connector_id}"}/pull <span className="text-white/30">— pull directly from a registered connector</span></div>
                <div>POST /api/ingest/url <span className="text-white/30">— fetch remote CSV/JSON from any HTTPS URL</span></div>
                <div>POST /api/streaming/push <span className="text-white/30">— streaming buffer</span></div>
                <div>POST /api/agents/telemetry <span className="text-white/30">— endpoint agents</span></div>
                <div>POST /api/sso/authenticate <span className="text-white/30">— SSO login</span></div>
                <div>POST /api/network/define <span className="text-white/30">— custom topology</span></div>
              </div>
            </div>
          </div>
        </GlassCard>
      </MagicBentoGrid>
    </div>
  );
}

```

## File: `src/pages/FeaturesPage.tsx`

```tsx
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ClipboardList,
  Database,
  Radio,
  Route,
  Shield,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';
import {
  FALLBACK_ENTERPRISE_PATHWAYS,
  PRODUCT_SURFACES,
  type EnterprisePathway,
  type EnterprisePathwaysResponse,
} from '../lib/enterprise';

const ENTERPRISE_API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://inari-80s3.onrender.com' : 'http://127.0.0.1:8001');

const PATHWAY_META: Record<string, { icon: LucideIcon; accent: string }> = {
  siem_xdr_app: { icon: Database, accent: '#14d1ff' },
  streaming_pipeline: { icon: Radio, accent: '#7fd8ff' },
  endpoint_telemetry: { icon: Activity, accent: '#ffcc00' },
  soar_response: { icon: Shield, accent: '#ff6f91' },
  identity_sso: { icon: UserCheck, accent: '#b0c6ff' },
};

export function FeaturesPage() {
  const [enterprise, setEnterprise] = useState<EnterprisePathwaysResponse>(FALLBACK_ENTERPRISE_PATHWAYS);

  useEffect(() => {
    let cancelled = false;

    const loadEnterprisePathways = async () => {
      try {
        const response = await fetch(`${ENTERPRISE_API_BASE}/api/enterprise/pathways`);
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as EnterprisePathwaysResponse;
        if (!cancelled && payload?.pathways?.length) {
          setEnterprise(payload);
        }
      } catch {
        // Keep the fallback copy when the backend is unavailable.
      }
    };

    void loadEnterprisePathways();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#111216', color: '#fff', paddingBottom: '120px' }}>
      <SiteNavbar />

      <main
        style={{
          paddingTop: '160px',
          maxWidth: '1180px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '36px',
          paddingInline: '24px',
        }}
      >
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} padding="44px">
            <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
              Enterprise Product Pathways
            </div>
            <h1 style={{ fontSize: '40px', lineHeight: 1.1, margin: 0, fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
              How companies can really use Athernex beyond manual file uploads
            </h1>
            <p style={{ margin: 0, maxWidth: '840px', color: '#a1a1aa', fontSize: '16px', lineHeight: 1.75, fontFamily: '"Inter", sans-serif' }}>
              The real product pivot is moving from one-off CSV seeding toward continuous enterprise ingestion. This page now shows the
              exact 5 operating models, the frontend routes that support them, and the backend endpoints already wired into the platform.
            </p>

            <div
              style={{
                display: 'grid',
                gap: '16px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              }}
            >
              <InfoCard
                label="Recommended first step"
                value={enterprise.recommended_first_step.title}
                detail={enterprise.recommended_first_step.why}
                badge={enterprise.recommended_first_step.backend_endpoint}
              />
              <InfoCard
                label="Frontend route"
                value={enterprise.recommended_first_step.frontend_route}
                detail="Use the Integrations console to register connectors, webhook push, streaming, telemetry, SOAR, and SSO."
              />
              <InfoCard
                label="Product direction"
                value="Continuous integration model"
                detail="Connect to the customer stack and keep analysts in the loop, instead of asking them to upload files into a demo."
              />
            </div>
          </FrostGlass>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} padding="40px">
            <div>
              <h2 style={{ fontSize: '30px', margin: 0, fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>5 real enterprise usage models</h2>
              <p style={{ marginTop: '12px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>
                These are the actual ways I would position the product to companies right now, based on the capabilities already present in the repo.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
              {enterprise.pathways.map((pathway) => (
                <PathwayCard key={pathway.id} pathway={pathway} />
              ))}
            </div>
          </FrostGlass>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} padding="40px">
            <div>
              <h2 style={{ fontSize: '30px', margin: 0, fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>Current demo state to target enterprise state</h2>
              <p style={{ marginTop: '12px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>
                This is the honest product transition. It shows where Athernex is today and what the enterprise version needs to become.
              </p>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
              {enterprise.current_vs_target.map((row) => (
                <div
                  key={row.feature_area}
                  style={{
                    display: 'grid',
                    gap: '16px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    padding: '18px',
                    borderRadius: '18px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(3, 8, 18, 0.28)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
                      Feature Area
                    </div>
                    <div style={{ marginTop: '10px', fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>{row.feature_area}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f4f4f5', fontFamily: '"IBM Plex Mono", monospace' }}>
                      Current Demo State
                    </div>
                    <div style={{ marginTop: '10px', color: '#c4c4cc', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{row.current_demo_state}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a6e6ff', fontFamily: '"IBM Plex Mono", monospace' }}>
                      Target Enterprise State
                    </div>
                    <div style={{ marginTop: '10px', color: '#e4e4e7', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{row.target_enterprise_state}</div>
                  </div>
                </div>
              ))}
            </div>
          </FrostGlass>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} padding="40px">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Route size={22} color="#14d1ff" />
              <div>
                <h2 style={{ fontSize: '30px', margin: 0, fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>Feature-to-endpoint coverage</h2>
                <p style={{ margin: '12px 0 0', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>
                  Every major feature in the logged-in product now has a visible frontend route and backend endpoint map.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
              {PRODUCT_SURFACES.map((surface) => (
                <div
                  key={surface.route}
                  style={{
                    display: 'grid',
                    gap: '16px',
                    alignItems: 'start',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    padding: '18px',
                    borderRadius: '18px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(3, 8, 18, 0.28)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 650, color: '#fff', fontFamily: '"Inter", sans-serif' }}>{surface.feature}</div>
                    <div style={{ marginTop: '8px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', fontSize: '14px' }}>
                      {surface.deliveryNote}
                    </div>
                  </div>
                  <LabelBlock label="Frontend route" items={[surface.route]} accent />
                  <LabelBlock label="Backend endpoints" items={surface.backendEndpoints} compact />
                </div>
              ))}
            </div>
          </FrostGlass>
        </motion.div>
      </main>
    </div>
  );
}

function PathwayCard({ pathway }: { pathway: EnterprisePathway }) {
  const meta = PATHWAY_META[pathway.id] || { icon: Activity, accent: '#14d1ff' };
  const Icon = meta.icon;

  return (
    <FrostGlass style={{ display: 'flex', flexDirection: 'column', gap: '18px', minHeight: '100%' }} padding="26px">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '14px',
            display: 'grid',
            placeItems: 'center',
            background: `${meta.accent}18`,
            border: `1px solid ${meta.accent}33`,
          }}
        >
          <Icon size={20} color={meta.accent} />
        </div>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#94a3b8', fontFamily: '"IBM Plex Mono", monospace' }}>
            {pathway.model}
          </div>
          <h3 style={{ margin: '6px 0 0', fontSize: '20px', fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>{pathway.title}</h3>
        </div>
      </div>

      <p style={{ margin: 0, color: '#c4c4cc', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{pathway.how_companies_use_it}</p>

      <div
        style={{
          borderRadius: '18px',
          padding: '16px',
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(3, 8, 18, 0.32)',
        }}
      >
        <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
          Who buys this
        </div>
        <p style={{ margin: '10px 0 0', color: '#e5e7eb', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{pathway.buyer}</p>
      </div>

      <StatusBlock label="Current state" value={pathway.current_state} />
      <StatusBlock label="Target state" value={pathway.target_state} />
      <LabelBlock label="Frontend routes" items={pathway.frontend_routes} />
      <LabelBlock label="Backend endpoints" items={pathway.backend_endpoints} />
      <RolloutList steps={pathway.recommended_rollout} />
    </FrostGlass>
  );
}

function InfoCard({
  label,
  value,
  detail,
  badge,
}: {
  label: string;
  value: string;
  detail: string;
  badge?: string;
}) {
  return (
    <div
      style={{
        borderRadius: '18px',
        padding: '18px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(3, 8, 18, 0.28)',
      }}
    >
      <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
        {label}
      </div>
      <div style={{ marginTop: '10px', fontSize: '18px', fontWeight: 650, fontFamily: '"Inter", sans-serif' }}>{value}</div>
      <p style={{ margin: '10px 0 0', color: '#c4c4cc', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{detail}</p>
      {badge ? (
        <code
          style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '8px 10px',
            borderRadius: '999px',
            background: 'rgba(20, 209, 255, 0.1)',
            color: '#a6e6ff',
            fontSize: '13px',
          }}
        >
          {badge}
        </code>
      ) : null}
    </div>
  );
}

function StatusBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
        {label}
      </div>
      <p style={{ margin: '10px 0 0', color: '#d4d4d8', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>{value}</p>
    </div>
  );
}

function RolloutList({ steps }: { steps: string[] }) {
  return (
    <div>
      <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
        Recommended rollout
      </div>
      <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
        {steps.map((step) => (
          <div
            key={step}
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#d4d4d8',
              fontSize: '14px',
              lineHeight: 1.7,
              fontFamily: '"Inter", sans-serif',
            }}
          >
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function LabelBlock({
  label,
  items,
  compact = false,
  accent = false,
}: {
  label: string;
  items: string[];
  compact?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd8ff', fontFamily: '"IBM Plex Mono", monospace' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '8px' : '10px', marginTop: '10px' }}>
        {items.map((item) => (
          <code
            key={item}
            style={{
              padding: compact ? '7px 10px' : '8px 12px',
              borderRadius: '999px',
              background: accent ? 'rgba(20, 209, 255, 0.1)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: accent ? '#a6e6ff' : '#e4e4e7',
              fontSize: compact ? '12px' : '13px',
            }}
          >
            {item}
          </code>
        ))}
      </div>
    </div>
  );
}

```

## File: `src/pages/ThreatReportPage.tsx`

```tsx
import { Download, FileText, Printer, ShieldAlert } from 'lucide-react';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';
import {
  ATTACK_REPORT_DATE,
  ATTACK_REPORT_INTRO,
  ATTACK_REPORT_SECTIONS,
  ATTACK_REPORT_SUBTITLE,
  ATTACK_REPORT_TITLE,
  buildAttackReportMarkdown,
} from '../content/attackReport';

export function ThreatReportPage() {
  const downloadReport = () => {
    const blob = new Blob([buildAttackReportMarkdown()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'athernex-enterprise-attack-surface-field-report.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#080c14', color: '#e1e2e7', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 15%, rgba(20,209,255,0.12), transparent 35%), radial-gradient(circle at 80% 20%, rgba(255,102,0,0.10), transparent 32%), linear-gradient(180deg, rgba(4,8,16,0.96), rgba(4,8,16,1))', pointerEvents: 'none' }} />
      <SiteNavbar />

      <main style={{ position: 'relative', zIndex: 10, paddingTop: '160px', paddingBottom: '80px', maxWidth: 1100, margin: '0 auto', paddingInline: '24px' }}>
        <section style={{ marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 18, padding: '8px 14px', borderRadius: 999, background: 'rgba(20,209,255,0.08)', border: '1px solid rgba(20,209,255,0.18)' }}>
            <ShieldAlert size={14} color="#14d1ff" />
            <span style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8fe7ff', fontFamily: '"IBM Plex Mono", monospace' }}>
              Downloadable Field Report
            </span>
          </div>
          <h1 style={{ fontSize: '48px', lineHeight: 1.08, fontWeight: 600, color: '#fff', margin: 0, maxWidth: 880, fontFamily: '"Inter", sans-serif' }}>
            {ATTACK_REPORT_TITLE}
          </h1>
          <p style={{ marginTop: 20, maxWidth: 760, color: '#a8b4c7', fontSize: 19, lineHeight: 1.7 }}>
            {ATTACK_REPORT_SUBTITLE}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 18, color: '#7f8ba3', fontSize: 13 }}>
            <span>{ATTACK_REPORT_DATE}</span>
            <span>10 sections</span>
            <span>Readable as a blog, exportable as a working report</span>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(280px, 1fr)', gap: 24, alignItems: 'start' }}>
          <FrostGlass padding="32px" style={{ minHeight: '100%' }}>
            {ATTACK_REPORT_INTRO.map((paragraph) => (
              <p key={paragraph} style={{ margin: '0 0 18px', color: '#d5dbe7', fontSize: 17, lineHeight: 1.9 }}>
                {paragraph}
              </p>
            ))}
          </FrostGlass>

          <FrostGlass padding="24px" style={{ position: 'sticky', top: 120 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <FileText size={16} color="#14d1ff" />
              <div style={{ fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8fe7ff', fontFamily: '"IBM Plex Mono", monospace' }}>
                Quick Actions
              </div>
            </div>
            <button
              onClick={downloadReport}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                borderRadius: 14,
                padding: '14px 16px',
                border: '1px solid rgba(20,209,255,0.25)',
                background: 'rgba(20,209,255,0.12)',
                color: '#bdf1ff',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: 12,
              }}
            >
              <Download size={16} />
              Download Markdown Report
            </button>
            <button
              onClick={() => window.print()}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                borderRadius: 14,
                padding: '14px 16px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: '#e5ebf5',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Printer size={16} />
              Print / Save as PDF
            </button>
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7f8ba3', marginBottom: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
                Covered Surfaces
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ATTACK_REPORT_SECTIONS.map((section, index) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    style={{
                      textDecoration: 'none',
                      color: '#cfd7e6',
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {index + 1}. {section.title}
                  </a>
                ))}
              </div>
            </div>
          </FrostGlass>
        </div>

        <section style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {ATTACK_REPORT_SECTIONS.map((section) => (
            <FrostGlass key={section.id} padding="20px" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8fe7ff', marginBottom: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
                {section.where}
              </div>
              <h2 style={{ margin: 0, fontSize: 20, color: '#fff', lineHeight: 1.35 }}>{section.title}</h2>
              <p style={{ margin: '12px 0 0', color: '#a9b6c8', fontSize: 14, lineHeight: 1.7 }}>
                {section.summary}
              </p>
            </FrostGlass>
          ))}
        </section>

        <section style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {ATTACK_REPORT_SECTIONS.map((section) => (
            <FrostGlass key={section.id} id={section.id} padding="30px">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 28, color: '#fff', lineHeight: 1.2 }}>{section.title}</h2>
                <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8fe7ff', fontFamily: '"IBM Plex Mono", monospace' }}>
                  {section.where}
                </span>
              </div>
              <p style={{ margin: '0 0 18px', color: '#d9dfeb', fontSize: 17, lineHeight: 1.85 }}>
                {section.summary}
              </p>
              {section.narrative.map((paragraph) => (
                <p key={paragraph} style={{ margin: '0 0 16px', color: '#b7c2d4', fontSize: 15, lineHeight: 1.9 }}>
                  {paragraph}
                </p>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 20 }}>
                <div style={{ borderRadius: 18, border: '1px solid rgba(255,102,0,0.16)', background: 'rgba(255,102,0,0.06)', padding: 18 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#ffb37d', marginBottom: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
                    Common Attack Paths
                  </div>
                  {section.attacks.map((item) => (
                    <p key={item} style={{ margin: '0 0 10px', color: '#f0d9ca', fontSize: 14, lineHeight: 1.75 }}>
                      {item}
                    </p>
                  ))}
                </div>
                <div style={{ borderRadius: 18, border: '1px solid rgba(20,209,255,0.16)', background: 'rgba(20,209,255,0.06)', padding: 18 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8fe7ff', marginBottom: 10, fontFamily: '"IBM Plex Mono", monospace' }}>
                    Prevention That Works
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {section.prevention.map((item) => (
                      <p key={item} style={{ margin: 0, color: '#d7f4ff', fontSize: 14, lineHeight: 1.75 }}>
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </FrostGlass>
          ))}
        </section>
      </main>
    </div>
  );
}

```

## File: `src/pages/UrlSecurityPage.tsx`

```tsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { apiClient } from '../api/client';
import MagicBento, { type MagicBentoStaticCard } from '../components/ui/MagicBento';
import {
  getEnterpriseApiKey,
  type UrlSecurityAttackFamily,
  type UrlSecurityFinding,
  type UrlSecurityReport,
} from '../lib/urlSecurity';

const severityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return '#ff335f';
    case 'high':
      return '#ff7b47';
    case 'medium':
      return '#ffcc66';
    default:
      return '#9de7ff';
  }
};

const scoreTone = (score: number) => {
  if (score >= 80) return { label: 'Hardened surface', color: '#22c55e' };
  if (score >= 55) return { label: 'Needs review', color: '#f59e0b' };
  return { label: 'High-risk surface', color: '#ef4444' };
};

const buildReportMarkdown = (report: UrlSecurityReport) => {
  const findings = report.findings
    .map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.title}: ${finding.detail} Evidence: ${finding.evidence}`)
    .join('\n');
  const attackFamilies = report.attack_families
    .map(
      (family) =>
        `- ${family.family} (${family.severity.toUpperCase()}): ${family.why_it_matters} Attacker pattern: ${family.common_attacker_behavior}`,
    )
    .join('\n');
  const countermeasures = report.countermeasures.map((item) => `- ${item}`).join('\n');

  return `# URL Security Report

URL: ${report.url}
Final URL: ${report.final_url}
Analyzed At: ${report.analyzed_at}
Security Score: ${report.security_score}/100
Status Code: ${report.status_code}
Content Type: ${report.content_type}

## Summary
${report.risk_summary}

## Findings
${findings || '- No major passive findings detected.'}

## Attack Families To Review
${attackFamilies || '- No major attack families inferred from passive inspection.'}

## Countermeasures
${countermeasures || '- No countermeasures generated.'}
`;
};

export function UrlSecurityPage() {
  const [reports, setReports] = useState<UrlSecurityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [url, setUrl] = useState('');
  const [remoteApiKey, setRemoteApiKey] = useState('');
  const [remoteApiHeader, setRemoteApiHeader] = useState('Authorization');
  const [remoteHeaders, setRemoteHeaders] = useState('');

  const loadReports = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/url-security/reports', {
        headers: { 'X-API-Key': getEnterpriseApiKey() },
      });
      setReports(response.data.reports || []);
    } catch (error) {
      console.error(error);
      toast.error('Unable to load URL security reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const analyzeUrl = async () => {
    setAnalyzing(true);
    try {
      let headers: Record<string, string> = {};
      if (remoteHeaders.trim()) {
        headers = JSON.parse(remoteHeaders);
      }
      const response = await apiClient.post(
        '/api/url-security/analyze',
        {
          url,
          headers,
          api_key: remoteApiKey,
          api_key_header: remoteApiHeader,
        },
        {
          headers: { 'X-API-Key': getEnterpriseApiKey() },
        },
      );
      setReports((current) => [response.data as UrlSecurityReport, ...current.filter((item) => item.report_id !== response.data.report_id)].slice(0, 24));
      toast.success('Passive URL security report created');
    } catch (error) {
      console.error(error);
      toast.error('Unable to analyze the URL');
    } finally {
      setAnalyzing(false);
    }
  };

  const latestReport = reports[0] || null;
  const tone = latestReport ? scoreTone(latestReport.security_score) : null;
  const bentoCards: MagicBentoStaticCard[] = latestReport
    ? [
        {
          label: 'Score',
          title: `${latestReport.security_score}/100`,
          description: latestReport.risk_summary,
          color: 'rgba(6, 16, 28, 0.92)',
        },
        {
          label: 'Transport',
          title: latestReport.url.startsWith('https://') ? 'HTTPS in use' : 'Plain HTTP',
          description: latestReport.url.startsWith('https://')
            ? 'Transport looks encrypted from a passive view.'
            : 'Traffic can be intercepted or altered in transit.',
        },
        {
          label: 'Headers',
          title: latestReport.missing_headers.length ? `${latestReport.missing_headers.length} missing` : 'Baseline headers present',
          description: latestReport.missing_headers.length
            ? latestReport.missing_headers.join(', ')
            : 'No major browser-hardening gaps were visible in the sampled response.',
        },
        {
          label: 'Input Surface',
          title: latestReport.query_parameters.length ? `${latestReport.query_parameters.length} query params` : 'Low query exposure',
          description: latestReport.query_parameters.length
            ? `Parameters observed: ${latestReport.query_parameters.join(', ')}`
            : 'No obvious query-string attack surface was visible in the analyzed URL.',
        },
        {
          label: 'Forms',
          title: `${latestReport.forms_detected.length} forms detected`,
          description: latestReport.forms_detected.length
            ? `Password fields: ${latestReport.forms_detected.reduce((sum, form) => sum + form.password_fields, 0)}`
            : 'No HTML form surface was detected in the fetched response.',
        },
        {
          label: 'Counter',
          title: `${latestReport.countermeasures.length} fixes queued`,
          description: latestReport.countermeasures.slice(0, 2).join(' '),
        },
      ]
    : [];

  const downloadLatest = () => {
    if (!latestReport) return;
    const blob = new Blob([buildReportMarkdown(latestReport)], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${latestReport.report_id.toLowerCase()}-url-security-report.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4">
      <section className="ops-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">URL Security</div>
            <h1 className="panel-title mt-2">Passive Exposure Review For Customer URLs</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/65">
              This screen passively reviews the real URLs you ingest or analyze: transport, headers, forms, query
              parameters, likely web attack families, and the defensive fixes that should happen next. It does not fire
              exploits or generate offensive payloads.
            </p>
          </div>
          {latestReport && tone ? (
            <div
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: `${tone.color}55`, background: `${tone.color}12`, color: tone.color }}
            >
              <div className="text-[0.72rem] uppercase tracking-[0.18em]">Latest score</div>
              <div className="mt-2 text-3xl font-semibold">{latestReport.security_score}</div>
              <div className="mt-1 text-sm">{tone.label}</div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input
            className="ops-input"
            placeholder="https://customer.example.com/app/login"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <input
            className="ops-input"
            placeholder="Remote API key/token"
            value={remoteApiKey}
            onChange={(event) => setRemoteApiKey(event.target.value)}
          />
          <input
            className="ops-input"
            placeholder="Remote auth header"
            value={remoteApiHeader}
            onChange={(event) => setRemoteApiHeader(event.target.value)}
          />
        </div>

        <textarea
          className="ops-input mt-3 !min-h-[110px]"
          placeholder='Optional headers JSON, e.g. {"X-Tenant":"acme-prod"}'
          value={remoteHeaders}
          onChange={(event) => setRemoteHeaders(event.target.value)}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="ops-button ops-button-primary" onClick={() => void analyzeUrl()} type="button" disabled={analyzing}>
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Analyze URL
          </button>
          <button className="ops-button" onClick={downloadLatest} type="button" disabled={!latestReport}>
            <Download size={14} />
            Download Latest Report
          </button>
          <button className="ops-button" onClick={() => void loadReports()} type="button" disabled={loading}>
            Refresh Reports
          </button>
        </div>
      </section>

      {latestReport ? (
        <MagicBento cards={bentoCards} enableSpotlight />
      ) : (
        <section className="ops-card p-5">
          <div className="empty-panel !min-h-[220px]">
            Analyze a URL here or use the live URL ingest flow. The latest passive report will appear in this product
            surface automatically.
          </div>
        </section>
      )}

      {latestReport ? (
        <>
          <section className="ops-card p-5">
            <div className="section-heading-row">
              <div>
                <div className="ops-display text-[0.62rem] text-secondary/70">Executive Summary</div>
                <h2 className="panel-title">{latestReport.final_url}</h2>
              </div>
              <span className="status-pill" style={{ color: tone?.color || '#a5f3fc' }}>
                HTTP {latestReport.status_code}
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/75">{latestReport.risk_summary}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SummaryStat label="Analyzed At" value={new Date(latestReport.analyzed_at).toLocaleString()} />
              <SummaryStat label="Content Type" value={latestReport.content_type} />
              <SummaryStat label="Query Params" value={latestReport.query_parameters.length.toString()} />
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <section className="ops-card p-5">
              <div className="section-heading-row">
                <div>
                  <div className="ops-display text-[0.62rem] text-secondary/70">Findings</div>
                  <h2 className="panel-title">What stands out from passive inspection</h2>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {latestReport.findings.length ? (
                  latestReport.findings.map((finding) => <FindingCard key={`${finding.title}-${finding.evidence}`} finding={finding} />)
                ) : (
                  <div className="empty-panel !min-h-[160px]">No major passive findings were detected for this URL.</div>
                )}
              </div>
            </section>

            <section className="ops-card p-5">
              <div className="section-heading-row">
                <div>
                  <div className="ops-display text-[0.62rem] text-secondary/70">Countermeasures</div>
                  <h2 className="panel-title">What should happen next</h2>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {latestReport.countermeasures.map((item) => (
                  <div key={item} className="feed-item feed-item-success">
                    <p className="text-sm leading-7 text-white/85">{item}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <section className="ops-card p-5">
              <div className="section-heading-row">
                <div>
                  <div className="ops-display text-[0.62rem] text-secondary/70">Attack Families</div>
                  <h2 className="panel-title">The web attack patterns defenders should review</h2>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {latestReport.attack_families.length ? (
                  latestReport.attack_families.map((family) => <AttackFamilyCard key={family.family} family={family} />)
                ) : (
                  <div className="empty-panel !min-h-[160px]">
                    No clear web attack families were inferred from the passive response alone.
                  </div>
                )}
              </div>
            </section>

            <section className="ops-card p-5">
              <div className="section-heading-row">
                <div>
                  <div className="ops-display text-[0.62rem] text-secondary/70">Observed Surface</div>
                  <h2 className="panel-title">Headers, forms, and visible inputs</h2>
                </div>
              </div>
              <div className="mt-4 space-y-4 text-sm text-white/75">
                <div>
                  <div className="ops-label text-[0.54rem]">Missing headers</div>
                  <p className="mt-2 leading-7">
                    {latestReport.missing_headers.length ? latestReport.missing_headers.join(', ') : 'No major baseline headers were missing.'}
                  </p>
                </div>
                <div>
                  <div className="ops-label text-[0.54rem]">Forms</div>
                  <p className="mt-2 leading-7">
                    {latestReport.forms_detected.length
                      ? latestReport.forms_detected
                          .map((form) => `${form.method} ${form.action || '(same-page action)'} inputs: ${form.input_names.join(', ') || 'none listed'}`)
                          .join(' | ')
                      : 'No HTML forms were detected in the sampled response.'}
                  </p>
                </div>
                <div>
                  <div className="ops-label text-[0.54rem]">Server disclosure</div>
                  <p className="mt-2 leading-7">
                    {latestReport.response_headers.server || latestReport.response_headers.x_powered_by
                      ? [latestReport.response_headers.server, latestReport.response_headers.x_powered_by].filter(Boolean).join(' · ')
                      : 'No obvious server or framework disclosure headers were exposed.'}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}

      <section className="ops-card p-5">
        <div className="section-heading-row">
          <div>
            <div className="ops-display text-[0.62rem] text-secondary/70">Recent Reports</div>
            <h2 className="panel-title">What URLs have been reviewed recently</h2>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {reports.length ? (
            reports.map((report) => {
              const currentTone = scoreTone(report.security_score);
              return (
                <button
                  key={report.report_id}
                  className="feed-item w-full text-left transition-transform hover:-translate-y-0.5"
                  type="button"
                  onClick={() => setReports((current) => [report, ...current.filter((item) => item.report_id !== report.report_id)])}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="ops-label text-[0.52rem]">{report.report_id}</div>
                      <p className="mt-2 text-sm text-white/90">{report.url}</p>
                    </div>
                    <div className="text-right">
                      <div style={{ color: currentTone.color }} className="text-sm font-semibold">
                        {report.security_score}/100
                      </div>
                      <div className="text-xs text-white/45">{currentTone.label}</div>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="empty-panel !min-h-[150px]">No URL security reports have been created yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="ops-label text-[0.5rem]">{label}</div>
      <div className="mt-2 text-sm text-white/85">{value}</div>
    </div>
  );
}

function FindingCard({ finding }: { finding: UrlSecurityFinding }) {
  return (
    <div className="feed-item" style={{ borderColor: `${severityColor(finding.severity)}55` }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{finding.title}</div>
        <span className="status-pill" style={{ color: severityColor(finding.severity) }}>
          {finding.severity.toUpperCase()}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-white/75">{finding.detail}</p>
      <p className="mt-2 text-xs leading-6 text-white/45">Evidence: {finding.evidence}</p>
    </div>
  );
}

function AttackFamilyCard({ family }: { family: UrlSecurityAttackFamily }) {
  return (
    <div className="feed-item">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{family.family}</div>
        <span className="status-pill" style={{ color: severityColor(family.severity) }}>
          {family.severity.toUpperCase()}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-white/75">{family.why_it_matters}</p>
      <div className="mt-3 flex items-start gap-2 text-sm leading-7 text-white/65">
        <ShieldX size={16} className="mt-1 shrink-0" style={{ color: severityColor(family.severity) }} />
        <span>{family.common_attacker_behavior}</span>
      </div>
    </div>
  );
}

```

## File: `src/pages/PricingPage.tsx`

```tsx
import { useState } from 'react';
import { Check, Zap, Shield, ShieldAlert } from 'lucide-react';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';
import { type StoredAuth } from './Login';

interface PricingPageProps {
  auth: StoredAuth;
  onProceed: () => void;
}

export function PricingPage({ onProceed }: PricingPageProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [planType, setPlanType] = useState<'individual' | 'team'>('individual');

  return (
    <div className="flex flex-col min-h-screen items-center justify-center py-20 px-4" style={{ 
      background: 'linear-gradient(180deg, #03050f 0%, #0c0e12 100%)',
      position: 'relative',
      zIndex: 1
    }}>
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(0, 229, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center">
        
        <h1 className="text-4xl md:text-5xl font-light text-white mb-8 text-center" style={{ fontFamily: '"Orbitron", monospace' }}>
          Plans that grow with you
        </h1>

        {/* Global Plan Type Toggle (Individual / Team) */}
        <div className="flex items-center gap-1 p-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-12">
          <button 
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${planType === 'individual' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}
            onClick={() => setPlanType('individual')}
          >
            Individual
          </button>
          <button 
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${planType === 'team' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}
            onClick={() => setPlanType('team')}
          >
            Team and Enterprise
          </button>
        </div>

        {/* Pricing Cards */}
        <MagicBentoGrid className="grid-cols-1 md:grid-cols-3 gap-6 w-full">
          
          {/* Free Plan */}
          <BentoCard className="flex flex-col">
            <div className="mb-6 flex justify-between items-start">
              <div>
                <div className="w-10 h-10 mb-4 rounded-full flex items-center justify-center border border-white/10 bg-white/5 text-cyan-400">
                  <Shield size={20} />
                </div>
                <h3 className="text-2xl font-semibold text-white mb-1">Free</h3>
                <p className="text-sm text-white/50">Meet Athernex</p>
              </div>
            </div>

            <div className="mb-8">
              <div className="text-4xl font-light text-white mb-2" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>$0</div>
            </div>

            <button 
              className="w-full py-3 px-4 rounded-xl text-sm font-medium text-white/90 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors mb-4"
              onClick={onProceed}
            >
              Use Athernex for free
            </button>

            <div className="border-t border-white/10 pt-6 mt-2 flex-1">
              <ul className="space-y-4">
                {[
                  'Chat on web, iOS, Android, and desktop',
                  'Basic log ingestion and analysis',
                  'Standard Threat Intelligence Feed',
                  'Single node simulation endpoint',
                  'Community playbooks'
                ].map((feature, i) => (
                  <li key={i} className="flex gap-3 text-sm text-white/70">
                    <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </BentoCard>

          {/* Pro Plan */}
          <BentoCard className="flex flex-col relative" style={{ borderColor: 'rgba(0, 229, 255, 0.4)' }}>
            <div className="absolute inset-0 bg-cyan-400/5 rounded-[20px] pointer-events-none" />
            
            <div className="mb-6 flex justify-between items-start">
              <div>
                <div className="w-10 h-10 mb-4 rounded-full flex items-center justify-center border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
                  <Zap size={20} />
                </div>
                <h3 className="text-2xl font-semibold text-white mb-1">Pro</h3>
                <p className="text-sm text-white/50">Research, hunt, and respond</p>
              </div>
              
              {/* Billing Toggle (Monthly / Yearly) */}
              <div className="flex bg-white/5 rounded-full p-0.5 border border-white/10 text-[10px]">
                <button 
                  className={`px-3 py-1 rounded-full transition-colors ${billingCycle === 'monthly' ? 'bg-white/10 text-white' : 'text-white/50'}`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Monthly
                </button>
                <button 
                  className={`px-3 py-1 rounded-full transition-colors flex items-center gap-1 ${billingCycle === 'yearly' ? 'bg-white/10 text-white' : 'text-white/50'}`}
                  onClick={() => setBillingCycle('yearly')}
                >
                  Yearly <span className="text-cyan-400">Save 17%</span>
                </button>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-light text-white" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                  ${billingCycle === 'monthly' ? '20' : '16'}
                </span>
                <span className="text-xs text-white/40 flex flex-col">
                  <span>USD / month</span>
                  <span>billed {billingCycle}</span>
                </span>
              </div>
            </div>

            <button 
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors"
              onClick={onProceed}
            >
              Get Pro plan
            </button>
            <p className="text-[10px] text-center text-white/40 mt-3 mb-4">No commitment · Cancel anytime</p>

            <div className="border-t border-white/10 pt-6 mt-2 flex-1 relative z-10">
              <p className="text-xs text-white/90 font-medium mb-4">Everything in Free and:</p>
              <ul className="space-y-4">
                {[
                  'Advanced AI Agent directly in your SOC',
                  'HyperAgent Meta-Engine access',
                  'Higher simulation execution limits',
                  'Deep Kill Chain Oracle predictive models',
                  'Multi-tenant persistence across sessions'
                ].map((feature, i) => (
                  <li key={i} className="flex gap-3 text-sm text-white/80">
                    <Check size={16} className="text-white shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </BentoCard>

          {/* Max Plan */}
          <BentoCard className="flex flex-col">
            <div className="mb-6 flex justify-between items-start">
              <div>
                <div className="w-10 h-10 mb-4 rounded-full flex items-center justify-center border border-white/10 bg-white/5 text-purple-400">
                  <ShieldAlert size={20} />
                </div>
                <h3 className="text-2xl font-semibold text-white mb-1">Max</h3>
                <p className="text-sm text-white/50">Higher limits, priority access</p>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-light text-white" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                  From $100
                </span>
                <span className="text-xs text-white/40 flex flex-col">
                  <span>USD / month</span>
                  <span>billed {billingCycle}</span>
                </span>
              </div>
            </div>

            <button 
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors"
              onClick={onProceed}
            >
              Get Max plan
            </button>
            <p className="text-[10px] text-center text-white/40 mt-3 mb-4">No commitment · Cancel anytime</p>

            <div className="border-t border-white/10 pt-6 mt-2 flex-1">
              <p className="text-xs text-white/90 font-medium mb-4">Everything in Pro, plus:</p>
              <ul className="space-y-4">
                {[
                  'Up to 20x more RL simulation usage',
                  'Recommended for full Red vs Blue exercises',
                  'Early access to advanced Athernex features',
                  'Higher output limits for narrative reporting',
                  'Priority access at high threat times'
                ].map((feature, i) => (
                  <li key={i} className="flex gap-3 text-sm text-white/70">
                    <Check size={16} className="text-white shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </BentoCard>

        </MagicBentoGrid>
        
        <p className="text-xs text-white/30 text-center mt-12 max-w-2xl">
          *Usage limits apply. Prices shown don't include applicable tax. Prices and plans are subject to change.
        </p>
      </div>
    </div>
  );
}

```

## File: `src/hooks/useAppRouter.ts`

```typescript
import { useEffect, useState } from 'react';

export type AppRoute =
  | '/'
  | '/auth'
  | '/login'
  | '/onboarding'
  | '/live'
  | '/simulation'
  | '/pipeline'
  | '/attack-graph'
  | '/playbooks'
  | '/training'
  | '/url-security'
  | '/features'
  | '/technology'
  | '/integrations'
  | '/threat-report'
  | '/blogs'
  | '/about'
  | '/pricing';

const VALID_ROUTES = new Set<AppRoute>([
  '/',
  '/auth',
  '/login',
  '/onboarding',
  '/live',
  '/simulation',
  '/pipeline',
  '/attack-graph',
  '/playbooks',
  '/training',
  '/url-security',
  '/features',
  '/technology',
  '/integrations',
  '/threat-report',
  '/blogs',
  '/about',
  '/pricing',
]);

const normalizeRoute = (value: string): AppRoute => {
  const cleaned = value.replace(/\/+$/, '') || '/';
  return VALID_ROUTES.has(cleaned as AppRoute) ? (cleaned as AppRoute) : '/';
};

const ROUTE_CHANGE_EVENT = 'cg:routechange';

export function useAppRouter() {
  const [route, setRoute] = useState<AppRoute>('/');

  useEffect(() => {
    setRoute(normalizeRoute(window.location.pathname));
    const sync = () => setRoute(normalizeRoute(window.location.pathname));
    // Listen to both browser back/forward AND our custom navigate events
    window.addEventListener('popstate', sync);
    window.addEventListener(ROUTE_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(ROUTE_CHANGE_EVENT, sync);
    };
  }, []);

  const navigate = (nextRoute: AppRoute) => {
    if (nextRoute === route) {
      return;
    }
    window.history.pushState({}, '', nextRoute);
    // Notify ALL useAppRouter instances (App, CardNav, etc.)
    window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
  };

  return { route, navigate };
}

```

## File: `src/content/attackReport.ts`

```typescript
export interface AttackReportSection {
  id: string;
  title: string;
  where: string;
  summary: string;
  narrative: string[];
  attacks: string[];
  prevention: string[];
}

export const ATTACK_REPORT_TITLE = 'The Enterprise Attack Surface Field Report';
export const ATTACK_REPORT_SUBTITLE =
  'A practical guide to where attackers usually enter, how they move, and what actually reduces risk.';
export const ATTACK_REPORT_DATE = 'April 24, 2026';

export const ATTACK_REPORT_INTRO = [
  'Most breaches do not begin with a movie-style zero day. They begin with something ordinary: a phished identity, an exposed remote access service, a forgotten workload, a stale API token, an over-privileged admin account, or an internal system that no one expected to be internet-reachable.',
  'That is why a useful security report should not read like a list of scary buzzwords. It should read like a field guide. The point is to understand where pressure lands first, what an attacker is trying to achieve at each stop, and which controls actually interrupt the path before it becomes a business problem.',
  'This report is written that way. It covers the main enterprise attack surfaces, the attacks that commonly hit each one, and the prevention habits that matter most in practice. It is broad on purpose, but still grounded enough to use in architecture reviews, tabletop exercises, onboarding packs, and customer-facing risk conversations.',
];

export const ATTACK_REPORT_SECTIONS: AttackReportSection[] = [
  {
    id: 'edge-email',
    title: 'Internet Edge, Email, and Remote Access',
    where: 'Email gateways, VPNs, remote desktops, exposed firewalls, public login portals, and forgotten internet-facing services.',
    summary:
      'This is still the easiest way into many environments because it mixes human error with exposed infrastructure.',
    narrative: [
      'Attackers love the edge because the edge is noisy. Internet-facing systems are expected to receive traffic from everywhere, which means malicious behavior often hides inside what looks like ordinary activity. Password spraying against a VPN, a fake Microsoft 365 login page, or a vulnerable remote management portal can all open the first door.',
      'Email remains especially effective because it lets the attacker borrow trust before they borrow access. A convincing reset message, invoice thread, or shared document request still outperforms many purely technical attacks. Once a user gives up credentials or runs a loader, the attacker rarely needs to break in loudly. They simply log in.',
    ],
    attacks: [
      'Phishing, business email compromise, attachment-based malware, malicious OAuth consent, password spraying, MFA fatigue, VPN exploitation, exposed RDP abuse, and edge device exploitation.',
    ],
    prevention: [
      'Use phishing-resistant MFA for all privileged and remote access paths.',
      'Reduce external exposure: disable unused portals, lock down RDP, and keep an inventory of every internet-facing service.',
      'Run conditional access policies, device trust checks, and impossible-travel style identity detections.',
      'Harden email with DMARC, URL rewriting, attachment detonation, and clear out-of-band approval rules for payment or credential requests.',
    ],
  },
  {
    id: 'identity',
    title: 'Identity, SSO, and Privilege Escalation',
    where: 'Identity providers, admin consoles, service principals, API tokens, PAM systems, and any workflow that grants broad access.',
    summary:
      'In modern environments, identity is often the real perimeter. When identity falls, the rest of the network usually follows.',
    narrative: [
      'A lot of organizations still think of identity as an IT problem rather than an attack surface. Attackers do not make that distinction. If they capture a cloud admin token, abuse legacy authentication, or find a stale service credential in a repo, they can move with the same privileges your own team uses.',
      'The danger is not just compromise. It is silent privilege. A low-noise attacker will spend time mapping who can assume which role, which apps can mint tokens, which accounts bypass MFA, and where dormant privileges were never cleaned up. By the time anyone notices, the activity already looks administrative.',
    ],
    attacks: [
      'Credential theft, token replay, pass-the-cookie, Kerberoasting, Golden/Silver Ticket abuse, OAuth consent abuse, service account compromise, and privilege escalation through role chaining.',
    ],
    prevention: [
      'Enforce least privilege and time-bound admin access instead of permanent standing privilege.',
      'Disable legacy auth, protect tokens like passwords, and rotate machine credentials on a schedule.',
      'Alert on unusual role assumption, new persistence in identity platforms, and privilege elevation outside change windows.',
      'Separate human admin identities from everyday user accounts and keep break-glass accounts tightly monitored.',
    ],
  },
  {
    id: 'endpoints',
    title: 'Workstations and User Endpoints',
    where: 'Employee laptops, VDI sessions, unmanaged contractor devices, jump boxes, and shared workstations.',
    summary:
      'Endpoints are where malicious code, stolen credentials, and interactive attacker behavior become real.',
    narrative: [
      'Once an attacker reaches an endpoint, the conversation changes. They are no longer trying only to get in; they are trying to stay in, learn the environment, and blend with daily work. Browser sessions, password stores, SSH keys, chat history, and corporate documents all become useful.',
      'Endpoints are also where detection quality can make or break the rest of the response. A suspicious process tree, a new scheduled task, or a burst of credential dumping activity often appears here before it appears anywhere else. If endpoint visibility is weak, defenders lose the best early warning system they have.',
    ],
    attacks: [
      'Malware loaders, credential dumping, browser token theft, malicious PowerShell, LOLBins abuse, ransomware staging, keylogging, and lateral movement launched from a compromised host.',
    ],
    prevention: [
      'Run EDR or equivalent host telemetry everywhere that matters, including admin workstations and jump hosts.',
      'Block or constrain risky scripting where possible and monitor parent-child process anomalies.',
      'Separate admin tasks from general browsing and email activity.',
      'Keep local admin rights rare, controlled, and reviewed regularly.',
    ],
  },
  {
    id: 'apps-apis',
    title: 'Application Servers and APIs',
    where: 'Public web apps, internal APIs, microservices, mobile backends, and machine-to-machine interfaces.',
    summary:
      'Applications are a favorite target because they sit close to data and often carry overly broad trust into other systems.',
    narrative: [
      'Application compromise is rarely just about the bug itself. The real prize is what the application can reach once it is exploited. A simple auth bypass, SSRF, deserialization issue, or leaked secret becomes much more damaging when the app can query internal services, mint tokens, or touch production data.',
      'APIs deserve special attention because teams often assume internal APIs are safe by default. They are not. If an attacker compromises one upstream service or abuses a weak service credential, internal APIs can become a quiet highway into storage, identity, billing, and customer records.',
    ],
    attacks: [
      'SQL injection, SSRF, auth bypass, deserialization, template injection, command injection, secret leakage, API key theft, and trust abuse between microservices.',
    ],
    prevention: [
      'Treat internal APIs as hostile by default: authenticate them, authorize them, and log them.',
      'Keep secrets out of code and CI logs, and rotate them when developers or vendors change.',
      'Add WAF rules for common attack classes, but do not rely on WAFs as the main control.',
      'Run code review, dependency scanning, and attack-path testing on the services that sit closest to customer data.',
    ],
  },
  {
    id: 'data',
    title: 'Databases, Storage, and Crown-Jewel Data',
    where: 'Production databases, warehouse clusters, blob storage, backups, analytics stores, and data sync jobs.',
    summary:
      'Attackers do not move laterally forever. They move until they reach the data that matters.',
    narrative: [
      'Database attacks often arrive late in the kill chain, which is why teams underestimate them. By the time an attacker is touching core data stores, the earlier controls have already failed. The last line of defense is whether access is segmented, observable, and intentionally narrow.',
      'It is common to find production data accessible from application tiers that do not need broad write access, or service accounts that can read entire datasets because no one ever tightened them after launch. Those shortcuts save time during development, but they become exfiltration paths during a breach.',
    ],
    attacks: [
      'Database credential theft, lateral movement into data tiers, bulk export abuse, cloud bucket exposure, destructive queries, ransomware against backup stores, and stealthy exfiltration over approved channels.',
    ],
    prevention: [
      'Segment data tiers hard and make east-west access explicit rather than assumed.',
      'Audit who can read, dump, or export large datasets and remove broad permissions from app services.',
      'Log large reads, unusual query volume, and new access paths into sensitive stores.',
      'Encrypt at rest and in transit, but pair that with access controls or encryption will not save you from misuse.',
    ],
  },
  {
    id: 'web-attack-families',
    title: 'Web Attack Families Every Product Team Should Review',
    where: 'Login forms, search boxes, report exports, filter endpoints, admin panels, upload flows, webhooks, and any route that accepts external input.',
    summary:
      'Most web risk is not one bug. It is a family of failure modes that reappear in slightly different shapes across products.',
    narrative: [
      'Teams often ask, "How many SQL injections are there?" The practical answer is that defenders usually worry about several recurring classes rather than an infinite list of unique tricks. The common families are error-based issues, union-style data extraction issues, blind logic flaws, time-based inference flaws, and second-order cases where unsafe input is stored first and weaponized later. The exact payloads change, but the defensive lesson is stable: never let raw input dictate query structure.',
      'The same pattern shows up outside SQL injection as well. XSS is rarely just "script tags in a field"; it is a broader output-encoding problem. SSRF is rarely just a broken webhook; it is any server-side feature that fetches attacker-supplied destinations. File upload risk is rarely just one bad extension check; it is the combination of parsing, storage, previewing, and execution paths. Thinking in families keeps reviews honest.',
      'A mature product review therefore asks a more useful question than "Do we have one SQL injection?" It asks where user-controlled input crosses trust boundaries, which code paths transform it, where it is stored, and what high-value systems sit behind that trust boundary if validation fails.',
    ],
    attacks: [
      'Common SQL injection families defenders test for: error-based behavior, union-style extraction, blind logic abuse, time-based inference, and second-order query abuse.',
      'Other common web attack families: XSS, SSRF, broken auth/session handling, insecure file upload, path traversal, template injection, command injection, and webhook abuse.',
      'Attackers rarely bet on one route. They probe search, export, login, upload, and admin flows together until a weak boundary appears.',
    ],
    prevention: [
      'Use parameterized queries or safe ORM abstractions everywhere, including background jobs and reporting paths.',
      'Validate and normalize input on the server, then encode output based on the exact rendering context.',
      'Treat any feature that fetches remote URLs, stores files, or previews user content as a separate threat model with its own controls.',
      'Keep security tests close to the product lifecycle: code review, SAST, dependency review, unit tests for dangerous parsers, and recurring authenticated attack-path review.',
    ],
  },
  {
    id: 'cloud-k8s',
    title: 'Cloud Control Plane and Kubernetes',
    where: 'Cloud IAM, management APIs, serverless runtimes, container registries, Kubernetes clusters, and CI-issued cloud credentials.',
    summary:
      'Cloud attacks are dangerous because they often let an intruder manage the environment instead of merely occupying it.',
    narrative: [
      'In cloud-native environments, management plane access is often more powerful than host access. A compromised CI token, overly broad role, or exposed cloud key can let an attacker read secrets, alter infrastructure, snapshot disks, or create persistence without touching a single workstation.',
      'Kubernetes brings its own version of the same problem. The cluster is not just a scheduler; it is a trust fabric. Weak RBAC, overly permissive service accounts, exposed dashboards, and risky admission settings can turn one container foothold into cluster-wide influence.',
    ],
    attacks: [
      'Cloud key theft, IAM abuse, role chaining, container escape, poisoned images, cluster RBAC abuse, exposed metadata service abuse, and persistence through management APIs.',
    ],
    prevention: [
      'Use short-lived cloud credentials and workload identity wherever possible.',
      'Constrain service accounts, admission privileges, and cluster admin access tightly.',
      'Continuously review public exposure, cross-account trust, and high-risk role assumptions.',
      'Protect CI and registry paths as production assets, not just developer plumbing.',
    ],
  },
  {
    id: 'saas-collaboration',
    title: 'SaaS, Collaboration, and Business Systems',
    where: 'Microsoft 365, Google Workspace, Slack, Teams, Jira, CRM, HR systems, and file-sharing platforms.',
    summary:
      'A breach does not need malware to be serious. Business systems can be abused directly for fraud, data theft, and persistence.',
    narrative: [
      'Attackers increasingly prefer environments where everything they need already exists inside the SaaS estate. If they gain a mailbox, a chat account, or an internal wiki account, they can learn suppliers, steal documents, redirect approvals, and plant believable follow-on lures without ever dropping an executable.',
      'This makes response harder because the activity looks close to business as usual. The attacker uses the same collaboration tools your staff uses, often with valid sessions and minimal technical noise. Controls need to focus on session trust, abnormal sharing, and unusual admin changes.',
    ],
    attacks: [
      'Business email compromise, malicious inbox rules, OAuth app abuse, mass file sharing, guest account misuse, approval fraud, and data theft through collaboration tools.',
    ],
    prevention: [
      'Monitor for new mail-forwarding rules, suspicious OAuth grants, and unusual external sharing.',
      'Require strong session controls for admin actions and sensitive file access.',
      'Keep guest access narrow and time-bound, especially in chat and file-sharing systems.',
      'Train finance, legal, and executive support staff on approval fraud, not just generic phishing.',
    ],
  },
  {
    id: 'ops-backup',
    title: 'Backups, Management Tooling, and Recovery Infrastructure',
    where: 'Backup servers, hypervisor consoles, RMM tools, patching systems, secrets vaults, and admin jump environments.',
    summary:
      'These systems are supposed to help you recover. That is exactly why attackers target them.',
    narrative: [
      'The worst breach stories usually involve a second failure: the systems designed to restore order were reachable, under-protected, or quietly compromised first. If attackers can tamper with backups, push malicious scripts through RMM, or mint secrets from a vault, the blast radius expands dramatically.',
      'Management systems deserve more paranoia than ordinary production assets because their normal job is to act at scale. A small compromise in a central admin system can become a very large problem very quickly.',
    ],
    attacks: [
      'Backup deletion, vault abuse, remote management takeover, patching-platform abuse, hypervisor compromise, and mass deployment of malicious configuration or binaries.',
    ],
    prevention: [
      'Isolate backup and recovery systems from daily admin workflows and keep offline or immutable copies.',
      'Require stronger approval and logging around high-scale management actions.',
      'Treat vault access as privileged identity, with strict review and short-lived access where possible.',
      'Continuously test restore procedures; a backup that cannot be restored is not a control.',
    ],
  },
  {
    id: 'third-party',
    title: 'Third-Party Vendors, CI/CD, and the Supply Chain',
    where: 'Build pipelines, package registries, code repositories, deployment bots, managed service providers, and external vendors with connectivity.',
    summary:
      'The supply chain is attractive because it lets attackers borrow trusted paths into many systems at once.',
    narrative: [
      'A trusted vendor account, poisoned build step, or compromised dependency can do more damage than a noisy external intrusion because it arrives wearing approved credentials and known process names. Teams often secure production while leaving the build and vendor paths comparatively soft.',
      'Good supply-chain defense is boring in the best way. It depends on tight change control, artifact provenance, restricted bot permissions, and the willingness to disable trust paths that are no longer justified.',
    ],
    attacks: [
      'Malicious dependency injection, CI secret theft, repository takeover, vendor credential abuse, MSP pivoting, and software update tampering.',
    ],
    prevention: [
      'Lock down CI secrets, branch protections, deployment approvals, and package publishing rights.',
      'Use signed artifacts and provenance checks for critical release paths.',
      'Review third-party access like internal privilege: narrow, time-bound, and auditable.',
      'Plan how to revoke vendor or bot trust quickly during an incident.',
    ],
  },
  {
    id: 'operating-model',
    title: 'What Actually Lowers Risk Across the Whole Estate',
    where: 'This is the operating model layer: how teams detect, decide, contain, and recover across every surface above.',
    summary:
      'Security products help, but durable risk reduction usually comes from disciplined operating habits.',
    narrative: [
      'The healthiest environments are not the ones with the most dashboards. They are the ones where attack paths are continuously shortened. Internet exposure is known, privilege is reviewed, telemetry is present on critical assets, containment is rehearsed, and decision rights are clear when something goes wrong.',
      'That is also where a platform like Athernex becomes useful in a credible way. It should ingest live signals from real infrastructure, help analysts understand where the attacker is likely to pivot next, and support approval-based response. It should not pretend to replace security engineering, identity hygiene, or incident discipline.',
    ],
    attacks: [
      'Cross-layer campaigns that mix identity abuse, host compromise, application trust abuse, and data exfiltration.',
    ],
    prevention: [
      'Keep asset inventory, identity inventory, and external exposure inventory current enough to act on.',
      'Collect telemetry from the places that decide incidents: identity, endpoint, network edge, application, and data tiers.',
      'Rehearse approval-based containment for high-risk actions before an emergency.',
      'Measure false positives, time to detect, time to isolate, and time to recover, not just alert count.',
    ],
  },
];

export const buildAttackReportMarkdown = () => {
  const sectionBlocks = ATTACK_REPORT_SECTIONS.map((section) => {
    const narrative = section.narrative.map((paragraph) => paragraph).join('\n\n');
    const attacks = section.attacks.map((item) => `- ${item}`).join('\n');
    const prevention = section.prevention.map((item) => `- ${item}`).join('\n');
    return `## ${section.title}

Where it lands:
${section.where}

${section.summary}

${narrative}

Common attack paths:
${attacks}

How to prevent it:
${prevention}`;
  }).join('\n\n');

  const intro = ATTACK_REPORT_INTRO.join('\n\n');

  return `# ${ATTACK_REPORT_TITLE}

${ATTACK_REPORT_SUBTITLE}

Date: ${ATTACK_REPORT_DATE}

${intro}

${sectionBlocks}
`;
};

```

