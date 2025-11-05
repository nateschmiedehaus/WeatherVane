# Strategy – Task 14 FEEDBACK-TRACK (2025-11-05)

## Why now
- SCAS feedback_density is currently a stub in guardrails (manually set 0.30–0.35). Without real loop tracking, Wave 2 metrics remain synthetic and guardrail enforcement cannot meaningfully respond to missing loops.
- The outcome logger (Task 13) is now emitting rich per-task telemetry; we can correlate phase transitions and outcomes to detect loop openings/closures and build the memory needed for adaptive feedback.
- Later tasks (SCAS calculator, guardrail enforcement, swarming) depend on accurate feedback loop data. Implementing the tracker now unblocks those efforts and moves the autopilot closer to AFP compliance (mandated STRATEGIZE→MONITOR lifecycle proof).

## Desired end state
- Every task’s progression through the 9-phase AFP lifecycle is recorded, and loop ouvertures/closures are written to `state/analytics/feedback_loops.jsonl` with rich metadata (timestamps, quality, iterations).
- `feedback_density` and loop quality metrics are computed from real data and surfaced via analyzer/CLI; orchestrator can react when density dips.
- Dashboard (static HTML) gives quick insight into loop health (open loops, closure time, quality distribution).
- Automation integrates with future SCAS calculator to persist metrics to `state/analytics/scas_metrics.jsonl`.

## Current reality
- No feedback tracker module exists; phase ledger (Task 21) is not yet implemented so we must derive openings/closures from current state machine transitions and outcome logging.
- Phase transitions exist in `AgentCoordinator` but aren’t persisted beyond task status. We must add instrumentation that records each phase start/finish.
- No JSONL file capturing loops; no CLI/dashboards.
- tasks 11/12 (ownership/module docs) outstanding; must keep in mind to schedule after this effort.

## Options considered
1. **Lightweight tracker based on task status transitions** – approximate loops on status changes (`pending` → `done`). Insufficient: lacks per-phase data, no loop quality metrics. *Rejected*.
2. **Full phase-ledger based tracker (with minimal ledger in this task)** – implement dedicated module to open/close phases and use that to compute loops. Requires additional work but aligns with future Task 21. *Chosen*: we’ll build the ledger subset necessary for loop tracking, setting foundation for Task 21.
3. **Deferred implementation until Task 21 ledger** – would block SCAS metrics and misses user directive to proceed sequentially. *Rejected*.

## Strategic approach
- Introduce `analytics/feedback_tracker.ts` with `openFeedbackLoop`, `phaseTransition`, `closeFeedbackLoop`, `computeFeedbackDensity`, `logFeedbackLoop` etc.
- Hook orchestrator to call tracker when tasks enter STRATEGIZE (loop open) and MONITOR completion (loop close). Interim approach: instrument existing workflow to emit phases; when Task 21 lands, we’ll consolidate.
- Compute loop quality heuristically (duration thresholds, iteration count from `needs_improvement` cycles, critic issues) to populate high/medium/low as spec demands.
- Provide CLI `scripts/analyze_feedback_loops.ts` or integrate into SCAS CLI to stream metrics.
- Emit metrics JSONL; update `FeatureGates` if gating needed (probably always on).

## Kill/pivot triggers
- If we discover insufficient signals to determine phase entries (e.g., orchestrator lacks reliable hooks) we may pause and implement ledger first (Task 21) before continuing. Initial audit suggests we can instrument `transitionToPhase`/`completePhaseWithAttestation` once added; for now we can add simple watchers around existing transitions (Strategize start, Monitor completion) as placeholders.

## Integration & dependencies
- Will touch `AgentCoordinator`, possibly StateMachine transitions, to capture phase events.
- Must coordinate with outcome logger to include `loop_id` future field (optional for now) – consider returning ID on open and attach to outcomes later.
- Ensure JSONL append helper reused; no duplication of logger utility.

