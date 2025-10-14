import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecaError } from 'execa';
import { execa } from 'execa';
import Database from 'better-sqlite3';

const DEFAULT_DISK_THRESHOLD_MB = 500;
const DEFAULT_NODE_MAJOR = 18;
const DEFAULT_NPM_MAJOR = 9;
const GATE_SEQUENCE = ['build', 'unit', 'selfchecks', 'canary_ready'] as const;

export type UpgradeGateName = (typeof GATE_SEQUENCE)[number];

export interface GateLog {
  gate: UpgradeGateName;
  status: 'pending' | 'passed' | 'failed';
  timestamp: string;
}

export interface PreflightLogEntry {
  name: string;
  status: 'passed' | 'failed';
  timestamp: string;
  details?: string;
}

export interface UpgradePreflightSuccess {
  ok: true;
  logs: PreflightLogEntry[];
  gates: GateLog[];
}

export interface UpgradePreflightFailure {
  ok: false;
  error: 'upgrade_aborted';
  failedCheck: string;
  logs: PreflightLogEntry[];
  gates: GateLog[];
}

export type UpgradePreflightOutcome = UpgradePreflightSuccess | UpgradePreflightFailure;

export interface CommandRunnerResult {
  stdout: string;
}

export type CommandRunner = (
  cmd: string,
  args: readonly string[],
  options?: { cwd?: string },
) => Promise<CommandRunnerResult>;

export interface UpgradePreflightOptions {
  rootDir?: string;
  stateDir?: string;
  upgradeLockPath?: string;
  diskCheckPath?: string;
  sqlitePath?: string;
  minimumNodeMajor?: number;
  minimumNpmMajor?: number;
  requiredDiskMb?: number;
  nodeVersion?: string;
  commandRunner?: CommandRunner;
  timeProvider?: () => Date;
}

class PreflightError extends Error {
  public readonly check: string;
  public readonly details?: string;

  constructor(check: string, message: string, details?: string) {
    super(message);
    this.name = 'PreflightError';
    this.check = check;
    this.details = details ?? message;
  }
}

const defaultCommandRunner: CommandRunner = async (cmd, args, options) => {
  try {
    const result = await execa(cmd, [...args], {
      cwd: options?.cwd,
      env: process.env,
    });
    return { stdout: result.stdout };
  } catch (error) {
    const execaError = error as ExecaError;
    throw new PreflightError(cmd, execaError.message, execaError.stdout ?? execaError.stderr);
  }
};

const getDefaultRootDir = () => {
  const current = fileURLToPath(new URL('.', import.meta.url));
  return path.resolve(current, '../../..');
};

const toIso = (timeProvider: () => Date) => timeProvider().toISOString();

export async function runUpgradePreflight(
  rawOptions: UpgradePreflightOptions = {},
): Promise<UpgradePreflightOutcome> {
  const rootDir = rawOptions.rootDir ?? getDefaultRootDir();
  const stateDir = rawOptions.stateDir ?? path.join(rootDir, 'state');
  const upgradeLockPath = rawOptions.upgradeLockPath ?? path.join(stateDir, 'upgrade.lock');
  const diskCheckPath = rawOptions.diskCheckPath ?? rootDir;
  const sqlitePath = rawOptions.sqlitePath ?? path.join(stateDir, 'orchestrator.db');
  const minimumNodeMajor = rawOptions.minimumNodeMajor ?? DEFAULT_NODE_MAJOR;
  const minimumNpmMajor = rawOptions.minimumNpmMajor ?? DEFAULT_NPM_MAJOR;
  const requiredDiskMb = rawOptions.requiredDiskMb ?? DEFAULT_DISK_THRESHOLD_MB;
  const nodeVersion = rawOptions.nodeVersion ?? process.version;
  const commandRunner = rawOptions.commandRunner ?? defaultCommandRunner;
  const timeProvider = rawOptions.timeProvider ?? (() => new Date());

  const logs: PreflightLogEntry[] = [];
  const gates: GateLog[] = GATE_SEQUENCE.map((gate) => ({
    gate,
    status: 'pending',
    timestamp: toIso(timeProvider),
  }));

  const logSuccess = (name: string) => {
    logs.push({
      name,
      status: 'passed',
      timestamp: toIso(timeProvider),
    });
  };

  const logFailure = (name: string, details: string) => {
    logs.push({
      name,
      status: 'failed',
      timestamp: toIso(timeProvider),
      details,
    });
  };

  if (fs.existsSync(upgradeLockPath)) {
    const message = 'upgrade lock already present';
    logFailure('upgrade_lock', message);
    return {
      ok: false,
      error: 'upgrade_aborted',
      failedCheck: 'upgrade_lock',
      logs,
      gates,
    };
  }

  const ensureLockPath = () => {
    const dir = path.dirname(upgradeLockPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  };

  const writeLock = () => {
    ensureLockPath();
    fs.writeFileSync(
      upgradeLockPath,
      JSON.stringify(
        {
          created_at: toIso(timeProvider),
          hostname: os.hostname(),
          pid: process.pid,
        },
        null,
        2,
      ),
      'utf-8',
    );
  };

  const removeLock = () => {
    try {
      if (fs.existsSync(upgradeLockPath)) {
        fs.rmSync(upgradeLockPath);
      }
    } catch (error) {
      // Removal failures should not crash the preflight path; surface via log.
      logFailure('upgrade_lock_cleanup', (error as Error).message);
    }
  };

  const runCheck = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      logSuccess(name);
    } catch (error) {
      const failure = error instanceof PreflightError ? error : new PreflightError(name, String(error));
      logFailure(name, failure.details ?? failure.message);
      throw failure;
    }
  };

  try {
    writeLock();

    await runCheck('git_clean', async () => {
      const { stdout } = await commandRunner(
        'git',
        ['status', '--porcelain'],
        { cwd: rootDir },
      );
      if (stdout.trim().length > 0) {
        throw new PreflightError('git_clean', 'workspace has uncommitted changes', stdout.trim());
      }
    });

    await runCheck('node_version', async () => {
      const major = parseVersionMajor(nodeVersion);
      if (Number.isNaN(major) || major < minimumNodeMajor) {
        throw new PreflightError(
          'node_version',
          `Node.js ${minimumNodeMajor}+ required`,
          `detected ${nodeVersion}`,
        );
      }
    });

    await runCheck('npm_version', async () => {
      const { stdout } = await commandRunner('npm', ['--version'], { cwd: rootDir });
      const major = parseVersionMajor(stdout.trim());
      if (Number.isNaN(major) || major < minimumNpmMajor) {
        throw new PreflightError(
          'npm_version',
          `npm ${minimumNpmMajor}+ required`,
          `detected ${stdout.trim()}`,
        );
      }
    });

    await runCheck('disk_space', async () => {
      const { stdout } = await commandRunner('df', ['-k', diskCheckPath], { cwd: rootDir });
      const availableMb = parseAvailableDiskMb(stdout);
      if (!Number.isFinite(availableMb)) {
        throw new PreflightError(
          'disk_space',
          'Unable to parse disk availability from df output',
          stdout.trim(),
        );
      }
      if (availableMb < requiredDiskMb) {
        throw new PreflightError(
          'disk_space',
          `Insufficient disk space: need >= ${requiredDiskMb} MB`,
          `available ${availableMb} MB`,
        );
      }
    });

    await runCheck('sandbox_tooling', async () => {
      const dockerOk = await commandExists(commandRunner, 'docker', rootDir);
      const bwrapOk = await commandExists(commandRunner, 'bwrap', rootDir);
      if (!dockerOk && !bwrapOk) {
        throw new PreflightError(
          'sandbox_tooling',
          'Neither docker nor bwrap is available in PATH',
        );
      }
    });

    await runCheck('sqlite_roundtrip', async () => {
      const db = new Database(sqlitePath, { readonly: false, fileMustExist: true });
      try {
        db.prepare('BEGIN').run();
        db.prepare('ROLLBACK').run();
      } catch (error) {
        throw new PreflightError('sqlite_roundtrip', 'SQLite BEGIN/ROLLBACK failed', String(error));
      } finally {
        db.close();
      }
    });

    return {
      ok: true,
      logs,
      gates,
    };
  } catch (error) {
    const failure = error as PreflightError;
    return {
      ok: false,
      error: 'upgrade_aborted',
      failedCheck: failure.check,
      logs,
      gates,
    };
  } finally {
    removeLock();
  }
}

function parseVersionMajor(version: string): number {
  const match = version.trim().match(/(?:(?:v|V))?(\d{1,3})/);
  return match ? Number.parseInt(match[1] ?? '', 10) : Number.NaN;
}

function parseAvailableDiskMb(dfOutput: string): number {
  const lines = dfOutput.trim().split('\n');
  if (lines.length < 2) {
    return Number.NaN;
  }
  const lastLine = lines[lines.length - 1]!;
  const fields = lastLine.trim().split(/\s+/);
  if (fields.length < 4) {
    return Number.NaN;
  }
  const availableKb = Number.parseInt(fields[3] ?? '', 10);
  if (Number.isNaN(availableKb)) {
    return Number.NaN;
  }
  return Math.floor(availableKb / 1024);
}

async function commandExists(
  runner: CommandRunner,
  commandName: string,
  cwd: string,
): Promise<boolean> {
  try {
    await runner('which', [commandName], { cwd });
    return true;
  } catch {
    return false;
  }
}
