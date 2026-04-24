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
