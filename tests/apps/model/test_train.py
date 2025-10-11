from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from apps.model.train import train_baseline
from shared.feature_store.feature_builder import TARGET_COLUMN
from shared.libs.testing.synthetic import seed_synthetic_tenant


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
