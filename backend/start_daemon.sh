#!/bin/bash
cd /Abhi/Projects/Athernex/backend
fuser -k 8001/tcp 2>/dev/null
rm -f uvicorn.log
source .venv/bin/activate
nohup python _start_server.py > uvicorn.log 2>&1 &
disown -a
echo "Backend completely disowned from terminal session."
