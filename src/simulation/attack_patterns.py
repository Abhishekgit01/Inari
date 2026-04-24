from __future__ import annotations

from .log_generator import LogGenerator


class AttackPatterns:
    """
    Hand-crafted adversarial probes used by the Giskard red-team scan.
    """

    def __init__(self, generator: LogGenerator | None = None):
        self.generator = generator or LogGenerator(seed=1337)

    def slow_exfil_probe(self) -> dict:
        event = self.generator.generate_exfiltration_log()
        event.update(
            {
                "bytes": 1_180_000,
                "payload_size": 620_000,
                "duration": 540,
                "alert_score": 0.47,
                "traffic_anomaly_score": 0.44,
            }
        )
        return event

    def jittered_beacon(self) -> dict:
        event = self.generator.generate_c2_beacon_log()
        event.update(
            {
                "port": 8443,
                "bytes": 512,
                "duration": 151,
                "payload_size": 320,
                "alert_score": 0.43,
                "traffic_anomaly_score": 0.4,
                "process_name": "svchost.exe",
            }
        )
        return event

    def stealth_lateral(self) -> dict:
        event = self.generator.generate_lateral_move_log()
        event.update(
            {
                "port": 443,
                "process_name": "dllhost.exe",
                "file_access": "C:/ProgramData/Teams/cache.bin",
                "alert_score": 0.5,
                "traffic_anomaly_score": 0.42,
            }
        )
        return event

    def distributed_brute_force(self) -> dict:
        event = self.generator.generate_brute_force_log()
        event.update(
            {
                "src_ip": "172.16.99.10",
                "port": 443,
                "http_method": "POST",
                "status_code": 401,
                "duration": 45,
                "bytes": 1_024,
                "payload_size": 512,
                "alert_score": 0.46,
                "traffic_anomaly_score": 0.39,
                "distributed_sources": 12,
            }
        )
        return event
