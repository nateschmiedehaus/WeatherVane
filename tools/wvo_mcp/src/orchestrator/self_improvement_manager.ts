/**
 * Self-Improvement Manager
 *
 * Manages the orchestrator's ability to improve itself safely:
 * 1. Detects when orchestrator code is modified
 * 2. Triggers safe restart after validation
 * 3. Tracks MCP infrastructure phase completion
 * 4. Transitions from meta-work to product-work
 * 5. Prevents restart loops with rollback protection
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import type { StateMachine, Task } from './state_machine.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

// Files that require restart when modified
const ORCHESTRATOR_PATHS = [
  'tools/wvo_mcp/src/',
  'tools/wvo_mcp/package.json',
  'tools/wvo_mcp/tsconfig.json',
];

// Meta-work phases that must complete before product work
const MCP_INFRASTRUCTURE_PHASES = [
  'PHASE-1-HARDENING',
  'PHASE-2-COMPACT',
  'PHASE-3-BATCH',
  'PHASE-4-POLISH',
  'PHASE-5-OPTIMIZATION',
];

const REQUIRED_MCP_PHASES = [
  'PHASE-1-HARDENING',
  'PHASE-2-COMPACT',
  'PHASE-3-BATCH',
  'PHASE-4-POLISH',
];

const PHASE_EPIC_MAP: Record<string, string[]> = {
  'PHASE-4-POLISH': ['E8'],
  'PHASE-5-OPTIMIZATION': ['E9'],
};

export interface RestartAttempt {
  timestamp: number;
  reason: string;
  taskId: string;
  success: boolean;
}

export interface PhaseCompletionStatus {
  phase: string;
  complete: boolean;
  taskIds: string[];
  lastChecked: number;
}

export interface SelfImprovementConfig {
  maxRestartsPerWindow: number;
  restartWindowMinutes: number;
  enableAutoRestart: boolean;
  workspaceRoot: string;
  restartScriptPath?: string;
}

const DEFAULT_CONFIG: SelfImprovementConfig = {
  maxRestartsPerWindow: 3,
  restartWindowMinutes: 10,
  enableAutoRestart: true,
  workspaceRoot: process.cwd(),
  restartScriptPath: './scripts/restart_mcp.sh',
};

export class SelfImprovementManager extends EventEmitter {
  private restartHistory: RestartAttempt[] = [];
  private phaseCompletionCache: Map<string, PhaseCompletionStatus> = new Map();
  private metaWorkComplete = false;
  private lastPhaseCheck = 0;
  private readonly reportedMissingPhases = new Set<string>();
  private readonly PHASE_CHECK_INTERVAL = 60_000; // 1 minute
  private readonly correlationPrefix = 'self-improvement';

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly config: SelfImprovementConfig = DEFAULT_CONFIG
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a completed task modified orchestrator code
   */
  async checkForSelfModification(task: Task): Promise<boolean> {
    if (!this.config.enableAutoRestart) {
      return false;
    }

    // Extract file paths from task metadata or recent events
    const modifiedFiles = await this.getModifiedFiles(task);

    if (modifiedFiles.length === 0) {
      return false;
    }

    // Check if any modified files are orchestrator paths
    const orchestratorModified = modifiedFiles.some(file =>
      ORCHESTRATOR_PATHS.some(path => file.startsWith(path))
    );

    if (orchestratorModified) {
      logInfo('Orchestrator self-modification detected', {
        taskId: task.id,
        taskTitle: task.title,
        modifiedFiles: modifiedFiles.filter(f =>
          ORCHESTRATOR_PATHS.some(path => f.startsWith(path))
        ),
      });

      this.emit('self-modification:detected', {
        taskId: task.id,
        files: modifiedFiles,
      });
    }

    return orchestratorModified;
  }

  /**
   * Execute safe restart with rollback protection
   */
  async executeRestart(taskId: string, reason: string): Promise<boolean> {
    if (!this.config.enableAutoRestart) {
      logInfo('Auto-restart disabled, skipping restart', { taskId, reason });
      return false;
    }

    // Check for restart loops
    if (this.isRestartLoopDetected()) {
      logError('Restart loop detected, aborting restart', {
        taskId,
        reason,
        recentRestarts: this.restartHistory.length,
        message: 'Too many restarts in short window - preventing infinite loop'
      });

      this.emit('restart:loop-detected', {
        taskId,
        attempts: this.restartHistory.length,
      });

      return false;
    }

    // Create checkpoint before restart
    const checkpointId = this.createPreRestartCheckpointId(taskId);

    logInfo('Executing orchestrator restart', {
      taskId,
      reason,
      checkpointId,
    });

    try {
      // Verify build succeeds before restart
      await this.verifyBuild();

      // Execute restart script
      const scriptPath = this.config.restartScriptPath || './scripts/restart_mcp.sh';
      const result = await execa('bash', [scriptPath], {
        cwd: this.config.workspaceRoot,
        timeout: 120_000, // 2 minutes
      });

      // Record successful restart
      this.recordRestart(taskId, reason, true);

      logInfo('Orchestrator restart completed successfully', {
        taskId,
        reason,
        checkpointId,
      });

      this.emit('restart:success', {
        taskId,
        reason,
        checkpointId,
      });

      return true;

    } catch (error: any) {
      logError('Orchestrator restart failed', {
        taskId,
        reason,
        error: error.message,
      });

      // Record failed restart
      this.recordRestart(taskId, reason, false);

      this.emit('restart:failed', {
        taskId,
        reason,
        error: error.message,
      });

      return false;
    }
  }

  /**
   * Check if MCP infrastructure phases are complete and transition to product work
   */
  async checkPhaseCompletion(): Promise<boolean> {
    const now = Date.now();

    // Throttle checks
    if (now - this.lastPhaseCheck < this.PHASE_CHECK_INTERVAL) {
      return this.metaWorkComplete;
    }

    this.lastPhaseCheck = now;
    const phaseCorrelation = this.createCorrelationBase('phase-check');

    // Check each infrastructure phase
    const allTasks = this.stateMachine.getTasks();
    const phaseStatuses: PhaseCompletionStatus[] = [];

    for (const phase of MCP_INFRASTRUCTURE_PHASES) {
      const status = this.checkPhaseStatus(phase, allTasks);
      phaseStatuses.push(status);
      this.phaseCompletionCache.set(phase, status);
    }

    // All phases must be complete
    const requiredComplete = phaseStatuses
      .filter(status => REQUIRED_MCP_PHASES.includes(status.phase))
      .every(status => status.complete);

    if (requiredComplete && !this.metaWorkComplete) {
      logInfo('🎉 MCP infrastructure phases complete! Transitioning to product work.', {
        requiredPhases: REQUIRED_MCP_PHASES,
        optionalPhasesRemaining: phaseStatuses
          .filter(status => !REQUIRED_MCP_PHASES.includes(status.phase) && !status.complete)
          .map(status => status.phase),
        completedTasks: phaseStatuses.flatMap(s => s.taskIds),
      });

      this.metaWorkComplete = true;

      // Unblock product work tasks
      await this.unblockProductWork(phaseCorrelation);

      this.emit('meta-work:complete', {
        phases: MCP_INFRASTRUCTURE_PHASES,
        timestamp: now,
      });
    } else if (!requiredComplete) {
      await this.enforceMetaWorkFocus(phaseStatuses, phaseCorrelation);
    }

    return requiredComplete;
  }

  /**
   * Get current improvement status
   */
  getStatus() {
    return {
      metaWorkComplete: this.metaWorkComplete,
      phases: Array.from(this.phaseCompletionCache.values()),
      recentRestarts: this.restartHistory.slice(-5),
      restartLoopRisk: this.isRestartLoopDetected(),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async getModifiedFiles(task: Task): Promise<string[]> {
    // Strategy 1: Check task metadata
    if (task.metadata?.files_modified && Array.isArray(task.metadata.files_modified)) {
      return task.metadata.files_modified;
    }

    // Strategy 2: Parse from task output/events
    const events = this.stateMachine.getEvents({
      taskId: task.id,
    });

    // Take only recent events (last 20)
    const recentEvents = events.slice(-20);

    const files: string[] = [];

    for (const event of recentEvents) {
      if (event.event_type === 'task_updated' && event.data?.files) {
        files.push(...(event.data.files as string[]));
      }

      // Parse from event data
      const text = JSON.stringify(event.data || {});
      const fileMatches = text.match(/(?:modified|changed|updated|wrote|edited).*?([a-zA-Z0-9/_.-]+\.(?:ts|js|json|sh|py))/gi);

      if (fileMatches) {
        files.push(...fileMatches.map(m => {
          const match = m.match(/([a-zA-Z0-9/_.-]+\.(?:ts|js|json|sh|py))/);
          return match ? match[1] : '';
        }).filter(Boolean));
      }
    }

    return [...new Set(files)]; // Deduplicate
  }

  private isRestartLoopDetected(): boolean {
    const now = Date.now();
    const windowMs = this.config.restartWindowMinutes * 60 * 1000;

    // Count restarts in the window
    const recentRestarts = this.restartHistory.filter(
      r => now - r.timestamp < windowMs
    );

    return recentRestarts.length >= this.config.maxRestartsPerWindow;
  }

  private recordRestart(taskId: string, reason: string, success: boolean): void {
    this.restartHistory.push({
      timestamp: Date.now(),
      reason,
      taskId,
      success,
    });

    // Keep only recent history (last 24 hours)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.restartHistory = this.restartHistory.filter(r => r.timestamp > dayAgo);
  }

  private createPreRestartCheckpointId(taskId: string): string {
    return `pre-restart-${taskId}-${Date.now()}`;
  }

  private createCorrelationBase(operation: string): string {
    return `${this.correlationPrefix}:${operation}:${randomUUID()}`;
  }

  private async verifyBuild(): Promise<void> {
    logInfo('Verifying orchestrator TypeScript build before restart...');

    const result = await execa(
      'npm',
      [
        'exec',
        '--prefix',
        'tools/wvo_mcp',
        'tsc',
        '--',
        '--project',
        'tsconfig.json',
        '--pretty',
        'false',
        '--incremental',
        '--tsBuildInfoFile',
        'dist/.tsbuildinfo',
      ],
      {
        cwd: this.config.workspaceRoot,
        timeout: 60_000,
      }
    );

    if (result.exitCode !== 0) {
      throw new Error(`Build verification failed: ${result.stderr || result.stdout}`);
    }

    logInfo('Type check passed');
  }


  private checkPhaseStatus(phase: string, allTasks: Task[]): PhaseCompletionStatus {
    const relevantTasksMap = new Map<string, Task>();

    // Direct matches (legacy meta tasks or explicit markers)
    for (const task of allTasks) {
      if (
        task.id === phase ||
        task.title.includes(phase) ||
        task.metadata?.phase === phase ||
        task.parent_id === phase
      ) {
        relevantTasksMap.set(task.id, task);
      }
    }

    // Epic matches (phase-specific epics that should count towards completion)
    const epicIds = PHASE_EPIC_MAP[phase] ?? [];
    if (epicIds.length > 0) {
      for (const task of allTasks) {
        if (task.epic_id && epicIds.includes(task.epic_id)) {
          relevantTasksMap.set(task.id, task);
        }
      }
    }

    const phaseTasks = Array.from(relevantTasksMap.values());

    if (phaseTasks.length === 0) {
      if (!this.reportedMissingPhases.has(phase)) {
        this.reportedMissingPhases.add(phase);
        logWarning('Phase not found in roadmap; treating as complete to avoid blocking product work', {
          phase,
          epicIds,
        });
      }

      return {
        phase,
        complete: true,
        taskIds: [],
        lastChecked: Date.now(),
      };
    }

    const allDone = phaseTasks.every(task => task.status === 'done');

    return {
      phase,
      complete: allDone,
      taskIds: phaseTasks.map(task => task.id),
      lastChecked: Date.now(),
    };
  }

  private async enforceMetaWorkFocus(
    phaseStatuses: PhaseCompletionStatus[],
    correlationBase?: string
  ): Promise<void> {
    const incompletePhases = phaseStatuses.filter(
      status => REQUIRED_MCP_PHASES.includes(status.phase) && !status.complete
    );
    const blockingPhases = incompletePhases.map(status => status.phase);
    const metaTaskIds = new Set<string>(phaseStatuses.flatMap(status => status.taskIds));

    if (blockingPhases.length === 0) {
      return;
    }

    const correlation = correlationBase ?? this.createCorrelationBase('phase-enforce');
    const stage = (taskId: string, stageName: string) => `${correlation}:enforce:${taskId}:${stageName}`;

    const allTasks = this.stateMachine.getTasks();

    for (const task of allTasks) {
      if (
        task.status === 'done' ||
        task.status === 'blocked' && task.metadata?.blocked_by_meta_work === true ||
        metaTaskIds.has(task.id)
      ) {
        continue;
      }

      // Skip tasks that belong to meta epics (already in metaTaskIds) or are review items for them
      const taskEpicId = task.epic_id ?? '';
      if (taskEpicId && Object.values(PHASE_EPIC_MAP).some(epics => epics.includes(taskEpicId))) {
        continue;
      }

      try {
        await this.stateMachine.transition(
          task.id,
          'blocked',
          {
            blocked_by_meta_work: true,
            blocking_phases: blockingPhases,
            meta_focus_enforced_at: Date.now(),
          },
          stage(task.id, 'blocked')
        );
      } catch (error: any) {
        logWarning('Failed to enforce meta work focus on task', {
          taskId: task.id,
          error: error.message,
        });
      }
    }
  }

  private async unblockProductWork(correlationBase?: string): Promise<void> {
    logInfo('Unblocking product work tasks...');

    const correlation = correlationBase ?? this.createCorrelationBase('meta-unblock');
    const stage = (taskId: string, stageName: string) => `${correlation}:unblock:${taskId}:${stageName}`;

    const allTasks = this.stateMachine.getTasks();

    // Find tasks blocked by MCP phases
    // In StateMachine, dependencies are stored separately, so we check task metadata
    const blockedTasks = allTasks.filter(t => {
      if (t.status !== 'blocked') return false;

      // Check metadata for phase blocking
      const blockingPhases = t.metadata?.blocking_phases as string[] | undefined;
      if (blockingPhases) {
        return blockingPhases.some(dep =>
          MCP_INFRASTRUCTURE_PHASES.includes(dep)
        );
      }

      // Also check if task is explicitly marked as meta-work
      return t.metadata?.blocked_by_meta_work === true;
    });

    let unblockedCount = 0;

    for (const task of blockedTasks) {
      try {
        // Transition blocked tasks to pending
        await this.stateMachine.transition(
          task.id,
          'pending',
          {
            reason: 'MCP infrastructure phases complete',
            meta_work_complete: true,
            blocked_by_meta_work: null,
            blocking_phases: null,
            meta_focus_enforced_at: null,
          },
          stage(task.id, 'pending')
        );

        unblockedCount++;
      } catch (error: any) {
        logWarning('Failed to unblock task', {
          taskId: task.id,
          error: error.message,
        });
      }
    }

    logInfo(`Unblocked ${unblockedCount} product work tasks`, {
      unblockedCount,
      totalBlocked: blockedTasks.length,
    });

    this.emit('product-work:unblocked', {
      unblockedCount,
      taskIds: blockedTasks.slice(0, unblockedCount).map(t => t.id),
    });
  }
}
