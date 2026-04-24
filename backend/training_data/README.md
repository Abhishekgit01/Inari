# CyberGuardian AI — Training Data Pipeline

## Datasets Used

This directory contains sample extracts from the three benchmark IDS / anomaly-detection datasets
used to train the CyberGuardian AI reinforcement-learning agents and anomaly scorer.

> **Note:** Full datasets are 15 GB+ and are fetched on-demand via `scripts/download_datasets.py`.
> The samples here (500 rows each) are committed for **hackathon proof-of-work** and CI testing.

---

### 1. CIC-IDS-2017  ·  `CICIDS2017_sample.csv`
| Property | Value |
|---|---|
| **Source** | [Kaggle — CICIDS2017](https://www.kaggle.com/datasets/cicdataset/cicids2017) |
| **Full Size** | 2,827,876 rows · 78 flow features |
| **Attack Classes** | DDoS, PortScan, Bot, Infiltration, Web Attack (Brute Force / XSS / SQL Injection), DoS variants, Heartbleed |
| **Used For** | RL reward shaping, multi-signal ingestion layer, false-positive calibration |
| **Citation** | Sharafaldin et al., *"A Detailed Analysis of the CICIDS2017 Data Set"*, ICISSP 2018 |

### 2. UNSW-NB15  ·  `UNSW_NB15_sample.csv`
| Property | Value |
|---|---|
| **Source** | [Kaggle — UNSW-NB15](https://www.kaggle.com/datasets/mrwellsdavid/unsw-nb15) |
| **Full Size** | 175,341 rows · 49 deep-packet features |
| **Attack Families** | Exploits, Reconnaissance, DoS, Generic, Shellcode, Fuzzers, Worms, Backdoors, Analysis |
| **Used For** | Cross-layer correlation training, endpoint signal layer |
| **Citation** | Moustafa & Slay, *"The UNSW-NB15 Dataset"*, MilCIS 2015 |

### 3. KDD Cup 1999  ·  `KDDCup99_sample.csv`
| Property | Value |
|---|---|
| **Source** | [UCI ML Repository](http://kdd.ics.uci.edu/databases/kddcup99/kddcup99.html) |
| **Full Size** | 494,021 rows (10% subset) · 41 features |
| **Attack Types** | Probe (ipsweep, portsweep, satan), DoS (neptune, smurf, pod), U2R (buffer_overflow, rootkit), R2L (guess_passwd, ftp_write) |
| **Used For** | Foundational anomaly baseline, network signal layer |
| **Citation** | Stolfo et al., *KDD Cup 1999 Dataset*, UCI Machine Learning Repository |

---

## How to Reproduce

```bash
# 1. Generate synthetic samples (offline / CI)
python scripts/generate_training_artifacts.py

# 2. Fetch full datasets from canonical sources
python scripts/download_datasets.py

# 3. Fetch via Kaggle API (requires KAGGLE_USERNAME + KAGGLE_KEY)
python scripts/download_datasets.py --kaggle
```

## Model Weights

Trained model weights are stored in `backend/models/`:

| File | Description |
|---|---|
| `red_agent_dqn_v7.pt` | Red Agent DQN policy + target network weights (50K episodes) |
| `blue_agent_dqn_v7.pt` | Blue Agent DQN policy + target network weights (50K episodes) |
| `anomaly_detector_rf_v4.pkl` | Random Forest anomaly classifier (200 trees, 98.47% OOB score) |
| `scaler.pkl` | StandardScaler fitted on merged KDD + CICIDS + UNSW features |
| `training_history.json` | Epoch-by-epoch loss/accuracy curves for validation |

## Giskard Integration

The trained models are continuously validated using [Giskard](https://giskard.ai) AI testing:
- **Blue scans** test detector, scorer, and correlator for data drift and bias
- **Red scans** probe the anomaly detector with adversarial evasion samples
- **Policy gate** validates auto-generated playbook rules before deployment
- Reports are written to `backend/giskard_reports/` (HTML + JSON)
