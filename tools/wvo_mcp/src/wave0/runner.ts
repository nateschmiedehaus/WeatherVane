/**
 * Wave 0 Autopilot Runner
 *
 * Minimal viable autonomous loop:
 * 1. Load next pending task
 * 2. Execute task
 * 3. Update status
 * 4. Checkpoint state
 * 5. Rate limit (sleep 5 min)
 * 6. Repeat
 *
 * Handles:
 * - Graceful shutdown (SIGTERM/SIGINT)
 * - File locking (prevent concurrent runs)
 * - Error recovery
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateRoot } from "../utils/config.js";
import { logInfo, logWarning, logError } from "../telemetry/logger.js";
import { TaskExecutor, type Task, type ExecutionResult } from "./task_executor.js";
import { LeaseManager } from "../supervisor/lease_manager.js";
import { LifecycleTelemetry } from "../supervisor/lifecycle_telemetry.js";

const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
const EMPTY_RETRY_LIMIT = 3; // Exit after 3 consecutive empty checks

export class Wave0Runner {
  private workspaceRoot: string;
  private stateRoot: string;
  private lockFile: string;
  private shutdownRequested = false;
  private executor: TaskExecutor;
  private emptyCheckCount = 0;
  private leaseManager: LeaseManager;
  private telemetry: LifecycleTelemetry;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);
    this.lockFile = path.join(this.stateRoot, ".wave0.lock");
    this.executor = new TaskExecutor(workspaceRoot);
    this.leaseManager = new LeaseManager(30 * 60 * 1000); // 30 min TTL
    this.telemetry = new LifecycleTelemetry(workspaceRoot);
  }

  async run(): Promise<void> {
    logInfo("Wave0Runner: Starting Wave 0 Autopilot");

    // Check for existing lock (prevent concurrent runs)
    if (await this.checkLock()) {
      logError("Wave0Runner: Another instance is already running (lock file exists)");
      throw new Error("Wave 0 already running. Check .wave0.lock file.");
    }

    // Create lock file
    await this.createLock();

    // Setup signal handlers
    this.setupSignalHandlers();

    try {
      // Main loop
      await this.mainLoop();
    } finally {
      // Always cleanup
      await this.removeLock();
      logInfo("Wave0Runner: Shutdown complete");
    }
  }

  private async mainLoop(): Promise<void> {
    logInfo("Wave0Runner: Entering main loop");

    while (!this.shutdownRequested) {
      try {
        // 1. Get next task
        const task = await this.getNextTask();

        if (!task) {
          // No tasks available
          this.emptyCheckCount++;
          logWarning(`Wave0Runner: No pending tasks found (${this.emptyCheckCount}/${EMPTY_RETRY_LIMIT})`);

          if (this.emptyCheckCount >= EMPTY_RETRY_LIMIT) {
            logInfo("Wave0Runner: No tasks for 15 minutes, exiting gracefully");
            break;
          }

          // Sleep and retry
          await this.sleep(RATE_LIMIT_MS);
          continue;
        }

        // 2. Acquire lease (prevent concurrent execution)
        const leaseAcquired = await this.leaseManager.acquireLease(task.id);
        if (!leaseAcquired) {
          logWarning(`Wave0Runner: Lease already held for ${task.id}, skipping`);
          continue;
        }

        try {
          // 3. Emit task.selected event
          await this.telemetry.emit('task.selected', {
            taskId: task.id,
            reason: 'highest priority pending task',
            metadata: { title: task.title }
          });

          // Reset empty counter
          this.emptyCheckCount = 0;

          // 4. Update status to in_progress + emit task.assigned
          await this.updateTaskStatus(task.id, "in_progress");
          await this.telemetry.emit('task.assigned', {
            taskId: task.id
          });

          // 5. Emit task.started event
          await this.telemetry.emit('task.started', {
            taskId: task.id
          });

          // 6. Execute task
          const result = await this.executor.execute(task);

          // 7. Emit task.completed event
          await this.telemetry.emit('task.completed', {
            taskId: task.id,
            metadata: {
              status: result.status,
              executionTimeMs: result.executionTimeMs
            }
          });

          // 8. Update final status based on result
          const finalStatus = result.status === "completed" ? "done" : "blocked";
          await this.updateTaskStatus(task.id, finalStatus);
        } finally {
          // 9. Release lease (always, even if execution fails)
          await this.leaseManager.releaseLease(task.id);
        }

        // 10. Checkpoint
        await this.checkpoint();

        // 11. Rate limit
        if (!this.shutdownRequested) {
          logInfo(`Wave0Runner: Rate limiting (${RATE_LIMIT_MS / 1000}s)...`);
          await this.sleep(RATE_LIMIT_MS);
        }
      } catch (error) {
        logError("Wave0Runner: Error in main loop", { error });
        // Continue to next iteration (don't crash)
      }
    }

    logInfo("Wave0Runner: Exiting main loop");
  }

  private async getNextTask(): Promise<Task | null> {
    // Read roadmap.yaml
    const roadmapPath = path.join(this.stateRoot, "roadmap.yaml");

    if (!fs.existsSync(roadmapPath)) {
      logWarning("Wave0Runner: roadmap.yaml not found");
      return null;
    }

    // For Wave 0: Simple line-by-line parsing (not full YAML parser)
    // Look for lines like: "- id: T1.2.3" followed by "status: pending"
    const content = fs.readFileSync(roadmapPath, "utf-8");
    const lines = content.split("\n");

    let currentTask: Partial<Task> | null = null;

    for (const line of lines) {
      // Match task ID
      const idMatch = line.match(/^\s*-?\s*id:\s*["']?([^"'\s]+)["']?/);
      if (idMatch) {
        currentTask = { id: idMatch[1] };
        continue;
      }

      // Match title (if we have a current task)
      if (currentTask && !currentTask.title) {
        const titleMatch = line.match(/^\s*title:\s*["']?(.+?)["']?\s*$/);
        if (titleMatch) {
          currentTask.title = titleMatch[1];
          continue;
        }
      }

      // Match status (if we have a current task)
      if (currentTask && !currentTask.status) {
        const statusMatch = line.match(/^\s*status:\s*["']?(\w+)["']?/);
        if (statusMatch) {
          currentTask.status = statusMatch[1] as Task["status"];

          // If pending, return this task
          if (currentTask.status === "pending" && currentTask.id && currentTask.title) {
            logInfo("Wave0Runner: Found pending task", { task: currentTask });
            return currentTask as Task;
          }

          // Reset for next task
          currentTask = null;
        }
      }
    }

    return null;
  }

  private async updateTaskStatus(taskId: string, status: Task["status"]): Promise<void> {
    logInfo(`Wave0Runner: Updating task ${taskId} status to ${status}`);

    // For Wave 0: Simple find-and-replace in roadmap.yaml
    // In future waves, use proper YAML library
    const roadmapPath = path.join(this.stateRoot, "roadmap.yaml");
    let content = fs.readFileSync(roadmapPath, "utf-8");

    // Find task section and update status
    const taskPattern = new RegExp(
      `(id:\\s*["']?${taskId}["']?[\\s\\S]*?status:\\s*["']?)\\w+(["']?)`,
      "i"
    );

    if (taskPattern.test(content)) {
      content = content.replace(taskPattern, `$1${status}$2`);
      fs.writeFileSync(roadmapPath, content, "utf-8");
      logInfo(`Wave0Runner: Updated task ${taskId} to ${status}`);
    } else {
      logWarning(`Wave0Runner: Could not find task ${taskId} in roadmap`);
    }
  }

  private async checkpoint(): Promise<void> {
    logInfo("Wave0Runner: Checkpointing state");
    // For Wave 0: No explicit checkpoint file needed
    // State is in roadmap.yaml and analytics logs
  }

  private setupSignalHandlers(): void {
    const handleShutdown = (signal: string) => {
      logInfo(`Wave0Runner: Received ${signal}, shutting down gracefully...`);
      this.shutdownRequested = true;
    };

    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    process.on("SIGINT", () => handleShutdown("SIGINT"));
  }

  private async checkLock(): Promise<boolean> {
    return fs.existsSync(this.lockFile);
  }

  private async createLock(): Promise<void> {
    const lockData = {
      pid: process.pid,
      startTime: new Date().toISOString(),
    };
    fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2), "utf-8");
    logInfo("Wave0Runner: Created lock file", { lockData });
  }

  private async removeLock(): Promise<void> {
    if (fs.existsSync(this.lockFile)) {
      fs.unlinkSync(this.lockFile);
      logInfo("Wave0Runner: Removed lock file");
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
