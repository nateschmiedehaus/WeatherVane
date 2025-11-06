# AFP-MODULE-REMEDIATION-20251105-O Phase Notes

## STRATEGIZE
- **Problem**: Gate phase (transition from `think` → `implement`) currently only checks for critic approval of `think.md`, lacking holistic validation of upstream phases (strategy, spec, plan). It cannot ensure that earlier artifacts remain consistent with design gate requirements.
- **Goal**: Enhance gate verification so it aggregates context from earlier phases (strategy/spec/plan) and enforces cross-phase coherence before implementation proceeds.
- **Why now**: With critic approvals restored, we can extend gate logic to use ledger/evidence metadata to ensure earlier phase artifacts exist and remain trustworthy.

## SPEC
- Gate transition should: (a) confirm presence of `strategy.md`, `spec.md`, `plan.md`, `think.md`; (b) validate each has approved critic reviews; (c) surface mismatches via structured error.
- WorkProcess tests must cover gate enforcement across earlier phases.
- Keep behaviour configurable for future phases.

## PLAN
1. Inspect `verifyCriticApprovals` to extend requirements when transitioning from `think` to `implement`.
2. Maybe add new helper to fetch approval state for strategy/spec/plan and ensure ledger metadata caches this.
3. Update tests to cover new enforcement scenarios, seeding necessary artifacts/logs.

## THINK
- Need to avoid blocking transitions unnecessarily; only require approvals for phases that must precede gate.
- Implementation should remain backward-compatible for existing tasks with correct artifacts.
