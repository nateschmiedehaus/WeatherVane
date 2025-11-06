# SPEC: AFP-PROCESS-CRITIC-20251106

## Acceptance Criteria
- ProcessCritic automatically fails when:
  - `plan.md` lacks a `PLAN-authored tests` entry, contains placeholders, or defers tests to the future.
  - Tests are marked `N/A` without a docs-only justification.
  - New test files are staged but no plan references them (and no plan update is staged).
- Critic emits actionable remediation guidance (which plan to update / what to fix).
- Pre-commit hook runs ProcessCritic and blocks commits that violate the guardrails.
- MCP `critics_run` includes the new critic so autopilot agents respect the policy.
- Agent-facing docs mention the automated enforcement.

## Functional Requirements
- Implement `ProcessCritic` under `tools/wvo_mcp/src/critics/process.ts` with:
  - Plan parsing (tests section extraction, deferral detection, docs-only handling).
  - Git staged diff inspection to identify new test files.
  - Cached plan document lookup to validate existing references.
- Register the critic in `Session` (key: `process_guard`).
- Add CLI runner `tools/wvo_mcp/scripts/run_process_critic.mjs` returning non-zero on failure.
- Update `.githooks/pre-commit` to call the CLI after existing guardrails.
- Provide Vitest coverage for success/failure scenarios.

## Non-Functional Requirements
- Runtime target ≤ ~2s for typical staging sets (cache plan docs, skip when nothing staged).
- Clear error messaging (JSON list of issues) to help agents remediate quickly.
- No additional dependencies beyond existing toolchain.

## Out of Scope
- Semantic validation of test quality (only presence/timing enforcement).
- Refactoring existing critics or hook infrastructure beyond adding the new check.
