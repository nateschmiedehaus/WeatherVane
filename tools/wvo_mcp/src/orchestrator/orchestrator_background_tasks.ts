import type { StateMachine } from "./state_machine.js";

export type BackgroundTaskType =
  | "entropy_sweep"
  | "doc_ttl_audit"
  | "roadmap_sync"
  | "telemetry_flush";

export interface OrchestratorBackgroundContext {
  stateMachine?: StateMachine;
  workspaceRoot: string;
}

export interface BackgroundTaskResult {
  findings: string[];
  actions: string[];
  duration: number;
}

const TASK_SEQUENCE: BackgroundTaskType[] = [
  "entropy_sweep",
  "doc_ttl_audit",
  "roadmap_sync",
  "telemetry_flush",
];

let pointer = 0;

export function getNextBackgroundTask(): BackgroundTaskType {
  const task = TASK_SEQUENCE[pointer % TASK_SEQUENCE.length];
  pointer = (pointer + 1) % TASK_SEQUENCE.length;
  return task;
}

export function getBackgroundTaskAsTask(task: BackgroundTaskType): {
  id: string;
  title: string;
  description: string;
  status: "in_progress";
} {
  const title = {
    entropy_sweep: "Entropy Trend Sweep",
    doc_ttl_audit: "Documentation TTL Audit",
    roadmap_sync: "Roadmap Health Sync",
    telemetry_flush: "Telemetry Flush",
  }[task];

  return {
    id: `AUTO-${task}`,
    title,
    description: `Automated upkeep task: ${title}`,
    status: "in_progress",
  };
}

export async function executeBackgroundTask(
  task: BackgroundTaskType,
  _context: OrchestratorBackgroundContext,
): Promise<BackgroundTaskResult> {
  // The bootstrap implementation simply records an empty run so the orchestrator can continue working.
  const start = Date.now();
  return {
    findings: [],
    actions: [`${task} executed (placeholder implementation)`],
    duration: Date.now() - start,
  };
}
