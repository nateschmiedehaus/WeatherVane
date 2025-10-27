/**
 * Usage Estimator - Provides intelligent recommendations for provider selection
 *
 * This module:
 * - Estimates remaining quota for providers
 * - Projects when limits will be hit
 * - Recommends provider switching strategies
 * - Calculates optimal task distribution
 */

import { logInfo, logWarning } from '../telemetry/logger.js';

import { SubscriptionLimitTracker, ProviderName, ProviderUsage } from './subscription_tracker.js';

export interface QuotaEstimate {
  provider: ProviderName;
  account: string;
  hourly_remaining: {
    requests: number;
    tokens: number;
    percentage: number;
  };
  daily_remaining: {
    requests: number;
    tokens: number;
    percentage: number;
  };
  projected_exhaustion: {
    hourly_minutes: number | null; // null means won't exhaust
    daily_minutes: number | null;
  };
  recommendation: 'available' | 'throttle' | 'avoid' | 'exhausted';
}

export interface TaskEstimate {
  estimated_tokens: number;
  estimated_requests: number;
}

export interface ProviderRecommendation {
  preferred_provider: ProviderName;
  fallback_provider: ProviderName | null;
  reasoning: string;
  quota_pressure: 'low' | 'medium' | 'high' | 'critical';
}

export class UsageEstimator {
  constructor(private readonly tracker: SubscriptionLimitTracker) {}

  /**
   * Estimate remaining quota for a provider
   */
  estimateQuota(provider: ProviderName, account: string): QuotaEstimate | null {
    const usage = this.tracker.getUsage(provider, account);
    if (!usage) return null;

    const { limits, usage: current } = usage;

    // Calculate remaining quota
    const hourlyRequestsRemaining = limits.hourly_requests
      ? Math.max(0, limits.hourly_requests - current.current_hour.requests)
      : Infinity;

    const hourlyTokensRemaining = limits.hourly_tokens
      ? Math.max(0, limits.hourly_tokens - current.current_hour.tokens)
      : Infinity;

    const dailyRequestsRemaining = limits.daily_requests
      ? Math.max(0, limits.daily_requests - current.current_day.requests)
      : Infinity;

    const dailyTokensRemaining = limits.daily_tokens
      ? Math.max(0, limits.daily_tokens - current.current_day.tokens)
      : Infinity;

    // Calculate percentages
    const hourlyRequestsPct = limits.hourly_requests
      ? (hourlyRequestsRemaining / limits.hourly_requests) * 100
      : 100;

    const hourlyTokensPct = limits.hourly_tokens
      ? (hourlyTokensRemaining / limits.hourly_tokens) * 100
      : 100;

    const dailyRequestsPct = limits.daily_requests
      ? (dailyRequestsRemaining / limits.daily_requests) * 100
      : 100;

    const dailyTokensPct = limits.daily_tokens
      ? (dailyTokensRemaining / limits.daily_tokens) * 100
      : 100;

    // Project exhaustion time based on current rate
    const hourlyExhaustion = this.projectExhaustion(
      current.current_hour.requests,
      hourlyRequestsRemaining,
      limits.hourly_requests ?? 0,
      60
    );

    const dailyExhaustion = this.projectExhaustion(
      current.current_day.requests,
      dailyRequestsRemaining,
      limits.daily_requests ?? 0,
      24 * 60
    );

    // Determine recommendation
    const minHourlyPct = Math.min(hourlyRequestsPct, hourlyTokensPct);
    const minDailyPct = Math.min(dailyRequestsPct, dailyTokensPct);
    const minOverallPct = Math.min(minHourlyPct, minDailyPct);

    let recommendation: QuotaEstimate['recommendation'];
    if (minOverallPct <= 0) {
      recommendation = 'exhausted';
    } else if (minOverallPct < 5) {
      recommendation = 'avoid';
    } else if (minOverallPct < 20) {
      recommendation = 'throttle';
    } else {
      recommendation = 'available';
    }

    return {
      provider,
      account,
      hourly_remaining: {
        requests: hourlyRequestsRemaining === Infinity ? -1 : hourlyRequestsRemaining,
        tokens: hourlyTokensRemaining === Infinity ? -1 : hourlyTokensRemaining,
        percentage: Math.min(minHourlyPct, 100),
      },
      daily_remaining: {
        requests: dailyRequestsRemaining === Infinity ? -1 : dailyRequestsRemaining,
        tokens: dailyTokensRemaining === Infinity ? -1 : dailyTokensRemaining,
        percentage: Math.min(minDailyPct, 100),
      },
      projected_exhaustion: {
        hourly_minutes: hourlyExhaustion,
        daily_minutes: dailyExhaustion,
      },
      recommendation,
    };
  }

  /**
   * Project time until quota exhaustion
   * Returns null if won't exhaust, or minutes until exhaustion
   */
  private projectExhaustion(
    currentUsage: number,
    remaining: number,
    limit: number,
    periodMinutes: number
  ): number | null {
    if (remaining === Infinity || limit === 0 || currentUsage === 0) {
      return null;
    }

    // Calculate average rate per minute
    const minutesElapsed = this.getMinutesElapsed(periodMinutes);
    if (minutesElapsed === 0) return null;

    const ratePerMinute = currentUsage / minutesElapsed;
    if (ratePerMinute === 0) return null;

    // Project exhaustion
    const minutesUntilExhaustion = remaining / ratePerMinute;

    // Only return if exhaustion is within the period
    if (minutesUntilExhaustion > periodMinutes - minutesElapsed) {
      return null;
    }

    return Math.round(minutesUntilExhaustion);
  }

  /**
   * Calculate minutes elapsed in current period
   */
  private getMinutesElapsed(periodMinutes: number): number {
    const now = new Date();
    if (periodMinutes === 60) {
      // Hourly period - minutes since top of hour
      return now.getMinutes();
    } else if (periodMinutes === 24 * 60) {
      // Daily period - minutes since midnight
      return now.getHours() * 60 + now.getMinutes();
    }
    return 0;
  }

  /**
   * Estimate task resource requirements
   */
  estimateTask(taskDescription: string, contextSize: number = 0): TaskEstimate {
    // Simple heuristic-based estimation
    // In production, this could use ML models or historical data

    const descriptionLength = taskDescription.length;
    const baseTokens = Math.max(1000, descriptionLength * 4); // ~4 tokens per char
    const contextTokens = contextSize;

    // Estimate output tokens (typically 20-30% of input for code generation)
    const outputTokens = Math.round((baseTokens + contextTokens) * 0.25);

    return {
      estimated_tokens: baseTokens + contextTokens + outputTokens,
      estimated_requests: 1,
    };
  }

  /**
   * Recommend best provider for a task
   */
  recommendProvider(
    task: TaskEstimate,
    availableProviders: Array<{ provider: ProviderName; account: string }>
  ): ProviderRecommendation {
    const estimates = availableProviders
      .map((p) => ({
        ...p,
        quota: this.estimateQuota(p.provider, p.account),
      }))
      .filter((p) => p.quota !== null);

    if (estimates.length === 0) {
      logWarning('No providers with quota information available');
      return {
        preferred_provider: 'claude',
        fallback_provider: 'codex',
        reasoning: 'No quota information available, using default',
        quota_pressure: 'low',
      };
    }

    // Sort by recommendation quality
    const sorted = estimates.sort((a, b) => {
      const rankA = this.rankRecommendation(a.quota!.recommendation);
      const rankB = this.rankRecommendation(b.quota!.recommendation);
      if (rankA !== rankB) return rankA - rankB;

      // If tied, prefer provider with more remaining quota
      const remainingA = Math.min(
        a.quota!.hourly_remaining.percentage,
        a.quota!.daily_remaining.percentage
      );
      const remainingB = Math.min(
        b.quota!.hourly_remaining.percentage,
        b.quota!.daily_remaining.percentage
      );
      return remainingB - remainingA;
    });

    const preferred = sorted[0];
    const fallback = sorted[1] ?? null;

    // Determine overall quota pressure
    const allAvailable = estimates.filter(
      (e) => e.quota!.recommendation === 'available'
    ).length;
    const allThrottle = estimates.filter(
      (e) => e.quota!.recommendation === 'throttle'
    ).length;

    let pressure: ProviderRecommendation['quota_pressure'];
    if (preferred.quota!.recommendation === 'exhausted') {
      pressure = 'critical';
    } else if (allAvailable === 0) {
      pressure = 'high';
    } else if (allThrottle > 0) {
      pressure = 'medium';
    } else {
      pressure = 'low';
    }

    // Build reasoning
    let reasoning = `${preferred.provider} selected (${preferred.quota!.recommendation})`;
    if (preferred.quota!.projected_exhaustion.hourly_minutes !== null) {
      reasoning += `, hourly limit in ~${preferred.quota!.projected_exhaustion.hourly_minutes}min`;
    }
    if (fallback) {
      reasoning += `. Fallback: ${fallback.provider} (${fallback.quota!.recommendation})`;
    }

    // Check if task can be accommodated
    const canHandle = this.tracker.canMakeRequest(
      preferred.provider,
      preferred.account,
      task.estimated_tokens
    );

    if (!canHandle && fallback) {
      logInfo('Preferred provider cannot handle task, switching to fallback', {
        preferred: preferred.provider,
        fallback: fallback.provider,
      });
      return {
        preferred_provider: fallback.provider,
        fallback_provider: null,
        reasoning: `Switched to ${fallback.provider} due to quota constraints`,
        quota_pressure: pressure,
      };
    }

    return {
      preferred_provider: preferred.provider,
      fallback_provider: fallback?.provider ?? null,
      reasoning,
      quota_pressure: pressure,
    };
  }

  /**
   * Rank recommendation quality (lower is better)
   */
  private rankRecommendation(rec: QuotaEstimate['recommendation']): number {
    switch (rec) {
      case 'available':
        return 0;
      case 'throttle':
        return 1;
      case 'avoid':
        return 2;
      case 'exhausted':
        return 3;
    }
  }

  /**
   * Get summary of all provider quotas
   */
  getAllQuotas(): QuotaEstimate[] {
    const allUsage = this.tracker.getAllUsage();
    return allUsage
      .map((u) => this.estimateQuota(u.provider, u.account))
      .filter((q): q is QuotaEstimate => q !== null);
  }

  /**
   * Check if any provider is under pressure
   */
  isUnderPressure(): boolean {
    const quotas = this.getAllQuotas();
    return quotas.some(
      (q) => q.recommendation === 'throttle' || q.recommendation === 'avoid'
    );
  }

  /**
   * Get detailed pressure report
   */
  getPressureReport(): {
    overall_status: 'healthy' | 'moderate' | 'high' | 'critical';
    providers: QuotaEstimate[];
    recommendations: string[];
  } {
    const quotas = this.getAllQuotas();

    if (quotas.length === 0) {
      return {
        overall_status: 'healthy',
        providers: [],
        recommendations: ['No providers tracked yet'],
      };
    }

    // Determine overall status
    const exhausted = quotas.filter((q) => q.recommendation === 'exhausted').length;
    const avoid = quotas.filter((q) => q.recommendation === 'avoid').length;
    const throttle = quotas.filter((q) => q.recommendation === 'throttle').length;

    let status: 'healthy' | 'moderate' | 'high' | 'critical';
    if (exhausted > 0) {
      status = 'critical';
    } else if (avoid > 0) {
      status = 'high';
    } else if (throttle > 0) {
      status = 'moderate';
    } else {
      status = 'healthy';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (exhausted > 0) {
      recommendations.push(
        `${exhausted} provider(s) exhausted - consider waiting or adding accounts`
      );
    }

    if (avoid > 0) {
      recommendations.push(
        `${avoid} provider(s) near limit - route tasks to other providers`
      );
    }

    if (throttle > 0) {
      recommendations.push(`${throttle} provider(s) under moderate load - distribute tasks`);
    }

    const soonToExhaust = quotas.filter(
      (q) =>
        q.projected_exhaustion.hourly_minutes !== null &&
        q.projected_exhaustion.hourly_minutes < 30
    );

    if (soonToExhaust.length > 0) {
      recommendations.push(
        `${soonToExhaust.length} provider(s) will hit hourly limit within 30min`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All providers operating normally');
    }

    return {
      overall_status: status,
      providers: quotas,
      recommendations,
    };
  }
}
