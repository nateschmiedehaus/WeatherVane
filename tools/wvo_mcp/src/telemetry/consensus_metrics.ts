import fs from "node:fs/promises";
import path from "node:path";

import type { ConsensusDecision } from "../orchestrator/consensus/consensus_engine.js";
import { resolveStateRoot } from "../utils/config.js";

export interface ConsensusMetricsSnapshot {
  updatedAt: string;
  totalDecisions: number;
  byType: Record<string, number>;
  history: Array<{
    id: string;
    taskId: string;
    type: string;
    timestamp: string;
    quorumSatisfied: boolean;
  }>;
}

function createDefaultSnapshot(): ConsensusMetricsSnapshot {
  return {
    updatedAt: new Date(0).toISOString(),
    totalDecisions: 0,
    byType: {},
    history: [],
  };
}

export class ConsensusTelemetryRecorder {
  private readonly metricsPath: string;

  constructor(private readonly workspaceRoot: string) {
    const stateRoot = resolveStateRoot(workspaceRoot);
    this.metricsPath = path.join(
      stateRoot,
      "analytics",
      "orchestration_metrics.json",
    );
  }

  async recordDecision(decision: ConsensusDecision): Promise<void> {
    await this.ensureDirectory();
    const snapshot = await this.readSnapshot();

    snapshot.totalDecisions += 1;
    snapshot.byType[decision.type] = (snapshot.byType[decision.type] ?? 0) + 1;
    snapshot.history.unshift({
      id: decision.id,
      taskId: decision.taskId,
      type: decision.type,
      timestamp: new Date().toISOString(),
      quorumSatisfied: decision.quorumSatisfied,
    });

    if (snapshot.history.length > 50) {
      snapshot.history.splice(50);
    }

    snapshot.updatedAt = new Date().toISOString();

    await fs.writeFile(this.metricsPath, JSON.stringify(snapshot, null, 2), "utf8");
  }

  private async ensureDirectory(): Promise<void> {
    const dir = path.dirname(this.metricsPath);
    await fs.mkdir(dir, { recursive: true });
  }

  private async readSnapshot(): Promise<ConsensusMetricsSnapshot> {
    try {
      const content = await fs.readFile(this.metricsPath, "utf8");
      const parsed = JSON.parse(content) as ConsensusMetricsSnapshot;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.totalDecisions === "number" &&
        parsed.byType &&
        typeof parsed.byType === "object"
      ) {
        return parsed;
      }
      return createDefaultSnapshot();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return createDefaultSnapshot();
      }
      throw error;
    }
  }
}
