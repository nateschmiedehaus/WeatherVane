import numpy as np
import polars as pl
import pytest

from apps.model.baseline import (
    BaselineModel,
    LinearGAM,
    evaluate_r2,
    fit_baseline_model,
)


@pytest.mark.skipif(LinearGAM is None, reason="pyGAM optional dependency not available")
def test_fit_baseline_model_trains_gam_with_weather_signals() -> None:
    rng = np.random.default_rng(42)
    rows = 120
    temp_c = rng.normal(loc=18.0, scale=5.0, size=rows)
    temp_anomaly = temp_c - temp_c.mean()
    temp_roll7 = temp_c + rng.normal(scale=0.8, size=rows)
    precip_mm = rng.gamma(shape=2.5, scale=1.2, size=rows)
    precip_anomaly = precip_mm - precip_mm.mean()
    precip_roll7 = precip_mm + rng.normal(scale=0.6, size=rows)
    meta_spend = rng.normal(loc=65.0, scale=8.0, size=rows)
    google_spend = rng.normal(loc=42.0, scale=6.5, size=rows)
    promos_sent = rng.poisson(lam=1.5, size=rows).astype(float)

    # Weather interacts with marketing performance: hot spikes dampen Meta returns, rain helps promos.
    interaction = -0.12 * temp_anomaly * (meta_spend / 50.0) + 0.08 * precip_anomaly * (promos_sent + 1.0)
    net_revenue = (
        180.0
        + 2.4 * meta_spend
        + 1.8 * google_spend
        - 3.0 * np.clip(temp_c - 28.0, a_min=0.0, a_max=None)
        - 1.6 * precip_mm
        + interaction
        + rng.normal(scale=12.0, size=rows)
    )

    frame = pl.DataFrame(
        {
            "net_revenue": net_revenue,
            "temp_c": temp_c,
            "temp_anomaly": temp_anomaly,
            "temp_roll7": temp_roll7,
            "precip_mm": precip_mm,
            "precip_anomaly": precip_anomaly,
            "precip_roll7": precip_roll7,
            "meta_spend": meta_spend,
            "google_spend": google_spend,
            "promos_sent": promos_sent,
        }
    )
    features = [col for col in frame.columns if col != "net_revenue"]

    model = fit_baseline_model(frame, target="net_revenue", features=features)

    assert model.gam is not None
    assert set(model.features) == set(features)

    r2 = evaluate_r2(model, frame)
    assert r2 > 0.8


def test_fit_baseline_model_falls_back_to_linear_for_small_sample() -> None:
    frame = pl.DataFrame(
        {
            "net_revenue": [100.0, 105.0, 103.0, 110.0],
            "temp_c": [18.0, 19.0, 20.0, 21.0],
            "meta_spend": [50.0, 52.0, 53.0, 55.0],
        }
    )
    model = fit_baseline_model(frame, target="net_revenue", features=["temp_c", "meta_spend"])

    assert model.gam is None
    assert model.coefficients
    preds = model.predict(frame)
    assert isinstance(preds, pl.Series)


def test_evaluate_r2_handles_missing_target_column() -> None:
    model = BaselineModel(coefficients={}, intercept=10.0, features=[], target="net_revenue")
    frame = pl.DataFrame({"meta_spend": [50.0, 52.0]})
    assert evaluate_r2(model, frame) == 0.0
