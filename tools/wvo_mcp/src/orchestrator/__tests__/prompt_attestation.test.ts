/**
 * Prompt Attestation Test - Drift Detection via SHA-256 Hashing
 *
 * Purpose: Verify prompt specification drift detection with cryptographic hashing
 *
 * Tests:
 * 1. First attestation establishes baseline
 * 2. Identical spec produces no drift
 * 3. Changed requirements trigger drift detection
 * 4. Changed artifacts trigger drift detection
 * 5. Severity based on phase criticality
 * 6. Baseline reset works correctly
 * 7. Attestation history tracking
 * 8. Drift statistics calculation
 * 9. Hash consistency (sorted arrays)
 * 10. Fail-open error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptAttestationManager, type PromptSpec } from '../prompt_attestation.js';
import { WorkPhase } from '../work_process_enforcer.js';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

describe('PromptAttestationManager - Drift Detection', () => {
  let attestationManager: PromptAttestationManager;
  let testWorkspaceRoot: string;
  let baselinePath: string;
  let attestationPath: string;

  // Helper to create a test prompt spec
  const createPromptSpec = (overrides?: Partial<PromptSpec>): PromptSpec => ({
    phase: 'IMPLEMENT',
    taskId: 'TEST-001',
    timestamp: new Date().toISOString(),
    requirements: ['req1', 'req2', 'req3'],
    qualityGates: ['gate1', 'gate2'],
    artifacts: ['artifact1.ts', 'artifact2.ts'],
    contextSummary: 'Test context summary',
    agentType: 'test-agent',
    modelVersion: 'claude-sonnet-4',
    ...overrides
  });

  beforeEach(async () => {
    // Create a temporary workspace for testing
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attestation-test-'));
    baselinePath = path.join(testWorkspaceRoot, 'state/process/prompt_baselines.json');
    attestationPath = path.join(testWorkspaceRoot, 'state/process/prompt_attestations.jsonl');

    attestationManager = new PromptAttestationManager(testWorkspaceRoot);
    await attestationManager.initialize();
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testWorkspaceRoot)) {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
  });

  describe('Baseline Establishment', () => {
    it('establishes baseline on first attestation', async () => {
      const spec = createPromptSpec();
      const result = await attestationManager.attest(spec);

      expect(result.hasDrift).toBe(false);
      expect(result.currentHash).toBeTruthy();
      expect(result.baselineHash).toBeUndefined();
      expect(result.severity).toBe('none');

      // Verify baseline file was created
      expect(fs.existsSync(baselinePath)).toBe(true);
    });

    it('creates different baselines for different task/phase combinations', async () => {
      const spec1 = createPromptSpec({ taskId: 'TASK-A', phase: 'IMPLEMENT' });
      const spec2 = createPromptSpec({ taskId: 'TASK-A', phase: 'VERIFY' });
      const spec3 = createPromptSpec({ taskId: 'TASK-B', phase: 'IMPLEMENT' });

      await attestationManager.attest(spec1);
      await attestationManager.attest(spec2);
      await attestationManager.attest(spec3);

      const baselines = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

      expect(baselines['TASK-A:IMPLEMENT']).toBeTruthy();
      expect(baselines['TASK-A:VERIFY']).toBeTruthy();
      expect(baselines['TASK-B:IMPLEMENT']).toBeTruthy();

      // Different combinations should have different hashes
      expect(baselines['TASK-A:IMPLEMENT']).not.toBe(baselines['TASK-A:VERIFY']);
      expect(baselines['TASK-A:IMPLEMENT']).not.toBe(baselines['TASK-B:IMPLEMENT']);
    });
  });

  describe('Drift Detection', () => {
    it('detects no drift for identical spec', async () => {
      const spec = createPromptSpec();

      // First attestation
      const result1 = await attestationManager.attest(spec);
      expect(result1.hasDrift).toBe(false);

      // Second attestation with identical spec
      const result2 = await attestationManager.attest(spec);
      expect(result2.hasDrift).toBe(false);
      expect(result2.currentHash).toBe(result1.currentHash);
    });

    it('detects drift when requirements change', async () => {
      const spec1 = createPromptSpec({ requirements: ['req1', 'req2'] });
      const spec2 = createPromptSpec({ requirements: ['req1', 'req2', 'req3'] });

      const result1 = await attestationManager.attest(spec1);
      expect(result1.hasDrift).toBe(false);

      const result2 = await attestationManager.attest(spec2);
      expect(result2.hasDrift).toBe(true);
      expect(result2.baselineHash).toBe(result1.currentHash);
      expect(result2.currentHash).not.toBe(result1.currentHash);
    });

    it('detects drift when quality gates change', async () => {
      const spec1 = createPromptSpec({ qualityGates: ['gate1'] });
      const spec2 = createPromptSpec({ qualityGates: ['gate1', 'gate2'] });

      await attestationManager.attest(spec1);
      const result2 = await attestationManager.attest(spec2);

      expect(result2.hasDrift).toBe(true);
    });

    it('detects drift when artifacts change', async () => {
      const spec1 = createPromptSpec({ artifacts: ['file1.ts'] });
      const spec2 = createPromptSpec({ artifacts: ['file1.ts', 'file2.ts'] });

      await attestationManager.attest(spec1);
      const result2 = await attestationManager.attest(spec2);

      expect(result2.hasDrift).toBe(true);
    });

    it('detects drift when context summary changes', async () => {
      const spec1 = createPromptSpec({ contextSummary: 'Context A' });
      const spec2 = createPromptSpec({ contextSummary: 'Context B' });

      await attestationManager.attest(spec1);
      const result2 = await attestationManager.attest(spec2);

      expect(result2.hasDrift).toBe(true);
    });

    it('handles array order independence (sorted arrays)', async () => {
      const spec1 = createPromptSpec({ requirements: ['req1', 'req2', 'req3'] });
      const spec2 = createPromptSpec({ requirements: ['req3', 'req1', 'req2'] });

      const result1 = await attestationManager.attest(spec1);
      const result2 = await attestationManager.attest(spec2);

      // Should not detect drift because arrays are sorted before hashing
      expect(result2.hasDrift).toBe(false);
      expect(result2.currentHash).toBe(result1.currentHash);
    });
  });

  describe('Severity Calculation', () => {
    it('assigns high severity to critical phases', async () => {
      const criticalPhases: WorkPhase[] = ['VERIFY', 'REVIEW', 'MONITOR'];

      for (const phase of criticalPhases) {
        const spec1 = createPromptSpec({ phase, requirements: ['req1'] });
        const spec2 = createPromptSpec({ phase, requirements: ['req1', 'req2'] });

        await attestationManager.attest(spec1);
        const result = await attestationManager.attest(spec2);

        expect(result.hasDrift).toBe(true);
        expect(result.severity).toBe('high');
      }
    });

    it('assigns low severity to early phases', async () => {
      const earlyPhases: WorkPhase[] = ['STRATEGIZE', 'SPEC', 'PLAN'];

      for (const phase of earlyPhases) {
        const spec1 = createPromptSpec({ phase, requirements: ['req1'] });
        const spec2 = createPromptSpec({ phase, requirements: ['req1', 'req2'] });

        await attestationManager.attest(spec1);
        const result = await attestationManager.attest(spec2);

        expect(result.hasDrift).toBe(true);
        expect(result.severity).toBe('low');
      }
    });

    it('assigns medium severity to implementation phases', async () => {
      const implementPhases: WorkPhase[] = ['IMPLEMENT', 'PR'];

      for (const phase of implementPhases) {
        const spec1 = createPromptSpec({ phase, requirements: ['req1'] });
        const spec2 = createPromptSpec({ phase, requirements: ['req1', 'req2'] });

        await attestationManager.attest(spec1);
        const result = await attestationManager.attest(spec2);

        expect(result.hasDrift).toBe(true);
        expect(result.severity).toBe('medium');
      }
    });

    it('provides severity-based recommendations', async () => {
      const spec1 = createPromptSpec({ phase: 'VERIFY', requirements: ['req1'] });
      const spec2 = createPromptSpec({ phase: 'VERIFY', requirements: ['req1', 'req2'] });

      await attestationManager.attest(spec1);
      const result = await attestationManager.attest(spec2);

      expect(result.recommendation).toContain('CRITICAL');
      expect(result.recommendation).toContain('review immediately');
    });
  });

  describe('Baseline Reset', () => {
    it('resets baseline to new hash', async () => {
      const spec1 = createPromptSpec({ requirements: ['req1'] });
      const spec2 = createPromptSpec({ requirements: ['req1', 'req2'] });

      const result1 = await attestationManager.attest(spec1);
      const result2 = await attestationManager.attest(spec2);

      expect(result2.hasDrift).toBe(true);

      // Reset baseline to new hash
      await attestationManager.resetBaseline('TEST-001', 'IMPLEMENT', result2.currentHash);

      // Now spec2 should match baseline
      const result3 = await attestationManager.attest(spec2);
      expect(result3.hasDrift).toBe(false);
    });
  });

  describe('Attestation History', () => {
    it('records all attestations to JSONL', async () => {
      const spec = createPromptSpec();

      await attestationManager.attest(spec);
      await attestationManager.attest(spec);
      await attestationManager.attest(spec);

      expect(fs.existsSync(attestationPath)).toBe(true);

      const content = fs.readFileSync(attestationPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(3);

      // Each line should be valid JSON
      lines.forEach(line => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });

    it('retrieves attestation history for specific task', async () => {
      const spec1 = createPromptSpec({ taskId: 'TASK-A' });
      const spec2 = createPromptSpec({ taskId: 'TASK-B' });

      await attestationManager.attest(spec1);
      await attestationManager.attest(spec1);
      await attestationManager.attest(spec2);

      const historyA = await attestationManager.getAttestationHistory('TASK-A');
      const historyB = await attestationManager.getAttestationHistory('TASK-B');

      expect(historyA).toHaveLength(2);
      expect(historyB).toHaveLength(1);

      expect(historyA[0].task_id).toBe('TASK-A');
      expect(historyB[0].task_id).toBe('TASK-B');
    });

    it('includes drift detection status in history', async () => {
      const spec1 = createPromptSpec({ requirements: ['req1'] });
      const spec2 = createPromptSpec({ requirements: ['req1', 'req2'] });

      await attestationManager.attest(spec1);
      await attestationManager.attest(spec2);

      const history = await attestationManager.getAttestationHistory('TEST-001');

      expect(history[0].drift_detected).toBe(false);
      expect(history[1].drift_detected).toBe(true);
    });
  });

  describe('Drift Statistics', () => {
    it('calculates drift statistics correctly', async () => {
      const spec1 = createPromptSpec({ requirements: ['req1'] });
      const spec2 = createPromptSpec({ requirements: ['req1', 'req2'] });

      // 3 attestations without drift
      await attestationManager.attest(spec1);
      await attestationManager.attest(spec1);
      await attestationManager.attest(spec1);

      // 2 attestations with drift
      await attestationManager.attest(spec2);
      await attestationManager.attest(spec2);

      const stats = await attestationManager.getDriftStats();

      expect(stats.totalAttestations).toBe(5);
      expect(stats.driftDetections).toBe(2);
      expect(stats.driftRate).toBeCloseTo(0.4, 2); // 2/5 = 0.4
    });

    it('returns zero stats for empty history', async () => {
      const stats = await attestationManager.getDriftStats();

      expect(stats.totalAttestations).toBe(0);
      expect(stats.driftDetections).toBe(0);
      expect(stats.driftRate).toBe(0);
    });
  });

  describe('Hash Consistency', () => {
    it('produces consistent hashes for same input', async () => {
      const spec1 = createPromptSpec();
      const spec2 = createPromptSpec(); // Identical to spec1

      const result1 = await attestationManager.attest(spec1);
      const result2 = await attestationManager.attest(spec2);

      expect(result1.currentHash).toBe(result2.currentHash);
    });

    it('produces different hashes for different inputs', async () => {
      const spec1 = createPromptSpec({ requirements: ['req1'] });
      const spec2 = createPromptSpec({ requirements: ['req2'] });

      const result1 = await attestationManager.attest(spec1);
      const result2 = await attestationManager.attest(spec2);

      expect(result1.currentHash).not.toBe(result2.currentHash);
    });

    it('ignores timestamp in hash computation', async () => {
      const spec1 = createPromptSpec({ timestamp: '2025-01-01T00:00:00Z' });
      const spec2 = createPromptSpec({ timestamp: '2025-01-02T00:00:00Z' });

      const result1 = await attestationManager.attest(spec1);
      const result2 = await attestationManager.attest(spec2);

      // Timestamps should not affect hash
      expect(result2.hasDrift).toBe(false);
    });
  });

  describe('Error Handling (Fail-Open)', () => {
    it('returns non-drift result on error', async () => {
      // Create spec with invalid data
      const invalidSpec = {
        phase: 'INVALID_PHASE' as WorkPhase,
        taskId: 'TEST-001',
        timestamp: new Date().toISOString(),
        requirements: [],
        qualityGates: [],
        artifacts: [],
        contextSummary: ''
      };

      // Should not throw, returns fail-open result
      const result = await attestationManager.attest(invalidSpec);

      // Fail-open: attestation failures don't block progress
      expect(result.hasDrift).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('handles missing baseline file gracefully', async () => {
      // Delete baseline file
      if (fs.existsSync(baselinePath)) {
        fs.unlinkSync(baselinePath);
      }

      const spec = createPromptSpec();
      const result = await attestationManager.attest(spec);

      // Should create new baseline, not error
      expect(result.hasDrift).toBe(false);
      expect(fs.existsSync(baselinePath)).toBe(true);
    });

    it('handles corrupted baseline file', async () => {
      // Write invalid JSON to baseline
      fs.writeFileSync(baselinePath, 'INVALID JSON{]');

      const spec = createPromptSpec();

      // Should handle error gracefully (fail-open)
      const result = await attestationManager.attest(spec);
      expect(result).toBeDefined();
    });
  });

  describe('Persistence', () => {
    it('persists baselines across manager instances', async () => {
      const spec = createPromptSpec();
      const result1 = await attestationManager.attest(spec);

      // Create new manager instance
      const attestationManager2 = new PromptAttestationManager(testWorkspaceRoot);
      await attestationManager2.initialize();

      const result2 = await attestationManager2.attest(spec);

      // Should use persisted baseline
      expect(result2.hasDrift).toBe(false);
      expect(result2.baselineHash).toBe(result1.currentHash);
    });

    it('persists attestation history across manager instances', async () => {
      const spec = createPromptSpec();

      await attestationManager.attest(spec);
      await attestationManager.attest(spec);

      // Create new manager instance
      const attestationManager2 = new PromptAttestationManager(testWorkspaceRoot);
      await attestationManager2.initialize();

      const history = await attestationManager2.getAttestationHistory('TEST-001');
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Integration Scenarios', () => {
    it('handles full phase cycle attestations', async () => {
      const phases: WorkPhase[] = ['STRATEGIZE', 'SPEC', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'PR', 'MONITOR'];

      for (const phase of phases) {
        const spec = createPromptSpec({ phase });
        const result = await attestationManager.attest(spec);

        // First attestation of each phase should establish baseline
        expect(result.hasDrift).toBe(false);
      }

      const baselines = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
      expect(Object.keys(baselines).length).toBe(phases.length);
    });

    it('detects drift across multiple tasks simultaneously', async () => {
      const tasks = ['TASK-A', 'TASK-B', 'TASK-C'];

      // Establish baselines
      for (const taskId of tasks) {
        const spec = createPromptSpec({ taskId, requirements: ['req1'] });
        await attestationManager.attest(spec);
      }

      // Introduce drift in TASK-B only
      const specA = createPromptSpec({ taskId: 'TASK-A', requirements: ['req1'] });
      const specB = createPromptSpec({ taskId: 'TASK-B', requirements: ['req1', 'req2'] });
      const specC = createPromptSpec({ taskId: 'TASK-C', requirements: ['req1'] });

      const resultA = await attestationManager.attest(specA);
      const resultB = await attestationManager.attest(specB);
      const resultC = await attestationManager.attest(specC);

      expect(resultA.hasDrift).toBe(false);
      expect(resultB.hasDrift).toBe(true);
      expect(resultC.hasDrift).toBe(false);
    });
  });
});
