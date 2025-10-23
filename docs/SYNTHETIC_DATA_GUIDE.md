# Synthetic Multi-Tenant Dataset Generation Guide

## Overview

This document describes the synthetic multi-tenant dataset generation system for WeatherVane's weather elasticity validation. The system creates realistic datasets for 4 simulated tenants with weather-driven demand patterns, enabling validation of weather elasticity estimation models.

## Architecture

### Core Components

1. **`apps/model/synthetic_data_generator.py`** - Main data generation engine
   - `SyntheticDataGenerator` class with all generation logic
   - Support for 4 pre-configured synthetic tenants
   - Realistic weather patterns via Open-Meteo simulation
   - Weather-driven revenue elasticity

2. **`scripts/generate_synthetic_datasets.py`** - Command-line generation tool
   - Generates all 4 tenant datasets
   - Saves to data lake directory structure
   - Built-in validation checks
   - JSON metadata with ground truth elasticity

3. **`scripts/validate_synthetic_data.py`** - Validation pipeline
   - Loads synthetic datasets
   - Runs elasticity estimation
   - Compares estimated vs ground truth elasticity
   - Generates validation reports

### Test Suite

**`apps/model/tests/test_synthetic_data_generator.py`** - 16 comprehensive tests
- Generator initialization and configuration
- Weather generation with realistic patterns
- Revenue generation with weather sensitivity
- Shopify orders generation
- Meta and Google Ads data generation
- Klaviyo events generation
- Complete dataset generation
- Data persistence
- Weather-revenue correlation validation
- Reproducibility with fixed seeds
- Data quality metrics
- Elasticity ground truth validation

## Synthetic Tenants

### 1. demo_tenant_1: Seasonal Fashion Retailer
- **Location**: New York (40.7128, -74.0060)
- **Category**: Apparel
- **Base Daily Revenue**: $5,000
- **Weather Sensitivity**:
  - Temperature: +0.15 (cold → more demand)
  - Precipitation: -0.08 (rain → less demand)
- **Products**: winter_coats, summer_dresses, rain_gear

### 2. demo_tenant_2: Outdoor Recreation Gear
- **Location**: San Francisco (37.7749, -122.4194)
- **Category**: Outdoor equipment
- **Base Daily Revenue**: $8,000
- **Weather Sensitivity**:
  - Temperature: +0.12 (nice weather → more demand)
  - Precipitation: -0.18 (rain → less demand for outdoor gear)
- **Products**: hiking_boots, camping_gear, bicycles

### 3. demo_tenant_3: Home & Garden
- **Location**: Chicago (41.8781, -87.6298)
- **Category**: Home & Garden
- **Base Daily Revenue**: $4,500
- **Weather Sensitivity**:
  - Temperature: +0.10 (spring/fall gardening)
  - Precipitation: +0.06 (rain → indoor projects)
- **Products**: seeds, tools, fertilizer

### 4. demo_tenant_4: Coffee & Beverage Shop
- **Location**: Denver (39.7392, -104.9903)
- **Category**: Food & Beverage
- **Base Daily Revenue**: $3,500
- **Weather Sensitivity**:
  - Temperature: -0.20 (hot → less hot coffee demand)
  - Precipitation: +0.09 (rain → people indoors)
- **Products**: coffee, tea, pastries

## Data Generation

### Generate All Datasets

```bash
python scripts/generate_synthetic_datasets.py \
  --start-date 2024-01-01 \
  --end-date 2024-12-31 \
  --output-dir storage/lake/raw \
  --validate
```

### Key Features

1. **Realistic Weather Patterns**
   - Seasonal temperature variation with sigmoid-scaled impact
   - Smart weather signal scaling (-3.5 to 3.5 range)
   - Random precipitation events with realistic distribution
   - 7-day rolling averages and trend analysis
   - Anomaly calculations with seasonal adjustment

2. **Weather-Driven Revenue**
   - Base revenue per tenant with continuous weather influence
   - Dynamic weather sensitivity multipliers (0.6-0.9 range)
   - Smart noise scaling based on weather signal
   - Day-of-week effects (weekends 10% higher)
   - Seasonal trend components
   - Weather-aware variance modeling

3. **Shopify Orders**
   - Daily order counts proportional to revenue
   - Multiple products per tenant
   - Order values with realistic distribution
   - Net revenue (85% of order value)

4. **Ads Spend Data**
   - Meta Ads: $300-800/day, weather-adjusted CTR (0.8-2.5%)
   - Google Ads: $200-600/day, weather-adjusted CTR (1.5-4.5%)
   - Seasonal conversion rate patterns (±20% variation)
   - Weather-sensitive ad performance scaling
   - Daily impressions with weather multipliers
   - Clicks and conversions with seasonal effects
   - Realistic ROAS (1.5-4.0 range) with weather impact

5. **Klaviyo Email Events**
   - Daily sends (3-5 average)
   - Open rates (20-45%)
   - Click rates (10-25%)
   - Conversion attribution

6. **Data Persistence**
   - Parquet format for efficiency
   - Directory structure: `storage/lake/raw/{tenant_id}/`
   - Files:
     - `shopify_orders_*.parquet`
     - `meta_ads_*.parquet`
     - `google_ads_*.parquet`
     - `weather_daily_*.parquet`
     - `klaviyo_events_*.parquet`
     - `metadata_*.json` (with ground truth)

## Data Layout

### Storage Structure
```
storage/lake/raw/
├── demo_tenant_1/
│   ├── shopify_orders_20251023T130225Z.parquet
│   ├── meta_ads_20251023T130225Z.parquet
│   ├── google_ads_20251023T130225Z.parquet
│   ├── weather_daily_20251023T130225Z.parquet
│   ├── klaviyo_events_20251023T130225Z.parquet
│   └── metadata_20251023T130225Z.json
├── demo_tenant_2/
│   └── [same files]
├── demo_tenant_3/
│   └── [same files]
└── demo_tenant_4/
    └── [same files]
```

### Metadata Format
```json
{
  "tenant_id": "demo_tenant_1",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "num_days": 366,
  "elasticity_ground_truth": {
    "temperature_elasticity": 0.15,
    "precipitation_elasticity": -0.08,
    "mean_elasticity": 0.115
  },
  "generated_at": "20251023T130225Z"
}
```

## Validation

### Run Validation

```bash
python scripts/validate_synthetic_data.py \
  --output storage/artifacts/validation_report.json
```

### Validation Checks

1. **Data Quality**
   - No null values in key columns
   - No negative values in spend/revenue
   - Complete weather coverage
   - Realistic data ranges

2. **Elasticity Estimation**
   - Runs weather elasticity analysis on synthetic data
   - Compares estimated elasticity with ground truth
   - Computes absolute and percentage errors
   - Validates R² goodness of fit

3. **Example Results**
   - demo_tenant_1: R²=0.057, temperature error tracking
   - demo_tenant_2: R²=0.109
   - demo_tenant_3: R²=0.049
   - demo_tenant_4: R²=0.086

## Integration with Feature Store

The synthetic datasets integrate seamlessly with WeatherVane's feature engineering pipeline:

```python
from shared.feature_store.feature_builder import FeatureBuilder

builder = FeatureBuilder(lake_root="storage/lake/raw")
tenants = builder.list_tenants()  # ['demo_tenant_1', 'demo_tenant_2', ...]

# Build features for elasticity estimation
feature_matrix = builder.build(
    tenant_id="demo_tenant_1",
    start=date(2024, 1, 1),
    end=date(2024, 12, 31)
)
```

## Usage Examples

### Generate and Validate All Tenants

```bash
# Generate synthetic data for full year 2024
python scripts/generate_synthetic_datasets.py \
  --start-date 2024-01-01 \
  --end-date 2024-12-31 \
  --seed 42 \
  --validate

# Validate and save report
python scripts/validate_synthetic_data.py \
  --output storage/artifacts/validation_report.json
```

### Load in Python

```python
from apps.model.synthetic_data_generator import SyntheticDataGenerator
from datetime import date

gen = SyntheticDataGenerator(random_seed=42)

# Generate all tenants
datasets = gen.generate_all_tenants(
    start_date=date(2024, 1, 1),
    end_date=date(2024, 12, 31),
    output_dir="storage/lake/raw"
)

# Access individual dataset
dataset = datasets["demo_tenant_1"]
print(f"Orders: {dataset.shopify_orders.height}")
print(f"Weather rows: {dataset.weather_daily.height}")
print(f"Elasticity: {dataset.elasticity_ground_truth}")
```

### Use in Feature Builder

```python
from shared.feature_store.feature_builder import FeatureBuilder

builder = FeatureBuilder(lake_root="storage/lake/raw")

# Build feature matrix with weather data
matrix = builder.build(
    tenant_id="demo_tenant_1",
    start=date(2024, 1, 1),
    end=date(2024, 3, 31)
)

# Use in elasticity analysis
from apps.model.weather_elasticity_analysis import estimate_weather_elasticity

report = estimate_weather_elasticity(
    frame=matrix.frame,
    spend_cols=["meta_spend", "google_spend"],
    weather_cols=["temp_c", "precip_mm"],
    revenue_col="net_revenue",
    tenant_id="demo_tenant_1"
)
```

## Testing

### Run Unit Tests
```bash
python -m pytest apps/model/tests/test_synthetic_data_generator.py -v
```

### Test Coverage
- 16 tests covering all generation methods
- Weather pattern realism
- Revenue elasticity
- Data quality metrics
- Ground truth validation
- Reproducibility with fixed seeds

## Quality Standards

### Data Quality Metrics
- ✅ No null values in core columns
- ✅ No negative revenue or spend
- ✅ Weather data complete for all dates
- ✅ Realistic data distributions
- ✅ Weather-revenue correlation matches design

### Elasticity Validation
- Ground truth elasticity coefficients embedded in metadata
- Elasticity values in reasonable range (-1.0 to 1.0)
- Mean elasticity reflects average of absolute temperature and precipitation effects
- Separate elasticity parameters for temperature and precipitation

### Code Quality
- Type annotations throughout
- Comprehensive docstrings
- No deprecation warnings
- Follows PEP 8 style guide
- Clean error handling

## Recent Improvements (October 2025)

1. **Enhanced Weather Signal Scaling**
   - Smoother sigmoid-based scaling for extreme weather events
   - Wider range (-3.5 to 3.5) to better capture extreme sensitivity
   - More nuanced handling of weather anomalies

2. **Dynamic Revenue Generation**
   - Weather-sensitive noise scaling
   - Improved seasonal trend components
   - More realistic revenue distributions

3. **Marketing Channel Improvements**
   - Seasonal conversion rate variations
   - Weather-sensitive ad performance
   - Improved click-through rate modeling

4. **Geographic Coverage**
   - Extended to 6 major US cities (SF, NYC, LA, Chicago, Houston, Seattle)
   - Better regional market differentiation
   - More diverse weather patterns

## Future Enhancements

1. **Multi-Year Datasets**: Extend generation for 2-3 year periods with trend
2. **Holiday Effects**: Add holiday-specific demand patterns
3. **Competitive Data**: Simulate competitive pricing and market share effects
4. **Advanced Weather Patterns**: Include extreme weather events and climate trends
5. **Export Formats**: Support CSV, Parquet, and database ingestion

## Related Documentation

- **[Feature Store Guide](./FEATURE_STORE.md)** - Feature engineering pipeline
- **[Weather Elasticity Analysis](./WEATHER_ELASTICITY_ANALYSIS.md)** - Estimation methodology
- **[Data Lake Architecture](./DATA_LAKE_ARCHITECTURE.md)** - Data storage structure
- **[Quality Standards](./UNIVERSAL_TEST_STANDARDS.md)** - Testing and validation standards
