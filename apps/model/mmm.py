"""Media mix modelling integrating LightweightMMM with heuristic fallback."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List

import numpy as np
import polars as pl

from . import mmm_lightweight

_LOGGER = logging.getLogger(__name__)
_NUMERIC_DTYPES = {pl.Float64, pl.Float32, pl.Int64, pl.Int32}


@dataclass
class MMMModel:
    base_roas: float
    elasticity: Dict[str, float]
    mean_roas: Dict[str, float]
    mean_spend: Dict[str, float]
    features: List[str]
    source: str = "heuristic"
    adstock_lags: Dict[str, int] | None = None
    saturation_k: Dict[str, float] | None = None
    saturation_s: Dict[str, float] | None = None
    lightweight_result: mmm_lightweight.LightweightMMMResult | None = None

    def roas_for(self, feature: str, spend: float) -> float:
        base = self.mean_roas.get(feature, self.base_roas)
        mean = self.mean_spend.get(feature, 0.0)
        elasticity = self.elasticity.get(feature, 0.0)
        if mean <= 0:
            return max(base, 0.0)
        ratio = (spend - mean) / max(mean, 1e-6)
        return max(base + elasticity * ratio, 0.0)

    def marginal_roas(self, spend: Dict[str, float]) -> float:
        if not spend:
            return self.base_roas
        total_spend = 0.0
        total_revenue = 0.0
        for feature, amount in spend.items():
            total_spend += amount
            roas = self.roas_for(feature, amount)
            total_revenue += roas * amount
        if total_spend <= 0:
            return self.base_roas
        return total_revenue / total_spend


def fit_mmm_model(frame: pl.DataFrame, spend_cols: List[str], revenue_col: str) -> MMMModel:
    spend_features = [col for col in spend_cols if col in frame.columns]
    if frame.is_empty():
        return _empty_model(spend_features)

    try_lightweight = (
        spend_features
        and mmm_lightweight.available()
        and _has_positive_spend(frame, spend_features)
    )
    if try_lightweight:
        try:
            return _fit_lightweight_mmm(frame, spend_features, revenue_col)
        except Exception as error:  # pragma: no cover - guarded by tests
            _LOGGER.exception("LightweightMMM fitting failed; falling back to heuristic.", exc_info=error)

    return _fit_heuristic_mmm(frame, spend_features, revenue_col)


def _empty_model(features: List[str]) -> MMMModel:
    return MMMModel(
        base_roas=0.0,
        elasticity={col: 0.0 for col in features},
        mean_roas={col: 0.0 for col in features},
        mean_spend={col: 0.0 for col in features},
        features=features,
    )


def _has_positive_spend(frame: pl.DataFrame, spend_cols: List[str]) -> bool:
    for col in spend_cols:
        if frame[col].fill_null(0.0).sum() > 0:
            return True
    return False


def _fit_lightweight_mmm(frame: pl.DataFrame, spend_cols: List[str], revenue_col: str) -> MMMModel:
    spend_frame = frame.select([pl.col(col).fill_null(0.0) for col in spend_cols])
    media_matrix = np.asarray(spend_frame.to_numpy(), dtype=float)

    revenue_series = frame[revenue_col].fill_null(0.0)
    target = np.asarray(revenue_series.to_numpy(), dtype=float)

    total_spend = float(media_matrix.sum())
    if total_spend <= 0:
        return _empty_model(spend_cols)

    extra_cols = [
        col
        for col in frame.columns
        if col not in spend_cols + [revenue_col] and frame[col].dtype in _NUMERIC_DTYPES
    ]
    extra_features = (
        np.asarray(frame.select([pl.col(col).fill_null(0.0) for col in extra_cols]).to_numpy(), dtype=float)
        if extra_cols
        else None
    )

    # Use Bayesian estimation for both adstock and saturation parameters
    result = mmm_lightweight.fit_lightweight_mmm(
        media_spend=media_matrix,
        media_cols=spend_cols,
        target=target,
        extra_features=extra_features,
        estimate_adstock=True,
        estimate_saturation=True,
    )

    try:
        summary = _summarize_lightweight_result(
            result=result,
            target=target,
            media_matrix=media_matrix,
            spend_cols=spend_cols,
            adstock_lags=result.adstock_lags,
            saturation_k=result.saturation_k,
            saturation_s=result.saturation_s,
        )
    except np.linalg.LinAlgError:
        _LOGGER.warning("LightweightMMM summary failed due to singular matrix; falling back to heuristic.")
        return _fit_heuristic_mmm(frame, spend_cols, revenue_col)
    return summary


def _estimate_adstock_lags(frame: pl.DataFrame, spend_cols: List[str]) -> Dict[str, int]:
    """Estimate adstock lag windows using simple demand persistence heuristics."""
    horizon = max(int(frame.height), 1)
    base_lag = max(1, min(8, int(np.ceil(horizon / 7))))
    lags: Dict[str, int] = {}
    for col in spend_cols:
        series = frame[col].fill_null(0.0).to_numpy()
        if series.size < 2:
            lags[col] = base_lag
            continue
        shifted = series[1:]
        original = series[:-1]
        denom = float(np.dot(original, original))
        if denom <= 0:
            lags[col] = base_lag
            continue
        autocorr = float(np.dot(original, shifted) / denom)
        if autocorr >= 0.8:
            lags[col] = min(13, base_lag + 2)
        elif autocorr >= 0.5:
            lags[col] = base_lag + 1
        else:
            lags[col] = base_lag
    return lags


def _estimate_saturation_parameters(media_matrix: np.ndarray, spend_cols: List[str]) -> tuple[Dict[str, float], Dict[str, float]]:
    """Derive simple Hill saturation parameters from spend distribution."""
    clipped = np.clip(media_matrix, a_min=0.0, a_max=None)
    percentile = np.percentile(clipped, 75, axis=0)
    std_dev = np.std(clipped, axis=0)
    means = np.mean(clipped, axis=0)

    saturation_k: Dict[str, float] = {}
    saturation_s: Dict[str, float] = {}
    for idx, col in enumerate(spend_cols):
        mean = float(means[idx])
        std = float(std_dev[idx])
        ref = float(percentile[idx])
        saturation_k[col] = max(ref, mean, 1.0)
        saturation_s[col] = max(0.5, std / (mean + 1e-6) if mean > 0 else 1.0)
    return saturation_k, saturation_s


def _summarize_lightweight_result(
    result: mmm_lightweight.LightweightMMMResult,
    target: np.ndarray,
    media_matrix: np.ndarray,
    spend_cols: List[str],
    adstock_lags: Dict[str, int],
    saturation_k: Dict[str, float],
    saturation_s: Dict[str, float],
) -> MMMModel:
    transformed = np.asarray(result.transformed_media, dtype=float)
    if transformed.ndim == 1:
        transformed = transformed.reshape(-1, 1)

    ones = np.ones((transformed.shape[0], 1), dtype=float)
    design = np.hstack([ones, transformed])
    coefs, *_ = np.linalg.lstsq(design, target, rcond=None)
    intercept = float(coefs[0])
    channel_coefs = np.asarray(coefs[1:], dtype=float)

    contributions = transformed * channel_coefs
    channel_revenue = contributions.sum(axis=0)

    total_spend = float(media_matrix.sum())
    total_revenue = float(target.sum())
    base_roas = (total_revenue / total_spend) if total_spend > 0 else 0.0

    mean_spend: Dict[str, float] = {}
    mean_roas: Dict[str, float] = {}
    elasticity: Dict[str, float] = {}

    baseline_predictions = intercept + contributions.sum(axis=1)
    baseline_mean = float(np.mean(baseline_predictions)) if baseline_predictions.size else 0.0

    for idx, channel in enumerate(spend_cols):
        spend_series = media_matrix[:, idx]
        spend_sum = float(spend_series.sum())
        mean_value = float(np.mean(spend_series)) if spend_series.size else 0.0
        mean_spend[channel] = mean_value
        if spend_sum > 0:
            mean_roas[channel] = float(channel_revenue[idx] / spend_sum)
        else:
            mean_roas[channel] = base_roas

        if (
            spend_sum <= 0
            or mean_value <= 0
            or not mmm_lightweight.transform_adstock
            or not mmm_lightweight.transform_saturation
            or baseline_mean == 0.0
        ):
            elasticity[channel] = 0.0
            continue

        delta = max(mean_value * 0.05, 1.0)
        perturbed_media = media_matrix.copy()
        perturbed_media[:, idx] = spend_series + delta

        adstock_vector = [
            adstock_lags[col] for col in spend_cols
        ]
        gamma_vector = [saturation_s[col] for col in spend_cols]
        k_vector = [saturation_k[col] for col in spend_cols]

        perturbed_adstock = mmm_lightweight.transform_adstock(
            media=perturbed_media,
            adstock_lags=adstock_vector,
        )
        perturbed_saturation = mmm_lightweight.transform_saturation(
            media=perturbed_adstock,
            gamma=gamma_vector,
            k=k_vector,
        )
        if perturbed_saturation.ndim == 1:
            perturbed_saturation = perturbed_saturation.reshape(-1, 1)

        perturbed_contributions = perturbed_saturation * channel_coefs
        perturbed_predictions = intercept + perturbed_contributions.sum(axis=1)

        revenue_delta = float(np.mean(perturbed_predictions - baseline_predictions))
        relative_revenue = revenue_delta / baseline_mean if baseline_mean else 0.0
        relative_spend = delta / mean_value if mean_value else 0.0
        elasticity[channel] = relative_revenue / relative_spend if relative_spend else 0.0

    model = MMMModel(
        base_roas=base_roas,
        elasticity=elasticity,
        mean_roas=mean_roas,
        mean_spend=mean_spend,
        features=spend_cols,
        source="lightweight",
        adstock_lags=adstock_lags,
        saturation_k=saturation_k,
        saturation_s=saturation_s,
        lightweight_result=result,
    )
    return model


def _fit_heuristic_mmm(frame: pl.DataFrame, spend_cols: List[str], revenue_col: str) -> MMMModel:
    if not spend_cols:
        return _empty_model([])

    frame_local = frame
    if revenue_col not in frame.columns:
        frame_local = frame_local.with_columns(pl.lit(0.0).alias(revenue_col))

    spend_frame = frame_local.select([pl.col(col).fill_null(0.0) for col in spend_cols])
    revenue_series = frame_local[revenue_col].fill_null(0.0)

    total_spend = sum(spend_frame[col].sum() for col in spend_cols)
    total_rev = float(revenue_series.sum())
    base_roas = (total_rev / total_spend) if total_spend else 0.0
    elasticity: Dict[str, float] = {}
    mean_roas: Dict[str, float] = {}
    mean_spend: Dict[str, float] = {}

    if spend_cols:
        total_spend_expr = pl.sum_horizontal(
            [pl.col(col).fill_null(0.0) for col in spend_cols if col in spend_frame.columns]
        )
        frame_with_total = frame_local.with_columns(total_spend_expr.alias("__total_spend"))
    else:
        frame_with_total = frame_local

    for col in spend_cols:
        spend_series = frame_with_total[col].fill_null(0.0)
        spend_sum = float(spend_series.sum())
        mean_spend_val = float(spend_series.mean() or 0.0)
        mean_spend[col] = mean_spend_val

        if spend_sum > 0:
            share_expr = pl.when(pl.col("__total_spend") <= 0).then(0.0).otherwise(pl.col(col) / pl.col("__total_spend"))
            revenue_share = float(
                frame_with_total.select((share_expr * pl.col(revenue_col)).fill_null(0.0).sum()).item()
            )
            channel_roas = revenue_share / spend_sum if spend_sum else base_roas
        else:
            revenue_share = 0.0
            channel_roas = base_roas

        mean_roas[col] = channel_roas

        variance = float(spend_series.var() or 0.0)
        if variance > 0:
            cov = float(frame_with_total.select(pl.cov(pl.col(col), pl.col(revenue_col))).item())
            elasticity_raw = cov / variance if variance else 0.0
        else:
            elasticity_raw = 0.0

        elasticity[col] = elasticity_raw

    return MMMModel(
        base_roas=base_roas,
        elasticity=elasticity,
        mean_roas=mean_roas,
        mean_spend=mean_spend,
        features=spend_cols,
    )
