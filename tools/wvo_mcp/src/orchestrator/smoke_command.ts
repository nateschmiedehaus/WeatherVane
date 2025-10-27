import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { logInfo, logWarning } from '../telemetry/logger.js';

export interface SmokeCommandResult {
  success: boolean;
  log: string;
  command: string[];
  durationMs: number;
  mode: 'script' | 'fallback';
}

export interface SmokeCommandOptions {
  workspaceRoot: string;
  scriptPath?: string;
  fallbackCommand?: string[];
  env?: NodeJS.ProcessEnv;
  onChunk?: (chunk: string) => void;
}

interface ResolvedCommand {
  command: string;
  args: string[];
  mode: 'script' | 'fallback';
  printable: string[];
}

export class SmokeCommand {
  private readonly scriptPath: string;
  private readonly fallback: string[];

  constructor(private readonly options: SmokeCommandOptions) {
    this.scriptPath =
      options.scriptPath ??
      path.join(options.workspaceRoot, 'scripts', 'app_smoke_e2e.sh');
    this.fallback = options.fallbackCommand ?? [
      'node',
      'tools/oss_autopilot/scripts/run_vitest.mjs',
      '--run',
      'tools/wvo_mcp/src/orchestrator/__tests__/state_runners/monitor_runner.test.ts',
      '--scope=autopilot',
    ];
  }

  async run(): Promise<SmokeCommandResult> {
    const resolved = this.resolveCommand();
    const start = Date.now();
    const child = spawn(resolved.command, resolved.args, {
      cwd: this.options.workspaceRoot,
      env: { ...process.env, ...this.options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    const handleChunk = (chunk: Buffer): void => {
      const text = chunk.toString();
      buffer += text;
      this.options.onChunk?.(text);
    };
    child.stdout?.on('data', handleChunk);
    child.stderr?.on('data', handleChunk);

    const [code] = (await once(child, 'close')) as [number];
    const durationMs = Date.now() - start;

    logInfo('SmokeCommand finished', {
      mode: resolved.mode,
      success: code === 0,
      durationMs,
      command: resolved.printable,
    });

    return {
      success: code === 0,
      log: buffer.trim(),
      command: resolved.printable,
      durationMs,
      mode: resolved.mode,
    };
  }

  private resolveCommand(): ResolvedCommand {
    if (fs.existsSync(this.scriptPath)) {
      return {
        command: 'bash',
        args: [this.scriptPath],
        mode: 'script',
        printable: ['bash', this.scriptPath],
      };
    }
    logWarning('Smoke script missing, falling back to hermetic vitest command', {
      script: this.scriptPath,
      fallback: this.fallback,
    });
    return {
      command: this.fallback[0],
      args: this.fallback.slice(1),
      mode: 'fallback',
      printable: [...this.fallback],
    };
  }
}
