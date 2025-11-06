/**
 * Phase Manager
 *
 * Manages task phase decomposition, tracking, and progression.
 * Handles:
 * - Creating initial phases for tasks
 * - Tracking phase completion
 * - Auto-generating improvement phases from discoveries
 * - Calculating progress metrics
 */

import type {
  TaskPhase,
  PhaseResult,
  Discovery,
  ProgressInfo,
  TaskWithPhases,
} from './types.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

export class PhaseManager {
  /**
   * Create initial phases for a task
   */
  createInitialPhases(taskId: string): TaskPhase[] {
    return [
      {
        id: `${taskId}.impl`,
        title: 'Implementation phase',
        type: 'implementation',
        status: 'pending',
      },
      {
        id: `${taskId}.discovery`,
        title: 'Discovery phase (run proof checks)',
        type: 'discovery',
        status: 'pending',
        nextPhases: [], // Will be populated based on discovery results
      },
      {
        id: `${taskId}.verify-final`,
        title: 'Final verification',
        type: 'verification',
        status: 'pending',
      },
    ];
  }

  /**
   * Complete a phase and update task state
   */
  async completePhase(
    task: TaskWithPhases,
    phaseId: string,
    result: PhaseResult
  ): Promise<void> {
    if (!task.phases) {
      task.phases = this.createInitialPhases(task.id);
    }

    const phase = task.phases.find((p) => p.id === phaseId);
    if (!phase) {
      logWarning(`Phase ${phaseId} not found in task ${task.id}`);
      return;
    }

    phase.status = 'complete';
    phase.completedAt = new Date().toISOString();
    phase.result = result;

    // Update task stats
    if (!task.stats) {
      task.stats = {
        phasesCompleted: 0,
        issuesFixed: 0,
        iterationCount: 0,
        firstTimeProven: false,
      };
    }
    task.stats.phasesCompleted++;

    // If discovery phase, generate improvement phases
    if (phase.type === 'discovery' && result.discoveries && result.discoveries.length > 0) {
      const improvementPhases = this.generateImprovementPhases(task.id, result.discoveries);

      // Insert improvement phases after discovery phase
      const discoveryIndex = task.phases.findIndex((p) => p.id === phaseId);
      task.phases.splice(discoveryIndex + 1, 0, ...improvementPhases);

      // Update discovery phase to point to improvement phases
      phase.nextPhases = improvementPhases.map((p) => p.id);

      // Increment iteration count
      task.stats.iterationCount++;

      logInfo(`Generated ${improvementPhases.length} improvement phases for ${task.id}`);
    }

    logInfo(`Completed phase ${phaseId} for task ${task.id}`, {
      outcome: result.outcome,
      discoveries: result.discoveries?.length || 0,
    });
  }

  /**
   * Generate improvement phases from discoveries
   */
  generateImprovementPhases(taskId: string, discoveries: Discovery[]): TaskPhase[] {
    // If too many issues (>10), batch them
    if (discoveries.length > 10) {
      return [
        {
          id: `${taskId}.improve-batch`,
          title: `Apply improvements (${discoveries.length} issues found)`,
          type: 'improvement',
          status: 'pending',
          context: { issues: discoveries },
        },
      ];
    }

    // Individual phases for each discovery
    return discoveries.map((discovery, index) => ({
      id: `${taskId}.improve-${index + 1}`,
      title: `Improvement: ${discovery.title}`,
      type: 'improvement',
      status: 'pending',
      context: { issue: discovery },
    }));
  }

  /**
   * Calculate progress for a task
   */
  calculateProgress(task: TaskWithPhases): ProgressInfo {
    if (!task.phases || task.phases.length === 0) {
      return {
        completed: 0,
        total: 0,
        percentage: 0,
        recentlyCompleted: [],
        nextPhases: [],
      };
    }

    const completed = task.phases.filter((p) => p.status === 'complete').length;
    const total = task.phases.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Recently completed (last 3)
    const recentlyCompleted = task.phases
      .filter((p) => p.status === 'complete')
      .sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeB - timeA; // Most recent first
      })
      .slice(0, 3);

    // Current phase (first in_progress)
    const currentPhase = task.phases.find((p) => p.status === 'in_progress');

    // Next phases (first 2 pending)
    const nextPhases = task.phases.filter((p) => p.status === 'pending').slice(0, 2);

    return {
      completed,
      total,
      percentage,
      recentlyCompleted,
      currentPhase,
      nextPhases,
    };
  }

  /**
   * Get next phase to execute
   */
  getNextPhase(task: TaskWithPhases): TaskPhase | null {
    if (!task.phases || task.phases.length === 0) {
      return null;
    }

    // Check for in_progress phase (resume)
    const inProgress = task.phases.find((p) => p.status === 'in_progress');
    if (inProgress) {
      return inProgress;
    }

    // Get first pending phase
    const pending = task.phases.find((p) => p.status === 'pending');
    if (pending) {
      return pending;
    }

    return null;
  }

  /**
   * Mark phase as started
   */
  startPhase(task: TaskWithPhases, phaseId: string): void {
    if (!task.phases) {
      return;
    }

    const phase = task.phases.find((p) => p.id === phaseId);
    if (phase && phase.status === 'pending') {
      phase.status = 'in_progress';
      logInfo(`Started phase ${phaseId} for task ${task.id}`);
    }
  }

  /**
   * Check if all phases are complete
   */
  allPhasesComplete(task: TaskWithPhases): boolean {
    if (!task.phases || task.phases.length === 0) {
      return false;
    }

    return task.phases.every((p) => p.status === 'complete');
  }

  /**
   * Get phase completion summary (for display)
   */
  getCompletionSummary(task: TaskWithPhases): string {
    const progress = this.calculateProgress(task);

    if (progress.total === 0) {
      return `${task.title} - No phases`;
    }

    const bar = this.renderProgressBar(progress.completed, progress.total);
    return `${task.title}\n${bar}`;
  }

  /**
   * Render ASCII progress bar
   */
  private renderProgressBar(completed: number, total: number): string {
    if (total === 0) {
      return '░░░░░░░░░░ 0% (0/0)';
    }

    const percentage = Math.round((completed / total) * 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;

    const supportsUnicode = process.stdout.isTTY && !process.env.TERM?.includes('dumb');

    if (supportsUnicode) {
      return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${percentage}% (${completed}/${total})`;
    } else {
      // ASCII fallback
      return `${'#'.repeat(filled)}${'-'.repeat(empty)} ${percentage}% (${completed}/${total})`;
    }
  }
}
