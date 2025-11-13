#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const workspace = path.resolve(new URL('../..', import.meta.url).pathname, '..');
const stateRoot = process.env.WVO_STATE_ROOT || path.join(workspace, 'state');
const driftPath = path.join(stateRoot, 'logs', task, 'docsync', 'drift.json');

if (!fs.existsSync(driftPath)) {
  console.error(`Doc drift ledger missing: ${driftPath}`);
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(driftPath, 'utf8'));
  fs.writeFileSync(
    driftPath,
    JSON.stringify({ ...data, last_checked_at: new Date().toISOString() }, null, 2),
    'utf8',
  );
  console.log('Doc drift ledger updated');
} catch (error) {
  console.error(`Unable to parse doc drift ledger: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
