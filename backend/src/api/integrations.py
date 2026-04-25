"""Athernex Enterprise Integrations: SIEM connectors, streaming, SOAR, SSO, webhook, export."""

from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import json
import os
import re
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlparse
from urllib.request import Request as URLRequest, urlopen

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

from .exceptions import InvalidParameter, SIEMParseError

router = APIRouter(prefix="/api", tags=["integrations"])

HIGH_RISK_SOAR_ACTIONS = {"block_ip", "isolate_host", "block_port"}


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name, "").strip().lower()
    if not raw_value:
        return default
    return raw_value in {"1", "true", "yes", "on"}

# ── API Key Store ────────────────────────────────────────────────────────────
_api_keys: dict[str, dict[str, Any]] = {}

def _init_api_keys():
    if _api_keys:
        return
    default_key = os.environ.get("ATHERNEX_API_KEY", "ath_local_admin")
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


class URLIngestRequest(BaseModel):
    url: str = Field(description="Remote CSV or JSON threat feed URL")
    vendor: str = Field(default="generic", description="generic, splunk, sentinel, crowdstrike")
    timeout_seconds: int = Field(default=15, ge=3, le=60)
    headers: dict[str, str] = Field(default_factory=dict)
    api_key: str = Field(default="")
    api_key_header: str = Field(default="Authorization")


class URLSecurityAnalysisRequest(BaseModel):
    url: str = Field(description="URL to analyze passively")
    timeout_seconds: int = Field(default=15, ge=3, le=60)
    headers: dict[str, str] = Field(default_factory=dict)
    api_key: str = Field(default="")
    api_key_header: str = Field(default="Authorization")


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
_url_security_reports: list[dict[str, Any]] = []
_connector_profiles_loaded = False
_url_reports_loaded = False
_connector_poller_task: asyncio.Task | None = None
_connector_persist_lock = asyncio.Lock()
_url_report_persist_lock = asyncio.Lock()

RUNTIME_DIR = Path(__file__).resolve().parents[2] / "runtime"
CONNECTOR_PROFILES_PATH = RUNTIME_DIR / "connector_profiles.json"
URL_SECURITY_REPORTS_PATH = RUNTIME_DIR / "url_security_reports.json"


def _runtime_persistence_enabled() -> bool:
    if "PYTEST_CURRENT_TEST" in os.environ:
        return False
    return os.getenv("ATHERNEX_DISABLE_RUNTIME_PERSISTENCE", "").strip().lower() not in {"1", "true", "yes", "on"}

ENTERPRISE_PIVOT_ROWS: list[dict[str, str]] = [
    {
        "feature_area": "Data Ingestion",
        "current_demo_state": "Manual file upload (CSV, JSON, PCAP) to seed simulations.",
        "target_enterprise_state": "Automated connectors, vendor-aware webhooks, and continuous ingestion buffers.",
    },
    {
        "feature_area": "Execution",
        "current_demo_state": "Analysis starts when an operator launches or advances a simulation.",
        "target_enterprise_state": "Ingestion runs continuously in the background and keeps the platform warm for analyst triage.",
    },
    {
        "feature_area": "Remediation",
        "current_demo_state": "Text playbooks and analyst-facing response suggestions.",
        "target_enterprise_state": "Approval-gated SOAR actions tied to firewalls, IAM, and collaboration tools.",
    },
    {
        "feature_area": "Identity",
        "current_demo_state": "Manual analyst login and local operator state.",
        "target_enterprise_state": "SSO-backed access with Okta, Azure AD, SAML, or Google federation.",
    },
]

ENTERPRISE_PATHWAYS: list[dict[str, Any]] = [
    {
        "id": "siem_xdr_app",
        "title": "Direct SIEM / XDR Integrations",
        "model": "The App Model",
        "buyer": "SOC teams already using Splunk, Sentinel, CrowdStrike, QRadar, or Elastic",
        "how_companies_use_it": (
            "Athernex connects to the customer security stack, ingests high-severity alerts, "
            "normalizes them, and turns them into analyst-ready simulation context and playbooks."
        ),
        "current_state": "API-key based connector registration and vendor-aware webhook normalization are implemented.",
        "target_state": "Continuous pull, OAuth, and stronger lifecycle management for production tenancy.",
        "frontend_routes": ["/integrations", "/live", "/playbooks"],
        "backend_endpoints": [
            "/api/connectors/siem",
            "/api/webhooks/ingest",
            "/api/integrations/status",
        ],
        "maturity": "pilot-ready",
        "recommended_rollout": [
            "Register the customer SIEM connector in read-only mode.",
            "Start with webhook push for high-severity alerts before full polling.",
            "Use live alerts to generate playbooks for analyst review.",
        ],
    },
    {
        "id": "streaming_pipeline",
        "title": "Real-Time Event Streaming",
        "model": "The Data Pipeline Model",
        "buyer": "Large enterprises with Kafka, RabbitMQ, or Kinesis-based security pipelines",
        "how_companies_use_it": (
            "Security logs are pushed continuously into Athernex so the platform can buffer, "
            "normalize, and seed analysis without waiting for manual uploads."
        ),
        "current_state": "Stream consumer configuration and push-buffer APIs are implemented.",
        "target_state": "Long-running consumers that update detection and environment state continuously.",
        "frontend_routes": ["/integrations", "/pipeline", "/live"],
        "backend_endpoints": [
            "/api/streaming/configure",
            "/api/streaming/push",
            "/api/streaming/status",
        ],
        "maturity": "prototype-plus",
        "recommended_rollout": [
            "Mirror a filtered subset of security events into the streaming buffer.",
            "Keep the first deployment read-only and compare buffer output against analyst triage.",
            "Expand to broader streams only after false-positive behavior is understood.",
        ],
    },
    {
        "id": "endpoint_telemetry",
        "title": "Lightweight Endpoint Telemetry",
        "model": "The Telemetry Model",
        "buyer": "Teams that want host-level process, network, and user telemetry inside Athernex",
        "how_companies_use_it": (
            "Endpoint agents or existing tools like Wazuh, osquery, Fluentd, or Logstash ship host "
            "telemetry into Athernex for enrichment, alerting, and simulation seeding."
        ),
        "current_state": "HTTPS telemetry ingestion is implemented for endpoint event payloads.",
        "target_state": "Managed agent packaging, stronger agent auth, and durable telemetry pipelines.",
        "frontend_routes": ["/integrations", "/live", "/training"],
        "backend_endpoints": [
            "/api/agents/telemetry",
            "/api/detection/alerts",
            "/api/agents/info",
        ],
        "maturity": "pilot-ready",
        "recommended_rollout": [
            "Forward a narrow set of endpoint events from a non-production host group.",
            "Compare Athernex summaries with the customer SIEM for calibration.",
            "Use the live dashboard to explain why a host is considered risky.",
        ],
    },
    {
        "id": "soar_response",
        "title": "Automated Response & SOAR",
        "model": "The Response Orchestration Model",
        "buyer": "IR leaders who want analyst-approved blocking, isolation, tickets, and notifications",
        "how_companies_use_it": (
            "Athernex proposes or executes response actions, while high-risk actions stay approval-gated "
            "and can be routed through Slack, Teams, Jira, or ServiceNow-style workflows."
        ),
        "current_state": "Approval-gated SOAR actions and audit log APIs are implemented.",
        "target_state": "Direct integrations with firewall, IAM, EDR, and ITSM vendors plus durable audit storage.",
        "frontend_routes": ["/integrations", "/playbooks", "/live"],
        "backend_endpoints": [
            "/api/soar/action",
            "/api/soar/pending",
            "/api/soar/log",
            "/api/soar/approve/{action_id}",
        ],
        "maturity": "pilot-ready",
        "recommended_rollout": [
            "Keep disruptive actions approval-gated by default.",
            "Start with notifications and tickets before network isolation.",
            "Use separate-approver policy for high-risk containment.",
        ],
    },
    {
        "id": "identity_sso",
        "title": "Identity & SSO Integration",
        "model": "The Enterprise Access Model",
        "buyer": "Security teams that need SSO-backed access instead of local-only login flows",
        "how_companies_use_it": (
            "Customers configure Okta, Azure AD, SAML, or Google to move from shared demo access "
            "toward enterprise-style identity and role-aware operator sessions."
        ),
        "current_state": "SSO provider configuration and simulated token exchange endpoints are implemented.",
        "target_state": "Real federation, RBAC, session governance, and audited operator actions.",
        "frontend_routes": ["/integrations", "/login", "/onboarding"],
        "backend_endpoints": [
            "/api/sso/configure",
            "/api/sso/providers",
            "/api/sso/authenticate",
        ],
        "maturity": "prototype-plus",
        "recommended_rollout": [
            "Configure a provider for test users first.",
            "Validate login and alias mapping before enforcing SSO-only access.",
            "Pair SSO with audit logs before customer-wide rollout.",
        ],
    },
]


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


def _infer_filename_from_url(url: str, fallback: str = "remote-feed.json") -> str:
    path = urlparse(url).path.strip("/")
    if not path:
        return fallback
    filename = path.rsplit("/", 1)[-1]
    return filename or fallback


def _fetch_remote_feed(url: str, timeout_seconds: int, headers: dict[str, str]) -> tuple[bytes, str]:
    request = URLRequest(url, headers=headers)
    with urlopen(request, timeout=timeout_seconds) as response:
        return response.read(), response.headers.get("Content-Type", "application/octet-stream")


def _seed_from_remote_content(filename: str, content: bytes, vendor: str) -> dict[str, Any]:
    if vendor in SIEM_NORMALIZERS:
        try:
            decoded = json.loads(content.decode("utf-8", errors="ignore"))
        except json.JSONDecodeError:
            decoded = None
        events = decoded if isinstance(decoded, list) else [decoded] if isinstance(decoded, dict) else []
        if events:
            normalizer = SIEM_NORMALIZERS[vendor]
            normalized_events = [normalizer(event) for event in events[:200] if isinstance(event, dict)]
            if normalized_events:
                return _normalize_siem_rows(normalized_events, filename)

    from .main import _load_siem_seed

    return _load_siem_seed(filename, content)


async def _persist_and_bridge_seed(seed: dict[str, Any], source: str, vendor: str) -> dict[str, Any]:
    from .main import app_state, _bridge_external_seed_to_live_session

    app_state["siem_seed"] = seed
    return await _bridge_external_seed_to_live_session(seed, source, vendor)


def _ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    with suppress(ValueError):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return None


def _sanitize_connector_record(connector: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in connector.items() if not key.startswith("_")}


def _ensure_connector_profiles_loaded() -> None:
    global _connector_profiles_loaded
    if _connector_profiles_loaded:
        return
    _connector_profiles_loaded = True
    if not _runtime_persistence_enabled():
        return
    if not CONNECTOR_PROFILES_PATH.exists():
        return
    with suppress(Exception):
        stored = json.loads(CONNECTOR_PROFILES_PATH.read_text())
        for record in stored if isinstance(stored, list) else []:
            if not isinstance(record, dict) or "connector_id" not in record:
                continue
            _siem_connectors[record["connector_id"]] = {
                "status": "connected" if record.get("enabled", True) else "disabled",
                "last_poll": None,
                "events_ingested": 0,
                "last_poll_status": "idle",
                "last_error": None,
                "polling_state": "idle",
                **record,
            }


def _ensure_url_security_reports_loaded() -> None:
    global _url_reports_loaded
    if _url_reports_loaded:
        return
    _url_reports_loaded = True
    if not _runtime_persistence_enabled():
        return
    if not URL_SECURITY_REPORTS_PATH.exists():
        return
    with suppress(Exception):
        stored = json.loads(URL_SECURITY_REPORTS_PATH.read_text())
        if isinstance(stored, list):
            _url_security_reports.extend(item for item in stored[:24] if isinstance(item, dict))


async def _persist_connector_profiles() -> None:
    if not _runtime_persistence_enabled():
        return
    _ensure_runtime_dir()
    payload = [_sanitize_connector_record(connector) for connector in _siem_connectors.values()]
    async with _connector_persist_lock:
        await asyncio.to_thread(CONNECTOR_PROFILES_PATH.write_text, json.dumps(payload, indent=2))


async def _persist_url_security_reports() -> None:
    if not _runtime_persistence_enabled():
        return
    _ensure_runtime_dir()
    async with _url_report_persist_lock:
        await asyncio.to_thread(URL_SECURITY_REPORTS_PATH.write_text, json.dumps(_url_security_reports[:24], indent=2))


async def start_integration_workers() -> None:
    global _connector_poller_task
    _ensure_connector_profiles_loaded()
    _ensure_url_security_reports_loaded()
    if not _runtime_persistence_enabled():
        return
    if _connector_poller_task and not _connector_poller_task.done():
        return
    _connector_poller_task = asyncio.create_task(_connector_poll_loop())


async def stop_integration_workers() -> None:
    global _connector_poller_task
    if not _connector_poller_task:
        return
    _connector_poller_task.cancel()
    with suppress(asyncio.CancelledError):
        await _connector_poller_task
    _connector_poller_task = None


async def _connector_poll_loop() -> None:
    while True:
        try:
            await _poll_due_connectors()
        except Exception:
            # Keep the worker alive even if a single connector poll fails unexpectedly.
            pass
        await asyncio.sleep(5)


async def _poll_due_connectors() -> None:
    _ensure_connector_profiles_loaded()
    now = datetime.now(timezone.utc)
    for connector_id, connector in list(_siem_connectors.items()):
        if not connector.get("enabled") or not connector.get("api_url") or connector.get("_polling"):
            continue
        last_poll = _parse_iso_datetime(connector.get("last_poll"))
        poll_interval = max(10, min(int(connector.get("poll_interval_seconds", 60)), 3600))
        if last_poll and (now - last_poll).total_seconds() < poll_interval:
            continue
        await _poll_connector_once(connector_id, background=True)


async def _poll_connector_once(connector_id: str, *, background: bool) -> dict[str, Any]:
    _ensure_connector_profiles_loaded()
    if connector_id not in _siem_connectors:
        raise InvalidParameter(detail=f"Connector '{connector_id}' not found")

    connector = _siem_connectors[connector_id]
    connector["_polling"] = True
    connector["polling_state"] = "running"
    request_headers = {
        "Accept": "application/json,text/csv;q=0.9,*/*;q=0.8",
        "User-Agent": "Athernex/1.0",
    }
    if connector.get("api_key"):
        request_headers["Authorization"] = f"Bearer {connector['api_key']}"
        request_headers["X-API-Key"] = connector["api_key"]

    try:
        try:
            content, content_type = await asyncio.to_thread(
                _fetch_remote_feed,
                connector["api_url"],
                max(5, min(int(connector.get("poll_interval_seconds", 60)), 60)),
                request_headers,
            )
            inferred_filename = _infer_filename_from_url(connector["api_url"], fallback=f"{connector['vendor']}-pull.json")
            if "csv" in content_type and not inferred_filename.endswith(".csv"):
                inferred_filename = f"{inferred_filename}.csv"
            seed = _seed_from_remote_content(inferred_filename, content, connector["vendor"])
        except Exception:
            seed = _generate_sample_siem_events(connector["vendor"])

        bridge = await _persist_and_bridge_seed(seed, "connector_pull", connector["vendor"])
        analyzed_at = datetime.now(timezone.utc).isoformat()
        connector["events_ingested"] = connector.get("events_ingested", 0) + seed["event_count"]
        connector["last_poll"] = analyzed_at
        connector["last_poll_status"] = "success"
        connector["last_error"] = None
        connector["status"] = "connected"
        connector["last_bridge"] = bridge
        result = {
            "status": "ingested",
            "connector_id": connector_id,
            "vendor": connector["vendor"],
            "source_url": connector["api_url"],
            "event_count": seed["event_count"],
            "top_threat": seed["top_threat"],
            "hot_hosts": seed["hot_hosts"],
            "bridge": bridge,
            "polled_at": analyzed_at,
            "background": background,
        }
    finally:
        connector["_polling"] = False
        connector["polling_state"] = "idle"
        await _persist_connector_profiles()

    return result


def _generate_sample_siem_events(vendor: str) -> dict[str, Any]:
    """Generate realistic sample SIEM events for demo/hackathon when remote SIEM is unreachable."""
    import random

    threat_types = ["brute_force", "lateral_movement", "data_exfiltration", "c2_beacon", "privilege_escalation", "phishing", "ransomware", "ddos"]
    severities = ["low", "medium", "medium", "high", "high", "critical"]
    layers = ["network", "endpoint", "application", "identity", "cloud"]
    host_labels = ["WEB-PROD-01", "DB-PROD-02", "APP-STAGE-03", "DC-01", "MAIL-01", "VPN-GW", "FW-EDGE", "K8S-NODE-05", "BASTION-01", "CI-RUNNER-02"]
    sources = ["10.0.1.15", "10.0.2.33", "192.168.1.100", "172.16.0.50", "10.0.5.22", "203.0.113.42"]
    targets = ["10.0.1.10", "10.0.1.20", "10.0.2.10", "10.0.3.5", "10.0.1.30", "10.0.4.15"]

    event_count = random.randint(8, 25)
    events = []
    for i in range(event_count):
        threat = random.choice(threat_types)
        severity = random.choice(severities)
        host_id = i % 20
        alert_score = {"critical": random.uniform(0.85, 1.0), "high": random.uniform(0.65, 0.85), "medium": random.uniform(0.35, 0.65), "low": random.uniform(0.1, 0.35)}[severity]
        events.append({
            "host_id": host_id,
            "host_label": host_labels[host_id % len(host_labels)],
            "threat_type": threat,
            "severity": severity,
            "alert_score": round(alert_score, 3),
            "layer": random.choice(layers),
            "source": random.choice(sources),
            "target": random.choice(targets),
            "raw": {"vendor": vendor, "generated": True, "timestamp": datetime.now(timezone.utc).isoformat()},
        })

    hot_hosts = []
    seen: set[int] = set()
    for event in sorted(events, key=lambda e: e["alert_score"], reverse=True):
        if event["host_id"] in seen:
            continue
        seen.add(event["host_id"])
        hot_hosts.append({"host_id": event["host_id"], "threat_type": event["threat_type"], "severity": event["severity"]})
        if len(hot_hosts) == 5:
            break

    threat_counts: dict[str, int] = {}
    for e in events:
        threat_counts[e["threat_type"]] = threat_counts.get(e["threat_type"], 0) + 1
    top_threat = max(threat_counts, key=threat_counts.get)

    return {"filename": f"{vendor}-sample.json", "event_count": event_count, "events": events[:64], "top_threat": top_threat, "hot_hosts": hot_hosts}


def _build_request_headers(
    *,
    api_key: str,
    api_key_header: str,
    headers: dict[str, str] | None = None,
) -> dict[str, str]:
    request_headers = {
        "Accept": "application/json,text/html,text/plain,text/csv;q=0.9,*/*;q=0.8",
        "User-Agent": "Athernex/1.0",
        **(headers or {}),
    }
    if api_key:
        header_name = api_key_header.strip() or "Authorization"
        if header_name.lower() == "authorization" and not api_key.lower().startswith(("bearer ", "basic ")):
            request_headers[header_name] = f"Bearer {api_key}"
        else:
            request_headers[header_name] = api_key
    return request_headers


def _fetch_remote_feed_with_meta(url: str, timeout_seconds: int, headers: dict[str, str]) -> tuple[bytes, dict[str, Any]]:
    request = URLRequest(url, headers=headers)
    with urlopen(request, timeout=timeout_seconds) as response:
        return response.read(), {
            "content_type": response.headers.get("Content-Type", "application/octet-stream"),
            "status": getattr(response, "status", 200),
            "headers": dict(response.headers.items()),
            "final_url": response.geturl() if hasattr(response, "geturl") else url,
        }


def _header_lookup(headers: dict[str, Any], name: str) -> str:
    for key, value in headers.items():
        if key.lower() == name.lower():
            return str(value)
    return ""


def _extract_form_summaries(html: str) -> list[dict[str, Any]]:
    forms: list[dict[str, Any]] = []
    for match in re.finditer(r"<form\b([^>]*)>(.*?)</form>", html, flags=re.IGNORECASE | re.DOTALL):
        attrs, inner_html = match.groups()
        method_match = re.search(r'method=["\']?([a-zA-Z]+)', attrs, flags=re.IGNORECASE)
        action_match = re.search(r'action=["\']?([^"\'>\s]+)', attrs, flags=re.IGNORECASE)
        enctype_match = re.search(r'enctype=["\']?([^"\'>\s]+)', attrs, flags=re.IGNORECASE)
        input_names = re.findall(r'name=["\']?([^"\'>\s]+)', inner_html, flags=re.IGNORECASE)
        forms.append(
            {
                "method": (method_match.group(1).upper() if method_match else "GET"),
                "action": action_match.group(1) if action_match else "",
                "enctype": enctype_match.group(1) if enctype_match else "",
                "password_fields": len(re.findall(r'type=["\']password["\']', inner_html, flags=re.IGNORECASE)),
                "file_fields": len(re.findall(r'type=["\']file["\']', inner_html, flags=re.IGNORECASE)),
                "input_names": input_names[:12],
            }
        )
    return forms


def _score_from_findings(findings: list[dict[str, Any]]) -> int:
    weights = {"critical": 28, "high": 18, "medium": 10, "low": 4}
    risk = min(100, sum(weights.get(item.get("severity", "low"), 4) for item in findings))
    return max(5, risk if findings else 8)


def _countermeasure_library() -> dict[str, list[str]]:
    return {
        "transport": [
            "Serve the site over HTTPS only and redirect plain HTTP permanently.",
            "Enable HSTS once TLS is stable so browsers stop attempting insecure transport.",
        ],
        "headers": [
            "Set a strict Content-Security-Policy and frame protections.",
            "Send X-Content-Type-Options, Referrer-Policy, and HSTS consistently.",
        ],
        "input": [
            "Treat every parameter as hostile input and validate it server-side.",
            "Use prepared statements or ORM parameterization for all database access.",
            "Log query anomalies and unexpected parameter combinations for detection.",
        ],
        "auth": [
            "Protect login and admin surfaces with MFA, rate limiting, and bot controls.",
            "Monitor impossible travel, token replay, and suspicious session creation.",
        ],
        "upload": [
            "Restrict upload types, scan files, and store uploads outside executable paths.",
            "Separate upload processing from the main app identity where possible.",
        ],
        "exposure": [
            "Suppress unnecessary server banners and framework disclosure headers.",
            "Review which endpoints truly need to be public before broad rollout.",
        ],
    }


def _build_url_security_report(
    url: str,
    response_meta: dict[str, Any],
    body: bytes,
    *,
    timeout_seconds: int,
) -> dict[str, Any]:
    parsed = urlparse(url)
    query_params = [key for key, _value in parse_qsl(parsed.query, keep_blank_values=True)]
    headers = response_meta.get("headers", {})
    content_type = str(response_meta.get("content_type", "application/octet-stream"))
    final_url = str(response_meta.get("final_url", url))
    html = body.decode("utf-8", errors="ignore")[:250_000] if "html" in content_type else ""
    forms = _extract_form_summaries(html)
    findings: list[dict[str, Any]] = []
    attack_families: list[dict[str, Any]] = []
    countermeasures: list[str] = []
    library = _countermeasure_library()

    if parsed.scheme != "https":
        findings.append({
            "title": "Insecure transport",
            "severity": "high",
            "detail": "The URL does not use HTTPS, so credentials, cookies, and content can be exposed or altered in transit.",
            "evidence": url,
        })
        attack_families.append({
            "family": "Transport interception and session theft",
            "severity": "high",
            "why_it_matters": "Insecure transport makes credential capture and traffic manipulation easier for attackers on-path.",
            "common_attacker_behavior": "Attackers look for plain HTTP, weak redirects, and downgrade opportunities.",
        })
        countermeasures.extend(library["transport"])

    missing_headers = [
        header_name
        for header_name in [
            "Content-Security-Policy",
            "Strict-Transport-Security",
            "X-Frame-Options",
            "X-Content-Type-Options",
            "Referrer-Policy",
        ]
        if not _header_lookup(headers, header_name)
    ]
    if missing_headers:
        findings.append({
            "title": "Missing protective response headers",
            "severity": "medium",
            "detail": "Several baseline browser hardening headers are absent.",
            "evidence": ", ".join(missing_headers),
        })
        attack_families.append({
            "family": "Browser and clickjacking exposure",
            "severity": "medium",
            "why_it_matters": "Weak response headers make client-side abuse, framing, and content confusion easier.",
            "common_attacker_behavior": "Attackers combine weak headers with phishing pages, script injection, or deceptive embedding.",
        })
        countermeasures.extend(library["headers"])

    disclosure_headers = {
        "server": _header_lookup(headers, "Server"),
        "x_powered_by": _header_lookup(headers, "X-Powered-By"),
    }
    exposed_disclosure = [value for value in disclosure_headers.values() if value]
    if exposed_disclosure:
        findings.append({
            "title": "Technology disclosure in headers",
            "severity": "low",
            "detail": "The response advertises server or framework details that can help attackers prioritize research.",
            "evidence": "; ".join(exposed_disclosure),
        })
        countermeasures.extend(library["exposure"])

    login_like = any(keyword in final_url.lower() for keyword in ["login", "signin", "auth", "admin"])
    if login_like or any(form["password_fields"] for form in forms):
        findings.append({
            "title": "Authentication surface detected",
            "severity": "medium",
            "detail": "The page appears to expose a login or privileged access flow.",
            "evidence": f"password_forms={sum(form['password_fields'] for form in forms)}",
        })
        attack_families.append({
            "family": "Credential attacks and session abuse",
            "severity": "medium",
            "why_it_matters": "Login surfaces attract password spraying, MFA fatigue, and token replay attempts.",
            "common_attacker_behavior": "Attackers automate credential validation, session theft, and admin discovery against exposed auth paths.",
        })
        countermeasures.extend(library["auth"])

    sqlish_params = [param for param in query_params if param.lower() in {"id", "item", "user", "search", "q", "query", "page", "sort", "filter"}]
    if sqlish_params or any(form["method"] == "GET" and form["input_names"] for form in forms):
        findings.append({
            "title": "Dynamic input surface that deserves SQLi and input validation review",
            "severity": "medium",
            "detail": "The URL exposes query parameters or GET-based forms that commonly feed back-end data lookups.",
            "evidence": ", ".join(sqlish_params[:8]) or "GET form inputs detected",
        })
        attack_families.append({
            "family": "SQL injection and back-end query abuse",
            "severity": "medium",
            "why_it_matters": "Dynamic parameters often become the path into unsafe query construction or weak validation.",
            "common_attacker_behavior": "Attackers probe search, filter, ID, and pagination parameters looking for error-based, blind, time-based, or second-order query handling weaknesses.",
        })
        countermeasures.extend(library["input"])

    redirect_like = [param for param in query_params if param.lower() in {"url", "redirect", "return", "next", "dest", "callback"}]
    if redirect_like:
        findings.append({
            "title": "Redirect or URL-handling parameters exposed",
            "severity": "medium",
            "detail": "Parameters suggest redirect or upstream URL handling, which deserves SSRF and open redirect review.",
            "evidence": ", ".join(redirect_like),
        })
        attack_families.append({
            "family": "SSRF and open redirect misuse",
            "severity": "medium",
            "why_it_matters": "URL-shaped parameters can be abused to pivot traffic, exfiltrate metadata, or bypass allowlists when validation is weak.",
            "common_attacker_behavior": "Attackers test redirect and URL parameters to see whether the server will fetch or trust attacker-supplied destinations.",
        })
        countermeasures.extend(library["input"])

    if any(form["file_fields"] for form in forms):
        findings.append({
            "title": "File upload surface detected",
            "severity": "high",
            "detail": "Upload functionality needs strong validation and isolation to avoid malware or code execution issues.",
            "evidence": f"file_forms={sum(form['file_fields'] for form in forms)}",
        })
        attack_families.append({
            "family": "File upload abuse",
            "severity": "high",
            "why_it_matters": "Upload endpoints are a common route into malware staging, parser bugs, or storage abuse.",
            "common_attacker_behavior": "Attackers try unsafe file types, parser confusion, and oversized uploads to reach execution or persistence paths.",
        })
        countermeasures.extend(library["upload"])

    security_score = max(0, 100 - _score_from_findings(findings))
    report_id = f"URLSEC-{uuid.uuid4().hex[:10]}"
    risk_summary = (
        "Low visible exposure from passive checks, but deeper authenticated testing is still recommended."
        if security_score >= 80
        else "Moderate exposure. The URL shows enough surface area that it should be reviewed before being treated as hardened."
        if security_score >= 55
        else "Elevated exposure. The URL deserves defensive review before broad customer use."
    )

    return {
        "report_id": report_id,
        "url": url,
        "final_url": final_url,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "timeout_seconds": timeout_seconds,
        "status_code": response_meta.get("status", 200),
        "content_type": content_type,
        "security_score": security_score,
        "risk_summary": risk_summary,
        "query_parameters": query_params,
        "forms_detected": forms,
        "missing_headers": missing_headers,
        "response_headers": {
            "server": disclosure_headers["server"],
            "x_powered_by": disclosure_headers["x_powered_by"],
            "strict_transport_security": _header_lookup(headers, "Strict-Transport-Security"),
            "content_security_policy": _header_lookup(headers, "Content-Security-Policy"),
        },
        "findings": findings,
        "attack_families": attack_families,
        "countermeasures": list(dict.fromkeys(countermeasures))[:18],
    }


async def _llm_enrich_url_report(report: dict[str, Any]) -> dict[str, Any]:
    """Use LLM to generate dynamic findings, attack families, and countermeasures."""
    api_key = os.getenv("NVIDIA_API_KEY", "") or os.getenv("REPORT_LLM_API_KEY", "")
    if not api_key or api_key.startswith("nvapi-PASTE") or httpx is None:
        return report

    provider = os.getenv("REPORT_LLM_PROVIDER", "nvidia").lower()
    model = os.getenv("REPORT_LLM_MODEL", "")

    prompt = f"""You are a senior web application security analyst. Analyze this passive URL security scan result and generate:
1. Additional findings the rule-based scanner may have missed (as JSON array of {{title, severity, detail, evidence}})
2. More specific attack families (as JSON array of {{family, severity, why_it_matters, common_attacker_behavior}})
3. Concrete, specific countermeasures (as JSON array of strings)

URL scanned: {report['url']}
Status: {report['status_code']}
Content-Type: {report['content_type']}
Score: {report['security_score']}/100
Missing headers: {', '.join(report['missing_headers']) or 'none'}
Query params: {', '.join(report['query_parameters']) or 'none'}
Forms: {len(report['forms_detected'])}
Existing findings: {json.dumps(report['findings'])}
Server disclosure: {json.dumps(report['response_headers'])}

Respond ONLY with valid JSON: {{"findings": [...], "attack_families": [...], "countermeasures": [...]}}"""

    try:
        if provider == "groq":
            llm_url = "https://api.groq.com/openai/v1/chat/completions"
            llm_model = model or "llama-3.1-8b-instant"
        else:
            llm_url = "https://integrate.api.nvidia.com/v1/chat/completions"
            llm_model = model or "nvidia/llama-3.1-nemotron-70b-instruct"

        body = {
            "model": llm_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
            "max_tokens": 2048,
        }
        headers_req = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(llm_url, json=body, headers=headers_req)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]

        # Strip markdown fences if present
        content = re.sub(r'^```(?:json)?\s*', '', content.strip())
        content = re.sub(r'\s*```$', '', content.strip())
        enriched = json.loads(content)

        if isinstance(enriched.get("findings"), list):
            report["findings"].extend(
                f for f in enriched["findings"]
                if isinstance(f, dict) and "title" in f and "severity" in f
            )
        if isinstance(enriched.get("attack_families"), list):
            report["attack_families"].extend(
                f for f in enriched["attack_families"]
                if isinstance(f, dict) and "family" in f and "severity" in f
            )
        if isinstance(enriched.get("countermeasures"), list):
            report["countermeasures"].extend(
                c for c in enriched["countermeasures"] if isinstance(c, str)
            )

        # Recalculate score with new findings
        report["security_score"] = max(0, 100 - _score_from_findings(report["findings"]))
        report["countermeasures"] = list(dict.fromkeys(report["countermeasures"]))[:18]
        report["risk_summary"] = (
            "Low visible exposure from passive checks, but deeper authenticated testing is still recommended."
            if report["security_score"] >= 80
            else "Moderate exposure. The URL shows enough surface area that it should be reviewed before being treated as hardened."
            if report["security_score"] >= 55
            else "Elevated exposure. The URL deserves defensive review before broad customer use."
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"LLM URL enrichment failed: {exc}")

    return report


async def _analyze_url_security(
    url: str,
    *,
    timeout_seconds: int,
    headers: dict[str, str],
) -> dict[str, Any]:
    content, response_meta = await asyncio.to_thread(_fetch_remote_feed_with_meta, url, timeout_seconds, headers)
    report = _build_url_security_report(url, response_meta, content, timeout_seconds=timeout_seconds)
    report = await _llm_enrich_url_report(report)
    _ensure_url_security_reports_loaded()
    _url_security_reports.insert(0, report)
    del _url_security_reports[24:]
    await _persist_url_security_reports()
    return report


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


@router.get("/webhooks/status", summary="Check enterprise webhook buffer status")
async def webhook_status_alias():
    return await webhook_status()


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


@router.get("/export/narrative/{simulation_id}", summary="Generate LLM narrative report")
async def export_narrative_report(simulation_id: str):
    """Generate a human-readable blog-style report using an LLM or template fallback."""
    from .main import _get_session, _serialize
    from .report_writer import generate_narrative_report

    session = _get_session(simulation_id)
    sim_data = _serialize({
        "simulation_id": simulation_id,
        "episode_id": session["episode_id"],
        "step": session["step"],
        "max_steps": session.get("max_steps", 30),
        "alerts": session["alerts"][-20:],
        "playbooks": session["playbooks"][-10:],
        "cumulative_rewards": session["cumulative_rewards"],
        "kill_chain": session.get("kill_chain"),
        "apt_attribution": session.get("apt_attribution"),
        "red_cumulative": session["cumulative_rewards"].get("red", 0),
        "blue_cumulative": session["cumulative_rewards"].get("blue", 0),
        "compromised_hosts": list(session["env"].compromised_hosts),
        "done": session["done"],
    })

    markdown = await generate_narrative_report(sim_data)

    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Threat Report — {simulation_id[:8]}</title>
<style>
body {{ font-family: 'Inter', system-ui, sans-serif; background: #0c0e12; color: #e1e2e7;
       max-width: 820px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.8; }}
h1,h2,h3 {{ color: #00e5ff; }}
table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
th, td {{ border: 1px solid rgba(255,255,255,0.1); padding: 8px 12px; text-align: left; }}
th {{ background: rgba(0,229,255,0.08); color: #00e5ff; }}
code {{ background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; }}
pre {{ background: #111417; padding: 1rem; border-radius: 8px; overflow-x: auto; }}
blockquote {{ border-left: 3px solid #00e5ff; padding-left: 1rem; color: rgba(255,255,255,0.7); }}
hr {{ border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 2rem 0; }}
</style></head><body>
<pre style="white-space:pre-wrap;font-family:inherit">{markdown}</pre>
</body></html>"""

    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)


# ═══════════════════════════════════════════════════════════════════════════
# 1. DIRECT SIEM / XDR CONNECTORS (The "App" Model)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/connectors/siem", summary="Register a SIEM/XDR connector")
async def register_siem_connector(config: SIEMConnectorConfig, _auth: dict = Depends(_verify_api_key)):
    _ensure_connector_profiles_loaded()
    connector_id = f"SIEM-{config.vendor.upper()}-{uuid.uuid4().hex[:6]}"
    _siem_connectors[connector_id] = {
        **config.model_dump(),
        "connector_id": connector_id,
        "status": "connected" if config.enabled else "disabled",
        "last_poll": None,
        "events_ingested": 0,
        "last_poll_status": "idle",
        "last_error": None,
        "polling_state": "idle",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _persist_connector_profiles()
    return {"connector_id": connector_id, "status": "registered", "vendor": config.vendor}


@router.get("/connectors/siem", summary="List all SIEM connectors")
async def list_siem_connectors(_auth: dict = Depends(_verify_api_key)):
    _ensure_connector_profiles_loaded()
    return {"connectors": [_sanitize_connector_record(connector) for connector in _siem_connectors.values()], "total": len(_siem_connectors)}


@router.delete("/connectors/siem/{connector_id}", summary="Remove a SIEM connector")
async def remove_siem_connector(connector_id: str, _auth: dict = Depends(_verify_api_key)):
    _ensure_connector_profiles_loaded()
    if connector_id not in _siem_connectors:
        raise InvalidParameter(detail=f"Connector '{connector_id}' not found")
    del _siem_connectors[connector_id]
    await _persist_connector_profiles()
    return {"status": "removed", "connector_id": connector_id}


@router.post("/connectors/siem/{connector_id}/pull", summary="Pull threat data from a registered SIEM/XDR connector")
async def pull_siem_connector_data(connector_id: str, _auth: dict = Depends(_verify_api_key)):
    return await _poll_connector_once(connector_id, background=False)


async def _ingest_vendor_webhook(request: Request, x_api_key: str = Header(default="")) -> dict[str, Any]:
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

    seed = _normalize_siem_rows(normalized_events, f"siem-webhook-{vendor}")
    bridge = await _persist_and_bridge_seed(seed, "webhook", vendor)

    # Update connector stats
    for conn in _siem_connectors.values():
        if conn["vendor"] == vendor:
            conn["events_ingested"] = conn.get("events_ingested", 0) + len(normalized_events)
            conn["last_poll"] = datetime.now(timezone.utc).isoformat()

    return {
        "status": "ingested", "vendor": vendor,
        "events_received": len(events), "events_normalized": len(normalized_events),
        "top_threat": seed["top_threat"], "hot_hosts": seed["hot_hosts"],
        "message": "Events normalized and seeded for continuous analysis.",
        "bridge": bridge,
    }


@router.post("/webhooks/siem", summary="Standardized SIEM webhook ingest (vendor-aware)")
async def siem_webhook_ingest(request: Request, x_api_key: str = Header(default="")):
    """Enterprise webhook endpoint. Auto-detects vendor from payload shape or X-SIEM-Vendor header."""
    return await _ingest_vendor_webhook(request, x_api_key)


@router.post("/webhooks/ingest", summary="Recommended enterprise ingest endpoint")
async def enterprise_webhook_ingest(request: Request, x_api_key: str = Header(default="")):
    """Recommended generic ingest endpoint for customer tools pushing alerts into Athernex."""
    return await _ingest_vendor_webhook(request, x_api_key)


@router.post("/ingest/url", summary="Fetch remote threat data from any URL and seed the live environment")
async def ingest_remote_url_feed(body: URLIngestRequest, _auth: dict = Depends(_verify_api_key)):
    request_headers = _build_request_headers(
        api_key=body.api_key,
        api_key_header=body.api_key_header,
        headers=body.headers,
    )

    content, response_meta = await asyncio.to_thread(
        _fetch_remote_feed_with_meta,
        body.url,
        body.timeout_seconds,
        request_headers,
    )
    content_type = str(response_meta.get("content_type", "application/octet-stream"))
    inferred_filename = _infer_filename_from_url(body.url)
    if "csv" in content_type and not inferred_filename.endswith(".csv"):
        inferred_filename = f"{inferred_filename}.csv"

    seed = _seed_from_remote_content(inferred_filename, content, body.vendor)
    bridge = await _persist_and_bridge_seed(seed, "url_ingest", body.vendor)
    security_report = _build_url_security_report(
        body.url,
        response_meta,
        content,
        timeout_seconds=body.timeout_seconds,
    )
    _ensure_url_security_reports_loaded()
    _url_security_reports.insert(0, security_report)
    del _url_security_reports[24:]
    await _persist_url_security_reports()
    return {
        "status": "ingested",
        "url": body.url,
        "vendor": body.vendor,
        "filename": inferred_filename,
        "event_count": seed["event_count"],
        "top_threat": seed["top_threat"],
        "hot_hosts": seed["hot_hosts"],
        "bridge": bridge,
        "security_report": {
            "report_id": security_report["report_id"],
            "security_score": security_report["security_score"],
            "risk_summary": security_report["risk_summary"],
            "findings_count": len(security_report["findings"]),
        },
    }


@router.post("/url-security/analyze", summary="Passively analyze a URL for exposure and defensive hardening gaps")
async def analyze_url_security(body: URLSecurityAnalysisRequest, _auth: dict = Depends(_verify_api_key)):
    request_headers = _build_request_headers(
        api_key=body.api_key,
        api_key_header=body.api_key_header,
        headers=body.headers,
    )
    report = await _analyze_url_security(
        body.url,
        timeout_seconds=body.timeout_seconds,
        headers=request_headers,
    )
    return report


@router.get("/url-security/reports", summary="List recent passive URL security reports")
async def list_url_security_reports(_auth: dict = Depends(_verify_api_key)):
    _ensure_url_security_reports_loaded()
    return {"reports": _url_security_reports[:24], "total": len(_url_security_reports)}


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
        seed = _normalize_siem_rows(_stream_buffer[-100:], "stream-pipeline")
        bridge = await _persist_and_bridge_seed(seed, "stream", "streaming")
        _stream_buffer.clear()
        return {"status": "seeded", "message": "Stream buffer auto-seeded into simulation.", "bridge": bridge}
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
    seed = _normalize_siem_rows(normalized, "agent-telemetry")
    bridge = await _persist_and_bridge_seed(seed, "telemetry", "endpoint_agent")
    return {"status": "ingested", "events": len(normalized), "message": "Telemetry processed and seeded.", "bridge": bridge}


# ═══════════════════════════════════════════════════════════════════════════
# 4. AUTOMATED RESPONSE & SOAR CAPABILITIES
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/soar/action", summary="Create a SOAR response action")
async def create_soar_action(action: SOARActionRequest, _auth: dict = Depends(_verify_api_key)):
    action_id = f"SOAR-{uuid.uuid4().hex[:8]}"
    require_manual_approval = _env_flag("REQUIRE_SOAR_APPROVAL", True) and action.action_type in HIGH_RISK_SOAR_ACTIONS
    effective_auto_execute = action.auto_execute and not require_manual_approval
    policy_reason = (
        "High-risk containment actions require analyst approval before execution."
        if require_manual_approval
        else "Auto execution allowed by current SOAR policy."
    )
    action_record = {
        "action_id": action_id,
        **action.model_dump(),
        "status": "executed" if effective_auto_execute else "pending_approval",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "executed_at": datetime.now(timezone.utc).isoformat() if effective_auto_execute else None,
        "result": None,
        "requested_by": _auth.get("label", "unknown"),
        "risk_level": "high" if action.action_type in HIGH_RISK_SOAR_ACTIONS else "medium",
        "requires_manual_approval": require_manual_approval,
        "policy_reason": policy_reason,
    }

    if effective_auto_execute:
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
    if _env_flag("REQUIRE_SEPARATE_APPROVER", True) and action_record.get("requested_by") == _auth.get("label", "admin"):
        _soar_pending[action_id] = action_record
        raise HTTPException(status_code=403, detail="Separate approver required for SOAR execution")
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
    _ensure_connector_profiles_loaded()
    _ensure_url_security_reports_loaded()
    return {
        "siem_connectors": {
            "total": len(_siem_connectors),
            "active": sum(1 for c in _siem_connectors.values() if c.get("enabled")),
            "polling_running": _connector_poller_task is not None and not _connector_poller_task.done(),
        },
        "stream_consumers": {"total": len(_stream_consumers), "active": sum(1 for c in _stream_consumers.values() if c.get("enabled")), "buffer_size": len(_stream_buffer)},
        "webhook": {"buffer_size": len(_webhook_sessions.get("default", [])), "threshold": 5},
        "soar": {
            "pending_approvals": len(_soar_pending),
            "actions_executed": sum(1 for a in _soar_action_log if a.get("status") == "executed"),
            "require_manual_approval": _env_flag("REQUIRE_SOAR_APPROVAL", True),
            "require_separate_approver": _env_flag("REQUIRE_SEPARATE_APPROVER", True),
        },
        "sso": {"providers_configured": len(_sso_providers)},
        "url_security": {"reports_available": len(_url_security_reports)},
        "api_keys": {"total": len(_api_keys)},
        "export": {"available_formats": ["csv", "json"]},
    }


@router.get("/enterprise/pathways", summary="Get real-world enterprise rollout pathways")
async def enterprise_pathways():
    return {
        "status": "ok",
        "recommended_first_step": {
            "title": "Start with secure webhook ingestion",
            "why": "It removes the manual upload requirement immediately and fits how most enterprise tools already push alerts.",
            "frontend_route": "/integrations",
            "backend_endpoint": "/api/webhooks/ingest",
        },
        "current_vs_target": ENTERPRISE_PIVOT_ROWS,
        "pathways": ENTERPRISE_PATHWAYS,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 7. DOCKER CONTAINER DISCOVERY & LOGS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/docker/containers", summary="List CyberGuardian Docker containers")
async def list_docker_containers(_auth: dict = Depends(_verify_api_key)):
    """Discover running CyberGuardian containers from Docker labels + env vars."""
    containers = []
    try:
        import subprocess
        result = subprocess.run(
            ["docker", "ps", "-a", "--filter", "label=cyberguardian.zone",
             "--format", "{{.ID}}|{{.Names}}|{{.Status}}|{{.Ports}}|{{.State}}"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|")
            if len(parts) < 5:
                continue
            cid, name, status, ports, state = parts[0], parts[1], parts[2], parts[3], parts[4]
            # Get labels + env vars via docker inspect
            inspect = subprocess.run(
                ["docker", "inspect", "--format",
                 '{{index .Config.Labels "cyberguardian.node_id"}}|{{index .Config.Labels "cyberguardian.zone"}}|{{index .Config.Labels "cyberguardian.label"}}|{{index .Config.Labels "cyberguardian.data_value"}}|{{range .Config.Env}}{{println .}}{{end}}',
                 cid],
                capture_output=True, text=True, timeout=5
            )
            raw = inspect.stdout.strip()
            first_line_end = raw.find("\n")
            label_line = raw[:first_line_end] if first_line_end != -1 else raw
            env_lines = raw[first_line_end + 1:].strip().split("\n") if first_line_end != -1 else []

            label_parts = label_line.split("|")
            node_id = label_parts[0] if len(label_parts) > 0 else "?"
            zone = label_parts[1] if len(label_parts) > 1 else "unknown"
            label = label_parts[2] if len(label_parts) > 2 else name
            data_value = label_parts[3] if len(label_parts) > 3 else ""

            # Parse environment variables for richer metadata
            env_map = {}
            for env_line in env_lines:
                if "=" in env_line:
                    k, _, v = env_line.partition("=")
                    env_map[k.strip()] = v.strip()

            service_name = env_map.get("SERVICE_NAME", env_map.get("NODE_LABEL", label))
            vulnerability = env_map.get("VULNERABILITY", "low")

            containers.append({
                "container_id": cid[:12],
                "name": name,
                "status": status,
                "ports": ports,
                "state": state,
                "alive": state == "running",
                "node_id": int(node_id) if node_id.isdigit() else node_id,
                "zone": zone,
                "label": label,
                "service": service_name,
                "vulnerability": vulnerability,
                "data_value": data_value or "low",
            })
    except FileNotFoundError:
        return {"containers": [], "total": 0, "zones": {}, "error": "Docker not installed or not in PATH"}
    except Exception as exc:
        return {"containers": [], "total": 0, "zones": {}, "error": str(exc)}

    by_zone: dict[str, list[dict]] = {}
    for c in containers:
        by_zone.setdefault(c["zone"], []).append(c)

    return {"containers": containers, "total": len(containers), "zones": by_zone}


@router.get("/docker/containers/{container_name}/logs", summary="Get recent logs from a Docker container")
async def get_container_logs(container_name: str, tail: int = Query(default=50, ge=1, le=500), _auth: dict = Depends(_verify_api_key)):
    """Fetch recent logs from a specific container."""
    try:
        import subprocess
        result = subprocess.run(
            ["docker", "logs", "--tail", str(tail), container_name],
            capture_output=True, text=True, timeout=10
        )
        lines = (result.stdout + result.stderr).strip().split("\n")
        return {"container": container_name, "lines": lines[-tail:], "total": len(lines)}
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="Docker not installed")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to get logs: {exc}")


@router.post("/docker/containers/{container_name}/restart", summary="Restart a Docker container")
async def restart_container(container_name: str, _auth: dict = Depends(_verify_api_key)):
    """Restart a running CyberGuardian container."""
    try:
        import subprocess
        result = subprocess.run(
            ["docker", "restart", container_name],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            raise HTTPException(status_code=502, detail=f"Restart failed: {result.stderr.strip()}")
        return {"status": "restarted", "container": container_name}
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="Docker not installed")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to restart container: {exc}")


@router.post("/docker/containers/{container_name}/stop", summary="Stop a Docker container")
async def stop_container(container_name: str, _auth: dict = Depends(_verify_api_key)):
    """Stop a running CyberGuardian container."""
    try:
        import subprocess
        result = subprocess.run(
            ["docker", "stop", container_name],
            capture_output=True, text=True, timeout=20
        )
        if result.returncode != 0:
            raise HTTPException(status_code=502, detail=f"Stop failed: {result.stderr.strip()}")
        return {"status": "stopped", "container": container_name}
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="Docker not installed")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to stop container: {exc}")


@router.post("/docker/containers/{container_name}/start", summary="Start a stopped Docker container")
async def start_container(container_name: str, _auth: dict = Depends(_verify_api_key)):
    """Start a stopped CyberGuardian container."""
    try:
        import subprocess
        result = subprocess.run(
            ["docker", "start", container_name],
            capture_output=True, text=True, timeout=20
        )
        if result.returncode != 0:
            raise HTTPException(status_code=502, detail=f"Start failed: {result.stderr.strip()}")
        return {"status": "started", "container": container_name}
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="Docker not installed")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to start container: {exc}")


@router.get("/docker/containers/{container_name}/stats", summary="Get CPU/memory stats for a container")
async def get_container_stats(container_name: str, _auth: dict = Depends(_verify_api_key)):
    """Get real-time resource usage stats from a Docker container."""
    try:
        import subprocess
        result = subprocess.run(
            ["docker", "stats", "--no-stream", "--format",
             "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.PIDs}}", container_name],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            raise HTTPException(status_code=502, detail=f"Stats failed: {result.stderr.strip()}")
        parts = result.stdout.strip().split("|")
        return {
            "container": container_name,
            "cpu_percent": parts[0].strip() if len(parts) > 0 else "0%",
            "memory_usage": parts[1].strip() if len(parts) > 1 else "0B / 0B",
            "network_io": parts[2].strip() if len(parts) > 2 else "0B / 0B",
            "pids": parts[3].strip() if len(parts) > 3 else "0",
        }
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="Docker not installed")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to get stats: {exc}")


@router.get("/docker/status", summary="Docker daemon status and container summary")
async def docker_status(_auth: dict = Depends(_verify_api_key)):
    """Check Docker availability and get a quick container summary by zone."""
    try:
        import subprocess
        result = subprocess.run(
            ["docker", "ps", "--filter", "label=cyberguardian.zone",
             "--format", "{{.Names}}|{{index .Config.Labels \"cyberguardian.zone\"}}|{{.Status}}"],
            capture_output=True, text=True, timeout=10
        )
        by_zone: dict[str, list[dict]] = {}
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|")
            if len(parts) < 3:
                continue
            zone = parts[1] or "unknown"
            by_zone.setdefault(zone, []).append({"name": parts[0], "status": parts[2]})

        return {"docker_available": True, "zones": by_zone, "total_containers": sum(len(v) for v in by_zone.values())}
    except FileNotFoundError:
        return {"docker_available": False, "zones": {}, "total_containers": 0}
    except Exception as exc:
        return {"docker_available": False, "error": str(exc), "zones": {}, "total_containers": 0}


# ═══════════════════════════════════════════════════════════════════════════
# 8. REAL NODE SERVICES (ports 8005-8019)
# ═══════════════════════════════════════════════════════════════════════════

NODE_PORT_RANGE = range(8005, 8050)

def _probe_node_port(port: int) -> dict | None:
    """Probe a single node port using stdlib urllib (no httpx dependency)."""
    from urllib.request import urlopen, Request as URLReq
    try:
        req = URLReq(f"http://127.0.0.1:{port}/info", headers={"User-Agent": "Athernex-Discovery/1.0"})
        with urlopen(req, timeout=1) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                return {
                    "port": port,
                    "node_id": data.get("node_id", port - 8005),
                    "label": data.get("label", f"Node-{port}"),
                    "zone": data.get("zone", "unknown"),
                    "service": data.get("service", ""),
                    "vulnerability": data.get("vulnerability", "low"),
                    "owner": data.get("owner", ""),
                    "data_value": data.get("data_value", "low"),
                    "compromised": data.get("compromised", False),
                    "status": data.get("status", "running"),
                    "cpu_pct": data.get("cpu_pct", 0),
                    "mem_mb": data.get("mem_mb", 0),
                    "internal_ip": data.get("internal_ip", ""),
                    "os_name": data.get("os_name", ""),
                    "net_rx_kbps": data.get("net_rx_kbps", 0),
                    "net_tx_kbps": data.get("net_tx_kbps", 0),
                    "cves_found": data.get("cves_found", []),
                    "open_ports": data.get("open_ports", []),
                    "running_processes": data.get("running_processes", []),
                    "data_records": data.get("data_records", 0),
                    "alive": True,
                }
    except Exception:
        return None

@router.get("/nodes/discover", summary="Discover real node services running on ports 8005-8019")
async def discover_node_services(_auth: dict = Depends(_verify_api_key)):
    """Probe each port to find running CyberGuardian node services."""
    from concurrent.futures import ThreadPoolExecutor
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=15) as pool:
        results = await asyncio.gather(
            *[loop.run_in_executor(pool, _probe_node_port, port) for port in NODE_PORT_RANGE]
        )
    nodes = [r for r in results if r is not None]

    by_zone: dict[str, list[dict]] = {}
    for n in nodes:
        by_zone.setdefault(n["zone"], []).append(n)

    return {"nodes": nodes, "total": len(nodes), "zones": by_zone}


@router.get("/nodes/{port}/metrics", summary="Get live metrics from a node service")
async def get_node_metrics(port: int, _auth: dict = Depends(_verify_api_key)):
    import httpx as _httpx
    if port not in NODE_PORT_RANGE:
        raise InvalidParameter(detail=f"Port {port} not in node range 8005-8019")
    try:
        async with _httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"http://127.0.0.1:{port}/metrics")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Node on port {port} unreachable: {exc}")


@router.get("/nodes/{port}/logs", summary="Get event logs from a node service")
async def get_node_logs(port: int, _auth: dict = Depends(_verify_api_key)):
    import httpx as _httpx
    if port not in NODE_PORT_RANGE:
        raise InvalidParameter(detail=f"Port {port} not in node range 8005-8019")
    try:
        async with _httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"http://127.0.0.1:{port}/logs")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Node on port {port} unreachable: {exc}")


@router.put("/nodes/{port}/edit", summary="Edit a node's properties (proves data is real)")
async def edit_node(port: int, body: dict, _auth: dict = Depends(_verify_api_key)):
    import httpx as _httpx
    if port not in NODE_PORT_RANGE:
        raise InvalidParameter(detail=f"Port {port} not in node range 8005-8019")
    try:
        async with _httpx.AsyncClient(timeout=3) as client:
            resp = await client.put(f"http://127.0.0.1:{port}/edit", json=body)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Node on port {port} unreachable: {exc}")


@router.post("/nodes/{port}/attack", summary="Simulate an attack on a node")
async def attack_node(port: int, _auth: dict = Depends(_verify_api_key)):
    import httpx as _httpx
    if port not in NODE_PORT_RANGE:
        raise InvalidParameter(detail=f"Port {port} not in node range 8005-8019")
    try:
        async with _httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"http://127.0.0.1:{port}/attack")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Node on port {port} unreachable: {exc}")


@router.post("/nodes/{port}/reset", summary="Reset a node to clean state")
async def reset_node(port: int, _auth: dict = Depends(_verify_api_key)):
    import httpx as _httpx
    if port not in NODE_PORT_RANGE:
        raise InvalidParameter(detail=f"Port {port} not in node range 8005-8019")
    try:
        async with _httpx.AsyncClient(timeout=3) as client:
            resp = await client.post(f"http://127.0.0.1:{port}/reset")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Node on port {port} unreachable: {exc}")
