"""CyberGuardian Log Aggregator — collects Docker container logs and exposes them via HTTP API."""
import json
import logging
import os
import subprocess
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')

# ── Container registry (from docker compose labels) ──────────────────
NODE_MAP = {}
LOG_BUFFER: list[dict] = []
MAX_BUFFER = 500


def _discover_containers():
    """Discover CyberGuardian containers from Docker labels."""
    try:
        result = subprocess.run(
            ["docker", "ps", "--filter", "label=cyberguardian.zone",
             "--format", "{{.ID}}|{{.Names}}|{{.Labels}}"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|")
            if len(parts) < 3:
                continue
            cid, name, labels_str = parts[0], parts[1], parts[2]
            labels = {}
            for lbl in labels_str.split(","):
                if "=" in lbl:
                    k, v = lbl.split("=", 1)
                    labels[k.strip()] = v.strip()
            node_id = labels.get("cyberguardian.node_id", "?")
            zone = labels.get("cyberguardian.zone", "unknown")
            label = labels.get("cyberguardian.label", name)
            NODE_MAP[name] = {
                "container_id": cid,
                "node_id": int(node_id) if node_id.isdigit() else node_id,
                "zone": zone,
                "label": label,
                "name": name,
            }
        logging.info(f"Discovered {len(NODE_MAP)} containers")
    except Exception as exc:
        logging.warning(f"Container discovery failed: {exc}")


def _tail_container_logs():
    """Periodically tail logs from all containers."""
    while True:
        for name, info in list(NODE_MAP.items()):
            try:
                result = subprocess.run(
                    ["docker", "logs", "--tail", "5", "--since", "10s", name],
                    capture_output=True, text=True, timeout=5
                )
                for line in (result.stdout + result.stderr).strip().split("\n"):
                    if not line.strip():
                        continue
                    entry = {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "container": name,
                        "node_id": info["node_id"],
                        "zone": info["zone"],
                        "label": info["label"],
                        "message": line.strip()[:500],
                    }
                    LOG_BUFFER.append(entry)
            except Exception:
                pass

        # Trim buffer
        while len(LOG_BUFFER) > MAX_BUFFER:
            LOG_BUFFER.pop(0)

        time.sleep(5)


class LogHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/containers":
            data = json.dumps({"containers": list(NODE_MAP.values()), "total": len(NODE_MAP)})
        elif self.path == "/logs":
            limit = int(self.headers.get("X-Limit", "50"))
            data = json.dumps({"logs": LOG_BUFFER[-limit:], "total": len(LOG_BUFFER)})
        elif self.path.startswith("/logs/"):
            container = self.path.split("/logs/")[1]
            container_logs = [e for e in LOG_BUFFER if e["container"] == container][-50:]
            data = json.dumps({"logs": container_logs, "container": container})
        elif self.path == "/health":
            data = json.dumps({"status": "ok", "containers": len(NODE_MAP), "buffer_size": len(LOG_BUFFER)})
        else:
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data.encode())

    def log_message(self, format, *args):
        pass  # Suppress access logs


if __name__ == "__main__":
    _discover_containers()
    # Refresh container list every 60s
    def refresh():
        while True:
            time.sleep(60)
            _discover_containers()
    threading.Thread(target=refresh, daemon=True).start()
    # Start log tailing
    threading.Thread(target=_tail_container_logs, daemon=True).start()
    # Start HTTP server
    server = HTTPServer(("0.0.0.0", 9099), LogHandler)
    logging.info("Log aggregator listening on :9099")
    server.serve_forever()
