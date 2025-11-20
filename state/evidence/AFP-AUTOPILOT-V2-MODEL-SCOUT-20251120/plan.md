# PLAN - AFP-AUTOPILOT-V2-MODEL-SCOUT-20251120

**Date:** 2025-11-20  
**Author:** Codex

## Approach
- Implement a Scout module that assembles candidate models from provider seeds (mocked if needed) and merges into registry with recency/version safeguards.
- Keep changes small; use existing `state/models/registry.json` as source of truth.
- Add tests for merge/update and Scout dry-run.

## Files to Change
- `tools/wvo_mcp/src/brain/model_registry.ts` (extend merge + recency)
- `tools/wvo_mcp/src/brain/model_scout.ts` (new; gathers candidates)
- `tools/wvo_mcp/src/brain/model_registry.test.ts` or new test file
- Evidence under `state/evidence/AFP-AUTOPILOT-V2-MODEL-SCOUT-20251120/`

## PLAN-authored tests (VERIFY)
- `cd tools/wvo_mcp && npx vitest run src/brain/model_registry.test.ts`
- If new test file: `npx vitest run src/brain/model_scout.test.ts`
- `node tools/wvo_mcp/scripts/check_guardrails.mjs` (ensure pass)
- Wave 0 live smoke (after registry update): `cd tools/wvo_mcp && npm run wave0 -- --once --epic=WAVE-0 --dry-run` (expect clean exit; document lock/queue state)

## Milestones
1) Add Scout module (static provider seeds or stubbed fetch) generating candidate list with metadata.
2) Enhance registry merge with recency/version guard and capability tags completeness checks.
3) Add Vitest coverage for merge/update/no-op and Scout candidate generation.
4) Run tests/guardrail; stage evidence; commit/push.

## Risks/Mitigations
- Live fetch unavailable → use stubbed provider data; document.  
- Overwriting good entries → recency/version check to only upgrade newer.  
- LOC/file cap → keep implementation concise; defer benchmarks if needed.

## Out of Scope
- Full benchmark ingestion pipeline; real network fetch (mock only if required).
