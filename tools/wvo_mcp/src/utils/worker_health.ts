/**
 * Worker Health Monitor
 * Prevents stdin pipe failures and ensures worker stability
 */

import { logError, logInfo, logWarning } from "../telemetry/logger.js";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface HealthCheckResult {
  healthy: boolean;
  pid: number | null;
  uptime: number;
  lastCheck: Date;
  errors: string[];
}

export class WorkerHealthMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private worker: ChildProcess | null = null;
  private startTime: Date | null = null;
  private errorCount = 0;
  private lastErrors: string[] = [];
  private maxErrors = 5;
  private checkIntervalMs = 10000; // 10 seconds

  constructor(
    private workspaceRoot: string,
    private onUnhealthy?: (result: HealthCheckResult) => void
  ) {}

  startMonitoring(worker: ChildProcess) {
    this.worker = worker;
    this.startTime = new Date();
    this.errorCount = 0;
    this.lastErrors = [];

    // Monitor worker process
    this.worker.on("error", (err) => {
      this.recordError(`Worker error: ${err.message}`);
    });

    this.worker.on("exit", (code, signal) => {
      this.recordError(`Worker exited with code ${code}, signal ${signal}`);
      this.stopMonitoring();
    });

    // Monitor stdin pipe health
    this.worker.stdin?.on("error", (err) => {
      this.recordError(`Stdin pipe error: ${err.message}`);
    });

    this.worker.stdout?.on("error", (err) => {
      this.recordError(`Stdout pipe error: ${err.message}`);
    });

    this.worker.stderr?.on("error", (err) => {
      this.recordError(`Stderr pipe error: ${err.message}`);
    });

    // Periodic health checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.checkIntervalMs);

    logInfo("Worker health monitoring started", { pid: worker.pid });
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logInfo("Worker health monitoring stopped");
  }

  private recordError(error: string) {
    this.errorCount++;
    this.lastErrors.push(error);
    if (this.lastErrors.length > this.maxErrors) {
      this.lastErrors.shift();
    }

    logError("Worker health issue detected", { error, errorCount: this.errorCount });

    if (this.errorCount >= this.maxErrors) {
      logError("Worker unhealthy - max errors reached", {
        errors: this.lastErrors,
      });
      this.triggerUnhealthy();
    }
  }

  private performHealthCheck(): void {
    if (!this.worker || !this.worker.pid) {
      this.recordError("Worker process not found");
      return;
    }

    try {
      // Check if process is alive
      process.kill(this.worker.pid, 0);

      // Check stdin pipe is writable
      if (this.worker.stdin && !this.worker.stdin.writable) {
        this.recordError("Stdin pipe not writable");
      }

      // Reset error count on successful check
      if (this.errorCount > 0) {
        logInfo("Worker health check passed", { pid: this.worker.pid });
        this.errorCount = Math.max(0, this.errorCount - 1);
      }
    } catch (err) {
      this.recordError(`Process not alive: ${err}`);
    }
  }

  private triggerUnhealthy(): void {
    const result: HealthCheckResult = {
      healthy: false,
      pid: this.worker?.pid || null,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      lastCheck: new Date(),
      errors: [...this.lastErrors],
    };

    if (this.onUnhealthy) {
      this.onUnhealthy(result);
    }
  }

  getStatus(): HealthCheckResult {
    return {
      healthy: this.errorCount < this.maxErrors,
      pid: this.worker?.pid || null,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      lastCheck: new Date(),
      errors: [...this.lastErrors],
    };
  }
}

/**
 * Autopilot Lock Manager
 * Prevents multiple concurrent autopilot instances
 */
export class AutopilotLockManager {
  private lockFile: string;

  constructor(workspaceRoot: string) {
    this.lockFile = path.join(workspaceRoot, "state", "autopilot.lock");
  }

  async acquire(): Promise<boolean> {
    try {
      // Check if lock exists and is still valid
      if (fs.existsSync(this.lockFile)) {
        const lockData = JSON.parse(fs.readFileSync(this.lockFile, "utf-8"));
        const pid = lockData.pid;

        // Check if process is still running
        try {
          process.kill(pid, 0);
          logWarning("Autopilot already running", { pid });
          return false;
        } catch {
          // Process dead, stale lock
          logInfo("Removing stale autopilot lock", { pid });
          fs.unlinkSync(this.lockFile);
        }
      }

      // Acquire lock
      const lockData = {
        pid: process.pid,
        started: new Date().toISOString(),
        hostname: require("os").hostname(),
      };
      fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2));
      logInfo("Autopilot lock acquired", { pid: process.pid });
      return true;
    } catch (err) {
      logError("Failed to acquire autopilot lock", { error: String(err) });
      return false;
    }
  }

  release(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
        logInfo("Autopilot lock released");
      }
    } catch (err) {
      logError("Failed to release autopilot lock", { error: String(err) });
    }
  }

  cleanup(): void {
    this.release();
  }
}
