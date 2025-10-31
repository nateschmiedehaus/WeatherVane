# Specification — FIX-PERF-QualityChecks (Rev 2)

## Objective
Replace the heavyweight bash preflight with a change-aware TypeScript runner so WorkProcessQualityIntegration can enforce preflight in <30 s p95 without sacrificing safety. Deliver a unified CLI, scope detection, tuned timeouts, updated benchmarks, and refreshed documentation.

## Deliverables
1. **Preflight CLI (`tools/wvo_mcp/src/scripts/preflight.ts`)**
   - ts-node entrypoint that wraps `PreflightRunner`.
   - Accepts `--task`, `--source`, `--full`, `--json <path>`; outputs structured JSON + human-readable summary.
   - Returns non-zero on failure and conveys escalation signal used by WorkProcessEnforcer.
2. **Shell compatibility layer**
   - `scripts/preflight_check.sh` delegates to the CLI (maintain existing flags).
   - `DEFAULT_QUALITY_CHECK_CONFIG.preflight.scriptPath` points to `node --import tsx .../preflight.ts`.
3. **Scope detection + command matrix**
   - Inspect git status/diff to classify changes into buckets (`python`, `frontend`, `autopilot-core`).
   - Skip commands whose bucket is untouched; operators can force the legacy full suite via `--full` when needed.
   - Default command set:
     - Python → `python -m ruff check ... --exit-zero` (records findings without blocking).
     - Frontend → `npm --prefix apps/web run lint` + `npm --prefix apps/web run typecheck -- --pretty false`.
     - Autopilot → `npm --prefix tools/wvo_mcp run test -- orchestrator/__tests__/work_process_enforcement.test.ts`.
     - Safety guard to ensure dependencies installed (`npm install` not rerun; fail with actionable message if missing).
4. **Timeout + telemetry updates**
   - Preflight default timeout reduced to ≤25 s buffer above measured p95.
   - MetricsCollector receives new tags (`preflight_scope`, `preflight_mode`) for perf regressions.
   - Cache TTL remains but now keys off CLI signature (command ids + git hash + scope).
5. **Evidence & docs**
   - Benchmark harness rerun on clean workspace + cached workspace; store JSON/MD in `state/evidence/.../verify/`.
   - Update `state/evidence/.../verify/results.md` with new commands, runtimes, and timeout rationale.
   - Documentation updates: WORK_PROCESS quality integration section, TROUBLESHOOTING, and CLAUDE.md mention CLI usage and full-mode override.

## Acceptance Criteria
1. `node --import tsx tools/wvo_mcp/src/scripts/preflight.ts --status --task T-DUMMY` completes <30 s on a clean cached workspace; benchmark evidence proves p95 <30 s.
2. WorkProcessQualityIntegration uses the CLI (observed via logs/telemetry); caching still functions (unit tests assert cache hit/miss for preflight).
3. Scope detection logic covered by new unit tests (mock git diff/status) verifying correct command selection and that CLI `--full` forces the heavy path.
4. Legacy shell usage remains supported (manual run prints summary, writes JSON report).
5. All verification commands (build, targeted tests, determinism, structural policy, risk-oracle, performance regression) pass with updated tooling.

## Non-Negotiables / Safety
- Operators can force the full suite with `--full`; scoped mode remains the default even for large diffs, but cache is still disabled for dirty workspaces.
- Cache must ignore results when workspace dirty for relevant paths.
- CLI must propagate stdio output for debugging and write report JSON to deterministic location (`state/automation/preflight_report.json`).
- No regression in enforcement accuracy: if any scoped command fails, CLI exits non-zero and WorkProcessEnforcer treats it as blocking unless fail-safe mode is active.
