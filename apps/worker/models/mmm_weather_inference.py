"""Weather-aware MMM inference service for worker pipeline.

This module provides real-time weather-aware MMM inference capabilities
for the Prefect worker, enabling batch and streaming predictions with
weather-driven allocation decisions.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import polars as pl

_LOGGER = logging.getLogger(__name__)

# Paths to model artifacts
EXPERIMENTS_DIR = Path("experiments/mcp")
MMM_MODEL_PATH = EXPERIMENTS_DIR / "mmm_weather_model.json"


@dataclass
class WeatherAwareMMPrediction:
    """Single weather-aware MMM prediction."""

    tenant_id: str
    date: str
    predicted_revenue: float
    predicted_roas: float
    weather_impact_pct: float
    model_confidence: float
    recommended_spend_adjustment: float


@dataclass
class WeatherMMBatchResults:
    """Batch prediction results."""

    tenant_id: str
    prediction_date: str
    predictions_count: int
    avg_predicted_revenue: float
    avg_confidence: float
    weather_impact_summary: Dict[str, float]
    execution_time_ms: float


class WeatherAwareMMInferenceService:
    """Weather-aware MMM inference service for production pipelines."""

    def __init__(self, model_path: Optional[Path] = None):
        """Initialize the inference service.

        Args:
            model_path: Path to trained MMM model artifact
        """
        self.model_path = model_path or MMM_MODEL_PATH
        self.model_data: Optional[Dict[str, Any]] = None
        self._load_model()

    def _load_model(self) -> None:
        """Load MMM model artifact from disk."""
        if not self.model_path.exists():
            _LOGGER.warning(f"Model not found at {self.model_path}. Using mock model.")
            self.model_data = self._create_mock_model()
            return

        try:
            with open(self.model_path) as f:
                self.model_data = json.load(f)
            _LOGGER.info(f"Loaded MMM model from {self.model_path}")
        except Exception as e:
            _LOGGER.error(f"Failed to load model: {e}. Using mock model.")
            self.model_data = self._create_mock_model()

    def _create_mock_model(self) -> Dict[str, Any]:
        """Create mock model for testing."""
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "model_type": "ridge_regression_weather_aware",
            "tenants": {
                "high_weather_sensitivity": {
                    "coefficients": {
                        "meta_spend": 10.5,
                        "google_spend": 47.9,
                        "temperature_celsius": -108.9,
                        "precipitation_mm": 154.7,
                        "relative_humidity_percent": -100.9,
                        "windspeed_kmh": 80.2,
                    },
                    "intercept": 500.0,
                    "r2_score": 0.68,
                }
            },
        }

    def predict_daily_revenue(
        self,
        tenant_id: str,
        date: str,
        spend_by_channel: Dict[str, float],
        weather: Dict[str, float],
    ) -> WeatherAwareMMPrediction:
        """Predict daily revenue for a tenant.

        Args:
            tenant_id: Tenant identifier
            date: Date (YYYY-MM-DD)
            spend_by_channel: Ad spend {channel: amount}
            weather: Weather features {feature: value}

        Returns:
            WeatherAwareMMPrediction with revenue forecast
        """
        if not self.model_data:
            raise RuntimeError("Model not loaded")

        # Get tenant model coefficients
        tenants = self.model_data.get("tenants", {})
        tenant_model = tenants.get(tenant_id, {})

        # Fallback to first tenant if not found
        if not tenant_model and tenants:
            tenant_model = list(tenants.values())[0]

        coef = tenant_model.get("coefficients", {})
        intercept = tenant_model.get("intercept", 500.0)
        r2_score = tenant_model.get("r2_score", 0.60)

        # Compute base prediction (from spend)
        base_prediction = intercept
        for channel, amount in spend_by_channel.items():
            base_prediction += amount * coef.get(channel, 0)

        # Compute weather adjustment
        weather_adjustment = 0.0
        weather_impact_details: Dict[str, float] = {}

        for feature, value in weather.items():
            feature_coef = coef.get(feature, 0)
            contribution = value * feature_coef / 1000  # Scale for percentage
            weather_adjustment += contribution
            weather_impact_details[feature] = contribution

        # Final prediction with weather
        final_prediction = base_prediction * (1 + weather_adjustment)
        final_prediction = max(0, final_prediction)  # No negative revenue

        # Compute ROAS
        total_spend = sum(spend_by_channel.values())
        predicted_roas = (
            final_prediction / total_spend if total_spend > 0 else 0
        )

        # Confidence based on model R² and weather data availability
        base_confidence = min(0.95, 0.5 + r2_score)
        weather_data_completeness = len(weather) / 4.0  # Expect 4 weather features
        confidence = base_confidence * (0.8 + 0.2 * weather_data_completeness)

        # Recommend spend adjustment based on weather
        weather_impact_pct = weather_adjustment * 100
        if weather_impact_pct > 5:
            # Good weather, consider increasing spend
            recommended_adjustment = min(0.20, weather_impact_pct / 100)
        elif weather_impact_pct < -5:
            # Bad weather, consider reducing spend
            recommended_adjustment = max(-0.30, weather_impact_pct / 100 * 2)
        else:
            recommended_adjustment = 0.0

        return WeatherAwareMMPrediction(
            tenant_id=tenant_id,
            date=date,
            predicted_revenue=float(final_prediction),
            predicted_roas=float(predicted_roas),
            weather_impact_pct=float(weather_impact_pct),
            model_confidence=float(confidence),
            recommended_spend_adjustment=float(recommended_adjustment),
        )

    def predict_batch(
        self,
        tenant_id: str,
        df: pl.DataFrame,
        spend_columns: List[str],
        weather_columns: List[str],
    ) -> WeatherMMBatchResults:
        """Predict revenue for a batch of records.

        Args:
            tenant_id: Tenant identifier
            df: DataFrame with spend and weather columns
            spend_columns: Names of spend columns
            weather_columns: Names of weather columns

        Returns:
            WeatherMMBatchResults with batch prediction summary
        """
        start_time = datetime.utcnow()
        predictions: List[WeatherAwareMMPrediction] = []

        for row in df.iter_rows(named=True):
            date = row.get("date", "unknown")
            spend = {col: row.get(col, 0) for col in spend_columns}
            weather = {col: row.get(col, 0) for col in weather_columns}

            try:
                pred = self.predict_daily_revenue(tenant_id, str(date), spend, weather)
                predictions.append(pred)
            except Exception as e:
                _LOGGER.error(f"Failed to predict for {date}: {e}")
                continue

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        # Compute summary statistics
        revenues = [p.predicted_revenue for p in predictions]
        confidences = [p.model_confidence for p in predictions]
        weather_impacts = [p.weather_impact_pct for p in predictions]

        weather_impact_summary = {
            "mean": float(sum(weather_impacts) / len(weather_impacts) if weather_impacts else 0),
            "min": float(min(weather_impacts) if weather_impacts else 0),
            "max": float(max(weather_impacts) if weather_impacts else 0),
        }

        results = WeatherMMBatchResults(
            tenant_id=tenant_id,
            prediction_date=datetime.utcnow().isoformat(),
            predictions_count=len(predictions),
            avg_predicted_revenue=float(sum(revenues) / len(revenues) if revenues else 0),
            avg_confidence=float(sum(confidences) / len(confidences) if confidences else 0),
            weather_impact_summary=weather_impact_summary,
            execution_time_ms=execution_time,
        )

        _LOGGER.info(
            f"Batch prediction complete for {tenant_id}: "
            f"{len(predictions)} predictions in {execution_time:.0f}ms"
        )
        return results

    def score_allocation_plan(
        self,
        tenant_id: str,
        allocation_plan: Dict[str, float],
        date: str,
        weather: Dict[str, float],
    ) -> Dict[str, Any]:
        """Score an allocation plan using weather-aware MMM.

        Args:
            tenant_id: Tenant identifier
            allocation_plan: Proposed allocation {channel: spend}
            date: Date for allocation
            weather: Weather forecast for the date

        Returns:
            Scoring results with confidence and recommendations
        """
        prediction = self.predict_daily_revenue(
            tenant_id=tenant_id,
            date=date,
            spend_by_channel=allocation_plan,
            weather=weather,
        )

        total_spend = sum(allocation_plan.values())
        allocations_pct = {
            channel: (spend / total_spend * 100) if total_spend > 0 else 0
            for channel, spend in allocation_plan.items()
        }

        # Recommendation logic
        recommendation = "APPROVE"
        warnings: List[str] = []

        if prediction.weather_impact_pct < -15:
            warnings.append("Poor weather forecast suggests reducing spend")
            recommendation = "REDUCE"

        if prediction.model_confidence < 0.60:
            warnings.append("Low model confidence - consider manual review")
            recommendation = "REVIEW"

        return {
            "status": "ok",
            "tenant_id": tenant_id,
            "date": date,
            "allocation_plan": allocation_plan,
            "allocation_percentages": allocations_pct,
            "predicted_revenue": prediction.predicted_revenue,
            "predicted_roas": prediction.predicted_roas,
            "weather_impact_pct": prediction.weather_impact_pct,
            "confidence": prediction.model_confidence,
            "recommendation": recommendation,
            "warnings": warnings,
            "recommended_adjustment": prediction.recommended_spend_adjustment,
        }

    def validate_predictions(
        self,
        tenant_id: str,
        actual_revenue: float,
        predicted_revenue: float,
        date: str,
    ) -> Dict[str, Any]:
        """Validate prediction accuracy after actual data is available.

        Args:
            tenant_id: Tenant identifier
            actual_revenue: Actual revenue achieved
            predicted_revenue: Predicted revenue from model
            date: Date of prediction

        Returns:
            Validation metrics and diagnostics
        """
        if predicted_revenue == 0:
            error_pct = 0
        else:
            error_pct = abs(actual_revenue - predicted_revenue) / predicted_revenue * 100

        is_outlier = error_pct > 25  # Flag as outlier if >25% error

        return {
            "tenant_id": tenant_id,
            "date": date,
            "predicted_revenue": predicted_revenue,
            "actual_revenue": actual_revenue,
            "absolute_error": actual_revenue - predicted_revenue,
            "error_percentage": error_pct,
            "is_outlier": is_outlier,
            "validation_timestamp": datetime.utcnow().isoformat(),
        }


# Singleton instance
_inference_service: Optional[WeatherAwareMMInferenceService] = None


def get_inference_service(
    model_path: Optional[Path] = None,
) -> WeatherAwareMMInferenceService:
    """Get or create the inference service."""
    global _inference_service
    if _inference_service is None:
        _inference_service = WeatherAwareMMInferenceService(model_path)
    return _inference_service


# Prefect task wrapper
def predict_revenue_task(
    tenant_id: str,
    date: str,
    spend: Dict[str, float],
    weather: Dict[str, float],
) -> Dict[str, Any]:
    """Prefect task for weather-aware revenue prediction.

    Can be used as:
    ```python
    from prefect import flow, task
    from apps.worker.models.mmm_weather_inference import predict_revenue_task

    @flow
    def allocation_flow():
        result = predict_revenue_task(
            tenant_id="high_weather_sensitivity",
            date="2025-10-23",
            spend={"meta_spend": 150, "google_spend": 100},
            weather={"temperature_celsius": 15, "precipitation_mm": 0}
        )
    ```
    """
    service = get_inference_service()
    prediction = service.predict_daily_revenue(tenant_id, date, spend, weather)
    return asdict(prediction)


if __name__ == "__main__":
    # Demo usage
    logging.basicConfig(level=logging.INFO)

    service = WeatherAwareMMInferenceService()

    # Test prediction
    pred = service.predict_daily_revenue(
        tenant_id="high_weather_sensitivity",
        date="2025-10-23",
        spend_by_channel={"meta_spend": 150, "google_spend": 100},
        weather={
            "temperature_celsius": 15.0,
            "precipitation_mm": 0.0,
            "relative_humidity_percent": 60.0,
            "windspeed_kmh": 10.0,
        },
    )

    print(f"Prediction: ${pred.predicted_revenue:.0f}")
    print(f"Confidence: {pred.model_confidence:.2%}")
    print(f"Weather Impact: {pred.weather_impact_pct:.1f}%")
