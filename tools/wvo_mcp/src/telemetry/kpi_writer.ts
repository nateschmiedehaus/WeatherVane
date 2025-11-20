import fs from "node:fs";
import path from "node:path";

const DEFAULT_PATH = path.join(
  process.cwd(),
  "state",
  "analytics",
  "phase_kpis.jsonl"
);

export interface KpiEntry {
  timestamp: number;
  phase: string;
  taskId?: string;
  durationMs?: number;
  mcpCalls?: number;
  metadata?: Record<string, unknown>;
}

export function writeKpi(entry: KpiEntry, filePath: string = DEFAULT_PATH): void {
  const line = JSON.stringify(entry);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${line}\n`, { encoding: "utf-8" });
}

// Backwards compatibility wrapper for phase execution manager
export async function writePhaseKpis(
  workspaceRoot: string,
  taskId: string,
  phase: string,
  metrics: Record<string, unknown>
): Promise<void> {
  const analyticsDir = path.join(workspaceRoot, "state", "analytics");
  const logPath = path.join(analyticsDir, "phase_kpis.jsonl");
  fs.mkdirSync(analyticsDir, { recursive: true });

  const entry = {
    timestamp: new Date().toISOString(),
    task_id: taskId,
    phase,
    ...metrics,
  };

  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}
