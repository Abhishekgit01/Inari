from __future__ import annotations

import math
import uuid
from collections import Counter, defaultdict
from copy import deepcopy
from typing import Any, Iterable


RED_ACTION_NAMES = [
    "scan",
    "exploit",
    "lateral_move",
    "exfiltrate",
    "beacon",
    "wait",
]

BLUE_ACTION_NAMES = [
    "monitor",
    "isolate",
    "patch",
    "block_ip",
    "reset_credentials",
    "investigate",
]

BLUE_ACTION_COSTS = {
    "monitor": 1.0,
    "investigate": 2.0,
    "patch": 5.0,
    "block_ip": 3.0,
    "reset_credentials": 4.0,
    "isolate": 6.0,
}

RED_DECISION_ACTIONS = [
    "scan",
    "exploit",
    "lateral_move",
    "exfiltrate",
    "beacon",
    "wait",
]

BLUE_DECISION_ACTIONS = [
    "monitor",
    "investigate",
    "patch",
    "block_ip",
    "reset_credentials",
    "isolate",
]

ACTION_COLORS = {
    "scan": "#ff6600",
    "exploit": "#ff0044",
    "lateral_move": "#ff8800",
    "exfiltrate": "#ff0044",
    "beacon": "#ff6600",
    "wait": "#7a9cc4",
    "monitor": "#00e5ff",
    "isolate": "#00ff88",
    "patch": "#7fd8ff",
    "block_ip": "#ffcc00",
    "reset_credentials": "#00ff88",
    "investigate": "#00e5ff",
}

THREAT_META = {
    "brute_force": {
        "mitre_id": "T1110",
        "mitre_name": "Brute Force",
        "headline": "Repeated authentication pressure detected",
    },
    "lateral_movement": {
        "mitre_id": "T1021",
        "mitre_name": "Remote Services",
        "headline": "Internal pivot behavior detected",
    },
    "data_exfiltration": {
        "mitre_id": "T1041",
        "mitre_name": "Exfiltration Over C2 Channel",
        "headline": "Large outbound data transfer observed",
    },
    "c2_beacon": {
        "mitre_id": "T1071",
        "mitre_name": "Application Layer Protocol",
        "headline": "Beaconing pattern indicates remote control",
    },
    "ddos": {
        "mitre_id": "T1498",
        "mitre_name": "Network Denial of Service",
        "headline": "High volume traffic disrupting service",
    },
    "phishing": {
        "mitre_id": "T1566",
        "mitre_name": "Phishing",
        "headline": "Suspicious email delivery detected",
    },
    "ransomware": {
        "mitre_id": "T1486",
        "mitre_name": "Data Encrypted for Impact",
        "headline": "Mass file encryption behavior observed",
    },
    "privilege_escalation": {
        "mitre_id": "T1068",
        "mitre_name": "Exploitation for Privilege Escalation",
        "headline": "Unauthorized rights elevation detected",
    },
}

SEVERITY_COLORS = {
    "low": "#00ff88",
    "medium": "#ffcc00",
    "high": "#ff6600",
    "critical": "#ff0044",
}


def host_label(host_id: int) -> str:
    if host_id < 2:
        return f"DMZ-{host_id + 1:02d}"
    if host_id < 7:
        return f"APP-{host_id - 1:02d}"
    if host_id < 10:
        return f"DB-{host_id - 6:02d}"
    return f"WS-{host_id - 9:02d}"


def host_type(host_id: int) -> str:
    if host_id < 2:
        return "dmz"
    if host_id < 7:
        return "app_server"
    if host_id < 10:
        return "db_server"
    return "workstation"


def zone_y(host_id: int) -> float:
    if host_id < 2:
        return 0.1
    if host_id < 7:
        return 0.35
    if host_id < 10:
        return 0.6
    return 0.82


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _zone_name_for_host(host_id: int) -> str:
    if host_id < 2:
        return "Perimeter"
    if host_id < 7:
        return "Application"
    if host_id < 10:
        return "Crown Jewel"
    return "Workstations"


def _status_color(status: str) -> str:
    return {
        "compromised": "#ff335f",
        "under_attack": "#ff6600",
        "detected": "#ffcc00",
        "isolated": "#00ff88",
    }.get(status, "#14d1ff")


def _severity_from_confidence(confidence: float, layers_flagged: int) -> str:
    boosted = confidence + max(0, layers_flagged - 1) * 0.08
    if boosted >= 0.9:
        return "critical"
    if boosted >= 0.72:
        return "high"
    if boosted >= 0.45:
        return "medium"
    return "low"


def _phase(session: dict[str, Any]) -> str:
    env = session["env"]
    compromised = len(env.compromised_hosts)
    if env.red_caught or (compromised > 0 and compromised <= len(env.detected_compromises)):
        return "contained"
    if env.data_exfiltrated > 120 or compromised >= 6:
        return "critical"
    if compromised >= 3 or len(session.get("alerts", [])) >= 3:
        return "escalating"
    return "early"


def _log_step(log: dict[str, Any]) -> int:
    return int(log.get("step", log.get("timestamp", 0)) or 0)


def _threat_from_log(log: dict[str, Any]) -> str:
    raw = str(log.get("type") or log.get("action_type") or "").lower()
    if raw in {"scan", "exploit", "auth", "brute_force"}:
        return "brute_force"
    if raw in {"lateral_move", "lateral_movement"}:
        return "lateral_movement"
    if raw in {"exfiltration", "data_exfiltration", "exfiltrate"}:
        return "data_exfiltration"
    if raw in {"beacon", "c2_beacon"}:
        return "c2_beacon"
    return "brute_force"


def _affected_hosts(logs: Iterable[dict[str, Any]]) -> list[int]:
    hosts: list[int] = []
    for log in logs:
        for key in ("target", "destination", "source", "host_id"):
            value = log.get(key)
            if isinstance(value, int) and value not in hosts:
                hosts.append(value)
    return hosts


def _false_positive_indicators(logs: Iterable[dict[str, Any]]) -> list[str]:
    indicators: list[str] = []
    for log in logs:
        if log.get("is_false_positive_seed"):
            indicators.append("scheduled maintenance pattern")
        if "scheduled_task" in str(log.get("fp_resolution", "")):
            indicators.append("scheduled task evidence")
        if str(log.get("user", "")).lower() in {"domain\\backup_svc", "backup_svc", "admin"}:
            indicators.append("known admin or service account")
        if "backup" in str(log.get("file_access", "")).lower():
            indicators.append("backup data path")
        if str(log.get("parent_process", "")).lower() in {"taskschd.exe", "scheduler"}:
            indicators.append("trusted scheduler parent process")

    deduped: list[str] = []
    for item in indicators:
        if item not in deduped:
            deduped.append(item)
    return deduped


def build_alerts(step_logs: list[dict[str, Any]], step: int) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for log in step_logs:
        correlation_id = str(log.get("correlation_id") or f"step-{step}-{uuid.uuid4().hex[:6]}")
        grouped[correlation_id].append(log)

    alerts: list[dict[str, Any]] = []
    for correlation_id, logs in grouped.items():
        layers = {str(log.get("layer", "network")) for log in logs}
        threat_counts = Counter(_threat_from_log(log) for log in logs)
        threat_type = threat_counts.most_common(1)[0][0]
        affected_hosts = _affected_hosts(logs)
        affected_host_labels = [host_label(host) for host in affected_hosts]
        base_confidence = sum(float(log.get("alert_score", 0.35) or 0.35) for log in logs) / max(1, len(logs))
        confidence = _clamp(base_confidence + (len(layers) - 1) * 0.18)
        indicators = _false_positive_indicators(logs)
        if indicators:
            confidence = _clamp(confidence - 0.22)

        severity = _severity_from_confidence(confidence, len(layers))
        meta = THREAT_META[threat_type]
        labels = affected_host_labels or ["UNKNOWN"]

        if threat_type == "brute_force":
            headline = f"Repeated failed authentication pressure against {labels[0]}"
            detail = (
                f"{labels[0]} shows credential abuse indicators across {len(layers)} signal layers."
            )
        elif threat_type == "lateral_movement":
            headline = f"Lateral movement path active across {' → '.join(labels[:2] or labels)}"
            detail = (
                f"Internal remote-service movement was observed with {len(layers)} corroborating layers."
            )
        elif threat_type == "data_exfiltration":
            bytes_sent = int(max(float(log.get("bytes", 0) or 0) for log in logs))
            headline = f"Outbound transfer spike on {labels[0]} ({bytes_sent // 1_000_000} MB)"
            detail = (
                f"Potential exfiltration chain tied to {labels[0]} with visible outbound movement and endpoint context."
            )
        else:
            headline = f"Periodic beaconing detected from {labels[0]}"
            detail = (
                f"Network and host telemetry show callback behavior consistent with command-and-control."
            )

        alerts.append(
            {
                "id": f"ALERT-{correlation_id}",
                "threat_type": threat_type,
                "severity": severity,
                "confidence": round(confidence, 3),
                "affected_hosts": affected_hosts,
                "affected_host_labels": affected_host_labels,
                "mitre_id": meta["mitre_id"],
                "mitre_name": meta["mitre_name"],
                "layers_flagged": len(layers),
                "layer_breakdown": {
                    "network": "network" in layers,
                    "endpoint": "endpoint" in layers,
                    "application": "application" in layers,
                },
                "headline": headline,
                "detail": detail,
                "false_positive_indicators": indicators,
                "is_likely_false_positive": bool(indicators),
                "timestamp": step,
                "status": "investigating" if indicators else "active",
            }
        )

    return alerts


def build_network_graph_state(session: dict[str, Any]) -> dict[str, Any]:
    env = session["env"]
    network = env.network
    info = env._get_info()
    step_logs = env.last_step_logs or env.logs[-12:]
    latest_alert_hosts = {
        host
        for alert in session.get("alerts", [])[-10:]
        for host in alert.get("affected_hosts", [])
    }
    red_target = (env.last_red_action_meta or {}).get("target_host_id")
    traffic = network.get_traffic_matrix()

    nodes: list[dict[str, Any]] = []
    # Check which node ports are offline (deleted via CLI)
    dead_ports: set[int] = getattr(env, "_dead_ports", set())

    for host_id in range(env.num_hosts):
        node_port = 8005 + host_id
        is_offline = host_id <= 14 and node_port in dead_ports

        if is_offline:
            continue
            
        if host_id in env.isolated_hosts:
            status = "isolated"
        elif host_id == red_target and host_id not in env.isolated_hosts:
            status = "under_attack"
        elif host_id in env.detected_compromises:
            status = "detected"
        elif host_id in env.compromised_hosts:
            status = "compromised"
        else:
            status = "clean"

        alert_row = network.alert_scores[host_id]
        alert_scores = {
            "brute_force": round(float(alert_row[0]), 3),
            "lateral_movement": round(float(alert_row[1]), 3),
            "data_exfiltration": round(float(alert_row[2]), 3),
            "c2_beacon": round(float(alert_row[3]), 3),
        }

        if status == "compromised":
            pulse = 0.95
        elif status == "detected":
            pulse = 0.78
        elif status == "isolated":
            pulse = 0.18
        elif status == "under_attack":
            pulse = 1.0
        elif host_id in latest_alert_hosts:
            pulse = 0.42
        else:
            pulse = 0.12

        if status == "compromised":
            glow_color = "#ff0044"
        elif status == "detected":
            glow_color = "#ffcc00"
        elif host_type(host_id) == "db_server":
            glow_color = "#ff9900"
        elif host_id in latest_alert_hosts:
            glow_color = "#00e5ff"
        else:
            glow_color = None

        nodes.append(
            {
                "id": host_id,
                "label": host_label(host_id),
                "type": host_type(host_id),
                "status": status,
                "zone_y": zone_y(host_id),
                "vulnerability_score": round(float(network.get_vulnerabilities(host_id)), 3),
                "data_value_gb": round(float(network.get_data_value(host_id)), 2),
                "patch_level": network.patch_levels.get(host_id, "current"),
                "alert_scores": alert_scores,
                "is_red_current_position": host_id == env.red_position,
                "pulse_intensity": pulse,
                "glow_color": glow_color,
                "is_offline": is_offline,
            }
        )

    internet_active = False
    internet_glow = "cyan"
    edges: list[dict[str, Any]] = []
    recent_pairs: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    recent_internet_logs: list[dict[str, Any]] = []

    for log in step_logs:
        source = log.get("source")
        target = log.get("destination", log.get("target"))
        if isinstance(source, int) and isinstance(target, int):
            recent_pairs[(source, target)].append(log)
            recent_pairs[(target, source)].append(log)
        if _threat_from_log(log) in {"data_exfiltration", "c2_beacon"} and isinstance(source, int):
            recent_internet_logs.append(log)
            internet_active = True
            if _threat_from_log(log) == "data_exfiltration":
                internet_glow = "red"
            elif internet_glow != "red":
                internet_glow = "amber"

    for source, target in network.graph.edges():
        traffic_volume = _clamp(float(max(traffic[source][target], traffic[target][source])) / 240.0)
        pair_logs = recent_pairs.get((source, target), [])
        edge_type = "normal"
        particle_color = "#00e5ff"
        particle_speed = round(0.5 + traffic_volume * 1.5, 2)
        particle_count = max(1, min(5, int(math.ceil(traffic_volume * 5)))) if traffic_volume > 0.05 else 0
        direction_reversed = False
        is_active = traffic_volume > 0.05

        if source in env.isolated_hosts or target in env.isolated_hosts:
            particle_color = "#3d5570"
            particle_count = 0
            is_active = False
        elif pair_logs:
            first_threat = _threat_from_log(pair_logs[0])
            is_active = True
            if first_threat == "lateral_movement":
                edge_type = "lateral"
                particle_color = "#ff6600"
            elif first_threat == "brute_force":
                edge_type = "attack"
                particle_color = "#ff0044"
            else:
                edge_type = "normal"
                particle_color = "#00e5ff"
            if pair_logs[0].get("destination") == source:
                direction_reversed = True

        edges.append(
            {
                "source": source,
                "target": target,
                "traffic_volume": round(max(traffic_volume, 0.04), 3),
                "edge_type": edge_type,
                "is_active": is_active,
                "particle_color": particle_color,
                "particle_speed": particle_speed,
                "particle_count": particle_count,
                "direction_reversed": direction_reversed,
            }
        )

    nodes.append(
        {
            "id": env.num_hosts,
            "label": "INTERNET",
            "type": "internet",
            "status": "under_attack" if internet_active and internet_glow == "red" else "clean",
            "zone_y": 0.02,
            "vulnerability_score": 0.0,
            "data_value_gb": 0.0,
            "patch_level": "n/a",
            "alert_scores": {
                "brute_force": 0.0,
                "lateral_movement": 0.0,
                "data_exfiltration": 0.0,
                "c2_beacon": 0.0,
            },
            "is_red_current_position": False,
            "pulse_intensity": 0.8 if internet_active else 0.14,
            "glow_color": "#ff0044" if internet_glow == "red" else "#ffcc00" if internet_active else "#568dff",
        }
    )
    if internet_active:
        for log in recent_internet_logs:
            source = log.get("source")
            if not isinstance(source, int):
                continue
            threat_type = _threat_from_log(log)
            edges.append(
                {
                    "source": source,
                    "target": env.num_hosts,
                    "traffic_volume": round(_clamp(float(log.get("bytes", 0) or 0) / 2_500_000), 3),
                    "edge_type": "exfil" if threat_type == "data_exfiltration" else "beacon",
                    "is_active": True,
                    "particle_color": "#ff0044" if threat_type == "data_exfiltration" else "#ffcc00",
                    "particle_speed": 2.0 if threat_type == "data_exfiltration" else 1.2,
                    "particle_count": 5 if threat_type == "data_exfiltration" else 2,
                    "direction_reversed": False,
                }
            )

    return {
        "nodes": nodes,
        "edges": edges,
        "step": session["step"],
        "max_steps": env.max_steps,
        "internet_node_active": internet_active,
        "internet_node_glow": internet_glow,
        "episode_id": session["episode_id"],
        "phase": _phase(session),
    }


def _normalize_overlay_scores(scores: dict[str, float]) -> dict[str, float]:
    values = list(scores.values())
    peak = max(values) if values else 1.0
    floor = min(values) if values else 0.0
    spread = max(peak - floor, 0.12)
    return {
        key: round(_clamp((value - floor) / spread), 3)
        for key, value in scores.items()
    }


def build_decision_overlay(session: dict[str, Any]) -> tuple[dict[str, dict[str, float]], dict[str, dict[str, float]]]:
    env = session["env"]
    traffic = env.network.get_traffic_matrix()
    alert_scores = env.network.get_alert_scores()
    red_q_values: dict[str, dict[str, float]] = {}
    blue_policy_probs: dict[str, dict[str, float]] = {}

    for host_id in range(env.num_hosts):
        vuln = float(env.network.get_vulnerabilities(host_id))
        data_value = float(env.network.get_data_value(host_id))
        data_norm = _clamp(data_value / 420.0)
        alerts = alert_scores[host_id]
        alert_peak = float(alerts.max())
        compromised = 1.0 if host_id in env.compromised_hosts else 0.0
        isolated = 1.0 if host_id in env.isolated_hosts else 0.0
        detected = 1.0 if host_id in env.detected_compromises else 0.0
        neighbors = env.network.get_neighbors(host_id)
        compromised_neighbors = sum(1 for neighbor in neighbors if neighbor in env.compromised_hosts)
        neighbor_pressure = _clamp(compromised_neighbors / max(1, len(neighbors) or 1))
        traffic_pressure = _clamp(float(max(traffic[host_id].max(), traffic[:, host_id].max())) / 250.0)

        red_raw = {
            "scan": 0.18 + vuln * 0.32 + neighbor_pressure * 0.22 + (0.18 if compromised == 0 else 0.05),
            "exploit": (0.12 if isolated else 0.28) + vuln * 0.42 + data_norm * 0.22 + (0.16 if compromised == 0 else 0.04),
            "lateral_move": (0.08 if isolated else 0.24) + neighbor_pressure * 0.34 + data_norm * 0.18 + (0.18 if host_type(host_id) in {"app_server", "db_server"} else 0.06),
            "exfiltrate": 0.04 + data_norm * 0.52 + compromised * 0.34 + traffic_pressure * 0.14,
            "beacon": 0.06 + float(alerts[3]) * 0.34 + compromised * 0.3 + traffic_pressure * 0.18,
            "wait": 0.08 + isolated * 0.2 + detected * 0.12,
        }

        blue_raw = {
            "monitor": 0.18 + alert_peak * 0.38 + traffic_pressure * 0.18 + (0.1 if compromised == 0 else 0.04),
            "investigate": 0.16 + alert_peak * 0.32 + detected * 0.26 + neighbor_pressure * 0.14,
            "patch": (0.08 if compromised else 0.2) + vuln * 0.46 + data_norm * 0.1,
            "block_ip": 0.08 + float(alerts[0]) * 0.24 + float(alerts[3]) * 0.22 + neighbor_pressure * 0.18,
            "reset_credentials": 0.06 + float(alerts[0]) * 0.26 + compromised * 0.34 + detected * 0.18,
            "isolate": (0.06 if isolated else 0.18) + compromised * 0.44 + alert_peak * 0.26 + data_norm * 0.14,
        }

        red_q_values[str(host_id)] = _normalize_overlay_scores(red_raw)
        blue_policy_probs[str(host_id)] = _normalize_overlay_scores(blue_raw)

    return red_q_values, blue_policy_probs


def _branch_label(index: int) -> str:
    return ["SAFE", "RISKY", "CRITICAL"][min(index, 2)]


def _build_shadow_branch(host_id: int, action_name: str, depth: int, risk_seed: float) -> dict[str, Any]:
    risk_score = _clamp(risk_seed + depth * 0.08)
    branch = {
        "action_name": action_name,
        "target_host": host_id,
        "target_label": host_label(host_id),
        "risk_score": round(risk_score, 3),
        "classification": _branch_label(int(risk_score * 2.8)),
        "predicted_reward": round((1.0 - risk_score) * 100, 2),
        "child_branches": [],
    }
    if depth < 2:
        next_host = 7 + ((host_id + depth) % 3)
        branch["child_branches"] = [
            _build_shadow_branch(next_host, "investigate", depth + 1, risk_score * 0.7),
            _build_shadow_branch(next_host, "isolate", depth + 1, min(1.0, risk_score + 0.1)),
        ]
    return branch


def _attack_graph_components(session: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str], int | None, float]:
    env = session["env"]
    nodes = [
        {
            "id": f"host_{host_id}",
            "label": host_label(host_id),
            "compromised": host_id in env.compromised_hosts,
            "is_critical_target": host_type(host_id) == "db_server",
            "x": round((host_id % 5) * 190 + 110, 2),
            "y": round(zone_y(host_id) * 620, 2),
        }
        for host_id in range(env.num_hosts)
    ]
    nodes.insert(
        0,
        {
            "id": "internet",
            "label": "INTERNET",
            "compromised": False,
            "is_critical_target": False,
            "x": 500.0,
            "y": 40.0,
        },
    )

    completed_edges: list[dict[str, Any]] = []
    for log in env.logs:
        threat_type = _threat_from_log(log)
        source = log.get("source")
        destination = log.get("destination", log.get("target"))
        if threat_type == "data_exfiltration" and isinstance(source, int):
            completed_edges.append(
                {
                    "source": f"host_{source}",
                    "target": "internet",
                    "action_type": "exfil",
                    "success": bool(log.get("success", True)),
                    "step_occurred": _log_step(log),
                    "is_critical_path": False,
                    "is_predicted": False,
                }
            )
        elif isinstance(source, int) and isinstance(destination, int):
            completed_edges.append(
                {
                    "source": f"host_{source}",
                    "target": f"host_{destination}",
                    "action_type": "lateral" if threat_type == "lateral_movement" else "exploit",
                    "success": bool(log.get("success", True)),
                    "step_occurred": _log_step(log),
                    "is_critical_path": False,
                    "is_predicted": False,
                }
            )

    predicted_edges: list[dict[str, Any]] = []
    for host in sorted(env.compromised_hosts):
        neighbors = env.network.get_neighbors(host)
        for neighbor in neighbors[:2]:
            if neighbor in env.compromised_hosts:
                continue
            predicted_edges.append(
                {
                    "source": f"host_{host}",
                    "target": f"host_{neighbor}",
                    "action_type": "lateral",
                    "success": False,
                    "step_occurred": session["step"] + 1,
                    "is_critical_path": False,
                    "is_predicted": True,
                }
            )

    critical_path: list[str] = []
    steps_to_db_breach: int | None = None
    data_at_risk_gb = 0.0
    try:
        import networkx as nx

        graph = env.network.graph
        start = env.red_position
        db_hosts = [host for host in range(env.num_hosts) if host_type(host) == "db_server"]
        candidate_paths = [nx.shortest_path(graph, start, db_host) for db_host in db_hosts if nx.has_path(graph, start, db_host)]
        if candidate_paths:
            path = min(candidate_paths, key=len)
            critical_path = [f"host_{node}" for node in path]
            steps_to_db_breach = max(0, len(path) - 1)
            data_at_risk_gb = round(sum(env.network.get_data_value(node) for node in path if host_type(node) == "db_server"), 2)
    except Exception:
        critical_path = []

    critical_pairs = {(critical_path[index], critical_path[index + 1]) for index in range(len(critical_path) - 1)}
    for edge in completed_edges + predicted_edges:
        if (edge["source"], edge["target"]) in critical_pairs:
            edge["is_critical_path"] = True

    return nodes, completed_edges + predicted_edges, critical_path, steps_to_db_breach, data_at_risk_gb


def build_pipeline_state(session: dict[str, Any], training_metrics: dict[str, Any]) -> dict[str, Any]:
    env = session["env"]
    latest_alerts = session.get("alerts", [])[-6:]
    alerts_by_type = Counter(alert["threat_type"] for alert in latest_alerts)
    alert_density = len(latest_alerts) / 6.0
    compromised_ratio = len(env.compromised_hosts) / max(1, env.num_hosts)
    exfil_ratio = min(env.data_exfiltrated / 500.0, 1.0)
    budget_state = deepcopy(session["autonomy_budget"])
    budget_remaining_ratio = budget_state["remaining"] / max(1.0, budget_state["max_budget"])
    intent_vector = [
        round(alerts_by_type.get("brute_force", 0) / 3.0, 3),
        round(alerts_by_type.get("lateral_movement", 0) / 3.0, 3),
        round(alerts_by_type.get("data_exfiltration", 0) / 3.0, 3),
        round(alerts_by_type.get("c2_beacon", 0) / 3.0, 3),
        round(compromised_ratio, 3),
        round(exfil_ratio, 3),
        round(alert_density, 3),
        round(1.0 - budget_remaining_ratio, 3),
    ]
    risk_class = "critical" if exfil_ratio > 0.35 or compromised_ratio > 0.3 else "high" if alert_density > 0.45 else "medium" if latest_alerts else "low"
    drift_score = round(_clamp(len({log.get("type") for log in env.logs[-10:]}) / 6.0 + compromised_ratio * 0.3), 3)
    drift_detected = drift_score >= 0.45
    drift_description = (
        "Lateral movement pattern diverged from initial reconnaissance."
        if drift_detected
        else "Behavior remains within expected reconnaissance envelope."
    )

    candidate_hosts = sorted(
        range(env.num_hosts),
        key=lambda host_id: float(env.network.alert_scores[host_id].sum()) + (0.25 if host_id in env.compromised_hosts else 0.0),
        reverse=True,
    )[:3]
    shadow_branches = [
        _build_shadow_branch(host_id, BLUE_ACTION_NAMES[index % len(BLUE_ACTION_NAMES)], 0, 0.28 + index * 0.18)
        for index, host_id in enumerate(candidate_hosts)
    ]
    recommended_action = shadow_branches[0]["action_name"] if shadow_branches else "monitor"
    shadow_risk_score = max((branch["risk_score"] for branch in shadow_branches), default=0.0)

    attack_nodes, attack_edges, critical_path, steps_to_db_breach, data_at_risk_gb = _attack_graph_components(session)

    capability_nodes = [
        {"id": "blue_agent", "node_type": "agent", "label": "BLUE AGENT"},
        {"id": "firewall", "node_type": "resource", "label": "FIREWALL"},
        {"id": "identity", "node_type": "resource", "label": "IDENTITY"},
        {"id": "db_cluster", "node_type": "resource", "label": "DB CLUSTER"},
        {"id": "segmentation", "node_type": "resource", "label": "SEGMENTATION"},
    ]
    capability_edges = [
        {
            "source": "blue_agent",
            "target": "firewall",
            "action": "block_ip",
            "trust_score": round(_clamp(0.92 - session["step"] * 0.002), 3),
            "is_permitted": True,
        },
        {
            "source": "blue_agent",
            "target": "identity",
            "action": "reset_credentials",
            "trust_score": round(_clamp(0.85 - session["step"] * 0.0015), 3),
            "is_permitted": budget_remaining_ratio > 0.1,
        },
        {
            "source": "blue_agent",
            "target": "db_cluster",
            "action": "investigate",
            "trust_score": round(_clamp(0.88 - exfil_ratio * 0.3), 3),
            "is_permitted": True,
        },
        {
            "source": "blue_agent",
            "target": "segmentation",
            "action": "isolate",
            "trust_score": round(_clamp(0.8 - compromised_ratio * 0.1), 3),
            "is_permitted": budget_remaining_ratio > 0.05,
        },
    ]

    detection_rate_recent = round(
        env.true_positives / max(1, env.true_positives + env.false_positives),
        3,
    )
    red_win_rate_recent = training_metrics["win_rate_history"][-1]["red_win_rate"]
    blue_win_rate_recent = training_metrics["win_rate_history"][-1]["blue_win_rate"]

    budget_state["is_throttled"] = budget_state["remaining"] < budget_state["max_budget"] * 0.2

    return {
        "step": session["step"],
        "intent_vector": intent_vector,
        "risk_class": risk_class,
        "drift_score": drift_score,
        "drift_detected": drift_detected,
        "drift_description": drift_description,
        "shadow_branches": shadow_branches,
        "recommended_action": recommended_action,
        "shadow_risk_score": round(shadow_risk_score, 3),
        "attack_graph_nodes": attack_nodes,
        "attack_graph_edges": attack_edges,
        "critical_path": critical_path,
        "steps_to_db_breach": steps_to_db_breach,
        "data_at_risk_gb": data_at_risk_gb,
        "capability_nodes": capability_nodes,
        "capability_edges": capability_edges,
        "autonomy_budget": budget_state,
        "blue_win_rate_recent": blue_win_rate_recent,
        "red_win_rate_recent": red_win_rate_recent,
        "detection_rate_recent": detection_rate_recent,
    }


def build_playbook(alert: dict[str, Any], session: dict[str, Any], pipeline_state: dict[str, Any]) -> dict[str, Any]:
    playbook_id = f"PB-{alert['id']}"
    severity = str(alert["severity"]).upper()
    risk_level = "HIGH" if severity in {"HIGH", "CRITICAL"} else "MEDIUM"
    affected_hosts = alert["affected_host_labels"] or ["UNKNOWN"]
    mitre_id = alert["mitre_id"]
    mitre_name = alert["mitre_name"]
    command_target = " ".join(affected_hosts)
    threat_type = alert.get("threat_type", "brute_force")
    
    # Dynamic commands based on threat
    if threat_type == "data_exfiltration":
        contain_title = "NETWORK EGRESS BLOCK"
        contain_action = f"Block outbound huge transfers from {', '.join(affected_hosts)}"
        contain_cmd = f"iptables -A OUTPUT -s {affected_hosts[0]} -m state --state NEW -j DROP"
        rem_title = "PROCESS TERMINATION"
        rem_action = "Kill suspicious archiver/transfer processes"
        rem_cmd = f"Invoke-Command -ComputerName {affected_hosts[0]} -ScriptBlock {{ Stop-Process -Name 'robocopy','scp','tar' -Force }}"
    elif threat_type == "lateral_movement":
        contain_title = "SUBNET QUARANTINE"
        contain_action = f"Restrict lateral pivot from {', '.join(affected_hosts)}"
        contain_cmd = "Set-NetFirewallRule -DisplayName 'Block-Lateral' -Action Block"
        rem_title = "SESSION INVALIDATION"
        rem_action = "Terminate all active SMB/RDP sessions"
        rem_cmd = "Invoke-Command -ScriptBlock { Get-SmbSession | Close-SmbSession -Force }"
    elif threat_type == "c2_beacon":
        contain_title = "DNS SINKHOLE"
        contain_action = "Null-route identified C2 domains"
        contain_cmd = "pihole -b suspicious-c2-domain.com"
        rem_title = "MALWARE PURGE"
        rem_action = "Wipe dormant beacon payloads"
        rem_cmd = "rm -rf /tmp/.systemd-private-*"
    else:
        contain_title = "IMMEDIATE CONTAINMENT"
        contain_action = f"Isolate hosts: {', '.join(affected_hosts)}"
        contain_cmd = f"firewall-cmd --add-rich-rule='rule family=ipv4 source address={affected_hosts[0]} drop'"
        rem_title = "CREDENTIAL RESET"
        rem_action = "Rotate exposed credentials and invalidate active sessions"
        rem_cmd = "python tools/reset_identities.py --scope incident"

    steps = [
        {
            "step_number": 1,
            "title": "IMMEDIATE TRIAGE",
            "action": f"Validate incident on {', '.join(affected_hosts)}",
            "command": f"ssh analyst@soc-jump 'check_host {command_target}'",
            "expected_outcome": "Compromise evidence confirmed for analyst review",
            "risk_level": "LOW",
            "estimated_time": "2 minutes",
            "status": "pending",
        },
        {
            "step_number": 2,
            "title": contain_title,
            "action": contain_action,
            "command": contain_cmd,
            "expected_outcome": "Malicious traffic path is severed within 30 seconds",
            "risk_level": risk_level,
            "estimated_time": "30 seconds",
            "status": "pending",
        },
        {
            "step_number": 3,
            "title": rem_title,
            "action": rem_action,
            "command": rem_cmd,
            "expected_outcome": "Threat vector neutralized",
            "risk_level": "MEDIUM",
            "estimated_time": "5 minutes",
            "status": "pending",
        },
    ]
    if pipeline_state.get("critical_path"):
        steps.append(
            {
                "step_number": 4,
                "title": "DATABASE EMERGENCY LOCKDOWN",
                "action": "Terminate active database sessions and seal sensitive stores",
                "command": "psql -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='active';\"",
                "expected_outcome": "All unauthorized DB connections are terminated",
                "risk_level": "HIGH",
                "estimated_time": "5 minutes",
                "status": "pending",
            }
        )

    return {
        "id": playbook_id,
        "alert_id": alert["id"],
        "threat_type": alert["threat_type"],
        "severity": alert["severity"],
        "mitre_id": mitre_id,
        "mitre_name": mitre_name,
        "generated_at": session["step"],
        "incident_summary": alert["detail"],
        "affected_hosts": affected_hosts,
        "estimated_data_at_risk_gb": pipeline_state.get("data_at_risk_gb", 0.0),
        "steps": steps,
        "mitre_techniques_detected": [mitre_id],
        "status": "active",
    }


def build_agent_action(action_meta: dict[str, Any], reward: float, step: int) -> dict[str, Any]:
    action_name = action_meta.get("action_name", "monitor")
    success = bool(action_meta.get("success", False))
    is_false_positive = bool(action_meta.get("is_false_positive", False))
    return {
        "agent": action_meta.get("agent", "blue"),
        "action_name": action_name,
        "target_host_id": action_meta.get("target_host_id", 0),
        "target_host_label": action_meta.get("target_host_label", host_label(action_meta.get("target_host_id", 0))),
        "success": success,
        "reward": round(float(reward), 2),
        "timestamp": step,
        "log_color": ACTION_COLORS.get(action_name, "#00e5ff"),
        "outcome_color": "#00ff88" if success and not is_false_positive else "#ff0044" if is_false_positive else "#ffcc00",
        "reason": action_meta.get("reason", "Decision made from current telemetry."),
        "is_false_positive": is_false_positive,
    }


def build_episode_history_summary(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary = []
    for item in history:
        summary.append(
            {
                "step": item["step"],
                "red_rew": item["red_reward"],
                "blue_rew": item["blue_reward"],
                "events": len(item["new_alerts"]) + 2,
            }
        )
    return summary


def build_battle_briefing(session: dict[str, Any]) -> dict[str, Any]:
    env = session["env"]
    alerts = session.get("alerts", [])
    latest_action_red = env.last_red_action_meta or {}
    latest_action_blue = env.last_blue_action_meta or {}

    def host_risk(host_id: int) -> float:
        base = float(env.network.alert_scores[host_id].sum()) / 1.8
        if host_id in env.compromised_hosts:
            base += 0.36
        if host_id in env.detected_compromises:
            base += 0.22
        if host_id in env.isolated_hosts:
            base -= 0.14
        if host_id == env.red_position:
            base += 0.12
        return round(_clamp(base), 3)

    hot_host_ids = sorted(range(env.num_hosts), key=host_risk, reverse=True)[:6]
    hot_zones: list[dict[str, Any]] = []
    for host_id in hot_host_ids:
        latest_alert = next(
            (alert for alert in reversed(alerts) if host_id in alert.get("affected_hosts", [])),
            None,
        )
        if host_id in env.isolated_hosts:
            status = "isolated"
        elif host_id == env.red_position:
            status = "under_attack"
        elif host_id in env.detected_compromises:
            status = "detected"
        elif host_id in env.compromised_hosts:
            status = "compromised"
        else:
            status = "clean"

        risk_score = host_risk(host_id)
        hot_zones.append(
            {
                "host_id": host_id,
                "label": host_label(host_id),
                "zone": _zone_name_for_host(host_id),
                "status": status,
                "risk_score": risk_score,
                "risk_percent": round(risk_score * 100),
                "color": _status_color(status),
                "reason": (
                    latest_alert["headline"]
                    if latest_alert
                    else f"{host_label(host_id)} is showing elevated movement or alert pressure."
                ),
                "top_threat": latest_alert["threat_type"] if latest_alert else "suspicious_activity",
            }
        )

    zone_layout = [
        ("Perimeter", range(0, 2)),
        ("Application", range(2, 7)),
        ("Crown Jewel", range(7, 10)),
        ("Workstations", range(10, env.num_hosts)),
    ]
    zone_heat: list[dict[str, Any]] = []
    for zone_name, host_ids in zone_layout:
        host_ids = list(host_ids)
        if not host_ids:
            continue
        zone_score = round(sum(host_risk(host_id) for host_id in host_ids) / len(host_ids), 3)
        zone_heat.append(
            {
                "zone": zone_name,
                "risk_score": zone_score,
                "risk_percent": round(zone_score * 100),
                "host_count": len(host_ids),
                "compromised_hosts": sum(1 for host_id in host_ids if host_id in env.compromised_hosts),
                "detected_hosts": sum(1 for host_id in host_ids if host_id in env.detected_compromises),
                "color": SEVERITY_COLORS[_severity_from_confidence(zone_score, 2 if zone_score > 0.45 else 1)],
            }
        )

    storyline: list[dict[str, Any]] = []
    for alert in alerts[-4:]:
        storyline.append(
            {
                "id": alert["id"],
                "step": int(alert["timestamp"]),
                "team": "system",
                "title": alert["headline"],
                "detail": alert["detail"],
                "severity": alert["severity"],
                "color": SEVERITY_COLORS.get(alert["severity"], "#14d1ff"),
            }
        )

    if latest_action_red:
        storyline.append(
            {
                "id": f"story-red-{session['step']}",
                "step": session["step"],
                "team": "red",
                "title": f"Red chose {latest_action_red.get('action_name', 'move').replace('_', ' ')}",
                "detail": latest_action_red.get("reason", "The attacker is probing for the weakest path."),
                "severity": "high" if latest_action_red.get("success") else "medium",
                "color": ACTION_COLORS.get(latest_action_red.get("action_name", "exploit"), "#ff335f"),
            }
        )

    if latest_action_blue:
        storyline.append(
            {
                "id": f"story-blue-{session['step']}",
                "step": session["step"],
                "team": "blue",
                "title": f"Blue answered with {latest_action_blue.get('action_name', 'monitor').replace('_', ' ')}",
                "detail": latest_action_blue.get("reason", "The defender is hardening the most suspicious machine."),
                "severity": "warning" if latest_action_blue.get("is_false_positive") else "low",
                "color": ACTION_COLORS.get(latest_action_blue.get("action_name", "investigate"), "#14d1ff"),
            }
        )

    storyline = storyline[-6:]

    top_hot_zone = hot_zones[0] if hot_zones else None
    headline = (
        f"{top_hot_zone['label']} is the hottest room right now"
        if top_hot_zone
        else "The building is quiet for the moment"
    )
    summary = (
        f"{len(env.compromised_hosts)} compromised computers, "
        f"{len(env.detected_compromises)} caught by the guard, "
        f"{round(env.data_exfiltrated, 1)} GB already touched."
    )

    red_pressure = round(
        _clamp(len(env.compromised_hosts) / max(1, env.num_hosts) + min(env.data_exfiltrated / 500.0, 0.35)),
        3,
    )
    blue_pressure = round(
        _clamp(
            (len(env.detected_compromises) + len(env.isolated_hosts)) / max(1, env.num_hosts)
            + (0.15 if latest_action_blue.get("success") else 0.0)
        ),
        3,
    )

    return {
        "headline": headline,
        "summary": summary,
        "hot_zones": hot_zones,
        "zone_heat": zone_heat,
        "storyline": storyline,
        "attack_pressure": {
            "red": red_pressure,
            "blue": blue_pressure,
            "neutral": round(_clamp(1.0 - max(red_pressure, blue_pressure) * 0.72), 3),
        },
        "last_updated_step": session["step"],
    }


def build_step_message(
    session: dict[str, Any],
    training_metrics: dict[str, Any],
    new_alerts: list[dict[str, Any]],
    terminated: bool,
    truncated: bool,
) -> dict[str, Any]:
    network = build_network_graph_state(session)
    pipeline = build_pipeline_state(session, training_metrics)
    red_q_values, blue_policy_probs = build_decision_overlay(session)
    red_action = build_agent_action(session["env"].last_red_action_meta or {}, session["last_rewards"]["red"], session["step"])
    blue_action = build_agent_action(session["env"].last_blue_action_meta or {}, session["last_rewards"]["blue"], session["step"])
    briefing = build_battle_briefing(session)

    if session["env"].red_caught:
        winner = "blue"
    elif session["env"]._get_info()["red_victory"]:
        winner = "red"
    elif terminated or truncated:
        winner = "draw"
    else:
        winner = None

    message = {
        "type": "step",
        "simulation_id": session["simulation_id"],
        "episode_id": session["episode_id"],
        "step": session["step"],
        "max_steps": session["env"].max_steps,
        "phase": network["phase"],
        "network": network,
        "red_action": red_action,
        "blue_action": blue_action,
        "red_reward": round(float(session["last_rewards"]["red"]), 2),
        "blue_reward": round(float(session["last_rewards"]["blue"]), 2),
        "red_cumulative": round(float(session["cumulative_rewards"]["red"]), 2),
        "blue_cumulative": round(float(session["cumulative_rewards"]["blue"]), 2),
        "new_alerts": new_alerts,
        "pipeline": pipeline,
        "red_q_values": red_q_values,
        "blue_policy_probs": blue_policy_probs,
        "contest_events": [],
        "battle_results": [],
        "scoreboard": None,
        "terminated": terminated,
        "truncated": truncated,
        "winner": winner,
        "episode_history_summary": build_episode_history_summary(session["history"]),
        "briefing": briefing,
    }
    return message


def build_init_message(session: dict[str, Any]) -> dict[str, Any]:
    contest_ctrl = session["contest_controller"]
    network = build_network_graph_state(session)
    contest_events = contest_ctrl.get_active_events(session["env"], session["step"])
    scoreboard = contest_ctrl.get_scoreboard(session["env"])
    red_q_values, blue_policy_probs = build_decision_overlay(session)
    briefing = build_battle_briefing(session)
    return {
        "type": "init",
        "simulation_id": session["simulation_id"],
        "episode_id": session["episode_id"],
        "network": network,
        "episode_count": session["episode_count"],
        "step": session["step"],
        "max_steps": session["env"].max_steps,
        "phase": network["phase"],
        "red_q_values": red_q_values,
        "blue_policy_probs": blue_policy_probs,
        "contest_events": [event.model_dump() for event in contest_events],
        "battle_results": [],
        "scoreboard": scoreboard.model_dump(),
        "briefing": briefing,
        "integration_events": session.get("integration_events", [])[:24],
    }


def update_training_metrics(metrics: dict[str, Any], session: dict[str, Any]) -> None:
    metrics["steps_trained"] += session["env"].max_steps
    last_step = metrics["reward_history"][-1]["step"] if metrics["reward_history"] else 0
    next_step = last_step + session["env"].max_steps
    metrics["reward_history"].append(
        {
            "step": next_step,
            "red_reward": round(session["cumulative_rewards"]["red"], 2),
            "blue_reward": round(session["cumulative_rewards"]["blue"], 2),
        }
    )

    if session["env"].red_caught:
        blue_win = 1.0
        red_win = 0.0
    elif session["env"]._get_info()["red_victory"]:
        blue_win = 0.0
        red_win = 1.0
    else:
        blue_win = 0.5
        red_win = 0.5

    prev_red_wr = metrics["win_rate_history"][-1]["red_win_rate"] if metrics["win_rate_history"] else 0.5
    prev_blue_wr = metrics["win_rate_history"][-1]["blue_win_rate"] if metrics["win_rate_history"] else 0.5
    metrics["win_rate_history"].append(
        {
            "step": next_step,
            "red_win_rate": round((prev_red_wr * 0.85) + red_win * 0.15, 3),
            "blue_win_rate": round((prev_blue_wr * 0.85) + blue_win * 0.15, 3),
        }
    )
    detection_rate = round(
        session["env"].true_positives / max(1, session["env"].true_positives + session["env"].false_positives),
        3,
    )
    fp_rate = round(
        session["env"].false_positives / max(1, session["env"].true_positives + session["env"].false_positives),
        3,
    )
    metrics["detection_history"].append(
        {
            "step": next_step,
            "detection_rate": detection_rate,
            "fp_rate": fp_rate,
        }
    )
