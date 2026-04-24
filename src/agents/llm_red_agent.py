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
