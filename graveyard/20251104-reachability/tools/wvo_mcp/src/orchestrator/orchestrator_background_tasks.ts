/**
 * Orchestrator Background Tasks - Continuous valuable work for orchestrator
 *
 * The orchestrator should NEVER be idle. When no high-priority strategic tasks
 * exist, it performs continuous background work:
 * - System health monitoring
 * - Quality analysis
 * - Roadmap optimization
 * - Bottleneck detection
 * - Report generation
 * - Strategic planning
 */

import type { StateMachine, Task } from './state_machine.js';
import { logInfo, logDebug } from '../telemetry/logger.js';

export interface BackgroundTaskResult {
  taskName: string;
  findings: string[];
  actions: string[];
  duration: number;
  nextRunAfter?: number; // ms
}

export interface OrchestratorBackgroundContext {
  stateMachine: StateMachine;
  workspaceRoot: string;
}

export type BackgroundTaskType =
  | 'health_monitoring'
  | 'quality_analysis'
  | 'roadmap_optimization'
  | 'bottleneck_detection'
  | 'progress_reporting'
  | 'strategic_planning'
  | 'resource_optimization'
  | 'risk_assessment'
  | 'knowledge_synthesis';

/**
 * Background task priorities
 */
const TASK_PRIORITIES: Record<BackgroundTaskType, number> = {
  health_monitoring: 10, // Highest - critical for system stability
  bottleneck_detection: 9,
  resource_optimization: 8,
  risk_assessment: 7,
  quality_analysis: 6,
  progress_reporting: 5,
  roadmap_optimization: 4,
  strategic_planning: 3,
  knowledge_synthesis: 2, // Lowest - nice to have
};

/**
 * Task execution intervals (ms)
 */
const TASK_INTERVALS: Record<BackgroundTaskType, number> = {
  health_monitoring: 30000, // Every 30s
  bottleneck_detection: 60000, // Every 1min
  resource_optimization: 120000, // Every 2min
  risk_assessment: 180000, // Every 3min
  quality_analysis: 300000, // Every 5min
  progress_reporting: 600000, // Every 10min
  roadmap_optimization: 900000, // Every 15min
  strategic_planning: 1800000, // Every 30min
  knowledge_synthesis: 3600000, // Every 1hr
};

/**
 * Track when tasks were last run
 */
const lastRunTimes = new Map<BackgroundTaskType, number>();

/**
 * Get the next background task the orchestrator should work on
 */
export function getNextBackgroundTask(): BackgroundTaskType {
  const now = Date.now();
  let bestTask: BackgroundTaskType = 'health_monitoring';
  let bestScore = -Infinity;

  for (const [task, priority] of Object.entries(TASK_PRIORITIES) as Array<
    [BackgroundTaskType, number]
  >) {
    const lastRun = lastRunTimes.get(task) || 0;
    const timeSinceLastRun = now - lastRun;
    const interval = TASK_INTERVALS[task];

    // If task is overdue, increase its score dramatically
    const overdueMultiplier = timeSinceLastRun > interval ? 100 : 1;

    // Score = priority + time since last run (normalized)
    const score =
      priority * overdueMultiplier + (timeSinceLastRun / interval) * 10;

    if (score > bestScore) {
      bestScore = score;
      bestTask = task;
    }
  }

  return bestTask;
}

/**
 * Mark a background task as completed
 */
export function markTaskCompleted(task: BackgroundTaskType): void {
  lastRunTimes.set(task, Date.now());
}

/**
 * Health Monitoring - Check system health and alert if issues found
 */
export async function runHealthMonitoring(
  context: OrchestratorBackgroundContext
): Promise<BackgroundTaskResult> {
  const startTime = Date.now();
  const findings: string[] = [];
  const actions: string[] = [];

  try {
    // Check task queue health
    const pendingTasks = context.stateMachine.getTasks({
      status: ['pending'],
    });
    const inProgressTasks = context.stateMachine.getTasks({
      status: ['in_progress'],
    });
    const blockedTasks = context.stateMachine.getTasks({ status: ['blocked'] });

    if (blockedTasks.length > 0) {
      findings.push(`${blockedTasks.length} tasks are blocked`);
      actions.push('Review blocked tasks and escalate if needed');
    }

    if (inProgressTasks.length > 10) {
      findings.push(
        `High WIP: ${inProgressTasks.length} tasks in progress (target: ≤10)`
      );
      actions.push('Consider completing in-progress tasks before starting new ones');
    }

    if (pendingTasks.length === 0 && inProgressTasks.length === 0) {
      findings.push('No tasks in queue - roadmap may need extension');
      actions.push('Check if roadmap needs new tasks added');
    }

    // Check for stale in-progress tasks (>2 hours)
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const staleTasks = inProgressTasks.filter((task) => {
      if (!task.metadata?.startedAt) {
        return false;
      }
      const startedAt = typeof task.metadata.startedAt === 'string'
        ? new Date(task.metadata.startedAt as string).getTime()
        : task.metadata.startedAt as number;
      return startedAt < twoHoursAgo;
    });

    if (staleTasks.length > 0) {
      findings.push(`${staleTasks.length} tasks have been in progress >2 hours`);
      actions.push('Investigate stale tasks - may be stuck or abandoned');
    }

    logDebug('Health monitoring complete', { findings, actions });
  } catch (error) {
    findings.push(`Health monitoring error: ${error}`);
  }

  return {
    taskName: 'health_monitoring',
    findings,
    actions,
    duration: Date.now() - startTime,
    nextRunAfter: TASK_INTERVALS.health_monitoring,
  };
}

/**
 * Quality Analysis - Analyze recent work quality trends
 */
export async function runQualityAnalysis(
  context: OrchestratorBackgroundContext
): Promise<BackgroundTaskResult> {
  const startTime = Date.now();
  const findings: string[] = [];
  const actions: string[] = [];

  try {
    const completedTasks = context.stateMachine
      .getTasks({ status: ['done'] })
      .slice(-20); // Last 20 tasks

    if (completedTasks.length === 0) {
      findings.push('No completed tasks to analyze');
    } else {
      // Check for quality issues
      const tasksWithIssues = completedTasks.filter(
        (task) => task.metadata?.qualityIssues
      );

      if (tasksWithIssues.length > 0) {
        findings.push(
          `${tasksWithIssues.length}/${completedTasks.length} recent tasks had quality issues`
        );
        actions.push('Review quality patterns and adjust standards');
      }

      // Check average completion time
      const durations = completedTasks
        .filter((task) => task.metadata?.duration)
        .map((task) => task.metadata!.duration as number);

      if (durations.length > 0) {
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        findings.push(
          `Average task completion: ${(avgDuration / 1000 / 60).toFixed(1)} minutes`
        );

        if (avgDuration > 30 * 60 * 1000) {
          // >30 min
          actions.push('Tasks taking longer than expected - consider breaking down');
        }
      }
    }

    logDebug('Quality analysis complete', { findings, actions });
  } catch (error) {
    findings.push(`Quality analysis error: ${error}`);
  }

  return {
    taskName: 'quality_analysis',
    findings,
    actions,
    duration: Date.now() - startTime,
    nextRunAfter: TASK_INTERVALS.quality_analysis,
  };
}

/**
 * Bottleneck Detection - Identify what's slowing progress
 */
export async function runBottleneckDetection(
  context: OrchestratorBackgroundContext
): Promise<BackgroundTaskResult> {
  const startTime = Date.now();
  const findings: string[] = [];
  const actions: string[] = [];

  try {
    const blockedTasks = context.stateMachine.getTasks({ status: ['blocked'] });
    const inProgressTasks = context.stateMachine.getTasks({
      status: ['in_progress'],
    });

    // Check for common blockers
    const blockerReasons = new Map<string, number>();
    for (const task of blockedTasks) {
      const reason = (task.metadata?.blockerReason as string) || 'unknown';
      blockerReasons.set(reason, (blockerReasons.get(reason) || 0) + 1);
    }

    if (blockerReasons.size > 0) {
      findings.push('Common blockers detected:');
      for (const [reason, count] of Array.from(blockerReasons.entries()).sort(
        (a, b) => b[1] - a[1]
      )) {
        findings.push(`  - ${reason}: ${count} tasks`);
        actions.push(`Address blocker: ${reason}`);
      }
    }

    // Check for long-running tasks
    const longRunning = inProgressTasks.filter((task) => {
      if (!task.metadata?.startedAt) {
        return false;
      }
      const startedAt = typeof task.metadata.startedAt === 'string'
        ? new Date(task.metadata.startedAt as string).getTime()
        : task.metadata.startedAt as number;
      return Date.now() - startedAt > 60 * 60 * 1000; // >1 hour
    });

    if (longRunning.length > 0) {
      findings.push(`${longRunning.length} tasks running >1 hour`);
      actions.push('Check if long-running tasks need intervention');
    }

    logDebug('Bottleneck detection complete', { findings, actions });
  } catch (error) {
    findings.push(`Bottleneck detection error: ${error}`);
  }

  return {
    taskName: 'bottleneck_detection',
    findings,
    actions,
    duration: Date.now() - startTime,
    nextRunAfter: TASK_INTERVALS.bottleneck_detection,
  };
}

/**
 * Progress Reporting - Generate progress summaries
 */
export async function runProgressReporting(
  context: OrchestratorBackgroundContext
): Promise<BackgroundTaskResult> {
  const startTime = Date.now();
  const findings: string[] = [];
  const actions: string[] = [];

  try {
    const tasks = context.stateMachine.getTasks();
    const byStatus = {
      done: tasks.filter((t) => t.status === 'done').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      blocked: tasks.filter((t) => t.status === 'blocked').length,
      pending: tasks.filter((t) => t.status === 'pending').length,
    };

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const completionPct = total > 0 ? (byStatus.done / total) * 100 : 0;

    findings.push(`Overall Progress: ${completionPct.toFixed(1)}%`);
    findings.push(
      `  ✓ Done: ${byStatus.done} | ▶ In Progress: ${byStatus.in_progress} | ⏸ Blocked: ${byStatus.blocked} | ⏳ Pending: ${byStatus.pending}`
    );

    if (completionPct > 90) {
      actions.push('Roadmap nearly complete - plan next phase');
    }

    if (byStatus.blocked > byStatus.in_progress) {
      actions.push('More tasks blocked than in progress - prioritize unblocking');
    }

    logDebug('Progress reporting complete', { findings, actions });
  } catch (error) {
    findings.push(`Progress reporting error: ${error}`);
  }

  return {
    taskName: 'progress_reporting',
    findings,
    actions,
    duration: Date.now() - startTime,
    nextRunAfter: TASK_INTERVALS.progress_reporting,
  };
}

/**
 * Strategic Planning - Think ahead about future work
 */
export async function runStrategicPlanning(
  context: OrchestratorBackgroundContext
): Promise<BackgroundTaskResult> {
  const startTime = Date.now();
  const findings: string[] = [];
  const actions: string[] = [];

  try {
    const pendingTasks = context.stateMachine.getTasks({ status: ['pending'] });
    const doneTasks = context.stateMachine.getTasks({ status: ['done'] });

    findings.push(`Completed: ${doneTasks.length} tasks`);
    findings.push(`Remaining: ${pendingTasks.length} tasks`);

    if (pendingTasks.length < 5) {
      findings.push('Low task backlog');
      actions.push('Consider extending roadmap with next phase tasks');
    }

    // Check for task balance across domains
    const domains = new Map<string, number>();
    for (const task of pendingTasks) {
      const domain = (task.metadata?.domain as string) || (task as any).domain || 'unknown';
      domains.set(domain, (domains.get(domain) || 0) + 1);
    }

    if (domains.size > 0) {
      findings.push('Task distribution by domain:');
      for (const [domain, count] of Array.from(domains.entries()).sort(
        (a, b) => b[1] - a[1]
      )) {
        findings.push(`  - ${domain}: ${count} tasks`);
      }
    }

    logDebug('Strategic planning complete', { findings, actions });
  } catch (error) {
    findings.push(`Strategic planning error: ${error}`);
  }

  return {
    taskName: 'strategic_planning',
    findings,
    actions,
    duration: Date.now() - startTime,
    nextRunAfter: TASK_INTERVALS.strategic_planning,
  };
}

/**
 * Execute a background task
 */
export async function executeBackgroundTask(
  taskType: BackgroundTaskType,
  context: OrchestratorBackgroundContext
): Promise<BackgroundTaskResult> {
  logInfo('Orchestrator executing background task', { taskType });

  let result: BackgroundTaskResult;

  switch (taskType) {
    case 'health_monitoring':
      result = await runHealthMonitoring(context);
      break;
    case 'quality_analysis':
      result = await runQualityAnalysis(context);
      break;
    case 'bottleneck_detection':
      result = await runBottleneckDetection(context);
      break;
    case 'progress_reporting':
      result = await runProgressReporting(context);
      break;
    case 'strategic_planning':
      result = await runStrategicPlanning(context);
      break;
    default:
      result = {
        taskName: taskType,
        findings: ['Background task not yet implemented'],
        actions: [],
        duration: 0,
      };
  }

  markTaskCompleted(taskType);

  logInfo('Background task complete', {
    taskType,
    findingsCount: result.findings.length,
    actionsCount: result.actions.length,
    duration: result.duration,
  });

  return result;
}

/**
 * Get a synthetic background task for the orchestrator
 * This creates a Task object that can be assigned to the orchestrator
 */
export function getBackgroundTaskAsTask(
  taskType: BackgroundTaskType
): Partial<Task> {
  const taskTitles: Record<BackgroundTaskType, string> = {
    health_monitoring: 'Monitor system health and detect issues',
    quality_analysis: 'Analyze recent work quality trends',
    roadmap_optimization: 'Optimize roadmap task ordering',
    bottleneck_detection: 'Identify and report bottlenecks',
    progress_reporting: 'Generate progress summary report',
    strategic_planning: 'Plan future work phases',
    resource_optimization: 'Analyze and optimize resource usage',
    risk_assessment: 'Assess project risks and mitigation strategies',
    knowledge_synthesis: 'Synthesize learnings from recent work',
  };

  return {
    id: `BG-${taskType.toUpperCase()}`,
    title: taskTitles[taskType],
    description: `Background orchestrator task: ${taskType.replace(/_/g, ' ')}`,
    status: 'in_progress',
    metadata: {
      isBackgroundTask: true,
      backgroundTaskType: taskType,
      priority: TASK_PRIORITIES[taskType],
      domain: 'mcp',
    },
  };
}
