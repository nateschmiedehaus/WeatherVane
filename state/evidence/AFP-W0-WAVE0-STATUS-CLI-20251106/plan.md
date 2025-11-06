# PLAN: AFP-W0-WAVE0-STATUS-CLI-20251106

## Architecture / Approach
- Implement a self-contained Node CLI (`wave0_status`) at repo root so operators can run it without navigating into subdirectories. Script will:
  - Reuse existing telemetry (lock file, `state/analytics/wave0_runs.jsonl`, `state/analytics/supervisor_lifecycle.jsonl`).
  - Provide `collectWave0Status()` helper that encapsulates filesystem inspection; CLI simply formats the struct (enables testing).
  - Offer CLI flags (`--json`, `--limit`, `--root`) parsed via a lightweight helper (no external dependency).
- Tests: create fixtures in temporary directories and invoke `collectWave0Status` via Node’s test runner (`node --test`). Cover happy path, stale locks, and missing telemetry.
- Documentation: update `docs/workflows/AFP_REVIEWER_ROUTINE.md` to instruct reviewers to run the new command instead of manual `ps/tail` steps.

## Files to Change
- `wave0_status` – new executable CLI (CommonJS) exporting status helpers.
- `tests/wave0_status.test.js` – Node test suite exercising collector logic.
- `docs/workflows/AFP_REVIEWER_ROUTINE.md` – reference the new command in Wave 0 instructions.
- Evidence artifacts under `state/evidence/AFP-W0-WAVE0-STATUS-CLI-20251106/` (strategy/spec/plan/think/design/phases).

## Implementation Plan
1. **Status collector + CLI**
   - Implement helper functions: `readLock`, `isPidAlive`, `readRecentJsonl`, `collectWave0Status`, and `formatStatus`.
   - Support flags `--json`, `--limit=<n>`, `--root=<path>` (default root = repo root). Ensure CLI handles missing files gracefully and prints actionable guidance (e.g., stale lock).
2. **Tests (authored now)**
   - Create `tests/wave0_status.test.js` using Node’s `test` module.
   - Use `fs.mkdtempSync` to build temporary state trees; write sample lock + JSONL files; assert collector output.
   - Scenarios: (a) healthy lock + live PID simulation (fake by using current PID), (b) stale lock (PID definitely dead), (c) missing telemetry file fallback.
3. **Documentation**
   - Update `docs/workflows/AFP_REVIEWER_ROUTINE.md` Wave 0 section to instruct running `./wave0_status --json` as the evidence collection step.
   - Mention command in troubleshooting tips as the first diagnostic tool.
4. **Verification Prep**
   - Ensure script executable bit set.
   - Provide sample run capturing output for evidence.

## Verification Plan (to run during VERIFY)
1. `node --test tests/wave0_status.test.js` – validates collector logic and CLI flag handling (tests authored in step 2).
2. `./wave0_status --json --limit=2` – smoke-test against live repo state to ensure command exits 0 and emits structured data.

These tests exist before IMPLEMENT (test file created alongside code) and will be re-run in VERIFY. No Wave 0 live run is required because we are not editing the autopilot runner, only consuming its artifacts.

## Risks & Mitigations
- **Stale lock misreported if process IDs reused** – include startTime delta check and warn when PID check fails but lock older than X minutes.
- **Large JSONL files** – tail only the last ~200 lines before parsing to keep memory stable.
- **Permission errors on `kill(pid, 0)`** – handle `EPERM` by reporting “unknown” rather than crashing.
- **Docs drift** – ensure workflow doc explicitly references the command, reducing reliance on tribal knowledge.
