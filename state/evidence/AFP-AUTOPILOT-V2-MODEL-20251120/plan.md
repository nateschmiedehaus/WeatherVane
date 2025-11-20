# PLAN - AFP-AUTOPILOT-V2-MODEL-20251120

**Date:** 2025-11-20
**Author:** Codex

## Approach
- Extend model registry schema to include Gemini and o3 with capability tags.
- Embed latest model seeds and capability-based helpers for Fast/Standard/Deep lanes.
- Add lane helpers in ModelManager; add Scout hook for refresh.
- Validate with unit tests for lane selection and defaults.

## Files to Change
- tools/wvo_mcp/src/models/model_registry.ts
- tools/wvo_mcp/src/models/model_manager.ts
- tools/wvo_mcp/src/models/model_discovery.ts (Scout hook / provider entries)
- tools/wvo_mcp/src/models/model_registry.test.ts (new test)
- Evidence under state/evidence/AFP-AUTOPILOT-V2-MODEL-20251120/

## PLAN-authored tests (to run in VERIFY)
- `cd tools/wvo_mcp && npx vitest run src/models/model_registry.test.ts`
- `cd tools/wvo_mcp && node scripts/check_guardrails.mjs` (ensure unaffected)
- `cd tools/wvo_mcp && npm run commit:check` (hygiene status capture)
- Live check (autopilot scope): `cd tools/wvo_mcp && npm run wave0 -- --once --epic=WAVE-0 --dry-run` (document lock/blockers if any)
- Daily audit: ensure audit <24h fresh before guardrail (run AFP-ARTIFACT-AUDIT-YYYYMMDD if stale)

## Milestones
1) Schema/capability additions + seeds.
2) Lane helpers in model_manager + Scout hook in discovery.
3) Unit test creation and run.
4) Evidence + critics + commit/push.

## Risks / Mitigations
- LOC/5-file cap: keep changes tight; avoid new files beyond test.
- Discovery API unavailable: use seeds + stub Scout.
- Existing build fragility: run targeted vitest; document other suite issues if any.

## Out of Scope
- Full router integration beyond lane helpers.
- External API calls for live discovery.
