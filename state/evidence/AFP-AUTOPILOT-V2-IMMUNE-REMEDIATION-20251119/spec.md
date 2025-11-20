# SPEC - AFP-AUTOPILOT-V2-IMMUNE-REMEDIATION-20251119

**Created:** 2025-11-19T23:21:00Z  
**Phase:** SPEC

## Acceptance Criteria (Must)
- Restore missing modules so `npm run test -- --filter gatekeeper` (or equivalent direct Vitest) runs without missing-module errors.
- Guardrail monitor (`node tools/wvo_mcp/scripts/check_guardrails.mjs`) completes without missing-module/audit failures.
- Wave0 dry-run (`npm run wave0 -- --once --epic=WAVE-0 --dry-run`) no longer fails due to missing demo file; if lock exists, surface lock message only.
- Daily audit refreshed with evidence under `state/evidence/AFP-ARTIFACT-AUDIT-20251119/summary.md`.
- Doc-check hook file `scripts/check_doc_edits.mjs` present to satisfy pre-commit hook.
- Repo hygiene status captured and outstanding dirty items resolved or documented.

## Acceptance Criteria (Should)
- commit:check shows no new hygiene violations tied to this work.
- New/changed files ≤5 functional files (evidence excluded) and ≤150 net LOC if feasible.

## Acceptance Criteria (Could)
- Improve test invocation to avoid CLI flag errors (use direct Vitest path).

## Functional Requirements
- FR1: `llm_chat.ts` exists and builds; FR2: `kpi_writer.ts` exports `writePhaseKpis`; FR3: wave0 demo file present; FR4: doc-check script exists; FR5: guardrail monitor passes.

## Non-Functional
- No new dependencies; minimal surface area; clear error messages.
