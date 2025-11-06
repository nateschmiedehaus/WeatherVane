/**
 * Tests for work_type-aware reasoning classification
 * Task: AFP-COGNITIVE-MODEL-ROUTING-20251106
 */

import { describe, it, expect } from 'vitest';
import {
  inferWorkType,
  inferReasoningRequirement,
  getThinkingBudget,
  type WorkType,
  type ReasoningLevel,
} from '../reasoning_classifier.js';
import type { Task } from '../state_machine.js';
import type { AssembledContext } from '../context_assembler.js';

describe('inferWorkType', () => {
  it('returns cognitive for STRATEGIZE phase', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Test task',
      metadata: { current_phase: 'STRATEGIZE' }
    };
    expect(inferWorkType(task as Task)).toBe('cognitive');
  });

  it('returns cognitive for all cognitive phases', () => {
    const cognitivePhases = ['STRATEGIZE', 'SPEC', 'PLAN', 'THINK', 'GATE', 'REVIEW'];
    for (const phase of cognitivePhases) {
      const task: Partial<Task> = {
        id: 'T1',
        title: 'Test',
        metadata: { current_phase: phase }
      };
      expect(inferWorkType(task as Task)).toBe('cognitive');
    }
  });

  it('returns implementation for IMPLEMENT phase', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Test task',
      metadata: { current_phase: 'IMPLEMENT' }
    };
    expect(inferWorkType(task as Task)).toBe('implementation');
  });

  it('returns implementation for VERIFY phase', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Test task',
      metadata: { current_phase: 'VERIFY' }
    };
    expect(inferWorkType(task as Task)).toBe('implementation');
  });

  it('returns remediation for REMEDIATION in title', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'REMEDIATION: Fix build errors'
    };
    expect(inferWorkType(task as Task)).toBe('remediation');
  });

  it('returns remediation for FIX in title', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'FIX: Broken tests'
    };
    expect(inferWorkType(task as Task)).toBe('remediation');
  });

  it('returns remediation for HOTFIX in title', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'HOTFIX: Critical bug'
    };
    expect(inferWorkType(task as Task)).toBe('remediation');
  });

  it('returns observational for MONITOR in title', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'MONITOR: Track metrics'
    };
    expect(inferWorkType(task as Task)).toBe('observational');
  });

  it('returns implementation by default when no signals', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Generic task'
    };
    expect(inferWorkType(task as Task)).toBe('implementation');
  });

  it('prefers explicit work_type over phase inference', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Test',
      metadata: {
        work_type: 'observational',
        current_phase: 'IMPLEMENT'  // Would normally infer implementation
      }
    };
    expect(inferWorkType(task as Task)).toBe('observational');
  });

  it('prefers metadata over title inference', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'REMEDIATION: Fix issue',  // Would normally infer remediation
      metadata: { current_phase: 'STRATEGIZE' }
    };
    expect(inferWorkType(task as Task)).toBe('cognitive');
  });
});

describe('inferReasoningRequirement with work_type', () => {
  const emptyContext: Partial<AssembledContext> = {};

  it('returns high reasoning for cognitive work', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Test',
      metadata: { work_type: 'cognitive' }
    };
    const decision = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    expect(decision.level).toBe('high');
    expect(decision.override).toBe('metadata');
    expect(decision.confidence).toBe(0.95);
  });

  it('returns high reasoning for STRATEGIZE phase', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Strategy task',
      metadata: { current_phase: 'STRATEGIZE' }
    };
    const decision = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    expect(decision.level).toBe('high');
    expect(decision.signals[0].reason).toContain('Cognitive work');
    expect(decision.signals[0].reason).toContain('STRATEGIZE');
  });

  it('returns low reasoning for remediation work', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Test',
      metadata: { work_type: 'remediation' }
    };
    const decision = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    expect(decision.level).toBe('low');
    expect(decision.signals[0].reason).toContain('fast iteration');
  });

  it('returns low reasoning for REMEDIATION title', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'REMEDIATION: Fix tests'
    };
    const decision = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    expect(decision.level).toBe('low');
  });

  it('falls back to task-based heuristics for implementation work', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Implement feature',
      estimated_complexity: 8  // High complexity
    };
    const decision = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    // Should use existing heuristics, not override
    expect(['medium', 'high']).toContain(decision.level);  // Complexity-based heuristics
    expect(decision.override).toBeUndefined();  // Not overridden by work_type
  });
});

describe('getThinkingBudget - Claude extended thinking', () => {
  it('returns 12K tokens for high reasoning (cognitive work)', () => {
    expect(getThinkingBudget('high')).toBe(12000);
  });

  it('returns 4K tokens for medium reasoning (complex implementation)', () => {
    expect(getThinkingBudget('medium')).toBe(4000);
  });

  it('returns 0 tokens for low reasoning (standard work)', () => {
    expect(getThinkingBudget('low')).toBe(0);
  });

  it('returns 0 tokens for minimal reasoning (observational)', () => {
    expect(getThinkingBudget('minimal')).toBe(0);
  });
});

describe('Integration: work_type → reasoning → thinking budget', () => {
  const emptyContext: Partial<AssembledContext> = {};

  it('cognitive task → high reasoning → 12K thinking budget (Claude)', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Strategy work',
      metadata: { current_phase: 'STRATEGIZE' }
    };

    const workType = inferWorkType(task as Task);
    expect(workType).toBe('cognitive');

    const reasoning = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    expect(reasoning.level).toBe('high');

    const thinkingBudget = getThinkingBudget(reasoning.level);
    expect(thinkingBudget).toBe(12000);
  });

  it('implementation task → complexity-based reasoning → budget varies', () => {
    const simpleTask: Partial<Task> = {
      id: 'T1',
      title: 'Simple implementation',
      metadata: { current_phase: 'IMPLEMENT' },
      estimated_complexity: 3
    };

    const workType = inferWorkType(simpleTask as Task);
    expect(workType).toBe('implementation');

    const reasoning = inferReasoningRequirement(simpleTask as Task, emptyContext as AssembledContext);
    expect(reasoning.level).toBe('low');  // Simple implementation

    const thinkingBudget = getThinkingBudget(reasoning.level);
    expect(thinkingBudget).toBe(0);  // No extended thinking for simple work
  });

  it('remediation task → low reasoning → 0 thinking budget (fast iteration)', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'REMEDIATION: Fix failing test'
    };

    const workType = inferWorkType(task as Task);
    expect(workType).toBe('remediation');

    const reasoning = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    expect(reasoning.level).toBe('low');

    const thinkingBudget = getThinkingBudget(reasoning.level);
    expect(thinkingBudget).toBe(0);  // Fast iteration, no extended thinking
  });
});

describe('Codex reasoning levels (gpt-5-high)', () => {
  const emptyContext: Partial<AssembledContext> = {};

  it('cognitive work uses high reasoning → Codex gpt-5-high', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Strategic planning',
      metadata: { current_phase: 'PLAN' }
    };

    const decision = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    expect(decision.level).toBe('high');
    // Note: Codex model selection (gpt-5-high) happens in model_selector.ts
    // This test verifies the reasoning level that feeds into that selection
  });

  it('implementation work uses task-based reasoning → Codex medium/low', () => {
    const task: Partial<Task> = {
      id: 'T1',
      title: 'Implement feature',
      metadata: { current_phase: 'IMPLEMENT' },
      estimated_complexity: 5
    };

    const decision = inferReasoningRequirement(task as Task, emptyContext as AssembledContext);
    // Should fall back to existing complexity heuristics
    expect(['low', 'medium']).toContain(decision.level);
  });
});
