# ML Domain - Overview

Machine learning systems for marketing mix modeling and optimization.

---

## ML System Architecture

```
┌────────────────────────────────────────────────────┐
│              ML Pipeline                           │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Shopify  │  │ Ad APIs  │  │ Weather  │         │
│  │  Data    │  │  Data    │  │   Data   │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │             │             │               │
│       └─────────────┼─────────────┘               │
│                     ↓                             │
│         ┌───────────────────────┐                 │
│         │   Data Quality        │                 │
│         │   Validation          │                 │
│         └───────────┬───────────┘                 │
│                     ↓                             │
│         ┌───────────────────────┐                 │
│         │  Feature Engineering  │                 │
│         │  (Polars/DuckDB)     │                 │
│         └───────────┬───────────┘                 │
│                     ↓                             │
│         ┌───────────────────────┐                 │
│         │  Train/Test Split     │                 │
│         │  (Time-Series CV)     │                 │
│         └───────────┬───────────┘                 │
│                     ↓                             │
│       ┌─────────────┴─────────────┐               │
│       │                           │               │
│  ┌────▼────┐              ┌───────▼──────┐        │
│  │ Baseline│              │     MMM      │        │
│  │  Model  │              │    Model     │        │
│  │ (OLS)   │              │  (Bayesian)  │        │
│  └────┬────┘              └───────┬──────┘        │
│       │                           │               │
│       └─────────────┬─────────────┘               │
│                     ↓                             │
│         ┌───────────────────────┐                 │
│         │   Model Validation    │                 │
│         │   (R², MAPE, etc.)   │                 │
│         └───────────┬───────────┘                 │
│                     ↓                             │
│         ┌───────────────────────┐                 │
│         │     Allocator         │                 │
│         │   (Optimization)      │                 │
│         └───────────┬───────────┘                 │
│                     ↓                             │
│         ┌───────────────────────┐                 │
│         │   Budget               │                 │
│         │   Recommendations      │                 │
│         └───────────────────────┘                 │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Core ML Components

### 1. Data Quality Validation

**Purpose**: Ensure training data meets quality standards before modeling

**Checks**:
- Completeness (no missing critical fields)
- Validity (values in expected ranges)
- Consistency (no contradictions)
- Timeliness (data not stale)
- Uniqueness (no duplicates)

**Thresholds**:
- Missing data: <5%
- Outliers: <2%
- Duplicates: 0%

See [Data Quality Standards](/docs/agent_library/domains/ml/data_quality.md)

---

### 2. Feature Engineering

**Purpose**: Transform raw data into ML-ready features

**Feature Types**:
- **Weather features**: Temperature, precipitation, humidity (current + lagged)
- **Time features**: Day of week, month, season, holidays
- **Ad features**: Spend, impressions, clicks (by channel)
- **Business features**: Product category, promotions, inventory

**Feature Store**: `shared/feature_store/feature_builder.py`

**Example**:
```python
features = FeatureBuilder()
  .add_weather_features(weather_df, lags=[1, 7, 14])
  .add_time_features(date_col='date')
  .add_ad_features(ads_df, channels=['google', 'meta'])
  .build()
```

---

### 3. Marketing Mix Model (MMM)

**Purpose**: Quantify impact of marketing spend + weather on ROAS

**Approach**: Bayesian ridge regression

**Equation**:
```
ROAS = β₀ + β₁(google_spend) + β₂(meta_spend) + β₃(temperature) + ε
```

**Key Metrics**:
- **R²**: ≥0.45 (explains 45%+ of variance)
- **MAPE**: <15% (mean absolute percentage error)
- **Coefficients**: Statistically significant (p<0.05)

**Baseline Comparison**: Must beat simple average ROAS by ≥10%

See [Modeling Standards](/docs/agent_library/domains/ml/modeling_standards.md)

---

### 4. Allocator (Optimization)

**Purpose**: Optimize budget allocation across channels given constraints

**Method**: Constrained optimization (scipy.optimize)

**Objective**: Maximize total ROAS

**Constraints**:
- Total budget ≤ max budget
- Per-channel budget ≥ min budget
- Weather-responsive adjustments

**Example**:
```python
# Objective: Maximize ROAS
# Subject to:
# - google_budget + meta_budget <= $10,000
# - google_budget >= $1,000
# - If temp > 85°F: google_budget += 20%
```

---

## ML Workflow

### Training Pipeline

```
1. Data Ingestion
   ├─ Load Shopify sales (90 days)
   ├─ Load ad spend (Google, Meta)
   └─ Load weather data

2. Data Quality Validation
   ├─ Check completeness
   ├─ Check validity
   └─ Check leakage

3. Feature Engineering
   ├─ Join datasets on date + location
   ├─ Create lagged features
   └─ Create derived features

4. Train/Test Split
   ├─ Time-series split (80/20)
   ├─ No data leakage (test after train)
   └─ Cross-validation (5-fold)

5. Model Training
   ├─ Train baseline (OLS)
   ├─ Train MMM (Bayesian ridge)
   └─ Compare performance

6. Model Validation
   ├─ R² ≥ 0.45
   ├─ MAPE < 15%
   └─ Residuals normally distributed

7. Model Export
   ├─ Save model (.pkl)
   ├─ Save metadata (coefficients, R²)
   └─ Log to telemetry
```

---

### Inference Pipeline

```
1. Fetch Current Data
   ├─ Get weather forecast (7 days)
   ├─ Get current ad spend
   └─ Get recent sales

2. Feature Engineering
   ├─ Same as training pipeline
   └─ Use saved feature definitions

3. Predict ROAS
   ├─ Load trained model
   ├─ Generate predictions
   └─ Confidence intervals

4. Optimize Allocation
   ├─ Run allocator with constraints
   ├─ Generate recommendations
   └─ Validate feasibility

5. Return Recommendations
   ├─ Per-channel budgets
   ├─ Expected ROAS lift
   └─ Confidence score
```

---

## Data Leakage Prevention

**Critical**: Ensure test data doesn't leak into training

**Leakage Types**:

### 1. Temporal Leakage
**Problem**: Using future data to predict past
**Prevention**: Time-series split (train on past, test on future)

### 2. Feature Leakage
**Problem**: Features contain target information
**Example**: Using "total_sales" to predict "roas" (circular)
**Prevention**: Only use features available at prediction time

### 3. Preprocessor Leakage
**Problem**: Fitting scaler on entire dataset (including test)
**Prevention**: Fit scaler only on training data

**Validation**: `leakage` critic detects and blocks releases

See [Causal Inference Standards](/docs/agent_library/domains/ml/causal_inference.md)

---

## Model Versioning

**Why**: Track model performance over time, rollback if needed

**Versioning Scheme**: `YYYY-MM-DD-HHMM` (timestamp-based)

**Stored**:
- Model file: `experiments/mcp/models/mmm-2025-10-23-1200.pkl`
- Metadata: `experiments/mcp/models/mmm-2025-10-23-1200.json`
- Metrics: `state/analytics/mmm_training_results.json`

**Rollback**:
```bash
# If new model performs poorly
cp experiments/mcp/models/mmm-2025-10-20-0900.pkl \
   experiments/mcp/models/mmm-current.pkl
```

---

## Monitoring & Alerts

### Model Drift

**Definition**: Model performance degrades over time

**Detection**:
- R² drops >10% from baseline
- MAPE increases >5% from baseline
- Predictions consistently off

**Alert**: Critical critic failure (stops releases)

**Action**: Retrain model with recent data

---

### Data Drift

**Definition**: Input data distribution changes

**Detection**:
- Feature means shift >2 standard deviations
- New categorical values appear
- Missing data rate increases

**Alert**: Warning (investigate but don't block)

**Action**: Review data pipeline, update feature engineering

---

## Experimentation

### A/B Testing

**Purpose**: Validate that weather-aware optimization actually improves ROAS

**Design**:
- Control group: Standard budget allocation
- Treatment group: Weather-aware allocation
- Duration: 30 days
- Metric: ROAS (primary), revenue (secondary)

**Statistical Power**:
- Minimum detectable effect: 10% ROAS lift
- Significance level: α = 0.05
- Power: 1 - β = 0.80

---

### Incrementality Tests

**Purpose**: Prove causality (weather changes → sales changes)

**Method**: Geo-based experiments
- Test markets: Apply weather-aware optimization
- Control markets: Standard optimization
- Compare: ROAS lift in test vs control

See [Causal Inference](/docs/agent_library/domains/ml/causal_inference.md)

---

## Model Quality Standards

**Documented**: `docs/ML_QUALITY_STANDARDS.md`

### Minimum Requirements

- **R²**: ≥0.45 (explains variance)
- **MAPE**: <15% (prediction accuracy)
- **Baseline beat**: ≥10% improvement
- **No data leakage**: leakage critic passes
- **Cross-validation**: Consistent across folds (CV std <0.1)

### Aspirational Targets

- **R²**: ≥0.60 (strong explanatory power)
- **MAPE**: <10% (high accuracy)
- **Baseline beat**: ≥20% improvement
- **Production monitoring**: Drift detection active

---

## ML Tech Stack

**Python Libraries**:
- `polars`: Fast dataframe operations
- `scikit-learn`: ML algorithms, preprocessing
- `scipy`: Optimization
- `numpy`: Numerical computing
- `matplotlib`/`seaborn`: Visualization

**Feature Store**: Polars + DuckDB (in-memory analytics)

**Model Serving**: FastAPI endpoints

**Monitoring**: Custom telemetry + Prometheus (future)

---

## Key Documents

- [ML Quality Standards](/docs/ML_QUALITY_STANDARDS.md)
- [Modeling Standards](/docs/agent_library/domains/ml/modeling_standards.md)
- [Data Quality](/docs/agent_library/domains/ml/data_quality.md)
- [Causal Inference](/docs/agent_library/domains/ml/causal_inference.md)
- [Modeling Reality Check](/docs/MODELING_REALITY_CHECK.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
