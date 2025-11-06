# SPEC: AFP-AUTOPILOT-LIVE-ENFORCEMENT-20251106

## Acceptance Criteria
- Process documentation (AGENTS, claude.md, mandatory checklists, verification loop) explicitly requires live Wave 0 autopilot testing for any autopilot feature task and states tests must be authored in PLAN.
- Mechanical enforcement prevents commits that modify autopilot code without simultaneously staging plan updates describing live Wave 0 testing.
- Mechanical enforcement blocks PLAN documents for autopilot tasks if tests are deferred, placeholders, or lack Wave 0/live-autopilot commands.
- Existing autopilot integration plan (`AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION/plan.md`) is updated to include explicit live Wave 0 testing steps.

## Functional Requirements
- Extend ProcessCritic to detect autopilot-related staged changes and require PLAN updates plus Wave 0 test commands.
- Extend ProcessCritic to ensure PLAN tests mentioning autopilot include Wave 0/live-run keywords.
- Update CLI runner and pre-commit hook to execute the new logic.
- Add vitest coverage for new enforcement scenarios (missing live test keyword, docs-only, autopilot code without plan update, compliant plan).
- Update agent-facing documentation to describe the new mandatory Wave 0 live testing workflow.

## Non-Functional Requirements
- Critic runtime remains under ~2 seconds on typical diffs (cache plan docs, skip when no staged changes).
- False positives minimised via explicit docs-only allowance and robust keyword lists.
- All changes align with AFP guardrails (≤150 net LOC target, ≤5 files per sub-task where possible).

## Out of Scope
- Automating the actual Wave 0 run (still manual/external script).
- Retrofitting historical tasks beyond updating `AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION` plan.
- Broader refactors of autopilot code beyond enforcement hooks.
