# CyberGuardian AI

Adversarial cybersecurity simulation platform where Red (attacker) and Blue (defender) AI agents train through self-play to detect and respond to cyber threats in real-time.

**Live Demo**: [https://cyberguardian-ai.vercel.app](https://cyberguardian-ai.vercel.app) (Frontend) + Local Backend

## Quick Start

### Prerequisites

- **Python 3.11** ([Download](https://www.python.org/downloads/release/python-3110/))
- **Node.js 20+** ([Download](https://nodejs.org/))
- **Git**

### 1. Clone & Setup Backend

```bash
git clone https://github.com/Abhishekgit01/CyberGuardian-AI.git
cd CyberGuardian-AI

# Create virtual environment
python3.11 -m venv backend/venv

# Activate (Linux/Mac)
source backend/venv/bin/activate

# Activate (Windows)
backend\venv\Scripts\activate

# Install dependencies
cd backend
pip install -r requirements.txt

# Start backend
cd ..
python -m uvicorn backend.src.api.main:app --host 0.0.0.0 --port 8001
```

**Backend should now be running at**: `http://localhost:8001`

### 2. Setup Frontend (New Terminal)

```bash
cd CyberGuardian-AI

# Install dependencies
npm install

# Start dev server
npm run dev
```

**Frontend should now be running at**: `http://localhost:5173`

### 3. Open in Browser

Navigate to `http://localhost:5173` and click "Try Demo" to start the simulation.

## Architecture

```
┌─────────────────┐     WebSocket/HTTP      ┌─────────────────┐
│   React Frontend│  ←──────────────────→   │  FastAPI Backend│
│   (Port 5173)   │                       │   (Port 8001)   │
└─────────────────┘                       └─────────────────┘
                                                │
                    ┌───────────────────────────┼───────────┐
                    │                           │           │
            ┌───────▼────────┐        ┌────────▼─────┐   ┌▼──────────┐
            │  RL Environment│        │  Detection   │   │  Agents   │
            │  (Gymnasium)   │        │  Pipeline    │   │  (PPO/LLM)│
            └────────────────┘        └──────────────┘   └───────────┘
```

## Project Structure

```
cyberguardian-ai/
├── backend/
│   ├── src/
│   │   ├── api/              # FastAPI routes
│   │   ├── agents/           # RL agents (Red/Blue)
│   │   ├── detection/        # Threat detection
│   │   ├── environment/      # CyberSecurityEnv
│   │   ├── simulation/       # Log generation
│   │   └── ...
│   ├── tests/                # Unit tests
│   └── venv/                 # Python virtual env
├── src/
│   ├── components/           # React components
│   ├── pages/                # Page components
│   └── store/                # State management
├── dist/                     # Built frontend
└── README.md
```

## Troubleshooting

### Backend Issues

**Error: `ModuleNotFoundError: No module named 'fastapi'`**
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

**Error: `ImportError: cannot import name 'CyberSecurityEnv'`**
Make sure you're running from the project root:
```bash
cd /path/to/CyberGuardian-AI
python -m uvicorn backend.src.api.main:app --host 0.0.0.0 --port 8001
```

**Backend not responding**
Check if port 8001 is in use:
```bash
lsof -i :8001  # Mac/Linux
netstat -ano | findstr 8001  # Windows
```
Kill existing process or use a different port:
```bash
python -m uvicorn backend.src.api.main:app --host 0.0.0.0 --port 8002
```

### Frontend Issues

**White screen / blank page**
1. Check backend is running: `curl http://localhost:8001/`
2. Check browser console (F12) for errors
3. Try clearing browser cache: Ctrl+Shift+R
4. Rebuild: `npm run build && npm run preview`

**Error: `Cannot find module '@splinetool/react-spline'`**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Vite not starting / port in use**
```bash
# Kill existing vite processes
pkill -f vite  # Mac/Linux
taskkill /F /IM node.exe  # Windows

# Or use different port
npm run dev -- --port 5174
```

### Connection Issues

**Frontend can't connect to backend**
1. Check both servers are running
2. Verify URLs:
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:8001`
3. In the app, go to Settings and check "Backend URL"
4. Try setting to `http://127.0.0.1:8001` instead of `localhost`

## What You See On Screen

### Live War Room

- **Network Map**: 20 interconnected nodes showing the cyber battlefield
- **Red Threats**: Compromised hosts (attacker positions)
- **Blue Defenses**: Protected/isolated hosts
- **Threat Radar**: Circular scanner showing hottest danger zones
- **Kill Chain**: Visual timeline of attack progression

### Neural Pipeline

Real-time AI decision visualization:
- **Intent Vector**: What the attacker is trying to do
- **Drift Detect**: When attack patterns change
- **Attack Graph**: Shortest path to critical assets
- **Shadow Branches**: Alternative defense strategies evaluated

### APT Attribution

Identifies which hacker group the attack resembles:
- Similarity matching against known APT profiles
- Confidence scoring
- Historical attack pattern comparison

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/api/simulation/create` | POST | Create new simulation |
| `/api/simulation/{id}/step` | POST | Advance one step |
| `/api/simulation/{id}/reset` | POST | Reset simulation |
| `/api/detection/alerts` | GET | Get all alerts |
| `/api/agents/info` | GET | Agent metrics |
| `/docs` | GET | Swagger UI |

## Development

### Running Tests

```bash
cd backend
source venv/bin/activate
python -m pytest tests/ -v
```

### Building for Production

```bash
# Frontend
npm run build

# Serve dist/ folder
npm run preview
```

## Tech Stack

**Backend**
- FastAPI (async web framework)
- Gymnasium (RL environments)
- Stable-Baselines3 (PPO agents)
- NetworkX (graph analysis)
- NumPy/Pandas (data processing)

**Frontend**
- React 19 + TypeScript
- Vite (build tool)
- Three.js (3D visualization)
- Spline (3D scenes)
- TailwindCSS (styling)

## License

MIT License - see LICENSE file for details.

## 30-Second Pitch

"Imagine a building with 20 rooms and one burglar trying to reach the safe. We trained one AI to play the burglar and another AI to play the guard a million times, so now the guard has seen almost every trick before. Instead of showing boring logs after the damage is done, our app shows the attack live, predicts where the burglar goes next, tells you how much time is left, and gives the team a clear plan to stop it."
