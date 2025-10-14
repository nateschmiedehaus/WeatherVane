# MCP Upgrade Bundle (E6 + E10) Execution Plan

## Purpose
Guide the joint delivery of **E6 – MCP Orchestrator Production Readiness** and **E10 – Usage-Based Optimisations** as a single upgrade programme. The bundle guarantees blue/green safeguards, coordinated rollouts, and a clean hand-off into PHASE‑5A optimisation work once the upgrade completes.

## Programme Structure
- **Bundle scope:** All milestones under E6 and the usage telemetry milestone under E10 (M10.1). Remaining E10 items stay parked until post-upgrade cost optimisation resumes.
- **Guardrail contract:** Uphold the Step 0–15 safety checks in `docs/MCP_ORCHESTRATOR.md#1113-tight-integration-playbook-steps-0-15`, with `runUpgradePreflight` gating each live attempt.
- **Sources of record:** `state/roadmap.yaml` for status, `experiments/mcp/upgrade` for artifacts, `state/telemetry/operations.jsonl` for budget telemetry.

## Delivery Phases
1. **Phase A – Readiness (complete)**
   - Integration, failover, quality, and persistence tests (T6.1.1–T6.1.4) green with artifacts under `tests/` and `experiments/mcp/`.
   - Telemetry summary (T6.3.2) generated at `state/telemetry/metrics_summary.json`.
   - Cost telemetry + budget alerts (T10.1.1) emitting into `state/telemetry/operations.jsonl`.
   - Upgrade preflight script validated (`experiments/mcp/upgrade/<ts>/preflight.json`).

2. **Phase B – Governance & Security (in flight)**
   - Credentials security audit playbook (`docs/SECURITY_AUDIT.md`) ready; execution blocked on security critic capability (T6.2.1).
   - Error recovery drills (T6.2.2) refreshed; schema validation and rate limiting tasks (T6.2.3–T6.2.4) remain upcoming.

3. **Phase C – Zero-Downtime Upgrade (pending)**
   - Live flag store, worker manager, dry-run worker entry, canary harness, and rollback automation (T6.4.x) staged for implementation.
   - PHASE‑5A items (batch queue, strict output validation, idempotency, telemetry spans) queue behind the successful canary cutover.

## Milestone Checklist
| Task | Status | Key Artifacts / Evidence |
| --- | --- | --- |
| T6.1.1 MCP server integration suite | ✅ done | `tests/test_mcp_tools.py`, `pytest tests/test_mcp_tools.py::test_mcp_tool_inventory_and_dry_run_parity` |
| T6.1.2 Provider failover testing | ✅ done | `experiments/mcp/failover_test.json`, `scripts/run_provider_failover_test.mjs` |
| T6.1.3 State persistence testing | ✅ done | `tests/test_state_persistence.py`, `critics_run: tests` |
| T6.1.4 Quality framework validation | ✅ done | `state/quality/assessment_log.json` |
| T6.3.2 Telemetry metrics summary | ✅ done | `shared/observability/telemetry_summary.py`, `state/telemetry/metrics_summary.json` |
| T10.1.1 Cost telemetry & budget alerts | ✅ done | `tools/wvo_mcp/src/orchestrator/operations_manager.ts`, `state/telemetry/operations.jsonl` |
| T6.2.1 Credential security audit | ⏳ blocked | `docs/SECURITY_AUDIT.md`, awaiting `critic: security` capability |
| T6.2.2 Error recovery testing | ✅ done | `experiments/mcp/error_recovery.json`, `scripts/run_error_recovery_test.mjs`, `npm run test --prefix tools/wvo_mcp` |
| T6.2.3 Schema validation enforcement | 🛤️ planned | Requires connector contract audit + `shared/contracts/*.schema.json` |
| T6.2.4 API rate limiting & backoff | 🛤️ planned | Upcoming `tests/test_rate_limiting.py` |
| T6.4.x Zero-downtime upgrade suite | 🛤️ planned | Flag store, worker manager, canary harness, rollback automation |

## Execution Runbook
1. **Preflight (repeatable)**
   - Ensure clean worktree (`git status --porcelain` empty).
   - Run `node tools/wvo_mcp/scripts/run_upgrade_preflight.mjs` (artifact in `experiments/mcp/upgrade/<ts>/preflight.json`).
   - Verify disk space ≥500 MB, Node/npm versions match manifest, sandbox tooling available.
2. **Canary Build**
   - Provision upgrade worktree via `scripts/mcp_safe_upgrade.sh`.
   - Build + run `npm run build --prefix tools/wvo_mcp`, execute targeted pytest & vitest suites.
3. **Shadow Validation**
   - Start DRY_RUN worker, execute health/plan/dispatch/tests/report self-check cycle.
   - Compare telemetry deltas between active and canary workers; require parity within guardrails.
4. **Promotion**
   - Switch traffic via WorkerManager, flip flags (`PROMPT_MODE`, `SANDBOX_MODE`, `SELECTIVE_TESTS`) sequentially.
   - Observe 10-minute run window; monitor `state/telemetry/operations.jsonl` and coordinator failover metrics.
5. **Rollback (automatic/manual)**
   - Triggered when error budget exceeds 5 % over 2 minutes or RSS watchdog trips.
   - `DISABLE_NEW` flag enforces legacy route; recorded in `experiments/mcp/upgrade/<ts>/report.json`.

## Roles & Ownership
- **Upgrade Lead:** Coordinate schedule, own canary decision, maintain artifacts.
- **Platform Engineer:** Implement T6.4.x tasks, maintain WorkerManager and flag store.
- **Security Steward:** Execute credential audit (T6.2.1) once `critic: security` unlocks.
- **Observability Owner:** Maintain telemetry summaries, budget alerts, and upgrade dashboards.

## Risks & Mitigations
- **Capability gating (critics/security):** Track via `plan_next` + capability profile; pre-stage audit evidence so critic can run immediately once unlocked.
- **Worktree drift:** Continue using `.clean_worktree/` for preflight rehearsals; document diffs before live attempt.
- **Telemetry regression post-upgrade:** Keep compact prompt mode behind flags until post-observation metrics stabilise.

## Next Actions
1. Clear security critic gate and execute credential audit (T6.2.1).
2. Schedule implementation sprint for T6.2.3–T6.2.4 (schema validation, rate limiting).
3. Finalise blue/green worker manager & flag store (T6.4.1–T6.4.4), integrating idempotent promotion logging.
4. Prepare rollout timeline linking canary cutover to PHASE‑5A optimisation window; share with stakeholders in STATUS.md.
