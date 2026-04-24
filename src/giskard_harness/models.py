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
