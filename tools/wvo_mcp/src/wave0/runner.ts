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
import YAML from "yaml";
import { resolveStateRoot } from "../utils/config.js";
import { logInfo, logWarning, logError } from "../telemetry/logger.js";
import { TaskExecutor, type Task, type ExecutionResult } from "./task_executor.js";
import { LeaseManager } from "../supervisor/lease_manager.js";
import { LifecycleTelemetry } from "../supervisor/lifecycle_telemetry.js";
import { ProofIntegration } from "../prove/wave0_integration.js";
import { SelfImprovementSystem } from "../prove/self_improvement.js";
import { EvidenceScaffolder } from "./evidence_scaffolder.js";
import type { ProofResult } from "../prove/types.js";

export interface LockStatus {
  locked: boolean;
  stale?: boolean;
  reason?: string;
  pid?: number;
  ageMs?: number;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    if (error?.code === "EPERM") {
      return true;
    }
    return false;
  }
}

export function resolveLockStatus(lockPath: string, ttlMs: number): LockStatus {
  if (!fs.existsSync(lockPath)) {
    return { locked: false, reason: "missing" };
  }

  try {
    const raw = fs.readFileSync(lockPath, "utf-8");
    const data = JSON.parse(raw);
    const pid = typeof data?.pid === "number" ? data.pid : undefined;
    const startTimeMs = data?.startTime ? Date.parse(data.startTime) : NaN;
    const ageMs = Number.isFinite(startTimeMs) ? Date.now() - startTimeMs : Number.POSITIVE_INFINITY;
    const alive = pid !== undefined ? isProcessAlive(pid) : false;
    const stale = !alive || ageMs > ttlMs;

    if (stale) {
      const reason = !alive ? "pid_not_running" : "lock_ttl_expired";
      return { locked: false, stale: true, reason, pid, ageMs };
    }

    return { locked: true, stale: false, reason: "active", pid, ageMs };
  } catch {
    return { locked: false, stale: true, reason: "corrupt_lock" };
  }
}

interface Wave0Options {
  singleRun?: boolean;
  targetEpics?: string[];
}

export class Wave0Runner {
  private workspaceRoot: string;
  private stateRoot: string;
  private lockFile: string;
  private shutdownRequested = false;
  private executor: TaskExecutor;
  private emptyCheckCount = 0;
  private leaseManager: LeaseManager;
  private telemetry: LifecycleTelemetry;
  private proofIntegration: ProofIntegration;
  private selfImprovement: SelfImprovementSystem;
  private rateLimitMs: number;
  private emptyRetryLimit: number;
  private singleRun: boolean;
  private targetEpics: string[] | null;
  private evidenceScaffolder: EvidenceScaffolder;
  private lockTtlMs: number;

  constructor(workspaceRoot: string, options: Wave0Options = {}) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);
    this.lockFile = path.join(this.stateRoot, ".wave0.lock");
    this.executor = new TaskExecutor(workspaceRoot);
    this.leaseManager = new LeaseManager(30 * 60 * 1000); // 30 min TTL
    this.telemetry = new LifecycleTelemetry(workspaceRoot);
    this.proofIntegration = new ProofIntegration(workspaceRoot, `wave0-${Date.now()}`);
    this.selfImprovement = new SelfImprovementSystem(workspaceRoot);
    this.evidenceScaffolder = new EvidenceScaffolder(workspaceRoot);
    this.rateLimitMs = this.resolveRateLimit();
    this.emptyRetryLimit = this.resolveEmptyRetryLimit();
    this.singleRun = this.resolveSingleRun(options);
    this.targetEpics = this.resolveTargetEpics(options);
    this.lockTtlMs = this.resolveLockTtl();
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
          logWarning(
            `Wave0Runner: No pending tasks found (${this.emptyCheckCount}/${this.emptyRetryLimit})`
          );

          if (this.emptyCheckCount >= this.emptyRetryLimit) {
            const minutes = Math.round((this.rateLimitMs * this.emptyRetryLimit) / 60000);
            logInfo(
              `Wave0Runner: No tasks for ${minutes} minute(s), exiting gracefully`
            );
            break;
          }

          // Sleep and retry
          await this.sleep(this.rateLimitMs);
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

          // 7. Run proof system (if enabled)
          let finalStatus: Task["status"];
          let proofOutcome:
            | { phaseStatus: "proven" | "discovering" | "blocked"; proofResult?: ProofResult | null }
            | null = null;
          if (ProofIntegration.isEnabled()) {
            proofOutcome = await this.proofIntegration.processTaskAfterExecution(
              task,
              result.status === "completed" ? "completed" : "failed",
            );
            finalStatus = proofOutcome.phaseStatus === "proven" ? "done" : "blocked";
          } else {
            finalStatus = result.status === "completed" ? "done" : "blocked";
          }

          // Update evidence summary/review/monitor
          if (finalStatus === "done" || finalStatus === "blocked") {
            const proofResult =
              proofOutcome?.proofResult ?? this.proofIntegration.getLastProofResult();
            this.evidenceScaffolder.finalizeTask(task.id, {
              taskTitle: task.title,
              finalStatus,
              proofResult,
              note: ProofIntegration.isEnabled()
                ? undefined
                : "Proof system disabled; manual verification required.",
            });
          }

          // 8. Record execution metadata
          await this.updateExecutionMetadata(task.id, "autopilot", "wave0");

          // 9. Emit task.completed event
          await this.telemetry.emit('task.completed', {
            taskId: task.id,
            metadata: {
              status: finalStatus,
              executionTimeMs: result.executionTimeMs
            }
          });

          // 10. Update final status
          await this.updateTaskStatus(task.id, finalStatus);
        } finally {
          // 10. Release lease (always, even if execution fails)
          await this.leaseManager.releaseLease(task.id);
        }

        // 11. Checkpoint
        await this.checkpoint();

        // 12. Rate limit
        if (this.singleRun) {
          logInfo("Wave0Runner: Single-run mode - exiting after first task.");
          break;
        }

          if (!this.shutdownRequested) {
            logInfo(`Wave0Runner: Rate limiting (${this.rateLimitMs / 1000}s)...`);
            await this.sleep(this.rateLimitMs);
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

    try {
      // Parse YAML properly to handle nested structure
      const content = fs.readFileSync(roadmapPath, "utf-8");
      const roadmap = YAML.parse(content);

      const findPendingTask = (obj: any, context: { epicId?: string } = {}): Task | null => {
        if (!obj) return null;

        let epicId = context.epicId;

        if (obj.milestones && Array.isArray(obj.milestones) && typeof obj.id === "string") {
          epicId = obj.id;
        }

        if (
          obj.id &&
          obj.title &&
          typeof obj.status === "string" &&
          obj.status === "pending" &&
          !Array.isArray(obj.milestones) &&
          !Array.isArray(obj.tasks)
        ) {
          if (this.targetEpics && this.targetEpics.length > 0) {
            if (!epicId || !this.targetEpics.includes(epicId)) {
              return null;
            }
          }

          logInfo("Wave0Runner: Found pending task", { task: { id: obj.id, title: obj.title, epicId } });
          const exitCriteria =
            Array.isArray(obj.exit_criteria)
              ? obj.exit_criteria.map((item: unknown) => String(item))
              : Array.isArray(obj.acceptance)
                ? obj.acceptance.map((item: unknown) => String(item))
                : undefined;
          return {
            id: obj.id,
            title: obj.title,
            status: "pending",
            description: typeof obj.description === "string" ? obj.description : undefined,
            set_id: typeof obj.set_id === "string" ? obj.set_id : undefined,
            dependencies: Array.isArray(obj.dependencies)
              ? obj.dependencies.map((item: unknown) => String(item))
              : undefined,
            exit_criteria: exitCriteria,
            domain: typeof obj.domain === "string" ? obj.domain : undefined,
          };
        }

        // Recursively search nested structures
        if (obj.tasks && Array.isArray(obj.tasks)) {
          for (const task of obj.tasks) {
            const found = findPendingTask(task, { epicId });
            if (found) return found;
          }
        }

        if (obj.milestones && Array.isArray(obj.milestones)) {
          for (const milestone of obj.milestones) {
            const found = findPendingTask(milestone, { epicId });
            if (found) return found;
          }
        }

        if (obj.epics && Array.isArray(obj.epics)) {
          for (const epic of obj.epics) {
            const found = findPendingTask(epic, { epicId: epic?.id ?? epicId });
            if (found) return found;
          }
        }

        // Handle flat arrays at root level
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findPendingTask(item, { epicId });
            if (found) return found;
          }
        }

        return null;
      };

      return findPendingTask(roadmap);
    } catch (error) {
      logError("Wave0Runner: Error parsing roadmap.yaml", { error: String(error) });
      return null;
    }
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
    const status = resolveLockStatus(this.lockFile, this.lockTtlMs);
    if (status.stale === true) {
      await this.removeLock();
      logInfo("Wave0Runner: Removed stale lock file", { reason: status.reason });
      return false;
    }
    return status.locked === true;
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

  private resolveLockTtl(): number {
    const ttl = Number(process.env.WAVE0_LOCK_TTL_MS ?? 30 * 60 * 1000);
    if (Number.isFinite(ttl) && ttl > 0) {
      return ttl;
    }
    return 30 * 60 * 1000;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async updateExecutionMetadata(
    taskId: string,
    mode: "autopilot" | "manual",
    source: string,
  ): Promise<void> {
    try {
      const metadataPath = path.join(this.stateRoot, "evidence", taskId, "metadata.json");
      const metadataDir = path.dirname(metadataPath);
      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
      }

      let metadata: Record<string, unknown> = {};
      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8")) || {};
        } catch (error) {
          logWarning("Wave0Runner: Unable to parse existing metadata.json; overwriting", {
            taskId,
            error: String(error),
          });
        }
      }

      const entry = {
        ...metadata,
        execution_mode: mode,
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedBy: source,
      };

      fs.writeFileSync(metadataPath, JSON.stringify(entry, null, 2), "utf-8");
    } catch (error) {
      logError("Wave0Runner: Failed to record execution metadata", {
        taskId,
        error: String(error),
      });
    }
  }

  private resolveRateLimit(): number {
    const env = process.env.WAVE0_RATE_LIMIT_MS;
    const parsed = env ? Number(env) : NaN;
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    return 5 * 60 * 1000;
  }

  private resolveEmptyRetryLimit(): number {
    const env = process.env.WAVE0_EMPTY_RETRY_LIMIT;
    const parsed = env ? Number(env) : NaN;
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    return 3;
  }

  private resolveSingleRun(options: Wave0Options): boolean {
    if (typeof options.singleRun === "boolean") {
      return options.singleRun;
    }
    return process.env.WAVE0_SINGLE_RUN === "1";
  }

  private resolveTargetEpics(options: Wave0Options): string[] | null {
    if (options.targetEpics && options.targetEpics.length > 0) {
      return options.targetEpics;
    }
    const env = process.env.WAVE0_TARGET_EPICS;
    if (!env) return null;
    const epics = env
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return epics.length > 0 ? epics : null;
  }
}
