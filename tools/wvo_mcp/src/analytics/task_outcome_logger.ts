import path from "node:path";

import { logWarning } from "../telemetry/logger.js";
import { appendJsonlRecord } from "./jsonl.js";

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

interface LogOptions {
  workspaceRoot?: string;
  relativePath?: string;
}

const DEFAULT_RELATIVE_PATH = path.join("analytics", "task_outcomes.jsonl");

export async function logTaskOutcome(outcome: TaskOutcome, options: LogOptions = {}): Promise<void> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const relativePath = options.relativePath ?? DEFAULT_RELATIVE_PATH;

  try {
    await appendJsonlRecord(outcome, {
      workspaceRoot,
      relativePath,
    });
  } catch (error) {
    logWarning("Failed to append task outcome", {
      relativePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
