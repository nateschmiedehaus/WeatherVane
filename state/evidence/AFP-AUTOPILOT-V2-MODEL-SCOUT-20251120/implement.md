# IMPLEMENT - AFP-AUTOPILOT-V2-MODEL-SCOUT-20251120

**Status:** ✅ Scout stub + merge helper + tests added  
**Phase window:** 2025-11-20

## Changes
1) Scout stub (`tools/wvo_mcp/src/brain/model_scout.ts`)  
   - Candidate generation for Gemini 2.0 flash/pro, Claude 3.5 sonnet/haiku, o3 mini/pro, gpt-5-codex with capabilities, lanes, observedAt, context.
   - Maps to merge candidates for registry update with backup.

2) Registry merge helper (`tools/wvo_mcp/src/models/model_registry_merge.ts`)  
   - Recency guard, required fields, provider allowlist, safe defaults to match existing schema.

3) Tests (`tools/wvo_mcp/src/models/model_registry_merge.test.ts`)  
   - Add new provider, update when newer, skip invalid.

## Notes
- No new deps.  
- Guardrail passing.  
- Wave0 dry-run exits cleanly; stale locks auto-removed.
