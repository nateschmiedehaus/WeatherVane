/**
 * BlockerEscalationManager - Prevents silent work stoppage
 *
 * Essential #7: Guarantees <8h blocker resolution through automatic escalation
 *
 * Flow:
 * 1. Task blocked → Wait 4h → Escalate to Atlas (high-priority)
 * 2. Still blocked → Wait 20h more → Escalate to Director Dana (critical)
 *
 * Pattern: Inspired by PagerDuty's escalation policies and incident.io's SLA tracking
 */

import { logInfo, logWarning, logDebug } from '../telemetry/logger.js';

import type { RoadmapTracker } from './roadmap_tracker.js';
import type { StateMachine, Task } from './state_machine.js';

interface BlockerRecord {
  taskId: string;
  blockedAt: number; // timestamp when task became blocked
  escalationLevel: 0 | 1 | 2; // 0=none, 1=atlas, 2=dana
  lastEscalatedAt?: number;
}

export class BlockerEscalationManager {
  private blockerRecords: Map<string, BlockerRecord> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private currentCheck: Promise<void> | null = null;
  private stopped = false;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
  private readonly LEVEL_1_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
  private readonly LEVEL_2_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly roadmapTracker: RoadmapTracker,
    private readonly workspaceRoot: string
  ) {}

  /**
   * Start monitoring for blocked tasks
   */
  start(): void {
    if (this.monitorInterval) {
      return; // Already running
    }

    this.stopped = false;

    logInfo('BlockerEscalationManager started', {
      checkInterval: `${this.CHECK_INTERVAL_MS / 1000 / 60} minutes`,
      level1Threshold: `${this.LEVEL_1_THRESHOLD_MS / 1000 / 60 / 60} hours`,
      level2Threshold: `${this.LEVEL_2_THRESHOLD_MS / 1000 / 60 / 60} hours`,
    });

    // Initial check
    this.runCheck();

    // Schedule periodic checks
    this.monitorInterval = setInterval(() => {
      this.runCheck();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Run check and track promise for graceful shutdown
   */
  private runCheck(): void {
    if (this.stopped) {
      return;
    }
    this.currentCheck = this.checkBlockedTasks().catch(err => {
      if (!this.stopped) {
        logWarning('Blocker check failed', { error: err.message });
      }
    }).finally(() => {
      if (this.currentCheck) {
        this.currentCheck = null;
      }
    });
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    // Wait for any running check to complete
    if (this.currentCheck) {
      try {
        await this.currentCheck;
      } catch {
        // Errors already logged in runCheck
      }
    }

    logInfo('BlockerEscalationManager stopped');
  }

  /**
   * Register a newly blocked task
   */
  recordBlockedTask(taskId: string): void {
    if (!this.blockerRecords.has(taskId)) {
      this.blockerRecords.set(taskId, {
        taskId,
        blockedAt: Date.now(),
        escalationLevel: 0,
      });
      logDebug('Blocker recorded', { taskId, blockedAt: new Date().toISOString() });
    }
  }

  /**
   * Clear blocker record when task is unblocked
   */
  clearBlockerRecord(taskId: string): void {
    if (this.blockerRecords.has(taskId)) {
      const record = this.blockerRecords.get(taskId)!;
      const blockedDuration = Date.now() - record.blockedAt;

      this.blockerRecords.delete(taskId);

      logInfo('Blocker cleared', {
        taskId,
        blockedDurationMinutes: Math.round(blockedDuration / 1000 / 60),
        escalationLevel: record.escalationLevel,
      });
    }
  }

  /**
   * Check all blocked tasks and escalate if needed
   */
  private async checkBlockedTasks(): Promise<void> {
    if (this.stopped) {
      return;
    }

    const blockedTasks = this.stateMachine.getTasks({ status: ['blocked'] });
    const now = Date.now();

    logDebug('Checking blocked tasks', { count: blockedTasks.length });

    // Update records for currently blocked tasks
    for (const task of blockedTasks) {
      if (!this.blockerRecords.has(task.id)) {
        this.recordBlockedTask(task.id);
      }
    }

    // Remove records for tasks that are no longer blocked
    for (const [taskId, record] of this.blockerRecords.entries()) {
      const task = blockedTasks.find(t => t.id === taskId);
      if (!task) {
        this.clearBlockerRecord(taskId);
      }
    }

    // Check escalation SLAs
    for (const [taskId, record] of this.blockerRecords.entries()) {
      const blockedDuration = now - record.blockedAt;
      const task = blockedTasks.find(t => t.id === taskId);

      if (!task) continue;

      // Level 2: 24h → Escalate to Director Dana (Critical)
      if (blockedDuration >= this.LEVEL_2_THRESHOLD_MS && record.escalationLevel < 2) {
        await this.escalateLevel2(task, record);
      }
      // Level 1: 4h → Escalate to Atlas (High Priority)
      else if (blockedDuration >= this.LEVEL_1_THRESHOLD_MS && record.escalationLevel < 1) {
        await this.escalateLevel1(task, record);
      }
    }
  }

  /**
   * Level 1 Escalation: 4h → Atlas (High Priority)
   */
  private async escalateLevel1(task: Task, record: BlockerRecord): Promise<void> {
    const blockedDurationHours = Math.round((Date.now() - record.blockedAt) / 1000 / 60 / 60);

    logWarning('Blocker SLA breach - Level 1 escalation', {
      taskId: task.id,
      title: task.title,
      blockedDurationHours,
      threshold: '4 hours',
      escalateTo: 'Atlas',
    });

    // Create high-priority follow-up task for Atlas
    const followUpTask = this.stateMachine.createTask({
      id: `BLOCKER-${task.id}-L1`,
      title: `[URGENT] Unblock ${task.id}: ${task.title}`,
      description: `Task has been blocked for ${blockedDurationHours}h (SLA: 4h).\n\nOriginal task: ${task.title}\nBlocked since: ${new Date(record.blockedAt).toISOString()}\n\n**Action Required:**\n1. Investigate root cause of blocker\n2. Either resolve the blocker or escalate to Director Dana\n3. Target resolution: <4h\n\n**Blocker Details:**\n${JSON.stringify(task.metadata, null, 2)}`,
      type: 'task',
      status: 'pending',
      assigned_to: 'Atlas',
      estimated_complexity: 7, // High complexity
      metadata: {
        escalation_level: 1,
        blocked_task_id: task.id,
        created_by: 'BlockerEscalationManager',
        sla_breach: true,
        priority: 'high',
      },
    });

    // Update escalation record
    record.escalationLevel = 1;
    record.lastEscalatedAt = Date.now();

    logInfo('Level 1 escalation task created', {
      followUpTaskId: followUpTask.id,
      originalTaskId: task.id,
    });
  }

  /**
   * Level 2 Escalation: 24h → Director Dana (Critical Incident)
   */
  private async escalateLevel2(task: Task, record: BlockerRecord): Promise<void> {
    const blockedDurationHours = Math.round((Date.now() - record.blockedAt) / 1000 / 60 / 60);

    logWarning('Blocker SLA breach - Level 2 escalation (CRITICAL)', {
      taskId: task.id,
      title: task.title,
      blockedDurationHours,
      threshold: '24 hours',
      escalateTo: 'Director Dana',
      severity: 'CRITICAL',
    });

    // Create critical incident for Director Dana
    const incidentTask = this.stateMachine.createTask({
      id: `BLOCKER-${task.id}-L2`,
      title: `[CRITICAL] BLOCKED >24h: ${task.id}`,
      description: `🚨 **CRITICAL INCIDENT**: Task has been blocked for ${blockedDurationHours}h (SLA: 24h).\n\n**Original Task:** ${task.title}\n**Blocked Since:** ${new Date(record.blockedAt).toISOString()}\n**Level 1 Escalation:** ${record.lastEscalatedAt ? new Date(record.lastEscalatedAt).toISOString() : 'Not escalated'}\n\n**This is a critical incident requiring immediate Director Dana intervention.**\n\n**Recommended Actions:**\n1. Immediate investigation of root cause\n2. Consider de-scoping or task cancellation if blocker cannot be resolved\n3. Review dependency management to prevent future 24h+ blocks\n4. Update roadmap priority if this blocks critical path\n\n**Blocker Context:**\n\`\`\`json\n${JSON.stringify(task, null, 2)}\n\`\`\``,
      type: 'task',
      status: 'pending',
      assigned_to: 'Director Dana',
      estimated_complexity: 10, // Maximum complexity
      metadata: {
        escalation_level: 2,
        blocked_task_id: task.id,
        created_by: 'BlockerEscalationManager',
        sla_breach: true,
        priority: 'critical',
        incident: true,
      },
    });

    // Update escalation record
    record.escalationLevel = 2;
    record.lastEscalatedAt = Date.now();

    logInfo('Level 2 escalation (CRITICAL) task created', {
      incidentTaskId: incidentTask.id,
      originalTaskId: task.id,
      severity: 'CRITICAL',
    });
  }

  /**
   * Get blocker statistics for monitoring
   */
  getBlockerStats(): {
    totalBlocked: number;
    level0: number; // <4h
    level1: number; // 4h-24h
    level2: number; // >24h
    longestBlockedHours: number;
  } {
    const now = Date.now();
    let level0 = 0;
    let level1 = 0;
    let level2 = 0;
    let longestBlockedMs = 0;

    for (const record of this.blockerRecords.values()) {
      const blockedDuration = now - record.blockedAt;
      longestBlockedMs = Math.max(longestBlockedMs, blockedDuration);

      if (blockedDuration >= this.LEVEL_2_THRESHOLD_MS) {
        level2++;
      } else if (blockedDuration >= this.LEVEL_1_THRESHOLD_MS) {
        level1++;
      } else {
        level0++;
      }
    }

    return {
      totalBlocked: this.blockerRecords.size,
      level0,
      level1,
      level2,
      longestBlockedHours: Math.round(longestBlockedMs / 1000 / 60 / 60),
    };
  }
}
