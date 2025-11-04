import { execa } from 'execa';

import { logInfo, logWarning, logDebug } from '../telemetry/logger.js';

import type { TaskClassification } from './agent_hierarchy.js';
import type { GitStatusSnapshot } from './git_status_monitor.js';
import type { Task } from './state_machine.js';


interface PreflightCommand {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface PreflightResult {
  success: boolean;
  commandId?: string;
  output?: string;
  shouldEscalate?: boolean;
  consecutiveFailures?: number;
}

export class PreflightRunner {
  private lastSignature: string | null = null;
  private lastRunAt = 0;
  private consecutiveFailures = 0;
  private lastFailureFingerprint: string | null = null;
  private readonly maxConsecutiveFailures = 3;

  constructor(
    private readonly workspaceRoot: string,
    private readonly commands: PreflightCommand[] = [
      {
        id: 'ruff',
        command: 'python',
        args: ['-m', 'ruff', 'check', 'apps', 'shared', '--select', 'E,F', '--ignore', 'E501'],
        timeoutMs: 90_000,
      },
      {
        id: 'eslint',
        command: 'npm',
        args: ['run', 'lint', '--prefix', 'apps/web'],
        timeoutMs: 120_000,
      },
      {
        id: 'typecheck',
        command: 'npm',
        args: ['run', 'typecheck', '--prefix', 'apps/web'],
        timeoutMs: 120_000,
      },
    ]
  ) {}

  shouldRun(
    task: Task,
    classification: TaskClassification,
    snapshot: GitStatusSnapshot | null
  ): boolean {
    const eligibleDomain = ['product', 'mcp', 'infrastructure'].includes(classification.domain);
    if (!eligibleDomain) {
      return false;
    }

    const signature = snapshot ? this.signatureForSnapshot(snapshot) : null;

    if (!this.lastSignature) {
      return true;
    }

    if (signature && signature !== this.lastSignature) {
      return true;
    }

    const now = Date.now();
    return now - this.lastRunAt > 30 * 60 * 1000; // 30 minutes
  }

  async run(snapshot: GitStatusSnapshot | null): Promise<PreflightResult> {
    this.lastRunAt = Date.now();
    if (snapshot) {
      this.lastSignature = this.signatureForSnapshot(snapshot);
    }

    for (const command of this.commands) {
      const cwd = command.cwd ?? this.workspaceRoot;
      logDebug('Running pre-flight command', { id: command.id, command: command.command, cwd });

      try {
        await execa(command.command, command.args, {
          cwd,
          timeout: command.timeoutMs ?? 120_000,
          env: process.env,
        });
        logInfo('Pre-flight command succeeded', {
          id: command.id,
        });
      } catch (error: any) {
        const stderr = error?.stderr ?? '';
        const stdout = error?.stdout ?? '';
        const output = [stdout, stderr].filter(Boolean).join('\n').trim();

        // Circuit breaker: track consecutive failures
        const failureFingerprint = `${command.id}:${output.slice(0, 200)}`;
        if (failureFingerprint === this.lastFailureFingerprint) {
          this.consecutiveFailures++;
        } else {
          this.consecutiveFailures = 1;
          this.lastFailureFingerprint = failureFingerprint;
        }

        const shouldEscalate = this.consecutiveFailures >= this.maxConsecutiveFailures;

        logWarning('Pre-flight command failed', {
          id: command.id,
          error: error instanceof Error ? error.message : String(error),
          consecutiveFailures: this.consecutiveFailures,
          shouldEscalate,
        });

        return {
          success: false,
          commandId: command.id,
          output,
          shouldEscalate,
          consecutiveFailures: this.consecutiveFailures,
        };
      }
    }

    // Success: reset failure counter
    this.consecutiveFailures = 0;
    this.lastFailureFingerprint = null;
    return { success: true };
  }

  private signatureForSnapshot(snapshot: GitStatusSnapshot): string {
    return `${snapshot.trackedChanges.join('|')}__${snapshot.untrackedChanges.join('|')}`;
  }
}
