from __future__ import annotations

import polars as pl

from shared.feature_store.feature_generators import (
    LagRollingFeatureGenerator,
    LagRollingSpec,
)


def test_generator_adds_lag_and_rolling_features() -> None:
    frame = pl.DataFrame(
        {
            "date": ["2024-01-01", "2024-01-02", "2024-01-03"],
            "segment": ["A", "A", "A"],
            "value": [10.0, 20.0, 30.0],
        }
    )

    spec = LagRollingSpec(
        column="value",
        lags=(1,),
        rolling_windows=(2,),
        rolling_stat="mean",
    )
    generator = LagRollingFeatureGenerator([spec], date_col="date", group_cols=["segment"])
    result = generator.transform(frame)

    assert result.columns[-2:] == ["value_lag1", "value_roll2"]
    assert result["value_lag1"].to_list() == [None, 10.0, 20.0]
    assert result["value_roll2"].to_list() == [10.0, 15.0, 25.0]


def test_generator_respects_seed_for_duplicate_dates() -> None:
    frame = pl.DataFrame(
        {
            "date": ["2024-01-01", "2024-01-01", "2024-01-02"],
            "geohash": ["abcde", "abcde", "abcde"],
            "value": [1.0, 2.0, 3.0],
        }
    )

    spec = LagRollingSpec(column="value", lags=(1,), rolling_windows=(2,), rolling_stat="mean")
    generator_seed_7 = LagRollingFeatureGenerator(
        [spec], date_col="date", group_cols=["geohash"], seed=7
    )
    generator_seed_7_again = LagRollingFeatureGenerator(
        [spec], date_col="date", group_cols=["geohash"], seed=7
    )
    generator_seed_13 = LagRollingFeatureGenerator(
        [spec], date_col="date", group_cols=["geohash"], seed=13
    )

    first = generator_seed_7.transform(frame)
    second = generator_seed_7_again.transform(frame)
    third = generator_seed_13.transform(frame)

    assert first.to_dict(as_series=False) == second.to_dict(as_series=False)
    assert first["value_lag1"].to_list() != third["value_lag1"].to_list()
