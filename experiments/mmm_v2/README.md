# MMM v2 Validation Evidence Package

This folder collects the reproducible evidence generated to date for the MMM v2 remediation effort (T-MLR milestone 3). It consolidates raw artifacts, documentation, and known gaps so reviewers can assess model readiness without rerunning notebooks.

## Current Verdict
- **Validation Status:** FAIL (mean R² = 0.075; 0/4 tenants ≥ 0.50 threshold)
- **Elasticity Quality:** All tenants exceed 900% error vs. ground truth; directional failures observed
- **Robustness Suite:** 23/23 robustness checks passed (`experiments/mmm_v2/robustness_report.json`)
- **Baseline Comparisons:** Not yet produced; blocker for ModelingReality_v2 critic sign-off
- **Fairness & Privacy:** Not executed; must be added before promotion

## Artifact Index
| Artifact | Purpose | Status |
| --- | --- | --- |
| `validation_report.json` | Aggregated metrics vs. production gates | ❌ Thresholds unmet (R², elasticity) |
| `storage/artifacts/validation_report.json` | Raw per-tenant elasticity evaluation | ❌ Illustrates magnitude of misses |
| `robustness_report.json` | Structured results for robustness suite | ✅ 23/23 tests passing |
| `robustness_suite.log` | Human-readable robustness highlights | ✅ Generated from robustness report |
| `baseline_metrics.json` | Naive/seasonal/linear baselines | ⏳ Not computed (must run baselines) |
| `fairness_report.json` | Responsible AI checks (uplift gaps, privacy) | ⏳ Not executed |
| `model_card.md` | Narrative summary, limitations, next steps | ✅ Drafted with outstanding gaps |
| `feature_importance.csv` | Explainability audit snapshot | ⏳ Placeholder; rerun feature importance to populate |
| `validation_notebook.ipynb` / `.html` | Source notebook for validation workflow | ✅ Stored for reproducibility |
| `docs/ML_VALIDATION_GUIDE.md` | Detailed validation manual (T-MLR-3.2) | ✅ Included in bundle |
| `docs/T-MLR-3.2_COMPLETION_REPORT.md` | Provenance and directive compliance | ✅ Included in bundle |

## Outstanding Work Before T-MLR-4.1
1. Re-run training with remediation fixes (T-MLR-2.*) to achieve ≥0.50 R² across tenants.
2. Generate baseline metrics and integrate into `baseline_metrics.json`.
3. Execute fairness, privacy, and feature-importance analyses.
4. Update this package with refreshed artifacts and rerun ModelingReality_v2 critic.

## How to Reproduce
1. Follow `docs/ML_VALIDATION_RUNBOOK.md` sections 4-10.
2. Execute the validation notebook: `jupyter nbconvert --execute experiments/mmm_v2/validation_notebook.ipynb`.
3. Run robustness tests: `pytest tests/modeling/test_mmm_robustness.py`.
4. After remediation, update artifacts and regenerate the tarball via `python scripts/package_evidence.py mmm_v2` (script pending).

## Review Checklist
- [ ] Confirm archive integrity (`tar -tzf storage/artifacts/mmm_v2/validation_bundle_*.tar.gz`).
- [ ] Inspect `validation_report.json` for metrics ≥ thresholds.
- [ ] Verify baseline and fairness artifacts are present and current.
- [ ] Log defects in `experiments/mmm_v2/defects.md` for any remaining failures.
- [ ] Send sign-off summary referencing artifact paths once gates pass.

