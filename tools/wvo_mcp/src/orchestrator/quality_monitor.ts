import { EventEmitter } from 'node:events';

import type { AgentType } from './agent_pool.js';
import type { QualityMetric, StateMachine, Task } from './state_machine.js';

export interface QualityCheckInput {
  task: Task;
  agentId: string;
  agentType: AgentType;
  success: boolean;
  durationSeconds: number;
  outputExcerpt?: string;
}

export interface QualityCheckResult {
  status: 'pass' | 'fail';
  score: number;
  metrics: QualityMetric[];
  issues: string[];
}

const EXECUTION_PASS_THRESHOLD = 0.85;

/**
 * QualityMonitor evaluates task executions, records metrics, and determines whether
 * a task can advance or needs additional work.
 */
export class QualityMonitor extends EventEmitter {
  constructor(private readonly stateMachine: StateMachine) {
    super();
  }

  async evaluate(input: QualityCheckInput): Promise<QualityCheckResult> {
    const { task, agentId, agentType, success, durationSeconds, outputExcerpt } = input;
    const now = Date.now();

    const complexity = task.estimated_complexity ?? 5;
    const expectedSeconds = Math.max(120, complexity * 300); // rough estimate: 5 minutes per complexity point
    const executionScore = success ? 0.92 : 0.2;

    const timelinessRatio = expectedSeconds / Math.max(durationSeconds, 1);
    const timelinessScore = Math.min(1, Math.max(0.1, timelinessRatio));

    const metrics: QualityMetric[] = [
      {
        timestamp: now,
        task_id: task.id,
        dimension: 'execution',
        score: executionScore,
        details: {
          agent_id: agentId,
          agent_type: agentType,
          success,
          duration: durationSeconds,
        },
      },
      {
        timestamp: now,
        task_id: task.id,
        dimension: 'timeliness',
        score: timelinessScore,
        details: {
          expected_seconds: expectedSeconds,
          actual_seconds: durationSeconds,
        },
      },
    ];

    if (outputExcerpt) {
      metrics.push({
        timestamp: now,
        task_id: task.id,
        dimension: 'output_excerpt',
        score: success ? 0.9 : 0.3,
        details: {
          snippet: outputExcerpt,
        },
      });
    }

    for (const metric of metrics) {
      this.stateMachine.recordQuality(metric);
    }

    const averageScore = metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length;
    const issues: string[] = [];

    if (!success) {
      issues.push('execution_failed');
    }

    if (timelinessScore < 0.6) {
      issues.push('execution_too_slow');
    }

    const status: QualityCheckResult['status'] = averageScore >= EXECUTION_PASS_THRESHOLD && issues.length === 0 ? 'pass' : 'fail';

    this.emit('quality:evaluated', {
      taskId: task.id,
      agentId,
      status,
      score: averageScore,
      issues,
    });

    return {
      status,
      score: averageScore,
      metrics,
      issues,
    };
  }
}
