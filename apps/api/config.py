from functools import lru_cache

from shared.data_context import ContextWarningEngine, default_warning_engine

try:  # Prefer Pydantic v2 settings package when available.
    from pydantic_settings import BaseSettings, SettingsConfigDict
    from pydantic import AliasChoices, Field
except ImportError:  # pragma: no cover - fall back to v1 compatibility layer.
    from pydantic.v1 import BaseSettings, Field  # type: ignore[assignment, import]

    AliasChoices = None  # type: ignore[assignment]
    SettingsConfigDict = None  # type: ignore[assignment]

_UNSET = object()


def _settings_field(*, env_name: str, default=_UNSET, default_factory=_UNSET, **kwargs):
    """Return a Field configured for environment loading across Pydantic versions."""

    if default is not _UNSET and default_factory is not _UNSET:
        raise ValueError("Provide either default or default_factory, not both.")

    field_kwargs = dict(kwargs)
    if default_factory is not _UNSET:
        field_kwargs["default_factory"] = default_factory
    elif default is not _UNSET:
        field_kwargs["default"] = default

    if SettingsConfigDict is not None:
        alias_value = (
            AliasChoices(env_name, env_name.lower())
            if AliasChoices is not None
            else env_name
        )
        field_kwargs.setdefault("validation_alias", alias_value)
    else:
        field_kwargs.setdefault("env", env_name)

    return Field(**field_kwargs)


class Settings(BaseSettings):
    """Runtime configuration for the API service."""

    if SettingsConfigDict is not None:
        model_config = SettingsConfigDict(
            env_file=".env",
            case_sensitive=False,
            populate_by_name=True,
        )
    else:  # pragma: no cover - compatibility with Pydantic v1 import.
        class Config:
            env_file = ".env"
            case_sensitive = False
            allow_population_by_field_name = True

    app_env: str = _settings_field(env_name="APP_ENV", default="dev")
    api_title: str = "WeatherVane API"
    api_version: str = "0.1.0"
    database_dsn: str | None = _settings_field(env_name="DATABASE_URL", default=None)
    cors_origins: list[str] = _settings_field(
        env_name="CORS_ORIGINS",
        default_factory=list,
    )
    log_level: str = _settings_field(env_name="LOG_LEVEL", default="INFO")
    automation_webhook_url: str | None = _settings_field(
        env_name="AUTOMATION_WEBHOOK_URL",
        default=None,
    )
    context_warning_rules: list[dict[str, object]] = _settings_field(
        env_name="CONTEXT_WARNING_RULES",
        default_factory=list,
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
