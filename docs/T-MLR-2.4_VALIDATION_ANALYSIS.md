# T-MLR-2.4: Model Performance Validation Analysis

**Status**: ✅ COMPLETED
**Date**: 2025-10-22
**Task**: Validate model performance against objective thresholds
**Prerequisite**: T-MLR-2.3 (Train models on all 20 synthetic tenants)
**Unblocks**: T-MLR-2.5 (Compare models to baseline)

---

## Executive Summary

Models trained in T-MLR-2.3 have been validated against 7 objective performance thresholds across 20 synthetic tenants. **Results show models are NOT ready for production** but contain useful signals for PoC exploration.

### Key Findings

| Threshold Level | Pass Rate | Details |
|---|---|---|
| **CRITICAL** | 0/3 (0%) | ✗ All 3 critical thresholds failed |
| **STRONG** | 0/2 (0%) | ✗ No models show strong predictive power |
| **ACCEPTABLE** | 1/2 (50%) | ✓ Predictions vary (not constant); ~ Minimal R² signal detected |
| **EXPLORATORY** | N/A | - Framework available for research use |

### Overall Assessment

- **Production Readiness**: ❌ NOT READY
- **Pilot Readiness**: ❌ NOT READY
- **PoC Readiness**: ⚠️ LIMITED (only 3 tenants show R² > 0.50)
- **Research Value**: ✓ USEFUL (baseline established for future optimization)

---

## Validation Framework

### Threshold Definitions

The validation framework defines 4 threshold levels, each with specific objectives:

#### 1. CRITICAL Thresholds (Must Pass for Production)

These 3 thresholds are non-negotiable requirements for production deployment:

| Threshold | Metric | Requirement | Rationale |
|---|---|---|---|
| **min_r2_for_production** | holdout_r2 | ≥ 0.30 | Models must explain ≥30% of variance to support reliable allocation decisions. Lower performance creates allocation risk. |
| **r2_consistency** | train/holdout R² ratio | ≥ 0.75 | Prevents overfitting. If train R² >> holdout R², model captured noise instead of signal. |
| **positive_weather_signal** | weather_fit_score | ≥ 0.15 | Weather features must contribute ≥15% of total influence. WeatherVane's core value depends on this. |

#### 2. STRONG Thresholds (Expected for Pilot Deployments)

These 2 thresholds indicate models suitable for limited customer pilots:

| Threshold | Metric | Requirement | Rationale |
|---|---|---|---|
| **strong_r2_threshold** | holdout_r2 | ≥ 0.50 | Strong predictive power where weather is primary revenue driver. |
| **low_mae_relative** | MAE / mean_target | ≤ 0.35 | Predictions within 35% of typical revenue value, enabling actionable recommendations. |

#### 3. ACCEPTABLE Thresholds (Minimum PoC Viability)

These 2 thresholds define baseline exploratory quality:

| Threshold | Metric | Requirement | Rationale |
|---|---|---|---|
| **acceptable_r2** | holdout_r2 | ≥ 0.10 | Minimum signal detection. Better than random but requires validation. |
| **stable_predictions** | std(predictions) | > 0.0 | Predictions vary across samples (model is learning, not returning constants). |

---

## Detailed Results

### Critical Thresholds Analysis

#### ✗ FAIL: min_r2_for_production

```
Metric:       holdout_r2
Threshold:    ≥ 0.30
Actual (mean): 0.1096
Pass Rate:    15% (3/20 tenants)
Failing:      17 of 20 tenants
```

**Interpretation**: Models explain only ~11% of variance on average. Only 3 tenants (extreme_rain_gear, high_outdoor_gear, high_umbrella_rain) achieve 30%+ R².

**Root Cause Analysis**:
- Baseline model with limited features (GAM with weather + marketing spend)
- Synthetic data may be too simple or uncorrelated with assumed drivers
- Time-series patterns not adequately captured by 5-fold cross-validation splits
- No interaction terms, lagged features, or advanced feature engineering

**Implication**: Models are unsuitable for production allocation decisions where accuracy directly impacts customer ROI.

#### ✗ FAIL: r2_consistency (Overfitting Check)

```
Metric:       train_holdout_r2_ratio
Threshold:    ≥ 0.75 (train/holdout ratio)
Actual (mean): 0.35
Pass Rate:    35% (7/20 tenants)
Failing:      13 of 20 tenants
```

**Interpretation**: Average train R² is ~3x higher than holdout R², indicating significant overfitting. Model memorized training patterns but doesn't generalize.

**Root Cause Analysis**:
- Small synthetic tenant datasets (~5,475 total rows, split 80/20 for folds)
- Limited features relative to data variability
- Cross-validation fold boundaries may not respect time-series causality
- Regularization may be insufficient

**Implication**: Even trained models fail to predict unseen data reliably. Deployments would quickly degrade in production.

#### ✗ FAIL: positive_weather_signal

```
Metric:       weather_fit_score
Threshold:    ≥ 0.15
Actual (mean): 0.00
Pass Rate:    0% (0/20 tenants)
Failing:      20 of 20 tenants
```

**Interpretation**: NO tenants show weather features contributing ≥15% of total model influence. Weather signals are negligible or absent.

**Root Cause Analysis**:
1. **Feature Construction**: Weather features may not be properly joined to the revenue matrix
2. **Data Quality**: Synthetic weather data might lack realism or correlation with synthetic sales
3. **Model Capacity**: GAM with few weather terms can't capture nonlinear weather-revenue relationships
4. **Feature Importance Calculation**: Weather elasticity scores may be computed incorrectly

**Critical Issue**: This failure directly undermines WeatherVane's value proposition. If weather features don't drive predictions, the product isn't suitable for these brands.

### Strong Thresholds Analysis

#### ✗ FAIL: strong_r2_threshold

```
Metric:       holdout_r2
Threshold:    ≥ 0.50
Actual (mean): 0.1096
Pass Rate:    15% (3/20 tenants)
```

**Interpretation**: Only 3 of 20 tenants show strong predictive power. The other 17 have R² < 0.50, many negative.

**Specific Performers**:
- ✓ extreme_rain_gear: R² = 0.713 (BEST)
- ✓ high_outdoor_gear: R² = 0.590
- ✓ high_umbrella_rain: R² = 0.673

**Insight**: Rain-related product categories show the strongest signals, suggesting those synthetic tenants' revenue data has genuine weather sensitivity. Other categories' data may lack meaningful weather correlations.

#### ✗ FAIL: low_mae_relative

```
Metric:       MAE / mean_target
Threshold:    ≤ 0.35
Actual (mean): 0.381
Pass Rate:    15% (3/20 tenants)
```

**Interpretation**: Prediction errors average ~38% of typical revenue, exceeding the 35% threshold. Only 3 tenants meet this requirement.

**Implication**: Allocating budget based on these predictions introduces significant error. A $1,000 allocation recommendation might be off by $380, risking customer trust.

### Acceptable Thresholds Analysis

#### ⚠️ MARGINAL FAIL: acceptable_r2

```
Metric:       holdout_r2
Threshold:    ≥ 0.10
Actual (mean): 0.1096
Pass Rate:    25% (5/20 tenants)
```

**Interpretation**: Mean R² slightly exceeds 0.10 threshold, but only 5 tenants individually pass. The others have negative R² (worse than predicting the mean).

**Note**: This threshold passes marginally at the aggregate level but fails at the individual tenant level for 75% of models.

#### ✓ PASS: stable_predictions

```
Metric:       std(predictions)
Threshold:    > 0.0
Actual (mean): 44.47
Pass Rate:    100% (20/20 tenants)
```

**Interpretation**: All models produce varying predictions across samples. None collapse to a constant value.

**Implication**: Models are learning *something*, even if predictive power is low. This is a necessary but insufficient condition.

---

## Root Cause Analysis: Why All Critical Thresholds Failed

### Issue 1: Insufficient Variance Explained

**Evidence**: Mean holdout R² = 0.11 (vs. 0.30 target)

**Contributing Factors**:

1. **Feature Engineering Gaps**
   - Current model uses only raw features + simple lags
   - No interaction terms (weather × spend, day-of-week × weather)
   - No domain-specific features (competitor activity, inventory, customer segments)
   - Rolling window features may not capture long-term trends

2. **Data Quality Issues**
   - Synthetic data may lack realistic patterns (e.g., constant revenue regardless of weather)
   - Weather-demand correlation may be weak or absent in synthetic generation
   - Temporal patterns (seasonality, trend) may be missing
   - Sparse categorical information (market conditions, competitor moves)

3. **Model Simplicity**
   - GAM with limited terms and interaction restrictions
   - No ensemble methods or more sophisticated architectures
   - Linear relationships assumed; real weather-demand likely nonlinear
   - No probabilistic modeling of uncertainty

### Issue 2: Severe Overfitting

**Evidence**: Train R² ≈ 3× holdout R² on average

**Contributing Factors**:

1. **Small Sample Sizes**
   - Per-tenant: ~5,475 rows over 15 years
   - Per fold: ~1,095 test rows (small validation set)
   - Not enough data to fit GAM parameters reliably

2. **Time-Series Leakage**
   - Standard k-fold CV doesn't respect temporal ordering
   - Models can "see the future" during training, inflating train R²
   - Holdout folds from different time periods may have different patterns

3. **Feature-to-Sample Ratio**
   - Even with ~20-30 features, data is limited
   - High-dimensional feature space relative to observations

### Issue 3: Zero Weather Signal

**Evidence**: Weather fit score = 0.0 for all tenants

**Contributing Factors**:

1. **Feature Construction**
   - Weather features may not be properly aligned with revenue data (dates, timezones)
   - Weather aggregation (daily, weekly, monthly) may be mismatched to revenue frequency

2. **Data Quality**
   - Synthetic weather data generation may not create realistic patterns
   - Correlation between synthetic weather and revenue may be artificially weak

3. **Model Fit Issues**
   - GAM may struggle to fit weather signals due to regularization
   - Weather elasticity calculation may have a bug (computing 0 by accident)

4. **Feature Selection**
   - Model may discard weather features as insignificant vs. spend
   - Marketing spend may dominate, overshadowing weather effects

---

## Actionable Next Steps

This validation establishes the baseline. The following improvements (in T-MLR-2.5+) should incrementally improve performance:

### Priority 1: Understand Why Weather Signal = 0

**Action**: Debug weather feature construction and elasticity calculation
- Verify weather features are correctly joined to revenue matrix
- Check weather data quality and correlation with actual synthetic revenue
- Review feature importance calculation for bugs
- Consider weather-spend interaction terms

**Expected Impact**: Enable weather features to contribute meaningfully to predictions

### Priority 2: Improve Feature Engineering

**Action**: Add domain-driven features
- Interaction terms (weather × spend, weather × day-of-week)
- Lag features (previous week/month revenue, weather)
- Seasonal indicators (holiday flags, seasonal indices)
- Spend budget constraints and allocation policies

**Expected Impact**: Increase R² from 0.11 → 0.20-0.30

### Priority 3: Address Overfitting

**Action**: Use time-series aware validation
- Replace standard k-fold with TimeSeriesSplit or expanding window
- Increase training data volume if possible
- Apply regularization (L1/L2, early stopping)
- Reduce feature count or use feature selection

**Expected Impact**: Improve train/holdout ratio from 3:1 → 1.5:1

### Priority 4: Validate Synthetic Data

**Action**: Audit synthetic tenant generation
- Confirm weather-revenue correlation was intended in synthetic data
- Check if synthetic tenants exhibit realistic brand behavior
- Add ground truth tests (e.g., rain → umbrella sales increase)
- Consider replacing or augmenting with real data samples

**Expected Impact**: Ensure models can theoretically achieve R² > 0.50

---

## Metrics Summary

### Cross-Validation Results (20 Tenants)

| Metric | Mean | Std | Min | Max | Pass Rate |
|---|---|---|---|---|---|
| Holdout R² | 0.110 | 0.235 | -0.013 | 0.713 | 25% (5/20) |
| Train R² | 0.359 | 0.315 | 0.000 | 0.910 | N/A |
| Train/Holdout Ratio | 0.350 | 0.356 | 0.000 | 1.438 | 35% (7/20) |
| MAE | 1,600 | 2,357 | 140 | 7,360 | N/A |
| Weather Fit Score | 0.000 | 0.000 | 0.000 | 0.000 | 0% (0/20) |

### Production Readiness Scorecard

| Dimension | Score | Status | Gap to Target |
|---|---|---|---|
| Predictive Power (R²) | 15% | ❌ | Need +15% for critical threshold |
| Generalization | 35% | ❌ | Need +40% for critical threshold |
| Weather Relevance | 0% | ❌ | Need +15% for critical threshold |
| Forecast Accuracy | 38% | ❌ | Need -3% for critical threshold |
| Model Stability | 100% | ✓ | On target |

---

## Validation Code & Output

### Running the Validation

```bash
python3 scripts/validate_model_performance.py \
  --cv-results state/analytics/mmm_training_results_cv.json \
  --output state/analytics/validation_report.json
```

### Output Artifacts

- **Console Report**: Human-readable validation results with pass/fail status
- **JSON Report**: `state/analytics/validation_report.json` (machine-readable)
- **This Document**: Detailed analysis and recommendations

---

## Conclusion

**T-MLR-2.4 is COMPLETE**. Models have been validated against objective thresholds, and critical gaps have been identified.

**Key Takeaway**: Current models are unsuitable for production but demonstrate:
- Models can be trained on synthetic tenants
- Some tenant categories (rain-related) show promising signals
- Weather integration needs attention
- Validation framework is in place for measuring improvements

**Recommendation for T-MLR-2.5**: Implement baseline comparison (naive/seasonal/linear) to measure improvement potential before investing in advanced feature engineering.

---

## Related Tasks

- **T-MLR-2.3** (COMPLETE): Train models on synthetic tenants
- **T-MLR-2.4** (COMPLETE): Validate model performance ← YOU ARE HERE
- **T-MLR-2.5** (NEXT): Compare models to baseline (naive/seasonal/linear)
