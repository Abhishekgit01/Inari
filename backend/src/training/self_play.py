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
