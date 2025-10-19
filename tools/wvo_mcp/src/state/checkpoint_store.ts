import fs from "node:fs/promises";
import path from "node:path";

interface Checkpoint {
  timestamp: string;
  active_task?: string;
  notes?: string;
  [key: string]: unknown;
}

export class CheckpointStore {
  constructor(private readonly stateRoot: string) {}

  private get filePath(): string {
    return path.join(this.stateRoot, "checkpoint.json");
  }

  async read(): Promise<Checkpoint | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      if (!raw.trim()) {
        return null;
      }
      return JSON.parse(raw) as Checkpoint;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async write(payload: Checkpoint): Promise<void> {
    const nextPayload = {
      ...payload,
      timestamp: new Date().toISOString(),
    };
    await fs.writeFile(this.filePath, JSON.stringify(nextPayload, null, 2), "utf8");
  }
}
