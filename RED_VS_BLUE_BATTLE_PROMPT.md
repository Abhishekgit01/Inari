# RED vs BLUE — BATTLE VISUALIZATION PROMPT
## CyberGuardian AI | Hack Malenadu '26 | PS3: AI-Driven Threat Detection & Simulation Engine
## For: Any AI Coding Agent | Full Stack: Python FastAPI Backend + React/D3 Frontend

---

## THE CORE IDEA — READ THIS FIRST

Every node in the network is a **territory being fought over**. The Red Agent wants to own it (compromise it). The Blue Agent wants to protect it (detect + isolate it). When Red wins a node, it turns RED. When Blue successfully defends or recaptures it, it turns BLUE. When they are actively fighting over it RIGHT NOW, the node shows a **live conflict animation** — red and blue energy colliding on the node surface.

The human watching this must instantly understand:
- **Who controls what** — just by looking at node colors
- **Where the battle is happening right now** — the conflict animation
- **Why the attacker targeted that node** — shown on node click
- **What Blue is doing about it** — shown in real time
- **What to do next** — surfaced as an auto-generated playbook

This aligns directly with PS3's requirements:
- Multi-signal ingestion → each node logs network + endpoint + application signals
- 4 threat categories → each maps to a specific Red attack animation
- Explainability → "why it was flagged" shown on every contested node
- Playbooks → auto-generated when Blue defends or Red breaches
- Live SOC dashboard → this IS the dashboard

---

# PART 1 — BACKEND PROMPT

## What to add / extend in the Python backend

---

### 1.1 — Node Contest State Model

Add this to `src/environment/state_space.py` or a new `src/models/contest.py`:

```python
from pydantic import BaseModel
from typing import Optional, List, Dict
from enum import Enum

class ContestPhase(str, Enum):
    """The current battle phase on a specific node."""
    IDLE = "idle"               # No conflict. Node is clean.
    PROBING = "probing"         # Red is scanning/probing. Blue unaware.
    CONTESTED = "contested"     # ACTIVE FIGHT. Red attacking, Blue defending NOW.
    RED_WINNING = "red_winning" # Red has the upper hand this step.
    BLUE_WINNING = "blue_winning" # Blue is pushing Red back this step.
    RED_CAPTURED = "red_captured"  # Red won. Node is compromised. Blue failed.
    BLUE_DEFENDED = "blue_defended" # Blue won. Threat neutralized. Node clean.
    BLUE_RECAPTURED = "blue_recaptured" # Blue won BACK a previously Red node.

class ContestEvent(BaseModel):
    """Emitted every step for each node that has contest activity."""
    node_id: int
    node_label: str             # "DB-02", "DMZ-01"
    node_type: str              # "db_server", "dmz", "app_server", "workstation"
    
    phase: ContestPhase
    
    # Health bars — the visual fight progress
    red_control_pct: float      # 0.0–1.0 (how much Red has seized this node)
    blue_control_pct: float     # 0.0–1.0 (how much Blue has defended this node)
    # Note: these do NOT need to sum to 1.0. Both can be high = fierce contest.
    # red=0.9, blue=0.8 = Blue barely holding on. red=0.3, blue=0.9 = Blue dominant.
    
    # The threat happening RIGHT NOW on this node
    active_threat_type: Optional[str]   # "brute_force" | "lateral_movement" | "data_exfiltration" | "c2_beacon"
    mitre_id: Optional[str]             # "T1110", "T1021", "T1041", "T1071"
    mitre_name: Optional[str]           # "Brute Force", "Remote Services", etc.
    severity: str                       # "low" | "medium" | "high" | "critical"
    
    # WHY WAS THIS NODE TARGETED — this answers PS3 explainability requirement
    red_targeting_reason: str
    # Examples:
    # "DB-02 holds 340 GB of sensitive data — highest value target in network"
    # "DMZ-01 has an unpatched CVE-2024-1234 (CVSS 9.1) — easiest entry point"
    # "APP-03 is adjacent to DB segment — optimal lateral movement pivot"
    # "WS-07 has cached admin credentials — Red exploiting credential reuse"
    
    # WHY WAS THIS FLAGGED — answers PS3 explainability + SOC analyst requirement
    detection_reason: str
    # Examples:
    # "Failed SSH logins spiked 847% above baseline in last 60 seconds"
    # "Unusual process 'cmd.exe → net.exe → psexec.exe' detected on endpoint"
    # "Outbound transfer to 185.234.x.x: 12.4 GB in 3 minutes (97th percentile)"
    # "Periodic beacon to external IP every 300s ±2s — C2 timing signature"
    
    # WHAT TO DO NEXT — pre-generated from playbook engine
    immediate_action: str
    # Examples:
    # "ISOLATE DMZ-01 immediately — block all lateral paths to APP segment"
    # "RESET credentials on WS-07 — admin token window is 15 minutes"
    # "BLOCK outbound 185.234.x.x at perimeter — exfil in progress"
    # "TRACE beacon source — pivot host likely APP-02 (last 3-step path)"
    
    # Cross-layer correlation (PS3: correlate events across layers)
    layers_active: Dict[str, bool]   # {"network": True, "endpoint": True, "application": False}
    correlation_confidence: float    # 0.0–1.0. Higher if multiple layers agree.
    cross_layer_note: str
    # "Network burst + endpoint process anomaly confirm lateral movement (2/3 layers)"
    
    # Animation control for frontend
    contest_intensity: float         # 0.0–1.0 (drives particle speed + glow intensity)
    red_attack_vector: str           # "ssh_brute", "psexec", "dns_tunnel", "http_beacon"
    # Maps to specific animation on frontend
    
    step_started: int                # which step the contest began
    steps_contested: int             # how many steps it's been active


class NodeBattleResult(BaseModel):
    """Emitted when a contest RESOLVES (node captured or defended)."""
    node_id: int
    node_label: str
    winner: str                      # "red" | "blue"
    outcome: str                     # "captured" | "defended" | "recaptured"
    total_steps_fought: int
    
    # Final explanation for the SOC analyst — full post-incident summary
    incident_summary: str
    # "Red Agent exploited unpatched SSH on DMZ-01 (T1110) over 8 steps.
    #  Blue detected via cross-layer correlation (network + endpoint) at step 34.
    #  Blue isolated the host at step 36, severing the lateral path to APP segment.
    #  Playbook generated: CREDENTIAL_RESET + PATCH_DMZ."
    
    # What this win/loss means for the overall battle
    strategic_impact: str
    # Red win:  "DB segment now accessible via compromised DMZ-01. Exfil risk: CRITICAL."
    # Blue win: "Lateral movement path severed. Red must re-establish entry point."
    
    playbook_id: str                 # Reference to the auto-generated playbook
    false_positive: bool             # Was this a legitimate admin action?
    false_positive_reason: Optional[str]
```

---

### 1.2 — Contest Controller

Add `src/environment/contest_controller.py`:

```python
class ContestController:
    """
    Manages the per-node contest state machine.
    Called every step by network_env.py after both agents act.
    
    State machine transitions:
    
    IDLE → PROBING      : Red scans the node (low-confidence)
    PROBING → CONTESTED : Red launches active attack (exploit/lateral/exfil/beacon)
    CONTESTED → RED_WINNING  : Red's control_pct > Blue's by >0.2 this step
    CONTESTED → BLUE_WINNING : Blue's control_pct > Red's by >0.2 this step
    RED_WINNING → RED_CAPTURED  : Red control_pct >= 0.85 and sustained 2+ steps
    BLUE_WINNING → BLUE_DEFENDED: Blue control_pct >= 0.80 and red drops below 0.3
    RED_CAPTURED → CONTESTED    : Blue launches recapture (investigate + isolate)
    CONTESTED → BLUE_RECAPTURED : Blue control returns to 0.85+ from RED_CAPTURED
    BLUE_DEFENDED/RECAPTURED → IDLE : After 3 steps with no Red activity
    """
    
    def compute_red_control(
        self,
        node_id: int,
        red_action_target: int,
        red_action_success: bool,
        red_action_name: str,
        alert_scores: Dict[str, float],
        vulnerability_score: float,
    ) -> float:
        """
        Red control increases when:
        - Red successfully acts on this node this step (+0.3 for exploit, +0.2 for lateral)
        - Alert scores are HIGH but Blue hasn't responded (+0.1 per step of inaction)
        - Node has high vulnerability_score (+0.05 baseline)
        
        Red control decreases when:
        - Blue isolates this node (-0.5 immediate)
        - Blue patches this node (-0.3)
        - Blue investigates and detects (-0.2)
        - Time passes without Red action (-0.05 per step, natural decay)
        """
        ...
    
    def compute_blue_control(
        self,
        node_id: int,
        blue_action_target: int,
        blue_action_name: str,
        blue_action_success: bool,
        current_red_control: float,
        node_status: str,
    ) -> float:
        """
        Blue control increases when:
        - Blue investigates and confirms threat (+0.3)
        - Blue isolates the node (+0.4 immediate)
        - Blue patches the node (+0.25)
        - Cross-layer correlation fires on this node (+0.15 bonus)
        
        Blue control is REDUCED when:
        - False positive occurs (Blue isolates a clean node): blue_control -= 0.4
          → This is the "false positive penalty" — Blue wastes budget
        """
        ...
    
    def resolve_contest(self, node_id: int) -> Optional[NodeBattleResult]:
        """
        Check if this node's contest has reached a resolution condition.
        If yes, emit a NodeBattleResult and transition to terminal state.
        Called every step after control values are updated.
        """
        ...
    
    def generate_targeting_reason(self, node: NetworkNode, red_action: str) -> str:
        """Generate the WHY DID RED TARGET THIS explanation."""
        reasons = {
            "db_server": f"{node.label} holds {node.data_value_gb:.0f} GB of sensitive data — "
                         f"highest-value target in the network (CVSS impact: CRITICAL)",
            "dmz": f"{node.label} is the network perimeter — "
                   f"unpatched {node.patch_level} system, primary entry vector",
            "app_server": f"{node.label} bridges DMZ and DB segments — "
                          f"optimal lateral movement pivot (vulnerability: {node.vulnerability_score:.0%})",
            "workstation": f"{node.label} has cached admin credentials — "
                           f"Red exploiting credential reuse pattern (T1078)",
        }
        return reasons.get(node.type, f"{node.label} targeted for strategic positioning")
    
    def generate_detection_reason(
        self, threat_type: str, alert_scores: Dict, layers: Dict
    ) -> str:
        """Generate the WHY WAS THIS FLAGGED explanation (PS3 explainability)."""
        ...
    
    def generate_immediate_action(self, threat_type: str, node: NetworkNode) -> str:
        """Generate WHAT TO DO NOW (pre-playbook quick action)."""
        ...
```

---

### 1.3 — Extend the WebSocket StepMessage

In your `src/api/main.py` WebSocket handler, add `contest_events` to every StepMessage:

```python
class StepMessage(BaseModel):
    type: str = "step"
    step: int
    max_steps: int
    episode_id: str
    phase: str
    
    # --- existing fields ---
    network: NetworkGraphState
    red_action: AgentAction
    blue_action: AgentAction
    new_alerts: List[ThreatAlert]
    pipeline: PipelineState
    budget: AutonomyBudgetState
    
    # --- NEW: Battle contest events ---
    contest_events: List[ContestEvent]      # One per contested node this step
    battle_results: List[NodeBattleResult]  # Emitted when a node resolves (can be empty)
    
    # --- NEW: Battle scoreboard ---
    scoreboard: BattleScoreboard

class BattleScoreboard(BaseModel):
    red_nodes_controlled: int      # Currently compromised, Blue hasn't responded
    blue_nodes_secured: int        # Currently clean or isolated
    contested_nodes: int           # Currently in active fight
    red_total_captures: int        # All time this episode
    blue_total_defenses: int       # All time this episode
    blue_total_recaptures: int     # Blue won back a Red node
    false_positives_this_episode: int
    
    # Win condition progress
    red_progress: float            # 0.0–1.0 (how close Red is to winning: exfil DB data)
    blue_progress: float           # 0.0–1.0 (how close Blue is to winning: contain all threats)
    
    # Which nodes Red is currently targeting (for Red "next move" prediction)
    red_next_targets: List[int]    # From NSE shadow execution — Red's likely next moves
```

---

### 1.4 — New REST Endpoints

```python
# Get the full battle state (all nodes + their contest phases)
GET /api/battle/state/{sim_id}
→ Returns: {
    nodes: [{ node_id, label, phase, red_control_pct, blue_control_pct,
              active_threat_type, mitre_id, red_targeting_reason,
              detection_reason, immediate_action, contest_intensity }],
    scoreboard: BattleScoreboard
  }

# Get battle history — all NodeBattleResults in this episode
GET /api/battle/history/{sim_id}
→ Returns: {
    results: [NodeBattleResult],
    red_wins: int,
    blue_wins: int,
    total_false_positives: int
  }

# Force a node back into contest (for demo: manually trigger an attack for judges)
POST /api/battle/trigger-attack
Body: { sim_id: str, target_node: int, threat_type: str }
→ Forces Red to attack that node next step. Good for demo narration.
```

---

# PART 2 — FRONTEND PROMPT

## The Battle Visualization

---

## 2.1 — Design Direction

**Aesthetic:** Cyber-warfare command center. Think a real-time strategy game crossed with a SOC terminal — like watching StarCraft played on a network graph, but every unit action corresponds to real threat intelligence.

**The One Thing Judges Will Remember:** Nodes that turn red when captured and blue when defended, with particles of both colors visibly colliding on contested nodes. It must feel like you're watching a war unfold in real time.

---

## 2.2 — Node Visual States (complete specification)

Each network node is a **territory** with 7 possible visual states. These are driven by `ContestPhase` from the backend:

### STATE: IDLE (phase = "idle")
```
Shape: Hexagon (DMZ/DB) or Circle (App/WS)
Fill: var(--bg-surface) — dark, neutral
Border: 1px solid var(--border) — faint cyan
Icon: node type icon (Shield / Server / Database / Monitor)
Glow: none
Pulse: very faint, slow (1.5s, scale 1→1.02→1)
Label: node label below in --text-muted

CSS:
.node-idle {
  fill: #0d1628;
  stroke: rgba(0, 229, 255, 0.15);
  filter: none;
}
```

### STATE: PROBING (phase = "probing")
```
Red is scanning but Blue doesn't know yet.

Border: faint red, 1px, dashed, slowly rotating
Glow: very subtle red shadow (0 0 8px rgba(255,0,68,0.2))
Animation: dashed border rotates clockwise, 4s infinite
Icon: question mark appears in corner (Red is sniffing)
Label: no change (Blue doesn't know yet)

CSS:
@keyframes probe-rotate {
  to { stroke-dashoffset: -20; }
}
.node-probing {
  stroke: #ff0044;
  stroke-dasharray: 4 4;
  animation: probe-rotate 2s linear infinite;
  filter: drop-shadow(0 0 8px rgba(255,0,68,0.2));
}
```

### STATE: CONTESTED — THE CENTREPIECE ANIMATION
```
This is the most important state. Red and Blue are ACTIVELY FIGHTING.

The node becomes a battleground:

1. SPLIT FILL — the node fill is a conic gradient that dynamically updates:
   → red_control_pct drives how much of the node is red
   → blue_control_pct drives how much is blue
   → Example: red=0.7, blue=0.4 → conic-gradient(
       #ff0044 0% 252deg,    ← 70% of 360° = red
       #00e5ff 252deg 396deg ← 40% of 360° (overlapping = very contested)
       #0d1628 396deg 360deg  ← grey = no-man's land
     )
   
   NOTE: Because both can exceed 1.0 combined, the overlap zone is the 
   "no-man's land" being fought over. Animate the degree values with
   d3.interpolate when new contest_event arrives.

2. COLLISION PARTICLES — particles of BOTH colors spawn from opposite sides:
   → Red particles come from the direction of Red's last position
   → Blue particles come from the center (Blue is defending)
   → Particles collide and "explode" in the center of the node
   → Collision = brief white flash (opacity 0→1→0, 100ms)
   → Particle count = contest_intensity × 10 (max 10 per color)

3. HEALTH BARS — two thin arcs on the outside of the node:
   → Outer arc = Blue defense (cyan, fills clockwise)
   → Inner arc = Red offense (red, fills counterclockwise)
   → Arc animates smoothly when values change

4. CROSSED SWORDS ICON — replaces the normal icon:
   → SVG crossed swords (⚔) centered on the node
   → Rotates slowly (10s infinite)
   → Color: alternates between red and cyan every 500ms

5. SHOCKWAVE — periodic expanding ring from center:
   → Every 1.5s: a ring expands from the node and fades
   → Color alternates: red ring, then blue ring
   → opacity 0.8 → 0, scale 1 → 2.5

6. CONTEST LABEL — floating above the node:
   → "⚔ CONTESTED" in amber, Orbitron font
   → Blinks slowly

CSS + SVG approach:
<g class="node-contested" data-node-id="7">
  <!-- Background fill via conic-gradient SVG foreignObject or radial fill -->
  <circle class="node-body" /> <!-- conic fill via JS update -->
  
  <!-- Outer blue defense arc -->
  <circle class="defense-arc" stroke="#00e5ff" stroke-dasharray="..." />
  
  <!-- Inner red offense arc -->  
  <circle class="offense-arc" stroke="#ff0044" stroke-dasharray="..." />
  
  <!-- Shockwave rings -->
  <circle class="shockwave red-wave" />
  <circle class="shockwave blue-wave" />
  
  <!-- Icon: crossed swords -->
  <text class="contest-icon">⚔</text>
  
  <!-- Label -->
  <text class="contest-label">CONTESTED</text>
</g>
```

### STATE: RED_WINNING (phase = "red_winning")
```
Red is dominating. Node is mostly red. Blue is losing ground.

Fill: 70% red, 30% dark (conic)
Border: thick red, pulsing (1.5s)
Glow: heavy red drop-shadow (0 0 20px #ff0044, 0 0 40px rgba(255,0,68,0.4))
Red particles: streaming IN to the node (Red advancing)
Blue particles: fading, sparse (Blue retreating)
Label: "⚠ LOSING" in red above node
Icon: skull beginning to appear (opacity 0→0.5, transition over 3 steps)
```

### STATE: BLUE_WINNING (phase = "blue_winning")
```
Blue is pushing Red back. Cyan energy overwhelming red.

Fill: 70% cyan, 30% dark
Border: thick cyan, pulsing
Glow: heavy cyan drop-shadow
Blue particles: streaming, dense, circling the node
Red particles: fading (Red retreating)
Label: "🛡 DEFENDING" in cyan
Icon: shield appearing (opacity 0→0.5)
```

### STATE: RED_CAPTURED (phase = "red_captured")
```
Red won. This node is now compromised.
The node "falls" — plays a capture animation then settles.

CAPTURE ANIMATION (one-time, 600ms):
  1. Node flashes bright white (opacity 1, 50ms)
  2. Red energy wave expands from center (scale 1→3, opacity 1→0, 300ms)
  3. Red skull materializes (opacity 0→1, 200ms)
  4. Red particles stream OUTWARD from node (Red now using this as a base)

Settled state:
Fill: deep red (#1a0008) with red border (#ff0044)
Glow: constant heavy red glow, pulsing slowly
Icon: SKULL (☠) in red — permanent
Particle streams: red particles flow OUT toward Red's next targets
Label: "☠ COMPROMISED" in red, not blinking (permanent)
Edge: all edges from this node turn red, thick, with red particles

When Red is HERE (is_red_current_position = true):
  → Outer rotating RED RING (2px, fast rotation, 1s)
  → Small red agent icon (skull with dot) orbits the node
```

### STATE: BLUE_DEFENDED (phase = "blue_defended")
```
Blue won. Node was protected. The node "saves" — plays a defense animation then settles.

DEFENSE ANIMATION (one-time, 600ms):
  1. Blue shield expands from center (scale 1→2.5, opacity 1→0, 400ms)
  2. Node border turns solid bright cyan
  3. Shield icon materializes inside

Settled state:
Fill: var(--bg-surface) with bright cyan border
Glow: clean cyan glow (softer than normal — calm)
Icon: SHIELD (🛡) — shows Blue defended
Particles: brief blue sparkle, then fades to idle
Label: "✓ SECURED" in cyan, fades after 3 seconds, then returns to normal label
```

### STATE: BLUE_RECAPTURED (phase = "blue_recaptured")
```
Blue won BACK a node that was Red. Most dramatic animation.

RECAPTURE ANIMATION (one-time, 900ms):
  1. Red fill bleeds out from the node edges inward (keyframe: red→transparent)
  2. Blue energy floods in from the center outward
  3. Brief explosion of both colors at the midpoint (white flash)
  4. Node settles to BLUE_DEFENDED state but with a special "RECAPTURED" badge

Special badge: "♻ RECAPTURED" in bright cyan, shows for 5 seconds then fades
Strategic impact text appears below node for 5 seconds:
  "[Red's] lateral path severed. DB segment protected."
```

---

## 2.3 — The Contest Info Panel (hover/click on any contested node)

When a node is in any contested/captured/defended state, clicking it shows a floating panel. This directly addresses PS3's explainability requirement.

```
┌─────────────────────────────────────────────────────┐
│  ⚔  DB-02  ·  DB SERVER                  [✕]       │
│  Phase: CONTESTED  ·  CRITICAL  ·  Step 47/100      │
├─────────────────────────────────────────────────────┤
│  BATTLE PROGRESS                                     │
│  🔴 Red Control    [████████░░] 82%                  │
│  🔵 Blue Defense   [█████░░░░░] 51%                  │
│  No-man's land: 33% — fierce contest                 │
│  Contest started: Step 39 (8 steps ago)              │
├─────────────────────────────────────────────────────┤
│  THREAT: LATERAL MOVEMENT [T1021 Remote Services]   │
│  Confidence: ████████░░ 78%                          │
│  Layers: ■ Network  ■ Endpoint  □ Application        │
│  Cross-layer: "Network burst + endpoint anomaly      │
│               confirm lateral movement (2/3 layers)" │
├─────────────────────────────────────────────────────┤
│  🔴 WHY RED TARGETED THIS NODE                       │
│  "DB-02 holds 340 GB of sensitive data — highest-    │
│   value target in network (exfil reward: CRITICAL).  │
│   Adjacent to already-compromised APP-03 — Red has   │
│   a clear lateral path with no Blue blocking."       │
├─────────────────────────────────────────────────────┤
│  👁 WHY THIS WAS FLAGGED                             │
│  "Unusual process chain on DB-02 endpoint:           │
│   cmd.exe → net.exe → psexec.exe (T1021 signature). │
│   Simultaneous network spike: +340% from baseline.   │
│   Cross-layer match triggered at confidence 0.78."   │
├─────────────────────────────────────────────────────┤
│  ⚡ WHAT TO DO RIGHT NOW                             │
│  "ISOLATE DB-02 immediately — block all connections  │
│   from APP-03. Red is 2 steps from exfiltration.    │
│   Autonomy cost: 2.0 pts (you have 8.5 remaining)." │
│                                                      │
│  [🔒 ISOLATE NOW]  [🩹 PATCH]  [📋 FULL PLAYBOOK]   │
├─────────────────────────────────────────────────────┤
│  MITRE ATT&CK: T1021 Remote Services                 │
│  Tactic: Lateral Movement                            │
│  Sub-technique: T1021.002 SMB/Windows Admin Shares  │
│  [View in MITRE Navigator →]                        │
└─────────────────────────────────────────────────────┘

Appearance: Framer Motion — slide in from cursor position (300ms spring)
Background: var(--bg-glass) with backdrop-filter blur(16px)
Border: 1px solid var(--border-active) + left border 4px threat-color
Max-width: 380px, auto-height
Z-index: 1000, above all graph elements
```

---

## 2.4 — Battle Scoreboard (always visible, top of page)

Replaces or extends the current top status bar:

```
┌────────────────────────────────────────────────────────────────────────┐
│  CYBERGUARDIAN AI        ──────── EPISODE 003 · STEP 047/100 ────────  │
│                                                                        │
│  ☠ RED CAPTURED: 3      ⚔ CONTESTED: 2      🛡 BLUE SECURED: 15       │
│  ─────────────────────────────────────────────────────────────────     │
│  RED PROGRESS  [████░░░░░░░░░░] 32%  ←  closing on DB segment         │
│  BLUE PROGRESS [████████░░░░░░] 64%  ←  3 threats contained           │
│                                                                        │
│  FALSE POSITIVES THIS EPISODE: 1  (admin backup at step 18)           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2.5 — Battle Result Toast Notifications

When `battle_results` array in StepMessage is non-empty, show a dramatic toast:

### Red Capture Toast (node falls to Red)
```
┌───────────────────────────────────────────────────┐
│  ☠ NODE CAPTURED — DB-02                          │
│  Red Agent seized the database server at step 47  │
│  Lateral movement T1021 successful over 8 steps   │
│  ─────────────────────────────────────────────── │
│  IMPACT: DB segment now exposed. Exfil risk: CRITICAL │
│  Red progress +15% — 1 step from data exfiltration │
│  ─────────────────────────────────────────────── │
│  [📋 GENERATE EMERGENCY PLAYBOOK]                 │
└───────────────────────────────────────────────────┘

Entry: slides in from top-right, red background (#1a0008), red border
Auto-dismiss: 8 seconds
Plays a "alert" sound (Web Audio API — short buzz/alarm)
```

### Blue Defense Toast (node saved)
```
┌───────────────────────────────────────────────────┐
│  🛡 NODE DEFENDED — DMZ-01                        │
│  Blue Agent blocked brute force at step 31        │
│  T1110 detected via cross-layer correlation       │
│  ─────────────────────────────────────────────── │
│  Blue progress +8% — DMZ perimeter secured        │
│  Playbook: CRED_RESET + PATCH_DMZ generated       │
└───────────────────────────────────────────────────┘

Entry: slides in from top-right, cyan background (#001a1f), cyan border
Auto-dismiss: 5 seconds
Plays a "success" sound (short positive chime)
```

### False Positive Toast (Blue isolated a clean node)
```
┌───────────────────────────────────────────────────┐
│  ⚠ FALSE POSITIVE — WS-12                        │
│  Blue isolated a clean workstation (step 18)      │
│  Admin bulk file transfer mistaken for exfiltration│
│  ─────────────────────────────────────────────── │
│  Autonomy budget wasted: -2.0 pts                 │
│  Recommendation: Whitelist known admin IPs         │
└───────────────────────────────────────────────────┘

Entry: slides in from top-right, amber background (#1a1200), amber border
Amber border dashed (distinguishes from real threats)
Auto-dismiss: 6 seconds
```

---

## 2.6 — Edge Animations During Battle

Edges are not static — they show the flow of the attack:

```typescript
// When Red is actively attacking along an edge (source → target):
// Edge becomes a "laser attack beam":
//   stroke: #ff0044, strokeWidth: 3
//   filter: drop-shadow(0 0 6px #ff0044)
//   Animated red particles racing from source to target at high speed
//   particle_count = 5 (maximum density)
//   particle_speed = 2.0 (fast)

// When Blue isolates a node — all its edges "break":
//   stroke: #3d5570 (dim gray)
//   strokeDasharray: "4 8" (broken/disconnected look)
//   All particles stop immediately
//   Brief "snap" animation: edge shakes (translateX ±3px, 150ms × 3)

// When Blue recaptures — edges return to clean state:
//   Transition: gray → cyan over 500ms
//   Cyan "cleanse" particle travels along each edge (left to right, once)
//   strokeDasharray → solid

// The edge connecting Red's last two positions (the attack path):
//   A persistent glowing red trail
//   Each hop: red arrow + step label ("→ Step 31", "→ Step 39")
//   Acts as a "breadcrumb trail" of Red's route through the network
```

---

## 2.7 — The Mini Battle Timeline (bottom bar extension)

Extend the existing step scrubber with a battle timeline:

```
[◀◀ RESET]  [◀]  [▶ STEP]  [▶▶ AUTO]  [PAUSE]

Step: ━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━ 47/100

Battle Events (icons on the scrubber):
  ☠ at step 12 — Red captured DMZ-01
  🛡 at step 23 — Blue defended APP-03
  ⚠ at step 18 — False positive (WS-12)
  ⚔ at step 39 — Contest started on DB-02 (ongoing →)
  ☠ at step 47 — Red captured DB-02 (JUST NOW)

Each icon is clickable — jumps to that step in replay mode.
Red events: red icon below the scrubber bar
Blue events: cyan icon above the scrubber bar
False positive: amber icon above
```

---

## 2.8 — Implementation: Key Components

### `ContestNode.tsx` (D3 + React, the core visual component)

```typescript
interface ContestNodeProps {
  node: NetworkNode;
  contest: ContestEvent | null;   // null if idle
  isRedHere: boolean;
  isBlueInvestigating: boolean;
  onClick: (node: NetworkNode) => void;
}

// This component owns ALL the per-node visual state.
// Uses D3 for SVG rendering, Framer Motion for the panel,
// and Web Animations API for the particle system.

// Key sub-components:
// <NodeBody />         — the hexagon/circle with fill state
// <DefenseArc />       — outer cyan arc (blue_control_pct)
// <OffenseArc />       — inner red arc (red_control_pct)
// <ContestParticles /> — collision particle system (Canvas 2D overlay)
// <ShockwaveRings />   — SVG expanding rings
// <StatusIcon />       — skull / shield / crossed-swords / normal icon
// <StatusLabel />      — floating text label above node
// <BattleResultFlash /> — one-time capture/defense animation
```

### `ContestInfoPanel.tsx` (the click-to-explain panel)

```typescript
// Floating panel that appears next to clicked node.
// Must show ALL of: why targeted, why flagged, what to do, MITRE.
// Action buttons call: POST /api/simulation/{id}/step with blue override action.
// Panel uses Framer Motion layoutId for smooth shared-element transition.
```

### `BattleScoreboard.tsx` (top bar component)

```typescript
// Shows: Red captures, Contested nodes, Blue secured, Red/Blue progress bars.
// Uses react-spring for animated number counting.
// Progress bars animate on every step update.
```

### `BattleToast.tsx` + `ToastManager.tsx`

```typescript
// Toast notifications for capture/defense/false-positive events.
// Uses battle_results from StepMessage to trigger toasts.
// Stacks up to 3 toasts, oldest auto-dismisses.
// Uses Web Audio API for sound effects (optional — mute toggle in top bar).
```

### `BattleTimeline.tsx` (scrubber extension)

```typescript
// Extends the existing step scrubber.
// Plots battle event markers on the timeline bar.
// Hover on a marker: tooltip shows event summary.
// Click: jump to that step in replay.
```

---

## 2.9 — Zustand Store Extension

```typescript
// src/store/simStore.ts — add these to existing store:

interface SimStore {
  // existing fields...
  
  // NEW: battle state
  contestEvents: Map<number, ContestEvent>;     // node_id → latest ContestEvent
  battleResults: NodeBattleResult[];            // all resolved battles this episode
  scoreboard: BattleScoreboard | null;
  activeToasts: BattleToast[];
  
  // NEW: actions
  updateContest: (events: ContestEvent[]) => void;
  addBattleResult: (result: NodeBattleResult) => void;
  updateScoreboard: (board: BattleScoreboard) => void;
  addToast: (toast: BattleToast) => void;
  dismissToast: (id: string) => void;
}

// When a StepMessage arrives:
// 1. updateStep(msg)         → updates network, agents, alerts, pipeline, budget
// 2. updateContest(msg.contest_events) → triggers all ContestNode re-renders
// 3. msg.battle_results.forEach(r => addBattleResult(r) + addToast(r)) 
// 4. updateScoreboard(msg.scoreboard)
```

---

## 2.10 — Particle System (Canvas overlay for performance)

The collision particles on contested nodes need to be rendered on a Canvas overlay, not SVG, for performance (SVG particles above ~50 elements lag badly):

```typescript
// src/components/BattleParticleCanvas.tsx

// A single <canvas> element positioned absolute, covering the entire graph area.
// z-index above the SVG graph but below the info panels.
// Uses requestAnimationFrame for the animation loop.

// Particle system:
interface Particle {
  x: number; y: number;       // current position
  vx: number; vy: number;     // velocity
  color: string;              // red or cyan
  opacity: number;
  radius: number;
  life: number;               // 0.0–1.0, decrements each frame
}

// For each contested node:
//   Every frame: spawn new red particles from Red's entry direction
//                spawn new blue particles from node center outward
//   Particles move, fade, and "collide":
//     When a red particle comes within 3px of a blue particle:
//       Both particles die
//       Spawn a white "collision flash" particle at that point

// Particle count = contest_intensity × 10 per color per frame budget
// Performance target: 60fps with up to 5 contested nodes simultaneously
```

---

## 2.11 — Sound Design (optional but impactful for demo)

```typescript
// src/hooks/useBattleAudio.ts
// Web Audio API — no external library needed.

// Sound events:
// "capture"   — low impact boom + red noise (when Red captures a node)
// "defend"    — bright high chime (when Blue defends)
// "contest"   — continuous low-frequency hum while any node is contested
//               intensity increases with contest_intensity value
// "false_pos" — warning beep (amber, when false positive fires)
// "critical"  — alarm (when Red progress > 80%)

// Master mute button in top bar.
// Sounds are synthesized via OscillatorNode (no audio files needed).
```

---

## 2.12 — PS3 Alignment Checklist

Every requirement from the problem statement must be visibly demonstrated:

| PS3 Requirement | Where It's Shown |
|---|---|
| Multi-signal ingestion (network + endpoint + application) | Layer breakdown in ContestInfoPanel → "Layers: ■ Network ■ Endpoint □ App" |
| Brute force detection | Node shows CONTESTED with red_attack_vector="ssh_brute", particles burst pattern |
| Lateral movement detection | Orange dashed edges between pivot nodes, T1021 shown in panel |
| Data exfiltration | Red thick edge toward INTERNET node, INTERNET node glows red |
| C2 beaconing | Rhythmic amber pulse on beacon edges (heartbeat pattern, every 5s) |
| Confidence scores | ContestInfoPanel: "Confidence: ████████░░ 78%" |
| Severity levels | Node border thickness = severity (critical: 4px, high: 3px, medium: 2px, low: 1px) |
| Cross-layer correlation | Panel shows which layers flagged it, elevated confidence if 2+ layers |
| MITRE ATT&CK mapping | Every contested node panel shows MITRE ID + tactic + sub-technique |
| Explainability (WHY flagged) | "WHY THIS WAS FLAGGED" section in ContestInfoPanel |
| Explainability (WHY targeted) | "WHY RED TARGETED THIS NODE" section in ContestInfoPanel |
| False positive indicator | Amber dashed border + "⚠ POSSIBLE FALSE POSITIVE" badge on alert card + amber toast |
| Dynamic playbooks | [📋 FULL PLAYBOOK] button in ContestInfoPanel → navigates to /playbooks |
| Live SOC dashboard | The entire /live page IS the live SOC dashboard |
| Threat simulation mode | The Red vs Blue self-play IS the simulation mode |
| Self-validation | Giskard trust score visible in top bar — AI testing itself |

---

## 2.13 — Demo Flow (5 minutes with judges)

```
[0:00–0:30] — HOOK
Show the /live page with the medium scenario (lateral + C2 combo) running.
"Watch this network. Red agent is probing the DMZ right now."
[Point to probing animation on DMZ-01]

[0:30–1:30] — FIRST FIGHT
"Red just launched an exploit. See this node? Red and Blue are fighting for it."
[Click the contested node — show the ContestInfoPanel]
"Here's why Red targeted it. Here's why we flagged it. Here's what to do right now."
[Read out the three WHY/WHAT sections]

[1:30–2:30] — CAPTURE OR DEFENSE
"Red wins this one. Node turns red — compromised. Watch the attack path appear."
[Or if Blue wins: "Blue pushed Red back. Node secured. Shield animation."]
"Playbook auto-generated. One click — MITRE-mapped response steps."

[2:30–3:30] — FALSE POSITIVE
"At step 18, Blue flagged a workstation. But look — amber dashed border, not red.
That's our false positive indicator. The admin was doing a bulk backup.
Our cross-layer check: network flagged it, but endpoint was clean. No confirmation.
Blue stood down. No wasted isolation. Correct call."

[3:30–4:30] — PIPELINE + GISKARD
"Behind every node fight: a 10-stage predictive pipeline.
Stage 5 — Neural Shadow Execution — told us Red would target DB-02 3 steps ago.
And here — Giskard trust score: 78%. Our own AI tested itself for mimicry attacks.
It found a weakness. We're showing it to you because explainability means honesty."

[4:30–5:00] — CLOSE
"Every node is a territory. Every threat is explained. Every response is guided.
CyberGuardian AI — not just detecting threats. Showing you the war."
```

---

*Build Prompt Version: 2.0 — Red vs Blue Battle Edition*
*Project: CyberGuardian AI | Hack Malenadu '26 | PS3 Alignment: Full*
*Backend: Python + FastAPI + Gymnasium + SB3*
*Frontend: React 18 + TypeScript + D3.js v7 + Framer Motion + Canvas 2D*
