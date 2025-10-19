# Modeling Architecture Rethink — Let The Model Learn

**Problem:** We've been listing manual feature engineering tasks (lagged weather, geographic hierarchy, etc.) when we should be building a model that DISCOVERS these patterns automatically.

**User insight:** "Can't the model include all of this stuff?" — Yes. It should.

---

## Part 1: The Fundamental Question

### What should we hardcode vs let the model learn?

**Bad approach (what I was suggesting):**
```python
# Manually engineer every feature
features = [
    weather_today,
    weather_3_days_ago,
    weather_7_days_ago,
    weather_14_days_ago,  # Hardcoded lag
    is_holiday,
    days_until_holiday,
    seasonal_index,
    inventory_level,
    # ...100 more manually engineered features
]

model = LinearRegression()
model.fit(features, sales)
```

**Problems:**
- ❌ Assumes we know the right lags (3, 7, 14 days)
- ❌ Assumes linear effects
- ❌ Assumes no interactions between features
- ❌ Can't discover new patterns
- ❌ Brittle to changes

**Better approach (what you're suggesting):**
```python
# Provide raw data, let model discover patterns
raw_data = {
    "weather": weather_timeseries,           # Full history
    "sales": sales_timeseries,               # Full history
    "inventory": inventory_timeseries,       # Full history
    "calendar": calendar_features,           # Holidays, seasons, etc
    "products": product_metadata,            # Category, price, etc
    "geography": location_hierarchy,         # Zip → Metro → State
}

# Model discovers:
# - Which lags matter (0, 3, 7, 14, 28 days?)
# - Which weather variables matter (temp, precip, humidity?)
# - Interaction effects (cold + high inventory = different than cold + low inventory)
# - Non-linear effects (extreme cold has different effect than mild cold)
# - Seasonal patterns (December cold ≠ February cold)
# - Geographic patterns (NYC cold ≠ Miami cold)

model = AutoML()  # Or neural net, gradient boosting, etc
model.fit(raw_data, sales)
```

**Advantages:**
- ✅ Model discovers optimal lags
- ✅ Model discovers interactions
- ✅ Model discovers non-linearities
- ✅ Model adapts to new patterns
- ✅ Robust to changes

---

## Part 2: Temporal Dynamics — Way More Complex Than Simple Lags

### User insight: "There could be many layers of temporal dynamics"

**What we need to capture:**

### 2.1: Multi-scale temporal patterns

**Intra-day:**
- Morning (7-10am): Coffee, breakfast products
- Lunch (12-2pm): Food delivery spikes
- Evening (6-9pm): Dinner, entertainment
- Late night (10pm-2am): Impulse purchases

**Day-of-week:**
- Monday: Back-to-work shopping (professional clothes)
- Friday: Weekend prep (outdoor gear)
- Saturday: Leisure shopping
- Sunday: Next week prep

**Week-of-month:**
- Week 1 (after payday): High-value purchases
- Week 2-3: Normal
- Week 4 (before payday): Budget-conscious

**Month-of-year (seasonal):**
- January: New Year resolutions (fitness, organization)
- February: Valentine's Day
- March-April: Spring fashion
- May-August: Summer (outdoor, travel)
- September: Back-to-school
- October: Halloween
- November-December: Holidays, winter

**Year-over-year:**
- Trends (growing category vs declining)
- Product lifecycle (launch → growth → maturity → decline)

### 2.2: Complex lag structures

**Not just:** Weather at t-3 → Sales at t

**Reality:** Distributed lags with different weights
```
sales_t =
  0.1 * weather_{t-0} +   # Same-day emergency
  0.3 * weather_{t-1} +   # Next-day planning
  0.4 * weather_{t-3} +   # Primary effect
  0.2 * weather_{t-7} +   # Secondary effect
  0.0 * weather_{t-14}    # No effect beyond 7 days
```

**But also:** Different lags for different products
```
winter_coats:  Peak lag = 3 days (plan ahead)
umbrellas:     Peak lag = 0 days (emergency)
snow_boots:    Peak lag = 7 days (seasonal prep)
```

**And:** Lag structure changes by urgency
```
Extreme cold (-10°F):  Short lag (need coat NOW)
Mild cold (40°F):      Long lag (can wait)
```

### 2.3: Autoregressive effects (momentum)

**Sales have momentum:**
```
sales_t =
  0.6 * sales_{t-1} +       # Yesterday's sales (high correlation)
  0.3 * sales_{t-7} +       # Same day last week (weekly pattern)
  0.1 * weather_effect      # Weather is ADDITION to baseline
```

**Key insight:** Weather doesn't CAUSE sales, it MODULATES baseline sales

### 2.4: Holiday effects (multi-dimensional)

**User insight:** "Impacts of holidays and times near holidays may be different in a multidimensional perspective"

**Holiday effect types:**

**Type 1: Day-of holiday**
- Christmas Day: Physical stores closed, online spikes (last-minute digital gifts)
- Thanksgiving: Shopping pauses (family time)

**Type 2: Lead-up period**
- 2 weeks before Christmas: Peak shopping
- Week before Valentine's: Panic buying
- Day before Mother's Day: Procrastinators

**Type 3: Post-holiday**
- Dec 26-31: Returns + gift card spending
- Jan 2-15: New Year resolution products (fitness)

**Type 4: Holiday-weather interactions**
- Christmas + snow = "White Christmas" (different shopping than Christmas + rain)
- Thanksgiving + cold = Travel disruptions (cancel orders?)

**Type 5: Regional holiday variations**
- Mardi Gras (Louisiana): Not national
- Patriots' Day (Massachusetts): Local holiday
- Regional festivals, local events

**Type 6: Moving holidays**
- Easter: Moves 30+ days year-to-year
- Ramadan: Moves 11 days earlier each year
- Diwali: Different date each year

**Current approach:** Single `is_holiday` binary flag

**Better approach:** Holiday feature matrix
```python
holiday_features = {
    "days_until_next_major_holiday": continuous,
    "days_since_last_major_holiday": continuous,
    "holiday_type": ["gift_giving", "travel", "religious", "food_focused"],
    "holiday_season": ["christmas_season", "back_to_school", "summer", "none"],
    "moving_holiday_phase": ["pre_ramadan", "ramadan", "post_ramadan"],
    # Let model discover which matter
}
```

---

## Part 3: Seasonal Dynamics (Beyond Simple Monthly Dummies)

### User insight: "All kinds of seasonal dynamics possible"

**Naive approach:** Month-of-year dummies (Jan=1, Feb=2, ..., Dec=12)

**Problem:** December and January are adjacent (winter) but numerically far apart (12 vs 1)

**Better: Cyclical encoding**
```python
month_sin = sin(2π * month / 12)
month_cos = cos(2π * month / 12)
# Now December and January are close in feature space
```

**But seasonality is multi-dimensional:**

### 3.1: Meteorological seasons vs calendar seasons

**Calendar:** Spring=Mar/Apr/May, Summer=Jun/Jul/Aug, etc

**Meteorological:** Varies by location
- Miami: Hot year-round, "winter" is 70°F
- Minneapolis: Extreme swings (-20°F to 90°F)
- San Francisco: Mild year-round (50-70°F)

**Model should learn:** "Winter" means different things in different places

### 3.2: Fashion seasons vs weather seasons

**Fashion calendar:**
- Spring/Summer collection: Jan-Jul
- Fall/Winter collection: Aug-Dec

**Weather reality:**
- February is coldest (winter collection still selling)
- August is hot (fall collection arrives but no demand yet)

**Mismatch:** Fashion industry and weather are misaligned

### 3.3: Product-specific seasonality

**Strong seasonal:**
- Winter coats: 95% of sales Oct-Feb
- Swimsuits: 90% of sales Apr-Aug

**Moderate seasonal:**
- Jeans: 60% fall/winter, 40% spring/summer
- T-shirts: Sold year-round but peaks in summer

**No seasonality:**
- Phone cases: Consistent year-round
- Socks: Consistent year-round

**Model should learn:** Different products have different seasonal patterns

### 3.4: Seasonal trends (changing patterns)

**Scenario:** Climate change → winters getting warmer

**Effect:** Winter coat sales declining over 10 years (trend + season interaction)

**Model should handle:**
- Detrending (remove long-term trend)
- Season × Year interaction (2015 winter ≠ 2025 winter)

---

## Part 4: What The Model Should Actually Learn

### 4.1: Feature importance (prioritize what matters)

**User insight:** "Should obviously be able to figure out the most important and primary features before getting crazy nuanced"

**Approach: Automatic feature selection**

**Method 1: L1 regularization (Lasso)**
```python
# Penalize model for using too many features
# Forces model to drop unimportant features

model = Lasso(alpha=0.1)  # Higher alpha = more regularization
```

**Method 2: Gradient boosting feature importance**
```python
model = XGBoost()
model.fit(X, y)
importance = model.feature_importances_

# Example output:
# temperature: 0.35          ← Most important
# inventory_level: 0.20
# days_until_holiday: 0.15
# precipitation: 0.10
# humidity: 0.05
# wind_speed: 0.01           ← Least important (drop it)
```

**Method 3: Permutation importance**
- Shuffle each feature, measure RMSE increase
- Features that cause large RMSE increase are important

**Method 4: SHAP values (Shapley Additive Explanations)**
- Game-theory approach to feature importance
- Shows contribution of each feature to each prediction

### 4.2: Interaction effects (combinations matter)

**Linear model assumption:** Each feature contributes independently

**Reality:** Features interact

**Example interactions:**

**Cold + High Inventory:**
```
sales = baseline +
        0.3 * is_cold +
        0.1 * high_inventory +
        0.5 * (is_cold × high_inventory)  ← Interaction term

Interpretation: Cold weather + high inventory → aggressive promotion
```

**Holiday + Weekend:**
```
Holiday + weekday: Normal boost
Holiday + weekend: HUGE boost (people have time to shop)
```

**New Product + Weather:**
```
New product + mild weather: Normal sales
New product + extreme weather: Lower sales (people stick to known brands)
```

**Model approaches that capture interactions:**
- Decision trees (naturally capture interactions)
- Gradient boosting (builds trees with interactions)
- Neural networks (learns arbitrary interactions)
- Explicit interaction terms (feature engineering)

### 4.3: Non-linear effects

**Linear assumption:** 10°F colder → 10% more sales, 20°F colder → 20% more sales

**Reality:** Non-linear

**Example: Temperature and winter coat sales**
```
60°F → 50°F:  +10% sales (small effect)
50°F → 40°F:  +20% sales (moderate effect)
40°F → 30°F:  +40% sales (large effect)
30°F → 20°F:  +60% sales (huge effect)
20°F → 10°F:  +30% sales (saturation, everyone already has coat)
```

**Sigmoid curve:** Extreme cold has diminishing returns (saturation)

**Model approaches:**
- Polynomial features (temp, temp², temp³)
- Splines (piecewise linear)
- Decision trees (natural thresholds)
- Neural networks (universal approximators)

---

## Part 5: Model Architectures That Can Handle This

### 5.1: Gradient Boosting (XGBoost, LightGBM, CatBoost)

**Why it works:**
- Automatically discovers interactions
- Handles non-linearities
- Feature importance built-in
- Robust to irrelevant features
- Fast training

**Example:**
```python
from xgboost import XGBRegressor

model = XGBRegressor(
    max_depth=6,              # Allow 6-level interactions
    n_estimators=1000,        # 1000 trees
    learning_rate=0.01,       # Slow learning (less overfitting)
    subsample=0.8,            # Sample 80% of data per tree
    colsample_bytree=0.8,     # Sample 80% of features per tree
)

model.fit(X_train, y_train)

# Model discovers:
# - Which lags matter
# - Interaction between weather + inventory
# - Non-linear temperature effects
# - Holiday effects
```

**Advantages:**
- ✅ Discovers patterns automatically
- ✅ Feature importance
- ✅ Handles missing data
- ✅ Fast inference

**Disadvantages:**
- ⚠️ Needs careful tuning
- ⚠️ Can overfit with too many features

### 5.2: Neural Networks (Deep Learning)

**Why it works:**
- Universal function approximators
- Can learn arbitrary complex patterns
- Good for high-dimensional data
- Can handle sequential data (LSTMs, Transformers)

**Architecture for time series:**
```python
import torch.nn as nn

class WeatherSalesModel(nn.Module):
    def __init__(self):
        super().__init__()

        # Embedding layers for categorical features
        self.product_embedding = nn.Embedding(n_products, 32)
        self.region_embedding = nn.Embedding(n_regions, 16)

        # LSTM for temporal dependencies
        self.lstm = nn.LSTM(
            input_size=32,      # Weather + inventory + calendar features
            hidden_size=64,
            num_layers=2,
            dropout=0.2
        )

        # Attention mechanism (which time steps matter?)
        self.attention = nn.MultiheadAttention(64, num_heads=4)

        # Dense layers
        self.fc = nn.Sequential(
            nn.Linear(64, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, 1)   # Output: predicted sales
        )

    def forward(self, weather_ts, inventory_ts, product_id, region_id):
        # Model automatically learns:
        # - Which lags matter (via LSTM + attention)
        # - Product-specific patterns (via embeddings)
        # - Region-specific patterns (via embeddings)
        # - Complex interactions (via dense layers)
        pass
```

**Advantages:**
- ✅ Learns complex patterns
- ✅ Handles sequences naturally
- ✅ Attention mechanism shows what matters

**Disadvantages:**
- ⚠️ Needs lots of data (10k+ samples)
- ⚠️ Slow training
- ⚠️ Black box (less interpretable)

### 5.3: Bayesian Structural Time Series (BSTS)

**Why it works:**
- Explicitly models temporal structure
- Separates trend, seasonality, holidays, regressors
- Uncertainty quantification built-in
- Can handle sparse data

**Model structure:**
```python
from statsmodels.tsa.statespace.structural import UnobservedComponents

model = UnobservedComponents(
    sales,
    level='local linear trend',      # Trend component
    seasonal=52,                      # Weekly seasonality
    cycle=True,                       # Business cycle
    exog=weather_features             # External regressors (weather)
)

# Model decomposes sales into:
# sales_t = trend_t + seasonal_t + weather_effect_t + noise_t

# Automatically learns:
# - Trend (growing/declining)
# - Seasonal pattern (peaks/valleys)
# - Weather effect (controlled for trend + season)
```

**Advantages:**
- ✅ Interpretable components
- ✅ Uncertainty quantification
- ✅ Works with sparse data

**Disadvantages:**
- ⚠️ Assumes specific structure
- ⚠️ Harder to add complex interactions

### 5.4: Hierarchical Bayesian Models (PyMC, Stan)

**Why it works:**
- Models data at multiple levels (product, category, region)
- Partial pooling (borrow strength across groups)
- Handles sparse data gracefully

**Example:**
```python
import pymc as pm

with pm.Model() as hierarchical_model:
    # Hyper-priors (population level)
    mu_weather_effect = pm.Normal('mu_weather_effect', 0, 1)
    sigma_weather_effect = pm.HalfNormal('sigma_weather_effect', 1)

    # Category-level effects (partial pooling)
    weather_effect_category = pm.Normal(
        'weather_effect_category',
        mu=mu_weather_effect,
        sigma=sigma_weather_effect,
        shape=n_categories
    )

    # Product-level effects (partial pooling from category)
    weather_effect_product = pm.Normal(
        'weather_effect_product',
        mu=weather_effect_category[product_category],
        sigma=0.5,
        shape=n_products
    )

    # Model
    mu = (
        baseline +
        weather_effect_product[product_id] * temperature +
        inventory_effect * inventory_level +
        # ... more terms
    )

    sales = pm.Normal('sales', mu=mu, sigma=sigma_sales, observed=sales_data)
```

**Advantages:**
- ✅ Handles sparse data (new products borrow from category)
- ✅ Uncertainty quantification
- ✅ Interpretable hierarchical structure

**Disadvantages:**
- ⚠️ Slow inference (MCMC)
- ⚠️ Requires domain knowledge to specify structure

---

## Part 6: Feature Representation (What To Feed The Model)

### 6.1: Raw time series (let model discover lags)

**Instead of:**
```python
features = [weather_lag_0, weather_lag_1, ..., weather_lag_30]
```

**Better:**
```python
# Feed full time series, let model (LSTM/Transformer) discover relevant lags
weather_timeseries = [...30 days of weather...]
model = LSTM(weather_timeseries)
```

### 6.2: Calendar features (rich representation)

```python
calendar_features = {
    # Cyclical time
    "day_of_week_sin": sin(2π * day_of_week / 7),
    "day_of_week_cos": cos(2π * day_of_week / 7),
    "month_sin": sin(2π * month / 12),
    "month_cos": cos(2π * month / 12),

    # Holidays (embedding)
    "holiday_id": embedding,  # Let model learn holiday effects
    "days_to_holiday": continuous,
    "days_since_holiday": continuous,

    # Special periods
    "is_holiday_season": bool,  # Nov 15 - Jan 5
    "is_back_to_school": bool,  # Aug 1 - Sep 15
    "is_summer": bool,          # Jun 1 - Aug 31

    # Paycheck cycles
    "days_since_month_start": continuous,

    # Year
    "year": continuous,  # For trends
}
```

### 6.3: Weather features (comprehensive)

```python
weather_features = {
    # Temperature
    "temp_mean": continuous,
    "temp_min": continuous,
    "temp_max": continuous,
    "temp_feels_like": continuous,
    "temp_anomaly": continuous,  # Deviation from seasonal normal

    # Precipitation
    "precip_mm": continuous,
    "precip_probability": continuous,
    "snow_mm": continuous,

    # Derived
    "heating_degree_days": max(0, 65 - temp),  # Energy for heating
    "cooling_degree_days": max(0, temp - 65),  # Energy for cooling

    # Severe weather
    "is_severe_weather": bool,
    "weather_alert_level": ordinal,

    # Sky
    "cloud_cover": continuous,
    "uv_index": continuous,

    # Air quality (for relevant products)
    "air_quality_index": continuous,
    "pollen_count": continuous,
}
```

### 6.4: Inventory features

```python
inventory_features = {
    "inventory_quantity": continuous,
    "days_of_supply": continuous,  # inventory / avg_daily_sales
    "stockout_risk": continuous,   # P(stockout in next 7 days)
    "is_overstocked": bool,        # > 60 days supply
    "is_pre_order": bool,
    "lead_time_days": continuous,  # Restock lead time
}
```

### 6.5: Product features (embeddings)

```python
# Don't hardcode category hierarchy
# Let model learn it via embeddings

product_embedding = nn.Embedding(n_products, embedding_dim=32)

# Model learns:
# - Similar products have similar embeddings
# - "Winter coat A" and "Winter coat B" are close
# - "Winter coat" and "Sunglasses" are far
```

---

## Part 7: Recommended Architecture (Pragmatic)

### Phase 1: Gradient Boosting Baseline (Week 1-2)

**Why:** Fast to implement, interpretable, robust

```python
from lightgbm import LGBMRegressor

# Features (engineered but flexible)
X = prepare_features(
    weather_history=30_days,     # Full history, model picks lags
    calendar=calendar_features,   # Rich calendar features
    inventory=inventory_features,
    product_id=product_id,
    region_id=region_id,
)

model = LGBMRegressor(
    objective='regression',
    metric='rmse',
    n_estimators=1000,
    learning_rate=0.01,
    max_depth=6,
    num_leaves=31,
    feature_fraction=0.8,
    bagging_fraction=0.8,
)

model.fit(X_train, y_train)

# Get feature importance
importance = model.feature_importances_
# Example: temperature_lag_3 = 0.25 (most important lag is 3 days)
```

**Deliverable:**
- Baseline model with feature importance
- Identify which features matter (discard rest)

### Phase 2: Hierarchical Model (Week 3-4)

**Why:** Handle sparse data (new products, new regions)

```python
import pymc as pm

with pm.Model() as model:
    # Hierarchy: Product → Category → Brand
    # New products borrow from category average

    # Population-level (all products)
    mu_global = pm.Normal('mu_global', 0, 10)

    # Category-level (partial pooling)
    mu_category = pm.Normal('mu_category', mu_global, 5, shape=n_categories)

    # Product-level (partial pooling from category)
    beta_temp = pm.Normal(
        'beta_temp',
        mu=mu_category[category_id],
        sigma=2,
        shape=n_products
    )

    beta_inventory = pm.Normal('beta_inventory', 0, 1, shape=n_products)

    # Likelihood
    mu = (
        baseline[product_id] +
        beta_temp[product_id] * temperature +
        beta_inventory[product_id] * inventory_level +
        seasonal_effect[month] +
        holiday_effect[holiday_id]
    )

    sales = pm.Normal('sales', mu=mu, sigma=sigma, observed=y_train)
```

**Deliverable:**
- Cold-start capability (new products get reasonable predictions)
- Uncertainty quantification

### Phase 3: Deep Learning (Week 5-6, if needed)

**Why:** Capture complex patterns baseline can't

```python
import torch.nn as nn

class WeatherSalesNet(nn.Module):
    def __init__(self):
        super().__init__()

        # Embeddings
        self.product_emb = nn.Embedding(n_products, 32)
        self.region_emb = nn.Embedding(n_regions, 16)

        # LSTM for weather time series
        self.weather_lstm = nn.LSTM(8, 32, num_layers=2)

        # Attention (which days matter?)
        self.attention = nn.MultiheadAttention(32, num_heads=4)

        # Dense
        self.fc = nn.Sequential(
            nn.Linear(32+32+16+10, 64),  # weather + product + region + calendar
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 1)
        )

    def forward(self, weather_ts, product_id, region_id, calendar):
        # Embeddings
        prod_emb = self.product_emb(product_id)
        reg_emb = self.region_emb(region_id)

        # Weather LSTM
        weather_enc, _ = self.weather_lstm(weather_ts)

        # Attention (which time steps matter?)
        weather_attn, attn_weights = self.attention(weather_enc, weather_enc, weather_enc)
        weather_final = weather_attn[-1]  # Last time step

        # Concatenate
        combined = torch.cat([weather_final, prod_emb, reg_emb, calendar], dim=-1)

        # Predict
        return self.fc(combined)
```

**Deliverable:**
- State-of-art accuracy (if gradient boosting not enough)
- Attention weights show which time lags matter

---

## Part 8: Constraints (Bake Into Optimizer)

**User insight:** "Bake in those constraints and others that may exist"

### Constraint types:

**Hard constraints (must satisfy):**
```python
from scipy.optimize import minimize

def objective(budgets):
    return -predicted_roas(budgets)  # Maximize ROAS

constraints = [
    # Total budget
    {'type': 'eq', 'fun': lambda x: sum(x) - total_budget},

    # Non-negative
    {'type': 'ineq', 'fun': lambda x: x},  # x >= 0

    # Per-campaign caps
    {'type': 'ineq', 'fun': lambda x: campaign_max - x[campaign_idx]},

    # Platform allocation (Meta <= 70% of total)
    {'type': 'ineq', 'fun': lambda x: 0.7*total_budget - sum(x[meta_idx])},

    # Change velocity (max 20% change per week)
    {'type': 'ineq', 'fun': lambda x: 0.2*prev_budget - abs(x - prev_budget)},

    # Inventory constraint (don't advertise out-of-stock)
    {'type': 'ineq', 'fun': lambda x: inventory_level * x},  # If inventory=0, x must be 0
]

result = minimize(objective, x0=current_budgets, constraints=constraints)
optimal_budgets = result.x
```

**Soft constraints (preferences):**
- Prefer gradual changes (penalty for large swings)
- Prefer diversification (penalty for putting all budget in one campaign)

**Inventory-aware:**
```python
# Out of stock → Force budget to 0
if inventory[product] == 0:
    budget[product] = 0

# Low stock → Reduce budget proportionally
elif days_of_supply < 7:
    budget[product] *= days_of_supply / 7

# Overstock → Increase budget (clearance)
elif days_of_supply > 60:
    budget[product] *= 1.5
```

---

## Part 9: Implementation Plan

### Milestone 1: Data Pipeline (2 weeks)
- Ingest weather history (30 days lookback)
- Ingest sales history (365 days for seasonality)
- Ingest inventory (real-time)
- Ingest calendar (holidays, events)
- Feature engineering pipeline (rich representation)

### Milestone 2: Baseline Model (2 weeks)
- LightGBM with feature importance
- Identify most important features
- Discard irrelevant features
- Baseline RMSE/MAPE

### Milestone 3: Hierarchical Model (2 weeks)
- Bayesian hierarchical model
- Handle cold-start (new products)
- Uncertainty quantification

### Milestone 4: Optimization (1 week)
- Constraint-aware optimizer
- Inventory constraints
- Budget hierarchy constraints
- Change velocity limits

### Milestone 5: Deep Learning (2 weeks, if needed)
- LSTM/Transformer for time series
- Attention mechanism
- Embeddings for products/regions

---

## Summary: Let The Model Discover

**Key principle:** Provide rich feature representation, let model discover what matters

**What to hardcode:**
- ✅ Data pipeline (ingestion)
- ✅ Feature engineering framework (cyclical time, embeddings)
- ✅ Model architecture choice (gradient boosting, neural net)
- ✅ Constraints (inventory, budgets)

**What to let model learn:**
- ✅ Which time lags matter (0, 1, 3, 7, 14, 28 days?)
- ✅ Which weather variables matter (temp, precip, wind, humidity?)
- ✅ Interaction effects (cold + high inventory = ?)
- ✅ Non-linear effects (extreme cold different than mild cold)
- ✅ Seasonal patterns (product-specific)
- ✅ Holiday effects (which holidays matter, lead/lag times)
- ✅ Geographic patterns (NYC cold ≠ Miami cold)
- ✅ Product similarities (winter coat A similar to winter coat B)

**Profitability:** Later concern (start with ROAS, add return rate / COGS in phase 2)

**Next steps:**
1. Build rich feature representation
2. Train gradient boosting baseline
3. Analyze feature importance
4. Iterate based on what model discovers
