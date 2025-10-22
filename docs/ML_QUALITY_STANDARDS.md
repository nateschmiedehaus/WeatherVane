# World-Class ML Quality Standards

**Status**: Active Quality Gate
**Version**: 1.1
**Enforced By**: `ModelingReality_v2` Critic
**Last Updated**: 2025-10-23

---

## Philosophy

WeatherVane's ML models must deliver **objective truth, not task completion**. Every model is evaluated against world-class standards that require:

1. **Reproducible validation** with explicit train/val/test splits
2. **Quantitative thresholds** with no subjective judgment
3. **Baseline comparison** proving the model adds value
4. **Documented limitations** acknowledging where it breaks
5. **Critics enforce excellence**, not just correctness
6. **End-to-end safeguards** spanning data quality, ethical use, and live operations

This document codifies the standards that separate production-ready models from prototype code.

---

## Core Quality Thresholds

### 1. Out-of-Sample Performance (R²)

| Model Type | Minimum R² | World-Class R² | Rationale |
|---|---|---|---|
| Weather-Sensitive (weather elasticity models, MMM with weather) | 0.50 | 0.60+ | Must explain ≥50% of variance; weather impact must be significant |
| Non-Weather-Sensitive (baseline models, allocation without weather) | 0.30 | 0.50+ | Lower bar but still must beat naive baselines |
| Negative R² | FAIL ❌ | — | Model is worse than predicting the mean; fundamental error |

**Measurement**:
- Use **test set R²** (never training R²)
- Report as `out_of_sample_r2` or `test_r2` in validation artifacts
- Must be calculated on holdout data with NO leakage

**Evidence**: Validation report must include explicit test split metrics.

---

### 2. Baseline Comparison (MAPE Improvement)

| Baseline Type | Required Improvement | Measurement |
|---|---|---|
| Naive (predict mean) | ≥10% better MAPE | `baseline.naive_mape / model.mape ≥ 1.10` |
| Seasonal (seasonal naive) | ≥10% better MAPE | `baseline.seasonal_mape / model.mape ≥ 1.10` |
| Linear (linear regression) | ≥10% better MAPE | `baseline.linear_mape / model.mape ≥ 1.10` |

**Principle**: Model must beat ALL three baselines. Beating one is not sufficient.

**Measurement**:
- MAPE = Mean Absolute Percentage Error
- Calculate across entire test set
- Report in validation artifact as `baseline_comparison` object

**Example**:
```json
{
  "baseline_comparison": {
    "naive_mape": 0.22,
    "seasonal_mape": 0.18,
    "linear_mape": 0.16,
    "model_mape": 0.14
  },
  "improvements": {
    "vs_naive": 1.57,  // 57% better
    "vs_seasonal": 1.29,  // 29% better
    "vs_linear": 1.14  // 14% better
  }
}
```

---

### 3. Weather Elasticity Signs (Direction Check)

**Requirement**: Weather coefficients must have correct directional signs.

| Product Category | Temperature | Precipitation | Humidity |
|---|---|---|---|
| Cold-weather (ski, winter gear, heating) | **Negative** (warmer → less demand) | **Positive** (more snow/rain → more demand) | — |
| Warm-weather (sunglasses, ice cream, cooling) | **Positive** (warmer → more demand) | **Negative** (rain → less demand) | — |
| Rain products (umbrellas, raincoats) | — | **Positive** (more rain → more demand) | — |

**Failure Example**:
- Sunglasses with negative temperature coefficient → FAIL ❌
  - Rationale: Demand should increase when warmer
  - Fix: Debug feature engineering, check for data errors, validate domain assumptions

**Measurement**: Extract weather elasticity coefficients from model and verify signs match expected direction.

---

### 4. No Overfitting (Generalization Check)

| Metric | Threshold | Failure Condition |
|---|---|---|
| Validation vs Test R² Gap | ≤0.10 | `|test_r2 - validation_r2| > 0.10` |

**Interpretation**:
- If validation R² is high but test R² drops >0.10 → model is memorizing training data
- Indicates inadequate regularization or feature engineering artifacts

**Fix Options**:
1. Add L1/L2 regularization
2. Reduce feature count
3. Increase training data
4. Cross-validate on multiple folds
5. Use simpler model architecture

**Example**:
```json
{
  "validation_r2": 0.58,
  "test_r2": 0.52,
  "gap": 0.06,  // ✅ PASS (< 0.10)
  "status": "PASS"
}
```

---

### 5. Forecast Accuracy (MAPE Cap)

| Model Type | Max MAPE | Target MAPE |
|---|---|---|
| All models | 20% | <15% |

**Measurement**:
- MAPE = Mean Absolute Percentage Error
- `MAPE = mean(|actual - forecast| / |actual|)` × 100%
- Calculate on test set only

**Failure Example**:
- MAPE = 0.25 (25%) → FAIL ❌
- Fix: Improve feature engineering, add weather context, increase data

---

## Validation Report Format

Every ML task MUST produce a `validation_report.json` artifact with this structure:

```json
{
  "task_id": "T12.3.1",
  "tenant_id": "tenant_demo_001",
  "model_type": "LightweightMMM",
  "metrics": {
    "out_of_sample_r2": 0.52,
    "validation_r2": 0.54,
    "test_r2": 0.52,
    "mape": 0.16,
    "weather_elasticity": {
      "temperature": 0.025,
      "precipitation": 0.042,
      "humidity": -0.018
    },
    "baseline_comparison": {
      "naive_mape": 0.22,
      "seasonal_mape": 0.18,
      "linear_mape": 0.16,
      "model_mape": 0.16
    }
  },
  "thresholds_passed": {
    "r2": true,
    "elasticity_signs": true,
    "no_overfitting": true,
    "beats_baseline": true
  },
  "overall_status": "PASS",
  "artifacts": [
    "experiments/weather/model_weights.pkl",
    "experiments/weather/predictions.csv",
    "experiments/weather/feature_importance.json"
  ],
  "limitations": [
    "Model trained on 90 days of data; seasonal patterns may not be captured",
    "Temperature elasticity estimated with ±0.01 confidence interval",
    "Model does not account for competitive pricing; ROAS impact may differ in practice"
  ]
}
```

---

## Data Quality Requirements

### Synthetic Data (T-MLR-1.2)

Before any model training, synthetic data must pass:

| Check | Threshold | Tool |
|---|---|---|
| Weather correlation (extreme products) | 0.85 ± 0.05 | `pytest tests/data_gen/test_synthetic_v2_quality.py` |
| Weather correlation (high sensitivity) | 0.70 ± 0.05 | Same |
| Weather correlation (medium sensitivity) | 0.40 ± 0.05 | Same |
| Weather correlation (none) | < 0.10 | Same |
| Date range completeness | 100% (2022-2024) | Missing value check |
| Tenant diversity | 20 distinct tenants | Count check |
| Feature distribution | Normal or log-normal | KS test or visual inspection |

**Enforced By**: `data_quality` critic

---

### Train/Val/Test Split (T-MLR-2.1)

**Requirement**: Strict temporal split, NO LEAKAGE

```python
# ✅ CORRECT: Temporal split
train_end = '2024-09-30'  # 90 days
val_start = '2024-10-01'
val_end = '2024-10-15'    # 15 days
test_start = '2024-10-16'
test_end = '2024-10-31'   # 15 days

# ❌ WRONG: Random split (information leakage!)
train_idx = random.sample(range(len(data)), 0.7 * len(data))
```

**Why temporal?** Weather patterns repeat; random split allows model to memorize cross-time patterns.

---

## Model Training Standards

### Cross-Validation (T-MLR-2.3)

**Requirement**: Train on all 20 synthetic tenants with 5-fold cross-validation

```
Fold 1: Train on tenants 1-16, validate on 17-20
Fold 2: Train on tenants 1-14,17-20, validate on 15-16
... (5 total folds, ~16 train / ~4 validate per fold)

Report: Mean ± std of R² across all folds
```

**Exit Criteria**:
- Mean R² ≥ 0.50
- Std R² ≤ 0.10 (low variance across tenants)

---

### Baseline Comparison (T-MLR-2.5)

Every model must be compared to these baselines:

1. **Naive Baseline**: Predict previous value or annual average
2. **Seasonal Baseline**: Seasonal naive (e.g., last year's same week)
3. **Linear Baseline**: Linear regression on weather features only

**Measurement**:
```python
# Naive: predict last value
naive_forecast = y_test.shift(1)
naive_mape = mean_absolute_percentage_error(y_test, naive_forecast)

# Seasonal: predict 52 weeks ago
seasonal_forecast = y_test.shift(52)
seasonal_mape = mean_absolute_percentage_error(y_test, seasonal_forecast)

# Linear: sklearn LinearRegression
linear_model = LinearRegression()
linear_model.fit(X_train_weather, y_train)
linear_forecast = linear_model.predict(X_test_weather)
linear_mape = mean_absolute_percentage_error(y_test, linear_forecast)
```

**Verdict**: Model MUST beat all three or it fails.

---

### Robustness Testing (T-MLR-2.6)

Models must handle real-world edge cases:

| Test | Scenario | Pass Criteria |
|---|---|---|
| Missing Weather Data | 10% random weather values removed | R² drops <0.05 |
| Outlier Products | 5% extreme demand spikes | MAPE increases <2% |
| Unseen Tenant Type | Evaluate on 21st synthetic tenant | R² ≥ 0.45 |
| Short History | Train on 30 days only | Model still trains without errors |
| Feature Importance | Drop top feature | Model R² drops <0.15 |

**Tool**: Pytest with parameterized test cases.

---

## Critic Integration

### ModelingReality_v2 Critic

Deployed to enforce these standards automatically.

**Invocation**:
```bash
critic:modeling_reality_v2
```

**What It Checks**:
1. ✅ R² ≥ 0.50 (weather-sensitive) or ≥ 0.30 (other)
2. ✅ Weather elasticity signs match domain expectations
3. ✅ Model beats all three baselines by ≥10%
4. ✅ No overfitting (val vs test R² gap ≤ 0.10)
5. ✅ MAPE ≤ 20%

**Exit Criteria** (in roadmap):
```json
{
  "exit_criteria": [
    "metric:r2 > 0.50",
    "metric:beats_baseline > 1.10",
    "critic:modeling_reality_v2"
  ]
}
```

**How It Works**:
1. Looks for `validation_report.json` in task artifacts
2. Loads metrics from report
3. Checks each threshold
4. Returns PASS/FAIL with specific failure reasons
5. Blocks task completion if criteria not met

---

## Limitations & Transparency

Every model MUST document:

1. **Data Limitations**:
   - What period is covered?
   - What geographic regions?
   - What product categories?

2. **Metric Limitations**:
   - Confidence intervals for elasticity coefficients
   - Sensitivity to outliers
   - Seasonality assumptions

3. **Generalization Risks**:
   - Model not validated on competitor brands (e.g., Amazon)
   - Weather patterns may differ in unexplored regions
   - ROAS in production may differ from backtest due to pricing changes

**Example**:
```markdown
## Model Limitations

1. **Data Window**: Trained on Q4 2024 only; seasonal patterns from Q1-Q3 not captured
2. **Temperature Elasticity**: 0.025 ± 0.008 (95% CI); effect size is small
3. **Generalization**: Model trained on weather-heavy products (ski, ice cream);
   may not apply to weather-neutral categories (electronics)
4. **Causal Claim**: Elasticity estimated via regression; not causal without RCT evidence
```

---

## Common Failures & Fixes

| Failure | Cause | Fix |
|---|---|---|
| R² < 0.50 | Weak features | Add domain features (weather × product category interaction) |
| Negative elasticity sign | Data error or wrong category | Verify data labeling; check if category truly expects that direction |
| Beats 1 of 3 baselines | Model too simple or data too noisy | Add regularization; increase training data; use ensemble methods |
| High overfitting gap | Too many features | Use L1 regularization (Lasso) to drop weak features |
| MAPE > 20% | Forecast instability | Check for outliers; use robust loss function; ensemble with baseline |
| Missing elasticity report | Incomplete validation | Extract coefficients from model; store in validation_report.json |

---

## Roadmap Integration

All ML tasks include these exit criteria:

```yaml
exit_criteria:
  - artifact:validation_report.json        # Required artifact
  - metric:r2 > 0.50                       # Objective metric
  - metric:beats_baseline > 1.10           # Comparative metric
  - critic:modeling_reality_v2             # Automated enforcement
  - critic:data_quality                    # For data generation tasks
  - critic:causal                          # For model training tasks
```

**Automation**: CI/CD runs `ModelingReality_v2` critic on all tasks matching exit criteria.

---

## Lifecycle Quality Gates

Every modeling effort must pass staged gates before it can ship. Failing any gate halts progress until remediated.

| Stage | Gate | Required Evidence | Accountable Owner |
|---|---|---|---|
| Data Readiness | Source coverage ≥95%, leakage scan = 0 critical issues | `dataset_card.md`, `data_quality_report.json`, lineage in `shared/data_context/` | Data Engineering |
| Feature Engineering | Feature drift <5% vs. prior release, PII scrub report ✅ | `feature_audit.json`, signed-off privacy checklist | ML Engineer |
| Offline Modeling | Core thresholds (R², MAPE, baselines, elasticity) satisfied | `validation_report.json`, cross-fold metrics, robustness suite log | Modeling Reality Critic |
| Scientific Review | External ML reviewer confirms claims + methodology | Review note in `docs/reviews/` with pass/fail + remediation plan | Atlas (or delegate) |
| Deployment Readiness | Champion/challenger plan, rollback path, SLO definition | `deployment_plan.md`, `rollback_playbook.md`, API contract diff | Platform Engineering |
| Monitoring Live | Drift monitors configured, alert routing tested | `monitoring_config.yaml`, Grafana snapshot, alert receipt evidence | Observability Lead |

Gate reviews must be captured in `state/audits/` with timestamp, reviewer, and verdict.

---

## Live Monitoring & Incident Response

World-class quality extends into production. Every model must have:

- **Real-Time Dashboards** tracking prediction drift, feature drift, data freshness, and business outcomes (ROAS uplift vs. control). Dashboards live in Grafana folder `ML/WeatherVane`.
- **Alert Thresholds**: 
  - Prediction drift K-S statistic >0.15 for 30 minutes → page on-call.
  - Feature latency >10 minutes → open SEV2.
  - Actual vs forecast MAPE >25% over 3 consecutive hours → trigger fallback model.
- **Fallback Strategy**: Documented champion/challenger or rules-based fallback deployed alongside primary model; automated switch via `apps/worker/fallback.py`.
- **Incident Runbook**: `docs/runbooks/ML_INCIDENT_RESPONSE.md` must include reproduction steps, validation queries, communication templates, and customer impact assessment.
- **Post-Incident Review**: Conduct RCA within 48 hours, append findings to `docs/reviews/monitoring/`.

Failure to meet monitoring obligations blocks GA launch.

---

## Responsible AI & Compliance Standards

WeatherVane models must be safe, fair, and auditable.

- **Bias & Fairness**: Run disparity analysis on protected proxies (geo, income, language). Require uplift gap ≤5 percentage points between segments. Store report in `artifacts/fairness/`.
- **Privacy**: Confirm no direct PII persists post-feature engineering; document anonymization steps. Leverage `shared/privacy/sanitizer.py` and attach log.
- **Security**: Models and artifacts stored in encrypted S3 buckets with rotation every 90 days; hash artifacts before upload.
- **Auditability**: Maintain immutable experiment log (`experiments/metadata.json`) with git commit hash, data snapshot ID, and hyperparameters. Required for SOX-style reviews.
- **Regulatory Alignment**: Track compliance with upcoming EU AI Act high-risk provisions—risk assessment, human oversight plan, logging of automated decisions.

Non-compliant models cannot progress past Scientific Review gate.

---

## Evidence Bundle Checklist

Before requesting sign-off, package the following artifacts:

| Artifact | Location | Purpose |
|---|---|---|
| `validation_report.json` | `experiments/<epic>/<task>/` | Core metrics and thresholds |
| `baseline_comparison.json` | Same folder | Demonstrates superiority over baselines |
| `robustness_suite.log` | `experiments/<epic>/<task>/logs/` | Proof of edge-case testing |
| `fairness_report.json` | `artifacts/fairness/` | Bias and disparity checks |
| `monitoring_config.yaml` | `deployments/monitoring/` | Alert configuration |
| `dataset_card.md` | `docs/datasets/` | Data lineage, coverage, caveats |
| `review_note.md` | `docs/reviews/` | Scientific reviewer verdict |

Atlas will not approve completion without a fully populated bundle.

---

## Review & Sign-Off

### Internal Review
- **Owner**: ML Engineering (Atlas)
- **Reviewer**: Modeling Reality Critic (automated)
- **Timeline**: 1-2 days per task

### External Peer Review
- **Requirement for T-MLR-0.3**: External ML practitioner reviews entire standard
- **Goal**: Validate thresholds are world-class, not just acceptable
- **Scope**: R² thresholds, baseline comparison logic, elasticity sign checking

---

## Versioning & Updates

| Version | Date | Changes |
|---|---|---|
| 1.1 | 2025-10-23 | Added lifecycle quality gates, monitoring, responsible AI, and evidence bundle requirements |
| 1.0 | 2025-10-22 | Initial standards (R²≥0.50, baseline >1.10, elasticity signs, no overfitting, MAPE<20%) |

**Future Improvements**:
- Add confidence interval requirements for elasticity coefficients
- Require model explainability metrics (SHAP, feature importance)
- Add A/B test sample size requirements before production rollout

---

## Appendix: Evidence Artifacts

All modeling tasks produce these artifacts:

```
experiments/
├── validation_report.json        # Metrics, thresholds, status
├── model_weights.pkl            # Trained model
├── predictions.csv              # Test predictions vs actuals
├── feature_importance.json       # Which features matter
└── baseline_comparison.json      # Naive/seasonal/linear performance
```

**Storage**: Commit to repo under `experiments/[epic]/[task]/` for audit trail.

---

**Questions?** Refer to ModelingReality_v2 critic source at `tools/wvo_mcp/src/critics/modeling_reality_v2.ts` or contact Atlas for clarification.
