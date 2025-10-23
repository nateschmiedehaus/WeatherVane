# Synthetic Tenant Characteristics

## Overview
This document describes the characteristics of synthetic tenants used for model development, testing, and validation in the WeatherVane system.

## Core Data Structures

### WeatherSensitivityProfile
Defines the brand's overall sensitivity to weather conditions:

```python
@dataclass(frozen=True)
class WeatherSensitivityProfile:
    temp: float     # Temperature sensitivity (-6.0 to 7.5)
    rain: float     # Rain sensitivity (-4.0 to 16.0)
    snow: float     # Snow sensitivity (0.0 to 60.0)
    humidity: float # Humidity sensitivity (-2.0 to 3.5)
    wind: float     # Wind sensitivity (-1.5 to 1.5)
```

### MarketingProfile
Defines the brand's marketing behavior and performance characteristics:

```python
@dataclass(frozen=True)
class MarketingProfile:
    meta_base: float          # Base Meta spend (44.0-70.0 USD)
    google_base: float        # Base Google spend (28.0-58.0 USD)
    meta_growth: float        # Daily Meta spend growth (0.25-0.55)
    google_growth: float      # Daily Google spend growth (0.18-0.42)
    weather_amplifier: float  # Weather impact on spend (0.0-1.15)
    revenue_per_spend: float  # Revenue per ad dollar (0.35-0.47)
    promo_rate: float        # Promotion frequency (0.45-0.65)
    promo_channels: tuple    # Available promo channels
```

### ProductCategoryProfile
Defines product category characteristics and weather sensitivities:

```python
@dataclass(frozen=True)
class ProductCategoryProfile:
    name: str      # Category name
    weight: float  # Revenue weight (0.0-1.0)
    temp: float    # Temperature sensitivity (-4.0 to 4.2)
    rain: float    # Rain sensitivity (-2.5 to 8.8)
    snow: float    # Snow sensitivity (0.0 to 24.0)
```

## Default Brand Scenarios

### 1. Harbor Cafe (brand-harbor-cafe)
Coffee shop with strong negative temperature correlation.

**Weather Profile:**
- High negative temperature sensitivity (-6.0)
- Strong positive rain sensitivity (7.8)
- Moderate snow sensitivity (1.5)
- Moderate humidity sensitivity (1.5)

**Product Mix:**
1. Warm Beverages (45%): temp=-4.0, rain=2.6
2. Baked Goods (35%): temp=-2.5, rain=1.9
3. Cold Brew (20%): temp=2.6, rain=-0.4

**Marketing:**
- Higher Meta presence ($55 base vs $35 Google)
- Strong growth rates (45% Meta, 25% Google)
- Weather amplifier: 0.8
- Revenue per spend: 0.42
- Promo channels: email, push

**Expected Correlations:**
- Temperature: medium_negative
- Precipitation: medium_positive

### 2. Alpine Outfitters (brand-alpine-outfitters)
Winter sports retailer with extreme snow sensitivity.

**Weather Profile:**
- Very high negative temperature sensitivity (-7.5)
- Negative rain sensitivity (-3.5)
- Extreme snow sensitivity (60.0)
- Moderate humidity sensitivity (1.4)

**Product Mix:**
1. Parkas (40%): temp=-4.0, snow=24.0
2. Winter Boots (35%): temp=-2.4, snow=20.0
3. Accessories (25%): temp=-1.0, snow=12.0

**Marketing:**
- Balanced spend ($48 Meta, $28 Google)
- Moderate growth (30% Meta, 18% Google)
- High weather amplifier: 1.15
- Best revenue per spend: 0.47
- Promo channels: email, sms, direct_mail

**Expected Correlations:**
- Temperature: high_negative
- Snowfall: high_positive

### 3. Neutral Goods (brand-neutral-goods)
Control brand with no weather sensitivity.

**Weather Profile:**
- All sensitivities set to 0.0

**Product Mix:**
1. Essentials (40%): no weather sensitivity
2. Housewares (30%): no weather sensitivity
3. Accessories (30%): no weather sensitivity

**Marketing:**
- Highest Google presence ($58 base)
- Equal growth rates (25% both)
- No weather amplifier
- Revenue per spend: 0.38
- Promo channels: email, sms

**Expected Correlations:**
- All weather metrics: none

### 4. Sunlit Skin (brand-sunlit-skin)
SPF and skincare brand with positive temperature correlation.

**Weather Profile:**
- High positive temperature sensitivity (7.5)
- Strong negative rain sensitivity (-4.0)
- Negative humidity sensitivity (-2.0)
- Negative wind sensitivity (-1.5)

**Product Mix:**
1. SPF Serums (40%): temp=4.2, rain=-2.5
2. After Sun (25%): temp=3.4, rain=-1.6
3. Glow Kits (35%): temp=2.8, rain=-0.8

**Marketing:**
- Highest Meta presence ($70 base vs $45 Google)
- Aggressive growth (55% Meta, 30% Google)
- High weather amplifier: 0.9
- Revenue per spend: 0.40
- Promo channels: email, in_app, sms

**Expected Correlations:**
- Temperature: high_positive
- Precipitation: negative

### 5. Garden Gurus (brand-garden-gurus)
Gardening retailer with extreme rain sensitivity.

**Weather Profile:**
- Slight positive temperature sensitivity (0.2)
- Extreme rain sensitivity (16.0)
- High humidity sensitivity (3.5)

**Product Mix:**
1. Seeds & Bulbs (32%): temp=0.15, rain=8.8
2. Garden Tools (28%): temp=0.1, rain=4.4
3. Outdoor Decor (40%): temp=0.2, rain=5.6

**Marketing:**
- Higher Google presence ($52 vs $44 Meta)
- Higher Google growth (42% vs 30% Meta)
- Moderate weather amplifier: 0.75
- Revenue per spend: 0.36
- Promo channels: email, sms, push

**Expected Correlations:**
- Precipitation: high_positive

## Weather Features

### 1. Base Metrics
- Temperature (°C): Daily mean, min, max, apparent
- Precipitation (mm): Daily total
- Snow (mm): Daily total
- Humidity (%): Daily mean
- Wind Speed (m/s): Daily max
- UV Index: Daily max

### 2. Derived Features
- Temperature Anomaly: Deviation from 7-day mean
- Precipitation Anomaly: Deviation from 7-day mean
- 7-day Rolling Averages: Temperature and precipitation
- Lag-1 Features: Previous day's values for all metrics

### 3. Event Flags
- Freeze Event: temp_min ≤ 0°C
- Heatwave: temp_max ≥ 30°C
- Snow Event: snowfall > 0.1mm
- High Wind: windspeed_max ≥ 20 m/s
- UV Alert: uv_index_max ≥ 8
- High Precipitation Probability: probability ≥ 60%