# CyberGuardian AI - Research Appendix

We built a security system where two AIs - one playing a hacker, one playing a guard - fought each other a million times until both got really smart.
Now when a real attack happens, the guard AI watches the live camera feeds, spots suspicious patterns across the whole building at once, and puts up a countdown clock showing exactly how much time is left before the hacker reaches the important files.
It also figures out: which famous hacker group this looks like, and gives the security team a step-by-step plan to stop it.

## Simple Picture First

Think of this whole project as a building with 20 rooms:

- the red AI is the burglar,
- the blue AI is the guard,
- and the app is the big screen in the security room.

This file is the long research-style appendix.
For the simpler version you can read `README.md`, `CyberGuardian_AI_Full.md`, `COMPLETE_PROJECT_GUIDE.md`, or `JUDGE_DEMO_GUIDE.md`.

---

# RL-POWERED CYBERSECURITY THREAT DETECTION SYSTEM
## Complete Project Documentation & Development Guide

**Project Name:** CyberGuardian AI  
**Team Size:** 2 Members  
**Duration:** 3-4 weeks (Pre-Hackathon) + 36 hours (Hackathon)  
**Tech Stack:** Python (RL Backend) + React/TypeScript (Frontend)  
**Innovation:** Multi-Agent Reinforcement Learning for Autonomous Threat Detection

---

## 📋 TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Architecture & Design](#2-architecture--design)
3. [Folder Structure](#3-folder-structure)
4. [Team Responsibilities](#4-team-responsibilities)
5. [Development Timeline](#5-development-timeline)
6. [Backend Development (GiGi's Part)](#6-backend-development-gigis-part)
7. [Frontend Development (Abhishek's Part)](#7-frontend-development-abhisheks-part)
8. [Integration Points](#8-integration-points)
9. [API Specifications](#9-api-specifications)
10. [Database Schema](#10-database-schema)
11. [RL Environment Specifications](#11-rl-environment-specifications)
12. [Training Pipeline](#12-training-pipeline)
13. [Frontend Design System](#13-frontend-design-system)
14. [Deployment Guide](#14-deployment-guide)
15. [Testing Strategy](#15-testing-strategy)
16. [Troubleshooting Guide](#16-troubleshooting-guide)
17. [Demo Preparation](#17-demo-preparation)
18. [Appendix](#18-appendix)

---

## 1. PROJECT OVERVIEW

### 1.1 What We're Building

An AI-powered cybersecurity system where two agents (Attacker & Defender) learn optimal strategies through self-play:

- **Red Agent (Attacker):** Learns to penetrate networks using realistic attack patterns
- **Blue Agent (Defender):** Learns to detect and respond to threats in real-time
- **Simulation Engine:** Generates synthetic attack scenarios and security logs
- **Dashboard:** Real-time visualization of AI battles and threat intelligence

### 1.2 Core Innovation

**Traditional Approach:**  
Rule-based detection → Static patterns → Easily bypassed by novel attacks

**Our Approach:**  
Self-play RL → Agents discover novel attacks & defenses → Adapts to zero-day threats

### 1.3 Deliverables

#### Idea Phase (Week 3)
- [ ] Technical architecture diagram
- [ ] PPT presentation (10 slides)
- [ ] Team details document

#### Offline Hackathon (36 hours)
- [ ] Live RL-powered threat detection system
- [ ] Real-time SOC dashboard
- [ ] Attack simulation engine
- [ ] Auto-generated playbooks
- [ ] 5-minute demo video

#### Post-Hackathon
- [ ] GitHub repository with documentation
- [ ] Research paper draft (optional)
- [ ] Docker deployment package

### 1.4 Success Criteria

| Metric | Target |
|--------|--------|
| **Training Stability** | Defender win rate: 70-80% after 1M steps |
| **Detection Accuracy** | 90%+ for known attack types |
| **False Positive Rate** | <5% on validation scenarios |
| **Response Time** | <500ms for live threat detection |
| **Dashboard Load Time** | <2 seconds initial render |
| **Demo Success Rate** | 100% (no crashes during presentation) |

---

## 2. ARCHITECTURE & DESIGN

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + TypeScript)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Dashboard  │  │  Simulation  │  │  Playbooks   │          │
│  │   (D3.js)    │  │   Viewer     │  │   Generator  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          │ WebSocket        │ HTTP             │ HTTP
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────────────┐
│         │         API GATEWAY (FastAPI)       │                  │
│  ┌──────▼────────┐  ┌─────────────┐  ┌───────▼──────┐          │
│  │  WebSocket    │  │  REST API   │  │  Playbook    │          │
│  │  Handler      │  │  Endpoints  │  │  Service     │          │
│  └──────┬────────┘  └──────┬──────┘  └───────┬──────┘          │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────────────┐
│         │      RL ENGINE (Gymnasium + SB3)    │                  │
│  ┌──────▼────────┐  ┌─────────────┐  ┌───────▼──────┐          │
│  │  Environment  │  │  Red Agent  │  │  Blue Agent  │          │
│  │  (Network     │  │  (PPO)      │  │  (PPO)       │          │
│  │   Simulator)  │  └─────────────┘  └──────────────┘          │
│  └──────┬────────┘                                              │
│         │                                                        │
│  ┌──────▼────────┐  ┌─────────────┐  ┌──────────────┐          │
│  │  Log          │  │  State      │  │  Reward      │          │
│  │  Generator    │  │  Manager    │  │  Calculator  │          │
│  └───────────────┘  └─────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────────────┐
│         │         DATA LAYER (PostgreSQL + Redis)                │
│  ┌──────▼────────┐  ┌─────────────┐  ┌──────────────┐          │
│  │  Episodes     │  │  Models     │  │  Game States │          │
│  │  Database     │  │  Storage    │  │  Cache       │          │
│  └───────────────┘  └─────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

#### Backend (GiGi's Domain)
```python
# Core RL Framework
- Python 3.10+
- Gymnasium 0.29.0          # RL environment interface
- Stable-Baselines3 3.2.0   # PPO/DQN algorithms
- PyTorch 2.1.0             # Neural network backend

# Optional Advanced Tools
- Replo.ai                  # Experiment tracking & hyperparameter tuning
- Giskard.ai                # Model validation & testing

# API & Services
- FastAPI 0.104.0           # REST API framework
- Uvicorn 0.24.0            # ASGI server
- WebSockets 12.0           # Real-time communication
- Pydantic 2.4.0            # Data validation

# Data & Logging
- PostgreSQL 15             # Episode storage
- Redis 7.2                 # State caching
- SQLAlchemy 2.0            # ORM
- Alembic 1.12              # Database migrations

# Utilities
- NetworkX 3.1              # Network topology
- NumPy 1.24.0              # Numerical computing
- Pandas 2.1.0              # Data analysis
- python-dotenv 1.0.0       # Environment variables
```

#### Frontend (Abhishek's Domain)
```json
{
  "core": {
    "react": "^18.2.0",
    "typescript": "^5.2.0",
    "vite": "^5.0.0"
  },
  "visualization": {
    "d3": "^7.8.5",
    "recharts": "^2.10.0",
    "react-force-graph": "^1.44.0",
    "framer-motion": "^10.16.0"
  },
  "state_management": {
    "@tanstack/react-query": "^5.8.0",
    "zustand": "^4.4.0"
  },
  "networking": {
    "axios": "^1.6.0",
    "socket.io-client": "^4.6.0"
  },
  "ui_components": {
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "tailwindcss": "^3.3.0",
    "lucide-react": "^0.294.0"
  },
  "utilities": {
    "date-fns": "^2.30.0",
    "clsx": "^2.0.0",
    "react-hot-toast": "^2.4.1"
  }
}
```

### 2.3 Development Tools

```yaml
# Version Control
git: For code management
github: Repository hosting + Actions for CI/CD

# Code Quality
backend:
  - black: Code formatting
  - pylint: Linting
  - mypy: Type checking
  - pytest: Unit testing

frontend:
  - eslint: Linting
  - prettier: Code formatting
  - vitest: Unit testing
  - playwright: E2E testing

# Containerization
docker: Container runtime
docker-compose: Multi-container orchestration

# Monitoring (Optional)
tensorboard: RL training visualization
wandb: Experiment tracking (alternative to Replo)
```

---

## 3. FOLDER STRUCTURE

### 3.1 Monorepo Structure

```
cyberguardian-ai/
│
├── README.md                          # Project overview
├── DOCUMENTATION.md                   # This file
├── .gitignore
├── docker-compose.yml                 # Full stack orchestration
├── .env.example                       # Environment variables template
│
├── backend/                           # GiGi's Repository
│   ├── README.md
│   ├── requirements.txt               # Python dependencies
│   ├── pyproject.toml                 # Project metadata
│   ├── .env
│   ├── Dockerfile
│   │
│   ├── src/
│   │   ├── __init__.py
│   │   │
│   │   ├── config/                    # Configuration
│   │   │   ├── __init__.py
│   │   │   ├── settings.py            # Environment settings
│   │   │   └── network_configs.py     # Network topologies
│   │   │
│   │   ├── environment/               # RL Environment
│   │   │   ├── __init__.py
│   │   │   ├── cyber_env.py           # Main Gym environment
│   │   │   ├── network.py             # Network topology class
│   │   │   ├── node.py                # Individual host/node
│   │   │   ├── actions.py             # Action space definitions
│   │   │   ├── observations.py        # Observation space
│   │   │   └── rewards.py             # Reward calculations
│   │   │
│   │   ├── agents/                    # RL Agents
│   │   │   ├── __init__.py
│   │   │   ├── red_agent.py           # Attacker agent
│   │   │   ├── blue_agent.py          # Defender agent
│   │   │   ├── base_agent.py          # Abstract base class
│   │   │   └── policies.py            # Custom policy networks
│   │   │
│   │   ├── training/                  # Training Pipeline
│   │   │   ├── __init__.py
│   │   │   ├── trainer.py             # Main training loop
│   │   │   ├── self_play.py           # Self-play implementation
│   │   │   ├── callbacks.py           # Training callbacks
│   │   │   └── evaluator.py           # Agent evaluation
│   │   │
│   │   ├── simulation/                # Attack Simulation
│   │   │   ├── __init__.py
│   │   │   ├── simulator.py           # Episode runner
│   │   │   ├── attack_patterns.py     # Known attack chains
│   │   │   └── log_generator.py       # Synthetic log creation
│   │   │
│   │   ├── detection/                 # Threat Detection
│   │   │   ├── __init__.py
│   │   │   ├── detector.py            # Real-time detection
│   │   │   ├── correlator.py          # Cross-layer correlation
│   │   │   ├── scorer.py              # Confidence scoring
│   │   │   └── mitre_mapper.py        # MITRE ATT&CK mapping
│   │   │
│   │   ├── playbook/                  # Playbook Generation
│   │   │   ├── __init__.py
│   │   │   ├── generator.py           # Policy -> playbook
│   │   │   ├── templates.py           # Playbook templates
│   │   │   └── exporter.py            # Markdown/JSON export
│   │   │
│   │   ├── api/                       # FastAPI Application
│   │   │   ├── __init__.py
│   │   │   ├── main.py                # FastAPI app instance
│   │   │   ├── dependencies.py        # DI containers
│   │   │   │
│   │   │   ├── routes/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── simulation.py      # /api/simulation/*
│   │   │   │   ├── agents.py          # /api/agents/*
│   │   │   │   ├── detection.py       # /api/detection/*
│   │   │   │   ├── playbooks.py       # /api/playbooks/*
│   │   │   │   └── websocket.py       # /ws/*
│   │   │   │
│   │   │   ├── schemas/               # Pydantic models
│   │   │   │   ├── __init__.py
│   │   │   │   ├── simulation.py
│   │   │   │   ├── detection.py
│   │   │   │   └── playbook.py
│   │   │   │
│   │   │   └── middleware/
│   │   │       ├── __init__.py
│   │   │       ├── cors.py
│   │   │       └── error_handler.py
│   │   │
│   │   ├── database/                  # Database Layer
│   │   │   ├── __init__.py
│   │   │   ├── models.py              # SQLAlchemy models
│   │   │   ├── session.py             # DB connection
│   │   │   └── migrations/            # Alembic migrations
│   │   │       └── versions/
│   │   │
│   │   └── utils/                     # Utilities
│   │       ├── __init__.py
│   │       ├── logger.py
│   │       ├── metrics.py
│   │       └── validators.py
│   │
│   ├── tests/                         # Backend Tests
│   │   ├── __init__.py
│   │   ├── test_environment.py
│   │   ├── test_agents.py
│   │   ├── test_api.py
│   │   └── fixtures/
│   │
│   ├── scripts/                       # Utility Scripts
│   │   ├── train_agents.py            # Training entry point
│   │   ├── evaluate.py                # Model evaluation
│   │   ├── generate_dataset.py        # Synthetic data
│   │   └── export_model.py            # Model packaging
│   │
│   ├── models/                        # Saved Models
│   │   ├── red_agent/
│   │   │   ├── best_model.zip
│   │   │   └── checkpoint_*.zip
│   │   └── blue_agent/
│   │       ├── best_model.zip
│   │       └── checkpoint_*.zip
│   │
│   └── logs/                          # Training Logs
│       ├── tensorboard/
│       └── training_*.log
│
├── frontend/                          # Abhishek's Repository
│   ├── README.md
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── .env
│   ├── Dockerfile
│   │
│   ├── public/
│   │   ├── favicon.ico
│   │   └── assets/
│   │
│   ├── src/
│   │   ├── main.tsx                   # App entry point
│   │   ├── App.tsx                    # Root component
│   │   ├── vite-env.d.ts
│   │   │
│   │   ├── config/                    # Configuration
│   │   │   ├── api.ts                 # API endpoints
│   │   │   ├── constants.ts           # App constants
│   │   │   └── theme.ts               # Theme configuration
│   │   │
│   │   ├── types/                     # TypeScript Types
│   │   │   ├── index.ts
│   │   │   ├── simulation.ts
│   │   │   ├── detection.ts
│   │   │   ├── network.ts
│   │   │   └── api.ts
│   │   │
│   │   ├── api/                       # API Client
│   │   │   ├── client.ts              # Axios instance
│   │   │   ├── simulation.ts          # Simulation endpoints
│   │   │   ├── detection.ts           # Detection endpoints
│   │   │   ├── playbooks.ts           # Playbook endpoints
│   │   │   └── websocket.ts           # WebSocket client
│   │   │
│   │   ├── hooks/                     # Custom React Hooks
│   │   │   ├── useSimulation.ts
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useDetection.ts
│   │   │   └── usePlaybook.ts
│   │   │
│   │   ├── store/                     # State Management
│   │   │   ├── index.ts
│   │   │   ├── simulationStore.ts     # Zustand store
│   │   │   ├── detectionStore.ts
│   │   │   └── uiStore.ts
│   │   │
│   │   ├── components/                # React Components
│   │   │   ├── common/                # Shared components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Spinner.tsx
│   │   │   │   └── Toast.tsx
│   │   │   │
│   │   │   ├── layout/                # Layout components
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── PageContainer.tsx
│   │   │   │
│   │   │   ├── dashboard/             # Dashboard page
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── MetricsPanel.tsx
│   │   │   │   ├── NetworkGraph.tsx
│   │   │   │   ├── AlertsFeed.tsx
│   │   │   │   └── ThreatTimeline.tsx
│   │   │   │
│   │   │   ├── simulation/            # Simulation viewer
│   │   │   │   ├── SimulationViewer.tsx
│   │   │   │   ├── AgentControl.tsx
│   │   │   │   ├── EpisodeList.tsx
│   │   │   │   └── RewardChart.tsx
│   │   │   │
│   │   │   ├── detection/             # Detection view
│   │   │   │   ├── DetectionPanel.tsx
│   │   │   │   ├── AlertCard.tsx
│   │   │   │   ├── ConfidenceBar.tsx
│   │   │   │   └── MitreMapping.tsx
│   │   │   │
│   │   │   ├── playbook/              # Playbook viewer
│   │   │   │   ├── PlaybookViewer.tsx
│   │   │   │   ├── ActionStep.tsx
│   │   │   │   └── CodeBlock.tsx
│   │   │   │
│   │   │   └── visualization/         # D3 Visualizations
│   │   │       ├── NetworkTopology.tsx
│   │   │       ├── AttackPath.tsx
│   │   │       ├── TrafficFlow.tsx
│   │   │       └── LearningCurve.tsx
│   │   │
│   │   ├── pages/                     # Page Components
│   │   │   ├── Home.tsx
│   │   │   ├── Live.tsx               # Live detection
│   │   │   ├── Simulation.tsx         # Simulation mode
│   │   │   ├── Training.tsx           # Training dashboard
│   │   │   └── Playbooks.tsx          # Playbook library
│   │   │
│   │   ├── utils/                     # Utility Functions
│   │   │   ├── format.ts              # Data formatting
│   │   │   ├── colors.ts              # Color utilities
│   │   │   └── validation.ts
│   │   │
│   │   └── styles/                    # Global Styles
│   │       ├── index.css
│   │       └── animations.css
│   │
│   └── tests/                         # Frontend Tests
│       ├── setup.ts
│       ├── components/
│       └── e2e/
│
└── deployment/                        # Deployment Configs
    ├── docker/
    │   ├── backend.Dockerfile
    │   └── frontend.Dockerfile
    ├── kubernetes/
    │   ├── backend-deployment.yaml
    │   └── frontend-deployment.yaml
    └── nginx/
        └── nginx.conf
```

### 3.2 File Naming Conventions

```yaml
Backend (Python):
  - Files: snake_case (e.g., cyber_env.py)
  - Classes: PascalCase (e.g., CyberSecurityEnv)
  - Functions: snake_case (e.g., calculate_reward)
  - Constants: UPPER_SNAKE_CASE (e.g., MAX_STEPS)

Frontend (TypeScript):
  - Files: PascalCase for components (e.g., Dashboard.tsx)
  - Files: camelCase for utilities (e.g., formatDate.ts)
  - Components: PascalCase (e.g., NetworkGraph)
  - Functions: camelCase (e.g., fetchSimulation)
  - Constants: UPPER_SNAKE_CASE (e.g., API_BASE_URL)
```

---

## 4. TEAM RESPONSIBILITIES

### 4.1 GiGi's Scope (Backend Developer)

**Primary Responsibilities:**
1. RL environment development (Gymnasium)
2. Agent training (Red & Blue agents)
3. API development (FastAPI)
4. Database design & implementation
5. WebSocket real-time communication
6. Model deployment & serving

**Deliverables:**
- [ ] Fully functional RL environment with 20-node network
- [ ] Trained Red agent (1M+ steps, 30%+ win rate)
- [ ] Trained Blue agent (1M+ steps, 70%+ win rate)
- [ ] REST API with 12+ endpoints (documented)
- [ ] WebSocket server for real-time updates
- [ ] PostgreSQL schema with 5+ tables
- [ ] API documentation (Swagger/OpenAPI)

**Success Metrics:**
- Environment step time: <10ms
- API response time: <100ms (p95)
- Model inference time: <50ms
- Training convergence: 500k-1M steps

### 4.2 Abhishek's Scope (Frontend Developer)

**Primary Responsibilities:**
1. React application architecture
2. Dashboard UI/UX design
3. D3.js network visualizations
4. Real-time data streaming (WebSocket)
5. State management (Zustand)
6. Responsive design & animations

**Deliverables:**
- [ ] 5 main pages (Home, Live, Simulation, Training, Playbooks)
- [ ] Real-time network graph with 20 nodes
- [ ] Alert feed with live updates
- [ ] Attack path visualization
- [ ] Agent training dashboard
- [ ] Playbook viewer with syntax highlighting
- [ ] Mobile-responsive design

**Success Metrics:**
- Initial load time: <2s
- Time to interactive: <3s
- Frame rate: 60fps (network animations)
- Lighthouse score: 90+ (Performance)
- Zero console errors

---

## 5. DEVELOPMENT TIMELINE

### 5.1 Week-by-Week Breakdown

```
WEEK 1 (Days 1-7): Foundation
├── GiGi
│   ├── Day 1-2: Setup backend repo, environment structure
│   ├── Day 3-4: Implement basic Gym environment (5 nodes)
│   ├── Day 5-6: Implement action/observation spaces
│   └── Day 7: Test environment manually
│
└── Abhishek
    ├── Day 1-2: Setup frontend repo, design system
    ├── Day 3-4: Build basic layout (Header, Sidebar)
    ├── Day 5-6: Create network graph component (static)
    └── Day 7: Test rendering with mock data

DELIVERABLES: Environment skeleton + UI mockups
INTEGRATION CHECKPOINT: None (independent work)

---

WEEK 2 (Days 8-14): Core Logic
├── GiGi
│   ├── Day 8-9: Implement reward functions
│   ├── Day 10-11: Add log generation
│   ├── Day 12-13: Start agent training (initial 100k steps)
│   └── Day 14: FastAPI setup, basic endpoints
│
└── Abhishek
    ├── Day 8-9: Dashboard page with metrics
    ├── Day 10-11: Alert feed component
    ├── Day 12-13: API client setup
    └── Day 14: Connect to mock API

DELIVERABLES: Trainable environment + Connected dashboard
INTEGRATION CHECKPOINT: API contract definition (Day 14)

---

WEEK 3 (Days 15-21): Integration & Polish
├── GiGi
│   ├── Day 15-16: Self-play training (500k steps)
│   ├── Day 17-18: WebSocket implementation
│   ├── Day 19-20: Detection & correlation logic
│   └── Day 21: Playbook generation
│
└── Abhishek
    ├── Day 15-16: WebSocket client integration
    ├── Day 17-18: Real-time network updates
    ├── Day 19-20: Simulation viewer page
    └── Day 21: Playbook viewer

DELIVERABLES: End-to-end system working
INTEGRATION CHECKPOINT: Full system test (Day 21)

---

WEEK 4 (Days 22-28): Hackathon Prep
├── GiGi
│   ├── Day 22-23: Model optimization
│   ├── Day 24-25: Demo scenarios preparation
│   ├── Day 26-27: Bug fixes & testing
│   └── Day 28: Docker deployment
│
└── Abhishek
    ├── Day 22-23: UI/UX polish
    ├── Day 24-25: Animations & transitions
    ├── Day 26-27: Performance optimization
    └── Day 28: Final testing

DELIVERABLES: Production-ready system
INTEGRATION CHECKPOINT: Demo rehearsal (Day 28)

---

HACKATHON (36 hours)
├── Hour 0-6: Final integration, bug fixes
├── Hour 6-18: Advanced features (MITRE, simulation)
├── Hour 18-30: UI polish, demo prep
└── Hour 30-36: Presentation creation, rehearsal
```

### 5.2 Daily Standup Template

```markdown
## Daily Update - [Date]

**Name:** GiGi / Abhishek

**Yesterday:**
- [ ] Task 1
- [ ] Task 2

**Today:**
- [ ] Task 1
- [ ] Task 2

**Blockers:**
- None / [Describe blocker]

**Integration Needed:**
- None / [Specific request from teammate]
```

---

## 6. BACKEND DEVELOPMENT (GiGi's Part)

### 6.1 Environment Setup

```bash
# 1. Create backend repository
mkdir backend && cd backend

# 2. Initialize Python environment
python3.10 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install --upgrade pip
pip install gymnasium stable-baselines3 torch fastapi uvicorn \
    sqlalchemy psycopg2-binary redis python-dotenv pydantic \
    networkx numpy pandas websockets alembic

# 4. Save dependencies
pip freeze > requirements.txt

# 5. Setup environment variables
cp .env.example .env
```

**.env.example:**
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/cyberguardian
REDIS_URL=redis://localhost:6379/0

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Training
TRAINING_STEPS=1000000
SAVE_FREQ=50000
LOG_DIR=./logs
MODEL_DIR=./models

# Optional: Replo.ai / Wandb
REPLO_API_KEY=your_key_here
WANDB_API_KEY=your_key_here
```

### 6.2 RL Environment Implementation

**File: `src/environment/cyber_env.py`**

```python
"""
Main RL Environment for Cybersecurity Simulation
Implements Gymnasium interface for multi-agent self-play
"""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from .network import NetworkTopology
from .actions import ActionSpace
from .observations import ObservationSpace
from .rewards import RewardCalculator
from ..simulation.log_generator import LogGenerator

class CyberSecurityEnv(gym.Env):
    """
    Multi-agent RL environment for cybersecurity threat detection
    
    Agents:
        - Red (Attacker): Tries to compromise network and exfiltrate data
        - Blue (Defender): Detects threats and responds
    
    Episode:
        - Starts with Red having one compromised host
        - Ends when: (1) Red exfiltrates data, (2) Blue catches Red, (3) Max steps reached
    
    State:
        - Network topology (adjacency matrix)
        - Host statuses (compromised/clean)
        - Traffic patterns
        - Alert history
    
    Actions:
        - Red: scan, exploit, lateral_move, exfiltrate, beacon, wait
        - Blue: monitor, isolate, patch, block_ip, reset_creds, investigate
    
    Rewards:
        - Red: +points for progression, -points if caught
        - Blue: +points for detection, -points for false positives/breach
    """
    
    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 4}
    
    def __init__(
        self,
        num_hosts: int = 20,
        max_steps: int = 100,
        render_mode: Optional[str] = None,
    ):
        super().__init__()
        
        self.num_hosts = num_hosts
        self.max_steps = max_steps
        self.render_mode = render_mode
        
        # Initialize network topology
        self.network = NetworkTopology(num_hosts=num_hosts)
        
        # Initialize components
        self.action_space_manager = ActionSpace(num_hosts=num_hosts)
        self.observation_manager = ObservationSpace(num_hosts=num_hosts)
        self.reward_calculator = RewardCalculator()
        self.log_generator = LogGenerator()
        
        # Define action spaces
        self.action_space = spaces.Dict({
            "red_action": spaces.MultiDiscrete([
                num_hosts,  # target_host
                6,          # action_type: 0=scan, 1=exploit, 2=lateral, 3=exfil, 4=beacon, 5=wait
            ]),
            "blue_action": spaces.MultiDiscrete([
                num_hosts,  # target_host
                6,          # action_type: 0=monitor, 1=isolate, 2=patch, 3=block, 4=reset, 5=investigate
            ]),
        })
        
        # Define observation space
        self.observation_space = spaces.Dict({
            "network_topology": spaces.Box(
                low=0, high=1, 
                shape=(num_hosts, num_hosts), 
                dtype=np.float32
            ),
            "host_status": spaces.MultiBinary(num_hosts),
            "traffic_matrix": spaces.Box(
                low=0, high=1000,
                shape=(num_hosts, num_hosts),
                dtype=np.float32
            ),
            "alert_scores": spaces.Box(
                low=0, high=1,
                shape=(num_hosts, 4),  # 4 threat types
                dtype=np.float32
            ),
            "time_step": spaces.Box(
                low=0, high=max_steps,
                shape=(1,),
                dtype=np.int32
            ),
        })
        
        # Initialize state
        self.reset()
    
    def reset(
        self, 
        seed: Optional[int] = None, 
        options: Optional[Dict[str, Any]] = None
    ) -> Tuple[Dict, Dict]:
        """Reset environment to initial state"""
        super().reset(seed=seed)
        
        # Reset network
        self.network.reset()
        
        # Initialize game state
        self.current_step = 0
        self.compromised_hosts = set()
        self.isolated_hosts = set()
        self.patched_hosts = set()
        self.detected_compromises = set()
        
        # Red agent state
        self.red_position = self.network.get_entry_point()
        self.compromised_hosts.add(self.red_position)
        self.data_exfiltrated = 0
        self.red_caught = False
        
        # Blue agent state
        self.alerts_raised = []
        self.false_positives = 0
        self.true_positives = 0
        
        # Log history
        self.logs = []
        
        # Generate initial observation
        observation = self._get_observation()
        info = self._get_info()
        
        return observation, info
    
    def step(
        self, 
        action: Dict[str, np.ndarray]
    ) -> Tuple[Dict, Dict, bool, bool, Dict]:
        """
        Execute one timestep of the environment
        
        Args:
            action: Dict with 'red_action' and 'blue_action'
        
        Returns:
            observation: Current state
            rewards: Dict with 'red' and 'blue' rewards
            terminated: Whether episode ended
            truncated: Whether max steps reached
            info: Additional information
        """
        self.current_step += 1
        
        # Parse actions
        red_target, red_type = action["red_action"]
        blue_target, blue_type = action["blue_action"]
        
        # Execute Red agent action
        red_reward, red_logs = self._execute_red_action(red_target, red_type)
        
        # Execute Blue agent action
        blue_reward, blue_logs = self._execute_blue_action(blue_target, blue_type)
        
        # Store logs
        self.logs.extend(red_logs)
        self.logs.extend(blue_logs)
        
        # Update network state
        self._update_network_state()
        
        # Check termination
        terminated = self._check_termination()
        truncated = self.current_step >= self.max_steps
        
        # Package rewards
        rewards = {
            "red": red_reward,
            "blue": blue_reward,
        }
        
        # Generate observation
        observation = self._get_observation()
        info = self._get_info()
        
        return observation, rewards, terminated, truncated, info
    
    def _execute_red_action(
        self, 
        target: int, 
        action_type: int
    ) -> Tuple[float, List[Dict]]:
        """Execute Red agent action and return reward + logs"""
        reward = 0
        logs = []
        
        if action_type == 0:  # Scan
            if self.network.can_reach(self.red_position, target):
                vulns = self.network.get_vulnerabilities(target)
                reward = 1
                logs.append(self.log_generator.generate_scan_log(
                    source=self.red_position,
                    target=target,
                    result=vulns
                ))
        
        elif action_type == 1:  # Exploit
            if target in self.patched_hosts:
                success_prob = 0.1
            else:
                success_prob = self.network.get_exploit_success_rate(target)
            
            if np.random.random() < success_prob:
                self.compromised_hosts.add(target)
                reward = 20
                logs.append(self.log_generator.generate_exploit_log(
                    source=self.red_position,
                    target=target,
                    success=True
                ))
            else:
                reward = -2
                logs.append(self.log_generator.generate_exploit_log(
                    source=self.red_position,
                    target=target,
                    success=False
                ))
        
        elif action_type == 2:  # Lateral movement
            if target in self.compromised_hosts and target != self.red_position:
                neighbors = self.network.get_neighbors(target)
                for neighbor in neighbors:
                    if neighbor not in self.compromised_hosts:
                        self.compromised_hosts.add(neighbor)
                        reward = 15
                        logs.append(self.log_generator.generate_lateral_movement_log(
                            source=target,
                            destination=neighbor
                        ))
                        break
        
        elif action_type == 3:  # Exfiltrate
            if target in self.compromised_hosts:
                data_value = self.network.get_data_value(target)
                self.data_exfiltrated += data_value
                reward = data_value * 10
                logs.append(self.log_generator.generate_exfiltration_log(
                    source=target,
                    bytes_transferred=data_value * 1000000
                ))
        
        elif action_type == 4:  # C2 Beacon
            if target in self.compromised_hosts:
                reward = 0.5
                logs.append(self.log_generator.generate_beacon_log(
                    source=target
                ))
        
        elif action_type == 5:  # Wait (stealth)
            reward = 0.1
        
        return reward, logs
    
    def _execute_blue_action(
        self, 
        target: int, 
        action_type: int
    ) -> Tuple[float, List[Dict]]:
        """Execute Blue agent action and return reward + logs"""
        reward = 0
        logs = []
        
        if action_type == 0:  # Monitor
            reward = 0
            logs.append({"type": "monitor", "target": target})
        
        elif action_type == 1:  # Isolate
            self.isolated_hosts.add(target)
            if target in self.compromised_hosts:
                # Correct isolation
                self.detected_compromises.add(target)
                self.true_positives += 1
                reward = 50
            else:
                # False positive
                self.false_positives += 1
                reward = -30
            logs.append({"type": "isolate", "target": target})
        
        elif action_type == 2:  # Patch
            self.patched_hosts.add(target)
            reward = 5
            logs.append({"type": "patch", "target": target})
        
        elif action_type == 3:  # Block IP
            if target in self.compromised_hosts:
                reward = 30
                self.detected_compromises.add(target)
                self.true_positives += 1
            else:
                reward = -10
                self.false_positives += 1
            logs.append({"type": "block_ip", "target": target})
        
        elif action_type == 4:  # Reset credentials
            if target in self.compromised_hosts:
                self.compromised_hosts.remove(target)
                reward = 40
                self.detected_compromises.add(target)
                self.true_positives += 1
            else:
                reward = -5
            logs.append({"type": "reset_creds", "target": target})
        
        elif action_type == 5:  # Investigate
            if target in self.compromised_hosts:
                reward = 10
            else:
                reward = -2
            logs.append({"type": "investigate", "target": target})
        
        # Early detection bonus
        if self.true_positives > 0:
            early_bonus = max(0, 50 - self.current_step)
            reward += early_bonus
        
        return reward, logs
    
    def _update_network_state(self):
        """Update network traffic and alert scores"""
        # Generate traffic matrix based on current state
        self.network.update_traffic(
            compromised=self.compromised_hosts,
            isolated=self.isolated_hosts
        )
        
        # Calculate alert scores based on recent logs
        self.network.update_alerts(self.logs[-10:])
    
    def _check_termination(self) -> bool:
        """Check if episode should end"""
        # Red wins conditions
        if self.data_exfiltrated >= 1000:
            return True
        if len(self.compromised_hosts) > self.num_hosts * 0.75:
            return True
        
        # Blue wins conditions
        if len(self.detected_compromises) >= len(self.compromised_hosts):
            if len(self.compromised_hosts) > 2:  # Caught significant breach
                self.red_caught = True
                return True
        
        # Stalemate
        if self.current_step > 50 and len(self.compromised_hosts) == 1:
            return True
        
        return False
    
    def _get_observation(self) -> Dict:
        """Generate current observation"""
        # Blue agent only sees detected compromises (partial observability)
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
    
    def _get_info(self) -> Dict:
        """Generate info dict with ground truth"""
        return {
            "compromised_hosts": list(self.compromised_hosts),
            "detected_compromises": list(self.detected_compromises),
            "isolated_hosts": list(self.isolated_hosts),
            "data_exfiltrated": self.data_exfiltrated,
            "true_positives": self.true_positives,
            "false_positives": self.false_positives,
            "red_caught": self.red_caught,
            "logs": self.logs[-5:],  # Last 5 logs
        }
    
    def render(self):
        """Render environment (optional)"""
        if self.render_mode == "human":
            print(f"\n=== Step {self.current_step} ===")
            print(f"Compromised: {len(self.compromised_hosts)}")
            print(f"Detected: {len(self.detected_compromises)}")
            print(f"Data Exfiltrated: {self.data_exfiltrated}")
        
        return None
```

### 6.3 Network Topology Class

**File: `src/environment/network.py`**

```python
"""
Network topology management for RL environment
Represents the target network structure
"""

import numpy as np
import networkx as nx
from typing import List, Set, Dict, Tuple

class NetworkTopology:
    """
    Manages network structure and properties
    
    Network Structure:
        - DMZ: 2 web servers (entry points)
        - Internal Zone 1: 5 application servers
        - Internal Zone 2: 3 database servers
        - Internal Zone 3: 10 workstations
    
    Attributes:
        - Adjacency matrix (connectivity)
        - Vulnerability scores per host
        - Data value per host
        - Patch levels
    """
    
    def __init__(self, num_hosts: int = 20):
        self.num_hosts = num_hosts
        self.graph = nx.Graph()
        
        # Initialize network structure
        self._build_topology()
        
        # Host properties
        self.vulnerabilities = {}
        self.data_values = {}
        self.patch_levels = {}
        
        # Dynamic state
        self.traffic_matrix = np.zeros((num_hosts, num_hosts))
        self.alert_scores = np.zeros((num_hosts, 4))  # 4 threat types
        
        self._initialize_host_properties()
    
    def _build_topology(self):
        """Build realistic network topology"""
        # DMZ (hosts 0-1)
        dmz_hosts = [0, 1]
        
        # Internal zones
        app_servers = list(range(2, 7))      # 2-6
        db_servers = list(range(7, 10))      # 7-9
        workstations = list(range(10, 20))   # 10-19
        
        # Add nodes
        for i in range(self.num_hosts):
            self.graph.add_node(i)
        
        # DMZ connections (public-facing)
        for dmz in dmz_hosts:
            for app in app_servers:
                self.graph.add_edge(dmz, app)
        
        # App servers to DB servers
        for app in app_servers:
            for db in db_servers:
                self.graph.add_edge(app, db)
        
        # Workstations to app servers
        for ws in workstations:
            # Each workstation connects to 2-3 app servers
            connected_apps = np.random.choice(app_servers, size=2, replace=False)
            for app in connected_apps:
                self.graph.add_edge(ws, app)
        
        # Some workstations interconnected
        for i in range(len(workstations) - 1):
            if np.random.random() < 0.3:
                self.graph.add_edge(workstations[i], workstations[i+1])
    
    def _initialize_host_properties(self):
        """Set vulnerabilities, data values, patch levels"""
        for host in range(self.num_hosts):
            # Vulnerability score (0-1)
            if host < 2:  # DMZ - better secured
                self.vulnerabilities[host] = np.random.uniform(0.1, 0.3)
            elif 7 <= host < 10:  # DB servers - high value, better secured
                self.vulnerabilities[host] = np.random.uniform(0.2, 0.4)
            else:  # Others
                self.vulnerabilities[host] = np.random.uniform(0.3, 0.7)
            
            # Data value (GB)
            if 7 <= host < 10:  # Databases
                self.data_values[host] = np.random.uniform(100, 500)
            elif 2 <= host < 7:  # App servers
                self.data_values[host] = np.random.uniform(10, 50)
            else:  # Workstations, DMZ
                self.data_values[host] = np.random.uniform(1, 10)
            
            # Patch level (current/outdated)
            self.patch_levels[host] = "current" if np.random.random() < 0.6 else "outdated"
    
    def reset(self):
        """Reset dynamic state"""
        self.traffic_matrix = np.zeros((self.num_hosts, self.num_hosts))
        self.alert_scores = np.zeros((self.num_hosts, 4))
    
    def get_entry_point(self) -> int:
        """Return a DMZ host as entry point"""
        return np.random.choice([0, 1])
    
    def get_neighbors(self, host: int) -> List[int]:
        """Get directly connected hosts"""
        return list(self.graph.neighbors(host))
    
    def can_reach(self, source: int, target: int) -> bool:
        """Check if source can reach target"""
        return nx.has_path(self.graph, source, target)
    
    def get_vulnerabilities(self, host: int) -> float:
        """Get vulnerability score for host"""
        return self.vulnerabilities.get(host, 0.5)
    
    def get_exploit_success_rate(self, host: int) -> float:
        """Calculate exploit success probability"""
        base_vuln = self.vulnerabilities[host]
        if self.patch_levels[host] == "current":
            return base_vuln * 0.3
        return base_vuln
    
    def get_data_value(self, host: int) -> float:
        """Get data value for host"""
        return self.data_values.get(host, 1.0)
    
    def update_traffic(self, compromised: Set[int], isolated: Set[int]):
        """Update traffic matrix based on current state"""
        # Reset
        self.traffic_matrix = np.zeros((self.num_hosts, self.num_hosts))
        
        # Generate baseline traffic
        for edge in self.graph.edges():
            src, dst = edge
            if src not in isolated and dst not in isolated:
                self.traffic_matrix[src, dst] = np.random.uniform(10, 100)
                self.traffic_matrix[dst, src] = np.random.uniform(10, 100)
        
        # Add suspicious traffic from compromised hosts
        for host in compromised:
            if host not in isolated:
                # C2 beacon pattern
                external = -1  # Placeholder for external IP
                self.traffic_matrix[host, 0] += np.random.uniform(1, 5)
                
                # Lateral movement traffic
                neighbors = self.get_neighbors(host)
                for neighbor in neighbors:
                    self.traffic_matrix[host, neighbor] += np.random.uniform(50, 200)
    
    def update_alerts(self, recent_logs: List[Dict]):
        """Calculate alert scores based on recent activity"""
        # Reset
        self.alert_scores = np.zeros((self.num_hosts, 4))
        
        # Threat types: 0=brute_force, 1=lateral, 2=exfil, 3=beacon
        for log in recent_logs:
            if log.get("type") == "exploit":
                target = log.get("target", 0)
                self.alert_scores[target, 0] += 0.2
            
            elif log.get("type") == "lateral_movement":
                target = log.get("destination", 0)
                self.alert_scores[target, 1] += 0.3
            
            elif log.get("type") == "exfiltration":
                target = log.get("source", 0)
                self.alert_scores[target, 2] += 0.5
            
            elif log.get("type") == "beacon":
                target = log.get("source", 0)
                self.alert_scores[target, 3] += 0.1
        
        # Clip to [0, 1]
        self.alert_scores = np.clip(self.alert_scores, 0, 1)
    
    def get_adjacency_matrix(self) -> np.ndarray:
        """Return network adjacency matrix"""
        return nx.to_numpy_array(self.graph, dtype=np.float32)
    
    def get_traffic_matrix(self) -> np.ndarray:
        """Return current traffic matrix"""
        return self.traffic_matrix.astype(np.float32)
    
    def get_alert_scores(self) -> np.ndarray:
        """Return alert scores per host"""
        return self.alert_scores.astype(np.float32)
```

### 6.4 Training Script

**File: `scripts/train_agents.py`**

```python
"""
Main training script for Red and Blue agents
Implements self-play training loop
"""

import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import gymnasium as gym
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import (
    EvalCallback,
    CheckpointCallback,
    CallbackList,
)
from stable_baselines3.common.vec_env import SubprocVecEnv
import numpy as np
from typing import Optional

from environment.cyber_env import CyberSecurityEnv
from training.callbacks import SelfPlayCallback, WinRateCallback
from config.settings import settings


class SelfPlayWrapper(gym.Wrapper):
    """
    Wrapper that allows training one agent while the other uses a fixed policy
    """
    def __init__(self, env, opponent_model: Optional[PPO] = None, train_blue: bool = True):
        super().__init__(env)
        self.opponent_model = opponent_model
        self.train_blue = train_blue
        
        # Modify action space to only include the training agent's actions
        if train_blue:
            self.action_space = env.action_space["blue_action"]
        else:
            self.action_space = env.action_space["red_action"]
    
    def step(self, action):
        # Get opponent action if model exists
        if self.opponent_model is not None:
            obs = self.env._get_observation()
            opponent_action, _ = self.opponent_model.predict(obs, deterministic=False)
        else:
            # Random opponent
            if self.train_blue:
                opponent_action = self.env.action_space["red_action"].sample()
            else:
                opponent_action = self.env.action_space["blue_action"].sample()
        
        # Combine actions
        if self.train_blue:
            full_action = {
                "blue_action": action,
                "red_action": opponent_action,
            }
        else:
            full_action = {
                "red_action": action,
                "blue_action": opponent_action,
            }
        
        # Execute step
        obs, rewards, terminated, truncated, info = self.env.step(full_action)
        
        # Return only the training agent's reward
        reward = rewards["blue"] if self.train_blue else rewards["red"]
        
        return obs, reward, terminated, truncated, info


def train_self_play(
    total_timesteps: int = 1_000_000,
    n_envs: int = 4,
    iterations: int = 20,
):
    """
    Self-play training loop
    
    Args:
        total_timesteps: Total steps to train
        n_envs: Number of parallel environments
        iterations: Number of self-play iterations
    """
    print("=" * 60)
    print("SELF-PLAY TRAINING")
    print("=" * 60)
    
    # Create directories
    os.makedirs(settings.MODEL_DIR, exist_ok=True)
    os.makedirs(settings.LOG_DIR, exist_ok=True)
    
    # Initialize models
    red_model = None
    blue_model = None
    
    steps_per_iteration = total_timesteps // iterations
    
    for iteration in range(iterations):
        print(f"\n{'='*60}")
        print(f"ITERATION {iteration + 1}/{iterations}")
        print(f"{'='*60}")
        
        # === PHASE 1: Train Blue against current Red ===
        print("\n[Phase 1] Training Blue Agent...")
        
        # Create environment
        def make_env_blue():
            env = CyberSecurityEnv(num_hosts=20, max_steps=100)
            env = SelfPlayWrapper(env, opponent_model=red_model, train_blue=True)
            return env
        
        blue_env = make_vec_env(make_env_blue, n_envs=n_envs, vec_env_cls=SubprocVecEnv)
        
        # Create or load Blue model
        if blue_model is None:
            blue_model = PPO(
                "MultiInputPolicy",
                blue_env,
                verbose=1,
                learning_rate=3e-4,
                n_steps=2048,
                batch_size=64,
                n_epochs=10,
                gamma=0.99,
                gae_lambda=0.95,
                clip_range=0.2,
                tensorboard_log=f"{settings.LOG_DIR}/blue",
            )
        else:
            blue_model.set_env(blue_env)
        
        # Setup callbacks
        blue_checkpoint = CheckpointCallback(
            save_freq=10000,
            save_path=f"{settings.MODEL_DIR}/blue_agent",
            name_prefix="blue_checkpoint",
        )
        
        blue_win_rate = WinRateCallback(
            eval_freq=5000,
            n_eval_episodes=10,
            agent_name="Blue",
        )
        
        # Train Blue
        blue_model.learn(
            total_timesteps=steps_per_iteration // 2,
            callback=[blue_checkpoint, blue_win_rate],
            reset_num_timesteps=False,
        )
        
        # Save Blue
        blue_model.save(f"{settings.MODEL_DIR}/blue_agent/iteration_{iteration}")
        
        blue_env.close()
        
        # === PHASE 2: Train Red against improved Blue ===
        print("\n[Phase 2] Training Red Agent...")
        
        # Create environment
        def make_env_red():
            env = CyberSecurityEnv(num_hosts=20, max_steps=100)
            env = SelfPlayWrapper(env, opponent_model=blue_model, train_blue=False)
            return env
        
        red_env = make_vec_env(make_env_red, n_envs=n_envs, vec_env_cls=SubprocVecEnv)
        
        # Create or load Red model
        if red_model is None:
            red_model = PPO(
                "MultiInputPolicy",
                red_env,
                verbose=1,
                learning_rate=3e-4,
                n_steps=2048,
                batch_size=64,
                n_epochs=10,
                gamma=0.99,
                gae_lambda=0.95,
                clip_range=0.2,
                tensorboard_log=f"{settings.LOG_DIR}/red",
            )
        else:
            red_model.set_env(red_env)
        
        # Setup callbacks
        red_checkpoint = CheckpointCallback(
            save_freq=10000,
            save_path=f"{settings.MODEL_DIR}/red_agent",
            name_prefix="red_checkpoint",
        )
        
        red_win_rate = WinRateCallback(
            eval_freq=5000,
            n_eval_episodes=10,
            agent_name="Red",
        )
        
        # Train Red
        red_model.learn(
            total_timesteps=steps_per_iteration // 2,
            callback=[red_checkpoint, red_win_rate],
            reset_num_timesteps=False,
        )
        
        # Save Red
        red_model.save(f"{settings.MODEL_DIR}/red_agent/iteration_{iteration}")
        
        red_env.close()
        
        print(f"\nIteration {iteration + 1} complete!")
    
    # Save final models
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    
    blue_model.save(f"{settings.MODEL_DIR}/blue_agent/final")
    red_model.save(f"{settings.MODEL_DIR}/red_agent/final")
    
    print(f"\nModels saved to {settings.MODEL_DIR}")


if __name__ == "__main__":
    train_self_play(
        total_timesteps=1_000_000,
        n_envs=4,
        iterations=20,
    )
```

### 6.5 FastAPI Application

**File: `src/api/main.py`**

```python
"""
FastAPI application for serving RL models and managing simulations
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json
from typing import Dict, List
import numpy as np

from ..config.settings import settings
from .routes import simulation, agents, detection, playbooks
from .websocket import ConnectionManager
from ..environment.cyber_env import CyberSecurityEnv
from stable_baselines3 import PPO


# Global state
app_state = {
    "red_model": None,
    "blue_model": None,
    "active_simulations": {},
    "connection_manager": ConnectionManager(),
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup"""
    print("Loading models...")
    
    try:
        app_state["red_model"] = PPO.load(f"{settings.MODEL_DIR}/red_agent/final")
        app_state["blue_model"] = PPO.load(f"{settings.MODEL_DIR}/blue_agent/final")
        print("✓ Models loaded successfully")
    except Exception as e:
        print(f"✗ Error loading models: {e}")
    
    yield
    
    # Cleanup
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="CyberGuardian AI API",
    description="RL-powered cybersecurity threat detection system",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(simulation.router, prefix="/api/simulation", tags=["Simulation"])
app.include_router(agents.router, prefix="/api/agents", tags=["Agents"])
app.include_router(detection.router, prefix="/api/detection", tags=["Detection"])
app.include_router(playbooks.router, prefix="/api/playbooks", tags=["Playbooks"])


@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "online",
        "models_loaded": {
            "red": app_state["red_model"] is not None,
            "blue": app_state["blue_model"] is not None,
        }
    }


@app.websocket("/ws/simulation/{simulation_id}")
async def websocket_simulation(websocket: WebSocket, simulation_id: str):
    """
    WebSocket endpoint for real-time simulation streaming
    
    Client receives:
        - Network state updates
        - Agent actions
        - Rewards
        - Logs
    """
    await app_state["connection_manager"].connect(simulation_id, websocket)
    
    try:
        # Get or create simulation
        if simulation_id not in app_state["active_simulations"]:
            env = CyberSecurityEnv(num_hosts=20, max_steps=100)
            app_state["active_simulations"][simulation_id] = {
                "env": env,
                "step": 0,
                "done": False,
            }
        
        sim = app_state["active_simulations"][simulation_id]
        env = sim["env"]
        
        # Send initial state
        obs, info = env.reset()
        await app_state["connection_manager"].send_json(simulation_id, {
            "type": "init",
            "observation": _serialize_observation(obs),
            "info": _serialize_info(info),
        })
        
        # Simulation loop
        while not sim["done"]:
            # Wait for client message (step command)
            data = await websocket.receive_json()
            
            if data.get("command") == "step":
                # Get agent actions
                red_action, _ = app_state["red_model"].predict(obs, deterministic=False)
                blue_action, _ = app_state["blue_model"].predict(obs, deterministic=False)
                
                action = {
                    "red_action": red_action,
                    "blue_action": blue_action,
                }
                
                # Execute step
                obs, rewards, terminated, truncated, info = env.step(action)
                sim["step"] += 1
                sim["done"] = terminated or truncated
                
                # Send update
                await app_state["connection_manager"].send_json(simulation_id, {
                    "type": "step",
                    "step": sim["step"],
                    "observation": _serialize_observation(obs),
                    "actions": {
                        "red": red_action.tolist(),
                        "blue": blue_action.tolist(),
                    },
                    "rewards": rewards,
                    "terminated": terminated,
                    "truncated": truncated,
                    "info": _serialize_info(info),
                })
                
                # Small delay for visualization
                await asyncio.sleep(0.5)
            
            elif data.get("command") == "reset":
                obs, info = env.reset()
                sim["step"] = 0
                sim["done"] = False
                
                await app_state["connection_manager"].send_json(simulation_id, {
                    "type": "reset",
                    "observation": _serialize_observation(obs),
                    "info": _serialize_info(info),
                })
    
    except WebSocketDisconnect:
        app_state["connection_manager"].disconnect(simulation_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await app_state["connection_manager"].send_json(simulation_id, {
            "type": "error",
            "message": str(e),
        })


def _serialize_observation(obs: Dict) -> Dict:
    """Convert numpy arrays to lists"""
    return {
        key: value.tolist() if isinstance(value, np.ndarray) else value
        for key, value in obs.items()
    }


def _serialize_info(info: Dict) -> Dict:
    """Serialize info dict"""
    serialized = {}
    for key, value in info.items():
        if isinstance(value, (list, set)):
            serialized[key] = list(value)
        elif isinstance(value, np.ndarray):
            serialized[key] = value.tolist()
        else:
            serialized[key] = value
    return serialized


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.api.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True,
    )
```

---

## 7. FRONTEND DEVELOPMENT (Abhishek's Part)

### 7.1 Environment Setup

```bash
# 1. Create frontend repository
mkdir frontend && cd frontend

# 2. Initialize Vite + React + TypeScript
npm create vite@latest . -- --template react-ts

# 3. Install dependencies
npm install

# Core libraries
npm install axios socket.io-client @tanstack/react-query zustand

# Visualization
npm install d3 recharts react-force-graph framer-motion

# UI Components
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
    @radix-ui/react-select @radix-ui/react-tabs lucide-react

# Styling
npm install tailwindcss postcss autoprefixer clsx tailwind-merge
npm install -D @tailwindcss/typography

# Utilities
npm install date-fns react-hot-toast

# Development
npm install -D eslint prettier eslint-config-prettier \
    @typescript-eslint/eslint-plugin @typescript-eslint/parser

# 4. Initialize Tailwind
npx tailwindcss init -p
```

### 7.2 Project Configuration

**File: `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
```

**File: `tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom color palette for cybersecurity theme
        cyber: {
          bg: '#0a0e27',
          surface: '#151932',
          border: '#1e2749',
          primary: '#00ff88',
          secondary: '#0099ff',
          danger: '#ff0055',
          warning: '#ffaa00',
          success: '#00ff88',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #00ff88, 0 0 10px #00ff88' },
          '100%': { boxShadow: '0 0 10px #00ff88, 0 0 20px #00ff88, 0 0 30px #00ff88' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
```

### 7.3 Type Definitions

**File: `src/types/simulation.ts`**

```typescript
/**
 * Type definitions for simulation-related data structures
 */

export interface NetworkNode {
  id: number;
  type: 'dmz' | 'app_server' | 'db_server' | 'workstation';
  status: 'clean' | 'compromised' | 'isolated' | 'detected';
  vulnerabilityScore: number;
  dataValue: number;
  patchLevel: 'current' | 'outdated';
  connections: number[];
}

export interface NetworkTopology {
  nodes: NetworkNode[];
  edges: Array<[number, number]>;
  adjacencyMatrix: number[][];
}

export interface AgentAction {
  agent: 'red' | 'blue';
  targetHost: number;
  actionType: number;
  actionName: string;
  timestamp: number;
}

export interface SimulationState {
  step: number;
  maxSteps: number;
  isRunning: boolean;
  isPaused: boolean;
  speed: number; // 0.5x, 1x, 2x, 4x
}

export interface Observation {
  networkTopology: number[][];
  hostStatus: number[];
  trafficMatrix: number[][];
  alertScores: number[][];
  timeStep: number[];
}

export interface SimulationInfo {
  compromisedHosts: number[];
  detectedCompromises: number[];
  isolatedHosts: number[];
  dataExfiltrated: number;
  truePositives: number;
  falsePositives: number;
  redCaught: boolean;
  logs: LogEntry[];
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'scan' | 'exploit' | 'lateral_movement' | 'exfiltration' | 'beacon' | 
        'monitor' | 'isolate' | 'patch' | 'block_ip' | 'reset_creds' | 'investigate';
  source?: number;
  target?: number;
  destination?: number;
  success?: boolean;
  metadata?: Record<string, any>;
}

export interface Rewards {
  red: number;
  blue: number;
}

export interface SimulationEpisode {
  id: string;
  startTime: number;
  endTime?: number;
  totalSteps: number;
  winner: 'red' | 'blue' | 'draw' | null;
  finalRewards: Rewards;
  metrics: {
    detectionRate: number;
    falsePositiveRate: number;
    dataLoss: number;
    responseTime: number;
  };
}
```

**File: `src/types/detection.ts`**

```typescript
/**
 * Type definitions for threat detection
 */

export type ThreatType = 
  | 'brute_force' 
  | 'lateral_movement' 
  | 'data_exfiltration' 
  | 'c2_beacon';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ThreatAlert {
  id: string;
  timestamp: number;
  threatType: ThreatType;
  severity: SeverityLevel;
  confidence: number;
  affectedHosts: number[];
  description: string;
  indicators: string[];
  mitreId?: string;
  mitreName?: string;
  recommended Actions: string[];
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
}

export interface DetectionMetrics {
  totalAlerts: number;
  criticalAlerts: number;
  truePositives: number;
  falsePositives: number;
  detectionRate: number;
  averageResponseTime: number;
}

export interface MitreTechnique {
  id: string;
  name: string;
  description: string;
  tactics: string[];
  detectionMethods: string[];
}
```

### 7.4 API Client

**File: `src/api/client.ts`**

```typescript
/**
 * Axios client for API communication
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/config/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add any auth tokens here
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle errors globally
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
```

**File: `src/api/websocket.ts`**

```typescript
/**
 * WebSocket client for real-time simulation streaming
 */

import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from '@/config/api';
import { Observation, SimulationInfo, Rewards } from '@/types/simulation';

export interface SimulationMessage {
  type: 'init' | 'step' | 'reset' | 'error';
  step?: number;
  observation?: Observation;
  actions?: {
    red: number[];
    blue: number[];
  };
  rewards?: Rewards;
  terminated?: boolean;
  truncated?: boolean;
  info?: SimulationInfo;
  message?: string;
}

export class SimulationWebSocket {
  private socket: WebSocket | null = null;
  private simulationId: string;
  private messageHandlers: Map<string, (data: SimulationMessage) => void> = new Map();

  constructor(simulationId: string) {
    this.simulationId = simulationId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${WS_BASE_URL}/simulation/${this.simulationId}`;
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log(`WebSocket connected: ${this.simulationId}`);
        resolve();
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.socket.onmessage = (event) => {
        try {
          const data: SimulationMessage = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
      };
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  send(command: string, data?: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    this.socket.send(JSON.stringify({ command, ...data }));
  }

  step(): void {
    this.send('step');
  }

  reset(): void {
    this.send('reset');
  }

  on(eventType: string, handler: (data: SimulationMessage) => void): void {
    this.messageHandlers.set(eventType, handler);
  }

  off(eventType: string): void {
    this.messageHandlers.delete(eventType);
  }

  private handleMessage(data: SimulationMessage): void {
    const handler = this.messageHandlers.get(data.type);
    if (handler) {
      handler(data);
    }

    // Global handler
    const globalHandler = this.messageHandlers.get('*');
    if (globalHandler) {
      globalHandler(data);
    }
  }
}
```

### 7.5 State Management

**File: `src/store/simulationStore.ts`**

```typescript
/**
 * Zustand store for simulation state
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  NetworkTopology,
  SimulationState,
  Observation,
  SimulationInfo,
  Rewards,
  LogEntry,
  AgentAction,
} from '@/types/simulation';

interface SimulationStore {
  // State
  simulationId: string | null;
  state: SimulationState;
  network: NetworkTopology | null;
  observation: Observation | null;
  info: SimulationInfo | null;
  rewards: Rewards;
  logs: LogEntry[];
  actions: AgentAction[];
  
  // Actions
  setSimulationId: (id: string) => void;
  setState: (state: Partial<SimulationState>) => void;
  setNetwork: (network: NetworkTopology) => void;
  updateObservation: (obs: Observation) => void;
  updateInfo: (info: SimulationInfo) => void;
  updateRewards: (rewards: Rewards) => void;
  addLog: (log: LogEntry) => void;
  addAction: (action: AgentAction) => void;
  reset: () => void;
}

const initialState = {
  simulationId: null,
  state: {
    step: 0,
    maxSteps: 100,
    isRunning: false,
    isPaused: false,
    speed: 1,
  },
  network: null,
  observation: null,
  info: null,
  rewards: { red: 0, blue: 0 },
  logs: [],
  actions: [],
};

export const useSimulationStore = create<SimulationStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setSimulationId: (id) => set({ simulationId: id }),

      setState: (stateUpdate) => set((state) => ({
        state: { ...state.state, ...stateUpdate },
      })),

      setNetwork: (network) => set({ network }),

      updateObservation: (obs) => set({ observation: obs }),

      updateInfo: (info) => set((state) => ({
        info,
        logs: [...state.logs, ...(info.logs || [])].slice(-100), // Keep last 100 logs
      })),

      updateRewards: (rewards) => set({ rewards }),

      addLog: (log) => set((state) => ({
        logs: [...state.logs, log].slice(-100),
      })),

      addAction: (action) => set((state) => ({
        actions: [...state.actions, action].slice(-50), // Keep last 50 actions
      })),

      reset: () => set(initialState),
    }),
    { name: 'SimulationStore' }
  )
);
```

### 7.6 Network Visualization Component

**File: `src/components/visualization/NetworkTopology.tsx`**

```typescript
/**
 * D3.js-based network topology visualization
 */

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { NetworkNode } from '@/types/simulation';

interface NetworkTopologyProps {
  nodes: NetworkNode[];
  edges: Array<[number, number]>;
  compromisedHosts: number[];
  detectedCompromises: number[];
  isolatedHosts: number[];
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: number) => void;
}

export const NetworkTopology: React.FC<NetworkTopologyProps> = ({
  nodes,
  edges,
  compromisedHosts,
  detectedCompromises,
  isolatedHosts,
  width = 800,
  height = 600,
  onNodeClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  useEffect(() => {
    if (!svgRef.current || !nodes.length) return;

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);

    // Create force simulation
    const simulation = d3
      .forceSimulation(nodes as any)
      .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create container groups
    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Draw edges
    const link = g
      .append('g')
      .selectAll('line')
      .data(edges)
      .enter()
      .append('line')
      .attr('stroke', '#1e2749')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6);

    // Draw nodes
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .call(
        d3.drag<any, any>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended)
      );

    // Node circles
    node
      .append('circle')
      .attr('r', 20)
      .attr('fill', (d) => getNodeColor(d))
      .attr('stroke', (d) => getNodeStroke(d))
      .attr('stroke-width', 3)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        onNodeClick?.(d.id);
      })
      .on('mouseenter', (event, d) => {
        setHoveredNode(d.id);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      });

    // Node labels
    node
      .append('text')
      .text((d) => `Host ${d.id}`)
      .attr('text-anchor', 'middle')
      .attr('dy', 35)
      .attr('font-size', 12)
      .attr('fill', '#ffffff')
      .style('pointer-events', 'none');

    // Node icons (based on type)
    node
      .append('text')
      .text((d) => getNodeIcon(d.type))
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('font-size', 16)
      .style('pointer-events', 'none');

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Helper functions
    function getNodeColor(node: NetworkNode): string {
      if (isolatedHosts.includes(node.id)) return '#666666';
      if (detectedCompromises.includes(node.id)) return '#ffaa00';
      if (compromisedHosts.includes(node.id)) return '#ff0055';
      return '#00ff88';
    }

    function getNodeStroke(node: NetworkNode): string {
      if (detectedCompromises.includes(node.id)) return '#ffaa00';
      if (compromisedHosts.includes(node.id)) return '#ff0055';
      return '#00ff88';
    }

    function getNodeIcon(type: string): string {
      switch (type) {
        case 'dmz':
          return '🌐';
        case 'app_server':
          return '⚙️';
        case 'db_server':
          return '🗄️';
        case 'workstation':
          return '💻';
        default:
          return '📟';
      }
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [nodes, edges, compromisedHosts, detectedCompromises, isolatedHosts]);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="bg-cyber-bg rounded-lg"
      />
      
      {/* Legend */}
      <div className="absolute top-4 right-4 bg-cyber-surface p-4 rounded-lg border border-cyber-border">
        <h3 className="text-sm font-semibold text-white mb-2">Legend</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyber-success" />
            <span className="text-gray-300">Clean</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyber-danger" />
            <span className="text-gray-300">Compromised</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyber-warning" />
            <span className="text-gray-300">Detected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-600" />
            <span className="text-gray-300">Isolated</span>
          </div>
        </div>
      </div>

      {/* Node info tooltip */}
      {hoveredNode !== null && (
        <div className="absolute top-4 left-4 bg-cyber-surface p-4 rounded-lg border border-cyber-border">
          <h3 className="text-sm font-semibold text-white">Host {hoveredNode}</h3>
          <div className="mt-2 space-y-1 text-xs text-gray-300">
            <div>Type: {nodes[hoveredNode]?.type}</div>
            <div>Vulnerability: {(nodes[hoveredNode]?.vulnerabilityScore * 100).toFixed(0)}%</div>
            <div>Data Value: {nodes[hoveredNode]?.dataValue.toFixed(1)} GB</div>
            <div>Patch Level: {nodes[hoveredNode]?.patchLevel}</div>
          </div>
        </div>
      )}
    </div>
  );
};
```

---

## 8. INTEGRATION POINTS

### 8.1 API Contract

**Critical endpoints that must match between backend & frontend:**

| Endpoint | Method | Request | Response | Owner |
|----------|--------|---------|----------|-------|
| `/api/simulation/create` | POST | `{ num_hosts, max_steps }` | `{ simulation_id }` | GiGi |
| `/api/simulation/{id}/start` | POST | - | `{ status: "started" }` | GiGi |
| `/api/simulation/{id}/pause` | POST | - | `{ status: "paused" }` | GiGi |
| `/api/simulation/{id}/reset` | POST | - | `{ status: "reset" }` | GiGi |
| `/api/agents/info` | GET | - | `{ red: {...}, blue: {...} }` | GiGi |
| `/api/detection/alerts` | GET | `?limit=50` | `{ alerts: [...] }` | GiGi |
| `/api/playbooks/generate` | POST | `{ alert_id }` | `{ playbook: {...} }` | GiGi |
| `/ws/simulation/{id}` | WS | `{ command: "step" }` | `{ type, observation, ... }` | GiGi |

**Integration Checklist:**

- [ ] **Week 2, Day 14:** API contract document created (GiGi)
- [ ] **Week 2, Day 14:** Frontend mock data matches API schema (Abhishek)
- [ ] **Week 3, Day 15:** First successful API call from frontend
- [ ] **Week 3, Day 16:** WebSocket connection established
- [ ] **Week 3, Day 21:** Full end-to-end test (create sim → run → display)

### 8.2 Data Flow Diagram

```
┌─────────────┐                    ┌─────────────┐
│   FRONTEND  │                    │   BACKEND   │
│  (Abhishek) │                    │   (GiGi)    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  POST /api/simulation/create     │
       ├─────────────────────────────────>│
       │                                  │ Create CyberSecurityEnv
       │                                  │ env.reset()
       │                                  │
       │  { simulation_id: "abc123" }     │
       │<─────────────────────────────────┤
       │                                  │
       │  WS /ws/simulation/abc123        │
       ├─────────────────────────────────>│
       │                                  │ Accept WebSocket
       │                                  │
       │  { type: "init", observation }   │
       │<─────────────────────────────────┤
       │                                  │
       │  Display network graph           │
       │                                  │
       │  { command: "step" }             │
       ├─────────────────────────────────>│
       │                                  │ red_model.predict()
       │                                  │ blue_model.predict()
       │                                  │ env.step(actions)
       │                                  │
       │  { type: "step", obs, rewards }  │
       │<─────────────────────────────────┤
       │                                  │
       │  Update UI (network + metrics)   │
       │                                  │
       │  (repeat until episode ends)     │
       │                                  │
```

### 8.3 Shared Constants

**Both repos must use these exact values:**

**File: Backend `src/config/constants.py`**

```python
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
```

**File: Frontend `src/config/constants.ts`**

```typescript
// Threat types
export const THREAT_TYPES = {
  0: 'brute_force',
  1: 'lateral_movement',
  2: 'data_exfiltration',
  3: 'c2_beacon',
} as const;

// Severity levels
export const SEVERITY_LEVELS = {
  0: 'low',
  1: 'medium',
  2: 'high',
  3: 'critical',
} as const;

// Node types
export const NODE_TYPES = {
  dmz: 0,
  app_server: 1,
  db_server: 2,
  workstation: 3,
} as const;

// Red agent actions
export const RED_ACTIONS = {
  0: 'scan',
  1: 'exploit',
  2: 'lateral_move',
  3: 'exfiltrate',
  4: 'beacon',
  5: 'wait',
} as const;

// Blue agent actions
export const BLUE_ACTIONS = {
  0: 'monitor',
  1: 'isolate',
  2: 'patch',
  3: 'block_ip',
  4: 'reset_creds',
  5: 'investigate',
} as const;
```

---

## 9. API SPECIFICATIONS

### 9.1 Complete REST API Documentation

```yaml
openapi: 3.0.0
info:
  title: CyberGuardian AI API
  version: 1.0.0
  description: RL-powered cybersecurity threat detection

servers:
  - url: http://localhost:8000
    description: Development server

paths:
  /:
    get:
      summary: Health check
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                  models_loaded:
                    type: object
                    properties:
                      red:
                        type: boolean
                      blue:
                        type: boolean

  /api/simulation/create:
    post:
      summary: Create new simulation
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                num_hosts:
                  type: integer
                  default: 20
                max_steps:
                  type: integer
                  default: 100
      responses:
        '200':
          description: Simulation created
          content:
            application/json:
              schema:
                type: object
                properties:
                  simulation_id:
                    type: string
                  network_topology:
                    type: object

  /api/simulation/{id}/info:
    get:
      summary: Get simulation information
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Simulation info
          content:
            application/json:
              schema:
                type: object

  /api/agents/info:
    get:
      summary: Get agent information
      responses:
        '200':
          description: Agent stats
          content:
            application/json:
              schema:
                type: object
                properties:
                  red:
                    type: object
                    properties:
                      total_episodes:
                        type: integer
                      win_rate:
                        type: number
                      avg_reward:
                        type: number
                  blue:
                    type: object

  /api/detection/alerts:
    get:
      summary: Get recent alerts
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 50
      responses:
        '200':
          description: List of alerts
          content:
            application/json:
              schema:
                type: object
                properties:
                  alerts:
                    type: array
                    items:
                      type: object

  /api/playbooks/generate:
    post:
      summary: Generate playbook for alert
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                alert_id:
                  type: string
                threat_type:
                  type: string
      responses:
        '200':
          description: Generated playbook
          content:
            application/json:
              schema:
                type: object
                properties:
                  playbook:
                    type: object

  /ws/simulation/{id}:
    get:
      summary: WebSocket endpoint for real-time simulation
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      description: |
        WebSocket connection for streaming simulation updates.
        
        Client sends:
          { "command": "step" }  - Execute one simulation step
          { "command": "reset" } - Reset simulation
        
        Server sends:
          { "type": "init", "observation": {...}, "info": {...} }
          { "type": "step", "observation": {...}, "rewards": {...}, ... }
          { "type": "error", "message": "..." }
```

---

## 10. DATABASE SCHEMA

**File: Backend `src/database/models.py`**

```python
"""
SQLAlchemy database models
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class Episode(Base):
    """Simulation episode record"""
    __tablename__ = "episodes"
    
    id = Column(String, primary_key=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    total_steps = Column(Integer)
    winner = Column(String)  # 'red', 'blue', 'draw'
    
    # Metrics
    final_red_reward = Column(Float)
    final_blue_reward = Column(Float)
    detection_rate = Column(Float)
    false_positive_rate = Column(Float)
    data_loss = Column(Float)
    
    # Relationships
    logs = relationship("Log", back_populates="episode")
    alerts = relationship("Alert", back_populates="episode")


class Log(Base):
    """Security event log"""
    __tablename__ = "logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    episode_id = Column(String, ForeignKey("episodes.id"))
    timestamp = Column(Integer)  # Simulation step
    event_type = Column(String)
    source_host = Column(Integer, nullable=True)
    target_host = Column(Integer, nullable=True)
    success = Column(Boolean, nullable=True)
    metadata = Column(JSON, nullable=True)
    
    # Relationship
    episode = relationship("Episode", back_populates="logs")


class Alert(Base):
    """Threat alert"""
    __tablename__ = "alerts"
    
    id = Column(String, primary_key=True)
    episode_id = Column(String, ForeignKey("episodes.id"))
    timestamp = Column(Integer)
    threat_type = Column(String)
    severity = Column(String)
    confidence = Column(Float)
    affected_hosts = Column(JSON)  # List of host IDs
    description = Column(String)
    mitre_id = Column(String, nullable=True)
    status = Column(String, default="active")
    
    # Relationship
    episode = relationship("Episode", back_populates="alerts")


class Model(Base):
    """Trained model metadata"""
    __tablename__ = "models"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_type = Column(String)  # 'red' or 'blue'
    version = Column(String)
    training_steps = Column(Integer)
    win_rate = Column(Float)
    avg_reward = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    file_path = Column(String)
    is_active = Column(Boolean, default=False)
```

---

## 11. RL ENVIRONMENT SPECIFICATIONS

(See section 6.2 for full implementation)

**Key Requirements:**

- **State Space Dimension:** 20 hosts × (topology + status + traffic + alerts)
- **Action Space:** 6 actions × 20 hosts (both agents)
- **Reward Range:** [-100, +100] per step
- **Episode Length:** Max 100 steps
- **Partial Observability:** Blue agent only sees detected compromises
- **Stochasticity:** Exploit success rates, traffic patterns

**Performance Targets:**

- Environment reset time: <50ms
- Step execution time: <10ms
- Memory usage per environment: <100MB

---

## 12. TRAINING PIPELINE

### 12.1 Training Strategy

**Self-Play Schedule:**

```
Iteration 1:  Blue vs Random Red    (50k steps each)
Iteration 2:  Blue vs Red_v1        (50k steps each)
...
Iteration 20: Blue_v19 vs Red_v19   (50k steps each)
```

**Total Training:** 20 iterations × 100k steps = 2M steps (~8-12 hours on GPU)

### 12.2 Hyperparameters

```python
# PPO Hyperparameters (both agents)
LEARNING_RATE = 3e-4
N_STEPS = 2048
BATCH_SIZE = 64
N_EPOCHS = 10
GAMMA = 0.99          # Discount factor
GAE_LAMBDA = 0.95     # GAE parameter
CLIP_RANGE = 0.2      # PPO clip range
ENT_COEF = 0.01       # Entropy coefficient
VF_COEF = 0.5         # Value function coefficient
MAX_GRAD_NORM = 0.5   # Gradient clipping
```

### 12.3 Evaluation Metrics

Track during training:

- Win rate (per agent)
- Average episode reward
- Detection rate (true positives / total compromises)
- False positive rate
- Average response time (steps to detection)

---

## 13. FRONTEND DESIGN SYSTEM

### 13.1 Color Palette

```css
/* Cybersecurity Theme */
--color-bg: #0a0e27;          /* Dark blue background */
--color-surface: #151932;      /* Card background */
--color-border: #1e2749;       /* Borders */

--color-primary: #00ff88;      /* Success green */
--color-secondary: #0099ff;    /* Info blue */
--color-danger: #ff0055;       /* Critical red */
--color-warning: #ffaa00;      /* Warning yellow */

--color-text-primary: #ffffff;
--color-text-secondary: #a0aec0;
--color-text-muted: #718096;
```

### 13.2 Typography

```css
/* Font families */
font-family-sans: 'Inter', system-ui, sans-serif;
font-family-mono: 'JetBrains Mono', monospace;

/* Font sizes */
text-xs: 0.75rem;     /* 12px */
text-sm: 0.875rem;    /* 14px */
text-base: 1rem;      /* 16px */
text-lg: 1.125rem;    /* 18px */
text-xl: 1.25rem;     /* 20px */
text-2xl: 1.5rem;     /* 24px */
text-3xl: 1.875rem;   /* 30px */
```

### 13.3 Component Library

**Button Variants:**

```tsx
<Button variant="primary">Start Simulation</Button>
<Button variant="danger">Stop</Button>
<Button variant="ghost">Cancel</Button>
```

**Card Component:**

```tsx
<Card>
  <CardHeader>
    <CardTitle>Network Status</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

**Badge for Severity:**

```tsx
<Badge severity="critical">CRITICAL</Badge>
<Badge severity="high">HIGH</Badge>
<Badge severity="medium">MEDIUM</Badge>
<Badge severity="low">LOW</Badge>
```

---

## 14. DEPLOYMENT GUIDE

### 14.1 Docker Setup

**File: `docker-compose.yml`**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: cyberguardian
      POSTGRES_PASSWORD: securepassword
      POSTGRES_DB: cyberguardian
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://cyberguardian:securepassword@postgres:5432/cyberguardian
      - REDIS_URL=redis://redis:6379/0
    volumes:
      - ./backend:/app
      - ./backend/models:/app/models
    depends_on:
      - postgres
      - redis
    command: uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://localhost:8000
    depends_on:
      - backend

volumes:
  postgres_data:
```

**Backend Dockerfile:**

```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Frontend Dockerfile:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application
COPY . .

# Expose port
EXPOSE 5173

# Run development server
CMD ["npm", "run", "dev", "--", "--host"]
```

### 14.2 Deployment Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop all services
docker-compose down

# Rebuild after changes
docker-compose up -d --build

# Run database migrations
docker-compose exec backend alembic upgrade head
```

---

## 15. TESTING STRATEGY

### 15.1 Backend Tests

```python
# tests/test_environment.py

def test_environment_reset():
    env = CyberSecurityEnv()
    obs, info = env.reset()
    
    assert obs is not None
    assert len(info['compromised_hosts']) == 1
    assert info['data_exfiltrated'] == 0

def test_red_action_exploit():
    env = CyberSecurityEnv()
    env.reset()
    
    # Execute exploit action
    action = {
        'red_action': [5, 1],  # Target host 5, exploit
        'blue_action': [0, 0],  # Monitor host 0
    }
    
    obs, rewards, terminated, truncated, info = env.step(action)
    
    assert 'red' in rewards
    assert 'blue' in rewards
```

### 15.2 Frontend Tests

```typescript
// tests/components/NetworkTopology.test.tsx

import { render, screen } from '@testing-library/react';
import { NetworkTopology } from '@/components/visualization/NetworkTopology';

test('renders network nodes', () => {
  const nodes = [
    { id: 0, type: 'dmz', status: 'clean', ... },
    { id: 1, type: 'app_server', status: 'compromised', ... },
  ];
  
  const edges = [[0, 1]];
  
  render(
    <NetworkTopology 
      nodes={nodes} 
      edges={edges}
      compromisedHosts={[1]}
      detectedCompromises={[]}
      isolatedHosts={[]}
    />
  );
  
  // Check if nodes are rendered
  expect(screen.getByText(/Host 0/i)).toBeInTheDocument();
  expect(screen.getByText(/Host 1/i)).toBeInTheDocument();
});
```

---

## 16. TROUBLESHOOTING GUIDE

### 16.1 Common Backend Issues

**Issue:** `ModuleNotFoundError: No module named 'src'`

**Solution:**
```bash
# Add src to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:${PWD}"

# Or run with python -m
python -m src.api.main
```

**Issue:** Training crashes with OOM error

**Solution:**
```python
# Reduce n_envs or batch_size
n_envs = 2  # Instead of 4
batch_size = 32  # Instead of 64
```

**Issue:** WebSocket connection refused

**Solution:**
```python
# Check CORS settings in main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Add frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 16.2 Common Frontend Issues

**Issue:** `Cannot find module '@/components/...'`

**Solution:**
```json
// Ensure vite.config.ts has path alias
{
  "resolve": {
    "alias": {
      "@": path.resolve(__dirname, "./src")
    }
  }
}
```

**Issue:** D3 visualization not rendering

**Solution:**
```typescript
// Ensure useEffect dependency array is correct
useEffect(() => {
  // D3 code
}, [nodes, edges]);  // Re-render when data changes
```

**Issue:** WebSocket not connecting

**Solution:**
```typescript
// Check proxy configuration in vite.config.ts
server: {
  proxy: {
    '/ws': {
      target: 'ws://localhost:8000',
      ws: true,
    },
  },
}
```

---

## 17. DEMO PREPARATION

### 17.1 Demo Checklist (1 Week Before)

**Backend (GiGi):**
- [ ] Models trained to 70%+ Blue win rate
- [ ] All API endpoints tested and documented
- [ ] WebSocket working with zero crashes
- [ ] 3 pre-loaded demo scenarios (easy, medium, hard)
- [ ] Database populated with sample episodes
- [ ] Docker deployment tested

**Frontend (Abhishek):**
- [ ] All 5 pages working (Home, Live, Simulation, Training, Playbooks)
- [ ] Network graph renders smoothly (60fps)
- [ ] Real-time updates work without lag
- [ ] Mobile responsive (tested on phone)
- [ ] Zero console errors
- [ ] Animations polished

**Integration:**
- [ ] End-to-end test: Create sim → Run → Visualize → Generate playbook
- [ ] Load test: 10 concurrent simulations
- [ ] Demo rehearsal with timer (5 minutes)

### 17.2 Demo Script

```
[00:00 - 00:30] HOOK
"Traditional threat detection is reactive. We built something different."
[Show dashboard with live simulation]

[00:30 - 01:30] PROBLEM
"Attackers adapt. Rules don't. We trained AI agents to battle each other
 for 1 million steps. The result? A defender that thinks like an attacker."
[Show training curves]

[01:30 - 03:00] DEMO
"Watch this live: Red agent probes the network. Blue agent detects it.
 Not with rules—with learned patterns."
[Run pre-loaded simulation, narrate actions]

[03:00 - 04:00] INNOVATION
"Here's the magic: We can simulate the future. What if we don't act?
 The system shows you. Attack spreads, data stolen, $4.2M loss projected."
[Show simulation mode]

[04:00 - 04:45] PLAYBOOK
"And it auto-generates the fix. Not generic advice—specific commands
 for this exact attack."
[Show generated playbook]

[04:45 - 05:00] CLOSE
"CyberGuardian AI: We don't just detect threats. We predict them."
```

---

## 18. APPENDIX

### 18.1 Skills Required

**GiGi (Backend):**
- Python (advanced)
- Reinforcement Learning (PPO, Gym)
- FastAPI / REST APIs
- WebSockets
- PostgreSQL / SQL
- Docker
- NumPy, Pandas

**Abhishek (Frontend):**
- React + TypeScript (advanced)
- D3.js (data visualization)
- WebSockets (client)
- Zustand / state management
- Tailwind CSS
- Git / GitHub

**Shared:**
- Git collaboration (branching, merging)
- API design
- System architecture
- Debugging
- Documentation

### 18.2 Learning Resources

**RL & Gymnasium:**
- Stable-Baselines3 docs: https://stable-baselines3.readthedocs.io/
- Gymnasium tutorial: https://gymnasium.farama.org/tutorials/

**FastAPI:**
- Official docs: https://fastapi.tiangolo.com/
- WebSockets guide: https://fastapi.tiangolo.com/advanced/websockets/

**D3.js:**
- Observable tutorials: https://observablehq.com/@d3/learn-d3
- Force-directed graph: https://d3-graph-gallery.com/network.html

**Docker:**
- Docker Compose docs: https://docs.docker.com/compose/

### 18.3 Timeline Summary

```
Week 1: Foundation (Independent work)
Week 2: Core logic (API contract by Day 14)
Week 3: Integration (Full system test by Day 21)
Week 4: Polish & prep (Demo ready by Day 28)
Hackathon: Final features + presentation
```

### 18.4 Communication Protocol

**Daily Standup:** 10 AM (async via shared doc)

**Integration Sync:** Every 3 days (30-minute call)

**Blocker Resolution:** Within 24 hours

**Code Review:** All PRs reviewed within 12 hours

**Emergency Contact:** Direct message for critical issues

---

## 19. SUCCESS METRICS

**Hackathon Judging Criteria (Estimated):**

| Category | Weight | Our Target |
|----------|--------|------------|
| **Innovation** | 30% | 95/100 (RL approach is unique) |
| **Technical Complexity** | 25% | 90/100 (Multi-agent RL + full stack) |
| **Demo Quality** | 20% | 95/100 (Polished UI + live AI battle) |
| **Completeness** | 15% | 85/100 (All core features working) |
| **Presentation** | 10% | 90/100 (Clear, compelling story) |
| **TOTAL** | 100% | **92/100** |

**Win Probability: 85-92%**

---

## 20. FINAL NOTES

### 20.1 Critical Success Factors

1. **Start Training Early:** Models need 1M+ steps (8-12 hours)
2. **API Contract First:** Agree on schemas before coding
3. **Test Integration Often:** Don't wait until Week 4
4. **Backup Plans:** If WebSocket fails, fall back to polling
5. **Demo Data:** Pre-load 3 perfect scenarios for presentation

### 20.2 Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Training doesn't converge | Medium | Use pre-trained checkpoints, simplify reward |
| WebSocket issues | Low | Implement HTTP polling fallback |
| D3 performance problems | Low | Limit to 20 nodes, optimize rendering |
| Integration bugs | Medium | Daily integration tests from Week 2 |
| Demo crash | Low | Multiple rehearsals, backup recording |

### 20.3 Post-Hackathon Roadmap

**If we win:**
1. Clean up code, add documentation
2. Create GitHub repo (public)
3. Write Medium article about RL approach
4. Submit to ML conferences (NeurIPS, ICML workshops)
5. Package as open-source tool

**Long-term:**
- Add real attack datasets (CICIDS, etc.)
- Implement more attack types
- Deploy as SaaS product
- Publish research paper

---

## CONCLUSION

This documentation provides everything needed to build CyberGuardian AI from scratch. Both team members should:

1. **Read this document fully** (bookmark it!)
2. **Follow the timeline strictly**
3. **Communicate daily** (async standups)
4. **Test integrations early** (Week 2, Day 14)
5. **Rehearse demo multiple times** (Week 4)

**Remember:** The RL approach is our differentiator. Nobody else will attempt this. Execute well, and we dominate.

**Good luck! 🚀**

---

**Document Version:** 1.0  
**Last Updated:** April 4, 2026  
**Next Review:** Start of Week 2  
**Questions?** Create a shared issues doc and tag each other.
