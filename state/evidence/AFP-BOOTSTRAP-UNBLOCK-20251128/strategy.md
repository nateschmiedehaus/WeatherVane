# Strategy — AFP-BOOTSTRAP-UNBLOCK-20251128

## Problem Statement
AFP-AUTOPILOT-MVP-STRANGLER-20251115 cannot start because the guardrail budget (max_new_files=4, max_loc_added=400) is too restrictive to scaffold the four critical MVP surfaces (supervisor, agents, libs, adapters). This blocks downstream tasks AFP-DPS-BUILD-20251116 and AFP-MEMORY-CORE-20251117, which in turn stops the entire reflex/budget/CI roadmap.

## Goals
- Introduce a controlled Bootstrap ADR expanding temporary budgets without compromising entropy or evidence guarantees.
- Decompose the large MVP scaffold into budget-respecting sub-tasks that can merge incrementally.
- Re-wire roadmap dependencies so DPS and Memory Core can proceed as soon as supervisor + agents stubs exist.
- Maintain continuous guardrail coverage and evidence (tests, structure checks, telemetry) during the bootstrap window.

## Guiding Principles
1. **Constraint Before Action** — budgets only expand via documented ADR with steward approval and automatic sunset.
2. **Entropy Non-Positive** — every new scaffold must plan proportional deletions or reuse (e.g., adapters retiring legacy paths).
3. **Continuous Evidence** — each sub-task must run structure/dep/ownership checks and attach logs.
4. **Fast Follow** — tasks AFP-DPS-BUILD-20251116 and AFP-MEMORY-CORE-20251117 should begin immediately after the minimal surfaces exist.

## Success Criteria
- Bootstrap ADR recorded with sunset after MVP demo.
- Four sub-task branches defined with individual scopes ≤350 LOC / ≤3 files.
- Roadmap dependencies updated; guardrail workflow acknowledges #BOOTSTRAP tag.
- Evidence stored under `state/evidence/AFP-BOOTSTRAP-UNBLOCK-20251128/verify/` for ADR + command logs.
