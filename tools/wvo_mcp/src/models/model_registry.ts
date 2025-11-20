/**
 * Model Registry - Central registry for discovered models from all providers
 *
 * This module provides:
 * - Unified model information across providers
 * - Automatic model discovery with caching
 * - Cost and capability metadata
 * - Subscription vs API access awareness
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export interface ModelCost {
  input: number; // Cost per million tokens (input)
  output: number; // Cost per million tokens (output)
}

export type ModelProvider = 'claude' | 'codex' | 'gemini' | 'o3';

export interface ModelCapabilities {
  speed?: boolean;
  balanced?: boolean;
  reasoning?: boolean;
  context?: number; // context window size
}

export interface ClaudeModel {
  id: string;
  name: string;
  context_window: number;
  max_output: number;
  cost_per_mtok: ModelCost;
  capabilities: string[];
  capability_tags?: ModelCapabilities;
  available: boolean;
  subscription_tier?: 'free' | 'pro' | 'team';
  last_checked?: string;
}

export interface CodexModel {
  id: string;
  name: string;
  reasoning_levels: string[];
  cost_per_mtok: ModelCost;
  available: boolean;
  capability_tags?: ModelCapabilities;
  context_window?: number;
  last_checked?: string;
}

export interface ProviderModels {
  access_method: 'subscription' | 'api';
  last_checked?: string;
  models: Array<ClaudeModel | CodexModel>;
}

export interface ModelRegistryData {
  last_updated: string;
  ttl_hours: number;
  providers: {
    claude?: ProviderModels;
    codex?: ProviderModels;
    gemini?: ProviderModels;
    o3?: ProviderModels;
  };
}

const DEFAULT_TTL_HOURS = 24;
const REGISTRY_FILENAME = 'models_registry.json';

// Embedded defaults as fallback if discovery fails
const EMBEDDED_DEFAULTS: ModelRegistryData = {
  last_updated: '2025-01-01T00:00:00Z',
  ttl_hours: DEFAULT_TTL_HOURS,
  providers: {
    claude: {
      access_method: 'subscription',
      models: [
        {
          id: 'claude-sonnet-latest',
          name: 'Claude Sonnet (latest)',
          context_window: 200000,
          max_output: 16384,
          cost_per_mtok: { input: 3.0, output: 15.0 },
          capabilities: ['coding', 'reasoning', 'multimodal'],
          capability_tags: { balanced: true, reasoning: true, context: 200000 },
          available: true,
          subscription_tier: 'pro',
        },
        {
          id: 'claude-haiku-latest',
          name: 'Claude Haiku (latest)',
          context_window: 200000,
          max_output: 8192,
          cost_per_mtok: { input: 1.0, output: 5.0 },
          capabilities: ['coding', 'fast'],
          capability_tags: { speed: true, balanced: true, context: 200000 },
          available: true,
          subscription_tier: 'team',
        },
      ],
    },
    codex: {
      access_method: 'subscription',
      models: [
        {
          id: 'gpt-5-codex',
          name: 'GPT-5 Codex',
          reasoning_levels: ['minimal', 'low', 'medium', 'high'],
          cost_per_mtok: { input: 12.0, output: 24.0 },
          available: true,
          context_window: 128000,
          capability_tags: { reasoning: true, balanced: true, context: 128000 },
        },
      ],
    },
    gemini: {
      access_method: 'api',
      models: [
        {
          id: 'gemini-flash-latest',
          name: 'Gemini Flash (latest)',
          context_window: 1000000,
          max_output: 8192,
          cost_per_mtok: { input: 0.3, output: 0.8 },
          capabilities: ['fast', 'general'],
          capability_tags: { speed: true, balanced: true, context: 1000000 },
          available: true,
        },
        {
          id: 'gemini-pro-latest',
          name: 'Gemini Pro (latest)',
          context_window: 2000000,
          max_output: 8192,
          cost_per_mtok: { input: 0.6, output: 1.4 },
          capabilities: ['balanced', 'coding'],
          capability_tags: { balanced: true, reasoning: true, context: 2000000 },
          available: true,
        },
        {
          id: 'gemini-3-latest',
          name: 'Gemini 3 (latest)',
          context_window: 2000000,
          max_output: 8192,
          cost_per_mtok: { input: 1.0, output: 2.0 },
          capabilities: ['deep', 'reasoning'],
          capability_tags: { reasoning: true, context: 2000000 },
          available: true,
        },
      ],
    },
    o3: {
      access_method: 'api',
      models: [
        {
          id: 'o3-high-latest',
          name: 'o3 High (latest)',
          context_window: 128000,
          max_output: 4096,
          cost_per_mtok: { input: 5.0, output: 15.0 },
          capabilities: ['deep', 'reasoning'],
          capability_tags: { reasoning: true, context: 128000 },
          available: true,
        },
      ],
    },
  },
};

/**
 * Create a deep copy of the embedded defaults so mutations do not affect the template.
 * The copy is stamped with the current timestamp so the registry is treated as fresh.
 */
const snapshotEmbeddedDefaults = (): ModelRegistryData => {
  const snapshot = JSON.parse(JSON.stringify(EMBEDDED_DEFAULTS)) as ModelRegistryData;
  snapshot.last_updated = new Date().toISOString();
  return snapshot;
};

export class ModelRegistry {
  private data: ModelRegistryData;
  private readonly registryPath: string;

  constructor(private readonly workspaceRoot: string) {
    this.registryPath = path.join(workspaceRoot, 'state', REGISTRY_FILENAME);
    this.data = snapshotEmbeddedDefaults();
  }

  /**
   * Load registry from disk or use embedded defaults
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      this.data = JSON.parse(content) as ModelRegistryData;
      logInfo('Loaded model registry from disk', {
        path: this.registryPath,
        lastUpdated: this.data.last_updated,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        logInfo('Model registry not found, using embedded defaults', {
          path: this.registryPath,
        });
        this.data = snapshotEmbeddedDefaults();
      } else {
        logWarning('Failed to load model registry, using embedded defaults', {
          path: this.registryPath,
          error: error instanceof Error ? error.message : String(error),
        });
        this.data = snapshotEmbeddedDefaults();
      }
    }
  }

  /**
   * Save registry to disk
   */
  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.registryPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.registryPath, JSON.stringify(this.data, null, 2), 'utf-8');
      logInfo('Saved model registry to disk', {
        path: this.registryPath,
      });
    } catch (error) {
      logError('Failed to save model registry', {
        path: this.registryPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if registry is stale and needs refresh
   */
  isStale(): boolean {
    const lastUpdated = new Date(this.data.last_updated);
    const now = new Date();
    const ageHours = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
    return ageHours > this.data.ttl_hours;
  }

  /**
   * Update provider models
   */
  updateProvider(provider: ModelProvider, models: ProviderModels): void {
    this.data.providers[provider] = {
      ...models,
      last_checked: new Date().toISOString(),
    };
    this.data.last_updated = new Date().toISOString();
  }

  /**
   * Get all models for a provider
   */
  getProviderModels(provider: ModelProvider): ProviderModels | undefined {
    return this.data.providers[provider];
  }

  /**
   * Get specific model by ID
   */
  getModel(provider: ModelProvider, modelId: string): ClaudeModel | CodexModel | undefined {
    const providerData = this.data.providers[provider];
    if (!providerData) return undefined;
    return providerData.models.find((m) => m.id === modelId);
  }

  /**
   * Get model cost
   */
  getModelCost(provider: ModelProvider, modelId: string): ModelCost | undefined {
    const model = this.getModel(provider, modelId);
    return model?.cost_per_mtok;
  }

  /**
   * Check if a model is available
   */
  isModelAvailable(provider: ModelProvider, modelId: string): boolean {
    const model = this.getModel(provider, modelId);
    return model?.available ?? false;
  }

  /**
   * Get all available models for a provider
   */
  getAvailableModels(provider: ModelProvider): Array<ClaudeModel | CodexModel> {
    const providerData = this.data.providers[provider];
    if (!providerData) return [];
    return providerData.models.filter((m) => m.available);
  }

  /**
   * Get provider access method (subscription vs API)
   */
  getAccessMethod(provider: ModelProvider): 'subscription' | 'api' | undefined {
    return this.data.providers[provider]?.access_method;
  }

  /**
   * Get registry data for inspection
   */
  getData(): Readonly<ModelRegistryData> {
    return this.data;
  }

  /**
   * Get Claude models sorted by capability/tier
   */
  getClaudeModelsByTier(): ClaudeModel[] {
    const providerData = this.data.providers.claude;
    if (!providerData) return [];

    const tierOrder: Record<string, number> = { team: 0, pro: 1, free: 2 };
    return (providerData.models as ClaudeModel[])
      .filter((m) => m.available)
      .sort((a, b) => {
        const tierA = tierOrder[a.subscription_tier ?? 'free'] ?? 3;
        const tierB = tierOrder[b.subscription_tier ?? 'free'] ?? 3;
        if (tierA !== tierB) return tierA - tierB;
        // Within same tier, sort by cost (higher cost = more capable)
        return b.cost_per_mtok.output - a.cost_per_mtok.output;
      });
  }

  /**
   * Get Codex models sorted by capability
   */
  getCodexModelsByCapability(): CodexModel[] {
    const providerData = this.data.providers.codex;
    if (!providerData) return [];

    return (providerData.models as CodexModel[])
      .filter((m) => m.available)
      .sort((a, b) => {
        // Sort by number of reasoning levels (more = more capable)
        const levelsA = a.reasoning_levels?.length ?? 0;
        const levelsB = b.reasoning_levels?.length ?? 0;
        if (levelsA !== levelsB) return levelsB - levelsA;
        // Then by cost (higher cost = more capable)
        return b.cost_per_mtok.output - a.cost_per_mtok.output;
      });
  }

  /**
   * Merge externally discovered models (e.g., from Scout or agent search)
   */
  mergeExternalProvider(provider: ModelProvider, models: ProviderModels): void {
    const existing = this.data.providers[provider];
    if (!existing) {
      this.updateProvider(provider, models);
      return;
    }
    const merged = {
      ...existing,
      access_method: models.access_method ?? existing.access_method,
      last_checked: models.last_checked ?? existing.last_checked,
      models: this.mergeModels(existing.models, models.models),
    };
    this.updateProvider(provider, merged);
  }

  private mergeModels(existing: Array<ClaudeModel | CodexModel>, incoming: Array<ClaudeModel | CodexModel>) {
    const map = new Map<string, ClaudeModel | CodexModel>();
    existing.forEach((m) => map.set(m.id, m));
    incoming.forEach((m) => map.set(m.id, m));
    return Array.from(map.values());
  }

  /**
   * Get best model ID for a lane across providers.
   */
  getBestForLane(lane: 'fast' | 'standard' | 'deep'): string | undefined {
    const scored: Array<{ id: string; score: number }> = [];
    Object.values(this.data.providers).forEach((pm) => {
      if (!pm) return;
      pm.models.forEach((model) => {
        if (!(model as any).available) return;
        const caps = (model as any).capability_tags as ModelCapabilities | undefined;
        const score = this.scoreModelForLane(caps, lane, (model as any).cost_per_mtok, (model as any).context_window);
        if (score > 0) scored.push({ id: (model as any).id, score });
      });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.id;
  }

  private scoreModelForLane(
    cap: ModelCapabilities | undefined,
    lane: 'fast' | 'standard' | 'deep',
    cost?: ModelCost,
    context?: number
  ): number {
    const ctx = cap?.context ?? context ?? 0;
    const costScore = cost ? 1 / (1 + cost.output + cost.input) : 0.1;
    if (lane === 'fast') {
      return (cap?.speed ? 5 : 0) + (cap?.balanced ? 1 : 0) + costScore;
    }
    if (lane === 'standard') {
      return (cap?.balanced ? 4 : 0) + (cap?.reasoning ? 2 : 0) + ctx / 1_000_000 + costScore;
    }
    // deep
    return (cap?.reasoning ? 5 : 0) + Math.log10(ctx + 10) + costScore;
  }
}
