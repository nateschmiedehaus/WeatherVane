# WeatherVane

WeatherVane turns public weather intelligence, your storefront data, and ad platform history into weather-aware budget plans that marketers can approve or auto-push safely.

> **Honesty first:** WeatherVane does not guarantee performance. It analyses your history, today's forecast, and your guardrails to propose plans with expected ranges and clear assumptions. You choose how changes get applied.

> **Causal transparency:** Current models capture historical correlations. See [`docs/CAUSAL_LIMITATIONS.md`](docs/CAUSAL_LIMITATIONS.md) for what we can and cannot claim until causal modelling work (Phase 4) completes.

---

## 🔐 For AI Agents & Developers

**IMPORTANT:** WeatherVane uses **monthly subscriptions** for AI agents (Claude & Codex), **NOT API keys**.

**Authentication:**
- **Claude:** Monthly subscription via Claude Desktop app
- **Codex:** Monthly subscription (CLI-based)
- **NO** API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are used

**Exact Credential Locations:**
- **Claude Desktop session:** `~/Library/Application Support/Claude/Cookies` (SQLite DB)
- **Claude CLI:** `~/.accounts/claude/claude_primary`
- **Claude config:** `~/.claude/` and `~/.claude.json`
- **Codex auth:** `~/.codex/auth.json`
- **Codex CLI:** `~/.accounts/codex/codex_personal`
- **Codex config:** `~/.codex/config.toml`

**Full authentication policy:** See [`docs/AUTH_POLICY.md`](docs/AUTH_POLICY.md)

**Agent operating brief:** See [`CLAUDE.md`](CLAUDE.md) for complete development guidelines

---

## What WeatherVane Delivers
- **Connect once**: OAuth to Shopify, Meta Ads, Google Ads, and Klaviyo. Read-only access powers planning; optional write scopes enable one-click budget pushes.
- **Understand your catalog**: Auto-suggest weather and seasonal tags for each product and existing ad asset, with quick human approval and round-tripping to Shopify metafields.
- **Weather-aware planning**: Learn how weather, holidays, and promos shift demand by product category and geography, so budgets move where they matter.
- **Platform-safe allocation**: Recommend (and optionally push) geo × product × channel budgets with ramp limits, ROAS/CPA guardrails, and scenario bands.
- **Ad implementation guidance**: Map your current ads to the right weather runs or generate a fresh Ad-Kit (targeting + creative brief) when inventory is light.
- **Explainable insights**: Daily stories show the key events (“Heat spike → Sunscreen up 18% in TX”) with expected revenue/ROAS ranges and the factors behind them.

---

## Who It’s For
- **Hands-on marketers** who want to react to weather without spreadsheet gymnastics.
- **Leaders** who need a quick pulse on the plan, drivers, and expected upside.
- **Analysts** who demand causal modeling, diagnostics, and exportable evidence.

---

## Product Walkthrough
1. **Landing & Onboarding**
   - Connect your platforms (read-only or read/write).
   - Backfill sales, ads, promos, and weather automatically. Progress is visible in-app.
2. **Catalog & Ad Tagging**
   - Review suggested weather/season tags for products and ads; approve or tweak.
   - Store tags in Shopify metafields and the internal ad inventory so future runs stay organised.
3. **Plan View**
   - 7-day rolling plan by category × geo group × channel.
   - Each cell shows recommended spend, change vs current, and expected revenue/ROAS bands.
   - Map layer illustrates geo groups with anomaly shading.
   - “What-if” sliders adjust total budget or forecast intensity.
4. **Stories**
   - Digestible narratives: upcoming weather opportunities, underserved geos with headroom, promo synergies.
   - Shareable summaries for execs or teammates.
5. **Guided Automation & Privacy**
   - Choose automation level: Manual (no pushes), Assist (requires approval), Autopilot (auto-push within policy) with recorded tenant consent.
   - Configure guardrails: max day-over-day change, min spend, ROAS/CPA thresholds, push windows, do-not-touch campaigns, and notification routing.
   - Invoke privacy endpoints for export/delete requests and rely on the retention sweep to purge stale lake snapshots per tenant policy.
6. **Ad Implementation Help**
   - View which existing ads fit each weather run via tags.
   - For gaps, WeatherVane generates an Ad-Kit: proposed ad set structure, targeting, schedule, budget, and creative brief. Drafts can be created (paused) if write scope was granted, or exported as CSV for manual build.
7. **Diagnostics & Experiments**
   - Rolling backtests, feature importance, drift monitors.
   - Simple geo/campaign experiment templates to validate lift and calibrate models.

---

## Default Operating Mode
- WeatherVane ships in **read-only Plan & Proof** mode. We ingest data, run the PoC, and surface plans/CSVs without touching live campaigns.
- Platform pushes stay disabled until a tenant explicitly opts into **Assist** (approval-gated pushes) or **Autopilot** (guardrails + ramps + ROAS/CPA floors).
- This makes trials safe for brands and keeps instrumentation independent from experiments.

---

## Free / OSS Stack (Recommended)
- **Weather inputs:** Open-Meteo forecast + history, ERA5 normals, OpenAQ & pollen (optional NOAA HRRR nowcast).
- **Commerce/marketing APIs:** Shopify, Klaviyo, Meta Ads, Google Ads — read scopes by default, write optional.
- **Modeling:** pyGAM/statsmodels GAM + LightGBM (baseline + weather), Robyn or LightweightMMM for media, DoWhy/EconML sanity checks.
- **Optimization:** cvxpy (concave profit curves, CVaR risk, ramp constraints) or linear alternative.
- **Data plane:** DuckDB + Polars on Parquet (delta-rs optional). Redis only if needed.
- **Serving & jobs:** FastAPI API, Prefect OSS orchestration, ONNX Runtime for inference, single small VM/container footprint.
- **Frontend:** Next.js + Tailwind + shadcn/ui, MapLibre GL (cached OSM tiles), ECharts, Framer Motion respecting reduced motion.
- **Tagging:** sentence-transformers MiniLM + CLIP/SigLIP heuristics; round-trip tags through Shopify metafields.
- **Security:** Postgres control plane with RBAC/approvals/audit log; OAuth least-privilege; aggregated geo only.

### Frontend Environment
Set the following env vars when running `apps/web` locally:

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for WeatherVane API (e.g. `http://localhost:8000/v1`) | `http://localhost:8000/v1` |
| `NEXT_PUBLIC_TENANT_ID` | Tenant id used for local previews | `demo-tenant` |
| `NEXT_PUBLIC_OPERATOR_EMAIL` | Email recorded when updating automation settings | `ops@weathervane` |
| `NEXT_PUBLIC_PLAN_HORIZON` | Days to request for the plan view | `7` |

---

### Worker Commands
- Run the end-to-end PoC pipeline:
  ```bash
  python apps/worker/run.py tenant-123 --start 2024-01-01 --end 2024-07-01
  ```
- Perform a retention sweep only (useful for cron/Prefect scheduling). Set `--all-tenants` or pass
  the literal tenant `ALL` to sweep every tenant discovered in the lake, and provide an optional
  webhook to receive notifications when files are purged:
  ```bash
  python apps/worker/run.py ALL --retention-only --retention-days 365 --lake-root storage/lake/raw \
    --all-tenants --retention-webhook-url https://example.test/hooks/retention \
    --retention-summary-root storage/metadata/state \
    --context-root storage/metadata/data_context
  ```
  The worker emits both per-tenant `retention.sweep.completed` notifications and a
  nightly `retention.sweep.summary` aggregate (including tag coverage and warning counts)
  when a webhook URL is supplied.
- Inspect the most recent retention telemetry without running a sweep:
  ```bash
  python apps/worker/run.py --retention-report --retention-summary-root storage/metadata/state
  ```
- Export NDJSON for dashboards:
  ```bash
  make export-observability
  ```
  or use the CLI flag: `python apps/worker/run.py tenant-123 --smoke-test --retention-summary-root storage/metadata/state --export-observability observability/out.json`
- Check connector secrets quickly:
  ```bash
  python apps/worker/maintenance/secrets.py
  ```
  Add `--json` for CI scripts.
  Use `make check-secrets` for a Make shortcut.
- Append a retention sweep after the pipeline by adding `--retention-after` to the first command.
- Register a nightly Prefect deployment:
  ```bash
  prefect deployment build deployments/retention.yaml --apply
  ```
  Adjust the `parameters` block for your tenants before applying.
- Run a PoC smoke test (synthetic data if connectors aren’t configured):
  ```bash
  python apps/worker/run.py tenant-123 --smoke-test
  ```
  The command prints plan status, geocoding coverage, data sources, and ads summaries so you can
  spot missing connectors quickly. Append `--export-observability observability/tenant-123.json`
  (with `--retention-summary-root storage/metadata/state`) to write retention/geocoding telemetry
  that dashboards or BigQuery jobs can consume. Add `--log-file logs/smoke.ndjson` to append structured
  events for Loki/stackdriver ingestion.

---

### API Environment
- `AUTOMATION_WEBHOOK_URL`: optional HTTPS endpoint invoked whenever automation settings change or a tenant submits a privacy export/delete request.

---

---

## Proof-of-Concept Suite (PoC)
> **Proof, not promises:** After connect and backfill, WeatherVane automatically builds a brand-specific, data-backed report that replays the last 12–24 months with archived forecasts. It quantifies missed weather opportunities, shows how budgets could have shifted without increasing spend, and documents every assumption.

### What the PoC Delivers
- **Missed opportunity ledger**: top weather events where sales spiked but spend lagged, with actual vs optimal budgets, incremental profit, and confidence intervals.
- **Spend vs weather heatmaps**: highlight overspend during low-signal periods and underspend when demand was forecastable.
- **Seasonal playbook**: recurring weather regimes per region with recommended product focuses and promo timing.
- **ROAS stability view**: demonstrates how controlling for weather reduces noise in performance measurement.
- **Executive-ready brief**: interactive dashboard, downloadable PDF, and CSV export; methodology appendix cites data sources and model hashes.

### How It Works (Fully Automated)
1. Ingest orders, ads, promos, and weather hindcasts; align by geo and time zone.
2. Learn weather elasticity per category × region controlling for promos and media.
3. Run counterfactual simulations using the MMM + weather model (same total spend).
4. Rank opportunities by incremental profit and confidence; assemble narrative cards (storm missed, heatwave goldmine, promo × weather synergy, etc.).
5. Generate the report, notify stakeholders, and store outputs at `poc_reports/{tenant_id}`.

The PoC uses only data that was knowable at the time (forecast archives), never promises future performance, and proudly reports when weather impact is negligible.

---

## Automation Modes
- **Manual**: WeatherVane never writes to ad platforms. Export CSVs or copy values into your workflow.
- **Assist**: Plans require approval before pushing; diffs and rationales are visible in-app and via notifications.
- **Autopilot**: WeatherVane pushes budgets automatically within guardrails and change windows, logging every action. Exceptions trigger approval.

Switch modes any time. All pushes are auditable and reversible.

---

## Geo Strategy Without Ad Chaos
- WeatherVane groups locations using climate archetypes, current weather regimes, and learned demand responses.
- Each group maps to ad-platform-friendly IDs (Meta city/zip/market, Google location criteria) to stay inside campaign/ad-set limits.
- An “Explore ring” keeps small, promising geos funded without derailing platform learning.

---

## When Ads Are Missing or Messy
- **No ads yet?** Receive an Ad-Kit with targeting, budget, schedule, and creative brief. WeatherVane can create paused drafts or hand you a CSV, depending on permissions.
- **Too many ads?** WeatherVane tags and scores eligible assets, recommends the best fit per weather run, and flags redundant ad sets to avoid diluting spend.
- **Granular approvals?** Define approver roles and escalation paths so every change is reviewed before it hits production.

---

## Architecture Snapshot
- **Services**: ingestion, feature store, model service, allocator, push service, UI/API, observability.
- **Models**: baseline + weather GAM, media mix model with adstock & saturation, weather-modulated elasticity overlay.
- **Allocator**: maximises expected profit under total budget, guardrails, and ramp limits; uses scenario sampling for forecast uncertainty.
- **Storage**: Postgres metadata + Parquet/Delta analytics; shared weather cache for economies of scale.
- **Safety**: Rate-limit aware, audit trails, per-tenant secret management, data deletion/export endpoints.

---

## Getting Started (Developer Preview)
1. Clone the repo and run `make bootstrap` to install dependencies.
2. Start the local stack:
   ```bash
   docker compose up -d
   make api
   make worker
   make web
   ```
3. Visit `http://localhost:3000`, create a test tenant, and connect sandbox accounts.
4. Trigger initial backfill from the Connections page; watch the job log for status.

> **Note:** Sandbox credentials for Meta and Google Ads are required to test write operations safely.

---

## Data Sources & Integrations
- **Shopify** (orders, products, collections, metafields, inventory snapshots, webhooks)
- **Klaviyo** (campaigns, flow sends, discount metadata)
- **Meta Marketing API** (campaign/ad set/ad metrics, geo breakdowns, budget writes)
- **Google Ads API** (campaign/ad group metrics, shared budgets, location targeting)
- **Open-Meteo** (forecast + historical weather, AQI, pollen)
- **OpenAQ** (historical air quality)

All connectors handle backfills, incremental syncs, idempotent retries, and rate-limit etiquette.

---

## Security & Privacy
- OAuth with least privilege scopes; secrets are vaulted and rotated.
- Only aggregated geo data is stored; no individual customer PII is modeled.
- Full data export and deletion are available per tenant; regional data residency can be configured.
- Every platform write is logged with before/after values and rationale.

---

## Roadmap Highlights
- Hourly mode for high-velocity verticals.
- Creative-fit scoring and alerts for weather-relevant assets.
- Additional commerce and ad platform connectors.

---

## Support & Contact
Open a ticket from the in-app Help panel with the plan ID, timestamp, and a short description. For partnership or enterprise enquiries, email `hello@weathervane.app`.
