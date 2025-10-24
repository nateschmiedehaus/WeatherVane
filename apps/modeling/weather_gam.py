"""
Weather-aware Generalized Additive Model (GAM) baseline implementation.

This module implements a weather-sensitive GAM model that captures non-linear
weather effects and marketing interactions for revenue prediction.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from pygam import LinearGAM, s, te
from pygam.terms import TermList
import polars as pl

from shared.feature_store.feature_builder import FeatureBuilder
from shared.services.data_quality import validate_data_quality

# Weather feature keywords used to identify weather-related columns
WEATHER_KEYWORDS = {
    "temp", "precip", "humidity", "snow",
    "rain", "wind", "cloud", "pressure"
}

@dataclass
class WeatherGAMModel:
    """Weather-aware GAM model for revenue prediction."""
    features: List[str]
    coefficients: Optional[Dict[str, float]] = None
    gam: Optional[LinearGAM] = None
    base_roas: float = 0.0
    elasticity: Dict[str, float] = field(default_factory=dict)
    mean_roas: Dict[str, float] = field(default_factory=dict)
    mean_spend: Dict[str, float] = field(default_factory=dict)
    source: str = "linear"
    adstock_lags: Optional[Dict[str, int]] = None
    saturation_k: Optional[Dict[str, float]] = None
    saturation_s: Optional[Dict[str, float]] = None

    def _identify_weather_features(self) -> List[str]:
        """Identify weather-related features from feature list."""
        return [f for f in self.features
                if any(kw in f.lower() for kw in WEATHER_KEYWORDS)]

    def _identify_marketing_features(self) -> List[str]:
        """Identify marketing-related features."""
        return [f for f in self.features if "_spend" in f or "_conversions" in f]

    def _check_data_requirements(self, df: pd.DataFrame) -> bool:
        """
        Verify data meets minimum requirements for GAM training.

        Args:
            df: Input dataframe

        Returns:
            bool: True if requirements met, False if should use linear fallback
        """
        min_rows = max(24, 4 * len(self.features))
        if len(df) < min_rows:
            return False

        # Check for numeric features with sufficient variance
        for col in self.features:
            if not pd.api.types.is_numeric_dtype(df[col]):
                return False
            if df[col].nunique() < 2:
                return False

        return True

    def fit(self, df: pd.DataFrame, target: str = "net_revenue") -> None:
        """
        Fit the weather-aware GAM model.

        Args:
            df: Training dataframe with features and target
            target: Name of target column (default: "net_revenue")
        """
        if target not in df.columns:
            raise ValueError(f"Target column '{target}' not found in dataframe")

        # Validate data quality
        validate_data_quality(df)

        # Extract feature matrix
        X = df[self.features].values
        y = df[target].values

        # Determine whether to use GAM or linear fallback
        use_gam = self._check_data_requirements(df)

        if use_gam:
            # Identify weather and marketing features for interactions
            weather_features = self._identify_weather_features()
            marketing_features = self._identify_marketing_features()

            # Build GAM formula with smoothers and interactions
            formula = []
            weather_indices = []
            marketing_indices = []

            for i, feat in enumerate(self.features):
                if feat in weather_features:
                    # Weather features get higher capacity smoothers
                    formula.append(s(i, n_splines=12))
                    weather_indices.append(i)
                elif feat in marketing_features:
                    formula.append(s(i))
                    marketing_indices.append(i)
                else:
                    formula.append(s(i))

            # Add weather-marketing interactions
            terms = []
            terms.extend(formula)  # Add the main effects
            for w_idx in weather_indices:
                for m_idx in marketing_indices:
                    terms.append(te(w_idx, m_idx))

            # Fit GAM with grid search for regularization
            self.gam = LinearGAM(TermList(*terms)).gridsearch(X, y)
            self.source = "gam"

            # Extract feature influence metrics
            y_pred = self.gam.predict(X)
            self.coefficients = {
                feat: abs(np.corrcoef(X[:, i], y_pred)[0, 1])
                for i, feat in enumerate(self.features)
            }

        else:
            # Fallback to linear regression
            self.coefficients, *_ = np.linalg.lstsq(X, y, rcond=None)
            self.coefficients = dict(zip(self.features, self.coefficients))
            self.source = "linear"

        # Calculate ROAS metrics
        spend_cols = [f for f in self.features if "_spend" in f]
        for col in spend_cols:
            spend = df[col].values
            revenue = y

            # Calculate mean ROAS and spend
            total_spend = spend.sum()
            if total_spend > 0:
                self.mean_roas[col] = revenue.sum() / total_spend
                self.mean_spend[col] = total_spend / len(spend)

                # Calculate spend elasticity
                log_spend = np.log1p(spend)
                log_revenue = np.log1p(revenue)
                mask = (spend > 0) & (revenue > 0)
                if mask.any():
                    slope, *_ = np.linalg.lstsq(
                        log_spend[mask].reshape(-1, 1),
                        log_revenue[mask],
                        rcond=None
                    )
                    self.elasticity[col] = slope[0]

        # Calculate base ROAS
        self.base_roas = y.mean() / df[spend_cols].sum(axis=1).mean()

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        """
        Generate predictions from fitted model.

        Args:
            df: DataFrame with feature columns

        Returns:
            numpy.ndarray: Predicted values
        """
        X = df[self.features].values

        if self.source == "gam" and self.gam is not None:
            return self.gam.predict(X)
        else:
            return X @ np.array([self.coefficients[f] for f in self.features])

    def get_feature_importance(self) -> Dict[str, float]:
        """
        Get normalized feature importance scores.

        Returns:
            dict: Feature importance scores
        """
        scores = {f: abs(c) for f, c in self.coefficients.items()}
        total = sum(scores.values())
        return {f: s/total for f, s in scores.items()}

def train_weather_gam(
    tenant_id: str,
    start: datetime,
    end: datetime,
    lake_root: str = "storage/lake/raw",
    output_root: str = "storage/models/baseline"
) -> WeatherGAMModel:
    """
    Train a weather-aware GAM model for a tenant.

    Args:
        tenant_id: Tenant identifier
        start: Training period start date
        end: Training period end date
        lake_root: Root path for feature lake
        output_root: Root path for saving model artifacts

    Returns:
        WeatherGAMModel: Trained model instance
    """
    # Load features using feature builder
    feature_builder = FeatureBuilder(lake_root)
    df = feature_builder.build_features(
        tenant_id=tenant_id,
        start_date=start,
        end_date=end
    )

    # Select relevant features
    features = (
        [c for c in df.columns if "_spend" in c] +  # Marketing spend
        [c for c in df.columns if any(kw in c for kw in WEATHER_KEYWORDS)]  # Weather
    )

    # Initialize and train model
    model = WeatherGAMModel(features=features)
    model.fit(df, target="net_revenue")

    return model