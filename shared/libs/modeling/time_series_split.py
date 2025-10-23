"""Time series splitting for ML models with guaranteed no data leakage.

Implements proper train/validation/test splitting for time series data to ensure:
- No temporal leakage: Training data only uses past information
- No overlap: Test set is strictly after validation, validation after training
- Reproducible splits: Deterministic by date ranges
- Configurable: Support different split percentages and time windows

This is critical for weather-responsive models where future weather
shouldn't inform predictions for past periods.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Tuple

import pandas as pd
from pandas import DataFrame

_LOGGER = logging.getLogger(__name__)


class SplitStrategy(Enum):
    """Time series split strategies."""

    CHRONOLOGICAL = "chronological"
    """Strict temporal order: Train→Val→Test with no overlap"""

    ROLLING_WINDOW = "rolling_window"
    """Expanding window: Extends training, fixed validation window"""

    EXPANDING = "expanding"
    """Growing training set, fixed test window"""


@dataclass
class SplitResult:
    """Result of a time series split."""

    train_df: DataFrame
    """Training data (earliest period)"""

    val_df: DataFrame
    """Validation data (middle period)"""

    test_df: DataFrame
    """Test data (latest period)"""

    train_start_date: datetime
    """Training period start"""

    train_end_date: datetime
    """Training period end"""

    val_start_date: datetime
    """Validation period start"""

    val_end_date: datetime
    """Validation period end"""

    test_start_date: datetime
    """Test period start"""

    test_end_date: datetime
    """Test period end"""

    split_ratios: Dict[str, float]
    """Train/val/test ratios for verification"""

    @property
    def train_rows(self) -> int:
        """Number of training rows."""
        return len(self.train_df)

    @property
    def val_rows(self) -> int:
        """Number of validation rows."""
        return len(self.val_df)

    @property
    def test_rows(self) -> int:
        """Number of test rows."""
        return len(self.test_df)

    @property
    def total_rows(self) -> int:
        """Total rows across all splits."""
        return self.train_rows + self.val_rows + self.test_rows

    @property
    def train_pct(self) -> float:
        """Training data percentage."""
        return (self.train_rows / self.total_rows * 100) if self.total_rows > 0 else 0

    @property
    def val_pct(self) -> float:
        """Validation data percentage."""
        return (self.val_rows / self.total_rows * 100) if self.total_rows > 0 else 0

    @property
    def test_pct(self) -> float:
        """Test data percentage."""
        return (self.test_rows / self.total_rows * 100) if self.total_rows > 0 else 0

    def validate_no_leakage(self) -> Tuple[bool, List[str]]:
        """Validate that split has no temporal leakage.

        Returns:
            (is_valid, error_messages)
        """
        errors = []

        # Check temporal ordering (allow equality for boundary dates with non-overlapping split)
        if self.train_end_date > self.val_start_date:
            errors.append(
                f"Train/Val overlap: train ends {self.train_end_date}, "
                f"val starts {self.val_start_date}"
            )

        if self.val_end_date > self.test_start_date:
            errors.append(
                f"Val/Test overlap: val ends {self.val_end_date}, "
                f"test starts {self.test_start_date}"
            )

        # Check no date overlap in actual data (strict inequality)
        if not self.train_df.empty and not self.val_df.empty:
            train_max = self._get_max_date(self.train_df)
            val_min = self._get_min_date(self.val_df)
            if train_max is not None and val_min is not None and train_max >= val_min:
                errors.append(
                    f"Training data extends to {train_max}, "
                    f"validation starts at {val_min}"
                )

        if not self.val_df.empty and not self.test_df.empty:
            val_max = self._get_max_date(self.val_df)
            test_min = self._get_min_date(self.test_df)
            if val_max is not None and test_min is not None and val_max >= test_min:
                errors.append(
                    f"Validation data extends to {val_max}, "
                    f"test starts at {test_min}"
                )

        return len(errors) == 0, errors

    @staticmethod
    def _get_max_date(df: DataFrame) -> Optional[datetime]:
        """Get maximum date from dataframe."""
        # Try common date column names
        for col in ["date", "Date", "DATE", "timestamp", "Timestamp"]:
            if col in df.columns:
                return pd.to_datetime(df[col]).max()
        return None

    @staticmethod
    def _get_min_date(df: DataFrame) -> Optional[datetime]:
        """Get minimum date from dataframe."""
        # Try common date column names
        for col in ["date", "Date", "DATE", "timestamp", "Timestamp"]:
            if col in df.columns:
                return pd.to_datetime(df[col]).min()
        return None


class TimeSeriesSplitter:
    """Split time series data with guaranteed no leakage.

    Suitable for:
    - Weather prediction models
    - Sales forecasting
    - Any model where future data shouldn't affect past predictions

    Key properties:
    - Strict temporal ordering
    - No overlap between splits
    - Configurable ratios (default 70/15/15)
    - Reproducible results
    """

    def __init__(
        self,
        train_pct: float = 0.70,
        val_pct: float = 0.15,
        test_pct: float = 0.15,
        strategy: SplitStrategy = SplitStrategy.CHRONOLOGICAL,
        date_column: str = "date",
    ):
        """Initialize time series splitter.

        Args:
            train_pct: Percentage for training (default 0.70)
            val_pct: Percentage for validation (default 0.15)
            test_pct: Percentage for testing (default 0.15)
            strategy: Split strategy (default CHRONOLOGICAL)
            date_column: Name of date column in data (default 'date')

        Raises:
            ValueError: If percentages don't sum to 1.0
        """
        total = train_pct + val_pct + test_pct
        if abs(total - 1.0) > 1e-6:
            raise ValueError(
                f"Split percentages must sum to 1.0, got {total} "
                f"({train_pct} + {val_pct} + {test_pct})"
            )

        self.train_pct = train_pct
        self.val_pct = val_pct
        self.test_pct = test_pct
        self.strategy = strategy
        self.date_column = date_column

        _LOGGER.info(
            f"Initialized TimeSeriesSplitter "
            f"(strategy={strategy.value}, ratios={train_pct}/{val_pct}/{test_pct})"
        )

    def split(self, df: DataFrame) -> SplitResult:
        """Split dataframe into train/val/test.

        Args:
            df: Input dataframe with date column

        Returns:
            SplitResult with train/val/test dataframes

        Raises:
            ValueError: If date column not found or invalid
        """
        # Ensure date column exists
        if self.date_column not in df.columns:
            raise ValueError(f"Date column '{self.date_column}' not found in dataframe")

        # Sort by date
        df_sorted = df.sort_values(self.date_column).reset_index(drop=True)

        # Get date range
        min_date = pd.to_datetime(df_sorted[self.date_column].min())
        max_date = pd.to_datetime(df_sorted[self.date_column].max())

        if min_date >= max_date:
            raise ValueError(
                f"Invalid date range: min_date={min_date} >= max_date={max_date}"
            )

        _LOGGER.info(
            f"Splitting {len(df)} rows from {min_date.date()} to {max_date.date()}"
        )

        # Calculate split indices
        total_rows = len(df_sorted)
        train_end_idx = int(total_rows * self.train_pct)
        val_end_idx = train_end_idx + int(total_rows * self.val_pct)

        # Ensure at least 1 row in each split
        train_end_idx = max(1, train_end_idx)
        val_end_idx = max(train_end_idx + 1, val_end_idx)

        # Perform split
        train_df = df_sorted.iloc[:train_end_idx].copy()
        val_df = df_sorted.iloc[train_end_idx:val_end_idx].copy()
        test_df = df_sorted.iloc[val_end_idx:].copy()

        # Get date boundaries
        train_start = min_date
        train_end = pd.to_datetime(train_df[self.date_column].max())
        val_start = pd.to_datetime(val_df[self.date_column].min()) if len(val_df) > 0 else train_end
        val_end = pd.to_datetime(val_df[self.date_column].max()) if len(val_df) > 0 else val_start
        test_start = pd.to_datetime(test_df[self.date_column].min()) if len(test_df) > 0 else val_end
        test_end = max_date

        result = SplitResult(
            train_df=train_df,
            val_df=val_df,
            test_df=test_df,
            train_start_date=train_start,
            train_end_date=train_end,
            val_start_date=val_start,
            val_end_date=val_end,
            test_start_date=test_start,
            test_end_date=test_end,
            split_ratios={
                "train": self.train_pct,
                "val": self.val_pct,
                "test": self.test_pct,
            },
        )

        # Validate no leakage
        is_valid, errors = result.validate_no_leakage()
        if not is_valid:
            for error in errors:
                _LOGGER.error(f"Leakage detected: {error}")
            raise ValueError(f"Data leakage detected: {errors}")

        _LOGGER.info(
            f"Split complete: "
            f"train={result.train_rows} ({result.train_pct:.1f}%), "
            f"val={result.val_rows} ({result.val_pct:.1f}%), "
            f"test={result.test_rows} ({result.test_pct:.1f}%)"
        )

        return result

    def split_by_date(
        self,
        df: DataFrame,
        train_start: datetime,
        train_end: datetime,
        val_end: datetime,
        test_end: datetime,
    ) -> SplitResult:
        """Split dataframe by explicit date boundaries.

        Args:
            df: Input dataframe
            train_start: Training period start
            train_end: Training period end (exclusive)
            val_end: Validation period end (exclusive)
            test_end: Test period end (inclusive)

        Returns:
            SplitResult with train/val/test dataframes
        """
        df_sorted = df.sort_values(self.date_column).reset_index(drop=True)
        df_sorted[self.date_column] = pd.to_datetime(df_sorted[self.date_column])

        # Split by date boundaries
        train_df = df_sorted[
            (df_sorted[self.date_column] >= train_start)
            & (df_sorted[self.date_column] < train_end)
        ].copy()

        val_df = df_sorted[
            (df_sorted[self.date_column] >= train_end)
            & (df_sorted[self.date_column] < val_end)
        ].copy()

        test_df = df_sorted[
            (df_sorted[self.date_column] >= val_end)
            & (df_sorted[self.date_column] <= test_end)
        ].copy()

        _LOGGER.info(
            f"Split by date boundaries: "
            f"train=[{train_start}, {train_end}), "
            f"val=[{train_end}, {val_end}), "
            f"test=[{val_end}, {test_end}]"
        )

        result = SplitResult(
            train_df=train_df,
            val_df=val_df,
            test_df=test_df,
            train_start_date=train_start,
            train_end_date=train_end,
            val_start_date=train_end,
            val_end_date=val_end,
            test_start_date=val_end,
            test_end_date=test_end,
            split_ratios={
                "train": len(train_df) / len(df),
                "val": len(val_df) / len(df),
                "test": len(test_df) / len(df),
            },
        )

        # Validate
        is_valid, errors = result.validate_no_leakage()
        if not is_valid:
            for error in errors:
                _LOGGER.error(f"Leakage detected: {error}")
            raise ValueError(f"Data leakage detected: {errors}")

        return result
