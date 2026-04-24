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
