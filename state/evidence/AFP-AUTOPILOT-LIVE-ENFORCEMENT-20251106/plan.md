# PLAN: AFP-AUTOPILOT-LIVE-ENFORCEMENT-20251106

## Architecture / Approach
- Extend ProcessCritic to watch staged diffs for autopilot code paths and enforce PLAN updates with Wave 0 live testing requirements.
- Augment ProcessCritic PLAN parsing with Wave 0 keyword detection; fail when autopilot tasks defer, placeholder, or omit live testing.
- Keep CLI runner (pre-commit) in sync with TypeScript critic logic.
- Update agent docs (AGENTS.md, claude.md, checklists) to state the Wave 0 live testing mandate.
- Patch the `AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION` plan tests to include explicit live Wave 0 loop commands.

## Files to Change
- `tools/wvo_mcp/src/critics/process.ts`
- `tools/wvo_mcp/src/critics/__tests__/process_critic.test.ts`
- `tools/wvo_mcp/scripts/run_process_critic.mjs`
- `.githooks/pre-commit`
- `tools/wvo_mcp/config/critic_identities.json`
- `AGENTS.md`, `claude.md`, `MANDATORY_WORK_CHECKLIST.md`, `docs/MANDATORY_VERIFICATION_LOOP.md`
- `docs/concepts/afp_work_phases.md`, `docs/agent_library/common/processes/task_lifecycle.md`, `docs/templates/design_template.md`
- `tools/wvo_mcp/CLAUDE_CODE_SETUP.md`, `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`
- `state/evidence/AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION/plan.md`

## Implementation Plan

**Scope:**
- PLAN-authored tests: `tools/wvo_mcp/src/critics/__tests__/process_critic.test.ts` (new cases: autopilot keyword missing/present, docs-only, autopilot code without plan).
- PLAN-authored tests: Manual smoke via `node tools/wvo_mcp/scripts/run_process_critic.mjs` on staged autopilot files to verify enforcement.
- Estimated LOC: ~180 additions / small deletions (within AFP limits after removal where possible).
- Micro-batching: touches >5 files due to cross-cutting policy + enforcement; documented in plan and necessary to align docs + guardrails.

**Sequence:**
1. Implement ProcessCritic enhancements (autopilot detection + Wave 0 keyword enforcement + autopilot code -> plan requirement).
2. Mirror logic in CLI runner and add vitest coverage for new scenarios.
3. Update pre-commit hook to continue calling CLI runner (already in place, ensure message clarity).
4. Update agent documentation and templates with Wave 0 live testing mandate.
5. Patch `AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION` plan tests to describe live run.
6. Run critic unit tests, ProcessCritic CLI smoke, and document results.

## Risks & Mitigations
- **False positives on non-autopilot work mentioning “autopilot”.** → Use combined keywords (autopilot/wave0/supervisor) and allow docs-only override.
- **Developers surprised by new blocker.** → Broadcast via doc updates and critic guidance.
- **Performance overhead on large repos.** → Cache plan docs and short-circuit when no staged diffs.
- **Wave 0 keyword list becomes outdated.** → Document procedure to extend keywords; monitor failures.
