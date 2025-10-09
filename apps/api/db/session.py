from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from apps.api.config import get_settings
from shared.libs.logging import get_logger
from .models import Base

logger = get_logger(__name__)

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_schema_ready = False


def _ensure_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        return
    settings = get_settings()
    database_url = settings.database_dsn
    if not database_url:
        logger.warning("DATABASE_URL not set; defaulting to in-memory sqlite engine for local runs")
        database_url = "sqlite+aiosqlite:///:memory:"
    logger.info("initialising async engine for %s", database_url)
    _engine = create_async_engine(database_url, echo=settings.app_env == "dev")
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    global _schema_ready
    _ensure_engine()
    assert _session_factory is not None
    if not _schema_ready:
        assert _engine is not None
        async with _engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        _schema_ready = True
    session = _session_factory()
    try:
        yield session
        await session.commit()
    except Exception:  # pragma: no cover - commit path covered via tests
        await session.rollback()
        raise
    finally:
        await session.close()
