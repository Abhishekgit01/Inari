"""Standalone HyperAgent API service — run on a separate port."""

from __future__ import annotations

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.hyperagents.hyper_router import router as hyper_router

hyper_app = FastAPI(
    title="CyberGuardian HyperAgents API",
    description="Self-improving agent meta-layer for CyberGuardian AI",
    version="0.1.0",
)

hyper_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

hyper_app.include_router(hyper_router)


if __name__ == "__main__":
    uvicorn.run(hyper_app, host="0.0.0.0", port=8002)
