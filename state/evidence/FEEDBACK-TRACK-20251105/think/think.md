# Think – Task 14 FEEDBACK-TRACK

## Signals available
- **Lifecycle events**: `AgentCoordinator` transitions tasks through `in_progress`, `needs_improvement`, `needs_review`, `done`. There is no explicit STRATEGIZE/MONITOR ledger yet, but we can approximate loop opening when we first dispatch (transition to `in_progress`) and closure when the orchestrator marks `done`.
- **Iteration cues**: `needs_improvement` branch already centralizes remediation transitions, so adding `FeedbackTracker.markIteration` there will count rework cycles.
- **Outcome telemetry**: via Task 13, we can piggyback on `ExecutionSummary` and `QualityCheckResult` to compute loop quality, capture feedback, and derive adaptation hints.

## Design decisions
1. **Stateful tracker with JSONL persistence** – maintain an in-memory map of active loops, hydrated from `feedback_loops.jsonl` on startup (so restarts recover open loops). Append one record at open and one at closure. Chosen because it is simple, streaming-friendly, and consistent with other analytics logs.
2. **Loop quality heuristic** – three-tier scoring keyed on success, duration, iterations, and issue count:
   - High: success, ≤24h, 0 iterations, no issues
   - Low: failure, ≥3 iterations, >48h, or many issues
   - Otherwise medium
   This matches acceptance criteria (time to close, iterations) while leaving room for refinement when richer signals arrive.
3. **Integration points** – call `openFeedbackLoop` on every dispatch (idempotent), increment iterations when task falls back to `needs_improvement`, and close when final status `done`. This keeps loops open across review cycles and aligns with AFP lifecycle semantics (closing during MONITOR/VERIFY completion).
4. **Component extraction** – `input` defaults to problem statement (`task.description`/metadata); `process` surfaces relevant decisions; `feedback` aggregates quality/critic issues; `adaptation` references follow-ups or adaptation notes. These fields are intentionally textual to support later analysis.

## Risks / Mitigations
- **Phase ledger overlap**: Task 21 will introduce formal phase tracking. To avoid churn, tracker API exposes `recordPhaseTransition` hook; once ledger exists we can call it for detailed analytics without rewriting consumers.
- **Volume**: JSONL append per task is small (two entries). Should be manageable. If growth becomes an issue, aggregator (Task 19) will archive old entries.
- **Missing data**: Some tasks may complete before tracker instantiates (e.g., earlier in startup). Hydration ensures we don’t duplicate loops, and failure to open gracefully no-ops on close.

## Follow-ups
- Once Task 21 lands, revisit tracker to replace `openFeedbackLoop` call site with phase-ledger events.
- Consider hooking tracker into manual review completions (if human reviewer finalizes) so loops close consistently.
- Future tasks (SCAS calculator, guardrail enforcement) should consume `computeFeedbackDensity` rather than recomputing.

