#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const idx = process.argv.indexOf('--task');
const task = idx !== -1 ? process.argv[idx + 1] : process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const workspace = path.resolve(new URL('../..', import.meta.url).pathname, '..');
const stateRoot = process.env.WVO_STATE_ROOT ? path.resolve(process.env.WVO_STATE_ROOT) : path.join(workspace, 'state');
const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const attestDir = path.join(stateRoot, 'logs', task, 'attest');
const criticsDir = path.join(stateRoot, 'logs', task, 'critics');
const scas = readJson(path.join(attestDir, 'scas.json'));
const guardrails = readJson(path.join(criticsDir, 'guardrails.json'));
const scasPass = Boolean(scas?.pass);
const guardrailsPass =
  guardrails?.pass ??
  guardrails?.ok ??
  (Array.isArray(guardrails?.checks) ? guardrails.checks.every((check) => check?.status === 'pass') : false);
const payload = {
  task,
  scas_pass: scasPass,
  guardrails_pass: guardrailsPass,
  agree: scasPass && guardrailsPass,
  reasons: [],
  generated_at: new Date().toISOString(),
};

fs.mkdirSync(attestDir, { recursive: true });
fs.writeFileSync(path.join(attestDir, 'agreements.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
