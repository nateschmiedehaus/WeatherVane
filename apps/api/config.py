from functools import lru_cache

try:  # Prefer Pydantic v2 settings package when available.
    from pydantic_settings import BaseSettings, SettingsConfigDict
    from pydantic import Field
except ImportError:  # pragma: no cover - fall back to v1 compatibility layer.
    from pydantic.v1 import BaseSettings, Field  # type: ignore[assignment, import]

    SettingsConfigDict = None  # type: ignore[assignment]

from shared.data_context import ContextWarningEngine, default_warning_engine


class Settings(BaseSettings):
    """Runtime configuration for the API service."""

    if SettingsConfigDict is not None:
        model_config = SettingsConfigDict(
            env_file=".env",
            case_sensitive=False,
        )
    else:  # pragma: no cover - compatibility with Pydantic v1 import.
        class Config:
            env_file = ".env"
            case_sensitive = False

    app_env: str = Field("dev", alias="APP_ENV")
    api_title: str = "WeatherVane API"
    api_version: str = "0.1.0"
    database_dsn: str | None = Field(None, alias="DATABASE_URL")
    cors_origins: list[str] = Field(default_factory=list, alias="CORS_ORIGINS")
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    automation_webhook_url: str | None = Field(None, alias="AUTOMATION_WEBHOOK_URL")
    context_warning_rules: list[dict[str, object]] = Field(
        default_factory=list,
        alias="CONTEXT_WARNING_RULES",
        description=(
            "Optional overrides for context warning rules. Provide as a JSON array where each "
            "entry accepts `match`, `message`, `severity`, and `escalate_for_automation`."
        ),
    )

    def build_warning_engine(self) -> ContextWarningEngine:
        """Return a warning engine that merges configured overrides with defaults."""

        if not self.context_warning_rules:
            return default_warning_engine
        return ContextWarningEngine.from_overrides(
            default_warning_engine,
            self.context_warning_rules,
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance."""

    return Settings()
