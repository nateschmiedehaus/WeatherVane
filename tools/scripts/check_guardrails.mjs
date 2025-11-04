#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const requiredFiles = [
  'meta/dep_rules.yaml',
  'meta/tools_policy.yaml',
  'meta/git_tree_policy.md',
  'CODEOWNERS'
];

const ownershipTargets = ['apps', 'docs', 'shared', 'state', 'tools'];

async function ensureFileExists(filePath) {
  const abs = path.resolve(filePath);
  const stat = await fs.stat(abs);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${filePath} is missing or empty`);
  }
}

async function ensureOwnership(dir) {
  const owners = path.resolve(dir, 'OWNERS.yaml');
  const module = path.resolve(dir, 'module.yaml');
  const ownersStat = await fs.stat(owners);
  if (!ownersStat.isFile() || ownersStat.size === 0) {
    throw new Error(`${owners} is missing or empty`);
  }
  const moduleStat = await fs.stat(module);
  if (!moduleStat.isFile() || moduleStat.size === 0) {
    throw new Error(`${module} is missing or empty`);
  }
}

async function recordViolation(message) {
  const outDir = path.resolve('state/evidence/guardrails');
  await fs.mkdir(outDir, { recursive: true });
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    message
  }) + '\n';
  await fs.appendFile(path.join(outDir, 'violations.jsonl'), line);
}

async function main() {
  const failures = [];

  for (const file of requiredFiles) {
    try {
      await ensureFileExists(file);
    } catch (err) {
      failures.push(err.message);
    }
  }

  for (const dir of ownershipTargets) {
    try {
      await ensureOwnership(dir);
    } catch (err) {
      failures.push(err.message);
    }
  }

  if (failures.length) {
    console.error('Guardrail check failed:');
    for (const line of failures) {
      console.error(`  - ${line}`);
      await recordViolation(line);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Guardrails validated: required files and stewardship manifests present.');
}

main().catch(async err => {
  console.error('Guardrail validation error:', err);
  await recordViolation(err.message);
  process.exitCode = 1;
});
