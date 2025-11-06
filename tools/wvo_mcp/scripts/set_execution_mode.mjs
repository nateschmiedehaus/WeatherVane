#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(path.join(__dirname, '..', '..', '..'));
const STATE_ROOT = path.join(WORKSPACE_ROOT, 'state');

function usage(exitCode = 1) {
  console.error('Usage: node tools/wvo_mcp/scripts/set_execution_mode.mjs <TASK-ID> <manual|autopilot> [--source <label>]');
  process.exit(exitCode);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  usage();
}

const taskId = args[0];
const mode = args[1];
const allowedModes = new Set(['manual', 'autopilot']);
if (!allowedModes.has(mode)) {
  console.error(`Invalid execution mode "${mode}". Allowed values: manual | autopilot.`);
  usage();
}

let source = 'manual-cli';
for (let i = 2; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--source') {
    source = args[i + 1] ?? source;
    i += 1;
  }
}

const evidencePath = path.join(STATE_ROOT, 'evidence', taskId);
const metadataPath = path.join(evidencePath, 'metadata.json');

try {
  if (!fs.existsSync(evidencePath)) {
    fs.mkdirSync(evidencePath, { recursive: true });
  }

  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) || {};
    } catch (error) {
      console.warn(`Warning: existing metadata.json for ${taskId} is invalid. It will be overwritten.`);
    }
  }

  const entry = {
    ...metadata,
    execution_mode: mode,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: source,
  };

  fs.writeFileSync(metadataPath, JSON.stringify(entry, null, 2), 'utf-8');
  console.log(`Set execution_mode="${mode}" for ${taskId}`);
} catch (error) {
  console.error(`Failed to set execution mode for ${taskId}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
