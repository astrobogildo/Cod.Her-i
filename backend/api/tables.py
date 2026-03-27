import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.models.user import User
from backend.models.game_table import GameTable, TableCharacter
from backend.models.character import Character
from backend.auth.security import get_current_user
from backend.schemas import TableCreate, TableResponse, JoinTableRequest

router = APIRouter(prefix="/api/tables", tags=["tables"])


def _gen_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


@router.post("/", response_model=TableResponse, status_code=201)
async def create_table(
    body: TableCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Generate unique code
    code = _gen_code()
    while (await db.execute(select(GameTable).where(GameTable.code == code))).scalar_one_or_none():
        code = _gen_code()

    table = GameTable(
        name=body.name,
        code=code,
        gm_user_id=current_user.id,
        power_level=body.power_level,
        description=body.description,
    )
    if body.optional_rules:
        table.optional_rules = body.optional_rules

    db.add(table)
    await db.commit()
    await db.refresh(table)

    # GM role updated to gm
    current_user.role = "gm"
    await db.commit()

    return table


@router.get("/", response_model=list[TableResponse])
async def list_tables(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GameTable).where(GameTable.status != "archived")
    )
    return result.scalars().all()


@router.get("/{table_id}", response_model=TableResponse)
async def get_table(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GameTable).where(GameTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa não encontrada")
    return table


@router.post("/join")
async def join_table(
    body: JoinTableRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Find table by code
    result = await db.execute(select(GameTable).where(GameTable.code == body.code.upper()))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa não encontrada com este código")

    # Verify character ownership
    result = await db.execute(
        select(Character).where(Character.id == body.character_id, Character.user_id == current_user.id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Personagem não encontrado")

    # Check if already joined
    existing = await db.execute(
        select(TableCharacter).where(
            TableCharacter.table_id == table.id,
            TableCharacter.character_id == char.id,
        )
    )
    if existing.scalar_one_or_none():
        return {"detail": "Já está na mesa", "table_id": table.id}

    link = TableCharacter(table_id=table.id, character_id=char.id)
    db.add(link)
    await db.commit()
    return {"detail": "Entrou na mesa", "table_id": table.id, "table_name": table.name}


@router.post("/{table_id}/start")
async def start_session(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GameTable).where(GameTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa não encontrada")
    if table.gm_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Apenas o mestre pode iniciar a sessão")

    table.status = "active"
    await db.commit()
    return {"detail": "Sessão iniciada", "status": table.status}
