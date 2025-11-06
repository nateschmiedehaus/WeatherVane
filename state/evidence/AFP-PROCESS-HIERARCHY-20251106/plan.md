# PLAN: AFP-PROCESS-HIERARCHY-20251106

## Architecture / Approach
- Align top-level and internal process docs to match the PLAN-before-VERIFY testing requirement established previously.
- Make concise wording changes without reformatting large sections.
- After edits, sanity-check impacted docs and re-run `plan_next` minimal to confirm roadmap parsing remains healthy.

## Files to Change
- `claude.md`
- `docs/concepts/afp_work_phases.md`
- `docs/agent_library/common/processes/task_lifecycle.md`

## Sequence
1. Update `claude.md` Phase 3/7 descriptions and verification loop preamble.
2. Update PLAN/VERIFY sections and examples in `docs/concepts/afp_work_phases.md` to embed the earlier testing requirement.
3. Update instruction steps in `docs/agent_library/common/processes/task_lifecycle.md` so tests are authored before implementation and VERIFY only runs them.
4. Re-read documents for consistency and mention exceptions (e.g., docs-only) where appropriate.
5. Run `node tools/wvo_mcp/scripts/mcp_tool_cli.mjs plan_next '{"minimal":true}'` to ensure roadmap operations unaffected.

## PLAN-authored Tests
- N/A (docs-only change) — this task updates process documentation; no executable code.
- Manual validation: `node tools/wvo_mcp/scripts/mcp_tool_cli.mjs plan_next '{"minimal":true}'` to confirm roadmap parsing unaffected.
- Manual validation: `rg "PLAN-authored tests"` across docs to ensure messaging consistent post-edit.

## Risks & Mitigations
- **Risk:** Missed references elsewhere → Mitigation: use `rg "Write tests"` to ensure no conflicting guidance remains.
- **Risk:** Tone drift in different docs → Mitigation: adapt phrasing per document style.
- **Risk:** Large changes trigger critic failures later → Mitigation: keep edits minimal and focused.
