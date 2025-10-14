#!/usr/bin/env node

/**
 * Error Recovery Simulation
 *
 * Exercises ResilienceManager failure handling, emergency checkpoint creation,
 * and the kill-switch rollback workflow. Produces a JSON artifact consumed by
 * roadmap task T6.2.2.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runErrorRecoverySimulation } from '../dist/simulations/error_recovery.js';

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const experimentsDir = path.join(repoRoot, 'experiments', 'mcp');
  await ensureDir(experimentsDir);

  const tmpRoot = path.join(experimentsDir, '.tmp');
  await ensureDir(tmpRoot);

  const { summary, workspaceRoot } = await runErrorRecoverySimulation({
    workspaceParent: tmpRoot,
    retainWorkspace: false,
  });

  const enriched = {
    ...summary,
    workspace_relative: path.relative(repoRoot, workspaceRoot),
  };

  const outputPath = path.join(experimentsDir, 'error_recovery.json');
  await fs.writeFile(outputPath, JSON.stringify(enriched, null, 2), 'utf8');

  console.log(`✅ Error recovery simulation written to ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error('❌ Error recovery simulation failed:', error);
  process.exitCode = 1;
});
