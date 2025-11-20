# PLAN - AFP-AUTOPILOT-V2-IMMUNE-REMEDIATION-20251119

**Date:** 2025-11-19  
**Author:** Codex

## Approach
- Restore missing modules (llm_chat, kpi_writer) and wave0 demo asset.
- Add missing doc-check script to satisfy hooks.
- Refresh daily audit.
- Rerun targeted tests/guardrails; document wave0 lock status.
- Track repo hygiene; avoid touching unrelated dirty files except to document.

## Files to Change
- `tools/wvo_mcp/src/tools/llm_chat.ts`
- `tools/wvo_mcp/src/telemetry/kpi_writer.ts`
- `tools/state/demos/gol/game_of_life.js`
- `scripts/check_doc_edits.mjs`
- `state/evidence/AFP-ARTIFACT-AUDIT-20251119/summary.md` (new, audit)
- Evidence files for this task

## PLAN-authored tests (to run in VERIFY)
- `cd tools/wvo_mcp && npx vitest run src/immune/gatekeeper.test.ts`
- `cd tools/wvo_mcp && node scripts/check_guardrails.mjs`
- `cd tools/wvo_mcp && npm run wave0 -- --once --epic=WAVE-0 --dry-run`
- `cd tools/wvo_mcp && npm run commit:check` (hygiene check, expected to reflect external dirtiness)

## Milestones
1. Restore modules + demo + doc-check script.
2. Run tests/guardrail/wave0; capture results.
3. Refresh daily audit evidence.
4. Summarize hygiene status and open follow-ups if external.

## Risks/Mitigations
- Wave0 lock present → capture lock error; do not force unlock.
- Guardrail may still fail if other modules missing → document in VERIFY.
- Repo dirty from others → avoid touching unrelated files; document in REVIEW.

## Out of Scope
- Deep wave0 execution fixes beyond missing asset/lock.
- Cleaning unrelated dirty files without owner approval.
