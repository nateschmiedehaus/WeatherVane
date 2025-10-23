/**
 * GitStatusMonitor - Tracks repository cleanliness during autonomous runs.
 *
 * Provides:
 *  - Snapshot summaries for prompts so agents know what files changed.
 *  - Telemetry logging to state/analytics/git_status.jsonl.
 *  - Dirty-worktree alerts that can feed policy escalations.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execa } from 'execa';
import { logInfo, logWarning, logDebug } from '../telemetry/logger.js';

export interface GitStatusSnapshot {
  timestamp: string;
  isClean: boolean;
  trackedChanges: string[];
  untrackedChanges: string[];
}

export class GitStatusMonitor {
  private readonly skipPattern: string | null;
  private lastSnapshot: GitStatusSnapshot | null = null;
  private readonly telemetryPath: string;

  constructor(
    private readonly workspaceRoot: string,
    skipPattern: string | null = '.clean_worktree'
  ) {
    this.skipPattern = skipPattern;
    this.telemetryPath = path.join(workspaceRoot, 'state', 'analytics', 'git_status.jsonl');
  }

  async initialize(): Promise<void> {
    try {
      const snapshot = await this.captureSnapshot();
      this.lastSnapshot = snapshot;
      await this.appendTelemetry(snapshot, 'startup');
      logInfo('GitStatusMonitor initialized', {
        isClean: snapshot.isClean,
        tracked: snapshot.trackedChanges.length,
        untracked: snapshot.untrackedChanges.length,
      });
    } catch (error) {
      logWarning('Failed to initialize GitStatusMonitor', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async check(tag: string): Promise<GitStatusSnapshot | null> {
    try {
      const snapshot = await this.captureSnapshot();
      this.lastSnapshot = snapshot;
      await this.appendTelemetry(snapshot, tag);
      return snapshot;
    } catch (error) {
      logWarning('Failed to capture git status snapshot', {
        tag,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  getLastSnapshot(): GitStatusSnapshot | null {
    return this.lastSnapshot;
  }

  buildPromptSection(snapshot?: GitStatusSnapshot | null): string {
    const data = snapshot ?? this.lastSnapshot;
    if (!data) {
      return '';
    }

    if (data.isClean) {
      return '## Git Status\n- Working tree clean.';
    }

    const lines: string[] = ['## Git Status', '- Working tree DIRTY:'];

    if (data.trackedChanges.length > 0) {
      lines.push('  - Tracked changes:');
      for (const change of data.trackedChanges.slice(0, 8)) {
        lines.push(`    • ${change}`);
      }
      if (data.trackedChanges.length > 8) {
        lines.push(`    • … ${data.trackedChanges.length - 8} more`);
      }
    }

    if (data.untrackedChanges.length > 0) {
      lines.push('  - Untracked files:');
      for (const file of data.untrackedChanges.slice(0, 5)) {
        lines.push(`    • ${file}`);
      }
      if (data.untrackedChanges.length > 5) {
        lines.push(`    • … ${data.untrackedChanges.length - 5} more`);
      }
    }

    return lines.join('\n');
  }

  private async captureSnapshot(): Promise<GitStatusSnapshot> {
    const timestamp = new Date().toISOString();

    const { stdout } = await execa('git', ['status', '--short'], {
      cwd: this.workspaceRoot,
    });

    const lines = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const trackedChanges: string[] = [];
    const untrackedChanges: string[] = [];

    for (const line of lines) {
      if (this.skipPattern && line.includes(this.skipPattern)) {
        continue;
      }

      if (line.startsWith('??')) {
        untrackedChanges.push(line.substring(3));
      } else {
        trackedChanges.push(line);
      }
    }

    const snapshot: GitStatusSnapshot = {
      timestamp,
      isClean: trackedChanges.length === 0 && untrackedChanges.length === 0,
      trackedChanges,
      untrackedChanges,
    };

    logDebug('GitStatusMonitor snapshot', {
      timestamp,
      tracked: trackedChanges.length,
      untracked: untrackedChanges.length,
    });

    return snapshot;
  }

  private async appendTelemetry(snapshot: GitStatusSnapshot, tag: string): Promise<void> {
    const record = {
      tag,
      ...snapshot,
    };

    try {
      await fs.mkdir(path.dirname(this.telemetryPath), { recursive: true });
      await fs.appendFile(this.telemetryPath, `${JSON.stringify(record)}\n`, 'utf-8');
    } catch (error) {
      logWarning('Failed to append git status telemetry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
