import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    display_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10), default="player")  # player | gm
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    characters: Mapped[list["Character"]] = relationship(back_populates="owner", lazy="selectin")  # type: ignore[name-defined] # noqa: F821
    gm_tables: Mapped[list["GameTable"]] = relationship(back_populates="gm", lazy="selectin")  # type: ignore[name-defined] # noqa: F821
