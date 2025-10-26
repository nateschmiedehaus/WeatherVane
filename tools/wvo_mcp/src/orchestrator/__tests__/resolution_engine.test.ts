import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runResolution } from '../resolution_engine.js';
import type { VerifierResult } from '../verifier.js';

const tmpRoot = path.join(os.tmpdir(), 'resolution-engine-');

describe('resolution_engine', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(tmpRoot);
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('builds plan delta and journals resolution entry', async () => {
    const verifier: VerifierResult = {
      success: false,
      coverageDelta: 0.2,
      coverageTarget: 0.8,
      gateResults: [],
      artifacts: {},
    };

    const result = await runResolution({
      taskId: 'T-plan',
      runId: 'run-test',
      workspaceRoot,
      verifier,
      failingGate: 'tests.run',
    });

    expect(result.label).toBe('underspecified_requirements');
    expect(result.planDelta).toContain('Resolution label');
    const journalPath = path.join(workspaceRoot, 'resources', 'runs', 'run-test', 'journal.md');
    const entry = await readFile(journalPath, 'utf-8');
    expect(entry).toContain('Resolution label');

    const resolutionDir = path.join(workspaceRoot, 'resources', 'runs', 'run-test', 'resolution');
    const artifacts = await readdir(resolutionDir);
    expect(artifacts.length).toBeGreaterThan(0);
    const artifactData = JSON.parse(await readFile(path.join(resolutionDir, artifacts[0]), 'utf-8'));
    expect(artifactData.label).toBe(result.label);
    expect(result.artifactPath).toContain('resources://runs/run-test/resolution/');
  });
});
