# ML Modeling Standards

**Reference**: This document links to the comprehensive ML quality standards.

**Primary Source**: `/docs/ML_QUALITY_STANDARDS.md`

---

## Quick Reference

### Minimum Performance Thresholds

- **R² (coefficient of determination)**: ≥0.45
- **MAPE (mean absolute percentage error)**: <15%
- **Cross-validation consistency**: CV std <0.1
- **Baseline beat**: Model must beat simple baseline by ≥10%

### Model Validation Checklist

Before deploying any ML model:

- [ ] **R² ≥ 0.45** on test set
- [ ] **MAPE < 15%** on test set
- [ ] **Baseline comparison**: Model beats OLS/average by ≥10%
- [ ] **Cross-validation**: 5-fold CV shows consistent performance
- [ ] **No data leakage**: leakage critic passes
- [ ] **Residuals check**: Normally distributed (Shapiro-Wilk test)
- [ ] **Feature importance**: All features contribute meaningfully
- [ ] **Production monitoring**: Drift detection in place

---

## Train/Test/Validation Split

### Time-Series Split (Required)

**Never shuffle** time-series data - breaks temporal ordering

**Split Strategy**:
```
├─────────────────────────────────────────┤
│  Train (80%)          │  Test (20%)     │
├───────────────────────┼─────────────────┤
2023-01-01          2024-10-01    2025-10-23
```

**Python Implementation**:
```python
# CORRECT: Time-series split
train_end_idx = int(len(df) * 0.8)
train_df = df.iloc[:train_end_idx]
test_df = df.iloc[train_end_idx:]

# WRONG: Random split (breaks temporal ordering)
# train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)
```

### Cross-Validation

**Time-Series CV** (sklearn `TimeSeriesSplit`):
```python
from sklearn.model_selection import TimeSeriesSplit

tscv = TimeSeriesSplit(n_splits=5)

for train_idx, val_idx in tscv.split(X):
    X_train, X_val = X[train_idx], X[val_idx]
    y_train, y_val = y[train_idx], y[val_idx]

    model.fit(X_train, y_train)
    score = model.score(X_val, y_val)
```

**Why**: Prevents using future data to predict past

---

## Baseline Comparison (Mandatory)

**Rule**: New models must beat baseline by ≥10%

### Baseline Models

**1. Average ROAS** (simplest):
```python
baseline_roas = train_df['roas'].mean()
# Use this as prediction for all test examples
```

**2. OLS Regression**:
```python
from sklearn.linear_model import LinearRegression

baseline = LinearRegression()
baseline.fit(X_train, y_train)
baseline_r2 = baseline.score(X_test, y_test)
```

**3. Historical Average by Segment**:
```python
# Average ROAS by channel
baseline_roas = train_df.groupby('channel')['roas'].mean()
```

### Comparison Report

**Required**: Generate comparison before deployment

**Format**:
```
Baseline Performance:
- Average ROAS: $3.20
- OLS R²: 0.38

New Model Performance:
- MMM R²: 0.52
- Improvement: +37% (beats threshold of +10%) ✅

Verdict: PASS - Deploy model
```

**Script**: `scripts/compare_models_to_baseline.py`

---

## Feature Engineering Standards

### Feature Types

**Allowed**:
- Features available at prediction time
- Lagged features (e.g., temperature from yesterday)
- Rolling aggregates (e.g., 7-day average spend)
- Derived features (e.g., is_weekend)

**Forbidden**:
- Future features (data leakage)
- Target-dependent features (circular logic)
- Leaky transformations (e.g., scaling on full dataset)

### Feature Validation

**Check**:
```python
def validate_features(df, prediction_date):
    # Ensure no features from future
    feature_dates = df.filter(pl.col('date') > prediction_date)
    assert len(feature_dates) == 0, "Future data leakage detected"

    # Ensure no missing critical features
    required = ['temperature', 'ad_spend', 'date']
    missing = [col for col in required if col not in df.columns]
    assert len(missing) == 0, f"Missing features: {missing}"
```

---

## Hyperparameter Tuning

### Grid Search (Preferred)

**For small search spaces**:
```python
from sklearn.model_selection import GridSearchCV

param_grid = {
    'alpha': [0.1, 1.0, 10.0],
    'fit_intercept': [True, False]
}

grid = GridSearchCV(
    estimator=BayesianRidge(),
    param_grid=param_grid,
    cv=TimeSeriesSplit(n_splits=5),
    scoring='r2'
)

grid.fit(X_train, y_train)
best_model = grid.best_estimator_
```

### Random Search (For Large Spaces)

**For many hyperparameters**:
```python
from sklearn.model_selection import RandomizedSearchCV
from scipy.stats import uniform

param_distributions = {
    'alpha': uniform(0.01, 10),
    'lambda': uniform(0.01, 10)
}

random_search = RandomizedSearchCV(
    estimator=BayesianRidge(),
    param_distributions=param_distributions,
    n_iter=20,
    cv=TimeSeriesSplit(n_splits=5),
    scoring='r2'
)
```

**Document**: Save best parameters to model metadata

---

## Model Persistence

### Save Format

**Pickle** (sklearn models):
```python
import pickle

# Save model
with open('experiments/mcp/models/mmm-2025-10-23-1200.pkl', 'wb') as f:
    pickle.dump(model, f)

# Load model
with open('experiments/mcp/models/mmm-2025-10-23-1200.pkl', 'rb') as f:
    model = pickle.load(f)
```

### Metadata

**Save alongside model**:
```json
{
  "model_type": "BayesianRidge",
  "training_date": "2025-10-23T12:00:00Z",
  "r2_score": 0.52,
  "mape": 12.3,
  "baseline_r2": 0.38,
  "improvement_pct": 37,
  "features": ["temperature", "ad_spend_google", "ad_spend_meta"],
  "hyperparameters": {
    "alpha": 1.0,
    "lambda": 1.0
  },
  "data_range": {
    "start": "2023-01-01",
    "end": "2025-10-23"
  }
}
```

---

## Model Monitoring

### Production Metrics

**Track continuously**:
- Prediction accuracy (MAPE)
- Feature distribution shifts
- Residual patterns
- Prediction latency

**Alert thresholds**:
- MAPE increases >5% from baseline → Warning
- MAPE increases >10% from baseline → Critical
- R² drops >0.1 → Critical (retrain immediately)

### Retraining Schedule

**Incremental**: Weekly (add new data)
**Full**: Monthly (retrain from scratch)
**Emergency**: When drift detected

---

## Reproducibility

### Requirements

- [ ] Random seed set (`np.random.seed(42)`)
- [ ] Data version tracked (hash or timestamp)
- [ ] Environment pinned (`requirements.txt` with exact versions)
- [ ] Training script committed to git
- [ ] Results logged to telemetry

### Example

```python
import numpy as np
from sklearn.linear_model import BayesianRidge

# Set seed for reproducibility
np.random.seed(42)

# Train model
model = BayesianRidge(
    alpha_1=1e-6,
    alpha_2=1e-6,
    lambda_1=1e-6,
    lambda_2=1e-6
)

model.fit(X_train, y_train)

# Log metadata
metadata = {
    'seed': 42,
    'data_hash': hash(X_train.tobytes()),
    'sklearn_version': sklearn.__version__,
    'model_params': model.get_params()
}
```

---

## Error Analysis

### Residual Analysis

**Check**: Residuals should be normally distributed

```python
from scipy.stats import shapiro

residuals = y_test - model.predict(X_test)

# Shapiro-Wilk test (p > 0.05 = normal)
stat, p_value = shapiro(residuals)

if p_value < 0.05:
    print("WARNING: Residuals not normally distributed")
    print("Consider: feature transformations, outlier removal")
```

### Error Distribution

**Visualize**:
```python
import matplotlib.pyplot as plt

plt.hist(residuals, bins=50)
plt.xlabel('Residual (Actual - Predicted)')
plt.ylabel('Frequency')
plt.title('Residual Distribution')
plt.show()
```

**Look for**:
- Symmetric distribution (good)
- Heavy tails (outliers - may need handling)
- Skewed (feature transformations needed)

---

## Full Standards Document

**For complete details**, see:

📄 `/docs/ML_QUALITY_STANDARDS.md`

Includes:
- Detailed methodology
- Statistical tests
- Code examples
- Troubleshooting guide
- Critic integration

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
