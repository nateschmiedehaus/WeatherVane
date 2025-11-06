# Plan — AFP-EXECUTION-TAGGING-20251106

## Architecture / Approach
- Persist execution metadata in `state/evidence/<TASK-ID>/metadata.json`.
- Extend Wave 0 runner to update metadata automatically after task completion.
- Provide a Node CLI (`set_execution_mode.mjs`) for manual tagging.
- Update operational docs so humans know to tag tasks.

## Files to Change
- `tools/wvo_mcp/src/wave0/runner.ts`
- `tools/wvo_mcp/scripts/set_execution_mode.mjs` (new)
- Documentation: `AGENTS.md`, `claude.md`, `docs/checklists/daily_artifact_health.md`
- Evidence: `state/evidence/AFP-EXECUTION-TAGGING-20251106/*`

## PLAN-authored Tests
- `npm --prefix tools/wvo_mcp run build` — ensure Wave 0 changes compile.
- `WAVE0_RATE_LIMIT_MS=100 WAVE0_EMPTY_RETRY_LIMIT=1 npm run wave0` (smoke) — verify metadata shows `autopilot`.
- `node tools/wvo_mcp/scripts/set_execution_mode.mjs AFP-EXECUTION-TAGGING-20251106 manual` — ensure manual tagging works (dry-run on our new task).

## Implementation Steps
1. Add helper in Wave 0 runner to write/update metadata JSON.
2. Create CLI script for manual tagging with validation.
3. Update docs/checklists to require tagging.
4. Smoke test Wave 0 + script; capture evidence.

## Risks & Mitigations
- **Concurrent metadata updates**: keep write simple (overwrite JSON) — acceptable given infrequent updates.
- **ID typos**: CLI should fail loudly when evidence folder missing.
- **Docs drift**: mention tagging in checklists to keep  process consistent.
