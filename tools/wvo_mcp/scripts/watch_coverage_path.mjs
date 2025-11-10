#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const workspace = path.resolve(new URL('../..', import.meta.url).pathname, '..');
const stateRoot = process.env.WVO_STATE_ROOT || path.join(workspace, 'state');

const coveragePath = path.join(stateRoot, 'logs', task, 'coverage', 'coverage.json');
if (!fs.existsSync(coveragePath)) {
  console.error(`coverage json missing: ${coveragePath}`);
  process.exit(1);
}

const legacyPath = path.join(stateRoot, 'logs', task, 'verify', 'coverage.json');
if (fs.existsSync(legacyPath)) {
  console.error(`legacy coverage artifact detected: ${legacyPath}`);
  process.exit(1);
}

console.log('coverage artifacts in canonical location');
