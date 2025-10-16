/**
 * Model Manager - High-level interface for model discovery and selection
 *
 * This manager:
 * - Initializes model registry and discovery on startup
 * - Provides convenience methods for model information
 * - Handles periodic refresh of model data
 */

import { logInfo, logWarning } from '../telemetry/logger.js';
import { ModelRegistry } from './model_registry.js';
import { ModelDiscoveryService } from './model_discovery.js';

export class ModelManager {
  private readonly registry: ModelRegistry;
  private readonly discovery: ModelDiscoveryService;
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(workspaceRoot: string) {
    this.registry = new ModelRegistry(workspaceRoot);
    this.discovery = new ModelDiscoveryService(this.registry);
  }

  /**
   * Initialize model discovery on startup
   */
  async initialize(): Promise<void> {
    logInfo('Initializing model manager');

    // Load existing registry
    await this.registry.load();

    // Check if discovery is needed
    const isStale = this.registry.isStale();
    const isEnabled = process.env.WVO_MODEL_DISCOVERY_ENABLED !== '0';

    if (isEnabled) {
      if (isStale) {
        logInfo('Model registry is stale, starting discovery');
        try {
          await this.discovery.discoverAll({ timeout: 15000 });
        } catch (error) {
          logWarning('Model discovery failed, using existing registry', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Schedule periodic refresh
      this.schedulePeriodicRefresh();
    } else {
      logInfo('Model discovery disabled via WVO_MODEL_DISCOVERY_ENABLED=0');
    }
  }

  /**
   * Schedule periodic model refresh
   */
  private schedulePeriodicRefresh(): void {
    this.refreshTimer = setInterval(async () => {
      logInfo('Starting periodic model discovery');
      try {
        await this.discovery.discoverAll({ timeout: 30000 });
      } catch (error) {
        logWarning('Periodic model discovery failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.REFRESH_INTERVAL_MS);
  }

  /**
   * Stop periodic refresh
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Get the model registry
   */
  getRegistry(): ModelRegistry {
    return this.registry;
  }

  /**
   * Force model discovery
   */
  async forceDiscovery(): Promise<void> {
    logInfo('Forcing model discovery');
    await this.discovery.discoverAll({ forceRefresh: true });
  }

  /**
   * Get model cost for estimation
   */
  getModelCost(provider: 'claude' | 'codex', modelId: string): { input: number; output: number } | undefined {
    return this.registry.getModelCost(provider, modelId);
  }

  /**
   * Check if a model is available
   */
  isModelAvailable(provider: 'claude' | 'codex', modelId: string): boolean {
    return this.registry.isModelAvailable(provider, modelId);
  }

  /**
   * Get best available model for a provider
   */
  getBestModel(provider: 'claude' | 'codex'): string | undefined {
    if (provider === 'claude') {
      const models = this.registry.getClaudeModelsByTier();
      return models[0]?.id;
    } else {
      const models = this.registry.getCodexModelsByCapability();
      return models[0]?.id;
    }
  }
}
