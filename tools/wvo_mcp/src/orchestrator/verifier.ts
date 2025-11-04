import { execSync } from 'node:child_process';

import { execa, type ExecaChildProcess } from 'execa';

import { logInfo, logWarning } from '../telemetry/logger.js';

import type { ProcessManager, ProcessHandle } from './process_manager.js';
import type { TaskEnvelope } from './task_envelope.js';
import type { ChangedFile } from './verify_integrity.js';
import { verifyIntegrity } from './verify_integrity.js';

export interface GateResult {
  name: string;
  success: boolean;
  output: string;
}

export interface ToolRunResult {
  success: boolean;
  output: string;
}

export interface ToolRunner {
  run(toolName: string, input: Record<string, unknown>): Promise<ToolRunResult>;
}

export interface ShellToolRunnerOptions {
  workspaceRoot: string;
  commands: Record<string, string>;
  processManager?: ProcessManager;
}

export class ShellToolRunner implements ToolRunner {
  constructor(private readonly options: ShellToolRunnerOptions) {}

  async run(toolName: string, input: Record<string, unknown>): Promise<ToolRunResult> {
    const command = this.options.commands[toolName];
    if (!command) {
      return {
        success: false,
        output: `No command configured for gate ${toolName}`,
      };
    }
    const taskId = typeof input.taskId === 'string' ? input.taskId : 'unknown';
    const processManager = this.options.processManager;
    const useProcessGroup = Boolean(processManager) && process.platform !== 'win32';
    let processHandle: ProcessHandle | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let subprocess: ExecaChildProcess | undefined;

    const registerProcess = () => {
      if (!processManager || !subprocess?.pid) {
        return;
      }

      const pid = subprocess.pid;
      const killProcess = () => {
        try {
          subprocess?.kill('SIGTERM', { forceKillAfterTimeout: 5000 });
        } catch {}

        if (process.platform === 'win32') {
          try {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
          } catch (error) {
            logWarning('Failed to terminate gate command on Windows', {
              pid,
              toolName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }

        if (useProcessGroup) {
          try {
            process.kill(-pid, 'SIGTERM');
          } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code !== 'ESRCH') {
              logWarning('Failed to signal gate process group', {
                pid,
                toolName,
                error: err.message,
              });
            }
          }

          killTimer = setTimeout(() => {
            try {
              process.kill(-pid, 'SIGKILL');
            } catch (error) {
              const err = error as NodeJS.ErrnoException;
              if (err.code !== 'ESRCH') {
                logWarning('Failed to force kill gate process group', {
                  pid,
                  toolName,
                  error: err.message,
                });
              }
            }
          }, 5000);
        }
      };

      processHandle = {
        pid,
        taskId,
        provider: 'shell',
        model: `gate:${toolName}`,
        startTime: Date.now(),
        kill: killProcess,
      };

      processManager.registerProcess(processHandle);
    };

    try {
      subprocess = execa(command, {
        cwd: this.options.workspaceRoot,
        shell: true,
        detached: useProcessGroup,
        env: {
          ...process.env,
          TASK_ID: taskId !== 'unknown' ? taskId : undefined,
        },
      });

      registerProcess();

      const { stdout, stderr } = await subprocess;
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      return {
        success: true,
        output: output || `${toolName} succeeded`,
      };
    } catch (error) {
      const err = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
      const stdout = typeof err.stdout === 'string' ? err.stdout : '';
      const stderr = typeof err.stderr === 'string' ? err.stderr : '';
      const message = typeof err.message === 'string' ? err.message : String(error);
      const combined = [stdout, stderr || message].filter(Boolean).join('\n');
      return {
        success: false,
        output: combined.trim(),
      };
    } finally {
      if (killTimer) {
        clearTimeout(killTimer);
      }
      if (processManager && processHandle) {
        processManager.unregisterProcess(processHandle.pid);
      }
    }
  }
}

export interface VerifierInput {
  task: TaskEnvelope;
  patchHash: string;
  coverageHint?: number;
  coverageTarget?: number;
  changedFiles?: ChangedFile[];
  changedLinesCoverage?: number;
  touchedFilesDelta?: number;
  failingProofProvided?: boolean;
  mutationSmokeEnabled?: boolean;
}

export interface VerifierResult {
  success: boolean;
  coverageDelta: number;
  coverageTarget: number;
  gateResults: GateResult[];
  artifacts: Record<string, unknown>;
}

const REQUIRED_GATES = ['tests.run', 'lint.run', 'typecheck.run', 'security.scan', 'license.check'];

export class Verifier {
  private readonly toolRunner: ToolRunner;

  constructor(private readonly coverageThreshold: number = 0.05, toolRunner?: ToolRunner) {
    this.toolRunner = toolRunner ?? new ShellToolRunner({ workspaceRoot: process.cwd(), commands: {} });
  }

  getCoverageThreshold(): number {
    return this.coverageThreshold;
  }

  async verify(input: VerifierInput): Promise<VerifierResult> {
    const gateResults = await this.runRequiredGates(input.task.id);
    const gatesPassed = gateResults.every((result) => result.success);
    const coverageTarget = input.coverageTarget ?? this.coverageThreshold;
    const coverageDelta =
      input.changedLinesCoverage ?? input.coverageHint ?? this.coverageThreshold;

    const coverageStats =
      input.changedLinesCoverage != null || input.touchedFilesDelta != null
        ? {
            changedLinesPercent: input.changedLinesCoverage ?? 0,
            touchedFilesDeltaPercent: input.touchedFilesDelta ?? 0,
            minChangedLinesPercent: coverageTarget,
            minTouchedFilesDeltaPercent: 0.05,
          }
        : undefined;

    const integrity = await verifyIntegrity({
      changedFiles: input.changedFiles,
      coverage: coverageStats,
      failingProofProvided: input.failingProofProvided,
      mutationSmoke: input.mutationSmokeEnabled
        ? {
            enabled: true,
            run: async () => {
              const result = await this.toolRunner.run('mutation.smoke', {
                taskId: input.task.id,
              });
              return result.success;
            },
          }
        : undefined,
    });

    const policyFailures = [
      ...integrity.skippedTestsFound,
      ...integrity.placeholdersFound,
      ...integrity.noOpSuspicion,
    ];

    if (policyFailures.length > 0) {
      gateResults.push({
        name: 'integrity.policy',
        success: false,
        output: policyFailures.join('; '),
      });
    }

    if (integrity.mutationSmokeRan) {
      gateResults.push({
        name: 'mutation.smoke',
        success: integrity.mutationSmokeOk === true,
        output: integrity.mutationSmokeOk ? 'Mutation smoke passed' : 'Mutation smoke failed',
      });
    }

    const coverageMet = coverageStats ? integrity.changedLinesCoverageOk : coverageDelta >= coverageTarget;
    const success =
      gatesPassed &&
      coverageMet &&
      policyFailures.length === 0 &&
      (!integrity.mutationSmokeRan || integrity.mutationSmokeOk !== false);

    const logFn = success ? logInfo : logWarning;
    logFn('Verifier evaluated patch', {
      taskId: input.task.id,
      patchHash: input.patchHash,
      coverageDelta,
      coverageTarget,
      gatesPassed,
    });

    return {
      success,
      coverageDelta,
      coverageTarget,
      gateResults,
      artifacts: {
        gates: gateResults,
        coverage: {
          delta: coverageDelta,
          target: coverageTarget,
        },
        integrity,
      },
    };
  }

  private async runRequiredGates(taskId: string): Promise<GateResult[]> {
    const results: GateResult[] = [];
    for (const gateName of REQUIRED_GATES) {
      const result = await this.toolRunner.run(gateName, { taskId });
      results.push({
        name: gateName,
        success: result.success,
        output: result.output,
      });
      if (!result.success) {
        break;
      }
    }
    return results;
  }
}
