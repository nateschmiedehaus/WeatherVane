"""LightweightMMM integration scaffold.

This module wraps the optional `lightweight_mmm` dependency so Phase 4 work can
prototype proper media mix modelling without breaking environments where the
package is not installed yet. Callers should check `available` before invoking
`fit_lightweight_mmm`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np

try:  # pragma: no cover - optional dependency
    from lightweight_mmm import LightweightMMM
    from lightweight_mmm.preprocessing import (  # type: ignore
        build_media_matrix,
        transform_adstock,
        transform_saturation,
    )

    _AVAILABLE = True
except Exception:  # pragma: no cover - missing dependency
    LightweightMMM = None  # type: ignore
    transform_adstock = transform_saturation = build_media_matrix = None  # type: ignore
    _AVAILABLE = False


@dataclass
class LightweightMMMResult:
    mmm: LightweightMMM | None
    channel_names: List[str]
    adstock_lags: Dict[str, int]
    saturation_k: Dict[str, float]
    saturation_s: Dict[str, float]
    transformed_media: np.ndarray


def available() -> bool:
    """Return True when lightweight_mmm is importable."""

    return _AVAILABLE


def fit_lightweight_mmm(
    media_spend: np.ndarray,
    media_cols: List[str],
    target: np.ndarray,
    extra_features: Optional[np.ndarray] = None,
    adstock_lags: Optional[Dict[str, int]] = None,
    saturation_k: Optional[Dict[str, float]] = None,
    saturation_s: Optional[Dict[str, float]] = None,
    estimate_adstock: bool = True,
    estimate_saturation: bool = True,
) -> LightweightMMMResult:
    """Fit a Bayesian MMM using LightweightMMM.

    Parameters mirror the library and allow us to experiment without changing
    callers later. Raises RuntimeError when the dependency is missing.
    """

    if not _AVAILABLE:  # pragma: no cover - guard path
        raise RuntimeError(
            "lightweight_mmm is not available. Install it to enable MMM fitting."
        )

    model = LightweightMMM()
    media_names = list(media_cols)

    def _seed_media_names(instance) -> None:
        """Best-effort injection of media names before Bayesian helpers run."""
        # Some LightweightMMM builds expose a setter; fall back to attribute injection.
        for attr in ("set_media_names",):
            setter = getattr(instance, attr, None)
            if callable(setter):
                try:
                    setter(media_names)
                    return
                except Exception:
                    continue
        for attr in ("media_names", "_media_names", "_names"):
            try:
                setattr(instance, attr, media_names)
            except Exception:
                continue

    _seed_media_names(model)

    transformed_media = media_spend

    # Use Bayesian estimation if requested, otherwise use provided parameters
    if estimate_adstock:
        adstock_data = model.fit_adstock(
            media=transformed_media,
            target=target,
            extra_features=extra_features,
        )
        # Update lags from learned decay parameters
        adstock_lags = {
            col: max(1, int(round(model.get_adstock_params().get(col, {}).get("lag", 1))))
            for col in media_cols
        }
        transformed_media = adstock_data
    else:
        # Basic transformations using provided parameters
        def _safe_lag(value: Optional[int]) -> int:
            try:
                return max(1, int(round(value)))  # type: ignore[arg-type]
            except Exception:
                return 1

        sanitized_lags = {name: _safe_lag((adstock_lags or {}).get(name)) for name in media_names}
        adstock_lags = sanitized_lags
        transformed_media = transform_adstock(
            media=transformed_media,
            adstock_lags=[sanitized_lags[name] for name in media_names],
        )

    if estimate_saturation:
        saturation_data = model.fit_saturation(
            media=transformed_media,
            target=target,
            extra_features=extra_features,
        )
        # Update saturation parameters from learned Hill curves
        hill_params = model.get_saturation_params()
        saturation_k = {
            col: hill_params.get(col, {}).get("k", 1.0)
            for col in media_cols
        }
        saturation_s = {
            col: hill_params.get(col, {}).get("gamma", 1.0)
            for col in media_cols
        }
        transformed_media = saturation_data
    else:
        # Basic transformations using provided parameters
        def _safe_positive(value: Optional[float], default: float = 1.0) -> float:
            try:
                return float(value) if float(value) > 0 else default
            except Exception:
                return default

        sanitized_k = {name: _safe_positive((saturation_k or {}).get(name)) for name in media_names}
        sanitized_s = {name: _safe_positive((saturation_s or {}).get(name), default=0.1) for name in media_names}
        saturation_k = sanitized_k
        saturation_s = sanitized_s
        transformed_media = transform_saturation(
            media=transformed_media,
            gamma=[sanitized_s[name] for name in media_names],
            k=[sanitized_k[name] for name in media_names],
        )

    model.fit(
        media=transformed_media,
        target=target,
        extra_features=extra_features,
        media_names=media_names,
    )

    return LightweightMMMResult(
        mmm=model,
        channel_names=media_names,
        adstock_lags=adstock_lags or {name: 1 for name in media_names},
        saturation_k=saturation_k or {name: 1.0 for name in media_names},
        saturation_s=saturation_s or {name: 1.0 for name in media_names},
        transformed_media=transformed_media,
    )
