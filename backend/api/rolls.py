from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.models.user import User
from backend.models.roll_log import RollLog
from backend.auth.security import get_current_user
from backend.schemas import RollRequest, RollResponse
from backend.engine.dice import roll_pool

router = APIRouter(prefix="/api/rolls", tags=["rolls"])


@router.post("/", response_model=RollResponse)
async def do_roll(
    body: RollRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = roll_pool(
        pool_size=body.pool_size,
        hero_dice=body.hero_dice,
        tn=body.tn,
        exploding=body.exploding,
    )

    # Persist to log
    log = RollLog(
        table_id=body.table_id,
        character_id=body.character_id,
        character_name=current_user.display_name,
        roll_type=body.roll_type,
        description=body.description,
        pool_composition={"pool_size": body.pool_size, "hero_dice": body.hero_dice},
        dice_results=result["dice"],
        successes=result["total_successes"],
        complications=result["total_complications"],
        tn=body.tn,
        margin=result["margin"],
    )
    db.add(log)
    await db.commit()

    return RollResponse(
        dice=result["dice"],
        total_successes=result["total_successes"],
        total_complications=result["total_complications"],
        tn=result["tn"],
        margin=result["margin"],
        result_label=result["result_label"],
    )
