import type { Task } from "../orchestrator/state_machine.js";
import type { ExecutionOutcome } from "../orchestrator/agent_pool.js";
import type { QualityCheckResult } from "../orchestrator/quality_monitor.js";
import type { ExecutionSummary } from "../orchestrator/agent_coordinator.js";
import type { AssembledContext } from "../orchestrator/context_assembler.js";

import {
  type GuardrailAdjustment,
  type TaskOutcome,
} from "./task_outcome_logger.js";

type CriticSnapshot = {
  passed: boolean;
  required: readonly string[];
  failedCritics: readonly string[];
} | null;

export interface TaskOutcomeBuilderInput {
  task: Task;
  execution: ExecutionOutcome;
  quality: QualityCheckResult;
  summary: ExecutionSummary;
  context: AssembledContext;
  criticOutcome?: CriticSnapshot;
  guardrailAdjustments?: GuardrailAdjustment[];
  promptTemplateId?: string | null;
  promptVersion?: string | null;
  failureReason?: string | null;
  failureCategory?: string | null;
  overrides?: Partial<TaskOutcome>;
}

type AnyRecord = Record<string, unknown>;

export function buildTaskOutcome(input: TaskOutcomeBuilderInput): TaskOutcome {
  const {
    task,
    execution,
    quality,
    summary,
    context,
    criticOutcome,
    guardrailAdjustments = [],
    promptTemplateId,
    promptVersion,
    failureReason,
    failureCategory,
    overrides,
  } = input;

  const nowIso = new Date().toISOString();
  const metadata = (task.metadata ?? {}) as AnyRecord;

  const estimatedFiles = extractNumber(metadata, [
    ["estimated_files"],
    ["metrics", "estimated_files"],
    ["plan", "estimated_files"],
  ]);
  const actualFiles = extractNumber(metadata, [
    ["actual_files"],
    ["metrics", "actual_files"],
    ["telemetry", "actual_files"],
  ]);
  const estimatedLoc = extractNumber(metadata, [
    ["estimated_loc"],
    ["metrics", "estimated_loc"],
  ]);
  const actualLoc = extractNumber(metadata, [
    ["actual_loc"],
    ["metrics", "actual_loc"],
  ]);
  const estimatedMinutes =
    extractNumber(metadata, [
      ["estimated_time_minutes"],
      ["metrics", "estimated_time_minutes"],
      ["budgets", "time", "estimated_minutes"],
    ]) ?? null;

  const durationSeconds = summary.durationSeconds ?? execution.durationSeconds ?? null;
  const actualMinutes =
    durationSeconds !== null ? Number((durationSeconds / 60).toFixed(2)) : null;

  const tokenBudgetEstimated =
    extractNumber(metadata, [
      ["token_budget_estimated"],
      ["budgets", "tokens", "estimated"],
      ["metrics", "token_budget_estimated"],
    ]) ?? null;
  const tokenBudgetActual =
    execution.tokenUsage?.totalTokens !== undefined
      ? execution.tokenUsage.totalTokens
      : summary.totalTokens ?? null;

  const costEstimateUsd =
    extractNumber(metadata, [
      ["cost_estimate_usd"],
      ["budgets", "cost", "estimated"],
    ]) ?? null;
  const costActualUsd =
    typeof execution.costUSD === "number"
      ? Number(execution.costUSD.toFixed(4))
      : summary.tokenCostUSD ?? null;

  const promptTokens =
    execution.tokenUsage?.promptTokens ?? summary.promptTokens ?? null;
  const completionTokens =
    execution.tokenUsage?.completionTokens ?? summary.completionTokens ?? null;

  const qualityScore =
    typeof quality.score === "number" ? Number(quality.score.toFixed(3)) : null;

  const guardrailIssues = new Set<string>();
  for (const issue of quality.issues ?? []) {
    if (typeof issue === "string" && issue.trim().length > 0) {
      guardrailIssues.add(issue.trim());
    }
  }
  for (const issue of summary.issues ?? []) {
    if (typeof issue === "string" && issue.trim().length > 0) {
      guardrailIssues.add(issue.trim());
    }
  }
  if (criticOutcome?.failedCritics?.length) {
    for (const critic of criticOutcome.failedCritics) {
      guardrailIssues.add(`critic_failed:${critic}`);
    }
  }

  const influencedByTask = determineInfluencedByTask(context);
  const evidencePath = deriveEvidencePath(task.id, metadata);

  const pheromoneStrength =
    qualityScore !== null && summary.success ? clamp(qualityScore, 0, 1) : 0;

  const baseOutcome: TaskOutcome = {
    timestamp: nowIso,
    task_id: task.id,
    success: summary.success,
    estimated_files: estimatedFiles,
    actual_files: actualFiles,
    estimated_loc: estimatedLoc,
    actual_loc: actualLoc,
    estimated_time_minutes: estimatedMinutes,
    actual_time_minutes: actualMinutes,
    build_passed: null,
    tests_passed: null,
    audit_passed: null,
    failure_reason: failureReason ?? null,
    failure_category: failureCategory ?? null,
    budgets: {
      token_budget_estimated: tokenBudgetEstimated,
      token_budget_actual: tokenBudgetActual,
      time_budget_estimated_minutes: estimatedMinutes,
      time_budget_actual_minutes: actualMinutes,
      cost_estimate_usd: costEstimateUsd,
      cost_actual_usd: costActualUsd,
    },
    prompt: {
      prompt_template_id: promptTemplateId ?? derivePromptTemplateId(summary, task),
      prompt_version: promptVersion ?? null,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    },
    guardrails_triggered: Array.from(guardrailIssues).sort(),
    guardrails_adjusted: guardrailAdjustments,
    stigmergy: {
      influenced_by_task: influencedByTask,
      influenced_next_task: overrides?.stigmergy?.influenced_next_task ?? false,
      next_task_id: overrides?.stigmergy?.next_task_id ?? null,
      evidence_bundle_path: evidencePath,
      pheromone_strength: pheromoneStrength,
    },
    quality_score: qualityScore,
    critic_issues: criticOutcome?.failedCritics
      ? Array.from(new Set(criticOutcome.failedCritics.map((critic) => `critic_failed:${critic}`))).sort()
      : undefined,
    agent_id: summary.agentId,
    agent_type: summary.agentType,
    time_to_complete_seconds: durationSeconds,
  };

  return overrides ? mergeOutcome(baseOutcome, overrides) : baseOutcome;
}

function extractNumber(metadata: AnyRecord, paths: string[][]): number | null {
  for (const pathSegments of paths) {
    const value = get(metadata, pathSegments);
    const numeric = coerceNumber(value);
    if (numeric !== null) {
      return numeric;
    }
  }
  return null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[, ]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function get(source: AnyRecord, pathSegments: string[]): unknown {
  let current: unknown = source;
  for (const segment of pathSegments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as AnyRecord)[segment];
  }
  return current;
}

function determineInfluencedByTask(context: AssembledContext): string | null {
  if (!Array.isArray(context.relatedTasks) || context.relatedTasks.length === 0) {
    return null;
  }
  const doneTask = context.relatedTasks.find((related) => related.status === "done");
  return doneTask?.id ?? context.relatedTasks[0]?.id ?? null;
}

function deriveEvidencePath(taskId: string, metadata: AnyRecord): string {
  const explicit =
    typeof metadata.evidence_bundle_path === "string" && metadata.evidence_bundle_path.length > 0
      ? metadata.evidence_bundle_path
      : null;
  return explicit ?? pathJoin("state", "evidence", taskId);
}

function derivePromptTemplateId(summary: ExecutionSummary, task: Task): string {
  const base = summary.agentType ?? "unknown_agent";
  const phase = summary.finalStatus ?? task.status;
  return `standard_${base}_${phase}`;
}

function mergeOutcome(base: TaskOutcome, overrides: Partial<TaskOutcome>): TaskOutcome {
  return {
    ...base,
    ...overrides,
    budgets: { ...base.budgets, ...overrides.budgets },
    prompt: { ...base.prompt, ...overrides.prompt },
    guardrails_adjusted: overrides.guardrails_adjusted ?? base.guardrails_adjusted,
    stigmergy: { ...base.stigmergy, ...overrides.stigmergy },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pathJoin(...segments: string[]): string {
  return segments.join("/").replace(/\\/g, "/");
}

