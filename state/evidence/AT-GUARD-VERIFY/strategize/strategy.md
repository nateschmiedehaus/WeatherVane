# Strategy: AT-GUARD-VERIFY

## Why now
- WorkProcessEnforcer wiring (AT-GUARD-IMPLEMENT) is complete; next gate is proving the enforcement stack passes the full integrity suite.
- Historical failures during integrity (python bootstrap, telemetry parity) created drift; running the script validates end-to-end readiness before strict mode.
- Capturing metrics/logs now gives baseline for soft→strict rollout and ensures Codex/Claude parity on verification evidence.

## Objectives
- Execute `tools/wvo_mcp/scripts/run_integrity_tests.sh` end-to-end, gather exit codes and artifacts.
- Confirm WorkProcessEnforcer telemetry (`process.validation`, enforcement counters) appears in resulting logs.
- Document any failing sections with mitigation or follow-up tasks.

## Approach
- Prep environment (confirm Python toolchain, wheel cache availability, required env vars for telemetry checks).
- Run integrity script with streaming logs; tee output to evidence directory for traceability.
- If failures occur, triage quickly: determine whether to remediate within task or escalate.
- Collect artifacts: integrity summary, relevant JSON reports, enforcement metrics excerpts.

## Kill / Pivot Triggers
- **Kill** if infrastructure prevents running the script locally (missing secrets, unsupported platform) → escalate to roadmap operations.
- **Pivot** to targeted subset if single stage repeatedly fails due to known upstream outage, but log and open follow-up task per governance (avoid silent skips).

## Success Metric
- Integrity script exits 0 and artifacts stored under `state/evidence/AT-GUARD-VERIFY/verify/` with summary + key logs.
- Telemetry reports show enforcement counters (allow/block/bypass) populated.
