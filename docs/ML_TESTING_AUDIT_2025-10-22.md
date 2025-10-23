# ML Modeling Testing Audit - 2025-10-22

## Executive Summary

**Status**: ⚠️ **INCOMPLETE** - Models exist but lack rigorous validation

**Key Findings**:
1. **Synthetic data is too simple** - Only 180 days, weak weather signals
2. **Models perform poorly** - Negative R² scores across all tenants
3. **Tests are smoke tests** - Only check code runs, not accuracy
4. **No realistic validation** - Missing multi-year data, realistic conditions
5. **Segfault concerns** - Codex reports Shapely crashes (not reproduced on this machine)

**Recommendation**: Implement comprehensive ML testing roadmap before claiming production-ready models.

---

## 1. Current State Analysis

### 1.1 Synthetic Data Quality

**What We Have**:
- 4 synthetic tenants (extreme/high/medium/none weather sensitivity)
- 180 days of data per tenant (Apr 25 - Oct 21, 2025)
- 5 products per tenant
- Daily granularity with Shopify sales + Meta/Google ads + Klaviyo + weather

**Issues**:

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Extreme weather correlation | 0.80-0.90 | -0.041 | ❌ **90% off target** |
| High weather correlation | 0.65-0.75 | -0.390 | ❌ **Wrong direction** |
| Medium weather correlation | 0.35-0.45 | -0.031 | ❌ **90% off target** |
| None weather correlation | -0.1 to +0.1 | +0.038 | ✅ **Correct** |

**Root Cause**: Weather multiplier logic not working as intended. Only the "none sensitivity" tenant shows correct behavior (no correlation). All others show weak/wrong correlations.

**Impact**: Models trained on this data cannot learn weather patterns because the patterns don't exist in the data.

---

### 1.2 Model Performance

**Claimed Results** (from `docs/WEATHER_PROOF_OF_CONCEPT.md`):

| Tenant | Val R² (no weather) | Val R² (with weather) | Improvement |
|--------|---------------------|----------------------|-------------|
| Extreme | -0.065 | -0.079 | **-1.4%** (worse) |
| High | -0.053 | -0.039 | +1.4% |
| Medium | -0.018 | -0.026 | **-0.7%** (worse) |
| None | 0.003 | -0.037 | **-4.0%** (worse) |

**Analysis**:
- ❌ **All models have negative R²** - Worse than predicting the mean
- ❌ **Weather makes 3/4 models WORSE** - Should improve weather-sensitive tenants
- ❌ **Elasticity coefficients are placeholders** - Same values across all tenants (-108.9, +154.7)
- ⚠️ **Models are admittedly broken** - Document says "Needs work", "Poor"

**Verdict**: These are not functional models. They're placeholder implementations that technically run but don't actually work.

---

### 1.3 Test Coverage

**What Tests Exist**:
```
tests/test_weather_mmm_inference.py - 9 tests, all passing
tests/allocator/test_weather_constraints.py - 18 tests, all passing
tests/apps/allocator/test_weather_aware_allocation.py - tests exist
```

**What Tests Actually Check**:
```python
# Example from test_weather_mmm_inference.py
def test_predict_daily_revenue(self):
    pred = service.predict_daily_revenue(...)
    assert pred.predicted_revenue > 0  # ← Just checks it's positive!
    assert pred.predicted_roas > 0      # ← Not checking accuracy
    assert 0 <= pred.model_confidence <= 1.0  # ← Just range check
```

**What's Missing**:
- ❌ No accuracy/MAPE validation
- ❌ No R² threshold enforcement
- ❌ No out-of-sample testing
- ❌ No weather elasticity validation
- ❌ No comparison to baseline
- ❌ No realistic data testing

**Verdict**: These are **smoke tests** that only verify code runs without errors. They don't validate model quality.

---

## 2. What Good ML Testing Looks Like

### 2.1 Realistic Data Requirements

**Multi-Year Data** (not 180 days):
- Minimum 2-3 years of historical data
- Captures full seasonal cycles multiple times
- Includes outlier events (heat waves, cold snaps, holidays)
- Real-world ad spend patterns (not uniform)

**Realistic Weather Patterns**:
- Not uniform seasonal variation
- Actual weather volatility (cold snaps in summer, warm spells in winter)
- Precipitation clustering (rainy weeks, dry periods)
- Geographic variation (NYC ≠ Miami ≠ Seattle)

**Realistic Business Patterns**:
- Ad spend varies by day of week (weekend dips)
- Seasonality in spend (Black Friday spikes)
- Budget constraints (monthly caps)
- Product lifecycles (new launches, end-of-season clearance)
- Inventory constraints (stockouts reduce revenue even with ads)

**Multiple Tenants Per Sensitivity Level**:
- Don't just have 1 "high sensitivity" tenant
- Have 5-10 different brands with similar sensitivity
- Validates model generalizes across categories
- Example: Winter apparel (NYC), ski shop (Denver), heater store (Chicago)

---

### 2.2 Proper Model Validation

**Training/Validation/Test Split**:
```
Training:   First 70% of data (e.g., 2022-2023)
Validation: Next 15% of data (e.g., H1 2024)
Test:       Final 15% of data (e.g., H2 2024)
```

**Performance Thresholds**:
| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| R² (in-sample) | 0.50 | 0.70 | 0.85+ |
| R² (out-of-sample) | 0.40 | 0.60 | 0.75+ |
| MAPE (daily) | <25% | <15% | <10% |
| Weather elasticity | Correct sign | Within 2x | Within 1.5x |

**Weather Sensitivity Validation**:
For a "high weather sensitivity" tenant:
- Temperature should explain 20-40% of revenue variance
- Correct signs (winter products ↑ when cold, summer products ↑ when hot)
- Elasticity magnitudes realistic (1°C ≈ 2-5% revenue change, not 100%+)

For a "no weather sensitivity" tenant:
- Weather features should have coefficients near zero
- Model should NOT improve with weather (or improve <1%)

---

### 2.3 Comparison to Baselines

Always compare to simple baselines:
1. **Naive Baseline**: Predict yesterday's revenue
2. **Seasonal Baseline**: Predict same day last year
3. **Linear Model**: Revenue ~ ad_spend (no weather)
4. **Prophet/ARIMA**: Time series forecast

If your "advanced" weather-aware MMM doesn't beat these baselines by >10%, it's not providing value.

---

### 2.4 Robustness Testing

**Outlier Handling**:
- Test on heat waves (e.g., 110°F day)
- Test on extreme cold (e.g., -20°F)
- Test on flooding/hurricanes
- Model should degrade gracefully, not crash or return nonsense

**Missing Data**:
- What if weather data missing for 3 days?
- What if ad spend data delayed?
- Model should have fallback strategy

**Edge Cases**:
- Zero ad spend → Should predict organic baseline
- Extreme ad spend (10x normal) → Should saturate (not predict 10x revenue)
- New product launch → How does model handle no historical data?

---

## 3. Proposed Comprehensive ML Testing Roadmap

### Phase 1: Multi-Year Synthetic Data Generation (2-3 weeks)

**Goal**: Generate 3 years of realistic synthetic data for 20 tenants

**Tasks**:

**T-ML-1.1: Design realistic weather pattern generator**
- Use real historical weather from 2020-2023 for 10 US cities
- Include volatility (heat waves, cold snaps, rain clusters)
- Capture seasonal trends + random variation
- Deliverable: `scripts/weather/fetch_historical_weather.py`

**T-ML-1.2: Design realistic ad spend pattern generator**
- Day-of-week variation (weekends -30%)
- Monthly budget caps and rollover
- Seasonal campaigns (Black Friday, summer sales)
- Competitive bidding simulation (CPC varies)
- Deliverable: `scripts/data_gen/generate_ad_spend_patterns.py`

**T-ML-1.3: Design realistic demand simulator with weather elasticity**
- Base demand trend (growth over time)
- Seasonality (winter peak for coats, summer for AC)
- Weather multipliers (temperature, precipitation, humidity)
- Ad response curves (diminishing returns)
- Noise (random variation ±15%)
- Deliverable: `scripts/data_gen/simulate_demand_weather.py`

**T-ML-1.4: Generate 20 synthetic tenants with 3 years of data each**
- 5 extreme sensitivity (ski shops, heater stores, AC dealers)
- 5 high sensitivity (seasonal apparel, sunglasses, umbrellas)
- 5 medium sensitivity (shoes, general clothing)
- 5 none sensitivity (office supplies, tech, furniture)
- Each tenant: 1,095 days × 10 products = 10,950 rows
- Total: 219,000 rows of realistic synthetic data
- Deliverable: `storage/seeds/synthetic_v2/*.parquet`

**T-ML-1.5: Validate synthetic data quality**
- Check weather correlations match expected ranges (±10%)
- Verify seasonal patterns visible in plots
- Confirm ad spend patterns realistic
- Test for data quality issues (nulls, outliers, duplicates)
- Deliverable: `state/analytics/synthetic_v2_validation_report.json`

**Exit Criteria**:
- ✅ 20 tenants with 3 years of data each
- ✅ Weather correlations within ±10% of target
- ✅ Visual inspection confirms realistic patterns
- ✅ Data quality report shows 0 critical issues

---

### Phase 2: Rigorous MMM Training & Validation (2-3 weeks)

**T-ML-2.1: Implement proper train/val/test splitting**
- First 70% → training
- Next 15% → validation (hyperparameter tuning)
- Final 15% → test (final evaluation, never touched during training)
- Time-series aware (no future leakage)
- Deliverable: `shared/libs/modeling/train_test_split.py`

**T-ML-2.2: Implement LightweightMMM with weather features**
- Adstock transformation (carryover effects)
- Saturation curves (diminishing returns)
- Weather interaction terms (temp × category)
- Hierarchical structure (brand → product)
- Deliverable: `apps/model/mmm_with_weather.py`

**T-ML-2.3: Train models on all 20 synthetic tenants**
- Use proper cross-validation
- Track training metrics (loss, R², MAPE)
- Save model artifacts per tenant
- Deliverable: `experiments/mmm_v2/models/*.pkl`

**T-ML-2.4: Validate model performance thresholds**
- Out-of-sample R² > 0.50 for weather-sensitive tenants
- Weather elasticity signs correct (winter products ↑ when cold)
- Weather elasticity magnitudes realistic (1°C = 2-5% revenue change)
- MAPE < 20% on test set
- Deliverable: `experiments/mmm_v2/validation_report.json`

**T-ML-2.5: Compare to baseline models**
- Train naive baseline (yesterday's revenue)
- Train seasonal baseline (last year same day)
- Train linear model (revenue ~ ad spend, no weather)
- Weather MMM must beat all baselines by >10% on MAPE
- Deliverable: `experiments/mmm_v2/baseline_comparison.json`

**T-ML-2.6: Run robustness tests**
- Test on outlier weather (heat waves, cold snaps)
- Test with missing data (weather gaps)
- Test edge cases (zero spend, extreme spend)
- Model should degrade gracefully (not crash)
- Deliverable: `experiments/mmm_v2/robustness_report.json`

**Exit Criteria**:
- ✅ 20/20 models trained successfully
- ✅ Weather-sensitive tenants: Out-of-sample R² > 0.50
- ✅ No-sensitivity tenants: Weather features near-zero coefficients
- ✅ Weather MMM beats all baselines by >10%
- ✅ All robustness tests pass

---

### Phase 3: Real Data Testing (2-4 weeks)

**T-ML-3.1: Acquire real historical data from 3 pilot tenants**
- Option A: Use real Shopify + ads data (anonymized)
- Option B: Use public e-commerce datasets (Kaggle, etc.)
- Requirement: 2+ years of data, weather-sensitive categories
- Deliverable: `storage/real_data/pilot_tenants/*.parquet`

**T-ML-3.2: Train models on real data**
- Apply same methodology as Phase 2
- Expect lower performance (real world is messier)
- Acceptable R² > 0.40 (real data noisier than synthetic)
- Deliverable: `experiments/mmm_real/models/*.pkl`

**T-ML-3.3: Validate real-world model performance**
- Out-of-sample testing on most recent 6 months
- Compare to actual business outcomes
- Check if weather elasticities match intuition
- Deliverable: `experiments/mmm_real/validation_report.json`

**T-ML-3.4: Run A/B test simulation**
- Simulate allocating budget with vs without weather MMM
- Measure theoretical ROAS uplift
- Validate that weather-aware allocation would have improved outcomes
- Deliverable: `experiments/mmm_real/ab_test_simulation.json`

**Exit Criteria**:
- ✅ 3/3 pilot tenants trained successfully
- ✅ Out-of-sample R² > 0.40
- ✅ A/B simulation shows >5% ROAS uplift
- ✅ Weather elasticities match business intuition

---

### Phase 4: Production Readiness (1-2 weeks)

**T-ML-4.1: Implement model monitoring & drift detection**
- Track prediction error over time
- Alert if model performance degrades >10%
- Re-train trigger if weather patterns change
- Deliverable: `apps/worker/monitoring/mmm_drift_monitor.py`

**T-ML-4.2: Create model explainability dashboards**
- Show weather elasticity by product category
- Show adstock curves (how long ads work)
- Show saturation curves (diminishing returns)
- Deliverable: `apps/web/src/pages/model-explainability.tsx`

**T-ML-4.3: Write production runbook**
- How to re-train models
- How to diagnose prediction errors
- How to handle edge cases
- Deliverable: `docs/ML_PRODUCTION_RUNBOOK.md`

**T-ML-4.4: Final integration tests**
- End-to-end test: Data → training → inference → allocation
- Load testing (1000 predictions/sec)
- Failure testing (what if weather API down?)
- Deliverable: `tests/integration/test_mmm_e2e.py`

**Exit Criteria**:
- ✅ All integration tests pass
- ✅ Monitoring dashboards live
- ✅ Runbook complete and reviewed
- ✅ Sign-off from stakeholders

---

## 4. Recommended Immediate Actions

### High Priority (This Sprint)

1. **Acknowledge Current State** ✅
   - Document that current models are not production-ready
   - Update roadmap status from "done" to "prototype complete, validation needed"

2. **Fix Synthetic Data Generator**
   - Debug why weather multipliers not working correctly
   - Regenerate data with proper correlations
   - Validate extreme/high/medium tenants have expected weather signals

3. **Implement Basic Validation Tests**
   - Add R² threshold assertions to tests
   - Add weather elasticity sign checks
   - Add baseline comparison tests
   - Block deployment if tests fail

### Medium Priority (Next 2 Sprints)

4. **Generate Multi-Year Synthetic Data**
   - Start with T-ML-1.1 through T-ML-1.5
   - 3 years × 20 tenants is realistic scope

5. **Implement Proper MMM Training Pipeline**
   - T-ML-2.1 through T-ML-2.6
   - Use LightweightMMM or Robyn (not OLS)
   - Proper train/val/test split

### Long-Term (Next Quarter)

6. **Real Data Validation**
   - Acquire pilot tenant data
   - Run T-ML-3.1 through T-ML-3.4

7. **Production Hardening**
   - T-ML-4.1 through T-ML-4.4

---

## 5. Estimated Effort

| Phase | Tasks | Estimated Time | Priority |
|-------|-------|---------------|----------|
| Phase 1: Multi-Year Data | 5 tasks | 2-3 weeks | HIGH |
| Phase 2: Rigorous Training | 6 tasks | 2-3 weeks | HIGH |
| Phase 3: Real Data Testing | 4 tasks | 2-4 weeks | MEDIUM |
| Phase 4: Production Readiness | 4 tasks | 1-2 weeks | MEDIUM |
| **Total** | **19 tasks** | **7-12 weeks** | - |

**Note**: This is not "nice to have" work. This is **essential validation** that should have been done before claiming the models are production-ready.

---

## 6. Key Risks if We Don't Do This

1. **Model doesn't work in production** → Wastes customer ad budget
2. **Weather elasticities wrong** → Makes bad allocation decisions
3. **No monitoring** → Model degrades silently over time
4. **Stakeholders lose confidence** → "Weather-aware modeling doesn't work"
5. **Regulatory risk** → Can't defend claims that model is accurate

---

## Appendix A: Current Synthetic Data Stats

```
Tenant                      Days  Products  Revenue    Weather Corr  Expected
extreme_weather_sensitivity  180      5     $3.40M     -0.041       0.80-0.90
high_weather_sensitivity     180      5     $3.42M     -0.390       0.65-0.75
medium_weather_sensitivity   180      5     $3.25M     -0.031       0.35-0.45
no_weather_sensitivity       180      5     $2.07M     +0.038       -0.1 to +0.1
```

Only the "no sensitivity" tenant shows correct behavior. All others are far off target.

---

## Appendix B: Current Model Performance

All models have **negative R²** scores (worse than predicting the mean):

```
Tenant    No Weather R²  With Weather R²  Improvement
Extreme   -0.065         -0.079           -1.4% (WORSE)
High      -0.053         -0.039           +1.4%
Medium    -0.018         -0.026           -0.7% (WORSE)
None      +0.003         -0.037           -4.0% (WORSE)
```

These are not functional models.

---

## Appendix C: Test Coverage Gaps

Current tests only check:
- ✅ Code runs without exceptions
- ✅ Predictions are positive numbers
- ✅ Confidence scores in [0, 1] range

Tests do NOT check:
- ❌ Model accuracy (MAPE, R²)
- ❌ Weather elasticity correctness
- ❌ Comparison to baselines
- ❌ Out-of-sample performance
- ❌ Robustness to outliers

---

**Conclusion**: We have a good foundation (code structure, data pipeline, basic tests) but need rigorous validation before production deployment. The proposed 19-task roadmap provides that validation.
