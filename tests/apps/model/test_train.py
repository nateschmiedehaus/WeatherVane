from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl

from apps.model.baseline import fit_baseline_model
from apps.model.train import evaluate_baseline_run, train_baseline
from shared.feature_store.feature_builder import TARGET_COLUMN
from shared.libs.testing.synthetic import (
    DEFAULT_BRAND_SCENARIOS,
    SYNTHETIC_ANCHOR_DATE,
    seed_synthetic_tenant,
)


def test_train_baseline_persists_artifacts(tmp_path: Path) -> None:
    lake_root = tmp_path / "lake"
    lake_root.mkdir()
    tenant = "tenant-train"
    seed_synthetic_tenant(lake_root, tenant, days=90)

    start = datetime(2023, 10, 1)
    end = datetime(2024, 1, 31)

    result = train_baseline(
        tenant,
        start,
        end,
        lake_root=lake_root,
        output_root=tmp_path / "models",
        run_id="test-run",
    )

    assert result.model_path.exists()
    assert result.metadata_path.exists()

    metadata = json.loads(result.metadata_path.read_text())
    assert metadata["tenant_id"] == tenant
    assert metadata["window"]["start"].startswith("2023-10-01")
    assert metadata["data"]["observed_rows"] >= metadata["training"]["rows"] >= metadata["holdout"]["rows"]
    assert metadata["data"]["feature_columns"] >= 1
    assert TARGET_COLUMN not in metadata["features"]

    weather_features = {"temp_c", "temp_anomaly", "precip_mm"}
    assert weather_features.intersection(metadata["features"])

    assert metadata["training"]["rows"] > metadata["holdout"]["rows"]
    assert metadata["training"]["r2"] >= 0.0
    assert metadata["holdout"]["r2"] >= 0.0

    if metadata["artifacts"]["holdout_diagnostics"]:
        assert Path(metadata["artifacts"]["holdout_diagnostics"]).exists()

    assert metadata["gam"]["reason"] in {
        "gam",
        "insufficient_rows",
        "pygam_unavailable",
        "no_features",
        "fallback_linear",
    }

    assert metadata["top_features"]
    assert "weather_fit" in metadata
    weather_fit = metadata["weather_fit"]
    assert weather_fit["classification"] in {"strong", "moderate", "weak", "none"}
    assert isinstance(weather_fit["weather_features"], list)
    assert "message" in weather_fit


def test_weather_fit_flags_low_signal(tmp_path: Path) -> None:
    lake_root = tmp_path / "lake"
    lake_root.mkdir()

    neutral = next(s for s in DEFAULT_BRAND_SCENARIOS if s.tenant_id == "brand-neutral-goods")
    seed_synthetic_tenant(lake_root, neutral.tenant_id, days=90, scenario=neutral)

    start = SYNTHETIC_ANCHOR_DATE - timedelta(days=89)
    end = SYNTHETIC_ANCHOR_DATE

    result = train_baseline(
        neutral.tenant_id,
        start,
        end,
        lake_root=lake_root,
        output_root=tmp_path / "models",
        run_id="neutral-test",
    )

    weather_fit = result.metadata["weather_fit"]
    assert weather_fit["classification"] == "none"
    assert weather_fit["score"] <= 0.1
    assert "not a fit" in weather_fit["message"].lower()


def test_evaluate_baseline_run_summarizes_payload() -> None:
    rng = np.random.default_rng(7)
    rows = 72
    temp_c = rng.normal(18.0, 4.5, size=rows)
    temp_anomaly = temp_c - temp_c.mean()
    temp_roll7 = temp_c + rng.normal(scale=0.6, size=rows)
    precip_mm = rng.gamma(shape=2.0, scale=0.8, size=rows)
    precip_anomaly = precip_mm - precip_mm.mean()
    meta_spend = rng.normal(60.0, 7.5, size=rows)
    google_spend = rng.normal(35.0, 6.0, size=rows)
    promos_sent = rng.poisson(lam=1.2, size=rows).astype(float)

    interaction = -0.1 * temp_anomaly * (meta_spend / 50.0) + 0.05 * precip_anomaly * (promos_sent + 1.0)
    net_revenue = (
        160.0
        + 2.1 * meta_spend
        + 1.6 * google_spend
        - 1.4 * precip_mm
        + interaction
        + rng.normal(scale=10.0, size=rows)
    )

    frame = pl.DataFrame(
        {
            TARGET_COLUMN: net_revenue,
            "temp_c": temp_c,
            "temp_anomaly": temp_anomaly,
            "temp_roll7": temp_roll7,
            "precip_mm": precip_mm,
            "precip_anomaly": precip_anomaly,
            "meta_spend": meta_spend,
            "google_spend": google_spend,
            "promos_sent": promos_sent,
        }
    )
    features = [column for column in frame.columns if column != TARGET_COLUMN]
    train_frame = frame.head(60)
    holdout_frame = frame.tail(rows - 60)

    model = fit_baseline_model(train_frame, target=TARGET_COLUMN, features=features)
    evaluation = evaluate_baseline_run(model, train_frame, holdout_frame, target=TARGET_COLUMN)

    assert evaluation.train_metrics["rows"] == train_frame.height
    assert evaluation.holdout_metrics["rows"] == holdout_frame.height
    assert evaluation.gam_reason in {"gam", "fallback_linear", "insufficient_rows", "pygam_unavailable", "no_features"}
    assert evaluation.gam_min_rows >= 24
    assert evaluation.weather_fit["classification"] in {"strong", "moderate", "weak", "none"}
    assert "message" in evaluation.weather_fit
    assert evaluation.gam_used == (evaluation.gam_reason == "gam")
    if model.features:
        assert evaluation.influences
        influence_features = {item["feature"] for item in evaluation.influences}
        assert influence_features.issubset(set(model.features))
