import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CriticIntelligenceEngine } from '../critics/intelligence_engine.js';
import { TestsCritic } from '../critics/tests.js';

vi.mock('../executor/command_runner.js', () => {
  return {
    runCommand: vi.fn(async () => ({
      code: 1,
      stdout: '',
      stderr: 'AssertionError: Expected true to be false',
    })),
  };
});

describe('Critic intelligence integration', () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wvo-critic-test-'));
    tempRoots.push(dir);
  });

  afterAll(() => {
    for (const dir of tempRoots) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.resetModules();
  });

  it('records failure history and surfaces analysis when intelligence enabled', async () => {
    const workspaceRoot = tempRoots[tempRoots.length - 1];
    const intelligence = new CriticIntelligenceEngine({
      workspaceRoot,
      critic: 'tests',
      intelligenceLevel: 2,
    });

    const first = await intelligence.analyzeFailure('AssertionError: Expected true to be false');
    expect(first?.category).toBe('test_failure');
    expect(first?.history.similarFailures).toBe(1);

    const critic = new TestsCritic(workspaceRoot, {
      intelligenceEnabled: true,
      intelligenceLevel: 2,
    });
    const result = await critic.run('low');
    expect(result.analysis).not.toBeNull();
    expect(result.analysis?.category).toBe('test_failure');
    expect(result.analysis?.history.similarFailures).toBeGreaterThanOrEqual(2);
  });
});
