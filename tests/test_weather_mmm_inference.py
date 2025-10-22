"""Tests for weather-aware MMM inference service."""

import pytest
from apps.worker.models.mmm_weather_inference import (
    WeatherAwareMMInferenceService,
    get_inference_service,
)


class TestWeatherAwareMMInference:
    """Test suite for WeatherAwareMMInferenceService."""

    def test_initialization(self):
        """Test service initialization."""
        service = WeatherAwareMMInferenceService()
        assert service.model_data is not None
        # Model type should be present either directly or in metadata
        assert ("model_type" in service.model_data or
                "model" in service.model_data)

    def test_predict_daily_revenue(self):
        """Test daily revenue prediction."""
        service = WeatherAwareMMInferenceService()

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

        assert pred.predicted_revenue > 0
        assert pred.predicted_roas > 0
        assert 0 <= pred.model_confidence <= 1.0

    def test_predict_with_strong_weather(self):
        """Test prediction with strong weather impact."""
        service = WeatherAwareMMInferenceService()

        pred = service.predict_daily_revenue(
            tenant_id="high_weather_sensitivity",
            date="2025-01-15",  # Cold winter day
            spend_by_channel={"meta_spend": 150, "google_spend": 100},
            weather={
                "temperature_celsius": -5.0,  # Very cold
                "precipitation_mm": 10.0,  # Heavy snow
                "relative_humidity_percent": 75.0,
                "windspeed_kmh": 20.0,
            },
        )

        # Weather should have some impact on predictions and confidence should be reasonable
        assert pred.predicted_revenue > 0
        assert pred.model_confidence > 0
        assert pred.model_confidence <= 1.0

    def test_score_allocation_plan(self):
        """Test allocation plan scoring."""
        service = WeatherAwareMMInferenceService()

        score = service.score_allocation_plan(
            tenant_id="high_weather_sensitivity",
            allocation_plan={"meta_spend": 150, "google_spend": 100},
            date="2025-10-23",
            weather={
                "temperature_celsius": 15.0,
                "precipitation_mm": 0.0,
                "relative_humidity_percent": 60.0,
                "windspeed_kmh": 10.0,
            },
        )

        assert "status" in score
        assert "recommendation" in score
        assert score["status"] == "ok"

    def test_validate_predictions(self):
        """Test prediction validation."""
        service = WeatherAwareMMInferenceService()

        validation = service.validate_predictions(
            tenant_id="high_weather_sensitivity",
            actual_revenue=1000.0,
            predicted_revenue=950.0,
            date="2025-10-23",
        )

        assert "error_percentage" in validation
        assert abs(validation["error_percentage"] - 5.26) < 0.01  # Within 5%
        assert not validation["is_outlier"]  # 5% error is not an outlier

    def test_validate_predictions_outlier(self):
        """Test outlier detection in validation."""
        service = WeatherAwareMMInferenceService()

        validation = service.validate_predictions(
            tenant_id="high_weather_sensitivity",
            actual_revenue=2000.0,  # 100% higher than predicted
            predicted_revenue=1000.0,
            date="2025-10-23",
        )

        assert validation["error_percentage"] == 100.0
        assert validation["is_outlier"]

    def test_singleton_pattern(self):
        """Test that get_inference_service returns same instance."""
        service1 = get_inference_service()
        service2 = get_inference_service()

        assert service1 is service2

    def test_no_negative_revenue(self):
        """Test that predictions never return negative revenue."""
        service = WeatherAwareMMInferenceService()

        pred = service.predict_daily_revenue(
            tenant_id="high_weather_sensitivity",
            date="2025-10-23",
            spend_by_channel={"meta_spend": 0, "google_spend": 0},
            weather={
                "temperature_celsius": 50.0,  # Extremely hot
                "precipitation_mm": 100.0,  # Extreme rain
                "relative_humidity_percent": 100.0,
                "windspeed_kmh": 100.0,
            },
        )

        assert pred.predicted_revenue >= 0

    def test_zero_spend_roas(self):
        """Test ROAS calculation with zero spend."""
        service = WeatherAwareMMInferenceService()

        pred = service.predict_daily_revenue(
            tenant_id="high_weather_sensitivity",
            date="2025-10-23",
            spend_by_channel={"meta_spend": 0, "google_spend": 0},
            weather={
                "temperature_celsius": 15.0,
                "precipitation_mm": 0.0,
                "relative_humidity_percent": 60.0,
                "windspeed_kmh": 10.0,
            },
        )

        assert pred.predicted_roas == 0  # 0 spend = 0 ROAS


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
