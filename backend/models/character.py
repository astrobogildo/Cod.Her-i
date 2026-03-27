import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, JSON, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.database import Base


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(120))
    concept: Mapped[str] = mapped_column(Text, default="")
    origin_descriptors: Mapped[str] = mapped_column(Text, default="")

    # Power Level & PP
    power_level: Mapped[int] = mapped_column(Integer, default=10)
    pp_total: Mapped[int] = mapped_column(Integer, default=150)
    pp_spent: Mapped[int] = mapped_column(Integer, default=0)

    # Core stats stored as JSON dicts
    attributes: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {"FOR": 2, "RES": 2, "AGI": 2, "DES": 2, "CMB": 2, "INT": 2, "PER": 2, "PRE": 2},
    )
    skills: Mapped[list] = mapped_column(JSON, default=list)
    powers: Mapped[list] = mapped_column(JSON, default=list)
    advantages: Mapped[list] = mapped_column(JSON, default=list)
    equipment: Mapped[list] = mapped_column(JSON, default=list)
    complications: Mapped[list] = mapped_column(JSON, default=list)
    base_hq: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Derived / live state
    vitalidade_max: Mapped[int] = mapped_column(Integer, default=5)
    vitalidade_current: Mapped[int] = mapped_column(Integer, default=5)
    ferimentos: Mapped[list] = mapped_column(JSON, default=lambda: [0, 0, 0, 0])  # 4 levels
    hero_dice: Mapped[int] = mapped_column(Integer, default=1)
    active_conditions: Mapped[list] = mapped_column(JSON, default=list)

    # Calculated defenses
    dodge: Mapped[int] = mapped_column(Integer, default=2)
    parry: Mapped[int] = mapped_column(Integer, default=2)
    fortitude: Mapped[int] = mapped_column(Integer, default=2)
    willpower: Mapped[int] = mapped_column(Integer, default=2)

    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped["User"] = relationship(back_populates="characters")  # type: ignore[name-defined] # noqa: F821
    table_links: Mapped[list["TableCharacter"]] = relationship(back_populates="character", lazy="selectin")  # type: ignore[name-defined] # noqa: F821
