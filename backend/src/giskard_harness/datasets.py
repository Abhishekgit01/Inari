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
