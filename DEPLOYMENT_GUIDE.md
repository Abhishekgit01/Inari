# Vercel Deployment Guide — Inari (CyberGuardian AI)

## Architecture Overview

This project has **two parts**:

| Part | Tech | Where to Deploy |
|------|------|-----------------|
| **Frontend** (React + Vite SPA) | TypeScript, R3F, Framer Motion | **Vercel** (static) |
| **Backend** (FastAPI + WebSocket) | Python, Stable-Baselines3, Gymnasium | **Railway / Render / Fly.io** (needs GPU/CPU for RL) |

> ⚠️ **Vercel cannot run the Python backend.** It only serves the static frontend. The backend must be deployed separately.

---

## Step 1: Deploy the Frontend to Vercel

### Prerequisites
- GitHub account with this repo pushed
- Vercel account (free tier works)

### Steps

1. **Go to [vercel.com](https://vercel.com)** → Sign up / Log in with GitHub

2. **Click "Add New" → "Project"**

3. **Import this repository** (`Abhishekgit01/Inari`)

4. **Configure Build Settings** (Vercel auto-detects Vite, but verify):
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Root Directory:** `./` (leave as default — the root IS the frontend project)

5. **Environment Variables** — Add these if needed:
   ```
   VITE_API_BASE_URL=https://your-backend-url.railway.app
   ```
   > The frontend's `apiBaseUrl` defaults to `http://127.0.0.1:8001`. For production, set this env var to your deployed backend URL.

6. **Click "Deploy"** — Vercel will:
   - Run `npm install`
   - Run `npm run build` (tsc + vite build)
   - Serve the `dist/` folder as a static SPA

7. **Your site is live** at `https://your-project.vercel.app`

### SPA Routing
The `vercel.json` in the repo root rewrites all route paths (`/features`, `/technology`, `/blogs`, `/about`, `/login`, `/live`, etc.) back to `index.html` so client-side routing works.

---

## Step 2: Deploy the Backend (Required for Live Simulation)

The backend is a **Python FastAPI** app with WebSocket support. Vercel cannot run this.

### Option A: Railway (Easiest)

1. Go to [railway.app](https://railway.app) → Sign up with GitHub
2. **New Project** → **Deploy from GitHub repo** → Select this repo
3. Set **Root Directory** to `backend/`
4. Railway auto-detects `requirements.txt`
5. Add a **Start Command**: `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables if needed (any API keys, model paths)
7. Deploy → You get a URL like `https://inari-backend.up.railway.app`
8. Set `VITE_API_BASE_URL` in Vercel to this URL

### Option B: Render

1. Go to [render.com](https://render.com) → New **Web Service**
2. Connect GitHub repo → Set **Root Directory** to `backend/`
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT`
5. Choose instance type (Standard 1X minimum for RL inference)
6. Deploy → Update Vercel env var with the Render URL

### Option C: Fly.io (Best for GPU/ML)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (from backend/ directory)
cd backend
fly launch

# Set secrets
fly secrets set API_KEY=your_key

# Deploy
fly deploy
```

---

## Step 3: Connect Frontend ↔ Backend

1. In **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add:
   ```
   VITE_API_BASE_URL = https://your-backend-url.railway.app
   ```
3. **Redeploy** the Vercel project (Deployments → Redeploy)

The frontend's `simulationStore` will use this URL to connect via WebSocket.

---

## Step 4: Custom Domain (Optional)

1. In Vercel → **Settings** → **Domains**
2. Add your domain (e.g., `inari.security`)
3. Update DNS records at your registrar:
   - **A record:** `76.76.21.21` (Vercel)
   - **CNAME:** `cname.vercel-dns.com` (for subdomains)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on Vercel | Check `npm run build` works locally first. Common cause: TypeScript errors |
| Routes return 404 | Verify `vercel.json` rewrites are present |
| WebSocket won't connect | Backend must be deployed separately. `VITE_API_BASE_URL` must point to it |
| 3D scene blank | R3F needs WebGL — verify browser supports it. No server-side rendering needed |
| SIEM IP shows "simulated" | `ipapi.co` called from user's browser — works fine on Vercel (client-side fetch) |
| Backend OOM on Railway | RL models need RAM — upgrade to Standard 2X or use Fly.io with GPU |

---

## Quick Deploy Commands (Local Verification)

```bash
# 1. Verify frontend builds
cd /path/to/project
npm run build

# 2. Verify backend starts
cd backend
pip install -r requirements.txt
uvicorn src.api.main:app --port 8001

# 3. Test full stack locally
# Frontend: npm run dev
# Backend: uvicorn as above
# Open http://localhost:5173
```

---

## Summary

| What | Where | Cost |
|------|-------|------|
| Frontend (static SPA) | Vercel | Free |
| Backend (FastAPI + RL) | Railway / Render / Fly.io | ~$5-20/mo |
| Custom domain | Any registrar | ~$10/yr |

**Minimum viable deploy:** Frontend on Vercel (free) + Backend on Railway (free tier or $5/mo).
