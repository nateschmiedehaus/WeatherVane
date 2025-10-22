"""Unit tests for weather-responsive budget allocation constraints.

Tests cover:
- Forecast feature aggregation across time periods
- Constraint multiplier calculation
- Weather sensitivity integration
- Channel constraint adjustment
- Multi-period forecasting
- Edge cases and error handling
"""

from __future__ import annotations

from datetime import datetime, timedelta, date, timezone
import json
from pathlib import Path

import pytest
import numpy as np

from apps.allocator.marketing_mix import ChannelConstraint
from apps.allocator.weather_constraints import (
    ForecastAggregationPeriod,
    WeatherForecast,
    ForecastWindow,
    ConstraintMultiplier,
    WeatherConstraintScenario,
    WeatherConstraintResult,
    build_weather_constraints,
    apply_forecast_window_constraints,
    _aggregate_forecast_features,
    _calculate_constraint_multipliers,
)
from apps.allocator.weather_aware_allocation import (
    WeatherSensitivityCoefficient,
    WeatherMultiplierConfig,
)
from apps.model.mmm import MMMModel


class TestWeatherForecast:
    """Tests for WeatherForecast and ForecastWindow classes."""

    def test_weather_forecast_creation(self):
        """Test creating a WeatherForecast."""
        now = datetime.now(timezone.utc)
        forecast = WeatherForecast(
            timestamp=now,
            date=now.date(),
            features={"temp_c": 22.5, "precip_mm": 2.0},
        )
        assert forecast.timestamp == now
        assert forecast.features["temp_c"] == 22.5
        assert forecast.confidence == 0.95

    def test_forecast_window_creation(self):
        """Test creating a ForecastWindow."""
        now = datetime.now(timezone.utc)
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 20 + i, "precip_mm": i * 0.5},
            )
            for i in range(5)
        ]

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=5),
            forecasts=forecasts,
            aggregation_period=ForecastAggregationPeriod.DAILY,
        )

        assert len(window.forecasts) == 5
        assert window.aggregation_period == ForecastAggregationPeriod.DAILY

    def test_forecast_window_validation_empty(self):
        """Test that empty forecast window raises error."""
        now = datetime.now(timezone.utc)
        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=1),
            forecasts=[],
        )

        with pytest.raises(ValueError, match="at least one forecast"):
            window.validate()

    def test_forecast_window_validation_invalid_dates(self):
        """Test that invalid date range raises error."""
        now = datetime.now(timezone.utc)
        forecast = WeatherForecast(
            timestamp=now,
            date=now.date(),
            features={"temp_c": 20.0},
        )

        window = ForecastWindow(
            start=now + timedelta(days=5),
            end=now,  # Start > End
            forecasts=[forecast],
        )

        with pytest.raises(ValueError, match="start must be before end"):
            window.validate()


class TestForecastAggregation:
    """Tests for forecast feature aggregation."""

    def test_aggregate_forecast_features_daily(self):
        """Test daily aggregation of forecast features."""
        now = datetime.now(timezone.utc)
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 20.0 + i, "precip_mm": 1.0},
            )
            for i in range(3)
        ]

        aggregated, period_features = _aggregate_forecast_features(
            forecasts, ForecastAggregationPeriod.DAILY
        )

        # Aggregated should be mean across all
        assert aggregated["temp_c"] == pytest.approx(21.0)
        assert aggregated["precip_mm"] == 1.0

        # Should have 3 daily periods
        assert len(period_features) == 3

    def test_aggregate_forecast_features_weekly(self):
        """Test weekly aggregation of forecast features."""
        # Start on a Monday to ensure clean week boundaries
        now = datetime(2025, 10, 20, tzinfo=timezone.utc)  # Monday
        # Create 14 days of forecasts
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 20.0, "precip_mm": float(i % 7)},
            )
            for i in range(14)
        ]

        aggregated, period_features = _aggregate_forecast_features(
            forecasts, ForecastAggregationPeriod.WEEKLY
        )

        # Should have at least 2 weekly periods
        assert len(period_features) >= 2

    def test_aggregate_forecast_features_scenario(self):
        """Test scenario-wide aggregation."""
        now = datetime.now(timezone.utc)
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 20.0 + i},
            )
            for i in range(5)
        ]

        aggregated, period_features = _aggregate_forecast_features(
            forecasts, ForecastAggregationPeriod.SCENARIO
        )

        # Should have 1 scenario period
        assert len(period_features) == 1
        assert "scenario" in period_features


class TestConstraintMultipliers:
    """Tests for constraint multiplier calculation."""

    def test_calculate_constraint_multipliers_no_sensitivity(self):
        """Test that channels with no weather sensitivity get neutral multipliers."""
        # Create mock MMM model
        mock_model = MMMModel(
            features=["spend_search", "spend_social"],
            mean_roas={"spend_search": 2.0, "spend_social": 1.5},
            mean_spend={"spend_search": 1000, "spend_social": 500},
            base_roas=1.5,
            elasticity={},
        )

        sensitivity_scores = {
            "spend_search": WeatherSensitivityCoefficient(
                channel="spend_search",
                base_elasticity=0.5,
                weather_features={},  # No weather sensitivity
                mean_weather_multiplier=0.0,
                sensitivity_score=0.0,
            ),
        }

        aggregated_features = {"temp_c": 22.5}
        period_features = {"scenario": {"temp_c": 22.5}}

        multipliers, period_mults = _calculate_constraint_multipliers(
            mock_model,
            sensitivity_scores,
            aggregated_features,
            period_features,
            WeatherMultiplierConfig(),
        )

        assert "spend_search" in multipliers
        m = multipliers["spend_search"]
        assert m.min_spend_multiplier == 1.0
        assert m.max_spend_multiplier == 1.0
        assert m.current_spend_multiplier == 1.0

    def test_calculate_constraint_multipliers_with_sensitivity(self):
        """Test constraint multipliers with weather sensitivity."""
        mock_model = MMMModel(
            features=["spend_search", "spend_social"],
            mean_roas={"spend_search": 2.0, "spend_social": 1.5},
            mean_spend={"spend_search": 1000, "spend_social": 500},
            base_roas=1.5,
            elasticity={"temp_c": 0.1},
        )

        sensitivity_scores = {
            "spend_search": WeatherSensitivityCoefficient(
                channel="spend_search",
                base_elasticity=0.5,
                weather_features={"temp_c": 0.1},
                mean_weather_multiplier=0.1,
                sensitivity_score=0.5,
            ),
        }

        # Warm day (+5 degrees above baseline)
        aggregated_features = {"temp_c": 5.0}
        period_features = {"scenario": {"temp_c": 5.0}}

        multipliers, _ = _calculate_constraint_multipliers(
            mock_model,
            sensitivity_scores,
            aggregated_features,
            period_features,
            WeatherMultiplierConfig(interaction_strength=0.5),
        )

        m = multipliers["spend_search"]
        # With positive temp anomaly, expect multiplier > 1.0
        assert m.current_spend_multiplier > 1.0

    def test_constraint_multipliers_bounds(self):
        """Test that multipliers respect configured bounds."""
        mock_model = MMMModel(
            features=["spend_search"],
            mean_roas={"spend_search": 2.0},
            mean_spend={"spend_search": 1000},
            base_roas=1.5,
            elasticity={"temp_c": 0.5},
        )

        sensitivity_scores = {
            "spend_search": WeatherSensitivityCoefficient(
                channel="spend_search",
                base_elasticity=0.5,
                weather_features={"temp_c": 0.5},  # High sensitivity
                mean_weather_multiplier=0.5,
                sensitivity_score=0.9,
            ),
        }

        # Extreme weather
        aggregated_features = {"temp_c": 20.0}
        period_features = {"scenario": {"temp_c": 20.0}}

        config = WeatherMultiplierConfig(
            min_multiplier=0.5,
            max_multiplier=1.5,
            interaction_strength=1.0,
        )

        multipliers, _ = _calculate_constraint_multipliers(
            mock_model,
            sensitivity_scores,
            aggregated_features,
            period_features,
            config,
        )

        m = multipliers["spend_search"]
        # Should be clamped at max
        assert m.max_spend_multiplier <= 1.5
        assert m.min_spend_multiplier >= 0.5


class TestBuildWeatherConstraints:
    """Integration tests for constraint building."""

    @pytest.fixture
    def simple_mmm_model(self):
        """Create a simple MMM model for testing."""
        return MMMModel(
            features=["spend_search", "spend_social", "temp_c", "precip_mm"],
            mean_roas={"spend_search": 2.5, "spend_social": 1.8},
            mean_spend={"spend_search": 2000, "spend_social": 1000},
            base_roas=2.0,
            elasticity={
                "spend_search": 0.8,
                "spend_social": 0.6,
                "temp_c": 0.15,
                "precip_mm": -0.2,
            },
        )

    @pytest.fixture
    def sample_forecast_window(self):
        """Create a sample forecast window."""
        now = datetime.now(timezone.utc)
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={
                    "temp_c": 20.0 + (i * 0.5),  # Gradually warming
                    "precip_mm": 2.0 if i % 2 == 0 else 0.5,  # Variable rainfall
                },
                confidence=0.95 - (i * 0.01),  # Declining confidence over time
            )
            for i in range(7)
        ]

        return ForecastWindow(
            start=now,
            end=now + timedelta(days=7),
            forecasts=forecasts,
            aggregation_period=ForecastAggregationPeriod.SCENARIO,
            description="7-day forecast",
        )

    def test_build_weather_constraints_basic(self, simple_mmm_model, sample_forecast_window):
        """Test basic constraint building."""
        channels = [
            ChannelConstraint(
                name="spend_search",
                current_spend=2000.0,
                min_spend=1000.0,
                max_spend=5000.0,
            ),
            ChannelConstraint(
                name="spend_social",
                current_spend=1000.0,
                min_spend=500.0,
                max_spend=2500.0,
            ),
        ]

        scenario = WeatherConstraintScenario(
            mmm_model=simple_mmm_model,
            channels=channels,
            forecast_window=sample_forecast_window,
            multiplier_config=WeatherMultiplierConfig(
                min_multiplier=0.7,
                max_multiplier=1.3,
                interaction_strength=0.5,
            ),
        )

        result = build_weather_constraints(scenario)

        assert len(result.adjusted_channels) == 2
        assert result.confidence_score > 0
        assert result.aggregate_forecast_features["temp_c"] > 20.0
        assert "constraint_multipliers" in result.diagnostics

    def test_build_weather_constraints_negative_weather(self, simple_mmm_model):
        """Test constraints with poor weather (rain, cold)."""
        now = datetime.now(timezone.utc)
        bad_weather_forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={
                    "temp_c": 10.0 - (i * 1.0),  # Getting colder
                    "precip_mm": 5.0 + (i * 0.5),  # Heavy rain
                },
            )
            for i in range(5)
        ]

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=5),
            forecasts=bad_weather_forecasts,
        )

        channels = [
            ChannelConstraint(
                name="spend_search",
                current_spend=2000.0,
                min_spend=1000.0,
                max_spend=5000.0,
            ),
        ]

        scenario = WeatherConstraintScenario(
            mmm_model=simple_mmm_model,
            channels=channels,
            forecast_window=window,
        )

        result = build_weather_constraints(scenario)

        # Should have constraints applied
        assert len(result.adjusted_channels) > 0
        # Bad weather should reduce max_spend more than min_spend
        adjusted = result.adjusted_channels[0]
        assert adjusted.max_spend <= 5000.0  # Bounded

    def test_apply_forecast_window_constraints_multi_period(self, simple_mmm_model):
        """Test multi-period constraint application."""
        now = datetime.now(timezone.utc)
        # Create 14-day forecast (2 weeks)
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={
                    "temp_c": 20.0 if i < 7 else 25.0,  # Week 1: 20°C, Week 2: 25°C
                    "precip_mm": 2.0 if i < 7 else 0.5,  # Week 1: rainy, Week 2: dry
                },
            )
            for i in range(14)
        ]

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=14),
            forecasts=forecasts,
            aggregation_period=ForecastAggregationPeriod.WEEKLY,
        )

        channels = [
            ChannelConstraint(
                name="spend_search",
                current_spend=2000.0,
                min_spend=1000.0,
                max_spend=5000.0,
            ),
            ChannelConstraint(
                name="spend_social",
                current_spend=1000.0,
                min_spend=500.0,
                max_spend=2500.0,
            ),
        ]

        scenario = WeatherConstraintScenario(
            mmm_model=simple_mmm_model,
            channels=channels,
            forecast_window=window,
        )

        result = apply_forecast_window_constraints(channels, scenario)

        # Should have time segments
        assert "time_segments" in result
        assert len(result["time_segments"]) > 1  # Multiple weeks

    def test_constraint_result_diagnostics(self, simple_mmm_model, sample_forecast_window):
        """Test that diagnostics are properly generated."""
        channels = [
            ChannelConstraint(
                name="spend_search",
                current_spend=2000.0,
                min_spend=1000.0,
                max_spend=5000.0,
            ),
        ]

        scenario = WeatherConstraintScenario(
            mmm_model=simple_mmm_model,
            channels=channels,
            forecast_window=sample_forecast_window,
            context_tags=["test", "diagnostics"],
        )

        result = build_weather_constraints(scenario)

        diag = result.diagnostics
        assert "forecast_start" in diag
        assert "forecast_end" in diag
        assert "forecast_count" in diag
        assert diag["forecast_count"] == 7
        assert "aggregated_features" in diag
        assert "constraint_multipliers" in diag


class TestConstraintMultiplierObject:
    """Tests for ConstraintMultiplier dataclass."""

    def test_constraint_multiplier_creation(self):
        """Test creating a ConstraintMultiplier."""
        m = ConstraintMultiplier(
            channel="spend_search",
            min_spend_multiplier=0.8,
            max_spend_multiplier=1.2,
            current_spend_multiplier=1.0,
            confidence=0.9,
            reasoning="Test reason",
            forecast_features_used={"temp_c": 22.5},
        )

        assert m.channel == "spend_search"
        assert m.min_spend_multiplier == 0.8
        assert m.current_spend_multiplier == 1.0


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_weather_features(self):
        """Test handling of forecasts with no weather features."""
        now = datetime.now(timezone.utc)
        forecasts = [
            WeatherForecast(
                timestamp=now,
                date=now.date(),
                features={},  # Empty features
            ),
        ]

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=1),
            forecasts=forecasts,
        )

        aggregated, periods = _aggregate_forecast_features(
            forecasts, ForecastAggregationPeriod.SCENARIO
        )

        assert aggregated == {}
        assert periods == {"scenario": {}}

    def test_single_forecast(self):
        """Test with single forecast in window."""
        now = datetime.now(timezone.utc)
        forecast = WeatherForecast(
            timestamp=now,
            date=now.date(),
            features={"temp_c": 20.0},
        )

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=1),
            forecasts=[forecast],
        )

        assert len(window.forecasts) == 1
        window.validate()  # Should not raise

    def test_very_old_confidence_decline(self):
        """Test confidence decline over long forecast horizon."""
        now = datetime.now(timezone.utc)
        # 30-day forecast with declining confidence
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 20.0},
                confidence=max(0.5, 0.95 - (i * 0.02)),  # Declining over time
            )
            for i in range(30)
        ]

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=30),
            forecasts=forecasts,
        )

        window.validate()
        assert window.forecasts[0].confidence > window.forecasts[29].confidence
