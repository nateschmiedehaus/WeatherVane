# Spec: AT-GUARD-VERIFY

## Acceptance Criteria
1. `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` completes with exit code 0 and summary log stored in evidence.
2. Integrity summary enumerates each stage result; failures (if any) are investigated and either fixed or explicitly documented with follow-up tasks.
3. Telemetry artifacts (`state/automation/*.json`, integrity logs) are copied to evidence and include enforcement-related counters/spans.
4. Verification notes reference `process.validation` spans or `enforcement_decisions_total` metrics proving WorkProcessEnforcer telemetry flows.
5. Evidence bundle contains:
   - Raw script log (`integrity_tests.log`).
   - Integrity summary (`integrity_summary.txt` or JSON by stage).
   - Key JSON outputs from script (structural policy report, risk oracle coverage, etc.).

## Constraints
- Must run without modifying script to skip stages.
- If environment bootstrap requires network, ensure compliance with allowed tooling (wheel cache fallback acceptable).

## Out of Scope
- Enabling strict enforcement mode (handled by later roadmap tasks).
- Fixing upstream issues unrelated to WorkProcessEnforcer if they require large refactors (log + escalate instead).
