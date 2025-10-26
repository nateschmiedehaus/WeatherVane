import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { logDebug, logInfo, logWarning } from '../telemetry/logger.js';
import type { Task } from './state_machine.js';
import { withSpan } from '../telemetry/tracing.js';
import {
  ModelCatalogSchema,
  ModelCapability as CatalogModelCapability,
  ModelCapabilitySchema,
  ReasoningStrengthEnum,
  CodeQualityEnum,
  PriceClassEnum,
  ensureNotes,
  ProviderEnum,
} from './model_catalog_schema.js';
import { ROUTER_ALLOWED_MODELS, ROUTER_ALLOWED_PROVIDERS, ROUTER_LOCKED_MODELS } from './router_lock.js';
import {
  CapabilityTag,
  loadRouterPolicy,
  resolvePolicyPath,
  RouterPolicy,
  RouterState,
} from './router_policy.js';

export interface ModelRouterOptions {
  workspaceRoot: string;
  runId?: string;
  policyPath?: string;
  cooldownMs?: number;
  discoveryPath?: string;
  decisionLogger?: (entry: RouterDecisionLog) => void;
}

type RouterModelCapability = CatalogModelCapability & {
  capabilityTags: CapabilityTag[];
};

export interface ModelSelection {
  model: string;
  provider: string;
  capabilityTags: CapabilityTag[];
  priceClass?: string;
  latencyMs?: number;
  source: 'discovery' | 'policy';
  reason: string;
}

export interface RouterPickOptions {
  taskId: string;
  contextTokens?: number;
  forceLongContext?: boolean;
  hints?: RouterPickHints;
}

export interface RouterPickHints {
  touchedFiles?: number;
  securitySensitive?: boolean;
  repeatedVerifyFailures?: number;
}

export interface RouterDecisionLog {
  taskId: string;
  state: RouterState;
  requestedTags: CapabilityTag[];
  selected: ModelSelection;
  fallbackApplied: boolean;
}

const MODEL_CAPABILITY_OVERRIDES: Record<string, CapabilityTag[]> = (() => {
  const mapping: Record<string, Set<CapabilityTag>> = {};
  for (const [tag, models] of Object.entries(ROUTER_LOCKED_MODELS) as Array<[CapabilityTag, readonly string[]]>) {
    for (const model of models) {
      if (!mapping[model]) {
        mapping[model] = new Set();
      }
      mapping[model].add(tag);
    }
  }
  return Object.fromEntries(
    Object.entries(mapping).map(([model, tags]) => [model, Array.from(tags)])
  );
})();

const REASONING_RANK: Record<z.infer<typeof ReasoningStrengthEnum>, number> = {
  low: 1,
  medium: 2,
  medium_high: 3,
  high: 4,
  ultra: 5,
};

const CODE_QUALITY_RANK: Record<z.infer<typeof CodeQualityEnum>, number> = {
  low: 1,
  medium: 2,
  high: 3,
  ultra: 4,
};

const PRICE_CLASS_RANK: Record<z.infer<typeof PriceClassEnum>, number> = {
  cheap: 3,
  normal: 2,
  premium: 1,
};

type NormalizedRouterOptions = {
  workspaceRoot: string;
  runId: string;
  policyPath: string;
  cooldownMs: number;
  discoveryPath: string;
  decisionLogger?: (entry: RouterDecisionLog) => void;
};

export class ModelRouter {
  private readonly options: NormalizedRouterOptions;
  private readonly policy: RouterPolicy;
  private catalog: RouterModelCapability[] = [];
  private catalogSource: 'discovery' | 'policy' = 'policy';
  private catalogLoaded = false;
  private providerCooldownUntil = new Map<string, number>();
  private verifyFailures = new Map<string, number>();
  private forcedReasoningHigh = new Set<string>();
  private fastCodeEscalation = new Set<string>();
  private stateCapabilities: Record<RouterState, CapabilityTag[]>;

  constructor(opts: ModelRouterOptions) {
    const resolvedPolicyPath = resolvePolicyPath(opts.workspaceRoot, opts.policyPath);
    this.options = {
      workspaceRoot: opts.workspaceRoot,
      runId: opts.runId ?? process.env.WVO_RUN_ID ?? '',
      policyPath: resolvedPolicyPath,
      cooldownMs: opts.cooldownMs ?? 3 * 60 * 1000,
      discoveryPath: opts.discoveryPath ?? '',
      decisionLogger: opts.decisionLogger,
    };
    this.policy = loadRouterPolicy(this.options.policyPath);
    this.stateCapabilities = this.policy.stateCapabilities;
  }

  setDecisionLogger(logger?: (entry: RouterDecisionLog) => void): void {
    this.options.decisionLogger = logger;
  }

  pickModel(state: RouterState, options: RouterPickOptions): ModelSelection {
    this.ensureCatalogLoaded();
    const requiredTags = this.resolveRequiredTags(
      state,
      options.taskId,
      options.contextTokens,
      options.forceLongContext
    );
    const { candidates, fallbackApplied } = this.findCandidates(requiredTags);
    if (candidates.length === 0) {
      throw new Error('No available models in router catalog.');
    }

    const selection = this.rankCandidates(
      candidates,
      state,
      requiredTags,
      options.taskId,
      options.hints
    )[0];
    if (!selection) {
      throw new Error('Model router failed to rank candidates.');
    }

    const selectionPayload: ModelSelection = {
      model: selection.name,
      provider: selection.provider,
      capabilityTags: selection.capabilityTags,
      priceClass: selection.price_class,
      latencyMs: selection.latency_ms_est,
      source: this.catalogSource,
      reason: `state:${state};tags:${requiredTags.join(',') || 'none'}`,
    };

    this.emitDecision({
      taskId: options.taskId,
      state,
      requestedTags: requiredTags,
      selected: selectionPayload,
      fallbackApplied,
    });

    return selectionPayload;
  }

  recordProviderFailure(state: RouterState, provider: string, statusCode: number): void {
    if (statusCode === 429 || statusCode >= 500) {
      const until = Date.now() + this.options.cooldownMs;
      this.providerCooldownUntil.set(provider, until);
      logWarning('ModelRouter circuit breaker engaged', { state, provider, statusCode, until });
    }
  }

  noteVerifyFailure(taskId: string): void {
    const count = (this.verifyFailures.get(taskId) ?? 0) + 1;
    this.verifyFailures.set(taskId, count);
    if (count >= this.policy.verifyFailureEscalation) {
      this.forcedReasoningHigh.add(taskId);
      this.fastCodeEscalation.add(taskId);
      logInfo('ModelRouter forcing reasoning_high for task', { taskId, count });
    }
  }

  clearTask(taskId: string): void {
    this.verifyFailures.delete(taskId);
    this.forcedReasoningHigh.delete(taskId);
    this.fastCodeEscalation.delete(taskId);
  }

  private ensureCatalogLoaded(): void {
    if (this.catalogLoaded) {
      return;
    }
    if (this.tryLoadDiscoveryCatalog()) {
      this.catalogLoaded = true;
      this.catalogSource = 'discovery';
      return;
    }
    this.loadPolicyFallback();
    this.catalogSource = 'policy';
    this.catalogLoaded = true;
  }

  private resolveRequiredTags(
    state: RouterState,
    taskId: string,
    contextTokens?: number,
    forceLongContext?: boolean
  ): CapabilityTag[] {
    const tags = new Set<CapabilityTag>(this.stateCapabilities[state] ?? []);
    if (forceLongContext) {
      tags.add('long_context');
    }
    if (this.forcedReasoningHigh.has(taskId)) {
      tags.add('reasoning_high');
    }
    if (contextTokens && contextTokens >= this.policy.thresholds.longContextTokens) {
      tags.add('long_context');
    }
    return Array.from(tags);
  }

  private modelMatches(model: RouterModelCapability, tags: CapabilityTag[]): boolean {
    return tags.every(tag => model.capabilityTags.includes(tag));
  }

  private findCandidates(tags: CapabilityTag[]): { candidates: RouterModelCapability[]; fallbackApplied: boolean } {
  const base = this.catalog.filter(
      model => ROUTER_ALLOWED_MODELS.has(model.name) && !this.isProviderTripped(model.provider)
    );
    if (!tags.length) {
      return { candidates: base, fallbackApplied: false };
    }
    let matches = base.filter(model => this.modelMatches(model, tags));
    let fallbackApplied = false;
    if (!matches.length && tags.includes('cheap_batch')) {
      const relaxed = tags.filter(tag => tag !== 'cheap_batch');
      matches = base.filter(model => this.modelMatches(model, relaxed));
      fallbackApplied = true;
    }
    if (!matches.length && tags.includes('long_context')) {
      const relaxed = tags.filter(tag => tag !== 'long_context');
      matches = base.filter(model => this.modelMatches(model, relaxed));
      fallbackApplied = true;
    }
    if (!matches.length) {
      matches = base;
      fallbackApplied = true;
    }
    return { candidates: matches, fallbackApplied };
  }

  private rankCandidates(
    models: RouterModelCapability[],
    state: RouterState,
    tags: CapabilityTag[],
    taskId: string,
    hints?: RouterPickHints
  ): RouterModelCapability[] {
    const priority = this.resolvePriorityOrder(tags, state, taskId, hints);
    if (priority.length > 0) {
      const priorityMap = new Map(priority.map((name, index) => [name, index]));
      return [...models].sort((a, b) => {
        const aIdx = priorityMap.get(a.name) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = priorityMap.get(b.name) ?? Number.MAX_SAFE_INTEGER;
        if (aIdx !== bIdx) {
          return aIdx - bIdx;
        }
        return this.compareCandidates(a, b, state);
      });
    }
    return [...models].sort((a, b) => this.compareCandidates(a, b, state));
  }

  private resolvePriorityOrder(
    tags: CapabilityTag[],
    state: RouterState,
    taskId: string,
    hints?: RouterPickHints
  ): string[] {
    if (tags.includes('fast_code')) {
      return [...this.policy.capabilityPriorities.fast_code];
    }
    if (tags.includes('reasoning_high')) {
      if (this.forcedReasoningHigh.has(taskId)) {
          return prioritizeOpus(this.policy.capabilityPriorities.reasoning_high);
      }
      return [...this.policy.capabilityPriorities.reasoning_high];
    }
    if (tags.includes('long_context')) {
      return [...this.policy.capabilityPriorities.long_context];
    }
    if (tags.includes('cheap_batch') || state === 'monitor') {
      return [...this.policy.capabilityPriorities.cheap_batch];
    }
    return [];
  }

  private shouldEscalateFastCode(taskId: string, hints?: RouterPickHints): boolean {
    if (this.fastCodeEscalation.has(taskId)) {
      return true;
    }
    if (!hints) {
      return false;
    }
    if ((hints.touchedFiles ?? 0) >= this.policy.thresholds.fastCodeFiles) {
      return true;
    }
    if (hints.securitySensitive) {
      return true;
    }
    if ((hints.repeatedVerifyFailures ?? 0) >= this.policy.verifyFailureEscalation) {
      return true;
    }
    return false;
  }

  private compareCandidates(a: RouterModelCapability, b: RouterModelCapability, state: RouterState): number {
    const reasoningDelta = this.reasoningScore(b.reasoning_strength) - this.reasoningScore(a.reasoning_strength);
    if (reasoningDelta !== 0) return reasoningDelta;

    const codeDelta = this.codeScore(b.code_quality) - this.codeScore(a.code_quality);
    if (codeDelta !== 0) return codeDelta;

    const contextDelta = (b.context_window ?? 0) - (a.context_window ?? 0);
    if (contextDelta !== 0) return contextDelta;

    const latencyDelta = (a.latency_ms_est ?? Number.MAX_SAFE_INTEGER) - (b.latency_ms_est ?? Number.MAX_SAFE_INTEGER);
    if (latencyDelta !== 0) return latencyDelta;

    const priceDelta = this.priceScore(b.price_class) - this.priceScore(a.price_class);
    if (priceDelta !== 0) {
      // For cheap_batch or monitor states, prefer cheaper more aggressively
      if (state === 'monitor' || state === 'pr') {
        return priceDelta * 2;
      }
      return priceDelta;
    }

    return a.name.localeCompare(b.name);
  }

  private reasoningScore(value?: string): number {
    const normalized = this.normalizeEnumValue(ReasoningStrengthEnum, value, 'medium');
    return REASONING_RANK[normalized];
  }

  private codeScore(value?: string): number {
    const normalized = this.normalizeEnumValue(CodeQualityEnum, value, 'medium');
    return CODE_QUALITY_RANK[normalized];
  }

  private priceScore(value?: string): number {
    const normalized = this.normalizeEnumValue(PriceClassEnum, value, 'normal');
    return PRICE_CLASS_RANK[normalized];
  }

  private normalizeEnumValue<T extends z.ZodEnum<[string, ...string[]]>>(
    schema: T,
    value: unknown,
    fallback: z.infer<T>
  ): z.infer<T> {
    try {
      if (typeof value === 'string') {
        return schema.parse(value.trim().toLowerCase());
      }
      return schema.parse(value);
    } catch {
      return fallback;
    }
  }

  private emitDecision(entry: RouterDecisionLog): void {
    logInfo('router_decision', {
      taskId: entry.taskId,
      state: entry.state,
      requestedTags: entry.requestedTags,
      model: entry.selected.model,
      provider: entry.selected.provider,
      fallbackApplied: entry.fallbackApplied,
      source: entry.selected.source,
    });
    this.options.decisionLogger?.(entry);
  }

  private isProviderTripped(provider: string): boolean {
    const until = this.providerCooldownUntil.get(provider);
    if (!until) return false;
    const tripped = Date.now() < until;
    if (!tripped) {
      this.providerCooldownUntil.delete(provider);
    }
    return tripped;
  }

  private tryLoadDiscoveryCatalog(): boolean {
    const discoveryFile = this.resolveDiscoveryFile();
    if (!discoveryFile || !fs.existsSync(discoveryFile)) {
      return false;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(discoveryFile, 'utf8'));
      const parsed = ModelCatalogSchema.parse(raw);
      const allowed = parsed.models.filter(model => this.includeModel(model));
      if (!Array.isArray(parsed.models) || allowed.length === 0) {
        logWarning('Discovery catalog contained no allowed models', { discoveryFile });
        return false;
      }
      this.catalog = allowed.map(model => this.enrichModel(model));
      logInfo('ModelRouter loaded discovery catalog', {
        source: discoveryFile,
        count: this.catalog.length,
      });
      return true;
    } catch (error) {
      logWarning('Failed to load model discovery artifact', {
        error: error instanceof Error ? error.message : String(error),
        path: discoveryFile,
      });
    }
    return false;
  }

  private resolveDiscoveryFile(): string | undefined {
    if (this.options.discoveryPath && fs.existsSync(this.options.discoveryPath)) {
      return this.options.discoveryPath;
    }
    const candidateDirs: string[] = [];
    const root = path.join(this.options.workspaceRoot, 'resources', 'runs');
    if (!fs.existsSync(root)) {
      return undefined;
    }
    const entries = fs.readdirSync(root).filter(entry => entry.startsWith('run-'));
    if (this.options.runId) {
      const direct = path.join(root, this.normalizeRunId(this.options.runId));
      candidateDirs.push(direct);
    }
    candidateDirs.push(...entries.map(entry => path.join(root, entry)));
    for (const dir of candidateDirs) {
      const file = path.join(dir, 'models_discovered.json');
      if (fs.existsSync(file)) {
        return file;
      }
    }
    return undefined;
  }

  private normalizeRunId(runId: string): string {
    return runId.startsWith('run-') ? runId : `run-${runId}`;
  }

  private loadPolicyFallback(): void {
    try {
      const content = fs.readFileSync(this.options.policyPath, 'utf8');
      const models = this.parsePolicyCatalog(content).filter(model => this.includeModel(model));
      this.catalog = models.map(model => this.enrichModel(model));
      logInfo('ModelRouter loaded policy fallback catalog', {
        source: this.options.policyPath,
        count: this.catalog.length,
      });
    } catch (error) {
      logWarning('Failed to load model policy fallback', {
        error: error instanceof Error ? error.message : String(error),
        path: this.options.policyPath,
      });
      this.catalog = [];
    }
  }

  private parsePolicyCatalog(content: string): CatalogModelCapability[] {
    const entries = parsePolicyYaml(content);
    const models: CatalogModelCapability[] = [];
    for (const entry of entries) {
      try {
        models.push(this.normalizePolicyEntry(entry));
      } catch (error) {
        logWarning('Skipping invalid model policy entry', {
          error: error instanceof Error ? error.message : String(error),
          entry,
        });
      }
    }
    return models;
  }

  private normalizePolicyEntry(entry: Record<string, unknown>): CatalogModelCapability {
    const base: CatalogModelCapability = {
      name: String(entry.name ?? '').trim(),
      provider: this.normalizeEnumValue(ProviderEnum, entry.provider, 'other'),
      context_window: Number(entry.context_window ?? 0),
      reasoning_strength: this.normalizeEnumValue(ReasoningStrengthEnum, entry.reasoning_strength, 'medium'),
      code_quality: this.normalizeEnumValue(CodeQualityEnum, entry.code_quality, 'medium'),
      latency_ms_est: Number(entry.latency_ms_est ?? 0),
      price_class: this.normalizeEnumValue(PriceClassEnum, entry.price_class, 'normal'),
      tool_use_ok: Boolean(entry.tool_use_ok),
      vision_ok: Boolean(entry.vision_ok),
      max_output_tokens: Number(entry.max_output_tokens ?? entry.context_window ?? 0),
      notes: Array.isArray(entry.notes) ? (entry.notes as string[]) : [],
    };
    return ModelCapabilitySchema.parse(base);
  }

  private enrichModel(model: CatalogModelCapability): RouterModelCapability {
    const parsed = ModelCapabilitySchema.parse(ensureNotes(model));
    const capabilityTags = this.deriveCapabilityTags(parsed);
    return {
      ...parsed,
      capabilityTags,
    };
  }

  private deriveCapabilityTags(model: CatalogModelCapability): CapabilityTag[] {
    const override = MODEL_CAPABILITY_OVERRIDES[model.name];
    if (override) {
      return override;
    }
    const tags = new Set<CapabilityTag>();
    const reasoning = this.normalizeEnumValue(ReasoningStrengthEnum, model.reasoning_strength, 'medium');
    if (reasoning === 'ultra' || reasoning === 'high' || reasoning === 'medium_high') {
      tags.add('reasoning_high');
    }

    const codeQuality = this.normalizeEnumValue(CodeQualityEnum, model.code_quality, 'medium');
    if (codeQuality === 'high' || codeQuality === 'ultra') {
      tags.add('fast_code');
    }

    const contextWindow = Number(model.context_window ?? 0);
    const longContextThreshold = this.policy.thresholds.longContextTokens;
    if (contextWindow >= longContextThreshold) {
      tags.add('long_context');
    }

    const price = this.normalizeEnumValue(PriceClassEnum, model.price_class, 'normal');
    if (price === 'cheap') {
      tags.add('cheap_batch');
    }

    return Array.from(tags);
  }

  private includeModel(model: CatalogModelCapability): boolean {
    if (!ROUTER_ALLOWED_MODELS.has(model.name)) {
      logWarning('Dropping disallowed model from catalog', {
        model: model.name,
        provider: model.provider,
      });
      return false;
    }
    if (!ROUTER_ALLOWED_PROVIDERS.has(model.provider)) {
      logWarning('Dropping banned provider from catalog', {
        model: model.name,
        provider: model.provider,
      });
      return false;
    }
    return true;
  }
}

function parsePolicyYaml(content: string): Record<string, any>[] {
  const models: Record<string, any>[] = [];
  let current: Record<string, any> | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#') || line === 'models:') {
      continue;
    }
    if (/^\s*-\s+name:/.test(line)) {
      if (current) {
        models.push(current);
      }
      current = { name: line.split(':').slice(1).join(':').trim() };
      continue;
    }
    const match = line.match(/^\s+([a-z_]+):\s*(.+)$/i);
    if (match && current) {
      const [, key, value] = match;
      current[key] = parseScalar(value);
    }
  }

  if (current) {
    models.push(current);
  }

  return models;
}

function parseScalar(value: string): any {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  return trimmed;
}

function prioritizeOpus(list: string[]): string[] {
  const ordered = [...list];
  const idx = ordered.indexOf('claude-opus-4.1');
  if (idx > 0) {
    ordered.splice(idx, 1);
    ordered.unshift('claude-opus-4.1');
  }
  return ordered;
}

export interface ModelTier {
  name: string;
  model: string;
  costPer1K: number;
  minComplexity: number;
  maxComplexity: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

const CLAUDE_MODEL_TIERS: ModelTier[] = [
  { name: 'haiku', model: 'claude-haiku-4.5', costPer1K: 0.001, minComplexity: 0, maxComplexity: 3 },
  { name: 'sonnet-4.5', model: 'claude-sonnet-4.5', costPer1K: 0.015, minComplexity: 4, maxComplexity: 6 },
  { name: 'sonnet-4.5', model: 'claude-sonnet-4.5', costPer1K: 0.03, minComplexity: 7, maxComplexity: 9 },
  {
    name: 'sonnet-4.5-reasoning',
    model: 'claude-sonnet-4.5',
    costPer1K: 0.05,
    minComplexity: 10,
    maxComplexity: 10,
    reasoningEffort: 'high',
  },
];

const CODEX_MODEL_TIERS: ModelTier[] = [
  { name: 'codex-low', model: 'codex-5-low', costPer1K: 0.002, minComplexity: 0, maxComplexity: 3 },
  { name: 'codex-medium', model: 'codex-5-medium', costPer1K: 0.01, minComplexity: 4, maxComplexity: 7 },
  { name: 'codex-high', model: 'codex-5-high', costPer1K: 0.03, minComplexity: 8, maxComplexity: 10 },
];

export function assessTaskComplexity(task: Task): number {
  let score = 0;
  const dependencies = task.metadata?.dependencies as string[] | undefined;
  if (dependencies?.length) {
    score += dependencies.length * 2;
  }
  if (task.epic_id || task.type === 'epic') {
    score += 2;
  }
  if (task.description && task.description.length > 500) {
    score += 2;
  }

  const domain = task.metadata?.domain as string | undefined;
  const requiresML = task.metadata?.requires_ml as boolean | undefined;
  const affectsSecurity = task.metadata?.affects_security as boolean | undefined;
  const isArchitecture = task.metadata?.is_architecture as boolean | undefined;
  const publicAPI = task.metadata?.public_api as boolean | undefined;

  if (requiresML || domain === 'modeling' || task.id.includes('MLR')) {
    score += 3;
  }
  if (affectsSecurity || task.id.includes('SECURITY')) {
    score += 3;
  }
  if (isArchitecture || task.title?.toLowerCase().includes('architecture')) {
    score += 3;
  }
  if (publicAPI || task.title?.toLowerCase().includes('api')) {
    score += 2;
  }

  const exitCriteria = task.metadata?.exit_criteria as string[] | undefined;
  if (exitCriteria && exitCriteria.length > 5) {
    score += 1;
  }

  const complexKeywords = ['refactor', 'migrate', 'redesign', 'optimize', 'integrate'];
  const title = (task.title || '').toLowerCase();
  const description = (task.description || '').toLowerCase();
  if (complexKeywords.some(keyword => title.includes(keyword) || description.includes(keyword))) {
    score += 1;
  }

  return Math.min(10, score);
}

export function selectModelForTask(task: Task, provider: 'codex' | 'claude' = 'claude'): {
  model: string;
  tier: ModelTier;
  complexity: number;
} {
  return withSpan('model.select', (span) => {
    const complexity = assessTaskComplexity(task);
    const tiers = provider === 'codex' ? CODEX_MODEL_TIERS : CLAUDE_MODEL_TIERS;
    span?.setAttribute('model.provider', provider);
    span?.setAttribute('model.complexity', complexity);
    span?.setAttribute('task.id', task.id);
    const tier = tiers.find(t => complexity >= t.minComplexity && complexity <= t.maxComplexity) ?? tiers[tiers.length - 1];
    span?.setAttribute('model.name', tier.name);
    span?.setAttribute('model.model', tier.model);
    span?.setAttribute('model.costPer1K', tier.costPer1K);
    if (tier.reasoningEffort) {
      span?.setAttribute('model.reasoningEffort', tier.reasoningEffort);
    }
    logDebug('Model selected for task', {
      taskId: task.id,
      complexity,
      model: tier.model,
      tier: tier.name,
      costPer1K: tier.costPer1K,
    });
    return { model: tier.model, tier, complexity };
  }, {
    attributes: {
      'model.provider': provider,
    },
  });
}

export function estimateTaskCost(task: Task, provider: 'codex' | 'claude' = 'claude') {
  return withSpan('model.estimate_cost', (span) => {
    const selection = selectModelForTask(task, provider);
    const baseTokens = 1500 + (selection.complexity * 250);
    const estimatedCost = (baseTokens / 1000) * selection.tier.costPer1K;
    span?.setAttribute('model.estimated_tokens', baseTokens);
    span?.setAttribute('model.estimated_cost', estimatedCost);
    return {
      estimatedTokens: baseTokens,
      estimatedCost,
      tier: selection.tier,
    };
  });
}
