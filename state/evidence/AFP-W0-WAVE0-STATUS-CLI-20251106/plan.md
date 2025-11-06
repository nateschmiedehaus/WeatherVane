# PLAN: AFP-W0-WAVE0-STATUS-CLI-20251106

## Architecture / Approach
- Build a repo-root CLI (`wave0_status`) implemented in CommonJS with a helper `collectWave0Status` function for reuse/tests.
- Script will read `.wave0.lock`, `state/analytics/wave0_runs.jsonl`, and `state/analytics/supervisor_lifecycle.jsonl`, combining results into a single status struct.
- Provide CLI flags (`--json`, `--limit`, `--root`) for automation and testability.
- Tests rely on Node’s `test` runner and temporary directories to simulate lock/log files.
- Update reviewer workflow documentation to point at the new CLI instead of manual ps/tail steps.

## Files to Change
- `wave0_status` – new executable CLI with exported helpers.
- `tests/wave0_status.test.js` – automated tests for collector logic.
- `docs/workflows/AFP_REVIEWER_ROUTINE.md` – documentation update referencing the command.
- Evidence folder (`state/evidence/AFP-W0-WAVE0-STATUS-CLI-20251106/…`) – phase artifacts (strategy/spec/plan/think/design/phases).

## Work Plan
1. **Status Collector** – implement helper functions:
   - `readLockFile`, `isPidAlive`, `readRecentJsonl`, `summarizeLifecycle`, `collectWave0Status`, and `formatStatusReport`.
   - Ensure missing files simply produce warnings and fallback text.
2. **CLI Wiring**
   - Parse simple flags (no dependency) and call collector.
   - Provide `--json` output and text table with relative timestamps.
3. **Tests (authored now)**
   - Add `tests/wave0_status.test.js` using Node `test` runner; scenarios:
     - Healthy lock + recent runs.
     - Stale lock (PID definitely invalid).
     - Missing telemetry file fallback.
   - Tests will create temporary directories and invoke `collectWave0Status({ root })`.
4. **Documentation**
   - Update `docs/workflows/AFP_REVIEWER_ROUTINE.md` to instruct running `./wave0_status --json`.

PLAN-authored tests:
- `node --test tests/wave0_status.test.js`
- `./wave0_status --json --limit=2`
- `npm --prefix tools/wvo_mcp run build`

## Milestones
- **M1 – Collector ready:** helper functions return structured status objects for fixture data (validated via node tests).
- **M2 – CLI UX:** executable prints both text + JSON formats, honours `--limit/--root`, and handles missing telemetry gracefully.
- **M3 – Adoption:** documentation updated; manual smoke (`./wave0_status --json`) produces evidence-ready output.

## Verification Strategy
- `node --test tests/wave0_status.test.js` – ensures collector logic works for healthy, stale, and missing-log scenarios.
- `./wave0_status --json --limit=2` – smoke run against live repo state to capture evidence and confirm CLI output.

## Risks & Mitigations
- **False positives on stale locks:** include lock age + instructions to double-check before deleting.
- **Large JSONL files:** limit to last ~200 lines before parsing to keep CLI fast.
- **Permission errors on PID check:** treat EPERM as “unknown” and highlight in warnings.
- **Docs drift:** update workflow doc so procedure stays consistent.

## Assumptions
- Node ≥18 available.
- `.wave0.lock` JSON schema remains `{ pid, startTime }`.
- Operators execute CLI from repo root (or pass `--root`).
- Telemetry files live under `state/analytics/`.
