import type { ExecutionSummary } from "../orchestrator/agent_coordinator.js";

export interface ExecutionTelemetryRecord {
  type: "execution_summary";
  task_id: string;
  agent_id: string;
  agent_type: ExecutionSummary["agentType"];
  coordinator_type: ExecutionSummary["coordinatorType"] | null;
  coordinator_available: boolean | null;
  coordinator_reason: string | null;
  success: boolean;
  failure_type: ExecutionSummary["failureType"] | null;
  final_status: ExecutionSummary["finalStatus"];
  duration_seconds: number;
  quality_score: number;
  issues: string[];
  timestamp_ms: number;
  timestamp_iso: string | null;
  project_phase: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  token_cost_usd: number | null;
  token_estimate_strategy: ExecutionSummary["tokenEstimateStrategy"];
  codex_preset: string | null;
  codex_model: string | null;
  codex_reasoning: string | null;
  critics_required: string[];
  critics_failed: string[];
  correlation_id: string | null;
  prompt_cache_status: ExecutionSummary["promptCacheStatus"] | null;
  prompt_cache_tier: string | null;
  prompt_cache_id: string | null;
  prompt_cache_hit: boolean | null;
  prompt_cache_store: boolean | null;
  prompt_cache_eligible: boolean | null;
  prompt_cache_raw: string | null;
}

const MAX_ISSUES = 10;

function formatNumber(value: number, fractionDigits: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(fractionDigits));
}

export function buildExecutionTelemetryRecord(summary: ExecutionSummary): ExecutionTelemetryRecord {
  const issues = Array.isArray(summary.issues) ? summary.issues.slice(0, MAX_ISSUES) : [];
  const timestampIso = Number.isFinite(summary.timestamp)
    ? new Date(summary.timestamp).toISOString()
    : null;

  return {
    type: "execution_summary",
    task_id: summary.taskId,
    agent_id: summary.agentId,
    agent_type: summary.agentType,
    coordinator_type: summary.coordinatorType ?? null,
    coordinator_available:
      typeof summary.coordinatorAvailable === "boolean" ? summary.coordinatorAvailable : null,
    coordinator_reason: summary.coordinatorReason ?? null,
    success: summary.success,
    failure_type: summary.failureType ?? null,
    final_status: summary.finalStatus,
    duration_seconds: formatNumber(summary.durationSeconds, 3),
    quality_score: formatNumber(summary.qualityScore, 3),
    issues,
    timestamp_ms: summary.timestamp,
    timestamp_iso: timestampIso,
    project_phase: summary.projectPhase,
    prompt_tokens: summary.promptTokens,
    completion_tokens: summary.completionTokens,
    total_tokens: summary.totalTokens,
    token_cost_usd:
      typeof summary.tokenCostUSD === "number" && Number.isFinite(summary.tokenCostUSD)
        ? formatNumber(summary.tokenCostUSD, 6)
        : null,
    token_estimate_strategy: summary.tokenEstimateStrategy,
    codex_preset: summary.codexPreset ?? null,
    codex_model: summary.codexModel ?? null,
    codex_reasoning: summary.codexReasoning ?? null,
    critics_required: summary.criticsRequired ?? [],
    critics_failed: summary.criticsFailed ?? [],
    correlation_id: summary.correlationId ?? null,
    prompt_cache_status: summary.promptCacheStatus ?? null,
    prompt_cache_tier: summary.promptCacheTier ?? null,
    prompt_cache_id: summary.promptCacheId ?? null,
    prompt_cache_hit: typeof summary.promptCacheHit === "boolean" ? summary.promptCacheHit : null,
    prompt_cache_store: typeof summary.promptCacheStore === "boolean" ? summary.promptCacheStore : null,
    prompt_cache_eligible:
      typeof summary.promptCacheEligible === "boolean" ? summary.promptCacheEligible : null,
    prompt_cache_raw: summary.promptCacheRaw ?? null,
  };
}
