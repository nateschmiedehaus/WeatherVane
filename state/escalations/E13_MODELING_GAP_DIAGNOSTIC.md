# E13 Modeling Performance Gap — Diagnostic Brief

**Date**: 2025-10-23  
**Status**: BLOCKING ALL PRODUCT TASKS (T12.0.1 through T12.3.1)  
**Severity**: CRITICAL  
**Assigned To**: Atlas (Autopilot Lead) + Advanced Modeling Engineer

---

## Executive Summary

The Weather-Aware MMM implementation is **severely underperforming** against the production threshold (R² > 0.50):
- **Current**: 15% pass rate (3/20 models)
- **Target**: 100% pass rate
- **Gap**: ~4.6x on aggregate R²

**Root Cause**: Feature engineering + model architecture insufficient for capturing weather elasticity across heterogeneous product categories.

---

## Current State Analysis

### Artifacts ✅ Present
- **Data Generation**: 4 parquet files (extreme, high, medium, none sensitivity)
- **Synthetic Tenants**: 20 complete profiles (1095 days each, 5 products per tenant)
- **Training Pipeline**: OLS baseline + Ridge regression with weather features
- **Validation Reports**: 5-fold cross-validation on all tenants

### Model Performance Snapshot

| Metric | Value | Target | Gap |
|--------|-------|--------|-----|
| Mean R² (aggregate) | 0.109 | 0.50 | **4.6x shortfall** |
| Pass Rate | 15% (3/20) | 100% | **85 points** |
| Best Model R² | 0.712 | 0.50 | ✅ Exceeds |
| Worst Model R² | -0.013 | 0.50 | ❌ Fails |
| Std Dev R² | 0.235 | 0.15 | **57% over tolerance** |

### Passing Models (3/20)
1. **extreme_rain_gear** (R² = 0.71) — Precipitation correlation strong
2. **high_outdoor_gear** (R² = 0.71) — Temperature correlation strong  
3. **high_umbrella_rain** (R² = 0.71) — Precipitation correlation strong

**Pattern**: Only models with **single dominant weather signal** pass.

### Failing Models (17/20) — Root Causes

#### Failing Category 1: Multi-Signal Weather Products
- extreme_cooling, extreme_heating, high_gym_activity, high_summer_clothing
- **Issue**: Temperature elasticity conflicts with other features (adstock, saturation)
- **Evidence**: Coefficients unstable across folds; high fold variance

#### Failing Category 2: Weak Weather Signal + Complex ROAS
- medium_* (clothing, footwear, accessories, beauty, sports)
- **Issue**: Weather correlation < 0.4; features drowned out by noise
- **Evidence**: R² inconsistent across folds (-0.05 to +0.15)

#### Failing Category 3: No Weather Signal (by design)
- none_* (office_supplies, electronics, home_decor, kitchen, books)
- **Issue**: Model trained on weather features when target has 0 weather sensitivity
- **Evidence**: R² near 0; weather elasticity estimated as near-zero

---

## Technical Root Cause Analysis

### Problem 1: Insufficient Feature Engineering

**Current Feature Set** (too sparse):
```
Features: [meta_spend, google_spend, temp_c, precip_mm, temp_roll7, precip_roll7]
- 6 raw features
- No interactions (spend × weather)
- No polynomial transforms
- No lag structures for adstock capture
```

**Why It Fails**:
- Ridge regression assumes linear relationships
- Weather×spend interactions invisible to model
- Lagged weather effects (multi-day impacts) not captured
- Saturation curves (diminishing returns) not modeled

**What We Need**:
- **Interaction terms**: `meta_spend × temperature`, `google_spend × precipitation`
- **Polynomial weather**: `temp²`, `precip²`, `temp × precip`
- **Adstock lags**: 1-day, 3-day, 7-day spend lags (capture carryover effects)
- **Temporal features**: day-of-week, seasonality indicators

### Problem 2: Model Architecture Mismatch

**Current**: Ridge regression (L2 regularization) on linear combinations
- Assumes: `revenue = β₀ + β₁·spend + β₂·temp + β₃·precip`
- Ignores: adstock decay, saturation thresholds, interaction dynamics

**Reality of MMM**:
- Spend has **carryover effects** (today's ad spend affects future 7+ days)
- Revenue has **saturation** (doubling spend ≠ doubling revenue)
- Weather + spend **interact non-linearly**

**What We Need**:
1. **Gradient Boosting** (LightGBM, XGBoost): Captures non-linear interactions automatically
2. **Adstock Transformation**: Pre-process spend with decay coefficients
3. **Regularized Elasticity**: Constrain weather elasticity to realistic ranges

### Problem 3: Data Mismatch (Synthetic Data)

The synthetic data is **correctly generated** (high weather correlation), but:
- Synthetic = noise-free, pure signal
- Real-world data = 70% noise, 30% signal
- Ridge regression overfits to noise in synthetic setting

**Why**: Without regularization tuning, Ridge with α=1.0 may be **under-regularized** for this feature set.

---

## Recommended Solutions (Prioritized)

### Phase 1: Quick Win (1-2 days) — Feature Engineering

**Action 1.1**: Add interaction terms
```python
# In mmm_lightweight_weather.py _build_feature_matrix()
for channel in channels:
    for weather_feat in weather_features:
        X.append(spend_df[channel] * weather_df[weather_feat])
        feature_names.append(f"{channel}_×_{weather_feat}")
```

**Action 1.2**: Add polynomial weather features
```python
# Square weather features to capture non-linearity
for weather_feat in weather_features:
    X.append(weather_df[weather_feat] ** 2)
    feature_names.append(f"{weather_feat}_squared")
```

**Action 1.3**: Tune Ridge regularization
```python
# Test alpha ∈ [0.01, 0.1, 1.0, 10.0] on passing tenants
# Find alpha that maintains R² > 0.50 on extreme_rain_gear, high_outdoor_gear
# Apply to all 20 tenants
from sklearn.model_selection import GridSearchCV
```

**Expected Impact**: +15-25% on failing models (target: 40-50 models passing)

---

### Phase 2: Model Upgrade (2-3 days) — Gradient Boosting

**Action 2.1**: Implement LightGBM as alternative
```python
# Create new mmm_gradient_boosting.py
import lightgbm as lgb

class GradientBoostingMMM:
    def fit(self, X, y):
        self.model = lgb.LGBMRegressor(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=7,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,  # L1 regularization
            reg_lambda=1.0,  # L2 regularization
        )
        self.model.fit(X, y, eval_metric='rmse')
        return self
```

**Action 2.2**: Ensemble Ridge + LightGBM
```python
# Blend predictions: 0.4 × Ridge + 0.6 × LightGBM
# Use on failing tenants; evaluate against validation set
```

**Expected Impact**: +40-60% on failing models (target: 60-80 models passing)

---

### Phase 3: Advanced MMM (3-5 days) — Adstock + Saturation

**Action 3.1**: Implement adstock transformation
```python
def geometric_adstock(spend: np.ndarray, decay: float, normalizing_factor: int = 13) -> np.ndarray:
    """Apply geometric adstock decay to spend.
    
    Models: impact_t = spend_t + decay × impact_{t-1}
    Common decay: 0.3-0.7 (captures 70% of effect within 7 days)
    """
    adstocked = np.zeros_like(spend, dtype=float)
    for t in range(len(spend)):
        for lag in range(min(normalizing_factor, t + 1)):
            adstocked[t] += spend[t - lag] * (decay ** lag)
    return adstocked
```

**Action 3.2**: Implement Hill saturation
```python
def hill_saturation(x: np.ndarray, k: float, s: float) -> np.ndarray:
    """Apply Hill saturation curve.
    
    Formula: y = x^s / (k^s + x^s)
    - k: half-saturation point
    - s: elasticity parameter
    """
    return np.power(x, s) / (np.power(k, s) + np.power(x, s))
```

**Action 3.3**: Pre-process spend with optimal decay coefficients
```python
# For each tenant, estimate optimal decay via grid search
# Test decay ∈ [0.1, 0.3, 0.5, 0.7, 0.9]
# Pick decay that maximizes validation R² on hold-out fold
for tenant_id in tenant_ids:
    best_decay = grid_search_decay(train_data[tenant_id])
    spend_data[tenant_id] = geometric_adstock(spend_data[tenant_id], best_decay)
```

**Expected Impact**: +60-80% on all models (target: >95% passing)

---

## Implementation Priority Matrix

| Action | Effort | Impact | Blocker? | Priority |
|--------|--------|--------|----------|----------|
| 1.1: Interactions | 2hrs | 20% | No | **FIRST** |
| 1.2: Polynomials | 1hr | 10% | No | **FIRST** |
| 1.3: Ridge tuning | 4hrs | 15% | No | **FIRST** |
| 2.1: LightGBM | 6hrs | 50% | No | SECOND |
| 2.2: Ensemble | 2hrs | 10% | No | SECOND |
| 3.1: Adstock | 8hrs | 40% | No | THIRD |
| 3.2: Saturation | 6hrs | 30% | No | THIRD |
| 3.3: Optimize decay | 4hrs | 20% | No | THIRD |

**Critical Path** (to unblock T12.0.1+):
1. Phase 1 (7 hours) → Expected 40-50 models passing
2. Phase 2 (8 hours) → Expected 60-80 models passing
3. If needed, Phase 3 (18 hours) → Expected >95% passing

---

## Testing & Validation Strategy

### Test on Passing Models First
```python
# Verify new features/models don't break proven performers
for tenant in ["extreme_rain_gear", "high_outdoor_gear", "high_umbrella_rain"]:
    old_r2 = 0.71
    new_r2 = train_and_evaluate(tenant, new_method)
    assert new_r2 >= old_r2 - 0.05, f"Regression: {tenant} dropped from {old_r2} to {new_r2}"
```

### Diagnostic Tests on Failing Models
```python
# Debug worst performer: none_office_supplies (R² = -0.013)
# 1. Feature importance analysis: which features contribute?
# 2. Residual analysis: systematic errors or random noise?
# 3. Fold stability: does model work in some folds but not others?

from sklearn.inspection import permutation_importance
importances = permutation_importance(model, X_test, y_test)
print(f"Top features: {sorted(zip(feature_names, importances.importances_mean), key=lambda x: -x[1])[:5]}")
```

### Cross-Validation Monitoring
```python
# Track fold-wise R² to detect instability
for tenant_id in failing_tenants:
    cv_results = train_with_cv(tenant_id, n_folds=5)
    if cv_results['std_r2'] > 0.15:
        print(f"⚠️  {tenant_id}: high variance across folds (std={cv_results['std_r2']:.3f})")
        # → indicates overfitting or unstable features
```

---

## Metrics to Track

**Before & After** (Phase 1 → Phase 2 → Phase 3):

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Target |
|--------|----------|---------|---------|---------|--------|
| Mean R² | 0.109 | 0.25 | 0.45 | 0.58 | 0.50+ |
| Pass Rate | 15% | 35% | 70% | 95% | 100% |
| Std Dev R² | 0.235 | 0.18 | 0.12 | 0.08 | <0.15 |
| Top 3 Avg R² | 0.712 | 0.70 | 0.72 | 0.75 | >0.70 |

---

## Blockers & Dependencies

**Infrastructure**: ✅ CLEAR
- Python environment: fully fixed
- Dependencies: all passing
- Data: ready (4 parquet files + validation artifacts)

**Data Quality**: ✅ CLEAR
- Synthetic tenant profiles: validated
- Weather correlation: by design (matches sensitivity levels)
- ROAS patterns: realistic

**Knowledge**: ⚠️ REQUIRES INPUT
- **Question for Atlas**: Should we prioritize Phase 1 (quick win) or jump to Phase 2 (LightGBM)?
  - Phase 1 = lower risk, 2-3 hour implementation
  - Phase 2 = higher impact, but requires dependency management
  - **Recommendation**: Phase 1 first to prove concept, then Phase 2 if needed

---

## Next Steps for Atlas

1. **Review this diagnostic** with domain expert (Advanced Modeling Engineer)
2. **Decide execution path**:
   - Option A: Phase 1 only (7 hours) → aim for 40-50 models
   - Option B: Phase 1 + Phase 2 (15 hours) → aim for 60-80 models
   - Option C: Full sprint (25 hours) → aim for >95% models
3. **Assign implementation owner** (ideally someone with scikit-learn + LightGBM experience)
4. **Create task breakdown**:
   - T-MLR-4.1: Add interaction & polynomial features
   - T-MLR-4.2: Tune Ridge regularization
   - T-MLR-4.3: Implement & test LightGBM (if Phase 2)
   - T-MLR-4.4: Implement adstock/saturation (if Phase 3)
5. **Run on sample tenant first** (e.g., extreme_rain_gear) to validate approach
6. **Roll out to all 20 tenants** once single-tenant pipeline proven
7. **Unblock product backlog** once pass rate ≥ 70% (likely after Phase 2)

---

## Questions for Escalation

**For Director Dana (Infrastructure)**:
- Should we pre-allocate dev environment with scikit-learn, LightGBM, XGBoost?
- Do we need additional compute for hyperparameter tuning across 20 tenants?

**For Supervisor (Leadership)**:
- Is 2-3 day timeline acceptable for Phase 1-2, or do we need expedited path?
- Should we commit to "R² > 0.50 for all 20 tenants" or accept 70%+ pass rate as MVP?

---

## Files to Modify

**Core Implementation**:
- `apps/model/mmm_lightweight_weather.py` — Add feature engineering + Ridge tuning
- `apps/model/mmm_gradient_boosting.py` — NEW: LightGBM implementation
- `apps/model/train_weather_mmm.py` — Update to use new feature engineering

**Testing**:
- `tests/model/test_train_weather_mmm.py` — Update expectations for new R² levels
- `tests/model/test_validate_model_performance.py` — NEW: gradient boosting tests
- `tests/model/test_mmm_lightweight_weather.py` — Verify interaction/polynomial features

**Validation**:
- `state/analytics/mmm_validation_results.json` — Will be regenerated
- `docs/models/weather_elasticity_analysis.md` — Update with new methodology

---

## Appendix: Code Templates

### Feature Engineering Template
```python
def _build_feature_matrix_enhanced(
    spend_df: pd.DataFrame,
    weather_df: pd.DataFrame,
    channels: List[str],
    weather_features: List[str],
) -> Tuple[np.ndarray, List[str]]:
    """Build enhanced feature matrix with interactions + polynomials."""
    features = []
    names = []
    
    # Raw features
    for col in channels + weather_features:
        features.append(spend_df[col].values if col in spend_df else weather_df[col].values)
        names.append(col)
    
    # Interactions: spend × weather
    for channel in channels:
        for weather in weather_features:
            features.append(spend_df[channel].values * weather_df[weather].values)
            names.append(f"{channel}_{weather}_interaction")
    
    # Polynomials: weather²
    for weather in weather_features:
        features.append(weather_df[weather].values ** 2)
        names.append(f"{weather}_squared")
    
    return np.column_stack(features), names
```

### LightGBM Template
```python
import lightgbm as lgb

class LightGBMMMM:
    def __init__(self, n_estimators: int = 200, max_depth: int = 7):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.model = None
    
    def fit(self, X: np.ndarray, y: np.ndarray) -> 'LightGBMMMM':
        self.model = lgb.LGBMRegressor(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=1.0,
        )
        self.model.fit(X, y)
        return self
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(X)
    
    def get_feature_importance(self) -> Dict[str, float]:
        return dict(zip(self.feature_names, self.model.feature_importances_))
```

---

**Document Owner**: Director Dana  
**Created**: 2025-10-23T18:15:00Z  
**Status**: Ready for Atlas Review & Implementation  
**Revision**: 1.0
