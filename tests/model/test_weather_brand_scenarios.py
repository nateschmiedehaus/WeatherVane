from __future__ import annotations

import math
from datetime import timedelta
from pathlib import Path

import polars as pl

from shared.feature_store.feature_builder import FeatureBuilder
from shared.libs.testing.synthetic import (
    DEFAULT_BRAND_SCENARIOS,
    SYNTHETIC_ANCHOR_DATE,
    seed_synthetic_brand_portfolio,
)


def _corr(frame: pl.DataFrame, column: str) -> float:
    if column not in frame.columns:
        return 0.0
    correlation = frame.select(pl.corr("net_revenue", column)).to_series()
    if correlation.is_empty():
        return 0.0
    value = correlation.item()
    if value is None or not math.isfinite(value):
        return 0.0
    return float(value)


def test_brand_scenarios_span_weather_spectrum(tmp_path: Path) -> None:
    seed_synthetic_brand_portfolio(tmp_path, days=365)
    builder = FeatureBuilder(lake_root=tmp_path)
    start = SYNTHETIC_ANCHOR_DATE - timedelta(days=364)
    end = SYNTHETIC_ANCHOR_DATE

    correlations: dict[str, dict[str, float]] = {}
    meta_spend_means: dict[str, float] = {}

    for scenario in DEFAULT_BRAND_SCENARIOS:
        matrix = builder.build(scenario.tenant_id, start=start, end=end)
        observed = matrix.observed_frame.drop_nulls("net_revenue")
        correlations[scenario.tenant_id] = {
            metric: _corr(observed, metric) for metric in ("temp_c", "precip_mm", "snowfall_mm")
        }
        if "meta_spend" in observed.columns and not observed["meta_spend"].is_null().all():
            meta_spend_means[scenario.tenant_id] = float(observed["meta_spend"].mean())
        else:
            meta_spend_means[scenario.tenant_id] = 0.0

    assert correlations["brand-alpine-outfitters"]["snowfall_mm"] > 0.5
    assert correlations["brand-sunlit-skin"]["temp_c"] > 0.35
    assert correlations["brand-garden-gurus"]["precip_mm"] > 0.6
    assert abs(correlations["brand-garden-gurus"]["temp_c"]) < 0.2

    neutral_corrs = correlations["brand-neutral-goods"].values()
    assert all(abs(value) < 0.1 for value in neutral_corrs)

    assert correlations["brand-harbor-cafe"]["precip_mm"] > 0.2
    assert correlations["brand-harbor-cafe"]["temp_c"] < -0.15

    assert max(meta_spend_means.values()) - min(meta_spend_means.values()) > 15.0
