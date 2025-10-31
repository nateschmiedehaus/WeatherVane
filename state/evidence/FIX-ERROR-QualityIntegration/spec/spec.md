# Spec — FIX-ERROR-QualityIntegration

## Scope
Extend the WorkProcessQualityIntegration test suite to cover all documented error-handling paths and verify telemetry resilience.

## Acceptance Criteria
1. **Script missing** — constructor throws error containing remediation hint (`Run WORK-PROCESS-FAILURES task or disable`).
2. **Script not executable** — constructor throws error containing actionable `chmod +x` guidance.
3. **Timeout escalation** — when a script ignores SIGTERM, integration marks `timedOut=true` and kills the process.
4. **Invalid JSON** — runCheck returns non-blocking failure with `JSON parse error` message.
5. **Telemetry (disk full)** — when `appendFileSync` throws ENOSPC, the result still returns, and `logError` records the failure.
6. Tests run fast (<1s per scenario) and live in `tools/wvo_mcp/src/orchestrator/__tests__/work_process_quality_integration.test.ts`.
7. Evidence: Vitest suite + risk-oracle coverage + work_process_artifacts check captured in VERIFY.

## Out of scope
- Performance benchmarking (covered by FIX-PERF-QualityChecks).
- Additional E2E coverage (handled by FIX-E2E-QualityIntegration).

## Verification
- `npm --prefix tools/wvo_mcp run test -- work_process_quality_integration`
- `node --import tsx tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --task FIX-ERROR-QualityIntegration`
- `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task FIX-ERROR-QualityIntegration`

