from __future__ import annotations

import os


def _read_secret(name: str) -> str:
    return os.getenv(name, "").strip()


# Secrets must come from the environment at runtime.
HF_API_TOKEN = _read_secret("HF_API_TOKEN")
NGROK_AUTHTOKEN = _read_secret("NGROK_AUTHTOKEN")
