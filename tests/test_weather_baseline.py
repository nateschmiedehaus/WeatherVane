from dataclasses import replace

from apps.worker.validation.weather import (
    BaselineThresholds,
    WeatherCoverageResult,
    compare_weather_baseline,
    render_baseline_markdown,
)


def _build_result(
    *,
    tenant_id: str = "TENANT1",
    status: str = "ok",
    join_mode: str = "full",
    geography_level: str = "dma",
    geocoded_ratio: float | None = 0.95,
    weather_missing_rows: int = 0,
    leakage_rows: int = 0,
    weather_coverage_ratio: float = 0.92,
    weather_coverage_threshold: float = 0.85,
    geography_fallback_reason: str | None = None,
) -> WeatherCoverageResult:
    return WeatherCoverageResult(
        tenant_id=tenant_id,
        window_start="2024-01-01T00:00:00+00:00",
        window_end="2024-01-07T00:00:00+00:00",
        status=status,
        join_mode=join_mode,
        geography_level=geography_level,
        weather_rows=140,
        feature_rows=140,
        observed_rows=140,
        weather_missing_rows=weather_missing_rows,
        weather_missing_dates=["2024-01-03"] if weather_missing_rows else [],
        leakage_rows=leakage_rows,
        forward_leakage_rows=0,
        forecast_leakage_rows=0,
        geocoded_order_ratio=geocoded_ratio,
        unique_geohash_count=18,
        guardrail_triggered=False,
        weather_coverage_ratio=weather_coverage_ratio,
        weather_coverage_threshold=weather_coverage_threshold,
        geography_fallback_reason=geography_fallback_reason,
        issues=[],
        report_path="experiments/features/weather_join_validation.json",
    )


def test_compare_weather_baseline_flags_regression() -> None:
    baseline = _build_result(geocoded_ratio=0.97, weather_missing_rows=0, leakage_rows=0)
    current = replace(
        baseline,
        geocoded_order_ratio=0.9,
        weather_missing_rows=3,
        leakage_rows=2,
    )

    comparison = compare_weather_baseline(current, baseline, thresholds=BaselineThresholds())

    assert comparison.status == "regression"
    assert any("Geocoded order ratio dropped" in entry for entry in comparison.regressions)
    assert any("Weather missing rows increased" in entry for entry in comparison.regressions)
    assert any("Leakage rows increased" in entry for entry in comparison.regressions)
    assert comparison.metrics["geocoded_order_ratio"]["delta"] == round(0.9 - 0.97, 4)


def test_render_baseline_markdown_outputs_table() -> None:
    baseline = _build_result(geocoded_ratio=0.95)
    current = replace(baseline, geocoded_order_ratio=0.96)
    comparison = compare_weather_baseline(
        current,
        baseline,
        thresholds=BaselineThresholds(geocoded_ratio_drop=0.1),
    )

    markdown = render_baseline_markdown(
        current,
        baseline,
        comparison,
        baseline_notes=["Baseline captured during October backfill."],
    )

    assert "| `geocoded_order_ratio` | 0.9500 | 0.9600 | 0.0100 |" in markdown
    assert "Baseline captured during October backfill." in markdown
    assert "## Current Run Details" in markdown
