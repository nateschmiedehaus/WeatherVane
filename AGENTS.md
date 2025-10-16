# Repository Guidelines

## Operational Checklist
- Call MCP tools `plan_next` (with `minimal=true`) and `autopilot_status` at the start of every session; the latter now reports consensus staffing insights and token pressure. Restart the MCP (`./tools/wvo_mcp/scripts/restart_mcp.sh`) if either call fails.
- Route follow-up tasks created by the consensus engine (critical or non-quorum decisions) to Atlas or Director Dana instead of bypassing review.
- Run the consolidated test batch via `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` so TestsCritic sees the real pass/fail state; do not rely on piecemeal `make test`.
- Keep `state/context.md` concise (<1000 words). `TokenEfficiencyManager` trims overflow automatically and stores backups in `state/backups/context/`; review before restoring.

## Project Structure & Module Organization
- `apps/api/` – FastAPI services, routes, config, and database layer (`apps/api/services`, `apps/api/routes`).
- `apps/web/` – Next.js front-end (`pages/`, `lib/`, `styles/`) with shared components under `components/`.
- `apps/worker/` – Prefect flows, ingestion jobs, and maintenance tasks (e.g., `poc_pipeline.py`, `maintenance/retention.py`).
- `shared/` – Cross-cutting libraries (connectors, data-context, feature store, storage helpers, schemas).
- `tests/` – Pytest suites mirroring module layout; integration tests live alongside unit tests.
- `docs/` – Living product docs (`ROADMAP.md`, `DEVELOPMENT.md`, etc.).

## Build, Test, and Development Commands
- `make api` / `make web` / `make worker` – Run API, front-end, and worker dev servers with hot reload.
- `make lint` – Execute Ruff + ESLint checks.
- `make test` – Run Python pytest suites (API, worker, shared libs).
- `make smoke-context` – End-to-end synthetic run exercising data-context tagging.
- `python apps/worker/run.py tenant-id` – Launch Plan & Proof pipeline; append `--retention-only` or `--retention-after` for retention sweeps.

## Coding Style & Naming Conventions
- Python: PEP 8 with Ruff/Black defaults; prefer snake_case for functions/variables, PascalCase for classes.
- TypeScript/React: JSX with ESLint/Prettier settings; camelCase for functions/props, PascalCase for components.
- YAML/JSON: two-space indent, kebab-case keys for deployment manifests (e.g., `deployments/retention.yaml`).

## Testing Guidelines
- Pytest drives back-end and worker tests; Next.js relies on Jest/Playwright when added.
- Name tests `test_<module>.py` and mirror source hierarchy.
- Run targeted suites via `PYTHONPATH=.deps:. pytest tests/<path>`; prefer marking integration tests with `@pytest.mark.asyncio` where needed.
- Maintain coverage for critical flows: ingestion, modeling, allocator, API serialization.

## Commit & Pull Request Guidelines
- Write commits in present tense with concise scope tags (e.g., `worker: add retention webhook`); group related changes.
- Ensure commits lint and test clean locally before pushing.
- PRs should include: summary of changes, test evidence (`make test` output or screenshots for UI), linked Jira/GitHub issues, and rollout notes if config/secrets change.
- Request review from owners of touched modules (`apps/api`, `apps/web`, `shared/`); tag security/data stewards when modifying retention or connector logic.

## Security & Configuration Tips
- Secrets (Shopify tokens, OAuth creds) live in environment variables; never commit `.env` files.
- Use `JsonStateStore` for connector cursors and verify geocoding coverage metrics before enabling Autopilot for a tenant.
