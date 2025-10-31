## Implementation Notes

- Extended constructor error tests to assert remediation guidance (`Run WORK-PROCESS-FAILURES task` and `chmod +x`).
- Added telemetry failure test by forcing `fs.appendFileSync` to throw `ENOSPC`, verifying that `logError` records the issue without blocking checks.
- Introduced reusable helpers for log parsing to keep assertions concise.
- Confirmed existing timeout/JSON tests still pass with the stricter expectations.
- Simplified task-specific risk map to rely on test evidence (no structural/determinism artefacts required).

