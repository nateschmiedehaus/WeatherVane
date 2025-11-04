# Phase 8 · Observability Dashboard MVP

This document tracks the implementation status and usage instructions for the Phase 8 Sprint 1 observability backend. The current slice now supplies the **metrics, streaming, and export interfaces** required by AC1 (Task Execution, Quality Gates, Resolution Loops, and Resource Health) and establishes the foundation for the upcoming React dashboard.

## Components Introduced

| Component | Path | Purpose |
|-----------|------|---------|
| `ObservabilityMetricsLoader` | `tools/wvo_mcp/src/observability/metrics_loader.ts` | Reads JSON and JSONL sources under `state/analytics/`, `state/limits/`, and `state/telemetry/` with graceful fallbacks. |
| `ResolutionMetricsStore` | `tools/wvo_mcp/src/orchestrator/resolution_metrics_store.ts` | Persists live resolution-loop attempts, incidents, and closures to `state/analytics/resolution_metrics.json`. |
| `ObservabilityMetricsProvider` | `tools/wvo_mcp/src/observability/metrics_provider.ts` | Aggregates task, quality, resolution, and resource metrics with caching, roadmap drill-downs, retry/success rates, and CSV builders. |
| `ObservabilityServer` | `tools/wvo_mcp/src/observability/observability_server.ts` | HTTP service exposing REST, CSV export, and SSE streaming endpoints with optional CORS and cache controls. |
| CLI entrypoint | `tools/wvo_mcp/scripts/start_observability.ts` | Boots the server with environment-driven configuration and graceful shutdown hooks. |
| npm script | `npm run observability` | Launches the CLI via `node --loader tsx …` from repo root. |

## Running the Server Locally

```bash
# From repo root
WVO_OBSERVABILITY_PORT=3100 npm run observability
```

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WVO_WORKSPACE_ROOT` | repo root | Override when running from a different checkout. |
| `WVO_OBSERVABILITY_HOST` | `127.0.0.1` | Bind address. |
| `WVO_OBSERVABILITY_PORT` | `3030` | HTTP port. |
| `WVO_OBSERVABILITY_CACHE_TTL_MS` | `5000` | Cache TTL used by the metrics provider. |
| `WVO_OBSERVABILITY_STREAM_INTERVAL_MS` | `1000` | Broadcast cadence for the SSE stream. |
| `WVO_OBSERVABILITY_CORS_ORIGIN` | `*` | Optional allowed origin for dashboard dev servers. |

## API, Streaming, and Exports

All JSON routes emit `Cache-Control: no-store`.

| Endpoint | Payload |
|----------|---------|
| `GET /healthz` | Basic readiness check. |
| `GET /api/metrics/tasks` | Task queue depth, throughput, success/failure/retry rates, and roadmap drill-down snippets. |
| `GET /api/metrics/quality_gates` | Consensus history with approval/rejection counts, gate breakdowns, and rubric averages. |
| `GET /api/metrics/resolution` | Live and historical resolution loop metrics sourced from `ResolutionMetricsStore`. |
| `GET /api/metrics/resources` | Host/process utilisation, provider capacity, and estimated cost-per-task. |
| `GET /api/metrics/usage` | Raw provider usage snapshot mirroring `state/limits/usage_log.json`. |
| `GET /api/metrics/stream` | Server-Sent Events stream bundling the task, quality, resolution, and resource payloads every interval. |
| `GET /api/metrics/export/tasks` | CSV export of task counts per state. |
| `GET /api/metrics/export/resolution` | CSV export of active resolution loops. |

The SSE endpoint uses `text/event-stream` and keeps connections alive; the server automatically removes closed clients and throttles updates when no listeners remain.

## Testing

Targeted Vitest coverage lives in:

- `tools/wvo_mcp/src/observability/__tests__/resolution_metrics_store.test.ts`
- `tools/wvo_mcp/src/observability/__tests__/metrics_provider.test.ts`

Run them locally:

```bash
npx vitest run \
  tools/wvo_mcp/src/observability/__tests__/resolution_metrics_store.test.ts \
  tools/wvo_mcp/src/observability/__tests__/metrics_provider.test.ts
```

The tests exercise persistence semantics, aggregation math, CSV builders, and non-network server routes.

## Pending Work

- React dashboard cards with SSE subscription fallback to query polling.
- Drill-down modals beyond the 20-task preview and richer CSV export coverage.
- Alerting/notification hooks (AC2) and dashboard authentication hardening.
- Synthetic integration test that drives the SSE endpoint under load.

These TODOs remain tracked in `docs/autopilot/PHASE8_SPRINT1_SPEC.md`.
