/**
 * Progress Tracker
 *
 * Visualizes task progress with:
 * - ASCII progress bars
 * - Completion metrics
 * - Recently completed phases
 * - Current and next phases
 * - Session-wide summaries
 */

import type {
  TaskWithPhases,
  ProgressInfo,
  CompletionSummary,
  SessionSummary,
  Achievement,
} from './types.js';
import { PhaseManager } from './phase_manager.js';
import { logInfo } from '../telemetry/logger.js';

export class ProgressTracker {
  private phaseManager: PhaseManager;

  constructor(phaseManager: PhaseManager) {
    this.phaseManager = phaseManager;
  }

  /**
   * Display progress for a task
   */
  displayProgress(task: TaskWithPhases): void {
    const progress = this.phaseManager.calculateProgress(task);
    const display = this.formatProgressDisplay(task, progress);

    console.log('\n' + display + '\n');
    logInfo('Progress displayed', { taskId: task.id, progress: progress.percentage });
  }

  /**
   * Format progress display
   */
  private formatProgressDisplay(task: TaskWithPhases, progress: ProgressInfo): string {
    let output = '';

    // Title and progress bar
    output += `${task.title}\n`;
    output += `${this.renderProgressBar(progress.completed, progress.total)}\n\n`;

    // Recently completed (if any)
    if (progress.recentlyCompleted.length > 0) {
      output += 'Recently Completed:\n';
      for (const phase of progress.recentlyCompleted) {
        output += `  ✅ ${phase.title}\n`;
      }
      output += '\n';
    }

    // Current phase (if any)
    if (progress.currentPhase) {
      output += 'Current Step:\n';
      output += `  ⏳ ${progress.currentPhase.title}\n\n`;
    }

    // Next phases (if any)
    if (progress.nextPhases.length > 0) {
      output += 'Next Up:\n';
      for (const phase of progress.nextPhases) {
        output += `  ⬜ ${phase.title}\n`;
      }
    }

    return output;
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

  /**
   * Get completion summary for a task
   */
  getCompletionSummary(task: TaskWithPhases): CompletionSummary {
    const progress = this.phaseManager.calculateProgress(task);
    const displayText = this.formatProgressDisplay(task, progress);

    return {
      taskId: task.id,
      progress,
      displayText,
    };
  }

  /**
   * Get session summary across all tasks
   */
  getSessionSummary(tasks: TaskWithPhases[], achievements: Achievement[]): SessionSummary {
    let totalPhasesCompleted = 0;
    let totalIssuesFixed = 0;
    let totalTasksCompleted = 0;

    for (const task of tasks) {
      if (task.stats) {
        totalPhasesCompleted += task.stats.phasesCompleted;
        totalIssuesFixed += task.stats.issuesFixed;
        if (task.status === 'proven') {
          totalTasksCompleted++;
        }
      }
    }

    return {
      totalPhasesCompleted,
      totalIssuesFixed,
      totalTasksCompleted,
      achievementsUnlocked: achievements.length,
      topAchievements: achievements.slice(0, 5), // Top 5
    };
  }

  /**
   * Display session summary
   */
  displaySessionSummary(summary: SessionSummary): void {
    console.log('\n=== Session Summary ===\n');
    console.log(`✅ Phases completed: ${summary.totalPhasesCompleted}`);
    console.log(`🔧 Issues fixed: ${summary.totalIssuesFixed}`);
    console.log(`🏆 Tasks proven: ${summary.totalTasksCompleted}`);
    console.log(`🎖️  Achievements unlocked: ${summary.achievementsUnlocked}`);

    if (summary.topAchievements.length > 0) {
      console.log('\nTop Achievements:');
      for (const achievement of summary.topAchievements) {
        console.log(`  ${achievement.icon} ${achievement.title}`);
      }
    }

    console.log('\n');
  }

  /**
   * Display quick progress (minimal output)
   */
  displayQuickProgress(task: TaskWithPhases): void {
    const progress = this.phaseManager.calculateProgress(task);
    const bar = this.renderProgressBar(progress.completed, progress.total);
    console.log(`${task.title}: ${bar}`);
  }
}
