#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function deriveTask() {
  const envTask = process.env.TASK_ID || '';
  const ref = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '';
  const match = (envTask || ref).match(/AFP-[A-Z0-9-]+/);
  return match ? match[0] : 'AFP-W0-STEP5-MUTATION';
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getField(obj, pathArr) {
  return pathArr.reduce(
    (acc, k) => (acc && Object.prototype.hasOwnProperty.call(acc, k) ? acc[k] : undefined),
    obj
  );
}

const task = deriveTask();
const base = path.join('state', 'logs', task);
const reqs = [
  { p: path.join(base, 'verify', 'verify.log'), min: 1024 },
  { p: path.join(base, 'coverage', 'coverage.json') },
  { p: path.join(base, 'critics', 'template_detector.json') },
  { p: path.join(base, 'critics', 'guardrails.json') },
  { p: path.join(base, 'attest', 'scas.json'), json: true, field: ['pass'], want: true },
];

const errors = [];

for (const r of reqs) {
  if (!fs.existsSync(r.p)) {
    errors.push(`missing:${r.p}`);
    continue;
  }
  if (r.min) {
    const size = fs.statSync(r.p).size;
    if (size < r.min) errors.push(`short:${r.p}:${size}`);
  }
  if (r.json) {
    const data = readJson(r.p);
    if (!data) {
      errors.push(`badjson:${r.p}`);
      continue;
    }
    const v = getField(data, r.field);
    if (v !== r.want) errors.push(`field:${r.p}.${r.field.join('.')}!=${String(r.want)}`);
  }
}

const summary = {
  task,
  ok: errors.length === 0,
  errors,
  checked: reqs.map((entry) => ({ path: entry.p, min: entry.min ?? null, json: Boolean(entry.json) })),
  generated_at: new Date().toISOString(),
};
const coverageDir = path.join(base, 'coverage');
fs.mkdirSync(coverageDir, { recursive: true });
fs.writeFileSync(path.join(coverageDir, 'end_steps_check.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(errors.length ? 1 : 0);
