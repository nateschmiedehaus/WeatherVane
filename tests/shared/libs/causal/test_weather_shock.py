from __future__ import annotations

from datetime import date, timedelta

import polars as pl
import pytest

from shared.libs.causal import estimate_weather_shock_effect


def _build_panel(
    *,
    treated_delta: float,
    control_noise: float = 0.0,
    extra_control_noise: float = 0.0,
) -> pl.DataFrame:
    start = date(2024, 1, 1)
    rows: list[dict[str, object]] = []
    for offset in range(14):
        current = start + timedelta(days=offset)
        trend = 120.0 + 0.8 * offset
        post = offset >= 7
        treated_value = trend + (treated_delta if post else 0.0)
        control_value = trend + control_noise
        control_b_value = trend + (control_noise * 0.5) + extra_control_noise
        rows.append({"geo": "treated", "date": current, "value": treated_value, "is_treated": 1})
        rows.append({"geo": "control_a", "date": current, "value": control_value, "is_treated": 0})
        rows.append({"geo": "control_b", "date": current, "value": control_b_value, "is_treated": 0})
    return pl.DataFrame(rows)


def test_weather_shock_effect_matches_expected_lift() -> None:
    frame = _build_panel(treated_delta=6.0)
    result = estimate_weather_shock_effect(
        frame,
        geo_column="geo",
        date_column="date",
        value_column="value",
        treatment_column="is_treated",
        shock_start=date(2024, 1, 8),
        synthetic_control=False,
    )

    assert result.effect == pytest.approx(6.0, abs=0.25)
    pre_gap = result.treated_pre_mean - result.control_pre_mean
    post_gap = result.treated_post_mean - result.control_post_mean
    assert post_gap - pre_gap == pytest.approx(result.effect, abs=1e-6)
    assert post_gap - pre_gap == pytest.approx(6.0, abs=0.25)
    assert result.weights["control_a"] == pytest.approx(0.5, abs=1e-6)
    assert result.weights["control_b"] == pytest.approx(0.5, abs=1e-6)
    assert result.n_post == 7
    assert result.n_pre == 7


def test_weather_shock_effect_prefers_closest_synthetic_control() -> None:
    frame = _build_panel(treated_delta=5.0, control_noise=0.0, extra_control_noise=12.0)
    result = estimate_weather_shock_effect(
        frame,
        geo_column="geo",
        date_column="date",
        value_column="value",
        treatment_column="is_treated",
        shock_start=date(2024, 1, 8),
        synthetic_control=True,
        weight_temperature=0.5,
    )

    weight_a = result.weights.get("control_a")
    weight_b = result.weights.get("control_b")
    assert weight_a is not None and weight_b is not None
    assert weight_a > weight_b
    assert result.effect == pytest.approx(5.0, abs=0.3)


def test_weather_shock_effect_requires_control_history() -> None:
    start = date(2024, 1, 1)
    rows = []
    for offset in range(7):
        current = start + timedelta(days=offset)
        rows.append({"geo": "treated", "date": current, "value": 100.0 + offset, "is_treated": 1})
    frame = pl.DataFrame(rows)

    with pytest.raises(ValueError):
        estimate_weather_shock_effect(
            frame,
            shock_start=date(2024, 1, 8),
        )
