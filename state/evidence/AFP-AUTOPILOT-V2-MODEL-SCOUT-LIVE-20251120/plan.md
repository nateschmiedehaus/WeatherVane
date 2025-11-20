# PLAN - AFP-AUTOPILOT-V2-MODEL-SCOUT-LIVE-20251120

**Goal:** Replace stub Scout with live provider discovery/benchmarks while keeping recency/validation guards.

## Files to Change
- `tools/wvo_mcp/src/brain/model_scout.ts` (live provider adapters/config)
- `tools/wvo_mcp/src/models/model_registry_merge.ts` (if needed for benchmarks)
- `tools/wvo_mcp/src/models/model_registry_merge.test.ts` (tests)
- Evidence files under this task

## PLAN-authored tests (VERIFY)
- `cd tools/wvo_mcp && npx vitest run src/models/model_registry_merge.test.ts`
- `cd tools/wvo_mcp && node scripts/check_guardrails.mjs`
- `cd tools/wvo_mcp && npm run wave0 -- --once --epic=WAVE-0 --dry-run` (Wave0 live smoke post-change)

## Approach
- Add provider adapters (config-driven, mock if network unavailable) to fetch latest models + optional benchmarks.
- Merge with recency/version guard; ensure required metadata.
- Keep LOC ≤150, files ≤5 per batch.

## Risks/Mitigations
- Network blocked -> allow cached/mock data; document.
- Schema divergence -> validate fields before merge.
- Overwrite risk -> keep recency guard; backup registry.
