
# WeatherVane — Product Handbook

> **Scope:** Product domain Autopilot builds/operates via MCP. Not the Autopilot handbook.

**Mission:** Weather‑intelligent ad allocation recommending/pushing budgets by category × geo × channel; modes: Manual, Assist, Autopilot.

**Overview:** apps (web/api/worker/model/simulator), infra (terraform/k8s), shared (schemas/libs/feature_store), storage (lake/metadata).

**Data Contracts:** Postgres control plane (tenants, connections, catalog, ads, guardrails, approvals, audit). Lakehouse Parquet/Delta for facts/features. Auto‑tagging and human review with Shopify metafield round‑trip.

**Modeling & Validation:** Baseline+weather (GAM/GBM), MMM (adstock/saturation), heterogeneity by regime. Rolling‑origin CV; allocator backtest vs observed spend.

**Allocation & Push:** Concave profit curves per (category×geo×channel×day), CVaR risk, ramp limits, push modes with audit/rollback.

**UX Contracts:** Plan (table+map), Stories, Catalog & Tags, Automations, Experiments, Diagnostics; accessibility & reduced‑motion compliance.

**PoC Suite:** Missed‑opportunity report with hindcasts; interactive + PDF/CSV; truthful bounds and audit trail.

**Security & Compliance:** OAuth least privilege, secrets vaulted, aggregated geo only, data export/delete.
