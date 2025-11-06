# IMPLEMENT — AFP-GUARDRAIL-HARDENING-20251106

## Summary
- Added a guardrail monitor CLI (`tools/wvo_mcp/scripts/check_guardrails.mjs`) that runs ProcessCritic regression tests, override rotation, daily audit freshness checks, and Wave 0 proof evidence validation, then logs telemetry to `state/analytics/guardrail_compliance.jsonl`.
- Introduced a CI workflow (`.github/workflows/guardrails.yml`) to execute the monitor on every PR and daily via cron.
- Updated policy docs/checklists/templates to reference the new monitor so agents run it locally and reviewers know the exit criteria include a passing guardrail check.

## Commands Executed
- `node tools/wvo_mcp/scripts/check_guardrails.mjs --dry-run`
- `node tools/wvo_mcp/scripts/check_guardrails.mjs`
  - (Internally ran `npm --prefix tools/wvo_mcp run test -- process_critic` and rotation/audit checks.)

## Artefacts
- `state/analytics/guardrail_compliance.jsonl` — new telemetry entry for the monitor run.
- Documentation updates in `AGENTS.md`, `claude.md`, `MANDATORY_WORK_CHECKLIST.md`, `docs/MANDATORY_VERIFICATION_LOOP.md`, `docs/checklists/daily_artifact_health.md`, `docs/templates/daily_artifact_health_template.md`, `docs/concepts/afp_work_phases.md`, and `docs/agent_library/common/processes/task_lifecycle.md` describing the guardrail requirement.
