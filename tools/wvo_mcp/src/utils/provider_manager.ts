/**
 * Provider Manager - Intelligent switching between Codex and Claude Code
 * Handles token limits, task-based model selection, and automatic failover
 */

import { logError, logInfo } from "../telemetry/logger.js";

export type Provider = "codex" | "claude_code";
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

  constructor(initialProvider: Provider = "claude_code") {
    this.currentProvider = initialProvider;

    // Initialize usage tracking
    this.usage.set("codex", {
      provider: "codex",
      tokensUsed: 0,
      requestCount: 0,
      lastReset: new Date().toISOString(),
      hourlyLimit: 100000, // Example limits
      dailyLimit: 500000,
    });

    this.usage.set("claude_code", {
      provider: "claude_code",
      tokensUsed: 0,
      requestCount: 0,
      lastReset: new Date().toISOString(),
      hourlyLimit: 150000, // Example limits
      dailyLimit: 750000,
    });

    // Define task types and their characteristics
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

    // If task has preferred provider and it has capacity, use it
    if (task?.preferredProvider && this.hasCapacity(task.preferredProvider, estimatedTokens)) {
      return task.preferredProvider;
    }

    // Check current provider capacity
    if (this.hasCapacity(this.currentProvider, estimatedTokens)) {
      return this.currentProvider;
    }

    // Find alternate provider with capacity
    const alternateProvider = this.currentProvider === "codex" ? "claude_code" : "codex";
    if (this.hasCapacity(alternateProvider, estimatedTokens)) {
      logInfo("Switching to alternate provider", {
        from: this.currentProvider,
        to: alternateProvider,
        reason: "capacity",
      });
      this.currentProvider = alternateProvider;
      return alternateProvider;
    }

    // No capacity available - log warning and return current
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
    const task = this.taskTypes.get(taskName);
    const currentUsage = this.usage.get(this.currentProvider);

    if (!task) {
      return {
        provider: this.currentProvider,
        reasoning: "Unknown task type, using current provider",
      };
    }

    // Simple tasks - use whichever has more capacity
    if (task.complexity === "simple") {
      const codexCapacity = this.usage.get("codex")!.hourlyLimit - this.usage.get("codex")!.tokensUsed;
      const claudeCapacity = this.usage.get("claude_code")!.hourlyLimit - this.usage.get("claude_code")!.tokensUsed;

      if (codexCapacity > claudeCapacity) {
        return { provider: "codex", reasoning: "Simple task, Codex has more capacity" };
      } else {
        return { provider: "claude_code", reasoning: "Simple task, Claude Code has more capacity" };
      }
    }

    // Complex/Critical tasks - prefer Claude Code (typically more powerful)
    if (task.complexity === "complex" || task.complexity === "critical") {
      if (this.hasCapacity("claude_code", 5000)) {
        return {
          provider: "claude_code",
          reasoning: `${task.complexity} task, using Claude Code for better performance`,
        };
      } else if (this.hasCapacity("codex", 5000)) {
        return {
          provider: "codex",
          reasoning: `${task.complexity} task, Claude Code at capacity, falling back to Codex`,
        };
      }
    }

    // Moderate tasks - use current provider if it has capacity
    if (this.hasCapacity(this.currentProvider, 2000)) {
      return {
        provider: this.currentProvider,
        reasoning: `Moderate task, current provider has capacity`,
      };
    }

    // Fallback
    const alternateProvider = this.currentProvider === "codex" ? "claude_code" : "codex";
    return {
      provider: alternateProvider,
      reasoning: "Current provider at capacity, switching to alternate",
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      currentProvider: this.currentProvider,
      usage: Array.from(this.usage.entries()).map(([provider, data]) => ({
        provider,
        tokensUsed: data.tokensUsed,
        requestCount: data.requestCount,
        hourlyRemaining: data.hourlyLimit - data.tokensUsed,
        percentUsed: ((data.tokensUsed / data.hourlyLimit) * 100).toFixed(1) + "%",
      })),
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
