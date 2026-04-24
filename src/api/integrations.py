"""Athernex Integrations: Webhook listener, SIEM CSV import, connector management (v0.3)."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api", tags=["integrations"])


# ── API Key Auth (basic) ────────────────────────────────────────────────────
_api_keys: dict[str, dict[str, Any]] = {}

def _init_api_keys():
    if _api_keys:
        return
    import os
    default_key = os.environ.get("ATHERNEX_API_KEY", f"ath_{uuid.uuid4().hex[:16]}")
    _api_keys[default_key] = {"label": "default", "created_at": datetime.now(timezone.utc).isoformat()}

def _verify_api_key(x_api_key: str = Header(default="")) -> dict[str, Any]:
    _init_api_keys()
    if not x_api_key or x_api_key not in _api_keys:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return _api_keys[x_api_key]


# ── SIEM CSV Template ───────────────────────────────────────────────────────

SIEM_COLUMN_MAP: dict[str, dict[str, str]] = {
    "splunk": {"_time": "timestamp", "host": "host", "event_type": "type", "severity": "severity", "signature": "threat_type", "src_ip": "source", "dest_ip": "target"},
    "elastic": {"timestamp": "timestamp", "host.hostname": "host", "event.kind": "type", "event.severity": "severity", "threat.technique.name": "threat_type", "source.ip": "source", "destination.ip": "target"},
    "generic": {"timestamp": "timestamp", "host": "host", "type": "type", "severity": "severity", "source": "source", "target": "target", "threat_type": "threat_type"},
}


@router.get("/siem/templates", summary="Get SIEM CSV column mapping templates")
async def get_siem_templates():
    return {"templates": {k: {"column_map": v} for k, v in SIEM_COLUMN_MAP.items()}}


@router.post("/siem/import/{template}", summary="Import CSV using a SIEM template")
async def import_siem_csv(template: str, siem_file: UploadFile = File(...), max_rows: int = Query(default=250, ge=1, le=1000)):
    if template not in SIEM_COLUMN_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown template '{template}'")
    column_map = SIEM_COLUMN_MAP[template]
    content = await siem_file.read()
    text = content.decode("utf-8", errors="ignore").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    reader = csv.DictReader(io.StringIO(text))
    raw_rows = [dict(row) for row in reader]
    if not raw_rows:
        raise HTTPException(status_code=400, detail="No rows found in CSV")
    mapped_rows = []
    for row in raw_rows[:max_rows]:
        mapped: dict[str, Any] = {}
        for csv_col, standard_col in column_map.items():
            if csv_col in row and row[csv_col]:
                mapped[standard_col] = row[csv_col]
        mapped_rows.append(mapped)
    from .main import app_state
    app_state["siem_seed"] = {"filename": siem_file.filename, "event_count": len(mapped_rows), "events": mapped_rows[:64]}
    return {"status": "imported", "template": template, "rows": len(mapped_rows)}


# ── Webhook Listener ────────────────────────────────────────────────────────

_webhook_buffer: list[dict[str, Any]] = []


@router.post("/webhooks/ingest", summary="Ingest security events via webhook")
async def webhook_ingest(request: Request, x_api_key: str = Header(default="")):
    _verify_api_key(x_api_key)
    body = await request.json()
    events = body if isinstance(body, list) else [body]
    if not events:
        raise HTTPException(status_code=400, detail="No events provided")
    for event in events[:100]:
        _webhook_buffer.append({**event, "received_at": datetime.now(timezone.utc).isoformat()})
    if len(_webhook_buffer) >= 5:
        from .main import app_state
        app_state["siem_seed"] = {"filename": "webhook-stream", "event_count": len(_webhook_buffer), "events": _webhook_buffer[:64]}
        _webhook_buffer.clear()
        return {"status": "seeded", "ingested": len(events), "message": "Buffer threshold reached — data seeded."}
    return {"status": "buffered", "ingested": len(events), "buffer_size": len(_webhook_buffer)}


@router.get("/webhooks/status", summary="Check webhook buffer")
async def webhook_status():
    return {"buffer_size": len(_webhook_buffer), "threshold": 5}


# ── Export ───────────────────────────────────────────────────────────────────

@router.get("/export/alerts/{simulation_id}", summary="Export alerts as CSV")
async def export_alerts_csv(simulation_id: str):
    from .main import _get_session
    session = _get_session(simulation_id)
    alerts = session.get("alerts", [])
    if not alerts:
        return {"status": "no_data"}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Alert ID", "Threat Type", "Severity", "Confidence", "Hosts", "Timestamp"])
    for a in alerts:
        writer.writerow([a.get("id", ""), a.get("threat_type", ""), a.get("severity", ""), a.get("confidence", ""), a.get("affected_hosts", ""), a.get("timestamp", "")])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=alerts_{simulation_id}.csv"})


# ── SIEM Connector Management ───────────────────────────────────────────────

class SIEMConnectorConfig(BaseModel):
    vendor: str = Field(..., pattern="^(splunk|sentinel|crowdstrike|qradar|elastic)$")
    api_url: str = Field(...)
    api_key: str = Field(default="")
    severity_filter: list[str] = Field(default=["high", "critical"])

_connectors: dict[str, dict[str, Any]] = {}


@router.post("/connectors/siem", summary="Register a SIEM/XDR connector")
async def register_siem_connector(config: SIEMConnectorConfig, x_api_key: str = Header(default="")):
    _verify_api_key(x_api_key)
    cid = f"siem-{uuid.uuid4().hex[:8]}"
    _connectors[cid] = {
        "connector_id": cid,
        "vendor": config.vendor,
        "api_url": config.api_url,
        "api_key": config.api_key[:4] + "****" if config.api_key else "",
        "severity_filter": config.severity_filter,
        "status": "connected",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"status": "registered", "connector_id": cid, "vendor": config.vendor}


@router.get("/connectors/siem", summary="List registered SIEM connectors")
async def list_siem_connectors(x_api_key: str = Header(default="")):
    _verify_api_key(x_api_key)
    return {"connectors": list(_connectors.values())}


@router.delete("/connectors/siem/{connector_id}", summary="Remove a SIEM connector")
async def remove_siem_connector(connector_id: str, x_api_key: str = Header(default="")):
    _verify_api_key(x_api_key)
    if connector_id not in _connectors:
        raise HTTPException(status_code=404, detail="Connector not found")
    del _connectors[connector_id]
    return {"status": "removed", "connector_id": connector_id}


@router.get("/integrations/status", summary="Integration status dashboard")
async def integration_status():
    return {
        "siem_connectors": {"total": len(_connectors), "active": sum(1 for c in _connectors.values() if c["status"] == "connected")},
        "webhook": {"buffer_size": len(_webhook_buffer), "threshold": 5},
        "api_keys": {"total": len(_api_keys)},
    }
