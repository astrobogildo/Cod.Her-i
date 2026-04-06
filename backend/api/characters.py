from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import base64
import os

from backend.db.database import get_db
from backend.models.user import User
from backend.models.character import Character
from backend.auth.security import get_current_user
from backend.schemas import CharacterCreate, CharacterUpdate, CharacterResponse
from backend.engine.character_calc import recalculate_character, PL_TABLE

router = APIRouter(prefix="/api/characters", tags=["characters"])


@router.get("/", response_model=list[CharacterResponse])
async def list_characters(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/", response_model=CharacterResponse, status_code=201)
async def create_character(
    body: CharacterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    char_data = body.model_dump()
    derived = recalculate_character(char_data)

    char = Character(
        user_id=current_user.id,
        name=body.name,
        concept=body.concept,
        origin_descriptors=body.origin_descriptors,
        power_level=body.power_level,
        pp_total=derived["pp_total"],
        pp_spent=derived["pp_spent"],
        attributes=body.attributes,
        skills=body.skills,
        powers=body.powers,
        advantages=body.advantages,
        equipment=body.equipment,
        complications=body.complications,
        base_hq=body.base_hq,
        vitalidade_max=derived["vitalidade_max"],
        vitalidade_current=derived["vitalidade_max"],
        dodge=derived["dodge"],
        parry=derived["parry"],
        fortitude=derived["fortitude"],
        willpower=derived["willpower"],
        notes=body.notes,
    )
    db.add(char)
    await db.commit()
    await db.refresh(char)
    return char


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.user_id == current_user.id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Personagem não encontrado")
    return char


@router.patch("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: int,
    body: CharacterUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.user_id == current_user.id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Personagem não encontrado")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(char, field, value)

    # Recalculate derived values whenever build-related fields change
    build_fields = {"attributes", "skills", "powers", "advantages", "equipment", "power_level"}
    if build_fields & update_data.keys():
        char_dict = {
            "power_level": char.power_level,
            "attributes": char.attributes,
            "skills": char.skills,
            "powers": char.powers,
            "advantages": char.advantages,
            "equipment": char.equipment,
        }
        derived = recalculate_character(char_dict)
        char.pp_total = derived["pp_total"]
        char.pp_spent = derived["pp_spent"]
        char.vitalidade_max = derived["vitalidade_max"]
        char.dodge = derived["dodge"]
        char.parry = derived["parry"]
        char.fortitude = derived["fortitude"]
        char.willpower = derived["willpower"]

    await db.commit()
    await db.refresh(char)
    return char


@router.delete("/{character_id}", status_code=204)
async def delete_character(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.user_id == current_user.id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Personagem não encontrado")
    await db.delete(char)
    await db.commit()


# ── Avatar upload (max 2MB, stored as base64 data-URI) ──────

_MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB
_ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


@router.post("/{character_id}/avatar")
async def upload_avatar(
    character_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.user_id == current_user.id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Personagem não encontrado")

    content_type = file.content_type or ""
    if content_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Formato deve ser PNG, JPEG, WebP ou GIF")

    data = await file.read()
    if len(data) > _MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx 2MB)")

    b64 = base64.b64encode(data).decode()
    char.avatar_url = f"data:{content_type};base64,{b64}"
    await db.commit()
    return {"avatar_url": char.avatar_url}


@router.delete("/{character_id}/avatar", status_code=204)
async def delete_avatar(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.user_id == current_user.id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Personagem não encontrado")
    char.avatar_url = ""
    await db.commit()
