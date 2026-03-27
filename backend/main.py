"""Main FastAPI application — entry point for the Código: Herói backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.db.database import init_db
from backend.api.auth_routes import router as auth_router
from backend.api.characters import router as characters_router
from backend.api.tables import router as tables_router
from backend.api.rolls import router as rolls_router
from backend.api.system_catalog import router as system_router
from backend.ws.hub import manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Código: Herói",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow any origin for local-network play
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routers
app.include_router(auth_router)
app.include_router(characters_router)
app.include_router(tables_router)
app.include_router(rolls_router)
app.include_router(system_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ─── WebSocket ──────────────────────────────────────────────
@app.websocket("/ws/{table_id}")
async def ws_endpoint(
    ws: WebSocket,
    table_id: int,
    user_id: int = Query(...),
    display_name: str = Query("Anônimo"),
):
    await manager.connect(table_id, user_id, ws)
    await manager.broadcast(
        table_id,
        "player_joined",
        {"user_id": user_id, "display_name": display_name, "online": manager.online_users(table_id)},
    )
    try:
        while True:
            raw = await ws.receive_text()
            # Clients send JSON: {"event": "...", "data": {...}}
            import json
            msg = json.loads(raw)
            event = msg.get("event", "unknown")
            data = msg.get("data", {})

            # Re-broadcast everything to the table (GM + players see the same feed)
            await manager.broadcast(table_id, event, {"user_id": user_id, "display_name": display_name, **data})
    except WebSocketDisconnect:
        manager.disconnect(table_id, user_id, ws)
        await manager.broadcast(
            table_id,
            "player_left",
            {"user_id": user_id, "display_name": display_name, "online": manager.online_users(table_id)},
        )
