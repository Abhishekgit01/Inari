from __future__ import annotations

from collections import defaultdict
from typing import DefaultDict

from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: DefaultDict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id].append(websocket)

    def disconnect(self, client_id: str, websocket: WebSocket | None = None):
        if client_id not in self.active_connections:
            return
        if websocket is None:
            del self.active_connections[client_id]
            return
        self.active_connections[client_id] = [
            connection for connection in self.active_connections[client_id] if connection is not websocket
        ]
        if not self.active_connections[client_id]:
            del self.active_connections[client_id]

    async def send_json(self, client_id: str, data: dict):
        if client_id not in self.active_connections:
            return
        stale_connections: list[WebSocket] = []
        for connection in self.active_connections[client_id]:
            try:
                await connection.send_json(data)
            except Exception:
                stale_connections.append(connection)
        for connection in stale_connections:
            self.disconnect(client_id, connection)
