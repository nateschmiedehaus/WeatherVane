"""Integration tests for weather-responsive constraints with MMM and allocator.

Tests verify that weather forecast constraints integrate properly with:
- Trained MMM models
- Marketing mix allocation solver
- Multi-channel budget optimization
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from apps.allocator.marketing_mix import (
    ChannelConstraint,
    MarketingMixScenario,
    solve_marketing_mix,
)
from apps.allocator.weather_constraints import (
    ForecastAggregationPeriod,
    WeatherForecast,
    ForecastWindow,
    WeatherConstraintScenario,
    build_weather_constraints,
    apply_forecast_window_constraints,
)
from apps.allocator.weather_aware_allocation import WeatherMultiplierConfig
from apps.model.train_weather_mmm import train_weather_mmm
from shared.libs.testing.synthetic import SYNTHETIC_ANCHOR_DATE, seed_synthetic_tenant


class TestWeatherConstraintsWithTrainedMMM:
    """Integration tests using trained MMM models."""

    @pytest.fixture
    def trained_mmm(self, tmp_path: Path):
        """Train a weather-aware MMM model for integration testing."""
        lake_root = tmp_path / "lake"
        lake_root.mkdir()
        tenant = "constraints-integration-test"

        # Generate synthetic tenant data
        seed_synthetic_tenant(lake_root, tenant, days=90)

        # Train weather-aware MMM
        start = SYNTHETIC_ANCHOR_DATE - timedelta(days=90)
        end = SYNTHETIC_ANCHOR_DATE

        result = train_weather_mmm(
            tenant,
            start,
            end,
            lake_root=lake_root,
            output_root=tmp_path / "models",
            run_id="constraints-integration",
        )

        return result.model

    def test_constraints_with_trained_model(self, trained_mmm):
        """Test that constraints work with trained MMM model."""
        # Create forecast window
        now = datetime.now(timezone.utc)
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={
                    "temp_c": 20.0 + (i * 0.5),
                    "precip_mm": 2.0 if i % 2 == 0 else 0.5,
                },
            )
            for i in range(7)
        ]

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=7),
            forecasts=forecasts,
            aggregation_period=ForecastAggregationPeriod.SCENARIO,
        )

        # Extract spend channels from trained model
        spend_channels = [f for f in trained_mmm.features if "spend" in f.lower()]
        assert len(spend_channels) > 0, "Should have spend channels"

        # Create channel constraints
        channels = [
            ChannelConstraint(
                name=channel,
                current_spend=trained_mmm.mean_spend.get(channel, 1000.0),
                min_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 0.5,
                max_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 2.0,
            )
            for channel in spend_channels
        ]

        # Build weather constraints
        scenario = WeatherConstraintScenario(
            mmm_model=trained_mmm,
            channels=channels,
            forecast_window=window,
            multiplier_config=WeatherMultiplierConfig(),
        )

        result = build_weather_constraints(scenario)

        # Verify results
        assert len(result.adjusted_channels) == len(channels)
        assert result.confidence_score > 0
        assert "constraint_multipliers" in result.diagnostics

    def test_constraints_affect_allocation(self, trained_mmm):
        """Test that constrained channels produce different allocation results."""
        now = datetime.now(timezone.utc)

        # Good weather forecast
        good_forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 25.0, "precip_mm": 0.0},  # Warm, dry
            )
            for i in range(7)
        ]

        # Bad weather forecast
        bad_forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 5.0, "precip_mm": 5.0},  # Cold, wet
            )
            for i in range(7)
        ]

        good_window = ForecastWindow(
            start=now,
            end=now + timedelta(days=7),
            forecasts=good_forecasts,
        )

        bad_window = ForecastWindow(
            start=now,
            end=now + timedelta(days=7),
            forecasts=bad_forecasts,
        )

        # Base channels
        spend_channels = [f for f in trained_mmm.features if "spend" in f.lower()]
        base_channels = [
            ChannelConstraint(
                name=channel,
                current_spend=trained_mmm.mean_spend.get(channel, 1000.0),
                min_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 0.5,
                max_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 2.0,
            )
            for channel in spend_channels
        ]

        # Build constraints for both scenarios
        good_scenario = WeatherConstraintScenario(
            mmm_model=trained_mmm,
            channels=base_channels,
            forecast_window=good_window,
        )

        bad_scenario = WeatherConstraintScenario(
            mmm_model=trained_mmm,
            channels=base_channels,
            forecast_window=bad_window,
        )

        good_result = build_weather_constraints(good_scenario)
        bad_result = build_weather_constraints(bad_scenario)

        # Verify that constraints differ between scenarios
        good_mults = {m.channel: m.max_spend_multiplier for m in good_result.constrained_channels}
        bad_mults = {m.channel: m.max_spend_multiplier for m in bad_result.constrained_channels}

        # At least one channel should have different multipliers
        differences = [
            abs(good_mults.get(ch, 1.0) - bad_mults.get(ch, 1.0))
            for ch in good_mults.keys()
        ]
        assert max(differences) > 0.01, "Weather scenarios should produce different constraints"

    def test_time_segmented_allocation_planning(self, trained_mmm):
        """Test multi-period allocation planning with forecast constraints."""
        now = datetime.now(timezone.utc)

        # Create 14-day forecast with changing weather
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={
                    "temp_c": 20.0 if i < 7 else 25.0,  # Week 1: cool, Week 2: warm
                    "precip_mm": 3.0 if i < 7 else 1.0,  # Week 1: rainy, Week 2: dry
                },
            )
            for i in range(14)
        ]

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=14),
            forecasts=forecasts,
            aggregation_period=ForecastAggregationPeriod.WEEKLY,
            description="Two-week forecast with weather transition",
        )

        spend_channels = [f for f in trained_mmm.features if "spend" in f.lower()]
        base_channels = [
            ChannelConstraint(
                name=channel,
                current_spend=trained_mmm.mean_spend.get(channel, 1000.0),
                min_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 0.5,
                max_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 2.0,
            )
            for channel in spend_channels
        ]

        scenario = WeatherConstraintScenario(
            mmm_model=trained_mmm,
            channels=base_channels,
            forecast_window=window,
        )

        result = apply_forecast_window_constraints(base_channels, scenario)

        # Should have multiple time segments
        assert "time_segments" in result
        segments = result["time_segments"]
        assert len(segments) >= 2, "Should have multiple weekly segments"

        # Each segment should have different constraints
        for period_key, channels_for_period in segments.items():
            assert len(channels_for_period) == len(base_channels)

    def test_allocation_with_forecast_constraints(self, trained_mmm):
        """Test that allocation respects forecast-derived constraints."""
        now = datetime.now(timezone.utc)

        # Moderate positive forecast
        forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 22.0, "precip_mm": 1.0},
            )
            for i in range(7)
        ]

        window = ForecastWindow(
            start=now,
            end=now + timedelta(days=7),
            forecasts=forecasts,
        )

        spend_channels = [f for f in trained_mmm.features if "spend" in f.lower()]
        base_channels = [
            ChannelConstraint(
                name=channel,
                current_spend=trained_mmm.mean_spend.get(channel, 1000.0),
                min_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 0.5,
                max_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 2.0,
            )
            for channel in spend_channels
        ]

        # Build constraints
        scenario = WeatherConstraintScenario(
            mmm_model=trained_mmm,
            channels=base_channels,
            forecast_window=window,
        )

        constraint_result = build_weather_constraints(scenario)
        constrained_channels = constraint_result.adjusted_channels

        # Use constrained channels for allocation
        total_budget = sum(ch.max_spend for ch in constrained_channels)

        allocation_scenario = MarketingMixScenario(
            mmm_model=trained_mmm,
            channels=constrained_channels,
            total_budget=total_budget * 0.8,  # Use 80% of total capacity
            roas_floor=1.0,
            context_tags=["forecast-constrained"],
        )

        allocation_result = solve_marketing_mix(allocation_scenario)

        # Verify allocation respects constraints
        for channel_name, spend in allocation_result.allocation.spends.items():
            # Find the channel constraint
            constraint = next(
                (c for c in constrained_channels if c.name == channel_name), None
            )
            if constraint:
                assert spend >= constraint.min_spend * 0.95, (
                    f"{channel_name}: spend {spend} below min {constraint.min_spend}"
                )
                assert spend <= constraint.max_spend * 1.05, (
                    f"{channel_name}: spend {spend} above max {constraint.max_spend}"
                )

    def test_constraint_confidence_scores(self, trained_mmm):
        """Test that confidence scores reflect forecast reliability."""
        now = datetime.now(timezone.utc)

        # High confidence forecast (near-term)
        high_conf_forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=i),
                date=(now + timedelta(days=i)).date(),
                features={"temp_c": 20.0},
                confidence=0.95,  # High confidence
            )
            for i in range(3)
        ]

        # Low confidence forecast (far-term)
        low_conf_forecasts = [
            WeatherForecast(
                timestamp=now + timedelta(days=j),
                date=(now + timedelta(days=j)).date(),
                features={"temp_c": 20.0},
                confidence=0.70,  # Lower confidence
            )
            for j in range(3, 10)
        ]

        high_conf_window = ForecastWindow(
            start=now,
            end=now + timedelta(days=3),
            forecasts=high_conf_forecasts,
        )

        low_conf_window = ForecastWindow(
            start=now,
            end=now + timedelta(days=14),
            forecasts=high_conf_forecasts + low_conf_forecasts,
        )

        spend_channels = [f for f in trained_mmm.features if "spend" in f.lower()]
        channels = [
            ChannelConstraint(
                name=channel,
                current_spend=trained_mmm.mean_spend.get(channel, 1000.0),
                min_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 0.5,
                max_spend=trained_mmm.mean_spend.get(channel, 1000.0) * 2.0,
            )
            for channel in spend_channels
        ]

        high_conf_scenario = WeatherConstraintScenario(
            mmm_model=trained_mmm,
            channels=channels,
            forecast_window=high_conf_window,
        )

        low_conf_scenario = WeatherConstraintScenario(
            mmm_model=trained_mmm,
            channels=channels,
            forecast_window=low_conf_window,
        )

        high_result = build_weather_constraints(high_conf_scenario)
        low_result = build_weather_constraints(low_conf_scenario)

        # Higher confidence forecast should produce more confident constraints
        assert high_result.confidence_score >= low_result.confidence_score
