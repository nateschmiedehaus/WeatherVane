# PLAN: AFP-PROCESS-CRITIC-20251106

## Architecture / Approach
- Add a new `ProcessCritic` under `tools/wvo_mcp/src/critics/` that inspects staged PLAN documents and staged diffs to enforce PLAN-authored tests (no deferrals / placeholders) and to block new tests that are not referenced by any plan.
- Cache plan documents to cross-reference test paths, avoiding repeated disk reads.
- Integrate the critic with `Session.runCritics` so MCP/autopilot runs include it, and expose a dedicated CLI (`tools/wvo_mcp/scripts/run_process_critic.mjs`) invoked from pre-commit.
- Update the pre-commit hook to run the critic after LOC/Files guardrails so violations block commits early.
- Add Vitest coverage exercising happy path plus failure scenarios (missing tests, deferrals, doc-only cases, and new tests without plan coverage).

## Files to Change
- `tools/wvo_mcp/src/critics/process.ts` (new critic implementation)
- `tools/wvo_mcp/src/critics/__tests__/process_critic.test.ts` (Vitest suite)
- `tools/wvo_mcp/src/session.ts` (register critic key `process_guard`)
- `tools/wvo_mcp/scripts/run_process_critic.mjs` (CLI entry used by hooks/agents)
- `.githooks/pre-commit` (invoke `node tools/wvo_mcp/scripts/run_process_critic.mjs`)
- Follow-on doc updates (`AGENTS.md`, `tools/wvo_mcp/CLAUDE_CODE_SETUP.md`) to broadcast enforcement

## Sequence
1. Sketch critic heuristics (tests section parsing, deferral detection, staged diff analysis).
2. Implement `ProcessCritic` with plan caching, staged diff inspection, and structured issue reporting.
3. Create CLI runner used by pre-commit and ensure failure codes propagate.
4. Register critic in `Session` (`process_guard`) and add Vitest coverage for key scenarios.
5. Update pre-commit hook and agent docs so violations block commits and expectations are clear.

## Implementation Plan

**Scope:**
- PLAN-authored tests: `tools/wvo_mcp/src/critics/__tests__/process_critic.test.ts` (covers missing tests section, deferrals, docs-only justification, concrete tests, new test detection)
- PLAN-authored tests: Manual smoke `node tools/wvo_mcp/scripts/run_process_critic.mjs` on staged examples to confirm hook behaviour
- Estimated LOC: +140 -0 = net +140 LOC
- Micro-batching note: touches ~8 files (critic, test, session, pre-commit, CLI, identities, AGENTS, Claude setup). Accept trade-off because enforcement + communication must land together.

## Risks & Mitigations
- **Risk:** False positives on docs-only tasks → require explicit `docs-only` phrasing alongside `N/A`.
- **Risk:** Critic runtime too slow → cache plan documents and avoid running when no staged changes exist.
- **Risk:** Legitimate implementation commits adding new tests but plan already contains them → search existing plan documents for the test path before blocking.
- **Risk:** Developers surprised by new enforcement → update AGENTS/autop instructions and include actionable remediation guidance in critic output.
