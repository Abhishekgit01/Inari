from __future__ import annotations

from collections import defaultdict
from typing import Any


class CrossLayerCorrelator:
    """
    PS REQUIREMENT: Single-layer alert = noise.
    Same behavior on 2+ layers = high-confidence incident.

    How it works:
      1. Group all logs by correlation_id
      2. For each chain: count distinct layers
      3. Scale confidence + severity by layer count
      4. Resolve false positives using endpoint/app evidence
    """

    THREAT_TYPE_MAP = {
        "scan": "brute_force",
        "exploit": "brute_force",
        "lateral_move": "lateral_movement",
        "lateral_movement": "lateral_movement",
        "exfiltrate": "data_exfiltration",
        "exfiltration": "data_exfiltration",
        "beacon": "c2_beacon",
        "c2_beacon": "c2_beacon",
        "brute_force": "brute_force",
        "normal_traffic": None,
        "admin_sync": None,
        "wait": None,
    }

    MITRE_MAP = {
        "brute_force": ("T1110", "Brute Force"),
        "lateral_movement": ("T1021", "Remote Services"),
        "data_exfiltration": ("T1041", "Exfiltration Over C2"),
        "c2_beacon": ("T1071", "Application Layer Protocol"),
    }

    SEVERITY_BY_LAYERS = {1: "low", 2: "high", 3: "critical"}
    CONFIDENCE_BY_LAYERS = {1: 0.30, 2: 0.75, 3: 0.95}

    def __init__(self):
        self.log_buffer: list[dict[str, Any]] = []
        self.window_size = 10

    def ingest(self, logs: list[dict[str, Any]], current_step: int) -> None:
        """Add new logs to the rolling window buffer."""
        self.log_buffer.extend(logs)
        cutoff = current_step - self.window_size
        self.log_buffer = [
            l for l in self.log_buffer
            if l.get("step", 0) >= cutoff
        ]

    def correlate(self, current_step: int) -> list[dict[str, Any]]:
        """
        Process current buffer and return list of ThreatAlert dicts.
        Call this ONCE per simulation step.
        """
        alerts: list[dict[str, Any]] = []

        # Group logs by correlation_id
        chains: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for log in self.log_buffer:
            cid = log.get("correlation_id")
            if cid and not str(cid).startswith("BENIGN"):
                chains[cid].append(log)

        for cid, chain_logs in chains.items():
            # Skip pure blue-action chains
            malicious_logs = [
                l for l in chain_logs
                if l.get("layer") != "blue_action"
                and l.get("agent") != "blue"
            ]
            if not malicious_logs:
                continue

            # Count distinct layers
            layers = {
                l["layer"] for l in malicious_logs
                if l.get("layer") in ("network", "endpoint", "application")
            }
            layer_count = max(1, len(layers))

            # Get the primary action type
            action_type = malicious_logs[0].get("action_type", "scan")
            threat_type = self.THREAT_TYPE_MAP.get(action_type)
            if threat_type is None:
                continue

            # Check for false positive resolution
            fp_indicators = self._check_false_positive(chain_logs)
            is_fp = len(fp_indicators) > 0

            if is_fp:
                confidence = 0.15
                severity = "low"
            else:
                confidence = self.CONFIDENCE_BY_LAYERS[min(layer_count, 3)]
                severity = self.SEVERITY_BY_LAYERS[min(layer_count, 3)]

            mitre_id, mitre_name = self.MITRE_MAP.get(threat_type, ("T0000", "Unknown"))

            affected_hosts = list({
                h for l in malicious_logs
                for h in (l.get("source"), l.get("target"), l.get("host_id"))
                if h is not None and isinstance(h, int) and h >= 0
            })

            alert = {
                "id": f"ALERT-{cid}",
                "correlation_id": cid,
                "threat_type": threat_type,
                "severity": severity,
                "confidence": round(confidence, 2),
                "layers_flagged": layer_count,
                "layer_breakdown": {
                    "network": "network" in layers,
                    "endpoint": "endpoint" in layers,
                    "application": "application" in layers,
                },
                "affected_hosts": affected_hosts,
                "affected_host_labels": list({
                    l.get("host_label", "") for l in malicious_logs
                    if l.get("host_label")
                }),
                "mitre_id": mitre_id,
                "mitre_name": mitre_name,
                "headline": self._generate_headline(threat_type, malicious_logs),
                "detail": self._generate_detail(threat_type, layer_count, malicious_logs),
                "false_positive_indicators": fp_indicators,
                "is_likely_false_positive": is_fp,
                "step": current_step,
                "status": "active",
            }

            alerts.append(alert)

        return alerts

    def _check_false_positive(self, logs: list[dict[str, Any]]) -> list[str]:
        indicators: list[str] = []
        for log in logs:
            if log.get("is_false_positive_seed"):
                fp_reason = log.get("fp_resolution_reason", "")
                if fp_reason:
                    indicators.append(fp_reason)
                if log.get("scheduled_task_id") or log.get("scheduled_task_name"):
                    indicators.append(f"Scheduled task: {log.get('scheduled_task_id') or log.get('scheduled_task_name')}")
                user = log.get("user", "")
                if isinstance(user, str) and user.startswith("DOMAIN\\svc_"):
                    indicators.append(f"Known service account: {user}")
                if log.get("parent_process") == "taskschd.exe":
                    indicators.append("Parent process: Task Scheduler")
                endpoint = str(log.get("endpoint", "")).lower()
                if "backup" in endpoint:
                    indicators.append("Endpoint matches known backup URL")
                ua = str(log.get("user_agent", "")).lower()
                if "robocopy" in ua:
                    indicators.append("User-Agent matches backup tool")
                # Also check fp_resolution field from existing log_generator
                fp_res = log.get("fp_resolution", "")
                if fp_res:
                    indicators.append(fp_res.replace("_", " "))
        return list(set(indicators))

    def _generate_headline(self, threat_type: str, logs: list[dict[str, Any]]) -> str:
        label = logs[0].get("host_label", logs[0].get("source_label", "Unknown host"))
        headlines = {
            "brute_force": f"Repeated login attempts detected from {label}",
            "lateral_movement": f"Lateral movement from {label} across internal network",
            "data_exfiltration": f"Large outbound data transfer from {label} to external IP",
            "c2_beacon": f"Periodic C2 beacon signal from {label} every few seconds",
        }
        return headlines.get(threat_type, f"Suspicious activity detected on {label}")

    def _generate_detail(self, threat_type: str, layer_count: int, logs: list[dict[str, Any]]) -> str:
        layer_phrase = (
            "one security camera" if layer_count == 1 else
            "two security cameras" if layer_count == 2 else
            "all three security cameras"
        )
        details = {
            "brute_force": (
                f"An attacker is trying many passwords on the same login page. "
                f"This was spotted by {layer_phrase} simultaneously. "
                f"{'High confidence — same pattern seen across network and process logs.' if layer_count >= 2 else 'Low confidence — only network traffic observed so far.'}"
            ),
            "lateral_movement": (
                f"After breaking into one computer, the attacker is quietly moving to nearby computers. "
                f"This was confirmed by {layer_phrase}. "
                f"{'Confirmed incident — process execution matches network movement.' if layer_count >= 2 else 'Possible lateral movement — awaiting endpoint confirmation.'}"
            ),
            "data_exfiltration": (
                f"A very large amount of data is leaving the network to an external IP. "
                f"{'This appears to be a legitimate backup — see false positive indicators above.' if any(l.get('is_false_positive_seed') for l in logs) else f'Spotted by {layer_phrase}. Treat as active theft until confirmed otherwise.'}"
            ),
            "c2_beacon": (
                f"A compromised computer is sending small, regular signals to an external server — "
                f"like a spy texting their boss every few seconds. "
                f"Spotted by {layer_phrase}. The regularity of the intervals is the giveaway."
            ),
        }
        return details.get(threat_type, "Anomalous behavior detected. Investigate immediately.")
