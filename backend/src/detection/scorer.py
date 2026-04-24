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
