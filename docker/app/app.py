"""CyberGuardian Application Server Node"""
import os, json, random, logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')

NODE_ID    = int(os.environ.get("NODE_ID", 0))
NODE_LABEL = os.environ.get("NODE_LABEL", "APP-XX")
NODE_ZONE  = os.environ.get("NODE_ZONE", "app_server")
SERVICE    = os.environ.get("SERVICE_NAME", "generic-service")
DB_HOST    = os.environ.get("DB_HOST", "")
VULN       = os.environ.get("VULNERABILITY", "medium")

@app.route("/health")
def health():
    return jsonify({"status": "ok", "node": NODE_LABEL, "zone": NODE_ZONE, "service": SERVICE})

@app.route("/")
def index():
    return jsonify({
        "node": NODE_LABEL,
        "zone": NODE_ZONE,
        "service": SERVICE,
        "vulnerability": VULN,
        "db_host": DB_HOST,
        "endpoints": ["/health", "/metrics", "/vulnerabilities", "/connections"]
    })

@app.route("/metrics")
def metrics():
    cpu = round(random.uniform(5, 85), 1)
    mem = round(random.uniform(20, 90), 1)
    req_s = random.randint(10, 500)
    app.logger.info(json.dumps({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "node": NODE_LABEL, "event": "metrics",
        "cpu": cpu, "mem": mem, "req_s": req_s
    }))
    return jsonify({"cpu_pct": cpu, "mem_pct": mem, "requests_per_sec": req_s, "service": SERVICE})

@app.route("/vulnerabilities")
def vulnerabilities():
    vulns = []
    if VULN == "high":
        vulns = [{"id": "CVE-2024-1234", "type": "sql_injection", "severity": "high"},
                 {"id": "CVE-2024-5678", "type": "xss", "severity": "medium"}]
    elif VULN == "medium":
        vulns = [{"id": "CVE-2024-9012", "type": "misconfig", "severity": "medium"}]
    app.logger.info(json.dumps({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "node": NODE_LABEL, "event": "recon_scan",
        "source": request.remote_addr, "vulns_found": len(vulns)
    }))
    return jsonify({"node": NODE_LABEL, "vulnerabilities": vulns})

@app.route("/connections")
def connections():
    conns = random.randint(1, 20)
    app.logger.info(json.dumps({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "node": NODE_LABEL, "event": "connection_check",
        "active_connections": conns
    }))
    return jsonify({"node": NODE_LABEL, "active_connections": conns, "db_reachable": bool(DB_HOST)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000)
