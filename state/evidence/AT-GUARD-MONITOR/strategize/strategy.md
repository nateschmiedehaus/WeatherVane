## Strategy: Guardrail Monitoring Baseline

### Why now
- Phase -1 guardrail remediation is complete; ongoing monitoring ensures the new enforcement stages remain healthy and evidence stays fresh.
- Monitoring is required before we hand off to downstream epics (Phase 0 instrumentation) to prevent regression in CI integrity.

### Goals
- Establish a repeatable monitoring loop that checks guardrail automation outputs, integrity logs, and roadmap evidence health.
- Document indicators to watch (CI stages, automation JSON files, evidence backfill runs) and define trigger conditions for investigation.
- Ensure monitoring artifacts land in `state/evidence/AT-GUARD-MONITOR/monitor/` with actionable next steps.

### Success criteria
- Monitoring notes reference the latest automation files (`state/automation/*.json`) and integrity run logs.
- Evidence shows checks were executed (commands + results) with no outstanding discrepancies.
- Follow-up channels identified (e.g., delta notes, roadmap tasks) if monitoring detects drift.
