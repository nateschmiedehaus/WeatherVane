# World-Class ML Quality Standards

**Status**: Active Quality Gate
**Version**: 1.3
**Enforced By**: `ModelingReality_v2` Critic
**Last Updated**: 2025-10-24

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

### Quality Tenets

1. **Truth Over Throughput** – Ship only models that withstand scientific scrutiny; partial evidence is treated as failure.
2. **Evidence or Escalate** – Every claim is backed by artifacts; missing evidence escalates to Atlas within 24 hours.
3. **Baselines as Guardrails** – Naive, seasonal, and linear baselines accompany every experiment and stay in production as safe fallbacks.
4. **Observability in Spec** – Monitoring, alerting, and rollback mechanisms are defined before code is merged.
5. **Responsible by Default** – Fairness, privacy, and compliance controls are opt-out only with Director approval.
6. **Automation with Accountability** – Critics, scorecards, and pipelines run automatically, but named owners sign every gate.

---

## Quality Pillars & KPIs

| Pillar | Objective | KPI | Threshold | Evidence & Tooling |
|---|---|---|---|---|
| **Data Integrity** | Inputs are trustworthy and complete | Coverage ratio, null rate, leakage scan | ≥95% coverage, ≤0.5% nulls, 0 critical leakage findings | `dataset_card.md`, `data_quality_report.json`, `shared/data_context/validators.py` |
| **Modeling Performance** | Model materially outperforms baselines | Out-of-sample R², MAPE, baseline lift | R² ≥0.50 (weather), MAPE ≤20%, ≥10% lift vs all baselines | `validation_report.json`, critic `modeling_reality_v2`, unit tests |
| **Robustness & Stress** | Model holds under adverse scenarios | Robustness delta metrics | ΔR² ≤0.05 (missing data), ΔMAPE ≤2%, unseen tenant R² ≥0.45 | `robustness_suite.log`, pytest parameter sweeps |
| **Observability & Ops** | Production behavior is monitored and safe | Drift metrics, alert MTTA, fallback drills | Drift K-S <0.15, alert MTTA <5 min, quarterly failover drill | `monitoring_config.yaml`, Grafana `ML/WeatherVane`, on-call drill log |
| **Responsible AI & Compliance** | Model behavior is fair, auditable, and secure | Disparity gap, privacy audit, audit log completeness | Uplift gap ≤5pp, 0 PII findings, 100% experiment traceability | `fairness_report.json`, `privacy_sanitizer.log`, `experiments/metadata.json` |

These pillars anchor every gate below; a task cannot advance if any KPI or evidence artifact is missing.

---

## Quality Operating Model

### Roles & Responsibilities

| Role | Core Accountability | Gates Owned | Escalation Path |
|---|---|---|---|
| ModelingReality_v2 Critic | Enforce quantitative thresholds, fail fast when evidence missing | Offline Modeling | Auto-blocks CI → Atlas if unresolved in 24h |
| Data Engineering Lead | Guarantee data integrity, lineage, and leakage prevention | Data Readiness | Escalate to Director Dana for systemic data issues |
| Atlas (Scientific Reviewer) | Validate methodology, assumptions, and limitations narrative | Scientific Review | Escalate to Consensus Council if reviewer bandwidth constrained |
| Platform Engineering | Certify deployment safety, rollback, and runtime SLAs | Deployment Readiness | Escalate to Engineering Director for infra gaps |
| Observability Lead | Maintain monitoring coverage, drill cadence, and on-call runbooks | Monitoring Live | Escalate to Incident Commander when alerts fail |
| Product (WeatherOps PM) | Ensure customer impact, align standards with roadmap priorities | Lifecycle Alignment | Escalate to Strategy Council for scope or prioritization conflicts |

Named owners must be present in documentation (`scorecard.md`) for every gate; anonymous contributions are rejected.

### Operating Rhythm

- **Pre-Work (Day 0)** – Task owner completes quality checklist, reserves reviewer slots, and links baseline artifacts.
- **Build Window (Days 1-3)** – Owners generate evidence; critics run nightly; blockers surfaced in daily quality stand-up.
- **Review Window (≤24h)** – Automated critics first, then human review; reviewer must record verdict within SLA or auto-escalate.
- **Launch Prep (Day 4)** – Deployment simulation, rollback rehearsal, and observability sign-off occur before production change.
- **Post-Launch (Day 5+)** – Monitoring dashboards watched daily for first week; incident drills logged in `docs/runbooks/`.

### Review SLAs & Escalation Logic

1. **Automated Critics** – Must complete within 30 minutes of artifacts landing in CI; failures notify owner and Atlas.
2. **Scientific Review** – 24-hour SLA; missed SLA pages Atlas and schedules live review.
3. **Monitoring Readiness** – 48-hour SLA prior to go-live; missing alerts stop deploy pipeline automatically.
4. **Quality Debt** – Any deferred item requires ticket in ML remediation backlog with owner, due date, and mitigation plan.

---

## Core Quality Thresholds

### 1. Out-of-Sample Performance (R²)

| Model Type | Minimum R² | World-Class R² | Rationale |
|---|---|---|---|
| Weather-Sensitive (weather elasticity models, MMM with weather) | 0.50 | 0.60+ | Must explain ≥50% of variance; weather impact must be significant |
| Non-Weather-Sensitive (baseline models, allocation without weather) | 0.30 | 0.50+ | Lower bar but still must beat naive baselines |
| Multivariate Models (multi-feature interactions) | 0.55 | 0.65+ | Higher bar due to richer feature set; must capture interaction effects |
| Multi-Output Models (joint predictions) | 0.45 | 0.55+ | Slightly lower due to prediction complexity |
| Negative R² | FAIL ❌ | — | Model is worse than predicting the mean; fundamental error |

**Multivariate Model Requirements**:
- Feature interaction terms must have VIF (Variance Inflation Factor) < 5
- Condition number of feature matrix must be < 30
- Joint prediction accuracy must be within 15% of single-target models
- Cross-validated R² stability (std dev) must be < 0.08
- Feature importance ranks must be stable across folds (rank correlation > 0.8)

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

## Automation & Evidence Workflow

1. **Artifact Generation** – Training notebooks and pipelines write metrics to `experiments/<epic>/<task>/validation_report.json` and baseline comparisons in a single run; failing to persist artifacts aborts the workflow.
2. **Critic Orchestration** – CI triggers `critic:data_quality`, `critic:modeling_reality_v2`, and `critic:causal` sequentially; each critic posts structured verdicts to `state/audits/<task_id>.json`.
3. **Scorecard Sync** – `tools/wvo_mcp/scripts/sync_quality_scorecard.py` ingests critic outputs and updates `scorecard.md` statuses to `PASS`/`FAIL`/`RISK` automatically.
4. **Reviewer Package** – `tools/wvo_mcp/scripts/package_evidence.sh` bundles validation artifacts, robustness logs, fairness reports, and monitoring configs into `/tmp/<task_id>_evidence.tar.gz` for reviewer download.
5. **Decision Logging** – Reviewers append verdicts and remediation notes to `state/audits/<task_id>.json`; Atlas signs off using `atlas:record_decision` CLI command.
6. **Post-Approval Publishing** – Successful runs publish dashboards to Grafana via `tools/observability/publish_dashboard.py` and register models in the feature store registry.

**Non-Negotiable**: Manual uploads or ad-hoc evidence are rejected; every artifact must be reproducible by rerunning the pipeline with the same commit hash.

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

### Uncertainty & Explainability (T-MLR-2.7)

**Requirement**: Quantify uncertainty and expose feature drivers for every production-bound model.

- **Elasticity Confidence Intervals**:
  - Report 95% confidence intervals (or posterior credible intervals) for each weather elasticity coefficient
  - For multivariate models, provide full covariance matrix for interaction terms
  - Store in `validation_report.json` under `elasticity_ci`
  - Log bootstrapped CIs in `uncertainty_log.json`
  - Must validate CI coverage on holdout data
  - Alert if CI width expands >20% vs baseline

- **Prediction Intervals**:
  - Provide 80%, 95%, and 99% prediction intervals
  - Gap between forecast and actual must stay within:
    - 95% band for ≥90% of holdout observations
    - 99% band for ≥98% of holdout observations
  - For high-stakes predictions (budget >$10k), require 99% intervals
  - Validate calibration using proper scoring rules (log score, CRPS)
  - Monitor calibration drift in production

- **Explainability Requirements**:
  - Generate SHAP global summary and per-tenant feature rankings
  - Compute feature attribution stability scores across CV folds (must be >0.85)
  - Include counterfactual examples for key decision boundaries
  - Feature importance must be consistent across model versions (≤20% variance)
  - Archive SHAP values for production audits
  - Plot partial dependence curves for top 5 features
  - Generate interaction strength matrix

- **Review Hook**: Scientific reviewer must sign off that explainability narrative matches quantitative evidence.

**Example Artifact Structure**:
```json
"uncertainty": {
  "temperature": {
    "coef": 0.024,
    "ci_95": [0.018, 0.030],
    "ci_99": [0.015, 0.033],
    "stability_score": 0.92,
    "cross_val_variance": 0.002,
    "calibration_score": 0.89
  },
  "precipitation": {
    "coef": 0.041,
    "ci_95": [0.032, 0.051],
    "ci_99": [0.028, 0.055],
    "stability_score": 0.88,
    "cross_val_variance": 0.004,
    "calibration_score": 0.91
  },
  "interaction_covariance": [[0.001, 0.0003], [0.0003, 0.002]]
},
"prediction_interval_coverage": {
  "p80": 0.83,
  "p95": 0.91,
  "p99": 0.989,
  "calibration_metrics": {
    "log_score": -1.24,
    "crps": 0.18,
    "pit_histogram_uniformity": 0.92
  }
},
"feature_importance_stability": {
  "temperature": {
    "mean_importance": 0.35,
    "std_importance": 0.03,
    "stability_score": 0.92,
    "rank_consistency": 0.95
  }
},
"partial_dependence": {
  "temperature": [[20, 0.2], [25, 0.4], [30, 0.6]],
  "precipitation": [[0, 0.1], [10, 0.3], [20, 0.5]]
}
```

**Production Monitoring Requirements**:
- Track CI coverage in production vs development
- Alert if coverage drops below 85% for 95% CIs
- Monitor stability of feature importance rankings
- Record calibration drift over time
- Archive uncertainty metrics for auditing

Failure to include uncertainty and explainability artifacts blocks Scientific Review.

**Regular Uncertainty Assessment**:
- Weekly validation of uncertainty estimates
- Monthly review of feature stability
- Quarterly audit of prediction intervals
- Immediate alert for systematic uncertainty violations

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

## Quality Risk Management

| Risk Level | Trigger | Immediate Response | Owner |
|---|---|---|---|
| **SEV1** | Production drift beyond thresholds or fairness violation | Freeze model, switch to baseline fallback, assemble incident bridge within 15 minutes | Observability Lead + Atlas |
| **SEV2** | Threshold miss in validation or robustness suite | Block deployment, open remediation ticket, schedule fix within 48 hours | Modeling Team |
| **SEV3** | Missing artifact or stale evidence (>7 days) | Regenerate evidence, re-run critics, update scorecard in 24 hours | Task Owner |
| **SEV4** | Documentation gap or minor monitoring issue | Log quality debt, assign due date within sprint, track in remediation backlog | Product PM |

### Quality Debt Handling

1. Log debt in `state/quality_debt/<YYYY-MM>/<task_id>.json` with severity, owner, due date, and mitigation plan.
2. Review debt items in weekly Quality Council; overdue items escalate to Atlas and Director Dana.
3. No new modeling work may begin while SEV1/SEV2 debt remains open unless Atlas grants written exception.

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

## Maturity Ladder & Exceptions

| Stage | Purpose | Minimum Requirements | Exception Policy |
|---|---|---|---|
| Prototype (sandbox) | Explore feasibility | Basic data sanity checks, documented hypothesis, manual baseline comparison | Exceptions approved by Atlas only; cannot ship to customers |
| Beta (limited launch) | Validate impact with pilot tenants | All core thresholds met, monitoring in place, reviewer sign-off, fallback plan verified | ≤1 metric may be marked `RISK` with remediation plan due <14 days |
| Production (GA) | Serve all tenants | 100% thresholds PASS, robustness suite green, fairness & privacy verified, incident runbook rehearsed | No exceptions. Any miss triggers rollback |

**Note**: Thresholds never degrade over time. Raising the bar requires consensus review; lowering requires Director Dana approval and written justification in `docs/reviews/`.

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
| Feature Engineering | Feature quality metrics all PASS, drift <5%, PII ✅ | `feature_audit.json`, `quality_metrics.json`, privacy checklist | ML Engineer |

**Feature Quality Standards**:
| Metric | Threshold | Tool | Rationale |
|---|---|---|---|
| Missing Value Rate | ≤0.5% per feature | `data_quality` critic | Ensure reliable predictions |
| Cardinality (categorical) | ≤100 unique values | `feature_validator` | Prevent sparse encoding |
| Signal-to-Noise Ratio | ≥3.0 | `signal_analyzer` | Filter meaningless features |
| Correlation Matrix | No correlation >0.85 | `correlation_check` | Avoid multicollinearity |
| Feature Stability | Drift ≤5% vs prior | `drift_monitor` | Detect distribution shifts |
| Memory Usage | ≤100MB per 10k rows | `resource_check` | Control compute costs |

**Feature Engineering Requirements**:
- Generate feature importance report before training
- Document feature transformations in feature_spec.md
- Version control feature engineering code
- Create unit tests for transformations
- Log all feature statistics to monitoring
- Alert on drift violations
| Offline Modeling | Core thresholds (R², MAPE, baselines, elasticity) satisfied | `validation_report.json`, cross-fold metrics, robustness suite log | Modeling Reality Critic |
| Scientific Review | External ML reviewer confirms claims + methodology | Review note in `docs/reviews/` with pass/fail + remediation plan | Atlas (or delegate) |
| Deployment Readiness | Champion/challenger plan, rollback path, SLO definition | `deployment_plan.md`, `rollback_playbook.md`, API contract diff | Platform Engineering |
| Monitoring Live | Drift monitors configured, alert routing tested | `monitoring_config.yaml`, Grafana snapshot, alert receipt evidence | Observability Lead |

Gate reviews must be captured in `state/audits/` with timestamp, reviewer, and verdict.

---

### Gate Review Workflow

1. **Prep & Self-Audit** – Task owner completes pillar scorecard (see below), attaches artifacts, and logs open risks.
2. **Automated Critics** – Run `critic:data_quality`, `critic:modeling_reality_v2`, and any epic-specific critics; attach logs to the evidence bundle.
3. **Asynchronous Review** – Reviewer has 24 hours to respond. SLA breaching >24h escalates to Atlas.
4. **Decision Recording** – Record decision in `state/audits/<task_id>.json` with pass/fail, remediation actions, and due dates.
5. **Quality Debt Tracking** – Any deferred item becomes a work item in the ML remediation backlog with owner and due date.

#### Pillar Scorecard Template

| Pillar | Metric | Status (`PASS`/`FAIL`/`RISK`) | Evidence Link | Owner | Date |
|---|---|---|---|---|---|
| Data Integrity | Coverage ≥95% |  |  |  |  |
| Modeling Performance | R² ≥ threshold |  |  |  |  |
| Robustness & Stress | ΔR² ≤0.05 |  |  |  |  |
| Observability & Ops | Drift K-S <0.15 |  |  |  |  |
| Responsible AI | Uplift gap ≤5pp |  |  |  |  |

Store completed scorecards alongside validation artifacts (`experiments/<epic>/<task>/scorecard.md`).

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
- **Explainability**: Provide SHAP/feature attribution summary, decision rationale, and reviewer narrative in `docs/reviews/` linking back to uncertainty artifacts.

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
| `scorecard.md` | `experiments/<epic>/<task>/` | Signed pillar status with owners and dates |

Atlas will not approve completion without a fully populated bundle.

---

## Review & Sign-Off

### Internal Review
- **Owner**: ML Engineering (Atlas)
- **Reviewer**: Modeling Reality Critic (automated)
- **Timeline**: 1-2 days per task
- **Submission Package**: Evidence bundle artifacts plus signed `scorecard.md` uploaded to `experiments/<epic>/<task>/`.

### External Peer Review
- **Requirement for T-MLR-0.3**: External ML practitioner reviews entire standard
- **Goal**: Validate thresholds are world-class, not just acceptable
- **Scope**: R² thresholds, baseline comparison logic, elasticity sign checking

---

## Versioning & Updates

| Version | Date | Changes |
|---|---|---|
| 1.3 | 2025-10-24 | Added operating model, automation workflow, risk governance, and maturity ladder |
| 1.2 | 2025-10-24 | Added quality pillar KPIs, uncertainty/explainability requirements, and gate review workflow |
| 1.1 | 2025-10-23 | Added lifecycle quality gates, monitoring, responsible AI, and evidence bundle requirements |
| 1.0 | 2025-10-22 | Initial standards (R²≥0.50, baseline >1.10, elasticity signs, no overfitting, MAPE<20%) |

**Future Improvements**:
- Codify causal validation standards (uplift modeling, geo experiments) before GA launches
- Define minimum online experiment sample sizes and power calculations for champion/challenger swaps
- Automate fairness and drift alert backtesting in CI to prevent config regressions

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
