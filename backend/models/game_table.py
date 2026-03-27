import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.database import Base


class GameTable(Base):
    __tablename__ = "game_tables"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(6), unique=True, index=True)
    gm_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    power_level: Mapped[int] = mapped_column(Integer, default=10)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(10), default="lobby")  # lobby | active | archived

    optional_rules: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "high_lethality": False,
            "exploding_dice": False,
            "wound_location": False,
            "permanent_scars": False,
            "fame_infamy": False,
            "power_overload": False,
            "threat_escalation": False,
        },
    )
    combat_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    gm: Mapped["User"] = relationship(back_populates="gm_tables")  # type: ignore[name-defined] # noqa: F821
    characters: Mapped[list["TableCharacter"]] = relationship(back_populates="table", lazy="selectin")


class TableCharacter(Base):
    __tablename__ = "table_characters"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("game_tables.id"))
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id"))
    status: Mapped[str] = mapped_column(String(12), default="active")  # active | spectator

    table: Mapped["GameTable"] = relationship(back_populates="characters")
    character: Mapped["Character"] = relationship(back_populates="table_links")  # type: ignore[name-defined] # noqa: F821
