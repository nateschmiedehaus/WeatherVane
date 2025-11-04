#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { ensureQualityGraphPython } from '../src/quality_graph/python_env.js';
import {
  ensureQualityGraphDir,
  getTaskVectorsPath,
  getVectorCount,
} from '../src/quality_graph/persistence.js';
import { LiveFlags } from '../src/state/live_flags.js';

interface CliOptions {
  workspaceRoot: string;
  quiet: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let workspaceRoot = process.cwd();
  let quiet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--workspace-root' || arg === '--workspace') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      workspaceRoot = path.resolve(value);
      index += 1;
    } else if (arg === '--quiet') {
      quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'check_quality_graph.ts',
          '',
          'Verifies that the quality graph environment, flags, and storage are ready.',
          '',
          'Usage:',
          '  node tools/wvo_mcp/scripts/check_quality_graph.ts [--workspace-root <path>] [--quiet]',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument "${arg}"`);
    }
  }

  return { workspaceRoot, quiet };
}

async function ensureVectorsFile(workspaceRoot: string): Promise<void> {
  const vectorsPath = getTaskVectorsPath(workspaceRoot);
  try {
    await fs.access(vectorsPath);
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      await fs.writeFile(vectorsPath, '', 'utf8');
    } else {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { workspaceRoot, quiet } = options;

  // 1. Ensure Python environment can bootstrap
  const pythonPath = await ensureQualityGraphPython(workspaceRoot);

  // 2. Ensure storage directory and vectors file exist
  await ensureQualityGraphDir(workspaceRoot);
  await ensureVectorsFile(workspaceRoot);
  const corpusSize = await getVectorCount(workspaceRoot);

  // 3. Ensure hints flag is not disabled
  const liveFlags = new LiveFlags({ workspaceRoot });
  const hintsMode = liveFlags.getValue('QUALITY_GRAPH_HINTS_INJECTION');
  if (hintsMode === 'off') {
    throw new Error(
      'QUALITY_GRAPH_HINTS_INJECTION is set to "off". Enable the flag (observe/enforce) to use quality graph hints.',
    );
  }

  if (!quiet) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          pythonPath,
          hintsMode,
          corpusSize,
          workspaceRoot,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[quality-graph-check] ${message}`);
  process.exitCode = 1;
});
