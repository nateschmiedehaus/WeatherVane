/**
 * Test suite for PolicyEngine critic approval enforcement
 *
 * Tests that the policy engine correctly:
 * 1. Identifies required critics for tasks based on task ID patterns
 * 2. Tracks critic approval status for each task
 * 3. Prevents task completion until all required critics pass
 * 4. Records both passing and failing critic results
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { PolicyEngine, CriticApprovalStatus } from '../orchestrator/policy_engine.js';
import type { StateMachine } from '../orchestrator/state_machine.js';

// Mock StateMachine for testing
class MockStateMachine implements Partial<StateMachine> {
  getTasks() {
    return [];
  }
}

describe('PolicyEngine - Critic Approval Enforcement', () => {
  let policyEngine: PolicyEngine;
  let stateMachine: MockStateMachine;

  beforeEach(() => {
    stateMachine = new MockStateMachine();
    policyEngine = new PolicyEngine(stateMachine as any, {
      criticApprovalRequired: true,
      criticApprovalPatterns: {
        'T12.*': ['modeling_reality_v2', 'data_quality'],
        'T13.*': ['modeling_reality_v2', 'academic_rigor', 'causal'],
        'T-MLR-*': ['modeling_reality_v2', 'academic_rigor'],
        '*': []
      }
    });
  });

  describe('getRequiredCritics', () => {
    it('should return modeling_reality_v2 and data_quality for T12 tasks', () => {
      const critics = policyEngine.getRequiredCritics('T12.0.1');
      expect(critics).toEqual(['modeling_reality_v2', 'data_quality']);
    });

    it('should return modeling_reality_v2, academic_rigor, causal for T13 tasks', () => {
      const critics = policyEngine.getRequiredCritics('T13.2.1');
      expect(critics).toEqual(['modeling_reality_v2', 'academic_rigor', 'causal']);
    });

    it('should return modeling_reality_v2 and academic_rigor for T-MLR tasks', () => {
      const critics = policyEngine.getRequiredCritics('T-MLR-4.2');
      expect(critics).toEqual(['modeling_reality_v2', 'academic_rigor']);
    });

    it('should return empty array for tasks without specific pattern', () => {
      const critics = policyEngine.getRequiredCritics('UNKNOWN.1.1');
      expect(critics).toEqual([]);
    });

    it('should handle tasks with numeric suffixes correctly', () => {
      const critics1 = policyEngine.getRequiredCritics('T12.0.1');
      const critics2 = policyEngine.getRequiredCritics('T12.999.999');
      expect(critics1).toEqual(critics2);
    });

    it('should respect criticApprovalRequired flag', () => {
      const engine = new PolicyEngine(stateMachine as any, {
        criticApprovalRequired: false
      });
      const critics = engine.getRequiredCritics('T12.0.1');
      expect(critics).toEqual([]);
    });
  });

  describe('canCompleteTask', () => {
    it('should block task completion when no critics have been evaluated', () => {
      const canComplete = policyEngine.canCompleteTask('T12.0.1');
      expect(canComplete).toBe(false);
    });

    it('should allow task completion when all required critics have passed', () => {
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);
      policyEngine.recordCriticResult('T12.0.1', 'data_quality', true);

      const canComplete = policyEngine.canCompleteTask('T12.0.1');
      expect(canComplete).toBe(true);
    });

    it('should block task completion if any required critic failed', () => {
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);
      policyEngine.recordCriticResult('T12.0.1', 'data_quality', false, 'data quality metrics below threshold');

      const canComplete = policyEngine.canCompleteTask('T12.0.1');
      expect(canComplete).toBe(false);
    });

    it('should allow completion when no critics are required', () => {
      const canComplete = policyEngine.canCompleteTask('UNKNOWN.1.1');
      expect(canComplete).toBe(true);
    });

    it('should respect criticApprovalRequired flag for completion', () => {
      const engine = new PolicyEngine(stateMachine as any, {
        criticApprovalRequired: false
      });
      const canComplete = engine.canCompleteTask('T12.0.1');
      expect(canComplete).toBe(true);
    });

    it('should handle T13 tasks with 3 required critics', () => {
      // Initially should block
      expect(policyEngine.canCompleteTask('T13.2.1')).toBe(false);

      // Pass first two critics
      policyEngine.recordCriticResult('T13.2.1', 'modeling_reality_v2', true);
      policyEngine.recordCriticResult('T13.2.1', 'academic_rigor', true);
      expect(policyEngine.canCompleteTask('T13.2.1')).toBe(false); // Still need causal

      // Pass third critic
      policyEngine.recordCriticResult('T13.2.1', 'causal', true);
      expect(policyEngine.canCompleteTask('T13.2.1')).toBe(true);
    });
  });

  describe('recordCriticResult', () => {
    it('should record passing critic results', () => {
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);

      const status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status).not.toBeNull();
      expect(status!.passedCritics.has('modeling_reality_v2')).toBe(true);
      expect(status!.failedCritics.has('modeling_reality_v2')).toBe(false);
    });

    it('should record failing critic results with reason', () => {
      const reason = 'R² < 0.50 threshold';
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', false, reason);

      const status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status).not.toBeNull();
      expect(status!.failedCritics.has('modeling_reality_v2')).toBe(true);
      expect(status!.failedCritics.get('modeling_reality_v2')).toBe(reason);
      expect(status!.passedCritics.has('modeling_reality_v2')).toBe(false);
    });

    it('should create approval status on first critic result', () => {
      let status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status).toBeNull();

      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);

      status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status).not.toBeNull();
      expect(status!.taskId).toBe('T12.0.1');
      expect(status!.requiredCritics).toEqual(['modeling_reality_v2', 'data_quality']);
    });

    it('should update allApproved flag when all critics pass', () => {
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);
      let status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status!.allApproved).toBe(false);

      policyEngine.recordCriticResult('T12.0.1', 'data_quality', true);
      status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status!.allApproved).toBe(true);
    });

    it('should allow overriding failed critic result', () => {
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', false, 'initial failure');
      let status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status!.failedCritics.has('modeling_reality_v2')).toBe(true);

      // Re-run and pass
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);
      status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status!.passedCritics.has('modeling_reality_v2')).toBe(true);
      expect(status!.failedCritics.has('modeling_reality_v2')).toBe(false);
    });

    it('should track lastUpdated timestamp', () => {
      const before = Date.now();
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);
      const after = Date.now();

      const status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status!.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(status!.lastUpdated).toBeLessThanOrEqual(after);
    });
  });

  describe('getCriticApprovalStatus', () => {
    it('should return null for tasks without approval status', () => {
      const status = policyEngine.getCriticApprovalStatus('T99.9.9');
      expect(status).toBeNull();
    });

    it('should return full approval status with all fields', () => {
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);
      policyEngine.recordCriticResult('T12.0.1', 'data_quality', false, 'invalid data');

      const status = policyEngine.getCriticApprovalStatus('T12.0.1');
      expect(status).not.toBeNull();
      expect(status!.taskId).toBe('T12.0.1');
      expect(status!.requiredCritics).toEqual(['modeling_reality_v2', 'data_quality']);
      expect(status!.passedCritics.has('modeling_reality_v2')).toBe(true);
      expect(status!.failedCritics.has('data_quality')).toBe(true);
      expect(status!.allApproved).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multiple tasks independently', () => {
      // Task 1
      policyEngine.recordCriticResult('T12.0.1', 'modeling_reality_v2', true);
      policyEngine.recordCriticResult('T12.0.1', 'data_quality', true);

      // Task 2
      policyEngine.recordCriticResult('T13.2.1', 'modeling_reality_v2', true);
      policyEngine.recordCriticResult('T13.2.1', 'academic_rigor', false);

      // Task 1 should pass
      expect(policyEngine.canCompleteTask('T12.0.1')).toBe(true);

      // Task 2 should fail
      expect(policyEngine.canCompleteTask('T13.2.1')).toBe(false);
    });

    it('should handle sequential critic runs with retries', () => {
      const taskId = 'T12.0.1';

      // First run: modeling_reality_v2 passes, data_quality fails
      policyEngine.recordCriticResult(taskId, 'modeling_reality_v2', true);
      policyEngine.recordCriticResult(taskId, 'data_quality', false, 'initial failure');
      expect(policyEngine.canCompleteTask(taskId)).toBe(false);

      // Retry: data_quality passes after fixes
      policyEngine.recordCriticResult(taskId, 'data_quality', true);
      expect(policyEngine.canCompleteTask(taskId)).toBe(true);
    });

    it('should work with T-MLR task pattern', () => {
      const taskId = 'T-MLR-4.2';

      // Should require 2 critics
      expect(policyEngine.getRequiredCritics(taskId)).toEqual(['modeling_reality_v2', 'academic_rigor']);

      // Should block until both pass
      policyEngine.recordCriticResult(taskId, 'modeling_reality_v2', true);
      expect(policyEngine.canCompleteTask(taskId)).toBe(false);

      policyEngine.recordCriticResult(taskId, 'academic_rigor', true);
      expect(policyEngine.canCompleteTask(taskId)).toBe(true);
    });
  });
});
