import time
import json
import random
import uuid
import requests
from datetime import datetime, timezone

# URL of the Athernex backend SIEM ingest route
URL = "http://127.0.0.1:8001/api/siem/ingest"

print("==================================================")
print("  SPLUNK ENTERPRISE - SYNTHETIC DATA FORWARDER")
print("==================================================")
print(f"Targeting: {URL}\n")

EVENT_TYPES = ["Login Failed", "Privilege Escalation", "Malware Blocked", "Unusual Outbound Traffic", "Data Exfiltration Attempt"]
USERS = ["admin", "service_acct_2", "jdoe", "db_admin", "k8s_operator"]
HOSTS = ["APP-01", "PAY-PROC-A", "DB-LEDGER", "FIN-LAPTOP", "WIN-DC-01", "EXT-WAF"]

try:
    while True:
        # Construct a raw, Splunk-formatted JSON event payload
        event_src = random.choice(HOSTS)
        action = random.choice(EVENT_TYPES)
        
        payload = {
            "result": {
                "_time": datetime.now(timezone.utc).isoformat(),
                "host": event_src,
                "source": "WinEventLog:Security",
                "sourcetype": "wineventlog",
                "user": random.choice(USERS),
                "action": action,
                "severity": random.choice(["high", "critical", "medium"]),
                "raw_event": f"Process creation blocked by EDR for {action}. SubjectUser={random.choice(USERS)}"
            }
        }
        
        # Athernex expects the vendor query param to normalize it
        params = {"vendor": "splunk"}
        
        try:
            resp = requests.post(URL, params=params, json=payload, timeout=2)
            if resp.status_code in (200, 202):
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Forwarded: {action} on {event_src} -> [{resp.status_code} OK]")
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] POST Error: {resp.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Connection Refused. Is 'python -m uvicorn src.api.main:app' running?")
            
        # Send an event roughly every 4 to 8 seconds
        time.sleep(random.uniform(4.0, 8.0))
        
except KeyboardInterrupt:
    print("\nForwarder stopped.")
