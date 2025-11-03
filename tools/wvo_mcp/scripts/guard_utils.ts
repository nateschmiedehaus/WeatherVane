#!/usr/bin/env -S node --import tsx
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface CheckResult {
  name: string;
  ok: boolean;
  details?: string;
}

export interface GuardResult {
  suite: 'structure' | 'deps' | 'ownership';
  dry: boolean;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  checks: CheckResult[];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function resolveRepoRoot(): string {
  try {
    const output = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    if (output) {
      return output;
    }
  } catch {
    // ignore and fallback to cwd
  }
  return process.cwd();
}

async function runStructureChecks(root: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const policyPath = path.join(root, 'meta', 'git_tree_policy.md');
  checks.push({
    name: 'git_tree_policy_present',
    ok: await pathExists(policyPath),
    details: policyPath,
  });

  const exclusionsPath = path.join(root, 'meta', 'scan_exclusions.yaml');
  checks.push({
    name: 'scan_exclusions_present',
    ok: await pathExists(exclusionsPath),
    details: exclusionsPath,
  });

  const evidenceDir = path.join(root, 'state', 'evidence');
  checks.push({
    name: 'evidence_directory_exists',
    ok: await pathExists(evidenceDir),
    details: evidenceDir,
  });

  return checks;
}

async function runDependencyChecks(root: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const requirements = path.join(root, 'tools', 'wvo_mcp', 'python', 'requirements-tests.txt');
  const exists = await pathExists(requirements);
  let duplicateFree = false;
  let details: string | undefined;

  if (exists) {
    const raw = await readFile(requirements, 'utf-8');
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) {
        duplicates.add(normalized);
      } else {
        seen.add(normalized);
      }
    }

    duplicateFree = duplicates.size === 0;
    if (!duplicateFree) {
      details = `duplicate packages detected: ${Array.from(duplicates).join(', ')}`;
    }
  } else {
    details = 'requirements-tests.txt missing';
  }

  checks.push({
    name: 'python_requirements_present',
    ok: exists,
    details: requirements,
  });

  checks.push({
    name: 'python_requirements_unique',
    ok: exists && duplicateFree,
    details,
  });

  return checks;
}

async function runOwnershipChecks(root: string): Promise<CheckResult[]> {
  const ownershipTargets = [
    path.join(root, 'tools', 'wvo_mcp', 'OWNERS.yaml'),
    path.join(root, 'tools', 'wvo_mcp', 'scripts', 'OWNERS.yaml'),
    path.join(root, 'tools', 'wvo_mcp', 'python', 'OWNERS.yaml'),
    path.join(root, 'state', 'automation', 'OWNERS.yaml'),
  ];

  const checks: CheckResult[] = [];
  for (const target of ownershipTargets) {
    checks.push({
      name: `owners_exists:${path.relative(root, target)}`,
      ok: await pathExists(target),
      details: target,
    });
  }
  return checks;
}

export async function runGuardSuite(options: {
  suite: GuardResult['suite'];
  dry: boolean;
}): Promise<GuardResult> {
  const startedAt = new Date().toISOString();
  const { suite, dry } = options;
  const workspaceRoot = resolveRepoRoot();

  let checks: CheckResult[] = [];
  if (!dry) {
    if (suite === 'structure') {
      checks = await runStructureChecks(workspaceRoot);
    } else if (suite === 'deps') {
      checks = await runDependencyChecks(workspaceRoot);
    } else if (suite === 'ownership') {
      checks = await runOwnershipChecks(workspaceRoot);
    }
  }

  const ok = dry ? true : checks.every((check) => check.ok);

  return {
    suite,
    dry,
    ok,
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
  };
}
