/**
 * Achievement System
 *
 * Tracks agent stats and unlocks achievements:
 * - Phases completed this session
 * - Issues fixed this session
 * - Max iterations on task
 * - First-time proven count
 * - Achievement unlocking with notifications
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  Achievement,
  AgentStats,
  TaskPhase,
  TaskWithPhases,
} from './types.js';
import { logInfo } from '../telemetry/logger.js';
import { resolveStateRoot } from '../utils/config.js';

export class AchievementSystem {
  private workspaceRoot: string;
  private stateRoot: string;
  private statsPath: string;

  // Achievement definitions
  private readonly ACHIEVEMENTS: Achievement[] = [
    {
      id: 'thorough_tester',
      title: 'Thorough Tester',
      description: 'Completed 3+ proof iterations on a single task',
      icon: '🔬',
      condition: (stats) => stats.maxIterationsOnTask >= 3,
    },
    {
      id: 'bug_hunter',
      title: 'Bug Hunter',
      description: 'Fixed 20+ issues in a single session',
      icon: '🐛',
      condition: (stats) => stats.issuesFixedThisSession >= 20,
    },
    {
      id: 'perfectionist',
      title: 'Perfectionist',
      description: 'Achieved 100% proof criteria on first try',
      icon: '💎',
      condition: (stats) => stats.firstTimeProvenCount >= 1,
    },
    {
      id: 'persistent',
      title: 'Persistent',
      description: 'Iterated 5+ times until proven',
      icon: '💪',
      condition: (stats) => stats.maxIterationsOnTask >= 5,
    },
    {
      id: 'quality_champion',
      title: 'Quality Champion',
      description: 'Completed 10+ tasks with proof',
      icon: '🏆',
      condition: (stats) => stats.totalTasksCompleted >= 10,
    },
  ];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);
    this.statsPath = path.join(this.stateRoot, 'analytics', 'agent_stats.json');
  }

  /**
   * Get agent stats for session
   */
  getAgentStats(sessionId: string): AgentStats {
    if (!fs.existsSync(this.statsPath)) {
      return this.createDefaultStats(sessionId);
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8'));
      return data[sessionId] || this.createDefaultStats(sessionId);
    } catch (error) {
      logInfo('Failed to load agent stats, using defaults');
      return this.createDefaultStats(sessionId);
    }
  }

  /**
   * Create default stats
   */
  private createDefaultStats(sessionId: string): AgentStats {
    return {
      sessionId,
      phasesCompletedThisSession: 0,
      issuesFixedThisSession: 0,
      maxIterationsOnTask: 0,
      firstTimeProvenCount: 0,
      totalTasksCompleted: 0,
      achievements: [],
    };
  }

  /**
   * Track phase completion
   */
  async trackPhaseCompletion(
    sessionId: string,
    phase: TaskPhase,
    task: TaskWithPhases
  ): Promise<Achievement[]> {
    const stats = this.getAgentStats(sessionId);

    // Update stats
    stats.phasesCompletedThisSession++;

    // Track improvements (issues fixed)
    if (phase.type === 'improvement') {
      stats.issuesFixedThisSession++;
    }

    // Track iterations
    if (task.stats && task.stats.iterationCount > stats.maxIterationsOnTask) {
      stats.maxIterationsOnTask = task.stats.iterationCount;
    }

    // Track first-time proven
    if (task.stats && task.stats.firstTimeProven) {
      stats.firstTimeProvenCount++;
    }

    // Track task completion
    if (task.status === 'proven') {
      stats.totalTasksCompleted++;
    }

    // Save stats
    await this.saveStats(sessionId, stats);

    // Check for new achievements
    const newAchievements = await this.checkAchievements(stats);

    return newAchievements;
  }

  /**
   * Check for new achievements
   */
  private async checkAchievements(stats: AgentStats): Promise<Achievement[]> {
    const newAchievements: Achievement[] = [];

    for (const achievement of this.ACHIEVEMENTS) {
      // Skip if already unlocked
      if (stats.achievements.includes(achievement.id)) {
        continue;
      }

      // Check condition
      if (achievement.condition(stats)) {
        newAchievements.push(achievement);
        stats.achievements.push(achievement.id);

        // Display notification
        this.displayAchievementUnlock(achievement);

        logInfo('Achievement unlocked', {
          sessionId: stats.sessionId,
          achievement: achievement.id,
        });
      }
    }

    return newAchievements;
  }

  /**
   * Display achievement unlock notification
   */
  displayAchievementUnlock(achievement: Achievement): void {
    console.log('\n' + '='.repeat(50));
    console.log('🎉 Achievement Unlocked! 🎉');
    console.log(`${achievement.icon} ${achievement.title}`);
    console.log(achievement.description);
    console.log('='.repeat(50) + '\n');
  }

  /**
   * Get achievements for display
   */
  getAchievements(sessionId: string): Achievement[] {
    const stats = this.getAgentStats(sessionId);
    return this.ACHIEVEMENTS.filter((a) => stats.achievements.includes(a.id));
  }

  /**
   * Get achievement progress (for display)
   */
  getAchievementProgress(sessionId: string): Array<{
    achievement: Achievement;
    unlocked: boolean;
    progress?: string;
  }> {
    const stats = this.getAgentStats(sessionId);

    return this.ACHIEVEMENTS.map((achievement) => {
      const unlocked = stats.achievements.includes(achievement.id);

      let progress: string | undefined;
      if (!unlocked) {
        // Calculate progress toward achievement
        if (achievement.id === 'thorough_tester') {
          progress = `${stats.maxIterationsOnTask}/3 iterations`;
        } else if (achievement.id === 'bug_hunter') {
          progress = `${stats.issuesFixedThisSession}/20 issues`;
        } else if (achievement.id === 'perfectionist') {
          progress = `${stats.firstTimeProvenCount}/1 first-time proven`;
        } else if (achievement.id === 'persistent') {
          progress = `${stats.maxIterationsOnTask}/5 iterations`;
        } else if (achievement.id === 'quality_champion') {
          progress = `${stats.totalTasksCompleted}/10 tasks`;
        }
      }

      return { achievement, unlocked, progress };
    });
  }

  /**
   * Save stats to file
   */
  private async saveStats(sessionId: string, stats: AgentStats): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.statsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Load existing stats
      let allStats: Record<string, AgentStats> = {};
      if (fs.existsSync(this.statsPath)) {
        allStats = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8'));
      }

      // Update session stats
      allStats[sessionId] = stats;

      // Save
      fs.writeFileSync(this.statsPath, JSON.stringify(allStats, null, 2), 'utf-8');
    } catch (error) {
      logInfo('Failed to save agent stats', { error });
    }
  }

  /**
   * Display achievement summary
   */
  displayAchievementSummary(sessionId: string): void {
    const progress = this.getAchievementProgress(sessionId);

    console.log('\n=== Achievement Progress ===\n');

    for (const { achievement, unlocked, progress: prog } of progress) {
      if (unlocked) {
        console.log(`${achievement.icon} ${achievement.title} - UNLOCKED ✅`);
      } else {
        console.log(`⬜ ${achievement.title} - ${prog || 'Not started'}`);
      }
    }

    console.log('\n');
  }
}
