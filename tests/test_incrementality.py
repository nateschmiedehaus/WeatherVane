import polars as pl
import pytest

from apps.validation.incrementality import (
    GeoHoldoutConfig,
    aggregate_metric,
    assign_geo_holdout,
    compute_holdout_summary,
    design_holdout_from_orders,
    geo_revenue_metrics,
    summarise_experiment,
)
from apps.worker.validation.incrementality import (
    record_experiment_observations,
    STORE as INCREMENTALITY_STORE,
)


def test_assign_geo_holdout_respects_ratio():
    metrics = pl.DataFrame({
        "geo": [f"geo_{i}" for i in range(10)],
        "weight": [i + 1 for i in range(10)],
    })
    config = GeoHoldoutConfig(holdout_ratio=0.3, min_holdout_units=2, seed=42)
    assigned = assign_geo_holdout(metrics, config)
    counts = assigned.group_by("group").agg(pl.len().alias("count")).to_dict()

    assert set(counts["group"]) == {"control", "treatment"}
    control_count = dict(zip(counts["group"], counts["count"]))["control"]
    assert control_count >= config.min_holdout_units
    assert control_count <= metrics.height


def test_summarise_experiment_basic_stats():
    df = pl.DataFrame({
        "geo": ["a", "b", "c", "d"],
        "group": ["treatment", "treatment", "control", "control"],
        "revenue": [120.0, 130.0, 100.0, 90.0],
    })
    estimate = summarise_experiment(df, value_column="revenue")

    assert pytest.approx(estimate.treatment_mean, 0.1) == 125.0
    assert pytest.approx(estimate.control_mean, 0.1) == 95.0
    assert estimate.lift > 0
    assert estimate.sample_size_treatment == 2
    assert estimate.sample_size_control == 2


def test_aggregate_metric_groups():
    df = pl.DataFrame({
        "geo": ["a", "a", "b", "b"],
        "group": ["treatment", "treatment", "control", "control"],
        "revenue": [10.0, 20.0, 15.0, 5.0],
    })

    aggregated = aggregate_metric(df, "revenue", ["geo", "group"], agg="sum")
    assert aggregated.height == 2
    a_row = aggregated.filter(pl.col("geo") == "a").get_column("revenue")[0]
    assert a_row == 30.0


def test_geo_revenue_metrics_handles_candidates():
    orders = pl.DataFrame({
        "ship_geohash": ["abc", "abd", "abe", None],
        "net_revenue": [100.0, 80.0, 60.0, 40.0],
    })
    metrics, geo_column = geo_revenue_metrics(orders)
    assert geo_column == "ship_geohash"
    assert metrics.height == 3
    assert "weight" in metrics.columns
    total_weight = float(metrics.get_column("weight").sum())
    assert pytest.approx(total_weight, 1e-6) == 1.0


def test_geo_revenue_metrics_backfills_missing_net_revenue():
    orders = pl.DataFrame({
        "ship_geohash": ["geo_a", "geo_b", "geo_c"],
        "subtotal_price": [120.0, 140.0, 50.0],
        "total_discounts": [20.0, None, 80.0],
    })
    metrics, geo_column = geo_revenue_metrics(orders)

    assert geo_column == "ship_geohash"
    assert metrics.height == 2

    lookup = {row["geo"]: row["revenue"] for row in metrics.to_dicts()}
    assert pytest.approx(lookup["geo_a"], 1e-6) == 100.0
    assert pytest.approx(lookup["geo_b"], 1e-6) == 140.0
    assert all(value >= 0 for value in lookup.values())


def test_design_incrementality_from_orders_requires_min_geos():
    orders = pl.DataFrame({
        "ship_geohash": ["a", "b", "c"],
        "net_revenue": [10.0, 20.0, 30.0],
    })
    config = GeoHoldoutConfig(holdout_ratio=0.3, min_holdout_units=2, seed=1)
    design = design_holdout_from_orders(orders, config)
    assert design["status"] == "insufficient_geo"

    richer_orders = pl.DataFrame({
        "ship_geohash": [f"geo_{i}" for i in range(6)],
        "net_revenue": [100.0, 80.0, 70.0, 60.0, 50.0, 40.0],
    })
    design_ready = design_holdout_from_orders(richer_orders, config)
    assert design_ready["status"] == "ready"
    assert design_ready["holdout_count"] >= config.min_holdout_units
    assert design_ready.get("geo_column") == "ship_geohash"


def test_compute_holdout_summary_returns_lift():
    orders = pl.DataFrame({
        "ship_geohash": [
            "geo_a",
            "geo_a",
            "geo_d",
            "geo_d",
            "geo_b",
            "geo_b",
            "geo_c",
            "geo_c",
        ],
        "net_revenue": [120.0, 110.0, 105.0, 98.0, 90.0, 95.0, 80.0, 85.0],
    })
    assignment = [
        {"geo": "geo_a", "group": "treatment"},
        {"geo": "geo_d", "group": "treatment"},
        {"geo": "geo_b", "group": "control"},
        {"geo": "geo_c", "group": "control"},
    ]
    estimate = compute_holdout_summary(orders, assignment, geo_column="ship_geohash")

    assert estimate.sample_size_treatment == 2
    assert estimate.sample_size_control == 2
    assert estimate.absolute_lift > 0


def test_record_experiment_observations_updates_state(tmp_path):
    original_root = INCREMENTALITY_STORE.root
    try:
        INCREMENTALITY_STORE.root = tmp_path
        tmp_path.mkdir(parents=True, exist_ok=True)

        design_payload = {
            "status": "ready",
            "geo_column": "geo",
            "assignment": [
                {"geo": "g1", "group": "treatment", "weight": 0.5},
                {"geo": "g2", "group": "control", "weight": 0.5},
            ],
        }
        INCREMENTALITY_STORE.save("designs", "tenant", {"design": design_payload})

        observations = [
            {"geo": "g1", "group": "treatment", "revenue": 150.0},
            {"geo": "g4", "group": "treatment", "revenue": 140.0},
            {"geo": "g2", "group": "control", "revenue": 100.0},
            {"geo": "g3", "group": "control", "revenue": 110.0},
        ]

        result = record_experiment_observations("tenant", observations)
        summary = result["summary"]
        assert summary["absolute_lift"] > 0
        assert summary.get("generated_at")

        stored = INCREMENTALITY_STORE.load("designs", "tenant")
        assert stored["summary"]["absolute_lift"] == summary["absolute_lift"]
        assert stored["summary"]["is_significant"] == summary["is_significant"]
        assert stored["summary"]["generated_at"] == summary["generated_at"]
        assert stored.get("aggregated_observations")
    finally:
        INCREMENTALITY_STORE.root = original_root
