# E13 — Atlas Task Breakdown: Modeling Performance Recovery

**Epic**: E13 — Weather-Aware Modeling Reality  
**Domain**: product | MCP  
**Assigned**: Atlas (Autopilot Lead) + Implementation Engineer  
**Date**: 2025-10-23  
**Status**: READY FOR EXECUTION

---

## Overview

Product backlog is blocked on a single blocker: model R² performance (0.109 vs 0.50 target).

This breakdown provides **three execution paths** with increasing complexity and expected ROI. You choose based on time constraints and risk tolerance.

---

## EXECUTION PATH DECISION

### Option A: Phase 1 Only (Quick Win)
- **Timeline**: 7 hours (can complete in single day)
- **Risk**: Low (additive features, backward-compatible)
- **Expected ROI**: 35-50% models passing (→ 7-10 product tasks unblocked)
- **Recommendation**: START HERE. De-risk with single tenant proof-of-concept.

### Option B: Phase 1 + Phase 2 (Proven Path)
- **Timeline**: 15 hours (1.5-2 days)
- **Risk**: Medium (new dependency: LightGBM, requires testing)
- **Expected ROI**: 70-80% models passing (→ 14-16 product tasks unblocked)
- **Recommendation**: Go here if Phase 1 shows promise. Likely sufficient to satisfy critics.

### Option C: Full Sprint (Complete Solution)
- **Timeline**: 25 hours (3 days)
- **Risk**: Medium-High (complex feature engineering, hyperparameter tuning)
- **Expected ROI**: >95% models passing (→ 19-20 product tasks unblocked)
- **Recommendation**: Only if MVP not acceptable to stakeholders.

**Director Dana Recommendation**: Start Phase 1, evaluate after 4 hours, decide on Phase 2.

---

## PHASE 1: Feature Engineering (7 hours)

### Task 1.1: Add Interaction Terms (2 hours)

**File**: `apps/model/mmm_lightweight_weather.py`

**Location**: In the `_build_feature_matrix()` method (line ~450)

**Change**: After building raw features, add spend × weather interactions

```python
# BEFORE (line ~450)
def _build_feature_matrix(self, ...):
    features: List[np.ndarray] = []
    feature_names: List[str] = []
    # ... current implementation adds raw channels + weather

# AFTER - ADD THIS SECTION
def _build_feature_matrix(self, ...):
    features: List[np.ndarray] = []
    feature_names: List[str] = []
    # ... current implementation adds raw channels + weather
    
    # ✨ NEW: Add spend × weather interactions
    selected_weather = weather_features or self.weather_features
    for channel in channels:
        for weather_feat in selected_weather:
            interaction = spend_df[channel].values * weather_df[weather_feat].values
            features.append(interaction)
            feature_names.append(f"{channel}_x_{weather_feat}")
            # Example: meta_spend_x_temperature
```

**Why This Works**:
- Ridge regression is **linear** → can't learn `spend × temp` without explicit term
- Weather impacts spend effectiveness non-linearly
- Example: sunny day + sunscreen ads = 2x ROAS; rainy day + sunscreen ads = 0.5x ROAS

**Testing**:
```bash
# Run existing test suite
pytest tests/model/test_train_weather_mmm.py -v

# Verify new features are created (add debug output)
# Expected: 6 raw features → 6 + (2 channels × 3 weather) = 12 total features
```

**Expected Impact**: +10-15% on failing models

---

### Task 1.2: Add Polynomial Weather Features (1 hour)

**File**: `apps/model/mmm_lightweight_weather.py`

**Location**: Same method, after interactions

```python
# ADD THIS SECTION after interactions
for weather_feat in selected_weather:
    # Squared terms capture non-linear weather effects
    poly_term = weather_df[weather_feat].values ** 2
    features.append(poly_term)
    feature_names.append(f"{weather_feat}_squared")
    # Example: temperature_squared (captures accelerating demand at temperature extremes)
```

**Why This Works**:
- Ridge regression with polynomials ≈ polynomial regression
- Weather effects often non-linear (e.g., very cold or very hot → extreme demand)
- Example: gym activity peaks at moderate temps, drops sharply at extremes

**Testing**:
```bash
# Same test suite
pytest tests/model/test_train_weather_mmm.py -v

# Check feature names include polynomial terms
```

**Expected Impact**: +5-10% on failing models

---

### Task 1.3: Tune Ridge Regularization (4 hours)

**File**: `apps/model/mmm_lightweight_weather.py` + `apps/model/train_weather_mmm.py`

**Current Code** (line ~388):
```python
model = Ridge(alpha=self.regularization_strength)  # Current: alpha=1.0 (fixed)
```

**New Code**:
```python
from sklearn.model_selection import GridSearchCV
from sklearn.linear_model import Ridge

def fit(self, X_spend, X_weather, y, ...):
    """Fit with automatic alpha tuning."""
    X_train, feature_names = self._build_feature_matrix(...)
    
    # Test multiple regularization strengths
    param_grid = {'alpha': [0.01, 0.1, 1.0, 10.0, 100.0]}
    
    # Use 3-fold CV on training data to find best alpha
    model = GridSearchCV(
        Ridge(),
        param_grid,
        cv=3,
        scoring='r2',
    )
    model.fit(X_train, y)
    
    # Store best alpha and use for prediction
    self.best_alpha = model.best_params_['alpha']
    self.model = model.best_estimator_
    
    # ... rest of fit method
```

**Why This Works**:
- Different tenants need different regularization strengths
- Too weak (alpha=0.01) → overfits to noise
- Too strong (alpha=100) → underfits, misses signal
- GridSearchCV finds Goldilocks zone automatically

**Implementation Notes**:
- Run on training fold only (don't use test data for tuning!)
- Track best_alpha for each tenant in metadata
- Compare against baseline alpha=1.0 on passing models (expect similar or better performance)

**Testing**:
```bash
# Create test that verifies alpha tuning
pytest tests/model/test_train_weather_mmm.py::test_ridge_tuning -v

# Run on passing model to verify no regression
python -c "
from apps.model.mmm_lightweight_weather import train_single_tenant_with_cv
results = train_single_tenant_with_cv('extreme_rain_gear')
assert results['mean_r2'] >= 0.70, f'Regression! R² dropped to {results[\"mean_r2\"]}'
print('✅ Passing model still passes after alpha tuning')
"
```

**Expected Impact**: +10-15% on failing models (especially medium_* category)

---

## VALIDATION CHECKPOINT: Phase 1 Complete

After completing Tasks 1.1-1.3:

1. **Run full validation suite**:
   ```bash
   cd tools/wvo_mcp && npm run build
   bash ../../scripts/check_modeling_env.sh
   pytest tests/model/test_train_weather_mmm.py -v
   pytest tests/model/test_validate_model_performance.py -v
   ```

2. **Train on all 20 tenants**:
   ```python
   from apps.model.mmm_lightweight_weather import TenantModelTrainer
   trainer = TenantModelTrainer()
   results = trainer.train_all_tenants_with_cv(n_folds=5)
   
   # Export results
   import json
   with open('state/analytics/phase1_results.json', 'w') as f:
       json.dump(results, f, indent=2)
   ```

3. **Check metrics**:
   ```python
   import json
   with open('state/analytics/phase1_results.json') as f:
       results = json.load(f)
   
   mean_r2 = np.mean([v['mean_r2'] for v in results.values()])
   pass_count = sum(1 for v in results.values() if v['mean_r2'] >= 0.50)
   
   print(f"Mean R²: {mean_r2:.3f} (target: 0.25)")
   print(f"Pass rate: {pass_count}/20 (target: 7-10)")
   ```

4. **Decision Point**:
   - If `pass_count >= 10`: **PROCEED TO PHASE 2**
   - If `pass_count >= 7`: **PHASE 1 SUFFICIENT (unblock product tasks)**
   - If `pass_count < 7`: **ESCALATE (Phase 1 insufficient, may need Phase 2)**

---

## PHASE 2: Gradient Boosting (8 hours)

### Task 2.1: Create LightGBM Implementation (6 hours)

**File**: Create `apps/model/mmm_gradient_boosting.py` (NEW FILE)

```python
"""Gradient Boosting MMM with weather-aware features.

Uses LightGBM to capture non-linear relationships between spend, weather, and revenue.
Replaces Ridge regression for tenants where Ridge underperforms (R² < 0.50).
"""

import numpy as np
import pandas as pd
import lightgbm as lgb
from typing import Dict, List, Optional, Tuple

class GradientBoostingMMM:
    """LightGBM-based weather-aware MMM."""
    
    def __init__(
        self,
        n_estimators: int = 200,
        max_depth: int = 7,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
    ):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.model = None
        self.feature_names = None
        self.feature_importance = None
    
    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        feature_names: List[str],
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
    ) -> 'GradientBoostingMMM':
        """Fit LightGBM model with optional validation set."""
        self.feature_names = feature_names
        
        self.model = lgb.LGBMRegressor(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            subsample=self.subsample,
            colsample_bytree=self.colsample_bytree,
            reg_alpha=0.1,  # L1 (Lasso) regularization
            reg_lambda=1.0,  # L2 (Ridge) regularization
            verbose=-1,
        )
        
        # Fit with validation set if provided (early stopping)
        if X_val is not None and y_val is not None:
            self.model.fit(
                X_train, y_train,
                eval_set=[(X_val, y_val)],
                eval_metric='rmse',
                callbacks=[
                    lgb.early_stopping(10),  # Stop if no improvement for 10 rounds
                    lgb.log_evaluation(0),
                ]
            )
        else:
            self.model.fit(X_train, y_train)
        
        # Store feature importance
        self.feature_importance = dict(
            zip(feature_names, self.model.feature_importances_)
        )
        
        return self
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """Generate predictions."""
        return self.model.predict(X)
    
    def get_feature_importance_sorted(self, top_n: int = 10) -> List[Tuple[str, float]]:
        """Return top N features by importance."""
        return sorted(
            self.feature_importance.items(),
            key=lambda x: x[1],
            reverse=True,
        )[:top_n]
```

**Why LightGBM Over XGBoost**:
- Faster training (2-3x speedup on medium-sized datasets)
- Built-in feature interaction detection
- Better memory efficiency
- Proven track record in MMM applications (published papers)

**Integration Point**: In `train_weather_mmm.py`, use LightGBM for tenants where Ridge R² < 0.50

---

### Task 2.2: Create Ensemble Blender (2 hours)

**File**: Add to `apps/model/train_weather_mmm.py`

```python
def blend_predictions(
    ridge_pred: np.ndarray,
    gbm_pred: np.ndarray,
    blend_weight: float = 0.4,  # 40% Ridge, 60% GBM
) -> np.ndarray:
    """Blend Ridge and GBM predictions using weighted average.
    
    Args:
        ridge_pred: Predictions from Ridge model
        gbm_pred: Predictions from GradientBoosting model
        blend_weight: Weight for Ridge (GBM weight = 1 - blend_weight)
    
    Returns:
        Blended predictions
    """
    return blend_weight * ridge_pred + (1 - blend_weight) * gbm_pred


def train_with_fallback(tenant_id: str, data: Dict) -> Dict:
    """Train with Ridge first; if R² < 0.50, use GBM; if both fail, blend.
    
    Strategy:
    1. Train Ridge on tenant data
    2. If Ridge R² >= 0.50: USE RIDGE (proven safe)
    3. If Ridge R² < 0.50:
       a. Train GBM on same data
       b. If GBM R² >= 0.50: USE GBM
       c. If both < 0.50: BLEND (0.4 Ridge + 0.6 GBM)
    """
    # Train Ridge
    ridge_model = WeatherAwareMMM(...)
    ridge_result = ridge_model.fit(X_spend, X_weather, y)
    
    if ridge_result.train_r2 >= 0.50:
        return ridge_result  # Ridge is good enough
    
    # Ridge failed; try GBM
    gbm_model = GradientBoostingMMM(...)
    gbm_result = gbm_model.fit(X_train, y_train, feature_names)
    gbm_r2 = compute_r2(y_val, gbm_model.predict(X_val))
    
    if gbm_r2 >= 0.50:
        return gbm_result  # GBM is good enough
    
    # Both failed; blend them
    ridge_pred = ridge_model.predict(X_train)
    gbm_pred = gbm_model.predict(X_train)
    blended_pred = blend_predictions(ridge_pred, gbm_pred, blend_weight=0.4)
    
    return WeatherAwareMMResult(
        model_name="blended_ridge_gbm",
        train_r2=compute_r2(y_train, blended_pred),
        # ... other fields
    )
```

**Why Blending**:
- Some tenants may respond better to Ridge (simple signal)
- Others respond better to GBM (complex interactions)
- Blending captures both strengths, reduces both weaknesses

---

## VALIDATION CHECKPOINT: Phase 2 Complete

After Phase 2:

1. **Run full validation**:
   ```bash
   pytest tests/model/test_train_weather_mmm.py -v
   pytest tests/model/test_mmm_gradient_boosting.py -v  # New test file
   ```

2. **Compare Phase 1 vs Phase 2**:
   ```python
   # Load results from Phase 1
   with open('state/analytics/phase1_results.json') as f:
       phase1 = json.load(f)
   
   # Train Phase 2 and save
   # (Code to train GBM + blend)
   with open('state/analytics/phase2_results.json', 'w') as f:
       json.dump(phase2, f)
   
   # Compare
   phase1_mean_r2 = np.mean([v['mean_r2'] for v in phase1.values()])
   phase2_mean_r2 = np.mean([v['mean_r2'] for v in phase2.values()])
   
   phase1_pass = sum(1 for v in phase1.values() if v['mean_r2'] >= 0.50)
   phase2_pass = sum(1 for v in phase2.values() if v['mean_r2'] >= 0.50)
   
   print(f"Phase 1: R²={phase1_mean_r2:.3f}, Pass={phase1_pass}/20")
   print(f"Phase 2: R²={phase2_mean_r2:.3f}, Pass={phase2_pass}/20")
   print(f"Improvement: +{(phase2_pass - phase1_pass)} models, +{phase2_mean_r2 - phase1_mean_r2:.3f} R²")
   ```

3. **Decision Point**:
   - If `phase2_pass >= 14`: **STOP (sufficient for product release)**
   - If `14 > phase2_pass >= 10`: **UNBLOCK PRODUCT (70% pass rate acceptable MVP)**
   - If `phase2_pass < 10`: **ESCALATE (Phase 3 may be needed)**

---

## PHASE 3: Adstock + Saturation (18 hours)

*Only execute if Phase 2 pass rate < 70%*

### Task 3.1: Implement Geometric Adstock (6 hours)

**File**: Create `apps/model/adstock_transform.py` (NEW FILE)

```python
"""Adstock transformation for MMM spend features.

Captures the carry-over effect of advertising: today's spend influences
revenue not just today, but for the next 7-14 days (depending on decay rate).

Formula: adstocked_t = spend_t + decay × adstocked_{t-1}

Common decay rates:
- 0.1-0.3: Weak carry-over (daily deals, flash sales)
- 0.3-0.7: Medium carry-over (typical brand spend)
- 0.7-0.9: Strong carry-over (brand building, awareness campaigns)
"""

import numpy as np
from typing import Dict

def geometric_adstock(
    spend: np.ndarray,
    decay: float,
    normalizing_factor: int = 13,
) -> np.ndarray:
    """Apply geometric adstock transformation.
    
    Args:
        spend: Time series of media spend (n_days,)
        decay: Decay rate ∈ [0, 1]
        normalizing_factor: Cutoff for considering influence (default 13 days)
    
    Returns:
        Adstocked spend series (same shape as input)
    """
    adstocked = np.zeros_like(spend, dtype=float)
    
    for t in range(len(spend)):
        # For each day t, sum contributions from days t-n to t
        for lag in range(min(normalizing_factor, t + 1)):
            adstocked[t] += spend[t - lag] * (decay ** lag)
    
    return adstocked


def find_optimal_decay(
    spend_matrix: np.ndarray,  # (n_days, n_channels)
    revenue: np.ndarray,  # (n_days,)
    decay_range: np.ndarray = np.linspace(0.1, 0.9, 9),
) -> Dict[str, float]:
    """Grid search to find optimal decay for each channel.
    
    Args:
        spend_matrix: Spend by channel over time
        revenue: Revenue over time
        decay_range: Decay values to test
    
    Returns:
        Best decay for each channel
    """
    from sklearn.linear_model import Ridge
    
    best_decay = {}
    best_r2 = {}
    
    for channel_idx in range(spend_matrix.shape[1]):
        best_r2[channel_idx] = -np.inf
        best_decay[channel_idx] = 0.5  # Default
        
        for decay in decay_range:
            adstocked = geometric_adstock(spend_matrix[:, channel_idx], decay)
            
            # Fit simple model: revenue ~ adstocked_spend
            model = Ridge(alpha=1.0)
            model.fit(adstocked.reshape(-1, 1), revenue)
            r2 = model.score(adstocked.reshape(-1, 1), revenue)
            
            if r2 > best_r2[channel_idx]:
                best_r2[channel_idx] = r2
                best_decay[channel_idx] = decay
    
    return best_decay
```

**Integration**: Use in `train_weather_mmm.py` before feature matrix creation:

```python
from apps.model.adstock_transform import find_optimal_decay, geometric_adstock

# For each tenant, find optimal decay
optimal_decay = find_optimal_decay(spend_matrix, revenue)

# Apply adstock transformation
spend_adstocked = spend_matrix.copy()
for channel_idx, decay in optimal_decay.items():
    spend_adstocked[:, channel_idx] = geometric_adstock(
        spend_matrix[:, channel_idx],
        decay
    )

# Continue with ridge/gbm training using adstocked spend
```

---

### Task 3.2: Implement Hill Saturation (6 hours)

**File**: Add to `apps/model/adstock_transform.py`

```python
def hill_saturation(
    x: np.ndarray,
    k: float,
    s: float,
) -> np.ndarray:
    """Apply Hill saturation transformation.
    
    Captures diminishing returns to scale:
    - Doubling spend doesn't double revenue
    - Effect plateaus at high spend levels
    
    Formula: y = x^s / (k^s + x^s)
    
    Args:
        x: Input (typically adstocked spend)
        k: Half-saturation point (spend at 50% max effect)
        s: Elasticity parameter (curvature)
          - s=1: mild saturation
          - s=0.5: strong saturation
    
    Returns:
        Saturated values ∈ [0, 1] (scaled by spend mean)
    """
    return np.power(x, s) / (np.power(k, s) + np.power(x, s))


def find_optimal_saturation(
    spend: np.ndarray,
    revenue: np.ndarray,
    k_range: np.ndarray = np.linspace(100, 10000, 20),
    s_range: np.ndarray = np.linspace(0.3, 1.5, 10),
) -> Dict[str, float]:
    """Grid search for optimal saturation parameters.
    
    Args:
        spend: Adstocked spend
        revenue: Revenue
        k_range: Half-saturation points to test
        s_range: Elasticity parameters to test
    
    Returns:
        Best k and s parameters
    """
    from sklearn.linear_model import Ridge
    
    best_r2 = -np.inf
    best_params = {'k': 1000, 's': 0.5}
    
    for k in k_range:
        for s in s_range:
            saturated = hill_saturation(spend, k, s)
            
            model = Ridge(alpha=1.0)
            model.fit(saturated.reshape(-1, 1), revenue)
            r2 = model.score(saturated.reshape(-1, 1), revenue)
            
            if r2 > best_r2:
                best_r2 = r2
                best_params = {'k': k, 's': s}
    
    return best_params
```

---

### Task 3.3: Hyperparameter Optimization (6 hours)

**File**: Add to `train_weather_mmm.py`

```python
def train_with_full_preprocessing(
    tenant_id: str,
    data: Dict,
    n_folds: int = 5,
) -> Dict:
    """Train MMM with adstock + saturation preprocessing + GBM.
    
    Full pipeline:
    1. Find optimal decay for each channel (via grid search on fold 1-4)
    2. Apply geometric adstock with optimal decay
    3. Find optimal saturation (k, s) via grid search
    4. Apply Hill saturation
    5. Train GBM on preprocessed features
    6. Evaluate on fold 5 (held-out test)
    """
    
    # Split into train and test
    train_idx = int(len(data) * 0.8)
    train_data = data[:train_idx]
    test_data = data[train_idx:]
    
    # Step 1: Find optimal decay on training data
    optimal_decay = find_optimal_decay(
        train_data['spend'].values,
        train_data['revenue'].values,
    )
    
    # Step 2: Apply adstock to full dataset
    spend_adstocked = apply_adstock_all_channels(
        data['spend'].values,
        optimal_decay,
    )
    
    # Step 3: Find optimal saturation on training data
    optimal_saturation = find_optimal_saturation(
        spend_adstocked[:train_idx],
        train_data['revenue'].values,
    )
    
    # Step 4: Apply saturation to full dataset
    spend_saturated = hill_saturation(
        spend_adstocked,
        optimal_saturation['k'],
        optimal_saturation['s'],
    )
    
    # Step 5: Train GBM on preprocessed features
    X_train = np.hstack([spend_saturated[:train_idx], data['weather'].values[:train_idx]])
    y_train = train_data['revenue'].values
    
    gbm = GradientBoostingMMM(n_estimators=200)
    gbm.fit(X_train, y_train)
    
    # Step 6: Evaluate on test set
    X_test = np.hstack([spend_saturated[train_idx:], data['weather'].values[train_idx:]])
    y_test = test_data['revenue'].values
    test_r2 = gbm.score(X_test, y_test)
    
    return {
        'tenant_id': tenant_id,
        'test_r2': test_r2,
        'optimal_decay': optimal_decay,
        'optimal_saturation': optimal_saturation,
        'model': gbm,
    }
```

---

## TESTING STRATEGY

### Unit Tests (Quick Checks)
```bash
pytest tests/model/test_adstock_transform.py -v
pytest tests/model/test_mmm_gradient_boosting.py -v
```

### Integration Tests (Full Pipeline)
```bash
pytest tests/model/test_train_weather_mmm.py -v
pytest tests/model/test_validate_model_performance.py -v
```

### Regression Tests (Verify Passing Models)
```python
# Ensure we don't break passing models
for tenant in ["extreme_rain_gear", "high_outdoor_gear", "high_umbrella_rain"]:
    old_r2 = 0.71
    new_r2 = train_and_evaluate(tenant, phase2_method)
    assert new_r2 >= 0.68, f"Regression on {tenant}: {new_r2} < {old_r2}"
```

### End-to-End Smoke Test
```bash
bash scripts/check_modeling_env.sh
# Should pass with all checks green
```

---

## DELIVERABLES

### Phase 1
- [ ] Task 1.1: Interaction terms (2 hrs)
- [ ] Task 1.2: Polynomial features (1 hr)
- [ ] Task 1.3: Ridge tuning (4 hrs)
- [ ] Validation: phase1_results.json with 20-model metrics
- [ ] Commit: "feat(model): Add interaction + polynomial features, tune Ridge alpha"

### Phase 2
- [ ] Task 2.1: LightGBM implementation (6 hrs)
- [ ] Task 2.2: Ensemble blender (2 hrs)
- [ ] Validation: phase2_results.json with 20-model metrics
- [ ] Commit: "feat(model): Add LightGBM alternative + ensemble blending"

### Phase 3 (if needed)
- [ ] Task 3.1: Geometric adstock (6 hrs)
- [ ] Task 3.2: Hill saturation (6 hrs)
- [ ] Task 3.3: Hyperparameter optimization (6 hrs)
- [ ] Validation: phase3_results.json with 20-model metrics + decay/saturation params
- [ ] Commit: "feat(model): Add adstock + saturation preprocessing, hyperparameter optimization"

---

## UNBLOCK TIMELINE

| Phase | Completion | Expected Pass Rate | Product Tasks Unblocked |
|-------|-----------|-------------------|------------------------|
| Phase 1 | 7 hours | 35-50% | 7-10 tasks |
| Phase 2 | 15 hours | 70-80% | 14-16 tasks |
| Phase 3 | 25 hours | >95% | 19-20 tasks |

**Recommendation**: Complete Phase 1, evaluate, then decide on Phase 2 based on results.

---

## Success Criteria

### Phase 1 Success
- ✅ All tests pass (`pytest tests/model/test_train_weather_mmm.py -v`)
- ✅ Passing models maintain R² ≥ 0.70 (no regression)
- ✅ Mean R² increases from 0.109 to 0.25+
- ✅ Pass rate increases from 15% to 25%+

### Phase 2 Success
- ✅ All tests pass (including new LightGBM tests)
- ✅ Passing models maintain R² ≥ 0.70
- ✅ Mean R² increases to 0.45+
- ✅ Pass rate increases to 70%+

### Phase 3 Success
- ✅ All tests pass (including adstock/saturation tests)
- ✅ Passing models maintain R² ≥ 0.70
- ✅ Mean R² increases to 0.58+
- ✅ Pass rate reaches >95%

---

## Escalation Criteria

**STOP and escalate if**:
1. Phase 1 regression (passing models drop below 0.70)
2. Phase 2 mean R² decreases (Phase 2 worse than Phase 1)
3. Tests fail with no obvious fix
4. Dependencies (LightGBM) install issues

**Contact Director Dana immediately if** any blockers occur.

---

## Questions for Implementation

1. **Environment**: Is LightGBM pre-installed? If not, add to requirements.txt?
2. **Compute**: Do we have sufficient memory/CPU for 20×5-fold GBM training? (Est. 2-4 min per tenant)
3. **Timeline**: Can this be completed in 1-2 days, or do we need to split across team?
4. **Acceptance Criteria**: What pass rate is acceptable for MVP? (70%? 80%? 100%?)

---

**Document Owner**: Director Dana (prepared for Atlas)  
**Created**: 2025-10-23T18:20:00Z  
**Status**: READY FOR ATLAS EXECUTION  
**Revision**: 1.0
