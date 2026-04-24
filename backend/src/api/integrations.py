"""Athernex Enterprise Integrations: SIEM connectors, streaming, SOAR, SSO, webhook, export."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .exceptions import InvalidParameter, SIEMParseError

router = APIRouter(prefix="/api", tags=["integrations"])

# ── API Key Store ────────────────────────────────────────────────────────────
_api_keys: dict[str, dict[str, Any]] = {}

def _init_api_keys():
    if _api_keys:
        return
    default_key = os.environ.get("ATHERNEX_API_KEY", f"ath_{uuid.uuid4().hex[:16]}")
    _api_keys[default_key] = {"label": "default", "created_at": datetime.now(timezone.utc).isoformat(), "roles": ["admin"]}
    for i, name in enumerate(["splunk_connector", "sentinel_connector", "crowdstrike_connector", "kafka_consumer", "agent_telemetry"]):
        key = f"ath_{uuid.uuid4().hex[:16]}"
        _api_keys[key] = {"label": name, "created_at": datetime.now(timezone.utc).isoformat(), "roles": ["connector"]}

def _verify_api_key(x_api_key: str = Header(default="")) -> dict[str, Any]:
    _init_api_keys()
    if not x_api_key or x_api_key not in _api_keys:
        raise HTTPException(status_code=401, detail="Invalid or missing API key. Provide X-API-Key header.")
    return _api_keys[x_api_key]


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


class SIEMConnectorConfig(BaseModel):
    vendor: str = Field(description="splunk, sentinel, crowdstrike, qradar, elastic")
    api_url: str = Field(description="Base URL of the SIEM API")
    api_key: str = Field(description="API key or token for the SIEM")
    poll_interval_seconds: int = Field(default=60, ge=10, le=3600)
    severity_filter: list[str] = Field(default=["high", "critical"], description="Only ingest these severities")
    enabled: bool = Field(default=True)


class StreamConsumerConfig(BaseModel):
    broker_type: str = Field(default="kafka", description="kafka, rabbitmq, kinesis")
    broker_url: str = Field(description="Connection URL for the broker")
    topic: str = Field(default="athernex-security-events")
    group_id: str = Field(default="athernex-consumer")
    auto_offset_reset: str = Field(default="latest")
    enabled: bool = Field(default=True)


class SOARActionRequest(BaseModel):
    action_type: str = Field(description="block_ip, isolate_host, block_port, create_ticket, send_notification")
    target: str = Field(description="IP, hostname, port, or ticket ID")
    reason: str = Field(default="")
    auto_execute: bool = Field(default=False, description="If true, execute immediately; if false, create approval request")
    channels: list[str] = Field(default=[], description="Notification channels: slack, teams, jira, servicenow")


class SSOProviderConfig(BaseModel):
    provider: str = Field(description="okta, azure_ad, saml, google")
    client_id: str = Field(default="")
    client_secret: str = Field(default="")
    discovery_url: str = Field(default="")
    domain: str = Field(default="")
    enabled: bool = Field(default=True)


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

# ── Vendor-specific SIEM normalizers ─────────────────────────────────────────

def _normalize_splunk_event(event: dict) -> dict:
    return {
        "timestamp": event.get("_time", event.get("timestamp", "")),
        "host": event.get("host", ""),
        "type": event.get("event_type", event.get("type", "alert")),
        "severity": event.get("severity", "medium"),
        "threat_type": event.get("signature", event.get("threat_type", "unknown")),
        "source": event.get("src_ip", event.get("source", "")),
        "target": event.get("dest_ip", event.get("target", "")),
        "user": event.get("user", ""),
        "action_type": event.get("action", ""),
        "bytes": event.get("bytes", 0),
        "raw": event,
    }

def _normalize_sentinel_event(event: dict) -> dict:
    return {
        "timestamp": event.get("TimeGenerated", event.get("timestamp", "")),
        "host": event.get("Computer", event.get("host", "")),
        "type": event.get("AlertType", event.get("type", "alert")),
        "severity": event.get("AlertSeverity", event.get("severity", "medium")),
        "threat_type": event.get("AttackTechniques", event.get("threat_type", "unknown")),
        "source": event.get("SourceIP", event.get("source", "")),
        "target": event.get("DestinationIP", event.get("target", "")),
        "raw": event,
    }

def _normalize_crowdstrike_event(event: dict) -> dict:
    return {
        "timestamp": event.get("event_creation_time", event.get("timestamp", "")),
        "host": event.get("hostname", event.get("host", "")),
        "type": event.get("event_simpleName", event.get("type", "alert")),
        "severity": event.get("severity", event.get("severity_name", "medium")),
        "threat_type": event.get("tactic", event.get("threat_type", "unknown")),
        "source": event.get("source_ip", event.get("source", "")),
        "target": event.get("destination_ip", event.get("target", "")),
        "raw": event,
    }

SIEM_NORMALIZERS: dict[str, Any] = {
    "splunk": _normalize_splunk_event,
    "sentinel": _normalize_sentinel_event,
    "crowdstrike": _normalize_crowdstrike_event,
}

# ── In-memory stores ────────────────────────────────────────────────────────
_webhook_sessions: dict[str, list[dict[str, Any]]] = {}
_siem_connectors: dict[str, dict[str, Any]] = {}
_stream_consumers: dict[str, dict[str, Any]] = {}
_soar_pending: dict[str, dict[str, Any]] = {}
_sso_providers: dict[str, dict[str, Any]] = {}
_soar_action_log: list[dict[str, Any]] = []
_stream_buffer: list[dict[str, Any]] = []


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


# ═══════════════════════════════════════════════════════════════════════════
# 1. DIRECT SIEM / XDR CONNECTORS (The "App" Model)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/connectors/siem", summary="Register a SIEM/XDR connector")
async def register_siem_connector(config: SIEMConnectorConfig, _auth: dict = Depends(_verify_api_key)):
    connector_id = f"SIEM-{config.vendor.upper()}-{uuid.uuid4().hex[:6]}"
    _siem_connectors[connector_id] = {
        **config.model_dump(),
        "connector_id": connector_id,
        "status": "connected" if config.enabled else "disabled",
        "last_poll": None,
        "events_ingested": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"connector_id": connector_id, "status": "registered", "vendor": config.vendor}


@router.get("/connectors/siem", summary="List all SIEM connectors")
async def list_siem_connectors(_auth: dict = Depends(_verify_api_key)):
    return {"connectors": list(_siem_connectors.values()), "total": len(_siem_connectors)}


@router.delete("/connectors/siem/{connector_id}", summary="Remove a SIEM connector")
async def remove_siem_connector(connector_id: str, _auth: dict = Depends(_verify_api_key)):
    if connector_id not in _siem_connectors:
        raise InvalidParameter(detail=f"Connector '{connector_id}' not found")
    del _siem_connectors[connector_id]
    return {"status": "removed", "connector_id": connector_id}


@router.post("/webhooks/siem", summary="Standardized SIEM webhook ingest (vendor-aware)")
async def siem_webhook_ingest(request: Request, x_api_key: str = Header(default="")):
    """Enterprise webhook endpoint. Auto-detects vendor from payload shape or X-SIEM-Vendor header."""
    _verify_api_key(x_api_key)
    vendor = request.headers.get("X-SIEM-Vendor", "generic")
    body = await request.json()
    events = body if isinstance(body, list) else [body]
    if not events:
        raise InvalidParameter(detail="No events in payload")

    normalizer = SIEM_NORMALIZERS.get(vendor)
    normalized_events = []
    for event in events[:200]:
        if normalizer:
            normalized_events.append(normalizer(event))
        else:
            normalized_events.append({
                "timestamp": event.get("timestamp", event.get("_time", "")),
                "host": event.get("host", event.get("Computer", "")),
                "type": event.get("type", event.get("event_type", "alert")),
                "severity": event.get("severity", "medium"),
                "threat_type": event.get("threat_type", event.get("signature", "unknown")),
                "source": event.get("source", event.get("src_ip", "")),
                "target": event.get("target", event.get("dest_ip", "")),
                "raw": event,
            })

    from .main import app_state
    seed = _normalize_siem_rows(normalized_events, f"siem-webhook-{vendor}")
    app_state["siem_seed"] = seed

    # Update connector stats
    for conn in _siem_connectors.values():
        if conn["vendor"] == vendor:
            conn["events_ingested"] = conn.get("events_ingested", 0) + len(normalized_events)
            conn["last_poll"] = datetime.now(timezone.utc).isoformat()

    return {
        "status": "ingested", "vendor": vendor,
        "events_received": len(events), "events_normalized": len(normalized_events),
        "top_threat": seed["top_threat"], "hot_hosts": seed["hot_hosts"],
        "message": "Events normalized and seeded. Start a simulation to analyze.",
    }


# ═══════════════════════════════════════════════════════════════════════════
# 2. REAL-TIME EVENT STREAMING (The "Data Pipeline" Model)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/streaming/configure", summary="Configure a stream consumer (Kafka/RabbitMQ/Kinesis)")
async def configure_stream_consumer(config: StreamConsumerConfig, _auth: dict = Depends(_verify_api_key)):
    consumer_id = f"STREAM-{config.broker_type.upper()}-{uuid.uuid4().hex[:6]}"
    _stream_consumers[consumer_id] = {
        **config.model_dump(),
        "consumer_id": consumer_id,
        "status": "connected" if config.enabled else "disabled",
        "messages_consumed": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"consumer_id": consumer_id, "status": "configured", "broker_type": config.broker_type}


@router.get("/streaming/consumers", summary="List stream consumers")
async def list_stream_consumers(_auth: dict = Depends(_verify_api_key)):
    return {"consumers": list(_stream_consumers.values()), "total": len(_stream_consumers)}


@router.post("/streaming/push", summary="Push events into the streaming buffer")
async def stream_push(body: dict | list[dict], x_api_key: str = Header(default="")):
    """Simulate streaming ingestion — push events as if they came from Kafka/RabbitMQ."""
    _verify_api_key(x_api_key)
    events = body if isinstance(body, list) else [body]
    if not events:
        raise InvalidParameter(detail="No events provided")
    for event in events[:500]:
        _stream_buffer.append({**event, "stream_id": f"STM-{uuid.uuid4().hex[:8]}", "received_at": datetime.now(timezone.utc).isoformat()})
    # Auto-seed when buffer exceeds threshold
    if len(_stream_buffer) >= 10:
        from .main import app_state
        seed = _normalize_siem_rows(_stream_buffer[-100:], "stream-pipeline")
        app_state["siem_seed"] = seed
        _stream_buffer.clear()
        return {"status": "seeded", "message": "Stream buffer auto-seeded into simulation."}
    return {"status": "buffered", "buffer_size": len(_stream_buffer), "threshold": 10}


@router.get("/streaming/status", summary="Check streaming buffer status")
async def streaming_status(_auth: dict = Depends(_verify_api_key)):
    return {"buffer_size": len(_stream_buffer), "threshold": 10, "consumers": len(_stream_consumers), "latest": _stream_buffer[-3:] if _stream_buffer else []}


# ═══════════════════════════════════════════════════════════════════════════
# 3. ENDPOINT AGENT TELEMETRY (The "Telemetry" Model)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/agents/telemetry", summary="Receive telemetry from endpoint agents")
async def agent_telemetry(body: dict | list[dict], x_api_key: str = Header(default="")):
    """Ingest telemetry from lightweight Athernex agents (or Wazuh/osquery forwarders)."""
    _verify_api_key(x_api_key)
    events = body if isinstance(body, list) else [body]
    if not events:
        raise InvalidParameter(detail="No telemetry data provided")
    normalized = []
    for event in events[:200]:
        normalized.append({
            "timestamp": event.get("timestamp", datetime.now(timezone.utc).isoformat()),
            "host": event.get("hostname", event.get("host", "unknown")),
            "type": event.get("event_type", event.get("type", "process")),
            "severity": event.get("severity", "info"),
            "threat_type": event.get("threat_type", "unknown"),
            "source": event.get("source_ip", event.get("source", "")),
            "target": event.get("destination_ip", event.get("target", "")),
            "process": event.get("process_name", ""),
            "pid": event.get("pid"),
            "user": event.get("username", event.get("user", "")),
            "raw": event,
        })
    from .main import app_state
    seed = _normalize_siem_rows(normalized, "agent-telemetry")
    app_state["siem_seed"] = seed
    return {"status": "ingested", "events": len(normalized), "message": "Telemetry processed and seeded."}


# ═══════════════════════════════════════════════════════════════════════════
# 4. AUTOMATED RESPONSE & SOAR CAPABILITIES
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/soar/action", summary="Create a SOAR response action")
async def create_soar_action(action: SOARActionRequest, _auth: dict = Depends(_verify_api_key)):
    action_id = f"SOAR-{uuid.uuid4().hex[:8]}"
    action_record = {
        "action_id": action_id,
        **action.model_dump(),
        "status": "executed" if action.auto_execute else "pending_approval",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "executed_at": datetime.now(timezone.utc).isoformat() if action.auto_execute else None,
        "result": None,
    }

    if action.auto_execute:
        # Simulate execution against firewall/IAM
        action_record["result"] = _simulate_soar_execution(action)
        _soar_action_log.append(action_record)
    else:
        _soar_pending[action_id] = action_record
        # Simulate notification dispatch
        for channel in action.channels:
            action_record[f"{channel}_notified"] = True
        _soar_action_log.append(action_record)

    return action_record


@router.get("/soar/pending", summary="List pending SOAR actions awaiting approval")
async def list_pending_soar_actions(_auth: dict = Depends(_verify_api_key)):
    return {"pending": list(_soar_pending.values()), "total": len(_soar_pending)}


@router.post("/soar/approve/{action_id}", summary="Approve a pending SOAR action")
async def approve_soar_action(action_id: str, _auth: dict = Depends(_verify_api_key)):
    if action_id not in _soar_pending:
        raise InvalidParameter(detail=f"Pending action '{action_id}' not found")
    action_record = _soar_pending.pop(action_id)
    action_record["status"] = "executed"
    action_record["executed_at"] = datetime.now(timezone.utc).isoformat()
    action_record["approved_by"] = _auth.get("label", "admin")
    action_record["result"] = _simulate_soar_execution_from_record(action_record)
    _soar_action_log.append(action_record)
    return action_record


@router.post("/soar/reject/{action_id}", summary="Reject a pending SOAR action")
async def reject_soar_action(action_id: str, _auth: dict = Depends(_verify_api_key)):
    if action_id not in _soar_pending:
        raise InvalidParameter(detail=f"Pending action '{action_id}' not found")
    action_record = _soar_pending.pop(action_id)
    action_record["status"] = "rejected"
    action_record["rejected_at"] = datetime.now(timezone.utc).isoformat()
    _soar_action_log.append(action_record)
    return action_record


@router.get("/soar/log", summary="Get SOAR action audit log")
async def soar_action_log(_auth: dict = Depends(_verify_api_key)):
    return {"actions": _soar_action_log[-50:], "total": len(_soar_action_log)}


def _simulate_soar_execution(action: SOARActionRequest) -> dict:
    """Simulate executing a SOAR action against infrastructure."""
    results = {
        "block_ip": {"firewall": "palo_alto", "rule_added": f"deny src={action.target}", "rule_id": f"FW-{uuid.uuid4().hex[:6]}"},
        "isolate_host": {"switch": "cisco_nx", "port_disabled": action.target, "vlan_quarantine": "VLAN999"},
        "block_port": {"firewall": "palo_alto", "rule_added": f"deny dst-port={action.target}", "rule_id": f"FW-{uuid.uuid4().hex[:6]}"},
        "create_ticket": {"itsm": "jira", "ticket_id": f"SEC-{uuid.uuid4().hex[:4]}", "priority": "critical"},
        "send_notification": {"channels": action.channels, "message": f"Athernex Alert: {action.reason or action.action_type} — {action.target}"},
    }
    return results.get(action.action_type, {"action": action.action_type, "target": action.target, "simulated": True})


def _simulate_soar_execution_from_record(record: dict) -> dict:
    action = SOARActionRequest(action_type=record["action_type"], target=record["target"], reason=record.get("reason", ""), auto_execute=True, channels=record.get("channels", []))
    return _simulate_soar_execution(action)


# ═══════════════════════════════════════════════════════════════════════════
# 5. SSO / IDENTITY INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/sso/configure", summary="Configure an SSO provider (Okta/Azure AD/SAML)")
async def configure_sso_provider(config: SSOProviderConfig, _auth: dict = Depends(_verify_api_key)):
    provider_id = f"SSO-{config.provider.upper()}-{uuid.uuid4().hex[:6]}"
    _sso_providers[provider_id] = {
        **config.model_dump(),
        "provider_id": provider_id,
        "status": "active" if config.enabled else "disabled",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"provider_id": provider_id, "status": "configured", "provider": config.provider}


@router.get("/sso/providers", summary="List configured SSO providers")
async def list_sso_providers(_auth: dict = Depends(_verify_api_key)):
    return {"providers": list(_sso_providers.values()), "total": len(_sso_providers)}


@router.post("/sso/authenticate", summary="SSO authentication endpoint")
async def sso_authenticate(body: dict):
    """Validate an SSO token and return an Athernex session token."""
    provider = body.get("provider", "okta")
    sso_token = body.get("token", "")
    if not sso_token:
        raise HTTPException(status_code=401, detail="Missing SSO token")
    # Simulate token validation
    user_email = body.get("email", f"user@{provider}.example.com")
    athernex_token = f"ath_sso_{hashlib.sha256(f'{sso_token}{user_email}'.encode()).hexdigest()[:24]}"
    return {
        "token": athernex_token,
        "alias": user_email.split("@")[0],
        "operatorId": user_email,
        "provider": provider,
        "expires_at": "2026-04-25T00:00:00Z",
    }


# ═══════════════════════════════════════════════════════════════════════════
# 6. API KEY MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/keys", summary="List API keys")
async def list_api_keys(_auth: dict = Depends(_verify_api_key)):
    _init_api_keys()
    return {"keys": [{**v, "key": k[:8] + "..." + k[-4:]} for k, v in _api_keys.items()], "total": len(_api_keys)}


@router.post("/keys/generate", summary="Generate a new API key")
async def generate_api_key(body: dict = None, _auth: dict = Depends(_verify_api_key)):
    body = body or {}
    label = body.get("label", f"key-{uuid.uuid4().hex[:4]}")
    roles = body.get("roles", ["connector"])
    new_key = f"ath_{uuid.uuid4().hex[:16]}"
    _api_keys[new_key] = {"label": label, "roles": roles, "created_at": datetime.now(timezone.utc).isoformat()}
    return {"key": new_key, "label": label, "roles": roles}


# ═══════════════════════════════════════════════════════════════════════════
# 7. INTEGRATION STATUS DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/integrations/status", summary="Get overall integration status dashboard")
async def integrations_status():
    _init_api_keys()
    return {
        "siem_connectors": {"total": len(_siem_connectors), "active": sum(1 for c in _siem_connectors.values() if c.get("enabled"))},
        "stream_consumers": {"total": len(_stream_consumers), "active": sum(1 for c in _stream_consumers.values() if c.get("enabled")), "buffer_size": len(_stream_buffer)},
        "webhook": {"buffer_size": len(_webhook_sessions.get("default", [])), "threshold": 5},
        "soar": {"pending_approvals": len(_soar_pending), "actions_executed": sum(1 for a in _soar_action_log if a.get("status") == "executed")},
        "sso": {"providers_configured": len(_sso_providers)},
        "api_keys": {"total": len(_api_keys)},
        "export": {"available_formats": ["csv", "json"]},
    }
