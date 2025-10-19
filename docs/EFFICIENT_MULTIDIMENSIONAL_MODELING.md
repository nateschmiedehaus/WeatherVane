# Efficient Multi-Dimensional Modeling Strategy

**Goal:** Bake in all the complexity (temporal, seasonal, geographic, inventory, constraints) without being wasteful. Test lightly, cheaply, but effectively.

**Key principle:** Start simple, add complexity only when proven necessary. Test each addition rigorously but cheaply.

---

## Part 1: Multi-Dimensional Representation (Tensor Framework)

### The Multi-Dimensional Space

**Dimensions:**
```
Sales[t, p, g, w, i] = f(
    t = time (hour, day, week, month, season, year),
    p = product (id, category, brand, price, lifecycle),
    g = geography (zip, metro, state, region, climate),
    w = weather (temp, precip, conditions, forecast),
    i = inventory (level, velocity, stockout_risk),
    c = calendar (holiday, event, paycheck, school),
    a = ad_state (budget, creative, audience, platform)
)
```

**Interactions to capture:**
- t × w: Weather effect varies by time (Dec cold ≠ Feb cold)
- p × w: Product-weather affinity (coats + cold, umbrellas + rain)
- g × w: Geographic-weather patterns (NYC cold ≠ Miami cold)
- t × c: Time-calendar interactions (weekend + holiday ≠ weekday + holiday)
- p × i: Product-inventory effects (low stock → reduce ads)
- p × g: Product-geography (winter coats sell in north, not south)
- **Higher order:** t × p × w × g (winter coats in NYC during Dec cold)

### Efficient Representation: Factorization

**Naive approach:** Explicitly model every combination
```
Parameters = T × P × G × W × I × C
           = 365 × 10000 × 210 × 100 × 10 × 50
           = 38 trillion parameters (impossible)
```

**Efficient approach: Low-rank factorization**
```python
# Instead of full tensor, factorize into low-rank components

# Time effect
time_embedding = nn.Embedding(365, 32)         # 365 days → 32 dimensions

# Product effect
product_embedding = nn.Embedding(10000, 64)    # 10k products → 64 dimensions

# Geography effect
geo_embedding = nn.Embedding(210, 16)          # 210 metros → 16 dimensions

# Interaction via dot products
interaction_score = (
    time_embedding(t) @ product_embedding(p).T +
    product_embedding(p) @ geo_embedding(g).T +
    # ... more interactions
)

# Total parameters = 365×32 + 10000×64 + 210×16 = ~652k (manageable!)
```

**Advantage:** Capture multi-dimensional interactions with manageable parameters

---

## Part 2: Staged Complexity (Build Up Gradually)

### Stage 0: Naive Baseline (1 day)

**Model:** Simple average
```python
prediction = historical_average_sales
```

**Purpose:** Establish worst-case baseline (beat this easily)

**Test:** RMSE on holdout data
**Expected:** Terrible (but fast)

---

### Stage 1: Linear Model (2 days)

**Model:** Linear regression with basic features
```python
sales = (
    α +
    β_temp * temperature +
    β_precip * precipitation +
    β_dow[day_of_week] +
    β_month[month]
)
```

**Features:**
- Temperature (single number, not time series)
- Precipitation (single number)
- Day of week (one-hot)
- Month (one-hot)

**Test:**
- 80/20 train/test split
- RMSE, MAPE on holdout
- Feature coefficients (which features matter?)

**Expected improvement:** 20-30% better than naive

**Decision gate:** If linear model doesn't beat naive by 15%, something is wrong with data

---

### Stage 2: Add Inventory Constraint (1 day)

**Model:** Same linear model + inventory rule
```python
prediction = linear_model(features)

# Post-processing constraint
if inventory == 0:
    prediction = 0
elif days_of_supply < 7:
    prediction *= days_of_supply / 7
```

**Test:**
- Synthetic scenarios:
  - Out of stock + cold weather → Should recommend $0 (not high budget)
  - Low stock (3 days) + cold → Should recommend 43% of normal
  - High stock (60 days) + cold → Should recommend normal (or higher)

**Expected:** Prevents obvious bad recommendations

**Decision gate:** If inventory constraint doesn't prevent OOS ads, fix it

---

### Stage 3: Add Non-Linear Effects (3 days)

**Model:** Gradient boosting (XGBoost/LightGBM)
```python
from lightgbm import LGBMRegressor

model = LGBMRegressor(
    n_estimators=100,      # Start small
    max_depth=3,           # Shallow trees (prevent overfitting)
    learning_rate=0.1,
)

model.fit(X_train, y_train)
```

**Features (same as linear, model finds non-linearities):**
- Temperature, precipitation
- Day of week, month
- Product ID (one-hot or embedding)
- Geography (one-hot or embedding)

**Test:**
- Holdout RMSE
- Feature importance (which features matter most?)
- Partial dependence plots (visualize non-linearities)

**Expected improvement:** 10-20% better than linear

**Decision gate:** If gradient boosting doesn't beat linear by 5%, stick with linear (simpler)

---

### Stage 4: Add Temporal Lags (2 days)

**Model:** Gradient boosting + lagged features
```python
features = {
    "temp_today": temp[t],
    "temp_yesterday": temp[t-1],
    "temp_3_days_ago": temp[t-3],
    "temp_7_days_ago": temp[t-7],
    "sales_yesterday": sales[t-1],
    "sales_last_week": sales[t-7],
}
```

**Test:**
- Feature importance: Which lags matter?
- Example: "temp_3_days_ago has 0.25 importance, temp_7_days_ago has 0.01"
- Conclusion: 3-day lag is primary, drop 7-day lag

**Expected improvement:** 5-10% better than Stage 3

**Decision gate:** If adding lags doesn't help, temporal dynamics are weak (unexpected)

---

### Stage 5: Add Product Hierarchy (3 days)

**Model:** Hierarchical model with partial pooling
```python
# Products borrow strength from category

sales[product] = (
    global_baseline +
    category_effect[category[product]] +         # Category-level
    product_effect[product] +                    # Product-level
    weather_effect_category[category] * temp +   # Category-specific weather
    weather_effect_product[product] * temp       # Product-specific weather
)
```

**Test with sparse data:**
- New product (only 10 sales): Does it borrow from category?
- Expected: New "winter coat" product gets reasonable prediction (borrows from "winter coat" category)

**Expected improvement:** 5-15% better for new/sparse products

**Decision gate:** If hierarchical model doesn't help sparse products, drop it (add complexity only if needed)

---

### Stage 6: Add Geographic Hierarchy (2 days)

**Model:** Geographic partial pooling
```python
sales[geography] = (
    national_baseline +
    state_effect[state] +
    metro_effect[metro] +
    zip_effect[zip]  # Only if enough data
)
```

**Test:**
- Sparse geography: Small town with 5 sales
- Expected: Borrows from state average (reasonable prediction)

**Expected improvement:** 3-10% better for sparse geographies

**Decision gate:** If geography doesn't matter (all locations similar), drop it

---

### Stage 7: Add Calendar Effects (2 days)

**Model:** Holiday embeddings + cyclical time
```python
features = {
    "day_of_week_sin": sin(2π * dow / 7),
    "day_of_week_cos": cos(2π * dow / 7),
    "month_sin": sin(2π * month / 12),
    "month_cos": cos(2π * month / 12),
    "holiday_embedding[holiday_id]": learned,
    "days_to_holiday": continuous,
}
```

**Test:**
- Predict Christmas sales vs normal December day
- Expected: Model predicts surge 2 weeks before Christmas, drop on Christmas day

**Expected improvement:** 5-15% better during holiday periods

**Decision gate:** If calendar effects don't improve holiday predictions, simplify

---

### Stage 8: Add Deep Learning (5 days, optional)

**Model:** LSTM + Attention
```python
class WeatherSalesNet(nn.Module):
    def __init__(self):
        self.product_emb = nn.Embedding(n_products, 64)
        self.lstm = nn.LSTM(input_size=10, hidden_size=32)
        self.attention = nn.MultiheadAttention(32, num_heads=4)
        self.fc = nn.Linear(32+64, 1)

    def forward(self, weather_ts, product_id):
        # LSTM encodes weather time series
        h, _ = self.lstm(weather_ts)
        # Attention finds which time steps matter
        attn_out, attn_weights = self.attention(h, h, h)
        # Combine with product embedding
        prod_emb = self.product_emb(product_id)
        combined = torch.cat([attn_out[-1], prod_emb])
        return self.fc(combined)
```

**Test:**
- Attention weights: Which time lags matter? (Should align with gradient boosting feature importance)
- Holdout RMSE: Better than gradient boosting?

**Expected improvement:** 0-10% better than gradient boosting (diminishing returns)

**Decision gate:** If deep learning doesn't beat gradient boosting by 3%, stick with gradient boosting (simpler, faster)

---

## Part 3: Cheap But Effective Testing Strategy

### 3.1: Synthetic Data with Known Ground Truth

**Why:** Control the true data generating process, validate model recovers it

**Example 1: Simple weather effect**
```python
# Generate synthetic data
np.random.seed(42)
n_samples = 1000

temperature = np.random.normal(50, 20, n_samples)
noise = np.random.normal(0, 10, n_samples)

# TRUE relationship (known ground truth)
true_sales = 100 + 2.0 * (50 - temperature) + noise
# Interpretation: Sales increase 2 units per degree colder than 50°F

# Train model
model.fit(temperature, true_sales)

# Test: Does model recover β = 2.0?
assert abs(model.coef_[0] - 2.0) < 0.1  # Should recover true coefficient
```

**Example 2: Inventory constraint**
```python
# Generate data with inventory constraints
inventory = np.random.randint(0, 100, n_samples)
temp = np.random.normal(40, 10, n_samples)

# TRUE relationship
base_sales = 100 + 2.0 * (50 - temp)
true_sales = np.minimum(base_sales, inventory)  # Can't sell more than inventory!

# Train model + constraint
model.fit(temp, true_sales)
constrained_prediction = apply_inventory_constraint(model.predict(temp), inventory)

# Test: Does constrained model respect inventory?
assert all(constrained_prediction <= inventory)
```

**Example 3: Temporal lag**
```python
# Generate data with 3-day lag
temp = np.random.normal(50, 20, 365)
sales = np.zeros(365)

for t in range(3, 365):
    sales[t] = 100 + 2.0 * (50 - temp[t-3]) + noise[t]  # 3-day lag

# Train model with various lags
X = np.column_stack([
    temp[3:],         # t-0
    temp[2:-1],       # t-1
    temp[1:-2],       # t-2
    temp[0:-3],       # t-3
])

model.fit(X, sales[3:])

# Test: Does model find t-3 lag is most important?
assert model.feature_importances_[3] > 0.8  # t-3 should dominate
```

**Cost:** Free (generate synthetic data in seconds)
**Value:** Validate model can recover known patterns

---

### 3.2: Small-Scale Real Data Experiments

**Instead of:** Train on all 10k products × 365 days (expensive)

**Do:** Start with 10 products × 90 days (cheap)

**Approach:**
```python
# Stage 1: Small experiment
products_sample = random.sample(all_products, 10)
days_sample = last_90_days

X_small, y_small = prepare_features(products_sample, days_sample)
model.fit(X_small, y_small)

# Evaluate on holdout
rmse_small = evaluate(model, X_test_small, y_test_small)

# Decision: Is model promising?
if rmse_small < baseline_rmse * 0.8:
    # Good! Scale up to full data
    X_full, y_full = prepare_features(all_products, all_days)
    model.fit(X_full, y_full)
else:
    # Bad! Fix model before scaling
    debug_feature_importance(model)
```

**Cost:** 100x faster than full training
**Value:** Catch issues early before expensive full training

---

### 3.3: Cross-Validation (Rigorous but Cheap)

**Time-series cross-validation:**
```python
from sklearn.model_selection import TimeSeriesSplit

tscv = TimeSeriesSplit(n_splits=5)

scores = []
for train_idx, test_idx in tscv.split(X):
    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    model.fit(X_train, y_train)
    score = model.score(X_test, y_test)
    scores.append(score)

avg_score = np.mean(scores)
std_score = np.std(scores)

# Test stability: If std is high, model is unstable
assert std_score < 0.1 * avg_score  # Less than 10% variation
```

**Cost:** 5x slower than single train (but still cheap with small data)
**Value:** Detects overfitting, ensures model generalizes

---

### 3.4: A/B Testing in Production (Ultimate Test)

**Before full rollout:** Shadow mode A/B test

**Approach:**
```python
# Randomly assign 10% of recommendations to new model
if random() < 0.10:
    recommendation = new_model.predict(features)
    log_recommendation(recommendation, model="new", customer_id=cust_id)
else:
    recommendation = old_model.predict(features)
    log_recommendation(recommendation, model="old", customer_id=cust_id)

# Wait 7 days, measure actual ROAS
new_model_roas = measure_roas(model="new")
old_model_roas = measure_roas(model="old")

# Statistical test: Is new model better?
p_value = ttest(new_model_roas, old_model_roas)

if p_value < 0.05 and new_model_roas > old_model_roas:
    # New model wins! Roll out to 100%
    deploy(new_model)
else:
    # New model doesn't beat old, rollback
    rollback()
```

**Cost:** Low (only 10% of traffic)
**Value:** Real-world validation (not just offline metrics)

---

## Part 4: Efficient Complexity Decisions

### Decision Framework: Add Complexity Only If Worth It

**For each potential addition:**

1. **Estimate cost:**
   - Development time (hours)
   - Computational cost (training time, inference latency)
   - Maintenance burden (code complexity)

2. **Estimate benefit:**
   - Expected RMSE improvement (%)
   - Business impact ($ revenue improvement)

3. **Calculate ROI:**
   ```
   ROI = (benefit - cost) / cost

   If ROI < 2.0: Don't add it (not worth complexity)
   If ROI > 5.0: Definitely add it
   ```

**Example: Should we add deep learning (Stage 8)?**

**Cost:**
- Development: 40 hours (5 days)
- Training: 10 hours per run (GPU required)
- Inference: 100ms per prediction (vs 5ms for gradient boosting)
- Maintenance: High (complex code, model drift monitoring)

**Benefit:**
- Expected RMSE improvement: 5% (based on Stage 7 baseline)
- Business impact: 5% better predictions → 2% ROAS improvement → $X revenue

**Decision:**
- If X > $10k/month: Worth it (ROI > 5)
- If X < $2k/month: Not worth it (ROI < 2)

---

## Part 5: Testing Checklist (Light But Effective)

### Unit Tests (Cheap)

**Test 1: Smoke test (does it run?)**
```python
def test_model_runs():
    model = build_model()
    X = np.random.rand(100, 10)
    y = np.random.rand(100)

    model.fit(X, y)
    predictions = model.predict(X)

    assert predictions.shape == (100,)  # Correct output shape
    assert not np.isnan(predictions).any()  # No NaN outputs
```

**Test 2: Invariants**
```python
def test_inventory_constraint():
    model = build_model_with_constraints()
    X = create_features(temp=30, inventory=0)  # Out of stock

    prediction = model.predict(X)

    assert prediction == 0  # Should recommend $0 budget for OOS product
```

**Test 3: Known patterns (synthetic data)**
```python
def test_recovers_temperature_effect():
    # Generate data: sales = 100 + 2*(50 - temp)
    temp, sales = generate_synthetic_data(n=1000, true_coef=2.0)

    model.fit(temp, sales)
    recovered_coef = model.coef_[0]

    assert abs(recovered_coef - 2.0) < 0.2  # Within 10% of true value
```

**Cost:** Seconds to run
**Value:** Catch basic bugs before expensive training

---

### Integration Tests (Moderate Cost)

**Test 1: End-to-end pipeline**
```python
def test_full_pipeline():
    # Ingest → Features → Train → Predict → Optimize
    raw_data = ingest_data(days=7)  # Small sample
    features = engineer_features(raw_data)
    model = train_model(features)
    predictions = model.predict(features)
    optimal_budgets = optimize_budgets(predictions, constraints)

    assert optimal_budgets.sum() <= total_budget  # Respects constraints
```

**Test 2: Holdout validation**
```python
def test_generalizes_to_holdout():
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

    model.fit(X_train, y_train)
    train_score = model.score(X_train, y_train)
    test_score = model.score(X_test, y_test)

    assert test_score > 0.7 * train_score  # Not overfitting (test > 70% of train)
```

**Cost:** Minutes to run
**Value:** Ensure model works end-to-end

---

### Production Tests (High Value)

**Test 1: Shadow mode (before full rollout)**
```python
# Run new model in parallel with old model (don't show to customers yet)
for customer in sample_customers:
    old_prediction = old_model.predict(customer_features)
    new_prediction = new_model.predict(customer_features)

    log_predictions(old_prediction, new_prediction, customer_id)

# After 1 week, compare:
# - Prediction differences (how different are recommendations?)
# - If actual ROAS measured, which model was closer?
```

**Test 2: A/B test (10% traffic)**
```python
# Show new model to 10% of customers
# Measure actual business impact (ROAS, revenue, retention)
# Statistical significance test before full rollout
```

**Cost:** 1-2 weeks of monitoring
**Value:** Real-world validation (ultimate test)

---

## Part 6: Implementation Plan (Efficient Path)

### Week 1: Foundation + Quick Wins
- **Day 1:** Naive baseline (average sales)
- **Day 2-3:** Linear model (temperature, day-of-week, month)
- **Day 4:** Add inventory constraints
- **Day 5:** Synthetic data tests (validate model recovers known patterns)

**Deliverable:** Simple model that beats naive baseline by 20%+, respects inventory

**Decision gate:** If linear model doesn't beat naive by 15%, debug data pipeline

---

### Week 2: Non-Linearity + Temporal
- **Day 1-3:** Gradient boosting (capture non-linear effects)
- **Day 4-5:** Add temporal lags (0, 1, 3, 7 days)

**Deliverable:** Model with feature importance (know which features matter)

**Decision gate:** If gradient boosting doesn't beat linear by 5%, stop here (simpler is better)

---

### Week 3: Hierarchy + Geography
- **Day 1-3:** Hierarchical model (product → category, handle cold-start)
- **Day 4-5:** Geographic hierarchy (zip → metro → state)

**Deliverable:** Model that handles sparse products/geographies

**Decision gate:** If hierarchy doesn't help sparse data by 10%, drop it

---

### Week 4: Calendar + Optimization
- **Day 1-2:** Calendar effects (holidays, events)
- **Day 3-5:** Constraint-aware optimizer (budgets, inventory, velocity limits)

**Deliverable:** Full pipeline (ingest → features → model → optimize)

**Decision gate:** End-to-end test passes, recommendations respect all constraints

---

### Week 5: Production Testing
- **Day 1-3:** Shadow mode (run new model parallel to old)
- **Day 4-5:** A/B test setup (10% traffic)

**Deliverable:** Confidence to roll out to production

**Decision gate:** A/B test shows statistically significant improvement (p < 0.05)

---

### Optional Week 6: Deep Learning (Only If Needed)
- **Day 1-5:** LSTM + Attention (if gradient boosting insufficient)

**Decision gate:** Only proceed if gradient boosting plateaus and business case justifies complexity

---

## Part 7: Summary Checklist

### ✅ Multi-Dimensional Complexity

- [ ] Temporal: Multiple time scales (hour, day, week, month, season)
- [ ] Geographic: Hierarchy (zip → metro → state)
- [ ] Product: Hierarchy (product → category → brand)
- [ ] Weather: Multiple variables (temp, precip, conditions)
- [ ] Inventory: Constraints (OOS = $0, low stock = reduce)
- [ ] Calendar: Holidays, events, cycles
- [ ] Interactions: All dimensions interact (captured via embeddings, trees, or neural nets)

### ✅ Efficient Path (No Waste)

- [ ] Start simple (linear model)
- [ ] Add complexity incrementally (gradient boosting, hierarchy, deep learning)
- [ ] Validate each addition (ROI > 2.0 to keep)
- [ ] Stop when diminishing returns (don't add complexity for <3% improvement)

### ✅ Cheap But Effective Testing

- [ ] Synthetic data with known ground truth (free, validate model recovers patterns)
- [ ] Small-scale experiments (10 products × 90 days, 100x faster)
- [ ] Cross-validation (detect overfitting)
- [ ] Unit tests (invariants, smoke tests)
- [ ] Integration tests (end-to-end pipeline)
- [ ] Shadow mode (1 week, no customer impact)
- [ ] A/B test (10% traffic, 1-2 weeks, real business impact)

---

**Bottom line:** Build multi-dimensional model efficiently by (1) starting simple, (2) adding complexity only when proven necessary (ROI > 2), (3) validating cheaply with synthetic data + small experiments + cross-validation before expensive full training, (4) final validation via shadow mode + A/B test before rollout.
