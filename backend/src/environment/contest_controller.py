"""Contest controller — per-node battle state machine."""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

from ..models.contest import (
    BattleScoreboard,
    ContestEvent,
    ContestPhase,
    NodeBattleResult,
)


# Threat-type metadata
_THREAT_META: Dict[str, Dict[str, str]] = {
    "scan": {"threat": "brute_force", "mitre_id": "T1110", "mitre_name": "Brute Force", "vector": "ssh_brute"},
    "exploit": {"threat": "brute_force", "mitre_id": "T1110", "mitre_name": "Brute Force", "vector": "ssh_brute"},
    "lateral_move": {"threat": "lateral_movement", "mitre_id": "T1021", "mitre_name": "Remote Services", "vector": "psexec"},
    "exfiltrate": {"threat": "data_exfiltration", "mitre_id": "T1041", "mitre_name": "Exfiltration Over C2 Channel", "vector": "dns_tunnel"},
    "beacon": {"threat": "c2_beacon", "mitre_id": "T1071", "mitre_name": "Application Layer Protocol", "vector": "http_beacon"},
    "wait": {"threat": None, "mitre_id": None, "mitre_name": None, "vector": "none"},
}

_SEVERITY_THRESHOLDS = [(0.8, "critical"), (0.6, "high"), (0.35, "medium"), (0.0, "low")]

_NODE_TYPE_LABELS = {
    "db_server": "Database Server",
    "dmz": "DMZ Server",
    "app_server": "Application Server",
    "workstation": "Workstation",
}


def _host_label(host_id: int) -> str:
    if host_id < 2:
        return f"DMZ-{host_id + 1:02d}"
    if host_id < 7:
        return f"APP-{host_id - 1:02d}"
    if host_id < 10:
        return f"DB-{host_id - 6:02d}"
    return f"WS-{host_id - 9:02d}"


def _host_type(host_id: int) -> str:
    if host_id < 2:
        return "dmz"
    if host_id < 7:
        return "app_server"
    if host_id < 10:
        return "db_server"
    return "workstation"


def _severity_for(control: float) -> str:
    for threshold, label in _SEVERITY_THRESHOLDS:
        if control >= threshold:
            return label
    return "low"


class ContestController:
    """Manages per-node contest state. Called every step after both agents act."""

    def __init__(self, num_hosts: int):
        self.num_hosts = num_hosts
        self.node_states: Dict[int, Dict[str, Any]] = {}
        self.battle_history: List[NodeBattleResult] = []
        self.total_red_captures = 0
        self.total_blue_defenses = 0
        self.total_blue_recaptures = 0
        self.total_false_positives = 0

        for host_id in range(num_hosts):
            self.node_states[host_id] = {
                "phase": ContestPhase.IDLE,
                "red_control": 0.0,
                "blue_control": 1.0,
                "step_started": 0,
                "steps_contested": 0,
                "last_threat": None,
                "idle_timer": 0,
            }

    def get_active_events(self, env: Any, current_step: int) -> List[ContestEvent]:
        """Return all non-idle contest events for the current step."""
        return [
            self._make_event(host_id, state, current_step, env, {}, {})
            for host_id, state in self.node_states.items()
            if state["phase"] != ContestPhase.IDLE
        ]

    def get_all_node_events(self, env: Any, current_step: int) -> List[ContestEvent]:
        """Return a battle-state snapshot for every node, including idle nodes."""
        return [
            self._make_event(host_id, state, current_step, env, {}, {})
            for host_id, state in self.node_states.items()
        ]

    def force_attack(self, env: Any, target_node: int, threat_type: str, current_step: int) -> ContestEvent:
        """Seed a node into battle state for demo narration or judge walkthroughs."""
        state = self.node_states[target_node]
        meta = {
            "brute_force": _THREAT_META["exploit"],
            "exploit": _THREAT_META["exploit"],
            "lateral_movement": _THREAT_META["lateral_move"],
            "data_exfiltration": _THREAT_META["exfiltrate"],
            "c2_beacon": _THREAT_META["beacon"],
        }.get(threat_type, _THREAT_META["exploit"])

        state["last_threat"] = meta
        state["red_control"] = max(state["red_control"], 0.28)
        state["blue_control"] = min(state["blue_control"], 0.82)
        state["step_started"] = current_step
        state["steps_contested"] = max(1, state["steps_contested"])
        state["idle_timer"] = 0
        if state["phase"] == ContestPhase.IDLE:
            state["phase"] = ContestPhase.PROBING
        elif state["phase"] in (ContestPhase.BLUE_DEFENDED, ContestPhase.BLUE_RECAPTURED):
            state["phase"] = ContestPhase.CONTESTED

        if threat_type in {"data_exfiltration", "c2_beacon"}:
            env.compromised_hosts.add(target_node)
            env.red_position = target_node

        return self._make_event(target_node, state, current_step, env, {}, {})

    def compute_step(
        self,
        env: Any,
        red_meta: Dict[str, Any],
        blue_meta: Dict[str, Any],
        current_step: int,
    ) -> tuple[List[ContestEvent], List[NodeBattleResult]]:
        """Main entry point — call after env.step(). Returns contest events + battle results."""
        events: List[ContestEvent] = []
        results: List[NodeBattleResult] = []
        false_positive_result: NodeBattleResult | None = None

        red_target = red_meta.get("target_host_id", -1)
        red_action = red_meta.get("action_name", "wait")
        red_success = red_meta.get("success", False)
        blue_target = blue_meta.get("target_host_id", -1)
        blue_action = blue_meta.get("action_name", "monitor")
        blue_success = blue_meta.get("success", False)
        is_fp = blue_meta.get("is_false_positive", False)

        # --- SCRIPTED DEMO NARRATIVE ARC ---
        # The user requested a "toe-to-toe" battle where Blue ultimately wins at the end.
        progress = current_step / max(1, getattr(env, "max_steps", 50))
        
        if progress < 0.35:
            # Act 1: Red Edge (Attacker breaching initially)
            red_chance = 0.85
            blue_chance = 0.30
        elif progress < 0.70:
            # Act 2: Toe-to-Toe (Intense back and forth)
            red_chance = 0.60
            blue_chance = 0.60
        else:
            # Act 3: Blue Dominates (Defender wins at the end)
            red_chance = 0.15
            blue_chance = 0.90

        # Override raw successes with the narrative arc probabilities
        if red_action != "wait":
            red_success = random.random() < red_chance
        if blue_action != "monitor" and not is_fp:
            blue_success = random.random() < blue_chance

        # Update all nodes
        for host_id in range(self.num_hosts):
            state = self.node_states[host_id]
            prev_phase = state["phase"]

            # --- Red control updates ---
            if host_id == red_target and red_action != "wait":
                meta = _THREAT_META.get(red_action, _THREAT_META["scan"])
                state["last_threat"] = meta
                if red_success:
                    if red_action == "exploit":
                        state["red_control"] = min(1.0, state["red_control"] + 0.35)
                    elif red_action == "lateral_move":
                        state["red_control"] = min(1.0, state["red_control"] + 0.25)
                    elif red_action == "exfiltrate":
                        state["red_control"] = min(1.0, state["red_control"] + 0.30)
                    elif red_action == "beacon":
                        state["red_control"] = min(1.0, state["red_control"] + 0.10)
                    elif red_action == "scan":
                        state["red_control"] = min(1.0, state["red_control"] + 0.08)
                else:
                    state["red_control"] = min(1.0, state["red_control"] + 0.04)
            elif host_id in env.compromised_hosts:
                # Slow passive increase for compromised nodes
                state["red_control"] = min(1.0, state["red_control"] + 0.02)
            else:
                # Natural decay
                state["red_control"] = max(0.0, state["red_control"] - 0.03)

            # --- Blue control updates ---
            if host_id == blue_target and blue_action != "monitor":
                if blue_action == "isolate" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.45)
                    state["red_control"] = max(0.0, state["red_control"] - 0.50)
                elif blue_action == "patch" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.25)
                    state["red_control"] = max(0.0, state["red_control"] - 0.30)
                elif blue_action == "investigate" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.30)
                    state["red_control"] = max(0.0, state["red_control"] - 0.20)
                elif blue_action == "reset_credentials" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.35)
                    state["red_control"] = max(0.0, state["red_control"] - 0.35)
                elif blue_action == "block_ip" and blue_success:
                    state["blue_control"] = min(1.0, state["blue_control"] + 0.20)
                    state["red_control"] = max(0.0, state["red_control"] - 0.25)
                if is_fp:
                    state["blue_control"] = max(0.0, state["blue_control"] - 0.40)
                    state["red_control"] = max(0.0, state["red_control"] - 0.05)
                    if false_positive_result is None:
                        self.total_false_positives += 1
                        false_positive_result = self._make_false_positive_result(
                            host_id, blue_action, blue_meta.get("reason", ""), current_step
                        )
            elif host_id not in env.compromised_hosts:
                state["blue_control"] = min(1.0, state["blue_control"] + 0.02)
            else:
                state["blue_control"] = max(0.0, state["blue_control"] - 0.02)

            # --- Phase transitions ---
            rc = state["red_control"]
            bc = state["blue_control"]
            diff = rc - bc

            new_phase = prev_phase
            if rc < 0.1 and prev_phase not in (ContestPhase.BLUE_DEFENDED, ContestPhase.BLUE_RECAPTURED):
                state["idle_timer"] += 1
                if state["idle_timer"] >= 3:
                    new_phase = ContestPhase.IDLE
                    state["steps_contested"] = 0
            else:
                state["idle_timer"] = 0

            if prev_phase == ContestPhase.IDLE and rc >= 0.08:
                new_phase = ContestPhase.PROBING
                state["step_started"] = current_step
                state["steps_contested"] = 1
            elif prev_phase == ContestPhase.PROBING and rc >= 0.20:
                new_phase = ContestPhase.CONTESTED
                state["steps_contested"] += 1
            elif prev_phase in (ContestPhase.CONTESTED, ContestPhase.RED_WINNING, ContestPhase.BLUE_WINNING):
                state["steps_contested"] += 1
                if diff > 0.2:
                    new_phase = ContestPhase.RED_WINNING
                elif diff < -0.2:
                    new_phase = ContestPhase.BLUE_WINNING
                else:
                    new_phase = ContestPhase.CONTESTED

                # Check resolution
                if rc >= 0.85 and state["steps_contested"] >= 2 and new_phase == ContestPhase.RED_WINNING:
                    new_phase = ContestPhase.RED_CAPTURED
                    self.total_red_captures += 1
                    result = self._make_result(host_id, "red", "captured", state, current_step, env)
                    results.append(result)
                    self.battle_history.append(result)
                elif bc >= 0.80 and rc < 0.30 and new_phase == ContestPhase.BLUE_WINNING:
                    new_phase = ContestPhase.BLUE_DEFENDED
                    self.total_blue_defenses += 1
                    result = self._make_result(host_id, "blue", "defended", state, current_step, env)
                    results.append(result)
                    self.battle_history.append(result)
            elif prev_phase == ContestPhase.RED_CAPTURED:
                # Blue can launch recapture
                if host_id == blue_target and blue_action in ("isolate", "investigate", "reset_credentials") and blue_success:
                    state["steps_contested"] += 1
                    if bc >= 0.85 and rc < 0.55:
                        new_phase = ContestPhase.BLUE_RECAPTURED
                        self.total_blue_recaptures += 1
                        result = self._make_result(host_id, "blue", "recaptured", state, current_step, env)
                        results.append(result)
                        self.battle_history.append(result)
                        state["red_control"] = min(state["red_control"], 0.25)
                    else:
                        new_phase = ContestPhase.CONTESTED
            elif prev_phase in (ContestPhase.BLUE_DEFENDED, ContestPhase.BLUE_RECAPTURED):
                state["idle_timer"] += 1
                if state["idle_timer"] >= 3:
                    new_phase = ContestPhase.IDLE
                    state["red_control"] = 0.0
                    state["blue_control"] = 1.0
                    state["steps_contested"] = 0

            state["phase"] = new_phase

            # Only emit events for non-idle nodes
            if new_phase != ContestPhase.IDLE:
                event = self._make_event(host_id, state, current_step, env, red_meta, blue_meta)
                events.append(event)

        if false_positive_result is not None:
            results.append(false_positive_result)
            self.battle_history.append(false_positive_result)

        return events, results

    def get_scoreboard(self, env: Any) -> BattleScoreboard:
        red_controlled = sum(
            1 for s in self.node_states.values()
            if s["phase"] == ContestPhase.RED_CAPTURED
        )
        contested = sum(
            1 for s in self.node_states.values()
            if s["phase"] in (ContestPhase.CONTESTED, ContestPhase.RED_WINNING, ContestPhase.BLUE_WINNING, ContestPhase.PROBING)
        )
        blue_secured = self.num_hosts - red_controlled - contested

        # Progress: Red wants to exfil DB data, Blue wants to contain all threats
        red_progress = min(1.0, env.data_exfiltrated / 500.0 + len(env.compromised_hosts) / self.num_hosts * 0.5)
        blue_progress = min(1.0, len(env.detected_compromises) / max(1, len(env.compromised_hosts)) * 0.7 + len(env.isolated_hosts) / max(1, self.num_hosts) * 0.3)

        # Predict red next targets
        red_next = []
        for neighbor in sorted(
            range(self.num_hosts),
            key=lambda h: float(env.network.get_vulnerabilities(h)),
            reverse=True,
        ):
            if neighbor not in env.compromised_hosts and neighbor not in env.isolated_hosts:
                red_next.append(neighbor)
                if len(red_next) >= 3:
                    break

        return BattleScoreboard(
            red_nodes_controlled=red_controlled,
            blue_nodes_secured=blue_secured,
            contested_nodes=contested,
            red_total_captures=self.total_red_captures,
            blue_total_defenses=self.total_blue_defenses,
            blue_total_recaptures=self.total_blue_recaptures,
            false_positives_this_episode=self.total_false_positives,
            red_progress=round(red_progress, 3),
            blue_progress=round(blue_progress, 3),
            red_next_targets=red_next,
        )

    def _make_event(
        self,
        host_id: int,
        state: Dict[str, Any],
        step: int,
        env: Any,
        red_meta: Dict[str, Any],
        blue_meta: Dict[str, Any],
    ) -> ContestEvent:
        threat_meta = state.get("last_threat") or _THREAT_META["scan"]
        active_threat = threat_meta.get("threat")
        ht = _host_type(host_id)
        label = _host_label(host_id)
        rc = state["red_control"]
        severity = _severity_for(rc)

        vuln = float(env.network.get_vulnerabilities(host_id))
        data_val = float(env.network.get_data_value(host_id))

        # Generate targeting reason
        reasons = {
            "db_server": f"{label} holds {data_val:.0f} GB of sensitive data — highest-value target (CVSS impact: CRITICAL)",
            "dmz": f"{label} is the perimeter — unpatched system (vulnerability: {vuln:.0%}), primary entry vector",
            "app_server": f"{label} bridges DMZ and DB segments — optimal lateral movement pivot (vulnerability: {vuln:.0%})",
            "workstation": f"{label} has cached credentials — Red exploiting credential reuse (T1078)",
        }
        targeting_reason = reasons.get(ht, f"{label} targeted for strategic positioning")

        # Detection reason
        detection_reasons = {
            "brute_force": f"Failed auth attempts spiked {int(rc * 800 + 100)}% above baseline on {label}",
            "lateral_movement": f"Unusual process chain detected on {label} endpoint — T1021 signature match",
            "data_exfiltration": f"Outbound transfer to external IP: {data_val:.1f} GB in {max(1, state['steps_contested'])} steps (97th percentile)",
            "c2_beacon": f"Periodic beacon from {label} every 300s ±2s — C2 timing signature detected",
        }
        detection_reason = detection_reasons.get(active_threat or "brute_force", f"Anomalous activity on {label}")

        # Immediate action
        actions = {
            "brute_force": f"BLOCK failed auth sources on {label} — credential spray in progress",
            "lateral_movement": f"ISOLATE {label} — block lateral paths to DB segment immediately",
            "data_exfiltration": f"BLOCK outbound from {label} at perimeter — exfil in progress",
            "c2_beacon": f"TRACE beacon source from {label} — pivot host identification required",
        }
        immediate_action = actions.get(active_threat or "brute_force", f"Investigate {label}")

        # Layers
        has_network = rc > 0.1
        has_endpoint = rc > 0.25
        has_app = ht in ("app_server", "db_server") and rc > 0.4
        layers = {"network": has_network, "endpoint": has_endpoint, "application": has_app}
        active_count = sum(1 for v in layers.values() if v)
        corr_conf = min(1.0, active_count * 0.35 + rc * 0.1)
        cross_note = f"{active_count}/3 signal layers corroborate — {'high' if active_count >= 2 else 'partial'} confidence correlation"
        phase = state["phase"]
        if phase in {ContestPhase.RED_WINNING, ContestPhase.RED_CAPTURED}:
            winning_reason = (
                f"Red pressure is ahead on {label} because {targeting_reason.lower()} while Blue response remains behind the "
                f"current attack tempo."
            )
        elif phase in {ContestPhase.BLUE_WINNING, ContestPhase.BLUE_DEFENDED, ContestPhase.BLUE_RECAPTURED}:
            winning_reason = (
                f"Blue is controlling {label} because {detection_reason.lower()} and the recommended action path is already "
                f"constraining Red's options."
            )
        else:
            winning_reason = (
                f"{label} remains undecided: Red sees strategic value here, while Blue still has enough signal confidence to contest it."
            )

        return ContestEvent(
            node_id=host_id,
            node_label=label,
            node_type=ht,
            phase=state["phase"],
            red_control_pct=round(state["red_control"], 3),
            blue_control_pct=round(state["blue_control"], 3),
            active_threat_type=active_threat,
            mitre_id=threat_meta.get("mitre_id"),
            mitre_name=threat_meta.get("mitre_name"),
            severity=severity,
            red_targeting_reason=targeting_reason,
            detection_reason=detection_reason,
            immediate_action=immediate_action,
            layers_active=layers,
            correlation_confidence=round(corr_conf, 3),
            cross_layer_note=cross_note,
            contest_intensity=round(min(1.0, (rc + state["blue_control"]) / 2), 3),
            red_attack_vector=threat_meta.get("vector", "ssh_brute"),
            step_started=state["step_started"],
            steps_contested=state["steps_contested"],
            winning_reason=winning_reason,
        )

    def _make_result(
        self,
        host_id: int,
        winner: str,
        outcome: str,
        state: Dict[str, Any],
        step: int,
        env: Any,
    ) -> NodeBattleResult:
        label = _host_label(host_id)
        ht = _host_type(host_id)
        threat_meta = state.get("last_threat") or _THREAT_META["scan"]

        if winner == "red":
            summary = (
                f"Red Agent seized {label} ({ht.replace('_', ' ')}) via {threat_meta.get('mitre_name', 'exploit')} "
                f"over {state['steps_contested']} steps. Node is compromised."
            )
            impact = (
                f"{ht.replace('_', ' ').title()} segment now accessible. "
                f"{'Exfiltration risk: CRITICAL.' if ht == 'db_server' else 'Lateral paths expanded.'}"
            )
            victory_reason = (
                f"Red won {label} because the host's value and reachable attack path kept defender pressure below the compromise threshold."
            )
        else:
            summary = (
                f"Blue Agent {outcome} {label} — threat neutralized at step {step}. "
                f"{threat_meta.get('mitre_name', 'Attack')} contained after {state['steps_contested']} steps of contest."
            )
            impact = (
                f"{'Lateral movement path severed. Red must re-establish entry.' if outcome == 'recaptured' else 'Threat contained. Perimeter integrity maintained.'}"
            )
            victory_reason = (
                f"Blue won {label} because detection confidence stabilized early enough to spend the right containment action before Red completed the chain."
            )

        return NodeBattleResult(
            node_id=host_id,
            node_label=label,
            winner=winner,
            outcome=outcome,
            total_steps_fought=state["steps_contested"],
            incident_summary=summary,
            strategic_impact=impact,
            playbook_id=f"PB-BATTLE-{step:03d}-{host_id}",
            false_positive=False,
            step_resolved=step,
            victory_reason=victory_reason,
        )

    def _make_false_positive_result(
        self,
        host_id: int,
        blue_action: str,
        blue_reason: str,
        step: int,
    ) -> NodeBattleResult:
        label = _host_label(host_id)
        return NodeBattleResult(
            node_id=host_id,
            node_label=label,
            winner="blue",
            outcome="defended",
            total_steps_fought=0,
            incident_summary=(
                f"Blue Agent misclassified {label} during {blue_action.replace('_', ' ')}. "
                f"Benign admin activity resembled malicious behavior."
            ),
            strategic_impact="Autonomy budget was wasted on a clean host. Recommend tightening suppressions and allowlists.",
            playbook_id=f"PB-FP-{step:03d}-{host_id}",
            false_positive=True,
            false_positive_reason=blue_reason or "Legitimate administrative activity triggered the response path.",
            step_resolved=step,
            victory_reason="Blue appeared to win the action locally, but the response was wasted because the host was never actually compromised.",
        )
