import type { LiveFlagSnapshot } from '../state/live_flags.js';

export interface WorkerReadyMessage {
  type: 'ready';
  startedAt: string;
  flags?: Partial<LiveFlagSnapshot>;
  version?: string;
}

export interface WorkerExitMessage {
  type: 'exit';
  reason?: string;
}

export interface WorkerLogMessage {
  type: 'log';
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkerRpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface WorkerRpcSuccess {
  id: string;
  ok: true;
  result?: unknown;
  tookMs?: number;
}

export interface WorkerRpcErrorPayload {
  message: string;
  code?: string;
  stack?: string;
  details?: Record<string, unknown>;
}

export interface WorkerRpcFailure {
  id: string;
  ok: false;
  error: WorkerRpcErrorPayload;
  tookMs?: number;
}

export type WorkerIncomingMessage =
  | WorkerReadyMessage
  | WorkerExitMessage
  | WorkerLogMessage
  | WorkerRpcSuccess
  | WorkerRpcFailure;

export type WorkerOutgoingMessage = WorkerRpcRequest;

export interface WorkerCallOptions {
  timeoutMs?: number;
}

export interface WorkerStartOptions {
  role: 'active' | 'canary';
  entryPath?: string;
  idleTimeoutMs?: number;
  label?: string;
  env?: Record<string, string | undefined>;
  allowDryRunActive?: boolean;
}

export interface WorkerSwitchSummary {
  previousWorkerPid?: number;
  promotedWorkerPid: number;
  switchedAt: string;
}
