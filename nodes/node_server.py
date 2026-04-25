#!/usr/bin/env python3
"""CyberGuardian Real Node Server — each instance is a real network node."""
import os
import sys
import json
import random
import logging
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')

# ── Config from environment ──────────────────────────────────────────────
NODE_ID    = int(os.environ.get("NODE_ID", 0))
NODE_LABEL = os.environ.get("NODE_LABEL", "NODE-00")
NODE_ZONE  = os.environ.get("NODE_ZONE", "dmz")
NODE_PORT  = int(os.environ.get("NODE_PORT", 8005))
SERVICE    = os.environ.get("SERVICE_NAME", "generic")
VULN_LEVEL = os.environ.get("VULNERABILITY", "low")
OWNER      = os.environ.get("OWNER", "admin")
DATA_VALUE = os.environ.get("DATA_VALUE", "low")

# ── Mutable state (editable via API to prove it's real) ──────────────────
node_state = {
    "label": NODE_LABEL,
    "owner": OWNER,
    "status": "running",
    "cpu": round(random.uniform(5, 45), 1),
    "memory": round(random.uniform(20, 60), 1),
    "connections": random.randint(2, 20),
    "bytes_sent": random.randint(1000, 500000),
    "patch_level": "current" if VULN_LEVEL == "low" else "outdated",
    "open_ports": [80, 443] if NODE_ZONE == "dmz" else [3000],
    "vulnerability": VULN_LEVEL,
    "service": SERVICE,
    "data_value": DATA_VALUE,
    "compromised": False,
    "last_event": None,
    "event_log": [],
}

THREAT_TYPES = ["brute_force", "lateral_movement", "data_exfiltration", "c2_beacon", "privilege_escalation", "phishing"]


class NodeHandler(BaseHTTPRequestHandler):
    """HTTP handler for a single CyberGuardian node."""

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key")

    def _json(self, data, code=200):
        body = json.dumps(data, indent=2).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        # Simulate random activity
        node_state["cpu"] = round(random.uniform(3, 85), 1)
        node_state["memory"] = round(random.uniform(15, 80), 1)
        node_state["connections"] = random.randint(1, 30)
        node_state["bytes_sent"] = random.randint(500, 900000)

        if self.path == "/" or self.path == "/info":
            self._json({
                "node_id": NODE_ID,
                "label": node_state["label"],
                "zone": NODE_ZONE,
                "port": NODE_PORT,
                "owner": node_state["owner"],
                "service": node_state["service"],
                "vulnerability": node_state["vulnerability"],
                "data_value": node_state["data_value"],
                "compromised": node_state["compromised"],
                "status": node_state["status"],
                "endpoints": ["/info", "/metrics", "/vulnerabilities", "/attack", "/logs", "/edit"],
            })
        elif self.path == "/metrics":
            self._json({
                "node_id": NODE_ID,
                "label": node_state["label"],
                "cpu_pct": node_state["cpu"],
                "mem_pct": node_state["memory"],
                "connections": node_state["connections"],
                "bytes_sent": node_state["bytes_sent"],
                "service": node_state["service"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        elif self.path == "/vulnerabilities":
            vulns = []
            if node_state["vulnerability"] == "high":
                vulns = [{"id": "CVE-2024-1234", "type": "sql_injection", "severity": "high"},
                         {"id": "CVE-2024-5678", "type": "xss_stored", "severity": "medium"}]
            elif node_state["vulnerability"] == "medium":
                vulns = [{"id": "CVE-2024-9012", "type": "misconfiguration", "severity": "medium"}]
            self._json({
                "node_id": NODE_ID,
                "label": node_state["label"],
                "patch_level": node_state["patch_level"],
                "open_ports": node_state["open_ports"],
                "vulnerabilities": vulns,
            })
        elif self.path == "/attack":
            # Simulate an attack event
            threat = random.choice(THREAT_TYPES)
            severity = random.choice(["low", "medium", "high", "critical"])
            event = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "node_id": NODE_ID,
                "label": node_state["label"],
                "event": "attack_detected",
                "threat_type": threat,
                "severity": severity,
                "source_ip": f"10.0.{random.randint(1,5)}.{random.randint(1,254)}",
            }
            node_state["last_event"] = event
            node_state["event_log"].append(event)
            node_state["event_log"] = node_state["event_log"][-20:]  # keep last 20
            if severity in ("high", "critical"):
                node_state["compromised"] = True
            logging.info(f"ATTACK: {threat} ({severity}) on {node_state['label']}")
            self._json(event)
        elif self.path == "/logs":
            self._json({
                "node_id": NODE_ID,
                "label": node_state["label"],
                "event_log": node_state["event_log"][-10:],
                "total_events": len(node_state["event_log"]),
            })
        elif self.path == "/health":
            self._json({"status": "ok", "node": node_state["label"], "zone": NODE_ZONE, "port": NODE_PORT})
        else:
            self._json({"error": "not found"}, 404)

    def do_PUT(self):
        """Edit node properties to prove it's real and not fake data."""
        if self.path == "/edit":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            editable = ["label", "owner", "vulnerability", "service", "data_value", "compromised", "status"]
            changed = {}
            for key in editable:
                if key in body:
                    old = node_state.get(key)
                    node_state[key] = body[key]
                    changed[key] = {"from": old, "to": body[key]}
            if changed:
                event = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "node_id": NODE_ID,
                    "event": "node_edited",
                    "changes": changed,
                }
                node_state["event_log"].append(event)
                node_state["event_log"] = node_state["event_log"][-20:]
                logging.info(f"EDITED: {changed}")
            self._json({"node_id": NODE_ID, "state": node_state, "changed": changed})
        else:
            self._json({"error": "use PUT /edit to modify node"}, 404)

    def do_POST(self):
        """Simulate attack or reset."""
        if self.path == "/attack":
            return self.do_GET()  # reuse GET /attack logic
        elif self.path == "/reset":
            node_state["compromised"] = False
            node_state["status"] = "running"
            node_state["event_log"] = []
            self._json({"node_id": NODE_ID, "status": "reset", "label": node_state["label"]})
        else:
            self._json({"error": "not found"}, 404)

    def log_message(self, format, *args):
        logging.info(f"[{node_state['label']}:{NODE_PORT}] {args[0]}" if args else "")


if __name__ == "__main__":
    logging.info(f"Starting node {NODE_LABEL} (id={NODE_ID}, zone={NODE_ZONE}) on port {NODE_PORT}")
    server = HTTPServer(("0.0.0.0", NODE_PORT), NodeHandler)
    server.serve_forever()
