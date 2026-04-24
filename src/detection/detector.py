from __future__ import annotations

import ipaddress
from typing import Any, Mapping


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _is_private_ip(ip_value: Any) -> bool:
    try:
        return ipaddress.ip_address(str(ip_value)).is_private
    except ValueError:
        return False


class ThreatDetector:
    """
    Heuristic detector that maps normalized log events to the project threat labels.
    The interface is intentionally simple so the current demo app can expose a
    detector instance to Giskard scans and future RL training loops.
    """

    brute_force_ports = {22, 3389, 389}
    lateral_ports = {135, 139, 445, 3389, 5985}
    beacon_ports = {53, 80, 443, 8080, 8443}

    def classify(self, event: Mapping[str, Any]) -> str:
        event_type = _safe_text(event.get("type"))
        if event_type == "lateral_movement":
            return "lateral_move"
        if event_type == "beacon":
            return "c2_beacon"
        if event_type == "exfiltration":
            return "benign" if self._is_known_false_positive(event) else "exfiltration"

        if self._is_known_false_positive(event):
            return "benign"
        if self._looks_like_brute_force(event):
            return "brute_force"
        if self._looks_like_lateral_move(event):
            return "lateral_move"
        if self._looks_like_exfiltration(event):
            return "exfiltration"
        if self._looks_like_c2_beacon(event):
            return "c2_beacon"
        return "benign"

    def _looks_like_brute_force(self, event: Mapping[str, Any]) -> bool:
        port = _safe_int(event.get("port"))
        status_code = _safe_int(event.get("status_code"))
        alert_score = _safe_float(event.get("alert_score"))
        process_name = _safe_text(event.get("process_name"))
        http_method = _safe_text(event.get("http_method"))
        duration = _safe_float(event.get("duration"))
        bytes_sent = _safe_float(event.get("bytes"))

        repeated_failures = status_code in {401, 403, 429}
        auth_surface = port in self.brute_force_ports or "ssh" in process_name or "login" in http_method
        low_payload = bytes_sent <= 15_000 and duration <= 180
        return repeated_failures and auth_surface and (alert_score >= 0.55 or low_payload)

    def _looks_like_lateral_move(self, event: Mapping[str, Any]) -> bool:
        port = _safe_int(event.get("port"))
        src_ip = event.get("src_ip")
        dst_ip = event.get("dst_ip")
        process_name = _safe_text(event.get("process_name"))
        file_access = _safe_text(event.get("file_access"))
        user = _safe_text(event.get("user"))
        alert_score = _safe_float(event.get("alert_score"))

        suspicious_process = process_name in {
            "psexec",
            "wmic",
            "powershell.exe",
            "rundll32.exe",
            "smbexec",
        }
        internal_hop = _is_private_ip(src_ip) and _is_private_ip(dst_ip)
        privileged_file_touch = any(marker in file_access for marker in {"admin$", "c$", "lsass", "sam"})
        return internal_hop and (
            suspicious_process
            or privileged_file_touch
            or (port in self.lateral_ports and alert_score >= 0.6 and user not in {"svc_backup", "patching_bot"})
        )

    def _looks_like_exfiltration(self, event: Mapping[str, Any]) -> bool:
        bytes_sent = _safe_float(event.get("bytes"))
        payload_size = _safe_float(event.get("payload_size"))
        dst_ip = event.get("dst_ip")
        file_access = _safe_text(event.get("file_access"))
        user = _safe_text(event.get("user"))
        alert_score = _safe_float(event.get("alert_score"))
        http_method = _safe_text(event.get("http_method"))

        suspicious_transfer = bytes_sent >= 1_500_000 or payload_size >= 800_000
        sensitive_data = any(marker in file_access for marker in {"finance", "customer", "secret", "db_dump"})
        outbound = not _is_private_ip(dst_ip)
        admin_backup = user in {"admin", "secops-admin"} and http_method in {"put", "post"} and "backup" in file_access
        return outbound and suspicious_transfer and (sensitive_data or alert_score >= 0.75) and not admin_backup

    def _looks_like_c2_beacon(self, event: Mapping[str, Any]) -> bool:
        bytes_sent = _safe_float(event.get("bytes"))
        duration = _safe_float(event.get("duration"))
        port = _safe_int(event.get("port"))
        process_name = _safe_text(event.get("process_name"))
        alert_score = _safe_float(event.get("alert_score"))
        payload_size = _safe_float(event.get("payload_size"))

        periodic_process = process_name in {"svchost.exe", "curl", "python", "systemd", "powershell.exe"}
        low_and_slow = 64 <= bytes_sent <= 8_000 and 20 <= duration <= 600 and payload_size <= 2_048
        return low_and_slow and port in self.beacon_ports and (periodic_process or alert_score >= 0.55)

    def _is_known_false_positive(self, event: Mapping[str, Any]) -> bool:
        user = _safe_text(event.get("user"))
        file_access = _safe_text(event.get("file_access"))
        http_method = _safe_text(event.get("http_method"))
        status_code = _safe_int(event.get("status_code"))
        alert_score = _safe_float(event.get("alert_score"))
        dst_ip = event.get("dst_ip")

        admin_transfer = user in {"admin", "secops-admin"} and "backup" in file_access
        planned_method = http_method in {"put", "post", "sync"}
        successful = status_code in {200, 201, 204}
        trusted_destination = _is_private_ip(dst_ip) or _safe_text(event.get("layer")) == "application"
        return admin_transfer and planned_method and successful and trusted_destination and alert_score < 0.6
