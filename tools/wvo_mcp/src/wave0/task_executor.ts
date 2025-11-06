/**
 * Wave 0 Task Executor
 *
 * Executes a single task end-to-end:
 * - Create evidence bundle
 * - Execute task (placeholder for now - will integrate MCP tools)
 * - Log execution metrics
 * - Handle errors gracefully
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateRoot } from "../utils/config.js";
import { logInfo, logError } from "../telemetry/logger.js";

export interface Task {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done" | "blocked";
}

export interface ExecutionResult {
  taskId: string;
  status: "completed" | "blocked" | "error";
  startTime: Date;
  endTime: Date;
  executionTimeMs: number;
  error?: string;
}

export class TaskExecutor {
  private workspaceRoot: string;
  private stateRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);
  }

  async execute(task: Task): Promise<ExecutionResult> {
    const startTime = new Date();
    logInfo(`TaskExecutor: Starting task ${task.id}`, { taskId: task.id });

    try {
      // Create evidence bundle
      await this.createEvidenceBundle(task.id);

      // Execute task (placeholder - actual execution would call MCP tools)
      // For Wave 0: just create summary documenting that task was attempted
      await this.executeTask(task);

      // Success
      const endTime = new Date();
      const result: ExecutionResult = {
        taskId: task.id,
        status: "completed",
        startTime,
        endTime,
        executionTimeMs: endTime.getTime() - startTime.getTime(),
      };

      await this.logExecution(result);
      logInfo(`TaskExecutor: Task completed ${task.id}`, { result });

      return result;
    } catch (error) {
      // Handle errors gracefully
      const endTime = new Date();
      const result: ExecutionResult = {
        taskId: task.id,
        status: "error",
        startTime,
        endTime,
        executionTimeMs: endTime.getTime() - startTime.getTime(),
        error: error instanceof Error ? error.message : String(error),
      };

      await this.logExecution(result);
      logError(`TaskExecutor: Task failed ${task.id}`, { error, result });

      return result;
    }
  }

  private async createEvidenceBundle(taskId: string): Promise<void> {
    const evidencePath = path.join(this.stateRoot, "evidence", taskId);

    // Create directory if it doesn't exist
    if (!fs.existsSync(evidencePath)) {
      fs.mkdirSync(evidencePath, { recursive: true });
      logInfo(`TaskExecutor: Created evidence bundle`, { evidencePath });
    }
  }

  private async executeTask(task: Task): Promise<void> {
    // Placeholder for actual task execution
    // In Wave 0, we just create a summary file
    const summaryPath = path.join(
      this.stateRoot,
      "evidence",
      task.id,
      "summary.md"
    );

    const summary = `# Task Execution Summary

**Task ID:** ${task.id}
**Task Title:** ${task.title}
**Executed by:** Wave 0 Autopilot
**Timestamp:** ${new Date().toISOString()}

**Status:** ${task.status}

**Note:** Wave 0 is minimal autopilot. This task was selected and evidence bundle created.
Full task execution will be implemented in future waves based on learnings.
`;

    fs.writeFileSync(summaryPath, summary, "utf-8");
  }

  private async logExecution(result: ExecutionResult): Promise<void> {
    const logPath = path.join(this.stateRoot, "analytics", "wave0_runs.jsonl");

    // Ensure directory exists
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append to JSONL log
    const logEntry = {
      ...result,
      timestamp: new Date().toISOString(),
    };

    fs.appendFileSync(logPath, JSON.stringify(logEntry) + "\n", "utf-8");
  }
}
