# WeatherVane Status Digest
_Generated: 2025-10-21T07:49:08.874Z (profile: high)_

## Recent Context Highlights
## context

## Current Focus
- Phase 0 strike team executing lift proof: geo holdout plumbing, plan UI lift/confidence cards, and forecast calibration report per `docs/product/PHASE0_PHASE1_EXECUTION_PLAN.md`.
- Phase 1 decision-support build: scenario builder MVP, storytelling overlays/exports, onboarding API integration with design reviews scheduled pre-implementation.
- Modeling upgrade sprint underway: LightweightMMM integration, feature backfills, calibration telemetry, and automated demo regeneration (`make demo-plan`, `make demo-ml`).
- Data platform closing feature catalog gaps (pacing diagnostics, price rules, inventory, customer mix, AQI, pollen, holidays, macro, experiments) to unblock modeling and demos.

## Status
- Clarification: “Automations” in the WeatherVane product refers to customer-facing UX/ad automation features, not the Autopilot orchestrator. Autopilot workstreams must remain disconnected from Automations UI/guardrail tasks.
- Integrity suite still red on `tools/wvo_mcp/src/utils/device_profile.test.ts` (expects ≥4 workers, current profile yields 3); Atlas + Director Dana coordinating fix.
- Demo onboarding wiring blueprint published; progress hook now aborts stale fetches and logs asynchronously to trim UI waits.
- Base calibration artifacts stale; strike team accountable for regenerating and publishing updated report this sprint.
- Data-quality guardrail research shipped; awaiting richer tenant telemetry to finalize critic gating.

## Autopilot Directives
- Stand down from Automations UI, guardrail, or “Autopilot readiness” tasks—those belong to product UX/ad automation and are out of scope for the orchestrator.
- Focus orchestration energy on Phase 0/1 product delivery, modeling verification, and data feature backfills as outlined below.
- Do not create or update roadmap items that reference Automations readiness, guardrail telemetry refresh, or Autopilot enablement without explicit operator approval.

## Recent Updates
- 2025-10-21T07:35Z: Added repository-wide `make typecheck` target invoking `tsc --noEmit` for WeatherOps and MCP server packages so the typecheck critic runs without manual chaining; verified via `make typecheck`.
- 2025-10-21T07:20Z: Allocator critic hot path now relies on per-index ROI caches and allocation snapshots, trimming high-profile suite runtime from ~6.5s to ~3.2s (`node tools/wvo_mcp/scripts/run_allocator_checks.mjs high`). Cached evaluation stats still surface in diagnostics for tests.
- 2025-10-21T07:15Z: Build critic passes again after trimming unused optimizer result, stale imports, and Polars boolean comparisons; verified with `make lint` and `./critics_run '{"critics":["build"],"profile":"high"}'`.
- 2025-10-21T07:06Z: Restored security critic by wiring `make security` to a new repository secret scanner (`tools/security/run_security_checks.py`) that ignores sandbox credential fixtures, added pytest coverage in `tests/security/test_run_security_checks.py`, and updated the security audit doc. Verified via `make security` and `./critics_run '{"critics":["security"],"profile":"high"}'` producing a clean pass.
- 2025-10-21T06:24Z: Allocator critic now caches full evaluation payloads per spend vector so projected-gradient, coordinate, and fallback solvers hit a shared store instead of recomputing scenario profits/penalties. Diagnostics expose hit/miss entry counts and pytest coverage exercises the new metrics (`PYTHONPATH=.deps:. pytest tests/test_allocator.py`). Cache stats stay aligned with ROI revenue caching and ensure the critic reports deterministic evaluation counts for performance tracking.
- 2025-10-21T06:06Z: Allocator heuristic now memoises per-cell ROI interpolations and records cache diagnostics so critic sweeps stop repeating expensive curve lookups (`apps/allocator/heuristics.py`). Added pytest coverage asserting cache reuse metrics (`tests/test_allocator.py::test_allocator_revenue_cache_tracks_reuse`) and ran `PYTHONPATH=.deps:. pytest tests/test_allocator.py`. Integrity batch remains red from the known Polars duplicate rename guardrail in the POC flow (`bash tools/wvo_mcp/scripts/run_integrity_tests.sh`).
- 2025-10-21T06:01Z: Plan hero now surfaces projected lift (p50) alongside guardrail confidence and ROI, and operators can export plan slices as CSV for offline audit (`apps/web/src/lib/plan-insights.ts`, `PlanDownloadButton`). Added vitest coverage for lift aggregation + CSV serialization and component wiring (`npm --prefix apps/web run test -- --run src/lib/__tests__/plan-insights.test.ts src/lib/__tests__/plan-export.test.ts src/components/__tests__/PlanDownloadButton.test.tsx`).
- 2025-10-21T05:44Z: Streamlined allocator scenario profit evaluation by caching learning baselines and reusing aggregated revenue totals per quantile slice, keeping critic runtime stable under dense coordinate-ascent sweeps (`apps/allocator/heuristics.py`). Added regression coverage to assert scenario profits and weighted blends stay in sync with final revenue (`tests/test_allocator.py::test_allocator_quantile_profits_reflect_total_revenue`; `PYTHONPATH=.deps:. pytest tests/test_allocator.py`).
- 2025-10-21T05:07Z: Optimised allocator inventory penalty to reuse cached ROI revenues, shaves redundant curve interpolations and keeps critic runtime flat under inventory constraints (`apps/allocator/heuristics.py`, `tests/test_allocator.py::test_allocator_inventory_penalty_reuses_cached_revenue`; `PYTHONPATH=.deps:. pytest tests/test_allocator.py`).
- 2025-10-21T03:55Z: Automations change log now renders trust narrative during initial load, added Playwright coverage (`npm --prefix apps/web run test:ui -- automations-trust.spec.ts --project=chromium-desktop`) and Vitest guard (`npm --prefix apps/web run test -- --run tests/web/automation_trust.spec.ts`), documented schema in `docs/automation_change_log_schema.md`.
- 2025-10-21T03:32Z: Automations change log filters now foreground pending approvals by default while offering one-click pivots to shipped and rehearsal entries; helper coverage verifies the new filter heuristics and Vitest guards the trust narrative (`apps/web/src/components/AutomationAuditList.tsx`, `automationTrust.ts`, CSS, `tests/web/automation_trust.spec.ts`, `docs/automation_audit_evidence.md`; `npm --prefix apps/web run test -- --run tests/web/automation_trust.spec.ts`).
- 2025-10-21T03:24Z: Dynamic staffing telemetry now ships end-to-end—FastAPI publishes `/v1/operations/orchestration-metrics`, WeatherOps renders the new staffing telemetry panel, and consensus history/token budgets/escalation signals are live-tested (`PYTHONPATH=.deps:. pytest tests/api/test_operations_orchestration_metrics.py tests/apps/api/test_orchestration_metrics_service.py`; `npm --prefix apps/web run test -- --run src/lib/__tests__/staffing-telemetry.test.ts src/components/__tests__/StaffingTelemetryPanel.test.tsx`).
- 2025-10-21T02:55Z: Surfaced hierarchical consensus telemetry in-product via `/v1/operations/consensus` (FastAPI service + WeatherOps dashboard card). Unit + UI coverage added (`PYTHONPATH=.deps:. pytest tests/api/test_operations_consensus.py tests/apps/api/test_consensus_service.py`; `npm --prefix apps/web run test -- --run src/lib/__tests__/operations-insights.test.ts src/components/__tests__/ConsensusSummaryCard.test.tsx`). Consolidated integrity sweep still fails on the known Polars duplicate rename in the POC flow (`bash tools/wvo_mcp/scripts/run_integrity_tests.sh`), matching the pre-existing blocker logged for Director Dana.

_Trimmed for token efficiency (startup); full history preserved in `state/backups/context/context-2025-10-21T07-28-24-510Z.md`._

## Next Actions (Product Delivery)
1. Finalise Phase 0 lift/confidence UI and publish calibration outputs in `state/telemetry/calibration/` with updated report links.
2. Kick off Phase 1 scenario builder delivery (web + API), documenting design review outcomes in `docs/product/design_reviews/phase1_scenarios.md`.
3. Run the LightweightMMM integration loop (`make demo-ml`, `pytest tests/model/test_model_pipeline.py`) and refresh demo artifacts in `state/artifacts/demos/`.
4. Close high-priority data feature catalog gaps (pacing diagnostics, price rules, inventory signals) and sync updates in `config/model_feature_catalog.yaml` plus related docs.

## Autopilot Trigger
- Modeling sprint commands are mandatory post-merge: `make demo-ml` and `pytest tests/model/test_model_pipeline.py` with calibration metrics stored under `state/telemetry/calibration/`.
- After every model iteration, run `make demo-plan DEMO_TENANT=<target>` and archive outputs in `state/artifacts/demos/<tenant>/` for sales/demo readiness.

## Worklog Notes
- Continue running `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` after substantive changes and share results with Director Dana.
- Log strike team milestones and modeling telemetry in `autopilot_events.jsonl` for traceability.

## Autopilot Status Update (2025-10-20T14:10Z)
- Autopilot task loop restarted against updated context; Phase 0 strike team, Phase 1 experience build, and modeling sprint queued as immediate work items.

## Roadmap Snapshot (truncated)
```yaml
epics:
  - id: E-GENERAL
    title: E-GENERAL
    status: pending
    domain: product
    milestones:
      - id: E-GENERAL-backlog
        title: Backlog
        status: pending
        tasks:
          - id: CRIT-PERF-ALLOCATOR-bc8604
            title: "[Critic:allocator] Restore performance"
            status: done
            dependencies: []
            exit_criteria: []
            domain: product
            description: >-
              Critic allocator is underperforming and needs immediate
              remediation.


              Identity: Allocator Sentinel (operations, authority advisory)

              Mission: Ensure planner allocation and task routing stay optimal.

              Signature powers: Diagnoses misrouted tasks and capacity
              imbalances.; Suggests rebalancing across agents and squads.

              Autonomy guidance: Auto-adjust planner weights when safe; escalate
              persistent misallocations to Autopilot.


              Critic allocator failed 8 of the last 10 runs with 0 consecutive
              failures.


              Observation window: 10 runs


              Consecutive failures: 0


              Failures: 8 | Successes: 2


              Assigned to: Autopilot


              Expectations:

              - Diagnose root causes for the critic's repeated failures.

              - Patch critic configuration, training data, or underlying
              automation as needed.

              - Document findings in state/context.md and roadmap notes.

              - Close this task once the critic passes reliably.


              Latest output snippet:

              ============================= test session starts
              ==============================

              platform darwin -- Python 3.10.12, pytest-8.4.2, pluggy-1.6.0

              rootdir:
              /Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane

              configfile: pyproject.toml

              plugins: anyio-3.7.1, asyncio-1.2.0

              asyncio: mode=strict, debug=False,
              asyncio_default_fixture_loop_scope=None,
              asyncio_default_test_loop_scope=function

              collected 5 items


              tests/test_allocator_routes.py
              ..                                        [ 40%]

              tests/test_creative_route.py
              .                                           [ 60%]

              tests/apps/model/test_cre...
          - id: CRIT-PERF-BUILD-958e1f
            title: "[Critic:build] Restore performance"
            status: done
            dependencies: []
            exit_criteria: []
            domain: product
            description: >-
              Critic build is underperforming and needs immediate remediation.


              Identity: Build Sentinel (engineering, authority blocking)

              Mission: Guarantee that core build processes remain reproducible
              and optimized across environments.

              Signature powers: Diagnoses build pipeline regressions and
              unstable toolchains.; Flags missing build artifacts or
              misconfigured dependencies before release.

              Autonomy guidance: Attempt automated patching of build scripts
              when safe; escalate infrastructure escalations beyond local fixes.


              Critic build failed 5 of the last 6 runs with 0 consecutive
              failures.


              Observation window: 6 runs


              Consecutive failures: 0


              Failures: 5 | Successes: 1


              Assigned to: Autopilot


              Expectations:

              - Diagnose root causes for the critic's repeated failures.

              - Patch critic configuration, training data, or underlying
              automation as needed.

              - Document findings in state/context.md and roadmap notes.

              - Close this task once the critic passes reliably.


              Latest output snippet:

              warning: The top-level linter settings are deprecated in favour of
              their counterparts in the `lint` section. Please update the
              following options in `pyproject.toml`:
                - 'select' -> 'lint.select'
          - id: CRIT-PERF-DESIGNSYSTEM-1a886a
            title: "[Critic:designsystem] Restore performance"
            status: done
            dependencies: []
            exit_criteria: []
            domain: product
            description: >-
              Critic designsystem is underperforming and needs immediate
              remediation.


              Identity: Design System (design_system, authority advisory)

              Mission: Safeguard design_system discipline.

              Signature powers: Reports on findings when configuration is
              missing.


              No successful runs recorded in the last 9 observations; 5
              consecutive failures detected.


              Observation window: 9 runs


              Consecutive failures: 5


              Failures: 6 | Successes: 3


              Assigned to: Director Dana


              Expectations:

              - Diagnose root causes for the critic's repeated failures.

              - Patch critic configuration, training data, or underlying
              automation as needed.

              - Document findings in state/context.md and roadmap notes.

              - Close this task once the critic passes reliably.


              Latest output snippet:

              ./src/pages/dashboard.tsx

              968:14  Error: Parsing error: ')' expected.


              info  - Need to disable some ESLint rules? Learn more here:
```
