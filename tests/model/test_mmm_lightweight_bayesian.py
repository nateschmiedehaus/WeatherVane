"""Tests for Bayesian parameter estimation in LightweightMMM."""
from __future__ import annotations

import importlib
from pathlib import Path
from typing import Dict, List
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
import polars as pl
import pytest

mmm = importlib.import_module("apps.model.mmm")
mmm_lightweight = importlib.import_module("apps.model.mmm_lightweight")


class _DummyBayesianModel:
    """Mock for LightweightMMM with Bayesian estimation."""
    def __init__(self) -> None:
        self.fitted = False
        self._adstock_params: Dict[str, Dict[str, float]] = {}
        self._saturation_params: Dict[str, Dict[str, float]] = {}
        self._names = None
        self._media = None
        self._target = None
        self._extra = None

    def fit(
        self,
        media: np.ndarray,
        target: np.ndarray,
        extra_features: np.ndarray | None = None,
        media_names: List[str] | None = None,
    ) -> "_DummyBayesianModel":
        self.fitted = True
        self._media = media
        self._target = target
        self._extra = extra_features
        self._names = media_names
        return self

    def fit_adstock(
        self,
        media: np.ndarray,
        target: np.ndarray,
        extra_features: np.ndarray | None = None,
    ) -> np.ndarray:
        """Mock Bayesian adstock fitting."""
        if not self._names:
            return media

        # Simulate learned adstock parameters
        for idx, name in enumerate(self._names):
            self._adstock_params[name] = {"lag": float(idx + 2)}

        return _fake_transform_adstock(
            media=media,
            adstock_lags=[int(params["lag"]) for params in self._adstock_params.values()],
        )

    def fit_saturation(
        self,
        media: np.ndarray,
        target: np.ndarray,
        extra_features: np.ndarray | None = None,
    ) -> np.ndarray:
        """Mock Bayesian saturation fitting."""
        if not self._names:
            return media

        # Simulate learned Hill curve parameters
        for idx, name in enumerate(self._names):
            self._saturation_params[name] = {
                "k": float(50.0 * (idx + 1)),
                "gamma": float(0.5 + 0.1 * idx),
            }

        return _fake_transform_saturation(
            media=media,
            gamma=[params["gamma"] for params in self._saturation_params.values()],
            k=[params["k"] for params in self._saturation_params.values()],
        )

    def get_adstock_params(self) -> Dict[str, Dict[str, float]]:
        """Get learned adstock parameters."""
        return self._adstock_params

    def get_saturation_params(self) -> Dict[str, Dict[str, float]]:
        """Get learned saturation parameters."""
        return self._saturation_params


def _fake_transform_adstock(media: np.ndarray, adstock_lags: List[int]) -> np.ndarray:
    """Mock adstock transformation."""
    media = np.asarray(media, dtype=float)
    out = np.zeros_like(media, dtype=float)
    for idx, lag in enumerate(adstock_lags):
        lag = max(1, int(lag))
        kernel = np.ones(lag, dtype=float) / float(lag)
        convolved = np.convolve(media[:, idx], kernel, mode="full")[: media.shape[0]]
        out[:, idx] = convolved
    return out


def _fake_transform_saturation(media: np.ndarray, gamma: List[float], k: List[float]) -> np.ndarray:
    """Mock Hill curve transformation."""
    media = np.asarray(media, dtype=float)
    out = np.zeros_like(media, dtype=float)
    for idx, (gamma_val, k_val) in enumerate(zip(gamma, k)):
        k_safe = max(k_val, 1e-3)
        powered = np.power(np.clip(media[:, idx], a_min=0.0, a_max=None), gamma_val)
        out[:, idx] = powered / (powered + k_safe)
    return out


def _seed_lightweight_bayesian(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set up test environment with mocked Bayesian estimation."""
    monkeypatch.setattr(mmm_lightweight, "_AVAILABLE", True, raising=False)
    monkeypatch.setattr(mmm_lightweight, "transform_adstock", _fake_transform_adstock, raising=False)
    monkeypatch.setattr(mmm_lightweight, "transform_saturation", _fake_transform_saturation, raising=False)
    monkeypatch.setattr(mmm_lightweight, "LightweightMMM", _DummyBayesianModel, raising=False)


def test_bayesian_parameter_estimation(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that Bayesian estimation learns reasonable parameters."""
    _seed_lightweight_bayesian(monkeypatch)

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

    # Check that parameters were estimated by Bayesian model
    assert isinstance(model.lightweight_result.mmm, _DummyBayesianModel)
    bayesian_model = model.lightweight_result.mmm

    # Verify adstock parameters
    adstock_params = bayesian_model.get_adstock_params()
    for channel in spend_cols:
        assert channel in adstock_params
        assert "lag" in adstock_params[channel]
        assert adstock_params[channel]["lag"] > 0

    # Verify saturation parameters
    saturation_params = bayesian_model.get_saturation_params()
    for channel in spend_cols:
        assert channel in saturation_params
        assert "k" in saturation_params[channel]
        assert "gamma" in saturation_params[channel]
        assert saturation_params[channel]["k"] > 0
        assert 0 < saturation_params[channel]["gamma"] < 10


def test_mixed_estimation_modes(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test combining Bayesian and preset parameters."""
    _seed_lightweight_bayesian(monkeypatch)

    # Create synthetic data
    media_matrix = np.array([
        [100.0, 60.0],
        [120.0, 55.0],
        [90.0, 65.0],
        [80.0, 70.0],
        [95.0, 68.0],
    ])
    target = np.array([900.0, 960.0, 930.0, 910.0, 940.0])
    media_cols = ["channel_a", "channel_b"]

    # Test Bayesian adstock with preset saturation
    preset_k = {"channel_a": 100.0, "channel_b": 50.0}
    preset_s = {"channel_a": 0.5, "channel_b": 0.8}

    result = mmm_lightweight.fit_lightweight_mmm(
        media_spend=media_matrix,
        media_cols=media_cols,
        target=target,
        saturation_k=preset_k,
        saturation_s=preset_s,
        estimate_adstock=True,
        estimate_saturation=False,
    )

    # Adstock should be learned
    assert isinstance(result.mmm, _DummyBayesianModel)
    adstock_params = result.mmm.get_adstock_params()
    assert len(adstock_params) == 2
    assert all("lag" in params for params in adstock_params.values())

    # Saturation should use presets
    assert result.saturation_k == preset_k
    assert result.saturation_s == preset_s

    # Test preset adstock with Bayesian saturation
    preset_lags = {"channel_a": 7, "channel_b": 3}

    result = mmm_lightweight.fit_lightweight_mmm(
        media_spend=media_matrix,
        media_cols=media_cols,
        target=target,
        adstock_lags=preset_lags,
        estimate_adstock=False,
        estimate_saturation=True,
    )

    # Adstock should use presets
    assert result.adstock_lags == preset_lags

    # Saturation should be learned
    saturation_params = result.mmm.get_saturation_params()
    assert len(saturation_params) == 2
    assert all("k" in params and "gamma" in params for params in saturation_params.values())


def test_parameter_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test parameter validation and constraints."""
    _seed_lightweight_bayesian(monkeypatch)

    # Create synthetic data
    media_matrix = np.array([
        [100.0, 60.0],
        [120.0, 55.0],
        [90.0, 65.0],
    ])
    target = np.array([900.0, 960.0, 930.0])
    media_cols = ["channel_a", "channel_b"]

    # Test invalid presets
    invalid_lags = {"channel_a": -1, "channel_b": 0}  # Negative/zero lags
    invalid_k = {"channel_a": -50.0, "channel_b": 0.0}  # Negative/zero k
    invalid_s = {"channel_a": -0.5, "channel_b": 0.0}  # Negative/zero gamma

    # Should clamp invalid parameters to valid ranges
    result = mmm_lightweight.fit_lightweight_mmm(
        media_spend=media_matrix,
        media_cols=media_cols,
        target=target,
        adstock_lags=invalid_lags,
        saturation_k=invalid_k,
        saturation_s=invalid_s,
        estimate_adstock=False,
        estimate_saturation=False,
    )

    # Parameters should be clamped to valid ranges
    assert all(lag >= 1 for lag in result.adstock_lags.values())
    assert all(k > 0 for k in result.saturation_k.values())
    assert all(s > 0 for s in result.saturation_s.values())