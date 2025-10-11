from __future__ import annotations

import math
from datetime import date, datetime, timedelta

import polars as pl

from apps.model.ts_training import fit_timeseries


def _build_frame(*, days: int = 80, as_datetime: bool = False) -> pl.DataFrame:
    records = []
    start = date(2024, 1, 1)
    for offset in range(days):
        current = start + timedelta(days=offset)
        stamp = datetime.combine(current, datetime.min.time()) if as_datetime else current
        records.append(
            {
                "date": stamp,
                "feature": float(offset),
                "net_revenue": float(200 + offset * 3),
            }
        )
    return pl.DataFrame(records)


def test_fit_timeseries_accepts_date_column() -> None:
    frame = _build_frame(as_datetime=False)
    result = fit_timeseries(frame, "date", "net_revenue", ["feature"])

    assert result.model is not None
    assert result.target == "net_revenue"
    assert "feature" in result.features
    assert math.isfinite(result.holdout_r2)


def test_fit_timeseries_accepts_datetime_column() -> None:
    frame = _build_frame(as_datetime=True)
    result = fit_timeseries(frame, "date", "net_revenue", ["feature"])

    assert result.model is not None
    assert result.target == "net_revenue"
    assert "feature" in result.features
