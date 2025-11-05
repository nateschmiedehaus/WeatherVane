import { promises as fs } from "node:fs";
import path from "node:path";

import type { Task } from "../orchestrator/state_machine.js";
import type { ExecutionOutcome } from "../orchestrator/agent_pool.js";
import type { QualityCheckResult } from "../orchestrator/quality_monitor.js";
import type { ExecutionSummary } from "../orchestrator/agent_coordinator.js";
import type { AssembledContext } from "../orchestrator/context_assembler.js";
import type { GuardrailAdjustment } from "./task_outcome_logger.js";
import { appendJsonlRecord } from "./jsonl.js";
import { resolveStateRoot } from "../utils/config.js";
import { logWarning } from "../telemetry/logger.js";

export type FeedbackQuality = "high" | "medium" | "low";

export interface FeedbackLoopRecord {
  loop_id: string;
  task_id: string;
  loop_opened_timestamp: string;
  loop_closed_timestamp: string | null;
  loop_duration_hours: number | null;
  loop_closed: boolean;
  loop_quality: FeedbackQuality | null;
  input: string;
  process: string;
  output: string;
  feedback: string;
  adaptation: string;
  iterations_to_close: number;
  adjustments_made: number;
  follow_up_tasks: string[];
}

interface LoopState {
  loopId: string;
  taskId: string;
  openedAt: number;
  iterations: number;
  adjustments: number;
  followUps: string[];
  input: string;
}

export interface OpenLoopOptions {
  inputOverride?: string;
  followUps?: string[];
}

export interface CloseLoopOptions {
  task: Task;
  execution: ExecutionOutcome;
  summary: ExecutionSummary;
  quality: QualityCheckResult;
  context: AssembledContext;
  guardrailAdjustments?: GuardrailAdjustment[];
  criticIssues?: string[];
}

const FEEDBACK_RELATIVE_PATH = path.join("analytics", "feedback_loops.jsonl");

export class FeedbackTracker {
  private readonly workspaceRoot: string;
  private readonly filePath: string;
  private hydrationPromise: Promise<void> | null = null;
  private readonly openLoopsByTask = new Map<string, LoopState>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.filePath = path.join(resolveStateRoot(workspaceRoot), FEEDBACK_RELATIVE_PATH);
  }

  async openFeedbackLoop(task: Task, options: OpenLoopOptions = {}): Promise<string> {
    await this.ensureHydrated();
    if (this.openLoopsByTask.has(task.id)) {
      return this.openLoopsByTask.get(task.id)!.loopId;
    }

    const loopId = `${task.id}-${Date.now()}`;
    const openedAt = Date.now();
    const followUps = deriveFollowUps(task, options.followUps);
    const input = options.inputOverride ?? deriveInput(task);

    this.openLoopsByTask.set(task.id, {
      loopId,
      taskId: task.id,
      openedAt,
      iterations: 0,
      adjustments: 0,
      followUps,
      input,
    });

    const record: FeedbackLoopRecord = {
      loop_id: loopId,
      task_id: task.id,
      loop_opened_timestamp: new Date(openedAt).toISOString(),
      loop_closed_timestamp: null,
      loop_duration_hours: null,
      loop_closed: false,
      loop_quality: null,
      input,
      process: "",
      output: "",
      feedback: "",
      adaptation: "",
      iterations_to_close: 0,
      adjustments_made: 0,
      follow_up_tasks: followUps,
    };

    await appendJsonlRecord(record, {
      workspaceRoot: this.workspaceRoot,
      relativePath: FEEDBACK_RELATIVE_PATH,
    });

    return loopId;
  }

  async markIteration(taskId: string): Promise<void> {
    await this.ensureHydrated();
    const state = this.openLoopsByTask.get(taskId);
    if (!state) {
      return;
    }
    state.iterations += 1;
  }

  async closeFeedbackLoop(options: CloseLoopOptions): Promise<void> {
    await this.ensureHydrated();
    const { task } = options;
    const state = this.openLoopsByTask.get(task.id);
    if (!state) {
      // Loop might have been closed previously or never opened (e.g., manual tasks)
      return;
    }

    const closedAt = Date.now();
    const durationHours = Number(((closedAt - state.openedAt) / 3_600_000).toFixed(2));
    const adjustments =
      options.guardrailAdjustments?.length ??
      state.adjustments;
    const followUps = deriveFollowUps(task, state.followUps);

    const record: FeedbackLoopRecord = {
      loop_id: state.loopId,
      task_id: task.id,
      loop_opened_timestamp: new Date(state.openedAt).toISOString(),
      loop_closed_timestamp: new Date(closedAt).toISOString(),
      loop_duration_hours: durationHours,
      loop_closed: true,
      loop_quality: computeLoopQualityValue({
        success: options.summary.success,
        durationHours,
        iterations: state.iterations,
        qualityScore: options.quality.score ?? null,
        issues: [...(options.quality.issues ?? []), ...(options.criticIssues ?? [])],
      }),
      input: state.input,
      process: deriveProcess(options.context, task),
      output: deriveOutput(options.summary, options.execution),
      feedback: deriveFeedback(options.quality, options.criticIssues),
      adaptation: deriveAdaptation(task, followUps),
      iterations_to_close: state.iterations,
      adjustments_made: adjustments,
      follow_up_tasks: followUps,
    };

    await appendJsonlRecord(record, {
      workspaceRoot: this.workspaceRoot,
      relativePath: FEEDBACK_RELATIVE_PATH,
    });

    this.openLoopsByTask.delete(task.id);
  }

  async computeDensity(): Promise<number> {
    const records = await readFeedbackLoops(this.workspaceRoot);
    return computeFeedbackDensity(records);
  }

  private async ensureHydrated(): Promise<void> {
    if (!this.hydrationPromise) {
      this.hydrationPromise = this.hydrateFromDisk();
    }
    try {
      await this.hydrationPromise;
    } catch (error) {
      logWarning("Failed to hydrate feedback tracker", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Prevent repeated attempts on every call.
      this.hydrationPromise = Promise.resolve();
    }
  }

  private async hydrateFromDisk(): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }

    const records = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as FeedbackLoopRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is FeedbackLoopRecord => Boolean(record));

    const lastRecordByLoop = new Map<string, FeedbackLoopRecord>();
    for (const record of records) {
      lastRecordByLoop.set(record.loop_id, record);
    }

    for (const record of lastRecordByLoop.values()) {
      if (!record.loop_closed) {
        this.openLoopsByTask.set(record.task_id, {
          loopId: record.loop_id,
          taskId: record.task_id,
          openedAt: Date.parse(record.loop_opened_timestamp),
          iterations: record.iterations_to_close,
          adjustments: record.adjustments_made,
          followUps: record.follow_up_tasks ?? [],
          input: record.input ?? deriveInput({ description: "", metadata: {} } as Task),
        });
      }
    }
  }
}

export async function readFeedbackLoops(
  workspaceRoot: string,
): Promise<FeedbackLoopRecord[]> {
  const filePath = path.join(resolveStateRoot(workspaceRoot), FEEDBACK_RELATIVE_PATH);
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as FeedbackLoopRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is FeedbackLoopRecord => Boolean(record));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function computeFeedbackDensity(records: FeedbackLoopRecord[]): number {
  if (records.length === 0) {
    return 0;
  }
  const latestByLoop = new Map<string, FeedbackLoopRecord>();
  for (const record of records) {
    latestByLoop.set(record.loop_id, record);
  }
  const latestRecords = Array.from(latestByLoop.values());
  const totalLoops = latestRecords.length;
  const closedLoops = latestRecords.filter((record) => record.loop_closed).length;
  return totalLoops === 0 ? 0 : closedLoops / totalLoops;
}

function computeLoopQualityValue(input: {
  success: boolean;
  durationHours: number | null;
  iterations: number;
  qualityScore: number | null;
  issues: string[];
}): FeedbackQuality {
  if (!input.success) {
    return "low";
  }
  if (input.iterations >= 3) {
    return "low";
  }
  const duration = input.durationHours ?? 0;
  const issueCount = input.issues.length;
  if (duration <= 24 && input.iterations === 0 && issueCount === 0) {
    return "high";
  }
  if (duration > 48 || issueCount >= 3) {
    return "low";
  }
  return "medium";
}

function deriveInput(task: Task): string {
  const metadata = (task.metadata ?? {}) as Record<string, unknown>;
  const input = metadata.input ?? metadata.problem_statement ?? task.description;
  if (typeof input === "string" && input.trim().length > 0) {
    return input.trim();
  }
  return `Task ${task.id} (${task.title ?? "untitled"})`;
}

function deriveFollowUps(task: Task, overrides?: string[]): string[] {
  if (Array.isArray(overrides) && overrides.length > 0) {
    return Array.from(new Set(overrides));
  }
  const metadata = (task.metadata ?? {}) as Record<string, unknown>;
  const followUps = metadata.follow_up_tasks;
  if (Array.isArray(followUps)) {
    return Array.from(
      new Set(
        followUps
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim()),
      ),
    );
  }
  return [];
}

function deriveProcess(context: AssembledContext, task: Task): string {
  if (Array.isArray(context.relevantDecisions) && context.relevantDecisions.length > 0) {
    return context.relevantDecisions
      .map((decision) => `• ${decision.topic}: ${decision.content}`)
      .join("\n");
  }
  const metadata = (task.metadata ?? {}) as Record<string, unknown>;
  if (typeof metadata.process_summary === "string") {
    return metadata.process_summary;
  }
  return "Automated implementation via agent workflow.";
}

function deriveOutput(summary: ExecutionSummary, execution: ExecutionOutcome): string {
  if (summary.success) {
    return execution.output ?? "Task completed successfully.";
  }
  return execution.error ?? "Task failed; see logs for details.";
}

function deriveFeedback(quality: QualityCheckResult, criticIssues?: string[]): string {
  const issues = new Set<string>();
  for (const issue of quality.issues ?? []) {
    if (typeof issue === "string" && issue.trim().length > 0) {
      issues.add(issue.trim());
    }
  }
  for (const issue of criticIssues ?? []) {
    if (typeof issue === "string" && issue.trim().length > 0) {
      issues.add(issue.trim());
    }
  }
  if (issues.size === 0) {
    return "No significant feedback; loop considered healthy.";
  }
  return Array.from(issues)
    .map((issue) => `• ${issue}`)
    .join("\n");
}

function deriveAdaptation(task: Task, followUps: string[]): string {
  const metadata = (task.metadata ?? {}) as Record<string, unknown>;
  if (typeof metadata.adaptation === "string" && metadata.adaptation.trim().length > 0) {
    return metadata.adaptation.trim();
  }
  if (followUps.length > 0) {
    return `Follow-up tasks scheduled: ${followUps.join(", ")}`;
  }
  return "No adaptation required beyond current task.";
}
