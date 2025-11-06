# AFP-MODULE-REMEDIATION-20251105-P2 Phase Notes

## STRATEGIZE
- **Problem**: Despite adding spec/plan reviewers, existing work-process automation may not consistently run them; some phases might skip reviews if tasks rely on legacy scripts.
- **Goal**: Ensure the new spec/plan approval flow is fully integrated and documented, so gate enforcement is reliable and teams know how to trigger reviews.

## SPEC
- Validate CLI scripts, update docs, and ensure automation can run spec/plan reviews.
- Provide sample outputs/log references.

## PLAN
1. Run `npm run spec:review` / `npm run plan:review` against a sample task to capture output.
2. Update docs/checklists with instructions.
3. Confirm autopilot scripts (if any) reference the new commands.

## THINK
- Ensure documentation follows AFP guardrails, guiding agents on the review flow.
