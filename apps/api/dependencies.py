from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession

from shared.libs.connectors import WeatherConnector
from apps.api.db.session import get_session


@asynccontextmanager
def weather_connector() -> AsyncIterator[WeatherConnector]:
    connector = WeatherConnector()
    try:
        yield connector
    finally:
        await connector.close()


@asynccontextmanager
def db_session() -> AsyncIterator[AsyncSession]:
    async with get_session() as session:
        yield session
