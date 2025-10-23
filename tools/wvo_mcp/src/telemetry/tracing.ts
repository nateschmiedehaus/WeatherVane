import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

type SpanStatus = "ok" | "error";

interface SpanEvent {
  name: string;
  timeUnixNano: number;
  attributes?: Record<string, unknown>;
}

interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: number;
  endTimeUnixNano?: number;
  status: SpanStatus;
  statusMessage?: string;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  ended: boolean;
}

export interface SpanHandle {
  traceId: string;
  spanId: string;
  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: SpanStatus, message?: string): void;
  recordException(error: unknown): void;
}

interface TracingConfig {
  enabled: boolean;
  filePath: string;
  sampleRatio: number;
}

const spanStorage = new AsyncLocalStorage<SpanRecord>();
const pendingWrites: string[] = [];

let flushScheduled = false;
let tracingConfig: TracingConfig | null = null;
let ensuredDir = false;

function ensureDirectoryExists(filePath: string): void {
  if (ensuredDir) {
    return;
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  ensuredDir = true;
}

function scheduleFlush(): void {
  if (flushScheduled) {
    return;
  }
  flushScheduled = true;
  setImmediate(async () => {
    flushScheduled = false;
    if (!tracingConfig || pendingWrites.length === 0) {
      return;
    }

    ensureDirectoryExists(tracingConfig.filePath);
    const payload = pendingWrites.splice(0).join("");
    if (payload.length === 0) {
      return;
    }

    try {
      await fsp.appendFile(tracingConfig.filePath, payload, { encoding: "utf8" });
    } catch {
      // Best-effort tracing; swallow errors to avoid impacting orchestrator
    }
  });
}

function nanoSecondsNow(): number {
  const [seconds, nanoseconds] = process.hrtime();
  return seconds * 1_000_000_000 + nanoseconds;
}

function shouldSample(): boolean {
  if (!tracingConfig) {
    return false;
  }
  if (tracingConfig.sampleRatio >= 1) {
    return true;
  }
  if (tracingConfig.sampleRatio <= 0) {
    return false;
  }
  return Math.random() < tracingConfig.sampleRatio;
}

function randomTraceId(): string {
  return randomBytes(16).toString("hex");
}

function randomSpanId(): string {
  return randomBytes(8).toString("hex");
}

function serializeSpan(span: SpanRecord): string {
  const payload = {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId ?? null,
    name: span.name,
    startTimeUnixNano: span.startTimeUnixNano,
    endTimeUnixNano: span.endTimeUnixNano ?? null,
    status: span.status,
    statusMessage: span.statusMessage ?? null,
    attributes: span.attributes,
    events: span.events,
    durationMs:
      typeof span.endTimeUnixNano === "number"
        ? Number(((span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000).toFixed(3))
        : null,
  };
  return `${JSON.stringify(payload)}\n`;
}

function recordSpan(span: SpanRecord): void {
  if (!tracingConfig || !tracingConfig.enabled) {
    return;
  }
  if (!span.ended || typeof span.endTimeUnixNano !== "number") {
    return;
  }

  pendingWrites.push(serializeSpan(span));
  scheduleFlush();
}

function createSpanHandle(span: SpanRecord): SpanHandle {
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    setAttribute(key: string, value: unknown) {
      span.attributes[key] = value;
    },
    addEvent(name: string, attributes?: Record<string, unknown>) {
      span.events.push({
        name,
        attributes,
        timeUnixNano: nanoSecondsNow(),
      });
    },
    setStatus(status: SpanStatus, message?: string) {
      span.status = status;
      span.statusMessage = message;
    },
    recordException(error: unknown) {
      const details =
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : {
              message: typeof error === "string" ? error : "Unknown error",
            };
      span.events.push({
        name: "exception",
        attributes: details,
        timeUnixNano: nanoSecondsNow(),
      });
      span.status = "error";
      if (details && typeof details === "object" && "message" in details) {
        span.statusMessage = String((details as { message?: unknown }).message ?? "error");
      }
    },
  };
}

export interface WithSpanOptions {
  attributes?: Record<string, unknown>;
  parent?: SpanRecord;
}

export interface InitTracingOptions {
  workspaceRoot: string;
  enabled?: boolean;
  sampleRatio?: number;
  fileName?: string;
}

export function initTracing(options: InitTracingOptions): void {
  const enabled = options.enabled ?? false;
  if (!enabled) {
    tracingConfig = {
      enabled: false,
      filePath: "",
      sampleRatio: 0,
    };
    return;
  }

  const fileName = options.fileName ?? "traces.jsonl";
  const filePath = path.join(options.workspaceRoot, "state", "telemetry", fileName);

  tracingConfig = {
    enabled: true,
    filePath,
    sampleRatio: options.sampleRatio ?? 1,
  };
}

export async function withSpan<T>(
  name: string,
  fn: (span?: SpanHandle) => Promise<T>,
  options?: WithSpanOptions,
): Promise<T>;
export function withSpan<T>(
  name: string,
  fn: (span?: SpanHandle) => T,
  options?: WithSpanOptions,
): T;
export function withSpan<T>(
  name: string,
  fn: (span?: SpanHandle) => T | Promise<T>,
  options?: WithSpanOptions,
): T | Promise<T> {
  if (!tracingConfig || !tracingConfig.enabled || !shouldSample()) {
    return fn(undefined);
  }

  const parentSpan = options?.parent ?? spanStorage.getStore();

  const span: SpanRecord = {
    traceId: parentSpan?.traceId ?? randomTraceId(),
    spanId: randomSpanId(),
    parentSpanId: parentSpan ? parentSpan.spanId : undefined,
    name,
    startTimeUnixNano: nanoSecondsNow(),
    status: "ok",
    attributes: { ...(options?.attributes ?? {}) },
    events: [],
    ended: false,
  };

  const spanHandle = createSpanHandle(span);

  const run = (): T | Promise<T> => {
    try {
      const result = fn(spanHandle);
      if (result instanceof Promise) {
        return result
          .then((value) => {
            span.status = span.status ?? "ok";
            return value;
          })
          .catch((error) => {
            spanHandle.recordException(error);
            throw error;
          })
          .finally(() => {
            span.endTimeUnixNano = nanoSecondsNow();
            span.ended = true;
            recordSpan(span);
          });
      }
      span.endTimeUnixNano = nanoSecondsNow();
      span.ended = true;
      recordSpan(span);
      return result;
    } catch (error) {
      spanHandle.recordException(error);
      span.endTimeUnixNano = nanoSecondsNow();
      span.ended = true;
      recordSpan(span);
      throw error;
    }
  };

  return spanStorage.run(span, run);
}

export function startSpan(name: string, attributes?: Record<string, unknown>): SpanHandle | null {
  if (!tracingConfig || !tracingConfig.enabled || !shouldSample()) {
    return null;
  }

  const parent = spanStorage.getStore();
  const span: SpanRecord = {
    traceId: parent?.traceId ?? randomTraceId(),
    spanId: randomSpanId(),
    parentSpanId: parent?.spanId,
    name,
    startTimeUnixNano: nanoSecondsNow(),
    status: "ok",
    attributes: { ...(attributes ?? {}) },
    events: [],
    ended: false,
  };

  spanStorage.enterWith(span);
  return createSpanHandle(span);
}

export function endSpan(spanHandle: SpanHandle | null | undefined): void {
  if (!spanHandle) {
    return;
  }
  const activeSpan = spanStorage.getStore();
  if (!activeSpan || activeSpan.spanId !== spanHandle.spanId) {
    return;
  }
  activeSpan.endTimeUnixNano = nanoSecondsNow();
  activeSpan.ended = true;
  recordSpan(activeSpan);
  spanStorage.disable();
}

