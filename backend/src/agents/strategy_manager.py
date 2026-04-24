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
