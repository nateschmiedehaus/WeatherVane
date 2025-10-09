# Observability Alerts & Runbook

This runbook captures the alert strategy for retention/geocoding telemetry ahead of the full Phase 6
observability build-out. It describes which metrics we expose, the thresholds we monitor, and how to
respond when alerts fire.

## Metrics overview
- `retention.total_removed`: count of files removed per sweep.
- `retention.warning_counts[warning|critical]`: number of tenants whose retention triggered warnings.
- `geocoding.ratio`: per-tenant geocoding coverage.
- `pipeline.plan_status`: `FULL` vs `DEGRADED` from the smoke test harness.

These land in NDJSON exports via `export_observability.py` and will be ingested into Grafana/BigQuery.

## Alert thresholds (initial draft)
- **Retention critical**: `retention.warning_counts.critical > 0` on any sweep → investigate why a
  tenant is accumulating stale data (likely API outage or stuck ingestion).
- **Geocoding warning**: `geocoding.ratio < 0.8` for any production tenant (alert at warning, page at
  `<0.2`).
- **Pipeline degraded**: Smoke test returns `plan_status=DEGRADED` for two consecutive runs.

## Runbook
1. Confirm the alert by fetching the latest observability export (`make export-observability` or CLI).
2. Check recent retention/geocoding JSON under `storage/metadata/state` for additional context (tags,
   warnings, counts).
3. Review connector logs (Meta/Google/Shopify) and smoke-test output to identify missing data.
4. Mitigate:
   - Retry the relevant ingestion job.
   - If geocoding coverage dropped, run the validator manually and inspect the latest orders snapshot.
   - If retention failed, run `python apps/worker/run.py --retention-report` with export for evidence.
5. Document the incident in the ops channel and update this runbook with any new remediation steps.

## TODO
- Automate ingestion of NDJSON into Grafana/BigQuery dashboards.
- Configure alert rules in the observability stack (Loki/Prometheus/Grafana) matching the thresholds.
- Formalize on-call rotation and escalation paths.
