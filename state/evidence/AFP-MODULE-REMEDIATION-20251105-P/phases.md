# AFP-MODULE-REMEDIATION-20251105-P Phase Notes

## STRATEGIZE
- **Problem**: Gate enforcement now checks for `spec.md` and `plan.md` presence but cannot verify they were reviewed. Without critic approvals, autopilot could gate on stale or low-quality specs/plans.
- **Root cause**: only strategy/think have critic tooling; spec/plan phases lack reviewers/logs.
- **Goal**: Introduce lightweight SpecReviewer and PlanReviewer critics plus CLI commands so spec/plan review is automated and gate enforcement can check approvals.

## SPEC
- Create critics (`SpecReviewerCritic`, `PlanReviewerCritic`) that:
  * Verify corresponding evidence file exists and includes minimum sections.
  * Append approval entries to new analytics logs `spec_reviews.jsonl`, `plan_reviews.jsonl`.
- Add CLI runners (`src/cli/run_spec_review.ts`, `run_plan_review.ts`) and `npm` scripts `spec:review`, `plan:review`.
- Update `verifyCriticApprovals` to require spec/plan approvals when gating.
- Extend tests/helpers to seed new approvals when needed.

## PLAN
1. Implement critics under `src/critics/`, leveraging base class or simple logic.
2. Implement CLI wrappers similar to strategy/thinking.
3. Add npm scripts and update docs if necessary.
4. Extend verification map/log map in `critic_verification.ts` to include spec/plan.
5. Update `seedCriticApprovals` helper in `work_process/index.test.ts` to support new reviewers.
6. Update tests to ensure gate fails without spec/plan approvals and passes when present.

## THINK
- Ensure critics remain lightweight to respect LOC guardrails.
- Provide clear error messages when sections missing.
- Maintain cleanup of analytics logs in tests to avoid polluting repo.
