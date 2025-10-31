# Spec — FIX-TEST-QualityIntegration

## Test Targets
- `tools/wvo_mcp/src/orchestrator/work_process_quality_integration.ts`

## Required Scenarios
1. **Constructor validation**
   - Rejects non-existent workspace, missing scripts, non-executable scripts.
   - Allows disabled checks without script validation.
2. **Mode logic**
   - `shadow`/`observe` never block.
   - `enforce` blocks when checks fail (no timeout/error) and respects pass cases.
3. **Fail-safe behaviour**
   - Timeouts and script errors do not block when `failSafe=true`.
   - Legitimate failures still block in enforce mode.
4. **Timeout escalation**
   - Process receives SIGTERM then SIGKILL; result flagged as `timedOut` and finishes before script’s full duration.
5. **Error parsing**
   - Handles invalid JSON gracefully (non-blocking, fail-safe).
   - Handles non-zero exit codes with appropriate error message.
6. **Telemetry logging**
   - Appends JSONL entries for each check type and recreates analytics directory when missing.
   - Logging errors do not throw.
7. **Disabled checks shortcut**
   - Disabled check returns immediately with zero execution time.

## Approach
- Use Vitest + temporary workspace roots (via `fs.mkdtempSync`) to emulate real file system layout.
- Generate short shell scripts per scenario (passing, logical failure, timeout, crash, invalid JSON).
- Run tests serially (Vitest default) and ensure cleanup of temp directories and permissions.
- Assert on `QualityCheckResult` fields, including `blockTransition`, `timedOut`, and `error` contents.
- Verify telemetry by inspecting `state/analytics/*.jsonl` files.
- Maintain execution time under ~10s for entire suite.

## Non-Goals
- No integration with WorkProcessEnforcer (covered by separate tasks).
- No changes to production code outside helpers required for testing (unless test work surfaces implementation bug).
