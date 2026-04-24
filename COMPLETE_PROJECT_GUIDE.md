# Inari — Complete Technical Architecture Guide
## Hack Malenadu '26 | Every Line Explained

---
z
## 1. PROJECT OVERVIEW

**What is Inari?**
A real-time cybersecurity war room where two AI agents battle on a simulated network:
- **RED** — RL-trained attacker (PPO, 1M steps)
- **BLUE** — RL-trained defender (PPO, 1M steps)

**Unique Differentiator:**
Unlike traditional SIEMs that show logs after breaches, Inari shows attacks as they happen with:
1. Full explainability (why alerts fire)
2. Predictive attack graphs (what happens next)
3. Auto-generated response playbooks
4. **Kill Chain Oracle** — breach countdown using RL-derived probabilities
5. **Giskard AI Trust Scanner** — audits our own AI for bias

---

## 2. PROJECT STRUCTURE

```
/Abhi/Projects/Athernex/
├── src/
│   ├── components/
│   │   ├── ops/                    # Operational components
│   │   │   ├── AptAttribution.tsx  # APT similarity panel
│   │   │   ├── BreachCountdown.tsx # Kill chain countdown clock
│   │   │   ├── VelocitySparkline.tsx # Velocity history chart
│   │   │   ├── BattleScoreboard.tsx
│   │   │   ├── BattleTimeline.tsx
│   │   │   ├── ContestInfoPanel.tsx
│   │   │   └── ...
│   │   ├── layout/                 # Layout components
│   │   ├── marketing/              # Landing page sections
│   │   └── visualization/          # D3.js graphs
│   ├── pages/
│   │   ├── LivePage.tsx           # Main war room (/live)
│   │   ├── AttackGraphPage.tsx    # Counterfactual analysis
│   │   ├── PipelinePage.tsx       # 10-stage intelligence
│   │   ├── SimulationPage.tsx     # Agent duel view
│   │   ├── PlaybooksPage.tsx      # Auto-generated responses
│   │   ├── TrainingPage.tsx       # Agent learning curves
│   │   └── AuthPage.tsx           # Login
│   ├── store/
│   │   └── simulationStore.ts     # Zustand global state
│   ├── api/
│   │   └── client.ts              # Axios + WebSocket setup
│   ├── lib/
│   │   └── ops-types.ts           # TypeScript interfaces
│   ├── hooks/
│   │   └── useAppRouter.ts        # Router hook
│   └── index.css                  # Global styles
├── backend/
│   └── src/
│       └── pipeline/
│           ├── kill_chain_tracker.py   # NEW: Breach oracle
│           └── threat_dna.py           # NEW: APT attribution
├── public/
└── package.json
```

---

## 3. DATA ARCHITECTURE — How Everything Flows

### 3.1 The Simulation Loop (Backend)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PYTHON BACKEND (FastAPI)                                               │
│                                                                         │
│  1. CyberSecurityEnv (network_env.py)                                   │
│     ├── 20 hosts: DMZ, App Server, DB Server, Workstations, Internet   │
│     ├── Each host has: status (clean/compromised/isolated/detected)    │
│     └── Attack graph with edges (lateral movement paths)               │
│                                                                         │
│  2. RED AGENT (PPO model)                                               │
│     ├── Input: network observation vector                               │
│     ├── Policy: decides action probabilities                            │
│     └── Actions:                                                        │
│         ├── scan(host)         → Stage 1 (Reconnaissance)               │
│         ├── exploit(host)      → Stage 3 (Delivery) → Stage 4 (Exploit)  │
│         ├── lateral_move(host) → Stage 6 (C2 & Lateral)                │
│         └── exfiltrate(host)   → Stage 7 (Exfiltration)                │
│                                                                         │
│  3. BLUE AGENT (PPO model)                                              │
│     ├── Input: detection alerts + network state                         │
│     ├── Policy: decides response action                                 │
│     └── Actions:                                                        │
│         ├── monitor(host)      → Detect threats                         │
│         ├── isolate(host)      → Cut off compromised host               │
│         └── patch(host)        → Fix vulnerability                    │
│                                                                         │
│  4. STEP EXECUTION                                                      │
│     ├── Red decides action → updates network state                      │
│     ├── Blue observes → decides response                                │
│     ├── Detection pipeline generates alerts                             │
│     └── Rewards calculated for both agents                              │
│                                                                         │
│  5. KILL CHAIN ORACLE (NEW)                                             │
│     ├── Ingests Red actions → maps to Lockheed Martin 7-stage chain    │
│     ├── Calculates velocity (stages/step)                               │
│     ├── Estimates dwell time (how long attacker has been inside)        │
│     ├── Monte Carlo rollouts: "If Red continues, when does it breach?"  │
│     └── Outputs: breach_countdown_seconds, confidence, APT similarity   │
│                                                                         │
│  6. WEBSOCKET BROADCAST (step message)                                  │
│     └── Sends full state to frontend every step                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 WebSocket Message Format (StepMessage)

Every simulation step sends this payload:

```typescript
interface StepMessage {
  type: 'step';
  simulation_id: string;
  episode_id: string;
  step: number;                    // Current step (0-100)
  max_steps: number;
  phase: string;                   // 'recon' | 'attack' | 'lateral' | 'exfil'
  
  network: {
    nodes: PositionedNode[];     // 20 hosts with x,y positions for D3
    edges: NetworkEdge[];          // Connections between hosts
  };
  
  red_action: {                    // What Red just did
    action_name: 'scan' | 'exploit' | 'lateral_move' | 'exfiltrate' | 'beacon';
    target_host_id: number;
    target_host_label: string;
    success: boolean;
    reason?: string;
  };
  
  blue_action: {                   // What Blue just did
    action_name: 'monitor' | 'isolate' | 'patch' | 'investigate';
    target_host_id: number;
    target_host_label: string;
    success: boolean;
    is_false_positive: boolean;
  };
  
  red_reward: number;             // Points gained this step
  blue_reward: number;
  red_cumulative: number;          // Total points this episode
  blue_cumulative: number;
  
  new_alerts: ThreatAlert[];       // Fresh alerts this step
  
  pipeline: {                       // 10-stage intelligence
    shadow_branches: ShadowBranch[];  // "What if" predictions
    attack_graph: AttackGraphState;   // Critical paths to DB
    autonomy_budget: AutonomyBudgetState;  // Blue's action budget
    
    // NEW: Kill Chain Oracle
    kill_chain: {
      current_stage: number;           // 1-7
      current_stage_name: string;      // "C2 & Lateral Movement"
      velocity: number;                // stages per step
      velocity_label: string;          // "AGGRESSIVE"
      velocity_history: number[];      // For sparkline
      
      breach_countdown_seconds: number; // "04:32"
      breach_countdown_display: string;
      breach_confidence: number;        // 0.0-1.0
      urgency: 'low' | 'medium' | 'high' | 'critical';
      urgency_color: string;
      
      dwell_time_seconds: number;      // How long attacker inside
      kill_chain_progress: number;     // 0.0-1.0 (current/7)
    };
    
    apt_attribution: AptMatch[];     // APT similarity scores
  };
  
  // NEW: Agent decision transparency
  red_q_values: Record<string, {    // Per-node Red thoughts
    exploit: number;
    scan: number;
    lateral_move: number;
  }>;
  blue_policy_probs: Record<string, {  // Per-node Blue thoughts
    monitor: number;
    isolate: number;
    patch: number;
  }>;
}
```

---

## 4. FRONTEND STATE MANAGEMENT (Zustand)

### 4.1 simulationStore.ts — The Central Nervous System

```typescript
// Key state slices:
interface SimulationState {
  // Connection
  simulationId: string | null;
  isConnected: boolean;
  _socket: WebSocket | null;
  
  // Live data (from WebSocket)
  network: NetworkGraphState | null;
  step: number;
  alerts: ThreatAlert[];
  logs: TelemetryLog[];           // Agent actions + system events
  
  // Agent actions
  latestRedAction: AgentAction | null;
  latestBlueAction: AgentAction | null;
  redCumulative: number;
  blueCumulative: number;
  
  // NEW: Kill Chain Oracle
  killChain: KillChainState | null;
  aptAttribution: AptMatch[];
  
  // Agent thoughts (decision transparency)
  redQValues: Record<string, DecisionScores>;
  bluePolicyProbs: Record<string, DecisionScores>;
  
  // 10-stage pipeline
  pipeline: PipelineState | null;
  
  // Battle tracking
  contestEvents: ContestEvent[];
  battleResults: NodeBattleResult[];
  scoreboard: BattleScoreboard | null;
  
  // Static data (REST API)
  trainingMetrics: TrainingMetrics | null;
  agentsInfo: AgentsInfo | null;
  playbooks: Playbook[];
  giskardStatus: GiskardStatus | null;
  giskardReports: GiskardReport[];
  
  // Actions
  startSimulation: () => Promise<void>;
  generateStep: () => void;
  resetSimulation: () => void;
  triggerAttack: (nodeId, threatType) => Promise<void>;
  generatePlaybook: (alertId?) => Promise<Playbook | null>;
  loadTrainingMetrics: () => Promise<void>;
  loadAgentsInfo: () => Promise<void>;
  loadPlaybooks: () => Promise<void>;
  loadGiskardStatus: () => Promise<void>;
  loadGiskardReports: () => Promise<void>;
  runGiskardScan: (mode) => Promise<void>;
  uploadSIEMFeed: (file) => Promise<void>;
}
```

### 4.2 WebSocket Message Handler

```typescript
// When backend sends a message:
socket.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  
  if (payload.type === 'step') {
    // Update ALL reactive state
    set({
      network: payload.network,
      step: payload.step,
      alerts: merge(alerts, payload.new_alerts),
      killChain: payload.kill_chain,        // NEW
      aptAttribution: payload.apt_attribution,  // NEW
      redQValues: payload.red_q_values,
      bluePolicyProbs: payload.blue_policy_probs,
      // ... all other fields
    });
    
    // Build telemetry log entries
    logs.push({
      id: `red-${step}-${action}`,
      team: 'red',
      message: `${action} ${success ? 'landed on' : 'stalled at'} ${host}`,
      step: payload.step,
      tone: success ? 'critical' : 'warning',
    });
  }
};
```

---

## 5. THE 7 PAGES — Each Explained

### 5.1 /live (Live War Room)
**Purpose:** Main battlefield visualization

**Components:**
```
┌────────────────────────────────────────────────────────────────┐
│  CONNECTION BAR                                                │
│  ├── API URL input                                           │
│  └── Connect / Step / Reset buttons                          │
├────────────────────────────────────────────────────────────────┤
│  SIEM UPLOAD                                                 │
│  └── Upload real log files for simulation                    │
├────────────────────────────────────────────────────────────────┤
│  AGENT BATTLE SCOREBOARD                                     │
│  ├── Episode ID                                              │
│  ├── Step counter (X / 100)                                  │
│  └── Score tug: RED [|||||] vs [||||] BLUE                   │
├────────────────────────────────────────────────────────────────┤
│  KILL CHAIN ORACLE (NEW)                                     │
│  ├── BREACH COUNTDOWN CLOCK                                  │
│  │   ├── "⚠ ESTIMATED BREACH IN"                            │
│  │   ├── "04:32" (big glowing number)                        │
│  │   ├── "87% confidence • RL-derived"                      │
│  │   └── Kill chain progress bar (7 dots)                    │
│  ├── VELOCITY SPARKLINE                                      │
│  │   └── Area chart of stages/step over time                 │
│  └── APT ATTRIBUTION                                         │
│      ├── APT29 (Cozy Bear) ████████ 83%                     │
│      ├── APT28 (Fancy Bear) █████░░░ 62%                    │
│      └── "Patient, persistent. Known for long dwell times." │
├────────────────────────────────────────────────────────────────┤
│  NETWORK GRAPH (D3.js)                                       │
│  ├── 20 nodes positioned by force simulation                 │
│  ├── 🔴 Red skull = current attacker position                │
│  ├── 🟡 Yellow ring = detected/under investigation           │
│  ├── 🟢 Green = clean                                        │
│  └── 🔴 Red particles = attack traffic flowing             │
├────────────────────────────────────────────────────────────────┤
│  THREAT ALERT FEED                                           │
│  ├── Alert cards with severity + MITRE ID                  │
│  ├── "CRITICAL • T1204 • Malicious Email Attachment"          │
│  ├── Affected hosts chips                                    │
│  ├── Confidence bar                                          │
│  └── "Generate Playbook" button                              │
├────────────────────────────────────────────────────────────────┤
│  DECISION TRANSPARENCY                                       │
│  ├── Hover node → "What agents are considering"             │
│  ├── Red thoughts: exploit 85%, scan 10%, lateral 5%       │
│  ├── Blue thoughts: monitor 60%, isolate 30%, patch 10%      │
│  └── Click node → detailed contest panel                     │
├────────────────────────────────────────────────────────────────┤
│  ACTION LOGS                                                 │
│  ├── RED FEED                                                │
│  │   └── exploit landed on DMZ-01                          │
│  └── BLUE FEED                                               │
│      └── monitor executed for APP-03                       │
└────────────────────────────────────────────────────────────────┘
```

**Key Code Flow:**
```typescript
// LivePage.tsx
const {
  network,           // For D3 graph
  alerts,            // For threat feed
  killChain,         // NEW: Breach countdown
  aptAttribution,    // NEW: APT matching
  redQValues,        // For decision transparency
  bluePolicyProbs,
  latestRedAction,   // For action logs
  latestBlueAction,
} = useSimulationStore();

// Render:
<BreachCountdown {...killChain} />
<VelocitySparkline {...killChain} />
<AptAttribution matches={aptAttribution} />
<NetworkGraph nodes={network.nodes} edges={network.edges} />
<AlertFeed alerts={alerts} />
<ActionLog action={latestRedAction} />
<ActionLog action={latestBlueAction} />
```

---

### 5.2 /giskard (AI Trust Scanner)
**Purpose:** Audit our own AI for bias and vulnerabilities

**Key Features:**
- **Trust Score Gauge** — overall model health 0-100%
- **Vulnerability Breakdown** — 4 categories with progress bars
  - Performance Bias
  - False Positive Sensitivity
  - Robustness Failures
  - Mimicry Attack Detection
- **Scan History** — timestamped audit trail
- **Detected Issues** — specific findings with severity

**Why It Matters:** Most AI security tools are black boxes. Giskard makes Inari transparent and auditable.

---

### 5.3 /pipeline (10-Stage Intelligence)
**Purpose:** Show the automated threat processing pipeline

**Stages:**
1. Ingest → Raw logs from network
2. Decode → Parse and normalize
3. Shadow Exec. → Neural prediction of next moves
4. Enrich → Add context and threat intel
5. Score → Risk calculation
6. Cluster → Group related events
7. Triage → Prioritize alerts
8. Alert → Generate notifications
9. Recommend → Suggest actions
10. Act → Execute playbooks

**Visual:** 10 hexagonal nodes in a row with animated data pulses. Shadow branches show "what if" predictions below.

---

### 5.4 /attack-graph (Counterfactual Analysis)
**Purpose:** Show attack paths and predicted outcomes

**Visual:** Directed graph with:
- Nodes = hosts
- Edges = attack paths
- **Red edges** = Critical path to database
- **Right panel metrics:**
  - Time to DB Breach: 4m 32s
  - Data at Risk: 2.4 TB
  - Business Impact: $4.2M
  - Recommended Action: Isolate DB-01

---

### 5.5 /simulation (Agent Duel View)
**Purpose:** Side-by-side agent control room

**Shows:**
- Agent profile cards (win rates, algorithms, training episodes)
- Action distribution histograms (what each agent prefers)
- Duel log (step-by-step play-by-play)
- Episode replay mini-map

---

### 5.6 /playbooks (Response Library)
**Purpose:** Auto-generated incident response procedures

**Features:**
- List of generated playbooks
- MITRE ATT&CK technique mapping
- Step-by-step commands to run
- "Generate" button creates new playbook from current alert

---

### 5.7 /training (Agent Learning Curves)
**Purpose:** Show how agents were trained

**Charts:**
- Dual reward curves over 1M steps
- Win rate history
- Detection rate vs false positive rate
- Episode replay with network state

---

## 6. KEY FEATURES — Deep Implementation

### 6.1 Kill Chain Oracle (NEW)

**File:** `backend/src/pipeline/kill_chain_tracker.py`

**How It Works:**

```python
class KillChainTracker:
    def ingest_event(self, event, step):
        # 1. Map Red action to kill chain stage
        stage = EVENT_TO_STAGE[event['action_type']]  # 1-7
        
        # 2. Update velocity (stages per step)
        velocity = (current_stage - previous_stage) / steps_elapsed
        
        # 3. Estimate dwell time
        # "Attacker has been inside for X steps"
        dwell = current_step - first_detection_step
        
        # 4. PREDICT BREACH (the magic)
        if red_model is not None:
            # Monte Carlo: Run 50 simulations of Red from current state
            for rollout in range(50):
                steps_to_breach = simulate_until_exfiltration()
            
            # Average across rollouts
            mean_steps = np.mean(steps_to_breach)
            confidence = success_rate  # % of rollouts that breached
            
            # Convert to wall-clock time
            countdown_seconds = mean_steps * step_duration
        else:
            # Fallback: heuristic based on remaining stages
            remaining = 7 - current_stage
            countdown_seconds = remaining * average_steps_per_stage
        
        # 5. Threat DNA — behavioral fingerprint
        threat_dna = {
            'stage_distribution': {...},  # % time in each stage
            'action_distribution': {...}, # % each action type
            'velocity': velocity,
            'dwell': dwell,
        }
        
        # 6. APT Attribution — compare to known signatures
        apt_similarity = cosine_similarity(threat_dna, apt_signatures['APT29'])
        # Returns: APT29 83%, APT28 62%, Lazarus 45%, ...
```

**Frontend Display:**
```typescript
<BreachCountdown
  countdownDisplay="04:32"
  countdownSeconds={272}
  confidence={0.87}
  urgency="critical"        // Glowing red, pulsing border
  urgencyColor="#ff0044"
  currentStage={6}          // "C2 & Lateral Movement"
  currentStageName="C2 & Lateral Movement"
  killChainProgress={0.857}   // 6/7 stages
/>

<VelocitySparkline
  history={[0.1, 0.15, 0.3, 0.5, 0.6]}  // Getting faster
  label="AGGRESSIVE"
  color="#ff6600"
/>

<AptAttribution
  matches={[
    { name: "APT29 (Cozy Bear)", score: 0.83, flag: "🇷🇺", 
      risk_note: "Patient, persistent. Known for long dwell times." },
    { name: "APT28 (Fancy Bear)", score: 0.62, flag: "🇷🇺", ... },
  ]}
/>
```

**Judge Demo Line:**
> *"This number is not a rule. It's what our Red Agent learned after 1 million steps of attacking networks like this one. It's predicting its own success."*

---

### 6.2 Decision Transparency (Agent Thoughts)

**Purpose:** Show what the AI is "thinking" — the internal Q-values and policy probabilities that drive decisions.

**Data Flow:**
```
Backend (Red Agent PPO model)
  ├── Observation vector → Neural network
  ├── Network outputs Q-values for each action
  │   ├── exploit(host_3): 0.85
  │   ├── scan(host_3): 0.10
  │   └── lateral_move(host_3): 0.05
  └── Picks action with highest Q-value

WebSocket sends per-node Q-values:
red_q_values: {
  "3": { exploit: 0.85, scan: 0.10, lateral_move: 0.05 },
  "5": { exploit: 0.30, scan: 0.60, lateral_move: 0.10 }
}

Frontend renders as thought bubbles on hover
```

**Component:** `ContestInfoPanel.tsx`
```typescript
interface ContestInfoPanelProps {
  node: PositionedNode;
  redThoughts: DecisionScores;   // { exploit: 0.85, scan: 0.10 }
  blueThoughts: DecisionScores;    // { monitor: 0.60, isolate: 0.30 }
  contest: ContestEvent | null;
  battleResult: NodeBattleResult | null;
}

// Render:
<div className="thought-bubble red">
  <div>Red is considering:</div>
  <div>exploit ████████░░ 85%</div>
  <div>scan    ██░░░░░░░░ 10%</div>
</div>
```

---

### 6.3 Network Graph Visualization (D3.js)

**File:** `src/components/visualization/NetworkTopologyGraph.tsx`

**How It Works:**
```typescript
// 1. Setup D3 force simulation
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(edges).distance(100))
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(width/2, height/2));

// 2. Render nodes
const nodeGroups = svg.selectAll('.node')
  .data(nodes)
  .join('g')
  .attr('class', 'node');

// 3. Different shapes per node type
nodeGroups.each(function(d) {
  if (d.type === 'dmz') drawHexagon(this, d);
  if (d.type === 'database') drawCylinder(this, d);
  if (d.type === 'workstation') drawLaptop(this, d);
});

// 4. Status indicators
if (d.status === 'compromised') {
  addSkullIcon(node);           // 🔴 Red agent here
  addPulsingRedRing(node);
}
if (d.status === 'detected') {
  addYellowRing(node);          // 🟡 Blue detected
}

// 5. Animated traffic particles
edges.forEach(edge => {
  const particle = createParticle(edge);
  if (edge.traffic_type === 'attack') {
    particle.color = '#ff335f';  // Red
    particle.speed = 'fast';
  } else {
    particle.color = '#14d1ff';  // Cyan
    particle.speed = 'normal';
  }
  animateParticleAlongEdge(particle, edge);
});
```

---

### 6.4 Alert Feed & Playbook Generation

**Alert Structure:**
```typescript
interface ThreatAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  threat_type: 'brute_force' | 'lateral_movement' | 'data_exfiltration' | ...;
  mitre_id: string;              // e.g., "T1204"
  mitre_name: string;            // e.g., "User Execution"
  headline: string;              // Human-readable summary
  description: string;         // Technical details
  affected_host_ids: number[];
  affected_host_labels: string[];  // ["DMZ-01", "APP-03"]
  confidence: number;            // 0.0 - 1.0
  timestamp: number;           // Simulation step
  layer_breakdown: {            // Which detection layers fired
    endpoint: boolean;
    network: boolean;
    identity: boolean;
  };
  is_likely_false_positive: boolean;
  playbook_id?: string;        // Linked response procedure
}
```

**Playbook Generation:**
```typescript
// When user clicks "Generate Playbook"
const generatePlaybook = async (alertId: string) => {
  // 1. Call backend API
  const response = await apiClient.post('/api/playbooks/generate', {
    alert_id: alertId
  });
  
  // 2. Backend creates playbook based on:
  //    - Alert type (what happened)
  //    - Affected hosts (where)
  //    - Kill chain stage (how far along)
  //    - APT attribution (who might be behind it)
  
  // 3. Returns structured response procedure
  const playbook: Playbook = {
    id: 'PB-2026-04-17-001',
    name: 'Isolate Compromised DMZ Host',
    alert_id: alertId,
    steps: [
      { order: 1, action: 'Verify alert legitimacy', command: null },
      { order: 2, action: 'Block traffic to 10.0.1.15', command: 'iptables -A INPUT -s 10.0.1.15 -j DROP' },
      { order: 3, action: 'Capture memory dump', command: 'volatility -f /dev/mem > dump.bin' },
      { order: 4, action: 'Notify security team', command: null },
    ],
    mitre_mapping: ['T1204', 'TA0001'],
    estimated_time: '15 minutes',
    auto_generated: true,
  };
  
  // 4. Update store
  set({ playbooks: [playbook, ...state.playbooks] });
};
```

---

## 7. BACKEND API STRUCTURE

### 7.1 REST Endpoints

```python
# Simulation management
POST   /api/simulation/create          # Start new episode
POST   /api/simulation/reset            # Reset current episode
POST   /api/simulation/upload-siem      # Upload real log files

# Battle control
POST   /api/battle/trigger-attack       # Manually trigger attack
GET    /api/battle/scoreboard          # Current scores

# Agent info
GET    /api/agents/info                # Agent profiles
GET    /api/agents/training/metrics     # Learning curves

# Playbooks
GET    /api/playbooks                   # List all
POST   /api/playbooks/generate          # Auto-generate from alert

# Giskard AI Trust Scanner
GET    /api/giskard/status              # Scanner status
GET    /api/giskard/reports             # Available reports
POST   /api/giskard/scan/{mode}         # Run scan (red/blue)

# NEW: Kill Chain Oracle
GET    /api/kill-chain/{simulation_id}  # Current kill chain state
```

### 7.2 WebSocket Protocol

```javascript
// Connection
const socket = new WebSocket('ws://localhost:8001/ws/{simulation_id}');

// Client → Server commands
socket.send(JSON.stringify({ command: 'step' }));   // Advance one step
socket.send(JSON.stringify({ command: 'reset' }));  // Reset episode
socket.send(JSON.stringify({ command: 'auto' }));   // Toggle auto-play

// Server → Client messages
type: 'init'    // Initial state on connection
type: 'step'    // State update after each step
type: 'status'  // Info messages
type: 'error'   // Error messages
```

---

## 8. HOW TO RUN THE DEMO

### 8.1 Prerequisites
```bash
# Check Node.js version
node --version  # Need v18+

# Check Python (for backend)
python --version  # Need 3.9+
```

### 8.2 Frontend Only (Mock Mode)
```bash
cd /Abhi/Projects/Athernex
npm install
npm run dev

# Open browser: http://localhost:5173
# Click "Enter War Room"
# Login: any username/password (demo mode)
```

### 8.3 With Backend (Full Simulation)
```bash
# Terminal 1: Backend
cd /Abhi/Projects/Athernex/backend
pip install -r requirements.txt
python -m src.api.main

# Terminal 2: Frontend
cd /Abhi/Projects/Athernex
npm run dev

# Browser: http://localhost:5173
# Connect to: http://127.0.0.1:8001
```

### 8.4 Demo Script for Judges

**Minute 1: Hook (/live page)**
1. Show live battlefield with 20 network nodes
2. Click "Step" 2-3 times
3. Point to 🔴 Red skull moving across network
4. Point to alerts appearing in real-time

**Minute 2: The Problem (/attack-graph)**
1. Show critical path (red arrows to database)
2. Point to "Time to DB Breach: 4m 32s"
3. Point to "Business Impact: $4.2M"
4. Click "Generate Playbook"

**Minute 3: The Innovation (/giskard)**
1. Show Trust Score gauge
2. Explain: "We audit our own AI for bias"
3. Point to vulnerability categories
4. "Most AI security tools are black boxes. We make them transparent."

**Minute 4: The Prediction (Back to /live)**
1. Point to Kill Chain Oracle countdown
2. "This isn't a rule — it's our Red Agent predicting its own success"
3. Point to APT Attribution: "83% match to APT29 (Cozy Bear)"
4. "The group behind SolarWinds. Our system tells you that in real-time."

**Minute 5: Wrap Up**
1. Back to /live
2. Click through a few more steps
3. "Inari transforms security from reactive log analysis to predictive, explainable, AI-driven defense."

---

## 9. COMMON JUDGE QUESTIONS

**Q: "How is this different from Splunk/Elastic?"**
A: "Traditional SIEMs show logs after breaches. Inari shows attacks as they happen with AI prediction, full explainability, and auto-generated playbooks. Plus, we audit our own AI with Giskard — no SIEM does that."

**Q: "Is this connected to real networks?"**
A: "Currently a simulation with RL agents for safety and demo purposes. The architecture is designed to integrate with real SIEM feeds — the Giskard trust scanning works on any ML model."

**Q: "How do the AI agents work?"**
A: "Both trained via PPO self-play for 1M steps. Red learns to attack, Blue learns to defend. Blue has a limited action budget to prevent runaway automation."

**Q: "What's the Kill Chain Oracle?"**
A: "It maps Red's actions to the Lockheed Martin 7-stage kill chain, then uses Monte Carlo rollouts to estimate time-to-breach. It compares attack patterns to known APT signatures like APT29."

**Q: "What was the hardest part to build?"**
A: "Real-time synchronization between backend simulation state and frontend D3.js visualizations with sub-500ms update latency."

---

## 10. KEY FILES REFERENCE

| File | Purpose |
|------|---------|
| `src/store/simulationStore.ts` | Global state, WebSocket handler |
| `src/pages/LivePage.tsx` | Main war room UI |
| `src/lib/ops-types.ts` | TypeScript interfaces |
| `src/components/ops/BreachCountdown.tsx` | Kill chain countdown clock |
| `src/components/ops/AptAttribution.tsx` | APT similarity panel |
| `backend/src/pipeline/kill_chain_tracker.py` | Breach oracle logic |
| `backend/src/pipeline/threat_dna.py` | APT attribution formatter |

---

## 11. DEMO CHECKLIST

- [ ] Frontend starts without errors (`npm run dev`)
- [ ] Can login to war room
- [ ] Can connect to backend (or shows graceful "waiting" state)
- [ ] Clicking "Step" advances simulation
- [ ] Red skull moves on network graph
- [ ] Alerts appear in feed
- [ ] Kill Chain Oracle shows countdown
- [ ] APT Attribution shows similarity scores
- [ ] Can generate playbook from alert
- [ ] All 7 pages load without errors

---

**Your Secret Weapons:**
1. Real-time animations look professional
2. Kill Chain Oracle breach countdown is genuinely unique
3. APT attribution with nation-state flags is visually striking
4. Giskard AI auditing differentiates from all other tools

**Emergency Fallback:**
If backend fails, the frontend shows a clean "Waiting for simulation..." state with demo UI. You can still navigate all pages and show the interface design.

**The One Line to Remember:**
> *"Inari is a real-time red team vs. blue team simulator that makes AI-driven cybersecurity transparent, testable, and actionable — with full explainability and automated response generation."*
