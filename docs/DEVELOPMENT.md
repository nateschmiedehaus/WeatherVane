# WeatherVane Developer Guide

> **Always-on guardrails**
> - Before work begins, ensure the task has documented **Requirements, Standards, Implementation Plan, Deliverables, Integration/Data Flow, Evidence** (`docs/TASK_TEMPLATE.md`, `state/roadmap.yaml`).
> - Execute the **brief → build → critique → evidence** loop for every change and capture results in `state/context.md`.
> - Explicitly state data flows (sources → transforms → outputs/consumers) so integrations stay transparent.

## Prerequisites
- Python 3.11+
- Node.js 18+
- Docker + Docker Compose (optional but recommended)
- Make

## Initial Setup
```bash
cp .env.example .env
make bootstrap
```

This installs Python dependencies in editable mode and installs web dependencies under `apps/web`.
On Apple Silicon (arm64) hosts, `make bootstrap` automatically pins wheels from
`requirements/apple-silicon.lock` to avoid NumPy/SciPy crashes stemming from mismatched
Accelerate/OpenBLAS builds.

### Offline Python bootstrap
If the sandbox prevents outbound PyPI traffic, prepare a wheel cache on a networked host and
sync it to `.wheels/` in the repo:

```bash
pip download -r requirements.txt -d .wheels
```

After copying `.wheels/` into the sandbox, run:

```bash
make bootstrap-offline
```

The target installs every requirement via `pip --no-index --find-links .wheels ...` and
skips the network entirely. Regenerate the cache whenever `requirements*.txt` changes.

### Offline web toolchain bootstrap
If the sandbox blocks outbound npm traffic, seed the offline cache on a machine with
network access and sync the artifacts back into the repo before installing locally:

```bash
# Audit the cache from any host to refresh the missing list
python apps/web/scripts/audit_offline_cache.py \
  --write-missing apps/web/offline-cache/missing-packages.txt

# On a networked host, fetch every missing package into the shared cache
xargs -a apps/web/offline-cache/missing-packages.txt -I{} \
  npm cache add {} --cache apps/web/offline-cache

# Once the cache is hydrated, install in the sandbox without touching the network
npm run install:offline --prefix apps/web
```

The audit step produces a JSON/text report and keeps
`apps/web/offline-cache/missing-packages.txt` aligned with the dependency set (`package.json`
plus devDependencies). Commit the refreshed list so anyone without outbound access can
immediately hydrate the cache from an online machine.

## Running Services Locally
- **API:** `make api` (runs on http://localhost:8000)
- **Web:** `make web` (Next.js dev server on http://localhost:3000)
- **Worker:** `make worker`
- **Model stub:** `make model`

Use `docker-compose up` to start Postgres plus containerised API/web/worker stacks. Source code is mounted for hot reloads.

## Testing & Linting
```bash
make lint
make test
```

Use `make test-py` to run only the Python suites (handy for offline sandboxes that cannot
run the front-end tests).

These run Ruff/ESLint and Pytest/Next.js tests respectively. Formatting helper:
```bash
make format
```

Use `make clean-metrics` (or the automatic call at the end of `make test`) to purge
`tmp/metrics/*` artifacts so repeated local runs do not accumulate stale NDJSON logs.

### Front-end iteration & Playwright coverage

When touching product UI/UX:

1. Write a short design brief (user, question, value proof, success evidence) in `docs/UX_CRITIQUE.md`.
2. Implement the change using plain-language copy—avoid jargon—and structure the screen so a user can answer “What changed and why?” at a glance.
3. Run both Vitest and the Playwright harness:
   ```bash
   npm --prefix apps/web run test
   npm --prefix apps/web run test:ui
   ```
   The Playwright command builds/exports the site and executes the smoke suite. Attach generated evidence (screenshots, report links) to the task context.
4. Capture critic output and iteration notes in `state/context.md`, then repeat the loop (brief → build → critique → evidence) until the latest build feels obvious, minimal, and elegant.

Roadmap tasks that deliver customer-facing UX are considered incomplete until this loop is documented and Playwright passes.

### Machine learning & modelling iteration

For model research, feature engineering, and worker experimentation:

1. **Brief** – Log the hypothesis, target metric(s), datasets, and acceptance criteria in `docs/ML_EXPERIMENTS.md` (or the relevant experiment log). Include links to notebooks or scripts.
2. **Build** – Implement the change in a reproducible script/notebook (`apps/model`, `apps/worker`, `shared/libs`). Version datasets or references in `state/artifacts/experiments/**`.
3. **Critique** – Run the evaluation suite (Pytest, custom bench scripts) plus metrics/plots that prove or disprove the hypothesis. Store outputs under `state/artifacts/{models,experiments}` and summarise results in `state/context.md`.
4. **Evidence** – Link artefacts (metrics JSON, confusion matrices, feature importances, dashboards) and record whether the hypothesis was accepted, refined, or rejected.
5. **Repeat** until the model meets the acceptance criteria or the brief is updated with a new direction.

Model/ML changes must not merge without the recorded brief, evaluation artefacts, and context summary.

## Task Authoring Standards

Before a task is considered ready for execution:

1. Ensure the roadmap entry (or ticket) includes the sections defined in `docs/TASK_TEMPLATE.md`:
   - **Requirements** – user problem, constraints.
   - **Standards** – quality bars for product/design/engineering/ML.
   - **Implementation Plan** – concrete steps, iteration loop, owners.
   - **Deliverables** – code, docs, artifacts.
    - **Integration Points** – APIs/services/contracts affected, stakeholders to notify, and a data flow sketch (sources → transforms → outputs/consumers).
   - **Evidence** – tests, critics, metrics, screenshots.
2. Tasks missing any section should be updated in `state/roadmap.yaml` (or the source planning doc) before work starts.
3. During execution, keep the sections current—mark completed deliverables, attach artefacts, and log decisions in `state/context.md`.

### Worker / PoC Pipeline Dependencies
The worker CLI and PoC pipeline rely on scientific Python packages such as `polars`,
`numpy`, and `scikit-learn`. Install the editable project dependency set before running
`python apps/worker/run.py`:
```bash
pip install -e .[dev]
```
If the real Prefect package cannot be installed, the repository includes a lightweight
shim under `prefect/` so flows can still execute locally. In constrained sandboxes you can
also install wheels into a per-repo directory and adjust `PYTHONPATH`, for example:
```bash
python -m pip install --target .deps polars numpy geohash2
PYTHONPATH=.deps:. python apps/worker/run.py demo-tenant --start 2024-01-01 --end 2024-01-14
```
If native wheels clash with the host BLAS/Accelerate libraries (manifesting as
segmentation faults on import), rebuild the dependencies inside a dedicated virtualenv or
Conda environment instead of the `.deps` shortcut. The allocator runs a pure-Python path by
default and only enables SciPy's differential-evolution solver when
`WEATHERVANE_ENABLE_SCIPY=1` is exported; this avoids linking crashes on constrained hosts.
The time-series helpers expect `lightgbm` linked against `libomp`—ensure
`libomp.dylib` is present (Homebrew `libomp` or a source build with `USE_OPENMP=OFF`) when
running the worker end-to-end. If LightGBM is unavailable, the code falls back to
`HistGradientBoostingRegressor` so toy runs can still succeed, albeit with less accurate
elasticity modelling.

Run a quick end-to-end smoke of the worker + data-context plumbing via:
```bash
make smoke-context
```
This exercises the synthetic tenant path, emits context tags, and is safe to wire into CI.

## Project Layout
- `apps/api`: FastAPI app (routers, config, dependencies)
- `apps/web`: Next.js marketing + app shell
- `apps/worker`: Prefect flows and job runners
- `apps/model`: Model training entrypoints
- `apps/simulator`: Backtest/simulation utilities
- `shared/schemas`: Pydantic models shared across services
- `shared/libs`: Connector stubs, logging utilities, etc.
- `infra`: Infrastructure-as-code (Terraform/Kubernetes placeholders)
- `docker`: Container images for API and web

## Environment Variables
Update `.env` from the example with real credentials for Shopify, Meta Ads, Google Ads, and Klaviyo when wiring connectors. The API reads `CORS_ORIGINS`, `DATABASE_URL`, `LOG_LEVEL`, etc.

### Context warning overrides
Data-context warnings drive the guardrail messaging that appears in the API responses,
webhooks, and UI context panels. By default the shared engine emits warnings for sparse
history, missing ads feeds, weather stubs, and high-null datasets. To customise or extend
these rules, set `CONTEXT_WARNING_RULES` to a JSON array in `.env`:

```env
CONTEXT_WARNING_RULES=[
  {
    "match": "history.short",
    "severity": "info",
    "message": "Coverage is short but acceptable for assisted pushes"
  },
  {
    "match": "catalog.missing",
    "severity": "critical",
    "escalate_for_automation": true,
    "message": "Catalog data unavailable; pause automated pushes until restated"
  }
]
```

Rules inherit missing fields (message/severity/escalation) from the default rule with the
same `match`. New matches are appended to the rule set. `escalate_for_automation` raises
the severity to `critical` whenever Autopilot or automated pushes are enabled.

### Connector state
Incremental connectors (e.g., Shopify orders) persist their cursors in
`storage/metadata/state/<namespace>/<key>.json`. The helper `JsonStateStore` abstracts the
read/write cycle so ingestors can resume from the last `updated_at` without manual wiring.
For local testing, the state directory lives under the repo root; in production point it at
a durable volume.

### Retention sweep automation
Use `python apps/worker/run.py --retention-only` to prune expired Parquet snapshots. Pass
`ALL` (or `--all-tenants`) to sweep every tenant discovered in the lake and set
`--retention-webhook-url` so ops dashboards receive a per-tenant `retention.sweep.completed`
event plus a nightly `retention.sweep.summary` that captures tag coverage and warning counts.
Provide `--retention-summary-root` (for
example `storage/metadata/state`) to persist the aggregate JSON locally for dashboards or
audit review, and `--context-root` when context snapshots live outside the default
`storage/metadata/data_context`. The Prefect deployment template at
`deployments/retention.yaml` defaults to automatic discovery; override the parameters or
inject the webhook URL, summary root, and context root at build time (e.g. with Prefect
blocks or CI secrets) before applying the schedule.
`python apps/worker/run.py --retention-report --retention-summary-root storage/metadata/state`
prints the latest summary on demand; append `--retention-report-day YYYY-MM-DD` to inspect
a specific nightly record.

### Geocoding coverage checks
The PoC pipeline runs `evaluate_geocoding_coverage` after ingestion to ensure the latest
orders snapshot carries geohashes. The helper stores a JSON report under
`storage/metadata/state/geocoding/<tenant>.json` with the sampled path, coverage ratio, and
status (`ok`, `warning`, `critical`, etc.). Context tags (`geo.partial`, `geo.missing`) and the
pipeline response both surface the result so operators can intervene before weather joins
degrade.

### Smoke testing the pipeline
Use `python apps/worker/run.py <tenant> --smoke-test` to execute the PoC pipeline end-to-end. The
command prints a JSON summary containing plan status, ingestion sources, row counts, and geocoding
coverage so you can diagnose missing connectors or degraded telemetry quickly. Without real API
credentials the pipeline falls back to synthetic stubs, which is fine for local Apple Silicon runs.

Run the same check via `make smoke-pipeline` if you prefer Make shortcuts. The command uses the
`.deps` virtual wheel directory so it behaves consistently with `make test` on Apple Silicon.
The repo tracks the expected interpreter for `.deps` inside `python-toolchain.toml`; use
`./scripts/python_toolchain.sh` (or the `PYTHON_BIN` Make variable) to guarantee that the
selected Python matches the vendored ABI before running any Make target.
Add `--log-file logs/smoke.ndjson` (or set `LOG_FILE` env) to capture NDJSON entries for observability
pipelines.

### Ingest→Feature→Plan harness
- Synthetic path: `PYTHONPATH=.deps:. pytest tests/worker/ingest_to_plan_live/test_live_connectors.py::test_ingest_to_plan_harness_synthetic`
  spins a tenant through ingest, feature, and plan stages using the stub connectors bundled with the repo.
- Live path: export Shopify/Meta/Google Ads credentials (`SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`,
  `META_ACCESS_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `GOOGLEADS_DEVELOPER_TOKEN`, `GOOGLEADS_CUSTOMER_ID`,
  `GOOGLEADS_REFRESH_TOKEN`, `GOOGLEADS_OAUTH_CLIENT_ID`, `GOOGLEADS_OAUTH_CLIENT_SECRET`) plus
  `HARNESS_LIVE_TENANT`, then run `PYTHONPATH=.deps:. pytest -m "not slow" tests/worker/ingest_to_plan_live -k live`.
  Tests skip automatically when credentials are absent.
- Metrics land under `tmp/metrics/<timestamp>/metrics.jsonl` by default; set `METRICS_OUTPUT_DIR` to override or
  inspect per-run directories emitted by `shared.observability.metrics`. Events:
  - `harness.summary` carries plan/geocoding status, connector sources, and dataset row counts.
  - `harness.guardrails` records allocation diagnostics (MAE/RMSE/quantile width).
  - `harness.window` logs the modeling lookback window.
  - `harness.retention` fires when the harness triggers a retention sweep.
- Tune lookback and retention knobs via env:
  - `HARNESS_SYNTHETIC_LOOKBACK_DAYS` / `HARNESS_LIVE_LOOKBACK_DAYS` (default 30)
  - `HARNESS_RETENTION_DAYS` (default 365) and `HARNESS_LIVE_TENANT` / `HARNESS_SYNTHETIC_TENANT`.
- Harness helpers reuse the production `FeatureBuilder` to validate gradient-boosted defaults and weather joins.
  After a run, inspect feature projections with `python -q <<'PY' ...` or rehydrate via
  `FeatureBuilder().build(<tenant>, start, end)` to debug anomalies surfaced by the tests.

### Dashboard exports
Use `make export-observability` (or invoke `python apps/worker/maintenance/export_observability.py`) to
write `retention.ndjson` and `geocoding.ndjson` under `observability/latest/`. These files are structured
for direct ingestion into BigQuery or Loki; the roadmap calls for wiring this export into a scheduled job.

### Secrets checklist
Run `python apps/worker/maintenance/secrets.py` (or `make check-secrets`) to verify required connector secrets are present in your
environment. The command highlights missing required values (Shopify tokens/domains) and optional but
recommended credentials (Meta, Google Ads, Klaviyo). Use `--json` for CI-friendly output.

### MCP worker pool
- `WVO_WORKER_COUNT=<n>` opts the MCP runtime into spawning `n` executor processes alongside the orchestrator (defaults to `WVO_CODEX_WORKERS` when unset, `0` disables the pool).
- Executors expose a slim tool surface (`cmd_run`, `fs_read`, `fs_write`) and never mutate roadmap state; the orchestrator worker remains the single writer so the state machine stays consistent.
- Inspect `worker_health` (or `state/analytics/worker_manager.json`) to confirm `executors` are reporting; degraded status usually means the pool is undersized or an executor failed to boot.

## Next Steps Checklist
- Implement real connector clients under `shared/libs/connectors`.
- Add persistence layer (SQLAlchemy models, Alembic migrations).
- Flesh out worker flows for ingestion, modeling, and allocation.
- Connect frontend pages to live API endpoints.
- Expand end-to-end tests and CI pipeline.
