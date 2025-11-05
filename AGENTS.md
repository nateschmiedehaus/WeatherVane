# Repository Guidelines

## ⚠️ STOP: Before Making ANY Code Changes

**Read `MANDATORY_WORK_CHECKLIST.md` NOW. Do not proceed without checking all boxes.**

### AFP 10-Phase Lifecycle (MANDATORY)

**DO NOT SKIP TO IMPLEMENTATION.** Follow this sequence:

1. **STRATEGIZE** - Understand WHY (not just WHAT)
   - Document: Problem analysis, root cause, goal

2. **SPEC** - Define requirements
   - Document: Acceptance criteria, functional + non-functional requirements

3. **PLAN** - Design approach
   - Document: Architecture, files to change, module structure

4. **THINK** - Reason through solution
   - Document: Edge cases, failure modes, AFP/SCAS validation

5. **[GATE]** ← CHECKPOINT - Verify phases 1-4 complete
   - **REQUIRED**: For non-trivial changes (>2 files or >50 LOC), create:
   - `state/evidence/[TASK-ID]/phases.md` documenting phases 1-4
   - **Pre-commit hook will BLOCK without this evidence**

6. **IMPLEMENT** - Write code (NOW you can code)
   - Constraints: ≤5 files, ≤150 net LOC, refactor not patch

7. **VERIFY** - Test it works
   - See `MANDATORY_VERIFICATION_LOOP.md` for full requirements

8. **REVIEW** - Quality check
   - Verify phase compliance, run integrity tests

9. **PR** - Human review
   - Use `.github/pull_request_template.md`

10. **MONITOR** - Track results

### AFP/SCAS Constraints (Enforced by Hook)

- **≤5 files changed** (if more, split the task)
- **≤150 net LOC** (additions minus deletions - prefer deletion!)
- **Refactor, don't patch**: If file >200 LOC or function >50 LOC, refactor the entire module
- **Via negativa**: Always consider deletion/simplification before adding
- **No complexity increase**: Unless strongly justified

**Pre-commit hook will BLOCK commits that violate these limits.**

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
