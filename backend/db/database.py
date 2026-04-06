import logging
import os
import sqlite3

from sqlalchemy import create_engine, inspect, text
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


def _sync_db_path() -> str:
    """Return the raw filesystem path of the SQLite database."""
    url = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    return url


def _ensure_schema() -> None:
    """Create missing tables AND add missing columns to existing tables.

    SQLAlchemy's create_all only creates tables that don't exist — it won't
    ALTER existing ones.  This function inspects the live DB and issues
    ALTER TABLE ADD COLUMN for every column the ORM expects but the DB lacks.
    """
    sync_url = settings.DATABASE_URL.replace("+aiosqlite", "")
    sync_engine = create_engine(sync_url)

    # 1. Create any entirely-missing tables
    Base.metadata.create_all(sync_engine)

    # 2. Add missing columns to existing tables
    insp = inspect(sync_engine)
    with sync_engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue  # just created above
            existing_cols = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing_cols:
                    continue
                # Build a default literal for the ALTER TABLE
                col_type = col.type.compile(dialect=sync_engine.dialect)
                default = "DEFAULT 0" if "INT" in col_type.upper() or "BOOL" in col_type.upper() else "DEFAULT ''"
                stmt = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type} {default}'
                logger.info("Auto-adding column: %s", stmt)
                conn.execute(text(stmt))
        conn.commit()

    sync_engine.dispose()
    logger.info("Schema sync complete")


async def init_db() -> None:
    """Run Alembic migrations if available, otherwise ensure schema directly."""
    if _HAS_ALEMBIC:
        try:
            cfg = _get_alembic_config()
            command.upgrade(cfg, "head")
            return
        except Exception as exc:
            logger.warning("Alembic migration failed (%s), falling back to ensure_schema", exc)
    _ensure_schema()
