# Plan — FIX-TEST-QualityIntegration

1. **Set up workspace harness**
   - Create temp workspace + `scripts/` + `state/analytics` directories in beforeEach.
   - Provide helper functions to generate passing, logical failure, timeout, crash, and invalid JSON scripts.
2. **Constructor / validation tests**
   - Cover happy-path initialization, missing workspace, missing script, non-executable script, disabled checks.
3. **Mode logic & fail-safe tests**
   - Use logical failure script (exit 0, `passed:false`) to assert blocking in enforce mode.
   - Use timeout + invalid JSON scripts to confirm fail-safe behaviour.
4. **Timeout & signal escalation**
   - Create script that ignores SIGTERM; ensure timeout occurs < configured limit.
5. **Error parsing & non-zero exit**
   - Crash script (exit code 1) for non-zero exit handling.
   - Invalid JSON script for parse failure path.
6. **Telemetry logging tests**
   - Assert JSONL files created, directories recreated, failures suppressed.
7. **Disabled checks**
   - Ensure disabled config returns immediate pass.
8. **Run targeted Vitest**
   - `npm --prefix tools/wvo_mcp run test -- orchestrator/__tests__/work_process_quality_integration.test.ts`.
   - Capture logs/output for evidence.
9. **Update evidence**
   - Document commands/results under VERIFY, mark REVIEW/PR/MONITOR, update roadmap status.
