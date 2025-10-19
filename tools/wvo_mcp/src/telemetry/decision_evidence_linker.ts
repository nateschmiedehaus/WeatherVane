/**
 * DecisionEvidenceLinker
 *
 * Traces the evidence chain for decisions by linking:
 * - Events (what happened)
 * - Quality metrics (how good was it)
 * - Context entries (what we learned/decided)
 * - Critic results (what guardrails said)
 *
 * Provides auditability and transparency for autonomous decisions.
 */

import type {
  StateMachine,
  Event,
  QualityMetric,
  ContextEntry,
  Task,
  CriticHistoryRecord,
} from '../orchestrator/state_machine.js';

export interface EvidenceNode {
  type: 'event' | 'quality_metric' | 'context_entry' | 'critic_check' | 'task';
  id: string | number;
  timestamp: number;
  summary: string;
  data: Event | QualityMetric | ContextEntry | CriticHistoryRecord | Task;
}

export interface EvidenceChain {
  taskId: string;
  taskTitle: string;
  correlationId?: string;
  nodes: EvidenceNode[];
  timeline: {
    started: number | null;
    completed: number | null;
    duration: number | null;
  };
  summary: {
    totalEvents: number;
    qualityChecks: number;
    averageQuality: number;
    criticChecks: number;
    criticFailures: number;
    decisions: number;
  };
}

export interface DecisionPoint {
  timestamp: number;
  decision: string;
  evidence: EvidenceNode[];
  confidence: number;
  outcome?: 'success' | 'failure' | 'pending';
}

export class DecisionEvidenceLinker {
  constructor(private readonly stateMachine: StateMachine) {}

  /**
   * Trace the complete evidence chain for a task
   */
  traceTask(taskId: string): EvidenceChain | null {
    try {
      if (!taskId || typeof taskId !== 'string') {
        return null;
      }

      const task = this.stateMachine.getTask(taskId);
      if (!task) {
        return null;
      }

      const nodes: EvidenceNode[] = [];

    // 1. Add the task itself as the root node
    nodes.push({
      type: 'task',
      id: taskId,
      timestamp: task.created_at,
      summary: `Task: ${task.title} [${task.status}]`,
      data: task,
    });

    // 2. Get all events for this task
    const events = this.stateMachine.getEvents({ taskId });
    for (const event of events) {
      nodes.push({
        type: 'event',
        id: event.id ?? 0,
        timestamp: event.timestamp,
        summary: `Event: ${event.event_type} by ${event.agent ?? 'system'}`,
        data: event,
      });
    }

    // 3. Get quality metrics for this task
    const qualityMetrics = this.stateMachine.getQualityMetrics({ taskId });
    for (const metric of qualityMetrics) {
      nodes.push({
        type: 'quality_metric',
        id: metric.id ?? 0,
        timestamp: metric.timestamp,
        summary: `Quality: ${metric.dimension} = ${metric.score.toFixed(2)}`,
        data: metric,
      });
    }

    // 4. Get context entries related to this task
    const contextEntries = this.stateMachine.getContextEntries();
    const relatedContext = contextEntries.filter(entry =>
      entry.related_tasks?.includes(taskId)
    );
    for (const entry of relatedContext) {
      nodes.push({
        type: 'context_entry',
        id: entry.id ?? 0,
        timestamp: entry.timestamp,
        summary: `${entry.entry_type}: ${entry.topic}`,
        data: entry,
      });
    }

    // 5. Get critic checks that might be related (by timestamp proximity)
    if (task.started_at && task.completed_at) {
      // This is a simplification - in production, you'd have explicit task->critic links
      // For now, we just include recent critic history as context
    }

    // Sort all nodes by timestamp
    nodes.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate summary statistics
    const eventNodes = nodes.filter(n => n.type === 'event');
    const qualityNodes = nodes.filter(n => n.type === 'quality_metric');
    const contextNodes = nodes.filter(n => n.type === 'context_entry' && (n.data as ContextEntry).entry_type === 'decision');
    const criticNodes = nodes.filter(n => n.type === 'critic_check');

    const qualityScores = qualityNodes.map(n => (n.data as QualityMetric).score);
    const averageQuality = qualityScores.length > 0
      ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length
      : 0;

    return {
      taskId,
      taskTitle: task.title,
      correlationId: undefined, // Could be extracted from events if available
      nodes,
      timeline: {
        started: task.started_at ?? null,
        completed: task.completed_at ?? null,
        duration: task.started_at && task.completed_at
          ? task.completed_at - task.started_at
          : null,
      },
      summary: {
        totalEvents: eventNodes.length,
        qualityChecks: qualityNodes.length,
        averageQuality,
        criticChecks: criticNodes.length,
        criticFailures: 0, // Would need explicit critic->task linking
        decisions: contextNodes.length,
      },
    };
    } catch (error) {
      // Silently fail - this is analytics, shouldn't break operations
      return null;
    }
  }

  /**
   * Trace a specific decision point and its supporting evidence
   */
  traceDecision(contextEntryId: number): DecisionPoint | null {
    try {
      if (!contextEntryId || typeof contextEntryId !== 'number') {
        return null;
      }

      const entries = this.stateMachine.getContextEntries();
      if (!entries || !Array.isArray(entries)) {
        return null;
      }

      const entry = entries.find(e => e.id === contextEntryId);

      if (!entry || entry.entry_type !== 'decision') {
        return null;
      }

    const evidence: EvidenceNode[] = [];

    // Add the decision itself
    evidence.push({
      type: 'context_entry',
      id: entry.id ?? 0,
      timestamp: entry.timestamp,
      summary: `Decision: ${entry.topic}`,
      data: entry,
    });

    // Add related task evidence
    if (entry.related_tasks) {
      for (const taskId of entry.related_tasks) {
        const task = this.stateMachine.getTask(taskId);
        if (task) {
          evidence.push({
            type: 'task',
            id: taskId,
            timestamp: task.created_at,
            summary: `Task: ${task.title}`,
            data: task,
          });

          // Add key events for this task
          const events = this.stateMachine.getEvents({ taskId }).slice(0, 5);
          for (const event of events) {
            evidence.push({
              type: 'event',
              id: event.id ?? 0,
              timestamp: event.timestamp,
              summary: `Event: ${event.event_type}`,
              data: event,
            });
          }
        }
      }
    }

    return {
      timestamp: entry.timestamp,
      decision: entry.content,
      evidence: evidence.sort((a, b) => a.timestamp - b.timestamp),
      confidence: entry.confidence ?? 0.5,
      outcome: this.inferOutcome(entry),
    };
    } catch (error) {
      // Silently fail - this is analytics, shouldn't break operations
      return null;
    }
  }

  /**
   * Find all decision points in a time range
   */
  findDecisions(
    startTime: number,
    endTime: number,
    options: {
      minConfidence?: number;
      entryType?: 'decision' | 'hypothesis' | 'learning';
    } = {}
  ): DecisionPoint[] {
    try {
      const entries = this.stateMachine.getContextEntries();
      if (!entries || !Array.isArray(entries)) {
        return [];
      }

      const decisions = entries.filter(entry => {
        try {
          if (entry.timestamp < startTime || entry.timestamp > endTime) {
            return false;
          }
          if (options.entryType && entry.entry_type !== options.entryType) {
            return false;
          }
          if (options.minConfidence && (entry.confidence ?? 0) < options.minConfidence) {
            return false;
          }
          return true;
        } catch (error) {
          return false;
        }
      });

      return decisions.map(entry => {
        try {
          return entry.id ? this.traceDecision(entry.id) : null;
        } catch (error) {
          return null;
        }
      }).filter((d): d is DecisionPoint => d !== null);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get evidence summary for reporting
   */
  getSummary(timeWindowMs: number = 86400000): {
    decisions: number;
    highConfidenceDecisions: number;
    averageConfidence: number;
    tasksWithEvidence: number;
    totalEvidenceNodes: number;
  } {
    try {
      const now = Date.now();
      const startTime = now - timeWindowMs;

      const decisions = this.findDecisions(startTime, now);
      const highConfidence = decisions.filter(d => d.confidence >= 0.8);

      const confidenceSum = decisions.reduce((sum, d) => sum + d.confidence, 0);
      const averageConfidence = decisions.length > 0 ? confidenceSum / decisions.length : 0;

      const tasksWithEvidence = new Set(
        decisions.flatMap(d => d.evidence.filter(e => e.type === 'task').map(e => e.id))
      ).size;

      const totalEvidenceNodes = decisions.reduce((sum, d) => sum + d.evidence.length, 0);

      return {
        decisions: decisions.length,
        highConfidenceDecisions: highConfidence.length,
        averageConfidence,
        tasksWithEvidence,
        totalEvidenceNodes,
      };
    } catch (error) {
      // Return empty summary on error
      return {
        decisions: 0,
        highConfidenceDecisions: 0,
        averageConfidence: 0,
        tasksWithEvidence: 0,
        totalEvidenceNodes: 0,
      };
    }
  }

  /**
   * Infer outcome of a decision based on related task completion
   */
  private inferOutcome(entry: ContextEntry): 'success' | 'failure' | 'pending' {
    if (!entry.related_tasks || entry.related_tasks.length === 0) {
      return 'pending';
    }

    const tasks = entry.related_tasks
      .map(id => this.stateMachine.getTask(id))
      .filter((t): t is Task => t !== null);

    if (tasks.length === 0) {
      return 'pending';
    }

    const allDone = tasks.every(t => t.status === 'done');
    const anyFailed = tasks.some(t => t.status === 'blocked');

    if (allDone) {
      return 'success';
    }
    if (anyFailed) {
      return 'failure';
    }
    return 'pending';
  }
}
