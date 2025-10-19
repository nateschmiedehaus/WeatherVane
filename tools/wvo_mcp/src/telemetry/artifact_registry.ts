import fs from "node:fs/promises";
import path from "node:path";

interface ArtifactRecord {
  type: string;
  path: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export class ArtifactRegistry {
  constructor(private readonly stateRoot: string) {}

  private get filePath(): string {
    return path.join(this.stateRoot, "artifacts.log.jsonl");
  }

  async record(entry: ArtifactRecord): Promise<void> {
    const payload = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(payload)}\n`, "utf8");
  }
}
