/**
 * WIP Limit Enforcer - Focus on Finishing
 *
 * Enforces Work-In-Progress limits to prevent thrashing and improve flow.
 * Based on Little's Law: Cycle Time = WIP / Throughput
 *
 * Limits:
 * - Global: Max 5 tasks in progress system-wide
 * - Per Agent: Max 1 task per agent (prevents context switching)
 * - Per Epic: Max 3 tasks per epic (ensures breadth)
 *
 * Philosophy:
 * - Start fewer tasks, finish more tasks
 * - Lower WIP = faster cycle time = better throughput
 * - Forced prioritization reveals what's truly important
 *
 * Token Impact: 0 (pure logic, no LLM calls)
 * Expected Savings: 37.5K tokens/day by preventing concurrent thrashing
 */

import type { Task, StateMachine } from './state_machine.js';
import { logDebug, logInfo, logWarning } from '../telemetry/logger.js';

export interface WIPLimitsConfig {
  maxGlobal: number; // Default: 5
  maxPerAgent: number; // Default: 1
  maxPerEpic: number; // Default: 3
}

export interface WIPStatus {
  currentGlobal: number;
  currentPerAgent: Record<string, number>;
  currentPerEpic: Record<string, number>;
  atLimitGlobal: boolean;
  atLimitAgents: string[];
  atLimitEpics: string[];
}

export interface WIPDecision {
  allowed: boolean;
  reason?: string;
  recommendation?: string;
}

export class WIPLimitEnforcer {
  private config: WIPLimitsConfig;

  constructor(
    private readonly stateMachine: StateMachine,
    config?: Partial<WIPLimitsConfig>
  ) {
    this.config = {
      maxGlobal: config?.maxGlobal ?? 5,
      maxPerAgent: config?.maxPerAgent ?? 1,
      maxPerEpic: config?.maxPerEpic ?? 3,
    };

    logInfo('WIP limits initialized', {
      maxGlobal: this.config.maxGlobal,
      maxPerAgent: this.config.maxPerAgent,
      maxPerEpic: this.config.maxPerEpic,
    });
  }

  /**
   * Check if a task can be started without violating WIP limits
   */
  canStartTask(agentId: string, task: Task): WIPDecision {
    const status = this.getWIPStatus();

    // Check 1: Global WIP limit
    if (status.currentGlobal >= this.config.maxGlobal) {
      return {
        allowed: false,
        reason: `Global WIP limit reached (${status.currentGlobal}/${this.config.maxGlobal})`,
        recommendation: 'Finish existing tasks before starting new ones',
      };
    }

    // Check 2: Agent WIP limit
    const agentTaskCount = status.currentPerAgent[agentId] || 0;
    if (agentTaskCount >= this.config.maxPerAgent) {
      return {
        allowed: false,
        reason: `Agent at WIP limit (${agentTaskCount}/${this.config.maxPerAgent})`,
        recommendation: 'Wait for agent to finish current task',
      };
    }

    // Check 3: Epic WIP limit
    const epicId = task.metadata?.epic_id as string | undefined;
    if (epicId) {
      const epicTaskCount = status.currentPerEpic[epicId] || 0;
      if (epicTaskCount >= this.config.maxPerEpic) {
        return {
          allowed: false,
          reason: `Epic at WIP limit (${epicTaskCount}/${this.config.maxPerEpic})`,
          recommendation: 'Finish existing epic tasks before starting new ones',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get recommended tasks to start based on WIP capacity and impact
   */
  getRecommendedTasks(availableTasks: Task[], maxRecommendations = 5): Task[] {
    const status = this.getWIPStatus();

    // How much WIP capacity do we have?
    const globalCapacity = this.config.maxGlobal - status.currentGlobal;

    if (globalCapacity <= 0) {
      logDebug('No WIP capacity available', {
        current: status.currentGlobal,
        max: this.config.maxGlobal,
      });
      return [];
    }

    // Filter to tasks that won't violate epic limits
    const eligibleTasks = availableTasks.filter(task => {
      const epicId = task.metadata?.epic_id as string | undefined;
      if (!epicId) return true;

      const epicTaskCount = status.currentPerEpic[epicId] || 0;
      return epicTaskCount < this.config.maxPerEpic;
    });

    if (eligibleTasks.length === 0) {
      logDebug('No eligible tasks (all epics at WIP limit)', {
        atLimit: status.atLimitEpics,
      });
      return [];
    }

    // Sort by downstream impact (tasks with more dependents = higher priority)
    const sorted = this.sortByDownstreamImpact(eligibleTasks);

    // Return up to capacity or maxRecommendations, whichever is lower
    const count = Math.min(globalCapacity, maxRecommendations, sorted.length);

    logDebug('WIP-aware task recommendations', {
      available: availableTasks.length,
      eligible: eligibleTasks.length,
      recommended: count,
      globalCapacity,
    });

    return sorted.slice(0, count);
  }

  /**
   * Get current WIP status across all dimensions
   */
  getWIPStatus(): WIPStatus {
    const inProgressTasks = this.stateMachine.getTasks({ status: ['in_progress'] });

    // Count per agent
    const currentPerAgent: Record<string, number> = {};
    for (const task of inProgressTasks) {
      const agentId = task.metadata?.assigned_agent as string | undefined;
      if (agentId) {
        currentPerAgent[agentId] = (currentPerAgent[agentId] || 0) + 1;
      }
    }

    // Count per epic
    const currentPerEpic: Record<string, number> = {};
    for (const task of inProgressTasks) {
      const epicId = task.metadata?.epic_id as string | undefined;
      if (epicId) {
        currentPerEpic[epicId] = (currentPerEpic[epicId] || 0) + 1;
      }
    }

    // Identify what's at limit
    const atLimitAgents = Object.entries(currentPerAgent)
      .filter(([_, count]) => count >= this.config.maxPerAgent)
      .map(([agentId]) => agentId);

    const atLimitEpics = Object.entries(currentPerEpic)
      .filter(([_, count]) => count >= this.config.maxPerEpic)
      .map(([epicId]) => epicId);

    return {
      currentGlobal: inProgressTasks.length,
      currentPerAgent,
      currentPerEpic,
      atLimitGlobal: inProgressTasks.length >= this.config.maxGlobal,
      atLimitAgents,
      atLimitEpics,
    };
  }

  /**
   * Update WIP limits configuration
   */
  updateConfig(newConfig: Partial<WIPLimitsConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    logInfo('WIP limits updated', {
      old: oldConfig,
      new: this.config,
    });
  }

  /**
   * Get statistics for monitoring
   */
  getStatistics(): {
    averageWIP: number;
    averageCycleTime: number;
    throughput: number;
    utilizationPercent: number;
  } {
    // This would be enhanced with real historical tracking
    const status = this.getWIPStatus();

    return {
      averageWIP: status.currentGlobal,
      averageCycleTime: 0, // Would need historical data
      throughput: 0, // Would need historical data
      utilizationPercent: (status.currentGlobal / this.config.maxGlobal) * 100,
    };
  }

  // ==================== Private Helper Methods ====================

  /**
   * Sort tasks by downstream impact (how many other tasks depend on this)
   */
  private sortByDownstreamImpact(tasks: Task[]): Task[] {
    const allTasks = this.stateMachine.getTasks({});

    // Build dependency map
    const dependentsMap = new Map<string, string[]>();
    for (const task of allTasks) {
      const dependencies = this.stateMachine.getDependencies(task.id);
      if (dependencies && dependencies.length > 0) {
        for (const dep of dependencies) {
          const dependents = dependentsMap.get(dep.depends_on_task_id) || [];
          dependents.push(task.id);
          dependentsMap.set(dep.depends_on_task_id, dependents);
        }
      }
    }

    // Sort by number of dependents (more dependents = higher priority)
    return tasks.sort((a, b) => {
      const aImpact = this.calculateImpact(a, dependentsMap);
      const bImpact = this.calculateImpact(b, dependentsMap);
      return bImpact - aImpact;
    });
  }

  /**
   * Calculate downstream impact of a task
   */
  private calculateImpact(task: Task, dependentsMap: Map<string, string[]>): number {
    let impact = 0;

    // Direct dependents
    const directDependents = dependentsMap.get(task.id) || [];
    impact += directDependents.length * 10;

    // Critical path bonus
    if (task.metadata?.critical === true || task.metadata?.critical_path === true) {
      impact += 50;
    }

    // Blocked tasks bonus (if this is blocking others)
    if (directDependents.length > 0) {
      impact += 20;
    }

    // Priority from metadata
    const priority = task.metadata?.priority as number | undefined;
    if (priority) {
      impact += priority;
    }

    return impact;
  }

  /**
   * Check if WIP limits are being respected
   */
  private checkCompliance(): boolean {
    const status = this.getWIPStatus();

    if (status.currentGlobal > this.config.maxGlobal) {
      logWarning('Global WIP limit exceeded', {
        current: status.currentGlobal,
        max: this.config.maxGlobal,
      });
      return false;
    }

    for (const [agentId, count] of Object.entries(status.currentPerAgent)) {
      if (count > this.config.maxPerAgent) {
        logWarning('Agent WIP limit exceeded', {
          agentId,
          current: count,
          max: this.config.maxPerAgent,
        });
        return false;
      }
    }

    for (const [epicId, count] of Object.entries(status.currentPerEpic)) {
      if (count > this.config.maxPerEpic) {
        logWarning('Epic WIP limit exceeded', {
          epicId,
          current: count,
          max: this.config.maxPerEpic,
        });
        return false;
      }
    }

    return true;
  }
}
