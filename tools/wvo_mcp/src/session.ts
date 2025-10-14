import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";

import { AcademicRigorCritic } from "./critics/academic_rigor.js";
import { AllocatorCritic } from "./critics/allocator.js";
import { BuildCritic } from "./critics/build.js";
import { CausalCritic } from "./critics/causal.js";
import { CostPerfCritic } from "./critics/cost_perf.js";
import { DataQualityCritic } from "./critics/data_quality.js";
import { DesignSystemCritic } from "./critics/design_system.js";
import { ExecReviewCritic } from "./critics/exec_review.js";
import { ForecastStitchCritic } from "./critics/forecast_stitch.js";
import { HealthCheckCritic } from "./critics/health_check.js";
import { HumanSyncCritic } from "./critics/human_sync.js";
import { LeakageCritic } from "./critics/leakage.js";
import { ManagerSelfCheckCritic } from "./critics/manager_self_check.js";
import { PromptBudgetCritic } from "./critics/prompt_budget.js";
import { OrgPmCritic } from "./critics/org_pm.js";
import { SecurityCritic } from "./critics/security.js";
import { TestsCritic } from "./critics/tests.js";
import { TypecheckCritic } from "./critics/typecheck.js";
import { FailoverGuardrailCritic } from "./critics/failover_guardrail.js";
import { ProductCompletenessCritic } from "./critics/product_completeness.js";
import { IntegrationFuryCritic } from "./critics/integration_fury.js";
import { NetworkNavigatorCritic } from "./critics/network_navigator.js";
import { runCommand } from "./executor/command_runner.js";
import { readFile, writeFile } from "./executor/file_ops.js";
import { GuardrailViolation } from "./executor/guardrails.js";
import { PlannerEngine } from "./planner/planner_engine.js";
import { AutopilotStore } from "./state/autopilot_store.js";
import { CheckpointStore } from "./state/checkpoint_store.js";
import { ContextStore } from "./state/context_store.js";
import { HeavyTaskQueueStore } from "./state/heavy_queue_store.js";
import { RoadmapStore } from "./state/roadmap_store.js";
import { ArtifactRegistry } from "./telemetry/artifact_registry.js";
import { logError, logInfo, logWarning } from "./telemetry/logger.js";
import { CodexProfile, getCodexProfile, resolveWorkspaceRoot } from "./utils/config.js";
import type {
  AutopilotAuditEntry,
  AutopilotState,
  HeavyTaskQueueItem,
  HeavyTaskUpdateInput,
  PlanNextInput,
  TaskStatus,
} from "./utils/types.js";
import type { OrchestratorRuntime } from "./orchestrator/orchestrator_runtime.js";
import type { StateMachine } from "./orchestrator/state_machine.js";
import {
  buildPlanSummaries,
  legacyStatusToState,
  syncRoadmapFile,
  type LegacyPlanStatus,
} from "./orchestrator/roadmap_adapter.js";

const CRITIC_REGISTRY = {
  build: BuildCritic,
  tests: TestsCritic,
  typecheck: TypecheckCritic,
  security: SecurityCritic,
  design_system: DesignSystemCritic,
  org_pm: OrgPmCritic,
  academic_rigor: AcademicRigorCritic,
  exec_review: ExecReviewCritic,
  data_quality: DataQualityCritic,
  leakage: LeakageCritic,
  causal: CausalCritic,
  forecast_stitch: ForecastStitchCritic,
  allocator: AllocatorCritic,
  cost_perf: CostPerfCritic,
  manager_self_check: ManagerSelfCheckCritic,
  health_check: HealthCheckCritic,
  human_sync: HumanSyncCritic,
  prompt_budget: PromptBudgetCritic,
  failover_guardrail: FailoverGuardrailCritic,
  product_completeness: ProductCompletenessCritic,
  integration_fury: IntegrationFuryCritic,
  network_navigator: NetworkNavigatorCritic,
} as const;

export type CriticKey = keyof typeof CRITIC_REGISTRY;
export const CRITIC_KEYS = Object.keys(CRITIC_REGISTRY) as CriticKey[];

export class SessionContext {
  readonly workspaceRoot: string;
  readonly profile: CodexProfile;

  private readonly roadmapStore: RoadmapStore;
  private readonly contextStore: ContextStore;
  private readonly checkpointStore: CheckpointStore;
  private readonly artifactRegistry: ArtifactRegistry;
  private readonly autopilotStore: AutopilotStore;
  private readonly heavyTaskQueue: HeavyTaskQueueStore;
  private readonly orchestratorRuntime?: OrchestratorRuntime;
  private readonly stateMachine?: StateMachine;
  private lastRoadmapSyncMs = 0;
  private roadmapSyncInFlight = false;
  private roadmapSyncedOnce = false;
  private legacyYamlWarningLogged = false;

  // Cache for plan_next to avoid rebuilding payloads when queue is unchanged
  private planNextCache = new Map<string, { timestamp: number; result: ReturnType<typeof buildPlanSummaries> }>();
  private lastRoadmapChangeMs = Date.now();

  constructor(runtime?: OrchestratorRuntime) {
    this.orchestratorRuntime = runtime;
    this.workspaceRoot = resolveWorkspaceRoot();
    this.profile = getCodexProfile();
    this.roadmapStore = new RoadmapStore(this.workspaceRoot);
    this.contextStore = new ContextStore(this.workspaceRoot);
    this.checkpointStore = new CheckpointStore(this.workspaceRoot);
    this.artifactRegistry = new ArtifactRegistry(this.workspaceRoot);
    this.autopilotStore = new AutopilotStore(this.workspaceRoot);
    this.heavyTaskQueue = new HeavyTaskQueueStore(this.workspaceRoot);
    this.stateMachine = runtime?.getStateMachine();
  }

  /**
   * Lazy-start the orchestrator runtime on first use.
   * This avoids starting timers/event loops that interfere with stdin.
   */
  private ensureRuntimeStarted(): void {
    if (this.orchestratorRuntime && !this.orchestratorRuntime['started']) {
      logInfo("Starting orchestrator runtime on-demand");
      this.orchestratorRuntime.start();
    }
  }

  private get legacyYamlEnabled(): boolean {
    const disabled = process.env.WVO_DISABLE_LEGACY_YAML === "1";
    if (disabled && !this.legacyYamlWarningLogged) {
      logWarning("Legacy roadmap.yaml writes disabled via WVO_DISABLE_LEGACY_YAML=1.");
      this.legacyYamlWarningLogged = true;
    }
    return !disabled;
  }

  private get syncYamlEnabled(): boolean {
    return process.env.WVO_SYNC_YAML_TO_DB !== "0";
  }

  private invalidatePlanCache(): void {
    this.planNextCache.clear();
    this.lastRoadmapChangeMs = Date.now();
  }

  private generateCorrelationId(prefix: string): string {
    return `${prefix}:${randomUUID()}`;
  }

  async planNext(input: PlanNextInput, options?: { correlationId?: string }) {
    const correlationBase = options?.correlationId;
    if (this.stateMachine) {
      if (this.syncYamlEnabled) {
        await this.ensureStateMachineSynced(correlationBase);
      }
      const limit = input.limit ?? 5;

      // Create cache key from filters
      const cacheKey = JSON.stringify(input.filters || {});
      const cached = this.planNextCache.get(cacheKey);

      // Return cached result if roadmap hasn't changed
      if (cached && cached.timestamp >= this.lastRoadmapChangeMs) {
        return cached.result.slice(0, limit);
      }

      // Rebuild and cache
      const summaries = buildPlanSummaries(this.stateMachine, input.filters);
      this.planNextCache.set(cacheKey, {
        timestamp: Date.now(),
        result: summaries
      });
      return summaries.slice(0, limit);
    }

    const roadmap = await this.roadmapStore.read();
    const planner = new PlannerEngine(roadmap);
    return planner.next(input);
  }

  async updatePlanStatus(taskId: string, status: TaskStatus, correlationId?: string) {
    let mutated = false;

    if (this.stateMachine) {
      if (this.syncYamlEnabled) {
        await this.ensureStateMachineSynced(correlationId);
      }
      try {
        const correlation = correlationId ?? this.generateCorrelationId("plan_update");
        const mappedStatus = legacyStatusToState(status as LegacyPlanStatus);
        await this.stateMachine.transition(taskId, mappedStatus, undefined, correlation);
        mutated = true;
      } catch (error) {
        logWarning("Failed to update orchestrator state", {
          taskId,
          status,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (this.legacyYamlEnabled) {
      try {
        await this.roadmapStore.upsertTaskStatus(taskId, status);
        mutated = true;
      } catch (error) {
        logWarning("Failed to update roadmap.yaml", {
          taskId,
          status,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (mutated) {
      this.invalidatePlanCache();
    }
  }

  async writeContext(section: string, content: string, append = false) {
    await this.contextStore.write(section, content, append);
    if (this.stateMachine) {
      try {
        this.stateMachine.addContextEntry({
          entry_type: "learning",
          topic: `Context: ${section}`,
          content,
          metadata: {
            append,
            section,
          },
        });
      } catch (error) {
        logWarning("Failed to record context entry in orchestrator state", {
          section,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async snapshot(notes?: string) {
    await this.checkpointStore.write({
      timestamp: new Date().toISOString(),
      notes,
    });

    if (this.stateMachine) {
      try {
        const health = this.stateMachine.getRoadmapHealth();
        this.stateMachine.createCheckpoint({
          session_id: `manual_snapshot_${Date.now()}`,
          state_snapshot: {
            notes,
            roadmap: health,
          },
          notes,
        });
      } catch (error) {
        logWarning("Failed to write orchestrator checkpoint", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async readFile(relativePath: string) {
    return readFile(this.workspaceRoot, relativePath);
  }

  async writeFile(relativePath: string, content: string) {
    await writeFile(this.workspaceRoot, relativePath, content);
  }

  async runShellCommand(cmd: string) {
    logInfo("Executing shell command", { cmd, profile: this.profile });
    try {
      return await runCommand(cmd, { cwd: this.workspaceRoot });
    } catch (error: unknown) {
      if (error instanceof GuardrailViolation) {
        return {
          code: -1,
          stdout: "",
          stderr: error.message,
        };
      }
      throw error;
    }
  }

  async runCritics(requested?: Array<string | CriticKey>) {
    const candidateKeys = requested?.length ? requested : CRITIC_KEYS;
    const validKeys: CriticKey[] = [];
    const invalidKeys: string[] = [];

    for (const key of candidateKeys) {
      if (CRITIC_REGISTRY[key as CriticKey]) {
        if (!validKeys.includes(key as CriticKey)) {
          validKeys.push(key as CriticKey);
        }
      } else {
        invalidKeys.push(key as string);
      }
    }

    if (invalidKeys.length) {
      logError("Ignoring unknown critics", { invalidKeys });
    }

    const results = [];
    const liveFlags = this.orchestratorRuntime?.getLiveFlags();
    const intelligenceEnabled = liveFlags?.getValue('INTELLIGENT_CRITICS') === '1';
    const intelligenceLevelRaw = liveFlags?.getValue('CRITIC_INTELLIGENCE_LEVEL');
    const intelligenceLevel = Number.isFinite(Number.parseInt(intelligenceLevelRaw ?? '', 10))
      ? Number.parseInt(intelligenceLevelRaw ?? '1', 10)
      : 1;
    const researchManager = intelligenceEnabled ? this.orchestratorRuntime?.getResearchManager() : undefined;
    const escalationConfigPath = path.join(
      this.workspaceRoot,
      'tools',
      'wvo_mcp',
      'config',
      'critic_escalations.json'
    );
    const escalationLogPath = path.join(this.workspaceRoot, 'state', 'escalations.log');
    for (const key of validKeys) {
      const CriticCtor = CRITIC_REGISTRY[key];
      const critic = new CriticCtor(this.workspaceRoot, {
        intelligenceEnabled,
        intelligenceLevel,
        researchManager,
        stateMachine: this.stateMachine,
        escalationConfigPath,
        escalationLogPath,
      });
      try {
        const outcome = await critic.run(this.profile);
        results.push(outcome);
      } catch (error: unknown) {
        logError("Critic execution failed", {
          critic: key,
          error: (error as Error).message,
        });
        results.push({
          critic: key,
          code: -1,
          stdout: "",
          stderr: (error as Error).stack ?? (error as Error).message,
          passed: false,
        });
      }
    }
    return results;
  }

  async recordArtifact(type: string, artifactPath: string, metadata?: Record<string, unknown>) {
    await this.artifactRegistry.record({
      type,
      path: artifactPath,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }

  async recordAutopilotAudit(entry: AutopilotAuditEntry): Promise<AutopilotState> {
    return this.autopilotStore.recordAudit(entry);
  }

  async getAutopilotState(): Promise<AutopilotState> {
    return this.autopilotStore.read();
  }

  async enqueueHeavyTask(input: {
    summary: string;
    command?: string;
    notes?: string;
    id?: string;
  }): Promise<HeavyTaskQueueItem> {
    return this.heavyTaskQueue.enqueue(input);
  }

  async updateHeavyTask(input: HeavyTaskUpdateInput): Promise<HeavyTaskQueueItem | null> {
    return this.heavyTaskQueue.updateStatus(input);
  }

  async listHeavyTasks(): Promise<HeavyTaskQueueItem[]> {
    return this.heavyTaskQueue.list();
  }

  private async ensureStateMachineSynced(correlationBase?: string): Promise<void> {
    if (!this.stateMachine || !this.syncYamlEnabled) {
      return;
    }

    const roadmapPath = path.join(this.workspaceRoot, "state", "roadmap.yaml");
    let mtimeMs = 0;
    try {
      const stats = await fs.stat(roadmapPath);
      mtimeMs = stats.mtimeMs;
    } catch {
      if (!this.roadmapSyncedOnce) {
        await syncRoadmapFile(
          this.stateMachine,
          this.workspaceRoot,
          correlationBase ? { correlationBase } : undefined
        );
        this.invalidatePlanCache();
        this.lastRoadmapSyncMs = Date.now();
        this.roadmapSyncedOnce = true;
      }
      return;
    }

    if (this.roadmapSyncInFlight) {
      return;
    }

    if (this.roadmapSyncedOnce && mtimeMs <= this.lastRoadmapSyncMs) {
      return;
    }

    this.roadmapSyncInFlight = true;
    try {
      await syncRoadmapFile(
        this.stateMachine,
        this.workspaceRoot,
        correlationBase ? { correlationBase } : undefined
      );
      this.lastRoadmapSyncMs = mtimeMs || Date.now();
      this.roadmapSyncedOnce = true;
      this.invalidatePlanCache();
    } finally {
      this.roadmapSyncInFlight = false;
    }
  }
}
