# SPEC: AFP-PROCESS-TEST-SEQUENCE-20251106

## Acceptance Criteria
- Documentation clearly states that verification tests must be authored during the PLAN phase before any IMPLEMENT work begins.
- VERIFY phase guidance explicitly assumes tests already exist and focuses on executing the previously authored suite.
- Mandatory checklists and templates include confirmations/prompts that tests were created in PLAN.
- Language includes allowance for temporarily skipped or failing tests while implementation is incomplete, provided they exist before IMPLEMENT.

## Functional Requirements
- Update `AGENTS.md` to assign test authoring to PLAN and clarify VERIFY responsibilities.
- Update `MANDATORY_WORK_CHECKLIST.md` to include a PLAN-phase checkbox covering test authoring and to adjust VERIFY expectations.
- Update `docs/MANDATORY_VERIFICATION_LOOP.md` so Step 2 references running tests created earlier rather than writing them in VERIFY.
- Update at least one planning-phase template (plan.md or design.md guidance) to prompt authors to list the planned tests.

## Non-Functional Requirements
- Maintain consistency with AFP/SCAS tone and existing formatting (ASCII, markdown style, bullet conventions).
- Keep net changes within ≤150 LOC and ≤5 files.
- Avoid creating conflicting instructions elsewhere in the docs.

## Out of Scope
- Automating enforcement via critics or hooks.
- Rewriting the verification loop structure beyond clarifying test authoring timing.
- Refactoring existing code or tests outside of documentation/templates.
