"""
Athernex — Lightweight Node Servers
Spins up 15 tiny HTTP servers on ports 8005-8019, each simulating a real
network node (DMZ, APP, DB, Workstation). The AI simulation engine hits
these with real HTTP requests, and the backend /api/nodes/discover endpoint
polls them to show live status on the frontend.

Usage:  python node_servers.py
Stop:   Ctrl+C
"""

from __future__ import annotations

import json
import os
import sys
import time
import threading
import random
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone

# ── Node Definitions ─────────────────────────────────────────────────────────
import copy

DEFAULT_SCENARIO: list[dict] = [
    {"id": 0,  "port": 8005, "label": "DMZ-01",       "zone": "dmz",         "role": "Perimeter Firewall",  "color": "#00b4d8"},
    {"id": 1,  "port": 8006, "label": "DMZ-02",       "zone": "dmz",         "role": "Web Gateway",         "color": "#00b4d8"},
    {"id": 2,  "port": 8007, "label": "APP-01",       "zone": "app_server",  "role": "API Server",          "color": "#ffa500"},
    {"id": 3,  "port": 8008, "label": "APP-02",       "zone": "app_server",  "role": "Auth Service",        "color": "#ffa500"},
    {"id": 4,  "port": 8009, "label": "APP-03",       "zone": "app_server",  "role": "Microservice Core",   "color": "#ffa500"},
    {"id": 5,  "port": 8010, "label": "APP-04",       "zone": "app_server",  "role": "Worker Queue",        "color": "#ffa500"},
    {"id": 6,  "port": 8011, "label": "APP-05",       "zone": "app_server",  "role": "Cache Layer",         "color": "#ffa500"},
    {"id": 7,  "port": 8012, "label": "DB-01",        "zone": "db_server",   "role": "Primary Database",    "color": "#be50ff"},
    {"id": 8,  "port": 8013, "label": "DB-02",        "zone": "db_server",   "role": "Replica Database",    "color": "#be50ff"},
    {"id": 9,  "port": 8014, "label": "DB-03",        "zone": "db_server",   "role": "Analytics DB",        "color": "#be50ff"},
    {"id": 10, "port": 8015, "label": "WS-01",        "zone": "workstation", "role": "Dev Workstation",     "color": "#00ff88"},
    {"id": 11, "port": 8016, "label": "WS-02",        "zone": "workstation", "role": "SOC Analyst",         "color": "#00ff88"},
    {"id": 12, "port": 8017, "label": "WS-03",        "zone": "workstation", "role": "Admin Terminal",      "color": "#00ff88"},
    {"id": 13, "port": 8018, "label": "WS-04",        "zone": "workstation", "role": "QA Environment",      "color": "#00ff88"},
    {"id": 14, "port": 8019, "label": "WS-05",        "zone": "workstation", "role": "CI/CD Runner",        "color": "#00ff88"},
]

FINTRUST_SCENARIO: list[dict] = [
    {"id": 0,  "port": 8005, "label": "EXT-WAF",      "zone": "dmz",         "role": "Cloudflare WAF / LB", "color": "#00b4d8", "_cve": "None"},
    {"id": 1,  "port": 8006, "label": "API-GW-01",    "zone": "dmz",         "role": "Kong API Gateway",    "color": "#00b4d8", "_cve": "CVE-2021-23048"},
    {"id": 2,  "port": 8007, "label": "PAY-PROC-A",   "zone": "app_server",  "role": "Payment Processor",   "color": "#ffa500", "_cve": "CVE-2021-44228", "_cve_name": "Log4Shell", "_service": "tomcat"},
    {"id": 3,  "port": 8008, "label": "AUTH-SVC",     "zone": "app_server",  "role": "Keycloak IAM Auth",   "color": "#ffa500", "_cve": "CVE-2023-0286"},
    {"id": 4,  "port": 8009, "label": "K8S-MASTER",   "zone": "app_server",  "role": "EKS Control Plane",   "color": "#ffa500", "_cve": "CVE-2018-1002105"},
    {"id": 5,  "port": 8010, "label": "REDIS-CACHE",  "zone": "app_server",  "role": "Redis Session Store", "color": "#ffa500", "_cve": "CVE-2022-0543"},
    {"id": 6,  "port": 8011, "label": "KAFKA-MQ",     "zone": "app_server",  "role": "Kafka Msg Queue",     "color": "#ffa500", "_cve": "None"},
    {"id": 7,  "port": 8012, "label": "DB-LEDGER",    "zone": "db_server",   "role": "Oracle Fin Ledger",   "color": "#be50ff", "_cve": "CVE-2020-2975"},
    {"id": 8,  "port": 8013, "label": "DB-USERDATA",  "zone": "db_server",   "role": "PostgreSQL RDS",      "color": "#be50ff", "_cve": "CVE-2022-1552"},
    {"id": 9,  "port": 8014, "label": "SEC-VAULT",    "zone": "db_server",   "role": "HashiCorp Vault",     "color": "#be50ff", "_cve": "CVE-2023-0664"},
    {"id": 10, "port": 8015, "label": "WIN-DC-01",    "zone": "workstation", "role": "Windows AD Domain",   "color": "#00ff88", "_cve": "CVE-2020-1472", "_cve_name": "Zerologon", "_service": "netlogon"},
    {"id": 11, "port": 8016, "label": "FIN-LAPTOP",   "zone": "workstation", "role": "CFO Windows Laptop",  "color": "#00ff88", "_cve": "CVE-2017-0144", "_cve_name": "EternalBlue", "_service": "smb"},
    {"id": 12, "port": 8017, "label": "DEV-MAC-01",   "zone": "workstation", "role": "Senior Dev macOS",    "color": "#00ff88", "_cve": "CVE-2023-32360"},
    {"id": 13, "port": 8018, "label": "JENKINS-CI",   "zone": "workstation", "role": "Jenkins CI/CD Build", "color": "#00ff88", "_cve": "CVE-2024-23897"},
    {"id": 14, "port": 8019, "label": "VPN-GW",       "zone": "workstation", "role": "Pulse Secure VPN",    "color": "#00ff88", "_cve": "CVE-2019-11510"},
]

NODE_DEFS: list[dict] = copy.deepcopy(DEFAULT_SCENARIO)


class NodeHandler(BaseHTTPRequestHandler):
    """HTTP handler for a single simulated node."""

    node_def: dict = {}
    access_log: list[dict] = []

    def log_message(self, format, *args):
        """Suppress standard HTTP logs so they don't overwrite interactive CLI prompts."""
        pass

    def _record(self, method: str, path: str):
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "path": path,
            "ua": self.headers.get("User-Agent", ""),
            "src": self.client_address[0],
        }
        self.access_log.append(entry)
        # Keep last 200 entries
        if len(self.access_log) > 200:
            del self.access_log[:100]

    def _json_response(self, data: dict, code: int = 200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        self._record("GET", self.path)
        nd = self.node_def

        # Initialize stable random properties once
        if "_vulnerability" not in nd: nd["_vulnerability"] = "critical" if "Log4Shell" in str(nd.get("_cve_name")) else random.choice(["low", "medium", "high", "critical"])
        if "_data_value" not in nd: nd["_data_value"] = "critical" if "Ledger" in nd["role"] else random.choice(["low", "medium", "high", "critical"])
        if "_cpu_pct" not in nd: nd["_cpu_pct"] = round(random.uniform(2, 65), 1)
        if "_mem_mb" not in nd: nd["_mem_mb"] = random.randint(128, 4096)
        if "_internal_ip" not in nd: nd["_internal_ip"] = f"10.0.1.{nd['id'] + 10}"
        if "_os" not in nd: nd["_os"] = "Alpine Linux 3.14" if "Gateway" in nd["role"] else random.choice(["Ubuntu 22.04 LTS", "Debian 11", "CentOS Stream", "Windows Server 2019"])
        
        # New authentic security properties
        if "_cves" not in nd: nd["_cves"] = [nd["_cve"]] if nd.get("_cve") and str(nd["_cve"]).startswith("CVE") else []
        if "_open_ports" not in nd:
            if "Database" in nd["role"] or "Ledger" in nd["role"] or "Vault" in nd["role"]: nd["_open_ports"] = [22, 5432, 9090]
            elif "Gateway" in nd["role"] or "WAF" in nd["role"]: nd["_open_ports"] = [80, 443, 8080]
            else: nd["_open_ports"] = [22, 80, 443]
        if "_processes" not in nd:
            if "Database" in nd["role"]: nd["_processes"] = ["postgres", "sshd", "node_exporter"]
            elif "Web" in nd["role"] or "API" in nd["role"]: nd["_processes"] = ["nginx", "php-fpm", "sshd"]
            else: nd["_processes"] = ["systemd", "sshd", "docker"]
        if "_data_records" not in nd:
            if "DB" in nd["label"] or "Ledger" in nd["label"]: nd["_data_records"] = random.randint(10000, 5000000)
            else: nd["_data_records"] = random.randint(0, 500)

        if "_auth_type" not in nd:
            if "Gateway" in nd["role"]: nd["_auth_type"] = "oauth2"
            elif "Database" in nd["role"]: nd["_auth_type"] = "scram-sha-256"
            elif "AD" in nd["role"] or "Domain" in nd["role"]: nd["_auth_type"] = "kerberos"
            else: nd["_auth_type"] = random.choice(["basic", "jwt", "tls_cert"])
            
        if "_service" not in nd:
            if "Database" in nd["role"]: nd["_service"] = "postgres"
            elif "Web" in nd["role"]: nd["_service"] = "nginx"
            else: nd["_service"] = "sshd"

        if "_cve_name" not in nd:
            nd["_cve_name"] = "None"

        if self.path in ("/health", "/", "/info"):
            self._json_response({
                "status": "online",
                "node_id": nd["id"],
                "label": nd["label"],
                "zone": nd["zone"],
                "role": nd["role"],
                "service": nd["_service"],
                "service_role": nd["role"],
                "auth_type": nd["_auth_type"],
                "cve_name": nd["_cve_name"],
                "port": nd["port"],
                "color": nd["color"],
                "vulnerability": nd["_vulnerability"],
                "owner": "fintrust_bank",
                "data_value": nd["_data_value"],
                "compromised": nd.get("_compromised", False),
                "uptime_s": int(time.time() - nd.get("_start_time", time.time())),
                "request_count": len(self.access_log),
                "ts": datetime.now(timezone.utc).isoformat(),
                "cpu_pct": round(nd["_cpu_pct"] + random.uniform(-2, 5), 1),
                "mem_mb": nd["_mem_mb"] + random.randint(-15, 25),
                "internal_ip": nd["_internal_ip"],
                "os_name": nd["_os"],
                "net_rx_kbps": round(random.uniform(10, 3000), 1),
                "net_tx_kbps": round(random.uniform(5, 1000), 1),
                "cves_found": nd["_cves"],
                "open_ports": nd["_open_ports"],
                "running_processes": nd["_processes"],
                "data_records": nd["_data_records"],
            })
        elif self.path == "/logs":
            self._json_response({"logs": self.access_log[-50:]})
        elif self.path == "/metrics":
            self._json_response({
                "node": nd["label"],
                "cpu_pct": nd.get("_cpu_pct") or round(random.uniform(2, 85), 1),
                "mem_mb": nd.get("_mem_mb") or round(random.uniform(50, 512), 1),
                "net_rx_kbps": nd.get("_net_rx_kbps") or round(random.uniform(10, 5000), 1),
                "net_tx_kbps": nd.get("_net_tx_kbps") or round(random.uniform(5, 2000), 1),
                "open_connections": random.randint(1, 60),
                "uptime_s": int(time.time() - nd.get("_start_time", time.time())),
                "request_count": len(self.access_log),
            })
        elif self.path.startswith("/vulnerabilities"):
            vuln_list = []
            if nd.get("_cve") and nd["_cve"] != "None":
                vulns = {
                    "cve": nd["_cve"],
                    "severity": "critical" if nd.get("_cve_name") else random.choice(["high", "medium"]),
                    "service": nd.get("_service", random.choice(["ssh", "http", "https"])),
                }
                if nd.get("_cve_name"):
                    vulns["vuln_name"] = nd["_cve_name"]
                vuln_list.append(vulns)
                
            self._json_response({
                "node": nd["label"],
                "scan_id": str(uuid.uuid4())[:8],
                "vulnerabilities": vuln_list if vuln_list else [
                    {"cve": f"CVE-2024-{random.randint(1000,9999)}", "severity": "low", "service": "http"}
                ],
            })
        elif self.path == "/attack":
            nd["_compromised"] = True
            self._json_response({"status": "compromised", "node": nd["label"], "message": f"{nd['label']} has been compromised by AI Red Agent"})
        elif self.path == "/reset":
            nd["_compromised"] = False
            self._json_response({"status": "clean", "node": nd["label"], "message": f"{nd['label']} has been restored"})
        else:
            self._json_response({"error": "not found", "node": nd["label"]}, 404)

    def do_PUT(self):
        self._record("PUT", self.path)
        if self.path == "/edit":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            if "label" in body:
                self.node_def["label"] = body["label"]
            if "role" in body:
                self.node_def["role"] = body["role"]
            self._json_response({"status": "updated", "node": self.node_def})
        else:
            self._json_response({"error": "not found"}, 404)

    do_HEAD = do_GET


class ReusableHTTPServer(HTTPServer):
    """HTTPServer subclass that sets SO_REUSEADDR to avoid 'Address already in use'."""
    allow_reuse_address = True
    allow_reuse_port = True


def _run_server(node_def: dict):
    """Start a single node HTTP server in the current thread."""
    import socket
    # Create a unique handler class per server to avoid shared state
    handler_class = type(
        f"NodeHandler_{node_def['id']}",
        (NodeHandler,),
        {"node_def": node_def, "access_log": []},
    )
    node_def["_start_time"] = time.time()

    # Retry binding up to 3 times with a short delay
    for attempt in range(3):
        try:
            server = ReusableHTTPServer(("127.0.0.1", node_def["port"]), handler_class)
            node_def["_server"] = server
            server.serve_forever()
            return
        except OSError as e:
            if attempt < 2:
                time.sleep(1)
            else:
                print(f"  ✗ {node_def['label']} FAILED on port {node_def['port']}: {e}")


def main():
    print("=" * 70)
    print("  ATHERNEX NODE SERVERS — Starting simulated network nodes")
    print("=" * 70)

    threads = []
    
    def start_node(nd):
        t = threading.Thread(target=_run_server, args=(nd,), daemon=True)
        t.start()
        threads.append(t)
        return t

    for nd in NODE_DEFS:
        start_node(nd)
        print(f"  ✓ {nd['label']:12s}  ({nd['zone']:12s})  →  http://127.0.0.1:{nd['port']}")

    print("=" * 70)
    print(f"  All initial nodes online.  Interactive CLI ready.")
    print("=" * 70)

    try:
        while True:
            print("\n" + "="*50)
            print("  [ Athernex Node Operations CLI ]")
            print("="*50)
            print("  1. List all active nodes")
            print("  2. Edit a node (label/role)")
            print("  3. Stop/Remove a node")
            print("  4. Add a new node")
            print("  5. Load Built-in Scenario (Original / FinTrust Bank)")
            print("  6. View Live Attack Logs")
            print("  q. Quit")
            try:
                choice = input("Select an option: ").strip()
            except (EOFError, OSError):
                # Running without a TTY (backgrounded). Just keep daemon threads alive.
                time.sleep(10)
                continue

            if choice.lower() == "q":
                break

            if choice == "6":
                print("\n  [ Live Attack Logs ]")
                print("  Reading logs from cli_attack_feed.log... (Press Enter to return to menu)\n")
                log_file = "cli_attack_feed.log"
                if not os.path.exists(log_file):
                    open(log_file, "a", encoding="utf-8").close()
                with open(log_file, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                    for line in lines[-20:]:
                        print(line, end="")
                    import select
                    try:
                        while True:
                            if sys.stdin in select.select([sys.stdin], [], [], 0)[0]:
                                sys.stdin.readline()
                                break
                            line = f.readline()
                            if line:
                                print(line, end="")
                            else:
                                time.sleep(0.3)
                    except KeyboardInterrupt:
                        pass
                continue

            elif choice == "1":
                for nd in sorted(NODE_DEFS, key=lambda x: x['port']):
                    comp = " [COMPROMISED]" if nd.get("_compromised") else ""
                    print(f"  Port {nd['port']} | {nd['label']:12s} | Role: {nd['role']}{comp}")
            
            elif choice == "2":
                port = input("Enter port number to edit: ").strip()
                node = next((n for n in NODE_DEFS if str(n['port']) == port), None)
                if node:
                    new_label = input(f"Enter new label [{node['label']}]: ").strip()
                    if new_label: node['label'] = new_label
                    
                    new_role = input(f"Enter new role [{node['role']}]: ").strip()
                    if new_role: node['role'] = new_role
                    
                    vuln = input(f"Override vulnerability (low/medium/high/critical) [{node.get('_vulnerability', 'random')}]: ").strip().lower()
                    if vuln: node['_vulnerability'] = vuln
                    
                    data = input(f"Override data classification (low/medium/high/critical) [{node.get('_data_value', 'random')}]: ").strip().lower()
                    if data: node['_data_value'] = data

                    cpu = input(f"Override CPU % (e.g. 45.5) [{node.get('_cpu_pct', 'random')}]: ").strip()
                    if cpu: node['_cpu_pct'] = float(cpu)
                    
                    mem = input(f"Override Memory MB (e.g. 512) [{node.get('_mem_mb', 'random')}]: ").strip()
                    if mem: node['_mem_mb'] = float(mem)
                    
                    net_rx = input(f"Override RX kbps (e.g. 150) [{node.get('_net_rx_kbps', 'random')}]: ").strip()
                    if net_rx: node['_net_rx_kbps'] = float(net_rx)

                    ip = input(f"Override Internal IP [{node.get('_internal_ip', 'random')}]: ").strip()
                    if ip: node['_internal_ip'] = ip

                    os_name = input(f"Override OS Name [{node.get('_os', 'random')}]: ").strip()
                    if os_name: node['_os'] = os_name

                    comp = input(f"Force Compromise node? (y/n) [{'y' if node.get('_compromised') else 'n'}]: ").strip().lower()
                    if comp == 'y': node['_compromised'] = True
                    elif comp == 'n': node['_compromised'] = False

                    cve = input(f"Override CVEs (comma separated) [{','.join(node.get('_cves', []))}]: ").strip()
                    if cve: node['_cves'] = [x.strip() for x in cve.split(',')]
                    
                    cve_name = input(f"Override Commmon Vulnerability Name (e.g. Log4Shell) [{node.get('_cve_name', 'None')}]: ").strip()
                    if cve_name: node['_cve_name'] = cve_name

                    service_daemon = input(f"Override Running Exploit Service Target (e.g. tomcat, sshd) [{node.get('_service', 'unknown')}]: ").strip()
                    if service_daemon: node['_service'] = service_daemon

                    auth_type = input(f"Override Authentication Standard (bearer/basic/none) [{node.get('_auth_type', 'basic')}]: ").strip()
                    if auth_type: node['_auth_type'] = auth_type
                    
                    db_records = input(f"Override Data Records count [{node.get('_data_records', 0)}]: ").strip()
                    if db_records.isdigit(): node['_data_records'] = int(db_records)

                    open_ports = input(f"Override Open Ports (comma separated) [{','.join(map(str, node.get('_open_ports', [])))}]: ").strip()
                    if open_ports: node['_open_ports'] = [int(p) for p in open_ports.split(',') if p.strip().isdigit()]

                    print(f"✓ Node {port} properties instantly updated.")
                else:
                    print("X Node not found on that port.")
                    
            elif choice == "3":
                port = input("Enter port number to stop: ").strip()
                node = next((n for n in NODE_DEFS if str(n['port']) == port), None)
                if node:
                    NODE_DEFS.remove(node)
                    if "_server" in node:
                        def _shutdown_node(srv):
                            srv.shutdown()
                            srv.server_close()
                        threading.Thread(target=_shutdown_node, args=(node["_server"],), daemon=True).start()
                    print(f"✓ Node {port} HTTP server shut down. Removed from discovery.")
                else:
                    print("X Node not found on that port.")
                    
            elif choice == "4":
                # Find an open port
                used_ports = {n['port'] for n in NODE_DEFS}
                new_port = next((p for p in range(8005, 8050) if p not in used_ports), None)
                if not new_port:
                    print("X Error: Max nodes reached (ports 8005-8050 utilized).")
                    continue
                label = input("Enter new node label: ").strip() or f"NODE-{new_port}"
                zone = input("Enter node zone (dmz, app_server, db_server, workstation): ").strip() or "workstation"
                role = input("Enter role description: ").strip() or "Custom Node"
                color = {"dmz": "#00b4d8", "app_server": "#ffa500", "db_server": "#be50ff", "workstation": "#00ff88"}.get(zone, "#ffffff")
                
                new_node = {
                    "id": new_port - 8005,
                    "port": new_port,
                    "label": label,
                    "zone": zone,
                    "role": role,
                    "color": color
                }
                NODE_DEFS.append(new_node)
                start_node(new_node)
                print(f"✓ Spun up new node {label} on port {new_port}")
                
            elif choice == "5":
                print("\n  [ Built-in Scenarios ]")
                print("  1. Original Demo (Generic Web/App/DB)")
                print("  2. FinTrust Bank (Known CVEs: Log4Shell, EternalBlue)")
                sub = input("  Select scenario to load [1]: ").strip() or "1"
                
                # Shutdown existing node servers
                for nd in list(NODE_DEFS):
                    if "_server" in nd:
                        threading.Thread(target=nd["_server"].shutdown, daemon=True).start()
                NODE_DEFS.clear()
                
                # Load new scenario
                scenario = FINTRUST_SCENARIO if sub == "2" else DEFAULT_SCENARIO
                NODE_DEFS.extend(copy.deepcopy(scenario))
                
                print("\n  Spinning up new scenario environment...")
                for nd in NODE_DEFS:
                    start_node(nd)
                    print(f"  ✓ {nd['label']:12s}  ({nd['zone']:12s})  →  http://127.0.0.1:{nd['port']}")
                print("  ✓ Network topology instantly morphed! Frontend will discover changes in 2s.")
                
            elif choice == "q":
                print("\n  Shutting down node servers...")
                sys.exit(0)
    except KeyboardInterrupt:
        print("\n  Shutting down node servers...")
        sys.exit(0)


if __name__ == "__main__":
    main()
