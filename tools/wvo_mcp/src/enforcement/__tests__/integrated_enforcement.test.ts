/**
 * Integrated Enforcement Test
 *
 * Tests the COMPLETE quality control system:
 * - L1-L4: Stigmergic enforcement
 * - L5-L6: Semantic search enforcement
 * - Combined approval logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StigmergicEnforcer } from '../stigmergic_enforcer.js';
import type { Task } from '../../wave0/task_executor.js';

describe('Integrated Quality Control System', () => {
  let enforcer: StigmergicEnforcer;
  let workspaceRoot: string;
  let evidencePath: string;
  let task: Task;

  beforeEach(() => {
    // Setup test workspace
    workspaceRoot = path.join(__dirname, '../../../../..'); // Point to actual workspace
    evidencePath = path.join(workspaceRoot, 'state', 'evidence', 'TEST-TASK-001');

    // Create test task
    task = {
      id: 'TEST-TASK-001',
      title: 'Test integrated enforcement',
      status: 'in_progress'
    };

    // Create evidence directory
    if (!fs.existsSync(evidencePath)) {
      fs.mkdirSync(evidencePath, { recursive: true });
    }

    // Initialize enforcer
    enforcer = new StigmergicEnforcer(workspaceRoot);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(evidencePath)) {
      fs.rmSync(evidencePath, { recursive: true, force: true });
    }
    enforcer.destroy();
  });

  describe('Combined Enforcement (L1-L6)', () => {
    it('should BLOCK when both stigmergic and semantic layers detect issues', async () => {
      // Create low-quality evidence (fails L1: word count)
      const lowQualityEvidence = `# Strategize

This is too short to be meaningful work.
Only 10 words total.`;

      fs.writeFileSync(path.join(evidencePath, 'strategize.md'), lowQualityEvidence);

      // Mock phase start (simulate rushed work - fails L2)
      enforcer.recordPhaseStart(task.id, 'strategize');

      // Execute enforcement
      const result = await enforcer.enforcePhaseCompletion(
        task,
        'strategize',
        {}
      );

      // Should be blocked by BOTH systems
      expect(result.approved).toBe(false);
      expect(result.bypassDetected).toBe(true);

      // Should have concerns from both layers
      expect(result.concerns.length).toBeGreaterThan(0);
      expect(result.concerns.some(c => c.includes('word count'))).toBe(true); // L1

      // Check metadata
      expect(result.metadata.wordCount).toBeLessThan(500);
      expect(result.metadata.layerSignals['L1_CONSTITUTIONAL']).toBeGreaterThan(0);
    });

    it('should BLOCK when semantic layer finds missing citations (L5)', async () => {
      // Create evidence without any citations
      const noCitationsEvidence = `# Strategize

## Problem Analysis
We need to solve this complex problem that clearly relates to existing
architectural decisions and specifications.

## Root Cause
The root cause is a fundamental architectural issue that should reference
our ADRs but doesn't cite any of them.

## Proposed Solution
We will implement a solution that ignores all existing patterns and
constraints documented in our specs and ADRs.

This is a detailed analysis with sufficient word count but zero citations
to any existing decisions, specs, or documentation. This violates L5
retrieval requirements.

${Array(100).fill('Additional content to meet word count requirements.').join(' ')}
`;

      fs.writeFileSync(path.join(evidencePath, 'strategize.md'), noCitationsEvidence);

      // Set proper duration to pass L2
      enforcer.recordPhaseStart(task.id, 'strategize');
      const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;
      enforcer['taskStartTimes'].set(`${task.id}:strategize`, twentyMinutesAgo);

      // Execute enforcement
      const result = await enforcer.enforcePhaseCompletion(
        task,
        'strategize',
        {}
      );

      // Should pass stigmergic but may fail semantic
      expect(result.metadata.wordCount).toBeGreaterThan(500); // Passes L1
      expect(result.metadata.duration).toBeGreaterThan(10); // Passes L2

      // If semantic is initialized, should have citation concerns
      if (result.metadata.semanticResult) {
        expect(result.metadata.semanticResult.citations.length).toBeDefined();
        if (result.metadata.semanticResult.citations.length < 5) {
          expect(result.approved).toBe(false);
          expect(result.concerns.some(c => c.includes('context') || c.includes('citation'))).toBe(true);
        }
      }
    });

    it('should APPROVE when all layers pass', async () => {
      // Create high-quality evidence with citations
      const highQualityEvidence = `# Strategize

## Problem Analysis
This task addresses the quality control issues identified in ADR-001 and SPEC-002.
The problem stems from agents bypassing quality standards, as documented in
state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/analysis.md.

## Root Cause
The root cause analysis follows the pattern established in ADR-003-root-cause-analysis.
We have identified three key factors:
1. Lack of enforcement mechanisms (see SPEC-004)
2. No semantic understanding (see docs/MANDATORY_WORK_CHECKLIST.md)
3. Missing feedback loops (see ADR-005-feedback-patterns)

## Proposed Solution
Following the architecture defined in ADR-006-quality-architecture, we will:
1. Implement stigmergic enforcement layers (L1-L4)
2. Add semantic search capabilities (L5-L6)
3. Create feedback mechanisms per SPEC-007

## Implementation Plan
The implementation follows the AFP phases as specified in docs/MANDATORY_WORK_CHECKLIST.md:
- STRATEGIZE: Complete analysis with citations
- SPEC: Define requirements referencing existing specs
- PLAN: Design with ADR compliance
- THINK: Consider edge cases from previous evidence
- GATE: Validate against quality standards
- IMPLEMENT: Code following existing patterns
- VERIFY: Test per SPEC-008-test-standards
- REVIEW: Quality check against all ADRs

## Success Criteria
Success will be measured against:
- ADR-009: Quality metrics
- SPEC-010: Performance requirements
- Evidence from previous tasks showing improvement

## Risks and Mitigations
Based on lessons from state/evidence/previous-failures/:
- Risk: Semantic drift → Mitigation: Regular reindexing
- Risk: Performance impact → Mitigation: Caching per ADR-011
- Risk: False positives → Mitigation: Tunable thresholds per SPEC-012

${Array(50).fill('This comprehensive strategy addresses all concerns with proper citations.').join(' ')}
`;

      fs.writeFileSync(path.join(evidencePath, 'strategize.md'), highQualityEvidence);

      // Set proper duration
      enforcer.recordPhaseStart(task.id, 'strategize');
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      enforcer['taskStartTimes'].set(`${task.id}:strategize`, thirtyMinutesAgo);

      // Execute enforcement
      const result = await enforcer.enforcePhaseCompletion(
        task,
        'strategize',
        {}
      );

      // Should be approved
      expect(result.approved).toBe(true);
      expect(result.bypassDetected).toBe(false);
      expect(result.remediationRequired).toBe(false);

      // Should have good metrics
      expect(result.metadata.wordCount).toBeGreaterThan(500); // Passes L1
      expect(result.metadata.duration).toBeGreaterThan(20); // Passes L2
      expect(result.metadata.layerSignals['L3_DETECTION']).toBe(0); // No bypass detected

      // Should have no critical concerns
      expect(result.concerns.filter(c => c.includes('bypass') || c.includes('BLOCK'))).toHaveLength(0);
    });

    it('should handle semantic system initialization failure gracefully', async () => {
      // Create enforcer with bad workspace to trigger init failure
      const badEnforcer = new StigmergicEnforcer('/nonexistent/path');

      // Create decent evidence
      const evidence = `# Plan

## Implementation Plan
This is a reasonable plan with sufficient detail.
${Array(100).fill('More content here.').join(' ')}
`;

      // Can't write to nonexistent path, so mock the evidence extraction
      const extractSpy = vi.spyOn(badEnforcer as any, 'extractEvidenceDocument');
      extractSpy.mockResolvedValue({
        taskId: 'TEST',
        phase: 'plan',
        path: 'test.md',
        wordCount: 500,
        sections: ['Implementation Plan']
      });

      // Should still work with stigmergic only
      const result = await badEnforcer.enforcePhaseCompletion(
        task,
        'plan',
        {}
      );

      // Should pass stigmergic checks even if semantic fails
      expect(result).toBeDefined();
      expect(result.metadata.semanticResult).toBeUndefined(); // Semantic not initialized

      badEnforcer.destroy();
    });

    it('should create remediation task when bypass detected', async () => {
      // Create evidence that triggers bypass pattern
      const bypassEvidence = `# Verify

Tests pass. Done.`; // Extremely low quality

      fs.writeFileSync(path.join(evidencePath, 'verify.md'), bypassEvidence);

      // Simulate rushed work
      enforcer.recordPhaseStart(task.id, 'verify');

      // Read current roadmap to check for changes
      const roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');
      const roadmapBefore = fs.existsSync(roadmapPath)
        ? fs.readFileSync(roadmapPath, 'utf-8')
        : '';

      // Execute enforcement
      const result = await enforcer.enforcePhaseCompletion(
        task,
        'verify',
        {}
      );

      // Should be blocked
      expect(result.approved).toBe(false);
      expect(result.bypassDetected).toBe(true);
      expect(result.remediationRequired).toBe(true);
      expect(result.remediationTaskId).toBeDefined();
      expect(result.remediationTaskId).toContain('REMEDIATION');

      // Check roadmap was updated (if it exists)
      if (fs.existsSync(roadmapPath)) {
        const roadmapAfter = fs.readFileSync(roadmapPath, 'utf-8');
        if (result.remediationTaskId) {
          expect(roadmapAfter).toContain(result.remediationTaskId);
        }
      }
    });
  });

  describe('Phase-specific Requirements', () => {
    it('should enforce different requirements for different phases', async () => {
      const phases = ['strategize', 'spec', 'plan', 'implement', 'verify'];

      for (const phase of phases) {
        // Create phase-appropriate evidence
        const evidence = `# ${phase.charAt(0).toUpperCase() + phase.slice(1)}

## Section 1
Content for ${phase} phase.

## Section 2
More detailed content here.

${Array(100).fill(`Additional ${phase} content.`).join(' ')}
`;

        fs.writeFileSync(path.join(evidencePath, `${phase}.md`), evidence);

        // Record phase with appropriate duration
        enforcer.recordPhaseStart(task.id, phase);
        const appropriateDuration = phase === 'implement' ? 90 : 30; // implement takes longer
        const startTime = Date.now() - appropriateDuration * 60 * 1000;
        enforcer['taskStartTimes'].set(`${task.id}:${phase}`, startTime);

        // Execute enforcement
        const result = await enforcer.enforcePhaseCompletion(
          task,
          phase,
          {}
        );

        // Each phase should have its own requirements checked
        expect(result.phase).toBe(phase);
        expect(result.metadata.duration).toBeGreaterThan(0);

        // Verify phase-specific thresholds are applied
        if (phase === 'implement') {
          expect(result.metadata.duration).toBeGreaterThan(60); // Longer phase
        }
      }
    });
  });

  describe('System Integration', () => {
    it('should integrate with actual file system and evidence', async () => {
      // Use real evidence from the remediation task
      const realEvidencePath = path.join(
        workspaceRoot,
        'state',
        'evidence',
        'AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V'
      );

      if (fs.existsSync(realEvidencePath)) {
        // Test with real evidence files
        const realTask: Task = {
          id: 'AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V',
          title: 'Real remediation task',
          status: 'in_progress'
        };

        // Check if strategy exists and test it
        const strategyPath = path.join(realEvidencePath, 'strategy.md');
        if (fs.existsSync(strategyPath)) {
          enforcer.recordPhaseStart(realTask.id, 'strategize');

          // Set realistic duration for real work
          const oneHourAgo = Date.now() - 60 * 60 * 1000;
          enforcer['taskStartTimes'].set(`${realTask.id}:strategize`, oneHourAgo);

          const result = await enforcer.enforcePhaseCompletion(
            realTask,
            'strategize',
            {}
          );

          // Real evidence should pass
          expect(result.approved).toBe(true);
          expect(result.metadata.wordCount).toBeGreaterThan(500);
        }
      }
    });
  });
});