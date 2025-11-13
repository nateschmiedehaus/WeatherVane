#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspace = path.resolve(new URL('../..', import.meta.url).pathname, '..');
const stateRoot = process.env.WVO_STATE_ROOT || path.join(workspace, 'state');
const task = process.env.TASK_ID || 'AFP-W0-STEP5-MUTATION';
const attestation = path.join(stateRoot, 'logs', task, 'attest', 'scas.json');
const baseRef = process.env.SCAS_BASE || process.env.GITHUB_BASE_REF || 'HEAD~1';
const headRef = process.env.SCAS_HEAD || 'HEAD';

const runGit = (...args) => {
  const result = spawnSync('git', ['-C', workspace, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git ${args.join(' ')} exited ${result.status}`);
  }
  return result.stdout.trim();
};

const resolveRef = (ref) => {
  if (!ref) return null;
  const candidates = [ref, `origin/${ref}`];
  for (const candidate of candidates) {
    try {
      runGit('rev-parse', '--verify', candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
};

const scas = fs.existsSync(attestation) ? JSON.parse(fs.readFileSync(attestation, 'utf8')) : null;
if (!scas) {
  console.error(`SCAS attestation missing: ${attestation}`);
  process.exit(1);
}

let resolvedHead;
try {
  resolvedHead = resolveRef(headRef) || 'HEAD';
  runGit('rev-parse', '--verify', resolvedHead);
} catch (error) {
  console.error(`Unable to resolve head ref (${headRef}): ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

let resolvedBase = resolveRef(baseRef);
if (!resolvedBase) {
  try {
    resolvedBase = runGit('rev-parse', `${resolvedHead}^`);
  } catch (error) {
    console.error(`Unable to resolve base ref (${baseRef}): ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

let diffCount = 0;
try {
  const mergeBase = runGit('merge-base', resolvedHead, resolvedBase);
  const diffRaw = runGit('diff', '--name-only', mergeBase, resolvedHead);
  diffCount = diffRaw ? diffRaw.split('\n').filter(Boolean).length : 0;
} catch (error) {
  console.error(`Unable to compute git diff: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (diffCount > 0 && Number(scas.files_changed ?? 0) === 0) {
  console.error(`SCAS fail-open detected: git shows ${diffCount} files but scas attestation reports 0`);
  process.exit(1);
}

console.log('SCAS attestation matches diff cardinality');
