import datetime
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("game_tables.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    display_name: Mapped[str] = mapped_column(String(100), default="")
    message_type: Mapped[str] = mapped_column(String(20), default="chat")  # chat | system | roll | whisper
    content: Mapped[str] = mapped_column(Text, default="")
    target_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # for whispers
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
