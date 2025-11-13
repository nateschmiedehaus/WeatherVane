#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { deriveTaskId } from './lib/derive_task.mjs';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const here = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(path.join(here, '..', '..', '..'));
const stateRoot = process.env.WVO_STATE_ROOT ? path.resolve(process.env.WVO_STATE_ROOT) : path.join(workspace, 'state');
const task = getArg('--task') || deriveTaskId();
const attestPath = path.join(stateRoot, 'logs', task, 'attest', 'run.json');

if (!fs.existsSync(attestPath)) {
  console.error(`provenance attestation missing: ${attestPath}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(attestPath, 'utf8'));
const finishedAt = payload.finished_at ? new Date(payload.finished_at) : null;
const errors = [];

const hashFile = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

for (const artifact of payload.artifacts ?? []) {
  const absPath = path.resolve(workspace, artifact.path);
  if (!fs.existsSync(absPath)) {
    errors.push(`missing:${artifact.path}`);
    continue;
  }
  const actual = hashFile(absPath);
  if (actual !== artifact.sha256) {
    errors.push(`hash:${artifact.path}`);
  }
  if (finishedAt) {
    const mtime = fs.statSync(absPath).mtime;
    if (mtime > finishedAt) {
      errors.push(`mtime:${artifact.path}`);
    }
  }
}

const verifyLog = path.join(stateRoot, 'logs', task, 'verify', 'verify.log');
if (!fs.existsSync(verifyLog)) {
  errors.push('missing:verify.log');
} else {
  const lines = fs.readFileSync(verifyLog, 'utf8').trimEnd().split(/\r?\n/);
  const trailer = lines[lines.length - 1];
  if (!trailer?.startsWith('RUN:')) {
    errors.push('run_trailer_missing');
  } else if (payload.run_id && trailer !== `RUN: ${payload.run_id}`) {
    errors.push('run_trailer_mismatch');
  }
}

const summary = {
  task,
  artifacts_checked: payload.artifacts?.length ?? 0,
  run_id: payload.run_id ?? null,
  ok: errors.length === 0,
  errors,
  generated_at: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(attestPath), { recursive: true });
fs.writeFileSync(path.join(path.dirname(attestPath), 'provenance_check.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(errors.length ? 1 : 0);
