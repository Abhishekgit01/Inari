#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Athernex — Start Everything (nodes + backend + frontend)
# ═══════════════════════════════════════════════════════════════════
# Usage:  chmod +x start_all.sh && ./start_all.sh
# Stop:   Ctrl+C (sends SIGINT to all children)
# ═══════════════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

cleanup() {
  echo ""
  echo "  Shutting down all services..."
  kill $NODE_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait 2>/dev/null
  echo "  All services stopped."
}
trap cleanup EXIT INT TERM

echo "═══════════════════════════════════════════════════════════"
echo "  ATHERNEX — Starting all services"
echo "═══════════════════════════════════════════════════════════"

# 1) Node Servers (ports 8005-8019)
echo ""
echo "  [1/3] Starting node servers (ports 8005-8019)..."
cd "$SCRIPT_DIR/backend"
python node_servers.py &
NODE_PID=$!
sleep 2

# 2) Backend API (port 8001)
echo ""
echo "  [2/3] Starting FastAPI backend (port 8001)..."
source venv/bin/activate 2>/dev/null || true
python -m uvicorn src.api.main:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!
sleep 3

# 3) Frontend (port 5173)
echo ""
echo "  [3/3] Starting Vite frontend..."
cd "$SCRIPT_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ Node Servers:  http://127.0.0.1:8005 – 8019"
echo "  ✓ Backend API:   http://127.0.0.1:8001"
echo "  ✓ Frontend:      http://127.0.0.1:5173"
echo "═══════════════════════════════════════════════════════════"
echo "  Press Ctrl+C to stop all services."
echo "═══════════════════════════════════════════════════════════"

wait
