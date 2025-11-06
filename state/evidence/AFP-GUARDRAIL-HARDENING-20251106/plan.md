# Plan — AFP-GUARDRAIL-HARDENING-20251106

## Architecture / Approach
- Build a guardrail monitor CLI (likely `node tools/wvo_mcp/scripts/check_guardrails.mjs`) that orchestrates ProcessCritic, rotate_overrides, daily audit, and proof smoke.
- Record compliance telemetry in JSONL and expose it for CI artefacts.
- Extend TaskFlow/Wave 0 to open remediation tasks automatically when monitor fails.
- Add regression tests ensuring docs/templates keep PLAN-authored test guidance.

## Files to Change
- `tools/wvo_mcp/scripts/check_guardrails.mjs` (new orchestrator)
- CI workflow (e.g., `.github/workflows/guardrails.yml`)
- `tools/wvo_mcp/src/critics/process.ts` (optional hooks for machine-readable output)
- `docs/checklists/daily_artifact_health.md`, templates, etc. (add references to monitor)
- TaskFlow/Wave 0 scripts (auto-remediation integration)
- Telemetry storage: `state/analytics/guardrail_compliance.jsonl`

## PLAN-authored Tests
PLAN-authored tests:
- `npm --prefix tools/wvo_mcp run test -- process_critic` — ensure critic behaviour remains green under orchestration.
- `node tools/wvo_mcp/scripts/check_guardrails.mjs --dry-run` — monitor smoke test (used in CI & locally).
- `npm --prefix tools/wvo_mcp run lint` (if applicable) to cover new scripts.
- CI execution: GitHub Actions job running `check_guardrails.mjs` and storing JSON artefact.
- Manual: Trigger TaskFlow autopilot to confirm remediation task creation when guardrails fail.

## Implementation Steps
1. Prototype guardrail monitor script (aggregates existing commands, returns non-zero on failure).
2. Update ProcessCritic/rotation scripts to emit machine-readable summaries (JSON).
3. Add telemetry writer for compliance JSONL; ensure daily audit updates feed it.
4. Create CI workflow running the monitor; publish artefacts.
5. Integrate monitor failure with TaskFlow/Wave 0 to auto-open remediation tasks.
6. Add regression tests validating docs/templates retain PLAN-authored test references.

## Risks & Mitigations
- **False positives**: provide `--allow-waiver` or CI annotations describing fix, plus detailed JSON output.
- **Performance**: allow proof smoke mode for CI (`--proof-smoke`) to avoid long runs.
- **CI-only coverage**: ensure monitor can run locally so agents see failures before pushing.
