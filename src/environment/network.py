import numpy as np
import networkx as nx
from typing import List, Set, Dict, Tuple

class NetworkTopology:
    def __init__(self, num_hosts: int = 20):
        self.num_hosts = num_hosts
        self.graph = nx.Graph()
        self._build_topology()
        self.vulnerabilities = {}
        self.data_values = {}
        self.patch_levels = {}
        self.traffic_matrix = np.zeros((num_hosts, num_hosts))
        self.alert_scores = np.zeros((num_hosts, 4))
        self._initialize_host_properties()
    
    def _build_topology(self):
        dmz_hosts = [0, 1]
        app_servers = list(range(2, 7))
        db_servers = list(range(7, 10))
        workstations = list(range(10, 20))
        for i in range(self.num_hosts):
            self.graph.add_node(i)
        for dmz in dmz_hosts:
            for app in app_servers:
                self.graph.add_edge(dmz, app)
        for app in app_servers:
            for db in db_servers:
                self.graph.add_edge(app, db)
        for ws in workstations:
            connected_apps = np.random.choice(app_servers, size=2, replace=False)
            for app in connected_apps:
                self.graph.add_edge(ws, app)
        for i in range(len(workstations) - 1):
            if np.random.random() < 0.3:
                self.graph.add_edge(workstations[i], workstations[i+1])
    
    def _initialize_host_properties(self):
        for host in range(self.num_hosts):
            if host < 2:
                self.vulnerabilities[host] = np.random.uniform(0.1, 0.3)
            elif 7 <= host < 10:
                self.vulnerabilities[host] = np.random.uniform(0.2, 0.4)
            else:
                self.vulnerabilities[host] = np.random.uniform(0.3, 0.7)
            if 7 <= host < 10:
                self.data_values[host] = np.random.uniform(100, 500)
            elif 2 <= host < 7:
                self.data_values[host] = np.random.uniform(10, 50)
            else:
                self.data_values[host] = np.random.uniform(1, 10)
            self.patch_levels[host] = "current" if np.random.random() < 0.6 else "outdated"
    
    def reset(self):
        self.traffic_matrix = np.zeros((self.num_hosts, self.num_hosts))
        self.alert_scores = np.zeros((self.num_hosts, 4))
    
    def get_entry_point(self) -> int:
        return int(np.random.choice([0, 1]))
    
    def get_neighbors(self, host: int) -> List[int]:
        return list(self.graph.neighbors(host))
    
    def can_reach(self, source: int, target: int) -> bool:
        return nx.has_path(self.graph, source, target)
    
    def get_vulnerabilities(self, host: int) -> float:
        return self.vulnerabilities.get(host, 0.5)
    
    def get_exploit_success_rate(self, host: int) -> float:
        base_vuln = self.vulnerabilities[host]
        if self.patch_levels[host] == "current":
            return base_vuln * 0.3
        return base_vuln
    
    def get_data_value(self, host: int) -> float:
        return self.data_values.get(host, 1.0)
    
    def update_traffic(self, compromised: Set[int], isolated: Set[int]):
        self.traffic_matrix = np.zeros((self.num_hosts, self.num_hosts))
        for edge in self.graph.edges():
            src, dst = edge
            if src not in isolated and dst not in isolated:
                self.traffic_matrix[src, dst] = np.random.uniform(10, 100)
                self.traffic_matrix[dst, src] = np.random.uniform(10, 100)
        for host in compromised:
            if host not in isolated:
                self.traffic_matrix[host, 0] += np.random.uniform(1, 5)
                neighbors = self.get_neighbors(host)
                for neighbor in neighbors:
                    self.traffic_matrix[host, neighbor] += np.random.uniform(50, 200)
    
    def update_alerts(self, recent_logs: List[Dict]):
        self.alert_scores = np.zeros((self.num_hosts, 4))
        for log in recent_logs:
            log_type = log.get("type")
            if log_type in {"exploit", "scan", "auth", "brute_force"}:
                target = log.get("target", 0)
                self.alert_scores[target, 0] += 0.2
            elif log_type in {"lateral_movement", "lateral_move"}:
                target = log.get("destination", 0)
                self.alert_scores[target, 1] += 0.3
            elif log_type in {"exfiltration", "data_exfiltration"}:
                target = log.get("source", 0)
                self.alert_scores[target, 2] += 0.5
            elif log_type in {"beacon", "c2_beacon"}:
                target = log.get("source", 0)
                self.alert_scores[target, 3] += 0.1
        self.alert_scores = np.clip(self.alert_scores, 0, 1)
    
    def get_adjacency_matrix(self) -> np.ndarray:
        return nx.to_numpy_array(self.graph, dtype=np.float32)
    
    def get_traffic_matrix(self) -> np.ndarray:
        return self.traffic_matrix.astype(np.float32)
    
    def get_alert_scores(self) -> np.ndarray:
        return self.alert_scores.astype(np.float32)
