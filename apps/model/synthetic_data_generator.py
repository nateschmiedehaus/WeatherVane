"""Generate synthetic multi-tenant dataset with weather-sensitive products and demand patterns.

This module creates realistic synthetic data for 4 simulated tenants with:
1. Shopify products with varying weather sensitivity
2. Meta and Google Ads spend patterns
3. Klaviyo email engagement and revenue attribution
4. Weather-driven demand elasticity
5. Realistic seasonal and day-of-week patterns

The synthetic data is designed to validate weather elasticity estimation models
and test allocation algorithms with known ground truth weather sensitivity.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import polars as pl

_LOGGER = logging.getLogger(__name__)

# Synthetic tenant configurations
SYNTHETIC_TENANTS = {
    "demo_tenant_1": {
        "name": "Seasonal Fashion Retailer",
        "category": "apparel",
        "timezone": "America/New_York",
        "location": {"lat": 40.7128, "lon": -74.0060},
        "base_daily_revenue": 5000,
        "weather_sensitivity": {
            "temperature": 0.15,  # Cold -> increase demand for winter wear
            "precipitation": -0.08,  # Rain -> suppress outdoor activity wear
        },
        "products": ["winter_coats", "summer_dresses", "rain_gear"],
    },
    "demo_tenant_2": {
        "name": "Outdoor Recreation Gear",
        "category": "outdoor",
        "timezone": "America/Los_Angeles",
        "location": {"lat": 37.7749, "lon": -122.4194},
        "base_daily_revenue": 8000,
        "weather_sensitivity": {
            "temperature": 0.12,  # Clear/nice weather increases demand
            "precipitation": -0.18,  # Rain strongly suppresses outdoor purchases
        },
        "products": ["hiking_boots", "camping_gear", "bicycles"],
    },
    "demo_tenant_3": {
        "name": "Home & Garden",
        "category": "home_garden",
        "timezone": "America/Chicago",
        "location": {"lat": 41.8781, "lon": -87.6298},
        "base_daily_revenue": 4500,
        "weather_sensitivity": {
            "temperature": 0.10,  # Spring/fall gardening season
            "precipitation": 0.06,  # Rain encourages indoor projects, irrigation needs
        },
        "products": ["seeds", "tools", "fertilizer"],
    },
    "demo_tenant_4": {
        "name": "Coffee & Beverage Shop",
        "category": "food_beverage",
        "timezone": "America/Denver",
        "location": {"lat": 39.7392, "lon": -104.9903},
        "base_daily_revenue": 3500,
        "weather_sensitivity": {
            "temperature": -0.20,  # Hot weather suppresses hot coffee demand
            "precipitation": 0.09,  # Rain drives people indoors to cafes
        },
        "products": ["coffee", "tea", "pastries"],
    },
}


@dataclass(frozen=True)
class SyntheticTenant:
    """Synthetic tenant metadata."""

    tenant_id: str
    name: str
    category: str
    timezone: str
    latitude: float
    longitude: float
    base_daily_revenue: float
    temperature_sensitivity: float
    precipitation_sensitivity: float
    products: List[str]


@dataclass(frozen=True)
class SyntheticDataset:
    """Generated synthetic dataset for a tenant."""

    tenant_id: str
    start_date: str
    end_date: str
    num_days: int
    shopify_orders: pl.DataFrame
    meta_ads: pl.DataFrame
    google_ads: pl.DataFrame
    weather_daily: pl.DataFrame
    klaviyo_events: pl.DataFrame
    elasticity_ground_truth: Dict[str, float]


class SyntheticDataGenerator:
    """Generate realistic synthetic datasets with weather-sensitive demand patterns."""

    def __init__(self, random_seed: int = 42):
        """Initialize synthetic data generator.

        Args:
            random_seed: Random seed for reproducibility
        """
        self.random_seed = random_seed
        np.random.seed(random_seed)

    def generate_all_tenants(
        self,
        start_date: date | str = date(2024, 1, 1),
        end_date: date | str = date(2024, 12, 31),
        output_dir: Path | str = Path("storage/lake/raw"),
    ) -> Dict[str, SyntheticDataset]:
        """Generate synthetic datasets for all 4 tenants.

        Args:
            start_date: Training window start date
            end_date: Training window end date
            output_dir: Root directory for storing generated data

        Returns:
            Dictionary of tenant_id -> SyntheticDataset
        """
        if isinstance(start_date, str):
            start_date = datetime.fromisoformat(start_date).date()
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date).date()

        output_dir = Path(output_dir)
        datasets = {}

        for tenant_id, config in SYNTHETIC_TENANTS.items():
            _LOGGER.info(f"Generating synthetic data for {tenant_id}...")
            dataset = self.generate_tenant_dataset(
                tenant_id=tenant_id,
                start_date=start_date,
                end_date=end_date,
                config=config,
            )
            datasets[tenant_id] = dataset

            # Save to data lake
            self._save_dataset(dataset, output_dir)

        _LOGGER.info(f"Generated synthetic data for {len(datasets)} tenants")
        return datasets

    def generate_tenant_dataset(
        self,
        tenant_id: str,
        start_date: date,
        end_date: date,
        config: Dict[str, Any],
    ) -> SyntheticDataset:
        """Generate complete synthetic dataset for a single tenant.

        Args:
            tenant_id: Tenant identifier
            start_date: Training window start
            end_date: Training window end
            config: Tenant configuration dictionary

        Returns:
            SyntheticDataset with all data tables
        """
        num_days = (end_date - start_date).days + 1
        dates = [start_date + timedelta(days=i) for i in range(num_days)]

        # Generate weather patterns (use tenant location)
        weather_daily = self._generate_weather(
            tenant_id,
            dates,
            lat=config["location"]["lat"],
            lon=config["location"]["lon"],
        )

        # Generate revenue driven by weather
        base_revenue = config["base_daily_revenue"]
        temp_sensitivity = config["weather_sensitivity"]["temperature"]
        precip_sensitivity = config["weather_sensitivity"]["precipitation"]

        daily_revenue = self._generate_revenue_with_weather(
            num_days=num_days,
            base_revenue=base_revenue,
            temp_sensitivity=temp_sensitivity,
            precip_sensitivity=precip_sensitivity,
            weather_df=weather_daily,
        )

        # Generate Shopify orders
        shopify_orders = self._generate_shopify_orders(
            tenant_id=tenant_id,
            dates=dates,
            daily_revenue=daily_revenue,
            products=config["products"],
        )

        # Generate Meta and Google Ads spend
        meta_ads = self._generate_meta_ads(
            tenant_id=tenant_id,
            dates=dates,
            num_days=num_days,
        )

        google_ads = self._generate_google_ads(
            tenant_id=tenant_id,
            dates=dates,
            num_days=num_days,
        )

        # Generate Klaviyo events
        klaviyo_events = self._generate_klaviyo_events(
            tenant_id=tenant_id,
            dates=dates,
            daily_revenue=daily_revenue,
            num_days=num_days,
        )

        # Compute ground truth elasticity
        elasticity_truth = {
            "temperature_elasticity": float(temp_sensitivity),
            "precipitation_elasticity": float(precip_sensitivity),
            "mean_elasticity": float(
                np.mean([abs(temp_sensitivity), abs(precip_sensitivity)])
            ),
        }

        return SyntheticDataset(
            tenant_id=tenant_id,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            num_days=num_days,
            shopify_orders=shopify_orders,
            meta_ads=meta_ads,
            google_ads=google_ads,
            weather_daily=weather_daily,
            klaviyo_events=klaviyo_events,
            elasticity_ground_truth=elasticity_truth,
        )

    def _generate_weather(
        self, tenant_id: str, dates: List[date], lat: float, lon: float
    ) -> pl.DataFrame:
        """Generate realistic weather data for tenant location.

        Args:
            tenant_id: Tenant identifier
            dates: List of dates
            lat: Latitude
            lon: Longitude

        Returns:
            DataFrame with daily weather features
        """
        num_days = len(dates)

        # Temperature: seasonal pattern + noise
        day_of_year = np.array([d.timetuple().tm_yday for d in dates])
        base_temp = 15 + 10 * np.sin(2 * np.pi * day_of_year / 365)
        temp_noise = np.random.normal(0, 2, num_days)
        temp_c = base_temp + temp_noise

        # Precipitation: random events
        precip_mm = np.zeros(num_days)
        rain_days = np.random.choice(num_days, size=max(1, num_days // 5), replace=False)
        for idx in rain_days:
            precip_mm[idx] = np.random.gamma(shape=2, scale=5)

        # Compute rolling averages and anomalies
        temp_series = pl.Series(temp_c)
        precip_series = pl.Series(precip_mm)

        temp_roll7 = (
            temp_series.rolling_mean(window_size=7, min_samples=1).to_list()
        )
        precip_roll7 = (
            precip_series.rolling_mean(window_size=7, min_samples=1).to_list()
        )

        temp_anomaly = temp_c - np.array(temp_roll7)
        precip_anomaly = precip_mm - np.array(precip_roll7)

        return pl.DataFrame(
            {
                "date": dates,
                "temp_c": temp_c,
                "precip_mm": precip_mm,
                "temp_roll7": temp_roll7,
                "precip_roll7": precip_roll7,
                "temp_anomaly": temp_anomaly,
                "precip_anomaly": precip_anomaly,
            }
        )

    def _generate_revenue_with_weather(
        self,
        num_days: int,
        base_revenue: float,
        temp_sensitivity: float,
        precip_sensitivity: float,
        weather_df: pl.DataFrame,
    ) -> np.ndarray:
        """Generate daily revenue driven by weather patterns.

        Args:
            num_days: Number of days
            base_revenue: Baseline daily revenue
            temp_sensitivity: Temperature elasticity
            precip_sensitivity: Precipitation elasticity
            weather_df: Weather DataFrame

        Returns:
            Array of daily revenue values
        """
        # Extract weather data
        temp = weather_df["temp_c"].to_numpy()
        precip = weather_df["precip_mm"].to_numpy()

        # Weather-driven elasticity multiplier
        # Normalize temp to 0-1 range, precip similarly
        temp_norm = (temp - np.mean(temp)) / (np.std(temp) + 1e-6)
        precip_norm = (precip - np.mean(precip)) / (np.std(precip) + 1e-6)

        weather_multiplier = 1.0 + (
            temp_sensitivity * temp_norm + precip_sensitivity * precip_norm
        )
        weather_multiplier = np.clip(weather_multiplier, 0.5, 1.5)

        # Add day-of-week effect (weekends stronger)
        day_effect = np.array([1.1 if d.weekday() >= 4 else 0.95 for d in weather_df["date"]])

        # Add noise
        noise = np.random.normal(1.0, 0.1, num_days)

        # Combine
        daily_revenue = base_revenue * weather_multiplier * day_effect * noise
        return np.maximum(daily_revenue, 100)  # Ensure positive revenue

    def _generate_shopify_orders(
        self,
        tenant_id: str,
        dates: List[date],
        daily_revenue: np.ndarray,
        products: List[str],
    ) -> pl.DataFrame:
        """Generate Shopify order data.

        Args:
            tenant_id: Tenant identifier
            dates: List of dates
            daily_revenue: Daily revenue array
            products: List of product names

        Returns:
            DataFrame with Shopify orders
        """
        num_days = len(dates)
        orders = []

        for day_idx, (current_date, revenue) in enumerate(zip(dates, daily_revenue)):
            # Average order value
            avg_order_value = 75
            num_orders = int(revenue / avg_order_value) + np.random.randint(0, 5)

            for order_idx in range(num_orders):
                order_time = current_date + timedelta(
                    hours=np.random.randint(0, 24),
                    minutes=np.random.randint(0, 60),
                )
                product = np.random.choice(products)
                order_value = np.random.normal(avg_order_value, 20)

                orders.append({
                    "date": current_date.isoformat(),
                    "timestamp": order_time.isoformat(),
                    "order_id": f"{tenant_id}_{day_idx:03d}_{order_idx:04d}",
                    "product": product,
                    "quantity": max(1, np.random.poisson(1.5)),
                    "order_value": max(10, order_value),
                    "net_revenue": max(5, order_value * 0.85),  # Account for refunds
                })

        return pl.DataFrame(orders) if orders else pl.DataFrame(schema={
            "date": pl.Date,
            "timestamp": pl.Utf8,
            "order_id": pl.Utf8,
            "product": pl.Utf8,
            "quantity": pl.Int64,
            "order_value": pl.Float64,
            "net_revenue": pl.Float64,
        })

    def _generate_meta_ads(
        self,
        tenant_id: str,
        dates: List[date],
        num_days: int,
    ) -> pl.DataFrame:
        """Generate Meta (Facebook/Instagram) Ads spend data.

        Args:
            tenant_id: Tenant identifier
            dates: List of dates
            num_days: Number of days

        Returns:
            DataFrame with Meta Ads metrics
        """
        daily_spend = np.random.uniform(300, 800, num_days)
        ctr = np.random.uniform(0.8, 2.5, num_days) / 100  # 0.8-2.5% CTR
        impressions = daily_spend / (0.50 * (ctr + 0.01))  # ~$0.50 per 1k impressions
        clicks = impressions * ctr
        conversions = clicks * np.random.uniform(0.01, 0.08, num_days)

        return pl.DataFrame({
            "date": dates,
            "campaign_id": [f"{tenant_id}_meta_{i}" for i in range(num_days)],
            "platform": ["facebook"] * num_days,
            "spend": daily_spend,
            "impressions": impressions,
            "clicks": clicks,
            "conversions": conversions,
            "roas": np.random.uniform(1.5, 3.5, num_days),
        })

    def _generate_google_ads(
        self,
        tenant_id: str,
        dates: List[date],
        num_days: int,
    ) -> pl.DataFrame:
        """Generate Google Ads spend data.

        Args:
            tenant_id: Tenant identifier
            dates: List of dates
            num_days: Number of days

        Returns:
            DataFrame with Google Ads metrics
        """
        daily_spend = np.random.uniform(200, 600, num_days)
        ctr = np.random.uniform(1.5, 4.5, num_days) / 100  # 1.5-4.5% CTR
        impressions = daily_spend / (0.75 * (ctr + 0.01))  # ~$0.75 per 1k impressions
        clicks = impressions * ctr
        conversions = clicks * np.random.uniform(0.02, 0.12, num_days)

        return pl.DataFrame({
            "date": dates,
            "campaign_id": [f"{tenant_id}_google_{i}" for i in range(num_days)],
            "platform": ["google_search"] * num_days,
            "spend": daily_spend,
            "impressions": impressions,
            "clicks": clicks,
            "conversions": conversions,
            "roas": np.random.uniform(2.0, 4.0, num_days),
        })

    def _generate_klaviyo_events(
        self,
        tenant_id: str,
        dates: List[date],
        daily_revenue: np.ndarray,
        num_days: int,
    ) -> pl.DataFrame:
        """Generate Klaviyo email engagement events.

        Args:
            tenant_id: Tenant identifier
            dates: List of dates
            daily_revenue: Daily revenue array
            num_days: Number of days

        Returns:
            DataFrame with Klaviyo events
        """
        events = []

        for day_idx, (current_date, revenue) in enumerate(zip(dates, daily_revenue)):
            # Daily sends (3-5 emails per day on average)
            num_sends = np.random.poisson(4)
            num_opens = int(num_sends * np.random.uniform(0.20, 0.45))
            num_clicks = int(num_opens * np.random.uniform(0.10, 0.25))
            num_conversions = int(num_clicks * np.random.uniform(0.05, 0.15))
            conversion_value = revenue * 0.2 if num_conversions > 0 else 0

            events.append({
                "date": current_date.isoformat(),
                "metric_type": "sent",
                "count": num_sends,
                "revenue_attributed": 0,
            })

            if num_opens > 0:
                events.append({
                    "date": current_date.isoformat(),
                    "metric_type": "opened",
                    "count": num_opens,
                    "revenue_attributed": 0,
                })

            if num_clicks > 0:
                events.append({
                    "date": current_date.isoformat(),
                    "metric_type": "clicked",
                    "count": num_clicks,
                    "revenue_attributed": 0,
                })

            if num_conversions > 0:
                events.append({
                    "date": current_date.isoformat(),
                    "metric_type": "converted",
                    "count": num_conversions,
                    "revenue_attributed": conversion_value,
                })

        return pl.DataFrame(events) if events else pl.DataFrame(schema={
            "date": pl.Utf8,
            "metric_type": pl.Utf8,
            "count": pl.Int64,
            "revenue_attributed": pl.Float64,
        })

    def _save_dataset(self, dataset: SyntheticDataset, output_dir: Path) -> None:
        """Save synthetic dataset to data lake directory structure.

        Args:
            dataset: SyntheticDataset to save
            output_dir: Root data lake directory
        """
        tenant_dir = output_dir / dataset.tenant_id
        tenant_dir.mkdir(parents=True, exist_ok=True)

        # Save as Parquet for efficient storage
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

        dataset.shopify_orders.write_parquet(
            tenant_dir / f"shopify_orders_{timestamp}.parquet"
        )
        dataset.meta_ads.write_parquet(tenant_dir / f"meta_ads_{timestamp}.parquet")
        dataset.google_ads.write_parquet(tenant_dir / f"google_ads_{timestamp}.parquet")
        dataset.weather_daily.write_parquet(
            tenant_dir / f"weather_daily_{timestamp}.parquet"
        )
        dataset.klaviyo_events.write_parquet(
            tenant_dir / f"klaviyo_events_{timestamp}.parquet"
        )

        # Save metadata and ground truth
        metadata = {
            "tenant_id": dataset.tenant_id,
            "start_date": dataset.start_date,
            "end_date": dataset.end_date,
            "num_days": dataset.num_days,
            "elasticity_ground_truth": dataset.elasticity_ground_truth,
            "generated_at": timestamp,
        }

        (tenant_dir / f"metadata_{timestamp}.json").write_text(
            json.dumps(metadata, indent=2)
        )

        _LOGGER.info(f"Saved synthetic data for {dataset.tenant_id} to {tenant_dir}")
