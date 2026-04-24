# Threat types
THREAT_TYPES = {
    0: "brute_force",
    1: "lateral_movement",
    2: "data_exfiltration",
    3: "c2_beacon",
}

# Severity levels
SEVERITY_LEVELS = {
    0: "low",
    1: "medium",
    2: "high",
    3: "critical",
}

# Node types
NODE_TYPES = {
    "dmz": 0,
    "app_server": 1,
    "db_server": 2,
    "workstation": 3,
}

# Red agent actions
RED_ACTIONS = {
    0: "scan",
    1: "exploit",
    2: "lateral_move",
    3: "exfiltrate",
    4: "beacon",
    5: "wait",
}

# Blue agent actions
BLUE_ACTIONS = {
    0: "monitor",
    1: "isolate",
    2: "patch",
    3: "block_ip",
    4: "reset_creds",
    5: "investigate",
}
