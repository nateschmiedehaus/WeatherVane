# Weather-Responsive Budget Allocation Constraints

## Overview

This document describes the weather-responsive budget allocation constraints system (Task T13.5.2), which enables WeatherVane to adjust channel budget boundaries based on weather forecasts, enabling forward-looking allocation planning that accounts for upcoming weather patterns.

## Problem Statement

Previous implementation (T13.5.1) applied **current weather** to adjust allocation decisions in real-time. However, decision-makers also need to **plan ahead** using forecast data to:

- Reserve more budget for channels resilient to upcoming poor weather
- Capitalize on favorable weather windows by pre-allocating budget
- Reduce budget for channels vulnerable to forecasted weather patterns
- Create time-segmented allocation plans (e.g., weekly budgets)

## Architecture

### Core Concepts

**1. Weather Forecasts**
- `WeatherForecast`: Single timestep of forecast data (date, features, confidence)
- `ForecastWindow`: Collection of forecasts over a time period with aggregation strategy

**2. Constraint Multipliers**
- `ConstraintMultiplier`: Forecast-derived adjustment factor for channel budget bounds
  - `min_spend_multiplier`: Adjustment for minimum budget
  - `max_spend_multiplier`: Adjustment for maximum budget
  - `current_spend_multiplier`: Adjustment for baseline spend
  - `confidence`: 0-1 scale reflecting forecast reliability

**3. Time Aggregation Periods**
- `DAILY`: Separate constraints per day
- `WEEKLY`: Aggregate constraints by week
- `SCENARIO`: Single constraint across entire forecast window

### Key Algorithms

#### 1. Forecast Feature Aggregation
```python
def _aggregate_forecast_features(
    forecasts: List[WeatherForecast],
    aggregation_period: ForecastAggregationPeriod,
) -> Tuple[Dict[str, float], Dict[str, Dict[str, float]]]
```

**Purpose**: Reduce multi-timestep forecast data to aggregated features
**Process**:
1. Group forecasts by aggregation period (daily/weekly/scenario)
2. Calculate mean values for each weather feature per period
3. Return both global aggregate and period-specific values

**Example**:
```
Input: 7-day forecast with temp_c and precip_mm
Scenario aggregation output:
- Aggregated: {"temp_c": 21.5, "precip_mm": 2.1}
```

#### 2. Constraint Multiplier Calculation
```python
def _calculate_constraint_multipliers(
    mmm_model: MMMModel,
    sensitivity_scores: Dict[str, WeatherSensitivityCoefficient],
    aggregated_features: Dict[str, float],
    period_features: Dict[str, Dict[str, float]],
    config: WeatherMultiplierConfig,
) -> Tuple[Dict[str, ConstraintMultiplier], Dict[str, Dict[str, float]]]
```

**Purpose**: Derive constraint multipliers from forecast-sensitivity interactions
**Process**:
1. Load channel weather sensitivities from MMM model
2. For each channel, calculate weather impact:
   - `impact = sum(elasticity_i × forecast_feature_i)`
3. Normalize impact to multiplier range [min, max]
4. Apply asymmetric constraints:
   - Negative impact (bad weather): Tighten max_spend more than min_spend
   - Positive impact (good weather): Expand max_spend more than min_spend

**Example**:
```
Channel: "spend_search"
Sensitivity: temp_c elasticity = +0.15 (benefits from warmth)
Forecast: +5°C anomaly above baseline
Impact: 0.15 × 5 = +0.75
Multiplier: 1.0 + (0.75 × 0.5) = 1.375 (clamped to max_multiplier=1.3)

Result:
- min_spend_multiplier: 1.3 (allow higher floor)
- max_spend_multiplier: 1.3 (expand opportunity)
```

#### 3. Constraint Building
```python
def build_weather_constraints(
    scenario: WeatherConstraintScenario,
) -> WeatherConstraintResult
```

**Purpose**: Apply forecast-derived constraints to channel budget bounds
**Process**:
1. Extract weather sensitivity from MMM
2. Aggregate forecast features
3. Calculate multipliers for each channel
4. Transform base ChannelConstraint objects:
   - `new_min = old_min × min_spend_multiplier`
   - `new_max = old_max × max_spend_multiplier`
5. Return adjusted constraints ready for allocation

## Usage Examples

### Basic Scenario: Single-Period Forecast Constraints

```python
from datetime import datetime, timedelta, timezone
from apps.allocator.weather_constraints import (
    WeatherForecast,
    ForecastWindow,
    WeatherConstraintScenario,
    build_weather_constraints,
)
from apps.allocator.marketing_mix import ChannelConstraint

# Create 7-day forecast
now = datetime.now(timezone.utc)
forecasts = [
    WeatherForecast(
        timestamp=now + timedelta(days=i),
        date=(now + timedelta(days=i)).date(),
        features={
            "temp_c": 20.0 + (i * 0.5),  # Warming trend
            "precip_mm": 2.0 if i % 2 == 0 else 0.5,  # Variable rain
        },
    )
    for i in range(7)
]

window = ForecastWindow(
    start=now,
    end=now + timedelta(days=7),
    forecasts=forecasts,
    aggregation_period=ForecastAggregationPeriod.SCENARIO,
)

# Define base channel constraints
channels = [
    ChannelConstraint(
        name="spend_search",
        current_spend=2000.0,
        min_spend=1000.0,
        max_spend=5000.0,
    ),
    ChannelConstraint(
        name="spend_social",
        current_spend=1000.0,
        min_spend=500.0,
        max_spend=2500.0,
    ),
]

# Build constraints
scenario = WeatherConstraintScenario(
    mmm_model=trained_mmm,
    channels=channels,
    forecast_window=window,
)

result = build_weather_constraints(scenario)

# Use result.adjusted_channels for allocation
# result.constrained_channels contains individual multipliers
# result.confidence_score indicates forecast reliability
```

### Multi-Period Planning: Weekly Budget Planning

```python
# Create 14-day forecast with weekly aggregation
forecasts = [
    WeatherForecast(
        timestamp=now + timedelta(days=i),
        date=(now + timedelta(days=i)).date(),
        features={
            "temp_c": 20.0 if i < 7 else 25.0,  # Week 1: cool, Week 2: warm
            "precip_mm": 3.0 if i < 7 else 1.0,  # Week 1: rainy, Week 2: dry
        },
    )
    for i in range(14)
]

window = ForecastWindow(
    start=now,
    end=now + timedelta(days=14),
    forecasts=forecasts,
    aggregation_period=ForecastAggregationPeriod.WEEKLY,
)

scenario = WeatherConstraintScenario(
    mmm_model=trained_mmm,
    channels=channels,
    forecast_window=window,
)

result = apply_forecast_window_constraints(channels, scenario)

# result["time_segments"] contains period-specific constraints
# Each week gets separate budget recommendations
for period_key, period_channels in result["time_segments"].items():
    # Use period_channels for that week's allocation
    pass
```

### Advanced: Custom Multiplier Configuration

```python
from apps.allocator.weather_aware_allocation import WeatherMultiplierConfig

config = WeatherMultiplierConfig(
    min_multiplier=0.5,      # Don't reduce spend below 50%
    max_multiplier=1.5,      # Don't increase above 150%
    interaction_strength=0.8, # Strong weather response (0-1)
    base_roas_adjustment=0.15, # Per-unit weather sensitivity
)

scenario = WeatherConstraintScenario(
    mmm_model=trained_mmm,
    channels=channels,
    forecast_window=window,
    multiplier_config=config,
)

result = build_weather_constraints(scenario)
```

## Integration with Allocator

### Workflow

```
Forecast Data → Weather Constraints → Constrained Channels → Marketing Mix Solver
                  (T13.5.2)                                    (T13.5.1)
```

**Step 1: Forecast-Based Constraints**
```python
constraint_result = build_weather_constraints(scenario)
constrained_channels = constraint_result.adjusted_channels
```

**Step 2: Pass to Allocation**
```python
from apps.allocator.marketing_mix import MarketingMixScenario, solve_marketing_mix

allocation_scenario = MarketingMixScenario(
    mmm_model=trained_mmm,
    channels=constrained_channels,  # Pre-constrained by weather
    total_budget=5000.0,
    roas_floor=1.0,
)

allocation = solve_marketing_mix(allocation_scenario)
```

### Why This Matters

**Without forecast constraints**:
- Allocator treats all days equally
- Poor weather windows get normal budgets (waste)
- Good weather windows miss opportunities (lost revenue)

**With forecast constraints**:
- Allocator respects forecast-driven budget bounds
- Automatically reserves less for poor weather periods
- Automatically capitalizes on good weather windows
- Time-segmented allocation possible for periodic planning

## Technical Details

### Confidence Scoring

Each constraint carries a confidence score (0-1) reflecting forecast reliability:

```python
# Calculate overall confidence
confidence_scores = [m.confidence for m in constraint_multipliers.values()]
overall_confidence = float(np.min(confidence_scores))
```

**Interpretation**:
- `confidence ≥ 0.9`: High-confidence forecast (use fully)
- `0.8 ≤ confidence < 0.9`: Moderate confidence (apply with caution)
- `confidence < 0.8`: Low-confidence forecast (consider conservative multipliers)

### Asymmetric Constraints

The system applies different multiplier weights to min/max based on weather direction:

**Bad Weather** (negative impact):
- `min_spend_multiplier = 0.85 × constrained_multiplier` (allow flexibility)
- `max_spend_multiplier = constrained_multiplier` (cap at reduced level)

**Good Weather** (positive impact):
- `min_spend_multiplier = constrained_multiplier` (maintain baseline)
- `max_spend_multiplier = 1.15 × constrained_multiplier` (expand opportunity)

This prevents over-constraining channels while still respecting forecast signals.

### Handling Missing Sensitivity

Channels without weather sensitivity receive neutral multipliers (1.0):
```python
if not sensitivity.weather_features:
    return ConstraintMultiplier(
        min_spend_multiplier=1.0,
        max_spend_multiplier=1.0,
        # ...
    )
```

## Testing Coverage

### Unit Tests (18 tests)
- Forecast creation and validation
- Feature aggregation (daily, weekly, scenario)
- Constraint multiplier calculation
- Bounds enforcement
- Edge cases (empty features, single forecast, etc.)

### Integration Tests (5 tests)
- Constraints with trained MMM models
- Effect on allocation decisions
- Time-segmented planning
- Confidence score behavior
- Constraint-respecting allocation

**Total Coverage**: 23 tests, 100% passing

## Performance Characteristics

- **Time Complexity**: O(n_forecasts × n_channels × n_features)
- **Space Complexity**: O(n_forecasts × n_channels × n_features)
- **Typical Runtime**: <100ms for 14-day forecast with 5 channels

## Future Enhancements

1. **Probabilistic Forecasts**: Support forecast ensembles with percentile constraints
2. **Rolling Windows**: Implement constraint smoothing across time periods
3. **Scenario Planning**: Support conditional constraints ("if temp > 25°C, then...")
4. **Adaptive Multipliers**: Learn multiplier strength from historical performance
5. **Uncertainty Quantification**: Return constraint confidence intervals

## Related Tasks

- **T13.5.1**: Train weather-aware allocation model (implemented ✓)
- **T12.3.1**: Train weather-aware MMM (implemented ✓)
- **T12.3.2**: Estimate weather sensitivity elasticity (implemented ✓)

## Files Modified/Created

### New Files
- `apps/allocator/weather_constraints.py` (430 lines)
- `tests/allocator/test_weather_constraints.py` (18 unit tests)
- `tests/model/test_weather_constraints_integration.py` (5 integration tests)

### Documentation
- `docs/WEATHER_RESPONSIVE_CONSTRAINTS.md` (this file)

## Summary

Weather-responsive budget allocation constraints enable WeatherVane to:

1. **Plan ahead** using forecast data to shape budget allocations
2. **Reduce waste** by constraining spend during poor weather
3. **Capture opportunity** by expanding budgets in favorable conditions
4. **Support periodic planning** with time-segmented constraints
5. **Track confidence** with reliability metrics for each forecast

The system integrates seamlessly with the existing MMM-based allocation solver, adding a critical forward-looking capability to the platform.
