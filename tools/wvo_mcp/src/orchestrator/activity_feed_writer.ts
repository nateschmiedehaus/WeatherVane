import fs from 'node:fs';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { logWarning } from '../telemetry/logger.js';
import type { StateMachine, Task, TaskStatus } from './state_machine.js';
import type { TaskScheduler } from './task_scheduler.js';
import type {
  Agent,
  AgentPool,
  TaskAssignmentEventPayload,
} from './agent_pool.js';
import type { OperationsManager } from './operations_manager.js';
import type {
  AgentCoordinator,
  ExecutionLifecycleEvent,
  ExecutionSummary,
} from './agent_coordinator.js';

interface ActivityFeedWriterConfig {
  workspaceRoot: string;
  stateMachine: StateMachine;
  scheduler: TaskScheduler;
  agentPool: AgentPool;
  operationsManager: OperationsManager;
  coordinator: AgentCoordinator;
}

interface ActivityEvent {
  type: string;
  timestamp: number;
  taskId?: string;
  agentId?: string;
  data?: Record<string, unknown>;
}

interface ReservationRecord {
  file: string;
  taskId: string;
  agentId: string;
  reservedAt: number;
}

interface ListenerBinding {
  emitter: EventEmitter;
  event: string;
  handler: (...args: any[]) => void;
}

type TokenAggregate = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUSD?: number;
};

export class ActivityFeedWriter {
  private readonly feedPath: string;
  private readonly reservationsPath: string;
  private readonly briefsDir: string;
  private readonly contextCacheDir: string;
  private readonly workspaceRoot: string;
  private readonly listeners: ListenerBinding[] = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private stopped = false;

  private readonly reservationByFile = new Map<string, ReservationRecord>();
  private readonly taskToFiles = new Map<string, Set<string>>();
  private readonly assignmentMetadata = new Map<
    string,
    {
      estimatedDuration: number;
      reasoning: string;
      contextSummary: TaskAssignmentEventPayload['contextSummary'];
      assignedAt: number;
      agentId: string;
    }
  >();
  private readonly tokenTotalsByAgent = new Map<string, TokenAggregate>();
  private readonly tokenTotalsByType = new Map<string, TokenAggregate>();
  private totalTokens = 0;

  constructor(private readonly config: ActivityFeedWriterConfig) {
    this.workspaceRoot = config.workspaceRoot;
    this.feedPath = path.join(this.workspaceRoot, 'state', 'autopilot_events.jsonl');
    this.reservationsPath = path.join(this.workspaceRoot, 'state', 'reservations.json');
    this.briefsDir = path.join(this.workspaceRoot, 'state', 'briefs');
    this.contextCacheDir = path.join(this.workspaceRoot, 'state', 'context_cache');

    this.ensureDirectories();
    this.loadExistingReservations();
    this.registerListeners();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const binding of this.listeners) {
      binding.emitter.removeListener(binding.event, binding.handler);
    }
    this.listeners.length = 0;
  }

  private ensureDirectories(): void {
    for (const dir of [
      path.dirname(this.feedPath),
      this.briefsDir,
      this.contextCacheDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadExistingReservations(): void {
    try {
      const raw = fs.readFileSync(this.reservationsPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, ReservationRecord>;
      for (const [file, record] of Object.entries(parsed)) {
        if (record && record.taskId && record.agentId) {
          this.reservationByFile.set(file, record);
          let set = this.taskToFiles.get(record.taskId);
          if (!set) {
            set = new Set<string>();
            this.taskToFiles.set(record.taskId, set);
          }
          set.add(file);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        logWarning('Activity feed failed to load reservations; starting fresh', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.reservationByFile.clear();
      this.taskToFiles.clear();
    }
  }

  private registerListeners(): void {
    const {
      stateMachine,
      scheduler,
      agentPool,
      operationsManager,
      coordinator,
    } = this.config;

    this.bind(stateMachine, 'task:transition', (task: Task, from: TaskStatus, to: TaskStatus) => {
      this.enqueue(async () => {
        await this.appendEvents([
          {
            type: 'task_transition',
            timestamp: Date.now(),
            taskId: task.id,
            data: { from, to },
          },
        ]);
      });
    });

    this.bind(stateMachine, 'task:assigned', (task: Task, agentId: string) => {
      this.enqueue(async () => {
        await this.appendEvents([
          {
            type: 'task_assignment_recorded',
            timestamp: Date.now(),
            taskId: task.id,
            agentId,
          },
        ]);
      });
    });

    this.bind(agentPool, 'task:assigned', (payload: TaskAssignmentEventPayload) => {
      this.handleAgentAssignment(payload);
    });

    this.bind(agentPool, 'task:completed', (payload: { taskId: string; agentId: string; success: boolean; durationSeconds: number }) => {
      this.enqueue(async () => {
        await this.appendEvents([
          {
            type: 'agent_task_completed',
            timestamp: Date.now(),
            taskId: payload.taskId,
            agentId: payload.agentId,
            data: {
              success: payload.success,
              durationSeconds: payload.durationSeconds,
            },
          },
        ]);
      });
    });

    this.bind(agentPool, 'agent:capacity', (payload: Record<string, unknown>) => {
      this.enqueue(async () => {
        await this.appendEvents([
          {
            type: 'agent_capacity',
            timestamp: Date.now(),
            data: payload,
          },
        ]);
      });
    });

    this.bind(scheduler, 'task:scheduled', (event: { taskId: string; reason: string }) => {
      this.enqueue(async () => {
        await this.appendEvents([
          {
            type: 'task_scheduled',
            timestamp: Date.now(),
            taskId: event.taskId,
            data: { reason: event.reason },
          },
        ]);
      });
    });

    this.bind(scheduler, 'task:released', (event: { taskId: string }) => {
      this.enqueue(async () => {
        await this.appendEvents([
          {
            type: 'task_released',
            timestamp: Date.now(),
            taskId: event.taskId,
          },
        ]);
      });
    });

    this.bind(coordinator, 'execution:started', (event: ExecutionLifecycleEvent) => {
      this.handleExecutionStarted(event);
    });

    this.bind(coordinator, 'execution:completed', (summary: ExecutionSummary) => {
      this.handleExecutionCompleted(summary);
    });

    this.bind(operationsManager, 'execution:recorded', (summary: ExecutionSummary) => {
      this.handleExecutionRecorded(summary);
    });

    this.bind(operationsManager, 'web_inspiration', (payload: Record<string, unknown>) => {
      this.enqueue(async () => {
        const timestamp =
          typeof payload.timestamp === 'number' ? payload.timestamp : Date.now();
        await this.appendEvents([
          {
            type: 'web_inspiration',
            timestamp,
            taskId: typeof payload.taskId === 'string' ? payload.taskId : undefined,
            data: payload,
          },
        ]);
      });
    });
  }

  private bind(emitter: EventEmitter, event: string, handler: (...args: any[]) => void): void {
    emitter.on(event, handler);
    this.listeners.push({ emitter, event, handler });
  }

  private handleAgentAssignment(payload: TaskAssignmentEventPayload): void {
    const { task, agent, estimatedDuration, reasoning, contextSummary } = payload;
    this.assignmentMetadata.set(task.id, {
      estimatedDuration,
      reasoning,
      contextSummary,
      assignedAt: Date.now(),
      agentId: agent.id,
    });
    this.enqueue(async () => {
      await this.appendEvents([
        {
          type: 'task_assigned',
          timestamp: Date.now(),
          taskId: task.id,
          agentId: agent.id,
          data: {
            agentType: agent.type,
            estimatedDuration,
            reasoning,
            contextSummary,
          },
        },
      ]);
    });
  }

  private handleExecutionStarted(event: ExecutionLifecycleEvent): void {
    const metadata = this.assignmentMetadata.get(event.task.id);
    const files = this.uniqueFiles(event.context.filesToRead ?? []);
    const briefPromise = this.writeBrief(event.task, event.agent, event.context, metadata);
    const cachePromise = this.writeContextCache(event.task, event.context, metadata);

    this.enqueue(async () => {
      const briefPath = await briefPromise;
      const cacheInfo = await cachePromise;
      const reservationEvents = files.length
        ? this.reserveFiles(event.task.id, event.agent.id, files)
        : [];

      const mainEvent: ActivityEvent = {
        type: 'execution_started',
        timestamp: event.startedAt ?? Date.now(),
        taskId: event.task.id,
        agentId: event.agent.id,
        data: {
          agentType: event.agent.type,
          files,
          estimatedDuration: metadata?.estimatedDuration,
          reasoning: metadata?.reasoning,
          briefPath,
          contextCacheKey: cacheInfo?.cacheKey,
          contextCachePath: cacheInfo?.relativePath,
          assignedAt: metadata?.assignedAt,
          reservationCount: files.length,
        },
      };

      await this.appendEvents([mainEvent, ...reservationEvents]);
      if (files.length) {
        await this.persistReservations();
      }
    });
  }

  private handleExecutionCompleted(summary: ExecutionSummary): void {
    this.assignmentMetadata.delete(summary.taskId);
    const releaseEvents = this.releaseReservations(summary.taskId, summary.agentId);
    this.enqueue(async () => {
      const events: ActivityEvent[] = [
        {
          type: 'execution_completed',
          timestamp: summary.timestamp ?? Date.now(),
          taskId: summary.taskId,
          agentId: summary.agentId,
          data: {
            agentType: summary.agentType,
            success: summary.success,
            finalStatus: summary.finalStatus,
            durationSeconds: summary.durationSeconds,
            qualityScore: summary.qualityScore,
            issues: summary.issues,
            promptTokens: summary.promptTokens,
            completionTokens: summary.completionTokens,
            totalTokens: summary.totalTokens,
            tokenCostUSD: summary.tokenCostUSD,
          },
        },
        ...releaseEvents,
      ];
      await this.appendEvents(events);
      if (releaseEvents.length) {
        await this.persistReservations();
      }
    });
  }

  private handleExecutionRecorded(summary: ExecutionSummary): void {
    this.enqueue(async () => {
      const aggregate = this.updateTokenTotals(summary);
      await this.appendEvents([
        {
          type: 'token_usage',
          timestamp: summary.timestamp ?? Date.now(),
          taskId: summary.taskId,
          agentId: summary.agentId,
          data: aggregate,
        },
      ]);
    });
  }

  private async appendEvents(events: ActivityEvent[]): Promise<void> {
    if (!events.length) return;
    const lines = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
    await fsp.appendFile(this.feedPath, lines, { encoding: 'utf8' });
  }

  private enqueue(action: () => Promise<void>): void {
    if (this.stopped) return;
    this.writeQueue = this.writeQueue
      .then(() => action())
      .catch((error) => {
        logWarning('Activity feed write failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private uniqueFiles(files: string[]): string[] {
    const seen = new Set<string>();
    for (const file of files) {
      const normalized = this.normalizeFilePath(file);
      if (normalized) {
        seen.add(normalized);
      }
    }
    return Array.from(seen.values());
  }

  private normalizeFilePath(file: string): string {
    const trimmed = file.trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/\\/g, '/');
    const absolute = path.isAbsolute(normalized)
      ? normalized
      : path.join(this.workspaceRoot, normalized);
    const relative = path.relative(this.workspaceRoot, absolute);
    return relative.replace(/\\/g, '/');
  }

  private reserveFiles(taskId: string, agentId: string, files: string[]): ActivityEvent[] {
    const reservedAt = Date.now();
    const conflictEvents: ActivityEvent[] = [];

    let fileSet = this.taskToFiles.get(taskId);
    if (!fileSet) {
      fileSet = new Set<string>();
      this.taskToFiles.set(taskId, fileSet);
    }

    for (const file of files) {
      const existing = this.reservationByFile.get(file);
      if (existing && existing.taskId !== taskId) {
        conflictEvents.push({
          type: 'reservation_conflict',
          timestamp: reservedAt,
          taskId,
          agentId,
          data: {
            file,
            existingTaskId: existing.taskId,
            existingAgentId: existing.agentId,
            reservedAt: existing.reservedAt,
          },
        });
      }
      this.reservationByFile.set(file, { file, taskId, agentId, reservedAt });
      fileSet.add(file);
    }

    if (files.length === 0) {
      return conflictEvents;
    }

    const reservationEvent: ActivityEvent = {
      type: 'reservation_update',
      timestamp: reservedAt,
      taskId,
      agentId,
      data: {
        status: 'reserved',
        files,
      },
    };

    return [reservationEvent, ...conflictEvents];
  }

  private releaseReservations(taskId: string, agentId: string): ActivityEvent[] {
    const files = this.taskToFiles.get(taskId);
    if (!files || files.size === 0) {
      return [];
    }
    const releasedAt = Date.now();
    for (const file of files) {
      const existing = this.reservationByFile.get(file);
      if (existing && existing.taskId === taskId) {
        this.reservationByFile.delete(file);
      }
    }
    this.taskToFiles.delete(taskId);
    return [
      {
        type: 'reservation_update',
        timestamp: releasedAt,
        taskId,
        agentId,
        data: {
          status: 'released',
          files: Array.from(files.values()),
        },
      },
    ];
  }

  private async persistReservations(): Promise<void> {
    const payload: Record<string, ReservationRecord> = {};
    for (const [file, record] of this.reservationByFile.entries()) {
      payload[file] = record;
    }
    await fsp.writeFile(this.reservationsPath, JSON.stringify(payload, null, 2), {
      encoding: 'utf8',
    });
  }

  private async writeBrief(
    task: Task,
    agent: Agent,
    context: ExecutionLifecycleEvent['context'],
    metadata?: {
      estimatedDuration: number;
      reasoning: string;
      contextSummary: TaskAssignmentEventPayload['contextSummary'];
      assignedAt: number;
    },
  ): Promise<string | undefined> {
    try {
      const brief = {
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          description: task.description,
          epicId: task.epic_id,
          parentId: task.parent_id,
          metadata: task.metadata ?? undefined,
        },
        agent: {
          id: agent.id,
          type: agent.type,
          role: agent.role,
        },
        assignedAt: metadata?.assignedAt ?? Date.now(),
        estimatedDurationSeconds: metadata?.estimatedDuration,
        reasoning: metadata?.reasoning,
        filesToRead: context.filesToRead ?? [],
        relatedTasks: context.relatedTasks?.map((related) => ({
          id: related.id,
          title: related.title,
          status: related.status,
        })) ?? [],
        qualitySignals: context.qualityIssuesInArea?.map((issue) => ({
          dimension: issue.dimension,
          score: issue.score,
        })) ?? [],
        relevantDecisions: context.relevantDecisions?.map((decision) => ({
          topic: decision.topic,
          content: decision.content,
        })) ?? [],
        recentLearnings: context.recentLearnings?.map((learning) => ({
          topic: learning.topic,
          content: learning.content,
        })) ?? [],
        researchHighlights: context.researchHighlights ?? [],
        velocity: context.velocityMetrics,
        generatedAt: Date.now(),
      };

      const filePath = path.join(this.briefsDir, `${task.id}.json`);
      await fsp.writeFile(filePath, JSON.stringify(brief, null, 2), { encoding: 'utf8' });
      return path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    } catch (error) {
      logWarning('Activity feed failed to write task brief', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private async writeContextCache(
    task: Task,
    context: ExecutionLifecycleEvent['context'],
    metadata?: {
      contextSummary: TaskAssignmentEventPayload['contextSummary'];
    },
  ): Promise<{ cacheKey: string; relativePath: string } | undefined> {
    try {
      const sanitized = {
        taskId: task.id,
        generatedAt: Date.now(),
        filesToRead: context.filesToRead ?? [],
        relatedTasks: context.relatedTasks?.map((related) => related.id) ?? [],
        qualitySignals: context.qualityIssuesInArea?.map((issue) => ({
          dimension: issue.dimension,
          score: issue.score,
        })) ?? [],
        researchHighlights: context.researchHighlights ?? metadata?.contextSummary?.researchHighlights ?? [],
        decisions: context.relevantDecisions?.map((decision) => ({
          topic: decision.topic,
          content: decision.content,
        })) ?? [],
        learnings: context.recentLearnings?.map((learning) => ({
          topic: learning.topic,
          content: learning.content,
        })) ?? [],
      };

      const hash = createHash('sha1')
        .update(JSON.stringify({ task: task.id, files: sanitized.filesToRead, decisions: sanitized.decisions }))
        .digest('hex')
        .slice(0, 16);
      const cacheKey = `${task.id}-${hash}`;
      const filePath = path.join(this.contextCacheDir, `${cacheKey}.json`);
      await fsp.writeFile(filePath, JSON.stringify(sanitized, null, 2), { encoding: 'utf8' });
      return {
        cacheKey,
        relativePath: path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/'),
      };
    } catch (error) {
      logWarning('Activity feed failed to write context cache', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private updateTokenTotals(summary: ExecutionSummary): Record<string, unknown> {
    const agentAggregate = this.tokenTotalsByAgent.get(summary.agentId) ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUSD: 0,
    };
    agentAggregate.promptTokens += summary.promptTokens;
    agentAggregate.completionTokens += summary.completionTokens;
    agentAggregate.totalTokens += summary.totalTokens;
    if (typeof summary.tokenCostUSD === 'number') {
      agentAggregate.costUSD = (agentAggregate.costUSD ?? 0) + summary.tokenCostUSD;
    }
    this.tokenTotalsByAgent.set(summary.agentId, agentAggregate);

    const typeAggregate = this.tokenTotalsByType.get(summary.agentType) ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUSD: 0,
    };
    typeAggregate.promptTokens += summary.promptTokens;
    typeAggregate.completionTokens += summary.completionTokens;
    typeAggregate.totalTokens += summary.totalTokens;
    if (typeof summary.tokenCostUSD === 'number') {
      typeAggregate.costUSD = (typeAggregate.costUSD ?? 0) + summary.tokenCostUSD;
    }
    this.tokenTotalsByType.set(summary.agentType, typeAggregate);

    this.totalTokens += summary.totalTokens;

    return {
      delta: {
        promptTokens: summary.promptTokens,
        completionTokens: summary.completionTokens,
        totalTokens: summary.totalTokens,
        costUSD: summary.tokenCostUSD,
      },
      agentTotals: {
        promptTokens: agentAggregate.promptTokens,
        completionTokens: agentAggregate.completionTokens,
        totalTokens: agentAggregate.totalTokens,
        costUSD: agentAggregate.costUSD,
      },
      providerTotals: Array.from(this.tokenTotalsByType.entries()).reduce<Record<string, TokenAggregate>>(
        (acc, [provider, totals]) => {
          acc[provider] = totals;
          return acc;
        },
        {}
      ),
      overallTokens: this.totalTokens,
    };
  }
}
