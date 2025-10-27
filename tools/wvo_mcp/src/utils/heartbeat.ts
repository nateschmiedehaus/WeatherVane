/**
 * Heartbeat Writer - Periodic health signal for supervisor monitoring
 *
 * Writes timestamp to file every interval so supervisor can detect stuck/hung processes
 * Handles write errors gracefully (logs warning, doesn't crash)
 */

import fs from 'node:fs';
import path from 'node:path';
import { logWarning, logDebug } from '../telemetry/logger.js';

export interface HeartbeatConfig {
  path: string;
  intervalMs: number;
}

export class HeartbeatWriter {
  private interval: NodeJS.Timeout | null = null;
  private writeCount = 0;
  private errorCount = 0;

  constructor(
    private readonly heartbeatPath: string,
    private readonly intervalMs: number = 30000,
  ) {}

  start(): void {
    if (this.interval) {
      logWarning('Heartbeat already started', { path: this.heartbeatPath });
      return;
    }

    // Ensure directory exists
    try {
      const dir = path.dirname(this.heartbeatPath);
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      logWarning('Failed to create heartbeat directory', {
        path: this.heartbeatPath,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue anyway - maybe directory exists
    }

    // Write immediately, then on interval
    this.writeHeartbeat();

    this.interval = setInterval(() => {
      this.writeHeartbeat();
    }, this.intervalMs);

    logDebug('Heartbeat writer started', {
      path: this.heartbeatPath,
      intervalMs: this.intervalMs,
    });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;

      logDebug('Heartbeat writer stopped', {
        writeCount: this.writeCount,
        errorCount: this.errorCount,
      });
    }
  }

  private writeHeartbeat(): void {
    try {
      const timestamp = new Date().toISOString();
      fs.writeFileSync(this.heartbeatPath, timestamp, 'utf8');
      this.writeCount++;

      if (this.writeCount % 10 === 0) {
        // Log every 10 writes (every 5 min if 30s interval)
        logDebug('Heartbeat alive', {
          count: this.writeCount,
          errors: this.errorCount,
        });
      }
    } catch (error) {
      this.errorCount++;

      // Log error but don't crash - supervisor will detect stale heartbeat
      logWarning('Failed to write heartbeat', {
        path: this.heartbeatPath,
        error: error instanceof Error ? error.message : String(error),
        errorCount: this.errorCount,
      });

      // If too many errors, something is seriously wrong
      if (this.errorCount > 10) {
        logWarning('Too many heartbeat errors, stopping writer', {
          errorCount: this.errorCount,
        });
        this.stop();
      }
    }
  }

  /**
   * Check if heartbeat is fresh (for testing/debugging)
   */
  static isHeartbeatFresh(heartbeatPath: string, maxAgeSeconds: number): boolean {
    try {
      const timestamp = fs.readFileSync(heartbeatPath, 'utf8').trim();
      const heartbeatTime = new Date(timestamp).getTime();
      const now = Date.now();
      const ageSeconds = (now - heartbeatTime) / 1000;

      return ageSeconds <= maxAgeSeconds;
    } catch {
      return false;  // No heartbeat or invalid format
    }
  }

  /**
   * Get heartbeat age in seconds (for testing/debugging)
   */
  static getHeartbeatAge(heartbeatPath: string): number | null {
    try {
      const timestamp = fs.readFileSync(heartbeatPath, 'utf8').trim();
      const heartbeatTime = new Date(timestamp).getTime();
      const now = Date.now();

      return (now - heartbeatTime) / 1000;
    } catch {
      return null;  // No heartbeat or invalid format
    }
  }
}
