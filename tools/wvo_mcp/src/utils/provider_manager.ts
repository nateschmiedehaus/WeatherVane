/**
 * Provider Manager - Intelligent switching between Codex and Claude Code
 * Handles token limits, task-based model selection, and automatic failover
 */

import { EventEmitter } from "node:events";

import {
  getEnabledProviders,
  getProviderMetadata,
  isProviderEnabled,
  KnownProvider,
  normalizeProviderId,
  displayProviderId,
  ProviderAlias,
} from "../providers/registry.js";
import { logError, logInfo, logWarning } from "../telemetry/logger.js";

import { ProviderCapacityMonitor } from "./provider_capacity_monitor.js";

export type Provider = KnownProvider;
export type ProviderLike = ProviderAlias;
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
  preferredProvider?: ProviderLike;
  requiresLargeContext?: boolean;
}

export interface ProviderFailoverEvent {
  from: ProviderLike;
  to: ProviderLike;
  reason: string;
  taskName?: string;
}

export class ProviderManager extends EventEmitter {
  private usage: Map<Provider, ProviderUsage> = new Map();
  private currentProvider: Provider;
  private taskTypes: Map<string, TaskType> = new Map();
  private capacityMonitor?: ProviderCapacityMonitor;
  private preferredProvider: Provider; // Remember user's preferred provider

  constructor(initialProvider: ProviderLike = "codex", capacityMonitor?: ProviderCapacityMonitor) {
    super();
    const enabledProviders = getEnabledProviders();
    if (enabledProviders.length === 0) {
      throw new Error("ProviderManager: no providers enabled. Enable at least one provider in the registry.");
    }

    const normalizedInitial = normalizeProviderId(initialProvider);

    this.currentProvider = enabledProviders.includes(normalizedInitial)
      ? normalizedInitial
      : (enabledProviders[0] as Provider);
    this.preferredProvider = this.currentProvider; // Remember original preference

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

    this.capacityMonitor = capacityMonitor;

    // Listen for provider recovery events
    if (this.capacityMonitor) {
      this.capacityMonitor.on("provider:recovered", (event) => {
        this.handleProviderRecovery(event.provider);
      });

      this.capacityMonitor.on("provider:probe:ready", (event) => {
        logInfo("Provider probe suggests capacity may be restored", {
          provider: event.provider,
        });
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
  async trackUsage(providerLike: ProviderLike, tokensUsed: number, success: boolean = true): Promise<void> {
    const provider = normalizeProviderId(providerLike);
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

    const displayProvider = this.toDisplayId(provider);

    logInfo("Provider usage tracked", {
      provider: displayProvider,
      tokensUsed,
      totalTokens: usage.tokensUsed,
      requestCount: usage.requestCount,
      success,
    });

    // Report to capacity monitor
    if (this.capacityMonitor && success) {
      await this.capacityMonitor.reportSuccess(provider);
    }

    // Check if approaching limit
    const remainingPercent = ((usage.hourlyLimit - usage.tokensUsed) / usage.hourlyLimit) * 100;
    if (remainingPercent < 20 && remainingPercent > 0) {
      logWarning("Provider approaching capacity limit", {
        provider: displayProvider,
        percentRemaining: remainingPercent.toFixed(1),
        tokensRemaining: usage.hourlyLimit - usage.tokensUsed,
      });
    }
  }

  /**
   * Check if a provider has capacity
   */
  async hasCapacity(providerLike: ProviderLike, estimatedTokens: number = 0): Promise<boolean> {
    const provider = normalizeProviderId(providerLike);
    const usage = this.usage.get(provider);
    if (!usage) return false;

    const hourlyRemaining = usage.hourlyLimit - usage.tokensUsed;
    const hasTokens = hourlyRemaining >= estimatedTokens;

    // If no capacity, report to monitor
    if (!hasTokens && this.capacityMonitor) {
      const estimatedRecoveryMinutes = Math.ceil((Date.now() - new Date(usage.lastReset).getTime()) / (1000 * 60));
      const remainingMinutes = Math.max(0, 60 - estimatedRecoveryMinutes);

      await this.capacityMonitor.reportLimitHit(provider, hourlyRemaining, remainingMinutes);
    }

    // Also check capacity monitor status
    if (this.capacityMonitor) {
      const monitorSaysHasCapacity = this.capacityMonitor.hasCapacity(provider);
      return hasTokens && monitorSaysHasCapacity;
    }

    return hasTokens;
  }

  /**
   * Get best provider for a task (display alias)
   */
  async getBestProvider(taskName: string, estimatedTokens: number = 1000): Promise<ProviderLike> {
    const provider = await this.selectProvider(taskName, estimatedTokens);
    return this.toDisplayId(provider);
  }

  private async selectProvider(taskName: string, estimatedTokens: number = 1000): Promise<Provider> {
    const task = this.taskTypes.get(taskName);
    const enabledProviders = Array.from(this.usage.keys());
    if (!enabledProviders.includes(this.currentProvider)) {
      this.currentProvider = enabledProviders[0];
    }

    const candidateProviders: Provider[] = [];

    if (task?.preferredProvider) {
      const preferredProvider = normalizeProviderId(task.preferredProvider);
      if (enabledProviders.includes(preferredProvider) && !candidateProviders.includes(preferredProvider)) {
        candidateProviders.push(preferredProvider);
      }
    }

    if (!candidateProviders.includes(this.preferredProvider)) {
      candidateProviders.push(this.preferredProvider);
    }

    const prefersLargeContext = Boolean(
      task?.requiresLargeContext || task?.complexity === "complex" || task?.complexity === "critical",
    );
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

    const oldProvider = this.currentProvider;
    for (const providerId of candidateProviders) {
      if (await this.hasCapacity(providerId, estimatedTokens)) {
        if (oldProvider !== providerId) {
          this.switchProvider(providerId, `Failover: ${this.toDisplayId(oldProvider)} at capacity`, taskName);
        }
        return providerId;
      }
    }

    logError("All providers at capacity - workload may be throttled", {
      currentProvider: this.toDisplayId(this.currentProvider),
      estimatedTokens,
      taskName,
      providers: Array.from(this.usage.entries()).map(([provider, usage]) => ({
        provider: this.toDisplayId(provider),
        tokensUsed: usage.tokensUsed,
        hourlyLimit: usage.hourlyLimit,
        percentUsed: ((usage.tokensUsed / usage.hourlyLimit) * 100).toFixed(1) + "%",
      })),
    });

    this.emit("all-providers-exhausted", {
      estimatedTokens,
      taskName,
      providers: enabledProviders.map((p) => this.toDisplayId(p)),
    });

    let bestProvider = this.currentProvider;
    let maxRemaining = -1;
    for (const [provider, usage] of this.usage.entries()) {
      const remaining = usage.hourlyLimit - usage.tokensUsed;
      if (remaining > maxRemaining) {
        maxRemaining = remaining;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }

  /**
   * Get provider selection recommendation with reasoning
   */
  async getProviderRecommendation(taskName: string): Promise<{
    provider: ProviderLike;
    reasoning: string;
  }> {
    const provider = await this.selectProvider(taskName);
    const providerAlias = this.toDisplayId(provider);
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
      provider: providerAlias,
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
      const displayId = this.toDisplayId(provider);
      return {
        provider: displayId,
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
      currentProvider: this.toDisplayId(this.currentProvider),
      providers,
    };
  }

  /**
   * Force switch provider
   */
  switchProvider(providerLike: ProviderLike, reason: string = "manual", taskName?: string) {
    const provider = normalizeProviderId(providerLike);
    const old = this.currentProvider;
    if (old === provider) {
      return;
    }
    this.currentProvider = provider;
    logInfo("Provider switched", {
      from: this.toDisplayId(old),
      to: this.toDisplayId(provider),
      reason,
      taskName,
    });

    // Emit failover event
    this.emit("provider:failover", {
      from: this.toDisplayId(old),
      to: this.toDisplayId(provider),
      reason,
      taskName,
    } satisfies ProviderFailoverEvent);
  }

  /**
   * Handle provider recovery - try to switch back to preferred provider
   */
  private handleProviderRecovery(provider: Provider): void {
    logInfo("Provider recovered - evaluating switch back", {
      recoveredProvider: this.toDisplayId(provider),
      currentProvider: this.toDisplayId(this.currentProvider),
      preferredProvider: this.toDisplayId(this.preferredProvider),
    });

    // If the recovered provider is the preferred one and we're not currently using it,
    // switch back
    if (provider === this.preferredProvider && this.currentProvider !== this.preferredProvider) {
      this.switchProvider(provider, "Recovered capacity - switching back to preferred provider");
    }
  }

  /**
   * Get preferred provider (user's initial choice)
   */
  getPreferredProvider(): ProviderLike {
    return this.toDisplayId(this.preferredProvider);
  }

  /**
   * Set new preferred provider
   */
  setPreferredProvider(providerLike: ProviderLike): void {
    this.preferredProvider = normalizeProviderId(providerLike);
    logInfo("Preferred provider updated", { provider: this.toDisplayId(this.preferredProvider) });
  }

  private toDisplayId(provider: Provider): ProviderLike {
    return displayProviderId(provider);
  }
}
