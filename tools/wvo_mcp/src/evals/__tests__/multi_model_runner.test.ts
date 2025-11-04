/**
 * Smoke tests for multi-model runner
 *
 * Tests the logic without making real API calls
 */

import { describe, it, expect } from 'vitest';
import { compareAgents, type EvalResults } from '../multi_model_runner';

describe('multi_model_runner', () => {
  describe('compareAgents', () => {
    it('should calculate correct success rates and differences', () => {
      const claudeResults: EvalResults = {
        run_id: 'test-claude',
        timestamp: '2025-10-30T00:00:00Z',
        mode: 'quick',
        agent: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        total_tasks: 5,
        passed: 4,
        failed: 1,
        success_rate: 80,
        p95_latency_ms: 1000,
        total_tokens: 5000,
        cost_usd: 0.15,
        task_results: [
          {
            task_id: 'TASK-001',
            phase: 'strategize',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          },
          {
            task_id: 'TASK-002',
            phase: 'spec',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          },
          {
            task_id: 'TASK-003',
            phase: 'plan',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          },
          {
            task_id: 'TASK-004',
            phase: 'implement',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: false,
            criteria_met: 2,
            criteria_required: 3,
            missing_criteria: ['criterion'],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          },
          {
            task_id: 'TASK-005',
            phase: 'verify',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          }
        ],
        failed_tasks: [
          {
            id: 'TASK-004',
            phase: 'implement',
            criteria_met: 2,
            criteria_required: 3,
            missing: ['criterion']
          }
        ]
      };

      const codexResults: EvalResults = {
        run_id: 'test-codex',
        timestamp: '2025-10-30T00:00:00Z',
        mode: 'quick',
        agent: 'codex',
        model: 'gpt-4-0125-preview',
        total_tasks: 5,
        passed: 3,
        failed: 2,
        success_rate: 60,
        p95_latency_ms: 1200,
        total_tokens: 6000,
        cost_usd: 0.30,
        task_results: [
          {
            task_id: 'TASK-001',
            phase: 'strategize',
            agent: 'codex',
            model: 'gpt-4-0125-preview',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1200,
            tokens_input: 600,
            tokens_output: 600
          },
          {
            task_id: 'TASK-002',
            phase: 'spec',
            agent: 'codex',
            model: 'gpt-4-0125-preview',
            passed: false,
            criteria_met: 2,
            criteria_required: 3,
            missing_criteria: ['criterion'],
            llm_output: 'output',
            latency_ms: 1200,
            tokens_input: 600,
            tokens_output: 600
          },
          {
            task_id: 'TASK-003',
            phase: 'plan',
            agent: 'codex',
            model: 'gpt-4-0125-preview',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1200,
            tokens_input: 600,
            tokens_output: 600
          },
          {
            task_id: 'TASK-004',
            phase: 'implement',
            agent: 'codex',
            model: 'gpt-4-0125-preview',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1200,
            tokens_input: 600,
            tokens_output: 600
          },
          {
            task_id: 'TASK-005',
            phase: 'verify',
            agent: 'codex',
            model: 'gpt-4-0125-preview',
            passed: false,
            criteria_met: 2,
            criteria_required: 3,
            missing_criteria: ['criterion'],
            llm_output: 'output',
            latency_ms: 1200,
            tokens_input: 600,
            tokens_output: 600
          }
        ],
        failed_tasks: [
          {
            id: 'TASK-002',
            phase: 'spec',
            criteria_met: 2,
            criteria_required: 3,
            missing: ['criterion']
          },
          {
            id: 'TASK-005',
            phase: 'verify',
            criteria_met: 2,
            criteria_required: 3,
            missing: ['criterion']
          }
        ]
      };

      const comparison = compareAgents(claudeResults, codexResults);

      // Verify success rates
      expect(comparison.claude_success_rate).toBe(80);
      expect(comparison.codex_success_rate).toBe(60);
      expect(comparison.diff_percentage).toBe(20);

      // Verify task categorization
      expect(comparison.tasks_both_pass).toEqual(['TASK-001', 'TASK-003']);
      expect(comparison.tasks_both_fail).toEqual([]);
      expect(comparison.tasks_claude_better).toEqual(['TASK-002', 'TASK-005']);
      expect(comparison.tasks_codex_better).toEqual(['TASK-004']);
    });

    it('should handle both agents passing all tasks', () => {
      const claudeResults: EvalResults = {
        run_id: 'test-claude',
        timestamp: '2025-10-30T00:00:00Z',
        mode: 'quick',
        agent: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        total_tasks: 2,
        passed: 2,
        failed: 0,
        success_rate: 100,
        p95_latency_ms: 1000,
        total_tokens: 2000,
        cost_usd: 0.06,
        task_results: [
          {
            task_id: 'TASK-001',
            phase: 'strategize',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          },
          {
            task_id: 'TASK-002',
            phase: 'spec',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          }
        ],
        failed_tasks: []
      };

      const codexResults: EvalResults = {
        run_id: 'test-codex',
        timestamp: '2025-10-30T00:00:00Z',
        mode: 'quick',
        agent: 'codex',
        model: 'gpt-4-0125-preview',
        total_tasks: 2,
        passed: 2,
        failed: 0,
        success_rate: 100,
        p95_latency_ms: 1200,
        total_tokens: 2400,
        cost_usd: 0.12,
        task_results: [
          {
            task_id: 'TASK-001',
            phase: 'strategize',
            agent: 'codex',
            model: 'gpt-4-0125-preview',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1200,
            tokens_input: 600,
            tokens_output: 600
          },
          {
            task_id: 'TASK-002',
            phase: 'spec',
            agent: 'codex',
            model: 'gpt-4-0125-preview',
            passed: true,
            criteria_met: 3,
            criteria_required: 3,
            missing_criteria: [],
            llm_output: 'output',
            latency_ms: 1200,
            tokens_input: 600,
            tokens_output: 600
          }
        ],
        failed_tasks: []
      };

      const comparison = compareAgents(claudeResults, codexResults);

      expect(comparison.claude_success_rate).toBe(100);
      expect(comparison.codex_success_rate).toBe(100);
      expect(comparison.diff_percentage).toBe(0);
      expect(comparison.tasks_both_pass).toEqual(['TASK-001', 'TASK-002']);
      expect(comparison.tasks_both_fail).toEqual([]);
      expect(comparison.tasks_claude_better).toEqual([]);
      expect(comparison.tasks_codex_better).toEqual([]);
    });

    it('should handle both agents failing same tasks', () => {
      const claudeResults: EvalResults = {
        run_id: 'test-claude',
        timestamp: '2025-10-30T00:00:00Z',
        mode: 'quick',
        agent: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        total_tasks: 2,
        passed: 0,
        failed: 2,
        success_rate: 0,
        p95_latency_ms: 1000,
        total_tokens: 2000,
        cost_usd: 0.06,
        task_results: [
          {
            task_id: 'TASK-001',
            phase: 'strategize',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: false,
            criteria_met: 1,
            criteria_required: 3,
            missing_criteria: ['criterion1', 'criterion2'],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          },
          {
            task_id: 'TASK-002',
            phase: 'spec',
            agent: 'claude',
            model: 'claude-sonnet-4-5-20250929',
            passed: false,
            criteria_met: 0,
            criteria_required: 3,
            missing_criteria: ['criterion1', 'criterion2', 'criterion3'],
            llm_output: 'output',
            latency_ms: 1000,
            tokens_input: 500,
            tokens_output: 500
          }
        ],
        failed_tasks: [
          {
            id: 'TASK-001',
            phase: 'strategize',
            criteria_met: 1,
            criteria_required: 3,
            missing: ['criterion1', 'criterion2']
          },
          {
            id: 'TASK-002',
            phase: 'spec',
            criteria_met: 0,
            criteria_required: 3,
            missing: ['criterion1', 'criterion2', 'criterion3']
          }
        ]
      };

      const codexResults: EvalResults = {
        ...claudeResults,
        run_id: 'test-codex',
        agent: 'codex',
        model: 'gpt-4-0125-preview',
        task_results: claudeResults.task_results.map(t => ({
          ...t,
          agent: 'codex',
          model: 'gpt-4-0125-preview'
        }))
      };

      const comparison = compareAgents(claudeResults, codexResults);

      expect(comparison.claude_success_rate).toBe(0);
      expect(comparison.codex_success_rate).toBe(0);
      expect(comparison.diff_percentage).toBe(0);
      expect(comparison.tasks_both_pass).toEqual([]);
      expect(comparison.tasks_both_fail).toEqual(['TASK-001', 'TASK-002']);
      expect(comparison.tasks_claude_better).toEqual([]);
      expect(comparison.tasks_codex_better).toEqual([]);
    });
  });
});
