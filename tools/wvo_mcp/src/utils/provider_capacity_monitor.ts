/**
 * Provider Capacity Monitor - Proactive monitoring and recovery
 *
 * Features:
 * - Tracks rate-limited providers
 * - Periodically probes them with lightweight health checks
 * - Automatically detects capacity recovery
 * - Emits events for orchestrator to react to capacity changes
 * - Maintains telemetry on provider availability
 */

import { EventEmitter } from "node:events";
import { logInfo, logWarning, logError, logDebug } from "../telemetry/logger.js";
import type { Provider } from "./provider_manager.js";
import { getProviderMetadata } from "../providers/registry.js";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface ProviderCapacityStatus {
  provider: Provider;
  hasCapacity: boolean;
  lastCheck: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  estimatedRecoveryTime?: string;
  reasoningEffort?: string;
}

export interface ProviderRecoveryEvent {
  provider: Provider;
  wasDownForMs: number;
  previousFailures: number;
}

export interface ProviderLimitEvent {
  provider: Provider;
  tokensRemaining: number;
  estimatedRecoveryMinutes: number;
}

interface CapacityHistory {
  provider: Provider;
  timestamp: string;
  hasCapacity: boolean;
  failureCount: number;
  successCount: number;
}

export interface ProviderCapacityMonitorOptions {
  workspaceRoot: string;
  probeIntervalSeconds?: number; // How often to probe rate-limited providers
  maxProbeInterval?: number; // Maximum probe interval (exponential backoff cap)
  healthCheckTimeoutMs?: number;
  historyRetentionDays?: number;
}

/**
 * Monitors provider capacity and automatically probes rate-limited providers
 * to detect when they come back online
 */
export class ProviderCapacityMonitor extends EventEmitter {
  private readonly workspaceRoot: string;
  private readonly probeIntervalSeconds: number;
  private readonly maxProbeInterval: number;
  private readonly healthCheckTimeoutMs: number;
  private readonly historyRetentionDays: number;

  private providerStatus: Map<Provider, ProviderCapacityStatus> = new Map();
  private probeTimers: Map<Provider, NodeJS.Timeout> = new Map();
  private limitsDetected: Map<Provider, number> = new Map(); // provider -> timestamp when limit detected
  private running = false;

  constructor(options: ProviderCapacityMonitorOptions) {
    super();
    this.workspaceRoot = options.workspaceRoot;
    this.probeIntervalSeconds = options.probeIntervalSeconds ?? 30; // Default: probe every 30 seconds
    this.maxProbeInterval = options.maxProbeInterval ?? 300; // Default: max 5 minutes
    this.healthCheckTimeoutMs = options.healthCheckTimeoutMs ?? 5000;
    this.historyRetentionDays = options.historyRetentionDays ?? 7;
  }

  /**
   * Start monitoring providers
   */
  async start(): Promise<void> {
    if (this.running) {
      logWarning("ProviderCapacityMonitor already running");
      return;
    }

    this.running = true;
    await this.loadHistory();
    logInfo("ProviderCapacityMonitor started", {
      probeIntervalSeconds: this.probeIntervalSeconds,
      maxProbeInterval: this.maxProbeInterval,
    });
  }

  /**
   * Stop monitoring and clean up timers
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    for (const timer of this.probeTimers.values()) {
      clearTimeout(timer);
    }
    this.probeTimers.clear();
    logInfo("ProviderCapacityMonitor stopped");
  }

  /**
   * Report that a provider has hit rate limits
   * This triggers automatic probing to detect recovery
   */
  async reportLimitHit(
    provider: Provider,
    tokensRemaining: number,
    estimatedRecoveryMinutes: number
  ): Promise<void> {
    const now = Date.now();
    this.limitsDetected.set(provider, now);

    const status = this.providerStatus.get(provider) ?? this.createDefaultStatus(provider);
    status.hasCapacity = false;
    status.lastCheck = new Date().toISOString();
    status.consecutiveFailures += 1;
    status.consecutiveSuccesses = 0;
    status.estimatedRecoveryTime = new Date(now + estimatedRecoveryMinutes * 60 * 1000).toISOString();
    this.providerStatus.set(provider, status);

    logWarning("Provider limit hit - starting recovery monitoring", {
      provider,
      tokensRemaining,
      estimatedRecoveryMinutes,
      consecutiveFailures: status.consecutiveFailures,
    });

    // Emit event so orchestrator can react
    this.emit("provider:limit", {
      provider,
      tokensRemaining,
      estimatedRecoveryMinutes,
    } satisfies ProviderLimitEvent);

    // Start probing if not already probing
    if (!this.probeTimers.has(provider)) {
      await this.scheduleProbe(provider, this.probeIntervalSeconds);
    }

    await this.saveHistory();
  }

  /**
   * Report successful provider usage (capacity confirmed)
   */
  async reportSuccess(provider: Provider): Promise<void> {
    const status = this.providerStatus.get(provider) ?? this.createDefaultStatus(provider);
    const wasDownMs = this.limitsDetected.get(provider);

    status.hasCapacity = true;
    status.lastCheck = new Date().toISOString();
    status.consecutiveSuccesses += 1;
    status.consecutiveFailures = 0;
    status.estimatedRecoveryTime = undefined;
    this.providerStatus.set(provider, status);

    // If provider was down and now recovered, emit recovery event
    if (wasDownMs) {
      const downDuration = Date.now() - wasDownMs;
      this.limitsDetected.delete(provider);

      logInfo("Provider capacity recovered", {
        provider,
        downDurationMs: downDuration,
        consecutiveSuccesses: status.consecutiveSuccesses,
      });

      this.emit("provider:recovered", {
        provider,
        wasDownForMs: downDuration,
        previousFailures: status.consecutiveFailures,
      } satisfies ProviderRecoveryEvent);

      // Stop probing - provider is healthy
      this.clearProbeTimer(provider);
    }

    await this.saveHistory();
  }

  /**
   * Probe a provider to check if capacity has returned
   */
  private async probeProvider(provider: Provider): Promise<boolean> {
    logDebug("Probing provider capacity", { provider });

    try {
      // Lightweight health check: try to get provider metadata and status
      const metadata = getProviderMetadata(provider);
      if (!metadata) {
        logWarning("Provider metadata not found during probe", { provider });
        return false;
      }

      // For now, we rely on the ProviderManager to update us through reportSuccess/reportLimitHit
      // This probe is mainly to ensure we're checking regularly
      // Real capacity check happens when tasks execute

      // Check if estimated recovery time has passed
      const status = this.providerStatus.get(provider);
      if (status?.estimatedRecoveryTime) {
        const recoveryTime = new Date(status.estimatedRecoveryTime).getTime();
        const now = Date.now();

        if (now >= recoveryTime) {
          logInfo("Provider estimated recovery time reached", {
            provider,
            estimatedRecoveryTime: status.estimatedRecoveryTime,
          });
          // Emit signal that provider might be ready - orchestrator should try it
          this.emit("provider:probe:ready", { provider });
        }
      }

      return true;
    } catch (error) {
      logError("Provider probe failed", { provider, error });
      return false;
    }
  }

  /**
   * Schedule next probe for a provider
   */
  private async scheduleProbe(provider: Provider, delaySeconds: number): Promise<void> {
    // Clear existing timer if any
    this.clearProbeTimer(provider);

    const cappedDelay = Math.min(delaySeconds, this.maxProbeInterval);

    const timer = setTimeout(async () => {
      if (!this.running) return;

      await this.probeProvider(provider);

      // Schedule next probe with exponential backoff (up to max)
      const status = this.providerStatus.get(provider);
      if (status && !status.hasCapacity) {
        const nextDelay = Math.min(cappedDelay * 1.5, this.maxProbeInterval);
        await this.scheduleProbe(provider, nextDelay);
      }
    }, cappedDelay * 1000);

    this.probeTimers.set(provider, timer);

    logDebug("Scheduled provider probe", {
      provider,
      delaySeconds: cappedDelay,
    });
  }

  /**
   * Clear probe timer for a provider
   */
  private clearProbeTimer(provider: Provider): void {
    const timer = this.probeTimers.get(provider);
    if (timer) {
      clearTimeout(timer);
      this.probeTimers.delete(provider);
    }
  }

  /**
   * Get current status for all monitored providers
   */
  getStatus(): ProviderCapacityStatus[] {
    return Array.from(this.providerStatus.values());
  }

  /**
   * Get status for specific provider
   */
  getProviderStatus(provider: Provider): ProviderCapacityStatus | undefined {
    return this.providerStatus.get(provider);
  }

  /**
   * Check if provider has capacity (best guess)
   */
  hasCapacity(provider: Provider): boolean {
    const status = this.providerStatus.get(provider);
    return status?.hasCapacity ?? true; // Default to true if unknown
  }

  /**
   * Create default status for a provider
   */
  private createDefaultStatus(provider: Provider): ProviderCapacityStatus {
    return {
      provider,
      hasCapacity: true,
      lastCheck: new Date().toISOString(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };
  }

  /**
   * Save capacity history to disk
   */
  private async saveHistory(): Promise<void> {
    try {
      const historyDir = path.join(this.workspaceRoot, "state", "analytics");
      if (!existsSync(historyDir)) {
        await mkdir(historyDir, { recursive: true });
      }

      const historyPath = path.join(historyDir, "provider_capacity_history.jsonl");
      const entries: CapacityHistory[] = Array.from(this.providerStatus.values()).map((status) => ({
        provider: status.provider,
        timestamp: new Date().toISOString(),
        hasCapacity: status.hasCapacity,
        failureCount: status.consecutiveFailures,
        successCount: status.consecutiveSuccesses,
      }));

      // Append to JSONL file
      const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await writeFile(historyPath, lines, { flag: "a" });
    } catch (error) {
      logError("Failed to save provider capacity history", { error });
    }
  }

  /**
   * Load recent capacity history from disk
   */
  private async loadHistory(): Promise<void> {
    try {
      const historyPath = path.join(this.workspaceRoot, "state", "analytics", "provider_capacity_history.jsonl");
      if (!existsSync(historyPath)) {
        logDebug("No provider capacity history found");
        return;
      }

      const content = await readFile(historyPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      // Load recent status from last entries per provider
      const latestByProvider = new Map<Provider, CapacityHistory>();
      for (const line of lines) {
        try {
          const entry: CapacityHistory = JSON.parse(line);
          const existing = latestByProvider.get(entry.provider);
          if (!existing || entry.timestamp > existing.timestamp) {
            latestByProvider.set(entry.provider, entry);
          }
        } catch {
          // Skip malformed lines
        }
      }

      // Restore status
      for (const [provider, history] of latestByProvider.entries()) {
        this.providerStatus.set(provider, {
          provider,
          hasCapacity: history.hasCapacity,
          lastCheck: history.timestamp,
          consecutiveFailures: history.failureCount,
          consecutiveSuccesses: history.successCount,
        });

        // If provider was down, resume probing
        if (!history.hasCapacity) {
          await this.scheduleProbe(provider, this.probeIntervalSeconds);
        }
      }

      logInfo("Loaded provider capacity history", {
        providersTracked: latestByProvider.size,
      });
    } catch (error) {
      logError("Failed to load provider capacity history", { error });
    }
  }
}
