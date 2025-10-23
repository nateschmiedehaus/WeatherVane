import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  HeavyTaskQueueItem,
  HeavyTaskStatus,
  HeavyTaskUpdateInput,
} from "../utils/types.js";

const DEFAULT_QUEUE: HeavyTaskQueueItem[] = [];

export class HeavyTaskQueueStore {
  private readonly filePath: string;

  constructor(private readonly stateRoot: string) {
    this.filePath = path.join(this.stateRoot, "heavy_queue.json");
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  private async readRaw(): Promise<HeavyTaskQueueItem[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as HeavyTaskQueueItem[] | null;
      if (!Array.isArray(parsed)) {
        return [...DEFAULT_QUEUE];
      }
      return parsed;
    } catch {
      return [...DEFAULT_QUEUE];
    }
  }

  private async write(queue: HeavyTaskQueueItem[]): Promise<void> {
    await this.ensureDirectory();
    await fs.writeFile(this.filePath, JSON.stringify(queue, null, 2), "utf-8");
  }

  async list(): Promise<HeavyTaskQueueItem[]> {
    return this.readRaw();
  }

  async enqueue(input: {
    summary: string;
    command?: string;
    notes?: string;
    id?: string;
    status?: HeavyTaskStatus;
  }): Promise<HeavyTaskQueueItem> {
    const queue = await this.readRaw();
    const now = new Date().toISOString();
    const item: HeavyTaskQueueItem = {
      id: input.id ?? randomUUID(),
      summary: input.summary,
      command: input.command,
      notes: input.notes,
      status: input.status ?? "queued",
      priority: "normal", // Default priority for legacy heavy_queue.json
      created_at: now,
      updated_at: now,
    };
    queue.push(item);
    await this.write(queue);
    return item;
  }

  async updateStatus(update: HeavyTaskUpdateInput): Promise<HeavyTaskQueueItem | null> {
    const queue = await this.readRaw();
    const index = queue.findIndex((item) => item.id === update.id);
    if (index === -1) {
      return null;
    }
    const current = queue[index];
    const next: HeavyTaskQueueItem = {
      ...current,
      status: update.status ?? current.status,
      notes: update.notes ?? current.notes,
      command: update.command ?? current.command,
      updated_at: new Date().toISOString(),
    };
    queue[index] = next;
    await this.write(queue);
    return next;
  }
}
