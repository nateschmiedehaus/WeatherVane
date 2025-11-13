# Implementation Notes

## Wave 0 Status CLI
- Added `wave0_status` executable at repo root. It exposes `collectWave0Status`, `formatStatusReport`, and `parseArgs` so both the CLI and tests can reuse the same helpers.
- The collector reads `.wave0.lock`, `state/analytics/wave0_runs.jsonl`, and `state/analytics/supervisor_lifecycle.jsonl`, tolerating missing/invalid files by surfacing human-friendly warnings.
- Added relative-time helpers + PID liveness checks so operators immediately know whether a lock is stale or active and when the last run occurred.

## Tests & Docs
- Created `tests/wave0_status.test.js` using Node’s built-in test runner to cover:
  - Healthy lock + telemetry path.
  - Stale lock detection.
  - Missing telemetry fallback.
  - CLI flag parsing.
- Updated `docs/workflows/AFP_REVIEWER_ROUTINE.md` so reviewers capture a structured status snapshot (`./wave0_status --json`) whenever they exercise Wave 0.
