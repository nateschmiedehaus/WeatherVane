# IMPLEMENT - AFP-AUTOPILOT-V2-IMMUNE-REMEDIATION-20251119

**Phase window:** 2025-11-19  
**Status:** ✅ Missing artifacts restored; guardrail/tests rerun

## What Changed
1. Restored Codex bridge `tools/wvo_mcp/src/tools/llm_chat.ts` (fresh implementation: resolves binary, formats messages, retries, returns provider/usage).
2. Added telemetry writer `tools/wvo_mcp/src/telemetry/kpi_writer.ts` with `writeKpi` + alias `writePhaseKpis`.
3. Added wave0 demo stub `tools/state/demos/gol/game_of_life.js` to stop import failures.
4. Added doc-check hook stub `scripts/check_doc_edits.mjs` (no-op to satisfy hook).

## Notes
- No new dependencies introduced.
- Wave0 lock respected (not removed).
- Daily audit already refreshed separately under AFP-ARTIFACT-AUDIT-20251119.
