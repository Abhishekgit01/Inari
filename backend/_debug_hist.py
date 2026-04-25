#!/usr/bin/env python3
"""Debug script for training history loading."""
import sys, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Check MODELS_DIR resolution
loader_file = Path("src/agents/dqn_loader.py").resolve()
models_dir = loader_file.parents[2] / "models"
print(f"MODELS_DIR: {models_dir}")
print(f"Exists: {models_dir.exists()}")

hist_path = models_dir / "training_history.json"
print(f"Hist path: {hist_path}")
print(f"Hist exists: {hist_path.exists()}")

if hist_path.exists():
    with open(hist_path) as f:
        raw = json.load(f)
    print(f"Raw keys: {list(raw.keys())}")
    print(f"Has reward_history: {'reward_history' in raw}")
else:
    # Try alternate path
    alt = Path(__file__).resolve().parent / "models" / "training_history.json"
    print(f"Alt path: {alt}, exists: {alt.exists()}")
    if alt.exists():
        with open(alt) as f:
            raw = json.load(f)
        print(f"Alt raw keys: {list(raw.keys())}")

# Now test the loader
try:
    from src.agents.dqn_loader import load_training_history, MODELS_DIR as LOADER_MODELS
    print(f"Loader MODELS_DIR: {LOADER_MODELS}")
    h = load_training_history()
    print(f"Loader result keys: {list(h.keys())}")
    print(f"Steps: {h.get('steps_trained')}")
    print(f"Rewards: {len(h.get('reward_history', []))}")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
