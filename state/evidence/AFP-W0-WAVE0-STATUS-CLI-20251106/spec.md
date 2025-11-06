# SPEC: AFP-W0-WAVE0-STATUS-CLI-20251106

## Acceptance Criteria
- A repo-level command (`./wave0_status`) outputs current Wave 0 runner health (lock presence, PID alive check, uptime) and at least the three most recent task executions drawn from `state/analytics/wave0_runs.jsonl`.
- The command offers both human-readable and `--json` structured output so VERIFY can capture machine-parsable evidence.
- Script works without elevated permissions by relying on existing lock/telemetry files and handles missing/empty logs gracefully (clear status reason).
- `docs/workflows/AFP_REVIEWER_ROUTINE.md` references the new command inside the Wave 0 procedure so future agents know where to look.
- Automated tests cover log parsing and stale-lock detection logic; VERIFY runs these tests.

## Functional Requirements
- Implement a status collector that:
  - Reads `state/.wave0.lock` (if present) and verifies the recorded PID is still running via `process.kill(pid, 0)` fallback.
  - Parses `state/analytics/wave0_runs.jsonl` to surface the most recent N runs (default 3) with task ID, status, end time, and age delta.
  - Reads optional `state/analytics/supervisor_lifecycle.jsonl` to display the latest lifecycle event (if available).
  - Detects and reports stale lock scenarios (lock present but PID dead).
- Provide CLI wrapper `wave0_status` that prints formatted text and supports `--json`, `--limit`, and `--root` (for tests) options.
- Add unit tests covering:
  - Happy path (lock + live PID + multiple runs).
  - Stale lock detection.
  - Missing telemetry files producing informative fallbacks.
- Update AFP reviewer workflow doc to replace manual instructions (“tail logs, run ps”) with the new command.

## Non-Functional Requirements
- Script must execute in <1s on typical repo state and avoid loading entire JSONL into memory unnecessarily (limit to last 50 lines before slicing).
- Output is deterministic and clearly labelled so it can be pasted into evidence bundles without extra narration.
- No new dependencies beyond Node core modules; keep implementation self-contained and ≤150 net LOC.
- Works cross-platform (macOS/Linux) and handles absent lock/log files without throwing.

## Out of Scope
- Spinning up or restarting Wave 0 itself (we only report status).
- Integrating with external dashboards or MCP tools (future work can wrap this CLI).
- Updating roadmap/task metadata (manual action remains outside this change).
