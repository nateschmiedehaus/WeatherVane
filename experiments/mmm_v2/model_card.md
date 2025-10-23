# Model Card — MMM v2 (Weather-Aware)

## Overview
- **Owner:** Modeling & Validation Guild
- **Objective:** Measure weather elasticity for paid media optimization across 4 demo tenants.
- **Version:** Prototype snapshot prior to remediation (T-MLR-3 series).
- **Data Snapshot:** Synthetic dataset `2025-10-22_synth_v2` (366 daily rows per tenant).

## Intended Use
Provide directional guidance on weather-driven demand shifts to inform ROAS optimization. Not safe for automated budget allocation until validation gates pass.

## Performance Summary
| Metric | Result | Target | Status |
| --- | --- | --- | --- |
| Mean R² (across tenants) | 0.075 | ≥ 0.50 | ❌ |
| Tenants ≥0.50 R² | 0 / 4 | 4 / 4 | ❌ |
| Temperature elasticity error | 900%–1900% | ≤ 10% | ❌ |
| Precipitation elasticity error | 1011%–3233% | ≤ 10% | ❌ |
| Robustness suite | 23 / 23 passed | 100% | ✅ |

## Data & Training
- **Features:** Media spend channels, temperature, precipitation, seasonal controls
- **Label:** Daily revenue
- **Model:** Ridge regression with adstock/saturation transformations
- **Training Procedure:** Leave-one-tenant-out evaluation; deterministic seed not enforced during this run

## Limitations
1. Underfits across all tenants; fails to detect true weather signal.
2. Elasticity magnitude wildly misaligned with ground truth.
3. Baseline comparisons, fairness, and privacy audits missing.
4. Feature importance analysis pending.

## Ethical Considerations
- Fairness metrics absent; risk of unequal uplift across tenants.
- Without baseline comparison, decisions may overstate weather contribution.

## Next Actions
1. Fix synthetic data generator (T-MLR-1.*) and retrain models (T-MLR-2.*).
2. Populate baseline, fairness, feature-importance artifacts.
3. Re-run validation notebook and update this model card with refreshed metrics.
4. Submit to ModelingReality_v2 critic once production thresholds are satisfied.

