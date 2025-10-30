import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { evaluateStructuralPolicy } from '../check_structural_policy.js';

const SRC_PREFIX = 'tools/wvo_mcp/src';

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'structural-policy-'));
}

async function ensureDir(workspace: string, relative: string) {
  await mkdir(path.join(workspace, relative), { recursive: true });
}

describe('check_structural_policy', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await makeWorkspace();
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('passes when no source files are changed', async () => {
    const report = await evaluateStructuralPolicy({ workspaceRoot, changedFiles: [] });
    expect(report.status).toBe('passed');
    expect(report.summary.checkedFiles).toBe(0);
  });

  it('fails when source file lacks companion test', async () => {
    const sourcePath = path.join(SRC_PREFIX, 'foo', 'bar.ts');
    await ensureDir(workspaceRoot, path.dirname(sourcePath));
    await writeFile(path.join(workspaceRoot, sourcePath), 'export const bar = 1;\n', 'utf-8');

    const report = await evaluateStructuralPolicy({
      workspaceRoot,
      changedFiles: [path.normalize(sourcePath)],
    });

    expect(report.status).toBe('failed');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.file).toBe(path.normalize(sourcePath));
  });

  it('passes when companion test exists', async () => {
    const sourcePath = path.join(SRC_PREFIX, 'util', 'math.ts');
    const testPath = path.join(SRC_PREFIX, 'util', '__tests__', 'math.test.ts');

    await ensureDir(workspaceRoot, path.dirname(sourcePath));
    await ensureDir(workspaceRoot, path.dirname(testPath));
    await writeFile(path.join(workspaceRoot, sourcePath), 'export const add = (a: number, b: number) => a + b;\n', 'utf-8');
    await writeFile(path.join(workspaceRoot, testPath), 'import { add } from "../math";\n', 'utf-8');

    const report = await evaluateStructuralPolicy({
      workspaceRoot,
      changedFiles: [path.normalize(sourcePath)],
    });

    expect(report.status).toBe('passed');
    expect(report.summary.violations).toBe(0);
  });

  it('honors allowlist entries', async () => {
    const sourcePath = path.join(SRC_PREFIX, 'telemetry', 'constants.ts');
    await ensureDir(workspaceRoot, path.dirname(sourcePath));
    await writeFile(path.join(workspaceRoot, sourcePath), 'export const CONSTANT = 42;\n', 'utf-8');

    const allowlistPath = path.join(workspaceRoot, 'allowlist.json');
    await writeFile(
      allowlistPath,
      JSON.stringify({ paths: [path.normalize(sourcePath)] }, null, 2),
      'utf-8',
    );

    const report = await evaluateStructuralPolicy({
      workspaceRoot,
      changedFiles: [path.normalize(sourcePath)],
      allowlistPath,
    });

    expect(report.status).toBe('passed');
    expect(report.summary.allowlisted).toBe(1);
  });
});
