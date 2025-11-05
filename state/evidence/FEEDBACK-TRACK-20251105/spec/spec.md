# Spec – Task 14 FEEDBACK-TRACK (2025-11-05)

## Scope
- Implement feedback loop tracking module under `tools/wvo_mcp/src/analytics/feedback_tracker.ts` with types/interfaces:
  ```ts
  interface FeedbackLoopRecord { /* matches acceptance criteria */ }
  interface FeedbackLoopSummary { ... }
  export async function openFeedbackLoop(task: Task, phase: AFPPhase, options?: TrackerOptions): Promise<string>;
  export async function recordPhase(taskId: string, phase: AFPPhase, event: 'enter' | 'complete', txn?: PhaseMetadata): Promise<void>;
  export async function closeFeedbackLoop(taskId: string, result: TaskResult, summary: ExecutionSummary, options?: CloseOptions): Promise<void>;
  export async function readFeedbackLoops(): Promise<FeedbackLoopRecord[]>;
  export function computeFeedbackDensity(records?: FeedbackLoopRecord[]): number;
  export function computeLoopQuality(loop: FeedbackLoopRecord): 'high' | 'medium' | 'low';
  ```
- Persist loop events to `state/analytics/feedback_loops.jsonl`. For open loops store interim record; on closure append final record with computed metrics. Use helper to update open entries (append derivative events with `loop_closed: false`; optional map in memory for fast updates – minimal version can append separate completion records referencing same `loop_id`).
- Add orchestrator integration:
  - When task enters STRATEGIZE (`preparePrompt`/assignment stage) call `openFeedbackLoop` once per task.
  - When task completes MONITOR (`handleExecutionResult` + when final status `done` after review) call `closeFeedbackLoop`.
  - Track iterations via `needs_improvement` transitions (increment `iterations_to_close` each time task re-enters IMPLEMENT).
- Compute loop quality using heuristics:
  - Duration thresholds: `<24h` high, 24–48h medium, `>48h` low.
  - `iterations_to_close`: 0 high, 1–2 medium, 3+ low.
  - Consider presence of critic failures (downgrade quality).
- Implement CLI `tools/wvo_mcp/scripts/analyze_feedback_loops.ts` to print density + open loop list.
- Add unit tests covering tracker logic (opening, closing, computing density/quality) using temp directories.
- Provide sample JSONL entry + analyzer output in evidence.
- Document tracker in evidence log; mention outstanding lint (existing) as known issue.

## Out of Scope
- Comprehensive phase ledger (handled by Task 21). We will implement minimal state to support loops but keep API pluggable for ledger integration.
- Dashboard HTML full styling beyond simple stub (we will dump basic HTML referencing Chart.js placeholder; no design polish).
- Real-time updates to SCAS metrics file (Task 18). Provide helper but not automatically invoked; orchestrator may call compute & append to `scas_metrics` once Task 18 done.

## Acceptance Criteria Mapping
- FeedbackLoop interface covers requested fields including loop components + metrics.
- JSONL logging ensures intrusive data: open records with `loop_closed: false`, closure records with `loop_closed: true` and computed metadata.
- `computeFeedbackDensity()` returns closed/total ratio; helper accessible from orchestrator/daily job.
- Dashboard stub: `dashboards/feedback_health.html` reading JSONL and charting metrics; include instructions in comment.
- Unit tests verifying open/close/density and loop quality heuristics.

## Implementation Notes
- Use same `appendJsonlLine` utility from Task 13 (refactor into shared helper? Option: export `appendJsonlLine` from `task_outcome_logger` or create new util `analytics/jsonl.ts`). We'll create `appendJsonl` helper under analytics to reuse.
- Maintain in-memory map (via `Map<taskId, PendingLoop>`) in tracker to avoid scanning JSONL on each phase. This map persists only at runtime; historical records stored in JSONL so losing process is acceptable – reopened loop on restart by scanning JSONL for last status (cost cheap at start). Provide `hydrateOpenLoops()` initializer run on tracker constructor.
- For iterations, use state machine transition hook `needs_improvement`. We'll integrate by adding call when `finalStatus === 'needs_improvement'` or when orchestrator transitions to that state.
- Provide additional metadata in closures: `follow_up_tasks` from `task.metadata?.follow_ups` or empty array.

