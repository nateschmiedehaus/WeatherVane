# IMPLEMENT — Notes

- Reworked `work_process_quality_integration.test.ts` to use deterministic helper scripts (passing, logical failure, timeout, crash, invalid JSON).
- Added new crash helper to exercise non-zero exit path while keeping fail-safe semantics intact.
- Ensured helper scripts emit `passed` flag so parsed results align with implementation.
- Updated test expectations for enforce/observe/shadow modes, fail-safe behaviour, timeout escalation, telemetry logging, disabled checks, and directory recreation.
- Adjusted implementation to pass `taskId` into telemetry results and log entries (via `runCheck` signature update).
