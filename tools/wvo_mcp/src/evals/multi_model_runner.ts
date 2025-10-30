/**
 * Multi-Model Prompt Evaluation Runner
 *
 * Supports both Claude (Anthropic) and Codex (OpenAI) for cross-agent testing.
 *
 * CRITICAL: This addresses the gap identified in REVIEW phase:
 * - Original runner only supported Claude
 * - User emphasized Codex testing is "material"
 * - This version tests prompts against BOTH agents
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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
  agent: string; // 'claude' | 'codex' | 'gpt4'
  model: string; // Full model name
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
  agent: string;
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
  agent?: 'claude' | 'codex' | 'gpt4'; // Which agent to test
  model?: string; // Specific model override
  filter?: string;
  runs?: number;
}

const MODEL_CONFIG = {
  claude: {
    models: {
      sonnet: 'claude-sonnet-4-5-20250929',
      haiku: 'claude-haiku-4-5-20250929'
    },
    default: 'sonnet',
    cost_per_1k_input: {
      sonnet: 0.003,
      haiku: 0.0008
    },
    cost_per_1k_output: {
      sonnet: 0.015,
      haiku: 0.004
    }
  },
  codex: {
    models: {
      'gpt-4': 'gpt-4-0125-preview',
      'gpt-4-turbo': 'gpt-4-turbo-2024-04-09'
    },
    default: 'gpt-4',
    cost_per_1k_input: {
      'gpt-4': 0.01,
      'gpt-4-turbo': 0.01
    },
    cost_per_1k_output: {
      'gpt-4': 0.03,
      'gpt-4-turbo': 0.03
    }
  }
} as const;

type AgentType = keyof typeof MODEL_CONFIG;

// Map gpt4 to codex config (both use OpenAI)
function getAgentConfig(agent: string): AgentType {
  if (agent === 'gpt4') return 'codex';
  if (agent === 'claude' || agent === 'codex') return agent as AgentType;
  throw new Error(`Unknown agent: ${agent}`);
}

/**
 * Load golden task corpus
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

  if (filter) {
    tasks = tasks.filter(t => t.id === filter);
  }

  if (mode === 'quick' && !filter) {
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
 * Call Claude (Anthropic)
 */
async function callClaude(
  prompt: string,
  model: string,
  client: InstanceType<typeof Anthropic>
): Promise<{ output: string; tokens_input: number; tokens_output: number }> {
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }]
  });

  const content = response.content[0];
  const output = content.type === 'text' ? content.text : '';

  return {
    output,
    tokens_input: response.usage.input_tokens,
    tokens_output: response.usage.output_tokens
  };
}

/**
 * Call Codex/GPT-4 (OpenAI)
 */
async function callOpenAI(
  prompt: string,
  model: string,
  client: InstanceType<typeof OpenAI>
): Promise<{ output: string; tokens_input: number; tokens_output: number }> {
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 8000,
    temperature: 0
  });

  const output = response.choices[0]?.message?.content || '';
  const tokens_input = response.usage?.prompt_tokens || 0;
  const tokens_output = response.usage?.completion_tokens || 0;

  return { output, tokens_input, tokens_output };
}

/**
 * Evaluate output against criteria using LLM-as-judge
 */
async function evaluateOutput(
  task: GoldenTask,
  output: string,
  agent: string,
  model: string,
  claudeClient?: InstanceType<typeof Anthropic>,
  openaiClient?: InstanceType<typeof OpenAI>
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

Be strict but fair. A criterion is MET if the output clearly addresses it.`;

  try {
    let evalOutput: string;

    // Use Claude for evaluation (more reliable for judgment tasks)
    if (claudeClient) {
      const response = await claudeClient.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        temperature: 0,
        messages: [{ role: 'user', content: evaluationPrompt }]
      });
      const content = response.content[0];
      evalOutput = content.type === 'text' ? content.text : '';
    } else if (openaiClient) {
      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4-0125-preview',
        messages: [{ role: 'user', content: evaluationPrompt }],
        max_tokens: 2000,
        temperature: 0
      });
      evalOutput = response.choices[0]?.message?.content || '';
    } else {
      throw new Error('No client available for evaluation');
    }

    const jsonMatch = evalOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`Failed to parse evaluator response for ${task.id}`);
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
 * Run a single task
 *
 * CRITICAL: Each task gets FRESH API call with ZERO context (prevents poisoning)
 */
async function runTask(
  task: GoldenTask,
  agent: string,
  model: string,
  claudeClient?: InstanceType<typeof Anthropic>,
  openaiClient?: InstanceType<typeof OpenAI>
): Promise<TaskResult> {
  const startTime = Date.now();

  try {
    let llm_output: string;
    let tokens_input: number;
    let tokens_output: number;

    // Call appropriate LLM
    if (agent === 'claude' && claudeClient) {
      const result = await callClaude(task.prompt, model, claudeClient);
      llm_output = result.output;
      tokens_input = result.tokens_input;
      tokens_output = result.tokens_output;
    } else if ((agent === 'codex' || agent === 'gpt4') && openaiClient) {
      const result = await callOpenAI(task.prompt, model, openaiClient);
      llm_output = result.output;
      tokens_input = result.tokens_input;
      tokens_output = result.tokens_output;
    } else {
      throw new Error(`No client for agent: ${agent}`);
    }

    const latency_ms = Date.now() - startTime;

    // Evaluate output
    const { criteria_met, missing_criteria } = await evaluateOutput(
      task,
      llm_output,
      agent,
      model,
      claudeClient,
      openaiClient
    );

    const passed = criteria_met >= task.pass_threshold;

    return {
      task_id: task.id,
      phase: task.phase,
      agent,
      model,
      passed,
      criteria_met,
      criteria_required: task.pass_threshold,
      missing_criteria,
      llm_output,
      latency_ms,
      tokens_input,
      tokens_output
    };
  } catch (error) {
    console.error(`Error running task ${task.id}:`, error);

    return {
      task_id: task.id,
      phase: task.phase,
      agent,
      model,
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
 * Calculate cost
 */
function calculateCost(
  tokens_input: number,
  tokens_output: number,
  agent: string,
  modelVariant: string
): number {
  const agentType = getAgentConfig(agent);
  const config = MODEL_CONFIG[agentType];

  const inputCost = (tokens_input / 1000) * ((config.cost_per_1k_input as any)[modelVariant] || 0);
  const outputCost = (tokens_output / 1000) * ((config.cost_per_1k_output as any)[modelVariant] || 0);

  return inputCost + outputCost;
}

/**
 * Run evaluations
 */
export async function runEvals(options: EvalOptions, workspaceRoot: string): Promise<EvalResults> {
  const { mode, agent = 'claude', model: modelOverride, filter, runs = 1 } = options;

  // Get model config (maps gpt4 → codex)
  const agentType = getAgentConfig(agent);
  const config = MODEL_CONFIG[agentType];

  const modelVariant = modelOverride || config.default;
  const modelName = (config.models as any)[modelVariant] || modelVariant;

  // Create clients
  let claudeClient: InstanceType<typeof Anthropic> | undefined;
  let openaiClient: InstanceType<typeof OpenAI> | undefined;

  if (agent === 'claude') {
    claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } else {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // Always create Claude client for evaluation (more reliable judge)
  if (!claudeClient && process.env.ANTHROPIC_API_KEY) {
    claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  const tasks = loadCorpus(workspaceRoot, mode, filter);

  console.log(`Running ${mode} eval mode with ${tasks.length} tasks (agent: ${agent}, model: ${modelName})`);

  // Run tasks
  const taskResults: TaskResult[] = [];
  for (const task of tasks) {
    console.log(`Running task ${task.id} (${task.phase})...`);
    const result = await runTask(task, agent, modelName, claudeClient, openaiClient);
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
  const cost_usd = calculateCost(total_tokens_input, total_tokens_output, agent, modelVariant);

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
    agent,
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
 * Compare Claude vs Codex results
 */
export function compareAgents(
  claudeResults: EvalResults,
  codexResults: EvalResults
): {
  claude_success_rate: number;
  codex_success_rate: number;
  diff_percentage: number;
  tasks_claude_better: string[];
  tasks_codex_better: string[];
  tasks_both_pass: string[];
  tasks_both_fail: string[];
} {
  const claudeTaskMap = new Map(claudeResults.task_results.map(r => [r.task_id, r.passed]));
  const codexTaskMap = new Map(codexResults.task_results.map(r => [r.task_id, r.passed]));

  const tasks_claude_better: string[] = [];
  const tasks_codex_better: string[] = [];
  const tasks_both_pass: string[] = [];
  const tasks_both_fail: string[] = [];

  for (const [taskId, claudePassed] of claudeTaskMap.entries()) {
    const codexPassed = codexTaskMap.get(taskId);
    if (codexPassed === undefined) continue;

    if (claudePassed && codexPassed) {
      tasks_both_pass.push(taskId);
    } else if (!claudePassed && !codexPassed) {
      tasks_both_fail.push(taskId);
    } else if (claudePassed && !codexPassed) {
      tasks_claude_better.push(taskId);
    } else if (!claudePassed && codexPassed) {
      tasks_codex_better.push(taskId);
    }
  }

  return {
    claude_success_rate: claudeResults.success_rate,
    codex_success_rate: codexResults.success_rate,
    diff_percentage: claudeResults.success_rate - codexResults.success_rate,
    tasks_claude_better,
    tasks_codex_better,
    tasks_both_pass,
    tasks_both_fail
  };
}
