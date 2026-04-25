#!/usr/bin/env python3
import sys
import traceback
sys.path.insert(0, '.')

try:
    print("Importing app...")
    from src.api.main import app
    print("App imported OK")
    
    import uvicorn
    print("Starting uvicorn on 0.0.0.0:8001...")
    uvicorn.run(app, host='0.0.0.0', port=8001, log_level='info')
except Exception as e:
    print(f"ERROR: {e}")
    traceback.print_exc()
    sys.exit(1)
