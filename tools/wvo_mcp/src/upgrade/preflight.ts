import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecaError } from 'execa';
import { execa } from 'execa';
import Database from 'better-sqlite3';
import {
  formatSemver,
  parseSemver,
  parseVersionConstraint,
  semverSatisfies,
  type Semver,
  type VersionConstraint,
} from './semver.js';

const DEFAULT_DISK_THRESHOLD_MB = 500;
const DEFAULT_NODE_MAJOR = 18;
const DEFAULT_NPM_MAJOR = 9;
const GATE_SEQUENCE = ['build', 'unit', 'selfchecks', 'canary_ready'] as const;
const SANDBOX_ARTIFACT_RELATIVE = ['experiments', 'meta', 'sandbox_run.json'] as const;
const SANDBOX_ARTIFACT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type UpgradeGateName = (typeof GATE_SEQUENCE)[number];

export type VersionEvidenceTool = 'node' | 'npm';

export interface VersionEvidence {
  tool: VersionEvidenceTool;
  rawDetected?: string;
  detected?: string;
  constraint?: string;
  constraintSource?: string;
  satisfies: boolean;
  notes?: string;
}

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
  versions: VersionEvidence[];
}

export interface UpgradePreflightFailure {
  ok: false;
  error: 'upgrade_aborted';
  failedCheck: string;
  logs: PreflightLogEntry[];
  gates: GateLog[];
  versions: VersionEvidence[];
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

interface VersionConstraintInfo {
  value: string;
  source: string;
}

const toIso = (timeProvider: () => Date) => timeProvider().toISOString();

export async function runUpgradePreflight(
  rawOptions: UpgradePreflightOptions = {},
): Promise<UpgradePreflightOutcome> {
  const rootDir = rawOptions.rootDir ?? getDefaultRootDir();
  const stateDir = rawOptions.stateDir ?? path.join(rootDir, 'state');
  const nodeConstraint = readNodeVersionConstraint(rootDir);
  const npmConstraint = readEngineConstraint(rootDir, 'npm');
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
  const versionEvidence = new Map<VersionEvidenceTool, VersionEvidence>();

  const ensureVersionEvidence = (tool: VersionEvidenceTool): VersionEvidence => {
    const existing = versionEvidence.get(tool);
    if (existing) {
      return existing;
    }
    const entry: VersionEvidence = {
      tool,
      satisfies: false,
    };
    versionEvidence.set(tool, entry);
    return entry;
  };

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
      versions: Array.from(versionEvidence.values()),
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
      const parsedVersion = parseSemver(nodeVersion);
      const evidence = ensureVersionEvidence('node');
      evidence.rawDetected = nodeVersion;

      if (!parsedVersion) {
        evidence.satisfies = false;
        evidence.notes = `Unable to parse Node.js version "${nodeVersion}"`;
        throw new PreflightError(
          'node_version',
          'Unable to parse detected Node.js version',
          `received ${nodeVersion}`,
        );
      }
      evidence.detected = formatSemver(parsedVersion);
      if (nodeConstraint) {
        evidence.constraint = nodeConstraint.value;
        evidence.constraintSource = nodeConstraint.source;
        const constraint = parseVersionConstraint(nodeConstraint.value);
        if (!constraint) {
          evidence.satisfies = false;
          throw new PreflightError(
            'node_version',
            `Unable to parse Node.js constraint "${nodeConstraint.value}"`,
          );
        }
        const satisfies = semverSatisfies(parsedVersion, constraint);
        evidence.satisfies = satisfies;
        if (!satisfies) {
          evidence.notes = `detected ${formatSemver(parsedVersion)}`;
          throw new PreflightError(
            'node_version',
            `Node.js version must satisfy ${nodeConstraint.value}`,
            `detected ${formatSemver(parsedVersion)}`,
          );
        }
        return;
      }

      evidence.constraint = `>=${minimumNodeMajor}.0.0`;
      evidence.constraintSource = 'default';
      const satisfies = parsedVersion.major >= minimumNodeMajor;
      evidence.satisfies = satisfies;
      if (!satisfies) {
        evidence.constraint = `>=${minimumNodeMajor}.0.0`;
        evidence.constraintSource = 'default';
        evidence.satisfies = false;
        evidence.notes = `detected ${formatSemver(parsedVersion)}`;
        throw new PreflightError(
          'node_version',
          `Node.js ${minimumNodeMajor}+ required`,
          `detected ${formatSemver(parsedVersion)}`,
        );
      }
    });

    await runCheck('npm_version', async () => {
      const { stdout } = await commandRunner('npm', ['--version'], { cwd: rootDir });
      const trimmed = stdout.trim();
      const parsedVersion = parseSemver(trimmed);
      const evidence = ensureVersionEvidence('npm');
      evidence.rawDetected = trimmed;

      if (!parsedVersion) {
        evidence.satisfies = false;
        evidence.notes = `Unable to parse npm version "${trimmed}"`;
        throw new PreflightError(
          'npm_version',
          'Unable to parse detected npm version',
          `received ${trimmed}`,
        );
      }
      evidence.detected = formatSemver(parsedVersion);
      if (npmConstraint) {
        evidence.constraint = npmConstraint.value;
        evidence.constraintSource = npmConstraint.source;
        const constraint = parseVersionConstraint(npmConstraint.value);
        if (!constraint) {
          evidence.satisfies = false;
          throw new PreflightError(
            'npm_version',
            `Unable to parse npm constraint "${npmConstraint.value}"`,
          );
        }
        const satisfies = semverSatisfies(parsedVersion, constraint);
        evidence.satisfies = satisfies;
        if (!satisfies) {
          evidence.notes = `detected ${formatSemver(parsedVersion)}`;
          throw new PreflightError(
            'npm_version',
            `npm version must satisfy ${npmConstraint.value}`,
            `detected ${formatSemver(parsedVersion)}`,
          );
        }
        return;
      }

      evidence.constraint = `>=${minimumNpmMajor}.0.0`;
      evidence.constraintSource = 'default';
      const satisfies = parsedVersion.major >= minimumNpmMajor;
      evidence.satisfies = satisfies;
      if (!satisfies) {
        evidence.constraint = `>=${minimumNpmMajor}.0.0`;
        evidence.constraintSource = 'default';
        evidence.satisfies = false;
        evidence.notes = `detected ${formatSemver(parsedVersion)}`;
        throw new PreflightError(
          'npm_version',
          `npm ${minimumNpmMajor}+ required`,
          `detected ${formatSemver(parsedVersion)}`,
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
      if (dockerOk || bwrapOk) {
        return;
      }

      const sandboxEvidence = evaluateSandboxArtifact(rootDir);
      if (sandboxEvidence.ok) {
        return;
      }

      const detail = sandboxEvidence.detail ? ` (${sandboxEvidence.detail})` : '';
      throw new PreflightError(
        'sandbox_tooling',
        `Neither docker nor bwrap is available in PATH${detail}`,
      );
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
      versions: Array.from(versionEvidence.values()),
    };
  } catch (error) {
    const failure = error as PreflightError;
    return {
      ok: false,
      error: 'upgrade_aborted',
      failedCheck: failure.check,
      logs,
      gates,
      versions: Array.from(versionEvidence.values()),
    };
  } finally {
    removeLock();
  }
}

function readNodeVersionConstraint(rootDir: string): VersionConstraintInfo | undefined {
  const nvmrcPath = path.join(rootDir, '.nvmrc');
  if (fs.existsSync(nvmrcPath)) {
    const content = fs.readFileSync(nvmrcPath, 'utf-8').trim();
    if (content.length > 0) {
      return {
        value: content,
        source: '.nvmrc',
      };
    }
  }
  return readEngineConstraint(rootDir, 'node');
}

function readEngineConstraint(rootDir: string, key: 'node' | 'npm'): VersionConstraintInfo | undefined {
  const packageJsonCandidates = [
    path.join(rootDir, 'package.json'),
    path.join(rootDir, 'tools', 'wvo_mcp', 'package.json'),
  ];
  for (const candidate of packageJsonCandidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(candidate, 'utf-8');
      const parsed = JSON.parse(raw) as { engines?: Record<string, unknown> };
      const value = parsed.engines?.[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        const relativePath = path.relative(rootDir, candidate) || path.basename(candidate);
        return {
          value: value.trim(),
          source: `${relativePath} (engines.${key})`,
        };
      }
    } catch {
      // Ignore JSON parse failures; next candidate may provide the constraint.
    }
  }
  return undefined;
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

interface SandboxArtifactResult {
  ok: boolean;
  detail?: string;
}

function evaluateSandboxArtifact(rootDir: string): SandboxArtifactResult {
  const artifactPath = path.join(rootDir, ...SANDBOX_ARTIFACT_RELATIVE);
  if (!fs.existsSync(artifactPath)) {
    return { ok: false, detail: 'sandbox artifact missing' };
  }

  try {
    const raw = fs.readFileSync(artifactPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      dry_run?: unknown;
      dryRun?: unknown;
      generated_at?: unknown;
      generatedAt?: unknown;
    };

    const dryRun = (parsed.dry_run ?? parsed.dryRun) === true;
    if (!dryRun) {
      return { ok: false, detail: 'sandbox artifact missing dry_run confirmation' };
    }

    const generatedAtText = parsed.generated_at ?? parsed.generatedAt;
    if (typeof generatedAtText !== 'string' || generatedAtText.length === 0) {
      return { ok: false, detail: 'sandbox artifact missing generated_at timestamp' };
    }

    const generatedAt = Date.parse(generatedAtText);
    if (Number.isNaN(generatedAt)) {
      return { ok: false, detail: 'sandbox artifact invalid generated_at timestamp' };
    }

    if (generatedAt + SANDBOX_ARTIFACT_MAX_AGE_MS < Date.now()) {
      return {
        ok: false,
        detail: `sandbox artifact stale (generated_at=${generatedAtText})`,
      };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `sandbox artifact parse error: ${message}` };
  }
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
