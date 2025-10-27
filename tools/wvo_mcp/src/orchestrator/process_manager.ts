/**
 * ProcessManager - Tracks and manages spawned CLI processes
 *
 * Prevents resource exhaustion by:
 * 1. Tracking all spawned process PIDs
 * 2. Enforcing concurrent process limits
 * 3. Monitoring system resources before spawning
 * 4. Killing zombie/orphaned processes
 * 5. Graceful cleanup on shutdown
 */

import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import os from 'node:os';

import { logInfo, logWarning, logError, logDebug } from '../telemetry/logger.js';

export interface ProcessHandle {
  pid: number;
  taskId: string;
  provider: 'codex' | 'claude' | 'shell' | 'system';
  model: string;
  startTime: number;
  kill: () => void;
}

export interface ResourceSnapshot {
  availableMemoryMB: number;
  totalMemoryMB: number;
  memoryUsagePercent: number;
  cpuCount: number;
  loadAverage: number[];
}

export interface ProcessManagerConfig {
  maxConcurrentProcesses: number; // Max CLI processes running simultaneously
  maxMemoryUsagePercent: number; // Don't spawn if memory usage exceeds this (0-100)
  processTimeoutMs: number; // Kill processes running longer than this
  checkIntervalMs: number; // How often to check for zombie processes
}

const DEFAULT_CONFIG: ProcessManagerConfig = {
  maxConcurrentProcesses: 10, // Allow up to 10 concurrent CLI processes (agents + task executions)
  maxMemoryUsagePercent: 80, // Don't spawn if >80% memory used
  processTimeoutMs: 15 * 60 * 1000, // Kill after 15 minutes (safety backstop)
  checkIntervalMs: 30 * 1000, // Check every 30 seconds
};

export class ProcessManager extends EventEmitter {
  private processes: Map<number, ProcessHandle> = new Map();
  private zombieCheckTimer?: NodeJS.Timeout;
  private config: ProcessManagerConfig;
  private shutdownInProgress = false;

  constructor(config: Partial<ProcessManagerConfig> = {}) {
    super();
    this.setMaxListeners(50); // Prevent max listener warnings
    this.config = { ...DEFAULT_CONFIG, ...config };
    logInfo('ProcessManager initialized', {
      maxConcurrentProcesses: this.config.maxConcurrentProcesses,
      maxMemoryUsagePercent: this.config.maxMemoryUsagePercent,
      processTimeoutMs: this.config.processTimeoutMs,
      checkIntervalMs: this.config.checkIntervalMs,
    });
  }

  /**
   * Start background zombie process checker
   */
  start(): void {
    this.zombieCheckTimer = setInterval(() => {
      this.checkForZombies();
    }, this.config.checkIntervalMs);

    logDebug('ProcessManager started', {
      checkInterval: this.config.checkIntervalMs,
    });
  }

  /**
   * Stop and cleanup all processes
   */
  async stop(): Promise<void> {
    this.shutdownInProgress = true;

    if (this.zombieCheckTimer) {
      clearInterval(this.zombieCheckTimer);
      this.zombieCheckTimer = undefined;
    }

    // Kill all tracked processes
    const processCount = this.processes.size;
    if (processCount > 0) {
      logWarning('Killing remaining CLI processes on shutdown', {
        processCount,
        pids: Array.from(this.processes.keys()),
      });

      for (const [pid, handle] of this.processes) {
        try {
          handle.kill();
          logDebug('Killed process on shutdown', { pid, taskId: handle.taskId });
        } catch (error) {
          logWarning('Failed to kill process on shutdown', {
            pid,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.processes.clear();
    }

    logInfo('ProcessManager stopped', { killedProcesses: processCount });
  }

  /**
   * Check system resources before spawning a new process
   * Returns true if safe to spawn, false if resources are constrained
   */
  canSpawnProcess(): boolean {
    // Check concurrent process limit
    if (this.processes.size >= this.config.maxConcurrentProcesses) {
      logWarning('Concurrent process limit reached', {
        current: this.processes.size,
        limit: this.config.maxConcurrentProcesses,
        tasks: Array.from(this.processes.values()).map((h) => h.taskId),
      });
      return false;
    }

    // Check system resources
    const resources = this.getResourceSnapshot();

    if (resources.memoryUsagePercent > this.config.maxMemoryUsagePercent) {
      logWarning('Memory usage too high to spawn process', {
        currentPercent: resources.memoryUsagePercent.toFixed(1),
        limit: this.config.maxMemoryUsagePercent,
        availableMB: resources.availableMemoryMB,
      });
      return false;
    }

    return true;
  }

  /**
   * Register a new spawned process for tracking
   */
  registerProcess(handle: ProcessHandle): void {
    if (this.shutdownInProgress) {
      logWarning('Attempted to register process during shutdown', {
        pid: handle.pid,
        taskId: handle.taskId,
      });
      // Kill immediately since we're shutting down
      try {
        handle.kill();
      } catch {}
      return;
    }

    this.processes.set(handle.pid, handle);

    logDebug('Process registered', {
      pid: handle.pid,
      taskId: handle.taskId,
      provider: handle.provider,
      model: handle.model,
      activeProcesses: this.processes.size,
    });

    this.emit('process:started', handle);
  }

  /**
   * Unregister a process when it completes normally
   */
  unregisterProcess(pid: number): void {
    const handle = this.processes.get(pid);
    if (handle) {
      this.processes.delete(pid);

      const duration = Date.now() - handle.startTime;

      logDebug('Process unregistered', {
        pid,
        taskId: handle.taskId,
        durationMs: duration,
        activeProcesses: this.processes.size,
      });

      this.emit('process:completed', {
        ...handle,
        duration,
      });
    }
  }

  /**
   * Kill a specific process
   */
  killProcess(pid: number, reason: string): void {
    const handle = this.processes.get(pid);
    if (!handle) {
      logWarning('Attempted to kill untracked process', { pid });
      return;
    }

    try {
      handle.kill();
      this.processes.delete(pid);

      logWarning('Process killed', {
        pid,
        taskId: handle.taskId,
        reason,
        provider: handle.provider,
        activeProcesses: this.processes.size,
      });

      this.emit('process:killed', {
        ...handle,
        reason,
      });
    } catch (error) {
      logError('Failed to kill process', {
        pid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current resource snapshot
   */
  getResourceSnapshot(): ResourceSnapshot {
    const totalMem = os.totalmem();
    const availableBytes = this.getAvailableMemoryBytes(totalMem);
    const usedMem = totalMem - availableBytes;
    const memoryUsagePercent = (usedMem / totalMem) * 100;

    return {
      availableMemoryMB: Math.round(availableBytes / 1024 / 1024),
      totalMemoryMB: Math.round(totalMem / 1024 / 1024),
      memoryUsagePercent,
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg(),
    };
  }

  /**
   * Cross-platform approximation of \"available\" memory (accounts for caches on macOS/Linux)
   */
  private getAvailableMemoryBytes(totalMem: number): number {
    try {
      if (process.platform === 'linux') {
        const contents = readFileSync('/proc/meminfo', 'utf8');
        const match = contents.match(/MemAvailable:\s+(\d+)\s+kB/i);
        if (match) {
          const available = Number(match[1]) * 1024;
          if (available > 0) {
            return Math.min(available, totalMem);
          }
        }
      } else if (process.platform === 'darwin') {
        const output = execSync('vm_stat', { encoding: 'utf8' });
        const pageSizeMatch = output.match(/page size of (\d+) bytes/i);
        const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
        const parsePages = (label: string): number => {
          const pageMatch = output.match(new RegExp(`${label}:\\s+(\\d+)\\.`));
          return pageMatch ? Number(pageMatch[1]) : 0;
        };

        const pagesFree = parsePages('Pages free');
        const pagesInactive = parsePages('Pages inactive');
        const pagesSpeculative = parsePages('Pages speculative');
        const availablePages = pagesFree + pagesInactive + pagesSpeculative;

        if (availablePages > 0) {
          const available = availablePages * pageSize;
          return Math.min(available, totalMem);
        }
      }
    } catch (error) {
      logDebug('Failed to sample detailed memory stats', {
        platform: process.platform,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const fallback = os.freemem();
    return Math.min(Math.max(fallback, 0), totalMem);
  }

  /**
   * Get current status
   */
  getStatus(): {
    activeProcesses: number;
    processes: Array<{
      pid: number;
      taskId: string;
      provider: string;
      model: string;
      runtimeMs: number;
    }>;
    resources: ResourceSnapshot;
    canSpawn: boolean;
  } {
    const now = Date.now();
    const resources = this.getResourceSnapshot();

    return {
      activeProcesses: this.processes.size,
      processes: Array.from(this.processes.values()).map((h) => ({
        pid: h.pid,
        taskId: h.taskId,
        provider: h.provider,
        model: h.model,
        runtimeMs: now - h.startTime,
      })),
      resources,
      canSpawn: this.canSpawnProcess(),
    };
  }

  /**
   * Check for zombie/hung processes and kill them
   */
  private checkForZombies(): void {
    const now = Date.now();
    const zombies: number[] = [];

    for (const [pid, handle] of this.processes) {
      const runtime = now - handle.startTime;

      if (runtime > this.config.processTimeoutMs) {
        logWarning('Zombie process detected (timeout exceeded)', {
          pid,
          taskId: handle.taskId,
          runtimeMs: runtime,
          timeoutMs: this.config.processTimeoutMs,
        });

        zombies.push(pid);
      }
    }

    // Kill zombies
    for (const pid of zombies) {
      this.killProcess(pid, 'timeout');
    }

    if (zombies.length > 0) {
      logWarning('Killed zombie processes', { count: zombies.length, pids: zombies });
      this.emit('zombies:killed', { count: zombies.length, pids: zombies });
    }
  }
}
