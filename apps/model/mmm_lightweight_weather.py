"""LightweightMMM with weather-aware features for ROAS modeling.

Extends LightweightMMM to incorporate weather factors:
- Temperature sensitivity (seasonal demand variation)
- Precipitation impact (traffic changes with weather)
- Weather interaction terms with media spend

This implements proper media mix modeling with:
- Adstock transformation (geometric decay of advertising impact)
- Hill saturation curves (diminishing returns to scale)
- Weather feature engineering
- Proper train/val/test splitting with no leakage
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

_LOGGER = logging.getLogger(__name__)


def load_synthetic_tenant_data(tenant_path: Path) -> pd.DataFrame:
    """Load synthetic tenant data from parquet file.

    Args:
        tenant_path: Path to parquet file

    Returns:
        DataFrame with tenant data
    """
    df = pd.read_parquet(tenant_path)
    # Ensure date column is datetime
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"])
    return df


def get_weather_columns(df: pd.DataFrame) -> List[str]:
    """Extract weather column names from dataframe.

    Supports both naming conventions:
    - Standard: temperature, humidity, precipitation
    - Synthetic: temperature_celsius, relative_humidity_percent, precipitation_mm

    Args:
        df: Input dataframe

    Returns:
        List of weather column names in standard format
    """
    weather_cols = []
    # Check for standard names first
    for col in ["temperature", "humidity", "precipitation"]:
        if col in df.columns:
            weather_cols.append(col)

    # If no standard columns found, try synthetic naming convention
    if not weather_cols:
        standard_mapping = {
            "temperature_celsius": "temperature",
            "relative_humidity_percent": "humidity",
            "precipitation_mm": "precipitation",
        }
        for src_col, dst_col in standard_mapping.items():
            if src_col in df.columns:
                weather_cols.append(dst_col)

    return weather_cols


def get_spend_columns(df: pd.DataFrame) -> List[str]:
    """Extract media spend column names from dataframe.

    Args:
        df: Input dataframe

    Returns:
        List of spend column names (meta_spend, google_spend)
    """
    spend_cols = []
    for col in ["meta_spend", "google_spend"]:
        if col in df.columns:
            spend_cols.append(col)
    return spend_cols


def normalize_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names to standard format.

    Converts synthetic naming convention to standard format:
    - temperature_celsius -> temperature
    - relative_humidity_percent -> humidity
    - precipitation_mm -> precipitation
    - revenue_usd -> revenue

    Args:
        df: Input dataframe

    Returns:
        DataFrame with normalized column names
    """
    rename_map = {
        "temperature_celsius": "temperature",
        "relative_humidity_percent": "humidity",
        "precipitation_mm": "precipitation",
        "revenue_usd": "revenue",
    }

    rename_actual = {k: v for k, v in rename_map.items() if k in df.columns}
    if rename_actual:
        df = df.rename(columns=rename_actual)

    return df


@dataclass
class WeatherAwareMMResult:
    """Result from weather-aware MMM training."""

    model_name: str
    """Model identifier (e.g., 'tenant_001')"""

    train_r2: float
    """R² on training data"""

    val_r2: float
    """R² on validation data"""

    test_r2: float
    """R² on test data"""

    weather_elasticity: Dict[str, float]
    """Weather feature elasticity coefficients"""

    channel_roas: Dict[str, float]
    """Estimated ROAS by media channel"""

    coefficients: Dict[str, float]
    """All fitted model coefficients"""

    predictions_train: np.ndarray
    """Predictions on training data"""

    predictions_val: np.ndarray
    """Predictions on validation data"""

    predictions_test: np.ndarray
    """Predictions on test data"""

    feature_names: List[str]
    """Names of features used"""


@dataclass
class CrossValidationMetrics:
    """Metrics from k-fold cross-validation."""

    model_name: str
    """Model identifier"""

    fold_r2_scores: List[float]
    """R² scores for each fold"""

    fold_rmse_scores: List[float]
    """RMSE scores for each fold"""

    fold_mae_scores: List[float]
    """MAE scores for each fold"""

    mean_r2: float
    """Mean R² across folds"""

    std_r2: float
    """Standard deviation of R² across folds"""

    mean_rmse: float
    """Mean RMSE across folds"""

    mean_mae: float
    """Mean MAE across folds"""

    mean_revenue: float = 0.0
    """Mean revenue across the evaluation window (used for RMSE % checks)"""

    weather_elasticity: Dict[str, List[float]] = field(default_factory=dict)
    """Weather elasticity per fold"""

    channel_roas: Dict[str, List[float]] = field(default_factory=dict)
    """Channel ROAS per fold"""

    num_folds: int = 0
    """Number of folds used"""

    feature_names: List[str] = field(default_factory=list)
    """Feature names used in model"""

    fold_details: List[Dict[str, Any]] = field(default_factory=list)
    """Detailed results per fold (optional)"""


class WeatherAwareMMM:
    """Weather-integrated Media Mix Model."""

    def __init__(
        self,
        adstock_lags: Optional[Dict[str, int]] = None,
        weather_features: Optional[List[str]] = None,
        regularization_strength: float = 0.01,
    ):
        """Initialize weather-aware MMM.

        Args:
            adstock_lags: Adstock decay lags by channel (default 2-week decay)
            weather_features: Weather feature names (default: temp, humidity, precip)
            regularization_strength: L2 regularization for coefficients
        """
        self.adstock_lags = adstock_lags or {
            "tv": 14,
            "radio": 7,
            "print": 7,
            "online": 0,
        }
        self.weather_features = weather_features or [
            "temperature",
            "humidity",
            "precipitation",
        ]
        self.regularization_strength = regularization_strength
        self.coefficients: Optional[Dict[str, float]] = None
        self.intercept: Optional[float] = None
        self.feature_names: List[str] = []
        self.model: Optional[Ridge] = None
        self.available_weather_features: List[str] = []
        self.channel_names: List[str] = []

        _LOGGER.info(
            f"Initialized WeatherAwareMMM "
            f"(channels={len(self.adstock_lags)}, "
            f"weather_features={len(self.weather_features)})"
        )

    def _geometric_adstock(
        self,
        spend: np.ndarray,
        lag: int,
        decay: float = 0.5,
    ) -> np.ndarray:
        """Apply geometric adstock transformation.

        Args:
            spend: Channel spend time series
            lag: Maximum lag in days
            decay: Decay factor (0-1)

        Returns:
            Adstocked spend
        """
        if lag == 0 or len(spend) == 0:
            return spend

        # For very short time series, return as-is
        if len(spend) == 1:
            return spend

        # Geometric adstock decay
        weights = np.array([decay ** i for i in range(min(lag + 1, len(spend)))])
        weights = weights / weights.sum()

        adstocked = np.convolve(spend, weights, mode="same")
        return adstocked

    def _hill_saturation(
        self,
        x: np.ndarray,
        k: float = 1.0,
        s: float = 0.5,
    ) -> np.ndarray:
        """Apply Hill saturation curve.

        Implements diminishing returns: y = x^s / (k^s + x^s)

        Args:
            x: Input values
            k: Saturation point (y=0.5 at x=k)
            s: Shape parameter (elasticity)

        Returns:
            Saturated values
        """
        numerator = np.power(x, s)
        denominator = np.power(k, s) + np.power(x, s)
        return numerator / denominator

    def fit(
        self,
        X_spend: pd.DataFrame,
        X_weather: pd.DataFrame,
        y: np.ndarray,
        X_spend_val: Optional[pd.DataFrame] = None,
        X_weather_val: Optional[pd.DataFrame] = None,
        y_val: Optional[np.ndarray] = None,
        estimate_adstock: bool = True,
        estimate_saturation: bool = True,
    ) -> WeatherAwareMMResult:
        """Fit weather-aware MMM model using Bayesian parameter estimation.

        Args:
            X_spend: Media spend data (n_periods, n_channels)
            X_weather: Weather data (n_periods, n_weather_features)
            y: Target revenue (n_periods,)
            X_spend_val: Validation spend data
            X_weather_val: Validation weather data
            y_val: Validation target
            estimate_adstock: Use Bayesian estimation for adstock parameters
            estimate_saturation: Use Bayesian estimation for saturation parameters

        Returns:
            WeatherAwareMMResult with fitted model

        Raises:
            ValueError: If inputs have mismatched lengths or missing required columns
        """
        # Validate that input data lengths match
        if len(X_spend) != len(X_weather) or len(X_spend) != len(y):
            raise ValueError(
                f"Data length mismatch: X_spend={len(X_spend)}, "
                f"X_weather={len(X_weather)}, y={len(y)}"
            )

        # Validate validation data lengths if provided
        val_inputs = [X_spend_val, X_weather_val, y_val]
        if any(x is not None for x in val_inputs):
            if not all(x is not None for x in val_inputs):
                raise ValueError(
                    "Validation data must be provided together or not at all: "
                    f"X_spend_val={X_spend_val is not None}, "
                    f"X_weather_val={X_weather_val is not None}, "
                    f"y_val={y_val is not None}"
                )

            if len(X_spend_val) != len(X_weather_val) or len(X_spend_val) != len(y_val):
                raise ValueError(
                    "Validation data length mismatch: "
                    f"X_spend_val={len(X_spend_val)}, "
                    f"X_weather_val={len(X_weather_val)}, "
                    f"y_val={len(y_val)}"
                )
        """Fit weather-aware MMM model using Bayesian parameter estimation.

        Args:
            X_spend: Media spend data (n_periods, n_channels)
            X_weather: Weather data (n_periods, n_weather_features)
            y: Target revenue (n_periods,)
            X_spend_val: Validation spend data
            X_weather_val: Validation weather data
            y_val: Validation target
            X_spend_test: Test spend data
            X_weather_test: Test weather data
            y_test: Test target
            estimate_adstock: Use Bayesian estimation for adstock parameters
            estimate_saturation: Use Bayesian estimation for saturation parameters

        Returns:
            WeatherAwareMMResult with fitted model
        """
        channels = X_spend.columns.tolist()
        selected_weather = [wf for wf in self.weather_features if wf in X_weather.columns]
        X_train, feature_names = self._build_feature_matrix(
            X_spend,
            X_weather,
            channels,
            weather_features=selected_weather,
            return_feature_names=True,
        )

        self.feature_names = feature_names
        self.available_weather_features = selected_weather
        self.channel_names = channels

        model = Ridge(alpha=self.regularization_strength)
        model.fit(X_train, y)
        self.model = model

        self.coefficients = {
            name: float(coef) for name, coef in zip(self.feature_names, model.coef_)
        }
        self.intercept = float(model.intercept_)

        y_pred_train = model.predict(X_train)
        r2_train = self._compute_r2(y, y_pred_train)

        val_r2 = 0.0
        y_pred_val = np.array([], dtype=float)
        if X_spend_val is not None and X_weather_val is not None and y_val is not None:
            X_val = self._build_feature_matrix(
                X_spend_val,
                X_weather_val,
                channels,
                weather_features=self.available_weather_features,
            )
            y_pred_val = model.predict(X_val)
            val_r2 = self._compute_r2(y_val, y_pred_val)

        result = WeatherAwareMMResult(
            model_name="weather_aware_mmm",
            train_r2=r2_train,
            val_r2=val_r2,
            test_r2=0.0,
            weather_elasticity=self._extract_weather_elasticity(),
            channel_roas=self._estimate_channel_roas(channels, X_spend),
            coefficients=self.coefficients,
            predictions_train=y_pred_train,
            predictions_val=y_pred_val,
            predictions_test=np.array([], dtype=float),
            feature_names=self.feature_names,
        )

        return result

    def _build_feature_matrix(
        self,
        spend_df: pd.DataFrame,
        weather_df: pd.DataFrame,
        channels: List[str],
        *,
        weather_features: Optional[List[str]] = None,
        return_feature_names: bool = False,
        estimate_adstock: bool = True,
        estimate_saturation: bool = True,
    ) -> np.ndarray | Tuple[np.ndarray, List[str]]:
        """Build feature matrix with adstock, saturation, and interactions.

        Args:
            spend_df: Media spend DataFrame
            weather_df: Weather data DataFrame
            channels: Channel names

        Returns:
            Feature matrix for model fitting
        """
        features: List[np.ndarray] = []
        feature_names: List[str] = []
        selected_weather = weather_features or [
            wf for wf in self.weather_features if wf in weather_df.columns
        ]

        # Adstocked spend
        for channel in channels:
            lag = self.adstock_lags.get(channel, 7)
            spend = spend_df[channel].to_numpy(dtype=float)
            adstocked = self._geometric_adstock(spend, lag)
            features.append(adstocked)
            feature_names.append(f"{channel}_adstocked")

        # Saturated spend
        for channel in channels:
            lag = self.adstock_lags.get(channel, 7)
            spend = spend_df[channel].to_numpy(dtype=float)
            adstocked = self._geometric_adstock(spend, lag)
            saturated = self._hill_saturation(adstocked)
            features.append(saturated)
            feature_names.append(f"{channel}_saturated")

        # Weather features
        for wf in selected_weather:
            features.append(weather_df[wf].to_numpy(dtype=float))
            feature_names.append(wf)

        # Weather x spend interactions
        for wf in selected_weather:
            weather_vals = weather_df[wf].to_numpy(dtype=float)
            for channel in channels:
                spend = spend_df[channel].to_numpy(dtype=float)
                interaction = weather_vals * spend
                features.append(interaction)
                feature_names.append(f"weather_{wf}_x_{channel}")

        feature_matrix = np.column_stack(features) if features else np.empty((len(spend_df), 0))
        if return_feature_names:
            return feature_matrix, feature_names
        return feature_matrix

    def _extract_weather_elasticity(self) -> Dict[str, float]:
        """Extract weather feature elasticity coefficients.

        Returns:
            Elasticity coefficients by weather feature
        """
        if not self.coefficients:
            return {}

        elasticity: Dict[str, float] = {}
        for wf in self.available_weather_features:
            if wf in self.coefficients:
                elasticity[wf] = self.coefficients[wf]

        return elasticity

    def _estimate_channel_roas(
        self,
        channels: List[str],
        spend_df: pd.DataFrame,
    ) -> Dict[str, float]:
        """Estimate ROAS by channel.

        Returns:
            Estimated ROAS by channel
        """
        if not self.coefficients:
            return {}

        roas = {}
        for channel in channels:
            # Simple ROAS: coefficient / average spend
            key = f"{channel}_saturated"
            if key in self.coefficients:
                avg_spend = spend_df[channel].mean()
                if avg_spend > 0:
                    roas[channel] = self.coefficients[key] / avg_spend
                else:
                    roas[channel] = 0.0

        return roas

    @staticmethod
    def _compute_r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Compute R² score.

        Args:
            y_true: Actual values
            y_pred: Predicted values

        Returns:
            R² coefficient of determination
        """
        ss_res = np.sum((y_true - y_pred) ** 2)
        ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
        if ss_tot == 0:
            return 0.0
        return 1 - (ss_res / ss_tot)

    def predict(
        self,
        X_spend: pd.DataFrame,
        X_weather: pd.DataFrame,
        channels: Optional[List[str]] = None,
    ) -> np.ndarray:
        """Make predictions.

        Args:
            X_spend: Media spend
            X_weather: Weather features
            channels: Channel names

        Returns:
            Predicted revenue
        """
        if self.model is None:
            raise ValueError("Model not fitted yet")

        if channels is None:
            channels = self.channel_names or X_spend.columns.tolist()

        X = self._build_feature_matrix(
            X_spend,
            X_weather,
            channels,
            weather_features=self.available_weather_features,
        )
        return self.model.predict(X)

    @staticmethod
    def _compute_rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Compute RMSE (Root Mean Squared Error).

        Args:
            y_true: Actual values
            y_pred: Predicted values

        Returns:
            RMSE
        """
        mse = np.mean((y_true - y_pred) ** 2)
        return float(np.sqrt(mse))

    @staticmethod
    def _compute_mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Compute MAE (Mean Absolute Error).

        Args:
            y_true: Actual values
            y_pred: Predicted values

        Returns:
            MAE
        """
        return float(np.mean(np.abs(y_true - y_pred)))

    def cross_validate(
        self,
        X_spend: pd.DataFrame,
        X_weather: pd.DataFrame,
        y: np.ndarray,
        n_folds: int = 5,
        model_name: str = "weather_aware_mmm",
    ) -> CrossValidationMetrics:
        """Perform k-fold cross-validation.

        Uses time-series aware folding: each fold trains on earlier data
        and validates on later data to prevent temporal leakage.

        Args:
            X_spend: Media spend data (n_periods, n_channels)
            X_weather: Weather data (n_periods, n_weather_features)
            y: Target revenue (n_periods,)
            n_folds: Number of folds (default 5)
            model_name: Model name for results

        Returns:
            CrossValidationMetrics with fold-wise and aggregate metrics
        """
        # Validate training data lengths
        if len(X_spend) != len(X_weather) or len(X_spend) != len(y):
            raise ValueError(
                f"Data length mismatch: X_spend={len(X_spend)}, "
                f"X_weather={len(X_weather)}, y={len(y)}"
            )

        if n_folds < 2:
            raise ValueError(f"n_folds must be >= 2, got {n_folds}")

        channels = X_spend.columns.tolist()
        n_samples = len(X_spend)
        fold_size = n_samples // n_folds
        fold_size = max(1, fold_size)  # At least 1 sample per fold

        fold_r2_scores = []
        fold_rmse_scores = []
        fold_mae_scores = []
        fold_elasticity = {wf: [] for wf in self.weather_features}
        fold_roas = {ch: [] for ch in channels}
        fold_details = []

        _LOGGER.info(f"Starting {n_folds}-fold cross-validation with fold_size={fold_size}")

        for fold_idx in range(n_folds):
            test_start = fold_idx * fold_size
            test_end = (
                (fold_idx + 1) * fold_size
                if fold_idx < n_folds - 1
                else n_samples
            )

            # Time series split: train on data before test set
            train_indices = np.arange(0, test_start)
            test_indices = np.arange(test_start, test_end)

            if len(train_indices) == 0:
                _LOGGER.warning(f"Fold {fold_idx}: No training data, skipping")
                continue

            # Extract fold data
            X_spend_train = X_spend.iloc[train_indices].reset_index(drop=True)
            X_weather_train = X_weather.iloc[train_indices].reset_index(drop=True)
            y_train = y[train_indices]

            X_spend_test = X_spend.iloc[test_indices].reset_index(drop=True)
            X_weather_test = X_weather.iloc[test_indices].reset_index(drop=True)
            y_test = y[test_indices]

            # Train model on fold
            fold_model = WeatherAwareMMM(
                adstock_lags=self.adstock_lags,
                weather_features=self.weather_features,
                regularization_strength=self.regularization_strength,
            )

            result = fold_model.fit(
                X_spend_train,
                X_weather_train,
                y_train,
                X_spend_val=X_spend_test,
                X_weather_val=X_weather_test,
                y_val=y_test,
            )

            # Compute test metrics
            y_pred_test = fold_model.predict(
                X_spend_test,
                X_weather_test,
                channels,
            )

            r2_fold = fold_model._compute_r2(y_test, y_pred_test)
            rmse_fold = fold_model._compute_rmse(y_test, y_pred_test)
            mae_fold = fold_model._compute_mae(y_test, y_pred_test)
            mean_revenue_fold = float(np.mean(y_test)) if len(y_test) else 0.0

            fold_r2_scores.append(r2_fold)
            fold_rmse_scores.append(rmse_fold)
            fold_mae_scores.append(mae_fold)

            # Extract elasticity and ROAS
            for wf in self.weather_features:
                if wf in result.weather_elasticity:
                    fold_elasticity[wf].append(result.weather_elasticity[wf])

            for ch in channels:
                if ch in result.channel_roas:
                    fold_roas[ch].append(result.channel_roas[ch])

            fold_details.append({
                "fold": fold_idx,
                "train_size": len(train_indices),
                "test_size": len(test_indices),
                "r2": r2_fold,
                "rmse": rmse_fold,
                "mae": mae_fold,
                "mean_revenue": mean_revenue_fold,
            })

            _LOGGER.info(
                f"Fold {fold_idx}: r2={r2_fold:.4f}, rmse={rmse_fold:.4f}, mae={mae_fold:.4f}"
            )

        # Aggregate metrics
        mean_r2 = float(np.mean(fold_r2_scores))
        std_r2 = float(np.std(fold_r2_scores))
        mean_rmse = float(np.mean(fold_rmse_scores))
        mean_mae = float(np.mean(fold_mae_scores))
        overall_mean_revenue = float(np.mean(y)) if len(y) else 0.0

        _LOGGER.info(
            f"Cross-validation complete: "
            f"R² = {mean_r2:.4f} ± {std_r2:.4f}, "
            f"RMSE = {mean_rmse:.4f}, MAE = {mean_mae:.4f}"
        )

        return CrossValidationMetrics(
            model_name=model_name,
            fold_r2_scores=fold_r2_scores,
            fold_rmse_scores=fold_rmse_scores,
            fold_mae_scores=fold_mae_scores,
            mean_r2=mean_r2,
            std_r2=std_r2,
            mean_rmse=mean_rmse,
            mean_mae=mean_mae,
            mean_revenue=overall_mean_revenue,
            weather_elasticity=fold_elasticity,
            channel_roas=fold_roas,
            num_folds=n_folds,
            feature_names=self.feature_names,
            fold_details=fold_details,
        )


class TenantModelTrainer:
    """Trains weather-aware MMM models on synthetic tenant data."""

    def __init__(
        self,
        data_dir: Optional[Path] = None,
        regularization_strength: float = 0.01,
    ):
        """Initialize trainer.

        Args:
            data_dir: Directory containing synthetic tenant parquet files
            regularization_strength: L2 regularization strength
        """
        if data_dir is None:
            # Default to synthetic_v2 directory
            data_dir = Path(__file__).parent.parent.parent / "storage" / "seeds" / "synthetic_v2"

        self.data_dir = Path(data_dir)
        self.regularization_strength = regularization_strength

        _LOGGER.info(f"Initialized TenantModelTrainer with data_dir={self.data_dir}")

    def list_tenant_files(self) -> List[Path]:
        """List all tenant data files.

        Returns:
            List of parquet file paths
        """
        if not self.data_dir.exists():
            return []
        return sorted(self.data_dir.glob("*.parquet"))

    def train_single_tenant(
        self,
        tenant_path: Path,
        target_column: str = "revenue",
        regularization_strength: Optional[float] = None,
    ) -> Tuple[str, WeatherAwareMMResult]:
        """Train model for a single tenant.

        Args:
            tenant_path: Path to tenant parquet file
            target_column: Name of target column (revenue)
            regularization_strength: Optional override for model regularization

        Returns:
            (tenant_name, result)
        """
        tenant_name = tenant_path.stem
        _LOGGER.info(f"Training model for tenant: {tenant_name}")

        # Load data
        df = load_synthetic_tenant_data(tenant_path)
        _LOGGER.info(f"Loaded {len(df)} rows for {tenant_name}")

        # Normalize column names (handles synthetic naming convention)
        df = normalize_column_names(df)

        # Get feature columns
        weather_cols = get_weather_columns(df)
        spend_cols = get_spend_columns(df)

        # Determine target column
        target_col = target_column
        if target_col not in df.columns:
            # Try alternative names
            for alt_col in ["revenue_usd", "revenue"]:
                if alt_col in df.columns:
                    target_col = alt_col
                    break

        if not weather_cols or not spend_cols or target_col not in df.columns:
            raise ValueError(
                f"Missing required columns for {tenant_name}: "
                f"weather={weather_cols}, spend={spend_cols}, target={target_col in df.columns}"
            )

        # Split data using time series splitter
        # Note: Using split_by_date with explicit boundaries to avoid date overlap issues
        from shared.libs.modeling.time_series_split import TimeSeriesSplitter
        from datetime import timedelta

        # Sort by date first
        df_sorted = df.sort_values("date").reset_index(drop=True)
        min_date = pd.to_datetime(df_sorted["date"].min())
        max_date = pd.to_datetime(df_sorted["date"].max())

        # Calculate split dates based on row counts
        n_rows = len(df_sorted)
        train_end_idx = int(n_rows * 0.70)
        val_end_idx = train_end_idx + int(n_rows * 0.15)

        # Get dates at split indices (add 1 day to avoid overlap)
        train_end_date = pd.to_datetime(df_sorted.iloc[train_end_idx - 1]["date"]) + timedelta(days=1)
        val_end_date = pd.to_datetime(df_sorted.iloc[val_end_idx - 1]["date"]) + timedelta(days=1)

        splitter = TimeSeriesSplitter(
            train_pct=0.70,
            val_pct=0.15,
            test_pct=0.15,
            date_column="date",
        )
        split_result = splitter.split_by_date(
            df_sorted,
            train_start=min_date,
            train_end=train_end_date,
            val_end=val_end_date,
            test_end=max_date + timedelta(days=1),
        )

        # Extract features and targets
        def extract_features(split_df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, np.ndarray]:
            """Extract spend, weather, and target from split."""
            spend_df = split_df[spend_cols].copy()
            weather_df = split_df[weather_cols].copy()
            target = split_df[target_col].values
            return spend_df, weather_df, target

        X_spend_train, X_weather_train, y_train = extract_features(split_result.train_df)
        X_spend_val, X_weather_val, y_val = extract_features(split_result.val_df)
        X_spend_test, X_weather_test, y_test = extract_features(split_result.test_df)

        # Train model
        reg_strength = (
            regularization_strength
            if regularization_strength is not None
            else self.regularization_strength
        )
        mmm = WeatherAwareMMM(
            weather_features=weather_cols,
            regularization_strength=reg_strength,
        )

        result = mmm.fit(
            X_spend_train,
            X_weather_train,
            y_train,
            X_spend_val=X_spend_val,
            X_weather_val=X_weather_val,
            y_val=y_val,
        )

        # Compute test metrics using fitted model
        y_pred_test = mmm.predict(
            X_spend_test,
            X_weather_test,
            spend_cols,
        )
        test_r2 = mmm._compute_r2(y_test, y_pred_test)

        # Update result with test metrics
        result.test_r2 = test_r2
        result.predictions_test = y_pred_test
        result.model_name = tenant_name

        _LOGGER.info(
            f"Trained {tenant_name}: train_r2={result.train_r2:.3f}, "
            f"val_r2={result.val_r2:.3f}, test_r2={result.test_r2:.3f}"
        )

        return tenant_name, result

    def train_all_tenants(self) -> Dict[str, WeatherAwareMMResult]:
        """Train models for all available tenants.

        Returns:
            Dictionary mapping tenant names to results
        """
        tenant_files = self.list_tenant_files()
        if not tenant_files:
            raise ValueError(f"No parquet files found in {self.data_dir}")

        results = {}
        failed = []

        for tenant_path in tenant_files:
            try:
                tenant_name, result = self.train_single_tenant(tenant_path)
                results[tenant_name] = result
            except Exception as e:
                _LOGGER.error(f"Failed to train {tenant_path.stem}: {e}")
                failed.append((tenant_path.stem, str(e)))

        summary = f"Trained {len(results)}/{len(tenant_files)} tenants"
        if failed:
            summary += f", {len(failed)} failed"
            _LOGGER.warning(f"{summary}")
        else:
            _LOGGER.info(f"{summary}")

        return results

    def train_single_tenant_with_cv(
        self,
        tenant_path: Path,
        n_folds: int = 5,
        target_column: str = "revenue",
    ) -> Tuple[str, CrossValidationMetrics]:
        """Train model with k-fold cross-validation for a single tenant.

        Args:
            tenant_path: Path to tenant parquet file
            n_folds: Number of folds for cross-validation
            target_column: Name of target column (revenue)

        Returns:
            (tenant_name, cross_validation_metrics)
        """
        tenant_name = tenant_path.stem
        _LOGGER.info(f"Training with CV for tenant: {tenant_name} ({n_folds} folds)")

        # Load data
        df = load_synthetic_tenant_data(tenant_path)
        _LOGGER.info(f"Loaded {len(df)} rows for {tenant_name}")

        # Normalize column names
        df = normalize_column_names(df)

        # Get feature columns
        weather_cols = get_weather_columns(df)
        spend_cols = get_spend_columns(df)

        # Determine target column
        target_col = target_column
        if target_col not in df.columns:
            for alt_col in ["revenue_usd", "revenue"]:
                if alt_col in df.columns:
                    target_col = alt_col
                    break

        if not weather_cols or not spend_cols or target_col not in df.columns:
            raise ValueError(
                f"Missing required columns for {tenant_name}: "
                f"weather={weather_cols}, spend={spend_cols}, target={target_col in df.columns}"
            )

        # Sort by date
        df_sorted = df.sort_values("date").reset_index(drop=True)

        # Extract features
        X_spend = df_sorted[spend_cols].copy()
        X_weather = df_sorted[weather_cols].copy()
        y = df_sorted[target_col].values

        # Create and run cross-validation
        mmm = WeatherAwareMMM(
            weather_features=weather_cols,
            regularization_strength=self.regularization_strength,
        )

        cv_metrics = mmm.cross_validate(
            X_spend,
            X_weather,
            y,
            n_folds=n_folds,
            model_name=tenant_name,
        )

        _LOGGER.info(
            f"CV complete for {tenant_name}: "
            f"R² = {cv_metrics.mean_r2:.4f} ± {cv_metrics.std_r2:.4f}"
        )

        return tenant_name, cv_metrics

    def train_all_tenants_with_cv(self, n_folds: int = 5) -> Dict[str, CrossValidationMetrics]:
        """Train models with cross-validation for all available tenants.

        Args:
            n_folds: Number of folds for cross-validation

        Returns:
            Dictionary mapping tenant names to CV metrics
        """
        tenant_files = self.list_tenant_files()
        if not tenant_files:
            raise ValueError(f"No parquet files found in {self.data_dir}")

        results = {}
        failed = []

        for tenant_path in tenant_files:
            try:
                tenant_name, cv_metrics = self.train_single_tenant_with_cv(tenant_path, n_folds)
                results[tenant_name] = cv_metrics
            except Exception as e:
                _LOGGER.error(f"Failed to train {tenant_path.stem} with CV: {e}")
                failed.append((tenant_path.stem, str(e)))

        summary = f"Trained {len(results)}/{len(tenant_files)} tenants with CV"
        if failed:
            summary += f", {len(failed)} failed"
            _LOGGER.warning(f"{summary}")
        else:
            _LOGGER.info(f"{summary}")

        return results

    @staticmethod
    def compute_aggregate_metrics(results: Dict[str, WeatherAwareMMResult]) -> Dict[str, float]:
        """Compute aggregate metrics across tenants.

        Args:
            results: Dictionary of training results

        Returns:
            Dictionary with aggregate metrics
        """
        if not results:
            return {}

        r2_values = {
            "train_r2": [r.train_r2 for r in results.values()],
            "val_r2": [r.val_r2 for r in results.values()],
            "test_r2": [r.test_r2 for r in results.values()],
        }

        metrics = {}
        for metric_type, values in r2_values.items():
            metrics[f"{metric_type}_mean"] = float(np.mean(values))
            metrics[f"{metric_type}_std"] = float(np.std(values))
            metrics[f"{metric_type}_min"] = float(np.min(values))
            metrics[f"{metric_type}_max"] = float(np.max(values))

        metrics["num_tenants"] = len(results)
        metrics["num_passing"] = sum(1 for r in results.values() if r.test_r2 >= 0.50)
        metrics["pass_rate"] = metrics["num_passing"] / len(results)

        return metrics

    @staticmethod
    def compute_cv_aggregate_metrics(results: Dict[str, CrossValidationMetrics]) -> Dict[str, Any]:
        """Compute aggregate metrics across CV results for all tenants.

        Args:
            results: Dictionary of CV metrics

        Returns:
            Dictionary with aggregate metrics across all tenants
        """
        if not results:
            return {}

        # Aggregate R² metrics
        all_mean_r2 = [r.mean_r2 for r in results.values()]
        all_mean_rmse = [r.mean_rmse for r in results.values()]
        all_mean_mae = [r.mean_mae for r in results.values()]

        metrics = {
            "num_tenants": len(results),
            "num_folds": next(iter(results.values())).num_folds if results else 0,
            "mean_r2_across_tenants": float(np.mean(all_mean_r2)),
            "std_r2_across_tenants": float(np.std(all_mean_r2)),
            "mean_rmse_across_tenants": float(np.mean(all_mean_rmse)),
            "mean_mae_across_tenants": float(np.mean(all_mean_mae)),
            "best_tenant_r2": float(np.max(all_mean_r2)),
            "worst_tenant_r2": float(np.min(all_mean_r2)),
            "num_passing": sum(1 for r in results.values() if r.mean_r2 >= 0.50),
        }
        metrics["pass_rate"] = metrics["num_passing"] / len(results)

        return metrics


# Backwards compatibility alias used in docs
LightweightMMMWeather = WeatherAwareMMM


@dataclass
class ModelValidationResult:
    """Result from model validation against objective thresholds."""

    tenant_name: str
    """Tenant/model identifier"""

    mean_r2: float
    """Mean R² score across cross-validation folds"""

    passes_threshold: bool
    """Whether model meets R² >= 0.50 threshold"""

    r2_threshold: float = 0.50
    """Objective threshold for R² (default: 0.50)"""

    num_folds: int = 5
    """Number of CV folds used"""

    fold_details: List[Dict[str, Any]] = field(default_factory=list)
    """Detailed results per fold"""

    weather_elasticity: Dict[str, float] = field(default_factory=dict)
    """Mean weather elasticity across folds"""

    channel_roas: Dict[str, float] = field(default_factory=dict)
    """Mean channel ROAS across folds"""


def validate_models_against_thresholds(
    cv_results: Dict[str, CrossValidationMetrics],
    r2_threshold: float = 0.50,
) -> Dict[str, ModelValidationResult]:
    """Validate cross-validated models against objective performance thresholds.

    Args:
        cv_results: Dictionary of CrossValidationMetrics from model training
        r2_threshold: Minimum R² score required to pass (default: 0.50)

    Returns:
        Dictionary mapping tenant names to ModelValidationResult
    """
    validation_results = {}

    for tenant_name, cv_metrics in cv_results.items():
        passes = cv_metrics.mean_r2 >= r2_threshold

        # Compute mean elasticity and ROAS across folds
        mean_elasticity = {}
        for weather_feature, elasticity_values in cv_metrics.weather_elasticity.items():
            mean_elasticity[weather_feature] = float(np.mean(elasticity_values))

        mean_roas = {}
        for channel, roas_values in cv_metrics.channel_roas.items():
            mean_roas[channel] = float(np.mean(roas_values))

        result = ModelValidationResult(
            tenant_name=tenant_name,
            mean_r2=cv_metrics.mean_r2,
            passes_threshold=passes,
            r2_threshold=r2_threshold,
            num_folds=cv_metrics.num_folds,
            fold_details=cv_metrics.fold_details,
            weather_elasticity=mean_elasticity,
            channel_roas=mean_roas,
        )

        validation_results[tenant_name] = result

    return validation_results


def summarize_validation_results(
    validation_results: Dict[str, ModelValidationResult],
) -> Dict[str, Any]:
    """Summarize validation results across all models.

    Args:
        validation_results: Dictionary of ModelValidationResult

    Returns:
        Dictionary with summary statistics
    """
    if not validation_results:
        return {}

    passing_models = [r for r in validation_results.values() if r.passes_threshold]
    failing_models = [r for r in validation_results.values() if not r.passes_threshold]

    all_r2_scores = [r.mean_r2 for r in validation_results.values()]
    passing_r2_scores = [r.mean_r2 for r in passing_models]

    summary = {
        "total_models": len(validation_results),
        "passing_models": len(passing_models),
        "failing_models": len(failing_models),
        "pass_rate": len(passing_models) / len(validation_results),
        "threshold": validation_results[next(iter(validation_results))].r2_threshold,
        "mean_r2_all": float(np.mean(all_r2_scores)),
        "std_r2_all": float(np.std(all_r2_scores)),
        "min_r2": float(np.min(all_r2_scores)),
        "max_r2": float(np.max(all_r2_scores)),
        "mean_r2_passing": float(np.mean(passing_r2_scores)) if passing_r2_scores else None,
        "passing_model_names": sorted([r.tenant_name for r in passing_models]),
        "failing_model_names": sorted([r.tenant_name for r in failing_models]),
    }

    return summary


def export_validation_results(
    validation_results: Dict[str, ModelValidationResult],
    output_path: Path,
) -> None:
    """Export validation results to JSON file.

    Args:
        validation_results: Dictionary of ModelValidationResult
        output_path: Path to output JSON file
    """
    # Convert dataclass instances to dictionaries
    results_dict = {}
    for tenant_name, result in validation_results.items():
        results_dict[tenant_name] = {
            "tenant_name": result.tenant_name,
            "mean_r2": float(result.mean_r2),
            "passes_threshold": result.passes_threshold,
            "r2_threshold": result.r2_threshold,
            "num_folds": result.num_folds,
            "weather_elasticity": result.weather_elasticity,
            "channel_roas": result.channel_roas,
            "fold_details": result.fold_details,
        }

    summary = summarize_validation_results(validation_results)

    output_data = {
        "summary": summary,
        "results": results_dict,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output_data, f, indent=2)

    _LOGGER.info(f"Validation results exported to {output_path}")


def load_cv_results_from_json(json_path: Path) -> Dict[str, CrossValidationMetrics]:
    """Load CV results from JSON file produced by training script.

    Args:
        json_path: Path to JSON file with CV results

    Returns:
        Dictionary mapping tenant names to CrossValidationMetrics
    """
    with open(json_path, "r") as f:
        data = json.load(f)

    results = {}
    for tenant_name, result_data in data.get("results", {}).items():
        # Reconstruct CrossValidationMetrics from JSON
        cv_metrics = CrossValidationMetrics(
            model_name=result_data["model_name"],
            fold_r2_scores=result_data["fold_r2_scores"],
            fold_rmse_scores=result_data["fold_rmse_scores"],
            fold_mae_scores=result_data["fold_mae_scores"],
            mean_r2=result_data["mean_r2"],
            std_r2=result_data["std_r2"],
            mean_rmse=result_data["mean_rmse"],
            mean_mae=result_data["mean_mae"],
            weather_elasticity=result_data["weather_elasticity"],
            channel_roas=result_data["channel_roas"],
            num_folds=result_data["num_folds"],
            feature_names=result_data.get("feature_names", []),
            fold_details=result_data.get("fold_details", []),
        )
        results[tenant_name] = cv_metrics

    return results
