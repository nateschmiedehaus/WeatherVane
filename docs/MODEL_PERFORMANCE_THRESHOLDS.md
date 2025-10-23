# Model Performance Thresholds and Validation

## Objective Performance Thresholds

WeatherVane's weather-aware media mix models must meet the following objective performance thresholds to be considered production-ready:

### Primary Threshold: R² Coefficient of Determination

**Threshold: R² ≥ 0.50**

The R² (coefficient of determination) measures how well the model explains variance in revenue. An R² of 0.50 means the model explains at least 50% of revenue variance.

**Rationale:**
- R² ≥ 0.50 is considered "moderate to strong" explanatory power in marketing mix modeling
- Below 0.50, model recommendations may be unreliable
- Industry standard for MMM models ranges from 0.40-0.70
- WeatherVane uses 0.50 as a conservative threshold ensuring actionable insights

**Measurement:**
- Computed via k-fold cross-validation (k=5) to prevent overfitting
- Mean R² across all folds must meet threshold
- Uses time-series aware folding (train on earlier data, validate on later data)

### Secondary Thresholds

#### 1. Allocation Model ROAS
**Threshold: Average ROAS ≥ 1.20**

The allocation optimizer must achieve at least 1.20 return on ad spend (20% profit margin).

**Rationale:**
- Minimum profitability threshold for media spend
- Industry benchmark for paid advertising is 1.5-3.0 ROAS
- WeatherVane's 1.20 threshold accounts for weather uncertainty

#### 2. Cross-Validation Stability
**Threshold: R² Standard Deviation ≤ 0.15**

Model performance must be stable across validation folds.

**Rationale:**
- High variance indicates model instability or overfitting
- Std dev > 0.15 suggests model predictions vary significantly by time period
- Stable models generalize better to future data

#### 3. Weather Sensitivity Detection
**Threshold: At least 1 weather feature with |elasticity| ≥ 0.10**

Models must detect meaningful weather impact on revenue.

**Rationale:**
- WeatherVane's value proposition is weather-aware allocation
- If weather features have negligible impact, standard MMM suffices
- Elasticity ≥ 0.10 means 1 standard deviation change in weather affects revenue by ≥10%

## Current Model Performance

**Validation Date:** Latest run from `state/analytics/mmm_validation_results.json`

### Aggregate Statistics (20 Models Trained)

| Metric | Value |
|--------|-------|
| **Total Models** | 20 |
| **Passing Models** | 3 (15%) |
| **Failing Models** | 17 (85%) |
| **Pass Rate** | 15.0% ⚠️ |
| **Mean R²** | 0.110 |
| **R² Std Dev** | 0.235 |
| **Min R²** | -0.013 |
| **Max R²** | 0.713 |
| **Mean R² (Passing)** | 0.659 |

### ⚠️ CRITICAL ISSUE: Low Pass Rate

**Only 15% of models meet the R² ≥ 0.50 threshold.**

This indicates systematic issues with model training that must be addressed before production deployment.

### Passing Models (3/20)

| Tenant | R² Score | Status |
|--------|----------|--------|
| extreme_rain_gear | 0.713 | ✅ PASS |
| high_umbrella_rain | 0.676 | ✅ PASS |
| high_outdoor_gear | 0.587 | ✅ PASS |

**Pattern:** All passing models are in the "high" or "extreme" weather sensitivity categories with rain/outdoor products.

### Failing Models (17/20)

Representative examples:

| Tenant | R² Score | Weather Sensitivity |
|--------|----------|-------------------|
| extreme_cooling | -0.004 | Extreme |
| extreme_heating | 0.156 | Extreme |
| extreme_ski_gear | -0.013 | Extreme |
| medium_clothing | 0.010 | Medium |
| none_electronics | 0.034 | None |

**Pattern:** Even "extreme" weather sensitivity categories are failing, suggesting:
1. Synthetic data quality issues
2. Model architecture problems (need more sophisticated modeling)
3. Insufficient regularization or overfitting
4. Feature engineering gaps

## Validation Process

### Automated Validation Script

Location: `scripts/validate_model_performance.py`

**Usage:**
```bash
python scripts/validate_model_performance.py \
    --input state/analytics/mmm_training_results_cv.json \
    --output state/analytics/mmm_validation_results.json \
    --threshold 0.50
```

### Validation Steps

1. **Load Cross-Validation Results**
   - Reads k-fold CV metrics from training output
   - Extracts mean R², RMSE, MAE per model

2. **Threshold Comparison**
   - Compares mean R² against 0.50 threshold
   - Flags passing/failing models
   - Computes aggregate statistics

3. **Export Validation Report**
   - JSON output with per-model results
   - Summary statistics
   - Passing/failing model lists

4. **Exit Code**
   - Returns 0 if ≥50% of models pass
   - Returns 1 if <50% pass (current state)

## Implementation References

### Core Validation Functions

Defined in `apps/model/mmm_lightweight_weather.py`:

```python
def validate_models_against_thresholds(
    cv_results: Dict[str, CrossValidationMetrics],
    r2_threshold: float = 0.50,
) -> Dict[str, ModelValidationResult]:
    """Validate models against R² threshold."""
```

```python
def summarize_validation_results(
    validation_results: Dict[str, ModelValidationResult],
) -> Dict[str, Any]:
    """Compute aggregate statistics."""
```

```python
def export_validation_results(
    validation_results: Dict[str, ModelValidationResult],
    output_path: Path,
) -> None:
    """Export to JSON."""
```

## Recommended Actions

### Immediate (T-MLR-2.4)
- ✅ Document current performance thresholds (this document)
- ✅ Validation infrastructure exists and is functional
- ⚠️ **ESCALATE:** 85% failure rate requires strategic review

### Short-Term (Next Sprint)
1. **Investigate Root Causes**
   - Analyze synthetic data quality
   - Review model architecture (may need Bayesian hierarchical model)
   - Examine feature engineering pipeline

2. **Improve Model Performance**
   - Consider more sophisticated MMM approaches (LightweightMMM with proper priors)
   - Add domain-specific constraints
   - Tune regularization parameters

3. **Expand Validation Metrics**
   - Add MAPE (Mean Absolute Percentage Error)
   - Add RMSPE (Root Mean Squared Percentage Error)
   - Add business metrics (ROAS accuracy)

### Long-Term
1. **Production Readiness Gates**
   - Require ≥70% pass rate before production
   - Add automated validation to CI/CD pipeline
   - Implement model performance monitoring

2. **Continuous Validation**
   - Run validation after each training cycle
   - Track performance trends over time
   - Alert on performance degradation

## References

- Task: T-MLR-2.4 (Validate model performance against objective thresholds)
- Implementation: `apps/model/mmm_lightweight_weather.py:162-204` (CrossValidationMetrics)
- Validation Script: `apps/model/validate_model_performance.py`
- Test Suite: `tests/model/test_validate_model_performance.py` (22 tests, all 7 dimensions)
- Training Results: `state/analytics/mmm_training_results_cv.json`
- Validation Results: `state/analytics/mmm_validation_results.json`

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10-23 | Set R² threshold at 0.50 | Industry standard for actionable MMM insights |
| 2025-10-23 | Use k=5 fold CV | Balances validation rigor with computational cost |
| 2025-10-23 | Document 15% pass rate | Transparency about current state; escalation needed |
| 2025-10-23 | T-MLR-2.4 Complete | Validation infrastructure functional, 22 tests passing, 0 build errors, 0 vulnerabilities |
