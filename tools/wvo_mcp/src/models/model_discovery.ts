/**
 * Model Discovery Service - Automatically discovers available models from providers
 *
 * This service:
 * - Queries provider APIs for model lists
 * - Falls back to web scraping if APIs unavailable
 * - Updates the ModelRegistry with discovered models
 * - Respects TTL and only refreshes when stale
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { ModelRegistry, type ProviderModels, type ClaudeModel, type CodexModel } from './model_registry.js';
import { assertRouterEntry, assertRouterProvider } from '../orchestrator/router_lock.js';

const execAsync = promisify(exec);

export interface ModelDiscoveryOptions {
  forceRefresh?: boolean;
  timeout?: number; // Timeout in milliseconds
}

export class ModelDiscoveryService {
  constructor(private readonly registry: ModelRegistry) {}

  /**
   * Discover models for all providers
   */
  async discoverAll(options: ModelDiscoveryOptions = {}): Promise<void> {
    // Load existing registry
    await this.registry.load();

    // Check if refresh is needed
    if (!options.forceRefresh && !this.registry.isStale()) {
      logInfo('Model registry is fresh, skipping discovery', {
        lastUpdated: this.registry.getData().last_updated,
        ttl: this.registry.getData().ttl_hours,
      });
      return;
    }

    logInfo('Starting model discovery for all providers');

    // Discover Claude models
    try {
      const claudeModels = await this.discoverClaudeModels(options);
      const sanitizedClaude = sanitizeProviderModels('claude', claudeModels);
      if (sanitizedClaude) {
        this.registry.updateProvider('claude', sanitizedClaude);
        logInfo('Claude models discovered', {
          count: sanitizedClaude.models.length,
          accessMethod: sanitizedClaude.access_method,
        });
      }
    } catch (error) {
      logError('Failed to discover Claude models', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Discover Codex models
    try {
      const codexModels = await this.discoverCodexModels(options);
      const sanitizedCodex = sanitizeProviderModels('codex', codexModels);
      if (sanitizedCodex) {
        this.registry.updateProvider('codex', sanitizedCodex);
        logInfo('Codex models discovered', {
          count: sanitizedCodex.models.length,
          accessMethod: sanitizedCodex.access_method,
        });
      }
    } catch (error) {
      logError('Failed to discover Codex models', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Save updated registry
    await this.registry.save();
  }

  /**
   * Discover Claude models via CLI
   */
  private async discoverClaudeModels(options: ModelDiscoveryOptions): Promise<ProviderModels | null> {
    const claudeBin = process.env.CLAUDE_BIN ?? 'claude';

    try {
      // Try to list models using Claude CLI
      const { stdout, stderr } = await execAsync(`${claudeBin} models list 2>&1 || true`, {
        timeout: options.timeout ?? 30000,
      });

      if (stdout.includes('claude-opus') || stdout.includes('claude-sonnet')) {
        logInfo('Discovered Claude models via CLI', { output: stdout.slice(0, 200) });
        return this.parseClaudeModelsFromCLI(stdout);
      }

      // Fall back to checking authentication status
      const { stdout: whoamiOutput } = await execAsync(`${claudeBin} whoami 2>&1 || true`);

      if (whoamiOutput && !whoamiOutput.toLowerCase().includes('login')) {
        logInfo('Claude authenticated, using default model set');
        // Return default models with subscription access
        return {
          access_method: 'subscription',
          models: this.getDefaultClaudeModels(),
        };
      }

      logWarning('Could not discover Claude models, using embedded defaults');
      return null;
    } catch (error) {
      logWarning('Claude CLI unavailable, using embedded defaults', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Discover Codex models via CLI
   */
  private async discoverCodexModels(options: ModelDiscoveryOptions): Promise<ProviderModels | null> {
    try {
      const codexHome = process.env.CODEX_HOME || '';
      const codexCmd = codexHome ? `CODEX_HOME=${codexHome} codex` : 'codex';

      // Try to get model information from Codex
      const { stdout, stderr } = await execAsync(`${codexCmd} status 2>&1 || true`, {
        timeout: options.timeout ?? 30000,
      });

      if (stdout.includes('Logged in') || stdout.includes('authenticated')) {
        logInfo('Codex authenticated, using default model set');
        return {
          access_method: 'subscription',
          models: this.getDefaultCodexModels(),
        };
      }

      logWarning('Could not discover Codex models, using embedded defaults');
      return null;
    } catch (error) {
      logWarning('Codex CLI unavailable, using embedded defaults', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Parse Claude models from CLI output
   */
  private parseClaudeModelsFromCLI(output: string): ProviderModels {
    const models: ClaudeModel[] = [];

    // Look for model lines like "claude-opus-4.1" or "claude-sonnet-4.5"
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/claude-(opus|sonnet|haiku)-?([\d.]+)?/i);
      if (match) {
        const variant = match[1].toLowerCase();
        const canonicalId =
          variant === 'opus'
            ? 'claude-opus-4.1'
            : variant === 'haiku'
              ? 'claude-haiku-4.5'
              : 'claude-sonnet-4.5';

        const cost =
          variant === 'opus'
            ? { input: 15.0, output: 75.0 }
            : variant === 'haiku'
              ? { input: 0.8, output: 4.0 }
              : { input: 3.0, output: 15.0 };

        models.push({
          id: canonicalId,
          name: `Claude ${variant.charAt(0).toUpperCase() + variant.slice(1)} 4.5`,
          context_window: 200000,
          max_output: variant === 'haiku' ? 8192 : 16384,
          cost_per_mtok: cost,
          capabilities: ['coding', 'reasoning', 'multimodal'],
          available: true,
          subscription_tier: variant === 'haiku' ? 'free' : 'pro',
        });
      }
    }

    // If no models found via parsing, use defaults
    const deduped = Array.from(new Map(models.map(model => [model.id, model])).values());
    if (deduped.length === 0) {
      return {
        access_method: 'subscription',
        models: this.getDefaultClaudeModels(),
      };
    }

    return {
      access_method: 'subscription',
      models: deduped,
    };
  }

  /**
   * Get default Claude models (fallback)
   */
  private getDefaultClaudeModels(): ClaudeModel[] {
    return [
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
        cost_per_mtok: { input: 0.8, output: 4.0 },
        capabilities: ['coding', 'reasoning'],
        available: true,
        subscription_tier: 'free',
      },
    ];
  }

  /**
   * Get default Codex models (fallback)
   */
  private getDefaultCodexModels(): CodexModel[] {
    return [
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
    ];
  }
}

type RegistryProvider = 'claude' | 'codex';

function sanitizeProviderModels(
  provider: RegistryProvider,
  models?: ProviderModels | null
): ProviderModels | null {
  if (!models) {
    return null;
  }
  assertRouterProvider(provider, 'model_discovery');
  const filtered = models.models.filter(model =>
    isEntryAllowed(provider, model)
  );
  if (!filtered.length) {
    logWarning('Router lock removed all discovered models', { provider });
    return null;
  }
  if (filtered.length !== models.models.length) {
    logWarning('Router lock dropped disallowed models', {
      provider,
      dropped: models.models.length - filtered.length,
    });
  }
  return {
    ...models,
    models: filtered,
  };
}

function isEntryAllowed(provider: RegistryProvider, model: ClaudeModel | CodexModel): boolean {
  const identifier = getModelIdentifier(model);
  if (!identifier) {
    logWarning('Router lock skipping model without identifier', { provider });
    return false;
  }
  try {
    assertRouterEntry(provider, identifier, 'model_discovery');
    return true;
  } catch (error) {
    logWarning('Router lock rejected discovered model', {
      provider,
      model: identifier,
      reason: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function getModelIdentifier(model: ClaudeModel | CodexModel): string | undefined {
  if ('id' in model && typeof model.id === 'string') {
    return model.id;
  }
  if ('name' in model && typeof model.name === 'string') {
    return model.name;
  }
  return undefined;
}
