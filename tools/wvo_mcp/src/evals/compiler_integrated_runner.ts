/**
 * Compiler-Integrated Prompt Evaluation Runner
 *
 * Extends basic eval runner with IMP-21..26 integration:
 * - IMP-21: Use PromptCompiler to generate eval prompts
 * - IMP-22: Test persona variants
 * - IMP-23: Test with domain overlays
 * - IMP-24: Capture attestation hashes
 * - IMP-26: Track variant IDs in results
 *
 * Usage:
 *   import { runIntegratedEvals } from './evals/compiler_integrated_runner';
 *   const results = await runIntegratedEvals({
 *     mode: 'full',
 *     testVariants: true,
 *     personas: ['planner', 'implementer'],
 *     overlays: ['orchestrator', 'api', 'security']
 *   });
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { PromptCompiler, type CompiledPrompt } from '../prompt/compiler.js';
import type { Message } from '@anthropic-ai/sdk/resources/messages';

/**
 * Task template for compiler-based eval generation.
 * Instead of static prompts, defines how to compile prompts dynamically.
 */
export interface CompilerTaskTemplate {
  id: string;
  phase: 'strategize' | 'spec' | 'plan' | 'think' | 'implement' | 'verify' | 'review' | 'pr' | 'monitor';
  scenario: string; // Brief description for context slot
  expected_output_criteria: string[];
  pass_threshold: number;
  complexity: 'low' | 'medium' | 'high';
  reasoning_required: boolean;
}

/**
 * Prompt variant configuration (IMP-26).
 */
export interface PromptVariant {
  variantId: string;
  description: string;
  persona?: string; // Persona content to inject
  domain?: string; // Domain overlay to apply
  overlayWeight?: number; // Overlay influence (0-1)
}

/**
 * Result with compiler integration metadata.
 */
export interface IntegratedTaskResult {
  task_id: string;
  variant_id: string; // IMP-26: Track which variant was tested
  attestation_hash: string; // IMP-24: Compiler hash for reproducibility
  phase: string;
  passed: boolean;
  criteria_met: number;
  criteria_required: number;
  missing_criteria: string[];
  llm_output: string;
  latency_ms: number;
  tokens_input: number;
  tokens_output: number;
  compiled_prompt_text: string; // Full compiled prompt for debugging
  prompt_slots: Record<string, string>; // Original slots for analysis
}

/**
 * Aggregated results across all variants.
 */
export interface VariantComparisonResults {
  run_id: string;
  timestamp: string;
  mode: 'quick' | 'full';
  model: string;
  variants_tested: string[];
  baseline: {
    variant_id: string;
    success_rate: number;
    p95_latency_ms: number;
  };
  variant_results: Array<{
    variant_id: string;
    description: string;
    success_rate: number;
    improvement_over_baseline: number; // Percentage points
    p95_latency_ms: number;
    cost_usd: number;
    tasks_passed: number;
    tasks_failed: number;
  }>;
  best_variant: {
    variant_id: string;
    success_rate: number;
    reason: string;
  };
  task_details: IntegratedTaskResult[];
}

export interface IntegratedEvalOptions {
  mode: 'quick' | 'full';
  model?: 'sonnet' | 'haiku';
  testVariants?: boolean; // If true, test baseline + personas + overlays
  personas?: string[]; // Persona contents to test (e.g., ["planner focused", "implementer focused"])
  overlays?: string[]; // Domain overlays to test (e.g., ["orchestrator", "api", "security"])
  baselinePath?: string;
  filter?: string;
  runs?: number;
  workspaceRoot: string;
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
 * Load compiler task templates.
 * These define how to generate prompts dynamically vs. static golden tasks.
 */
function loadCompilerTemplates(workspaceRoot: string, mode: 'quick' | 'full'): CompilerTaskTemplate[] {
  const templatesPath = path.join(workspaceRoot, 'tools/wvo_mcp/evals/prompts/compiler_templates.jsonl');

  // If compiler templates don't exist, fall back to converting existing golden tasks
  if (!fs.existsSync(templatesPath)) {
    console.warn('[CompilerEvals] compiler_templates.jsonl not found, converting from golden tasks...');
    return convertGoldenTasksToTemplates(workspaceRoot, mode);
  }

  const content = fs.readFileSync(templatesPath, 'utf-8');
  const templates = content
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as CompilerTaskTemplate);

  if (mode === 'quick') {
    // Quick mode: Sample 5 diverse tasks
    return sampleDiverseTasks(templates, 5);
  }

  return templates;
}

/**
 * Convert existing golden tasks to compiler templates.
 * Extracts phase and scenario from static prompts.
 */
function convertGoldenTasksToTemplates(workspaceRoot: string, mode: 'quick' | 'full'): CompilerTaskTemplate[] {
  const corpusPath = path.join(workspaceRoot, 'tools/wvo_mcp/evals/prompts/golden/tasks.jsonl');

  if (!fs.existsSync(corpusPath)) {
    throw new Error(`Neither compiler_templates.jsonl nor tasks.jsonl found`);
  }

  const content = fs.readFileSync(corpusPath, 'utf-8');
  const tasks = content
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  const templates: CompilerTaskTemplate[] = tasks.map((task: any) => ({
    id: task.id,
    phase: task.phase as any,
    scenario: extractScenario(task.prompt),
    expected_output_criteria: task.expected_output_criteria,
    pass_threshold: task.pass_threshold,
    complexity: task.complexity,
    reasoning_required: task.reasoning_required
  }));

  if (mode === 'quick') {
    return sampleDiverseTasks(templates, 5);
  }

  return templates;
}

/**
 * Extract scenario description from static prompt.
 */
function extractScenario(prompt: string): string {
  // Simple extraction: First sentence or up to 200 chars
  const firstSentence = prompt.split('.')[0];
  return firstSentence.length > 200 ? firstSentence.substring(0, 200) + '...' : firstSentence;
}

/**
 * Sample diverse tasks across phases.
 */
function sampleDiverseTasks(templates: CompilerTaskTemplate[], count: number): CompilerTaskTemplate[] {
  const phaseGroups: Record<string, CompilerTaskTemplate[]> = {};

  for (const template of templates) {
    if (!phaseGroups[template.phase]) {
      phaseGroups[template.phase] = [];
    }
    phaseGroups[template.phase].push(template);
  }

  const phases = Object.keys(phaseGroups);
  const sampled: CompilerTaskTemplate[] = [];

  // Sample evenly across phases
  for (let i = 0; i < count; i++) {
    const phase = phases[i % phases.length];
    const tasksInPhase = phaseGroups[phase];
    if (tasksInPhase && tasksInPhase.length > 0) {
      const idx = Math.floor(i / phases.length) % tasksInPhase.length;
      sampled.push(tasksInPhase[idx]);
    }
  }

  return sampled;
}

/**
 * Generate prompt variants to test (baseline + personas + overlays).
 */
function generateVariants(options: IntegratedEvalOptions): PromptVariant[] {
  const variants: PromptVariant[] = [];

  // Baseline (no persona, no overlay)
  variants.push({
    variantId: 'baseline',
    description: 'Baseline (no persona, no overlay)',
    persona: undefined,
    domain: undefined
  });

  if (!options.testVariants) {
    return variants; // Only baseline
  }

  // Persona variants (IMP-22)
  if (options.personas && options.personas.length > 0) {
    for (const personaContent of options.personas) {
      variants.push({
        variantId: `persona-${personaContent.split(' ')[0].toLowerCase()}`,
        description: `Persona: ${personaContent}`,
        persona: personaContent,
        domain: undefined
      });
    }
  }

  // Domain overlay variants (IMP-23)
  if (options.overlays && options.overlays.length > 0) {
    for (const overlay of options.overlays) {
      variants.push({
        variantId: `overlay-${overlay}`,
        description: `Overlay: ${overlay}`,
        persona: undefined,
        domain: overlay
      });
    }
  }

  // Combined variants (persona + overlay)
  if (options.personas && options.overlays) {
    // Test first persona with each overlay
    const firstPersona = options.personas[0];
    for (const overlay of options.overlays) {
      variants.push({
        variantId: `combined-${firstPersona.split(' ')[0].toLowerCase()}-${overlay}`,
        description: `Persona: ${firstPersona} + Overlay: ${overlay}`,
        persona: firstPersona,
        domain: overlay
      });
    }
  }

  return variants;
}

/**
 * Compile prompt using PromptCompiler (IMP-21 integration).
 */
function compilePrompt(
  template: CompilerTaskTemplate,
  variant: PromptVariant,
  workspaceRoot: string
): CompiledPrompt {
  const compiler = new PromptCompiler();

  // Load phase-specific system prompt
  const systemPrompt = loadSystemPrompt(template.phase, workspaceRoot);
  const phasePrompt = loadPhasePrompt(template.phase, workspaceRoot);

  return compiler.compile({
    system: systemPrompt,
    phase: phasePrompt,
    domain: variant.domain,
    persona: variant.persona,
    context: `Task: ${template.scenario}\n\nExpected: ${template.expected_output_criteria.join(', ')}`
  });
}

/**
 * Load system prompt from templates.
 */
function loadSystemPrompt(phase: string, workspaceRoot: string): string {
  // Simplified: Use generic system prompt
  // In production, load from templates/system.md
  return `You are Claude, an AI assistant helping with the ${phase.toUpperCase()} phase of a software development task.`;
}

/**
 * Load phase-specific prompt from templates.
 */
function loadPhasePrompt(phase: string, workspaceRoot: string): string {
  // Simplified: Use generic phase prompts
  // In production, load from templates/phases/${phase}.md
  const phasePrompts: Record<string, string> = {
    strategize: 'STRATEGIZE: Reframe the problem, evaluate alternatives, recommend approach with justification.',
    spec: 'SPEC: Define acceptance criteria, out-of-scope items, verification mapping.',
    plan: 'PLAN: Break down into steps, estimate time, identify dependencies.',
    think: 'THINK: Document assumptions, edge cases, pre-mortem analysis.',
    implement: 'IMPLEMENT: Write code with error handling, tests, documentation.',
    verify: 'VERIFY: Create comprehensive test plan, validate all acceptance criteria.',
    review: 'REVIEW: Adversarial critique, find gaps, recommend improvements.',
    pr: 'PR: Create commit message, rollback plan, follow-up tasks.',
    monitor: 'MONITOR: Define metrics, alert thresholds, success criteria.'
  };

  return phasePrompts[phase] || `${phase.toUpperCase()}: Complete the task.`;
}

/**
 * Evaluate LLM output against criteria using LLM-as-judge.
 */
async function evaluateCriteria(
  llmOutput: string,
  criteria: string[],
  client: Anthropic,
  model: string
): Promise<{ criteriaMet: string[]; criteriaMissing: string[] }> {
  const judgePrompt = `You are evaluating an LLM output against criteria.

Output to evaluate:
${llmOutput}

Criteria (check which are met):
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

For each criterion, respond with either "MET" or "NOT MET".

Format:
1. [MET/NOT MET]
2. [MET/NOT MET]
...`;

  const judgeResponse = await client.messages.create({
    model,
    max_tokens: 1000,
    messages: [{ role: 'user', content: judgePrompt }]
  });

  const judgeText = (judgeResponse.content[0] as any).text;
  const lines = judgeText.trim().split('\n');

  const criteriaMet: string[] = [];
  const criteriaMissing: string[] = [];

  for (let i = 0; i < criteria.length; i++) {
    const line = lines[i] || '';
    if (line.includes('MET') && !line.includes('NOT MET')) {
      criteriaMet.push(criteria[i]);
    } else {
      criteriaMissing.push(criteria[i]);
    }
  }

  return { criteriaMet, criteriaMissing };
}

/**
 * Run single eval task with compiled prompt.
 */
async function runSingleTask(
  template: CompilerTaskTemplate,
  variant: PromptVariant,
  client: Anthropic,
  model: string,
  workspaceRoot: string
): Promise<IntegratedTaskResult> {
  // Step 1: Compile prompt (IMP-21)
  const compiled = compilePrompt(template, variant, workspaceRoot);

  // Step 2: Run LLM
  const startTime = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: compiled.text }]
  });
  const latency = Date.now() - startTime;

  const llmOutput = (response.content[0] as any).text;

  // Step 3: Evaluate criteria (LLM-as-judge)
  const { criteriaMet, criteriaMissing } = await evaluateCriteria(
    llmOutput,
    template.expected_output_criteria,
    client,
    model
  );

  const passed = criteriaMet.length >= template.pass_threshold;

  // Convert PromptInput slots to Record<string, string> for JSON serialization
  const slots: Record<string, string> = {
    system: compiled.slots.system,
    phase: compiled.slots.phase
  };
  if (compiled.slots.domain) slots.domain = compiled.slots.domain;
  if (compiled.slots.skills) slots.skills = compiled.slots.skills;
  if (compiled.slots.rubric) slots.rubric = compiled.slots.rubric;
  if (compiled.slots.persona) slots.persona = compiled.slots.persona;
  if (compiled.slots.context) slots.context = compiled.slots.context;

  return {
    task_id: template.id,
    variant_id: variant.variantId, // IMP-26
    attestation_hash: compiled.hash, // IMP-24
    phase: template.phase,
    passed,
    criteria_met: criteriaMet.length,
    criteria_required: template.pass_threshold,
    missing_criteria: criteriaMissing,
    llm_output: llmOutput.substring(0, 500), // Truncate for size
    latency_ms: latency,
    tokens_input: response.usage.input_tokens,
    tokens_output: response.usage.output_tokens,
    compiled_prompt_text: compiled.text.substring(0, 500), // Truncate
    prompt_slots: slots
  };
}

/**
 * Run integrated evals with compiler, personas, and overlays.
 */
export async function runIntegratedEvals(
  options: IntegratedEvalOptions
): Promise<VariantComparisonResults> {
  // Step 1: Load templates
  const templates = loadCompilerTemplates(options.workspaceRoot, options.mode);

  // Step 2: Generate variants to test
  const variants = generateVariants(options);

  // Step 3: Initialize Anthropic client
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY required');
  }
  const client = new Anthropic({ apiKey });

  const modelConfig = MODEL_CONFIG[options.model || 'sonnet'];
  const modelName = modelConfig.name;

  // Step 4: Run evals for each variant
  const allResults: IntegratedTaskResult[] = [];

  console.log(`[IntegratedEvals] Testing ${variants.length} variants across ${templates.length} tasks...`);

  for (const variant of variants) {
    console.log(`[IntegratedEvals] Running variant: ${variant.variantId} - ${variant.description}`);

    for (const template of templates) {
      try {
        const result = await runSingleTask(template, variant, client, modelName, options.workspaceRoot);
        allResults.push(result);
      } catch (error) {
        console.error(`[IntegratedEvals] Task ${template.id} (${variant.variantId}) failed:`, error);
        // Continue with other tasks
      }
    }
  }

  // Step 5: Aggregate results by variant
  const variantStats = variants.map(variant => {
    const variantResults = allResults.filter(r => r.variant_id === variant.variantId);
    const passed = variantResults.filter(r => r.passed).length;
    const failed = variantResults.length - passed;
    const successRate = variantResults.length > 0 ? passed / variantResults.length : 0;

    const latencies = variantResults.map(r => r.latency_ms).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies[p95Index] || 0;

    const totalTokens = variantResults.reduce((sum, r) => sum + r.tokens_input + r.tokens_output, 0);
    const costUsd =
      (totalTokens / 1000) *
      ((modelConfig.cost_per_1k_input + modelConfig.cost_per_1k_output) / 2);

    return {
      variant_id: variant.variantId,
      description: variant.description,
      success_rate: successRate,
      improvement_over_baseline: 0, // Calculated below
      p95_latency_ms: p95Latency,
      cost_usd: costUsd,
      tasks_passed: passed,
      tasks_failed: failed
    };
  });

  // Step 6: Calculate improvements over baseline
  const baseline = variantStats.find(v => v.variant_id === 'baseline');
  const baselineSuccessRate = baseline?.success_rate || 0;

  variantStats.forEach(variant => {
    variant.improvement_over_baseline = (variant.success_rate - baselineSuccessRate) * 100;
  });

  // Step 7: Identify best variant
  const bestVariant = variantStats.reduce((best, current) =>
    current.success_rate > best.success_rate ? current : best
  );

  return {
    run_id: `integrated-eval-${Date.now()}`,
    timestamp: new Date().toISOString(),
    mode: options.mode,
    model: options.model || 'sonnet',
    variants_tested: variants.map(v => v.variantId),
    baseline: {
      variant_id: 'baseline',
      success_rate: baselineSuccessRate,
      p95_latency_ms: baseline?.p95_latency_ms || 0
    },
    variant_results: variantStats,
    best_variant: {
      variant_id: bestVariant.variant_id,
      success_rate: bestVariant.success_rate,
      reason: `Highest success rate: ${(bestVariant.success_rate * 100).toFixed(1)}% (+${bestVariant.improvement_over_baseline.toFixed(1)}pp over baseline)`
    },
    task_details: allResults
  };
}
