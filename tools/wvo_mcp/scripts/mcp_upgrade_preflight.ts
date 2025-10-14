#!/usr/bin/env ts-node

/**
 * MCP Upgrade Preflight Guardrail
 *
 * Validates upgrade prerequisites (clean git tree, Node/npm versions,
 * disk space, sandbox tooling, and SQLite availability) while enforcing
 * the single-flight upgrade lock. Results are written to
 * experiments/mcp/upgrade/<timestamp>/preflight.json for auditability.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runUpgradePreflight } from '../src/upgrade/preflight.js';

interface CliOptions {
  workspace: string;
  help: boolean;
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

  const result = await runUpgradePreflight({
    rootDir: workspaceRoot,
    stateDir,
    sqlitePath,
    diskCheckPath: workspaceRoot,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(workspaceRoot, 'experiments', 'mcp', 'upgrade', timestamp);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'preflight.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`[preflight] wrote results to ${path.relative(workspaceRoot, outputPath)}`);

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
