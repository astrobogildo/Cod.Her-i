import logging
import os

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings

try:
    from alembic import command
    from alembic.config import Config
    _HAS_ALEMBIC = True
except ImportError:
    _HAS_ALEMBIC = False

logger = logging.getLogger(__name__)

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[misc]
    async with async_session() as session:
        yield session


def _get_alembic_config():
    """Build an Alembic Config pointing at the project root."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    cfg = Config(os.path.join(base_dir, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(base_dir, "alembic"))
    return cfg


def _fallback_create_all() -> None:
    """Create tables directly via SQLAlchemy metadata (no migrations)."""
    sync_url = settings.DATABASE_URL.replace("+aiosqlite", "")
    sync_engine = create_engine(sync_url)
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()
    logger.info("Tables created via SQLAlchemy create_all (Alembic unavailable)")


async def init_db() -> None:
    """Run Alembic migrations if available, otherwise create tables directly."""
    if _HAS_ALEMBIC:
        try:
            cfg = _get_alembic_config()
            command.upgrade(cfg, "head")
            return
        except Exception as exc:
            logger.warning("Alembic migration failed (%s), falling back to create_all", exc)
    _fallback_create_all()
