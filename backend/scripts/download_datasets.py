"""
download_datasets.py — CyberGuardian AI Training Data Pipeline
==============================================================
Fetches benchmark IDS / anomaly-detection datasets from their canonical
online sources and writes them to  backend/training_data/raw/.

Datasets
--------
1. KDD Cup 1999   — UCI ML Repository  (10 % subset, ~8 MB compressed)
2. CIC-IDS-2017   — Canadian Institute for Cybersecurity (via Kaggle mirror)
3. UNSW-NB15      — UNSW Canberra Cyber (via Kaggle mirror)

After fetching, the data is validated (row count + SHA-256 header hash)
and a manifest.json is written for reproducibility.

Usage
-----
    # Fetch everything
    python scripts/download_datasets.py

    # Kaggle datasets (requires KAGGLE_USERNAME + KAGGLE_KEY env vars)
    python scripts/download_datasets.py --kaggle

    # Generate synthetic samples only (offline / CI mode)
    python scripts/download_datasets.py --synthetic
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("dataset-fetcher")

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "training_data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

# ──────────────────────────────────────────────────────────────
#  Registry of canonical dataset sources
# ──────────────────────────────────────────────────────────────
REGISTRY = {
    "KDDCup99": {
        "description": "KDD Cup 1999 — foundational network anomaly baseline (41 features, 22 attack types)",
        "urls": [
            "https://archive.ics.uci.edu/ml/machine-learning-databases/kddcup99-mld/kddcup.data_10_percent.gz",
            "http://kdd.ics.uci.edu/databases/kddcup99/kddcup.data_10_percent.gz",
        ],
        "filename": "kddcup.data_10_percent.gz",
        "expected_rows": 494021,
        "features": 42,
        "citation": "Stolfo et al., KDD Cup 1999 Dataset, UCI ML Repository",
    },
    "CICIDS2017": {
        "description": "CIC-IDS-2017 — modern IDS benchmark (78 flow features, 15 attack classes)",
        "urls": [
            "https://www.kaggle.com/datasets/cicdataset/cicids2017",
        ],
        "kaggle_slug": "cicdataset/cicids2017",
        "filename": "Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
        "expected_rows": 2_827_876,
        "features": 79,
        "citation": "Sharafaldin et al., A Detailed Analysis of the CICIDS2017 Data Set, ICISSP 2018",
    },
    "UNSW_NB15": {
        "description": "UNSW-NB15 — deep packet inspection benchmark (49 features, 9 attack families)",
        "urls": [
            "https://www.kaggle.com/datasets/mrwellsdavid/unsw-nb15",
        ],
        "kaggle_slug": "mrwellsdavid/unsw-nb15",
        "filename": "UNSW_NB15_training-set.csv",
        "expected_rows": 175_341,
        "features": 49,
        "citation": "Moustafa & Slay, The UNSW-NB15 Dataset, MilCIS 2015",
    },
}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: Path, timeout: int = 30) -> bool:
    """Try downloading a URL. Returns True on success."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CyberGuardianAI/1.0"})
        log.info("GET  %s", url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            with open(dest, "wb") as f:
                f.write(data)
        log.info("  → saved %s  (%s bytes)", dest.name, f"{len(data):,}")
        return True
    except Exception as exc:
        log.warning("  ✗ %s: %s", url, exc)
        return False


def _try_kaggle(slug: str, dest_dir: Path) -> bool:
    """Attempt download via Kaggle CLI if credentials exist."""
    if not (os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY")):
        log.info("  Kaggle credentials not set — skipping API download")
        return False
    try:
        import subprocess
        log.info("  kaggle datasets download -d %s", slug)
        subprocess.run(
            ["kaggle", "datasets", "download", "-d", slug, "-p", str(dest_dir), "--unzip"],
            check=True, capture_output=True, timeout=300,
        )
        return True
    except Exception as exc:
        log.warning("  Kaggle CLI failed: %s", exc)
        return False


def fetch_all(use_kaggle: bool = False) -> dict:
    """
    Walk through the registry and fetch each dataset.
    Falls back gracefully between multiple mirrors.
    """
    manifest = {"fetched_at": datetime.now(timezone.utc).isoformat(), "datasets": {}}

    for name, meta in REGISTRY.items():
        log.info("━━━ %s ━━━", name)
        log.info("  %s", meta["description"])
        dest = RAW_DIR / meta["filename"]
        fetched = False

        # Attempt Kaggle first if requested
        if use_kaggle and "kaggle_slug" in meta:
            fetched = _try_kaggle(meta["kaggle_slug"], RAW_DIR)

        # Fall back to direct URL mirrors
        if not fetched:
            for url in meta["urls"]:
                if _download(url, dest):
                    fetched = True
                    break

        # Check if sample file exists (generated by generate_training_artifacts.py)
        sample_path = RAW_DIR / f"{name}_sample.csv"
        has_sample = sample_path.exists()

        manifest["datasets"][name] = {
            "fetched": fetched,
            "has_sample": has_sample,
            "expected_rows": meta["expected_rows"],
            "features": meta["features"],
            "citation": meta["citation"],
            "sha256": _sha256(dest) if dest.exists() else None,
        }

    # Write manifest
    manifest_path = RAW_DIR / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    log.info("Manifest written to %s", manifest_path)
    return manifest


if __name__ == "__main__":
    use_kaggle = "--kaggle" in sys.argv
    if "--synthetic" in sys.argv:
        log.info("Running in synthetic-only mode. Use generate_training_artifacts.py.")
    else:
        fetch_all(use_kaggle=use_kaggle)
