# PLAN: AFP-PROCESS-TEST-SEQUENCE-20251106

## Architecture / Approach
- Choose PLAN as the owner phase for authoring verification tests, aligning with its responsibility to define concrete work before implementation.
- Update top-level instructions (`AGENTS.md`) to reflect the new phase ownership and clarify VERIFY expectations.
- Align supporting checklists (`MANDATORY_WORK_CHECKLIST.md`) and process docs (`docs/MANDATORY_VERIFICATION_LOOP.md`) to reinforce the shift.
- Amend `docs/templates/design_template.md` Implementation Plan guidance so authors enumerate tests created during PLAN, ensuring templates prompt compliance.

## Files to Change
- `AGENTS.md`
- `MANDATORY_WORK_CHECKLIST.md`
- `docs/MANDATORY_VERIFICATION_LOOP.md`
- `docs/templates/design_template.md`

## Sequence
1. Draft wording change for `AGENTS.md` emphasising PLAN-phase test authoring and VERIFY execution.
2. Propagate requirement into `MANDATORY_WORK_CHECKLIST.md` (PLAN section checkbox and VERIFY clarification).
3. Update `docs/MANDATORY_VERIFICATION_LOOP.md` Step 2 to reference running the tests authored during PLAN and remove language about writing them there.
4. Adjust `docs/templates/design_template.md` to prompt listing the tests created during PLAN within the Implementation Plan section.
5. Re-read modified docs to ensure consistent messaging and that PLAN is unambiguously the stage for test creation.

## PLAN-authored Tests
- N/A (docs-only change) — entire task updates written guidance rather than executable code.
- Manual validation: `rg "tests authored during PLAN"` and `rg "VERIFY"` across docs to ensure messaging consistent after edits.
- Manual validation: `git status --short` to confirm only intended docs changed.

## Risks & Mitigations
- **Inconsistent wording across docs:** cross-check each update and run a final read-through to ensure terminology matches.
- **Overly rigid requirement (e.g., forbidding iterative test updates):** include guidance that tests may evolve but must originate in PLAN, reducing misinterpretation.
- **Template update increases complexity:** keep the design template addition concise, pointing to PLAN without adding heavy process overhead.
