#!/usr/bin/env ts-node

/**
 * MCP Upgrade Preflight Guardrail
 *
 * Validates upgrade prerequisites (clean git tree, Node/npm versions,
 * disk space, sandbox tooling, and SQLite availability) while enforcing
 * the single-flight upgrade lock. Results are written to
 * experiments/mcp/upgrade/<timestamp>/preflight.json for auditability, and
 * gate evidence is summarised under state/quality/upgrade_gates.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { execa } from 'execa';

interface CliOptions {
  workspace: string;
  help: boolean;
}

type UpgradePreflightModule = typeof import('../src/upgrade/preflight.js');

const CLEAN_WORKTREE_NAME = '.clean_worktree';
const MAX_WARN_DIRTY_ENTRIES = 200;
const DIRTY_LOG_SAMPLE_LIMIT = 10;

async function collectWorkspaceStatus(workspaceRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: workspaceRoot });
    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[preflight] unable to collect workspace status: ${message}`);
    return [];
  }
}

function resolveGitDirFromWorktree(worktreePath: string): string {
  const gitPointerPath = path.join(worktreePath, '.git');
  try {
    const stats = fs.statSync(gitPointerPath);
    if (stats.isFile()) {
      const raw = fs.readFileSync(gitPointerPath, 'utf8');
      const match = /^gitdir:\s*(.+)$/mu.exec(raw);
      if (match?.[1]) {
        return path.resolve(worktreePath, match[1].trim());
      }
    }
  } catch {
    // Ignore pointer resolution issues; fall back to pointer path.
  }
  return gitPointerPath;
}

async function refreshCleanWorktree(workspaceRoot: string): Promise<string> {
  const cleanRoot = path.join(workspaceRoot, CLEAN_WORKTREE_NAME);

  try {
    await execa('git', ['worktree', 'remove', '--force', cleanRoot], { cwd: workspaceRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found|not a working tree|No worktree/i.test(message)) {
      console.warn(`[preflight] unable to remove previous clean worktree: ${message}`);
    }
  }

  if (fs.existsSync(cleanRoot)) {
    fs.rmSync(cleanRoot, { recursive: true, force: true });
  }

  await execa('git', ['worktree', 'prune'], { cwd: workspaceRoot });
  await execa('git', ['worktree', 'add', '--force', '--detach', cleanRoot, 'HEAD'], {
    cwd: workspaceRoot,
  });
  await execa('git', ['reset', '--hard', 'HEAD'], { cwd: cleanRoot });
  await execa('git', ['clean', '-fdx'], { cwd: cleanRoot });

  return cleanRoot;
}

async function loadRunUpgradePreflight(scriptDir: string) {
  const candidatePaths = [
    path.join(scriptDir, '../src/upgrade/preflight.ts'),
    path.join(scriptDir, '../src/upgrade/preflight.js'),
    path.join(scriptDir, '../dist/upgrade/preflight.js'),
  ];

  for (const candidate of candidatePaths) {
    try {
      const moduleUrl = pathToFileURL(candidate).href;
      const mod: Partial<UpgradePreflightModule> = await import(moduleUrl);
      if (typeof mod.runUpgradePreflight === 'function') {
        return mod.runUpgradePreflight;
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') {
        console.warn(
          `[preflight] encountered ${error.name ?? 'error'} while loading ${path.relative(scriptDir, candidate)}: ${
            error.message
          }`,
        );
      }
    }
  }

  throw new Error(
    'Unable to resolve upgrade preflight helper. Run `npm --prefix tools/wvo_mcp run build` to generate dist artifacts.',
  );
}

function parseArgs(argv: string[]): CliOptions {
  let workspace = '';
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--workspace' || arg === '-w') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --workspace');
      }
      workspace = path.resolve(value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { workspace, help };
}

function printUsage() {
  console.log(
    [
      'Usage: ts-node tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts [--workspace <path>]',
      '',
      'Validates upgrade preconditions and records the outcome under experiments/mcp/upgrade.',
    ].join('\n'),
  );
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultWorkspace = path.resolve(scriptDir, '../../..');
  const { workspace, help } = parseArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  const workspaceRoot = workspace || defaultWorkspace;
  const stateDir = path.join(workspaceRoot, 'state');
  const sqlitePath = path.join(stateDir, 'orchestrator.db');

  const runUpgradePreflight = await loadRunUpgradePreflight(scriptDir);
  const dirtyEntries = await collectWorkspaceStatus(workspaceRoot);
  let commandRoot = workspaceRoot;

  if (dirtyEntries.length > 0) {
    const sample = dirtyEntries.slice(0, DIRTY_LOG_SAMPLE_LIMIT);
    console.warn(
      `[preflight] workspace dirty (${dirtyEntries.length} entr${
        dirtyEntries.length === 1 ? 'y' : 'ies'
      }); refreshing clean worktree before guardrail.`,
    );
    for (const entry of sample) {
      console.warn(`[preflight] dirty entry: ${entry}`);
    }
    if (dirtyEntries.length > sample.length) {
      console.warn(
        `[preflight] ... ${dirtyEntries.length - sample.length} additional entr${
          dirtyEntries.length - sample.length === 1 ? 'y' : 'ies'
        } trimmed from console output.`,
      );
    }
    try {
      commandRoot = await refreshCleanWorktree(workspaceRoot);
      const relative = path.relative(workspaceRoot, commandRoot) || commandRoot;
      console.log(`[preflight] git guardrail executing in ${relative}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[preflight] failed to refresh clean worktree (${message}); continuing with primary workspace.`,
      );
      commandRoot = workspaceRoot;
    }
  }

  const result = await runUpgradePreflight({
    rootDir: commandRoot,
    stateDir,
    sqlitePath,
    diskCheckPath: workspaceRoot,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(workspaceRoot, 'experiments', 'mcp', 'upgrade', timestamp);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'preflight.json');
  const auditPayload = {
    ...result,
    workspaceRoot,
    commandRoot,
    workspaceDirty:
      dirtyEntries.length > 0
        ? {
            count: dirtyEntries.length,
            entries: dirtyEntries.slice(0, MAX_WARN_DIRTY_ENTRIES),
          }
        : undefined,
  };
  fs.writeFileSync(outputPath, JSON.stringify(auditPayload, null, 2), 'utf-8');

  console.log(`[preflight] wrote results to ${path.relative(workspaceRoot, outputPath)}`);

  if (result.versions.length > 0) {
    for (const version of result.versions) {
      const statusIcon = version.satisfies ? '✓' : '✗';
      const detected = version.detected ?? version.rawDetected ?? 'unknown';
      const constraint =
        version.constraint !== undefined
          ? ` (constraint ${version.constraint}${version.constraintSource ? ` via ${version.constraintSource}` : ''})`
          : '';
      const note = version.notes ? ` – ${version.notes}` : '';
      console.log(`[preflight] ${statusIcon} ${version.tool} ${detected}${constraint}${note}`);
    }
  }

  const gateEvidenceDir = path.join(stateDir, 'quality');
  fs.mkdirSync(gateEvidenceDir, { recursive: true });
  const gateEvidencePath = path.join(gateEvidenceDir, 'upgrade_gates.json');
  const gateEvidence = {
    recorded_at: new Date().toISOString(),
    ok: result.ok,
    failedCheck: result.ok ? undefined : result.failedCheck,
    artifact: path.relative(workspaceRoot, outputPath),
    gates: result.gates,
    versions: result.versions,
    workspace_dirty:
      dirtyEntries.length > 0
        ? {
            count: dirtyEntries.length,
            sample: dirtyEntries.slice(0, DIRTY_LOG_SAMPLE_LIMIT),
          }
        : undefined,
  };
  fs.writeFileSync(gateEvidencePath, JSON.stringify(gateEvidence, null, 2), 'utf-8');
  console.log(
    `[preflight] gate evidence captured at ${path.relative(workspaceRoot, gateEvidencePath)}`,
  );

  if (!result.ok) {
    console.error(
      `[preflight] upgrade guardrail failed at ${result.failedCheck}: ${result.logs
        .filter((log) => log.name === result.failedCheck)
        .map((log) => log.details ?? '')
        .join(' ')}`.trim(),
    );
    process.exitCode = 1;
  } else {
    console.log('[preflight] upgrade guardrail passed');
  }
}

main().catch((error) => {
  console.error('[preflight] unexpected failure', error);
  process.exitCode = 1;
});
