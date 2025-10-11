import { promises as fs } from "node:fs";
import path from "node:path";

import { logWarning } from "./logger.js";

export class TelemetryExporter {
  private readonly targetPath: string;
  private directoryEnsured = false;
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds

  constructor(workspaceRoot: string, filename = "operations.jsonl") {
    this.targetPath = path.join(workspaceRoot, "state", "telemetry", filename);
    this.scheduleFlush();
  }

  append(record: Record<string, unknown>): void {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...record,
    });

    this.buffer.push(line);

    // Flush immediately if batch is full
    if (this.buffer.length >= this.BATCH_SIZE) {
      void this.flush();
    }
  }

  private scheduleFlush(): void {
    this.flushInterval = setInterval(() => {
      void this.flush();
    }, this.FLUSH_INTERVAL_MS);
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.buffer.length);
    const content = batch.join('\n') + '\n';

    try {
      await this.ensureDirectory();
      await fs.appendFile(this.targetPath, content, "utf8");
    } catch (error) {
      logWarning("Failed to write telemetry batch", {
        recordCount: batch.length,
        path: this.targetPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  close(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    void this.flush(); // Final flush
  }

  private async ensureDirectory(): Promise<void> {
    if (this.directoryEnsured) return;
    const dir = path.dirname(this.targetPath);
    await fs.mkdir(dir, { recursive: true });
    this.directoryEnsured = true;
  }
}
