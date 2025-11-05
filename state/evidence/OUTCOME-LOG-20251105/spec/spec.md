# Spec – Task 13 OUTCOME-LOG (2025-11-05)

## Scope
- Add a dedicated outcome logging module under `tools/wvo_mcp/src/analytics/` that defines the `TaskOutcome` schema and writes JSONL records to `state/analytics/task_outcomes.jsonl`.
- Extend `AgentCoordinator.handleExecutionResult` (and supporting helpers) to build a full `TaskOutcome`, populate all required fields when data is available, and call `logTaskOutcome()` guarded by a feature flag.
- Capture budget, prompt, guardrail, and stigmergic metadata from the best currently available sources, using `null`/empty defaults when no data exists. No speculative estimation beyond documented heuristics.
- Add a small analyzer CLI (`tools/wvo_mcp/scripts/analyze_outcomes.ts`) that reads the JSONL and prints success-rate and per-task-type stats.
- Provide unit coverage for the builder + logger and golden fixture(s) representing a fully-populated outcome.
- Document the schema and feature flag in `state/README.md` (Task 7 will expand doc, but we note location now) and ensure evidence bundle includes a sample logged line.

## Non-goals / Out of Scope
- Implementing new sources for budgets, guardrail adjustments, or stigmergic inference beyond what already exists. Later tasks will enrich these inputs.
- Building a generic analytics event bus or refactoring all telemetry. We focus on outcome logging path only.
- Persisting outcomes to databases other than JSONL or providing web dashboards (handled by later SCAS tasks).
- Backfilling historical outcomes. We only log new completions going forward; backfill can be a future operation.

## Interfaces
```ts
// tools/wvo_mcp/src/analytics/task_outcome_logger.ts
export interface BudgetOutcome {
  token_budget_estimated: number | null;
  token_budget_actual: number | null;
  time_budget_estimated_minutes: number | null;
  time_budget_actual_minutes: number | null;
  cost_estimate_usd?: number | null;
  cost_actual_usd?: number | null;
}

export interface PromptOutcomeMetadata {
  prompt_template_id?: string | null;
  prompt_version?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
}

export interface GuardrailAdjustment {
  guardrail_id: string;
  old_value: number | string | null;
  new_value: number | string | null;
  reason: string;
}

export interface StigmergicSignals {
  influenced_by_task?: string | null;
  influenced_next_task?: boolean;
  next_task_id?: string | null;
  evidence_bundle_path: string;
  pheromone_strength?: number | null;
}

export interface TaskOutcome {
  timestamp: string;
  task_id: string;
  success: boolean;
  estimated_files: number | null;
  actual_files: number | null;
  estimated_loc: number | null;
  actual_loc: number | null;
  estimated_time_minutes: number | null;
  actual_time_minutes: number | null;
  build_passed: boolean | null;
  tests_passed: boolean | null;
  audit_passed: boolean | null;
  failure_reason?: string | null;
  failure_category?: string | null;
  budgets: BudgetOutcome;
  prompt: PromptOutcomeMetadata;
  guardrails_triggered: string[];
  guardrails_adjusted: GuardrailAdjustment[];
  stigmergy: StigmergicSignals;
  quality_score?: number | null;
  critic_issues?: string[];
  agent_id: string;
  agent_type: string;
  time_to_complete_seconds: number | null;
}

export async function logTaskOutcome(outcome: TaskOutcome, options?: { workspaceRoot?: string }): Promise<void>;
```

## Data Sources & Field Mapping
- **Basic metrics**: from `Task`, `ExecutionOutcome`, `qualityResult`, `criticOutcome`, `ExecutionSummary`.
- **Budgets**: `task.metadata?.budgets` (normalize to numbers) + actual tokens/duration from execution. Cost actual = `tokenCostUSD`; estimate if present in metadata.
- **Prompt metadata**: derive template identifier by combining `agentSelection.role` and prompt mode when available; include token counts.
- **Guardrails**: Use `qualityResult.issues` + `criticIssues` for `guardrails_triggered` placeholder; adjustments remain empty until Task 20 supplies data.
- **Stigmergy**: `context.relatedTasks` to choose the most recent dependency; `context.filesToRead` to infer evidence path fallback `${task.id}` even if not resolved.

## Feature Flag
- Live flag: `ENABLE_OUTCOME_LOGGING` (string `'1'` or `'true'` to enable). Fallback to enabled by default but allow disabling by env var. Document in `feature_gates.ts`.

## Acceptance Criteria Traceability
- **AC schema**: `TaskOutcome` matches acceptance definition (with nested structs). ✅
- **Logging**: JSONL appended on every completion when flag enabled. ✅
- **Feature flag**: `FeatureGates` exposes `isOutcomeLoggingEnabled()`. ✅
- **Analyzer**: CLI prints success rate, per-task-type breakdown. ✅
- **Tests**: cover builder + file append. ✅
- **Artifacts**: Provide sample JSON line under evidence dir, plus analyzer output snippet.

## Rollout / Validation
1. Unit tests for builder + analyzer.
2. Run `npm run build`, `npm run lint -- --quiet`, targeted tests.
3. Manual smoke: call new analyzer on generated sample file.
4. Attach evidence (sample JSON, analyzer output) to `state/evidence/OUTCOME-LOG-20251105`.

