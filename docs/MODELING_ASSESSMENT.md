# WeatherVane Modeling Capability Assessment

**Date:** 2025-10-09
**Reviewer:** Claude (Sonnet 4.5)
**Question:** Can the models actually perform the weather-aware budget optimization task?

---

## Executive Summary

**Verdict: Current models are NOT production-ready for causal weather-driven recommendations.**

The technical architecture is excellent (time-series validation, context warnings, uncertainty propagation), but the **statistical models lack the sophistication to deliver on the core value proposition**: proving that weather causally drives demand and optimizing spend accordingly.

**Critical gaps:**
1. ❌ **No causal inference** - Correlation ≠ causation (weather might correlate with revenue but not drive it)
2. ❌ **Weak MMM** - Not true media mix modeling (missing adstock, saturation, carryover)
3. ❌ **Limited weather features** - Only temp/precip (missing humidity, UV, wind, pollen, air quality)
4. ❌ **No spatial heterogeneity** - Same model for all geographies (NYC ≠ LA)
5. ⚠️ **Quantile validation missing** - p10/p50/p90 never validated for calibration
6. ⚠️ **Forecast uncertainty ignored** - 7-day plans but weather forecasts degrade after day 3

**What works:**
- ✅ Time-series validation rigor (blocked CV, holdout, no leakage)
- ✅ LightGBM foundation (better than OLS)
- ✅ Climatology-based anomaly detection
- ✅ Uncertainty propagation architecture (quantiles flow through stack)

**Bottom line:** You can claim "weather correlates with revenue" but **cannot yet claim "weather drives revenue" or "adjust spend accordingly."** This requires causal modeling upgrades.

---

## 1. Media Mix Modeling (MMM) Assessment

**File:** `apps/model/mmm.py`

### Current Implementation

```python
# Line 90-93: "Elasticity" is just correlation coefficient
cov = float(frame.select(pl.cov(pl.col(col), pl.col(revenue_col))).item())
elasticity_raw = cov / variance if variance else 0.0
```

**This is NOT media mix modeling.** It's a simple covariance/variance calculation.

### What's Missing

Real MMM requires:

#### 1.1 Adstock / Carryover Effects
**Problem:** Ads don't impact sales instantly. Someone sees an ad on Monday, buys on Thursday.

**Solution:** Adstock transformation:
```python
# Geometric decay: today's effect = current spend + α × yesterday's effect
adstocked_spend[t] = spend[t] + alpha * adstocked_spend[t-1]

# Or distributed lag:
adstocked_spend[t] = sum(theta[i] * spend[t-i] for i in range(lag_window))
```

**Impact:** Without adstock, you:
- Underestimate ad effectiveness (miss delayed conversions)
- Can't optimize pacing (front-load vs steady spend)
- Misattribute sales to organic when they're from earlier ads

#### 1.2 Saturation Curves (Diminishing Returns)
**Problem:** First $1K of spend has higher ROAS than 10th $1K. Linear elasticity assumes constant marginal return.

**Solution:** Hill/Michaelis-Menten saturation:
```python
# S-curve: response = K * spend^gamma / (half_sat^gamma + spend^gamma)
saturated_response = K * (spend ** gamma) / (half_sat ** gamma + spend ** gamma)
```

**Impact:** Without saturation:
- Recommend infinite spend (no diminishing returns modeled)
- Miss optimal spend point (where marginal ROAS = target)
- Can't identify wasted spend

#### 1.3 Hierarchical Structure
**Problem:** Brand ads (awareness) and performance ads (conversion) work differently. Single-level model conflates them.

**Solution:** Hierarchical Bayesian model:
```
Revenue ~ f(brand_spend, performance_spend, weather, seasonality)
  where brand_spend has long carryover (weeks)
        performance_spend has short carryover (days)
```

**Impact:** Without hierarchy:
- Misattribute brand lift to performance
- Optimize for short-term conversions, harm long-term brand
- Can't separate "new customers" (brand-driven) from "repeat buyers" (performance)

#### 1.4 Causal Identification
**Problem:** Correlation ≠ causation. Weather and revenue might both correlate with holidays/seasons.

**Solution:** Instrumental variables or quasi-experimental design:
```
# Example: Use weather forecast errors as instrument
# (forecast error uncorrelated with actual demand drivers)
IV_estimate = Cov(revenue, weather_forecast_error) / Cov(actual_weather, weather_forecast_error)
```

**Impact:** Without causal ID:
- Can't claim "weather drove sales"
- Recommendations might chase spurious correlations
- No defensibility in litigation/audits ("you blamed weather for our losses")

### Recommendation: Integrate Robyn or LightweightMMM

**Option A: Meta's Robyn** (R package)
- Includes adstock, saturation, Bayesian priors
- Multi-objective optimization (sales + efficiency)
- Prophet for seasonality decomposition
- Industry-proven (Meta uses internally)

**Option B: Google's LightweightMMM** (Python)
- Bayesian MMM with adstock + saturation via JAX
- Integrates with NumPyro for probabilistic programming
- Faster than Robyn, easier Python integration

**Implementation path:**
```python
# apps/model/mmm_v2.py (new file)
from lightweight_mmm import LightweightMMM

def fit_mmm_v2(data, media_spend_cols, target_col):
    mmm = LightweightMMM()
    mmm.fit(
        media=data[media_spend_cols].to_numpy(),
        target=data[target_col].to_numpy(),
        media_prior=geometric_adstock_prior,  # Carryover
        extra_features=data[['temp_anomaly', 'precip_anomaly']].to_numpy()
    )
    return mmm

# Get optimal allocation
optimal_budget = mmm.optimize_media(
    total_budget=100_000,
    target_roas=2.5
)
```

**Effort:** 2-3 weeks for integration + validation

---

## 2. Weather Feature Engineering Assessment

**File:** `shared/feature_store/weather_cache.py`

### Current Features (Lines 154-163)

```python
frame.select([
    "date",
    "geohash",
    "temp_c",              # Raw temperature
    "precip_mm",           # Raw precipitation
    "temp_anomaly",        # vs climatology
    "precip_anomaly",      # vs climatology
    "temp_roll7",          # 7-day rolling average
    "precip_roll7",
])
```

**This is minimal.** Only 2 weather variables (temp, precip) with basic transformations.

### What's Missing

#### 2.1 Additional Weather Variables
**Missing from Open-Meteo API:**
- `humidity_relative` - High humidity suppresses outdoor activity
- `windspeed_10m` - Wind chill affects perceived temperature
- `uv_index` - Drives sunscreen, beach gear demand
- `cloudcover` - Affects outdoor dining, events
- `visibility` - Fog/haze impacts traffic, foot traffic
- `air_quality_index` - Smog alerts suppress outdoor activity
- `pollen_count` - Allergies drive antihistamine sales
- `snowfall` / `snow_depth` - Winter sports, heating products

**Solution:** Expand `WeatherConnector` to fetch:
```python
# Open-Meteo supports these via hourly/daily params
params = {
    "hourly": ["temperature_2m", "precipitation", "relative_humidity_2m", "windspeed_10m", "uv_index"],
    "daily": ["temperature_2m_mean", "precipitation_sum", "uv_index_max", "cloudcover_mean"]
}
```

**Impact:** More weather signals → better predictive power, richer stories ("UV spike drove sunscreen sales +40%")

#### 2.2 Lagged Weather Features
**Problem:** Weather affects shopping with delay (see storm forecast → stock up today).

**Solution:** Add lags:
```python
# Feature builder adds:
"temp_lag1",  # Yesterday's temp
"temp_lag3",  # 3 days ago
"precip_lag7", # Last week's rain
"temp_forecast_3d",  # 3-day ahead forecast
```

**Impact:** Capture anticipatory behavior (forecast-driven stockpiling)

#### 2.3 Weather Events (Binary Flags)
**Problem:** Continuous variables miss thresholds (32°F freeze vs 33°F matters for ice melt sales).

**Solution:** Derive binary event flags:
```python
"is_heatwave": temp_c > 35 and temp_anomaly > 5,
"is_freeze": temp_c < 0,
"is_heavy_rain": precip_mm > 25,
"is_storm": windspeed > 50 and precip_mm > 10,
"is_perfect_weather": temp_c in [18, 25] and precip_mm < 1 and cloudcover < 30,
```

**Impact:** Capture nonlinear effects (sales jump at freeze threshold, not gradually)

#### 2.4 Extreme Weather Duration
**Problem:** One hot day vs week-long heatwave have different impacts.

**Solution:** Duration features:
```python
"heatwave_days": consecutive days above threshold,
"dry_spell_days": consecutive days without rain,
"cold_snap_days": consecutive days below freezing,
```

**Impact:** Better model cumulative effects (day 5 of heatwave has different behavior than day 1)

#### 2.5 Weather Volatility
**Problem:** Stable weather vs rapid changes affect planning behavior.

**Solution:** Volatility metrics:
```python
"temp_std_7d": rolling 7-day std deviation of temp,
"precip_volatility": count of rainy days in last 14 days,
"temp_swing": max(temp) - min(temp) over last 7 days,
```

**Impact:** Capture uncertainty-driven stockpiling behavior

### Recommendation: Phased Weather Feature Expansion

**Phase 1 (Quick wins - 1 week):**
- Add humidity, windspeed, UV from Open-Meteo
- Compute lag-1, lag-3, lag-7 for temp/precip
- Add binary event flags (heatwave, freeze, heavy_rain)

**Phase 2 (External data - 2-3 weeks):**
- Integrate air quality API (EPA AirNow or IQAir)
- Pollen API (if relevant vertical: pharmacy, outdoor)
- Extended forecast (7-14 day) with uncertainty

**Phase 3 (Derived features - 1 week):**
- Duration metrics (heatwave_days, dry_spell_days)
- Volatility metrics (temp_std, swing)
- Interaction terms (temp × humidity = "feels_like")

---

## 3. Causal Inference Assessment

**Current Approach:** Correlation-based (LightGBM predicts revenue from weather + spend).

**Problem:** Cannot distinguish:
- **Causal:** Weather → Demand → Revenue
- **Spurious:** Season → Weather + Demand → Revenue (both driven by holidays)

### 3.1 Why Causality Matters

**Scenario:** Model predicts "Revenue increases when temp > 30°C"

**Possible explanations:**
1. ✅ Heat drives demand for cold drinks (CAUSAL - actionable)
2. ❌ Summer vacation → high temp AND high sales (SPURIOUS - not actionable)
3. ❌ July 4th → high temp AND promotions (CONFOUNDED - credit belongs to promo)

**Without causal inference, you can't tell which is true.**

### 3.2 Methods for Causal Identification

#### Option A: Instrumental Variables (IV)
**Instrument:** Weather **forecast error** (predicted - actual)

**Logic:** Forecast errors are random noise, uncorrelated with true demand drivers (holidays, promos), but correlated with actual weather.

**Estimate:**
```python
# 2-Stage Least Squares (2SLS)
# Stage 1: Actual weather ~ Forecast error + controls
# Stage 2: Revenue ~ Predicted weather from stage 1

from statsmodels.iv import IV2SLS

iv_model = IV2SLS(
    dependent=revenue,
    exog=[spend, seasonality, promos],  # Controls
    endog=[actual_weather],              # Endogenous (might be confounded)
    instruments=[forecast_error]         # Instrument (exogenous noise)
).fit()
```

**Pro:** Identifies causal effect of weather on demand
**Con:** Requires historical forecast data (Open-Meteo doesn't provide forecast archives easily)

#### Option B: Difference-in-Differences (DiD)
**Design:** Compare geos with weather shocks to geos without.

**Example:**
- Texas has heatwave week 1 (treatment)
- California doesn't (control)
- Compare TX revenue change vs CA revenue change

**Estimate:**
```python
# DiD regression
model = smf.ols(
    'revenue ~ treat * post + geo_fixed_effects + time_fixed_effects',
    data=panel_data
).fit()

# treat = 1 if geo in treatment group
# post = 1 if time period after weather event
# Coefficient on treat*post = causal weather effect
```

**Pro:** Simple, intuitive, doesn't need instruments
**Con:** Requires parallel trends assumption (TX and CA would trend same without weather)

#### Option C: Regression Discontinuity (RD)
**Design:** Compare outcomes just above vs just below weather threshold.

**Example:**
- Days with temp = 31°C vs 29°C (around 30°C heatwave threshold)
- Assume demand is continuous across threshold
- Any jump = causal heatwave effect

**Estimate:**
```python
# Local linear regression around threshold
from statsmodels.regression.quantile_regression import QuantReg

rd_model = smf.ols(
    'revenue ~ above_threshold + temp_centered + above_threshold:temp_centered',
    data=data[abs(data.temp_c - 30) < 2]  # Narrow window
).fit()

# Coefficient on above_threshold = causal jump at threshold
```

**Pro:** Very credible (clear counterfactual)
**Con:** Only identifies effect at threshold, not across full range

#### Option D: DoWhy / EconML (Causal ML)
**Approach:** Use Microsoft's DoWhy + EconML libraries for heterogeneous treatment effects.

**Workflow:**
```python
from dowhy import CausalModel
from econml.dml import CausalForestDML

# 1. Define causal graph
causal_graph = """
    digraph {
        weather -> revenue;
        season -> weather;
        season -> revenue;
        spend -> revenue;
    }
"""

# 2. Identify causal effect (controlling for confounders)
model = CausalModel(
    data=df,
    treatment='temp_anomaly',
    outcome='revenue',
    graph=causal_graph
)
identified_estimand = model.identify_effect()

# 3. Estimate heterogeneous effects (per geo, product, etc.)
causal_forest = CausalForestDML(
    model_y=LGBMRegressor(),  # Outcome model
    model_t=LGBMRegressor(),  # Treatment model
)
causal_forest.fit(
    Y=df['revenue'],
    T=df['temp_anomaly'],
    X=df[['geo', 'product', 'season']],  # Heterogeneity features
    W=df[['spend', 'promos']]            # Controls
)

# Get personalized treatment effects
effects = causal_forest.effect(X_test)  # "What's the weather effect for THIS geo/product?"
```

**Pro:** Handles complex heterogeneity (different weather effects per segment)
**Con:** Requires careful confounder specification (garbage in → garbage out)

### 3.3 Recommendation: Phased Causal Inference Roadmap

**Phase 1 (Establish baseline - 2 weeks):**
- Document current correlation-based approach in `docs/CAUSAL_LIMITATIONS.md`
- Add disclaimer to UI: "Predicted associations, not proven causal effects"
- Implement basic confounding controls (season indicators, day-of-week, holidays)

**Phase 2 (Quick causal upgrade - 3-4 weeks):**
- Difference-in-Differences using geographic weather shocks
- Validate with historical data: "Would DiD have predicted actual sales?"
- Surface causal estimates in plan rationale: "DiD estimate: +12% lift from heatwave (95% CI: [8%, 16%])"

**Phase 3 (Advanced causal ML - 6-8 weeks):**
- Integrate DoWhy + EconML for heterogeneous effects
- Train CausalForest to estimate weather effects per geo×product
- Build "causal confidence" metric: How certain are we this is causal, not spurious?

**Phase 4 (Gold standard - Future):**
- Run randomized controlled trials (RCTs): Randomly vary spend across geos during weather events
- A/B test: Geo group A gets weather-aware recommendations, Group B gets baseline
- Measure incrementality: Did weather-aware group outperform?

---

## 4. Quantile Prediction & Calibration Assessment

**File:** `apps/model/pipelines/poc_models.py` (Lines 65-73)

### Current Approach: Residual Distribution

```python
# 1. Train point prediction model (LightGBM)
ts_predictions = ts_result.model.predict(ts_features.to_numpy())

# 2. Compute residuals (actual - predicted)
residuals = actuals - ts_predictions

# 3. Convert to relative errors
ratio_residuals = residuals / prediction_safe
distribution = np.clip(1.0 + ratio_residuals, 0.0, None)

# 4. Take historical quantiles
q10 = float(np.quantile(distribution, 0.10))
q50 = float(np.quantile(distribution, 0.50))
q90 = float(np.quantile(distribution, 0.90))
```

**This assumes residuals are stationary and i.i.d. (independent, identically distributed).**

### Problems with This Approach

#### 4.1 Non-Stationary Errors
**Assumption:** Error distribution is constant over time.

**Reality:** Errors might be larger during:
- New product launches (more uncertainty)
- Volatile weather periods (forecast errors)
- Promotional weeks (behavioral shifts)

**Result:** Quantiles computed on full history don't reflect current uncertainty.

**Fix:** Use rolling window for quantile estimation:
```python
# Only use last 90 days of residuals
recent_residuals = residuals[-90:]
q10, q50, q90 = np.quantile(recent_residuals, [0.1, 0.5, 0.9])
```

#### 4.2 Heteroskedasticity (Non-Constant Variance)
**Assumption:** Error size doesn't depend on predicted value.

**Reality:** Larger predictions have larger errors (variance scales with level).

**Result:** Wide confidence bands for high revenue, narrow for low revenue.

**Fix:** Model variance as function of prediction:
```python
# Train separate model for error variance
variance_model = LGBMRegressor()
variance_model.fit(X, np.abs(residuals))

# Generate prediction-specific quantiles
predicted_std = variance_model.predict(X_new)
q10 = prediction - 1.28 * predicted_std  # 1.28 = 10th percentile of normal
q90 = prediction + 1.28 * predicted_std
```

#### 4.3 No Calibration Validation
**Problem:** Never check if quantiles are accurate.

**Test:** Do 80% of actual outcomes fall between p10 and p90?

**Solution:** Calibration monitoring (already proposed in roadmap Phase 0.5):
```python
# apps/model/feedback/calibration.py
def evaluate_calibration(predictions, actuals):
    in_range = (actuals >= predictions.p10) & (actuals <= predictions.p90)
    coverage = in_range.mean()

    # Should be ~0.80; if <0.7 or >0.9, recalibrate
    return {
        'coverage_p10_p90': coverage,
        'sharpness': (predictions.p90 - predictions.p10).mean(),  # Prefer narrow + accurate
        'miscalibration': abs(coverage - 0.80)
    }
```

### Recommendation: Quantile Regression

Instead of residual-based quantiles, **directly model quantiles**:

```python
# Train 3 models: one for p10, p50, p90
from lightgbm import LGBMRegressor

model_p10 = LGBMRegressor(objective='quantile', alpha=0.10)
model_p50 = LGBMRegressor(objective='quantile', alpha=0.50)
model_p90 = LGBMRegressor(objective='quantile', alpha=0.90)

model_p10.fit(X_train, y_train)
model_p50.fit(X_train, y_train)
model_p90.fit(X_train, y_train)

# Predictions are quantile-specific
pred_p10 = model_p10.predict(X_new)
pred_p50 = model_p50.predict(X_new)
pred_p90 = model_p90.predict(X_new)
```

**Advantages:**
- Quantiles adapt to heteroskedasticity automatically
- No stationarity assumption needed
- Guaranteed monotonicity (p10 ≤ p50 ≤ p90) with post-processing

**Implementation:** 1-2 weeks (swap residual logic for quantile models)

---

## 5. Geographic Heterogeneity Assessment

**Current Approach:** Single global model for all geographies.

**Problem:** Weather effects vary by location:
- **Phoenix, AZ:** 40°C is normal summer → minimal demand impact
- **Seattle, WA:** 40°C is extreme heatwave → AC unit sales spike 500%

### 5.1 Missing: Geographic Embeddings

**Solution:** Learn location-specific parameters.

#### Option A: Fixed Effects (Simple)
```python
# Add geo dummy variables
model = LGBMRegressor()
model.fit(
    X=pd.concat([
        X_features,
        pd.get_dummies(geo_column)  # One-hot encode geo
    ], axis=1),
    y=revenue
)
```

**Pro:** Easy
**Con:** Doesn't share information across similar geos (Phoenix and Las Vegas should share "desert" characteristics)

#### Option B: Hierarchical Model (Better)
```python
# Partial pooling: geo-specific effects regularized toward global mean
import pymc as pm

with pm.Model() as hierarchical_model:
    # Global parameters
    beta_global = pm.Normal('beta_global', mu=0, sigma=1)

    # Geo-specific deviations
    sigma_geo = pm.HalfNormal('sigma_geo', sigma=0.5)
    beta_geo = pm.Normal('beta_geo', mu=beta_global, sigma=sigma_geo, shape=n_geos)

    # Likelihood
    mu = beta_geo[geo_idx] * weather + ...
    revenue = pm.Normal('revenue', mu=mu, sigma=sigma, observed=y)
```

**Pro:** Shares information (small geos borrow strength from large geos)
**Con:** Slower training (MCMC sampling)

#### Option C: Spatial Model (Best)
```python
# Model weather effect as smooth function of latitude/longitude
from sklearn.gaussian_process import GaussianProcessRegressor

# Feature: [lat, lon, temp_anomaly, precip_anomaly, ...]
# Target: revenue

gp_model = GaussianProcessRegressor(
    kernel=RBF(length_scale=[1.0, 1.0, 0.5, 0.5])  # Spatial smoothness
)
gp_model.fit(geo_features, revenue)

# Predict for new geo (interpolates from nearby geos)
pred = gp_model.predict([[lat_new, lon_new, temp, precip]])
```

**Pro:** Handles new geos gracefully (interpolates from neighbors)
**Con:** Computationally expensive for large datasets

### 5.2 Recommendation: Geo-Stratified Models

**Phase 1 (Quick win - 2 weeks):**
- Cluster geos by climate (K-means on historical weather stats)
- Train separate model per cluster (e.g., "desert", "coastal", "continental", "tropical")
- Route predictions to appropriate cluster model

**Phase 2 (Advanced - 4-6 weeks):**
- Hierarchical Bayesian model with partial pooling
- Estimate geo-specific weather elasticities
- Surface in UI: "Heatwave impact in TX: +18% (Phoenix: +8%)"

---

## 6. Forecast Horizon & Uncertainty Assessment

**Current Approach:** Generate 7-day plans using weather forecasts.

**Problem:** Weather forecast accuracy degrades with horizon:
- **Day 1-2:** ~90% accurate (temperature within 2°C)
- **Day 3-5:** ~75% accurate (temperature within 4°C)
- **Day 6-7:** ~60% accurate (temperature within 6°C)
- **Day 8+:** Worse than climatology

### 6.1 Missing: Forecast Uncertainty Propagation

**Current:** Treat forecast as ground truth.

**Reality:** Forecast has error distribution:
```
Forecast: 35°C on Day 5
Reality: Normal(35, σ=4°C) → could be 27°C (no heatwave) or 43°C (extreme)
```

**Solution:** Monte Carlo sampling:
```python
# 1. Sample forecast errors from historical distribution
forecast_errors = np.random.normal(0, sigma_by_horizon[day], size=1000)

# 2. Generate ensemble predictions
ensemble_weather = forecast_temp + forecast_errors

# 3. Predict revenue for each ensemble member
ensemble_revenue = [model.predict(w) for w in ensemble_weather]

# 4. Aggregate
revenue_mean = np.mean(ensemble_revenue)
revenue_p10 = np.quantile(ensemble_revenue, 0.10)
revenue_p90 = np.quantile(ensemble_revenue, 0.90)
```

**Impact:** Wider confidence bands for distant days (honest uncertainty)

### 6.2 Missing: Adaptive Planning Horizon

**Current:** Always 7 days.

**Better:** Adjust by forecast quality:
- High confidence weather (Day 1-3): Tactical recommendations (spend adjustments)
- Low confidence weather (Day 4-7): Strategic hedges (prepare for scenarios)

**UI:**
```
Day 1-3: "Heatwave confirmed → Increase cold beverage ads 25%"
Day 4-7: "Possible heatwave (60% chance) → Prepare surge budget, monitor forecast"
```

### 6.3 Recommendation: Forecast Quality Metadata

**Implementation (1 week):**
```python
# shared/schemas/forecast.py
@dataclass
class WeatherForecast:
    date: date
    temp_forecast: float
    precip_forecast: float
    temp_uncertainty: float      # NEW: Std dev of forecast error
    precip_uncertainty: float
    confidence_score: float      # NEW: 0-1 quality score by horizon

# apps/model/ensemble.py
def predict_with_forecast_uncertainty(model, forecast):
    if forecast.confidence_score > 0.8:
        # High confidence: use point forecast
        return model.predict(forecast.to_features())
    else:
        # Low confidence: ensemble sample
        samples = [
            model.predict(perturbed_forecast)
            for perturbed_forecast in forecast.sample_ensemble(n=100)
        ]
        return {
            'p10': np.quantile(samples, 0.10),
            'p50': np.median(samples),
            'p90': np.quantile(samples, 0.90)
        }
```

---

## 7. Summary: Technical Debt & Risks

### 7.1 What Could Go Wrong (Risk Register)

| Risk | Likelihood | Impact | Mitigation Status |
|------|-----------|--------|-------------------|
| **Spurious correlation** - Weather correlates with revenue but doesn't cause it | HIGH | CRITICAL | ❌ Not addressed |
| **Geographic mismatch** - Phoenix model applied to Seattle | MEDIUM | HIGH | ❌ Not addressed |
| **Forecast degradation** - Day 7 predictions useless | HIGH | MEDIUM | ⚠️ Partially (7-day window) |
| **Overfitting to sparse data** - New products have <30 days history | MEDIUM | MEDIUM | ⚠️ Partially (context warnings) |
| **Quantile miscalibration** - p90 contains 60% of outcomes, not 90% | MEDIUM | HIGH | ❌ Not validated |
| **Adstock misattribution** - Credit today's sales to today's ads (miss carryover) | HIGH | HIGH | ❌ Not modeled |
| **Seasonality confound** - Blame weather for holiday effects | HIGH | CRITICAL | ⚠️ Partially (day-of-year controls) |

### 7.2 What Works Well (Strengths)

| Strength | Status | Impact |
|----------|--------|--------|
| **Time-series validation rigor** - Blocked CV, holdout, no leakage | ✅ Complete | Prevents overfit |
| **Context-aware degradation** - Warns when data quality poor | ✅ Complete | Builds trust |
| **LightGBM foundation** - Better than OLS for interactions | ✅ Complete | Captures nonlinearity |
| **Climatology baseline** - Day-of-year normals for anomalies | ✅ Complete | Seasonal adjustment |
| **Uncertainty propagation** - Quantiles flow through stack | ✅ Architecture ready | Needs calibration |

---

## 8. Prioritized Modeling Roadmap

### Phase 0 (Critical - Do First) - 4 weeks

**Goal:** Establish causal credibility baseline.

1. **Causal Limitations Documentation** (1 day)
   - Create `docs/CAUSAL_LIMITATIONS.md` explaining correlation vs causation
   - Add UI disclaimer: "Predicted associations based on historical patterns"

2. **Confounding Controls** (1 week)
   - Add season indicators, day-of-week, holiday flags to all models
   - Validate that weather effects persist after controlling for seasonality
   - Document in model cards: "Weather effect: +12% controlling for season"

3. **Quantile Calibration** (1 week)
   - Implement `apps/model/feedback/calibration.py` per roadmap Phase 0.5
   - Validate p10-p90 coverage on historical data (target: 80% ± 10%)
   - Surface calibration score in UI: "Model confidence: 83% coverage (good)"

4. **Forecast Uncertainty** (2 weeks)
   - Add forecast quality metadata to weather schema
   - Implement horizon-dependent uncertainty (σ increases with days ahead)
   - Widen confidence bands for Day 4-7 predictions

**Exit criteria:** Model limitations documented, quantiles validated, forecast uncertainty honest.

---

### Phase 1 (High Priority - Do Second) - 6 weeks

**Goal:** Upgrade to production-grade MMM.

1. **Integrate LightweightMMM** (3 weeks)
   - Replace `apps/model/mmm.py` with LightweightMMM
   - Configure adstock (geometric decay, α ~ 0.3-0.7)
   - Configure saturation (Hill curve, K and half_sat via priors)
   - Validate on historical data: "Would this have predicted 2024 performance?"

2. **Expand Weather Features** (2 weeks)
   - Add humidity, wind, UV from Open-Meteo
   - Compute lag-1, lag-3, lag-7 features
   - Add binary event flags (heatwave, freeze, heavy_rain)

3. **Geo Clustering** (1 week)
   - K-means cluster geos by climate (5-10 clusters)
   - Train cluster-specific models
   - Route predictions to appropriate cluster

**Exit criteria:** Adstock + saturation modeled, richer weather features, geo-stratified models.

---

### Phase 2 (Medium Priority - Do Third) - 8 weeks

**Goal:** Establish causal identification.

1. **Difference-in-Differences** (4 weeks)
   - Implement DiD estimator using geographic weather shocks
   - Validate parallel trends assumption (pre-treatment trends similar)
   - Surface causal estimates: "DiD lift: +15% [CI: 11%-19%]"

2. **Quantile Regression** (2 weeks)
   - Replace residual-based quantiles with direct quantile models
   - Train 3 LightGBM models (p10, p50, p90 objectives)
   - Enforce monotonicity post-processing

3. **Spatial Modeling** (2 weeks)
   - Hierarchical model with geo partial pooling
   - Estimate geo-specific weather elasticities
   - Interpolate for new/small geos

**Exit criteria:** Causal DiD estimates available, quantile models trained, spatial heterogeneity modeled.

---

### Phase 3 (Advanced - Future) - 12+ weeks

**Goal:** State-of-the-art causal ML.

1. **DoWhy + EconML Integration**
   - Define causal graphs per vertical (e-commerce, retail, etc.)
   - Train CausalForest for heterogeneous treatment effects
   - Build "causal confidence" score (0-1 scale)

2. **Randomized Controlled Trials (RCTs)**
   - Design A/B test: Weather-aware vs baseline recommendations
   - Run for 8-12 weeks across geo holdout groups
   - Measure incrementality (lift over control)

3. **Real-Time Adaptation**
   - Retrain models nightly as new data arrives
   - Bayesian updating (posterior from yesterday = prior for today)
   - Online learning for rapid shifts (flash sales, viral events)

---

## 9. Success Metrics (How to Measure Progress)

### Model Quality Metrics

| Metric | Current | Target (Phase 0) | Target (Phase 1) | Target (Phase 2) |
|--------|---------|------------------|------------------|------------------|
| **Holdout R²** | ~0.3-0.6 | >0.5 | >0.6 | >0.7 |
| **MAE (revenue)** | Varies by tenant | <10% of mean | <8% | <5% |
| **Quantile coverage (p10-p90)** | Unknown | 75-85% | 78-82% | 79-81% |
| **Calibration score** | Not measured | >0.7 | >0.8 | >0.9 |
| **Causal identification** | None | Controls only | DiD estimates | Validated RCT |

### Business Metrics (Requires Production Deployment)

| Metric | How to Measure |
|--------|----------------|
| **Incremental ROAS lift** | A/B test: Weather-aware vs baseline |
| **Recommendation adoption rate** | % of plans accepted by operators |
| **Forecast accuracy** | MAE of predicted vs actual ROAS at 7/14/30 days |
| **User trust score** | Survey: "How much do you trust weather recommendations?" (1-10) |
| **Model retraining frequency** | Days between retrains (target: <30) |

---

## 10. Conclusion

**Can the models perform the task?**

**Current state:**
- ✅ **Architecture:** Excellent (context warnings, time-series rigor, uncertainty flow)
- ⚠️ **Predictive power:** Moderate (LightGBM better than OLS, but limited features)
- ❌ **Causal validity:** Weak (correlation only, no causal identification)
- ❌ **MMM quality:** Insufficient (missing adstock, saturation, hierarchy)
- ⚠️ **Quantile accuracy:** Unknown (never validated)

**What you can claim today:**
- "Weather **correlates** with revenue in our historical data"
- "Our models predict revenue with X% accuracy (on holdout set)"
- "Here are weather-aware **scenarios** to consider"

**What you CANNOT claim today:**
- "Weather **drives** demand" (causal claim)
- "Adjust your budget **because of** weather" (causal recommendation)
- "We're 90% confident revenue will exceed $X" (quantile not validated)

**To deliver on the value proposition, you must:**
1. ❗ Upgrade MMM to include adstock + saturation (LightweightMMM)
2. ❗ Establish causal identification (DiD or DoWhy at minimum)
3. ❗ Validate quantile calibration (implement Phase 0.5 from roadmap)
4. 🔄 Expand weather features (humidity, UV, lags, events)
5. 🔄 Model geographic heterogeneity (cluster or hierarchical models)

**Timeline to production-ready:**
- **Minimum viable causal claims:** 4 weeks (Phase 0)
- **Production-grade MMM:** 10 weeks (Phase 0 + Phase 1)
- **Gold standard (RCT-validated):** 6+ months (Phase 0-3)

**Bottom line:** You've built a sophisticated **prediction platform** with excellent engineering. Now you need to upgrade the **statistical models** to match the quality of the architecture. The roadmap above provides a clear path.
