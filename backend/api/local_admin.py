"""Local admin API — no auth required, for local-network play only.

Served at /api/local-admin/ and powers the standalone admin panel (/admin).
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.models.user import User
from backend.models.character import Character
from backend.models.game_table import GameTable, TableCharacter
from backend.auth.security import hash_password

router = APIRouter(prefix="/api/local-admin", tags=["local-admin"])


# ── Schemas ──────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=4, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)
    role: str = "player"  # player | gm


class UpdateUserRequest(BaseModel):
    display_name: str | None = None
    role: str | None = None  # player | gm


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=4, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_admin: bool
    character_count: int = 0
    table_count: int = 0

    class Config:
        from_attributes = True


# ── Helpers ──────────────────────────────────────────

async def _user_out(user: User, db: AsyncSession) -> dict:
    char_count = (await db.execute(
        select(func.count()).select_from(Character).where(Character.user_id == user.id)
    )).scalar() or 0
    table_count = (await db.execute(
        select(func.count()).select_from(GameTable).where(GameTable.gm_user_id == user.id)
    )).scalar() or 0
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "is_admin": user.is_admin,
        "character_count": char_count,
        "table_count": table_count,
    }


# ── Endpoints ────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.id))
    users = result.scalars().all()
    return [await _user_out(u, db) for u in users]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(body: CreateUserRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username já existe")
    if body.role not in ("player", "gm"):
        raise HTTPException(status_code=400, detail="Role deve ser 'player' ou 'gm'")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return await _user_out(user, db)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, body: UpdateUserRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if body.display_name is not None:
        user.display_name = body.display_name
    if body.role is not None:
        if body.role not in ("player", "gm"):
            raise HTTPException(status_code=400, detail="Role deve ser 'player' ou 'gm'")
        user.role = body.role

    await db.commit()
    await db.refresh(user)
    return await _user_out(user, db)


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: int, body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"detail": f"Senha de '{user.display_name}' redefinida"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Não é possível excluir o administrador")

    # Remove table_character links for this user's characters
    chars = (await db.execute(select(Character).where(Character.user_id == user.id))).scalars().all()
    for c in chars:
        await db.execute(delete(TableCharacter).where(TableCharacter.character_id == c.id))
        await db.delete(c)

    await db.delete(user)
    await db.commit()
    return {"detail": f"Usuário '{user.display_name}' removido"}


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    user_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    char_count = (await db.execute(select(func.count()).select_from(Character))).scalar() or 0
    table_count = (await db.execute(select(func.count()).select_from(GameTable))).scalar() or 0
    return {"users": user_count, "characters": char_count, "tables": table_count}
