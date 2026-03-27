"""WebSocket connection manager — broadcasts events to all members of a game table."""

from __future__ import annotations
import json
from datetime import datetime, timezone
from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections grouped by table_id."""

    def __init__(self) -> None:
        # table_id → list of (user_id, websocket)
        self._connections: dict[int, list[tuple[int, WebSocket]]] = {}

    async def connect(self, table_id: int, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(table_id, []).append((user_id, ws))

    def disconnect(self, table_id: int, user_id: int, ws: WebSocket) -> None:
        conns = self._connections.get(table_id, [])
        self._connections[table_id] = [
            (uid, w) for uid, w in conns if not (uid == user_id and w is ws)
        ]
        if not self._connections[table_id]:
            del self._connections[table_id]

    async def broadcast(self, table_id: int, event: str, data: dict) -> None:
        """Send a JSON message to every connection in a table."""
        payload = json.dumps(
            {"event": event, "data": data, "ts": datetime.now(timezone.utc).isoformat()},
            ensure_ascii=False,
        )
        dead: list[tuple[int, WebSocket]] = []
        for uid, ws in self._connections.get(table_id, []):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append((uid, ws))
        # Remove disconnected
        for uid, ws in dead:
            self.disconnect(table_id, uid, ws)

    async def send_personal(self, table_id: int, user_id: int, event: str, data: dict) -> None:
        """Send to a specific user in a table."""
        payload = json.dumps(
            {"event": event, "data": data, "ts": datetime.now(timezone.utc).isoformat()},
            ensure_ascii=False,
        )
        for uid, ws in self._connections.get(table_id, []):
            if uid == user_id:
                try:
                    await ws.send_text(payload)
                except Exception:
                    self.disconnect(table_id, uid, ws)
                break

    def online_users(self, table_id: int) -> list[int]:
        return [uid for uid, _ in self._connections.get(table_id, [])]


manager = ConnectionManager()
