"""Feature engineering utilities for WeatherVane feature store."""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Iterable, List, Sequence

import polars as pl

NUMERIC_DTYPES = {
    pl.Int8,
    pl.Int16,
    pl.Int32,
    pl.Int64,
    pl.UInt8,
    pl.UInt16,
    pl.UInt32,
    pl.UInt64,
    pl.Float32,
    pl.Float64,
}


def _is_numeric_dtype(dtype: pl.DataType) -> bool:
    try:
        return dtype in NUMERIC_DTYPES
    except TypeError:
        return False


@dataclass(frozen=True)
class LagRollingSpec:
    """Configuration describing lag and rolling window features for one column."""

    column: str
    lags: Sequence[int] = field(default_factory=lambda: (1,))
    rolling_windows: Sequence[int] = field(default_factory=lambda: (7,))
    rolling_stat: str = "mean"
    alias_prefix: str | None = None

    def feature_name(self, kind: str, value: int) -> str:
        base = self.alias_prefix or self.column
        return f"{base}_{kind}{value}"


class LagRollingFeatureGenerator:
    """Generate lagged and rolling window features with deterministic ordering."""

    def __init__(
        self,
        specs: Iterable[LagRollingSpec],
        *,
        date_col: str = "date",
        group_cols: Sequence[str] | None = None,
        seed: int = 42,
        min_periods: int = 1,
    ) -> None:
        self.specs: List[LagRollingSpec] = list(specs)
        self.date_col = date_col
        self.group_cols = list(group_cols or [])
        self.seed = int(seed)
        self.min_periods = max(1, int(min_periods))

    def transform(self, frame: pl.DataFrame) -> pl.DataFrame:
        """Return a new frame including lag/rolling features."""

        if frame.is_empty() or not self.specs:
            return frame

        if self.date_col not in frame.columns:
            raise KeyError(f"Expected date column `{self.date_col}` in feature matrix")

        working = frame.clone()
        working = working.with_columns(
            pl.arange(0, pl.len(), eager=False).alias("__wvo_row_nr")
        )

        try:
            working = working.with_columns(
                pl.col(self.date_col)
                .str.strptime(pl.Date, strict=False)
                .alias("__wvo_date"),
            )
        except pl.exceptions.InvalidOperationError:
            working = working.with_columns(
                pl.col(self.date_col).cast(pl.Date, strict=False).alias("__wvo_date"),
            )

        order_cols = [col for col in self.group_cols if col in working.columns]
        rng = random.Random(self.seed)
        seed_rank = [rng.random() for _ in range(working.height)]
        working = working.with_columns(pl.Series("__wvo_seed_rank", seed_rank))
        order_cols.extend(["__wvo_date", "__wvo_seed_rank", "__wvo_row_nr"])
        working = working.sort(order_cols)

        over_cols = [col for col in self.group_cols if col in working.columns]
        expressions: List[pl.Expr] = []

        for spec in self.specs:
            if spec.column not in working.columns:
                continue
            dtype = working.schema[spec.column]
            if not _is_numeric_dtype(dtype):
                continue

            base_expr = pl.col(spec.column)
            for lag in spec.lags:
                if lag <= 0:
                    continue
                lag_expr = base_expr.shift(lag)
                if over_cols:
                    lag_expr = lag_expr.over(over_cols)
                expressions.append(lag_expr.alias(spec.feature_name("lag", lag)))

            for window in spec.rolling_windows:
                if window <= 0:
                    continue
                stat = spec.rolling_stat.lower()
                if stat == "sum":
                    roll_expr = base_expr.rolling_sum(
                        window_size=window, min_samples=self.min_periods
                    )
                elif stat == "std":
                    roll_expr = base_expr.rolling_std(
                        window_size=window, min_samples=max(self.min_periods, 2)
                    )
                else:
                    roll_expr = base_expr.rolling_mean(
                        window_size=window, min_samples=self.min_periods
                    )
                if over_cols:
                    roll_expr = roll_expr.over(over_cols)
                expressions.append(roll_expr.alias(spec.feature_name("roll", window)))

        if expressions:
            working = working.with_columns(expressions)

        return working.drop(
            ["__wvo_seed_rank", "__wvo_date", "__wvo_row_nr"]
        )

    @staticmethod
    def default_specs() -> List[LagRollingSpec]:
        """Default configuration used by the feature builder."""

        return [
            LagRollingSpec(
                column="net_revenue",
                lags=(1, 7),
                rolling_windows=(7, 14),
                rolling_stat="mean",
            ),
            LagRollingSpec(
                column="meta_spend",
                lags=(1, 7),
                rolling_windows=(7, 14),
                rolling_stat="sum",
            ),
            LagRollingSpec(
                column="google_spend",
                lags=(1, 7),
                rolling_windows=(7, 14),
                rolling_stat="sum",
            ),
            LagRollingSpec(
                column="meta_conversions",
                lags=(1, 7),
                rolling_windows=(7,),
                rolling_stat="mean",
            ),
            LagRollingSpec(
                column="google_conversions",
                lags=(1, 7),
                rolling_windows=(7,),
                rolling_stat="mean",
            ),
            LagRollingSpec(
                column="promos_sent",
                lags=(1, 7),
                rolling_windows=(7, 14),
                rolling_stat="sum",
            ),
            LagRollingSpec(
                column="temp_c",
                lags=(1, 7),
                rolling_windows=(7, 14),
                rolling_stat="mean",
            ),
            LagRollingSpec(
                column="precip_mm",
                lags=(1, 7),
                rolling_windows=(7, 14),
                rolling_stat="mean",
            ),
            LagRollingSpec(
                column="temp_anomaly",
                lags=(1, 7),
                rolling_windows=(7,),
                rolling_stat="mean",
                alias_prefix="temp_anom",
            ),
            LagRollingSpec(
                column="precip_anomaly",
                lags=(1, 7),
                rolling_windows=(7,),
                rolling_stat="mean",
                alias_prefix="precip_anom",
            ),
        ]
