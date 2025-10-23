/**
 * RoadmapPoller - Continuously sync roadmap.yaml changes during runtime
 *
 * Enables dynamic task discovery without requiring orchestrator restart.
 * Polls roadmap.yaml file for changes and triggers incremental sync.
 *
 * Pattern: Event-driven coordination (Spotify/Linear model)
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { syncRoadmapFile } from './roadmap_adapter.js';
import type { StateMachine } from './state_machine.js';
import { logInfo, logDebug, logError, logWarning } from '../telemetry/logger.js';

export interface RoadmapUpdateEvent {
  newTasks: number;
  totalPending: number;
  timestamp: number;
}

/**
 * Polls roadmap.yaml for changes and triggers sync
 *
 * Usage:
 *   const poller = new RoadmapPoller(stateMachine, workspaceRoot);
 *   poller.on('roadmap_updated', (event) => handleUpdate(event));
 *   poller.start();
 */
export class RoadmapPoller extends EventEmitter {
  private intervalId?: NodeJS.Timeout;
  private lastMtime: number = 0;
  private lastSyncTime: number = 0;
  private syncInProgress: boolean = false;
  private currentSync?: Promise<void>;
  private stopped = false;
  private readonly roadmapPath: string;

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly workspaceRoot: string,
    private readonly intervalMs: number = 10000 // 10 seconds default
  ) {
    super();
    this.roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');
  }

  /**
   * Start polling for roadmap changes
   */
  start(): void {
    if (this.intervalId) {
      logWarning('RoadmapPoller already started');
      return;
    }

    logInfo('RoadmapPoller started', {
      path: this.roadmapPath,
      intervalMs: this.intervalMs
    });

    this.stopped = false;

    // Immediate check
    this.checkForChanges().catch(err => {
      if (!this.stopped) {
        logError('Initial roadmap check failed', { error: err.message });
      }
    });

    // Then periodic checks
    this.intervalId = setInterval(() => {
      this.checkForChanges().catch(err => {
        if (!this.stopped) {
          logError('Roadmap check failed', { error: err.message });
        }
      });
    }, this.intervalMs);
  }

  /**
   * Stop polling
   */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logInfo('RoadmapPoller stopped');
    }

    if (this.syncInProgress && this.currentSync) {
      try {
        await this.currentSync;
      } catch {
        // Swallow errors during shutdown; they were already logged.
      }
    }
  }

  /**
   * Force an immediate sync check
   */
  async forceSyncCheck(): Promise<void> {
    if (this.stopped) {
      return;
    }
    await this.checkForChanges();
  }

  /**
   * Check if roadmap.yaml has been modified since last sync
   */
  private async checkForChanges(): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (this.syncInProgress) {
      logDebug('Sync already in progress, skipping check');
      return;
    }

    try {
      const stats = await fs.stat(this.roadmapPath);

      if (this.stopped) {
        return;
      }

      // Check if file has been modified
      if (stats.mtimeMs > this.lastMtime) {
        const timeSinceLastSync = Date.now() - this.lastSyncTime;

        logDebug('Roadmap file modified', {
          lastMtime: this.lastMtime,
          currentMtime: stats.mtimeMs,
          timeSinceLastSync
        });

        this.lastMtime = stats.mtimeMs;
        await this.performSync();
      }
    } catch (error) {
      // File might not exist yet or permission issues
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (!this.stopped) {
          logDebug('Roadmap file not found, will retry');
        }
      } else if (!this.stopped) {
        logError('Failed to stat roadmap file', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Perform incremental sync of roadmap to database
   */
  private async performSync(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.syncInProgress = true;
    const startTime = Date.now();

    const syncTask = (async () => {
      if (this.stopped) {
        return;
      }

      const beforeCount = this.stateMachine.getTasks({ status: ['pending'] }).length;

      logDebug('Starting roadmap sync', { pendingBefore: beforeCount });

      await syncRoadmapFile(this.stateMachine, this.workspaceRoot);

      const afterCount = this.stateMachine.getTasks({ status: ['pending'] }).length;
      const delta = afterCount - beforeCount;

      logInfo('Roadmap synced from file change', {
        pendingTasks: afterCount,
        newTasks: delta,
        syncDuration: Date.now() - startTime
      });

      this.lastSyncTime = Date.now();

      // Emit event if tasks changed
      if (delta !== 0) {
        const event: RoadmapUpdateEvent = {
          newTasks: delta,
          totalPending: afterCount,
          timestamp: Date.now()
        };

        this.emit('roadmap_updated', event);
      }
    })().catch(error => {
      if (!this.stopped) {
        logError('Roadmap sync failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }).finally(() => {
      this.syncInProgress = false;
      if (this.currentSync === syncTask) {
        this.currentSync = undefined;
      }
    });

    this.currentSync = syncTask;
    await syncTask;
  }

  /**
   * Get current polling status
   */
  getStatus(): {
    running: boolean;
    lastMtime: number;
    lastSyncTime: number;
    syncInProgress: boolean;
  } {
    return {
      running: this.intervalId !== undefined,
      lastMtime: this.lastMtime,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress
    };
  }
}
