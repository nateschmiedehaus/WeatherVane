# Validation Defects — MMM v2

### DEFECT: low_r2_across_tenants
- **Gate:** Model Performance
- **Metric Breach:** mean_r2 = 0.075 (threshold ≥ 0.50)
- **Scope:** tenants=4 (all failing)
- **Root Cause (hypothesis):** Synthetic data inaccuracies + insufficient feature set
- **Assigned To:** Atlas
- **Remediation Plan:**
  1. Complete T-MLR-1.* synthetic data fixes.
  2. Retrain MMM with corrected data and feature set (T-MLR-2.*).
  3. Regenerate validation report and rerun ModelingReality_v2 critic.
- **Exit Criteria:** mean_r2 ≥ 0.50; tenants_passing = 4; elasticity error ≤ 10%.
- **Target Date:** 2025-11-15
- **Status:** OPEN

### DEFECT: missing_baseline_metrics
- **Gate:** Comparative Proof
- **Metric Breach:** Baseline metrics absent
- **Scope:** All tenants (no baseline comparison)
- **Root Cause (hypothesis):** Baseline scripts not executed during T-MLR-3.2 cycle
- **Assigned To:** Modeling & Validation Guild
- **Remediation Plan:**
  1. Run baseline training scripts per runbook.
  2. Populate `baseline_metrics.json` with metrics and improvement deltas.
  3. Verify ModelingReality_v2 critic ingests baseline artifact successfully.
- **Exit Criteria:** Baseline metrics recorded; mape_improvement ≥ 1.10 vs all baselines.
- **Target Date:** 2025-11-01
- **Status:** OPEN

