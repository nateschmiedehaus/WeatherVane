/**
 * TaskProgressTracker - Visual progress bars for task execution
 *
 * Shows real-time progress for all active tasks with:
 * - Visual progress bars (0-100%)
 * - Step-by-step tracking (1/7, 2/7, etc.)
 * - Completion indicators (✅ Success, ❌ Failed)
 * - Time elapsed and ETA
 */

import cliProgress from 'cli-progress';

import { logInfo } from '../telemetry/logger.js';

export interface TaskStep {
  name: string;
  percentage: number;
}

export const TASK_EXECUTION_STEPS: TaskStep[] = [
  { name: 'Classifying requirements', percentage: 5 },
  { name: 'Pre-task quality review', percentage: 15 },
  { name: 'Pre-flight checks', percentage: 20 },
  { name: 'Assembling context', percentage: 30 },
  { name: 'Executing with AI', percentage: 60 },
  { name: 'Processing results', percentage: 70 },
  { name: 'Quality gate verification', percentage: 100 },
];

export interface TaskProgress {
  taskId: string;
  taskTitle: string;
  agentId: string;
  currentStep: number;
  totalSteps: number;
  percentage: number;
  startTime: number;
  bar?: cliProgress.SingleBar;
  status: 'running' | 'completed' | 'failed';
}

export class TaskProgressTracker {
  private activeTasks = new Map<string, TaskProgress>();
  private multibar?: cliProgress.MultiBar;
  private enabled = true;

  constructor() {
    // Initialize multibar for multiple simultaneous progress bars
    this.multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: '{status} {bar} {percentage}% | {agent} | {task} | {step} | {eta_formatted}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    }, cliProgress.Presets.shades_classic);
  }

  /**
   * Start tracking a new task
   */
  startTask(taskId: string, taskTitle: string, agentId: string): void {
    if (!this.enabled || !this.multibar) return;

    // Create progress bar for this task
    const bar = this.multibar.create(100, 0, {
      status: '🔵',
      agent: agentId,
      task: taskTitle.substring(0, 40),
      step: '1/' + TASK_EXECUTION_STEPS.length,
      eta_formatted: 'calculating...',
    });

    const progress: TaskProgress = {
      taskId,
      taskTitle,
      agentId,
      currentStep: 0,
      totalSteps: TASK_EXECUTION_STEPS.length,
      percentage: 0,
      startTime: Date.now(),
      bar,
      status: 'running',
    };

    this.activeTasks.set(taskId, progress);

    logInfo('📊 Started progress tracking', {
      taskId,
      taskTitle,
      agentId,
    });
  }

  /**
   * Update task progress to next step
   */
  updateStep(taskId: string, stepName: string): void {
    if (!this.enabled) return;

    const progress = this.activeTasks.get(taskId);
    if (!progress || !progress.bar) return;

    // Find step by name
    const stepIndex = TASK_EXECUTION_STEPS.findIndex(s => s.name.includes(stepName) || stepName.includes(s.name));

    if (stepIndex !== -1) {
      const step = TASK_EXECUTION_STEPS[stepIndex];
      progress.currentStep = stepIndex + 1;
      progress.percentage = step.percentage;

      const elapsed = Date.now() - progress.startTime;
      const etaMs = progress.percentage > 0 ? (elapsed / progress.percentage) * (100 - progress.percentage) : 0;
      const etaFormatted = this.formatDuration(etaMs);

      progress.bar.update(progress.percentage, {
        status: '🔵',
        step: `${progress.currentStep}/${progress.totalSteps}`,
        eta_formatted: etaFormatted,
      });
    }
  }

  /**
   * Set task percentage directly
   */
  setPercentage(taskId: string, percentage: number, stepName?: string): void {
    if (!this.enabled) return;

    const progress = this.activeTasks.get(taskId);
    if (!progress || !progress.bar) return;

    progress.percentage = Math.min(100, Math.max(0, percentage));

    const elapsed = Date.now() - progress.startTime;
    const etaMs = progress.percentage > 0 && progress.percentage < 100
      ? (elapsed / progress.percentage) * (100 - progress.percentage)
      : 0;
    const etaFormatted = this.formatDuration(etaMs);

    progress.bar.update(progress.percentage, {
      status: '🔵',
      step: stepName || `${progress.currentStep}/${progress.totalSteps}`,
      eta_formatted: etaFormatted,
    });
  }

  /**
   * Mark task as completed successfully
   */
  completeTask(taskId: string, output?: string): void {
    if (!this.enabled) return;

    const progress = this.activeTasks.get(taskId);
    if (!progress || !progress.bar) return;

    progress.status = 'completed';
    progress.percentage = 100;

    const elapsed = Date.now() - progress.startTime;
    const duration = this.formatDuration(elapsed);

    progress.bar.update(100, {
      status: '✅',
      step: 'COMPLETED',
      eta_formatted: duration,
    });

    progress.bar.stop();

    logInfo('✅ Task completed', {
      taskId,
      taskTitle: progress.taskTitle,
      duration,
      output: output?.substring(0, 100),
    });

    // Remove from active tasks after brief delay
    setTimeout(() => {
      this.activeTasks.delete(taskId);
    }, 2000);
  }

  /**
   * Mark task as failed
   */
  failTask(taskId: string, error?: string): void {
    if (!this.enabled) return;

    const progress = this.activeTasks.get(taskId);
    if (!progress || !progress.bar) return;

    progress.status = 'failed';

    const elapsed = Date.now() - progress.startTime;
    const duration = this.formatDuration(elapsed);

    progress.bar.update(progress.percentage, {
      status: '❌',
      step: 'FAILED',
      eta_formatted: duration,
    });

    progress.bar.stop();

    logInfo('❌ Task failed', {
      taskId,
      taskTitle: progress.taskTitle,
      duration,
      error: error?.substring(0, 100),
    });

    // Remove from active tasks after brief delay
    setTimeout(() => {
      this.activeTasks.delete(taskId);
    }, 2000);
  }

  /**
   * Mark task as escalating (quality gate failure)
   */
  escalateTask(taskId: string, escalationLevel: number, reason: string): void {
    if (!this.enabled) return;

    const progress = this.activeTasks.get(taskId);
    if (!progress || !progress.bar) return;

    const elapsed = Date.now() - progress.startTime;
    const duration = this.formatDuration(elapsed);

    progress.bar.update(progress.percentage, {
      status: '🔺',
      step: `ESCALATE L${escalationLevel}`,
      eta_formatted: duration,
    });

    logInfo('🔺 Task escalating', {
      taskId,
      taskTitle: progress.taskTitle,
      escalationLevel,
      reason: reason.substring(0, 100),
    });

    // Don't remove - task is still active in remediation
  }

  /**
   * Get progress for a specific task
   */
  getProgress(taskId: string): TaskProgress | undefined {
    return this.activeTasks.get(taskId);
  }

  /**
   * Get all active task progress
   */
  getAllProgress(): TaskProgress[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Clear all progress bars and stop tracking
   */
  stop(): void {
    if (this.multibar) {
      this.multibar.stop();
    }
    this.activeTasks.clear();
  }

  /**
   * Enable or disable progress bars
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  /**
   * Format duration in ms to human readable string
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
      return `${Math.round(ms / 1000)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }
}
