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

    # Basic transformations; callers can pass pre-computed matrices later if needed.
    adstock_data = transform_adstock(
        media=media_spend,
        adstock_lags=[adstock_lags.get(col, 1) if adstock_lags else 1 for col in media_cols],
    )
    saturation_data = transform_saturation(
        media=adstock_data,
        gamma=[saturation_s.get(col, 1.0) if saturation_s else 1.0 for col in media_cols],
        k=[saturation_k.get(col, 1.0) if saturation_k else 1.0 for col in media_cols],
    )

    model.fit(
        media=saturation_data,
        target=target,
        extra_features=extra_features,
        media_names=media_cols,
    )

    return LightweightMMMResult(
        mmm=model,
        channel_names=media_cols,
        adstock_lags=adstock_lags or {name: 1 for name in media_cols},
        saturation_k=saturation_k or {name: 1.0 for name in media_cols},
        saturation_s=saturation_s or {name: 1.0 for name in media_cols},
        transformed_media=saturation_data,
    )
