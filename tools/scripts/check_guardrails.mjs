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
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile() || stat.size === 0) {
      throw new Error(`${filePath} is missing or empty`);
    }
  } catch (err) {
    throw new Error(`${filePath} not found: ${err.message}`);
  }
}

async function ensureOwnership(dir) {
  const owners = path.resolve(dir, 'OWNERS.yaml');
  const module = path.resolve(dir, 'module.yaml');
  try {
    const ownersStat = await fs.stat(owners);
    if (!ownersStat.isFile() || ownersStat.size === 0) {
      throw new Error(`${owners} is missing or empty`);
    }
  } catch (err) {
    throw new Error(`${owners} not found: ${err.message}`);
  }
  try {
    const moduleStat = await fs.stat(module);
    if (!moduleStat.isFile() || moduleStat.size === 0) {
      throw new Error(`${module} is missing or empty`);
    }
  } catch (err) {
    throw new Error(`${module} not found: ${err.message}`);
  }
}

async function main() {
  for (const file of requiredFiles) {
    await ensureFileExists(file);
  }

  const ownershipFailures = [];
  for (const dir of ownershipTargets) {
    try {
      await ensureOwnership(dir);
    } catch (err) {
      ownershipFailures.push(err.message);
    }
  }

  if (ownershipFailures.length) {
    console.error('Guardrail check failed:');
    for (const line of ownershipFailures) {
      console.error(`  - ${line}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Guardrails validated: required files and stewardship manifests present.');
}

main().catch(err => {
  console.error('Guardrail validation error:', err);
  process.exitCode = 1;
});
