from __future__ import annotations

from datetime import date

import polars as pl
import pytest

from apps.api.features.product_feature_builder import ProductFeatureBuilder
from shared.schemas.product_taxonomy import ProductTaxonomyEntry


def test_weather_affinity_score_detects_positive_lift() -> None:
    builder = ProductFeatureBuilder()
    frame = pl.DataFrame(
        {
            "tenant_id": ["t1"] * 6,
            "canonical_product_id": ["rain_coat"] * 6,
            "net_revenue": [80, 90, 20, 18, 22, 19],
            "weather_bucket": ["rain", "rain", "neutral", "neutral", "heat", "cold"],
            "weather_affinity": ["rain"] * 6,
        }
    )

    scores = builder._weather_affinity_scores(frame)

    assert scores.height == 1
    row = scores.row(0, named=True)
    assert row["tenant_id"] == "t1"
    assert pytest.approx(row["weather_affinity_score"], rel=1e-3) == (85 - 19.75) / 19.75
    assert row["matching_weather_days"] == 2


def test_product_feature_builder_builds_hierarchical_features() -> None:
    tenant_id = "tenant_a"
    umbrella_taxonomy = ProductTaxonomyEntry(
        tenant_id=tenant_id,
        canonical_product_id="umbrella_pro",
        product_name="Umbrella Pro",
        category_l1="accessories",
        category_l2="umbrellas",
        weather_affinity="rain",
        seasonality="weather_triggered",
        cross_brand_key="umbrellas_rain",
        product_ids=["umbrella_pro"],
        brand_ids=["brand_rain"],
        sources=["shopify"],
        confidence=0.9,
        evidence={},
    )
    sunscreen_taxonomy = ProductTaxonomyEntry(
        tenant_id=tenant_id,
        canonical_product_id="sun_blocker",
        product_name="Sun Blocker",
        category_l1="accessories",
        category_l2="sunscreen",
        weather_affinity="heat",
        seasonality="seasonal_q2_q3",
        cross_brand_key="sunscreen_heat",
        product_ids=["sun_blocker"],
        brand_ids=["brand_heat"],
        sources=["shopify"],
        confidence=0.9,
        evidence={},
    )

    product_rows = [
        # Umbrella baseline months
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-01-05", "net_revenue": 40.0, "units_sold": 4, "meta_spend": 12.0},
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-02-04", "net_revenue": 35.0, "units_sold": 3, "meta_spend": 10.0},
        # Umbrella mid-month baseline that should only influence 28-day velocity
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-03-10", "net_revenue": 60.0, "units_sold": 6, "meta_spend": 15.0},
        # Umbrella heavy rain week (latest window)
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-03-24", "net_revenue": 220.0, "units_sold": 25, "meta_spend": 36.0},
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-03-25", "net_revenue": 90.0, "units_sold": 12, "meta_spend": 20.0},
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-03-26", "net_revenue": 85.0, "units_sold": 11, "meta_spend": 19.0},
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-03-27", "net_revenue": 230.0, "units_sold": 26, "meta_spend": 37.0},
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-03-28", "net_revenue": 82.0, "units_sold": 11, "meta_spend": 19.0},
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-03-29", "net_revenue": 240.0, "units_sold": 28, "meta_spend": 38.0},
        {"tenant_id": tenant_id, "canonical_product_id": "umbrella_pro", "date": "2025-03-30", "net_revenue": 78.0, "units_sold": 10, "meta_spend": 18.0},
        # Sunscreen balanced months
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-01-12", "net_revenue": 100.0, "units_sold": 12, "meta_spend": 24.0},
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-02-10", "net_revenue": 102.0, "units_sold": 12, "meta_spend": 24.0},
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-03-24", "net_revenue": 22.0, "units_sold": 4, "meta_spend": 8.0},
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-03-25", "net_revenue": 34.0, "units_sold": 6, "meta_spend": 12.0},
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-03-26", "net_revenue": 33.0, "units_sold": 6, "meta_spend": 12.0},
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-03-28", "net_revenue": 36.0, "units_sold": 7, "meta_spend": 13.0},
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-03-30", "net_revenue": 32.0, "units_sold": 5, "meta_spend": 11.0},
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-04-05", "net_revenue": 74.0, "units_sold": 10, "meta_spend": 16.0},
        {"tenant_id": tenant_id, "canonical_product_id": "sun_blocker", "date": "2025-04-10", "net_revenue": 76.0, "units_sold": 11, "meta_spend": 17.0},
    ]
    product_daily = pl.DataFrame(product_rows)

    weather_rows = [
        {"date": "2025-01-05", "temp_c": 3.0, "precip_mm": 6.5},
        {"date": "2025-01-12", "temp_c": 29.0, "precip_mm": 0.2},
        {"date": "2025-02-04", "temp_c": 5.5, "precip_mm": 1.0},
        {"date": "2025-02-10", "temp_c": 30.0, "precip_mm": 0.1},
        {"date": "2025-03-24", "temp_c": 12.0, "precip_mm": 8.0},
        {"date": "2025-03-25", "temp_c": 28.0, "precip_mm": 0.1},
        {"date": "2025-03-26", "temp_c": 29.0, "precip_mm": 0.0},
        {"date": "2025-03-27", "temp_c": 13.0, "precip_mm": 7.5},
        {"date": "2025-03-28", "temp_c": 31.0, "precip_mm": 0.0},
        {"date": "2025-03-29", "temp_c": 11.0, "precip_mm": 9.0},
        {"date": "2025-03-30", "temp_c": 30.0, "precip_mm": 0.0},
        {"date": "2025-04-05", "temp_c": 29.0, "precip_mm": 0.0},
        {"date": "2025-04-10", "temp_c": 30.0, "precip_mm": 0.0},
    ]
    weather_daily = pl.DataFrame(weather_rows)

    builder = ProductFeatureBuilder()
    result = builder.build(
        product_daily=product_daily,
        taxonomy=[umbrella_taxonomy, sunscreen_taxonomy],
        weather_daily=weather_daily,
    )

    latest_date = date(2025, 4, 10)
    assert result.metadata["latest_observation_date"] == latest_date.isoformat()

    product_features = result.product_features
    umbrella_row = product_features.filter(pl.col("canonical_product_id") == "umbrella_pro").row(0, named=True)
    assert pytest.approx(umbrella_row["revenue_7d"], rel=1e-3) == 220 + 90 + 85 + 230 + 82 + 240 + 78
    assert pytest.approx(umbrella_row["roas_7d"], rel=1e-3) == umbrella_row["revenue_7d"] / (
        36 + 20 + 19 + 37 + 19 + 38 + 18
    )
    assert umbrella_row["weather_affinity_score"] > 1.3
    assert umbrella_row["seasonality_label"] == "seasonal"
    assert umbrella_row["days_7d"] == 7
    assert umbrella_row["days_28d"] == 8
    assert pytest.approx(umbrella_row["revenue_velocity_index"], rel=1e-3) == (1025 / 7) / (1085 / 8)
    assert pytest.approx(umbrella_row["units_velocity_index"], rel=1e-3) == (123 / 7) / (129 / 8)

    sunscreen_row = product_features.filter(pl.col("canonical_product_id") == "sun_blocker").row(0, named=True)
    assert sunscreen_row["seasonality_label"] == "evergreen"
    assert sunscreen_row["revenue_28d"] > 0

    category_weather = result.category_weather_performance
    umbrellas_weather = category_weather.filter(
        (pl.col("category_l2") == "umbrellas") & (pl.col("weather_bucket") == "rain")
    ).row(0, named=True)
    assert umbrellas_weather["lift_vs_neutral"] is None or umbrellas_weather["lift_vs_neutral"] >= 0

    weather_corr = result.weather_correlations
    rain_corr = weather_corr.filter(pl.col("canonical_product_id") == "umbrella_pro").row(0, named=True)
    heat_corr = weather_corr.filter(pl.col("canonical_product_id") == "sun_blocker").row(0, named=True)
    assert rain_corr["corr_precip_mm"] > 0.4
    assert heat_corr["corr_temp_c"] > 0.35
    assert heat_corr["corr_precip_mm"] < 0


def test_velocity_index_requires_positive_baseline() -> None:
    builder = ProductFeatureBuilder()
    product_daily = pl.DataFrame(
        {
            "tenant_id": ["tenant_x"] * 3,
            "canonical_product_id": ["stalled"] * 3,
            "date": ["2025-03-01", "2025-03-02", "2025-03-03"],
            "net_revenue": [0.0, 0.0, 0.0],
            "units_sold": [0, 0, 0],
        }
    )

    taxonomy_entry = ProductTaxonomyEntry(
        tenant_id="tenant_x",
        canonical_product_id="stalled",
        product_name="Stalled Product",
        category_l1="misc",
        category_l2="misc",
        weather_affinity="neutral",
        seasonality="evergreen",
        cross_brand_key="misc",
        product_ids=["stalled"],
        brand_ids=["brand_misc"],
        sources=["manual"],
        confidence=0.1,
        evidence={},
    )

    result = builder.build(
        product_daily=product_daily, taxonomy=[taxonomy_entry], weather_daily=None
    )

    stalled_row = result.product_features.row(0, named=True)
    assert stalled_row["revenue_velocity_index"] is None
    assert stalled_row["units_velocity_index"] is None
