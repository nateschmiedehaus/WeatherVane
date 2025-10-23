import { describe, expect, it } from 'vitest';

import { inferReasoningRequirement } from '../orchestrator/reasoning_classifier.js';
import type { Task, ContextEntry, QualityMetric } from '../orchestrator/state_machine.js';
import type { AssembledContext } from '../orchestrator/context_assembler.js';

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? 'T-test',
    title: overrides.title ?? 'Example task',
    description: overrides.description,
    type: overrides.type ?? 'task',
    status: overrides.status ?? 'pending',
    created_at: overrides.created_at ?? Date.now(),
    estimated_complexity: overrides.estimated_complexity,
    metadata: overrides.metadata,
  };
}

function buildContext(task: Task, overrides: Partial<AssembledContext> = {}): AssembledContext {
  return {
    task,
    relatedTasks: overrides.relatedTasks ?? [],
    relevantDecisions: overrides.relevantDecisions ?? [],
    relevantConstraints: overrides.relevantConstraints ?? [],
    recentLearnings: overrides.recentLearnings ?? [],
    qualityIssuesInArea: overrides.qualityIssuesInArea ?? [],
    overallQualityTrend: overrides.overallQualityTrend ?? [],
    projectPhase: overrides.projectPhase ?? 'development',
    velocityMetrics:
      overrides.velocityMetrics ?? {
        tasksCompletedToday: 0,
        averageTaskDuration: 0,
        qualityTrendOverall: 'stable',
      },
    filesToRead: overrides.filesToRead,
    recentChangesInArea: overrides.recentChangesInArea,
    researchHighlights: overrides.researchHighlights,
  };
}

describe('Reasoning classifier heuristics', () => {
  it('escalates reasoning for complex architecture work', () => {
    const task = buildTask({
      id: 'T-arch',
      title: 'Architectural redesign of ingestion pipeline',
      description: 'Refactor ingestion stack and redesign coordinator interfaces',
      type: 'story',
      status: 'pending',
      estimated_complexity: 9,
    });

    const decisionEntries: ContextEntry[] = [
      {
        id: 1,
        entry_type: 'decision',
        timestamp: Date.now(),
        topic: 'Ingestion batch size',
        content: 'Current ADR needs revisiting for new latency targets',
      },
      {
        id: 2,
        entry_type: 'decision',
        timestamp: Date.now(),
        topic: 'Coordinator responsibilities',
        content: 'Coordinator must own backpressure strategy',
      },
    ];

    const constraints: ContextEntry[] = [
      {
        id: 3,
        entry_type: 'constraint',
        timestamp: Date.now(),
        topic: 'Latency',
        content: 'Must keep ingestion latency < 5 minutes',
      },
      {
        id: 4,
        entry_type: 'constraint',
        timestamp: Date.now(),
        topic: 'Cost',
        content: 'Do not increase token spend by >15%',
      },
      {
        id: 5,
        entry_type: 'constraint',
        timestamp: Date.now(),
        topic: 'Reliability',
        content: 'No skipped tenants during migration',
      },
    ];

    const issues: QualityMetric[] = [
      {
        id: 6,
        timestamp: Date.now(),
        task_id: 'T-arch',
        dimension: 'reliability',
        score: 0.4,
      },
    ];

    const context = buildContext(task, {
      relevantDecisions: decisionEntries,
      relevantConstraints: constraints,
      qualityIssuesInArea: issues,
      filesToRead: ['apps/worker/pipeline.py', 'shared/ingestion/config.py', 'docs/ADR-004.md', 'infra/terraform/modules/ingestion/main.tf'],
      projectPhase: 'architecture',
    });

    const decision = inferReasoningRequirement(task, context);
    expect(decision.level).toBe('high');
    expect(decision.score).toBeGreaterThanOrEqual(2);
  });

  it('keeps lightweight fix tasks at low reasoning', () => {
    const task = buildTask({
      id: 'T-fix',
      title: 'Fix typo in comment',
      description: 'Update comment spelling in helper',
      type: 'bug',
      status: 'needs_improvement',
      estimated_complexity: 2,
    });

    const context = buildContext(task, {
      filesToRead: ['shared/utils/helpers.ts'],
    });

    const decision = inferReasoningRequirement(task, context);
    expect(decision.level).toBe('low');
  });

  it('respects metadata overrides', () => {
    const task = buildTask({
      id: 'T-override',
      title: 'Investigate billing anomaly',
      description: 'Requires deep audit of cross-tenant billing pipeline',
      type: 'task',
      status: 'pending',
      metadata: { reasoning_level: 'high' },
    });
    const context = buildContext(task);

    const decision = inferReasoningRequirement(task, context);
    expect(decision.level).toBe('high');
    expect(decision.override).toBe('metadata');
  });

  it('prefers minimal reasoning for documentation-only work', () => {
    const task = buildTask({
      id: 'T-doc',
      title: 'Write documentation for new API',
      description: 'Draft release notes and update usage examples',
      type: 'task',
      status: 'pending',
      estimated_complexity: 3,
    });
    const context = buildContext(task);

    const decision = inferReasoningRequirement(task, context);
    expect(decision.level === 'minimal' || decision.level === 'low').toBe(true);
  });
});
