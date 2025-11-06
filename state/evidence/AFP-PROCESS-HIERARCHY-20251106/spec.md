# SPEC: AFP-PROCESS-HIERARCHY-20251106

## Acceptance Criteria
- All higher-level process guides (claude.md, docs/concepts/afp_work_phases.md, docs/agent_library/common/processes/task_lifecycle.md) state that verification tests must be authored at least one phase before VERIFY (during PLAN) and clarify VERIFY is execution-only.
- Any references to writing tests during IMPLEMENT or VERIFY are updated to align with PLAN-authored tests requirement while allowing failing/skipped placeholders noted in PLAN.
- Documentation includes guidance on how to handle exceptions (e.g., docs-only work) without contradicting the new policy.
- PlanNext tool still renders without YAML errors (sanity check because earlier fix touched roadmap quoting).

## Functional Requirements
- Update `claude.md` phase descriptions accordingly.
- Update `docs/concepts/afp_work_phases.md` PLAN and VERIFY sections, plus any example text, to mention PLAN-authored tests.
- Update `docs/agent_library/common/processes/task_lifecycle.md` implementation/verification steps to reflect the new sequencing.
- Ensure wording emphasises returning to PLAN if new tests are required during VERIFY.

## Non-Functional Requirements
- Maintain tone/style consistent with each document.
- Keep net LOC change within ≤150 and affected files ≤5.
- All documentation remains ASCII.

## Out of Scope
- Adding automated enforcement beyond documentation.
- Changing lower-level coding guides already updated (`AGENTS.md`, checklist, templates).
