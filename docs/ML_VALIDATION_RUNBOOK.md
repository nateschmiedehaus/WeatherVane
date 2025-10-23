# ML Validation Runbook

**Status**: Draft v1.0 (T-MLR-3.2)  
**Maintainer**: Modeling & Validation Guild  
**Last Updated**: 2025-10-23

> Use this runbook to prove that every WeatherVane ML release is production
> worthy. Validation is evidence-driven; if any gate fails, file a defect instead
> of downgrading the requirement.

---

## 1. Purpose & Scope

- Codify end-to-end validation for Weather-Aware MMM and related elasticity
  models.
- Standardize evidence packages so critics, auditors, and downstream tasks (e.g.
  T-MLR-3.3) can replay results without tribal knowledge.
- Surface defects with actionable remediation plans and explicit exit criteria.

---

## 2. Principles

- **Truth over Task**: Validation must falsify bad models, not rubber-stamp
  them. Reference `docs/ML_QUALITY_STANDARDS.md` for non-negotiable metrics.
- **Reproducibility**: Every artifact ties back to a git commit, dataset hash,
  and random seed.
- **Comparative Proof**: Always benchmark against naive, seasonal, and linear
  baselines before claiming lift.
- **Failure Transparency**: Capture failing metrics with owner, root cause, and
  unblock plan; never hide gaps behind averages.

---

## 3. Required Evidence Package

| Artifact | Purpose | Location (relative) | Tooling/Source |
|---|---|---|---|
| `experiments/<epic>/validation_report.json` | Canonical metrics + pass/fail state | Generated per validation run | Py notebooks / CLI |
| `experiments/<epic>/baseline_metrics.json` | Naive, seasonal, linear baselines | `experiments/<epic>/` | `shared/modeling/baselines.py` |
| `experiments/<epic>/robustness_suite.log` | Stress/resilience outcomes | pytest, `tests/modeling/` | `pytest -m robustness` |
| `experiments/<epic>/fairness_report.json` | Disparity, bias, compliance checks | fairness notebook | `notebooks/fairness/*.ipynb` |
| `experiments/<epic>/model_card.md` | Narrative summary & limitations | Markdown | Manual + template |
| `storage/artifacts/feature_importance.csv` | Explainability audit | `apps/model/feature_analysis.py` | CLI |

> Update `state/context.md` with artifact pointers only; keep content in the
> evidence files listed above.

---

## 4. Pre-Validation Checklist

Run these checks before touching model code. Validation stops if any box fails.

- [ ] `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` (ensures critics see
      true test status)
- [ ] `make lint` (Python + TS hygiene)
- [ ] Data snapshot recorded (`data/snapshots/<yyyymmdd>` with checksum)
- [ ] Feature store sync verified (`make worker` warmup logs)
- [ ] Dependencies locked (`poetry.lock` / `package-lock.json` untouched during
      run)

Document results inside `experiments/<epic>/preflight_checklist.md`.

---

## 5. Validation Workflow

### Step 1 — Data Audit
1. Generate dataset card via `python shared/data_context/build_dataset_card.py`.
2. Inspect null rates, coverage, and schema drift; export to
   `experiments/<epic>/data_quality_report.json`.
3. Flag any blocker in `defects.md` (template in §7).

### Step 2 — Partition & Cross-Validation Plan
1. Reserve chronological holdout (last 10% of days) for final testing.
2. Configure 5-fold expanding-window CV (example in
   `docs/ML_VALIDATION_COMPLETE.md`).
3. Record fold boundaries in `validation_report.json -> folds`.

### Step 3 — Establish Baselines
1. Train naive, seasonal, and linear baselines (`python apps/model/train.py
   --baseline <type>`).
2. Capture metrics (R², MAPE, RMSE) in `baseline_metrics.json`.
3. Store command + git SHA in file header comment block.

### Step 4 — Train Candidate Model
1. Run training script with deterministic seeds (set `MODEL_SEED` env).
2. Log hyperparameters and data slice to `training_params.yaml`.
3. Upload intermediate checkpoints only to workspace storage (avoid git).

### Step 5 — Evaluate & Aggregate Metrics
1. Compute per-fold and aggregate metrics:
   - `mean_r2` ≥ 0.50 (production bar)
   - `validation_r2_gap` = |val - test| ≤ 0.10
   - `mape_improvement` vs all baselines ≥ 1.10
2. Record metric dictionary under `validation_report.json -> metrics`.

### Step 6 — Weather Elasticity Verification
1. Extract elasticity coefficients via `apps/model/elasticity.py`.
2. Assert directional expectations (see table in
   `docs/ML_QUALITY_STANDARDS.md#3-weather-elasticity-signs`).
3. Serialize to `validation_report.json -> elasticity_checks` with status and
   commentary.

### Step 7 — Robustness & Stress Tests
1. Run noise injection suite: `pytest tests/modeling/test_robustness.py -k noise`.
2. Run missing-data sweep: `pytest tests/modeling/test_robustness.py -k gap`.
3. Append deltas (`delta_r2`, `delta_mape`) to robustness log and copy summary
   into validation report.

### Step 8 — Responsible AI & Compliance
1. Execute fairness notebook (`jupyter nbconvert --execute
   notebooks/fairness/weather_fairness.ipynb`).
2. Verify uplift gaps ≤5pp and document mitigations if breached.
3. Run privacy scan (`python shared/security/privacy_scan.py
   experiments/<epic>`) and attach results.

### Step 9 — Reproducibility & Traceability
1. Hash training dataset (`sha256sum data/snapshots/<...>.parquet`).
2. Record git commit, environment versions (`pip freeze > requirements.freeze`).
3. Update `model_card.md` with reproducibility section referencing artifacts.

### Step 10 — Package & Publish
1. Assemble evidence list in `experiments/<epic>/README.md`:
   - Commands executed
   - Artifacts generated
   - Metric highlights & blockers
2. Notify critics (`tools/wvo_mcp/scripts/run_critics.py modeling_reality_v2`)
   and attach `validation_report.json`.
3. File completion note for downstream task (T-MLR-3.3) with artifact paths.

---

## 6. Validation Gates & Thresholds

| Gate | Pass Criteria | Evidence | Failure Action |
|---|---|---|---|
| **Data Integrity** | Coverage ≥95%, nulls ≤0.5%, 0 schema violations | `data_quality_report.json` | Block release; assign to Data Quality squad |
| **Model Performance** | `mean_r2` ≥0.50, `pass_rate` ≥80%, `mape_improvement` ≥1.10 | `validation_report.json` | File defect; rerun feature engineering or retraining |
| **Generalization** | `validation_vs_test_gap` ≤0.10, fold std ≤0.15 | `validation_report.json` | Increase regularization / adjust folds |
| **Weather Signal** | Expected coefficient signs, elasticity magnitude >0.2 where applicable | `elasticity_checks` | Investigate features; escalate to Atlas if domain assumption broken |
| **Robustness** | Stress deltas within thresholds (`ΔR² ≤0.05`, `ΔMAPE ≤0.02`) | `robustness_suite.log` | Tune model or add guardrails |
| **Responsible AI** | Uplift gap ≤5pp, zero privacy findings | `fairness_report.json`, `privacy_scan.log` | Engage Responsible AI review board |

Mixed results require explicit waiver from Product + Modeling leads; document
decision trail in `defects.md`.

---

## 7. Defect Logging Template

Create `experiments/<epic>/defects.md` when any gate fails. Copy block below per
issue and keep status updated.

```
### DEFECT: <short_name>
- **Gate**: (e.g., Model Performance)
- **Metric Breach**: mean_r2 = 0.43 (threshold ≥ 0.50)
- **Scope**: tenants=20 (worst=none_kitchen)
- **Root Cause (hypothesis)**: Weather-insensitive category + insufficient media features
- **Assigned To**: Owner @handle
- **Remediation Plan**:
  1. Add channel saturation features
  2. Increase CV folds to 7 for stability check
  3. Recompute baselines post-change
- **Exit Criteria**:
  - mean_r2 ≥ 0.52 across updated tenants
  - pass_rate ≥ 85%
  - elasticity_checks validated for affected tenants
- **Target Date**: 2025-10-25
- **Status**: OPEN
```

Link every defect to corresponding Jira/GitHub issue. Close only after metrics
re-validated and artifacts refreshed.

---

## 8. Exit Criteria for Validation Sign-Off

Validation is **DONE** only when all boxes are checked:

- [ ] All gates in §6 pass, or waivers documented with sign-off.
- [ ] Evidence package uploaded and referenced in `experiments/<epic>/README.md`.
- [ ] `validation_report.json` consumed by `modeling_reality_v2` critic without
      failures.
- [ ] Defect log empty or all items marked CLOSED with updated metrics.
- [ ] Hand-off summary sent (email/Slack) linking artifacts and noting open
      risks.

---

## 9. Hand-Off to T-MLR-3.3 (Evidence Packaging)

To unblock T-MLR-3.3, deliver:

1. `experiments/<epic>/README.md` summarizing validation scope, metrics, and
   remaining risks.
2. Archive bundle (`tar.gz`) containing all artifacts from §3 (store in
   `storage/artifacts/<epic>/validation_bundle_<yyyymmdd>.tar.gz`).
3. Sign-off message including:
   - Validation verdict (PASS/FAIL with rationale)
   - Links to defect tickets (if any)
   - Checklist confirmation from §8

The packaging task should not reconstruct evidence—provide everything here.

---

## 10. Appendix — `validation_report.json` Schema (Excerpt)

```json
{
  "model": {
    "name": "weather_mmm_v2",
    "git_commit": "abc1234",
    "data_snapshot": "2025-10-22_synth_v2",
    "seed": 42
  },
  "metrics": {
    "mean_r2": 0.6245,
    "pass_rate": 0.90,
    "mape_improvement": {
      "vs_naive": 1.57,
      "vs_seasonal": 1.29,
      "vs_linear": 1.14
    },
    "validation_vs_test_gap": 0.04,
    "fold_std": 0.0145
  },
  "elasticity_checks": [
    {
      "tenant": "extreme_cooling",
      "temperature_beta": 2.10,
      "expected_direction": "positive",
      "status": "PASS",
      "notes": "Warmer -> higher demand (aligned)"
    }
  ],
  "robustness": {
    "missing_weeks_delta_r2": 0.03,
    "noise_injection_delta_mape": 0.015
  },
  "fairness": {
    "uplift_gap_pp": 3.2,
    "status": "PASS"
  },
  "claims_verified": {
    "ready_for_production": true,
    "weather_signal_detected": true
  }
}
```

Keep schema immutable without updating this runbook and the ModelingReality
critic.

---

## 11. Contacts & Escalation

- **Modeling Reality Critic Owner**: modeling-reality@weathervane.ai
- **Atlas (Strategic Guidance)**: atlas@weathervane.ai (escalate structural
  blockers)
- **Director Dana (Consensus follow-up)**: dana@weathervane.ai
- **Responsible AI Review Board**: responsible-ai@weathervane.ai

Escalate policy or scope questions before proceeding; tactical execution resumes
after guidance is received.

