import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.database import Base


class RollLog(Base):
    __tablename__ = "roll_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("game_tables.id"), index=True)
    character_id: Mapped[int | None] = mapped_column(ForeignKey("characters.id"), nullable=True)
    character_name: Mapped[str] = mapped_column(String(120), default="")
    roll_type: Mapped[str] = mapped_column(String(30))  # skill | attack | defense | power | hero_die | custom
    description: Mapped[str] = mapped_column(String(255), default="")

    pool_composition: Mapped[dict] = mapped_column(JSON, default=dict)
    dice_results: Mapped[list] = mapped_column(JSON, default=list)  # [{value, type: "d10"|"d12"}]
    successes: Mapped[int] = mapped_column(Integer, default=0)
    complications: Mapped[int] = mapped_column(Integer, default=0)
    tn: Mapped[int | None] = mapped_column(Integer, nullable=True)
    margin: Mapped[int | None] = mapped_column(Integer, nullable=True)

    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
