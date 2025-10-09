# Worker On-Call Runbook (Draft)

## Overview
- **Scope**: Worker ingestion, feature generation, retention pipeline.
- **Primary owners**: Data Platform team; escalate to Reliability after 2 failed mitigations.
- **Environments covered**: Staging, Production, and sandbox tenants (where live connectors run).

## Golden Signals (to be wired)
- Harness run freshness and pass rate (evts: `harness.summary`, `harness.guardrails`, `harness.retention`).
- Weather cache hit ratio and latency percentiles (`weather.cache_fetch` outcome/tag mix).
- Retention telemetry throughput and error counts (`retention.tenant_sweep`, `retention.sweep_summary`).
- Worker queue depth and Prefect flow health.

## Triage Checklist
1. Confirm harness status via `tmp/metrics/<run_id>/metrics.jsonl` or the Grafana dashboard (once published).
2. For connector-specific incidents, validate credentials and recent payload anomalies.
3. Review weather cache logs for rising miss rates or external API throttling.
4. Inspect retention automation logs for stuck cursors or schema drift.

## Escalation Path
- **First 30 minutes**: On-call attempts standard remediation (re-run harness, clear cache, restart worker).
- **After 30 minutes**: Page Data Platform lead.
- **After 60 minutes or data loss risk**: Engage Reliability via PagerDuty and open Slack incident channel.

## Follow-Up
- File incident report in Jira with harness artifacts attached.
- Capture playbook improvements in this runbook and `docs/OBSERVABILITY.md`.
- Schedule post-incident review within two business days.
