"""
API Gateway Service - Entry point for all microservices
This is a NEW service that routes requests to appropriate backends
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import os

app = FastAPI(
    title="CyberGuardian API Gateway",
    version="2.0.0",
    description="Unified API Gateway for CyberGuardian services"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Backend service URL (existing backend)
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "api-gateway"}

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_to_backend(request: Request, path: str):
    """Proxy requests to existing backend service"""
    async with httpx.AsyncClient() as client:
        url = f"{BACKEND_URL}/api/{path}"
        response = await client.request(
            method=request.method,
            url=url,
            headers=dict(request.headers),
            content=await request.body()
        )
        return JSONResponse(
            content=response.json(),
            status_code=response.status_code
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
