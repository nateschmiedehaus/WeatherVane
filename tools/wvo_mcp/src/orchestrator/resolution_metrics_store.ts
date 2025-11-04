import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logWarning } from '../telemetry/logger.js';

export interface ResolutionAttemptEvent {
  taskId: string;
  label: string;
  attempt: number;
  timestamp: string;
  runId: string;
}

export interface ResolutionClosedEvent {
  taskId: string;
  attempts: number;
  closedAt: string;
  durationMs: number;
  runId: string;
}

export interface ResolutionIncidentEvent {
  taskId: string;
  state: string;
  attempt: number;
  timestamp: string;
}

export interface ResolutionMetricsData {
  updatedAt: string;
  activeLoops: Array<{
    taskId: string;
    attempts: number;
    firstAttemptAt: string;
    lastAttemptAt: string;
    lastLabel: string;
    labels: string[];
    elapsedMs: number;
    runId: string;
    infiniteLoopFlag?: boolean;
  }>;
  stats: {
    totalLoops: number;
    closedLoops: number;
    closedWithin3: number;
    infiniteLoopCount: number;
    incidentCount: number;
    attemptHistogram: Record<string, number>;
  };
  recentEvents: Array<
    | (ResolutionAttemptEvent & { type: 'attempt' })
    | (ResolutionClosedEvent & { type: 'closed' })
    | (ResolutionIncidentEvent & { type: 'incident' })
  >;
  recentlyClosed: ResolutionClosedEvent[];
}

interface ActiveLoop {
  taskId: string;
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  lastLabel: string;
  labels: string[];
  runId: string;
  infiniteLoopFlag?: boolean;
}

export class ResolutionMetricsStore {
  private readonly filePath: string;
  private data: ResolutionMetricsData;
  private activeLoops = new Map<string, ActiveLoop>();
  private recentlyClosed: ResolutionClosedEvent[] = [];
  private saveInProgress: Promise<void> | null = null;
  private readonly ready: Promise<void>;

  constructor(workspaceRoot: string) {
    this.filePath = path.join(
      workspaceRoot,
      'state',
      'analytics',
      'resolution_metrics.json'
    );
    this.data = this.createDefaultData();
    this.ready = this.loadInitial();
  }

  private createDefaultData(): ResolutionMetricsData {
    return {
      updatedAt: new Date(0).toISOString(),
      activeLoops: [],
      stats: {
        totalLoops: 0,
        closedLoops: 0,
        closedWithin3: 0,
        infiniteLoopCount: 0,
        incidentCount: 0,
        attemptHistogram: {},
      },
      recentEvents: [],
      recentlyClosed: [],
    };
  }

  private async loadInitial(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as ResolutionMetricsData;
      this.data = parsed;
      this.recentlyClosed = parsed.recentlyClosed ?? [];
      this.activeLoops = new Map(
        (parsed.activeLoops ?? []).map((entry) => [
          entry.taskId,
          {
            taskId: entry.taskId,
            attempts: entry.attempts,
            firstAttemptAt: Date.parse(entry.firstAttemptAt),
            lastAttemptAt: Date.parse(entry.lastAttemptAt),
            lastLabel: entry.lastLabel,
            labels: entry.labels ?? [entry.lastLabel],
            runId: entry.runId,
            infiniteLoopFlag: entry.infiniteLoopFlag,
          },
        ])
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      logWarning('ResolutionMetricsStore failed to load existing data', {
        filePath: this.filePath,
        error: message,
      });
    }
  }

  async recordAttempt(params: {
    taskId: string;
    attempt: number;
    timestamp: string;
    runId: string;
    label: string;
  }): Promise<void> {
    await this.ready;
    const timestampMs = Date.parse(params.timestamp);
    const existing = this.activeLoops.get(params.taskId);
    if (existing) {
      existing.attempts = params.attempt;
      existing.lastAttemptAt = timestampMs;
      existing.lastLabel = params.label;
      if (!existing.labels.includes(params.label)) {
        existing.labels.push(params.label);
      }
    } else {
      this.activeLoops.set(params.taskId, {
        taskId: params.taskId,
        attempts: params.attempt,
        firstAttemptAt: timestampMs,
        lastAttemptAt: timestampMs,
        lastLabel: params.label,
        labels: [params.label],
        runId: params.runId,
      });
      this.data.stats.totalLoops += 1;
    }

    const histogramKey = String(params.attempt);
    this.data.stats.attemptHistogram[histogramKey] =
      (this.data.stats.attemptHistogram[histogramKey] ?? 0) + 1;

    const loop = this.activeLoops.get(params.taskId)!;
    if (params.attempt > 5 && !loop.infiniteLoopFlag) {
      loop.infiniteLoopFlag = true;
      this.data.stats.infiniteLoopCount += 1;
    }

    this.pushRecentEvent({
      type: 'attempt',
      taskId: params.taskId,
      label: params.label,
      attempt: params.attempt,
      timestamp: params.timestamp,
      runId: params.runId,
    });

    await this.persist();
  }

  async markClosed(params: {
    taskId: string;
    attempt: number;
    timestamp: string;
    runId: string;
  }): Promise<void> {
    await this.ready;
    const entry = this.activeLoops.get(params.taskId);
    if (!entry) {
      return;
    }

    this.activeLoops.delete(params.taskId);
    this.data.stats.closedLoops += 1;
    if (params.attempt <= 3) {
      this.data.stats.closedWithin3 += 1;
    }

    const durationMs = Math.max(
      0,
      Date.parse(params.timestamp) - entry.firstAttemptAt
    );
    const closedEvent: ResolutionClosedEvent = {
      taskId: params.taskId,
      attempts: params.attempt,
      closedAt: params.timestamp,
      durationMs,
      runId: params.runId,
    };
    this.recentlyClosed.unshift(closedEvent);
    this.recentlyClosed = this.recentlyClosed.slice(0, 50);
    this.data.recentlyClosed = this.recentlyClosed;

    this.pushRecentEvent({
      type: 'closed',
      ...closedEvent,
    });

    await this.persist();
  }

  async recordIncident(params: {
    taskId: string;
    state: string;
    attempt: number;
    timestamp: string;
  }): Promise<void> {
    await this.ready;
    this.data.stats.incidentCount += 1;
    this.pushRecentEvent({
      type: 'incident',
      taskId: params.taskId,
      state: params.state,
      attempt: params.attempt,
      timestamp: params.timestamp,
    });
    await this.persist();
  }

  private pushRecentEvent(
    event: ResolutionMetricsData['recentEvents'][number]
  ): void {
    this.data.recentEvents.unshift(event);
    if (this.data.recentEvents.length > 50) {
      this.data.recentEvents.length = 50;
    }
  }

  private async persist(): Promise<void> {
    await this.ready;
    if (this.saveInProgress) {
      await this.saveInProgress;
    }

    const snapshot: ResolutionMetricsData = {
      updatedAt: new Date().toISOString(),
      activeLoops: Array.from(this.activeLoops.values()).map((loop) => ({
        taskId: loop.taskId,
        attempts: loop.attempts,
        firstAttemptAt: new Date(loop.firstAttemptAt).toISOString(),
        lastAttemptAt: new Date(loop.lastAttemptAt).toISOString(),
        lastLabel: loop.lastLabel,
        labels: loop.labels,
        elapsedMs: Math.max(0, loop.lastAttemptAt - loop.firstAttemptAt),
        runId: loop.runId,
        infiniteLoopFlag: loop.infiniteLoopFlag,
      })),
      stats: this.data.stats,
      recentEvents: this.data.recentEvents,
      recentlyClosed: this.recentlyClosed,
    };

    this.data = snapshot;

    this.saveInProgress = (async () => {
      try {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(snapshot, null, 2), 'utf8');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarning('ResolutionMetricsStore failed to persist data', {
          filePath: this.filePath,
          error: message,
        });
      } finally {
        this.saveInProgress = null;
      }
    })();

    await this.saveInProgress;
  }
}
