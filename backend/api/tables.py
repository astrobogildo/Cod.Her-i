import secrets
import string
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db.database import get_db
from backend.models.user import User
from backend.models.game_table import GameTable, TableCharacter
from backend.models.character import Character
from backend.models.roll_log import RollLog
from backend.models.chat_message import ChatMessage
from backend.auth.security import get_current_user
from backend.schemas import TableCreate, TableResponse, JoinTableRequest

router = APIRouter(prefix="/api/tables", tags=["tables"])


def _gen_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


# ── Helper: verify user belongs to table (as GM or player) ──
async def _require_table_access(
    table_id: int, current_user: User, db: AsyncSession
) -> GameTable:
    result = await db.execute(select(GameTable).where(GameTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa não encontrada")
    # GM always has access
    if table.gm_user_id == current_user.id:
        return table
    # Admin always has access
    if current_user.is_admin:
        return table
    # Check if player has a character in this table
    link = await db.execute(
        select(TableCharacter)
        .join(Character)
        .where(
            TableCharacter.table_id == table_id,
            Character.user_id == current_user.id,
        )
    )
    if not link.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Você não faz parte desta mesa")
    return table


async def _require_gm(table: GameTable, current_user: User) -> None:
    if table.gm_user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Apenas o mestre pode fazer isso")


# ═══════════════════════════════════════════════════
# CRUD
# ═══════════════════════════════════════════════════

@router.post("/", response_model=TableResponse, status_code=201)
async def create_table(
    body: TableCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

    # Promote to GM if not already
    if current_user.role == "player":
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
    result = await db.execute(select(GameTable).where(GameTable.code == body.code.upper()))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa não encontrada com este código")

    result = await db.execute(
        select(Character).where(Character.id == body.character_id, Character.user_id == current_user.id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Personagem não encontrado")

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


# ═══════════════════════════════════════════════════
# SESSION CONTROL (GM only)
# ═══════════════════════════════════════════════════

@router.post("/{table_id}/start")
async def start_session(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    table.status = "active"
    await db.commit()
    return {"detail": "Sessão iniciada", "status": table.status}


@router.post("/{table_id}/pause")
async def pause_session(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    table.status = "lobby"
    await db.commit()
    return {"detail": "Sessão pausada", "status": table.status}


@router.post("/{table_id}/archive")
async def archive_session(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    table.status = "archived"
    await db.commit()
    return {"detail": "Mesa arquivada", "status": table.status}


# ═══════════════════════════════════════════════════
# SESSION DATA (for GameSession page)
# ═══════════════════════════════════════════════════

@router.get("/{table_id}/details")
async def get_table_details(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full session data: table + players + GM info."""
    table = await _require_table_access(table_id, current_user, db)

    # Get GM info
    gm_result = await db.execute(select(User).where(User.id == table.gm_user_id))
    gm = gm_result.scalar_one()

    # Get all characters in this table with their owners
    tc_result = await db.execute(
        select(TableCharacter, Character, User)
        .join(Character, TableCharacter.character_id == Character.id)
        .join(User, Character.user_id == User.id)
        .where(TableCharacter.table_id == table_id)
    )
    players = []
    for tc, char, user in tc_result.all():
        players.append({
            "user_id": user.id,
            "display_name": user.display_name,
            "username": user.username,
            "character_id": char.id,
            "character_name": char.name,
            "character_concept": char.concept,
            "power_level": char.power_level,
            "pp_total": char.pp_total,
            "pp_spent": char.pp_spent,
            "vitalidade_max": char.vitalidade_max,
            "vitalidade_current": char.vitalidade_current,
            "ferimentos": char.ferimentos,
            "active_conditions": char.active_conditions,
            "hero_dice": char.hero_dice,
            "dodge": char.dodge,
            "parry": char.parry,
            "fortitude": char.fortitude,
            "willpower": char.willpower,
            "avatar_url": char.avatar_url or "",
            "status": tc.status,
        })

    is_gm = table.gm_user_id == current_user.id or current_user.is_admin

    return {
        "table": {
            "id": table.id,
            "name": table.name,
            "code": table.code,
            "power_level": table.power_level,
            "description": table.description,
            "status": table.status,
            "optional_rules": table.optional_rules,
            "combat_state": table.combat_state,
        },
        "gm": {"id": gm.id, "display_name": gm.display_name},
        "players": players,
        "is_gm": is_gm,
    }


@router.get("/{table_id}/characters")
async def get_table_characters_full(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full character data for GM view."""
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)

    tc_result = await db.execute(
        select(Character)
        .join(TableCharacter, TableCharacter.character_id == Character.id)
        .where(TableCharacter.table_id == table_id)
    )
    characters = tc_result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "concept": c.concept,
            "power_level": c.power_level,
            "pp_total": c.pp_total,
            "pp_spent": c.pp_spent,
            "attributes": c.attributes,
            "skills": c.skills,
            "powers": c.powers,
            "advantages": c.advantages,
            "equipment": c.equipment,
            "complications": c.complications,
            "vitalidade_max": c.vitalidade_max,
            "vitalidade_current": c.vitalidade_current,
            "ferimentos": c.ferimentos,
            "hero_dice": c.hero_dice,
            "active_conditions": c.active_conditions,
            "dodge": c.dodge,
            "parry": c.parry,
            "fortitude": c.fortitude,
            "willpower": c.willpower,
        }
        for c in characters
    ]


# ═══════════════════════════════════════════════════
# ROLL & CHAT HISTORY
# ═══════════════════════════════════════════════════

@router.get("/{table_id}/rolls")
async def get_table_rolls(
    table_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recent rolls for this table."""
    await _require_table_access(table_id, current_user, db)
    safe_limit = min(max(limit, 1), 200)
    result = await db.execute(
        select(RollLog)
        .where(RollLog.table_id == table_id)
        .order_by(desc(RollLog.timestamp))
        .limit(safe_limit)
    )
    rolls = result.scalars().all()
    return [
        {
            "id": r.id,
            "character_name": r.character_name,
            "roll_type": r.roll_type,
            "description": r.description,
            "dice_results": r.dice_results,
            "successes": r.successes,
            "complications": r.complications,
            "tn": r.tn,
            "margin": r.margin,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        }
        for r in reversed(rolls)  # oldest first for display
    ]


@router.get("/{table_id}/chat")
async def get_table_chat(
    table_id: int,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recent chat messages for this table."""
    await _require_table_access(table_id, current_user, db)
    safe_limit = min(max(limit, 1), 500)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.table_id == table_id)
        .order_by(desc(ChatMessage.created_at))
        .limit(safe_limit)
    )
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "user_id": m.user_id,
            "display_name": m.display_name,
            "message_type": m.message_type,
            "content": m.content,
            "target_user_id": m.target_user_id,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in reversed(messages)  # oldest first
    ]


@router.post("/{table_id}/chat")
async def post_chat_message(
    table_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Post a chat message (also broadcast via WS if desired)."""
    await _require_table_access(table_id, current_user, db)
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    msg_type = body.get("message_type", "chat")
    if msg_type not in ("chat", "system", "roll", "whisper"):
        msg_type = "chat"

    msg = ChatMessage(
        table_id=table_id,
        user_id=current_user.id,
        display_name=current_user.display_name,
        message_type=msg_type,
        content=content,
        target_user_id=body.get("target_user_id"),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return {
        "id": msg.id,
        "user_id": msg.user_id,
        "display_name": msg.display_name,
        "message_type": msg.message_type,
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


# ═══════════════════════════════════════════════════
# KICK / REMOVE PLAYER (GM only)
# ═══════════════════════════════════════════════════

@router.delete("/{table_id}/players/{character_id}")
async def remove_player(
    table_id: int,
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    result = await db.execute(
        select(TableCharacter).where(
            TableCharacter.table_id == table_id,
            TableCharacter.character_id == character_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Personagem não encontrado na mesa")
    await db.delete(link)
    await db.commit()
    return {"detail": "Jogador removido"}


# ═══════════════════════════════════════════════════
# ENCOUNTER / COMBAT SYSTEM
# ═══════════════════════════════════════════════════

class StartEncounterRequest(BaseModel):
    zone_names: list[str] = Field(default_factory=lambda: ["Zona A"])


class CreateZoneRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class RenameZoneRequest(BaseModel):
    zone_id: str
    name: str = Field(min_length=1, max_length=60)


class MoveCharacterRequest(BaseModel):
    character_id: int
    zone_id: str


class SetInitiativeRequest(BaseModel):
    character_id: int
    initiative: int


class AdvanceTurnRequest(BaseModel):
    pass


class RequestTestRequest(BaseModel):
    """GM requests a generic test from one or all characters."""
    label: str = Field(min_length=1, max_length=120)  # e.g. "Percepção DN 3"
    attribute: str = ""  # e.g. "PER" — empty = any
    tn: int = 0
    target_character_ids: list[int] = Field(default_factory=list)  # empty = all players


class TestResultRequest(BaseModel):
    test_id: str
    character_id: int
    successes: int
    complications: int = 0


def _empty_combat_state() -> dict:
    return {
        "active": False,
        "round": 0,
        "current_turn_index": 0,
        "zones": [],
        "initiative_order": [],
        "pending_tests": [],
    }


def _get_combat(table: GameTable) -> dict:
    return table.combat_state or _empty_combat_state()


@router.post("/{table_id}/encounter/start")
async def start_encounter(
    table_id: int,
    body: StartEncounterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new encounter with initial zones. Resets combat state."""
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)

    zones = []
    for name in (body.zone_names or ["Zona A"]):
        zones.append({"id": uuid.uuid4().hex[:8], "name": name, "character_ids": []})

    cs = _empty_combat_state()
    cs["active"] = True
    cs["round"] = 1
    cs["zones"] = zones
    table.combat_state = cs
    await db.commit()
    return cs


@router.post("/{table_id}/encounter/end")
async def end_encounter(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    table.combat_state = None
    await db.commit()
    return {"detail": "Encontro encerrado"}


@router.get("/{table_id}/encounter")
async def get_encounter(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    return table.combat_state or {"active": False}


# ── Zones ────────────────────────────────────

@router.post("/{table_id}/encounter/zones")
async def create_zone(
    table_id: int,
    body: CreateZoneRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)
    if not cs.get("active"):
        raise HTTPException(400, "Nenhum encontro ativo")
    new_zone = {"id": uuid.uuid4().hex[:8], "name": body.name, "character_ids": []}
    cs["zones"].append(new_zone)
    table.combat_state = cs
    await db.commit()
    return cs


@router.delete("/{table_id}/encounter/zones/{zone_id}")
async def delete_zone(
    table_id: int,
    zone_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)
    if not cs.get("active"):
        raise HTTPException(400, "Nenhum encontro ativo")
    zone = next((z for z in cs["zones"] if z["id"] == zone_id), None)
    if not zone:
        raise HTTPException(404, "Zona não encontrada")
    # Move characters to first zone (or remove if none left)
    if cs["zones"] and zone["character_ids"]:
        first = next((z for z in cs["zones"] if z["id"] != zone_id), None)
        if first:
            first["character_ids"].extend(zone["character_ids"])
    cs["zones"] = [z for z in cs["zones"] if z["id"] != zone_id]
    table.combat_state = cs
    await db.commit()
    return cs


@router.patch("/{table_id}/encounter/zones/rename")
async def rename_zone(
    table_id: int,
    body: RenameZoneRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)
    zone = next((z for z in cs.get("zones", []) if z["id"] == body.zone_id), None)
    if not zone:
        raise HTTPException(404, "Zona não encontrada")
    zone["name"] = body.name
    table.combat_state = cs
    await db.commit()
    return cs


# ── Character placement ──────────────────────

@router.post("/{table_id}/encounter/move")
async def move_character(
    table_id: int,
    body: MoveCharacterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Move a character to a different zone. GM can move anyone; players their own."""
    table = await _require_table_access(table_id, current_user, db)
    cs = _get_combat(table)
    if not cs.get("active"):
        raise HTTPException(400, "Nenhum encontro ativo")

    is_gm = table.gm_user_id == current_user.id or current_user.is_admin
    if not is_gm:
        # Players can only move their own characters
        char_result = await db.execute(
            select(Character).where(Character.id == body.character_id, Character.user_id == current_user.id)
        )
        if not char_result.scalar_one_or_none():
            raise HTTPException(403, "Você só pode mover seus próprios personagens")

    # Remove from all zones
    for z in cs["zones"]:
        z["character_ids"] = [cid for cid in z["character_ids"] if cid != body.character_id]
    # Add to target zone
    target = next((z for z in cs["zones"] if z["id"] == body.zone_id), None)
    if not target:
        raise HTTPException(404, "Zona não encontrada")
    target["character_ids"].append(body.character_id)
    table.combat_state = cs
    await db.commit()
    return cs


# ── Initiative & Turns ───────────────────────

@router.post("/{table_id}/encounter/initiative")
async def set_initiative(
    table_id: int,
    body: SetInitiativeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set initiative for a character. GM only."""
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)
    if not cs.get("active"):
        raise HTTPException(400, "Nenhum encontro ativo")

    order = cs.get("initiative_order", [])
    existing = next((e for e in order if e["character_id"] == body.character_id), None)
    if existing:
        existing["initiative"] = body.initiative
    else:
        order.append({"character_id": body.character_id, "initiative": body.initiative})
    # Sort descending
    order.sort(key=lambda x: x["initiative"], reverse=True)
    cs["initiative_order"] = order
    table.combat_state = cs
    await db.commit()
    return cs


@router.post("/{table_id}/encounter/roll-all-initiative")
async def roll_all_initiative(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Roll initiative for all characters in the encounter. GM only."""
    from backend.engine.dice import roll_pool
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)
    if not cs.get("active"):
        raise HTTPException(400, "Nenhum encontro ativo")

    # Collect all character IDs from zones
    all_char_ids = set()
    for z in cs["zones"]:
        all_char_ids.update(z["character_ids"])

    if not all_char_ids:
        raise HTTPException(400, "Nenhum personagem nas zonas")

    # Fetch characters
    chars_result = await db.execute(
        select(Character).where(Character.id.in_(all_char_ids))
    )
    chars = {c.id: c for c in chars_result.scalars().all()}

    order = []
    for cid in all_char_ids:
        char = chars.get(cid)
        if not char:
            continue
        # Initiative pool = AGI rank
        agi = char.attributes.get("AGI", 2)
        result = roll_pool(agi, 0, 0)
        order.append({
            "character_id": cid,
            "initiative": result["total_successes"],
            "roll_detail": f"{agi}d10 → {result['total_successes']} sucessos",
        })
    order.sort(key=lambda x: x["initiative"], reverse=True)
    cs["initiative_order"] = order
    cs["current_turn_index"] = 0
    table.combat_state = cs
    await db.commit()
    return cs


@router.post("/{table_id}/encounter/next-turn")
async def next_turn(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Advance to next turn (or next round)."""
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)
    if not cs.get("active"):
        raise HTTPException(400, "Nenhum encontro ativo")

    order = cs.get("initiative_order", [])
    if not order:
        raise HTTPException(400, "Sem ordem de iniciativa")

    idx = cs.get("current_turn_index", 0) + 1
    if idx >= len(order):
        idx = 0
        cs["round"] = cs.get("round", 1) + 1
    cs["current_turn_index"] = idx
    table.combat_state = cs
    await db.commit()
    return cs


@router.post("/{table_id}/encounter/prev-turn")
async def prev_turn(
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Go back one turn."""
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)
    if not cs.get("active"):
        raise HTTPException(400, "Nenhum encontro ativo")

    order = cs.get("initiative_order", [])
    if not order:
        raise HTTPException(400, "Sem ordem de iniciativa")

    idx = cs.get("current_turn_index", 0) - 1
    if idx < 0:
        idx = len(order) - 1
        cs["round"] = max(1, cs.get("round", 1) - 1)
    cs["current_turn_index"] = idx
    table.combat_state = cs
    await db.commit()
    return cs


# ── GM Test Requests ─────────────────────────

@router.post("/{table_id}/encounter/request-test")
async def request_test(
    table_id: int,
    body: RequestTestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """GM requests a test from players."""
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)

    test_entry = {
        "id": uuid.uuid4().hex[:8],
        "label": body.label,
        "attribute": body.attribute,
        "tn": body.tn,
        "target_character_ids": body.target_character_ids,
        "results": [],
    }
    cs.setdefault("pending_tests", []).append(test_entry)
    table.combat_state = cs
    await db.commit()
    return cs


@router.post("/{table_id}/encounter/submit-test")
async def submit_test_result(
    table_id: int,
    body: TestResultRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Player submits a test result."""
    table = await _require_table_access(table_id, current_user, db)
    cs = _get_combat(table)

    tests = cs.get("pending_tests", [])
    test = next((t for t in tests if t["id"] == body.test_id), None)
    if not test:
        raise HTTPException(404, "Teste não encontrado")

    # Verify player owns the character (unless GM)
    is_gm = table.gm_user_id == current_user.id or current_user.is_admin
    if not is_gm:
        char_result = await db.execute(
            select(Character).where(Character.id == body.character_id, Character.user_id == current_user.id)
        )
        if not char_result.scalar_one_or_none():
            raise HTTPException(403, "Personagem não pertence a você")

    # Add result
    test["results"].append({
        "character_id": body.character_id,
        "successes": body.successes,
        "complications": body.complications,
        "passed": body.successes >= test["tn"] if test["tn"] else True,
    })
    table.combat_state = cs
    await db.commit()
    return cs


@router.delete("/{table_id}/encounter/tests/{test_id}")
async def dismiss_test(
    table_id: int,
    test_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """GM dismisses/clears a test request."""
    table = await _require_table_access(table_id, current_user, db)
    await _require_gm(table, current_user)
    cs = _get_combat(table)
    cs["pending_tests"] = [t for t in cs.get("pending_tests", []) if t["id"] != test_id]
    table.combat_state = cs
    await db.commit()
    return cs
