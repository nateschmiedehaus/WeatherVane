/**
 * Provider Router for Wave 0.1
 *
 * Routes tasks to appropriate AI providers (Claude vs Codex)
 * based on task type, complexity, and current usage.
 *
 * This enables Wave 0 to:
 * - Use Claude for complex reasoning
 * - Use Codex for code generation
 * - Handle rate limits gracefully
 * - Track token usage per provider
 */

import { logInfo, logWarning } from '../telemetry/logger.js';

export type Provider = 'claude' | 'codex';
export type TaskType = 'reasoning' | 'coding' | 'review' | 'general';

interface ProviderStats {
  tokensUsed: number;
  requestCount: number;
  lastRequestTime: number;
  errors: number;
  avgResponseTime: number;
}

interface RateLimitInfo {
  provider: Provider;
  limit: number;
  used: number;
  resetTime: number;
}

export class ProviderRouter {
  // Usage tracking
  private stats: Map<Provider, ProviderStats> = new Map([
    ['claude', {
      tokensUsed: 0,
      requestCount: 0,
      lastRequestTime: 0,
      errors: 0,
      avgResponseTime: 0
    }],
    ['codex', {
      tokensUsed: 0,
      requestCount: 0,
      lastRequestTime: 0,
      errors: 0,
      avgResponseTime: 0
    }]
  ]);

  // Rate limits (per hour)
  private rateLimits: Map<Provider, RateLimitInfo> = new Map([
    ['claude', {
      provider: 'claude',
      limit: 100000,  // 100k tokens per hour
      used: 0,
      resetTime: Date.now() + 3600000
    }],
    ['codex', {
      provider: 'codex',
      limit: 150000,  // 150k tokens per hour
      used: 0,
      resetTime: Date.now() + 3600000
    }]
  ]);

  // Provider preferences by task type
  private preferences: Map<TaskType, Provider[]> = new Map([
    ['reasoning', ['claude', 'codex']],     // Claude preferred for reasoning
    ['coding', ['codex', 'claude']],        // Codex preferred for coding
    ['review', ['claude', 'codex']],        // Claude preferred for review
    ['general', ['codex', 'claude']]        // Balance usage
  ]);

  /**
   * Select provider based on task type
   */
  selectProvider(taskType: TaskType): Provider {
    // Get preferred providers for this task type
    const preferred = this.preferences.get(taskType) || ['claude', 'codex'];

    // Try providers in preference order
    for (const provider of preferred) {
      if (this.isAvailable(provider)) {
        logInfo(`ProviderRouter: Selected ${provider} for ${taskType} task`);
        return provider;
      }
    }

    // If no provider available, wait for reset and use first preference
    logWarning('ProviderRouter: All providers at rate limit, using fallback');
    return this.waitAndSelectProvider(preferred[0]);
  }

  /**
   * Check if provider is available (not rate limited)
   */
  private isAvailable(provider: Provider): boolean {
    const limit = this.rateLimits.get(provider);
    if (!limit) return false;

    // Reset if hour has passed
    if (Date.now() > limit.resetTime) {
      limit.used = 0;
      limit.resetTime = Date.now() + 3600000;
    }

    // Check if under limit (leave 10% buffer)
    return limit.used < limit.limit * 0.9;
  }

  /**
   * Wait for rate limit reset if needed
   */
  private waitAndSelectProvider(provider: Provider): Provider {
    const limit = this.rateLimits.get(provider);
    if (!limit) return provider;

    if (Date.now() > limit.resetTime) {
      // Reset has occurred
      limit.used = 0;
      limit.resetTime = Date.now() + 3600000;
    }

    if (limit.used >= limit.limit) {
      const waitTime = limit.resetTime - Date.now();
      logWarning(`ProviderRouter: Rate limit hit for ${provider}, wait ${waitTime}ms`);

      // In production, we would actually wait or queue
      // For now, just warn and proceed
    }

    return provider;
  }

  /**
   * Record usage for tracking
   */
  recordUsage(provider: Provider, tokens: number, responseTime: number): void {
    const stats = this.stats.get(provider);
    const limit = this.rateLimits.get(provider);

    if (stats) {
      stats.tokensUsed += tokens;
      stats.requestCount++;
      stats.lastRequestTime = Date.now();

      // Update average response time
      stats.avgResponseTime =
        (stats.avgResponseTime * (stats.requestCount - 1) + responseTime) / stats.requestCount;
    }

    if (limit) {
      limit.used += tokens;
    }

    logInfo(`ProviderRouter: Recorded ${tokens} tokens for ${provider}`, {
      totalUsed: stats?.tokensUsed,
      rateLimit: `${limit?.used}/${limit?.limit}`
    });
  }

  /**
   * Record error for provider
   */
  recordError(provider: Provider, error: string): void {
    const stats = this.stats.get(provider);
    if (stats) {
      stats.errors++;
      logWarning(`ProviderRouter: Error recorded for ${provider}`, {
        error,
        totalErrors: stats.errors
      });
    }
  }

  /**
   * Get current provider status
   */
  getStatus(): any {
    const status: any = {
      providers: {},
      recommendations: []
    };

    for (const [provider, stats] of this.stats) {
      const limit = this.rateLimits.get(provider);
      status.providers[provider] = {
        available: this.isAvailable(provider),
        stats: {
          requests: stats.requestCount,
          tokensUsed: stats.tokensUsed,
          errors: stats.errors,
          avgResponseTime: Math.round(stats.avgResponseTime)
        },
        rateLimit: {
          used: limit?.used || 0,
          limit: limit?.limit || 0,
          percentUsed: limit ? Math.round((limit.used / limit.limit) * 100) : 0,
          resetIn: limit ? Math.max(0, limit.resetTime - Date.now()) : 0
        }
      };
    }

    // Add recommendations
    const claudeUsage = this.rateLimits.get('claude')?.used || 0;
    const codexUsage = this.rateLimits.get('codex')?.used || 0;

    if (claudeUsage > codexUsage * 1.5) {
      status.recommendations.push('Consider routing more tasks to Codex to balance usage');
    } else if (codexUsage > claudeUsage * 1.5) {
      status.recommendations.push('Consider routing more tasks to Claude to balance usage');
    }

    const claudeErrors = this.stats.get('claude')?.errors || 0;
    const codexErrors = this.stats.get('codex')?.errors || 0;

    if (claudeErrors > 5) {
      status.recommendations.push('High error rate on Claude - investigate issues');
    }
    if (codexErrors > 5) {
      status.recommendations.push('High error rate on Codex - investigate issues');
    }

    return status;
  }

  /**
   * Get provider recommendation for specific task
   */
  getRecommendation(
    taskType: TaskType,
    complexity: 'low' | 'medium' | 'high'
  ): Provider {
    // High complexity reasoning → Claude
    if (taskType === 'reasoning' && complexity === 'high') {
      return this.isAvailable('claude') ? 'claude' : 'codex';
    }

    // Code generation → Codex
    if (taskType === 'coding') {
      return this.isAvailable('codex') ? 'codex' : 'claude';
    }

    // Review tasks → Claude
    if (taskType === 'review') {
      return this.isAvailable('claude') ? 'claude' : 'codex';
    }

    // Low complexity → Use less loaded provider
    if (complexity === 'low') {
      const claudeUsage = this.rateLimits.get('claude')?.used || 0;
      const codexUsage = this.rateLimits.get('codex')?.used || 0;

      if (claudeUsage < codexUsage && this.isAvailable('claude')) {
        return 'claude';
      } else if (this.isAvailable('codex')) {
        return 'codex';
      }
    }

    // Default to standard selection
    return this.selectProvider(taskType);
  }

  /**
   * Reset usage stats (for testing)
   */
  reset(): void {
    for (const stats of this.stats.values()) {
      stats.tokensUsed = 0;
      stats.requestCount = 0;
      stats.errors = 0;
    }

    for (const limit of this.rateLimits.values()) {
      limit.used = 0;
      limit.resetTime = Date.now() + 3600000;
    }

    logInfo('ProviderRouter: Stats reset');
  }

  /**
   * Get time until provider is available
   */
  getAvailabilityTime(provider: Provider): number {
    const limit = this.rateLimits.get(provider);
    if (!limit) return 0;

    if (limit.used < limit.limit) {
      return 0; // Available now
    }

    return Math.max(0, limit.resetTime - Date.now());
  }

  /**
   * Predict best provider for next N minutes
   */
  predictBestProvider(minutes: number): Provider {
    const now = Date.now();
    const future = now + (minutes * 60000);

    // Calculate predicted availability
    const predictions: { provider: Provider; score: number }[] = [];

    for (const [provider, limit] of this.rateLimits) {
      const stats = this.stats.get(provider)!;

      // Will rate limit reset by then?
      const willReset = future > limit.resetTime;
      const available = willReset ? limit.limit : limit.limit - limit.used;

      // Calculate score based on availability and performance
      const score =
        (available / limit.limit) * 0.5 +           // Availability weight
        (1 / (stats.errors + 1)) * 0.3 +           // Reliability weight
        (1 / (stats.avgResponseTime + 1)) * 0.2;   // Speed weight

      predictions.push({ provider, score });
    }

    // Sort by score and return best
    predictions.sort((a, b) => b.score - a.score);
    return predictions[0].provider;
  }
}