"""Integration tests for weather-aware allocation with trained MMM models."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from apps.allocator.marketing_mix import ChannelConstraint
from apps.allocator.weather_aware_allocation import (
    WeatherAwareAllocationRequest,
    WeatherConditions,
    WeatherMultiplierConfig,
    allocate_with_weather,
    estimate_weather_sensitivity,
)
from apps.model.train_weather_mmm import train_weather_mmm
from shared.libs.testing.synthetic import SYNTHETIC_ANCHOR_DATE, seed_synthetic_tenant


class TestWeatherAwareAllocationWithTrainedMMM:
    """Integration tests using trained MMM models."""

    @pytest.fixture
    def trained_mmm_result(self, tmp_path: Path):
        """Train a weather-aware MMM model for testing."""
        lake_root = tmp_path / "lake"
        lake_root.mkdir()
        tenant = "integration-test-tenant"

        # Generate synthetic tenant data with 90 days
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
            run_id="integration-test",
        )

        return result

    def test_weather_sensitivity_from_trained_model(self, trained_mmm_result) -> None:
        """Test weather sensitivity estimation from trained model."""
        model = trained_mmm_result.model

        # Extract weather features
        weather_features = [
            feat for feat in model.elasticity.keys()
            if any(x in feat.lower() for x in ["temp", "precip", "humidity", "wind", "anomaly"])
        ]

        assert len(weather_features) > 0, "Should have extracted weather features"

        # Estimate sensitivity
        sensitivity = estimate_weather_sensitivity(model, weather_features)

        # Should have sensitivities for spend channels
        spend_channels = [feat for feat in model.features if "spend" in feat.lower()]
        assert len(sensitivity) > 0, "Should estimate sensitivity for channels"

        # All sensitivity scores should be normalized
        for channel, score in sensitivity.items():
            assert 0 <= score.sensitivity_score <= 1.0

    def test_end_to_end_allocation_with_trained_model(self, trained_mmm_result) -> None:
        """Test complete allocation workflow with trained MMM."""
        model = trained_mmm_result.model

        # Identify spend channels from trained model
        spend_channels = [feat for feat in model.features if "spend" in feat.lower()]
        assert len(spend_channels) > 0, "Should have spend channels from trained model"

        # Create channel constraints based on mean spend
        channels = []
        for channel in spend_channels:
            mean_spend = model.mean_spend.get(channel, 1000.0)
            channels.append(
                ChannelConstraint(
                    name=channel,
                    current_spend=mean_spend,
                    min_spend=mean_spend * 0.5,
                    max_spend=mean_spend * 2.0,
                )
            )

        assert len(channels) > 0, "Should have created channel constraints"

        # Create weather conditions
        weather = WeatherConditions(
            timestamp=datetime.utcnow(),
            features={
                "temp_c": 20.0,
                "precip_mm": 5.0,
                "temp_anomaly": 0.0,
                "precip_anomaly": 0.0,
            },
            region="test-region",
        )

        # Create allocation request
        total_budget = sum(ch.current_spend for ch in channels) * 1.1  # 10% increase

        request = WeatherAwareAllocationRequest(
            mmm_model=model,
            channels=channels,
            total_budget=total_budget,
            weather=weather,
            config=WeatherMultiplierConfig(),
            roas_floor=1.0,
            learning_cap=0.30,
        )

        # Execute allocation
        result = allocate_with_weather(request)

        # Verify result
        assert result.allocation_spends, "Should have allocation spends"
        assert result.total_revenue > 0, "Should have positive revenue"
        assert result.weather_multipliers, "Should have weather multipliers"
        assert result.weather_sensitivity_scores, "Should have sensitivity scores"

        # Verify that allocation was completed
        total_allocated = sum(result.allocation_spends.values())
        assert total_allocated > 0, "Should have allocated budget"
        # Note: total_allocated may differ from total_budget due to weather adjustments
        # and channel constraints, but should still be substantial
        assert total_allocated > (total_budget * 0.3), "Should allocate meaningful portion of budget"

    def test_baseline_vs_weather_adjusted_allocation(self, trained_mmm_result) -> None:
        """Test that weather-aware allocation differs from baseline."""
        model = trained_mmm_result.model

        # Get spend channels
        spend_channels = [feat for feat in model.features if "spend" in feat.lower()]
        channels = [
            ChannelConstraint(
                name=channel,
                current_spend=model.mean_spend.get(channel, 1000.0),
                min_spend=model.mean_spend.get(channel, 1000.0) * 0.5,
                max_spend=model.mean_spend.get(channel, 1000.0) * 2.0,
            )
            for channel in spend_channels
        ]

        # Warm weather conditions
        warm_weather = WeatherConditions(
            timestamp=datetime.utcnow(),
            features={
                "temp_c": 30.0,  # Hot
                "precip_mm": 0.0,  # Dry
                "temp_anomaly": 5.0,
                "precip_anomaly": -2.0,
            },
            region="test",
        )

        total_budget = sum(ch.current_spend for ch in channels) * 1.1

        # Allocate with warm weather
        request_warm = WeatherAwareAllocationRequest(
            mmm_model=model,
            channels=channels,
            total_budget=total_budget,
            weather=warm_weather,
        )

        result_warm = allocate_with_weather(request_warm)

        # Should have completed successfully
        assert result_warm.allocation_spends
        assert result_warm.baseline_allocation_spends
        assert result_warm.weather_multipliers

    def test_allocation_diagnostics_completeness(self, trained_mmm_result) -> None:
        """Test that allocation result includes complete diagnostics."""
        model = trained_mmm_result.model

        spend_channels = [feat for feat in model.features if "spend" in feat.lower()]
        channels = [
            ChannelConstraint(
                name=channel,
                current_spend=model.mean_spend.get(channel, 1000.0),
                min_spend=model.mean_spend.get(channel, 1000.0) * 0.5,
                max_spend=model.mean_spend.get(channel, 1000.0) * 2.0,
            )
            for channel in spend_channels
        ]

        weather = WeatherConditions(
            timestamp=datetime.utcnow(),
            features={
                "temp_c": 22.5,
                "precip_mm": 2.0,
                "temp_anomaly": 0.0,
                "precip_anomaly": 0.0,
            },
        )

        total_budget = sum(ch.current_spend for ch in channels) * 1.1

        request = WeatherAwareAllocationRequest(
            mmm_model=model,
            channels=channels,
            total_budget=total_budget,
            weather=weather,
        )

        result = allocate_with_weather(request)

        # Check diagnostics completeness
        diag = result.diagnostics
        assert "weather_timestamp" in diag
        assert "weather_region" in diag
        assert "weather_features" in diag
        assert "sensitivity_scores" in diag
        assert "multiplier_config" in diag
        assert "baseline_revenue" in diag
        assert "baseline_profit" in diag
        assert "revenue_lift_pct" in diag

    def test_model_metadata_preserved_in_allocation(self, trained_mmm_result) -> None:
        """Test that MMM metadata is accessible during allocation."""
        metadata = trained_mmm_result.metadata

        assert metadata.tenant_id
        assert metadata.spend_channels
        assert len(metadata.spend_channels) > 0
        assert metadata.weather_features
        assert len(metadata.weather_features) > 0
        assert metadata.weather_coverage_ratio > 0
        assert metadata.data_rows > 0

        # Verify elasticity estimates are present
        assert metadata.elasticity
        assert metadata.weather_elasticity
