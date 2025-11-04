/**
 * Prompt Evaluation Runner
 *
 * Executes golden task corpus and evaluates LLM outputs against criteria.
 *
 * Usage:
 *   import { runEvals } from './evals/runner';
 *   const results = await runEvals({ mode: 'full', model: 'sonnet' });
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '@anthropic-ai/sdk/resources/messages';

export interface GoldenTask {
  id: string;
  phase: string;
  prompt: string;
  expected_output_criteria: string[];
  pass_threshold: number;
  complexity: 'low' | 'medium' | 'high';
  reasoning_required: boolean;
}

export interface TaskResult {
  task_id: string;
  phase: string;
  passed: boolean;
  criteria_met: number;
  criteria_required: number;
  missing_criteria: string[];
  llm_output: string;
  latency_ms: number;
  tokens_input: number;
  tokens_output: number;
}

export interface EvalResults {
  run_id: string;
  timestamp: string;
  mode: 'quick' | 'full';
  model: string;
  total_tasks: number;
  passed: number;
  failed: number;
  success_rate: number;
  p95_latency_ms: number;
  total_tokens: number;
  cost_usd: number;
  task_results: TaskResult[];
  failed_tasks: Array<{
    id: string;
    phase: string;
    criteria_met: number;
    criteria_required: number;
    missing: string[];
  }>;
}

export interface EvalOptions {
  mode: 'quick' | 'full';
  model?: 'sonnet' | 'haiku';
  baselinePath?: string;
  filter?: string; // Task ID filter (e.g., "STRATEGIZE-001")
  runs?: number; // For baseline capture (default 1)
}

const MODEL_CONFIG = {
  sonnet: {
    name: 'claude-sonnet-4-5-20250929',
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015
  },
  haiku: {
    name: 'claude-haiku-4-5-20250929',
    cost_per_1k_input: 0.0008,
    cost_per_1k_output: 0.004
  }
};

/**
 * Load golden task corpus from JSONL file
 */
function loadCorpus(workspaceRoot: string, mode: 'quick' | 'full', filter?: string): GoldenTask[] {
  const corpusPath = path.join(workspaceRoot, 'tools/wvo_mcp/evals/prompts/golden/tasks.jsonl');

  if (!fs.existsSync(corpusPath)) {
    throw new Error(`Corpus not found: ${corpusPath}`);
  }

  const content = fs.readFileSync(corpusPath, 'utf-8');
  let tasks = content
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as GoldenTask);

  // Apply filter
  if (filter) {
    tasks = tasks.filter(t => t.id === filter);
  }

  // Sample for quick mode
  if (mode === 'quick' && !filter) {
    // Sample 5 tasks: 1 from each major phase
    const samples = [
      tasks.find(t => t.phase === 'strategize'),
      tasks.find(t => t.phase === 'spec'),
      tasks.find(t => t.phase === 'plan'),
      tasks.find(t => t.phase === 'implement'),
      tasks.find(t => t.phase === 'verify')
    ].filter((t): t is GoldenTask => t !== undefined);

    return samples;
  }

  return tasks;
}

/**
 * Evaluate LLM output against task criteria
 *
 * Uses LLM-as-judge to check if output meets each criterion.
 */
async function evaluateOutput(
  task: GoldenTask,
  output: string,
  client: InstanceType<typeof Anthropic>,
  model: string
): Promise<{ criteria_met: number; missing_criteria: string[] }> {
  const evaluationPrompt = `You are evaluating an LLM output against specific criteria.

**Task**: ${task.prompt}

**LLM Output**:
${output}

**Criteria to Check**:
${task.expected_output_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

For each criterion, respond with either "MET" or "NOT MET".

**Response Format** (JSON):
{
  "evaluations": [
    {"criterion": "<criterion text>", "met": true/false, "reasoning": "<brief explanation>"},
    ...
  ]
}

Be strict but fair. A criterion is MET if the output clearly addresses it, even if not perfectly.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: 'user', content: evaluationPrompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Expected text response from LLM evaluator');
    }

    // Parse JSON response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`Failed to parse evaluator response for ${task.id}, assuming all criteria not met`);
      return {
        criteria_met: 0,
        missing_criteria: task.expected_output_criteria
      };
    }

    const evaluation = JSON.parse(jsonMatch[0]) as {
      evaluations: Array<{ criterion: string; met: boolean; reasoning: string }>;
    };

    const metCriteria = evaluation.evaluations.filter(e => e.met);
    const missingCriteria = evaluation.evaluations.filter(e => !e.met).map(e => e.criterion);

    return {
      criteria_met: metCriteria.length,
      missing_criteria: missingCriteria
    };
  } catch (error) {
    console.error(`Evaluation error for ${task.id}:`, error);
    return {
      criteria_met: 0,
      missing_criteria: task.expected_output_criteria
    };
  }
}

/**
 * Run a single task through LLM and evaluate
 *
 * CRITICAL: Each task gets a FRESH API call with ZERO prior context.
 * This prevents context poisoning (task N seeing task N-1's output).
 * We create a NEW messages array for EVERY task.
 */
async function runTask(task: GoldenTask, client: InstanceType<typeof Anthropic>, model: string): Promise<TaskResult> {
  const startTime = Date.now();

  try {
    // FRESH API call - no conversation history, no context from previous tasks
    // This ensures task isolation and fair evaluation
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      temperature: 0,
      messages: [{ role: 'user', content: task.prompt }] // ONLY this task's prompt
    });

    const latency_ms = Date.now() - startTime;

    const content = response.content[0];
    const llm_output = content.type === 'text' ? content.text : '';

    // Evaluate output
    const { criteria_met, missing_criteria } = await evaluateOutput(task, llm_output, client, model);

    const passed = criteria_met >= task.pass_threshold;

    return {
      task_id: task.id,
      phase: task.phase,
      passed,
      criteria_met,
      criteria_required: task.pass_threshold,
      missing_criteria,
      llm_output,
      latency_ms,
      tokens_input: response.usage.input_tokens,
      tokens_output: response.usage.output_tokens
    };
  } catch (error) {
    console.error(`Error running task ${task.id}:`, error);

    return {
      task_id: task.id,
      phase: task.phase,
      passed: false,
      criteria_met: 0,
      criteria_required: task.pass_threshold,
      missing_criteria: task.expected_output_criteria,
      llm_output: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
      latency_ms: Date.now() - startTime,
      tokens_input: 0,
      tokens_output: 0
    };
  }
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(tokens_input: number, tokens_output: number, model: 'sonnet' | 'haiku'): number {
  const config = MODEL_CONFIG[model];
  const inputCost = (tokens_input / 1000) * config.cost_per_1k_input;
  const outputCost = (tokens_output / 1000) * config.cost_per_1k_output;
  return inputCost + outputCost;
}

/**
 * Run prompt evaluations
 */
export async function runEvals(options: EvalOptions, workspaceRoot: string): Promise<EvalResults> {
  const { mode, model = 'sonnet', filter, runs = 1 } = options;

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const modelName = MODEL_CONFIG[model].name;
  const tasks = loadCorpus(workspaceRoot, mode, filter);

  console.log(`Running ${mode} eval mode with ${tasks.length} tasks (model: ${model})`);

  // Run tasks (sequentially for now, can be parallelized later)
  const taskResults: TaskResult[] = [];
  for (const task of tasks) {
    console.log(`Running task ${task.id} (${task.phase})...`);
    const result = await runTask(task, client, modelName);
    taskResults.push(result);
    console.log(`  ${result.passed ? '✅ PASS' : '❌ FAIL'} (${result.criteria_met}/${result.criteria_required} criteria)`);
  }

  // Aggregate results
  const passed = taskResults.filter(r => r.passed).length;
  const failed = taskResults.length - passed;
  const success_rate = (passed / taskResults.length) * 100;

  const latencies = taskResults.map(r => r.latency_ms).sort((a, b) => a - b);
  const p95_index = Math.floor(latencies.length * 0.95);
  const p95_latency_ms = latencies[p95_index] || 0;

  const total_tokens_input = taskResults.reduce((sum, r) => sum + r.tokens_input, 0);
  const total_tokens_output = taskResults.reduce((sum, r) => sum + r.tokens_output, 0);
  const total_tokens = total_tokens_input + total_tokens_output;
  const cost_usd = calculateCost(total_tokens_input, total_tokens_output, model);

  const failed_tasks = taskResults
    .filter(r => !r.passed)
    .map(r => ({
      id: r.task_id,
      phase: r.phase,
      criteria_met: r.criteria_met,
      criteria_required: r.criteria_required,
      missing: r.missing_criteria
    }));

  const results: EvalResults = {
    run_id: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
    timestamp: new Date().toISOString(),
    mode,
    model: modelName,
    total_tasks: taskResults.length,
    passed,
    failed,
    success_rate,
    p95_latency_ms,
    total_tokens,
    cost_usd,
    task_results: taskResults,
    failed_tasks
  };

  return results;
}

/**
 * Compare results against baseline
 */
export function compareWithBaseline(
  currentResults: EvalResults,
  baselinePath: string
): {
  baseline_success_rate: number;
  current_success_rate: number;
  diff_percentage: number;
  threshold_met: boolean;
  degraded_tasks: string[];
  improved_tasks: string[];
} {
  const baselineContent = fs.readFileSync(baselinePath, 'utf-8');
  const baseline = JSON.parse(baselineContent) as EvalResults;

  const diff_percentage = currentResults.success_rate - baseline.success_rate;
  const threshold_met = diff_percentage >= -5; // Allow up to 5% degradation

  // Find task-level changes
  const baselineTaskMap = new Map(baseline.task_results.map(r => [r.task_id, r.passed]));
  const currentTaskMap = new Map(currentResults.task_results.map(r => [r.task_id, r.passed]));

  const degraded_tasks: string[] = [];
  const improved_tasks: string[] = [];

  for (const [taskId, baselinePassed] of baselineTaskMap.entries()) {
    const currentPassed = currentTaskMap.get(taskId);
    if (currentPassed === undefined) continue;

    if (baselinePassed && !currentPassed) {
      degraded_tasks.push(taskId);
    } else if (!baselinePassed && currentPassed) {
      improved_tasks.push(taskId);
    }
  }

  return {
    baseline_success_rate: baseline.success_rate,
    current_success_rate: currentResults.success_rate,
    diff_percentage,
    threshold_met,
    degraded_tasks,
    improved_tasks
  };
}
