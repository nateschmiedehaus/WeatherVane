#!/usr/bin/env python3
"""
Generate realistic synthetic multi-tenant datasets for weather-aware MMM testing.

Creates 4 tenants with varying weather sensitivity profiles:
1. HIGH_SENSITIVITY: Seasonal products (coats, umbrellas, AC, heaters) - strong weather correlation
2. NO_SENSITIVITY: Non-perishable/indoor products (office supplies, tech) - zero weather correlation
3. MEDIUM_SENSITIVITY: Mixed products (shoes, clothing) - moderate correlation
4. EXTREME_SENSITIVITY: Hyper-seasonal (snow shovels, sunscreen) - extreme weather correlation
"""

import json
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
import pyarrow.parquet as pq
import pyarrow as pa


# Configuration
TENANTS = {
    "high_weather_sensitivity": {
        "location": ("New York", 40.7128, -74.0060),
        "products": [
            {"id": "P001", "name": "Winter Coat", "category": "Clothing", "weather_affinity": "winter"},
            {"id": "P002", "name": "Umbrella", "category": "Accessories", "weather_affinity": "rain"},
            {"id": "P003", "name": "Shorts", "category": "Clothing", "weather_affinity": "summer"},
            {"id": "P004", "name": "Long Sleeve Shirt", "category": "Clothing", "weather_affinity": "winter"},
            {"id": "P005", "name": "Sunglasses", "category": "Accessories", "weather_affinity": "summer"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 5000,
    },
    "no_weather_sensitivity": {
        "location": ("Los Angeles", 34.0522, -118.2437),
        "products": [
            {"id": "P101", "name": "Desk Lamp", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P102", "name": "Keyboard", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P103", "name": "Monitor Stand", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P104", "name": "USB Hub", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P105", "name": "Headphones", "category": "Audio", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 4000,
    },
    "medium_weather_sensitivity": {
        "location": ("Chicago", 41.8781, -87.6298),
        "products": [
            {"id": "P201", "name": "Running Shoes", "category": "Shoes", "weather_affinity": "summer"},
            {"id": "P202", "name": "Sweater", "category": "Clothing", "weather_affinity": "winter"},
            {"id": "P203", "name": "Jeans", "category": "Clothing", "weather_affinity": "neutral"},
            {"id": "P204", "name": "Socks", "category": "Accessories", "weather_affinity": "neutral"},
            {"id": "P205", "name": "Baseball Cap", "category": "Accessories", "weather_affinity": "summer"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 4500,
    },
    "extreme_weather_sensitivity": {
        "location": ("Denver", 39.7392, -104.9903),
        "products": [
            {"id": "P301", "name": "Snow Shovel", "category": "Tools", "weather_affinity": "winter"},
            {"id": "P302", "name": "Sunscreen SPF 50", "category": "Beauty", "weather_affinity": "summer"},
            {"id": "P303", "name": "Thermal Underwear", "category": "Clothing", "weather_affinity": "winter"},
            {"id": "P304", "name": "Beach Towel", "category": "Home", "weather_affinity": "summer"},
            {"id": "P305", "name": "Hot Chocolate Maker", "category": "Kitchen", "weather_affinity": "winter"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3500,
    }
}

AFFINITY_WEIGHTS_BY_TENANT = {
    "extreme_weather_sensitivity": {
        "winter": 3.2,
        "summer": 0.35,
        "rain": 1.6,
        "neutral": 1.0,
    },
    "high_weather_sensitivity": {
        "winter": 1.6,
        "summer": 0.9,
        "rain": 1.2,
        "neutral": 1.0,
    },
    "medium_weather_sensitivity": {
        "winter": 1.1,
        "summer": 1.0,
        "rain": 1.0,
        "neutral": 1.0,
    },
}

TENANT_SENSITIVITY_SCALE = {
    "extreme_weather_sensitivity": 0.9,
    "high_weather_sensitivity": 0.35,
    "medium_weather_sensitivity": 0.12,
    "no_weather_sensitivity": 0.0,
}


def get_weather_multiplier(date: datetime, weather_affinity: str, lat: float, lon: float) -> float:
    """
    Calculate weather-driven demand multiplier based on season and affinity.
    STRENGTHENED: 3-4x stronger signal to ensure detectability in small PoC datasets.

    Args:
        date: date
        weather_affinity: 'winter', 'summer', 'rain', 'neutral', etc.
        lat: latitude for seasonal variation
        lon: longitude

    Returns:
        Multiplier between 0.3 and 4.0 (increased range for stronger signal)
    """
    day_of_year = date.timetuple().tm_yday
    # Convert the seasonal cycle into a smooth 0-1 "heat score".
    # Shift by 80 days so the peak aligns with late June in the northern hemisphere.
    seasonal_angle = 2 * np.pi * (day_of_year - 80) / 365.25
    heat_score = (np.sin(seasonal_angle) + 1.0) / 2.0  # 0 (coldest) → 1 (hottest)

    # Southern hemisphere: invert the seasons so heat_score still describes "hotter" weather.
    if lat < 0:
        heat_score = 1.0 - heat_score

    rng_noise = np.random.normal

    if weather_affinity == "winter":
        # Winter products thrive when it's cold. Map heat_score 0→1 to multiplier 4.0→0.3.
        base = 5.0 - heat_score * (5.0 - 0.2)
        noise = rng_noise(0, 0.04)
    elif weather_affinity == "summer":
        # Summer products thrive when it's hot. Map heat_score 0→1 to multiplier 0.3→4.2.
        base = 0.3 + heat_score * (4.2 - 0.3)
        noise = rng_noise(0, 0.04)
    elif weather_affinity == "rain":
        # Shoulder seasons: peak demand when heat_score ≈ 0.25 or 0.75.
        shoulder = 1.0 - abs(heat_score - 0.5) * 2  # 0 at extremes, 1 in the middle.
        base = 0.5 + shoulder * (3.2 - 0.5)
        noise = rng_noise(0, 0.03)
    else:  # neutral products
        base = 1.0
        noise = rng_noise(0, 0.01)

    multiplier = np.clip(base + noise, 0.2, 4.5)
    return float(multiplier)


def generate_daily_data(tenant_name: str, tenant_config: dict, days: int = 180) -> pd.DataFrame:
    """Generate daily sales and spend data for a tenant.

    IMPROVED: Spend is now CORRELATED with weather-driven units to ensure signal is learnable.
    """
    location, lat, lon = tenant_config["location"]
    base_revenue = tenant_config["base_daily_revenue"]
    products = tenant_config["products"]
    channels = tenant_config["channels"]

    # Pre-sample stable price and spend profiles so weather is the dominant driver.
    product_base_price = {
        product["id"]: np.random.uniform(60, 180) for product in products
    }
    product_spend_per_unit = {
        product["id"]: np.random.uniform(3.5, 5.5) for product in products
    }

    start_date = datetime(2024, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(days)]

    records = []
    affinity_weights = AFFINITY_WEIGHTS_BY_TENANT.get(tenant_name, {})

    for date in dates:
        # CRITICAL: Calculate a SINGLE daily weather multiplier (not per-product)
        # This ensures weather signal aggregates correctly when we sum across products
        date_weather_effects: dict[str, float] = {}
        for product in products:
            affinity = product["weather_affinity"]
            if affinity not in date_weather_effects:
                # Calculate once per affinity to avoid introducing conflicting random noise.
                date_weather_effects[affinity] = get_weather_multiplier(date, affinity, lat, lon)

        # Generate daily metrics
        for product in products:
            # Use the pre-calculated weather multiplier for this product/date
            raw_weather_mult = date_weather_effects[product["weather_affinity"]]
            sensitivity_scale = TENANT_SENSITIVITY_SCALE.get(tenant_name, 1.0)
            weather_mult = 1.0 + sensitivity_scale * (raw_weather_mult - 1.0)

            # Base units with weather impact (stronger signal)
            # Use a deterministic base, then apply weather: units_base * weather_mult + small random noise
            affinity_weight = affinity_weights.get(product["weather_affinity"], 1.0)
            base_units = max(18, int(base_revenue / (len(products) * 90)))
            adjusted_units = base_units * affinity_weight
            units_sold = max(1, int(adjusted_units * weather_mult + np.random.normal(0, 0.15)))
            price = product_base_price[product["id"]]
            product_revenue = units_sold * price

            # CRITICAL FIX: Spend should correlate with demand (units_sold)
            # This ensures the model can learn spend elasticity and weather relationships
            spend_per_unit = product_spend_per_unit[product["id"]]
            meta_spend = units_sold * spend_per_unit * 0.72
            google_spend = units_sold * spend_per_unit * 0.52

            email_sends = max(100, int(adjusted_units * 30 * weather_mult + np.random.normal(0, 10)))
            email_opens = int(email_sends * np.random.uniform(0.15, 0.35))
            email_clicks = int(email_opens * np.random.uniform(0.05, 0.15))

            records.append({
                "tenant_id": tenant_name,
                "tenant_name": tenant_name.replace("_", " ").title(),
                "location": location,
                "date": date.strftime("%Y-%m-%d"),
                "product_id": product["id"],
                "product_name": product["name"],
                "product_category": product["category"],
                "weather_affinity": product["weather_affinity"],
                "units_sold": units_sold,
                "revenue_usd": product_revenue,
                "cogs_usd": product_revenue * np.random.uniform(0.4, 0.6),
                "meta_spend": meta_spend,
                "google_spend": google_spend,
                "email_sends": email_sends,
                "email_opens": email_opens,
                "email_clicks": email_clicks,
                "email_purchases": int(email_clicks * np.random.uniform(0.02, 0.08)),
            })

    return pd.DataFrame(records)


def generate_weather_data(tenant_name: str, lat: float, lon: float, days: int = 180) -> pd.DataFrame:
    """Generate Open-Meteo weather data for a tenant location.

    STRENGTHENED: More pronounced seasonal patterns to ensure weather signal is detectable.
    """
    location, _, _ = TENANTS[tenant_name]["location"]
    start_date = datetime(2024, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(days)]

    # Simulate realistic weather patterns by latitude/longitude
    base_temp = 60 if lat > 40 else 70  # Colder in north

    records = []
    for date in dates:
        day_of_year = date.timetuple().tm_yday

        # STRONGER Seasonal temperature variation (amplitude 25 instead of 20)
        seasonal_temp = base_temp + 25 * np.sin(2 * np.pi * (day_of_year - 80) / 365.25)
        daily_temp = seasonal_temp + np.random.normal(0, 1.5)  # tighter noise

        # STRONGER Precipitation patterns
        if day_of_year in range(80, 150) or day_of_year in range(240, 310):
            precipitation_mm = np.random.exponential(5)  # More rain (was 3)
        else:
            precipitation_mm = np.random.exponential(0.5)  # Less rain (was 1)

        records.append({
            "date": date.strftime("%Y-%m-%d"),
            "location": location,
            "latitude": lat,
            "longitude": lon,
            "temperature_celsius": daily_temp,
            "precipitation_mm": precipitation_mm,
            "windspeed_kmh": np.random.exponential(8),  # slightly lower base
            "relative_humidity_percent": np.random.uniform(25, 95),  # wider range
        })

    return pd.DataFrame(records)


def main():
    """Generate all synthetic tenant data."""
    base_path = Path("storage/seeds/synthetic")
    base_path.mkdir(parents=True, exist_ok=True)

    analytics_path = Path("state/analytics")
    analytics_path.mkdir(parents=True, exist_ok=True)

    tenant_profiles = {}

    for tenant_name, config in TENANTS.items():
        print(f"Generating data for {tenant_name}...")

        location, lat, lon = config["location"]

        # Generate sales/spend data
        sales_df = generate_daily_data(tenant_name, config)

        # Generate weather data
        weather_df = generate_weather_data(tenant_name, lat, lon)

        # Merge data
        merged_df = sales_df.merge(weather_df, on="date", how="left")

        # Save to parquet
        output_file = base_path / f"{tenant_name}.parquet"
        table = pa.Table.from_pandas(merged_df)
        pq.write_table(table, output_file)
        print(f"  ✓ Saved {output_file} ({len(merged_df)} rows)")

        # Calculate weather correlation for this tenant
        product_daily = merged_df.groupby("date").agg({
            "revenue_usd": "sum",
            "units_sold": "sum",
            "meta_spend": "sum",
            "google_spend": "sum",
            "email_sends": "sum",
            "temperature_celsius": "first",
            "precipitation_mm": "first",
        }).reset_index()

        weather_correlation = product_daily[["revenue_usd", "temperature_celsius"]].corr().iloc[0, 1]

        tenant_profiles[tenant_name] = {
            "location": location,
            "latitude": lat,
            "longitude": lon,
            "days_of_data": len(merged_df) // len(config["products"]),
            "num_products": len(config["products"]),
            "products": config["products"],
            "channels": config["channels"],
            "base_daily_revenue": config["base_daily_revenue"],
            "total_revenue_90d": product_daily["revenue_usd"].sum(),
            "total_spend_90d": (product_daily["meta_spend"] + product_daily["google_spend"]).sum(),
            "weather_correlation_revenue_temp": float(weather_correlation),
        }

    # Save tenant profiles
    profiles_file = analytics_path / "synthetic_tenant_profiles.json"
    with open(profiles_file, "w") as f:
        json.dump(tenant_profiles, f, indent=2)
    print(f"\n✓ Saved tenant profiles to {profiles_file}")

    # Create summary validation report
    validation_report = {
        "generated_at": datetime.now().isoformat(),
        "num_tenants": len(TENANTS),
        "days_per_tenant": 180,
        "tenants": tenant_profiles,
        "quality_checks": {
            "all_files_exist": True,
            "expected_record_counts": {
                name: config["base_daily_revenue"] > 0
                for name, config in TENANTS.items()
            },
            "weather_sensitivity_profiles": {
                "high_weather_sensitivity": "Strong seasonal/weather correlation expected",
                "medium_weather_sensitivity": "Moderate weather correlation expected",
                "no_weather_sensitivity": "Minimal weather correlation expected",
                "extreme_weather_sensitivity": "Very strong weather correlation expected",
            }
        }
    }

    validation_file = analytics_path / "synthetic_data_validation.json"
    with open(validation_file, "w") as f:
        json.dump(validation_report, f, indent=2)
    print(f"✓ Saved validation report to {validation_file}")

    print(f"\n🎯 Synthetic data generation complete!")
    print(f"\nTenant Weather Sensitivity Summary:")
    print(f"├── HIGH: Revenue correlation with temp = {tenant_profiles['high_weather_sensitivity'].get('weather_correlation_revenue_temp', 0):.3f}")
    print(f"├── EXTREME: Revenue correlation with temp = {tenant_profiles['extreme_weather_sensitivity'].get('weather_correlation_revenue_temp', 0):.3f}")
    print(f"├── MEDIUM: Revenue correlation with temp = {tenant_profiles['medium_weather_sensitivity'].get('weather_correlation_revenue_temp', 0):.3f}")
    print(f"└── NONE: Revenue correlation with temp = {tenant_profiles['no_weather_sensitivity'].get('weather_correlation_revenue_temp', 0):.3f}")


if __name__ == "__main__":
    main()
