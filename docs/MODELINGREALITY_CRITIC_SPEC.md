# ModelingReality Critic - Quantitative ML Quality Specification

## Overview

The **ModelingReality Critic** enforces objective, quantitative thresholds on all ML modeling work. It guarantees that WeatherVane's models meet world-class standards with no subjective judgment.

**Core principle**: If a model fails this critic, it's an objective, measurable defect—not an opinion.

## Architecture

### Implementation

- **Location**: `tools/wvo_mcp/src/critics/modeling_reality.ts` (wrapper)
- **Engine**: `tools/wvo_mcp/src/critics/modeling_reality_v2.ts` (core logic)
- **Tests**: `tools/wvo_mcp/src/critics/modeling_reality.test.ts` (comprehensive validation)

The critic integrates the ModelingRealityV2Critic engine to validate models against quantitative thresholds during task execution.

## Quantitative Thresholds

### 1. R² (Coefficient of Determination) Validation

**Purpose**: Ensures model explains sufficient variance in target variable.

#### Weather-Sensitive Models (T12.*, T13.5.*, T-MLR-*)
- **Minimum**: R² > **0.50**
- **World-class**: R² > **0.60**
- **Failure mode**: Model explains less than 50% of variance

#### Non-Weather-Sensitive Models
- **Minimum**: R² > **0.30**
- **Failure mode**: Model explains less than 30% of variance

#### Special Cases
- **Negative R²**: Model performs **worse than predicting the mean**
  - Indicates fundamental issues: data leakage, incorrect train/test split, or broken feature engineering
  - Always FAILS with actionable recommendation to debug root cause

**Validation points**:
- Uses `out_of_sample_r2` or `test_r2` (prefer out-of-sample)
- Must be reported in `validation_report.json`
- Required for all modeling tasks

---

### 2. Weather Elasticity Sign Validation

**Purpose**: Ensures weather features have correct directional relationship to business outcome.

#### Requirements
- Model must report weather elasticity coefficients for:
  - Temperature
  - Precipitation
  - Humidity (optional)

#### Validation Rules

The critic infers expected signs based on tenant characteristics:

| Tenant Pattern | Temperature | Precipitation | Reason |
|---|---|---|---|
| `extreme`, `winter`, `ski` | **Negative** (cold → more sales) | **Positive** (snow → more sales) | Cold weather products |
| `summer`, `sunglasses`, `ice_cream` | **Positive** (heat → more sales) | **Negative** (rain → fewer sales) | Warm weather products |
| `rain`, `umbrella` | — | **Positive** (rain → more sales) | Rain-dependent products |
| Other | Flexible | Flexible | Domain-specific validation |

#### Failure Conditions
- ❌ Elasticity coefficients missing
- ❌ Elasticity sign inverted (e.g., positive temperature for winter products)
- ✅ Must report actual coefficients in `metrics.weather_elasticity`

**Example failure**:
```json
{
  "tenant_id": "ice_cream_summer",
  "metrics": {
    "weather_elasticity": {
      "temperature": -0.12  // ❌ WRONG: should be positive for ice cream
    }
  }
}
```

---

### 3. Baseline Comparison (Required)

**Purpose**: Ensures model beats simple baselines, proving it captures real signal.

#### Required Baselines
Model must be compared against and beat:
1. **Naive baseline**: Predicts average from training set
2. **Seasonal baseline**: Captures seasonal patterns
3. **Linear baseline**: Simple linear regression on weather features

#### Validation Rules
- Model MAPE must be **≥ 110% better** than each baseline
- Example: If naive baseline MAPE = 0.25, model MAPE must be < 0.2275 (25% improvement)

#### Failure Conditions
- ❌ Baseline comparison missing
- ❌ Model doesn't beat naive baseline by 10%
- ❌ Model doesn't beat seasonal baseline by 10%
- ❌ Model doesn't beat linear baseline by 10%
- ✅ All three baselines reported and beaten

**Validation matrix**:
```json
{
  "baseline_comparison": {
    "naive_mape": 0.25,
    "seasonal_mape": 0.20,
    "linear_mape": 0.18,
    "model_mape": 0.15  // Must beat all three by 10%
  }
}
```

---

### 4. Overfitting Detection

**Purpose**: Ensures model generalizes to unseen data (validation ≈ test performance).

#### Validation Rules
- **Max gap**: |test_r² - validation_r²| ≤ **0.10**
- Indicates model isn't memorizing training data

#### Failure Conditions
- ❌ Gap > 0.10 (e.g., validation R² = 0.65, test R² = 0.50)
- ❌ Either validation_r² or test_r² missing

#### Example
```json
{
  "validation_r2": 0.53,
  "test_r2": 0.52,     // Gap = 0.01 ✅ PASS
  "out_of_sample_r2": 0.52
}
```

vs.

```json
{
  "validation_r2": 0.65,
  "test_r2": 0.50      // Gap = 0.15 ❌ FAIL - overfitting
}
```

---

### 5. Mean Absolute Percentage Error (MAPE) Constraint

**Purpose**: Ensures prediction accuracy meets practical requirements.

#### Validation Rules
- **Maximum MAPE**: < **20%** (0.20)
- Optional but recommended for forecasting models

#### Failure Conditions
- ❌ MAPE ≥ 20%
- ✅ MAPE < 20%

#### Notes
- MAPE is optional; models without it still pass other thresholds
- Applies to all model types where forecast accuracy is measurable

---

## Task Eligibility

ModelingReality critic only validates tasks matching these patterns:

- `T12.*` — Core PoC and production modeling tasks
- `T13.5.*` — ML remediation and enhancement tasks
- `T-MLR-*` — ML remediation epic tasks

All other tasks are **skipped** (status = "info", passed = true).

---

## Validation Report Format

Models must generate a `validation_report.json` artifact with this structure:

```json
{
  "task_id": "T12.PoC.1",
  "tenant_id": "ice_cream_summer",
  "model_type": "weather_aware_mmm",
  "metrics": {
    "out_of_sample_r2": 0.55,
    "validation_r2": 0.54,
    "test_r2": 0.54,
    "mape": 0.15,
    "weather_elasticity": {
      "temperature": 0.18,
      "precipitation": -0.12,
      "humidity": 0.05
    },
    "baseline_comparison": {
      "naive_mape": 0.30,
      "seasonal_mape": 0.25,
      "linear_mape": 0.20,
      "model_mape": 0.15
    }
  },
  "thresholds_passed": {
    "r2": true,
    "elasticity_signs": true,
    "no_overfitting": true,
    "beats_baseline": true
  },
  "overall_status": "PASS"
}
```

### Required Fields
- `task_id` — Task identifier being validated
- `model_type` — Type of model (e.g., "weather_aware_mmm")
- `metrics.out_of_sample_r2` or `metrics.test_r2` — Model R²
- `metrics.validation_r2` — Validation set R² (for overfitting check)
- `metrics.weather_elasticity` — Weather impact coefficients
- `metrics.baseline_comparison` — Comparison to baselines

### Optional Fields
- `tenant_id` — For elasticity sign inference
- `metrics.mape` — Forecast accuracy metric
- `metrics.humidity` — Additional weather variables

---

## Failure Modes & Remediation

| Failure | Reason | Fix |
|---|---|---|
| R² < threshold | Model too simple or poor features | Engineer better weather features, add more training data, use higher capacity model |
| Negative R² | Model fundamentally broken | Check for data leakage, verify train/test split, validate feature engineering |
| Wrong elasticity signs | Features have opposite impact | Review product category, verify weather data, check for confounded variables |
| Elasticity missing | No weather features | Add weather features to model input |
| Baseline not beaten | Model not capturing signal | Improve feature engineering, tune hyperparameters, increase model capacity |
| Overfitting detected | Model memorizing training data | Add regularization, reduce features, increase training data, early stopping |
| MAPE too high | Predictions too inaccurate | Improve features, ensemble methods, data quality improvements |

---

## Integration with Task Verification

The critic is invoked by the TaskVerifierV2 system:

1. **After task execution** → runs post-checks
2. **Loads validation_report.json** from artifacts
3. **Evaluates all thresholds** in sequence
4. **Returns structured result**:
   - `passed` (boolean)
   - `severity` (blocking | warning | info)
   - `details.failures` (list of failures)
   - `details.recommendations` (actionable fixes)
   - `details.thresholds_checked` (count)
   - `details.thresholds_passed` (count)

### Example Result

**FAIL Result**:
```json
{
  "passed": false,
  "severity": "blocking",
  "message": "❌ FAIL: Task T12.PoC.1 does not meet quality thresholds (50.0% passed, 2 failures)",
  "details": {
    "thresholds_checked": 4,
    "thresholds_passed": 2,
    "failures": [
      "R² = 0.45 < 0.50 (threshold for weather-sensitive models)",
      "Model doesn't beat all baselines: naive: 95.0% (need >110%)"
    ],
    "recommendations": [
      "Improve model to achieve R² > 0.50. Current: 0.450. World-class: > 0.60",
      "Improve model to beat all baselines by at least 10%"
    ]
  }
}
```

**PASS Result**:
```json
{
  "passed": true,
  "severity": "info",
  "message": "✅ PASS: Task T12.PoC.1 meets world-class quality standards (100.0% thresholds passed)",
  "details": {
    "thresholds_checked": 5,
    "thresholds_passed": 5,
    "failures": [],
    "recommendations": []
  }
}
```

---

## Testing

The critic is validated by comprehensive test suite: `src/critics/modeling_reality.test.ts`

**Test coverage**:
- ✅ R² threshold validation (weather-sensitive & non-sensitive)
- ✅ Negative R² detection
- ✅ Weather elasticity sign validation
- ✅ Elasticity mismatch detection
- ✅ Baseline comparison enforcement
- ✅ Missing baseline handling
- ✅ Overfitting detection
- ✅ MAPE constraint enforcement
- ✅ Non-modeling task skipping
- ✅ Error handling for missing/invalid reports
- ✅ Full validation flows (success & failure)

**Run tests**:
```bash
cd tools/wvo_mcp
npm test -- src/critics/modeling_reality.test.ts
```

---

## Task Exit Criteria Update

All ML modeling tasks must now include validation against ModelingReality thresholds:

### Task T-MLR-0.1 (This Task)
**Exit Criteria**:
1. ✅ ModelingRealityCritic integrated and tested
2. ✅ Comprehensive test suite created (20 tests, 100% pass)
3. ✅ Quantitative thresholds documented
4. ✅ Validation report format specified

### All ML Modeling Tasks (T12.*, T13.5.*, T-MLR-*)
**Updated exit criteria**:
1. Model training completed
2. Validation report generated with all required metrics
3. **ModelingReality critic PASSES all thresholds**
4. Weather elasticity validated and documented
5. Baseline comparison completed and documented

---

## World-Class Quality Standards

The ModelingReality critic enforces WeatherVane's commitment to excellence:

| Dimension | Standard |
|---|---|
| Explainability | R² > 0.50 (weather-sensitive), > 0.30 (baseline) |
| Directional accuracy | Weather elasticity signs correct |
| Signal capture | Model beats simple baselines |
| Generalization | No overfitting (val ≈ test R²) |
| Forecast accuracy | MAPE < 20% (where applicable) |
| Objective truth | No subjective judgment—failures are measurable |

---

## Next Steps

1. **T-MLR-0.2**: Update all ML task exit criteria with ModelingReality thresholds
2. **T-MLR-4.1**: Deploy ModelingReality_v2 critic to production orchestration
3. **Backfill validation reports** for existing T12.* and T13.5.* tasks

---

## Contact & Escalation

- **Questions about thresholds**: Review this spec and critic source code
- **Threshold adjustment requests**: File GitHub issue with business justification
- **Critic failures**: Check recommendations in output; escalate to AtlasAutopilot if stuck
