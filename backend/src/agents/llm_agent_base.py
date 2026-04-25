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
