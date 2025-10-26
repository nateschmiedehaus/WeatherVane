import { logInfo, logWarning } from '../telemetry/logger.js';
import type { TaskEnvelope } from './task_envelope.js';
import type { ModelSelection } from './model_router.js';
import { ModelRouter } from './model_router.js';

export interface SupervisorSpecifyResult {
  acceptanceCriteria: string[];
  initialRisks: string[];
  model?: ModelSelection;
}

export interface SupervisorPrResult {
  ready: boolean;
  checklist: string[];
  model?: ModelSelection;
}

export interface SupervisorMonitorResult {
  status: 'observing' | 'stable';
  notes: string[];
  model?: ModelSelection;
}

export type RequireHumanFn = (trigger: string, task: TaskEnvelope, metadata?: Record<string, unknown>) => void | Promise<void>;

export class SupervisorAgent {
  constructor(
    private readonly router: ModelRouter,
    private readonly requireHuman?: RequireHumanFn
  ) {}

  specify(task: TaskEnvelope): SupervisorSpecifyResult {
    const acceptanceCriteria = [
      `Task ${task.id} satisfies CI`,
      `Coverage delta >= 5%`,
    ];
    const initialRisks = [`Unvetted dependencies for ${task.title}`];
    const model = this.safePickModel('specify', task.id);
    logInfo('Supervisor specified acceptance', { taskId: task.id, model: model?.model });
    this.maybeTriggerHumanGate(task, 'specify');
    return { acceptanceCriteria, initialRisks, model };
  }

  preparePr(task: TaskEnvelope): SupervisorPrResult {
    const checklist = [
      'Description updated',
      'Tests evidence attached',
      'Risks and rollback noted',
    ];
    const model = this.safePickModel('pr', task.id);
    logInfo('Supervisor prepared PR checklist', { taskId: task.id, model: model?.model });
    this.maybeTriggerHumanGate(task, 'pr');
    return { ready: true, checklist, model };
  }

  monitor(task: TaskEnvelope): SupervisorMonitorResult {
    const model = this.safePickModel('monitor', task.id);
    logInfo('Supervisor entering monitor state', { taskId: task.id, model: model?.model });
    this.maybeTriggerHumanGate(task, 'monitor');
    return { status: 'stable', notes: [`Monitoring ${task.id}`], model };
  }

  requirePlanDelta(taskId: string): void {
    logWarning('Plan delta required before next implement', { taskId });
  }

  private safePickModel(state: Parameters<ModelRouter['pickModel']>[0], taskId: string): ModelSelection | undefined {
    try {
      return this.router.pickModel(state, { taskId });
    } catch {
      return undefined;
    }
  }

  private async maybeTriggerHumanGate(task: TaskEnvelope, stage: string): Promise<void> {
    if (!this.requireHuman) {
      return;
    }
    const text = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();
    const labels = (task.labels ?? []).map((label) => label.toLowerCase());
    const triggers = [
      { keyword: 'migration', reason: 'database_migration' },
      { keyword: 'auth', reason: 'auth_flow' },
      { keyword: 'oauth', reason: 'auth_flow' },
      { keyword: 'secret', reason: 'secret_handling' },
      { keyword: 'token', reason: 'secret_handling' },
      { keyword: 'payment', reason: 'payment_flow' },
      { keyword: 'billing', reason: 'payment_flow' },
      { keyword: 'stripe', reason: 'payment_flow' },
      { keyword: 'drop table', reason: 'destructive_change' },
      { keyword: 'truncate', reason: 'destructive_change' },
      { keyword: 'delete all', reason: 'destructive_change' },
      { keyword: 'crypto', reason: 'crypto_change' },
    ];

    const matched = triggers.find(({ keyword }) => text.includes(keyword) || labels.some((label) => label.includes(keyword)));
    if (matched) {
      await this.requireHuman(matched.reason, task, { stage });
    }
  }
}
