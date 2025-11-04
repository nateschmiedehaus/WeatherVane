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

import { assertRouterEntry, assertRouterProvider } from '../orchestrator/router_lock.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export interface ModelCost {
  input: number; // Cost per million tokens (input)
  output: number; // Cost per million tokens (output)
}

export interface ClaudeModel {
  id: string;
  name: string;
  context_window: number;
  max_output: number;
  cost_per_mtok: ModelCost;
  capabilities: string[];
  available: boolean;
  subscription_tier?: 'free' | 'pro' | 'team';
}

export interface CodexModel {
  id: string;
  name: string;
  reasoning_levels: string[];
  cost_per_mtok: ModelCost;
  available: boolean;
  context_window?: number;
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
          id: 'claude-opus-4.1',
          name: 'Claude Opus 4.1',
          context_window: 200000,
          max_output: 16384,
          cost_per_mtok: { input: 15.0, output: 75.0 },
          capabilities: ['coding', 'reasoning', 'multimodal'],
          available: true,
          subscription_tier: 'pro',
        },
        {
          id: 'claude-sonnet-4.5',
          name: 'Claude Sonnet 4.5',
          context_window: 200000,
          max_output: 16384,
          cost_per_mtok: { input: 3.0, output: 15.0 },
          capabilities: ['coding', 'reasoning', 'multimodal'],
          available: true,
          subscription_tier: 'pro',
        },
        {
          id: 'claude-haiku-4.5',
          name: 'Claude Haiku 4.5',
          context_window: 200000,
          max_output: 8192,
          cost_per_mtok: { input: 0.5, output: 1.5 },
          capabilities: ['coding', 'reasoning'],
          available: true,
          subscription_tier: 'free',
        },
      ],
    },
    codex: {
      access_method: 'subscription',
      models: [
        {
          id: 'codex-5-high',
          name: 'Codex 5 High',
          reasoning_levels: ['high'],
          cost_per_mtok: { input: 18.0, output: 36.0 },
          available: true,
          context_window: 128000,
        },
        {
          id: 'codex-5-medium',
          name: 'Codex 5 Medium',
          reasoning_levels: ['medium'],
          cost_per_mtok: { input: 12.0, output: 24.0 },
          available: true,
          context_window: 128000,
        },
        {
          id: 'codex-5-low',
          name: 'Codex 5 Low',
          reasoning_levels: ['low'],
          cost_per_mtok: { input: 6.0, output: 12.0 },
          available: true,
          context_window: 128000,
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
  updateProvider(
    provider: 'claude' | 'codex',
    models: ProviderModels
  ): void {
    assertRouterProvider(provider, 'model_registry.updateProvider');
    const sanitized = this.sanitizeModels(provider, models);
    if (!sanitized.models.length) {
      logWarning('Router lock prevented registry update', { provider });
      return;
    }
    this.data.providers[provider] = {
      ...sanitized,
      last_checked: new Date().toISOString(),
    };
    this.data.last_updated = new Date().toISOString();
  }

  /**
   * Get all models for a provider
   */
  getProviderModels(provider: 'claude' | 'codex'): ProviderModels | undefined {
    return this.data.providers[provider];
  }

  /**
   * Get specific model by ID
   */
  getModel(provider: 'claude' | 'codex', modelId: string): ClaudeModel | CodexModel | undefined {
    const providerData = this.data.providers[provider];
    if (!providerData) return undefined;
    return providerData.models.find((m) => m.id === modelId);
  }

  /**
   * Get model cost
   */
  getModelCost(provider: 'claude' | 'codex', modelId: string): ModelCost | undefined {
    const model = this.getModel(provider, modelId);
    return model?.cost_per_mtok;
  }

  /**
   * Check if a model is available
   */
  isModelAvailable(provider: 'claude' | 'codex', modelId: string): boolean {
    const model = this.getModel(provider, modelId);
    return model?.available ?? false;
  }

  /**
   * Get all available models for a provider
   */
  getAvailableModels(provider: 'claude' | 'codex'): Array<ClaudeModel | CodexModel> {
    const providerData = this.data.providers[provider];
    if (!providerData) return [];
    return providerData.models.filter((m) => m.available);
  }

  /**
   * Get provider access method (subscription vs API)
   */
  getAccessMethod(provider: 'claude' | 'codex'): 'subscription' | 'api' | undefined {
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

  private sanitizeModels(provider: 'claude' | 'codex', models: ProviderModels): ProviderModels {
    const entries = (models.models as Array<ClaudeModel | CodexModel>).filter(model => {
      const id = (model as ClaudeModel | CodexModel).id;
      try {
        assertRouterEntry(provider, id, 'model_registry');
        return true;
      } catch (error) {
        logWarning('Dropping disallowed model from registry update', {
          provider,
          model: id,
          reason: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    });
    return {
      ...models,
      models: entries,
    };
  }
}
