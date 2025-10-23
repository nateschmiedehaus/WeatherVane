# Weather-Aware Allocation Model

## Overview

The weather-aware allocation model incorporates weather-driven demand elasticity estimates from MMM training into budget allocation decisions. This bridges the gap between understanding weather sensitivity (from MMM) and optimizing budget allocation based on that understanding.

**Key Innovation**: Weather-aware allocation adjusts spending recommendations based on current/forecasted weather conditions, allowing brands to capitalize on favorable weather and minimize waste during unfavorable conditions.

## Architecture

### Components

1. **Weather Sensitivity Estimation** (`estimate_weather_sensitivity`)
   - Extracts weather elasticity estimates from trained MMM model
   - Calculates sensitivity score (0-1) for each channel
   - Identifies which channels are most affected by weather

2. **Weather Multiplier Calculation** (`calculate_weather_multiplier`)
   - Applies current weather conditions to sensitivity estimates
   - Produces channel-specific spending multipliers (0.7-1.3 by default)
   - Configurable bounds and interaction strength

3. **Allocation Optimization** (`allocate_with_weather`)
   - Generates baseline allocation (without weather adjustment)
   - Creates weather-adjusted channel constraints
   - Solves optimization problem with adjusted constraints
   - Compares weather-aware vs baseline for diagnostics

4. **Result Persistence** (`save_allocation_result`, `load_allocation_result`)
   - Saves allocation decisions to JSON
   - Preserves diagnostics and sensitivity scores
   - Enables historical analysis and audit trails

## Data Structures

### WeatherSensitivityCoefficient

```python
@dataclass(frozen=True)
class WeatherSensitivityCoefficient:
    channel: str                          # e.g., "meta_spend"
    base_elasticity: float                # Base demand elasticity
    weather_features: Dict[str, float]    # e.g., {"temp_c": 0.15, "precip_mm": -0.1}
    mean_weather_multiplier: float        # Average weather impact
    sensitivity_score: float              # Normalized 0-1 sensitivity
```

### WeatherConditions

```python
@dataclass(frozen=True)
class WeatherConditions:
    timestamp: datetime                   # Current/forecast time
    features: Dict[str, float]           # Weather feature values
    region: str = "global"               # Geographic context
```

### WeatherAwareAllocationRequest

```python
@dataclass(frozen=True)
class WeatherAwareAllocationRequest:
    mmm_model: MMMModel                  # Trained MMM with elasticity estimates
    channels: List[ChannelConstraint]    # Channel constraints (spend bounds)
    total_budget: float                  # Total budget to allocate
    weather: WeatherConditions           # Current/forecasted weather
    config: WeatherMultiplierConfig      # Configuration for multiplier calculation
    roas_floor: float = 1.0
    learning_cap: float = 0.30
    risk_aversion: float = 0.25
    context_tags: List[str] = []
```

### WeatherAwareAllocationResult

```python
@dataclass(frozen=True)
class WeatherAwareAllocationResult:
    allocation_spends: Dict[str, float]        # Recommended spends by channel
    weather_multipliers: Dict[str, float]      # Applied weather adjustments
    total_revenue: float                       # Projected revenue
    profit: float                              # Projected profit
    weather_sensitivity_scores: Dict[str, WeatherSensitivityCoefficient]
    baseline_allocation_spends: Dict[str, float]  # For comparison
    diagnostics: Dict[str, Any]                # Revenue lift %, multiplier config, etc.
```

## Example Usage

### Basic Allocation with Weather

```python
from apps.allocator.marketing_mix import ChannelConstraint
from apps.allocator.weather_aware_allocation import (
    WeatherAwareAllocationRequest,
    WeatherConditions,
    allocate_with_weather,
)
from datetime import datetime

# Load trained MMM model
mmm_model = ...  # Loaded from train_weather_mmm()

# Define channels
channels = [
    ChannelConstraint(
        name="meta_spend",
        current_spend=1000.0,
        min_spend=500.0,
        max_spend=2000.0,
    ),
    ChannelConstraint(
        name="google_spend",
        current_spend=800.0,
        min_spend=400.0,
        max_spend=1600.0,
    ),
]

# Define weather
weather = WeatherConditions(
    timestamp=datetime.utcnow(),
    features={
        "temp_c": 22.5,
        "precip_mm": 0.0,
        "temp_anomaly": 2.0,
    },
    region="nyc",
)

# Create and execute allocation request
request = WeatherAwareAllocationRequest(
    mmm_model=mmm_model,
    channels=channels,
    total_budget=2000.0,
    weather=weather,
)

result = allocate_with_weather(request)

# Use results
print(f"Recommended Meta spend: ${result.allocation_spends['meta_spend']:.2f}")
print(f"Weather multiplier: {result.weather_multipliers['meta_spend']:.2f}x")
print(f"Projected revenue: ${result.total_revenue:.2f}")
print(f"Revenue lift vs baseline: {result.diagnostics['revenue_lift_pct']:.1f}%")
```

### Analyzing Weather Sensitivity

```python
from apps.allocator.weather_aware_allocation import estimate_weather_sensitivity

# Estimate sensitivity for all channels
sensitivity = estimate_weather_sensitivity(
    mmm_model=mmm_model,
    weather_features=["temp_c", "precip_mm", "humidity"]
)

# Analyze which channels are most weather-sensitive
for channel, score in sensitivity.items():
    print(f"{channel}:")
    print(f"  Sensitivity score: {score.sensitivity_score:.2f}")
    print(f"  Mean multiplier: {score.mean_weather_multiplier:.3f}")
    print(f"  Weather features: {score.weather_features}")
```

## Configuration

### WeatherMultiplierConfig

Controls how weather conditions affect spending multipliers:

```python
@dataclass(frozen=True)
class WeatherMultiplierConfig:
    min_multiplier: float = 0.7          # Don't reduce spend below 70%
    max_multiplier: float = 1.3          # Don't increase spend above 130%
    interaction_strength: float = 0.5    # How strongly weather influences allocation
    base_roas_adjustment: float = 0.1    # Adjustment factor per unit sensitivity
```

**Tuning Guide**:
- `min_multiplier`: Set higher (e.g., 0.85) to avoid aggressive cuts during poor weather
- `max_multiplier`: Set lower (e.g., 1.15) to be conservative with increases
- `interaction_strength`: Increase (toward 1.0) to make weather more influential
- `base_roas_adjustment`: Higher values amplify weather impact on ROAS

## Integration with MMM

The weather-aware allocation model depends on MMM training output:

1. **Spend Elasticity**: Base demand elasticity for each channel (e.g., `meta_spend: 0.8`)
2. **Weather Elasticity**: Interaction terms between weather and demand (from MMM training)
3. **Mean ROAS**: Baseline ROAS by channel
4. **Mean Spend**: Historical average spend for calibration

Example MMM output:
```json
{
  "elasticity": {
    "meta_spend": 0.8,
    "google_spend": 0.6,
    "temp_c": 0.15,
    "precip_mm": -0.1,
    "temp_anomaly": 0.05
  },
  "mean_roas": {
    "meta_spend": 2.5,
    "google_spend": 2.0
  }
}
```

## Validation & Testing

### Test Coverage

- **19 unit tests** covering:
  - Weather sensitivity estimation (3 tests)
  - Weather multiplier calculation (4 tests)
  - Full allocation workflow (5 tests)
  - Result persistence (2 tests)
  - Comparison with baseline (2 tests)
  - Edge cases (3 tests)

- **5 integration tests** using trained MMM models:
  - Weather sensitivity from trained models
  - End-to-end allocation workflow
  - Baseline vs weather-adjusted comparison
  - Diagnostics completeness
  - Metadata preservation

### Running Tests

```bash
# Unit tests
pytest tests/apps/allocator/test_weather_aware_allocation.py -v

# Integration tests (requires trained MMM)
pytest tests/model/test_weather_aware_allocation_integration.py -v

# All tests
pytest tests/apps/allocator/test_weather_aware_allocation.py \
        tests/model/test_weather_aware_allocation_integration.py -v
```

## Performance Characteristics

- **Sensitivity Estimation**: O(channels × weather_features) - typically <1ms
- **Multiplier Calculation**: O(weather_features) per channel - typically <1ms per channel
- **Full Allocation**: Depends on optimization solver (cvxpy) - typically 100-500ms
- **Result Serialization**: O(channels + diagnostics) - typically <5ms

## Future Enhancements

1. **Adaptive Multiplier Bounds**: Learn bounds from historical performance
2. **Multi-Region Support**: Regional weather + allocation correlation
3. **Confidence Intervals**: Uncertainty quantification in sensitivity scores
4. **Real-time Forecasting**: Integration with weather forecast APIs
5. **Causal Validation**: Validate weather elasticity causality post-campaign
6. **Channel Interactions**: Model cross-channel weather effects

## Related Documentation

- [Weather MMM Training](./WEATHER_MMM_TRAINING.md)
- [MMM Model Integration](./MMM_MODEL_INTEGRATION.md)
- [Allocation Optimizer](../api/allocator.md)
- [Feature Engineering Pipeline](./FEATURE_ENGINEERING.md)
