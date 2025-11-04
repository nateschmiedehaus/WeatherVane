import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { execa } from 'execa';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  PromptAttestationManager,
  type PromptSpec,
} from '../../src/orchestrator/prompt_attestation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../dist/scripts/update_prompt_baseline.js',
);

const BASELINES_PATH = (root: string) =>
  path.join(root, 'state/process/prompt_baselines.json');
const BASELINE_LOG_PATH = (root: string) =>
  path.join(root, 'state/process/prompt_baseline_updates.jsonl');

describe('update_prompt_baseline CLI', () => {
  let workspaceRoot: string;
  let manager: PromptAttestationManager;

  const createPromptSpec = (
    overrides: Partial<PromptSpec> = {},
  ): PromptSpec => ({
    phase: 'IMPLEMENT',
    taskId: 'CLI-TASK',
    timestamp: new Date().toISOString(),
    requirements: ['req-1'],
    qualityGates: ['gate-1'],
    artifacts: ['a.ts'],
    contextSummary: 'Temp context',
    agentType: 'test-runner',
    modelVersion: 'vitest',
    ...overrides,
  });

  beforeEach(async () => {
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'update-prompt-baseline-'),
    );
    manager = new PromptAttestationManager(workspaceRoot);
    await manager.initialize();
  });

  afterEach(async () => {
    if (fs.existsSync(workspaceRoot)) {
      await fsPromises.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('adopts an explicit hash and records audit metadata', async () => {
    const explicitHash = '6f9c7d48a1b245d3fcbf0ab8a0f1d9df';
    const result = await execa(
      'node',
      [
        SCRIPT_PATH,
        '--task',
        'CLI-TASK',
        '--phase',
        'IMPLEMENT',
        '--hash',
        explicitHash,
        '--updated-by',
        'tester@example.com',
        '--reason',
        'intentional prompt tweak',
        '--version-tag',
        'v2',
      ],
      {
        env: {
          ...process.env,
          WVO_WORKSPACE_ROOT: workspaceRoot,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    const baselines = JSON.parse(
      await fsPromises.readFile(BASELINES_PATH(workspaceRoot), 'utf-8'),
    );
    expect(baselines['CLI-TASK:IMPLEMENT'].hash).toBe(explicitHash);
    expect(baselines['CLI-TASK:IMPLEMENT'].version).toBe(1);
    expect(baselines['CLI-TASK:IMPLEMENT'].updatedBy).toBe(
      'tester@example.com',
    );

    const logContent = await fsPromises.readFile(
      BASELINE_LOG_PATH(workspaceRoot),
      'utf-8',
    );
    const entries = logContent
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(entries.at(-1)).toMatchObject({
      taskId: 'CLI-TASK',
      phase: 'IMPLEMENT',
      hash: explicitHash,
      version: 1,
      updatedBy: 'tester@example.com',
      reason: 'intentional prompt tweak',
      versionTag: 'v2',
    });
  });

  it('adopts latest attestation hash when requested', async () => {
    const baseline = createPromptSpec();
    await manager.attest(baseline);
    const driftSpec = createPromptSpec({
      requirements: ['req-1', 'req-2'],
    });
    const driftResult = await manager.attest(driftSpec);
    expect(driftResult.hasDrift).toBe(true);

    const result = await execa(
      'node',
      [
        SCRIPT_PATH,
        '--task',
        'CLI-TASK',
        '--phase',
        'IMPLEMENT',
        '--use-latest',
        '--updated-by',
        'automation',
      ],
      {
        env: {
          ...process.env,
          WVO_WORKSPACE_ROOT: workspaceRoot,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    const baselines = JSON.parse(
      await fsPromises.readFile(BASELINES_PATH(workspaceRoot), 'utf-8'),
    );
    expect(baselines['CLI-TASK:IMPLEMENT'].hash).toBe(
      driftResult.currentHash,
    );
    expect(baselines['CLI-TASK:IMPLEMENT'].version).toBe(2);
    expect(baselines['CLI-TASK:IMPLEMENT'].updatedBy).toBe('automation');
  });

  it('fails fast when neither --hash nor --use-latest provided', async () => {
    await expect(
      execa(
        'node',
        [SCRIPT_PATH, '--task', 'CLI-TASK', '--phase', 'IMPLEMENT'],
        {
          env: {
            ...process.env,
            WVO_WORKSPACE_ROOT: workspaceRoot,
          },
        },
      ),
    ).rejects.toHaveProperty('exitCode', 1);

    const baselines = JSON.parse(
      await fsPromises.readFile(BASELINES_PATH(workspaceRoot), 'utf-8'),
    );
    expect(baselines).toEqual({});
  });
});
