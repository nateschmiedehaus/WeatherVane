import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCriticApprovals, formatVerificationError } from './critic_verification.js';

export const WORK_PROCESS_PHASES = ['strategize','spec','plan','think','implement','verify','review','pr','monitor'] as const;
export type WorkProcessPhase = typeof WORK_PROCESS_PHASES[number];
const INDEX = new Map<WorkProcessPhase, number>(WORK_PROCESS_PHASES.map((phase, index) => [phase, index] as const));
const FIRST = WORK_PROCESS_PHASES[0]; const LAST = WORK_PROCESS_PHASES[WORK_PROCESS_PHASES.length - 1];
const MODULE_DIR = dirname(fileURLToPath(import.meta.url)), WORKSPACE_ROOT = join(MODULE_DIR, '..', '..', '..', '..'), DEFAULT_LEDGER_FILE = join(WORKSPACE_ROOT, 'state', 'logs', 'work_process.jsonl');

export type LedgerEntry = { taskId: string; phase: WorkProcessPhase; actorId: string; evidencePath: string; metadata?: Record<string, unknown>; timestamp: string; backtrack?: { targetPhase: WorkProcessPhase; reason: string }; sequence: number; previousHash: string | null; hash: string; };
type AppendInput = Omit<LedgerEntry,'timestamp'|'sequence'|'previousHash'|'hash'> & { timestamp?: Date };
export interface LedgerStore { append(entry: LedgerEntry): Promise<void>; loadAll(): Promise<LedgerEntry[]>; }

export class JsonlLedgerStore implements LedgerStore {
  constructor(private readonly filePath = DEFAULT_LEDGER_FILE) {}
  async append(entry: LedgerEntry): Promise<void> { await this.ensureDir(); await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8'); }
  async loadAll(): Promise<LedgerEntry[]> {
    if (!existsSync(this.filePath)) return [];
    const raw = await readFile(this.filePath, 'utf8');
    return raw.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as LedgerEntry);
  }
  private async ensureDir(): Promise<void> { const dir = dirname(this.filePath); if (!existsSync(dir)) await mkdir(dir, { recursive: true }); }
}

export class InMemoryLedgerStore implements LedgerStore {
  private readonly entries: LedgerEntry[] = [];
  async append(entry: LedgerEntry): Promise<void> { this.entries.push(entry); }
  async loadAll(): Promise<LedgerEntry[]> { return [...this.entries]; }
}

export class WorkProcessLedger {
  private readonly buckets = new Map<string, LedgerEntry[]>(); private readonly ready: Promise<void>;
  constructor(private readonly store: LedgerStore = new JsonlLedgerStore()) { this.ready = this.hydrate(); }
  async list(taskId: string): Promise<LedgerEntry[]> { await this.ready; return this.buckets.get(taskId)?.slice() ?? []; }
  async append(input: AppendInput): Promise<LedgerEntry> {
    await this.ready;
    const bucket = this.buckets.get(input.taskId) ?? [];
    const previous = bucket[bucket.length - 1];
    const timestamp = (input.timestamp ?? new Date()).toISOString();
    const sequence = previous ? previous.sequence + 1 : 0;
    const previousHash = previous?.hash ?? null;
    const { timestamp: _, ...inputWithoutTimestamp } = input;
    const entry: LedgerEntry = { ...inputWithoutTimestamp, timestamp, sequence, previousHash, hash: computeHash(inputWithoutTimestamp, timestamp, sequence, previousHash) };
    bucket.push(entry); this.buckets.set(input.taskId, bucket);
    await this.store.append(entry);
    return entry;
  }
  private async hydrate(): Promise<void> {
    const all = await this.store.loadAll();
    for (const entry of all) { const bucket = this.buckets.get(entry.taskId) ?? []; bucket.push(entry); this.buckets.set(entry.taskId, bucket); }
  }
}

export type PhaseTransitionRequest = { taskId: string; phase: WorkProcessPhase; actorId: string; evidencePath: string; metadata?: Record<string, unknown>; timestamp?: Date; };
export type BacktrackRequest = { taskId: string; targetPhase: WorkProcessPhase; actorId: string; reason: string; evidencePath: string; metadata?: Record<string, unknown>; timestamp?: Date; };
export interface WorkProcessEnforcerOptions { ledger?: WorkProcessLedger; clock?: () => Date; }

export class WorkProcessEnforcer {
  private readonly ledger: WorkProcessLedger; private readonly clock: () => Date;
  private readonly pending = new Map<string, BacktrackRequest>();
  constructor(options: WorkProcessEnforcerOptions = {}) {
    this.ledger = options.ledger ?? new WorkProcessLedger();
    this.clock = options.clock ?? (() => new Date());
  }
  static createInMemory(clock?: () => Date): WorkProcessEnforcer {
    return new WorkProcessEnforcer({ ledger: new WorkProcessLedger(new InMemoryLedgerStore()), clock });
  }
  async getCurrentPhase(taskId: string): Promise<WorkProcessPhase | null> {
    const entries = await this.ledger.list(taskId);
    const last = [...entries].reverse().find((entry) => !entry.backtrack);
    return last?.phase ?? null;
  }
  async recordTransition(request: PhaseTransitionRequest): Promise<LedgerEntry> {
    const entries = await this.ledger.list(request.taskId);
    const pending = this.pending.get(request.taskId);
    const last = [...entries].reverse().find((entry) => !entry.backtrack);
    if (entries.length === 0 && request.phase !== FIRST) throw new Error(`Task ${request.taskId} must start with ${FIRST}.`);
    if (pending) {
      if (request.phase !== pending.targetPhase) throw new Error(`Task ${request.taskId} is backtracking to ${pending.targetPhase}; cannot enter ${request.phase}.`);
      this.pending.delete(request.taskId);
    } else if (last) {
      if (last.phase === LAST) throw new Error(`Task ${request.taskId} already completed ${LAST}.`);
      const expected = nextPhase(last.phase);
      if (expected !== request.phase) throw new Error(`Invalid transition for ${request.taskId}. Expected ${expected}, got ${request.phase}.`);

      // CRITIC VERIFICATION: Ensure phase artifacts are approved before transition
      const verification = verifyCriticApprovals(request.taskId, last.phase, request.phase);
      if (!verification.allowed) {
        const errorMsg = formatVerificationError(request.taskId, last.phase, request.phase, verification.checks);
        throw new Error(errorMsg);
      }
    }
    return this.ledger.append({ ...request, timestamp: request.timestamp ?? this.clock() });
  }
  async requestBacktrack(request: BacktrackRequest): Promise<LedgerEntry> {
    const entries = await this.ledger.list(request.taskId);
    if (!entries.length) throw new Error(`Cannot backtrack task ${request.taskId}; ledger empty.`);
    const last = [...entries].reverse().find((entry) => !entry.backtrack);
    if (!last) throw new Error(`Ledger for ${request.taskId} has no forward progress.`);
    if (phaseIndex(request.targetPhase) > phaseIndex(last.phase)) {
      throw new Error(`Cannot backtrack forward from ${last.phase} to ${request.targetPhase}.`);
    }
    this.pending.set(request.taskId, request);
    return this.ledger.append({
      taskId: request.taskId,
      phase: request.targetPhase,
      actorId: request.actorId,
      evidencePath: request.evidencePath,
      metadata: request.metadata,
      timestamp: request.timestamp ?? this.clock(),
      backtrack: { targetPhase: request.targetPhase, reason: request.reason },
    });
  }
  async getLedger(taskId: string): Promise<LedgerEntry[]> { return this.ledger.list(taskId); }
}

export function assertLedgerCompleteness(entries: LedgerEntry[]): void {
  const forward = entries.filter((entry) => !entry.backtrack);
  if (forward.length !== WORK_PROCESS_PHASES.length) throw new Error(`Ledger missing phases: expected ${WORK_PROCESS_PHASES.length}, found ${forward.length}.`);
  forward.forEach((entry, index) => {
    if (entry.phase !== WORK_PROCESS_PHASES[index]) throw new Error(`Phase order mismatch at index ${index}.`);
  });
  entries.forEach((entry, index) => {
    const recomputed = computeHash(entry, entry.timestamp, entry.sequence, entry.previousHash);
    if (entry.hash !== recomputed) throw new Error(`Hash mismatch at sequence ${entry.sequence}.`);
    if (index === 0 && entry.previousHash !== null) throw new Error('First entry must have null previousHash.');
    if (index > 0 && entry.previousHash !== entries[index - 1].hash) throw new Error(`Ledger chain break before sequence ${entry.sequence}.`);
  });
}

const nextPhase = (current: WorkProcessPhase): WorkProcessPhase | null => WORK_PROCESS_PHASES[phaseIndex(current) + 1] ?? null;
const phaseIndex = (phase: WorkProcessPhase): number => {
  const index = INDEX.get(phase);
  if (index === undefined) throw new Error(`Unknown phase ${phase}.`);
  return index;
};
const toHashPayload = (entry: Partial<LedgerEntry>) => ({
  taskId: entry.taskId,
  phase: entry.phase,
  actorId: entry.actorId,
  evidencePath: entry.evidencePath,
  metadata: entry.metadata ?? null,
  backtrack: entry.backtrack ?? null,
});
const computeHash = (
  input: Partial<LedgerEntry>,
  timestamp: string,
  sequence: number,
  previousHash: string | null,
): string => {
  const payload = { ...toHashPayload(input), timestamp, sequence, previousHash };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};
