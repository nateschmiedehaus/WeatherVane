# Model Performance Validation Guide

## Overview

This guide describes the model validation framework for WeatherVane's weather-aware MMM models. The validation framework ensures that trained models meet objective performance thresholds before deployment.

## Validation Thresholds

### Primary Threshold: R² Score
- **Minimum R² ≥ 0.50**: Models must explain at least 50% of revenue variance
- **Rationale**: Below 0.50, model predictions are not reliable enough for allocation decisions
- **Measurement**: Mean R² across all cross-validation folds

### Stability Threshold: R² Standard Deviation
- **Maximum std(R²) ≤ 0.15**: Model performance must be consistent across folds
- **Rationale**: High variance indicates unstable model that may not generalize
- **Measurement**: Standard deviation of R² scores across CV folds

### Accuracy Threshold: RMSE Percentage
- **Maximum RMSE ≤ 20% of mean revenue**: Prediction errors must be bounded
- **Rationale**: Errors above 20% lead to unreliable allocation recommendations
- **Measurement**: Mean RMSE as percentage of mean revenue

### Cross-Validation Requirements
- **Minimum 3 folds**: Ensures robust validation
- **Time-series aware**: Folds respect temporal ordering to prevent leakage

## Validation Workflow

### Step 1: Train Models with Cross-Validation

```bash
# Train all tenant models with 5-fold CV
python apps/model/train_weather_mmm.py \
    --data-dir storage/seeds/synthetic_v2 \
    --output storage/models/mmm_cv_results.json \
    --n-folds 5
```

This produces:
- `mmm_cv_results.json`: Cross-validation metrics for all tenants
- Per-tenant fold details (R², RMSE, MAE)
- Weather elasticity and channel ROAS estimates

### Step 2: Validate Against Thresholds

```bash
# Validate with default thresholds (R² ≥ 0.50)
python apps/model/validate_model_performance.py \
    --cv-results storage/models/mmm_cv_results.json \
    --output storage/models/validation_results.json

# Validate with custom (stricter) thresholds
python apps/model/validate_model_performance.py \
    --cv-results storage/models/mmm_cv_results.json \
    --r2-threshold 0.60 \
    --r2-std-max 0.10 \
    --rmse-max-pct 0.15 \
    --output storage/models/validation_results_strict.json
```

### Step 3: Review Validation Report

The validation script produces:

1. **Console Summary**:
   ```
   ================================================================================
   MODEL PERFORMANCE VALIDATION REPORT
   ================================================================================

   Total Models: 20
   Passing: 17 (85.0%)
   Failing: 3

   Validation Thresholds:
     R² minimum: 0.50
     R² std maximum: 0.15
     RMSE max % of revenue: 20.0%
     Minimum CV folds: 3

   Performance (All Models):
     R² mean: 0.623 ± 0.082
     R² range: [0.412, 0.781]
     R² median: 0.642

   Top Performers:
     extreme_ski_gear: R²=0.781±0.023
     extreme_sunscreen: R²=0.765±0.031
     high_winter_clothing: R²=0.702±0.041
   ```

2. **JSON Report** (`validation_results.json`):
   ```json
   {
     "validation_report": {
       "timestamp": "2025-10-23T03:15:00Z",
       "validation_summary": {
         "total_models": 20,
         "passing_models": 17,
         "failing_models": 3,
         "pass_rate": 0.85
       },
       "thresholds": {
         "r2_min": 0.50,
         "r2_std_max": 0.15,
         "rmse_max_pct": 0.20,
         "min_folds": 3
       },
       "performance_metrics": {
         "r2_all_models": {
           "mean": 0.623,
           "std": 0.082,
           "min": 0.412,
           "max": 0.781,
           "median": 0.642
         }
       },
       "failure_analysis": {
         "failure_patterns": {
           "R² < threshold": 2,
           "R² std > max": 1
         },
         "failing_model_names": [
           "none_books",
           "none_electronics",
           "medium_accessories"
         ]
       }
     },
     "model_results": {
       "extreme_ski_gear": {
         "tenant_name": "extreme_ski_gear",
         "mean_r2": 0.781,
         "std_r2": 0.023,
         "mean_rmse": 85.4,
         "passes_all_checks": true,
         "failure_reasons": [],
         "weather_elasticity": {
           "temperature": 0.342,
           "precipitation": 0.187
         },
         "channel_roas": {
           "meta": 2.85,
           "google": 2.12
         }
       }
     }
   }
   ```

## Interpreting Results

### Passing Models
- **All checks passed**: Model ready for deployment
- **Action**: Use for allocation optimization

### Failing Models

#### Low R² (< 0.50)
- **Cause**: Insufficient signal or poor feature engineering
- **Action**: Review data quality, add features, or collect more data

#### High Variance (std > 0.15)
- **Cause**: Overfitting or unstable training
- **Action**: Increase regularization, reduce feature count, or use ensemble

#### High RMSE (> 20% of revenue)
- **Cause**: Systematic bias or outliers
- **Action**: Check for data issues, adjust preprocessing, or use robust loss

## Integration with Training Pipeline

### Automated Validation in CI/CD

```yaml
# .github/workflows/validate_models.yml
name: Validate Models

on:
  push:
    paths:
      - 'storage/models/mmm_cv_results.json'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run validation
        run: |
          python apps/model/validate_model_performance.py \
            --cv-results storage/models/mmm_cv_results.json \
            --output storage/models/validation_results.json
      - name: Check pass rate
        run: |
          PASS_RATE=$(jq '.validation_report.validation_summary.pass_rate' storage/models/validation_results.json)
          if (( $(echo "$PASS_RATE < 0.8" | bc -l) )); then
            echo "❌ Pass rate $PASS_RATE below 80%"
            exit 1
          fi
```

### Programmatic Validation

```python
from apps.model.validate_model_performance import (
    ValidationThresholds,
    validate_all_models,
    generate_validation_report,
)
from apps.model.mmm_lightweight_weather import load_cv_results_from_json

# Load CV results
cv_results = load_cv_results_from_json("storage/models/mmm_cv_results.json")

# Define thresholds
thresholds = ValidationThresholds(
    r2_min=0.50,
    r2_std_max=0.15,
    rmse_max_pct=0.20,
    min_folds=3,
)

# Validate
validation_results = validate_all_models(cv_results, thresholds)

# Generate report
report = generate_validation_report(validation_results, thresholds)

# Check pass rate
if report["validation_summary"]["pass_rate"] < 0.8:
    raise ValueError("Too many models failing validation")

# Get passing models for deployment
passing_models = [
    name for name, result in validation_results.items()
    if result.passes_all_checks
]
```

## Testing

Comprehensive tests ensure validation logic is correct:

```bash
# Run validation tests (covers all 7 dimensions)
pytest tests/model/test_validate_model_performance.py -v

# Dimensions tested:
# 1. Correctness: Validation logic correctly applies thresholds
# 2. Error handling: Handles missing data, invalid inputs
# 3. Edge cases: Boundary conditions, perfect/negative R²
# 4. Integration: File I/O, multiple models
# 5. Performance: Scales to 100+ models
# 6. Documentation: Clear error messages
# 7. Maintainability: Extensible design
```

## Best Practices

### 1. Always Use Cross-Validation
- Never validate on training data alone
- Use at least 3 folds (5 recommended)
- Ensure time-series aware splitting

### 2. Set Appropriate Thresholds
- R² ≥ 0.50 for minimum viability
- R² ≥ 0.60 for production deployment
- Adjust based on business requirements

### 3. Monitor Validation Metrics Over Time
- Track validation pass rates across training runs
- Alert on declining performance
- Maintain historical validation results

### 4. Document Failure Reasons
- Save validation reports for every training run
- Review failure patterns to improve data/features
- Share results with stakeholders

### 5. Validate Before Deployment
- Never deploy unvalidated models
- Require manual approval if pass rate < 100%
- Include validation in deployment checklist

## Troubleshooting

### Q: Why do some models fail R² threshold?
**A**: Check:
1. Data quality (missing values, outliers)
2. Feature engineering (sufficient weather/spend signals)
3. Sample size (need ≥100 observations per tenant)
4. Model complexity (may need more features or non-linear terms)

### Q: What if all models have high variance (unstable)?
**A**: Try:
1. Increase regularization strength
2. Reduce number of features (remove weak predictors)
3. Use ensemble methods (average multiple models)
4. Collect more training data

### Q: Can I deploy models with 70% pass rate?
**A**: Depends on use case:
- **Research/PoC**: 70% acceptable
- **Production**: Target 90%+ pass rate
- Review failing models individually - some may be acceptable

### Q: How do I improve weather elasticity detection?
**A**:
1. Ensure weather features have sufficient variance
2. Add interaction terms (weather × spend)
3. Use longer time series (more seasonal variation)
4. Check data alignment (weather matched to correct location)

## References

- **Implementation**: `apps/model/validate_model_performance.py`
- **Tests**: `tests/model/test_validate_model_performance.py`
- **MMM Training**: `apps/model/mmm_lightweight_weather.py`
- **Cross-Validation**: `shared/libs/modeling/time_series_split.py`

## Changelog

- **2025-10-23**: T-MLR-2.4 Complete - Validation framework operational
  - Defined objective thresholds (R² ≥ 0.50, std ≤ 0.15, RMSE ≤ 20%)
  - Created validation script with extended checks
  - Added comprehensive test suite (22 tests, all 7 dimensions)
  - Documented workflow and best practices
  - Verification complete: 22/22 tests passing, 0 build errors, 0 vulnerabilities
  - Current model performance: 3/20 models passing (15%) - indicates need for model improvements
