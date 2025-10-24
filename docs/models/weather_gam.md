# Weather-aware Generalized Additive Model (GAM)

A weather-sensitive GAM implementation that captures non-linear weather effects and marketing interactions for revenue prediction.

## Overview

The weather-aware GAM model:
- Captures non-linear relationships using smoothing splines
- Models weather-marketing interactions using tensor product terms
- Automatically falls back to linear regression for small datasets
- Provides feature importance and ROAS metrics
- Validates data quality before fitting

## Usage

```python
from apps.modeling.weather_gam import train_weather_gam
from datetime import datetime

# Train a model for a specific tenant
model = train_weather_gam(
    tenant_id="my_tenant",
    start=datetime(2024, 1, 1),
    end=datetime(2024, 12, 31),
    lake_root="storage/lake/raw",
    output_root="storage/models/baseline"
)

# Make predictions
predictions = model.predict(new_data)

# Get feature importance
importance = model.get_feature_importance()
```

## Model Details

### Weather Features
The model automatically identifies weather-related features using these keywords:
```python
WEATHER_KEYWORDS = {
    "temp", "precip", "humidity", "snow",
    "rain", "wind", "cloud", "pressure"
}
```

### Model Architecture
- Weather features get higher capacity smoothers (12 knots) to capture threshold effects
- Marketing features get standard smoothers
- Tensor product terms model weather-marketing interactions
- Grid search for regularization using absolute-revenue weights

### Fallback Mechanism
For small datasets (< max(24, 4 * feature_count) rows), the model falls back to linear regression using:
- numpy.linalg.lstsq for stability
- Coefficient-based feature importance

### ROAS Metrics
The model calculates:
- Mean ROAS by marketing channel
- Spend elasticity
- Base ROAS
- Mean spend by channel

### Data Requirements

| Requirement | Value |
|------------|-------|
| Minimum rows | max(24, 4 * feature_count) |
| Feature types | Numeric with ≥2 unique values |
| Required columns | net_revenue + weather/marketing features |

### Data Validation
The model performs these checks before fitting:
- Row count validation
- Data completeness
- Feature variance
- Target column presence
- Data quality metrics

## Example Output

```python
model.mean_roas
{
    'facebook_spend': 2.5,  # $2.50 revenue per $1 spent
    'google_spend': 3.1     # $3.10 revenue per $1 spent
}

model.elasticity
{
    'facebook_spend': 0.8,  # 0.8% revenue increase per 1% spend increase
    'google_spend': 0.9     # 0.9% revenue increase per 1% spend increase
}

model.get_feature_importance()
{
    'temp_c': 0.3,         # Temperature explains 30% of variance
    'precip_mm': 0.1,      # Precipitation explains 10% of variance
    'facebook_spend': 0.4,  # Facebook spend explains 40% of variance
    'google_spend': 0.2     # Google spend explains 20% of variance
}
```

## Implementation

The model is implemented in `apps/modeling/weather_gam.py` with comprehensive tests in `test_weather_gam.py`.

Key components:
- WeatherGAMModel class: Core model implementation
- train_weather_gam function: Convenient training interface
- Data quality validation integration
- Feature store integration for data loading

## Testing

The implementation includes comprehensive tests covering:
- Model initialization and fitting
- Weather and marketing feature identification
- Data requirements validation
- GAM and linear fallback paths
- ROAS metrics calculation
- Error handling
- Feature importance computation
- Prediction functionality

## Dependencies

- pygam: For GAM modeling
- numpy: For linear algebra operations
- pandas: For data manipulation
- polars: For data loading
- shared.feature_store: For feature engineering
- shared.services.data_quality: For data validation