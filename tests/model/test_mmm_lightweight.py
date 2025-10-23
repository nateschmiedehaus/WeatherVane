from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Dict, List

import importlib
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
import polars as pl
import pytest

mmm = importlib.import_module("apps.model.mmm")
mmm_lightweight = importlib.import_module("apps.model.mmm_lightweight")
poc_models = importlib.import_module("apps.model.pipelines.poc_models")


class _DummyLightweightModel:
    def __init__(self) -> None:
        self.fitted = False

    def fit(  # type: ignore[override]
        self,
        media: np.ndarray,
        target: np.ndarray,
        extra_features: np.ndarray | None = None,
        media_names: List[str] | None = None,
    ) -> "_DummyLightweightModel":
        self.fitted = True
        self._media = media
        self._target = target
        self._extra = extra_features
        self._names = media_names
        return self


def _fake_transform_adstock(media: np.ndarray, adstock_lags: List[int]) -> np.ndarray:
    media = np.asarray(media, dtype=float)
    out = np.zeros_like(media, dtype=float)
    for idx, lag in enumerate(adstock_lags):
        lag = max(1, int(lag))
        kernel = np.ones(lag, dtype=float) / float(lag)
        convolved = np.convolve(media[:, idx], kernel, mode="full")[: media.shape[0]]
        out[:, idx] = convolved
    return out


def _fake_transform_saturation(media: np.ndarray, gamma: List[float], k: List[float]) -> np.ndarray:
    media = np.asarray(media, dtype=float)
    out = np.zeros_like(media, dtype=float)
    for idx, (gamma_val, k_val) in enumerate(zip(gamma, k)):
        k_safe = max(k_val, 1e-3)
        powered = np.power(np.clip(media[:, idx], a_min=0.0, a_max=None), gamma_val)
        out[:, idx] = powered / (powered + k_safe)
    return out


def _seed_lightweight(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mmm_lightweight, "available", lambda: True, raising=False)
    monkeypatch.setattr(mmm_lightweight, "transform_adstock", _fake_transform_adstock, raising=False)
    monkeypatch.setattr(mmm_lightweight, "transform_saturation", _fake_transform_saturation, raising=False)

    def _fake_fit_lightweight_mmm(
        media_spend: np.ndarray,
        media_cols: List[str],
        target: np.ndarray,
        extra_features: np.ndarray | None = None,
        adstock_lags: Dict[str, int] | None = None,
        saturation_k: Dict[str, float] | None = None,
        saturation_s: Dict[str, float] | None = None,
        estimate_adstock: bool = True,
        estimate_saturation: bool = True,
    ) -> mmm_lightweight.LightweightMMMResult:
        adstock_map = adstock_lags or {name: 1 for name in media_cols}
        k_map = saturation_k or {name: 1.0 for name in media_cols}
        s_map = saturation_s or {name: 1.0 for name in media_cols}

        adstock_vector = [adstock_map[name] for name in media_cols]
        gamma_vector = [s_map[name] for name in media_cols]
        k_vector = [k_map[name] for name in media_cols]

        adstock_media = _fake_transform_adstock(media_spend, adstock_vector)
        transformed = _fake_transform_saturation(adstock_media, gamma_vector, k_vector)

        model = _DummyLightweightModel().fit(
            media=transformed,
            target=target,
            extra_features=extra_features,
            media_names=media_cols,
        )
        return mmm_lightweight.LightweightMMMResult(
            mmm=model,
            channel_names=media_cols,
            adstock_lags=adstock_map,
            saturation_k=k_map,
            saturation_s=s_map,
            transformed_media=transformed,
        )

    monkeypatch.setattr(mmm_lightweight, "fit_lightweight_mmm", _fake_fit_lightweight_mmm, raising=False)


def test_fit_mmm_model_prefers_lightweight(monkeypatch: pytest.MonkeyPatch) -> None:
    _seed_lightweight(monkeypatch)

    frame = pl.DataFrame(
        {
            "channel_a_spend": [100.0, 120.0, 90.0, 80.0, 95.0],
            "channel_b_spend": [60.0, 55.0, 65.0, 70.0, 68.0],
            "aux_metric": [1.0, 1.5, 2.0, 1.7, 1.8],
            "net_revenue": [900.0, 960.0, 930.0, 910.0, 940.0],
        }
    )
    spend_cols = ["channel_a_spend", "channel_b_spend"]
    model = mmm.fit_mmm_model(frame, spend_cols, "net_revenue")

    assert model.source == "lightweight"
    assert model.adstock_lags is not None
    assert model.saturation_k is not None
    assert model.saturation_s is not None

    media_matrix = frame.select(spend_cols).to_numpy()
    target = frame["net_revenue"].to_numpy()
    adstock_vector = [model.adstock_lags[col] for col in spend_cols]
    gamma_vector = [model.saturation_s[col] for col in spend_cols]
    k_vector = [model.saturation_k[col] for col in spend_cols]

    transformed = _fake_transform_saturation(
        _fake_transform_adstock(media_matrix, adstock_vector),
        gamma_vector,
        k_vector,
    )
    design = np.hstack([np.ones((transformed.shape[0], 1)), transformed])
    coefs, *_ = np.linalg.lstsq(design, target, rcond=None)
    channel_coefs = coefs[1:]
    intercept = coefs[0]
    contributions = transformed * channel_coefs
    channel_revenue = contributions.sum(axis=0)
    expected_roas = channel_revenue / media_matrix.sum(axis=0)
    baseline_predictions = intercept + contributions.sum(axis=1)
    baseline_mean = baseline_predictions.mean()

    expected_elasticities: Dict[str, float] = {}
    for idx, col in enumerate(spend_cols):
        assert model.mean_roas[col] == pytest.approx(expected_roas[idx], rel=1e-5)
        assert model.mean_spend[col] == pytest.approx(media_matrix[:, idx].mean(), rel=1e-5)
        mean_value = media_matrix[:, idx].mean()
        delta = max(mean_value * 0.05, 1.0)
        perturbed_media = media_matrix.copy()
        perturbed_media[:, idx] = media_matrix[:, idx] + delta
        perturbed_transformed = _fake_transform_saturation(
            _fake_transform_adstock(perturbed_media, adstock_vector),
            gamma_vector,
            k_vector,
        )
        perturbed_contrib = perturbed_transformed * channel_coefs
        perturbed_predictions = intercept + perturbed_contrib.sum(axis=1)
        revenue_delta = float(np.mean(perturbed_predictions - baseline_predictions))
        relative_revenue = revenue_delta / baseline_mean if baseline_mean else 0.0
        relative_spend = delta / mean_value if mean_value else 0.0
        expected_elasticities[col] = relative_revenue / relative_spend if relative_spend else 0.0
        assert model.elasticity[col] == pytest.approx(expected_elasticities[col], rel=1e-4)


def test_fit_mmm_model_falls_back_without_lightweight(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mmm_lightweight, "available", lambda: False, raising=False)

    frame = pl.DataFrame(
        {
            "channel_a_spend": [10.0, 12.0, 9.0],
            "net_revenue": [100.0, 105.0, 102.0],
        }
    )
    model = mmm.fit_mmm_model(frame, ["channel_a_spend"], "net_revenue")

    assert model.source == "heuristic"
    total_spend = sum(frame["channel_a_spend"])
    total_revenue = sum(frame["net_revenue"])
    assert model.base_roas == pytest.approx(total_revenue / total_spend, rel=1e-6)


def test_train_poc_models_uses_lightweight(monkeypatch: pytest.MonkeyPatch) -> None:
    _seed_lightweight(monkeypatch)

    class _DummyTimeseriesModel:
        def predict(self, features: np.ndarray) -> np.ndarray:  # type: ignore[override]
            return np.zeros(len(features), dtype=float)

        def score(self, features: np.ndarray, targets: np.ndarray) -> float:  # type: ignore[override]
            return 0.0

    class _DummyTimeseriesFit:
        def __init__(self) -> None:
            self.model = _DummyTimeseriesModel()
            self.cv_scores = [0.0]
            self.holdout_r2 = 0.0

    monkeypatch.setattr(poc_models, "fit_timeseries", lambda *_: _DummyTimeseriesFit(), raising=False)

    matrix = {
        "date": [date(2024, 1, 1) + timedelta(days=idx) for idx in range(6)],
        "channel_a_spend": [100.0, 120.0, 110.0, 105.0, 98.0, 115.0],
        "channel_b_spend": [60.0, 58.0, 62.0, 65.0, 64.0, 63.0],
        "baseline_feature": [1.0, 1.1, 1.2, 1.1, 1.05, 1.15],
        "net_revenue": [900.0, 950.0, 940.0, 930.0, 920.0, 945.0],
    }
    bundle = poc_models.train_poc_models(matrix, target="net_revenue")

    assert bundle.mmm.source == "lightweight"
    assert bundle.diagnostics["average_roas"] == pytest.approx(bundle.mmm.base_roas, rel=1e-6)
    assert bundle.mmm.adstock_lags is not None
    assert bundle.mmm.saturation_k is not None
    assert bundle.mmm.saturation_s is not None
    assert bundle.quantiles["expected_revenue"]["p50"] > 0.0
