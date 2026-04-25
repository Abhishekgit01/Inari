"""CyberGuardian Workstation Simulation Node"""
import os, json, random, logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')

NODE_LABEL = os.environ.get("NODE_LABEL", "WS-XX")
NODE_ID    = int(os.environ.get("NODE_ID", 10))
WS_USER    = os.environ.get("USER", "employee")

PROCESSES = ["chrome.exe", "outlook.exe", "powershell.exe", "cmd.exe", "explorer.exe", "teams.exe"]

@app.route("/health")
def health():
    return jsonify({"status":"ok","node":NODE_LABEL,"zone":"workstation","user":WS_USER})

@app.route("/")
def index():
    return jsonify({"node":NODE_LABEL,"user":WS_USER,"endpoints":["/health","/process","/files","/network","/vulnerabilities"]})

@app.route("/process")
def process_list():
    procs = [{"pid": random.randint(1000,9999), "name": p, "cpu": round(random.random()*20,1)} for p in PROCESSES]
    app.logger.info(json.dumps({"timestamp":datetime.now(timezone.utc).isoformat(),"node":NODE_LABEL,"event":"process_list","user":WS_USER,"count":len(procs)}))
    return jsonify({"processes": procs, "user": WS_USER})

@app.route("/vulnerabilities")
def vulnerabilities():
    app.logger.info(json.dumps({"timestamp":datetime.now(timezone.utc).isoformat(),"node":NODE_LABEL,"event":"recon_scan","source":request.remote_addr}))
    return jsonify({"node":NODE_LABEL,"patch_level":"outdated","open_ports":[8080,445,139]})

@app.route("/files")
def files():
    suspicious = random.random() > 0.7
    event = "data_exfiltration" if suspicious else "file_access"
    app.logger.info(json.dumps({"timestamp":datetime.now(timezone.utc).isoformat(),"node":NODE_LABEL,"event":event,"user":WS_USER,"size_mb":random.randint(1,800) if suspicious else 1}))
    return jsonify({"files": ["documents/report.docx","downloads/setup.exe","desktop/passwords.txt"] if suspicious else ["documents/work.docx"]})

@app.route("/network")
def network():
    return jsonify({"node":NODE_LABEL,"connections":random.randint(2,30),"bytes_sent":random.randint(1000,500000000)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
