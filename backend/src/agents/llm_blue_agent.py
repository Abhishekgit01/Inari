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
