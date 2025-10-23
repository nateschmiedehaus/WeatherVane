# Synthetic Data Generation for Weather-Aware MMM Testing

## Overview

This document describes the synthetic multi-tenant dataset generation process for training and validating weather-aware marketing mix models.

## Tenants

Four synthetic tenants are generated with varying weather sensitivity profiles to test the model's ability to detect and leverage weather patterns:

### 1. HIGH_WEATHER_SENSITIVITY (New York)
**Products**: Winter coats, umbrellas, shorts, sunglasses, long sleeves
**Weather Affinity**: Seasonal clothing with strong temperature correlation
**Expected Behavior**: Clear summer/winter demand peaks, strong correlation with temperature
**Total 90-day Revenue**: ~$1.35M
**Weather Correlation**: 0.65-0.75 (strong)

### 2. EXTREME_WEATHER_SENSITIVITY (Denver)
**Products**: Snow shovels, sunscreen, thermal underwear, beach towels, hot chocolate maker
**Weather Affinity**: Hyper-seasonal products with extreme weather sensitivity
**Expected Behavior**: Extremely strong peaks tied to specific weather conditions
**Total 90-day Revenue**: ~$945K
**Weather Correlation**: 0.80-0.90 (very strong)

### 3. MEDIUM_WEATHER_SENSITIVITY (Chicago)
**Products**: Running shoes, sweaters, jeans, socks, baseball caps
**Weather Affinity**: Mixed products with some weather dependency
**Expected Behavior**: Moderate seasonal variation with noise
**Total 90-day Revenue**: ~$1.215M
**Weather Correlation**: 0.35-0.45 (moderate)

### 4. NO_WEATHER_SENSITIVITY (Los Angeles)
**Products**: Desk lamps, keyboards, monitor stands, USB hubs, headphones
**Weather Affinity**: Non-perishable office/tech products
**Expected Behavior**: Flat baseline demand, minimal weather impact
**Total 90-day Revenue**: ~$1.08M
**Weather Correlation**: -0.1 to 0.1 (none)

## Data Structure

### Daily Sales Data (product_daily)
Generated for each product × day combination:

```
tenant_id              text          // e.g., 'high_weather_sensitivity'
tenant_name            text          // e.g., 'High Weather Sensitivity'
location               text          // e.g., 'New York'
date                   date          // ISO 8601 format
product_id             text          // e.g., 'P001'
product_name           text          // e.g., 'Winter Coat'
product_category       text          // e.g., 'Clothing'
weather_affinity       text          // 'winter', 'summer', 'rain', 'neutral'
units_sold             integer       // Poisson(20 * weather_multiplier)
revenue_usd            float         // units_sold * unit_price
cogs_usd               float         // 40-60% of revenue
meta_spend             float         // Daily Meta ads spend
google_spend           float         // Daily Google ads spend
email_sends            integer       // Klaviyo email sends
email_opens            integer       // Email open count
email_clicks           integer       // Email click count
email_purchases        integer       // Attributed to email
temperature_celsius    float         // Simulated weather data
precipitation_mm       float         // Simulated rainfall
```

### Weather Data
Open-Meteo style weather data including:
- Temperature (seasonal variation by latitude)
- Precipitation (binned heavy in spring/fall)
- Wind speed
- Humidity

## Generation Process

### Step 1: Run Data Generation Script

```bash
python scripts/weather/generate_synthetic_tenants.py
```

This creates:
- `storage/seeds/synthetic/high_weather_sensitivity.parquet`
- `storage/seeds/synthetic/extreme_weather_sensitivity.parquet`
- `storage/seeds/synthetic/medium_weather_sensitivity.parquet`
- `storage/seeds/synthetic/no_weather_sensitivity.parquet`
- `state/analytics/synthetic_tenant_profiles.json` (metadata)
- `state/analytics/synthetic_data_validation.json` (quality report)

### Step 2: Validate Data Quality

Check that generated data meets quality standards:

```bash
python -c "
import json
with open('state/analytics/synthetic_data_validation.json') as f:
    report = json.load(f)
    for tenant, profile in report['tenants'].items():
        print(f'{tenant}: {profile[\"total_revenue_90d\"]:,.0f} revenue, weather_correlation={profile[\"weather_correlation_revenue_temp\"]:.3f}')
"
```

Expected results:
- ALL tenants have 90 days of clean data
- NONE and MEDIUM should have weak correlation (~0.0-0.5)
- HIGH should have strong correlation (~0.65-0.75)
- EXTREME should have very strong correlation (~0.80-0.90)

### Step 3: Load into Feature Store

The parquet files can be loaded and joined in the feature engineering pipeline:

```python
import pandas as pd
from pathlib import Path

tenants = [
    'high_weather_sensitivity',
    'extreme_weather_sensitivity',
    'medium_weather_sensitivity',
    'no_weather_sensitivity'
]

for tenant in tenants:
    df = pd.read_parquet(f'storage/seeds/synthetic/{tenant}.parquet')
    # Load into feature store for MMM training
```

## Testing Strategy

### Training/Validation Split
- Use first 60 days for MMM training
- Use last 30 days for validation

### Model Testing
Train MMM on each tenant and verify:

1. **HIGH/EXTREME tenants**: Model should extract strong positive weather coefficients
2. **NO sensitivity tenant**: Model should return near-zero weather coefficients
3. **MEDIUM tenant**: Model should extract moderate weather effects
4. **All tenants**: Model should correctly estimate channel (Meta/Google/Email) contribution

### Example Validation

```python
from sklearn.metrics import r2_score

# Train MMM model
model = WeatherAwareMMM(tenant_data)
predictions = model.predict(test_data)

# Check fit quality
r2 = r2_score(test_data['revenue'], predictions)
assert r2 > 0.7, "Model should explain >70% of variance for synthetic data"

# Check weather coefficients
weather_coef = model.weather_coefficient
if tenant == 'no_weather_sensitivity':
    assert abs(weather_coef) < 0.05, "Near-zero weather effect expected"
elif tenant == 'extreme_weather_sensitivity':
    assert weather_coef > 0.15, "Strong weather effect expected"
```

## Files Generated

```
storage/seeds/synthetic/
├── high_weather_sensitivity.parquet (90 days × 5 products = 450 rows)
├── extreme_weather_sensitivity.parquet (90 days × 5 products = 450 rows)
├── medium_weather_sensitivity.parquet (90 days × 5 products = 450 rows)
└── no_weather_sensitivity.parquet (90 days × 5 products = 450 rows)

state/analytics/
├── synthetic_tenant_profiles.json (metadata for each tenant)
└── synthetic_data_validation.json (quality report)
```

## Quality Assurance

### Data Completeness
- ✓ No null values in critical columns
- ✓ 90 days of data for each tenant
- ✓ All products represented
- ✓ Weather data aligned with sales dates

### Realism Checks
- ✓ Revenue ranges match typical e-commerce (3K-5K daily base)
- ✓ Weather correlation varies as designed
- ✓ Seasonal patterns visible in timeseries
- ✓ No obvious outliers or data quality issues

### Weather Correlation Validation
Run correlation analysis:

```python
import pandas as pd
import numpy as np

for tenant_file in Path('storage/seeds/synthetic').glob('*.parquet'):
    df = pd.read_parquet(tenant_file)
    daily = df.groupby('date').agg({'revenue_usd': 'sum', 'temperature_celsius': 'first'})
    corr = daily['revenue_usd'].corr(daily['temperature_celsius'])
    print(f"{tenant_file.stem}: correlation = {corr:.3f}")
```

Expected output:
```
high_weather_sensitivity: correlation = 0.71
extreme_weather_sensitivity: correlation = 0.87
medium_weather_sensitivity: correlation = 0.39
no_weather_sensitivity: correlation = -0.05
```

## Next Steps

Once data generation and validation are complete:

1. **Train MMM**: Run `T12.3.1` to train weather-aware MMM on each tenant
2. **Extract Elasticity**: Run `T12.3.2` to estimate weather sensitivity coefficients
3. **Deploy Inference**: Run `T12.3.3` to ship production inference service
4. **Test Allocation**: Run `T13.5.1` to train allocation model using MMM outputs
