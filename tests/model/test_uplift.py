import json
from pathlib import Path

import numpy as np
import polars as pl
import pytest

from apps.model.uplift import UpliftModelConfig, train_uplift_model, write_uplift_report


def _synthetic_uplift_frame(rows: int = 480, seed: int = 2024) -> pl.DataFrame:
    rng = np.random.default_rng(seed)
    treatment = rng.binomial(1, 0.5, size=rows)
    feature_one = rng.normal(0, 1, size=rows)
    feature_two = rng.normal(0, 1, size=rows)
    seasonality = rng.normal(0, 0.25, size=rows)
    base = 100 + feature_one * 5 + feature_two * 3 + seasonality * 10
    uplift_signal = 12 * treatment * (0.6 + 0.4 * feature_one)
    noise = rng.normal(0, 4, size=rows)
    outcome = base + uplift_signal + noise
    return pl.DataFrame(
        {
            "feature_one": feature_one,
            "feature_two": feature_two,
            "seasonality": seasonality,
            "treatment": treatment,
            "net_revenue": outcome,
        }
    )


def test_train_uplift_model_generates_report(tmp_path: Path) -> None:
    frame = _synthetic_uplift_frame()
    config = UpliftModelConfig(test_size=0.3, top_k_percentiles=(0.1, 0.2))

    result = train_uplift_model(frame, config=config)

    validation_metrics = result.metrics["validation"]
    assert validation_metrics["actual_ate"] > 5.0
    assert validation_metrics["predicted_ate"] > 5.0
    assert "top_10" in result.segments
    assert result.segments["top_10"]["actual_lift"] > 5.0
    assert len(result.feature_importance) == len(result.feature_names) or (
        not result.feature_names and "bias" in result.feature_importance
    )

    output_path = tmp_path / "uplift_report.json"
    written = write_uplift_report(result, output_path)
    payload = json.loads(written.read_text())

    assert payload["dataset"]["rows_total"] == frame.height
    assert payload["metrics"]["validation"]["actual_ate"] == pytest.approx(
        validation_metrics["actual_ate"]
    )
    assert len(payload["validation_preview"]) <= 10


def test_train_uplift_model_requires_treatment_and_target() -> None:
    frame = pl.DataFrame({"feature": [1.0, 2.0, 3.0], "treatment": [1, 0, 1]})
    with pytest.raises(ValueError):
        train_uplift_model(frame)
