# SPEC: AFP-W0-WAVE0-STATUS-CLI-20251106

## Success Criteria
- `./wave0_status` (or equivalent executable) reports Wave 0 runner health (lock presence, PID alive check, uptime) plus at least the three most recent task executions from `state/analytics/wave0_runs.jsonl`.
- CLI offers both human-readable output and a `--json` flag so VERIFY can capture structured telemetry.
- Script works without elevated permissions by reading existing files; missing/empty telemetry produces explicit “no data” messaging rather than stack traces.
- `docs/workflows/AFP_REVIEWER_ROUTINE.md` instructs operators to run the new command as part of the Wave 0 verification flow.
- Automated tests cover the status collector logic (healthy lock, stale lock, missing telemetry) and VERIFY runs them.

## Requirements

### Functional Requirements
- Status collector must:
  - Read `state/.wave0.lock` (if present) and validate the PID using `process.kill(pid, 0)` while handling EPERM gracefully.
  - Parse the tail of `state/analytics/wave0_runs.jsonl` to show the most recent N entries (default 3) with task ID, status, end time, and relative age.
  - Optionally read `state/analytics/supervisor_lifecycle.jsonl` to display the most recent lifecycle event.
  - Detect stale locks (lock present but PID dead) and recommend remedial steps.
- CLI wrapper should expose flags `--json`, `--limit=<n>`, and `--root=<path>` (for tests) plus default to repo root when run directly.
- Create `tests/wave0_status.test.js` covering core scenarios via Node’s built-in test runner.
- Update documentation to link to the CLI so the process is repeatable.

### Non-Functional Requirements
- Execution time <1s by tailing only the last ~200 lines before parsing.
- No dependencies beyond Node core modules.
- Output must be deterministic and concise so evidence can paste directly into `verify.md`.
- Works on macOS/Linux without requiring `ps` or other privileged commands.

## Out of Scope
- Starting or restarting Wave 0.
- Editing roadmap/task metadata or autopilot internals.
- Surfacing status over MCP (future integration can wrap this CLI).
