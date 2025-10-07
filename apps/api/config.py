from functools import lru_cache

from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """Runtime configuration for the API service."""

    app_env: str = Field("dev", alias="APP_ENV")
    api_title: str = "WeatherVane API"
    api_version: str = "0.1.0"
    database_dsn: str | None = Field(None, alias="DATABASE_URL")
    cors_origins: list[str] = Field(default_factory=list, alias="CORS_ORIGINS")
    log_level: str = Field("INFO", alias="LOG_LEVEL")

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance."""

    return Settings()
