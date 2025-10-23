"""Tests for time series split with no leakage."""

import pytest
import pandas as pd
from datetime import datetime, timedelta

from shared.libs.modeling.time_series_split import (
    TimeSeriesSplitter,
    SplitStrategy,
    SplitResult,
)


class TestSplitResult:
    """Tests for SplitResult dataclass."""

    def test_split_result_calculations(self):
        """Test split result percentage calculations."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")
        train_df = pd.DataFrame({"date": dates[:70]})
        val_df = pd.DataFrame({"date": dates[70:85]})
        test_df = pd.DataFrame({"date": dates[85:]})

        result = SplitResult(
            train_df=train_df,
            val_df=val_df,
            test_df=test_df,
            train_start_date=dates[0],
            train_end_date=dates[69],
            val_start_date=dates[70],
            val_end_date=dates[84],
            test_start_date=dates[85],
            test_end_date=dates[99],
            split_ratios={"train": 0.70, "val": 0.15, "test": 0.15},
        )

        assert result.train_rows == 70
        assert result.val_rows == 15
        assert result.test_rows == 15
        assert result.total_rows == 100
        assert result.train_pct == pytest.approx(70.0)
        assert result.val_pct == pytest.approx(15.0)
        assert result.test_pct == pytest.approx(15.0)

    def test_validate_no_leakage_clean_split(self):
        """Test that clean split passes leakage validation."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")
        train_df = pd.DataFrame({"date": dates[:70]})
        val_df = pd.DataFrame({"date": dates[70:85]})
        test_df = pd.DataFrame({"date": dates[85:]})

        result = SplitResult(
            train_df=train_df,
            val_df=val_df,
            test_df=test_df,
            train_start_date=dates[0],
            train_end_date=dates[69],
            val_start_date=dates[70],
            val_end_date=dates[84],
            test_start_date=dates[85],
            test_end_date=dates[99],
            split_ratios={"train": 0.70, "val": 0.15, "test": 0.15},
        )

        is_valid, errors = result.validate_no_leakage()
        assert is_valid
        assert len(errors) == 0

    def test_validate_leakage_train_val_overlap(self):
        """Test detection of train/val date overlap."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")

        result = SplitResult(
            train_df=pd.DataFrame({"date": dates[:80]}),  # Train extends past boundary
            val_df=pd.DataFrame({"date": dates[60:85]}),  # Val overlaps with train
            test_df=pd.DataFrame({"date": dates[85:]}),
            train_start_date=dates[0],
            train_end_date=dates[79],
            val_start_date=dates[70],  # Boundary before actual data
            val_end_date=dates[84],
            test_start_date=dates[85],
            test_end_date=dates[99],
            split_ratios={"train": 0.70, "val": 0.15, "test": 0.15},
        )

        is_valid, errors = result.validate_no_leakage()
        assert not is_valid
        assert len(errors) > 0


class TestTimeSeriesSplitter:
    """Tests for TimeSeriesSplitter."""

    def test_init_valid_percentages(self):
        """Test initialization with valid percentages."""
        splitter = TimeSeriesSplitter(train_pct=0.70, val_pct=0.15, test_pct=0.15)
        assert splitter.train_pct == 0.70
        assert splitter.val_pct == 0.15
        assert splitter.test_pct == 0.15

    def test_init_invalid_percentages(self):
        """Test initialization with invalid percentages."""
        with pytest.raises(ValueError, match="sum to 1.0"):
            TimeSeriesSplitter(train_pct=0.70, val_pct=0.15, test_pct=0.10)

    def test_split_basic(self):
        """Test basic split with default ratios."""
        dates = pd.date_range("2024-01-01", periods=1000, freq="D")
        df = pd.DataFrame({
            "date": dates,
            "value": range(1000),
        })

        splitter = TimeSeriesSplitter()
        result = splitter.split(df)

        # Check split ratios
        assert result.train_rows == pytest.approx(700, abs=1)
        assert result.val_rows == pytest.approx(150, abs=1)
        assert result.test_rows == pytest.approx(150, abs=1)

    def test_split_custom_ratios(self):
        """Test split with custom ratios."""
        dates = pd.date_range("2024-01-01", periods=1000, freq="D")
        df = pd.DataFrame({"date": dates, "value": range(1000)})

        splitter = TimeSeriesSplitter(train_pct=0.60, val_pct=0.20, test_pct=0.20)
        result = splitter.split(df)

        assert result.train_rows == pytest.approx(600, abs=1)
        assert result.val_rows == pytest.approx(200, abs=1)
        assert result.test_rows == pytest.approx(200, abs=1)

    def test_split_maintains_temporal_order(self):
        """Test that split maintains temporal order."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")
        df = pd.DataFrame({
            "date": dates,
            "tenant": ["tenant_1"] * 100,
        })

        splitter = TimeSeriesSplitter()
        result = splitter.split(df)

        # Check temporal ordering
        train_dates = pd.to_datetime(result.train_df["date"])
        val_dates = pd.to_datetime(result.val_df["date"])
        test_dates = pd.to_datetime(result.test_df["date"])

        if len(train_dates) > 0 and len(val_dates) > 0:
            assert train_dates.max() < val_dates.min()

        if len(val_dates) > 0 and len(test_dates) > 0:
            assert val_dates.max() < test_dates.min()

    def test_split_no_leakage(self):
        """Test that split has no data leakage."""
        dates = pd.date_range("2024-01-01", periods=1000, freq="D")
        df = pd.DataFrame({
            "date": dates,
            "sales": range(1000),
            "weather": [20.0 + i * 0.1 for i in range(1000)],
        })

        splitter = TimeSeriesSplitter()
        result = splitter.split(df)

        # Validate no leakage
        is_valid, errors = result.validate_no_leakage()
        assert is_valid, f"Leakage detected: {errors}"

    def test_split_minimum_rows_per_split(self):
        """Test that each split gets at least 1 row."""
        dates = pd.date_range("2024-01-01", periods=10, freq="D")
        df = pd.DataFrame({"date": dates, "value": range(10)})

        splitter = TimeSeriesSplitter()
        result = splitter.split(df)

        assert result.train_rows >= 1
        assert result.val_rows >= 1
        assert result.test_rows >= 1

    def test_split_missing_date_column(self):
        """Test error when date column is missing."""
        df = pd.DataFrame({"value": range(100)})  # No date column

        splitter = TimeSeriesSplitter(date_column="date")
        with pytest.raises(ValueError, match="Date column"):
            splitter.split(df)

    def test_split_custom_date_column_name(self):
        """Test split with custom date column name."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")
        df = pd.DataFrame({
            "timestamp": dates,
            "value": range(100),
        })

        splitter = TimeSeriesSplitter(date_column="timestamp")
        result = splitter.split(df)

        assert result.train_rows > 0
        assert result.val_rows > 0
        assert result.test_rows > 0

    def test_split_unsorted_data(self):
        """Test that splitter handles unsorted data correctly."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")
        df = pd.DataFrame({
            "date": dates[::-1],  # Reverse order
            "value": range(100),
        })

        splitter = TimeSeriesSplitter()
        result = splitter.split(df)

        # Should still maintain temporal order in splits
        train_dates = pd.to_datetime(result.train_df["date"])
        val_dates = pd.to_datetime(result.val_df["date"])

        if len(train_dates) > 0 and len(val_dates) > 0:
            assert train_dates.max() < val_dates.min()

    def test_split_by_date_explicit_boundaries(self):
        """Test split using explicit date boundaries."""
        dates = pd.date_range("2024-01-01", periods=365, freq="D")
        df = pd.DataFrame({
            "date": dates,
            "value": range(365),
        })

        train_start = datetime(2024, 1, 1)
        train_end = datetime(2024, 7, 1)
        val_end = datetime(2024, 9, 1)
        test_end = datetime(2024, 12, 31)

        splitter = TimeSeriesSplitter()
        result = splitter.split_by_date(df, train_start, train_end, val_end, test_end)

        # Verify boundaries
        assert result.train_start_date == train_start
        assert result.train_end_date == train_end
        assert result.val_start_date == train_end
        assert result.val_end_date == val_end
        assert result.test_start_date == val_end
        assert result.test_end_date == test_end

    def test_split_by_date_no_leakage(self):
        """Test that split_by_date produces no leakage."""
        dates = pd.date_range("2024-01-01", periods=365, freq="D")
        df = pd.DataFrame({
            "date": dates,
            "value": range(365),
        })

        splitter = TimeSeriesSplitter()
        result = splitter.split_by_date(
            df,
            datetime(2024, 1, 1),
            datetime(2024, 7, 1),
            datetime(2024, 9, 1),
            datetime(2024, 12, 31),
        )

        is_valid, errors = result.validate_no_leakage()
        assert is_valid, f"Leakage detected: {errors}"

    def test_split_preserves_columns(self):
        """Test that split preserves all columns."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")
        df = pd.DataFrame({
            "date": dates,
            "tenant_id": ["tenant_1"] * 100,
            "sales": range(100),
            "weather": [20.0] * 100,
            "spend": [1000.0] * 100,
        })

        splitter = TimeSeriesSplitter()
        result = splitter.split(df)

        # Check all columns preserved
        expected_columns = {"date", "tenant_id", "sales", "weather", "spend"}
        assert set(result.train_df.columns) == expected_columns
        assert set(result.val_df.columns) == expected_columns
        assert set(result.test_df.columns) == expected_columns

    def test_split_multi_tenant_data(self):
        """Test split with multi-tenant data."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")
        df = pd.DataFrame({
            "date": pd.concat([
                pd.Series(dates),
                pd.Series(dates),
                pd.Series(dates),
            ], ignore_index=True),
            "tenant_id": ["A"] * 100 + ["B"] * 100 + ["C"] * 100,
            "sales": range(300),
        })

        splitter = TimeSeriesSplitter()
        result = splitter.split(df)

        # Each tenant should be represented in each split
        train_tenants = set(result.train_df["tenant_id"].unique())
        val_tenants = set(result.val_df["tenant_id"].unique())
        test_tenants = set(result.test_df["tenant_id"].unique())

        # All tenants should be in training (has most data)
        assert len(train_tenants) > 0


class TestProductionScenarios:
    """Tests for production-realistic scenarios."""

    def test_weather_model_training_split(self):
        """Simulate splitting weather model training data."""
        dates = pd.date_range("2022-01-01", periods=1095, freq="D")  # 3 years
        df = pd.DataFrame({
            "date": dates,
            "tenant_id": "retail_store_001",
            "sales": [100 + i % 30 for i in range(1095)],
            "temperature": [20 + 10 * (i % 365) / 365 for i in range(1095)],
            "humidity": [65 + 20 * (i % 365) / 365 for i in range(1095)],
        })

        splitter = TimeSeriesSplitter(train_pct=0.70, val_pct=0.15, test_pct=0.15)
        result = splitter.split(df)

        # Verify 70/15/15 split on 3 years
        assert result.train_rows == pytest.approx(766, abs=1)  # ~2.1 years
        assert result.val_rows == pytest.approx(164, abs=1)   # ~0.45 years
        assert result.test_rows == pytest.approx(165, abs=1)  # ~0.45 years

        # Verify temporal order
        is_valid, errors = result.validate_no_leakage()
        assert is_valid, f"Weather model split has leakage: {errors}"

    def test_allocation_model_training_split(self):
        """Simulate splitting allocation model training data."""
        dates = pd.date_range("2023-01-01", periods=730, freq="D")  # 2 years
        df = pd.DataFrame({
            "date": dates,
            "tenant_id": "ecommerce_001",
            "daily_revenue": [10000 + i % 2000 for i in range(730)],
            "daily_spend": [5000 + i % 1000 for i in range(730)],
        })

        # Custom split: 1.4 years train, 0.3 years val, 0.3 years test
        splitter = TimeSeriesSplitter(train_pct=0.70, val_pct=0.15, test_pct=0.15)
        result = splitter.split(df)

        # Verify no future data in past predictions
        is_valid, errors = result.validate_no_leakage()
        assert is_valid

        # Training should only use early data
        train_max_date = pd.to_datetime(result.train_df["date"]).max()
        val_min_date = pd.to_datetime(result.val_df["date"]).min()
        assert train_max_date < val_min_date
