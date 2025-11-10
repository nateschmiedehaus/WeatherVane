#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const workspace = path.resolve(new URL('../..', import.meta.url).pathname, '..');
const stateRoot = process.env.WVO_STATE_ROOT || path.join(workspace, 'state');
const logPath = path.join(stateRoot, 'logs', task, 'verify', 'verify.log');

if (!fs.existsSync(logPath)) {
  console.error(`verify log missing: ${logPath}`);
  process.exit(1);
}

const contents = fs.readFileSync(logPath, 'utf8');
const hasVitest = /Test Files\s+\d+\s+passed/i.test(contents) || /RUN\s+v\d+\.\d+/i.test(contents);
if (!hasVitest) {
  console.error(`verify log appears stubbed (missing vitest markers): ${logPath}`);
  process.exit(1);
}

console.log('verify log contains vitest markers');
