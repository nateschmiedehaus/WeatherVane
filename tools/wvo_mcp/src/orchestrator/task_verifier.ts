/**
 * TaskVerifier - Post-execution verification hooks.
 *
 * These checks exist to make sure the orchestrator cannot falsely declare
 * success when required dependencies (e.g. Shapely/GEOS) are broken or when
 * critical smoke tests fail.  A failing verifier must flip the task outcome
 * back to blocked so the autopilot remains honest.
 */

import path from 'node:path';
import { execa } from 'execa';
import type { Task } from './state_machine.js';
import { logDebug, logError } from '../telemetry/logger.js';

export interface VerificationResult {
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

const MODELING_TASK_PREFIXES = ['T12.', 'T13.5'];

export class TaskVerifier {
  constructor(private readonly workspaceRoot: string) {}

  shouldVerify(task: Task): boolean {
    if (!task?.id) {
      return false;
    }
    return MODELING_TASK_PREFIXES.some((prefix) => task.id.startsWith(prefix));
  }

  async verify(task: Task): Promise<VerificationResult> {
    if (!this.shouldVerify(task)) {
      return { success: true };
    }

    const scriptPath = path.join(this.workspaceRoot, 'scripts', 'check_modeling_env.sh');

    logDebug('Running modeling verification script', {
      taskId: task.id,
      scriptPath,
    });

    try {
      const result = await execa(scriptPath, {
        cwd: this.workspaceRoot,
        reject: false,
        env: {
          ...process.env,
          // Ensure pytest does not attempt to output ANSI codes when run via orchestrator.
          PYTHONUNBUFFERED: '1',
        },
      });

      const success = result.exitCode === 0;
      if (!success) {
        logError('Modeling verification failed', {
          taskId: task.id,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      }

      return {
        success,
        exitCode: result.exitCode ?? undefined,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error: any) {
      logError('Modeling verification crashed', {
        taskId: task.id,
        error: error?.message,
      });
      return {
        success: false,
        exitCode: error?.exitCode,
        stdout: error?.stdout,
        stderr: error?.stderr ?? error?.message,
      };
    }
  }
}
