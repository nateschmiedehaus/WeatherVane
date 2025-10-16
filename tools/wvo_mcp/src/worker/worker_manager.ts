import { fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type WorkerCallOptions,
  type WorkerIncomingMessage,
  type WorkerOutgoingMessage,
  type WorkerRpcFailure,
  type WorkerRpcSuccess,
  type WorkerStartOptions,
  type WorkerSwitchSummary,
  type WorkerReadyMessage,
  type WorkerLogMessage,
  type WorkerExitMessage,
} from './protocol.js';
import { logError } from '../telemetry/logger.js';

type WorkerRole = 'active' | 'canary';

interface WorkerManagerOptions {
  workspaceRoot?: string;
  maxEventEntries?: number;
  snapshotPath?: string;
}

interface WorkerEventSnapshot {
  timestamp: string;
  type: 'spawn' | 'ready' | 'log' | 'exit' | 'switch' | 'error';
  worker: WorkerRole | 'manager' | 'unknown';
  level?: 'info' | 'warn' | 'error';
  message?: string;
  details?: Record<string, unknown>;
}

interface WorkerHealthPayload extends Record<string, unknown> {
  ok?: unknown;
}

interface WorkerExitSnapshot {
  timestamp: string;
  reason?: string | null;
  code?: number | null;
  signal?: NodeJS.Signals | null;
}

interface WorkerProcessMetadata {
  role: WorkerRole;
  label: string;
  status: 'starting' | 'ready' | 'stopped';
  spawnedAtMs: number;
  readyAtMs?: number;
  startedAtIso?: string;
  version?: string | null;
  flags?: Record<string, unknown>;
  lastHealth?: WorkerHealthPayload | null;
  lastHealthAtMs?: number;
  lastExit?: WorkerExitSnapshot | null;
}

interface WorkerProcessSnapshot {
  role: WorkerRole;
  label: string;
  status: 'starting' | 'ready' | 'stopped';
  pid: number | null;
  spawned_at: string;
  ready_at?: string | null;
  started_at?: string | null;
  uptime_ms?: number | null;
  uptime_seconds?: number | null;
  version?: string | null;
  flags?: Record<string, unknown>;
  last_health?: WorkerHealthPayload | null;
  last_health_at?: string | null;
  last_exit?: WorkerExitSnapshot | null;
}

interface WorkerManagerSnapshot {
  recorded_at: string;
  recorded_at_ms: number;
  status: 'healthy' | 'degraded';
  notes: string[];
  active: WorkerProcessSnapshot | null;
  canary: WorkerProcessSnapshot | null;
  events: WorkerEventSnapshot[];
  event_limit: number;
  persisted_path: string | null;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  startedAt: number;
}

const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_START_TIMEOUT_MS = 20_000;

class ManagedWorker extends EventEmitter {
  private readonly child: ChildProcess;
  private readonly pending = new Map<string, PendingCall>();
  private readonly readyPromise: Promise<void>;
  private readyResolved = false;
  private disposed = false;
  public readonly label: string;
  private readonly idleTimer?: NodeJS.Timeout;

  public readonly role: 'active' | 'canary';
  public readonly entryPath: string;
  public readonly startedAt: number = Date.now();

  constructor(
    role: 'active' | 'canary',
    entryPath: string,
    execArgv: string[],
    options: WorkerStartOptions,
  ) {
    super();
    this.role = role;
    this.entryPath = entryPath;
    this.label = options.label ?? `${role.toUpperCase()}#${randomUUID().slice(0, 4)}`;

    this.child = fork(entryPath, [], {
      env: {
        ...process.env,
        WVO_WORKER_ROLE: role,
        ...options.env,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      execArgv,
    });

    this.child.on('message', (raw) => {
      this.handleMessage(raw as WorkerIncomingMessage);
    });
    this.child.on('exit', (code, signal) => {
      this.handleExit(code, signal);
    });
    this.child.on('error', (error) => {
      this.emit('error', error);
      this.rejectAllPending(error);
    });

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.readyResolved) {
          const error = new Error(
            `Worker ${this.label} did not send ready signal within ${DEFAULT_START_TIMEOUT_MS}ms`,
          );
          this.rejectAllPending(error);
          reject(error);
        }
      }, DEFAULT_START_TIMEOUT_MS);

      this.once('ready', () => {
        clearTimeout(timer);
        this.readyResolved = true;
        resolve();
      });
      this.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    if (options.idleTimeoutMs && options.idleTimeoutMs > 0) {
      this.idleTimer = setTimeout(() => {
        this.dispose();
      }, options.idleTimeoutMs);
      this.idleTimer.unref?.();
    }
  }

  get pid(): number | undefined {
    return this.child.pid ?? undefined;
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  async call<R = unknown>(method: string, params?: unknown, options?: WorkerCallOptions): Promise<R> {
    if (this.disposed) {
      throw new Error(`Worker ${this.label} is already disposed`);
    }

    await this.ready();

    const timeoutMs = options?.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    const id = randomUUID();

    const payload: WorkerOutgoingMessage = {
      id,
      method,
      params,
    };

    const resultPromise = new Promise<R>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Worker ${this.label} call timed out after ${timeoutMs}ms (${method})`));
        }
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as R);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
        startedAt: Date.now(),
      });
    });

    this.child.send(payload);
    return resultPromise;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Worker ${this.label} disposed`));
    }
    this.pending.clear();
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill('SIGTERM');
    }
  }

  private handleMessage(message: WorkerIncomingMessage): void {
    if ('type' in message) {
      switch (message.type) {
        case 'ready': {
          const readyMsg = message as WorkerReadyMessage;
          this.emit('ready', readyMsg);
          return;
        }
        case 'log': {
          const logMessage = message as WorkerLogMessage;
          this.emit('log', {
            level: logMessage.level,
            message: logMessage.message,
            details: logMessage.details,
          });
          return;
        }
        case 'exit': {
          const exitMessage = message as WorkerExitMessage;
          this.dispose();
          this.emit('exit', { reason: exitMessage.reason });
          return;
        }
        default: {
          // Fall through to RPC handling below
        }
      }
    }
    this.handleRpcResponse(message);
  }

  private handleRpcResponse(message: WorkerIncomingMessage): void {
    if ('id' in message) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if ((message as WorkerRpcSuccess).ok) {
        pending.resolve((message as WorkerRpcSuccess).result);
      } else {
        const failure = message as WorkerRpcFailure;
        const errorDetails = failure.error ?? { message: 'Unknown worker error' };
        const error = new Error(errorDetails.message);
        if (errorDetails.stack) {
          error.stack = errorDetails.stack;
        }
        Object.assign(error, { code: errorDetails.code, details: errorDetails.details });
        pending.reject(error);
      }
    }
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    const error = new Error(
      `Worker ${this.label} exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
    );
    this.rejectAllPending(error);
    this.emit('exit', { code, signal });
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function resolveWorkerEntry(): { entryPath: string; execArgv: string[] } {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(moduleDir, '..', '..');
  const distEntry = path.join(rootDir, 'dist', 'worker', 'worker_entry.js');
  const srcEntry = path.join(rootDir, 'src', 'worker', 'worker_entry.ts');

  if (fs.existsSync(distEntry)) {
    return { entryPath: distEntry, execArgv: [] };
  }

  if (fs.existsSync(srcEntry)) {
    return { entryPath: srcEntry, execArgv: ['--loader', 'ts-node/esm'] };
  }

  throw new Error('Unable to locate worker entrypoint (expected dist or src variant)');
}

export class WorkerManager extends EventEmitter {
  private activeWorker: ManagedWorker | null = null;
  private canaryWorker: ManagedWorker | null = null;

  private readonly workerRoles = new Map<ManagedWorker, WorkerRole>();
  private readonly workerListeners = new Map<
    ManagedWorker,
    {
      ready: (payload: WorkerReadyMessage) => void;
      log: (payload: WorkerLogMessage) => void;
      exit: (payload: { reason?: string; code?: number | null; signal?: NodeJS.Signals | null }) => void;
      error: (error: Error) => void;
    }
  >();

  private readonly metadata: Record<WorkerRole, WorkerProcessMetadata | null> = {
    active: null,
    canary: null,
  };

  private readonly events: WorkerEventSnapshot[] = [];
  private readonly eventLimit: number;
  private readonly telemetryPath: string | null;

  constructor(options: WorkerManagerOptions = {}) {
    super();
    this.eventLimit = options.maxEventEntries ?? 50;
    if (options.snapshotPath) {
      this.telemetryPath = options.snapshotPath;
    } else if (options.workspaceRoot) {
      this.telemetryPath = path.join(options.workspaceRoot, 'state', 'analytics', 'worker_manager.json');
    } else {
      this.telemetryPath = null;
    }
  }

  async startActive(options: Omit<WorkerStartOptions, 'role'> = {}): Promise<void> {
    if (this.activeWorker) {
      throw new Error('Active worker already running');
    }
    const { entryPath, execArgv } = resolveWorkerEntry();
    const { entryPath: overrideEntryPath, env: providedEnv, label, ...restOptions } = options;
    const worker = new ManagedWorker('active', overrideEntryPath ?? entryPath, execArgv, {
      ...restOptions,
      role: 'active',
      label: label ?? 'active',
      env: {
        WVO_DRY_RUN: providedEnv?.WVO_DRY_RUN ?? '0',
        ...providedEnv,
      },
    });

    this.attachWorker(worker, 'active');
    await worker.ready();
    this.activeWorker = worker;
    this.emit('active:ready', { pid: worker.pid });
  }

  async startCanary(options: Omit<WorkerStartOptions, 'role'> = {}): Promise<void> {
    if (this.canaryWorker) {
      throw new Error('Canary worker already running');
    }
    const { entryPath, execArgv } = resolveWorkerEntry();
    const { entryPath: overrideEntryPath, env: providedEnv, label, ...restOptions } = options;
    const worker = new ManagedWorker('canary', overrideEntryPath ?? entryPath, execArgv, {
      ...restOptions,
      role: 'canary',
      label: label ?? 'canary',
      env: {
        WVO_DRY_RUN: providedEnv?.WVO_DRY_RUN ?? '1',
        ...providedEnv,
      },
    });
    this.attachWorker(worker, 'canary');
    await worker.ready();
    this.canaryWorker = worker;
    this.emit('canary:ready', { pid: worker.pid });
  }

  async switchToCanary(): Promise<WorkerSwitchSummary> {
    if (!this.canaryWorker) {
      throw new Error('Cannot switch without a ready canary worker');
    }
    const canary = this.canaryWorker;
    await canary.ready();
    const previousPid = this.activeWorker?.pid;
    const promotedPid = canary.pid;

    const previousWorker = this.activeWorker;
    this.activeWorker = canary;
    this.canaryWorker = null;
    this.workerRoles.set(canary, 'active');

    if (this.metadata.canary) {
      const promoted = { ...this.metadata.canary, role: 'active' as const };
      this.metadata.active = promoted;
      this.metadata.canary = null;
    }

    this.recordEvent('manager', 'switch', {
      message: 'Promoted canary worker to active role',
      details: {
        promotedPid: promotedPid ?? null,
        previousPid: previousPid ?? null,
      },
    });

    if (previousWorker) {
      previousWorker.dispose();
    }

    this.emit('switch', {
      promotedPid,
      previousPid,
    });

    return {
      previousWorkerPid: previousPid,
      promotedWorkerPid: promotedPid ?? -1,
      switchedAt: new Date().toISOString(),
    };
  }

  getActive(): ManagedWorker {
    if (!this.activeWorker) {
      throw new Error('No active worker available');
    }
    return this.activeWorker;
  }

  getCanary(): ManagedWorker | null {
    return this.canaryWorker;
  }

  async stopAll(): Promise<void> {
    if (this.activeWorker) {
      const worker = this.activeWorker;
      this.activeWorker = null;
      worker.dispose();
    }
    if (this.canaryWorker) {
      const worker = this.canaryWorker;
      this.canaryWorker = null;
      worker.dispose();
    }
  }

  async getSnapshot(): Promise<WorkerManagerSnapshot> {
    const now = Date.now();
    const [active, canary] = await Promise.all([
      this.collectProcessSnapshot('active', now),
      this.collectProcessSnapshot('canary', now),
    ]);

    const notes: string[] = [];
    let status: 'healthy' | 'degraded' = 'healthy';

    if (!active) {
      status = 'degraded';
      notes.push('Active worker missing.');
    } else {
      if (active.status !== 'ready') {
        status = 'degraded';
        notes.push(`Active worker status=${active.status}.`);
      }
      if (!isHealthOk(active.last_health)) {
        status = 'degraded';
        notes.push('Active worker health check missing or failed.');
      }
      if (active.last_health_at) {
        const lastHealthMs = parseTimestamp(active.last_health_at);
        if (Number.isFinite(lastHealthMs) && lastHealthMs + 5 * 60 * 1000 < now) {
          status = 'degraded';
          notes.push('Active worker health check stale (>5m).');
        }
      }
    }

    const recentExit = this.events.find((event) => {
      if (event.type !== 'exit') {
        return false;
      }
      const ts = parseTimestamp(event.timestamp);
      return Number.isFinite(ts) && ts + 10 * 60 * 1000 >= now;
    });
    if (recentExit) {
      status = 'degraded';
      notes.push('Worker exit recorded within last 10 minutes.');
    }

    const snapshot: WorkerManagerSnapshot = {
      recorded_at: new Date(now).toISOString(),
      recorded_at_ms: now,
      status,
      notes,
      active: active ?? null,
      canary: canary ?? null,
      events: [...this.events],
      event_limit: this.eventLimit,
      persisted_path: this.telemetryPath,
    };

    await this.persistSnapshot(snapshot);
    return snapshot;
  }

  private resolveRole(worker: ManagedWorker): WorkerRole | 'unknown' {
    if (worker === this.activeWorker) {
      return 'active';
    }
    if (worker === this.canaryWorker) {
      return 'canary';
    }
    return this.workerRoles.get(worker) ?? 'unknown';
  }

  private attachWorker(worker: ManagedWorker, role: WorkerRole): void {
    this.workerRoles.set(worker, role);

    const readyListener = (payload: WorkerReadyMessage) => {
      this.handleWorkerReady(worker, payload);
    };
    const logListener = (payload: WorkerLogMessage) => {
      this.handleWorkerLog(worker, payload);
    };
    const exitListener = (payload: { reason?: string; code?: number | null; signal?: NodeJS.Signals | null }) => {
      this.handleWorkerExit(worker, payload);
    };
    const errorListener = (error: Error) => {
      this.handleWorkerError(worker, error);
    };

    worker.on('ready', readyListener);
    worker.on('log', logListener);
    worker.on('exit', exitListener);
    worker.on('error', errorListener);

    this.workerListeners.set(worker, {
      ready: readyListener,
      log: logListener,
      exit: exitListener,
      error: errorListener,
    });

    this.metadata[role] = {
      role,
      label: worker.label,
      status: 'starting',
      spawnedAtMs: worker.startedAt,
      lastExit: null,
    };
    this.recordEvent(role, 'spawn', {
      message: `Started ${role} worker`,
      details: {
        label: worker.label,
        pid: worker.pid ?? null,
      },
    });
  }

  private detachWorker(worker: ManagedWorker): void {
    const listeners = this.workerListeners.get(worker);
    if (listeners) {
      worker.off('ready', listeners.ready);
      worker.off('log', listeners.log);
      worker.off('exit', listeners.exit);
      worker.off('error', listeners.error);
      this.workerListeners.delete(worker);
    }
    this.workerRoles.delete(worker);
  }

  private handleWorkerReady(worker: ManagedWorker, payload: WorkerReadyMessage): void {
    const role = this.resolveRole(worker);
    if (role === 'unknown') {
      return;
    }
    this.updateMetadata(role, {
      status: 'ready',
      readyAtMs: Date.now(),
      startedAtIso: payload.startedAt,
      version: payload.version ?? null,
      flags: payload.flags ?? undefined,
    });
    this.recordEvent(role, 'ready', {
      message: `${role} worker signalled ready`,
      details: {
        version: payload.version ?? null,
      },
    });
  }

  private handleWorkerLog(worker: ManagedWorker, payload: WorkerLogMessage): void {
    const role = this.resolveRole(worker);
    this.recordEvent(role === 'unknown' ? 'unknown' : role, 'log', {
      level: payload.level,
      message: payload.message,
      details: payload.details,
    });
    this.emit('log', {
      worker: role,
      level: payload.level,
      message: payload.message,
      details: payload.details,
    });
  }

  private handleWorkerExit(
    worker: ManagedWorker,
    payload: { reason?: string; code?: number | null; signal?: NodeJS.Signals | null },
  ): void {
    const role = this.resolveRole(worker);
    const timestamp = new Date().toISOString();
    const exitSnapshot: WorkerExitSnapshot = {
      timestamp,
      reason: payload.reason ?? null,
      code: payload.code ?? null,
      signal: payload.signal ?? null,
    };

    if (role === 'active') {
      if (worker === this.activeWorker) {
        this.activeWorker = null;
      }
      this.emit('active:exit', payload);
    } else if (role === 'canary') {
      if (worker === this.canaryWorker) {
        this.canaryWorker = null;
      }
      this.emit('canary:exit', payload);
    }

    if (role === 'active' || role === 'canary') {
      const meta = this.metadata[role];
      if (meta && meta.spawnedAtMs === worker.startedAt) {
        this.updateMetadata(role, {
          status: 'stopped',
          lastExit: exitSnapshot,
        });
      }
    }

    this.recordEvent(role === 'unknown' ? 'unknown' : role, 'exit', {
      message: `${role} worker exited`,
      details: {
        reason: payload.reason ?? null,
        code: payload.code ?? null,
        signal: payload.signal ?? null,
      },
    });

    this.detachWorker(worker);
  }

  private handleWorkerError(worker: ManagedWorker, error: Error): void {
    const role = this.resolveRole(worker);
    this.recordEvent(role === 'unknown' ? 'unknown' : role, 'error', {
      level: 'error',
      message: error.message,
      details: { stack: error.stack },
    });
  }

  private recordEvent(
    worker: WorkerRole | 'manager' | 'unknown',
    type: WorkerEventSnapshot['type'],
    payload: { level?: 'info' | 'warn' | 'error'; message?: string; details?: Record<string, unknown> },
  ): void {
    const event: WorkerEventSnapshot = {
      timestamp: new Date().toISOString(),
      type,
      worker,
      level: payload.level,
      message: payload.message,
      details: payload.details,
    };
    this.events.push(event);
    if (this.events.length > this.eventLimit) {
      this.events.splice(0, this.events.length - this.eventLimit);
    }
  }

  private updateMetadata(role: WorkerRole, updates: Partial<WorkerProcessMetadata>): void {
    const existing = this.metadata[role];
    if (!existing) {
      this.metadata[role] = {
        role,
        label: `${role}`,
        status: 'starting',
        spawnedAtMs: Date.now(),
        lastExit: null,
        ...updates,
      };
      return;
    }
    this.metadata[role] = {
      ...existing,
      ...updates,
    };
  }

  private async collectProcessSnapshot(
    role: WorkerRole,
    nowMs: number,
  ): Promise<WorkerProcessSnapshot | null> {
    const worker = role === 'active' ? this.activeWorker : this.canaryWorker;
    const metadata = this.metadata[role];
    if (!worker && !metadata) {
      return null;
    }

    if (worker) {
      try {
        const health = await worker.call<WorkerHealthPayload>('health', undefined, { timeoutMs: 5_000 });
        this.updateMetadata(role, {
          lastHealth: health ?? null,
          lastHealthAtMs: nowMs,
        });
      } catch (error) {
        this.updateMetadata(role, {
          lastHealth: null,
          lastHealthAtMs: nowMs,
        });
        this.recordEvent(role, 'error', {
          level: 'error',
          message: `Health check failed for ${role} worker`,
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    const meta = this.metadata[role];
    if (!meta) {
      return null;
    }

    const uptimeMs =
      worker && Number.isFinite(worker.startedAt) ? Math.max(0, nowMs - worker.startedAt) : null;
    const uptimeSeconds =
      uptimeMs === null ? null : Number((uptimeMs / 1000).toFixed(3));

    return {
      role: meta.role,
      label: meta.label,
      status: meta.status,
      pid: worker?.pid ?? null,
      spawned_at: new Date(meta.spawnedAtMs).toISOString(),
      ready_at: meta.readyAtMs ? new Date(meta.readyAtMs).toISOString() : null,
      started_at: meta.startedAtIso ?? null,
      uptime_ms: uptimeMs,
      uptime_seconds: uptimeSeconds,
      version: meta.version ?? null,
      flags: meta.flags,
      last_health: meta.lastHealth ?? null,
      last_health_at: meta.lastHealthAtMs ? new Date(meta.lastHealthAtMs).toISOString() : null,
      last_exit: meta.lastExit ?? null,
    };
  }

  private async persistSnapshot(snapshot: WorkerManagerSnapshot): Promise<void> {
    if (!this.telemetryPath) {
      return;
    }
    try {
      await fsPromises.mkdir(path.dirname(this.telemetryPath), { recursive: true });
      await fsPromises.writeFile(
        this.telemetryPath,
        `${JSON.stringify(snapshot, null, 2)}\n`,
        'utf8',
      );
    } catch (error) {
      logError('Failed to persist worker manager snapshot', {
        path: this.telemetryPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export type { ManagedWorker };

function parseTimestamp(value?: string | null): number {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function isHealthOk(payload: WorkerHealthPayload | null | undefined): boolean {
  if (!payload) {
    return false;
  }
  return payload.ok === true;
}
