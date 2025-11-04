/**
 * Tests for Phase Budget Calculator
 */

import {describe, it, expect} from 'vitest';
import {
  calculatePhaseBudget,
  calculateTaskBudgets,
  estimateRemainingBudget,
  formatBudgetBreakdown,
} from '../../context/phase_budget_calculator.js';
import {getDefaultConfig} from '../../context/phase_budget_config.js';

describe('Phase Budget Calculator', () => {
  const config = getDefaultConfig();

  describe('calculatePhaseBudget', () => {
    it('should calculate budget for Medium complexity, medium importance', () => {
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config);

      // THINK: base 4000, Medium 1.0×, medium 1.0×, weight 1.5×
      expect(budget.token_limit).toBe(Math.ceil(4000 * 1.0 * 1.0 * 1.5));
      expect(budget.token_limit).toBe(6000);
      expect(budget.phase).toBe('THINK');
    });

    it('should calculate budget for Large complexity, Critical importance', () => {
      const budget = calculatePhaseBudget('THINK', 'Large', 'critical', config);

      // THINK: base 4000, Large 1.5×, critical 2.0×, weight 1.5×
      expect(budget.token_limit).toBe(Math.ceil(4000 * 1.5 * 2.0 * 1.5));
      expect(budget.token_limit).toBe(18000);
    });

    it('should calculate budget for Tiny complexity, Low importance', () => {
      const budget = calculatePhaseBudget('PR', 'Tiny', 'low', config);

      // PR: base 1500, Tiny 0.5×, low 0.7×, weight 0.6×
      expect(budget.token_limit).toBe(Math.ceil(1500 * 0.5 * 0.7 * 0.6));
      expect(budget.token_limit).toBe(315);
    });

    it('should apply overrides', () => {
      const overrides = {THINK: {tokens: 10000}};
      const budget = calculatePhaseBudget('THINK', 'Medium', 'medium', config, overrides);

      expect(budget.token_limit).toBe(10000); // Override, not calculated
    });

    it('should round up fractional tokens', () => {
      const budget = calculatePhaseBudget('SPEC', 'Small', 'low', config);

      // SPEC: base 1500, Small 0.8×, low 0.7×, weight 1.0× = 840
      expect(budget.token_limit).toBe(840);
      expect(Number.isInteger(budget.token_limit)).toBe(true);
    });
  });

  describe('calculateTaskBudgets', () => {
    it('should calculate budgets for all phases', () => {
      const budgets = calculateTaskBudgets('Medium', 'medium', undefined, config);

      expect(budgets.phases.size).toBe(9); // All 9 phases
      expect(budgets.phases.has('STRATEGIZE')).toBe(true);
      expect(budgets.phases.has('MONITOR')).toBe(true);
    });

    it('should sum total tokens correctly', () => {
      const budgets = calculateTaskBudgets('Medium', 'medium', undefined, config);

      let manualSum = 0;
      for (const budget of budgets.phases.values()) {
        manualSum += budget.token_limit;
      }

      expect(budgets.total_tokens).toBe(manualSum);
    });

    it('should apply task-level overrides', () => {
      const overrides = {
        THINK: {tokens: 10000},
        PR: {tokens: 500},
      };
      const budgets = calculateTaskBudgets('Medium', 'medium', overrides, config);

      expect(budgets.phases.get('THINK')?.token_limit).toBe(10000);
      expect(budgets.phases.get('PR')?.token_limit).toBe(500);
    });
  });

  describe('estimateRemainingBudget', () => {
    it('should estimate remaining budget correctly', () => {
      const budgets = calculateTaskBudgets('Medium', 'medium', undefined, config);
      const completedPhases = ['STRATEGIZE', 'SPEC', 'PLAN'];

      const remaining = estimateRemainingBudget(budgets, completedPhases as any);

      // Remaining = THINK + IMPLEMENT + VERIFY + REVIEW + PR + MONITOR
      const expectedTokens =
        budgets.phases.get('THINK')!.token_limit +
        budgets.phases.get('IMPLEMENT')!.token_limit +
        budgets.phases.get('VERIFY')!.token_limit +
        budgets.phases.get('REVIEW')!.token_limit +
        budgets.phases.get('PR')!.token_limit +
        budgets.phases.get('MONITOR')!.token_limit;

      expect(remaining.tokens).toBe(expectedTokens);
    });
  });

  describe('formatBudgetBreakdown', () => {
    it('should format budget breakdown as string', () => {
      const budgets = calculateTaskBudgets('Large', 'high', undefined, config);
      const formatted = formatBudgetBreakdown(budgets);

      expect(formatted).toContain('Total Budget');
      expect(formatted).toContain('STRATEGIZE');
      expect(formatted).toContain('MONITOR');
      expect(formatted).toContain('Large/high');
    });
  });
});
