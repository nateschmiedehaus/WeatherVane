import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AgentPool } from '../orchestrator/agent_pool.js';
import type { RecoveryAction } from '../orchestrator/resilience_manager.js';
import { ResilienceManager } from '../orchestrator/resilience_manager.js';
import { StateMachine } from '../orchestrator/state_machine.js';
import type { SafetyState } from '../state/safety_state.js';
import { SafetyStateStore } from '../state/safety_state.js';

export interface ErrorRecoverySample {
  step: 'task_created' | 'generic_failure' | 'context_limit_recovery' | 'second_context_limit';
  timestamp?: string;
  task_status?: string;
  metadata?: Record<string, unknown>;
  action?: RecoveryAction;
  attemptsRecorded?: number;
  checkpointCreated?: boolean;
  checkpointSession?: string | null;
  killSwitchBefore?: boolean;
  killSwitchAfter?: boolean;
  incidentsLogged?: number;
}

export interface ErrorRecoverySummary {
  generated_at: string;
  task_id: string;
  samples: ErrorRecoverySample[];
  checkpoint: {
    session_id: string;
    notes?: string;
    snapshot_keys: string[];
  } | null;
  safety_window: {
    initial_state: SafetyState;
    engaged_state: SafetyState;
    final_state: SafetyState;
  };
}

export interface ErrorRecoverySimulationOptions {
  /**
   * Directory where temporary workspaces should be created. Defaults to os.tmpdir().
   */
  workspaceParent?: string;
  /**
   * Explicit workspace directory to use. When provided it will be created if needed.
   */
  workspaceRoot?: string;
  /**
   * Delay (in milliseconds) that simulates the observation window before resetting the kill-switch.
   */
  observationDelayMs?: number;
  /**
   * Whether to retain the generated workspace on disk after the simulation completes.
   * Defaults to false.
   */
  retainWorkspace?: boolean;
}

export interface ErrorRecoverySimulationResult {
  summary: ErrorRecoverySummary;
  workspaceRoot: string;
}

function cloneState<T>(state: T): T {
  return JSON.parse(JSON.stringify(state)) as T;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function createWorkspace(baseDir: string): Promise<string> {
  await ensureDirectory(baseDir);
  return fs.mkdtemp(path.join(baseDir, 'error_recovery_'));
}

export async function runErrorRecoverySimulation(
  options: ErrorRecoverySimulationOptions = {},
): Promise<ErrorRecoverySimulationResult> {
  const {
    workspaceParent,
    workspaceRoot: explicitWorkspace,
    observationDelayMs = 25,
    retainWorkspace = false,
  } = options;

  const parentDir = workspaceParent
    ? path.resolve(workspaceParent)
    : path.join(os.tmpdir(), 'weathervane-error-recovery');

  const workspaceRoot = explicitWorkspace
    ? path.resolve(explicitWorkspace)
    : await createWorkspace(parentDir);

  await ensureDirectory(path.join(workspaceRoot, 'state'));

  let stateMachine: StateMachine | undefined;
  let agentPool: AgentPool | undefined;
  let resilienceManager: ResilienceManager | undefined;
  let safetyStore: SafetyStateStore | undefined;

  try {
    stateMachine = new StateMachine(workspaceRoot);
    agentPool = new AgentPool(workspaceRoot, 2);
    resilienceManager = new ResilienceManager(stateMachine, agentPool);
    safetyStore = new SafetyStateStore(workspaceRoot);

    const samples: ErrorRecoverySample[] = [];

    const task = stateMachine.createTask({
      id: 'T-error-recovery',
      title: 'Synthetic error recovery scenario',
      description: 'Validates retry, checkpoint, and rollback guardrails.',
      type: 'task',
      status: 'in_progress',
      metadata: { synthetic: true, owner: 'resilience_sim' },
    });

    samples.push({
      step: 'task_created',
      timestamp: new Date().toISOString(),
      task_status: task.status,
      metadata: cloneState(task.metadata ?? {}),
    });

    const genericFailure = await resilienceManager.handleFailure({
      taskId: task.id,
      agentId: 'codex_worker_0',
      failureType: 'other',
      retryAfterSeconds: 30,
      attemptNumber: 1,
      originalError: 'synthetic: transient failure',
    });

    samples.push({
      step: 'generic_failure',
      action: cloneState(genericFailure),
      attemptsRecorded: 1,
    });

    const contextLimitRecovery = await resilienceManager.handleFailure({
      taskId: task.id,
      agentId: 'claude_code_primary',
      failureType: 'context_limit',
      retryAfterSeconds: 15,
      attemptNumber: 2,
      originalError: 'synthetic: context exceeded',
    });

    const checkpoint = stateMachine.getLatestCheckpoint();

    samples.push({
      step: 'context_limit_recovery',
      action: cloneState(contextLimitRecovery),
      checkpointCreated: Boolean(checkpoint),
      checkpointSession: checkpoint?.session_id ?? null,
    });

    const secondContextLimit = await resilienceManager.handleFailure({
      taskId: task.id,
      agentId: 'claude_code_primary',
      failureType: 'context_limit',
      retryAfterSeconds: 15,
      attemptNumber: 3,
      originalError: 'synthetic: repeated context limit',
    });

    const preKillSwitch = cloneState(await safetyStore.read());

    const incidentsWithKillSwitch = [
      {
        id: `incident-${Date.now()}`,
        timestamp: new Date().toISOString(),
        severity: 'critical' as const,
        summary: 'Emergency rollback engaged after repeated context limits',
        details: {
          taskId: task.id,
          action: secondContextLimit.action,
        },
      },
      ...preKillSwitch.incidents,
    ].slice(0, 25);

    await safetyStore.update({
      killSwitchEngaged: true,
      mode: 'contain',
      incidents: incidentsWithKillSwitch,
      metadata: {
        origin: 'error_recovery_sim',
        observation_started_at: new Date().toISOString(),
      },
    });

    const engagedState = cloneState(await safetyStore.read());

    if (observationDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, observationDelayMs));
    }

    const rollbackCompletedAt = new Date().toISOString();

    await safetyStore.update({
      killSwitchEngaged: false,
      mode: 'stabilize',
      metadata: {
        ...(engagedState.metadata ?? {}),
        observation_window_seconds: 600,
        rollback_completed_at: rollbackCompletedAt,
      },
    });

    const finalSafety = cloneState(await safetyStore.read());

    samples.push({
      step: 'second_context_limit',
      action: cloneState(secondContextLimit),
      killSwitchBefore: preKillSwitch.killSwitchEngaged,
      killSwitchAfter: finalSafety.killSwitchEngaged,
      incidentsLogged: finalSafety.incidents.length,
    });

    const summary: ErrorRecoverySummary = {
      generated_at: new Date().toISOString(),
      task_id: task.id,
      samples,
      checkpoint: checkpoint
        ? {
            session_id: checkpoint.session_id,
            notes: checkpoint.notes,
            snapshot_keys: Object.keys(checkpoint.state_snapshot ?? {}),
          }
        : null,
      safety_window: {
        initial_state: preKillSwitch,
        engaged_state: engagedState,
        final_state: finalSafety,
      },
    };

    return { summary, workspaceRoot };
  } finally {
    if (stateMachine) {
      stateMachine.close();
    }
    if (agentPool) {
      agentPool.removeAllListeners();
    }
    if (resilienceManager) {
      resilienceManager.removeAllListeners();
    }

    if (!retainWorkspace) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  }
}
