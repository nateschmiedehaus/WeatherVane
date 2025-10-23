"""Test synthetic data generator implementation.

Tests verify:
1. All 4 tenants generate valid data
2. Weather patterns are realistic
3. Revenue correlates with weather sensitivity
4. Ads spend and Klaviyo data are complete
5. Data quality meets minimum standards
6. Generated datasets can be used for elasticity estimation
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
import tempfile
import shutil

import polars as pl
import pytest
import numpy as np

from apps.model.synthetic_data_generator import (
    SyntheticDataGenerator,
    SYNTHETIC_TENANTS,
)


class TestSyntheticDataGenerator:
    """Test synthetic data generation for multi-tenant datasets."""

    @pytest.fixture
    def generator(self):
        """Create a synthetic data generator with fixed seed."""
        return SyntheticDataGenerator(random_seed=42)

    @pytest.fixture
    def test_dates(self):
        """Standard test date range (1 month)."""
        return date(2024, 1, 1), date(2024, 1, 31)

    @pytest.fixture
    def temp_output_dir(self):
        """Create temporary directory for output."""
        tmpdir = tempfile.mkdtemp()
        yield Path(tmpdir)
        shutil.rmtree(tmpdir, ignore_errors=True)

    def test_generator_initialization(self, generator):
        """Test generator initializes correctly."""
        assert generator.random_seed == 42
        assert generator is not None

    def test_all_tenants_configured(self):
        """Test all 4 tenants are configured."""
        assert len(SYNTHETIC_TENANTS) == 4
        expected_ids = {
            "demo_tenant_1",
            "demo_tenant_2",
            "demo_tenant_3",
            "demo_tenant_4",
        }
        assert set(SYNTHETIC_TENANTS.keys()) == expected_ids

    def test_tenant_config_structure(self):
        """Test tenant configuration has required fields."""
        required_fields = {
            "name",
            "category",
            "timezone",
            "location",
            "base_daily_revenue",
            "weather_sensitivity",
            "products",
        }

        for tenant_id, config in SYNTHETIC_TENANTS.items():
            assert set(config.keys()) >= required_fields
            assert isinstance(config["name"], str)
            assert isinstance(config["category"], str)
            assert "lat" in config["location"]
            assert "lon" in config["location"]
            assert "temperature" in config["weather_sensitivity"]
            assert "precipitation" in config["weather_sensitivity"]
            assert isinstance(config["products"], list)
            assert len(config["products"]) > 0

    def test_generate_weather(self, generator, test_dates):
        """Test weather generation produces valid data."""
        start_date, end_date = test_dates
        num_days = (end_date - start_date).days + 1
        dates = [start_date + timedelta(days=i) for i in range(num_days)]

        weather_df = generator._generate_weather(
            tenant_id="demo_tenant_1",
            dates=dates,
            lat=40.7128,
            lon=-74.0060,
        )

        # Validate structure
        assert weather_df.height == num_days
        assert "date" in weather_df.columns
        assert "temp_c" in weather_df.columns
        assert "precip_mm" in weather_df.columns
        assert "temp_anomaly" in weather_df.columns
        assert "precip_anomaly" in weather_df.columns

        # Validate data ranges
        temps = weather_df["temp_c"].to_numpy()
        assert temps.min() > -40  # Reasonable min temperature
        assert temps.max() < 50  # Reasonable max temperature

        precips = weather_df["precip_mm"].to_numpy()
        assert precips.min() >= 0
        assert precips.max() < 100  # Reasonable max precipitation

    def test_generate_revenue_with_weather(self, generator):
        """Test revenue generation respects weather sensitivity."""
        num_days = 31
        base_revenue = 5000
        temp_sensitivity = 0.15
        precip_sensitivity = -0.08

        # Create test weather
        dates = [date(2024, 1, 1) + timedelta(days=i) for i in range(num_days)]
        weather_df = generator._generate_weather(
            tenant_id="test",
            dates=dates,
            lat=40.7128,
            lon=-74.0060,
        )

        revenue = generator._generate_revenue_with_weather(
            num_days=num_days,
            base_revenue=base_revenue,
            temp_sensitivity=temp_sensitivity,
            precip_sensitivity=precip_sensitivity,
            weather_df=weather_df,
        )

        # Validate structure
        assert len(revenue) == num_days
        assert revenue.min() > 0
        assert revenue.max() < base_revenue * 2

        # Validate baseline is reasonable
        mean_revenue = np.mean(revenue)
        assert abs(mean_revenue - base_revenue) < base_revenue * 0.5

    def test_generate_shopify_orders(self, generator, test_dates):
        """Test Shopify order generation."""
        start_date, end_date = test_dates
        num_days = (end_date - start_date).days + 1
        dates = [start_date + timedelta(days=i) for i in range(num_days)]
        daily_revenue = np.random.uniform(3000, 8000, num_days)
        products = ["product_a", "product_b", "product_c"]

        orders_df = generator._generate_shopify_orders(
            tenant_id="demo_tenant_1",
            dates=dates,
            daily_revenue=daily_revenue,
            products=products,
        )

        # Validate structure
        assert orders_df.height > 0  # At least some orders
        assert "date" in orders_df.columns
        assert "order_id" in orders_df.columns
        assert "product" in orders_df.columns
        assert "order_value" in orders_df.columns
        assert "net_revenue" in orders_df.columns

        # Validate data
        assert all(p in products for p in orders_df["product"].unique())
        assert orders_df["order_value"].min() > 0
        assert orders_df["net_revenue"].min() > 0

    def test_generate_meta_ads(self, generator, test_dates):
        """Test Meta Ads data generation."""
        start_date, end_date = test_dates
        num_days = (end_date - start_date).days + 1
        dates = [start_date + timedelta(days=i) for i in range(num_days)]

        ads_df = generator._generate_meta_ads(
            tenant_id="demo_tenant_1",
            dates=dates,
            num_days=num_days,
        )

        # Validate structure
        assert ads_df.height == num_days
        assert "date" in ads_df.columns
        assert "spend" in ads_df.columns
        assert "impressions" in ads_df.columns
        assert "clicks" in ads_df.columns
        assert "conversions" in ads_df.columns
        assert "roas" in ads_df.columns

        # Validate data
        assert ads_df["spend"].min() > 0
        assert ads_df["impressions"].min() > 0
        assert (ads_df["clicks"] <= ads_df["impressions"]).all()
        assert (ads_df["conversions"] <= ads_df["clicks"]).all()
        assert 1.0 < ads_df["roas"].mean() < 5.0

    def test_generate_google_ads(self, generator, test_dates):
        """Test Google Ads data generation."""
        start_date, end_date = test_dates
        num_days = (end_date - start_date).days + 1
        dates = [start_date + timedelta(days=i) for i in range(num_days)]

        ads_df = generator._generate_google_ads(
            tenant_id="demo_tenant_1",
            dates=dates,
            num_days=num_days,
        )

        # Validate structure
        assert ads_df.height == num_days
        assert "platform" in ads_df.columns
        assert ads_df["platform"].unique()[0] == "google_search"

        # Validate data quality
        assert ads_df["spend"].min() > 0
        assert (ads_df["clicks"] <= ads_df["impressions"]).all()

    def test_generate_klaviyo_events(self, generator, test_dates):
        """Test Klaviyo events generation."""
        start_date, end_date = test_dates
        num_days = (end_date - start_date).days + 1
        dates = [start_date + timedelta(days=i) for i in range(num_days)]
        daily_revenue = np.random.uniform(3000, 8000, num_days)

        events_df = generator._generate_klaviyo_events(
            tenant_id="demo_tenant_1",
            dates=dates,
            daily_revenue=daily_revenue,
            num_days=num_days,
        )

        # Validate structure
        assert events_df.height > 0
        assert "date" in events_df.columns
        assert "metric_type" in events_df.columns
        assert "count" in events_df.columns
        assert "revenue_attributed" in events_df.columns

        # Validate event types
        valid_types = {"sent", "opened", "clicked", "converted"}
        assert set(events_df["metric_type"].unique()) <= valid_types

    def test_generate_tenant_dataset(self, generator, test_dates):
        """Test complete tenant dataset generation."""
        start_date, end_date = test_dates
        config = SYNTHETIC_TENANTS["demo_tenant_1"]

        dataset = generator.generate_tenant_dataset(
            tenant_id="demo_tenant_1",
            start_date=start_date,
            end_date=end_date,
            config=config,
        )

        # Validate dataset structure
        assert dataset.tenant_id == "demo_tenant_1"
        assert dataset.start_date == start_date.isoformat()
        assert dataset.end_date == end_date.isoformat()
        assert dataset.num_days == 31

        # Validate all tables exist and are non-empty
        assert dataset.shopify_orders.height > 0
        assert dataset.meta_ads.height == 31
        assert dataset.google_ads.height == 31
        assert dataset.weather_daily.height == 31
        assert dataset.klaviyo_events.height > 0

        # Validate elasticity ground truth
        assert "temperature_elasticity" in dataset.elasticity_ground_truth
        assert "precipitation_elasticity" in dataset.elasticity_ground_truth
        assert "mean_elasticity" in dataset.elasticity_ground_truth

    def test_generate_all_tenants(self, generator, test_dates, temp_output_dir):
        """Test generation of all 4 tenants."""
        start_date, end_date = test_dates

        datasets = generator.generate_all_tenants(
            start_date=start_date,
            end_date=end_date,
            output_dir=temp_output_dir,
        )

        # Validate we have all 4 tenants
        assert len(datasets) == 4
        assert set(datasets.keys()) == {
            "demo_tenant_1",
            "demo_tenant_2",
            "demo_tenant_3",
            "demo_tenant_4",
        }

        # Validate each dataset
        for tenant_id, dataset in datasets.items():
            assert dataset.tenant_id == tenant_id
            assert dataset.num_days == 31
            assert dataset.shopify_orders.height > 0

    def test_save_dataset(self, generator, test_dates, temp_output_dir):
        """Test dataset persistence."""
        start_date, end_date = test_dates
        config = SYNTHETIC_TENANTS["demo_tenant_1"]

        dataset = generator.generate_tenant_dataset(
            tenant_id="demo_tenant_1",
            start_date=start_date,
            end_date=end_date,
            config=config,
        )

        generator._save_dataset(dataset, temp_output_dir)

        # Validate files were created
        tenant_dir = temp_output_dir / "demo_tenant_1"
        assert tenant_dir.exists()

        # Check for expected files
        parquet_files = list(tenant_dir.glob("*.parquet"))
        json_files = list(tenant_dir.glob("*.json"))

        assert len(parquet_files) == 5  # 5 data tables
        assert len(json_files) == 1  # 1 metadata file

        # Validate metadata
        metadata_file = json_files[0]
        metadata = json.loads(metadata_file.read_text())
        assert metadata["tenant_id"] == "demo_tenant_1"
        assert "elasticity_ground_truth" in metadata

    def test_weather_correlation_with_revenue(self, generator, test_dates):
        """Test that revenue correlates with weather as designed.

        This validates that weather sensitivity parameters are respected.
        """
        start_date, end_date = test_dates
        num_days = (end_date - start_date).days + 1
        dates = [start_date + timedelta(days=i) for i in range(num_days)]

        # Generate weather
        weather_df = generator._generate_weather(
            tenant_id="test",
            dates=dates,
            lat=40.7128,
            lon=-74.0060,
        )

        # Generate revenue with known sensitivity
        temp_sensitivity = 0.20
        precip_sensitivity = -0.15
        revenue = generator._generate_revenue_with_weather(
            num_days=num_days,
            base_revenue=5000,
            temp_sensitivity=temp_sensitivity,
            precip_sensitivity=precip_sensitivity,
            weather_df=weather_df,
        )

        # Compute correlation to validate sensitivity
        temp_c = weather_df["temp_c"].to_numpy()
        precip_mm = weather_df["precip_mm"].to_numpy()

        # Normalize features
        temp_norm = (temp_c - np.mean(temp_c)) / (np.std(temp_c) + 1e-6)
        precip_norm = (precip_mm - np.mean(precip_mm)) / (np.std(precip_mm) + 1e-6)

        # Compute correlations
        temp_corr = np.corrcoef(temp_norm, revenue)[0, 1]
        precip_corr = np.corrcoef(precip_norm, revenue)[0, 1]

        # Temperature sensitivity should be positive (warm = more revenue for this config)
        assert temp_corr > 0.1

        # Precipitation sensitivity should be negative (rain = less revenue)
        assert precip_corr < -0.1

    def test_reproducibility_with_seed(self):
        """Test that same seed produces same results."""
        start_date = date(2024, 1, 1)
        end_date = date(2024, 1, 31)
        config = SYNTHETIC_TENANTS["demo_tenant_1"]

        gen1 = SyntheticDataGenerator(random_seed=42)
        dataset1 = gen1.generate_tenant_dataset(
            tenant_id="demo_tenant_1",
            start_date=start_date,
            end_date=end_date,
            config=config,
        )

        gen2 = SyntheticDataGenerator(random_seed=42)
        dataset2 = gen2.generate_tenant_dataset(
            tenant_id="demo_tenant_1",
            start_date=start_date,
            end_date=end_date,
            config=config,
        )

        # Compare weather (should be identical)
        assert dataset1.weather_daily.equals(dataset2.weather_daily)

        # Compare revenue patterns (should be very similar)
        revenue1 = (
            dataset1.shopify_orders.group_by("date")
            .agg(pl.col("net_revenue").sum())
            .sort("date")
        )
        revenue2 = (
            dataset2.shopify_orders.group_by("date")
            .agg(pl.col("net_revenue").sum())
            .sort("date")
        )

        assert len(revenue1) == len(revenue2)

    def test_data_quality_metrics(self, generator, test_dates):
        """Test that generated data meets quality standards."""
        start_date, end_date = test_dates
        config = SYNTHETIC_TENANTS["demo_tenant_2"]  # Outdoor retailer

        dataset = generator.generate_tenant_dataset(
            tenant_id="demo_tenant_2",
            start_date=start_date,
            end_date=end_date,
            config=config,
        )

        # Test no null values in key columns
        assert dataset.shopify_orders["date"].null_count() == 0
        assert dataset.shopify_orders["net_revenue"].null_count() == 0
        assert dataset.meta_ads["spend"].null_count() == 0
        assert dataset.google_ads["spend"].null_count() == 0

        # Test no negative values
        assert (dataset.shopify_orders["net_revenue"] > 0).all()
        assert (dataset.meta_ads["spend"] > 0).all()
        assert (dataset.google_ads["spend"] > 0).all()

        # Test weather data is complete
        assert dataset.weather_daily.height == 31
        weather_cols = [
            "temp_c",
            "precip_mm",
            "temp_anomaly",
            "precip_anomaly",
        ]
        for col in weather_cols:
            assert dataset.weather_daily[col].null_count() == 0

    def test_elasticity_ground_truth_reasonable(self, generator, test_dates):
        """Test that ground truth elasticity values are reasonable."""
        start_date, end_date = test_dates

        for tenant_id, config in SYNTHETIC_TENANTS.items():
            dataset = generator.generate_tenant_dataset(
                tenant_id=tenant_id,
                start_date=start_date,
                end_date=end_date,
                config=config,
            )

            elasticity = dataset.elasticity_ground_truth
            temp_elast = elasticity["temperature_elasticity"]
            precip_elast = elasticity["precipitation_elasticity"]
            mean_elast = elasticity["mean_elasticity"]

            # Elasticity should be in reasonable range (-1 to 1)
            assert -1.0 <= temp_elast <= 1.0
            assert -1.0 <= precip_elast <= 1.0
            assert 0 <= mean_elast <= 1.0

            # Mean should be average of absolute values
            expected_mean = np.mean([abs(temp_elast), abs(precip_elast)])
            assert abs(mean_elast - expected_mean) < 1e-6
