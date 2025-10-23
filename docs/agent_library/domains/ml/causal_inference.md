# Causal Inference Standards

Establishing causality, not just correlation, between weather and ROAS.

---

## The Problem: Correlation ≠ Causation

**Correlation**: Ice cream sales and temperature are correlated (r=0.72)

**But**:
- Does temperature **cause** sales?
- OR do both just happen in summer?
- OR does a third variable (e.g., vacation season) drive both?

**Goal**: Prove that weather **causes** ROAS changes, not just correlates

---

## Causal Inference Methods

### 1. Randomized Controlled Trials (RCTs)

**Gold Standard**: Randomly assign treatment (weather-aware budgeting) vs control (standard budgeting)

**Design**:
```
Population: 100 ad accounts
├─ Treatment group (50): Weather-aware optimization
└─ Control group (50): Standard optimization

Duration: 30 days
Metric: ROAS (primary), revenue (secondary)
```

**Analysis**:
```python
treatment_roas = treatment_group['roas'].mean()
control_roas = control_group['roas'].mean()

lift = (treatment_roas - control_roas) / control_roas

# Statistical test
from scipy.stats import ttest_ind
t_stat, p_value = ttest_ind(
    treatment_group['roas'],
    control_group['roas']
)

if p_value < 0.05:
    print(f"Statistically significant lift: {lift:.1%}")
else:
    print("No significant difference")
```

**Challenge**: Hard to randomize weather (can't control it!)

---

### 2. Geo-Based Experiments

**Approach**: Use geography as randomization

**Design**:
```
Test Markets (Weather-Aware):
- NYC
- Chicago
- Miami

Control Markets (Standard):
- LA
- Seattle
- Boston

Match on: Population, baseline ROAS, seasonality
```

**Analysis**:
```python
# Difference-in-differences
pre_period = df.filter(pl.col('date') < experiment_start)
post_period = df.filter(pl.col('date') >= experiment_start)

# Treatment effect
treatment_change = (
    post_period.filter(pl.col('group') == 'treatment')['roas'].mean() -
    pre_period.filter(pl.col('group') == 'treatment')['roas'].mean()
)

control_change = (
    post_period.filter(pl.col('group') == 'control')['roas'].mean() -
    pre_period.filter(pl.col('group') == 'control')['roas'].mean()
)

did_estimate = treatment_change - control_change
print(f"Difference-in-Differences: {did_estimate:.2f}")
```

---

### 3. Time-Series Causal Impact

**Approach**: Before/after comparison with synthetic control

**Method**: Google's CausalImpact library

**Design**:
```
Pre-period (60 days): Standard optimization
Intervention: Switch to weather-aware optimization
Post-period (30 days): Measure impact
```

**Implementation**:
```python
from causalimpact import CausalImpact

# Data: Daily ROAS time series
data = df.select(['date', 'roas']).to_pandas()
data.set_index('date', inplace=True)

# Define intervention date
pre_period = ['2025-08-01', '2025-09-30']
post_period = ['2025-10-01', '2025-10-30']

ci = CausalImpact(data, pre_period, post_period)
print(ci.summary())
ci.plot()
```

**Output**:
```
Posterior inference: Absolute Effect
Average: +$0.65 ROAS
95% CI: [$0.42, $0.88]
p-value: 0.003

Interpretation: Weather-aware optimization caused a statistically
significant +$0.65 ROAS increase (20% lift).
```

---

## Data Leakage Detection

**Critical**: Ensure no future data used to predict past

**Leakage Types**:

### 1. Temporal Leakage

**Problem**: Using future data to predict past

**Example**:
```python
# WRONG: Using future temperature to predict past ROAS
df['tomorrow_temp'] = df['temperature'].shift(-1)  # Future data!
X = df[['tomorrow_temp']]  # Leakage!
y = df['roas']
```

**Fix**: Only use past/current data
```python
# CORRECT: Using yesterday's temperature
df['yesterday_temp'] = df['temperature'].shift(1)  # Past data ✓
X = df[['yesterday_temp']]
y = df['roas']
```

### 2. Target Leakage

**Problem**: Features that contain information about the target

**Example**:
```python
# WRONG: Using total_sales to predict ROAS
# (ROAS = revenue / spend, total_sales ≈ revenue)
X = df[['total_sales', 'ad_spend']]  # Leakage!
y = df['roas']
```

**Fix**: Only use features independent of target
```python
# CORRECT: Use ad spend and weather (independent)
X = df[['ad_spend', 'temperature']]
y = df['roas']
```

### 3. Preprocessor Leakage

**Problem**: Fitting scaler/encoder on entire dataset (including test)

**Example**:
```python
# WRONG: Fit scaler on full dataset
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)  # Leakage!
X_train, X_test = train_test_split(X_scaled)
```

**Fix**: Fit only on training data
```python
# CORRECT: Fit scaler only on training data
X_train, X_test = train_test_split(X)

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)  # Fit on train only
X_test_scaled = scaler.transform(X_test)  # Transform test
```

---

## Leakage Detection Tool

**Critic**: `leakage`

**Checks**:
1. Feature dates vs prediction dates
2. Target-dependent features
3. Preprocessor fitting order

**Implementation**:
```python
def detect_leakage(X, y, train_idx, test_idx):
    issues = []

    # Check 1: Future data
    if 'date' in X.columns:
        train_dates = X.loc[train_idx, 'date']
        test_dates = X.loc[test_idx, 'date']

        if test_dates.min() <= train_dates.max():
            issues.append("Temporal leakage: Test dates overlap with train")

    # Check 2: Target correlation
    for col in X.columns:
        if col == 'date':
            continue

        corr = X.loc[train_idx, col].corr(y.loc[train_idx])
        if abs(corr) > 0.95:
            issues.append(
                f"Possible target leakage: {col} has correlation {corr:.2f} with target"
            )

    # Check 3: Data leakage via NaN handling
    if X.isna().any().any():
        issues.append(
            "Missing data detected - ensure imputation uses only train data"
        )

    return issues
```

---

## Incrementality Testing

**Goal**: Measure **incremental** impact of ads (would sales happen anyway?)

### Methodology

**1. Holdout Experiment**:
```
Geography A: Run ads as normal
Geography B: Reduce ads by 50%

Compare: Sales difference = incremental impact
```

**2. Ghost Ads**:
```
Show ads to treatment group
Don't show ads to control group (same search query)

Compare: Conversion difference = incremental impact
```

### Analysis

```python
def calculate_incrementality(treatment_df, control_df):
    treatment_sales = treatment_df['sales'].sum()
    treatment_spend = treatment_df['ad_spend'].sum()

    control_sales = control_df['sales'].sum()
    control_spend = control_df['ad_spend'].sum()

    # Organic sales (would happen without ads)
    organic_sales = control_sales

    # Incremental sales (due to ads)
    incremental_sales = treatment_sales - organic_sales

    # Incremental ROAS
    incremental_roas = incremental_sales / treatment_spend

    return {
        'total_roas': treatment_sales / treatment_spend,
        'incremental_roas': incremental_roas,
        'organic_pct': organic_sales / treatment_sales
    }
```

**Interpret**:
```
Total ROAS: $4.00
Incremental ROAS: $2.50
Organic %: 37.5%

Meaning: 37.5% of sales would happen without ads.
True ad impact is $2.50 ROAS, not $4.00.
```

---

## Confounding Variables

**Definition**: Variables that affect both treatment and outcome

**Example**:
```
Temperature → Ad budget (treatment)
Temperature → Sales (outcome)

Confound: Can't tell if budget or temperature caused sales change
```

**Solution**: Control for confounds in regression

```python
# Include confounds as features
X = df[['ad_spend', 'temperature', 'day_of_week', 'is_holiday']]
y = df['sales']

model.fit(X, y)

# Now can isolate ad_spend effect (controlling for temp, day, holiday)
```

---

## Instrumental Variables (Advanced)

**When**: Can't randomize treatment, but have an "instrument"

**Instrument**: Variable that affects treatment but not outcome (except through treatment)

**Example**:
```
Instrument: Weather forecast (affects ad budget decision)
Treatment: Ad budget
Outcome: Sales

Assumption: Forecast affects sales ONLY through budget changes
```

**Implementation**:
```python
from statsmodels.sandbox.regression.gmm import IV2SLS

# Two-stage least squares
# Stage 1: Regress treatment on instrument
# Stage 2: Regress outcome on predicted treatment

model = IV2SLS(
    endog=df['sales'],  # Outcome
    exog=df['temperature'],  # Other features
    instrument=df['forecast']  # Instrument
)

results = model.fit()
print(results.summary())
```

---

## Causality Checklist

Before claiming causality:

- [ ] **Temporal ordering**: Cause precedes effect
- [ ] **Association**: Correlation exists (r ≠ 0)
- [ ] **No confounds**: Controlled for alternative explanations
- [ ] **No reverse causality**: Effect doesn't cause treatment
- [ ] **Mechanism**: Can explain how cause → effect
- [ ] **Dose-response**: Stronger cause → stronger effect
- [ ] **Consistency**: Effect replicates across contexts

**Example** (Temperature → Ice Cream Sales):
- ✅ Temperature happens before sales
- ✅ Correlation r=0.72 (strong association)
- ✅ Controlled for day of week, holidays, promotions
- ✅ Sales don't affect temperature (no reverse causality)
- ✅ Mechanism: Heat → thirst/comfort → ice cream purchase
- ✅ Hotter days → more sales (dose-response)
- ✅ Effect consistent across regions and time periods

**Conclusion**: Causality established (not just correlation)

---

## Reporting Standards

**When reporting results**:

**DO**:
- Report effect size + confidence interval
- State assumptions clearly
- Acknowledge limitations
- Distinguish correlation from causation

**DON'T**:
- Cherry-pick results
- Claim causation without justification
- Hide non-significant results
- Overstate findings

**Template**:
```markdown
## Causal Analysis: Weather → ROAS

**Method**: Geo-based experiment (difference-in-differences)

**Design**:
- Treatment: 50 accounts with weather-aware optimization
- Control: 50 matched accounts with standard optimization
- Duration: 30 days (2025-10-01 to 2025-10-30)

**Results**:
- Treatment ROAS increase: +$0.72 (+22%)
- Control ROAS increase: +$0.05 (+1.5%)
- Difference-in-Differences: +$0.67 (95% CI: [$0.48, $0.86])
- p-value: 0.002 (highly significant)

**Conclusion**:
Weather-aware optimization caused a +$0.67 ROAS increase.
Effect is statistically significant and practically meaningful.

**Assumptions**:
- Parallel trends (treatment and control would have similar trends without intervention)
- No spillover (treatment doesn't affect control)
- Stable unit treatment value (effect same for all units)

**Limitations**:
- 30-day period (longer-term effects unknown)
- Specific geographies (may not generalize to all regions)
```

---

## References

- [Causal Inference in Statistics: A Primer](http://bayes.cs.ucla.edu/PRIMER/)
- [Google CausalImpact](https://google.github.io/CausalImpact/)
- [Incrementality Testing Guide](/docs/INCREMENTALITY_INTEGRATION.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
