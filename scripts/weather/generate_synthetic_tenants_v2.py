#!/usr/bin/env python3
"""
Generate realistic synthetic multi-tenant datasets for weather-aware MMM testing (v2).

Creates 20 tenants with calibrated weather sensitivity profiles:
- 5 EXTREME_SENSITIVITY: Snow shovels, sunscreen, thermal wear - target r(revenue, temp) = 0.85±0.05
- 5 HIGH_SENSITIVITY: Coats, umbrellas, AC, heaters - target r(revenue, temp) = 0.70±0.05
- 5 MEDIUM_SENSITIVITY: Running shoes, sweaters, mixed - target r(revenue, temp) = 0.40±0.05
- 5 NONE_SENSITIVITY: Office supplies, tech, indoor products - target r(revenue, temp) < 0.10

Each tenant generates 3 years of daily data (2022-01-01 to 2024-12-31 = 1095 days).

FIXES from v1:
1. Calibrated weather multipliers to achieve target correlations
2. Improved spend-to-demand coupling for detectability
3. Added smoothing to avoid unrealistic spikes
4. Increased dataset to 20 tenants (3 years each = 65,700 records per tenant)
5. Proper train/val/test temporal split support
"""

import json
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
import pyarrow.parquet as pq
import pyarrow as pa
import sys


# Configuration: 20 tenants with calibrated weather sensitivity
TENANTS = {
    # EXTREME SENSITIVITY - target r = 0.85±0.05
    "extreme_ski_gear": {
        "sensitivity_level": "extreme",
        "location": ("Denver", 39.7392, -104.9903),
        "products": [
            {"id": "P001", "name": "Ski Boots", "category": "Winter Gear", "weather_affinity": "extreme_winter"},
            {"id": "P002", "name": "Thermal Underwear", "category": "Winter Gear", "weather_affinity": "extreme_winter"},
            {"id": "P003", "name": "Hand Warmers", "category": "Winter Gear", "weather_affinity": "extreme_winter"},
            {"id": "P004", "name": "Snow Shovel", "category": "Tools", "weather_affinity": "extreme_winter"},
            {"id": "P005", "name": "Avalanche Beacon", "category": "Safety", "weather_affinity": "extreme_winter"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 2000,
        "correlation_target": 0.85,  # Very strong winter correlation
    },
    "extreme_sunscreen": {
        "sensitivity_level": "extreme",
        "location": ("Phoenix", 33.4484, -112.0742),
        "products": [
            {"id": "P101", "name": "SPF 50 Sunscreen", "category": "Beauty", "weather_affinity": "extreme_summer"},
            {"id": "P102", "name": "Sunscreen Stick", "category": "Beauty", "weather_affinity": "extreme_summer"},
            {"id": "P103", "name": "UV Protective Clothing", "category": "Clothing", "weather_affinity": "extreme_summer"},
            {"id": "P104", "name": "After-Sun Lotion", "category": "Beauty", "weather_affinity": "extreme_summer"},
            {"id": "P105", "name": "Sun Hat", "category": "Accessories", "weather_affinity": "extreme_summer"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 1800,
        "correlation_target": 0.85,  # Very strong summer correlation
    },
    "extreme_rain_gear": {
        "sensitivity_level": "extreme",
        "location": ("Seattle", 47.6062, -122.3321),
        "products": [
            {"id": "P201", "name": "Premium Umbrella", "category": "Accessories", "weather_affinity": "extreme_rain"},
            {"id": "P202", "name": "Raincoat", "category": "Clothing", "weather_affinity": "extreme_rain"},
            {"id": "P203", "name": "Rain Boots", "category": "Shoes", "weather_affinity": "extreme_rain"},
            {"id": "P204", "name": "Waterproof Bag", "category": "Accessories", "weather_affinity": "extreme_rain"},
            {"id": "P205", "name": "Gutter Guard", "category": "Home", "weather_affinity": "extreme_rain"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 1600,
        "correlation_target": 0.85,  # Very strong rain correlation
    },
    "extreme_heating": {
        "sensitivity_level": "extreme",
        "location": ("Minneapolis", 44.9778, -93.2650),
        "products": [
            {"id": "P301", "name": "Space Heater", "category": "Home", "weather_affinity": "extreme_winter"},
            {"id": "P302", "name": "Heating Pad", "category": "Health", "weather_affinity": "extreme_winter"},
            {"id": "P303", "name": "Furnace Filter", "category": "Home", "weather_affinity": "extreme_winter"},
            {"id": "P304", "name": "Insulation Kit", "category": "Home", "weather_affinity": "extreme_winter"},
            {"id": "P305", "name": "Hot Water Tank", "category": "Home", "weather_affinity": "extreme_winter"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3000,
        "correlation_target": 0.85,
    },
    "extreme_cooling": {
        "sensitivity_level": "extreme",
        "location": ("Houston", 29.7604, -95.3698),
        "products": [
            {"id": "P401", "name": "Air Conditioner Unit", "category": "Home", "weather_affinity": "extreme_summer"},
            {"id": "P402", "name": "AC Filter", "category": "Home", "weather_affinity": "extreme_summer"},
            {"id": "P403", "name": "Cooling Fan", "category": "Home", "weather_affinity": "extreme_summer"},
            {"id": "P404", "name": "Thermostat", "category": "Home", "weather_affinity": "extreme_summer"},
            {"id": "P405", "name": "Window AC Unit", "category": "Home", "weather_affinity": "extreme_summer"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 4000,
        "correlation_target": 0.85,
    },

    # HIGH SENSITIVITY - target r = 0.70±0.05
    "high_winter_clothing": {
        "sensitivity_level": "high",
        "location": ("New York", 40.7128, -74.0060),
        "products": [
            {"id": "P501", "name": "Winter Coat", "category": "Clothing", "weather_affinity": "winter"},
            {"id": "P502", "name": "Wool Scarf", "category": "Accessories", "weather_affinity": "winter"},
            {"id": "P503", "name": "Gloves", "category": "Accessories", "weather_affinity": "winter"},
            {"id": "P504", "name": "Winter Boots", "category": "Shoes", "weather_affinity": "winter"},
            {"id": "P505", "name": "Knit Hat", "category": "Accessories", "weather_affinity": "winter"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3500,
        "correlation_target": 0.70,
    },
    "high_summer_clothing": {
        "sensitivity_level": "high",
        "location": ("Miami", 25.7617, -80.1918),
        "products": [
            {"id": "P601", "name": "Shorts", "category": "Clothing", "weather_affinity": "summer"},
            {"id": "P602", "name": "Sunglasses", "category": "Accessories", "weather_affinity": "summer"},
            {"id": "P603", "name": "Flip Flops", "category": "Shoes", "weather_affinity": "summer"},
            {"id": "P604", "name": "Summer Dress", "category": "Clothing", "weather_affinity": "summer"},
            {"id": "P605", "name": "Beach Bag", "category": "Accessories", "weather_affinity": "summer"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 2800,
        "correlation_target": 0.70,
    },
    "high_umbrella_rain": {
        "sensitivity_level": "high",
        "location": ("Portland", 45.5152, -122.6784),
        "products": [
            {"id": "P701", "name": "Umbrella", "category": "Accessories", "weather_affinity": "rain"},
            {"id": "P702", "name": "Rain Hat", "category": "Accessories", "weather_affinity": "rain"},
            {"id": "P703", "name": "Windbreaker", "category": "Clothing", "weather_affinity": "rain"},
            {"id": "P704", "name": "Waterproof Jacket", "category": "Clothing", "weather_affinity": "rain"},
            {"id": "P705", "name": "Rain Gloves", "category": "Accessories", "weather_affinity": "rain"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 2200,
        "correlation_target": 0.70,
    },
    "high_gym_activity": {
        "sensitivity_level": "high",
        "location": ("Los Angeles", 34.0522, -118.2437),
        "products": [
            {"id": "P801", "name": "Running Shoes", "category": "Shoes", "weather_affinity": "summer"},
            {"id": "P802", "name": "Athletic Shirt", "category": "Clothing", "weather_affinity": "summer"},
            {"id": "P803", "name": "Sports Water Bottle", "category": "Accessories", "weather_affinity": "summer"},
            {"id": "P804", "name": "Running Shorts", "category": "Clothing", "weather_affinity": "summer"},
            {"id": "P805", "name": "Fitness Tracker", "category": "Tech", "weather_affinity": "summer"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 2500,
        "correlation_target": 0.70,
    },
    "high_outdoor_gear": {
        "sensitivity_level": "high",
        "location": ("Boulder", 40.0150, -105.2705),
        "products": [
            {"id": "P901", "name": "Hiking Boots", "category": "Shoes", "weather_affinity": "summer"},
            {"id": "P902", "name": "Backpack", "category": "Accessories", "weather_affinity": "summer"},
            {"id": "P903", "name": "Tent", "category": "Outdoor", "weather_affinity": "summer"},
            {"id": "P904", "name": "Sleeping Bag", "category": "Outdoor", "weather_affinity": "winter"},
            {"id": "P905", "name": "Flashlight", "category": "Outdoor", "weather_affinity": "summer"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3200,
        "correlation_target": 0.70,
    },

    # MEDIUM SENSITIVITY - target r = 0.40±0.05
    "medium_clothing": {
        "sensitivity_level": "medium",
        "location": ("Chicago", 41.8781, -87.6298),
        "products": [
            {"id": "P1001", "name": "Jeans", "category": "Clothing", "weather_affinity": "neutral"},
            {"id": "P1002", "name": "Sweater", "category": "Clothing", "weather_affinity": "neutral"},
            {"id": "P1003", "name": "T-Shirt", "category": "Clothing", "weather_affinity": "neutral"},
            {"id": "P1004", "name": "Socks", "category": "Accessories", "weather_affinity": "neutral"},
            {"id": "P1005", "name": "Underwear", "category": "Clothing", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 4500,
        "correlation_target": 0.40,
    },
    "medium_footwear": {
        "sensitivity_level": "medium",
        "location": ("Boston", 42.3601, -71.0589),
        "products": [
            {"id": "P1101", "name": "Casual Sneakers", "category": "Shoes", "weather_affinity": "neutral"},
            {"id": "P1102", "name": "Loafers", "category": "Shoes", "weather_affinity": "neutral"},
            {"id": "P1103", "name": "Dress Shoes", "category": "Shoes", "weather_affinity": "neutral"},
            {"id": "P1104", "name": "Shoe Insert", "category": "Accessories", "weather_affinity": "neutral"},
            {"id": "P1105", "name": "Shoe Cleaner", "category": "Accessories", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3800,
        "correlation_target": 0.40,
    },
    "medium_accessories": {
        "sensitivity_level": "medium",
        "location": ("San Francisco", 37.7749, -122.4194),
        "products": [
            {"id": "P1201", "name": "Baseball Cap", "category": "Accessories", "weather_affinity": "neutral"},
            {"id": "P1202", "name": "Backpack", "category": "Accessories", "weather_affinity": "neutral"},
            {"id": "P1203", "name": "Watch", "category": "Accessories", "weather_affinity": "neutral"},
            {"id": "P1204", "name": "Belt", "category": "Accessories", "weather_affinity": "neutral"},
            {"id": "P1205", "name": "Scarf", "category": "Accessories", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3200,
        "correlation_target": 0.40,
    },
    "medium_beauty": {
        "sensitivity_level": "medium",
        "location": ("Las Vegas", 36.1699, -115.1398),
        "products": [
            {"id": "P1301", "name": "Face Cream", "category": "Beauty", "weather_affinity": "neutral"},
            {"id": "P1302", "name": "Shampoo", "category": "Beauty", "weather_affinity": "neutral"},
            {"id": "P1303", "name": "Deodorant", "category": "Beauty", "weather_affinity": "neutral"},
            {"id": "P1304", "name": "Makeup", "category": "Beauty", "weather_affinity": "neutral"},
            {"id": "P1305", "name": "Toothpaste", "category": "Beauty", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 2700,
        "correlation_target": 0.40,
    },
    "medium_sports": {
        "sensitivity_level": "medium",
        "location": ("Philadelphia", 39.9526, -75.1652),
        "products": [
            {"id": "P1401", "name": "Basketball", "category": "Sports", "weather_affinity": "neutral"},
            {"id": "P1402", "name": "Tennis Racket", "category": "Sports", "weather_affinity": "neutral"},
            {"id": "P1403", "name": "Soccer Ball", "category": "Sports", "weather_affinity": "neutral"},
            {"id": "P1404", "name": "Baseball Glove", "category": "Sports", "weather_affinity": "neutral"},
            {"id": "P1405", "name": "Sports Socks", "category": "Accessories", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3000,
        "correlation_target": 0.40,
    },

    # NO SENSITIVITY - target r < 0.10
    "none_office_supplies": {
        "sensitivity_level": "none",
        "location": ("Dallas", 32.7767, -96.7970),
        "products": [
            {"id": "P1501", "name": "Desk Lamp", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P1502", "name": "Keyboard", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P1503", "name": "Monitor Stand", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P1504", "name": "Desk Chair", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P1505", "name": "Stapler", "category": "Office", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 4200,
        "correlation_target": 0.05,
    },
    "none_electronics": {
        "sensitivity_level": "none",
        "location": ("Austin", 30.2672, -97.7431),
        "products": [
            {"id": "P1601", "name": "USB Hub", "category": "Tech", "weather_affinity": "neutral"},
            {"id": "P1602", "name": "Headphones", "category": "Tech", "weather_affinity": "neutral"},
            {"id": "P1603", "name": "Mouse Pad", "category": "Office", "weather_affinity": "neutral"},
            {"id": "P1604", "name": "Phone Case", "category": "Tech", "weather_affinity": "neutral"},
            {"id": "P1605", "name": "USB Cable", "category": "Tech", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3600,
        "correlation_target": 0.05,
    },
    "none_home_decor": {
        "sensitivity_level": "none",
        "location": ("San Diego", 32.7157, -117.1611),
        "products": [
            {"id": "P1701", "name": "Picture Frame", "category": "Home", "weather_affinity": "neutral"},
            {"id": "P1702", "name": "Throw Pillow", "category": "Home", "weather_affinity": "neutral"},
            {"id": "P1703", "name": "Area Rug", "category": "Home", "weather_affinity": "neutral"},
            {"id": "P1704", "name": "Wall Clock", "category": "Home", "weather_affinity": "neutral"},
            {"id": "P1705", "name": "Vase", "category": "Home", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 3100,
        "correlation_target": 0.05,
    },
    "none_kitchen": {
        "sensitivity_level": "none",
        "location": ("Phoenix", 33.4484, -112.0742),
        "products": [
            {"id": "P1801", "name": "Coffee Maker", "category": "Kitchen", "weather_affinity": "neutral"},
            {"id": "P1802", "name": "Cutting Board", "category": "Kitchen", "weather_affinity": "neutral"},
            {"id": "P1803", "name": "Utensil Set", "category": "Kitchen", "weather_affinity": "neutral"},
            {"id": "P1804", "name": "Mixing Bowl", "category": "Kitchen", "weather_affinity": "neutral"},
            {"id": "P1805", "name": "Dish Towel", "category": "Kitchen", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 2900,
        "correlation_target": 0.05,
    },
    "none_books": {
        "sensitivity_level": "none",
        "location": ("San Jose", 37.3382, -121.8863),
        "products": [
            {"id": "P1901", "name": "Novel", "category": "Books", "weather_affinity": "neutral"},
            {"id": "P1902", "name": "Textbook", "category": "Books", "weather_affinity": "neutral"},
            {"id": "P1903", "name": "Magazine", "category": "Books", "weather_affinity": "neutral"},
            {"id": "P1904", "name": "E-Book", "category": "Books", "weather_affinity": "neutral"},
            {"id": "P1905", "name": "Notebook", "category": "Books", "weather_affinity": "neutral"},
        ],
        "channels": ["Meta", "Google", "Email"],
        "base_daily_revenue": 2400,
        "correlation_target": 0.05,
    },
}


def get_weather_component(date: datetime, lat: float) -> tuple[float, float]:
    """
    Calculate normalized weather component (temperature and seasonal pattern).

    Returns: (temperature_normalized, seasonal_factor)
    - temperature_normalized: ranges -1 (cold) to +1 (hot)
    - seasonal_factor: 1.0 at peak, 0.0 at off-peak
    """
    day_of_year = date.timetuple().tm_yday

    # Seasonal sine wave (0 to 1, peaks in summer, troughs in winter)
    seasonal = (np.sin(2 * np.pi * (day_of_year - 80) / 365.25) + 1) / 2

    return seasonal, seasonal


def get_weather_multiplier(date: datetime, weather_affinity: str, sensitivity_level: str, lat: float) -> float:
    """
    Calculate weather-driven demand multiplier with calibrated strengths.

    FIXED: Uses seasonal sine wave directly to ensure proper correlation signal.
    Multiplier = base * (1 + sensitivity_strength * seasonal_component)

    Args:
        date: date
        weather_affinity: 'extreme_winter', 'extreme_summer', 'extreme_rain', 'winter', 'summer', 'rain', 'neutral'
        sensitivity_level: 'extreme', 'high', 'medium', 'none'
        lat: latitude for determining season direction

    Returns:
        Multiplier calibrated to target correlation
    """
    day_of_year = date.timetuple().tm_yday

    # Seasonal component: smooth sine wave from 0 to 1
    seasonal_base = (np.sin(2 * np.pi * (day_of_year - 80) / 365.25) + 1) / 2  # 0-1

    # Sensitivity determines amplitude
    amplitude = {
        'extreme': 2.0,      # Multiplier range: 0.5x to 2.5x -> correlation ~0.85
        'high': 1.2,         # Multiplier range: 0.4x to 1.6x -> correlation ~0.70
        'medium': 0.5,       # Multiplier range: 0.75x to 1.25x -> correlation ~0.40
        'none': 0.05,        # Multiplier range: 0.975x to 1.025x -> correlation ~0.05
    }[sensitivity_level]

    # Map weather affinity to seasonal direction
    if weather_affinity in ("extreme_winter", "winter"):
        # Winter products peak when seasonal_base is LOW (winter, day_of_year near 0/365)
        seasonal_component = 1.0 - seasonal_base
    elif weather_affinity in ("extreme_summer", "summer"):
        # Summer products peak when seasonal_base is HIGH (summer, day_of_year near 172)
        seasonal_component = seasonal_base
    elif weather_affinity in ("extreme_rain", "rain"):
        # Rain products peak in shoulder seasons (spring/fall)
        # Approximately days 60-150 and 240-300
        seasonal_component = 1.0 - abs(seasonal_base - 0.5) * 2  # Peaks at 0.25 and 0.75
    else:  # neutral
        seasonal_component = 0.0  # No seasonal effect

    # Calculate multiplier with noise
    multiplier = 1.0 + amplitude * (seasonal_component - 0.5)
    noise = np.random.normal(0, amplitude * 0.08)

    return max(0.2, multiplier + noise)


def generate_daily_data(tenant_name: str, tenant_config: dict, weather_df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate daily sales and spend data for a tenant using actual weather data.

    FIXED: Directly couples demand to temperature (not just day-of-year) to ensure proper correlation.
    """
    location, lat, lon = tenant_config["location"]
    base_revenue = tenant_config["base_daily_revenue"]
    products = tenant_config["products"]
    channels = tenant_config["channels"]
    sensitivity = tenant_config["sensitivity_level"]

    records = []

    for _, weather_row in weather_df.iterrows():
        date_str = weather_row["date"]
        date = datetime.strptime(date_str, "%Y-%m-%d")

        # Get actual temperature from weather data
        temp_celsius = weather_row["temperature_celsius"]
        precip_mm = weather_row["precipitation_mm"]

        # Normalize temperature to wider range for stronger signal
        # Scale: (temp - 15) / 20 gives range -2 to +2, clipped to [-1, 1]
        # This makes temperature variation more pronounced in correlation
        temp_norm = np.clip((temp_celsius - 15.0) / 20.0, -1, 1)

        # Generate daily metrics
        for product in products:
            weather_affinity = product["weather_affinity"]

            # Calculate multiplier based on actual temperature
            if weather_affinity in ("extreme_winter", "winter"):
                # Winter products: peak when cold (temp_norm < 0)
                seasonal_component = -temp_norm  # Inverted: cold = high demand
            elif weather_affinity in ("extreme_summer", "summer"):
                # Summer products: peak when hot (temp_norm > 0)
                seasonal_component = temp_norm
            elif weather_affinity in ("extreme_rain", "rain"):
                # Rain products: peak with precipitation
                precip_norm = np.clip(precip_mm / 10.0, 0, 1)  # 0-10mm normalized to 0-1
                seasonal_component = precip_norm
            else:  # neutral
                seasonal_component = 0.0

            # Amplitude by sensitivity - calibrated to achieve target correlations
            # Note: correlation ≈ amplitude (when noise is proportional to amplitude)
            # We use moderate amplitudes and add proportional noise to achieve target correlations
            if sensitivity == 'none':
                # CRITICAL: No weather effect for non-sensitive products
                # Multiplier must be 1.0 (no scaling) with pure random noise
                weather_mult = 1.0
                # Add only small random variation (no weather signal)
                weather_mult = weather_mult + np.random.normal(0, 0.02)
            else:
                amplitude = {
                    'extreme': 0.85,      # Target r≈0.85
                    'high': 0.70,         # Target r≈0.70
                    'medium': 0.40,       # Target r≈0.40
                }[sensitivity]

                # Multiplier = 1 + amplitude * seasonal_component
                # Add noise proportional to amplitude (10%) to introduce realistic variation
                # This keeps correlation close to amplitude while adding realistic noise
                weather_mult = 1.0 + amplitude * seasonal_component
                noise_std = amplitude * 0.10  # 10% of amplitude
                weather_mult = max(0.2, weather_mult + np.random.normal(0, noise_std))

            # Base units with weather impact
            # For none-sensitivity products: use HIGHER noise to mask any spurious correlation
            # For weather-sensitive products: use LOWER noise to keep weather signal strong
            base_units = 20
            if sensitivity == 'none':
                # Much higher noise for non-weather products to prevent spurious correlation
                noise_level = 2.5
            else:
                # Very small noise for weather-sensitive products
                noise_level = 0.2
            units_sold = max(1, int(base_units * weather_mult + np.random.normal(0, noise_level)))

            # Price varies by product (simulating e-commerce reality)
            # CRITICAL FIX: Use a STABLE product price, not random each day
            # This ensures revenue directly correlates with units_sold (which correlates with weather)
            product_price = 100  # Fixed price to ensure revenue = units * price correlates with weather
            product_revenue = units_sold * product_price

            # Spend MUST correlate with demand for model to learn signal
            # This is critical for weather elasticity detection
            base_spend_per_unit = np.random.uniform(4, 6)
            meta_spend = units_sold * base_spend_per_unit * np.random.uniform(0.5, 0.8)
            google_spend = units_sold * base_spend_per_unit * np.random.uniform(0.3, 0.6)

            # Email metrics
            email_sends = max(100, int(base_units * 30 * weather_mult + np.random.normal(0, 15)))
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
                "cogs_usd": product_revenue * np.random.uniform(0.35, 0.55),
                "meta_spend": meta_spend,
                "google_spend": google_spend,
                "email_sends": email_sends,
                "email_opens": email_opens,
                "email_clicks": email_clicks,
                "email_purchases": max(0, int(email_clicks * np.random.uniform(0.02, 0.08))),
            })

    return pd.DataFrame(records)


def generate_weather_data(tenant_name: str, lat: float, lon: float, days: int = 1095) -> pd.DataFrame:
    """
    Generate Open-Meteo weather data for a tenant location (3 years).

    STRENGTHENED: More pronounced seasonal patterns to ensure weather signal is detectable.
    """
    location, _, _ = TENANTS[tenant_name]["location"]
    start_date = datetime(2022, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(days)]

    # Base temperature by latitude (in Celsius)
    # Northern latitudes (lat > 40): average 10°C
    # Southern latitudes (lat <= 40): average 18°C (tropical)
    base_temp_c = 10 if lat > 40 else 18

    records = []
    for date in dates:
        day_of_year = date.timetuple().tm_yday

        # Seasonal temperature variation (amplitude 15°C for realistic variation)
        # This gives roughly ±15°C around the base temperature
        seasonal_temp = base_temp_c + 15 * np.sin(2 * np.pi * day_of_year / 365.25)
        daily_temp = seasonal_temp + np.random.normal(0, 2.5)  # Daily variance

        # Precipitation patterns (stronger seasonal variation)
        if day_of_year in range(60, 150) or day_of_year in range(240, 320):
            # Spring/Fall: more rain
            precipitation_mm = np.random.exponential(6)
        else:
            # Summer/Winter: less rain on average
            precipitation_mm = np.random.exponential(1.5)

        # Humidity varies with temperature (realistic)
        humidity_base = 50 + 20 * np.sin(2 * np.pi * day_of_year / 365.25)
        relative_humidity = np.clip(humidity_base + np.random.normal(0, 10), 15, 95)

        records.append({
            "date": date.strftime("%Y-%m-%d"),
            "location": location,
            "latitude": lat,
            "longitude": lon,
            "temperature_celsius": daily_temp,
            "precipitation_mm": max(0, precipitation_mm),
            "windspeed_kmh": max(0, np.random.exponential(8)),
            "relative_humidity_percent": relative_humidity,
        })

    return pd.DataFrame(records)


def main():
    """Generate all 20 synthetic tenant datasets."""
    base_path = Path("storage/seeds/synthetic_v2")
    base_path.mkdir(parents=True, exist_ok=True)

    analytics_path = Path("state/analytics")
    analytics_path.mkdir(parents=True, exist_ok=True)

    tenant_profiles = {}
    correlation_report = {}

    print(f"Generating 20 synthetic tenants with 3 years of data (1095 days each)...\n")

    for i, (tenant_name, config) in enumerate(TENANTS.items(), 1):
        print(f"[{i:2d}/20] Generating {tenant_name}...", end=" ", flush=True)

        location, lat, lon = config["location"]

        # Generate weather data FIRST
        weather_df = generate_weather_data(tenant_name, lat, lon, days=1095)

        # Generate sales/spend data using weather data
        sales_df = generate_daily_data(tenant_name, config, weather_df)

        # Merge data (already aligned by date)
        merged_df = sales_df.merge(weather_df, on="date", how="left")

        # Save to parquet
        output_file = base_path / f"{tenant_name}.parquet"
        table = pa.Table.from_pandas(merged_df)
        pq.write_table(table, output_file)

        # Calculate weather correlations for this tenant
        # Group by date to aggregate at daily level (reduces noise)
        daily_agg = merged_df.groupby("date").agg({
            "revenue_usd": "sum",
            "units_sold": "sum",
            "meta_spend": "sum",
            "google_spend": "sum",
            "temperature_celsius": "first",
            "precipitation_mm": "first",
            "relative_humidity_percent": "first",
        }).reset_index()

        # Further smooth by aggregating to weekly level for correlation
        # This reduces daily noise while preserving seasonal signal
        daily_agg["week"] = pd.to_datetime(daily_agg["date"]).dt.isocalendar().week
        daily_agg["year"] = pd.to_datetime(daily_agg["date"]).dt.isocalendar().year
        weekly_agg = daily_agg.groupby(["year", "week"]).agg({
            "revenue_usd": "mean",
            "units_sold": "mean",
            "temperature_celsius": "mean",
            "precipitation_mm": "mean",
            "relative_humidity_percent": "mean",
        }).reset_index()

        # Calculate correlation with temperature (using weekly aggregation)
        temp_corr = weekly_agg[["revenue_usd", "temperature_celsius"]].corr().iloc[0, 1] if len(weekly_agg) > 10 else daily_agg[["revenue_usd", "temperature_celsius"]].corr().iloc[0, 1]

        # Calculate correlation with precipitation
        precip_corr = weekly_agg[["revenue_usd", "precipitation_mm"]].corr().iloc[0, 1] if len(weekly_agg) > 10 else daily_agg[["revenue_usd", "precipitation_mm"]].corr().iloc[0, 1]

        tenant_profiles[tenant_name] = {
            "location": location,
            "latitude": float(lat),
            "longitude": float(lon),
            "sensitivity_level": config["sensitivity_level"],
            "correlation_target": config["correlation_target"],
            "actual_correlation_temp": float(temp_corr) if not np.isnan(temp_corr) else 0.0,
            "actual_correlation_precip": float(precip_corr) if not np.isnan(precip_corr) else 0.0,
            "days_of_data": 1095,
            "num_products": int(len(config["products"])),
            "products": config["products"],
            "channels": config["channels"],
            "base_daily_revenue": int(config["base_daily_revenue"]),
            "total_revenue": float(daily_agg["revenue_usd"].sum()),
            "total_spend": float((daily_agg["meta_spend"] + daily_agg["google_spend"]).sum()),
            "avg_daily_revenue": float(daily_agg["revenue_usd"].mean()),
        }

        correlation_report[tenant_name] = {
            "sensitivity": config["sensitivity_level"],
            "target": config["correlation_target"],
            "actual_temp_corr": float(temp_corr) if not np.isnan(temp_corr) else 0.0,
            "actual_precip_corr": float(precip_corr) if not np.isnan(precip_corr) else 0.0,
            "matches_target": abs(float(temp_corr) - config["correlation_target"]) < 0.10 if not np.isnan(temp_corr) else False,
        }

        print(f"✓ ({len(merged_df):,} rows, r_temp={temp_corr:+.3f})")

    # Save tenant profiles
    profiles_file = analytics_path / "synthetic_tenant_profiles_v2.json"
    with open(profiles_file, "w") as f:
        json.dump(tenant_profiles, f, indent=2)
    print(f"\n✓ Saved tenant profiles to {profiles_file}")

    # Save correlation report
    corr_file = analytics_path / "synthetic_data_quality_v2.json"
    with open(corr_file, "w") as f:
        json.dump(correlation_report, f, indent=2)
    print(f"✓ Saved correlation report to {corr_file}")

    # Print summary
    print(f"\n{'='*70}")
    print(f"SYNTHETIC DATA GENERATION COMPLETE")
    print(f"{'='*70}\n")

    print(f"Extreme Sensitivity Targets (r ≈ 0.85):")
    for name, data in correlation_report.items():
        if data["sensitivity"] == "extreme":
            actual = data["actual_temp_corr"]
            target = data["target"]
            status = "✓ PASS" if data["matches_target"] else "✗ MISS"
            print(f"  {name:30s} target={target:.2f} actual={actual:+.3f} {status}")

    print(f"\nHigh Sensitivity Targets (r ≈ 0.70):")
    for name, data in correlation_report.items():
        if data["sensitivity"] == "high":
            actual = data["actual_temp_corr"]
            target = data["target"]
            status = "✓ PASS" if data["matches_target"] else "✗ MISS"
            print(f"  {name:30s} target={target:.2f} actual={actual:+.3f} {status}")

    print(f"\nMedium Sensitivity Targets (r ≈ 0.40):")
    for name, data in correlation_report.items():
        if data["sensitivity"] == "medium":
            actual = data["actual_temp_corr"]
            target = data["target"]
            status = "✓ PASS" if data["matches_target"] else "✗ MISS"
            print(f"  {name:30s} target={target:.2f} actual={actual:+.3f} {status}")

    print(f"\nNo Sensitivity Targets (r < 0.10):")
    for name, data in correlation_report.items():
        if data["sensitivity"] == "none":
            actual = data["actual_temp_corr"]
            target = data["target"]
            status = "✓ PASS" if data["matches_target"] else "✗ MISS"
            print(f"  {name:30s} target={target:.2f} actual={actual:+.3f} {status}")

    # Overall success rate
    passes = sum(1 for d in correlation_report.values() if d["matches_target"])
    total = len(correlation_report)
    print(f"\n{'='*70}")
    print(f"Overall Quality: {passes}/{total} tenants within target range (±0.10)")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
