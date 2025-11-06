# Plan — AFP-PROOF-DRIVEN-GAMIFICATION-20251106-REDO

## Architecture / Approach
- Add targeted Vitest suites for the proof stack and Wave 0 integration.
- Harden `ProofIntegration` + gamification wiring if tests expose gaps.
- Introduce a synthetic roadmap validation task executed during VERIFY.
- Capture evidence artifacts (verify.md, telemetry JSONL, audit summary).

## Files to Change
- `tools/wvo_mcp/src/prove/__tests__/*.test.ts` (new)
- `tools/wvo_mcp/src/prove/*.ts` (bug fixes uncovered by tests, if any)
- `tools/wvo_mcp/src/wave0/runner.ts` / `task_executor.ts` (minor adjustments for test hooks)
- `state/roadmap.yaml` (add validation task)
- `state/evidence/AFP-PROOF-DRIVEN-GAMIFICATION-20251106-REDO/*` (evidence)
- Potential telemetry/achievement JSON outputs (committed via evidence)

## PLAN-authored Tests
PLAN-authored tests:
- `npm --prefix tools/wvo_mcp run test -- prove` — new unit coverage for proof system modules.
- `npm --prefix tools/wvo_mcp run test -- wave0` — integration test validating Wave 0 + proof hooks.
- `npm --prefix tools/wvo_mcp run test -- process_critic` — regression check for guardrail enforcement.
- `npm --prefix tools/wvo_mcp run build` — TypeScript compilation (baseline before VERIFY).
- Live run: `npm run wave0 -- --proof-smoke` (manual) to execute the validation task end to end.
- Post-run hygiene: `node tools/wvo_mcp/scripts/rotate_overrides.mjs --dry-run && node tools/wvo_mcp/scripts/rotate_overrides.mjs`, and update `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/summary.md`.

## Implementation Steps
1. **Test Scaffolding**
   - Add Vitest suites for proof core (`proof_system`, `phase_manager`, `self_improvement`, `progress_tracker`).
   - Add Wave 0 integration test using fixtures to simulate roadmap/task execution.

2. **Code Fixes / Enhancements**
   - Address any failing tests: ensure ProofIntegration updates statuses, achievements tracked, verify.md generated.
   - Export any missing helpers (e.g., logger mocks for tests).

3. **Roadmap Harness**
   - Append a `pending` validation task to `state/roadmap.yaml`.
   - Prepare clean-up script/test to ensure reruns idempotent.

4. **Execution & Evidence**
   - Run PLAN-authored automated tests.
   - Execute Wave 0 proof smoke run; collect telemetry and generated verify.md.
   - Record commands/output in verify.md and daily audit summary.

5. **Guardrail Pass**
   - Re-run ProcessCritic, rotation script, and daily audit.
   - Stage evidence + code respecting micro-batching limits.

## Risks & Mitigations
- **Tests expose architectural gaps:** iterate on modules; keep commits small.
- **Wave 0 run hangs:** run with single-task roadmap, enforce timeout, inspect logs.
- **Telemetry clutter:** capture artifacts in task-specific directories, document context in review.
- **ProcessCritic new failure:** adjust docs/test lists promptly to stay green.
