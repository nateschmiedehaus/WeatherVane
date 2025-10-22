"""MMM backtesting utilities with rolling walk-forward evaluation."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import List, Sequence, Tuple

import numpy as np
import polars as pl

from .mmm import MMMModel, fit_mmm_model


@dataclass(frozen=True)
class BacktestWindow:
    """Result for a single walk-forward evaluation window."""

    train_start: str
    train_end: str
    holdout: str
    actual: float
    mmm_prediction: float
    baseline_prediction: float
    mae_mmm: float
    mae_baseline: float


@dataclass(frozen=True)
class BacktestSummary:
    """Aggregate error statistics across all windows."""

    window_count: int
    mae_mmm: float
    mae_baseline: float
    relative_mae_improvement: float
    rmse_mmm: float
    rmse_baseline: float
    bias_mmm: float
    bias_baseline: float


def run_walk_forward_backtest(
    frame: pl.DataFrame,
    spend_cols: Sequence[str],
    revenue_col: str,
    date_col: str,
    window_size: int = 12,
) -> Tuple[List[BacktestWindow], BacktestSummary]:
    """Execute a rolling walk-forward backtest over the provided dataset.

    The function fits an MMM model on each rolling training window (default 12 weeks)
    and evaluates it against the following holdout period. A simple baseline using
    the trailing-mean revenue is reported for comparison.
    """

    if window_size <= 0:
        raise ValueError("window_size must be positive")

    required_cols = set(spend_cols) | {revenue_col, date_col}
    missing = required_cols - set(frame.columns)
    if missing:
        raise ValueError(f"DataFrame is missing required columns: {sorted(missing)}")

    cleaned = frame.select(
        [
            pl.col(date_col),
            pl.col(revenue_col).fill_null(0.0),
            *[pl.col(col).fill_null(0.0) for col in spend_cols],
        ]
    ).sort(date_col)

    total_rows = cleaned.height
    if total_rows <= window_size:
        raise ValueError(
            f"Insufficient rows ({total_rows}) for window size {window_size}"
        )

    windows: List[BacktestWindow] = []
    mmm_errors: List[float] = []
    baseline_errors: List[float] = []
    mmm_residuals: List[float] = []
    baseline_residuals: List[float] = []

    for index in range(window_size, total_rows):
        train = cleaned.slice(index - window_size, window_size)
        holdout_row = cleaned.row(index, named=True)

        model = fit_mmm_model(train, list(spend_cols), revenue_col)
        spend = {feature: float(holdout_row.get(feature, 0.0)) for feature in model.features}

        predicted = _predict_revenue(model, spend)
        baseline_prediction = float(train[revenue_col].mean())
        actual = float(holdout_row[revenue_col])

        mae_mmm = abs(predicted - actual)
        mae_baseline = abs(baseline_prediction - actual)

        windows.append(
            BacktestWindow(
                train_start=_normalise_date(train[date_col][0]),
                train_end=_normalise_date(train[date_col][-1]),
                holdout=_normalise_date(holdout_row[date_col]),
                actual=actual,
                mmm_prediction=predicted,
                baseline_prediction=baseline_prediction,
                mae_mmm=mae_mmm,
                mae_baseline=mae_baseline,
            )
        )

        mmm_errors.append(mae_mmm)
        baseline_errors.append(mae_baseline)
        mmm_residuals.append(predicted - actual)
        baseline_residuals.append(baseline_prediction - actual)

    summary = _summarise_windows(
        mmm_errors=mmm_errors,
        baseline_errors=baseline_errors,
        mmm_residuals=mmm_residuals,
        baseline_residuals=baseline_residuals,
    )

    return windows, summary


def save_report(
    windows: Sequence[BacktestWindow],
    summary: BacktestSummary,
    path: str | Path,
    *,
    generated_at: datetime | None = None,
    metadata: dict | None = None,
) -> None:
    """Persist the backtest results to JSON for regression tracking."""

    generated = generated_at or datetime.utcnow()
    doc = {
        "generated_at": generated.replace(microsecond=0).isoformat() + "Z",
        "window_count": summary.window_count,
        "metrics": {
            "mae_mmm": summary.mae_mmm,
            "mae_baseline": summary.mae_baseline,
            "relative_mae_improvement": summary.relative_mae_improvement,
            "rmse_mmm": summary.rmse_mmm,
            "rmse_baseline": summary.rmse_baseline,
            "bias_mmm": summary.bias_mmm,
            "bias_baseline": summary.bias_baseline,
        },
        "windows": [
            {
                "train_start": window.train_start,
                "train_end": window.train_end,
                "holdout": window.holdout,
                "actual": window.actual,
                "mmm_prediction": window.mmm_prediction,
                "baseline_prediction": window.baseline_prediction,
                "mae_mmm": window.mae_mmm,
                "mae_baseline": window.mae_baseline,
            }
            for window in windows
        ],
    }
    if metadata:
        doc["metadata"] = metadata

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(doc, indent=2), encoding="utf-8")


def execute_backtest_to_report(
    frame: pl.DataFrame,
    spend_cols: Sequence[str],
    revenue_col: str,
    date_col: str,
    *,
    window_size: int = 12,
    output_path: str | Path = "artifacts/modeling/mmm_backtest.json",
    metadata: dict | None = None,
) -> Tuple[List[BacktestWindow], BacktestSummary]:
    """Helper to run the backtest and persist a regression report."""

    windows, summary = run_walk_forward_backtest(
        frame,
        spend_cols=spend_cols,
        revenue_col=revenue_col,
        date_col=date_col,
        window_size=window_size,
    )
    save_report(windows, summary, output_path, metadata=metadata)
    return windows, summary


def _predict_revenue(model: MMMModel, spend: dict[str, float]) -> float:
    total = 0.0
    for feature in model.features:
        value = max(float(spend.get(feature, 0.0)), 0.0)
        total += value * model.roas_for(feature, value)
    return total


def _normalise_date(value: object) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _summarise_windows(
    *,
    mmm_errors: Sequence[float],
    baseline_errors: Sequence[float],
    mmm_residuals: Sequence[float],
    baseline_residuals: Sequence[float],
) -> BacktestSummary:
    window_count = len(mmm_errors)
    if window_count == 0:
        raise ValueError("Expected at least one evaluation window.")

    mae_mmm = float(np.mean(mmm_errors))
    mae_baseline = float(np.mean(baseline_errors))
    rmse_mmm = float(math.sqrt(np.mean([residual**2 for residual in mmm_residuals])))
    rmse_baseline = float(
        math.sqrt(np.mean([residual**2 for residual in baseline_residuals]))
    )

    baseline_denominator = mae_baseline if mae_baseline else 1e-6
    relative_improvement = (mae_baseline - mae_mmm) / baseline_denominator

    bias_mmm = float(np.mean(mmm_residuals))
    bias_baseline = float(np.mean(baseline_residuals))

    return BacktestSummary(
        window_count=window_count,
        mae_mmm=mae_mmm,
        mae_baseline=mae_baseline,
        relative_mae_improvement=relative_improvement,
        rmse_mmm=rmse_mmm,
        rmse_baseline=rmse_baseline,
        bias_mmm=bias_mmm,
        bias_baseline=bias_baseline,
    )


__all__ = [
    "BacktestSummary",
    "BacktestWindow",
    "execute_backtest_to_report",
    "run_walk_forward_backtest",
    "save_report",
]
