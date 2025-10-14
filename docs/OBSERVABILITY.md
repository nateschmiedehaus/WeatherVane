# Observability & Ops Runbook

This document outlines how to inspect retention and geocoding telemetry locally and in staging. The goal
is to give operators a fast, repeatable workflow while the full dashboard stack (Grafana/BigQuery +
alerting) is wired up in Phase 6.

## Retention telemetry
Nightly retention sweeps store their latest summary under `storage/metadata/state/retention/latest.json`.
Load it via the helper:

```bash
python -c "from apps.worker.maintenance.reporting import load_retention_report; import json; report = load_retention_report('storage/metadata/state'); print(json.dumps(report.__dict__, indent=2))"
```

The report exposes:
- `summaries`: per-tenant removal results (paths, counts, context tags)
- `total_removed` / `tenant_count`
- `warning_counts`: severity histogram across tenants
- `tag_counts`: tags triggered during the sweep

### Reporting via CLI
Use `python apps/worker/run.py --retention-report --retention-summary-root storage/metadata/state`
to print the latest JSON. Append `--retention-report-day YYYY-MM-DD` to inspect historical files.
Add `--export-observability observability/retention.json` to write a normalized JSON snapshot that
dashboards can ingest quickly.

## Geocoding coverage telemetry
The geocoding validator writes `storage/metadata/state/geocoding/<tenant>.json`. Inspect all tenants via:

```bash
python -c "from apps.worker.maintenance.reporting import load_geocoding_reports; import json; reports = load_geocoding_reports('storage/metadata/state'); print(json.dumps([r.__dict__ for r in reports], indent=2))"
```

Each report contains `tenant_id`, `ratio`, and `status` (`ok`, `warning`, `critical`). Pair this with the
retention summary to identify tenants whose weather joins may degrade the plan.
Export the reports via `python apps/worker/maintenance/export_observability.py storage/metadata/state \
  observability/` to emit NDJSON files (`retention.ndjson`, `geocoding.ndjson`) ready for BigQuery or
Grafana Loki ingestion.

To push directly to BigQuery, run:

```bash
python apps/worker/maintenance/publish_observability.py analytics.telemetry retention geocoding \
  --summary-root storage/metadata/state --output observability/latest --dry-run
```

Remove `--dry-run` to execute `bq load` commands for both tables. The helper uses the `bq` CLI, so ensure
credentials are configured on the machine or CI runner.

## MCP orchestrator failover telemetry

Coordinator promotions between Claude Code and Codex now surface through both live tools and the
JSONL telemetry feed:

- `orchestrator_status` returns a `coordinator` block with `type`, `available`, and a normalised
  `reason` (examples: `primary`, `primary_unavailable`, `failover:claude_rate_limit`). This is the
  quickest way to confirm whether the runtime is operating on Codex failover.
- `state/telemetry/operations.jsonl` captures the same tuple inside each snapshot so dashboards can
  highlight prolonged failover windows. Each record includes the current operations mode, token
  pressure, queue composition, and coordinator state for context.
- Every execution summary appended to `state/telemetry/executions.jsonl` now carries
  `coordinator_type`, `coordinator_available`, and `coordinator_reason`. Older entries created
  before 2025‑10‑12 will lack these fields—filter on their presence when building charts.
- The automation guardrail at `tools/wvo_mcp/scripts/check_failover_guardrail.mjs` ingests the latest
  operations snapshots and enforces the failover SLO (≤50 % Codex share, sustained Codex coordinator
  <15 minutes, Claude downtime <10 minutes). Any breach exits non-zero so Autopilot rolls back to the
  previous coordinator automatically.

Quick checks:

```bash
# Tail live status
codex tools call orchestrator_status

# Summarise failover ratio from execution logs
python - <<'PY'
import json, pathlib, collections
path = pathlib.Path("state/telemetry/executions.jsonl")
counts = collections.Counter()
for line in path.read_text().splitlines():
    record = json.loads(line)
    reason = record.get("coordinator_reason")
    if reason:
        counts[reason] += 1
print(counts.most_common())
PY
```

Rollback guidance:

1. If `coordinator.available` is `false` for Claude Code, verify Codex agents are healthy and
   investigate the Claude rate-limit message in the resiliency logs.
2. When Codex remains coordinator for more than 15 minutes, review `operations.jsonl` snapshots to
   confirm queue health and token pressure. Escalate to the provider team if Claude cooldowns exceed
   the documented limits.
3. After repairs, Claude demotion events restore the primary coordinator automatically; no manual
   toggle is required.

## MCP cost telemetry & budget alerts

T10.1.1 instruments per-provider spend so operators can spot runaway costs without waiting for
external dashboards.

- `state/telemetry/operations.jsonl` now contains a `costMetrics` block with `lastHourUSD`,
  `last24hUSD`, and provider-specific utilisation (`hourlyLimitUSD`, `dailyLimitUSD`,
  `hourlyUtilizationPercent`, `dailyUtilizationPercent`, `status`, `alerts`). Tail the file to
  confirm new snapshots carry the structure:
  ```
  tail -n 1 state/telemetry/operations.jsonl | jq .costMetrics
  ```
- Budget thresholds resolve from `config/provider_budget_thresholds.json` with env overrides:
  set `WVO_ENVIRONMENT` or provider-specific knobs (`WVO_BUDGET_CODEX_DAILY_USD`,
  `WVO_BUDGET_CLAUDE_HOURLY_USD`, `WVO_BUDGET_ALERT_THRESHOLD_PERCENT`, etc.) before launching the
  orchestrator to enforce tenant-specific guardrails.
- When spend crosses the configured `alert_threshold_percent`, OperationsManager emits `logInfo`
  warnings; hitting the absolute limit escalates to `logWarning` and flips operations mode to
  `stabilize`.
- Unless `WVO_DISABLE_BUDGET_CONTEXT_ALERTS` is set, each alert appends a line to `state/context.md`
  (e.g., `Budget WARNING for codex (hourly) - spent 4.00 USD vs limit 5.00 USD.`) so the human
  operator has durable breadcrumbs during incident review.
- The vitest suite `npm run test -- operations_manager_costs` exercises both warning and critical
  paths, ensuring budget regressions trip CI immediately.

## Smoke test summary
`make smoke-pipeline` runs the PoC pipeline and prints a compact JSON summary including:
- plan status (FULL/DEGRADED)
- geocoding validation status and ratio
- source summary (`shopify`, `ads`, `promo`, `weather`)
- row counts for Shopify/Meta/Google datasets
- context tags emitted for the tenant

This is the fastest way to validate connector credentials after rotating secrets or refreshing tokens.
Add `--log-file logs/smoke.ndjson` to append NDJSON records suitable for Loki or Stackdriver logging.

## Next steps (Phase 6 roadmap)
- Publish retention/geocoding metrics to Grafana/BigQuery dashboards via a scheduled job that runs
  `export_observability.py` and uploads NDJSON.
- Emit structured logs for sweep outcomes and smoke-test runs (target: Loki / GCP Logging). Example:
  `python apps/worker/run.py tenant --smoke-test --retention-summary-root ... --export-observability logs/out.json`
  followed by shipping the directory to the logging pipeline.
- Add on-call runbook entries describing alert thresholds and remediation steps.
