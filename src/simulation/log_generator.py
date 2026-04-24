from __future__ import annotations

import random
import uuid
from typing import Any


class LogGenerator:
    def __init__(self, seed: int | None = None):
        self.random = random.Random(seed)
        self.current_step = 0

    def set_step(self, step: int) -> None:
        self.current_step = step

    def _new_correlation_id(self, prefix: str = "SIM") -> str:
        return f"{prefix}-{self.current_step:03d}-{uuid.uuid4().hex[:8]}"

    def _create_base_log(self, type_str: str, layer: str, correlation_id: str) -> dict[str, Any]:
        return {
            "id": str(uuid.uuid4()),
            "timestamp": self.current_step,
            "step": self.current_step,
            "type": type_str,
            "action_type": type_str,
            "layer": layer,
            "correlation_id": correlation_id,
        }

    def _host_to_ip(self, host_id: int | None) -> str:
        if host_id is None:
            host_id = self.random.randint(2, 200)
        if host_id < 2:
            return f"10.0.0.{host_id + 11}"
        if host_id < 7:
            return f"10.0.1.{host_id + 11}"
        if host_id < 10:
            return f"10.0.7.{host_id + 11}"
        return f"10.0.10.{host_id + 11}"

    def _host_label(self, host_id: int | None) -> str:
        if host_id is None:
            return "EXT-01"
        if host_id < 2:
            return f"DMZ-{host_id + 1:02d}"
        if host_id < 7:
            return f"APP-{host_id - 1:02d}"
        if host_id < 10:
            return f"DB-{host_id - 6:02d}"
        return f"WS-{host_id - 9:02d}"

    def _external_ip(self) -> str:
        return f"185.199.{self.random.randint(10, 180)}.{self.random.randint(10, 220)}"

    def _action_to_port(self, action_type: str) -> int:
        mapping = {
            "scan": 22,
            "exploit": 445,
            "lateral_movement": 445,
            "exfiltration": 443,
            "beacon": 8443,
            "brute_force": 22,
            "admin_sync": 443,
        }
        return mapping.get(action_type, 443)

    def _action_to_bytes(self, action_type: str, success: bool = True) -> float:
        mapping = {
            "scan": 1_200,
            "exploit": 18_500 if success else 4_000,
            "lateral_movement": 46_000 if success else 9_000,
            "exfiltration": 2_400_000 if success else 120_000,
            "beacon": 540,
            "brute_force": 1_800,
            "admin_sync": 2_100_000,
        }
        return float(mapping.get(action_type, 4_000))

    def _action_to_payload(self, action_type: str, success: bool = True) -> float:
        mapping = {
            "scan": 240,
            "exploit": 3_200 if success else 600,
            "lateral_movement": 8_500 if success else 1_100,
            "exfiltration": 1_300_000 if success else 60_000,
            "beacon": 320,
            "brute_force": 768,
            "admin_sync": 1_100_000,
        }
        return float(mapping.get(action_type, 2_000))

    def _action_to_alert_score(self, action_type: str, success: bool = True) -> float:
        mapping = {
            "scan": 0.32,
            "exploit": 0.86 if success else 0.44,
            "lateral_movement": 0.79 if success else 0.41,
            "exfiltration": 0.94 if success else 0.52,
            "beacon": 0.67,
            "brute_force": 0.83,
            "admin_sync": 0.26,
        }
        return float(mapping.get(action_type, 0.35))

    def _severity_color(self, action_type: str) -> str:
        mapping = {
            "scan": "#ffcc00",
            "exploit": "#ff0044",
            "lateral_movement": "#ff6600",
            "exfiltration": "#ff0044",
            "beacon": "#ffcc00",
            "brute_force": "#ff6600",
            "admin_sync": "#00e5ff",
        }
        return mapping.get(action_type, "#00e5ff")

    def _normalize_event(
        self,
        *,
        type_str: str,
        layer: str,
        correlation_id: str,
        src_ip: str,
        dst_ip: str,
        port: int,
        protocol: str,
        bytes_sent: float,
        duration: float,
        process_name: str,
        user: str,
        file_access: str,
        http_method: str,
        status_code: int,
        payload_size: float,
        alert_score: float,
        source: int | None = None,
        target: int | None = None,
        destination: int | None = None,
        host_id: int | None = None,
        host_label: str | None = None,
        metadata: dict[str, Any] | None = None,
        success: bool | None = None,
    ) -> dict[str, Any]:
        event = self._create_base_log(type_str, layer, correlation_id)
        event.update(
            {
                "source": source,
                "target": target,
                "destination": destination,
                "host_id": host_id,
                "host_label": host_label,
                "src_ip": src_ip,
                "dst_ip": dst_ip,
                "port": port,
                "protocol": protocol,
                "bytes": round(float(bytes_sent), 2),
                "duration": round(float(duration), 2),
                "process_name": process_name,
                "user": user,
                "file_access": file_access,
                "http_method": http_method,
                "status_code": int(status_code),
                "payload_size": round(float(payload_size), 2),
                "alert_score": round(float(alert_score), 3),
                "network_bytes": round(float(bytes_sent), 2),
                "network_src": src_ip,
                "network_dst": dst_ip,
                "endpoint_process": process_name,
                "endpoint_user": user,
                "endpoint_file_access": file_access,
                "app_method": http_method,
                "app_status": int(status_code),
                "app_payload_size": round(float(payload_size), 2),
                "traffic_anomaly_score": round(min(max(alert_score + self.random.uniform(-0.06, 0.12), 0.0), 1.0), 3),
                "alert_score_delta": round(min(max(alert_score + self.random.uniform(-0.08, 0.16), 0.0), 1.0), 3),
                "log_color": self._severity_color(type_str),
                "metadata": metadata or {},
            }
        )
        if success is not None:
            event["success"] = success
        return event

    def generate_network_flow(
        self,
        src: int,
        dst: int | None,
        action_type: str,
        correlation_id: str | None = None,
        *,
        success: bool = True,
    ) -> dict[str, Any]:
        correlation_id = correlation_id or self._new_correlation_id("NET")
        return self._normalize_event(
            type_str=action_type,
            layer="network",
            correlation_id=correlation_id,
            src_ip=self._host_to_ip(src),
            dst_ip=self._host_to_ip(dst) if dst is not None else self._external_ip(),
            port=self._action_to_port(action_type),
            protocol="TCP",
            bytes_sent=self._action_to_bytes(action_type, success=success),
            duration=self.random.randint(40, 460),
            process_name="netflowd",
            user="network",
            file_access="",
            http_method="FLOW",
            status_code=200 if success else 403,
            payload_size=self._action_to_payload(action_type, success=success),
            alert_score=self._action_to_alert_score(action_type, success=success),
            source=src,
            target=dst,
            destination=dst,
            host_id=src,
            host_label=self._host_label(src),
            success=success,
        )

    def generate_endpoint_log(
        self,
        host: int,
        action_type: str,
        correlation_id: str | None = None,
        *,
        success: bool = True,
    ) -> dict[str, Any]:
        correlation_id = correlation_id or self._new_correlation_id("EDR")
        process_map = {
            "scan": ("nmap.exe", "cmd.exe", "Administrator", ""),
            "exploit": ("mimikatz.exe", "cmd.exe", "SYSTEM", "C:/Windows/System32"),
            "lateral_movement": ("wmic.exe", "explorer.exe", "DOMAIN\\admin", "\\\\admin$\\system32"),
            "exfiltration": ("rclone.exe", "powershell.exe", "DOMAIN\\user", "D:/finance/customer_dump.sql"),
            "beacon": ("svchost.exe", "services.exe", "NETWORK SERVICE", ""),
            "brute_force": ("sshd", "systemd", "root", ""),
            "admin_sync": ("robocopy.exe", "taskschd.exe", "DOMAIN\\backup_svc", "D:/backups/nightly_backup.tar"),
        }
        proc, parent, user, file_access = process_map.get(action_type, ("python.exe", "cmd.exe", "USER", ""))
        event = self._normalize_event(
            type_str=action_type,
            layer="endpoint",
            correlation_id=correlation_id,
            src_ip=self._host_to_ip(host),
            dst_ip=self._host_to_ip(host),
            port=self._action_to_port(action_type),
            protocol="TCP",
            bytes_sent=self._action_to_bytes(action_type, success=success) * 0.4,
            duration=self.random.randint(20, 220),
            process_name=proc,
            user=user,
            file_access=file_access,
            http_method="EXEC",
            status_code=200 if success else 401,
            payload_size=self._action_to_payload(action_type, success=success) * 0.4,
            alert_score=self._action_to_alert_score(action_type, success=success) - 0.03,
            source=host,
            target=host,
            host_id=host,
            host_label=self._host_label(host),
            metadata={"parent_process": parent},
            success=success,
        )
        event["parent_process"] = parent
        return event

    def generate_application_log(
        self,
        host: int,
        action_type: str,
        correlation_id: str | None = None,
        *,
        success: bool = True,
    ) -> dict[str, Any]:
        correlation_id = correlation_id or self._new_correlation_id("APP")
        endpoint_map = {
            "scan": "/auth/login",
            "exploit": "/api/auth/token",
            "lateral_movement": "/rpc/wmi",
            "exfiltration": "/api/export",
            "beacon": "/cdn/pixel",
            "brute_force": "/auth/login",
            "admin_sync": "/backup/nightly",
        }
        method_map = {
            "scan": "GET",
            "exploit": "POST",
            "lateral_movement": "POST",
            "exfiltration": "POST",
            "beacon": "GET",
            "brute_force": "LOGIN",
            "admin_sync": "PUT",
        }
        status_code = 200 if success else 401
        if action_type == "exploit" and success:
            status_code = 201
        if action_type == "brute_force":
            status_code = 401

        event = self._normalize_event(
            type_str=action_type,
            layer="application",
            correlation_id=correlation_id,
            src_ip=self._host_to_ip(host),
            dst_ip=self._external_ip() if action_type in {"beacon", "exfiltration"} else self._host_to_ip(host),
            port=self._action_to_port(action_type),
            protocol="TCP",
            bytes_sent=self._action_to_bytes(action_type, success=success) * 0.3,
            duration=self.random.randint(30, 520),
            process_name="nginx",
            user="app",
            file_access="",
            http_method=method_map.get(action_type, "GET"),
            status_code=status_code,
            payload_size=self._action_to_payload(action_type, success=success) * 0.3,
            alert_score=self._action_to_alert_score(action_type, success=success) - 0.08,
            source=host,
            target=host,
            host_id=host,
            host_label=self._host_label(host),
            metadata={"endpoint": endpoint_map.get(action_type, "/")},
            success=success,
        )
        event["endpoint"] = endpoint_map.get(action_type, "/")
        return event

    def generate_action_chain(
        self,
        source: int,
        target: int | None,
        action_type: str,
        *,
        success: bool = True,
    ) -> list[dict[str, Any]]:
        normalized = {
            "lateral_move": "lateral_movement",
            "exfiltrate": "exfiltration",
            "c2_beacon": "beacon",
        }.get(action_type, action_type)
        correlation_id = self._new_correlation_id("SIM")
        pivot = target if target is not None else source
        logs = [
            self.generate_network_flow(source, target, normalized, correlation_id, success=success),
            self.generate_endpoint_log(pivot, normalized, correlation_id, success=success),
            self.generate_application_log(pivot, normalized, correlation_id, success=success),
        ]
        for log in logs:
            log["source"] = source
            if target is not None:
                log["target"] = target
                log["destination"] = target
            log["agent"] = "red"
        return logs

    def generate_false_positive_scenario(self) -> list[dict[str, Any]]:
        correlation_id = self._new_correlation_id("FP")
        logs = [
            self.generate_network_flow(7, None, "exfiltration", correlation_id, success=True),
            self.generate_endpoint_log(7, "admin_sync", correlation_id, success=True),
            self.generate_application_log(7, "admin_sync", correlation_id, success=True),
        ]
        for log in logs:
            log["is_false_positive_seed"] = True
            log["agent"] = "system"
            if log["layer"] == "endpoint":
                log["fp_resolution"] = "scheduled_task_legitimate_backup"
                log["scheduled_task_id"] = "BACKUP_NIGHTLY_02:00"
                log["parent_process"] = "taskschd.exe"
                log["file_access"] = "D:/backups/nightly_backup.tar"
                log["user"] = "DOMAIN\\backup_svc"
            if log["layer"] == "application":
                log["endpoint"] = "/backup/nightly"
                log["http_method"] = "PUT"
                log["user"] = "DOMAIN\\backup_svc"
            if log["layer"] == "network":
                log["dst_ip"] = "10.100.0.5"
                log["bytes"] = 500_000_000
                log["network_bytes"] = 500_000_000
                log["alert_score"] = 0.76
        return logs

    def generate_scan_log(self, source: int, target: int, result: float) -> dict[str, Any]:
        event = self.generate_network_flow(source, target, "scan", success=True)
        event["metadata"]["vulnerability"] = result
        return event

    def generate_exploit_log(self, source: int, target: int, success: bool) -> dict[str, Any]:
        return self.generate_endpoint_log(target, "exploit", success=success)

    def generate_lateral_movement_log(self, source: int, destination: int) -> dict[str, Any]:
        event = self.generate_endpoint_log(destination, "lateral_movement", success=True)
        event["source"] = source
        event["destination"] = destination
        return event

    def generate_exfiltration_log(
        self,
        source: int | None = None,
        bytes_transferred: float | None = None,
    ) -> dict[str, Any]:
        source = self.random.randint(4, 12) if source is None else source
        event = self.generate_network_flow(source, None, "exfiltration", success=True)
        if bytes_transferred is not None:
            event["bytes"] = float(bytes_transferred)
            event["network_bytes"] = float(bytes_transferred)
            event["payload_size"] = float(bytes_transferred) * 0.55
            event["app_payload_size"] = float(bytes_transferred) * 0.55
        return event

    def generate_beacon_log(self, source: int) -> dict[str, Any]:
        return self.generate_application_log(source, "beacon", success=True)

    def generate_brute_force_log(self) -> dict[str, Any]:
        correlation_id = self._new_correlation_id("ADV")
        return self._normalize_event(
            type_str="brute_force",
            layer="application",
            correlation_id=correlation_id,
            src_ip=self._external_ip(),
            dst_ip=self._host_to_ip(0),
            port=22,
            protocol="TCP",
            bytes_sent=1_800,
            duration=60,
            process_name="sshd",
            user="root",
            file_access="",
            http_method="LOGIN",
            status_code=401,
            payload_size=768,
            alert_score=0.83,
            target=0,
            host_id=0,
            host_label=self._host_label(0),
            success=False,
        )

    def generate_lateral_move_log(self) -> dict[str, Any]:
        source = self.random.randint(3, 8)
        destination = self.random.randint(10, 15)
        event = self.generate_lateral_movement_log(source, destination)
        event["type"] = "lateral_movement"
        return event

    def generate_c2_beacon_log(self) -> dict[str, Any]:
        source = self.random.randint(2, 10)
        return self.generate_beacon_log(source)

    def generate_admin_bulk_transfer_log(self) -> dict[str, Any]:
        event = self.generate_application_log(7, "admin_sync", success=True)
        event["type"] = "admin_sync"
        event["file_access"] = "D:/backups/nightly_backup.tar"
        event["user"] = "admin"
        event["alert_score"] = 0.28
        return event

    # ── PS-COMPLIANT ENTRY POINT ──────────────────────────────────────────────

    ACTION_LAYERS = {
        "scan": ["network"],
        "exploit": ["network", "endpoint"],
        "lateral_move": ["network", "endpoint", "application"],
        "exfiltrate": ["network", "endpoint", "application"],
        "beacon": ["network", "application"],
    }

    def generate_all_layers(
        self,
        action_type: str,
        source_host: int,
        target_host: int,
        step: int,
        success: bool = True,
        metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        THE ONLY METHOD _execute_red_action() SHOULD CALL.
        Generates logs for all applicable layers and stamps them with
        a shared correlation_id so the correlator can link them.
        Returns: list of log dicts (1 per layer).
        """
        normalized = {
            "lateral_move": "lateral_move",
            "lateral_movement": "lateral_move",
            "exfiltrate": "exfiltrate",
            "exfiltration": "exfiltrate",
            "c2_beacon": "beacon",
        }.get(action_type, action_type)

        correlation_id = f"ATK-{step:03d}-{uuid.uuid4().hex[:8].upper()}"
        layers = self.ACTION_LAYERS.get(normalized, ["network"])
        logs: list[dict[str, Any]] = []

        for layer in layers:
            if layer == "network":
                log = self.generate_network_flow(
                    source_host, target_host, action_type, correlation_id, success=success
                )
            elif layer == "endpoint":
                pivot = target_host if target_host is not None else source_host
                log = self.generate_endpoint_log(
                    pivot, action_type, correlation_id, success=success
                )
            elif layer == "application":
                pivot = target_host if target_host is not None else source_host
                log = self.generate_application_log(
                    pivot, action_type, correlation_id, success=success
                )
            else:
                continue

            # Stamp every log with shared metadata
            log["correlation_id"] = correlation_id
            log["step"] = step
            log["action_type"] = action_type
            log["success"] = success
            log["source_host_id"] = source_host
            log["target_host_id"] = target_host
            log["source_label"] = self._host_label(source_host)
            log["target_label"] = self._host_label(target_host) if target_host is not None else "EXT"
            log["log_color"] = self._severity_color(action_type)
            log["is_malicious"] = True
            log["is_false_positive_seed"] = False
            log["agent"] = "red"
            logs.append(log)

        return logs

    # ── BENIGN TRAFFIC GENERATOR ──────────────────────────────────────────────

    def generate_benign_traffic(self, step: int, num_events: int = 5) -> list[dict[str, Any]]:
        """
        PS REQUIREMENT: Synthetic data must include BENIGN traffic.
        Generates realistic normal traffic so the detector learns the difference.
        """
        logs: list[dict[str, Any]] = []
        for _ in range(num_events):
            src = self.random.randint(10, 19)  # Workstations
            dst = self.random.randint(2, 6)     # App servers
            correlation_id = f"BENIGN-{step:03d}-{uuid.uuid4().hex[:8].upper()}"

            log = self.generate_network_flow(src, dst, "scan", correlation_id, success=True)
            log["correlation_id"] = correlation_id
            log["step"] = step
            log["action_type"] = "normal_traffic"
            log["is_malicious"] = False
            log["is_false_positive_seed"] = False
            log["agent"] = "system"
            log["log_color"] = "#00e5ff"
            log["alert_score"] = round(self.random.uniform(0.05, 0.20), 3)
            log["bytes"] = round(self.random.uniform(512, 50000), 2)
            log["network_bytes"] = log["bytes"]
            logs.append(log)

        return logs
