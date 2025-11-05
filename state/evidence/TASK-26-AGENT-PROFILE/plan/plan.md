# PLAN — Task 26: AGENT-PROFILE

## Work breakdown (pending toolchain availability)
1. **Discovery & data validation**
   - Inspect `state/analytics/task_outcomes.jsonl` schema post-reset.
   - Confirm availability of supporting logs (phase ledger, tool sequences).
   - Draft TypeScript interfaces mirroring actual fields.
2. **Analytics core implementation**
   - Implement `AgentProfiler` with helpers for success rate, capabilities, learning rate, skill gaps.
   - Persist profiles + profile update ledger; ensure idempotent updates.
   - Unit tests covering calculations and edge cases.
3. **Dynamic allocation services**
   - Implement `DynamicBudgetAllocator` with comparison helper.
   - Integrate into task allocator + orchestrator update hook (behind feature flag).
4. **APIs & CLI**
   - Add Express router for analytics endpoints.
   - Add CLI command `update-profiles` and register with CLI entrypoint.
   - Define scheduled GitHub workflow (guarded for repository policy).
5. **Dashboard frontend**
   - Build static page leveraging Chart.js/D3 for radar and trend charts.
   - Ensure asset paths align with existing static-serving setup.
6. **Verification & documentation**
   - Compose verification script executing build/tests/sample run.
   - Document system architecture and usage.
   - Capture evidence (test logs, sample outputs).

## Risk assessment
- **Env build failure (critical)** — cannot run tests or build. Mitigation: block implement step; coordinate environment fix.
- **Data sparsity** — limited task outcomes reduce accuracy. Mitigation: design functions to handle missing data (neutral scores) and document assumptions.
- **Scope creep** — ensure dashboards remain minimal; avoid overbuilding before analytics validated.

## Resource/time estimate
- Implementation once unblocked estimated 10–12 active hours; current session dedicated to pre-work and unblock coordination.

## Exit criteria for plan
- Confirm blockers recorded and communicated.
- Outline precise next commands once toolchain restored.
