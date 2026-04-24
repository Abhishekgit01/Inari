"""Product-level integrations: Network builder, SIEM templates, webhook listener, export."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .exceptions import InvalidParameter, SIEMParseError

router = APIRouter(prefix="/api", tags=["integrations"])


class HostDefinition(BaseModel):
    id: int = Field(ge=0, description="Unique host ID")
    label: str = Field(description="Host name e.g. 'WEB-01'")
    zone: str = Field(default="workstation", description="Zone: dmz, app, db, workstation")
    ip: str | None = Field(default=None, description="IP address")
    vulnerability: float = Field(default=0.5, ge=0.0, le=1.0)
    data_value: float = Field(default=10.0, ge=0.0)
    patch_level: str = Field(default="current")


class ConnectionDefinition(BaseModel):
    source: int = Field(ge=0)
    target: int = Field(ge=0)
    weight: float = Field(default=1.0, ge=0.1, le=10.0)


class NetworkDefinitionRequest(BaseModel):
    name: str = Field(default="My Network")
    hosts: list[HostDefinition] = Field(min_length=2, max_length=100)
    connections: list[ConnectionDefinition] = Field(default_factory=list)
    auto_connect_zones: bool = Field(default=True)


class SIEMTemplate(BaseModel):
    name: str
    vendor: str
    required_columns: list[str]
    optional_columns: list[str]
    column_map: dict[str, str]
    sample_csv_header: str


SIEM_TEMPLATES: dict[str, SIEMTemplate] = {
    "splunk": SIEMTemplate(
        name="Splunk Enterprise", vendor="Splunk",
        required_columns=["_time", "host", "event_type"],
        optional_columns=["severity", "signature", "src_ip", "dest_ip", "user", "action", "bytes"],
        column_map={"_time": "timestamp", "host": "host", "event_type": "type", "severity": "severity", "signature": "threat_type", "src_ip": "source", "dest_ip": "target", "user": "user", "action": "action_type", "bytes": "bytes"},
        sample_csv_header="_time,host,event_type,severity,signature,src_ip,dest_ip,user,action,bytes",
    ),
    "elastic": SIEMTemplate(
        name="Elastic SIEM (ELK)", vendor="Elastic",
        required_columns=["timestamp", "host.hostname"],
        optional_columns=["event.kind", "event.severity", "threat.technique.name", "source.ip", "destination.ip"],
        column_map={"timestamp": "timestamp", "host.hostname": "host", "event.kind": "type", "event.severity": "severity", "threat.technique.name": "threat_type", "source.ip": "source", "destination.ip": "target"},
        sample_csv_header="timestamp,host.hostname,event.kind,event.severity,threat.technique.name,source.ip,destination.ip",
    ),
    "qradar": SIEMTemplate(
        name="IBM QRadar", vendor="IBM",
        required_columns=["starttime", "devicetime", "sourceip", "destinationip"],
        optional_columns=["eventdirection", "severity", "eventname", "username", "magnitude"],
        column_map={"starttime": "timestamp", "devicetime": "timestamp", "sourceip": "source", "destinationip": "target", "eventdirection": "action_type", "severity": "severity", "eventname": "threat_type", "username": "user", "magnitude": "alert_score"},
        sample_csv_header="starttime,devicetime,sourceip,destinationip,eventdirection,severity,eventname,username,magnitude",
    ),
    "generic": SIEMTemplate(
        name="Generic CSV", vendor="Any",
        required_columns=["timestamp", "host"],
        optional_columns=["type", "severity", "source", "target", "threat_type", "alert_score"],
        column_map={"timestamp": "timestamp", "host": "host", "type": "type", "severity": "severity", "source": "source", "target": "target", "threat_type": "threat_type", "alert_score": "alert_score"},
        sample_csv_header="timestamp,host,type,severity,source,target,threat_type,alert_score",
    ),
}

_webhook_sessions: dict[str, list[dict[str, Any]]] = {}


def _normalize_siem_rows(rows: list[dict[str, Any]], filename: str) -> dict[str, Any]:
    """Normalize mapped SIEM rows into the internal seed format."""
    from .main import _host_id_from_value, _normalize_seed_threat, _normalize_seed_severity

    normalized = []
    for index, row in enumerate(rows[:250]):
        host_id = (
            _host_id_from_value(row.get("host"))
            or _host_id_from_value(row.get("target"))
            or _host_id_from_value(row.get("source"))
            or (index % 20)
        )
        threat_type = _normalize_seed_threat(
            row.get("threat_type") or row.get("type") or row.get("event_type") or "brute_force"
        )
        raw_score = row.get("alert_score") or row.get("score") or row.get("confidence")
        try:
            alert_score = float(raw_score)
        except (TypeError, ValueError):
            alert_score = {"brute_force": 0.62, "lateral_movement": 0.78, "data_exfiltration": 0.91, "c2_beacon": 0.66}.get(threat_type, 0.5)
        alert_score = float(max(0.0, min(1.0, alert_score)))
        severity = _normalize_seed_severity(row.get("severity"), alert_score)
        normalized.append({
            "host_id": host_id,
            "host_label": row.get("host") or f"HOST-{host_id:02d}",
            "threat_type": threat_type,
            "severity": severity,
            "alert_score": alert_score,
            "layer": str(row.get("layer") or "network"),
            "source": row.get("source"),
            "target": row.get("target"),
            "raw": row.get("raw", {}),
        })

    hot_hosts = []
    seen: set[int] = set()
    for event in sorted(normalized, key=lambda item: item["alert_score"], reverse=True):
        if event["host_id"] in seen:
            continue
        seen.add(event["host_id"])
        hot_hosts.append({"host_id": event["host_id"], "threat_type": event["threat_type"], "severity": event["severity"]})
        if len(hot_hosts) == 5:
            break

    top_threat = max(
        ("brute_force", "lateral_movement", "data_exfiltration", "c2_beacon"),
        key=lambda threat: sum(1 for event in normalized if event["threat_type"] == threat),
    )

    return {"filename": filename, "event_count": len(normalized), "events": normalized[:64], "top_threat": top_threat, "hot_hosts": hot_hosts}


# ── Network Topology Builder ────────────────────────────────────────────────

@router.post("/network/define", summary="Define custom network topology")
async def define_network(definition: NetworkDefinitionRequest):
    hosts = definition.hosts
    host_ids = {h.id for h in hosts}
    connections = list(definition.connections)

    if definition.auto_connect_zones and not connections:
        zones: dict[str, list[int]] = {}
        for h in hosts:
            zones.setdefault(h.zone, []).append(h.id)
        for d in zones.get("dmz", []):
            for a in zones.get("app", []):
                connections.append(ConnectionDefinition(source=d, target=a))
        for a in zones.get("app", []):
            for db in zones.get("db", []):
                connections.append(ConnectionDefinition(source=a, target=db))
        for w in zones.get("workstation", []):
            app_hosts = zones.get("app", [])
            if app_hosts:
                import numpy as np
                targets = np.random.choice(app_hosts, size=min(2, len(app_hosts)), replace=False).tolist()
                for t in targets:
                    connections.append(ConnectionDefinition(source=w, target=t))

    for conn in connections:
        if conn.source not in host_ids:
            raise InvalidParameter(detail=f"Connection source {conn.source} not in hosts")
        if conn.target not in host_ids:
            raise InvalidParameter(detail=f"Connection target {conn.target} not in hosts")

    network_id = f"NET-{uuid.uuid4().hex[:8]}"
    from .main import app_state
    app_state.setdefault("custom_networks", {})
    app_state["custom_networks"][network_id] = {
        "network_id": network_id, "name": definition.name,
        "hosts": [h.model_dump() for h in hosts],
        "connections": [c.model_dump() for c in connections],
        "num_hosts": len(hosts),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {
        "network_id": network_id, "name": definition.name,
        "num_hosts": len(hosts), "num_connections": len(connections),
        "hosts": [h.model_dump() for h in hosts],
        "connections": [c.model_dump() for c in connections],
    }


@router.get("/network/templates", summary="Get pre-built network templates")
async def get_network_templates():
    return {
        "small_office": {
            "name": "Small Office (5 hosts)",
            "description": "1 DMZ, 2 app, 1 DB, 1 workstation",
            "hosts": [
                {"id": 0, "label": "FW-01", "zone": "dmz", "vulnerability": 0.2, "data_value": 1, "patch_level": "current"},
                {"id": 1, "label": "WEB-01", "zone": "app", "vulnerability": 0.4, "data_value": 15, "patch_level": "outdated"},
                {"id": 2, "label": "APP-01", "zone": "app", "vulnerability": 0.5, "data_value": 20, "patch_level": "current"},
                {"id": 3, "label": "DB-01", "zone": "db", "vulnerability": 0.3, "data_value": 200, "patch_level": "current"},
                {"id": 4, "label": "WS-01", "zone": "workstation", "vulnerability": 0.7, "data_value": 5, "patch_level": "outdated"},
            ],
        },
        "enterprise": {"name": "Enterprise (20 hosts)", "description": "2 DMZ, 5 app, 3 DB, 10 WS", "num_hosts": 20},
        "datacenter": {"name": "Data Center (50 hosts)", "description": "5 DMZ, 20 app, 10 DB, 15 mgmt", "num_hosts": 50},
        "cloud_k8s": {"name": "Cloud/K8s (30 hosts)", "description": "3 ingress, 10 pods, 5 svc, 2 DB, 10 workers", "num_hosts": 30},
    }


# ── SIEM Template Endpoints ─────────────────────────────────────────────────

@router.get("/siem/templates", summary="Get SIEM CSV column mapping templates")
async def get_siem_templates():
    return {key: tmpl.model_dump() for key, tmpl in SIEM_TEMPLATES.items()}


@router.post("/siem/import/{template}", summary="Import CSV using a SIEM template")
async def import_siem_csv(template: str, siem_file: UploadFile = File(...), max_rows: int = Query(default=250, ge=1, le=1000)):
    if template not in SIEM_TEMPLATES:
        raise InvalidParameter(detail=f"Unknown template '{template}'. Available: {list(SIEM_TEMPLATES.keys())}")
    tmpl = SIEM_TEMPLATES[template]
    content = await siem_file.read()
    text = content.decode("utf-8", errors="ignore").strip()
    if not text:
        raise SIEMParseError(detail="Uploaded file is empty")
    reader = csv.DictReader(io.StringIO(text))
    raw_rows = [dict(row) for row in reader]
    if not raw_rows:
        raise SIEMParseError(detail="No rows found in CSV")
    mapped_rows = []
    for row in raw_rows[:max_rows]:
        mapped: dict[str, Any] = {}
        for csv_col, standard_col in tmpl.column_map.items():
            if csv_col in row and row[csv_col]:
                mapped[standard_col] = row[csv_col]
        mapped["raw"] = {k: v for k, v in row.items() if v}
        mapped_rows.append(mapped)
    from .main import app_state
    seed = _normalize_siem_rows(mapped_rows, siem_file.filename or "uploaded.csv")
    app_state["siem_seed"] = seed
    return {"status": "imported", "template": template, "filename": siem_file.filename, "raw_rows": len(raw_rows), "mapped_rows": len(mapped_rows), "top_threat": seed["top_threat"], "hot_hosts": seed["hot_hosts"], "event_count": seed["event_count"]}


# ── Webhook Listener ────────────────────────────────────────────────────────

@router.post("/webhook/logs", summary="Push logs via webhook")
async def webhook_ingest(body: dict | list[dict]):
    events = body if isinstance(body, list) else [body]
    if not events:
        raise InvalidParameter(detail="No events provided")
    session_key = "default"
    if session_key not in _webhook_sessions:
        _webhook_sessions[session_key] = []
    ingested = 0
    for event in events[:100]:
        _webhook_sessions[session_key].append({**event, "received_at": datetime.now(timezone.utc).isoformat(), "webhook_id": f"WH-{uuid.uuid4().hex[:8]}"})
        ingested += 1
    if len(_webhook_sessions[session_key]) >= 5:
        from .main import app_state
        seed = _normalize_siem_rows(_webhook_sessions[session_key], "webhook-stream")
        app_state["siem_seed"] = seed
        _webhook_sessions[session_key] = []
        return {"status": "seeded", "ingested": ingested, "message": "Buffer reached threshold — SIEM seed updated."}
    return {"status": "buffered", "ingested": ingested, "buffer_size": len(_webhook_sessions[session_key]), "message": f"Buffer at {len(_webhook_sessions[session_key])}/5. Send more to auto-seed."}


@router.get("/webhook/status", summary="Check webhook buffer status")
async def webhook_status():
    buf = _webhook_sessions.get("default", [])
    return {"buffer_size": len(buf), "threshold": 5, "latest_events": buf[-3:] if buf else []}


# ── Results Export ───────────────────────────────────────────────────────────

@router.get("/export/alerts/{simulation_id}", summary="Export alerts as CSV")
async def export_alerts_csv(simulation_id: str):
    from .main import _get_session
    session = _get_session(simulation_id)
    alerts = session.get("alerts", [])
    if not alerts:
        return {"status": "no_data", "message": "No alerts to export"}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Alert ID", "Threat Type", "Severity", "Confidence", "Affected Hosts", "MITRE ID", "MITRE Name", "Layers Flagged", "Headline", "False Positive", "Timestamp", "Status"])
    for a in alerts:
        hosts = ", ".join(str(h) for h in a.get("affected_hosts", []))
        writer.writerow([a.get("id", ""), a.get("threat_type", ""), a.get("severity", ""), a.get("confidence", ""), hosts, a.get("mitre_id", ""), a.get("mitre_name", ""), a.get("layers_flagged", ""), a.get("headline", ""), a.get("is_likely_false_positive", ""), a.get("timestamp", ""), a.get("status", "")])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=alerts_{simulation_id}.csv"})


@router.get("/export/playbooks/{simulation_id}", summary="Export playbooks as CSV")
async def export_playbooks_csv(simulation_id: str):
    from .main import _get_session
    session = _get_session(simulation_id)
    playbooks = session.get("playbooks", [])
    if not playbooks:
        return {"status": "no_data", "message": "No playbooks to export"}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Playbook ID", "Alert ID", "Threat Type", "Severity", "Action", "Target Host", "Rationale", "Steps"])
    for pb in playbooks:
        steps = "; ".join(pb.get("steps", []))
        writer.writerow([pb.get("id", ""), pb.get("alert_id", ""), pb.get("threat_type", ""), pb.get("severity", ""), pb.get("recommended_action", ""), pb.get("target_host", ""), pb.get("rationale", ""), steps])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=playbooks_{simulation_id}.csv"})


@router.get("/export/summary/{simulation_id}", summary="Export simulation summary as JSON")
async def export_simulation_summary(simulation_id: str):
    from .main import _get_session, _serialize
    session = _get_session(simulation_id)
    return _serialize({
        "simulation_id": simulation_id,
        "episode_id": session["episode_id"],
        "total_steps": session["step"],
        "total_alerts": len(session["alerts"]),
        "critical_alerts": sum(1 for a in session["alerts"] if a.get("severity") == "critical"),
        "false_positives": sum(1 for a in session["alerts"] if a.get("is_likely_false_positive")),
        "total_playbooks": len(session["playbooks"]),
        "cumulative_rewards": session["cumulative_rewards"],
        "compromised_hosts": list(session["env"].compromised_hosts),
        "isolated_hosts": list(session["env"].isolated_hosts),
        "done": session["done"],
        "alerts": session["alerts"][-20:],
        "playbooks": session["playbooks"][-10:],
    })
