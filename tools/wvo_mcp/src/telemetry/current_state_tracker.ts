import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logDebug, logWarning } from './logger.js';

/**
 * Current agent execution state
 */
export interface AgentExecutionState {
  taskId: string;
  taskTitle: string;
  agentType?: 'planner' | 'thinker' | 'implementer' | 'reviewer' | 'critical';
  currentStage: 'specify' | 'plan' | 'thinker' | 'implement' | 'verify' | 'review' | 'pr' | 'monitor' | 'idle';
  startedAt: string;
  lastUpdatedAt: string;
  progress?: {
    stepsCompleted: number;
    stepsTotal: number;
    currentStep?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Snapshot of all current agent states
 */
export interface CurrentStateSnapshot {
  timestamp: string;
  agents: Record<string, AgentExecutionState>; // keyed by taskId
}

/**
 * Tracks current execution state of agents for real-time monitoring
 */
export class CurrentStateTracker {
  private statePath: string;
  private currentState: Map<string, AgentExecutionState>;

  constructor(private workspaceRoot: string) {
    this.statePath = path.join(workspaceRoot, 'state', 'telemetry', 'current_state.json');
    this.currentState = new Map();
  }

  /**
   * Start tracking a new task
   */
  async startTask(
    taskId: string,
    taskTitle: string,
    agentType?: AgentExecutionState['agentType']
  ): Promise<void> {
    const now = new Date().toISOString();

    const state: AgentExecutionState = {
      taskId,
      taskTitle,
      agentType,
      currentStage: 'specify',
      startedAt: now,
      lastUpdatedAt: now,
    };

    this.currentState.set(taskId, state);
    await this.persist();

    logDebug('Task execution started', { taskId, taskTitle, agentType });
  }

  /**
   * Update current stage
   */
  async updateStage(
    taskId: string,
    stage: AgentExecutionState['currentStage'],
    progress?: AgentExecutionState['progress']
  ): Promise<void> {
    const state = this.currentState.get(taskId);
    if (!state) {
      logWarning('Attempted to update stage for unknown task', { taskId });
      return;
    }

    state.currentStage = stage;
    state.lastUpdatedAt = new Date().toISOString();
    if (progress) {
      state.progress = progress;
    }

    await this.persist();

    logDebug('Task stage updated', { taskId, stage, progress });
  }

  /**
   * Complete a task (removes from current state)
   */
  async completeTask(taskId: string, success: boolean): Promise<void> {
    const state = this.currentState.get(taskId);
    if (!state) {
      logWarning('Attempted to complete unknown task', { taskId });
      return;
    }

    this.currentState.delete(taskId);
    await this.persist();

    logDebug('Task execution completed', { taskId, success });
  }

  /**
   * Get current state snapshot
   */
  async getSnapshot(): Promise<CurrentStateSnapshot> {
    const snapshot: CurrentStateSnapshot = {
      timestamp: new Date().toISOString(),
      agents: Object.fromEntries(this.currentState.entries()),
    };

    return snapshot;
  }

  /**
   * Persist current state to disk
   */
  private async persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.statePath), { recursive: true });

      const snapshot = await this.getSnapshot();
      await fs.writeFile(this.statePath, JSON.stringify(snapshot, null, 2));
    } catch (error) {
      logWarning('Failed to persist current state', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Load current state from disk (for recovery)
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.statePath, 'utf-8');
      const snapshot: CurrentStateSnapshot = JSON.parse(content);

      this.currentState.clear();
      for (const [taskId, state] of Object.entries(snapshot.agents)) {
        this.currentState.set(taskId, state);
      }

      logDebug('Current state loaded', { taskCount: this.currentState.size });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // No state file yet - this is fine
        logDebug('No existing state file - starting fresh');
      } else {
        logWarning('Failed to load current state', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Clear all current state (use with caution - for cleanup/testing only)
   */
  async clear(): Promise<void> {
    this.currentState.clear();
    await this.persist();
  }
}
