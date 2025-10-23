/**
 * Provider Manager - Intelligent switching between Codex and Claude Code
 * Handles token limits, task-based model selection, and automatic failover
 */

import { logError, logInfo } from "../telemetry/logger.js";
import { getEnabledProviders, getProviderMetadata, isProviderEnabled, KnownProvider } from "../providers/registry.js";

export type Provider = KnownProvider;
export type TaskComplexity = "simple" | "moderate" | "complex" | "critical";

export interface ProviderUsage {
  provider: Provider;
  tokensUsed: number;
  requestCount: number;
  lastReset: string;
  hourlyLimit: number;
  dailyLimit: number;
}

export interface TaskType {
  name: string;
  complexity: TaskComplexity;
  preferredProvider?: Provider;
  requiresLargeContext?: boolean;
}

export class ProviderManager {
  private usage: Map<Provider, ProviderUsage> = new Map();
  private currentProvider: Provider;
  private taskTypes: Map<string, TaskType> = new Map();

  constructor(initialProvider: Provider = "codex") {
    const enabledProviders = getEnabledProviders();
    if (enabledProviders.length === 0) {
      throw new Error("ProviderManager: no providers enabled. Enable at least one provider in the registry.");
    }

    this.currentProvider = enabledProviders.includes(initialProvider)
      ? initialProvider
      : (enabledProviders[0] as Provider);

    for (const providerId of enabledProviders) {
      const metadata = getProviderMetadata(providerId);
      const hourlyLimit = metadata?.hourlyLimit ?? 100000;
      const dailyLimit = metadata?.dailyLimit ?? 500000;

      this.usage.set(providerId as Provider, {
        provider: providerId as Provider,
        tokensUsed: 0,
        requestCount: 0,
        lastReset: new Date().toISOString(),
        hourlyLimit,
        dailyLimit,
      });
    }

    this.defineTaskTypes();
  }

  private defineTaskTypes() {
    // Simple tasks - prefer faster, cheaper models
    this.taskTypes.set("fs_read", { name: "fs_read", complexity: "simple" });
    this.taskTypes.set("plan_next", { name: "plan_next", complexity: "simple" });
    this.taskTypes.set("plan_update", { name: "plan_update", complexity: "simple" });
    this.taskTypes.set("context_write", { name: "context_write", complexity: "simple" });

    // Moderate tasks - balanced approach
    this.taskTypes.set("cmd_run", { name: "cmd_run", complexity: "moderate" });
    this.taskTypes.set("fs_write", { name: "fs_write", complexity: "moderate" });
    this.taskTypes.set("artifact_record", { name: "artifact_record", complexity: "moderate" });

    // Complex tasks - prefer powerful models
    this.taskTypes.set("critics_run", {
      name: "critics_run",
      complexity: "complex",
      requiresLargeContext: true,
    });

    // Critical tasks - use best available model
    this.taskTypes.set("autopilot_record_audit", {
      name: "autopilot_record_audit",
      complexity: "critical",
      requiresLargeContext: true,
    });
  }

  /**
   * Track token usage for a provider
   */
  trackUsage(provider: Provider, tokensUsed: number) {
    const usage = this.usage.get(provider);
    if (!usage) return;

    usage.tokensUsed += tokensUsed;
    usage.requestCount += 1;

    // Check if we need to reset hourly counters
    const lastReset = new Date(usage.lastReset);
    const hoursSinceReset = (Date.now() - lastReset.getTime()) / (1000 * 60 * 60);

    if (hoursSinceReset >= 1) {
      usage.tokensUsed = tokensUsed; // Reset to current usage
      usage.requestCount = 1;
      usage.lastReset = new Date().toISOString();
    }

    logInfo("Provider usage tracked", {
      provider,
      tokensUsed,
      totalTokens: usage.tokensUsed,
      requestCount: usage.requestCount,
    });
  }

  /**
   * Check if a provider has capacity
   */
  hasCapacity(provider: Provider, estimatedTokens: number = 0): boolean {
    const usage = this.usage.get(provider);
    if (!usage) return false;

    const hourlyRemaining = usage.hourlyLimit - usage.tokensUsed;
    return hourlyRemaining >= estimatedTokens;
  }

  /**
   * Get best provider for a task
   */
  getBestProvider(taskName: string, estimatedTokens: number = 1000): Provider {
    const task = this.taskTypes.get(taskName);
    const enabledProviders = Array.from(this.usage.keys());
    if (!enabledProviders.includes(this.currentProvider)) {
      this.currentProvider = enabledProviders[0];
    }

    const candidateProviders: Provider[] = [];

    if (task?.preferredProvider && enabledProviders.includes(task.preferredProvider)) {
      candidateProviders.push(task.preferredProvider);
    }

    const prefersLargeContext = Boolean(task?.requiresLargeContext || task?.complexity === "complex" || task?.complexity === "critical");
    if (prefersLargeContext) {
      for (const providerId of enabledProviders) {
        const metadata = getProviderMetadata(providerId);
        if (metadata?.capabilities?.largeContext && !candidateProviders.includes(providerId)) {
          candidateProviders.push(providerId);
        }
      }
    }

    if (!candidateProviders.includes(this.currentProvider)) {
      candidateProviders.push(this.currentProvider);
    }

    for (const providerId of enabledProviders) {
      if (!candidateProviders.includes(providerId)) {
        candidateProviders.push(providerId);
      }
    }

    for (const providerId of candidateProviders) {
      if (this.hasCapacity(providerId, estimatedTokens)) {
        this.currentProvider = providerId;
        return providerId;
      }
    }

    logError("No provider capacity available", {
      currentProvider: this.currentProvider,
      estimatedTokens,
      usage: Array.from(this.usage.entries()),
    });

    return this.currentProvider;
  }

  /**
   * Get provider selection recommendation with reasoning
   */
  getProviderRecommendation(taskName: string): {
    provider: Provider;
    reasoning: string;
  } {
    const provider = this.getBestProvider(taskName);
    const metadata = getProviderMetadata(provider);
    const task = this.taskTypes.get(taskName);
    const reasons: string[] = [];

    if (!task) {
      reasons.push("Unknown task type; defaulting to available provider");
    } else {
      reasons.push(`Task complexity: ${task.complexity}`);
      if (task.requiresLargeContext) {
        reasons.push("Requires large context window");
      }
    }

    if (metadata?.staging) {
      reasons.push("Preview provider enabled via environment toggle");
    }

    const usage = this.usage.get(provider);
    if (usage) {
      const remaining = usage.hourlyLimit - usage.tokensUsed;
      reasons.push(`Capacity remaining ~${remaining} tokens this hour`);
    }

    return {
      provider,
      reasoning: reasons.join("; "),
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    const providers = Array.from(this.usage.entries()).map(([provider, data]) => {
      const metadata = getProviderMetadata(provider);
      const hourlyRemaining = data.hourlyLimit - data.tokensUsed;
      const enabled = metadata ? isProviderEnabled(metadata) : true;
      return {
        provider,
        label: metadata?.label ?? provider,
        stage: metadata?.staging ? "staging" : "production",
        costTier: metadata?.capabilities?.costTier ?? "unknown",
        tokensUsed: data.tokensUsed,
        requestCount: data.requestCount,
        hourlyLimit: data.hourlyLimit,
        hourlyRemaining,
        percentUsed: data.hourlyLimit > 0 ? ((data.tokensUsed / data.hourlyLimit) * 100).toFixed(1) + "%" : "n/a",
        enabled,
      };
    });

    return {
      currentProvider: this.currentProvider,
      providers,
    };
  }

  /**
   * Force switch provider
   */
  switchProvider(provider: Provider, reason: string = "manual") {
    const old = this.currentProvider;
    this.currentProvider = provider;
    logInfo("Provider switched", { from: old, to: provider, reason });
  }
}
