
# Observability Spec — OpenTelemetry GenAI

- **Spans:** `agent.plan`, `agent.tool.call`, `agent.review`, `agent.verify`, `agent.state.transition` with model/tokens/latency attrs.
- **Metrics:** `tasks_success_total`, `tasks_failed_total{reason}`, `plan_loop_detected_total`, `tool_latency_ms_bucket`, `provider_rate_limit`, `queue_depth`, `lease_timeouts_total`.
- **Dashboards:** SLO, Rate‑limit, Queue/Leases; alerts for success<95%, loop>2%, MTTR>30s.
- **Code stubs:** tracer init (Node/Python) and MCP client middleware to attach spans.
