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

const execAsync = promisify(exec);

export interface ModelDiscoveryOptions {
  forceRefresh?: boolean;
  timeout?: number; // Timeout in milliseconds
}

export class ModelDiscoveryService {
  constructor(private readonly registry: ModelRegistry) {}

  /**
   * Discover models for all providers (Scout entrypoint)
   * Note: Providers like Gemini/o3 may require manual/API integration; we seed from registry defaults when no API.
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
      if (claudeModels) {
        this.registry.updateProvider('claude', claudeModels);
        logInfo('Claude models discovered', {
          count: claudeModels.models.length,
          accessMethod: claudeModels.access_method,
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
      if (codexModels) {
        this.registry.updateProvider('codex', codexModels);
        logInfo('Codex models discovered', {
          count: codexModels.models.length,
          accessMethod: codexModels.access_method,
        });
      }
    } catch (error) {
      logError('Failed to discover Codex models', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Discover Gemini models (stubbed to registry defaults until API integrated)
    try {
      const geminiModels = await this.discoverGeminiModels();
      if (geminiModels) {
        this.registry.updateProvider('gemini', geminiModels);
        logInfo('Gemini models loaded (seeded)', {
          count: geminiModels.models.length,
          accessMethod: geminiModels.access_method,
        });
      }
    } catch (error) {
      logWarning('Failed to load Gemini models (seed)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Discover o3 models (stubbed to registry defaults)
    try {
      const o3Models = await this.discoverO3Models();
      if (o3Models) {
        this.registry.updateProvider('o3', o3Models);
        logInfo('o3 models loaded (seeded)', {
          count: o3Models.models.length,
          accessMethod: o3Models.access_method,
        });
      }
    } catch (error) {
      logWarning('Failed to load o3 models (seed)', {
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
   * Discover Gemini models (stub: seed from registry defaults)
   */
  private async discoverGeminiModels(): Promise<ProviderModels | null> {
    const provider = this.registry.getProviderModels('gemini');
    if (provider) {
      return {
        access_method: provider.access_method ?? 'api',
        models: provider.models,
      };
    }
    return null;
  }

  /**
   * Discover o3 models (stub: seed from registry defaults)
   */
  private async discoverO3Models(): Promise<ProviderModels | null> {
    const provider = this.registry.getProviderModels('o3');
    if (provider) {
      return {
        access_method: provider.access_method ?? 'api',
        models: provider.models,
      };
    }
    return null;
  }

  /**
   * Parse Claude models from CLI output
   */
  private parseClaudeModelsFromCLI(output: string): ProviderModels {
    const models: ClaudeModel[] = [];

    // Look for model lines like "claude-opus-4" or "claude-sonnet-4.5"
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/claude-(opus|sonnet|haiku)-?([\d.]+)?/i);
      if (match) {
        const variant = match[1].toLowerCase();
        const version = match[2] || '4';
        const modelId = `claude-${variant}-${version}`;

        // Determine cost based on variant
        let cost = { input: 3.0, output: 15.0 }; // Default: Sonnet
        if (variant === 'opus') {
          cost = { input: 15.0, output: 75.0 };
        } else if (variant === 'haiku') {
          cost = { input: 0.8, output: 4.0 };
        }

        models.push({
          id: modelId,
          name: `Claude ${variant.charAt(0).toUpperCase() + variant.slice(1)} ${version}`,
          context_window: 200000,
          max_output: variant === 'opus' || variant === 'sonnet' ? 16384 : 8192,
          cost_per_mtok: cost,
          capabilities: ['coding', 'reasoning', 'multimodal'],
          available: true,
          subscription_tier: variant === 'haiku' ? 'free' : 'pro',
        });
      }
    }

    // If no models found via parsing, use defaults
    if (models.length === 0) {
      return {
        access_method: 'subscription',
        models: this.getDefaultClaudeModels(),
      };
    }

    return {
      access_method: 'subscription',
      models,
    };
  }

  /**
   * Get default Claude models (fallback)
   */
  private getDefaultClaudeModels(): ClaudeModel[] {
    return [
      {
        id: 'claude-opus-4',
        name: 'Claude Opus 4',
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
        id: 'claude-sonnet-4',
        name: 'Claude Sonnet 4',
        context_window: 200000,
        max_output: 8192,
        cost_per_mtok: { input: 3.0, output: 15.0 },
        capabilities: ['coding', 'reasoning', 'multimodal'],
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
        id: 'gpt-5-codex',
        name: 'GPT-5 Codex',
        reasoning_levels: ['minimal', 'low', 'medium', 'high'],
        cost_per_mtok: { input: 12.0, output: 24.0 },
        available: true,
        context_window: 128000,
      },
      {
        id: 'gpt-5',
        name: 'GPT-5',
        reasoning_levels: ['minimal', 'low', 'medium', 'high'],
        cost_per_mtok: { input: 12.0, output: 30.0 },
        available: true,
        context_window: 128000,
      },
    ];
  }
}
