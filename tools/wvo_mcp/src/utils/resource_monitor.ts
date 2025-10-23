/**
 * Resource Monitor - Dynamic throttling based on system resources
 *
 * Monitors CPU, memory, and process counts to automatically adjust
 * concurrency and workload intensity.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface ResourceMetrics {
  timestamp: string;
  memory_used_pct: number;
  cpu_used_pct: number;
  claude_processes: number;
  node_processes: number;
  throttle_level: number;
  throttle_params: ThrottleParams;
}

export interface ThrottleParams {
  level: number;
  name: "normal" | "light" | "medium" | "heavy";
  max_agents: number;
  batch_size: number;
  delay_ms: number;
  max_concurrent: number;
  reasoning_effort: "low" | "medium" | "high";
}

export class ResourceMonitor {
  private workspaceRoot: string;
  private throttleScript: string;
  private metricsFile: string;
  private lastCheck: number = 0;
  private checkInterval: number = 30000; // 30 seconds
  private cachedMetrics: ResourceMetrics | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.throttleScript = path.join(
      workspaceRoot,
      "tools/wvo_mcp/scripts/dynamic_throttle.sh"
    );
    this.metricsFile = path.join(
      workspaceRoot,
      "state/analytics/resource_metrics.json"
    );
  }

  /**
   * Get current resource metrics and throttle parameters
   */
  async getMetrics(force: boolean = false): Promise<ResourceMetrics> {
    const now = Date.now();

    // Use cached metrics if available and recent
    if (
      !force &&
      this.cachedMetrics &&
      now - this.lastCheck < this.checkInterval
    ) {
      return this.cachedMetrics;
    }

    // Run throttle script
    try {
      const output = execSync(`bash "${this.throttleScript}"`, {
        encoding: "utf-8",
        env: { ...process.env, QUIET: "1" },
        timeout: 5000,
      });

      const metrics: ResourceMetrics = JSON.parse(output);
      this.cachedMetrics = metrics;
      this.lastCheck = now;

      return metrics;
    } catch (error) {
      // Fallback to reading metrics file if script fails
      if (fs.existsSync(this.metricsFile)) {
        const content = fs.readFileSync(this.metricsFile, "utf-8");
        return JSON.parse(content);
      }

      // Ultimate fallback: no throttle
      return {
        timestamp: new Date().toISOString(),
        memory_used_pct: 50,
        cpu_used_pct: 50,
        claude_processes: 1,
        node_processes: 1,
        throttle_level: 0,
        throttle_params: {
          level: 0,
          name: "normal",
          max_agents: 5,
          batch_size: 100,
          delay_ms: 0,
          max_concurrent: 3,
          reasoning_effort: "high",
        },
      };
    }
  }

  /**
   * Get current throttle level (0-3)
   */
  async getThrottleLevel(): Promise<number> {
    const metrics = await this.getMetrics();
    return metrics.throttle_level;
  }

  /**
   * Get current throttle parameters
   */
  async getThrottleParams(): Promise<ThrottleParams> {
    const metrics = await this.getMetrics();
    return metrics.throttle_params;
  }

  /**
   * Check if system is under pressure
   */
  async isUnderPressure(): Promise<boolean> {
    const level = await this.getThrottleLevel();
    return level >= 2; // Medium or heavy throttle
  }

  /**
   * Get recommended agent count based on current resources
   */
  async getRecommendedAgentCount(): Promise<number> {
    const params = await this.getThrottleParams();
    return params.max_agents;
  }

  /**
   * Get recommended delay between operations (ms)
   */
  async getRecommendedDelay(): Promise<number> {
    const params = await this.getThrottleParams();
    return params.delay_ms;
  }

  /**
   * Apply delay if throttling is active
   */
  async applyThrottle(): Promise<void> {
    const delay = await this.getRecommendedDelay();
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Get human-readable status message
   */
  async getStatusMessage(): Promise<string> {
    const metrics = await this.getMetrics();
    const { throttle_params, memory_used_pct, cpu_used_pct } = metrics;

    const status =
      throttle_params.level === 0
        ? "✓ System resources normal"
        : throttle_params.level === 1
          ? "⚡ Light throttling active"
          : throttle_params.level === 2
            ? "⚠️  Medium throttling active"
            : "🔥 Heavy throttling active";

    return `${status} (Memory: ${memory_used_pct}%, CPU: ${cpu_used_pct}%, Agents: ${throttle_params.max_agents})`;
  }

  /**
   * Wait until resource pressure decreases
   */
  async waitForResources(
    maxWaitMs: number = 60000,
    targetLevel: number = 1
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const level = await this.getThrottleLevel();
      if (level <= targetLevel) {
        return true;
      }

      // Check every 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));
      // Force refresh metrics
      await this.getMetrics(true);
    }

    return false;
  }

  /**
   * Log current resource status
   */
  async logStatus(): Promise<void> {
    const message = await this.getStatusMessage();
    console.log(message);
  }
}
