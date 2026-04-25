#!/usr/bin/env python3
"""Launch all CyberGuardian node servers on different ports."""
import os
import sys
import subprocess
import time
import signal

# ── Node definitions: (port, node_id, label, zone, service, vulnerability, owner, data_value) ──
NODES = [
    # DMZ Zone (ports 8005-8006)
    (8005, 0,  "DMZ-01",      "dmz",         "reverse-proxy",   "low",    "sec-team",  "low"),
    (8006, 1,  "DMZ-02",      "dmz",         "load-balancer",   "low",    "sec-team",  "low"),
    # Application Zone (ports 8007-8011)
    (8007, 2,  "APP-01",      "app_server",  "auth-service",    "medium", "devops",    "medium"),
    (8008, 3,  "APP-02",      "app_server",  "api-gateway",     "medium", "devops",    "medium"),
    (8009, 4,  "APP-03",      "app_server",  "payment-svc",     "high",   "finance",   "high"),
    (8010, 5,  "APP-04",      "app_server",  "web-frontend",    "medium", "devops",    "medium"),
    (8011, 6,  "APP-05",      "app_server",  "cicd-runner",     "low",    "devops",    "low"),
    # Database Zone (ports 8012-8014)
    (8012, 7,  "DB-01",       "db_server",   "postgres-cust",   "medium", "dba",       "high"),
    (8013, 8,  "DB-02",       "db_server",   "redis-cache",     "low",    "dba",       "medium"),
    (8014, 9,  "DB-03",       "db_server",   "postgres-vault",  "high",   "dba",       "critical"),
    # Workstation Zone (ports 8015-8019)
    (8015, 10, "User-01",     "workstation",  "developer",      "medium", "engineering","low"),
    (8016, 11, "User-02",     "workstation",  "finance-team",   "medium", "finance",   "medium"),
    (8017, 12, "User-03",     "workstation",  "hr-team",        "low",    "hr",        "low"),
    (8018, 13, "User-04",     "workstation",  "executive",      "high",   "c-suite",   "high"),
    (8019, 14, "User-05",     "workstation",  "it-ops",         "medium", "it",        "medium"),
]

processes = []

def launch_all():
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "node_server.py")
    for port, nid, label, zone, svc, vuln, owner, dval in NODES:
        env = os.environ.copy()
        env.update({
            "NODE_ID": str(nid),
            "NODE_LABEL": label,
            "NODE_ZONE": zone,
            "NODE_PORT": str(port),
            "SERVICE_NAME": svc,
            "VULNERABILITY": vuln,
            "OWNER": owner,
            "DATA_VALUE": dval,
        })
        p = subprocess.Popen(
            [sys.executable, script],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        processes.append((p, label, port))
        print(f"  Started {label} on :{port} (PID {p.pid}, zone={zone})")

    print(f"\n✓ {len(processes)} nodes running")
    print("  Test:  curl http://localhost:8005/info")
    print("  Edit:  curl -X PUT http://localhost:8005/edit -H 'Content-Type: application/json' -d '{\"label\":\"MY-CUSTOM-NAME\"}'")
    print("  Attack: curl http://localhost:8005/attack")
    print("  Stop:  Ctrl+C or kill the processes\n")

    try:
        for p, _, _ in processes:
            p.wait()
    except KeyboardInterrupt:
        print("\nStopping all nodes...")
        for p, label, port in processes:
            p.terminate()
        print("All nodes stopped.")

if __name__ == "__main__":
    print("╔══════════════════════════════════════════════════════╗")
    print("║   CyberGuardian — Real Network Node Launcher        ║")
    print("║   15 nodes on ports 8005-8019                      ║")
    print("╚══════════════════════════════════════════════════════╝\n")
    launch_all()
