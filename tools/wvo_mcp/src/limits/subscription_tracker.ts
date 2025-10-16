/**
 * Subscription Limit Tracker - Tracks usage for subscription-based accounts
 *
 * This module:
 * - Tracks hourly and daily request/token usage
 * - Warns when approaching limits (80%, 95%, 99%)
 * - Supports different tiers (Free, Pro, Team)
 * - Persists usage data across sessions
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export type ProviderName = 'claude' | 'codex';
export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface ProviderLimits {
  hourly_requests?: number;
  daily_requests?: number;
  hourly_tokens?: number;
  daily_tokens?: number;
}

export interface UsagePeriod {
  requests: number;
  tokens: number;
  reset_at: string; // ISO timestamp
}

export interface ProviderUsage {
  provider: ProviderName;
  account: string;
  tier: SubscriptionTier;
  limits: ProviderLimits;
  usage: {
    current_hour: UsagePeriod;
    current_day: UsagePeriod;
  };
  warnings: {
    approaching_hourly_limit: boolean;
    approaching_daily_limit: boolean;
    percentage_used: number;
  };
  last_updated: string;
}

export interface UsageSnapshot {
  providers: Record<string, ProviderUsage>;
  last_saved: string;
}

// Default limits based on common subscription tiers
const DEFAULT_LIMITS: Record<SubscriptionTier, ProviderLimits> = {
  free: {
    hourly_requests: 50,
    daily_requests: 500,
    hourly_tokens: 50000,
    daily_tokens: 500000,
  },
  pro: {
    hourly_requests: 500,
    daily_requests: 5000,
    hourly_tokens: 500000,
    daily_tokens: 5000000,
  },
  team: {
    hourly_requests: 1000,
    daily_requests: 10000,
    hourly_tokens: 1000000,
    daily_tokens: 10000000,
  },
  enterprise: {
    hourly_requests: 5000,
    daily_requests: 50000,
    hourly_tokens: 5000000,
    daily_tokens: 50000000,
  },
};

export class SubscriptionLimitTracker extends EventEmitter {
  private usage: Map<string, ProviderUsage> = new Map();
  private readonly usagePath: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_INTERVAL_MS = 30000; // Save every 30 seconds

  constructor(private readonly workspaceRoot: string) {
    super();
    this.usagePath = path.join(workspaceRoot, 'state', 'limits', 'usage_log.json');
    this.scheduleSave();
  }

  /**
   * Initialize tracker by loading previous usage
   */
  async initialize(): Promise<void> {
    try {
      await this.load();
      logInfo('Subscription limit tracker initialized', {
        providers: Array.from(this.usage.keys()),
      });
    } catch (error) {
      logWarning('Failed to load usage data, starting fresh', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Register a provider with its limits
   */
  registerProvider(
    provider: ProviderName,
    account: string,
    tier: SubscriptionTier,
    customLimits?: ProviderLimits
  ): void {
    const key = `${provider}:${account}`;
    const limits = customLimits ?? DEFAULT_LIMITS[tier];

    const now = new Date();
    const hourReset = new Date(now);
    hourReset.setMinutes(0, 0, 0);
    hourReset.setHours(hourReset.getHours() + 1);

    const dayReset = new Date(now);
    dayReset.setHours(0, 0, 0, 0);
    dayReset.setDate(dayReset.getDate() + 1);

    const providerUsage: ProviderUsage = {
      provider,
      account,
      tier,
      limits,
      usage: {
        current_hour: {
          requests: 0,
          tokens: 0,
          reset_at: hourReset.toISOString(),
        },
        current_day: {
          requests: 0,
          tokens: 0,
          reset_at: dayReset.toISOString(),
        },
      },
      warnings: {
        approaching_hourly_limit: false,
        approaching_daily_limit: false,
        percentage_used: 0,
      },
      last_updated: now.toISOString(),
    };

    this.usage.set(key, providerUsage);
    logInfo('Provider registered for usage tracking', { provider, account, tier });
  }

  /**
   * Record usage for a provider
   */
  recordUsage(provider: ProviderName, account: string, requests: number, tokens: number): void {
    const key = `${provider}:${account}`;
    const providerUsage = this.usage.get(key);

    if (!providerUsage) {
      logWarning('Provider not registered, cannot record usage', { provider, account });
      return;
    }

    // Check if we need to reset periods
    this.checkAndResetPeriods(providerUsage);

    // Update usage
    providerUsage.usage.current_hour.requests += requests;
    providerUsage.usage.current_hour.tokens += tokens;
    providerUsage.usage.current_day.requests += requests;
    providerUsage.usage.current_day.tokens += tokens;
    providerUsage.last_updated = new Date().toISOString();

    // Check for warnings
    this.checkWarnings(providerUsage);

    this.usage.set(key, providerUsage);
  }

  /**
   * Check if periods need to be reset
   */
  private checkAndResetPeriods(providerUsage: ProviderUsage): void {
    const now = new Date();

    // Check hourly reset
    const hourReset = new Date(providerUsage.usage.current_hour.reset_at);
    if (now >= hourReset) {
      providerUsage.usage.current_hour.requests = 0;
      providerUsage.usage.current_hour.tokens = 0;
      const nextHourReset = new Date(now);
      nextHourReset.setMinutes(0, 0, 0);
      nextHourReset.setHours(nextHourReset.getHours() + 1);
      providerUsage.usage.current_hour.reset_at = nextHourReset.toISOString();

      logInfo('Hourly usage period reset', {
        provider: providerUsage.provider,
        account: providerUsage.account,
      });
    }

    // Check daily reset
    const dayReset = new Date(providerUsage.usage.current_day.reset_at);
    if (now >= dayReset) {
      providerUsage.usage.current_day.requests = 0;
      providerUsage.usage.current_day.tokens = 0;
      const nextDayReset = new Date(now);
      nextDayReset.setHours(0, 0, 0, 0);
      nextDayReset.setDate(nextDayReset.getDate() + 1);
      providerUsage.usage.current_day.reset_at = nextDayReset.toISOString();

      logInfo('Daily usage period reset', {
        provider: providerUsage.provider,
        account: providerUsage.account,
      });
    }
  }

  /**
   * Check for warning conditions and emit events
   */
  private checkWarnings(providerUsage: ProviderUsage): void {
    const { limits, usage } = providerUsage;

    // Calculate usage percentages
    let maxPercentage = 0;

    if (limits.hourly_requests) {
      const hourlyRequestPercent = usage.current_hour.requests / limits.hourly_requests;
      maxPercentage = Math.max(maxPercentage, hourlyRequestPercent);
    }

    if (limits.hourly_tokens) {
      const hourlyTokenPercent = usage.current_hour.tokens / limits.hourly_tokens;
      maxPercentage = Math.max(maxPercentage, hourlyTokenPercent);
    }

    if (limits.daily_requests) {
      const dailyRequestPercent = usage.current_day.requests / limits.daily_requests;
      maxPercentage = Math.max(maxPercentage, dailyRequestPercent);
    }

    if (limits.daily_tokens) {
      const dailyTokenPercent = usage.current_day.tokens / limits.daily_tokens;
      maxPercentage = Math.max(maxPercentage, dailyTokenPercent);
    }

    providerUsage.warnings.percentage_used = maxPercentage;

    // Emit warnings at thresholds
    if (maxPercentage >= 0.99) {
      providerUsage.warnings.approaching_hourly_limit = true;
      providerUsage.warnings.approaching_daily_limit = true;
      this.emit('limit:critical', {
        provider: providerUsage.provider,
        account: providerUsage.account,
        percentage: maxPercentage,
        message: 'Usage at 99% of limit - will block soon',
      });
      logError('Usage critical - at 99% of limit', {
        provider: providerUsage.provider,
        account: providerUsage.account,
        percentage: Math.round(maxPercentage * 100),
      });
    } else if (maxPercentage >= 0.95) {
      providerUsage.warnings.approaching_hourly_limit = true;
      providerUsage.warnings.approaching_daily_limit = true;
      this.emit('limit:warning', {
        provider: providerUsage.provider,
        account: providerUsage.account,
        percentage: maxPercentage,
        message: 'Usage at 95% of limit - consider switching providers',
      });
      logWarning('Usage warning - at 95% of limit', {
        provider: providerUsage.provider,
        account: providerUsage.account,
        percentage: Math.round(maxPercentage * 100),
      });
    } else if (maxPercentage >= 0.80) {
      providerUsage.warnings.approaching_hourly_limit = true;
      this.emit('limit:alert', {
        provider: providerUsage.provider,
        account: providerUsage.account,
        percentage: maxPercentage,
        message: 'Usage at 80% of limit',
      });
    } else {
      providerUsage.warnings.approaching_hourly_limit = false;
      providerUsage.warnings.approaching_daily_limit = false;
    }
  }

  /**
   * Check if a provider can handle a request
   */
  canMakeRequest(provider: ProviderName, account: string, estimatedTokens: number = 0): boolean {
    const key = `${provider}:${account}`;
    const providerUsage = this.usage.get(key);

    if (!providerUsage) {
      // If not tracked, allow
      return true;
    }

    this.checkAndResetPeriods(providerUsage);

    const { limits, usage } = providerUsage;

    // Check hourly limits
    if (limits.hourly_requests && usage.current_hour.requests >= limits.hourly_requests) {
      return false;
    }

    if (
      limits.hourly_tokens &&
      estimatedTokens > 0 &&
      usage.current_hour.tokens + estimatedTokens >= limits.hourly_tokens
    ) {
      return false;
    }

    // Check daily limits
    if (limits.daily_requests && usage.current_day.requests >= limits.daily_requests) {
      return false;
    }

    if (
      limits.daily_tokens &&
      estimatedTokens > 0 &&
      usage.current_day.tokens + estimatedTokens >= limits.daily_tokens
    ) {
      return false;
    }

    return true;
  }

  /**
   * Get usage snapshot for a provider
   */
  getUsage(provider: ProviderName, account: string): ProviderUsage | undefined {
    const key = `${provider}:${account}`;
    const providerUsage = this.usage.get(key);

    if (providerUsage) {
      this.checkAndResetPeriods(providerUsage);
    }

    return providerUsage;
  }

  /**
   * Get all tracked providers
   */
  getAllUsage(): ProviderUsage[] {
    return Array.from(this.usage.values()).map((usage) => {
      this.checkAndResetPeriods(usage);
      return usage;
    });
  }

  /**
   * Load usage from disk
   */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.usagePath, 'utf-8');
      const snapshot: UsageSnapshot = JSON.parse(content);

      for (const [key, providerUsage] of Object.entries(snapshot.providers)) {
        this.usage.set(key, providerUsage);
      }

      logInfo('Usage data loaded from disk', {
        providers: Object.keys(snapshot.providers).length,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Save usage to disk
   */
  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.usagePath);
      await fs.mkdir(dir, { recursive: true });

      const snapshot: UsageSnapshot = {
        providers: Object.fromEntries(this.usage.entries()),
        last_saved: new Date().toISOString(),
      };

      await fs.writeFile(this.usagePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (error) {
      logError('Failed to save usage data', {
        path: this.usagePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Schedule periodic saves
   */
  private scheduleSave(): void {
    this.saveTimer = setInterval(() => {
      void this.save();
    }, this.SAVE_INTERVAL_MS);
  }

  /**
   * Stop tracker and save final state
   */
  async stop(): Promise<void> {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    await this.save();
    logInfo('Subscription limit tracker stopped');
  }
}
