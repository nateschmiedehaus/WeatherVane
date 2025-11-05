# Plan – Task 14 FEEDBACK-TRACK

1. **Recon & Utility Prep**
   - Audit existing phase transition points in `AgentCoordinator`, `TaskScheduler`, and `StateMachine`.
   - Extract shared JSONL append helper (reuse from Task 13 or new `analytics/jsonl.ts`).
   - Sketch `FeedbackLoop` type aligning with spec.

2. **Tracker Module**
   - Implement `analytics/feedback_tracker.ts` with:
     - In-memory cache for active loops + hydration from JSONL.
     - `openFeedbackLoop`, `recordPhaseTransition`, `closeFeedbackLoop`, `computeFeedbackDensity`, `computeLoopQuality`.
     - Appending mechanics and optional aggregator helpers.
   - Add tests under `analytics/__tests__/feedback_tracker.test.ts` covering open/close/density/quality logic.

3. **Orchestrator Integration**
   - Hook tracker into task lifecycle:
     - On STRATEGIZE entry (or earliest feasible point) call `openFeedbackLoop`.
     - When task transitions to `needs_improvement` increment iteration counter.
     - On successful completion (after MONITOR) invoke `closeFeedbackLoop` with result metadata (quality score, guardrails, outcome id).
   - Ensure idempotence: once closed, repeated closes no-op.

4. **Analytics & Dashboard**
   - Provide CLI `analyze_feedback_loops.ts`.
   - Create dashboard stub `dashboards/feedback_health.html` drawing from JSONL (use Chart.js if available; degrade gracefully).

5. **Docs/Evidence**
   - Update `state/README` bullet (note new JSONL file) – coordinate with future Task 7.
   - Generate sample loop JSON + CLI output, drop into evidence directory.

6. **Validation**
   - Run targeted tests + `npm run build`. Lint expected to fail on legacy critic files (document).
   - Prepare implementation log + verification artifacts.

7. **Upcoming**
   - Re-evaluate Task 11/12 backlog after implementation (ownership/module docs) per user prompt.

