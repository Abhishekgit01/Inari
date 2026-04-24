"""Contest state models for the Red vs Blue battle visualization."""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel


class ContestPhase(str, Enum):
    IDLE = "idle"
    PROBING = "probing"
    CONTESTED = "contested"
    RED_WINNING = "red_winning"
    BLUE_WINNING = "blue_winning"
    RED_CAPTURED = "red_captured"
    BLUE_DEFENDED = "blue_defended"
    BLUE_RECAPTURED = "blue_recaptured"


class ContestEvent(BaseModel):
    node_id: int
    node_label: str
    node_type: str
    phase: ContestPhase
    red_control_pct: float
    blue_control_pct: float
    active_threat_type: Optional[str] = None
    mitre_id: Optional[str] = None
    mitre_name: Optional[str] = None
    severity: str = "medium"
    red_targeting_reason: str = ""
    detection_reason: str = ""
    immediate_action: str = ""
    layers_active: Dict[str, bool] = {"network": False, "endpoint": False, "application": False}
    correlation_confidence: float = 0.0
    cross_layer_note: str = ""
    contest_intensity: float = 0.0
    red_attack_vector: str = "ssh_brute"
    step_started: int = 0
    steps_contested: int = 0
    winning_reason: str = ""


class NodeBattleResult(BaseModel):
    node_id: int
    node_label: str
    winner: str
    outcome: str
    total_steps_fought: int
    incident_summary: str = ""
    strategic_impact: str = ""
    playbook_id: str = ""
    false_positive: bool = False
    false_positive_reason: Optional[str] = None
    step_resolved: int = 0
    victory_reason: str = ""


class BattleScoreboard(BaseModel):
    red_nodes_controlled: int = 0
    blue_nodes_secured: int = 0
    contested_nodes: int = 0
    red_total_captures: int = 0
    blue_total_defenses: int = 0
    blue_total_recaptures: int = 0
    false_positives_this_episode: int = 0
    red_progress: float = 0.0
    blue_progress: float = 0.0
    red_next_targets: List[int] = []
