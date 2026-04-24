from __future__ import annotations

import uuid
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .network import NetworkTopology
from ..simulation.log_generator import LogGenerator
from ..detection.correlator import CrossLayerCorrelator


class CyberSecurityEnv(gym.Env):
    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 4}

    def __init__(
        self,
        num_hosts: int = 20,
        max_steps: int = 100,
        render_mode: str | None = None,
        w_p: float = 1.0,
        w_t: float = 2.0,
    ):
        super().__init__()
        self.num_hosts = num_hosts
        self.max_steps = max_steps
        self.render_mode = render_mode
        self.w_p = w_p
        self.w_t = w_t
        self.network = NetworkTopology(num_hosts=num_hosts)
        self.log_generator = LogGenerator()
        self.correlator = CrossLayerCorrelator()

        self.action_space = spaces.Dict(
            {
                "red_action": spaces.MultiDiscrete([num_hosts, 6]),
                "blue_action": spaces.MultiDiscrete([num_hosts, 6]),
            }
        )
        self.observation_space = spaces.Dict(
            {
                "network_topology": spaces.Box(low=0, high=1, shape=(num_hosts, num_hosts), dtype=np.float32),
                "host_status": spaces.MultiBinary(num_hosts),
                "traffic_matrix": spaces.Box(low=0, high=1000, shape=(num_hosts, num_hosts), dtype=np.float32),
                "alert_scores": spaces.Box(low=0, high=1, shape=(num_hosts, 4), dtype=np.float32),
                "time_step": spaces.Box(low=0, high=max_steps, shape=(1,), dtype=np.int32),
            }
        )

        self.reset()

    def reset(
        self,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        super().reset(seed=seed)
        self.network.reset()
        self.current_step = 0
        self.compromised_hosts: set[int] = set()
        self.isolated_hosts: set[int] = set()
        self.patched_hosts: set[int] = set()
        self.detected_compromises: set[int] = set()

        self.red_position = self.network.get_entry_point()
        self.compromised_hosts.add(self.red_position)
        self.data_exfiltrated = 0.0
        self.red_caught = False
        self.false_positive_seeded = False

        self.alerts_raised: list[dict[str, Any]] = []
        self.false_positives = 0
        self.true_positives = 0
        self.logs: list[dict[str, Any]] = []
        self.red_action_sequence: list[str] = []
        self.episode_id = f"EP-{uuid.uuid4().hex[:8]}"
        self.last_red_action_meta: dict[str, Any] | None = None
        self.last_blue_action_meta: dict[str, Any] | None = None
        self.last_step_logs: list[dict[str, Any]] = []
        self.last_step_correlation_ids: list[str] = []
        self.new_alerts: list[dict[str, Any]] = []

        return self._get_observation(), self._get_info()

    def step(
        self, action: dict[str, np.ndarray]
    ) -> tuple[dict[str, Any], dict[str, float], bool, bool, dict[str, Any]]:
        self.current_step += 1
        self.log_generator.set_step(self.current_step)
        red_target, red_type = action["red_action"]
        blue_target, blue_type = action["blue_action"]

        red_reward, red_logs, red_meta = self._execute_red_action(int(red_target), int(red_type))
        blue_reward, blue_logs, blue_meta = self._execute_blue_action(int(blue_target), int(blue_type))

        self.red_action_sequence.append(f"[{int(red_target)}, {int(red_type)}]")

        step_logs = self._tag_logs(red_logs, "red") + self._tag_logs(blue_logs, "blue")
        if not self.false_positive_seeded and 10 <= self.current_step <= 20:
            fp_logs = self._tag_logs(self.log_generator.generate_false_positive_scenario(), "system")
            step_logs.extend(fp_logs)
            self.false_positive_seeded = True

        # ── INJECT BENIGN TRAFFIC (every step) ───────────────────────────────
        benign_logs = self.log_generator.generate_benign_traffic(self.current_step, num_events=5)
        step_logs.extend(benign_logs)

        # ── RUN CORRELATOR ────────────────────────────────────────────────────
        self.correlator.ingest(step_logs, self.current_step)
        self.new_alerts = self.correlator.correlate(self.current_step)

        self.logs.extend(step_logs)
        self.last_step_logs = step_logs
        self.last_step_correlation_ids = list(
            {
                str(log.get("correlation_id"))
                for log in step_logs
                if log.get("correlation_id")
            }
        )
        self.last_red_action_meta = red_meta
        self.last_blue_action_meta = blue_meta

        delta_p = -len(self.isolated_hosts)
        delta_t_magnitude = len(self.compromised_hosts)
        blue_reward += (self.w_p * delta_p) - (self.w_t * delta_t_magnitude)

        self._update_network_state()

        terminated = self._check_termination()
        truncated = self.current_step >= self.max_steps
        rewards = {"red": float(red_reward), "blue": float(blue_reward)}
        return self._get_observation(), rewards, terminated, truncated, self._get_info()

    def _tag_logs(self, logs: list[dict[str, Any]], agent: str) -> list[dict[str, Any]]:
        for log in logs:
            log.setdefault("timestamp", self.current_step)
            log.setdefault("step", self.current_step)
            log["agent"] = agent
        return logs

    def _action_name(self, agent: str, action_type: int) -> str:
        red_actions = ["scan", "exploit", "lateral_move", "exfiltrate", "beacon", "wait"]
        blue_actions = ["monitor", "isolate", "patch", "block_ip", "reset_credentials", "investigate"]
        mapping = red_actions if agent == "red" else blue_actions
        return mapping[action_type]

    def _host_label(self, host_id: int) -> str:
        if host_id < 2:
            return f"DMZ-{host_id + 1:02d}"
        if host_id < 7:
            return f"APP-{host_id - 1:02d}"
        if host_id < 10:
            return f"DB-{host_id - 6:02d}"
        return f"WS-{host_id - 9:02d}"

    def _blue_reason(self, target: int, action_name: str) -> str:
        score = float(self.network.get_alert_scores()[target].max())
        return (
            f"{self._host_label(target)} raised a composite alert score of {score:.2f}, "
            f"triggering a {action_name.replace('_', ' ')} response."
        )

    def _red_reason(self, target: int, action_name: str) -> str:
        vuln = float(self.network.get_vulnerabilities(target))
        value = float(self.network.get_data_value(target))
        return (
            f"{self._host_label(target)} exposes vulnerability {vuln:.2f} and "
            f"protects approximately {value:.1f} GB of value, making it attractive for {action_name}."
        )

    def _execute_red_action(
        self, target: int, action_type: int
    ) -> tuple[float, list[dict[str, Any]], dict[str, Any]]:
        reward = 0.0
        logs: list[dict[str, Any]] = []
        success = False
        action_name = self._action_name("red", action_type)
        source_position = self.red_position
        target_host = target

        if action_type == 0:  # Scan
            success = self.network.can_reach(source_position, target)
            reward = 1.0 if success else -1.0
            logs = self.log_generator.generate_action_chain(source_position, target, "scan", success=success)
        elif action_type == 1:  # Exploit
            success_prob = 0.1 if target in self.patched_hosts else self.network.get_exploit_success_rate(target)
            success = bool(np.random.random() < success_prob)
            reward = 20.0 if success else -2.0
            logs = self.log_generator.generate_action_chain(source_position, target, "exploit", success=success)
            if success:
                self.compromised_hosts.add(target)
                self.red_position = target
        elif action_type == 2:  # Lateral movement
            pivot = target if target in self.compromised_hosts else source_position
            next_targets = [
                neighbor
                for neighbor in self.network.get_neighbors(pivot)
                if neighbor not in self.compromised_hosts and neighbor not in self.isolated_hosts
            ]
            if next_targets:
                destination = max(next_targets, key=self.network.get_vulnerabilities)
                success = True
                reward = 15.0
                target_host = destination
                self.compromised_hosts.add(destination)
                self.red_position = destination
                logs = self.log_generator.generate_action_chain(pivot, destination, "lateral_move", success=True)
            else:
                success = False
                reward = -3.0
                logs = self.log_generator.generate_action_chain(pivot, pivot, "lateral_move", success=False)
        elif action_type == 3:  # Exfiltrate
            if target in self.compromised_hosts:
                success = True
                data_value = float(self.network.get_data_value(target))
                self.data_exfiltrated += data_value
                reward = data_value * 8.0
                logs = self.log_generator.generate_action_chain(target, None, "exfiltrate", success=True)
                for log in logs:
                    log["bytes"] = max(log.get("bytes", 0), data_value * 1_200_000)
                    log["network_bytes"] = log["bytes"]
                self.red_position = target
            else:
                reward = -4.0
                logs = self.log_generator.generate_action_chain(source_position, None, "exfiltrate", success=False)
        elif action_type == 4:  # C2 Beacon
            if target in self.compromised_hosts:
                success = True
                reward = 3.0
                logs = self.log_generator.generate_action_chain(target, None, "beacon", success=True)
                self.red_position = target
            else:
                reward = -1.0
                logs = self.log_generator.generate_action_chain(source_position, None, "beacon", success=False)
        elif action_type == 5:  # Wait
            reward = 0.5
            success = True
            logs = []

        meta = {
            "agent": "red",
            "action_name": action_name,
            "target_host_id": target_host,
            "target_host_label": self._host_label(target_host),
            "success": success,
            "reason": self._red_reason(target_host, action_name),
            "is_false_positive": False,
        }
        return reward, logs, meta

    def _defender_log(self, target: int, action_name: str, success: bool) -> dict[str, Any]:
        return {
            "id": str(uuid.uuid4()),
            "timestamp": self.current_step,
            "step": self.current_step,
            "type": action_name,
            "action_type": action_name,
            "layer": "endpoint",
            "correlation_id": f"BLUE-{self.current_step:03d}-{uuid.uuid4().hex[:6]}",
            "target": target,
            "host_id": target,
            "host_label": self._host_label(target),
            "alert_score": round(float(self.network.get_alert_scores()[target].max()), 3),
            "process_name": action_name,
            "user": "blue_agent",
            "success": success,
            "log_color": "#00e5ff" if success else "#ff6600",
        }

    def _execute_blue_action(
        self, target: int, action_type: int
    ) -> tuple[float, list[dict[str, Any]], dict[str, Any]]:
        reward = 0.0
        logs: list[dict[str, Any]] = []
        action_name = self._action_name("blue", action_type)
        success = False
        is_false_positive = False

        if action_type == 0:  # Monitor
            success = True
            reward = 1.0
        elif action_type == 1:  # Isolate
            self.isolated_hosts.add(target)
            if target in self.compromised_hosts:
                self.detected_compromises.add(target)
                self.true_positives += 1
                reward = 50.0
                success = True
            else:
                self.false_positives += 1
                reward = -30.0
                is_false_positive = True
        elif action_type == 2:  # Patch
            self.patched_hosts.add(target)
            reward = 5.0
            success = True
        elif action_type == 3:  # Block IP
            if target in self.compromised_hosts:
                reward = 30.0
                self.detected_compromises.add(target)
                self.true_positives += 1
                success = True
            else:
                reward = -10.0
                self.false_positives += 1
                is_false_positive = True
        elif action_type == 4:  # Reset credentials
            if target in self.compromised_hosts:
                self.compromised_hosts.remove(target)
                reward = 40.0
                self.detected_compromises.add(target)
                self.true_positives += 1
                success = True
            else:
                reward = -5.0
        elif action_type == 5:  # Investigate
            if target in self.compromised_hosts:
                reward = 10.0
                self.detected_compromises.add(target)
                success = True
            else:
                reward = -2.0
                is_false_positive = True

        if self.true_positives > 0:
            reward += max(0.0, 50.0 - self.current_step)

        logs.append(self._defender_log(target, action_name, success))
        meta = {
            "agent": "blue",
            "action_name": action_name,
            "target_host_id": target,
            "target_host_label": self._host_label(target),
            "success": success,
            "reason": self._blue_reason(target, action_name),
            "is_false_positive": is_false_positive,
        }
        return reward, logs, meta

    def _update_network_state(self) -> None:
        self.network.update_traffic(compromised=self.compromised_hosts, isolated=self.isolated_hosts)
        self.network.update_alerts(self.logs[-24:])

    def _check_termination(self) -> bool:
        if self.data_exfiltrated >= 1000:
            return True
        if len(self.compromised_hosts) > self.num_hosts * 0.75:
            return True
        if set(self.compromised_hosts).issubset(self.detected_compromises) and len(self.compromised_hosts) > 1:
            self.red_caught = True
            return True
        if self.current_step > 50 and len(self.compromised_hosts) <= 1:
            return True
        return False

    def _get_observation(self) -> dict[str, Any]:
        observed_status = np.zeros(self.num_hosts)
        for host in self.detected_compromises:
            observed_status[host] = 1
        return {
            "network_topology": self.network.get_adjacency_matrix(),
            "host_status": observed_status,
            "traffic_matrix": self.network.get_traffic_matrix(),
            "alert_scores": self.network.get_alert_scores(),
            "time_step": np.array([self.current_step]),
        }

    def _get_info(self) -> dict[str, Any]:
        return {
            "episode_id": self.episode_id,
            "compromised_hosts": list(self.compromised_hosts),
            "detected_compromises": list(self.detected_compromises),
            "isolated_hosts": list(self.isolated_hosts),
            "patched_hosts": list(self.patched_hosts),
            "data_exfiltrated": self.data_exfiltrated,
            "true_positives": self.true_positives,
            "false_positives": self.false_positives,
            "red_caught": self.red_caught,
            "red_position": self.red_position,
            "logs": self.last_step_logs,
            "all_logs": self.logs[-50:],
            "new_alerts": self.new_alerts,
            "red_action_sequence": self.red_action_sequence,
            "red_victory": (self.data_exfiltrated >= 1000) or (len(self.compromised_hosts) > self.num_hosts * 0.75),
        }
