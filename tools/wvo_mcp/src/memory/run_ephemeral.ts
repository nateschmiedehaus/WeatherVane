type AgentMemory = Map<string, Map<string, MemoryEntry>>;

interface MemoryEntry {
  value: unknown;
  updatedAt: number;
}

interface TaskRecord {
  slots: Map<string, MemoryEntryMap>;
  expiresAt: number;
}

type MemoryEntryMap = Map<string, MemoryEntry>;

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export class RunEphemeralMemory {
  private readonly tasks = new Map<string, TaskRecord>();

  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  set(taskId: string, agentId: string, key: string, value: unknown): void {
    this.pruneExpired();
    const record = this.getOrCreateTask(taskId);
    const agentSlot = this.getOrCreateAgentSlot(record.slots, agentId);
    agentSlot.set(key, {
      value,
      updatedAt: Date.now(),
    });
    record.expiresAt = Date.now() + this.ttlMs;
  }

  get<T>(taskId: string, agentId: string, key: string): T | undefined {
    this.pruneExpired();
    const record = this.tasks.get(taskId);
    if (!record) return undefined;
    const agentSlot = record.slots.get(agentId);
    return agentSlot?.get(key)?.value as T | undefined;
  }

  clearTask(taskId: string): void {
    this.tasks.delete(taskId);
  }

  private getOrCreateTask(taskId: string): TaskRecord {
    let record = this.tasks.get(taskId);
    if (!record) {
      record = {
        slots: new Map(),
        expiresAt: Date.now() + this.ttlMs,
      };
      this.tasks.set(taskId, record);
    }
    return record;
  }

  private getOrCreateAgentSlot(slots: AgentMemory, agentId: string): MemoryEntryMap {
    let agentSlot = slots.get(agentId);
    if (!agentSlot) {
      agentSlot = new Map();
      slots.set(agentId, agentSlot);
    }
    return agentSlot;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [taskId, record] of this.tasks.entries()) {
      if (record.expiresAt <= now) {
        this.tasks.delete(taskId);
      }
    }
  }
}
