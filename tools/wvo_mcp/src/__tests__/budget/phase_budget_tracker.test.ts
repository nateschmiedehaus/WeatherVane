/**
 * Tests for Phase Budget Tracker
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {phaseBudgetTracker, PhaseBudgetTracker} from '../../context/phase_budget_tracker.js';
import {calculatePhaseBudget} from '../../context/phase_budget_calculator.js';
import {getDefaultConfig} from '../../context/phase_budget_config.js';

describe('Phase Budget Tracker', () => {
  const config = getDefaultConfig();

  beforeEach(() => {
    // Clear any previous test data
    phaseBudgetTracker.clearTaskExecutions('TEST-TASK-001');
  });

  describe('startPhaseTracking', () => {
    it('should start tracking a phase', () => {
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);

      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'THINK', budget);

      const current = phaseBudgetTracker.getCurrentTracking();
      expect(current).not.toBeNull();
      expect(current?.taskId).toBe('TEST-TASK-001');
      expect(current?.phase).toBe('THINK');
      expect(current?.tokensUsed).toBe(0);
    });

    it('should throw if tracking already active', () => {
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);

      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'THINK', budget);

      expect(() => {
        phaseBudgetTracker.startPhaseTracking('TEST-TASK-002', 'IMPLEMENT', budget);
      }).toThrow(/Cannot start phase.*still active/);
    });
  });

  describe('reportTokenUsage', () => {
    it('should accumulate token usage', () => {
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);

      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'THINK', budget);
      phaseBudgetTracker.reportTokenUsage(1000);
      phaseBudgetTracker.reportTokenUsage(500);

      const current = phaseBudgetTracker.getCurrentTracking();
      expect(current?.tokensUsed).toBe(1500);
    });
  });

  describe('endPhaseTracking', () => {
    it('should end tracking and return execution record', () => {
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);

      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'THINK', budget);
      phaseBudgetTracker.reportTokenUsage(5000);

      const execution = phaseBudgetTracker.endPhaseTracking(false);

      expect(execution.task_id).toBe('TEST-TASK-001');
      expect(execution.phase).toBe('THINK');
      expect(execution.tokens_used).toBe(5000);
      expect(execution.tokens_limit).toBe(6000); // Medium × medium × 1.5 weight
      expect(execution.breach_status).toBe('within'); // 5000/6000 = 83%
      expect(execution.tokens_estimated).toBe(false);
    });

    it('should calculate latency correctly', () => {
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);

      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'THINK', budget);

      const execution = phaseBudgetTracker.endPhaseTracking(false);

      // Latency should be a non-negative number (may be 0 or small for fast tests)
      expect(execution.latency_ms).toBeGreaterThanOrEqual(0);
      expect(execution.latency_ms).toBeLessThan(1000); // Should be <1s for this test
    });

    it('should detect breach status (warning)', () => {
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);

      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'THINK', budget);
      phaseBudgetTracker.reportTokenUsage(7500); // 125% of 6000 limit

      const execution = phaseBudgetTracker.endPhaseTracking(false);

      expect(execution.breach_status).toBe('warning'); // 100-150%
    });

    it('should detect breach status (exceeded)', () => {
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);

      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'THINK', budget);
      phaseBudgetTracker.reportTokenUsage(10000); // 167% of 6000 limit

      const execution = phaseBudgetTracker.endPhaseTracking(false);

      expect(execution.breach_status).toBe('exceeded'); // >150%
    });
  });

  describe('getTaskBudgetStatus', () => {
    it('should return null for unknown task', () => {
      const status = phaseBudgetTracker.getTaskBudgetStatus('UNKNOWN-TASK');
      expect(status).toBeNull();
    });

    it('should return status for task with multiple phases', () => {
      const thinkBudget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);
      const implementBudget = calculatePhaseBudget('IMPLEMENT', 'Medium', 'medium', config);

      // Execute THINK phase
      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'THINK', thinkBudget);
      phaseBudgetTracker.reportTokenUsage(5000);
      phaseBudgetTracker.endPhaseTracking(false);

      // Execute IMPLEMENT phase
      phaseBudgetTracker.startPhaseTracking('TEST-TASK-001', 'IMPLEMENT', implementBudget);
      phaseBudgetTracker.reportTokenUsage(3000);
      phaseBudgetTracker.endPhaseTracking(false);

      const status = phaseBudgetTracker.getTaskBudgetStatus('TEST-TASK-001');

      expect(status).not.toBeNull();
      expect(status!.task_id).toBe('TEST-TASK-001');
      expect(status!.phase_executions.length).toBe(2);
      expect(status!.total_tokens_used).toBe(8000);
      expect(status!.cumulative_breach_status).toBe('within');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens from text length', () => {
      const prompt = 'a'.repeat(400); // 400 chars
      const completion = 'b'.repeat(600); // 600 chars

      const estimated = PhaseBudgetTracker.estimateTokens(prompt, completion);

      // (400 + 600) / 4 = 250
      expect(estimated).toBe(250);
    });
  });
});
