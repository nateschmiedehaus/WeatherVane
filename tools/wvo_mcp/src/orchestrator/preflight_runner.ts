import { execa } from 'execa';
import type { Task } from './state_machine.js';
import type { TaskClassification } from './agent_hierarchy.js';
import type { GitStatusSnapshot } from './git_status_monitor.js';
import { logInfo, logWarning, logDebug } from '../telemetry/logger.js';

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
}

export class PreflightRunner {
  private lastSignature: string | null = null;
  private lastRunAt = 0;

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
        logWarning('Pre-flight command failed', {
          id: command.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          commandId: command.id,
          output,
        };
      }
    }

    return { success: true };
  }

  private signatureForSnapshot(snapshot: GitStatusSnapshot): string {
    return `${snapshot.trackedChanges.join('|')}__${snapshot.untrackedChanges.join('|')}`;
  }
}
