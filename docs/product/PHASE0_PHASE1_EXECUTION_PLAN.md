# Phase 0–1 Execution & Modeling Sprint Plan

Prepared: 2025-10-20  
Author: Codex (standing in for Autopilot coordination)

This document operationalises the user directive to unblock early product value, ensure modeling upgrades begin immediately, and keep demo proofs aligned. It consolidates owners, deliverables, telemetry, and handoff expectations so Autopilot and human teams can execute without further prompting.

---

## 1. Phase 0 Strike Team (Measurement & Confidence)

**Objective:** Demonstrably prove lift and confidence so Phase 0 exit criteria flip to ✅ this week.

| Workstream | Lead | Supporting | Deliverables | Evidence / Telemetry |
|------------|------|------------|--------------|----------------------|
| Geo holdout plumbing | Autopilot Engine (worker queue) | Data Platform | Nightly job wiring `apps/validation/incrementality.py` into ingestion runs; persisted assignments under `state/analytics/experiments/geo_holdouts/*.json`. | Job logs in `state/telemetry/experiments/geo_holdout_runs.jsonl`; updated assignment artifacts. |
| Lift & confidence surfaces | Apps/API squad | Apps/Web squad | Plan API surfaces experiment payloads and quantile coverage; Plan UI renders lift/confidence cards + download. | API schema diff (`apps/api/schemas/plan.py`), UI screenshots, `npm --prefix apps/web run test -- --run plan-lift-cards`. |
| Forecast calibration report | Modeling squad | Observability | Quantile calibration metrics stored in `/calibration`, summary published to `docs/modeling/forecast_calibration_report.md`. | `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` including calibration suite; artifacts under `state/telemetry/calibration/*.json`. |

**Milestones**
- M0.1 (D1): Geo holdout job live & artifacts persisted.
- M0.2 (D2): Plan API/UI cards merged with tests.
- M0.3 (D3): Calibration rerun + report published, exit criteria reviewed.

---

## 2. Phase 1 Experience Delivery (Scenario + Onboarding)

**Objective:** Ship scenario exploration, storytelling overlays, exports, and live onboarding wiring with design sign-off before implementation.

| Workstream | Web Owner | API Owner | Design Partner | Deliverables |
|------------|-----------|-----------|----------------|--------------|
| Scenario builder MVP | Priya (Front-end) | Leo (API) | Aria | `apps/web/src/pages/scenarios.tsx` interactive flows; API endpoints for scenario snapshots; storybook coverage. |
| Visual overlays & exports | Priya | Leo | Aria | Map + chart overlays, export service (PPT/CSV). Testing via `npm --prefix apps/web run test -- --run scenario-exports`. |
| Onboarding progress API | Priya (front integration) | Sam (FastAPI) | Aria | Implement plan from `docs/DEMO_ONBOARDING_WIRING_PLAN.md`; register `GET/POST /onboarding/progress` routes; telemetry instrumentation. |

**Process**
1. **Design review (D0-D1):** Schedule walkthroughs before code; record outcomes in `docs/product/design_reviews/phase1_scenarios.md`.
2. **Implementation (D1-D4):** Parallel web/API development with shared fixtures.
3. **QA & critics (D4-D5):** Run `npm --prefix apps/web run lint && test`, `bash tools/wvo_mcp/scripts/run_integrity_tests.sh`, gather screenshots for exec review.

---

## 3. Modeling Upgrade Sprint (LightweightMMM + Feature Backfills)

**Objective:** Replace heuristic MMM with LightweightMMM, expand weather feature coverage, and align demo tooling with production grain selection.

| Track | Owner | Key Tasks | Evidence |
|-------|-------|-----------|----------|
| LightweightMMM integration | Modeling squad | Swap `apps/model/mmm.py` implementation, configure adstock/saturation, log metadata in `state/models_registry.json`. | Pytest `tests/model/test_mmm_lightweight.py`, calibration diffs. |
| Feature & signal backfill | Data Platform | Close gaps from `docs/MODELING_FEATURE_CATALOG.md` (pacing, price rules, inventory, customer mix, AQI, pollen, holidays, macro, experiments). | Updated `config/model_feature_catalog.yaml`; ingestion job logs. |
| Demo alignment | Autopilot Engine + Solutions | After each model iteration run `make demo-plan` and `make demo-ml`; drop outputs to `state/artifacts/demos/<tenant>/`. | Command logs, artifacts, `SUMMARY.md` per demo run. |

**Sprint Cadence**
- Daily: Run `pytest tests/model/test_model_pipeline.py` & calibration pipeline; append metrics to `state/telemetry/calibration/history.jsonl`.
- Every Iteration: Trigger demo regeneration, capture proof-of-concept summary for sales deck.
- Sprint End: Publish `docs/modeling/lightweightmmm_rollout_report.md` with results, outstanding risks, next steps.

---

## Coordination & Tracking

- **Autopilot Hooks:** Added to `state/context.md` “Autopilot Trigger” and “Next Actions” sections; automation loop reads tasks on startup.
- **Status Updates:** After each milestone, append snippets to `state/context.md` > Recent Updates and log structured events in `autopilot_events.jsonl`.
- **Critic Coverage:** Ensure `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` and relevant web/model test suites run post-merge. Attach outputs to critic dashboard.

---

## Immediate Actions

1. Create strike team Slack/Atlas channel (`#phase0-strike`) and assign Autopilot to post nightly status from calibration job (handled by automation service, no manual action required here).
2. Schedule design reviews via existing product calendar (placeholder entry logged by Autopilot; see `docs/product/design_reviews/phase1_scenarios.md` once generated).
3. Kick off modeling sprint by running the baseline smoke tests (`make demo-ml`, `pytest tests/model/test_model_pipeline.py`) and logging results; Autopilot to continue iterating with LightweightMMM branch work.

Document to be updated as milestones complete.

> **Execution note (2025-10-20T14:05Z):** Initial `make demo-ml` invocation segfaulted in the current sandbox; Autopilot to rerun with dependency verification (and escalate if needed) before marking M0.3 complete.
