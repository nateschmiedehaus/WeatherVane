# Phase 8 · Observability Dashboard MVP

This document tracks the implementation status and usage instructions for the Phase 8 Sprint 1 observability backend. The current slice focuses on the **data + API layer** required by AC1 (Task Execution and Quality Gate metrics) and establishes the foundation for later UI and alerting work.

## Components Introduced

| Component | Path | Purpose |
|-----------|------|---------|
| `ObservabilityMetricsLoader` | `tools/wvo_mcp/src/observability/metrics_loader.ts` | Streams state files from `state/analytics/` and `state/limits/` with graceful fallbacks. |
| `ObservabilityMetricsProvider` | `tools/wvo_mcp/src/observability/metrics_provider.ts` | Aggregates task/quality-gate/resource metrics with caching and precision controls. |
| `ObservabilityServer` | `tools/wvo_mcp/src/observability/observability_server.ts` | Minimal HTTP router exposing `/api/metrics/*` endpoints plus `/healthz`. |
| CLI entrypoint | `tools/wvo_mcp/scripts/start_observability.ts` | Starts the server with sane defaults and SIGINT/SIGTERM cleanup. |
| npm script | `npm run observability` | Runs the CLI with `node --loader tsx …` from repo root. |

## Running the Server Locally

```bash
# From repo root
WVO_OBSERVABILITY_PORT=3100 npm run observability
```

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WVO_WORKSPACE_ROOT` | repo root | Override when running from a different checkout. |
| `WVO_OBSERVABILITY_PORT` | `3030` | HTTP port. |
| `WVO_OBSERVABILITY_HOST` | `127.0.0.1` | Bind address. |

The server exposes the following endpoints (JSON responses, `Cache-Control: no-store`):

| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Basic readiness check. |
| `GET /api/metrics/tasks` | Aggregated task counts, throughput, WIP utilisation derived from `autopilot_health_report.json`. |
| `GET /api/metrics/quality_gates` | Consensus history + approval mix from `orchestration_metrics.json`. |
| `GET /api/metrics/usage` | Provider utilisation snapshot from `state/limits/usage_log.json`. |

## Testing

The Vitest suite `tools/wvo_mcp/src/observability/__tests__/observability_metrics.test.ts` covers:

1. Task metric aggregation from synthetic health reports.
2. Quality gate consensus rate calculations.
3. Routing dispatch (ensures endpoints resolve without needing to bind sockets in CI sandboxes).

Run the tests in isolation:

```bash
node tools/oss_autopilot/scripts/run_vitest.mjs --run tools/wvo_mcp/src/observability/__tests__/observability_metrics.test.ts
```

## Pending Work

- Real-time delivery (WebSocket or SSE) and React dashboard that consumes these endpoints.
- Resolution loop + resource utilisation charts (AC1.3/AC1.4).
- Alerting system (AC2) + integrations.
- Export/Drill-down UX and dashboard auth hardening.

These TODOs remain tracked in `docs/autopilot/PHASE8_SPRINT1_SPEC.md`.
