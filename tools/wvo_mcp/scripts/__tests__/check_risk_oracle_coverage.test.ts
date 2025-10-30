import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { evaluateCoverage } from '../check_risk_oracle_coverage.js';
import type { RiskOracleMap } from '../../src/automation/risk_oracle_schema.js';

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'risk-oracle-'));
}

async function writeJson(workspace: string, relative: string, data: unknown) {
  await mkdir(path.join(workspace, path.dirname(relative)), { recursive: true });
  await writeFile(path.join(workspace, relative), JSON.stringify(data, null, 2), 'utf-8');
}

describe('check_risk_oracle_coverage', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await makeWorkspace();
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('passes when all risks have evidence', async () => {
    const taskId = 'TASK-123';
    const map: RiskOracleMap = {
      risks: [
        { risk_id: 'async_timeout', description: 'Async ops may hang', oracle: 'determinism_check', phase: 'VERIFY' },
        { risk_id: 'regression', description: 'Tests may break', oracle: 'tests', phase: 'VERIFY' },
      ],
    };

    await writeJson(workspaceRoot, `state/evidence/${taskId}/think/risk_oracle_map.json`, map);
    await writeJson(workspaceRoot, `state/evidence/${taskId}/verify/determinism_check.json`, { status: 'passed' });
    await writeJson(workspaceRoot, `state/evidence/${taskId}/verify/test_results.json`, { status: 'passed' });

    const report = await evaluateCoverage({ workspaceRoot, taskId });
    expect(report.status).toBe('passed');
    expect(report.summary.missing).toBe(0);
  });

  it('fails when evidence missing', async () => {
    const taskId = 'TASK-456';
    const map: RiskOracleMap = {
      risks: [
        { risk_id: 'structural', description: 'Structural drift', oracle: 'structural_policy', phase: 'VERIFY' },
      ],
    };

    await writeJson(workspaceRoot, `state/evidence/${taskId}/think/risk_oracle_map.json`, map);

    const report = await evaluateCoverage({ workspaceRoot, taskId });
    expect(report.status).toBe('failed');
    expect(report.missing[0]?.risk_id).toBe('structural');
  });

  it('warns on empty risk map', async () => {
    const taskId = 'TASK-789';
    await writeJson(workspaceRoot, `state/evidence/${taskId}/think/risk_oracle_map.json`, { risks: [] });

    const report = await evaluateCoverage({ workspaceRoot, taskId });
    expect(report.status).toBe('passed');
    expect(report.warnings).toHaveLength(1);
  });
});
