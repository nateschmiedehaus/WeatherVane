#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const workspace = path.resolve(new URL('../..', import.meta.url).pathname, '..');
const stateRoot = process.env.WVO_STATE_ROOT || path.join(workspace, 'state');
const criticsDir = path.join(stateRoot, 'logs', task, 'critics');

const required = ['template_detector.json', 'guardrails.json'];
for (const file of required) {
  const candidate = path.join(criticsDir, file);
  if (!fs.existsSync(candidate)) {
    console.error(`missing critics artifact: ${candidate}`);
    process.exit(1);
  }
}

const legacy = path.join(stateRoot, 'logs', task, 'template_detector.json');
if (fs.existsSync(legacy)) {
  console.error(`legacy template detector artifact detected: ${legacy}`);
  process.exit(1);
}

console.log('critics artifacts present under critics/');
