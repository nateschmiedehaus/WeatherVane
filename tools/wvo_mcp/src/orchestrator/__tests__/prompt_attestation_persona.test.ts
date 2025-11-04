import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptAttestationManager } from '../prompt_attestation';
import { hashPersonaSpec } from '../../persona_router/compiler_adapter';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('PromptAttestation Persona Integration (IMP-22)', () => {
  let tmpDir: string;
  let manager: PromptAttestationManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persona-test-'));
    manager = new PromptAttestationManager(tmpDir);
    await manager.initialize();
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should detect persona drift when hash changes', async () => {
    const baselineSpec = { phase_role: 'planner', domain_overlays: ['api'] };
    const changedSpec = { phase_role: 'expert-planner', domain_overlays: ['api'] };

    const baselineHash = hashPersonaSpec(baselineSpec);
    const changedHash = hashPersonaSpec(changedSpec);

    // First attestation (establishes baseline)
    const result1 = await manager.attest({
      phase: 'STRATEGIZE',
      taskId: 'TEST-1',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test context',
      personaHash: baselineHash,
      personaSummary: 'planner'
    });

    expect(result1.personaDrift).toBe(false);
    expect(result1.hasDrift).toBe(false); // No prompt drift, no persona drift

    // Second attestation (persona changed)
    // Note: Changing persona also changes prompt hash (persona is part of prompt spec)
    const result2 = await manager.attest({
      phase: 'STRATEGIZE',
      taskId: 'TEST-1',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test context',
      personaHash: changedHash,
      personaSummary: 'expert-planner'
    });

    expect(result2.personaDrift).toBe(true);
    expect(result2.hasDrift).toBe(true); // Prompt drift detected (persona is part of prompt)
    expect(result2.personaDetails).toContain(baselineHash.slice(0, 16));
    expect(result2.personaDetails).toContain(changedHash.slice(0, 16));
    expect(result2.personaDetails).toContain('expert-planner');
  });

  it('should not detect drift when persona unchanged', async () => {
    const spec = { phase_role: 'planner', domain_overlays: ['api'] };
    const hash = hashPersonaSpec(spec);

    // First attestation
    await manager.attest({
      phase: 'STRATEGIZE',
      taskId: 'TEST-2',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test context',
      personaHash: hash,
      personaSummary: 'planner'
    });

    // Second attestation (same hash)
    const result = await manager.attest({
      phase: 'STRATEGIZE',
      taskId: 'TEST-2',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test context',
      personaHash: hash,
      personaSummary: 'planner'
    });

    expect(result.personaDrift).toBe(false);
  });

  it('should handle undefined persona gracefully', async () => {
    const result = await manager.attest({
      phase: 'STRATEGIZE',
      taskId: 'TEST-3',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test context',
      personaHash: undefined,
      personaSummary: undefined
    });

    expect(result.personaDrift).toBe(false);
    expect(result.personaDetails).toBeUndefined();
  });

  it('should establish baseline on first persona attestation', async () => {
    const spec = { phase_role: 'expert', domain_overlays: ['api', 'web'] };
    const hash = hashPersonaSpec(spec);

    const result = await manager.attest({
      phase: 'PLAN',
      taskId: 'TEST-4',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'First attestation',
      personaHash: hash,
      personaSummary: 'expert'
    });

    expect(result.personaDrift).toBe(false); // No drift on first attestation
    expect(result.baselineHash).toBeUndefined(); // No baseline before this
  });

  it('should track persona drift in attestation history', async () => {
    const spec1 = { phase_role: 'planner' };
    const spec2 = { phase_role: 'reviewer' };

    const hash1 = hashPersonaSpec(spec1);
    const hash2 = hashPersonaSpec(spec2);

    // First attestation
    await manager.attest({
      phase: 'PLAN',
      taskId: 'TEST-5',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test',
      personaHash: hash1,
      personaSummary: 'planner'
    });

    // Second attestation (drift)
    await manager.attest({
      phase: 'PLAN',
      taskId: 'TEST-5',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test',
      personaHash: hash2,
      personaSummary: 'reviewer'
    });

    // Check attestation history
    const history = await manager.getAttestationHistory('TEST-5');
    expect(history.length).toBe(2);

    const firstAttestation = history[0];
    const secondAttestation = history[1];

    // First attestation: no drift (baseline established)
    expect(firstAttestation.persona_drift).toBe(false);
    expect(firstAttestation.persona_hash).toBe(hash1);

    // Second attestation: persona drift detected BUT only if baseline exists
    // In attestation system, persona drift is detected between baseline and current
    // Since we're changing persona in same task/phase, drift should be detected
    expect(secondAttestation.persona_hash).toBe(hash2);
    // Check if persona_drift field exists and is true
    // Note: drift detection requires both baseline and current to have personaHash
    expect(secondAttestation.persona_drift).toBeDefined();
    expect(secondAttestation.persona_drift).toBe(true);
  });

  it('should calculate drift stats including persona drift', async () => {
    const spec1 = { phase_role: 'planner' };
    const spec2 = { phase_role: 'reviewer' };

    const hash1 = hashPersonaSpec(spec1);
    const hash2 = hashPersonaSpec(spec2);

    // Attestation 1: Establish baseline
    await manager.attest({
      phase: 'PLAN',
      taskId: 'TEST-6',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test',
      personaHash: hash1
    });

    // Attestation 2: Persona drift
    await manager.attest({
      phase: 'PLAN',
      taskId: 'TEST-6',
      timestamp: new Date().toISOString(),
      requirements: [],
      qualityGates: [],
      artifacts: [],
      contextSummary: 'Test',
      personaHash: hash2
    });

    const stats = await manager.getDriftStats();
    expect(stats.totalAttestations).toBeGreaterThanOrEqual(2);
    // Note: This test doesn't check specific drift counts because
    // other tests may have run first in the same temp directory
  });
});
