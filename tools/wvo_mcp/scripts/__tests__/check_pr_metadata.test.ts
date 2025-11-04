import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { evaluateMetadata } from '../check_pr_metadata.js';

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'pr-metadata-'));
}

describe('check_pr_metadata', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await makeWorkspace();
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('passes when metadata files exist and valid', async () => {
    const taskId = 'TASK-PR';
    const prDir = path.join('state/evidence', taskId, 'pr');
    await mkdir(path.join(workspaceRoot, prDir), { recursive: true });
    await writeFile(path.join(workspaceRoot, prDir, 'why_now.txt'), 'Improves enforcement coverage.\n', 'utf-8');
    await writeFile(path.join(workspaceRoot, prDir, 'pr_risk_label.txt'), 'medium\n', 'utf-8');

    const report = await evaluateMetadata({ workspaceRoot, taskId });
    expect(report.status).toBe('passed');
    expect(report.issues).toHaveLength(0);
  });

  it('fails when files missing', async () => {
    const taskId = 'TASK-MISSING';
    const report = await evaluateMetadata({ workspaceRoot, taskId });
    expect(report.status).toBe('failed');
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it('fails when risk label invalid', async () => {
    const taskId = 'TASK-BAD-RISK';
    const prDir = path.join('state/evidence', taskId, 'pr');
    await mkdir(path.join(workspaceRoot, prDir), { recursive: true });
    await writeFile(path.join(workspaceRoot, prDir, 'why_now.txt'), 'Important change.\n', 'utf-8');
    await writeFile(path.join(workspaceRoot, prDir, 'pr_risk_label.txt'), 'unknown\n', 'utf-8');

    const report = await evaluateMetadata({ workspaceRoot, taskId });
    expect(report.status).toBe('failed');
    expect(report.issues[0]).toContain('Invalid risk label');
  });
});
