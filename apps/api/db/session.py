from __future__ import annotations

from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from apps.api.config import get_settings
from shared.libs.logging import get_logger

logger = get_logger(__name__)

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _ensure_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        return
    settings = get_settings()
    if not settings.database_dsn:
        raise RuntimeError("DATABASE_URL is required for database operations")
    logger.info("initialising async engine for %s", settings.database_dsn)
    _engine = create_async_engine(settings.database_dsn, echo=settings.app_env == "dev")
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


@asynccontextmanager
def get_session() -> AsyncSession:
    _ensure_engine()
    assert _session_factory is not None
    session = _session_factory()
    try:
        yield session
        await session.commit()
    except Exception:  # pragma: no cover - commit path covered via tests
        await session.rollback()
        raise
    finally:
        await session.close()
