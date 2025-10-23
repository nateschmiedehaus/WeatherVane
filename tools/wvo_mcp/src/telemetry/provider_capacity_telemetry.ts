/**
 * Provider Capacity Telemetry - Track and analyze provider failover and recovery
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { logDebug, logError } from "./logger.js";
import type { Provider } from "../utils/provider_manager.js";

export interface ProviderCapacityEvent {
  timestamp: string;
  eventType: "limit_hit" | "recovered" | "failover" | "probe_success" | "probe_failure";
  provider: Provider;
  metadata: {
    tokensRemaining?: number;
    estimatedRecoveryMinutes?: number;
    downDurationMs?: number;
    fromProvider?: Provider;
    toProvider?: Provider;
    reason?: string;
    taskName?: string;
  };
}

export interface ProviderCapacityMetrics {
  provider: Provider;
  totalLimitHits: number;
  totalRecoveries: number;
  totalFailovers: number;
  averageDowntimeMs: number;
  longestDowntimeMs: number;
  shortestDowntimeMs: number;
  lastLimitHit?: string;
  lastRecovery?: string;
  currentStatus: "healthy" | "degraded" | "down";
}

export class ProviderCapacityTelemetry {
  private readonly workspaceRoot: string;
  private readonly eventsPath: string;
  private readonly metricsPath: string;
  private metrics: Map<Provider, ProviderCapacityMetrics> = new Map();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    const analyticsDir = path.join(workspaceRoot, "state", "analytics");
    this.eventsPath = path.join(analyticsDir, "provider_capacity_events.jsonl");
    this.metricsPath = path.join(analyticsDir, "provider_capacity_metrics.json");
  }

  /**
   * Record a provider capacity event
   */
  async recordEvent(
    eventType: ProviderCapacityEvent["eventType"],
    provider: Provider,
    metadata: ProviderCapacityEvent["metadata"] = {}
  ): Promise<void> {
    const event: ProviderCapacityEvent = {
      timestamp: new Date().toISOString(),
      eventType,
      provider,
      metadata,
    };

    try {
      const dir = path.dirname(this.eventsPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      // Append to JSONL
      await writeFile(this.eventsPath, JSON.stringify(event) + "\n", { flag: "a" });

      // Update metrics
      await this.updateMetrics(event);

      logDebug("Provider capacity event recorded", {
        eventType,
        provider,
        metadata,
      });
    } catch (error) {
      logError("Failed to record provider capacity event", { error, event });
    }
  }

  /**
   * Update metrics based on event
   */
  private async updateMetrics(event: ProviderCapacityEvent): Promise<void> {
    const provider = event.provider;
    const metrics = this.metrics.get(provider) ?? this.createDefaultMetrics(provider);

    switch (event.eventType) {
      case "limit_hit":
        metrics.totalLimitHits += 1;
        metrics.lastLimitHit = event.timestamp;
        metrics.currentStatus = "down";
        break;

      case "recovered": {
        metrics.totalRecoveries += 1;
        metrics.lastRecovery = event.timestamp;
        metrics.currentStatus = "healthy";

        // Update downtime stats
        const downtime = event.metadata.downDurationMs ?? 0;
        if (downtime > 0) {
          if (metrics.longestDowntimeMs === 0) {
            metrics.longestDowntimeMs = downtime;
            metrics.shortestDowntimeMs = downtime;
          } else {
            metrics.longestDowntimeMs = Math.max(metrics.longestDowntimeMs, downtime);
            metrics.shortestDowntimeMs = Math.min(metrics.shortestDowntimeMs, downtime);
          }

          // Update average
          const totalRecoveries = metrics.totalRecoveries;
          metrics.averageDowntimeMs =
            (metrics.averageDowntimeMs * (totalRecoveries - 1) + downtime) / totalRecoveries;
        }
        break;
      }

      case "failover":
        metrics.totalFailovers += 1;
        metrics.currentStatus = "degraded";
        break;

      case "probe_success":
        if (metrics.currentStatus === "down") {
          metrics.currentStatus = "degraded"; // Probing suggests recovery imminent
        }
        break;

      case "probe_failure":
        // No change to metrics
        break;
    }

    this.metrics.set(provider, metrics);

    // Save metrics
    await this.saveMetrics();
  }

  /**
   * Create default metrics for a provider
   */
  private createDefaultMetrics(provider: Provider): ProviderCapacityMetrics {
    return {
      provider,
      totalLimitHits: 0,
      totalRecoveries: 0,
      totalFailovers: 0,
      averageDowntimeMs: 0,
      longestDowntimeMs: 0,
      shortestDowntimeMs: 0,
      currentStatus: "healthy",
    };
  }

  /**
   * Get metrics for all providers
   */
  getMetrics(): ProviderCapacityMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metrics for specific provider
   */
  getProviderMetrics(provider: Provider): ProviderCapacityMetrics | undefined {
    return this.metrics.get(provider);
  }

  /**
   * Save metrics to disk
   */
  private async saveMetrics(): Promise<void> {
    try {
      const dir = path.dirname(this.metricsPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      const data = {
        lastUpdated: new Date().toISOString(),
        providers: Array.from(this.metrics.values()),
      };

      await writeFile(this.metricsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      logError("Failed to save provider capacity metrics", { error });
    }
  }

  /**
   * Load metrics from disk
   */
  async loadMetrics(): Promise<void> {
    try {
      if (!existsSync(this.metricsPath)) {
        logDebug("No provider capacity metrics found");
        return;
      }

      const content = await readFile(this.metricsPath, "utf-8");
      const data = JSON.parse(content) as {
        lastUpdated: string;
        providers: ProviderCapacityMetrics[];
      };

      for (const metrics of data.providers) {
        this.metrics.set(metrics.provider, metrics);
      }

      logDebug("Loaded provider capacity metrics", {
        providersTracked: this.metrics.size,
        lastUpdated: data.lastUpdated,
      });
    } catch (error) {
      logError("Failed to load provider capacity metrics", { error });
    }
  }

  /**
   * Generate human-readable summary
   */
  generateSummary(): string {
    const allMetrics = this.getMetrics();

    if (allMetrics.length === 0) {
      return "No provider capacity data available";
    }

    const lines: string[] = ["# Provider Capacity Summary", ""];

    for (const metrics of allMetrics) {
      lines.push(`## ${metrics.provider}`);
      lines.push(`Status: ${metrics.currentStatus}`);
      lines.push(`Total Limit Hits: ${metrics.totalLimitHits}`);
      lines.push(`Total Recoveries: ${metrics.totalRecoveries}`);
      lines.push(`Total Failovers: ${metrics.totalFailovers}`);

      if (metrics.totalRecoveries > 0) {
        const avgMinutes = (metrics.averageDowntimeMs / (1000 * 60)).toFixed(1);
        const maxMinutes = (metrics.longestDowntimeMs / (1000 * 60)).toFixed(1);
        const minMinutes = (metrics.shortestDowntimeMs / (1000 * 60)).toFixed(1);

        lines.push(`Average Downtime: ${avgMinutes} minutes`);
        lines.push(`Longest Downtime: ${maxMinutes} minutes`);
        lines.push(`Shortest Downtime: ${minMinutes} minutes`);
      }

      if (metrics.lastLimitHit) {
        lines.push(`Last Limit Hit: ${metrics.lastLimitHit}`);
      }

      if (metrics.lastRecovery) {
        lines.push(`Last Recovery: ${metrics.lastRecovery}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }
}
