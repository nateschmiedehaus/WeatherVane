# Think – Task 13 OUTCOME-LOG

## Data Availability Assessment
- **Execution metrics**: `AgentCoordinator.handleExecutionResult` already computes `promptTokens`, `completionTokens`, `totalTokens`, `tokenCostUSD`, and `result.durationSeconds`. Quality issues and critic outcomes are also present. These can feed actual budgets and guardrail trigger lists.
- **Task metadata**: `Task` contains `estimated_complexity` and a free-form `metadata` object. No first-class fields exist for `estimated_files`, `estimated_loc`, budgets, or costs. Some roadmap entries may embed these in `metadata`, so the logger should attempt to read nested properties (`metadata.estimated_files`, `metadata.metrics?.estimated_files`, etc.) but fall back to `null`.
- **Build/tests/audit results**: Execution pipeline does not explicitly state whether builds/tests/audits passed. We can infer booleans via `qualityResult.status` and critic outcomes but not discrete build/test gating. Decision: record `null` for these until verification pipeline exposes explicit signals. (Documented as TODO for Task 18/19 integration.)
- **Guardrail adjustments**: No code currently reports modifications to guardrails. Decision: expose field as empty array with helper to merge adjustments when future enforcement engine provides data.
- **Stigmergic influences**: Context assembler returns `relatedTasks` and `dependentTasks`. We can choose the most recent related task whose status is `'done'` as `influenced_by_task`. `influenced_next_task` requires future pipeline knowledge; default `false` until swarming features compute it.

## Logging Mechanics
- Need safe JSONL writer. Existing `TelemetryExporter` buffers writes, but outcome logging should flush synchronously to avoid losing data on crashes. Approach: implement `appendJsonlLine()` that ensures directory creation once and uses `fs.promises.appendFile` with `\n` suffix.
- Workspace root resolution should reuse `resolveStateRoot` so tests can run in temp dirs.

## Feature Flag Strategy
- Add to `FeatureGates` class a method `isOutcomeLoggingEnabled()` that checks live flag `ENABLE_OUTCOME_LOGGING` (default true). Also support env override for local testing.
- Provide fallback to skip logging when disabled or if logger throws (wrap call in try/catch and log warning).

## Builder Responsibilities
- Accept arguments: `{ task, result, qualityResult, criticOutcome, summary, context }`.
- Normalization steps:
  - `actual_time_minutes = result.durationSeconds ? +(result.durationSeconds / 60).toFixed(2) : null`.
  - `time_budget_estimated_minutes` from `task.metadata?.time_budget_minutes` else from heuristic `task.metadata?.budgets?.time?.estimated`.
  - `token_budget_estimated` look for `task.metadata?.token_budget_estimated`, `task.metadata?.budgets?.tokens?.estimated`, or `task.metadata?.codex?.token_budget`.
  - `guardrails_triggered` combine `qualityResult.issues` and `criticIssues`. Deduplicate.
  - `actor agent info` from `summary.agentType` etc.
  - `evidence_bundle_path` default to `state/evidence/${task.id}` (consistent with existing plan).
  - `pheromone_strength` default `null` (future tasks will compute).
- Provide optional hook parameter so future callers can merge additional metadata without editing orchestrator (e.g., `extra?: Partial<TaskOutcome>`). For now, orchestrator uses base builder only.

## Testing Plan
- Unit test for builder verifying:
  - Derives budgets/time correctly when metadata provided.
  - Handles missing metadata gracefully by returning `null`.
  - Deduplicates guardrail issues.
  - Serializes to JSON with newline.
- Unit test for logger verifying file append behavior using temp directory (Node `fs`).
- Snapshot/golden test to assert stable output (string compare ignoring timestamp via injection).

## Analyzer Considerations
- File can grow large; use Node `readline` stream rather than `readFileSync` to avoid memory blowup.
- Accept CLI flags `--success-rate` and `--by-task-type`. Use `commander` for simple argument parsing.
- Task type inference: spec suggests splitting task ID on `-` and using second segment (e.g., `AFP-MCP-BUILD`). We'll implement helper to guard missing segments.

## Risks & Mitigations
- **Missing acceptance signals**: Build/test/audit booleans currently unknown → document as `null` and raise TODO for Task 18/Quality integration.
- **Performance**: Append per completion is cheap; but ensure we avoid blocking by not awaiting heavy operations. We'll await append to ensure durability; completions are infrequent enough (< dozens/min) so acceptable.
- **Schema drift**: Provide exported TypeScript types for reuse by future tasks (e.g., Task 14 reading outcomes). Resist leaking module-private types to avoid circular deps.
- **Tests interfering with real data**: Use `TMPDIR` and pass `workspaceRoot` override when logging in unit tests.

## Outstanding Questions
- Should we integrate with `TelemetryExporter` to reuse retention logic? Decision: no, keep simple synchronous logger to avoid mixing contexts.
- Do we need to update `state/README.md` now? Minimal note pointing to new file; Task 7 will expand but we should stub entry to avoid stale docs.

