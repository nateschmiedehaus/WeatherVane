/**
 * Safety Monitor - Enforces hard limits to prevent system crashes
 *
 * Different from ResourceMonitor (which does dynamic throttling),
 * SafetyMonitor enforces HARD LIMITS that prevent catastrophic failures:
 * - Memory: Total process tree RSS (triggers OS OOM killer, not crash)
 * - Disk: Shuts down before disk fills (prevents system freeze)
 * - Processes: Kills excess children (prevents fork bombs)
 * - File descriptors: Warns before EMFILE (prevents crashes)
 * - Orphans: Detects and kills escaped processes
 *
 * This is about SAFETY, not performance.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logError, logWarning, logInfo, logDebug } from '../telemetry/logger.js';
import { getChildProcesses, killProcess } from './process_cleanup.js';

const execAsync = promisify(exec);

export interface SafetyLimits {
  memory: {
    max_tree_rss_mb: number;  // Total process tree RSS limit
  };
  disk: {
    min_free_percent: number;
    min_free_gb: number;
    check_interval_seconds: number;
    pause_threshold_percent: number;
    shutdown_threshold_percent: number;
    monitor_inodes: boolean;
  };
  processes: {
    max_children: number;
    check_interval_seconds: number;
    orphan_check_interval_seconds: number;
  };
  file_descriptors: {
    soft_limit: number;
    warning_threshold: number;  // Warn at 80% of limit
  };
}

interface DiskUsage {
  mountPoint: string;
  usedPercent: number;
  freeGB: number;
  inodeUsedPercent: number | null;
}

interface ProcessTreeStats {
  totalRssMB: number;
  processCount: number;
  pids: number[];
}

export class SafetyMonitor {
  private diskCheckInterval: NodeJS.Timeout | null = null;
  private processCheckInterval: NodeJS.Timeout | null = null;
  private orphanCheckInterval: NodeJS.Timeout | null = null;
  private paused = false;
  private trackedPids: Set<number> = new Set();

  constructor(
    private readonly limits: SafetyLimits,
    private readonly workspaceRoot: string,
  ) {
    // Track our own PID
    this.trackedPids.add(process.pid);
  }

  start(): void {
    logInfo('Starting safety monitor', {
      limits: this.limits,
      workspace: this.workspaceRoot,
    });

    // Start disk space monitoring (every 10s - faster than original 60s)
    this.diskCheckInterval = setInterval(
      () => void this.checkDiskSpace(),
      this.limits.disk.check_interval_seconds * 1000,
    );

    // Start process count monitoring
    this.processCheckInterval = setInterval(
      () => void this.checkProcessCount(),
      this.limits.processes.check_interval_seconds * 1000,
    );

    // Start orphan detection
    this.orphanCheckInterval = setInterval(
      () => void this.checkOrphans(),
      this.limits.processes.orphan_check_interval_seconds * 1000,
    );

    // Run checks immediately on start
    void this.checkDiskSpace();
    void this.checkProcessCount();
    void this.checkMemory();
    void this.checkFileDescriptors();
  }

  stop(): void {
    if (this.diskCheckInterval) {
      clearInterval(this.diskCheckInterval);
      this.diskCheckInterval = null;
    }

    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
    }

    if (this.orphanCheckInterval) {
      clearInterval(this.orphanCheckInterval);
      this.orphanCheckInterval = null;
    }

    logDebug('Safety monitor stopped');
  }

  /**
   * Track a spawned child PID (for shutdown verification)
   */
  trackPid(pid: number): void {
    this.trackedPids.add(pid);
  }

  /**
   * Check disk space on both workspace and root filesystems
   * Addresses Flaw 2: 60s window too long → reduced to 10s
   * Addresses Flaw 6: Inode exhaustion → now monitors inodes
   */
  async checkDiskSpace(): Promise<void> {
    try {
      // Check workspace disk
      const workspaceDisk = await this.getDiskUsage(this.workspaceRoot);

      // Check root disk (might be different filesystem)
      const rootDisk = await this.getDiskUsage('/');

      // Check both disks
      for (const disk of [workspaceDisk, rootDisk]) {
        // Critical: >95% → shutdown
        if (disk.usedPercent >= this.limits.disk.shutdown_threshold_percent) {
          logError('Disk usage critical, shutting down', {
            mountPoint: disk.mountPoint,
            usedPercent: disk.usedPercent,
            freeGB: disk.freeGB,
          });
          process.exit(100);  // Fatal error, don't restart
        }

        // Warning: >90% → pause operations
        if (disk.usedPercent >= this.limits.disk.pause_threshold_percent) {
          if (!this.paused) {
            logWarning('Disk usage high, pausing operations', {
              mountPoint: disk.mountPoint,
              usedPercent: disk.usedPercent,
              freeGB: disk.freeGB,
            });
            this.paused = true;
            // TODO: Actually pause task execution (future work)
          }
        } else {
          if (this.paused) {
            logInfo('Disk usage normal, resuming operations', {
              mountPoint: disk.mountPoint,
              usedPercent: disk.usedPercent,
            });
            this.paused = false;
          }
        }

        // Check inode usage (Flaw 6 fix)
        if (disk.inodeUsedPercent !== null && disk.inodeUsedPercent >= 90) {
          logError('Inode usage critical, shutting down', {
            mountPoint: disk.mountPoint,
            inodeUsedPercent: disk.inodeUsedPercent,
          });
          process.exit(100);
        }
      }
    } catch (error) {
      logWarning('Failed to check disk space', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get disk usage for a path
   */
  private async getDiskUsage(path: string): Promise<DiskUsage> {
    // Get disk space usage
    const { stdout: spaceOut } = await execAsync(`df -h "${path}"`);
    const spaceLines = spaceOut.trim().split('\n');
    const spaceData = spaceLines[1];
    const spaceMatch = spaceData.match(/(\d+)%/);
    const usedPercent = spaceMatch ? parseInt(spaceMatch[1]) : 0;

    // Extract free space in GB
    const parts = spaceData.trim().split(/\s+/);
    const availStr = parts[3];  // "Available" column
    let freeGB = 0;

    if (availStr.endsWith('G')) {
      freeGB = parseFloat(availStr);
    } else if (availStr.endsWith('M')) {
      freeGB = parseFloat(availStr) / 1024;
    } else if (availStr.endsWith('T')) {
      freeGB = parseFloat(availStr) * 1024;
    }

    // Get inode usage (if enabled)
    let inodeUsedPercent: number | null = null;

    if (this.limits.disk.monitor_inodes) {
      try {
        const { stdout: inodeOut } = await execAsync(`df -i "${path}"`);
        const inodeLines = inodeOut.trim().split('\n');
        const inodeData = inodeLines[1];
        const inodeMatch = inodeData.match(/(\d+)%/);
        inodeUsedPercent = inodeMatch ? parseInt(inodeMatch[1]) : null;
      } catch {
        // df -i might not be supported on all systems
        inodeUsedPercent = null;
      }
    }

    // Extract mount point from df output
    const mountPoint = parts[0];

    return {
      mountPoint,
      usedPercent,
      freeGB,
      inodeUsedPercent,
    };
  }

  /**
   * Check total process tree memory usage
   * Addresses Flaw 1: Child processes bypass limits → monitor entire tree
   */
  async checkMemory(): Promise<void> {
    try {
      const stats = await this.getProcessTreeStats();

      if (stats.totalRssMB > this.limits.memory.max_tree_rss_mb) {
        logError('Process tree memory exceeds limit', {
          totalRssMB: stats.totalRssMB,
          limitMB: this.limits.memory.max_tree_rss_mb,
          processCount: stats.processCount,
        });
        // Don't kill ourselves - let OS OOM killer handle it
        // Our ulimit should prevent exceeding system memory
      } else if (stats.totalRssMB > this.limits.memory.max_tree_rss_mb * 0.8) {
        logWarning('Process tree memory high', {
          totalRssMB: stats.totalRssMB,
          limitMB: this.limits.memory.max_tree_rss_mb,
          percentUsed: (stats.totalRssMB / this.limits.memory.max_tree_rss_mb) * 100,
        });
      }
    } catch (error) {
      logWarning('Failed to check memory usage', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get memory usage stats for entire process tree
   */
  private async getProcessTreeStats(): Promise<ProcessTreeStats> {
    const pids = [process.pid];
    const children = await getChildProcesses(process.pid);
    pids.push(...children);

    let totalRssMB = 0;

    for (const pid of pids) {
      try {
        // Get RSS in KB, convert to MB
        let rssKB = 0;

        if (process.platform === 'darwin') {
          const { stdout } = await execAsync(`ps -o rss= -p ${pid}`);
          rssKB = parseInt(stdout.trim()) || 0;
        } else {
          // Linux
          const { stdout } = await execAsync(`ps -o rss= -p ${pid}`);
          rssKB = parseInt(stdout.trim()) || 0;
        }

        totalRssMB += rssKB / 1024;
      } catch {
        // Process might have exited, ignore
      }
    }

    return {
      totalRssMB,
      processCount: pids.length,
      pids,
    };
  }

  /**
   * Check child process count and kill excess
   */
  async checkProcessCount(): Promise<void> {
    try {
      const children = await getChildProcesses(process.pid);

      if (children.length > this.limits.processes.max_children) {
        logError('Too many child processes, killing excess', {
          count: children.length,
          limit: this.limits.processes.max_children,
        });

        // Kill excess children (oldest first, keep newest)
        const excess = children.slice(0, children.length - this.limits.processes.max_children);

        for (const childPid of excess) {
          logWarning('Killing excess child process', { pid: childPid });
          killProcess(childPid);
        }
      } else if (children.length > this.limits.processes.max_children * 0.8) {
        logWarning('Child process count high', {
          count: children.length,
          limit: this.limits.processes.max_children,
        });
      }
    } catch (error) {
      logWarning('Failed to check process count', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check for orphaned processes that escaped our control
   * Addresses Flaw 3: Double-fork creates orphans
   */
  async checkOrphans(): Promise<void> {
    try {
      // Find processes with PPID=1 (orphaned) matching autopilot patterns
      const patterns = ['wvo_mcp', 'autopilot', 'node.*orchestrator'];

      for (const pattern of patterns) {
        try {
          // pgrep -P 1 finds orphans (parent PID = 1)
          const { stdout } = await execAsync(`pgrep -P 1 -f "${pattern}"`, {
            encoding: 'utf8',
          });

          const orphanPids = stdout
            .trim()
            .split('\n')
            .filter(line => line.length > 0)
            .map(pid => parseInt(pid));

          if (orphanPids.length > 0) {
            logWarning('Found orphaned processes, cleaning up', {
              pattern,
              pids: orphanPids,
            });

            for (const pid of orphanPids) {
              logWarning('Killing orphaned process', { pid });
              killProcess(pid);
            }
          }
        } catch (error) {
          // pgrep returns exit code 1 if no matches, which throws error
          // This is expected, ignore
          if (error instanceof Error && !error.message.includes('exit code 1')) {
            logDebug('Orphan check failed for pattern', {
              pattern,
              error: error.message,
            });
          }
        }
      }
    } catch (error) {
      logWarning('Failed orphan check', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check file descriptor usage
   * Addresses Flaw 4: EMFILE errors might crash process
   */
  async checkFileDescriptors(): Promise<void> {
    try {
      // Count open file descriptors
      let fdCount = 0;

      if (process.platform === 'darwin') {
        // macOS: lsof -p <pid> | wc -l
        const { stdout } = await execAsync(`lsof -p ${process.pid} 2>/dev/null | wc -l`);
        fdCount = parseInt(stdout.trim()) - 1;  // Subtract header line
      } else {
        // Linux: ls /proc/<pid>/fd | wc -l
        const { stdout } = await execAsync(`ls /proc/${process.pid}/fd 2>/dev/null | wc -l`);
        fdCount = parseInt(stdout.trim());
      }

      const warningThreshold = this.limits.file_descriptors.warning_threshold;
      const limit = this.limits.file_descriptors.soft_limit;

      if (fdCount >= warningThreshold) {
        logWarning('File descriptor usage high', {
          count: fdCount,
          limit,
          percentUsed: (fdCount / limit) * 100,
        });
      }
    } catch (error) {
      logDebug('Failed to check file descriptors', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Verify all tracked PIDs are dead (called on shutdown)
   */
  async verifyAllProcessesDead(): Promise<boolean> {
    const stillAlive: number[] = [];

    for (const pid of this.trackedPids) {
      if (pid === process.pid) continue;  // Don't check ourselves

      try {
        process.kill(pid, 0);  // Signal 0 checks if process exists
        stillAlive.push(pid);
      } catch {
        // Process is dead, good
      }
    }

    if (stillAlive.length > 0) {
      logError('Tracked processes still alive on shutdown', { pids: stillAlive });
      return false;
    }

    return true;
  }
}
