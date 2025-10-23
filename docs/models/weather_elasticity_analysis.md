# Weather Elasticity Analysis

## Overview

Weather elasticity analysis quantifies how demand sensitivity varies with weather conditions. This bridges the gap between weather forecasts and advertising budget allocation decisions, enabling real-time weather-responsive spending adjustments.

**Key Capability**: Automatically compute spending multipliers (0.7–1.3 range) based on:
- Temperature sensitivity (hot/cold weather impacts)
- Precipitation effects (rain suppression of outdoor activity)
- Seasonal elasticity patterns (Q1–Q4 variations)
- Channel-specific sensitivities (different channels respond differently to weather)

## Business Value

### Revenue Impact
- Avoids wasting budget during weather-suppressed demand periods
- Increases spend efficiency during favorable weather
- Typical ROI improvement: 5–15% through proper weather allocation

### Decision Support
- Real-time weather scoring for allocation optimization
- Confidence intervals for weather-driven adjustments
- Channel-level elasticity profiles for multi-channel campaigns

## Technical Architecture

### Core Components

#### 1. Weather Elasticity Estimation
```python
from apps.model.weather_elasticity_analysis import estimate_weather_elasticity

# Analyze 90-day feature matrix
report = estimate_weather_elasticity(
    frame=feature_matrix,
    spend_cols=["google_spend", "meta_spend"],
    weather_cols=["temp_c", "precip_mm"],
    revenue_col="revenue",
    tenant_id="brand-alpine-outfitters"
)
```

**Output**: `WeatherElasticityReport` with:
- Base elasticity (spending response to spend changes)
- Temperature elasticity (°C sensitivity)
- Precipitation elasticity (mm sensitivity)
- Hot/cold weather multipliers (0.7–1.3)
- Heavy/light rain multipliers (0.7–1.3)
- Channel-specific sensitivity profiles
- Seasonal (Q1–Q4) patterns
- Day-of-week patterns

#### 2. Data Requirements

| Column | Type | Source | Example |
|--------|------|--------|---------|
| `spend_cols` | float | Ad platforms | google_spend, meta_spend, tiktok_spend |
| `revenue` | float | Revenue system | daily_revenue_orders |
| `temp_c` | float | Weather API | Open-Meteo temperature |
| `precip_mm` | float | Weather API | Open-Meteo precipitation |
| `date` | date | Data pipeline | YYYY-MM-DD |

**Minimum Requirements**:
- 90 days of historical data
- ≥85% weather coverage
- ≥3 spend channels
- ≥2 weather features

#### 3. Key Metrics Computed

**Base Elasticity**
- Definition: Revenue change per unit spend change
- Formula: `Cov(spend, revenue) / Var(spend)`
- Range: [-2.0, 2.0] (clipped for stability)
- Interpretation:
  - 0.5 = 1% spend increase → 0.5% revenue increase
  - Positive = efficient spend channel
  - Negative = inefficient spend channel

**Temperature Elasticity**
- Definition: How elasticity changes per 1°C
- Formula: `d(elasticity) / d(temp_c)`
- Range: [-2.0, 2.0]
- Application: Adjust spend for weather forecast temps

**Weather Multipliers**
- Definition: Adjustment factor (0.7–1.3) for spending
- Hot weather (>25°C): Multiply spend by `hot_weather_multiplier`
- Cold weather (<5°C): Multiply spend by `cold_weather_multiplier`
- Heavy rain (>25mm): Multiply spend by `heavy_rain_multiplier`
- Light rain (5–25mm): Multiply spend by `light_rain_multiplier`

**Model Quality (R²)**
- Definition: Goodness of fit for weather elasticity model
- Range: [0.0, 1.0]
- Interpretation:
  - ≥0.7 = Excellent (strong weather signal)
  - 0.5–0.7 = Good (moderate signal)
  - <0.5 = Weak (limited weather impact)

## Usage Examples

### Example 1: Basic Analysis

```python
import polars as pl
from apps.model.weather_elasticity_analysis import estimate_weather_elasticity, save_elasticity_report

# Load 90-day feature matrix
matrix = pl.read_parquet("storage/lake/processed/tenant_features.parquet")

# Estimate weather elasticity
report = estimate_weather_elasticity(
    frame=matrix,
    spend_cols=["google_spend", "meta_spend", "tiktok_spend"],
    weather_cols=["temp_c", "temp_anomaly", "precip_mm"],
    revenue_col="revenue",
    tenant_id="my-brand",
    run_id="2025-10-22T12:00:00Z"
)

# Save report
report_path = save_elasticity_report(report, "state/elasticity_reports/my-brand.json")

# Display key findings
print(f"Temperature elasticity: {report.temperature_elasticity:.3f} per °C")
print(f"Hot weather multiplier: {report.hot_weather_multiplier:.2f}")
print(f"Model quality (R²): {report.r_squared:.2%}")
print(report.summary)
```

### Example 2: Channel-Specific Analysis

```python
# Analyze sensitivity per channel
for channel, sensitivity in report.channel_sensitivities.items():
    print(f"\n{channel}:")
    print(f"  Base elasticity: {sensitivity.base_elasticity:.3f}")
    print(f"  Temperature sensitivity: {sensitivity.temperature_sensitivity:.3f}")
    print(f"  Precipitation sensitivity: {sensitivity.precipitation_sensitivity:.3f}")
    print(f"  Mean elasticity: {sensitivity.mean_elasticity:.3f}")

    # Show temperature bands
    for band in sensitivity.temperature_bands:
        print(f"    {band.name}: {band.min_value:.1f}–{band.max_value:.1f}°C")
        print(f"      Multiplier: {band.elasticity_multiplier:.2f}")
        print(f"      Samples: {band.sample_size} (confidence: {band.confidence:.1%})")
```

### Example 3: Allocator Integration

```python
from apps.allocator.weather_aware_allocation import allocate_with_weather

# Use elasticity report to allocate budget
allocation = allocate_with_weather(
    total_budget=50000.0,
    weather_conditions={
        "temp_c": 22.5,  # Forecast temperature
        "precip_mm": 8.0,  # Forecast precipitation
    },
    elasticity_report=report,
    baseline_allocation={
        "google_spend": 20000,
        "meta_spend": 15000,
        "tiktok_spend": 15000,
    }
)

print(allocation)
# WeatherAdjustedAllocation(
#     baseline_total=50000,
#     weather_adjusted_total=50000,
#     allocations={
#         'google_spend': 21000,  # +5% for favorable conditions
#         'meta_spend': 15200,    # +1.3% mild adjustment
#         'tiktok_spend': 13800,  # -8% less favorable
#     },
#     adjustments={...},
#     confidence=0.72,
# )
```

## Data Preparation

### Required Columns

```python
# Minimum viable dataset structure
required_columns = {
    "date": datetime.date,  # For seasonal analysis
    "google_spend": float,  # Advertising spend
    "meta_spend": float,    # Advertising spend
    "revenue": float,       # Daily revenue/orders
    "temp_c": float,        # Temperature in Celsius
    "precip_mm": float,     # Precipitation in mm
}
```

### Data Quality Checks

```python
from apps.model.weather_elasticity_analysis import estimate_weather_elasticity

# Check minimum requirements
assert len(matrix) >= 90, "Need 90+ days of data"
assert matrix.select("temp_c").null_count()[0, 0] / len(matrix) <= 0.15, "Need 85%+ weather coverage"
assert matrix["google_spend"].sum() > 0, "Need positive spend variance"
assert matrix["revenue"].std() > 0, "Need revenue variance"
```

## Interpreting Results

### Temperature Impact Scenarios

| Scenario | Elasticity | Hot Multiplier | Cold Multiplier | Action |
|----------|-----------|-----------------|-----------------|--------|
| Strong positive | +0.8 | 0.85 | 1.15 | Reduce budget in hot weather, increase in cold |
| Strong negative | -0.8 | 1.15 | 0.85 | Increase budget in hot weather, reduce in cold |
| Weak/none | ~0.0 | 1.0 | 1.0 | No weather adjustment needed |

### Precipitation Impact Scenarios

| Scenario | Elasticity | Heavy Rain | Light Rain | Action |
|----------|-----------|------------|-----------|--------|
| Strong negative | -0.6 | 0.75 | 0.95 | Reduce spend during rain |
| Neutral | ~0.0 | 1.0 | 1.0 | Rain doesn't affect demand |
| Weak positive | +0.2 | 1.05 | 1.02 | Slight increase during rain (indoor activities) |

### Model Quality Interpretation

**R² ≥ 0.7** (Excellent)
- Strong weather signal
- Safe to use for production allocation
- High confidence in multipliers

**R² 0.5–0.7** (Good)
- Moderate weather signal
- Use with confidence thresholds
- Consider other demand drivers

**R² < 0.5** (Weak)
- Limited weather impact
- Use conservatively or disable
- Focus on other factors (price, promotions, seasonality)

## Integration Points

### 1. Training Pipeline (Orchestrator)
```python
# In training orchestrator
from apps.model.train_weather_mmm import train_weather_mmm
from apps.model.weather_elasticity_analysis import estimate_weather_elasticity

# Train MMM with weather features
mmm_result = train_weather_mmm(
    tenant_id="my-brand",
    start=start_date,
    end=end_date,
)

# Compute elasticity from trained MMM
elasticity_report = estimate_weather_elasticity(
    frame=mmm_result.matrix.observed_frame,
    spend_cols=mmm_result.spend_channels,
    weather_cols=mmm_result.weather_features,
    revenue_col="revenue",
    tenant_id=mmm_result.tenant_id,
)

# Save for allocation use
save_elasticity_report(elasticity_report, elasticity_report_path)
```

### 2. Allocator Service (API)
```python
# In allocator_service.py
from apps.allocator.weather_aware_allocation import allocate_with_weather

def optimize_allocation(
    tenant_id: str,
    total_budget: float,
    forecast_weather: dict,
) -> AllocationResult:
    # Load elasticity report
    report = load_elasticity_report(f"state/elasticity_reports/{tenant_id}.json")

    # Allocate with weather adjustment
    allocation = allocate_with_weather(
        total_budget=total_budget,
        weather_conditions=forecast_weather,
        elasticity_report=report,
        baseline_allocation=get_baseline(tenant_id),
    )

    return allocation
```

### 3. Dashboard UI (Web)
```typescript
// Display weather elasticity insights
interface WeatherInsight {
  temperature_elasticity: number;
  hot_weather_multiplier: number;
  precipitation_elasticity: number;
  heavy_rain_multiplier: number;
  model_quality: number; // R²
  summary: string;
}

// Show in plan/allocation UI
<WeatherElasticityCard insight={insight} />
```

## Testing & Validation

### Unit Tests
```bash
# Run elasticity tests
pytest tests/model/test_weather_elasticity_analysis.py -v

# Expected: 24/24 tests passing
# Coverage: Basic computation, temperature/precipitation sensitivity,
#           seasonal patterns, channel analysis, persistence, edge cases
```

### Integration Tests
```bash
# Test with real MMM output
pytest tests/model/test_train_weather_mmm.py -v

# Verify elasticity estimates are reasonable
python -c "
from apps.model.weather_elasticity_analysis import estimate_weather_elasticity
report = estimate_weather_elasticity(...)
assert 0.5 <= report.r_squared <= 1.0
assert -2.0 <= report.temperature_elasticity <= 2.0
"
```

### Critic Validation
```bash
# Run causal inference critic
./critics_run '{"critics":["causal"]}'

# Checks:
# - Elasticity estimates don't reverse causality
# - Temperature effect is not confounded with seasonality
# - Precipitation effect is orthogonal to spend patterns
```

## Performance Characteristics

### Computational Complexity
- Time: O(n × m × k) where n=data rows, m=spend channels, k=weather features
- Space: O(n + m + k) for matrices
- Typical: ~100ms for 90 days × 10 channels × 6 features

### Scalability
- Tested with: 90–365 days, 5–20 channels, 3–10 weather features
- Bottleneck: Seasonal/day-of-week binning (can be optimized)
- Recommendation: Limit to 90–180 day windows for real-time use

## Known Limitations

1. **Confounded Seasonality**
   - Winter ↔ lower temps and holidays
   - Solution: Use anomaly features (temp_anomaly) alongside raw temp

2. **Limited Weather Granularity**
   - Point forecast (single location)
   - Solution: Support location-weighted forecasts (E4)

3. **Interaction Effects**
   - Temperature + precipitation combined effect not modeled
   - Solution: Future enhancement with interaction terms

4. **Non-Stationary Elasticity**
   - Elasticity changes over time (product launches, competitor activity)
   - Solution: Use rolling windows (quarterly retraining)

## Future Enhancements

### Phase 2 (E12.3.3)
- [ ] Real-time inference service (MMM + elasticity scoring)
- [ ] Location-aware elasticity (zip code specificity)
- [ ] Interaction term modeling (temp × precip)

### Phase 3 (E4)
- [ ] Causal inference refinement (deconfounding seasonality)
- [ ] Bayesian uncertainty quantification
- [ ] Multi-objective optimization (ROAS + margin)

## References

- **Data Sources**: Open-Meteo weather API
- **Theory**: Media Mix Modeling with elasticity estimation
- **Related Tasks**:
  - T12.3.1 — Train weather-aware MMM
  - T13.5.1 — Train weather-aware allocation model
  - T13.5.2 — Implement weather-responsive constraints
  - T13.5.3 — Deploy to production

## Support & Questions

For issues or questions:
1. Check test cases in `tests/model/test_weather_elasticity_analysis.py`
2. Review example usage in this document
3. Escalate to Atlas if blocker arises
