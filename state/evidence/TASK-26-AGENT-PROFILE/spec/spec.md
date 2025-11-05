# SPEC — Task 26: AGENT-PROFILE

## Scope
- Implement `AgentProfiler` module that ingests `state/analytics/task_outcomes.jsonl`, produces normalized `AgentProfile` objects, and persists to `state/analytics/agent_profiles.json` plus update ledger.
- Build `DynamicBudgetAllocator` consuming profiles to produce per-task budgets and suitability comparisons.
- Expose REST endpoints + static dashboard for agent profiles, skill gaps, budgets, and learning curves.
- Integrate orchestrator hooks (task completion, allocator) behind feature flag `agent_profiling`.
- Provide CLI command and scheduled workflow for profile updates.
- Author docs + verification script capturing reproducible checks and evidence requirements.

## Out of scope / defer
- No product changes outside tools/wvo_mcp analytics/orchestrator/server layers.
- No changes to upstream ingestion of task outcomes (assume Task 13 schema stable).
- No persistent storage beyond JSON/JSONL files under `state/`.
- Performance tuning for large datasets deferred unless regressions observed.

## Constraints & dependencies
- Requires successful `npm ci`/`npm run build` in `tools/wvo_mcp`; currently blocked by missing macOS Command Line Tools (fatal: `<climits>` not found when building `better-sqlite3`).
- Must maintain AFP policy: evidence directories populated, no skipping phases, verification must run once environment fixed.
- New files must follow ASCII convention and OWNERS/metadata policies (confirm coverage).

## Acceptance checkpoints
1. `AgentProfiler` + `DynamicBudgetAllocator` unit tests cover success rate, learning rate, skill gaps, allocation logic.
2. API routes + dashboard fetch live data locally.
3. CLI command `npm run cli update-profiles` generates expected JSON files.
4. CI workflow template added but disabled until repository policy reviewed (may need follow-up approval).
5. Verification script executes build, targeted tests, sample data, and validation assertions.

## Evidence plan
- Strategize/Spec/Plan/Think markdown in evidence tree.
- Implementation diffs with inline comments referencing AFP requirements.
- Test outputs, verification script logs, screenshots (if required) saved under `state/evidence/TASK-26-AGENT-PROFILE/verify/`.

## Blockers / mitigation
- **Toolchain missing headers**: capture failure logs (already in prior task) and request environment fix; cannot proceed past THINK until resolved.
- **Large historical files**: snapshot push rejected due to >100 MB artifacts. Ensure new outputs remain small; consider compressing dashboards/evidence or storing externally.

## Approval & coordination
- Requires alignment with orchestration owners; ensure OWNERS metadata updated if new directories added (scripts, analytics, server routes).
- Document integration expectations for Wave 3 (Task 27 & beyond) in plan.
