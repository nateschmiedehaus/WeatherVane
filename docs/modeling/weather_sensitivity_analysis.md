# Weather Sensitivity Analysis

## Overview

This document analyzes the weather sensitivity characteristics of synthetic tenants, explaining how different weather conditions affect business performance across various dimensions.

## Weather Sensitivity Scales

### Temperature Sensitivity
```
-8.0 ←── Strong Negative ─── Neutral ─── Strong Positive ──→ +8.0

Brand Examples:
- Alpine Outfitters: -7.5 (Very strong negative)
- Harbor Cafe: -6.0 (Strong negative)
- Neutral Goods: 0.0 (No effect)
- Garden Gurus: +0.2 (Slight positive)
- Sunlit Skin: +7.5 (Very strong positive)
```

### Rain Sensitivity
```
-4.0 ←── Negative ─── Neutral ─── Strong Positive ──→ +16.0

Brand Examples:
- Sunlit Skin: -4.0 (Strong negative)
- Alpine Outfitters: -3.5 (Moderate negative)
- Neutral Goods: 0.0 (No effect)
- Harbor Cafe: +7.8 (Strong positive)
- Garden Gurus: +16.0 (Extreme positive)
```

### Snow Sensitivity
```
0.0 ←── No Effect ─── Moderate ─── Strong ─── Extreme ──→ +60.0

Brand Examples:
- Neutral/Sunlit/Garden: 0.0 (No effect)
- Harbor Cafe: +1.5 (Slight positive)
- Alpine Outfitters: +60.0 (Extreme positive)
```

### Humidity Sensitivity
```
-2.0 ←── Negative ─── Neutral ─── Positive ──→ +3.5

Brand Examples:
- Sunlit Skin: -2.0 (Negative)
- Neutral Goods: 0.0 (No effect)
- Alpine Outfitters: +1.4 (Moderate positive)
- Garden Gurus: +3.5 (Strong positive)
```

### Wind Sensitivity
```
-1.5 ←── Negative ─── Neutral ─── Positive ──→ +1.5

Brand Examples:
- Sunlit Skin: -1.5 (Negative)
- Most brands: 0.0 (No effect)
```

## Weather Impact Mechanisms

### 1. Direct Revenue Impact

Weather conditions affect revenue through three main channels:

a) **Brand-Level Impact**
```python
brand_weather_signal = (
    weather.temp * profile.temp +
    weather.rain * profile.rain +
    weather.snow * profile.snow +
    weather.humidity * profile.humidity +
    weather.wind * profile.wind
)
```

b) **Product Category Impact**
```python
category_weather = (
    category.temp * weather.temp +
    category.rain * weather.rain +
    category.snow * weather.snow
)
```

c) **Total Impact**
```python
revenue = (
    base_daily_revenue * category.weight +
    weather_influence * brand_weather_signal * category.weight +
    category_weather +
    marketing_component * category.weight +
    noise
)
```

### 2. Marketing Amplification

Weather conditions modify marketing performance through:

a) **Spend Adjustment**
```python
weather_multiplier = clamp(1.0 + profile.weather_amplifier * weather_scale, 0.35, 2.5)
spend = base_spend * weather_multiplier
```

b) **Conversion Rates**
```python
conversions = spend * base_rate * (1.0 + weather_scale * modifier)
# Meta modifier: 0.25
# Google modifier: 0.20
```

c) **Click Rates**
```python
click_rate = base_rate + weather_scale * modifier
# Meta modifier: 0.012 (2-12% range)
# Google modifier: 0.010 (2-11% range)
```

### 3. Signal Scaling

Weather signals are scaled for consistent effect sizes:

```python
def _scale_weather_signal(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    return clamp(value / 50.0, -2.5, 2.5)
```

This scaling ensures:
- Bounded impact (-2.5x to +2.5x)
- Linear relationship with weather metrics
- Consistent magnitude across different weather types

## Weather Expectation Categories

### Temperature Expectations
- `high_negative`: r ≈ -0.7 to -0.9 (Alpine Outfitters)
- `medium_negative`: r ≈ -0.4 to -0.6 (Harbor Cafe)
- `none`: r < |0.1| (Neutral Goods)
- `medium_positive`: r ≈ 0.4 to 0.6
- `high_positive`: r ≈ 0.7 to 0.9 (Sunlit Skin)

### Precipitation Expectations
- `negative`: r ≈ -0.3 to -0.5 (Sunlit Skin)
- `none`: r < |0.1| (Neutral Goods)
- `medium_positive`: r ≈ 0.4 to 0.6 (Harbor Cafe)
- `high_positive`: r ≈ 0.7 to 0.9 (Garden Gurus)

### Snow Expectations
- `none`: r < |0.1| (Most brands)
- `medium_positive`: r ≈ 0.4 to 0.6
- `high_positive`: r ≈ 0.7 to 0.9 (Alpine Outfitters)

## Event Response Characteristics

### 1. Freeze Events (temp_min ≤ 0°C)
- **Positive Impact**: Harbor Cafe (+30-50% revenue)
- **Strong Positive**: Alpine Outfitters (+80-120% revenue)
- **Negative Impact**: Sunlit Skin (-40-60% revenue)
- **No Impact**: Neutral Goods

### 2. Heat Waves (temp_max ≥ 30°C)
- **Positive Impact**: Sunlit Skin (+60-80% revenue)
- **Strong Negative**: Alpine Outfitters (-70-90% revenue)
- **Moderate Negative**: Harbor Cafe (-30-50% revenue)
- **No Impact**: Neutral Goods

### 3. Snow Events (snowfall > 0.1mm)
- **Strong Positive**: Alpine Outfitters (+100-150% revenue)
- **Slight Positive**: Harbor Cafe (+10-20% revenue)
- **No Impact**: Other brands

### 4. High Wind (windspeed_max ≥ 20 m/s)
- **Negative Impact**: Sunlit Skin (-20-30% revenue)
- **No Impact**: Other brands

### 5. UV Alerts (uv_index_max ≥ 8)
- **Strong Positive**: Sunlit Skin (+40-60% revenue)
- **No Impact**: Other brands

## Validation Thresholds

For weather sensitivity validation:

1. **Correlation Strength**
   - High: |r| ≥ 0.7
   - Medium: 0.4 ≤ |r| < 0.7
   - Low: 0.1 ≤ |r| < 0.4
   - None: |r| < 0.1

2. **Effect Size**
   - Strong: ≥ 50% revenue impact
   - Moderate: 20-50% revenue impact
   - Weak: < 20% revenue impact

3. **Signal-to-Noise Ratio**
   - High: SNR > 5.0
   - Medium: 2.0 < SNR ≤ 5.0
   - Low: SNR ≤ 2.0