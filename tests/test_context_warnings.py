import pytest

from shared.data_context.warnings import ContextWarningEngine, WarningRule, default_warning_engine

try:  # pragma: no cover - optional dependency path
    from apps.api.config import Settings
except Exception:  # pydantic BaseSettings missing in constrained envs
    Settings = None  # type: ignore[assignment]


def test_context_warning_engine_escalates_for_autopilot():
    engine = ContextWarningEngine(
        [
            WarningRule(
                match="history.short",
                message="History short",
                severity="warning",
                escalate_for_automation=True,
            )
        ]
    )

    result = engine.evaluate(
        ["history.short"],
        autopilot_enabled=True,
        pushes_enabled=False,
    )

    assert result
    warning = result[0]
    assert warning.code == "history_short"
    assert warning.severity == "critical"


def test_context_warning_engine_formats_dataset_placeholder():
    engine = ContextWarningEngine(
        [WarningRule(match="nulls.high.orders", message="Nulls in {dataset}")]
    )

    result = engine.evaluate(
        ["nulls.high.orders"],
        autopilot_enabled=False,
        pushes_enabled=False,
    )

    assert result[0].message == "Nulls in Orders"


def test_context_warning_engine_from_overrides_replaces_defaults():
    overrides = [{"match": "history.short", "severity": "info", "message": "Short but ok"}]
    engine = ContextWarningEngine.from_overrides(default_warning_engine, overrides)

    result = engine.evaluate([
        "history.short",
    ], autopilot_enabled=False, pushes_enabled=False)

    assert result[0].severity == "info"
    assert result[0].message == "Short but ok"


@pytest.mark.skipif(Settings is None, reason="pydantic BaseSettings not available")
def test_settings_build_warning_engine_merges_overrides():
    settings = Settings(context_warning_rules=[{"match": "ads.sparse", "severity": "critical"}])
    engine = settings.build_warning_engine()

    result = engine.evaluate([
        "ads.sparse",
    ], autopilot_enabled=False, pushes_enabled=False)

    assert result[0].severity == "critical"
