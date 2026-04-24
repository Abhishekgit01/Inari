# CyberGuardian AI - Complete Codebase Context

## Project Overview

**CyberGuardian AI** (also branded as "Inari") is an autonomous cybersecurity defense system that uses adversarial reinforcement learning to train AI agents. The system features two competing AI agents - a Red Team (attacker) and a Blue Team (defender) - that train against each other through self-play to develop sophisticated attack and defense strategies.

### Core Concept
- **Red Agent**: Simulates an attacker trying to compromise network hosts, move laterally, and exfiltrate data
- **Blue Agent**: Simulates a defender monitoring the network, detecting threats, and responding to attacks
- **Self-Play Training**: Both agents improve through millions of simulated episodes

### Key Features
1. **Live Attack Visualization**: Real-time network map showing attacker movement and defender response
2. **Breach Countdown Oracle**: Predicts time-to-data-exfiltration based on kill chain progression
3. **Threat Radar**: Visual scanner showing hottest danger spots
4. **Intrusion Storyboard**: Visual story of attack progression
5. **APT Attribution**: Behavioral fingerprinting to match attacks to known threat groups
6. **Response Playbooks**: Step-by-step remediation plans

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Landing   │  │   Live      │  │   Dashboard Components  │  │
│  │   Page      │  │   Demo      │  │   (Navbar, Hero, etc)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ WebSocket / REST API
┌──────────────────────────────▼──────────────────────────────────┐
│                     BACKEND (FastAPI + Python)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   API       │  │ WebSocket   │  │   Visual Builders       │  │
│  │   Routes    │  │ Manager     │  │   (visuals.py)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   RL        │  │ Detection   │  │   Pipeline              │  │
│  │   Agents    │  │ Pipeline    │  │   (Kill Chain, DNA)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Gym       │  │ Contest     │  │   Giskard               │  │
│  │   Env       │  │ Controller  │  │   Scanner               │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
.
├── Front/                          # Frontend React Application
│   ├── src/
│   │   ├── App.tsx                 # Main app component
│   │   ├── main.tsx                # Entry point
│   │   ├── index.css               # Global styles
│   │   └── components/
│   │       ├── Navbar.tsx          # Navigation bar
│   │       ├── Hero.tsx            # Landing hero section
│   │       ├── Capabilities.tsx    # Feature showcase
│   │       ├── LiveDemo.tsx        # Demo preview section
│   │       ├── Comparison.tsx      # Feature comparison table
│   │       ├── TechnicalSpecs.tsx  # Technical specifications
│   │       ├── CTA.tsx             # Call-to-action section
│   │       └── Footer.tsx          # Footer component
│   ├── package.json                # Dependencies
│   ├── vite.config.ts              # Vite configuration
│   └── vercel.json                 # Vercel deployment config
│
├── backend/                        # Backend Python Application
│   ├── src/
│   │   ├── api/
│   │   │   ├── main.py             # FastAPI app & routes
│   │   │   ├── websocket.py        # WebSocket connection manager
│   │   │   ├── visuals.py          # Response builders
│   │   │   └── routes/
│   │   │       └── giskard.py      # Giskard scan routes
│   │   │
│   │   ├── agents/
│   │   │   ├── llm_agent_base.py   # Base LLM agent class
│   │   │   ├── llm_red_agent.py    # Red Team attacker agent
│   │   │   ├── llm_blue_agent.py   # Blue Team defender agent
│   │   │   └── strategy_manager.py # Genesis framework for strategies
│   │   │
│   │   ├── environment/
│   │   │   ├── cyber_env.py        # Gymnasium RL environment
│   │   │   ├── network.py          # Network topology model
│   │   │   └── contest_controller.py # Battle state machine
│   │   │
│   │   ├── detection/
│   │   │   ├── detector.py         # Threat classification
│   │   │   ├── correlator.py       # Cross-layer correlation
│   │   │   └── scorer.py           # Confidence scoring
│   │   │
│   │   ├── pipeline/
│   │   │   ├── kill_chain_tracker.py # Kill chain progression
│   │   │   └── threat_dna.py       # APT attribution
│   │   │
│   │   ├── training/
│   │   │   ├── self_play.py        # Self-play training loop
│   │   │   ├── teacher_ppo.py      # Teacher-guided PPO
│   │   │   └── evaluator.py        # Training evaluation
│   │   │
│   │   ├── simulation/
│   │   │   ├── log_generator.py    # Security log generation
│   │   │   └── attack_patterns.py  # Adversarial probes
│   │   │
│   │   ├── giskard_harness/
│   │   │   ├── scanner.py          # Giskard scan runner
│   │   │   ├── datasets.py         # Test datasets
│   │   │   ├── models.py           # Model wrappers
│   │   │   └── compat.py           # Compatibility layer
│   │   │
│   │   ├── models/
│   │   │   └── contest.py          # Pydantic models
│   │   │
│   │   ├── database/
│   │   │   ├── models.py           # SQLAlchemy models
│   │   │   └── session.py          # DB session management
│   │   │
│   │   └── config/
│   │       ├── constants.py        # Action/threat constants
│   │       └── secrets.py          # API tokens
│   │
│   ├── giskard_reports/            # Generated scan reports
│   └── requirements.txt            # Python dependencies
│
├── Sequence/                       # Animation frames (192 PNGs)
│
└── Documentation Files
    ├── README.md                   # Project overview
    ├── CyberGuardian_AI_Full.md    # Full feature guide
    ├── COMPLETE_PROJECT_GUIDE.md   # Complete project guide
    └── DEPLOYMENT_GUIDE.md         # Deployment instructions
```

---

## Backend Components

### 1. RL Environment (`backend/src/environment/`)

#### `cyber_env.py` - CyberSecurityEnv
Custom Gymnasium environment simulating a 20-host network:

**State Space:**
- `network_topology`: Adjacency matrix (20x20)
- `host_status`: Binary array of detected compromises
- `traffic_matrix`: Traffic between hosts (20x20)
- `alert_scores`: Per-host alert scores (20x4 threat types)
- `time_step`: Current simulation step

**Action Space:**
- Red Actions: scan, exploit, lateral_move, exfiltrate, beacon, wait
- Blue Actions: monitor, isolate, patch, block_ip, reset_credentials, investigate

**Reward Structure:**
- Red: +20 for exploit success, +15 for lateral move, +data_value*8 for exfiltration
- Blue: +50 for isolating compromised host, +40 for credential reset, -30 for false positives

**Termination Conditions:**
- Data exfiltrated >= 1000 GB
- >75% hosts compromised
- All compromised hosts detected
- Episode timeout

#### `network.py` - NetworkTopology
NetworkX-based topology with:
- **DMZ hosts** (0-1): Entry points, low vulnerability
- **App servers** (2-6): Medium value, moderate vulnerability
- **DB servers** (7-9): High-value targets, crown jewels
- **Workstations** (10-19): Low value, high vulnerability

#### `contest_controller.py` - ContestController
Per-node battle state machine tracking:
- Contest phases: IDLE → PROBING → CONTESTED → RED_WINNING/BLUE_WINNING → RED_CAPTURED/BLUE_DEFENDED/BLUE_RECAPTURED
- Control percentages for each side
- Battle results and scoreboard

---

### 2. AI Agents (`backend/src/agents/`)

#### `llm_agent_base.py` - LLMAgentBase
Base class for LLM-powered agents:
- Uses HuggingFace Inference API (Meta-Llama-3-8B-Instruct)
- Falls back to heuristic actions on API failure
- Parses action format: `[host_id, action_id]`

#### `llm_red_agent.py` - LLMRedAgent
Attacker agent with:
- Genesis Framework integration (learns from successful attack sequences)
- Fallback heuristics based on vulnerability, stealth, and connectivity
- Progressive action selection (scan → exploit → lateral → exfiltrate)

#### `llm_blue_agent.py` - LLMBlueAgent
Defender agent with:
- Alert-score-based targeting
- Risk-threshold action selection:
  - >= 0.82: isolate
  - >= 0.6: investigate
  - >= 0.4: patch
  - < 0.4: monitor

#### `strategy_manager.py` - RedStrategyManager
Genesis Framework MVP:
- Stores top 10 successful attack sequences
- Persists to `red_strategies.json`
- Used for strategy evolution in prompts

---

### 3. Detection Pipeline (`backend/src/detection/`)

#### `detector.py` - ThreatDetector
Heuristic threat classifier detecting:
- **Brute Force**: Repeated auth failures on SSH/RDP ports
- **Lateral Movement**: Suspicious processes (psexec, wmic, powershell) on internal hops
- **Data Exfiltration**: Large outbound transfers with sensitive file access
- **C2 Beacon**: Low-and-slow periodic communications

#### `correlator.py` - CrossLayerCorrelator
Confirms threats by combining:
- Network layer: traffic patterns, bytes transferred
- Endpoint layer: process execution, file access
- Application layer: HTTP methods, status codes

Outputs: `brute_force_confirmed`, `lateral_move_confirmed`, `exfiltration_confirmed`, `c2_confirmed`

#### `scorer.py` - ConfidenceScorer
Produces 0-1 confidence scores based on:
- Base confidence per threat type
- Alert score contribution
- Payload size contribution
- Traffic anomaly contribution
- Context adjustments (admin users, endpoint layer)

---

### 4. Kill Chain & Threat DNA (`backend/src/pipeline/`)

#### `kill_chain_tracker.py` - KillChainTracker
Lockheed Martin Kill Chain implementation:

| Stage | Name | Event Types |
|-------|------|-------------|
| 1 | Reconnaissance | scan, port_probe |
| 2 | Weaponization | payload_drop |
| 3 | Delivery | exploit, brute_force |
| 4 | Exploitation | exploit_success |
| 5 | Installation | beacon, c2_beacon |
| 6 | C2 & Lateral | lateral_move, credential_dump |
| 7 | Actions on Objectives | exfiltrate, data_theft |

**Breach Countdown:**
- Monte Carlo rollouts using Red agent model
- Estimates steps and seconds to data exfiltration
- Confidence based on rollout success rate

**APT Attribution:**
- Cosine similarity against known APT signatures
- Supported groups: APT29 (Cozy Bear), APT28 (Fancy Bear), Lazarus Group, Carbanak

#### `threat_dna.py`
Formats APT similarity scores for frontend with:
- Nation attribution and flags
- Known targets
- Risk notes
- Color coding

---

### 5. Training System (`backend/src/training/`)

#### `teacher_ppo.py` - TeacherGuidedPPO
Custom PPO with teacher auxiliary loss:
- Uses LLM Blue agent as teacher
- Injects teacher loss: `L_Teacher = -log π(a_Teacher | s)`
- Sigma-weighted decay for autonomy transition

#### `self_play.py` - SelfPlayTrainer
Stage 9 rule compilation with Giskard gate:
- Compiles policy rules from recent episodes
- Validates rules through Giskard scan
- Commits only if gate passes

#### `evaluator.py` - TrainingEvaluator
Periodic evaluation checkpoints:
- Runs Giskard blue scans (detector, scorer, correlator)
- Runs red scans to find blind spots
- Injects blind spots as training scenarios

---

### 6. API Layer (`backend/src/api/`)

#### `main.py` - FastAPI Application
**Endpoints:**
- `GET /` - Health check
- `POST /api/auth/login` - Authentication
- `POST /api/simulation/upload-siem` - Upload security feed
- `POST /api/simulation/create` - Create simulation
- `POST /api/simulation/{id}/start` - Start simulation
- `POST /api/simulation/{id}/step` - Advance one step
- `POST /api/simulation/{id}/reset` - Reset simulation
- `GET /api/simulation/{id}/history` - Get step history
- `GET /api/briefing/{id}` - Get battle briefing
- `WS /ws/simulation/{id}` - WebSocket for real-time updates
- `GET /api/agents/info` - Agent statistics
- `GET /api/agents/training/metrics` - Training metrics
- `GET /api/detection/alerts` - Get alerts
- `GET /api/detection/incidents` - Get incidents

**Key Features:**
- SIEM feed upload seeding for realistic scenarios
- Autonomy budget tracking for Blue agent
- Playbook generation for alerts
- Contest controller integration

#### `visuals.py` - Response Builders
Functions for building API responses:
- `build_network_graph_state()` - Network visualization data
- `build_alerts()` - Alert grouping and enrichment
- `build_pipeline_state()` - Decision pipeline state
- `build_playbook()` - Response playbook generation
- `build_battle_briefing()` - Battle summary
- `build_decision_overlay()` - Q-values and policy probabilities

---

### 7. Giskard Integration (`backend/src/giskard_harness/`)

#### `scanner.py`
**Blue Scan:** Validates detector, scorer, correlator quality
**Red Scan:** Probes detector with evasive samples to find blind spots
**Policy Gate:** Validates auto-generated policy rules

#### `datasets.py`
Builds test datasets for:
- Detection testing
- Scoring testing
- Correlation testing
- Adversarial probing

---

### 8. Simulation (`backend/src/simulation/`)

#### `log_generator.py` - LogGenerator
Generates realistic security logs:
- Network flows with IPs, ports, bytes
- Endpoint logs with processes, users, file access
- Application logs with HTTP methods, endpoints
- False positive scenarios (admin backups)

#### `attack_patterns.py` - AttackPatterns
Hand-crafted adversarial probes:
- `slow_exfil_probe()` - Low-slow exfiltration
- `jittered_beacon()` - Irregular C2 timing
- `stealth_lateral()` - Disguised lateral movement
- `distributed_brute_force()` - Multi-source auth attacks

---

## Frontend Components

### Technology Stack
- **React 19** with TypeScript
- **Vite 6** for build tooling
- **Tailwind CSS 4** for styling
- **Framer Motion** for animations
- **Lucide React** for icons

### Component Structure

#### `App.tsx`
Main layout composing:
- Navbar, Hero, Capabilities, LiveDemo, Comparison, TechnicalSpecs, CTA, Footer

#### `Navbar.tsx`
Fixed navigation with:
- Logo (INARI)
- Navigation links (Features, Technology, Blogs, About Us)
- Login/Sign Up button

#### `Hero.tsx`
Landing hero section with:
- Headline: "Autonomous active defense at the edge"
- CTA button
- Dashboard preview image with play overlay

#### `Capabilities.tsx`
Feature showcase grid:
- Predictive Pulse (AI forecasting)
- Self-Healing Assets (auto-reconfiguration)
- API Mesh Integrity (zero-trust validation)
- Identity Guard (behavioral biometrics)
- Instant Remediation (one-click resolution)

#### `LiveDemo.tsx`
Demo preview section with video placeholder

#### `Comparison.tsx`
Feature comparison table:
- Inari vs Traditional SIEM vs Rule-Based Tools
- Metrics: Detection speed, false positive rate, autonomous response, scalability

#### `TechnicalSpecs.tsx`
Technical specifications:
- Edge Latency (<5ms)
- gRPC Integration
- ML Precision (Bayesian anomaly scoring)
- SOC2/GDPR Compliance

#### `CTA.tsx`
Call-to-action section with:
- "Deploy the Sentinel" headline
- Start Free Pilot button
- Talk to a Specialist button

#### `Footer.tsx`
Footer with:
- Platform links
- Trust & Legal links
- Connect links
- Social icons

---

## Data Models

### Contest Models (`backend/src/models/contest.py`)

```python
class ContestPhase(Enum):
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
    phase: ContestPhase
    red_control_pct: float
    blue_control_pct: float
    active_threat_type: Optional[str]
    mitre_id: Optional[str]
    severity: str
    # ... additional fields

class NodeBattleResult(BaseModel):
    node_id: int
    winner: str
    outcome: str
    total_steps_fought: int
    incident_summary: str
    # ... additional fields

class BattleScoreboard(BaseModel):
    red_nodes_controlled: int
    blue_nodes_secured: int
    contested_nodes: int
    red_progress: float
    blue_progress: float
    # ... additional fields
```

### Database Models (`backend/src/database/models.py`)

```python
class Episode(Base):
    id: str (PK)
    start_time: DateTime
    end_time: DateTime
    total_steps: int
    winner: str
    final_red_reward: float
    final_blue_reward: float
    detection_rate: float
    false_positive_rate: float
    data_loss: float

class Log(Base):
    id: int (PK)
    episode_id: str (FK)
    timestamp: int
    event_type: str
    source_host: int
    target_host: int
    success: bool
    metadata_json: JSON

class Alert(Base):
    id: str (PK)
    episode_id: str (FK)
    threat_type: str
    severity: str
    confidence: float
    affected_hosts: JSON
    mitre_id: str
    status: str

class Model(Base):
    id: int (PK)
    agent_type: str
    version: str
    training_steps: int
    win_rate: float
    avg_reward: float
    file_path: str
    is_active: bool
```

---

## Configuration

### Constants (`backend/src/config/constants.py`)

```python
THREAT_TYPES = {0: "brute_force", 1: "lateral_movement", 2: "data_exfiltration", 3: "c2_beacon"}
SEVERITY_LEVELS = {0: "low", 1: "medium", 2: "high", 3: "critical"}
RED_ACTIONS = {0: "scan", 1: "exploit", 2: "lateral_move", 3: "exfiltrate", 4: "beacon", 5: "wait"}
BLUE_ACTIONS = {0: "monitor", 1: "isolate", 2: "patch", 3: "block_ip", 4: "reset_creds", 5: "investigate"}
```

### Dependencies

**Backend (`requirements.txt`):**
- fastapi, uvicorn, websockets
- stable-baselines3, gymnasium
- huggingface_hub
- sqlalchemy, pydantic
- pandas, numpy, networkx
- giskard (for AI testing)

**Frontend (`package.json`):**
- react, react-dom
- vite, @vitejs/plugin-react
- tailwindcss, @tailwindcss/vite
- motion (framer-motion)
- lucide-react

---

## Deployment

### Frontend (Vercel)
- Static SPA deployment
- `vercel.json` handles SPA routing
- Build: `npm run build` → `dist/`

### Backend (Railway/Render/Fly.io)
- Python FastAPI with WebSocket support
- Requires: Python 3.11+, stable-baselines3, GPU recommended for RL inference
- Start: `uvicorn backend.src.api.main:app --host 0.0.0.0 --port $PORT`

### Environment Variables
- `HF_API_TOKEN` - HuggingFace API token for LLM agents
- `VITE_API_BASE_URL` - Backend URL for frontend

---

## Key Algorithms

### 1. Breach Countdown Prediction
```
1. Get current environment observation
2. For each Monte Carlo rollout (50 iterations):
   a. Predict Red agent action
   b. Check if action is exfiltrate
   c. Count steps to exfiltration
3. Calculate mean steps and success rate
4. Convert to seconds: steps * step_duration
```

### 2. Cross-Layer Correlation
```
1. Classify event with ThreatDetector
2. Extract network, endpoint, application signals
3. If benign but signals suspicious:
   a. Check for brute_force indicators
   b. Check for lateral_move indicators
   c. Check for exfiltration indicators
   d. Check for c2_beacon indicators
4. Return confirmed threat type or no_correlation
```

### 3. Contest Phase Transitions
```
IDLE → PROBING: red_control >= 0.08
PROBING → CONTESTED: red_control >= 0.20
CONTESTED → RED_WINNING: (red_control - blue_control) > 0.2
CONTESTED → BLUE_WINNING: (blue_control - red_control) > 0.2
RED_WINNING → RED_CAPTURED: red_control >= 0.85 AND steps_contested >= 2
BLUE_WINNING → BLUE_DEFENDED: blue_control >= 0.80 AND red_control < 0.30
RED_CAPTURED → BLUE_RECAPTURED: blue_control >= 0.85 AND red_control < 0.55
```

---

## Running the Project

### Development

**Frontend:**
```bash
cd Front
npm install
npm run dev
# Opens at http://localhost:3000
```

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn src.api.main:app --host 127.0.0.1 --port 8001
# API at http://127.0.0.1:8001
```

### Production

**Frontend (Vercel):**
1. Connect GitHub repo
2. Set root directory to `./`
3. Build command: `npm run build`
4. Output directory: `dist`

**Backend (Railway):**
1. Connect GitHub repo
2. Set root directory to `backend/`
3. Start command: `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT`

---

## Summary

CyberGuardian AI is a sophisticated cybersecurity simulation platform that combines:
- **Reinforcement Learning** for training adversarial agents
- **LLM Integration** for intelligent decision-making
- **Real-time Visualization** for security operations
- **Kill Chain Analysis** for threat progression tracking
- **APT Attribution** for threat intelligence
- **Giskard Testing** for AI safety validation

The system demonstrates how AI agents can be trained through self-play to both attack and defend networks, providing valuable insights for security teams and a platform for testing defensive strategies.
