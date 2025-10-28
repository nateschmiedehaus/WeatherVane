
# Observability Spec — OpenTelemetry GenAI

- **Spans:** `agent.plan`, `agent.tool.call`, `agent.review`, `agent.verify`, `agent.state.transition`, `process.validation` (with `process.violation` events), `agent.cross_check`, `agent.observer`. Include attributes for `task.id`, `state`, `attempt`, `model.provider`, `tokens.prompt`, `tokens.completion`, `coverageDelta`, `failingGate`, and violation metadata.
- **Metrics:** `tasks_success_total`, `tasks_failed_total{reason}`, `plan_loop_detected_total`, `tool_latency_ms_bucket`, `provider_rate_limit`, `queue_depth`, `lease_timeouts_total`, `phase_skips_attempted`, `phase_validations_failed`, `tasks_rejected_for_process_violation`, `cross_check_discrepancies`.
- **Artifacts:** Stream spans to `state/telemetry/traces.jsonl` and metrics to `state/telemetry/metrics.jsonl`; link both files (plus ledger entries) in Monitor/PR evidence packs.
- **Dashboards:** SLO, Rate‑limit, Queue/Leases, Process Violations. Alerts for `success<95%`, `loop>2%`, `MTTR>30s`, any rise in `phase_skips_attempted`, or nonzero `tasks_rejected_for_process_violation`.
- **Code stubs:** tracer init (Node/Python), MCP client middleware to attach spans, metrics collector helpers for violation counters, and ledger writers that emit span/metric references.
