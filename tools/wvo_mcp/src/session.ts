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
import { ExperienceFlowCritic } from "./critics/experience_flow.js";
import { WeatherAestheticCritic } from "./critics/weather_aesthetic.js";
import { WeatherCoverageCritic } from "./critics/weather_coverage.js";
import { MotionDesignCritic } from "./critics/motion_design.js";
import { ResponsiveSurfaceCritic } from "./critics/responsive_surface.js";
import { InspirationCoverageCritic } from "./critics/inspiration_coverage.js";
import { StakeholderNarrativeCritic } from "./critics/stakeholder_narrative.js";
import { DemoConversionCritic } from "./critics/demo_conversion.js";
import { IntegrationCompletenessCritic } from "./critics/integration_completeness.js";
import { ModelingRealityCritic, ModelingRealityV2OrchestratorCritic } from "./critics/modeling_reality.js";
import { MetaCritiqueCritic } from "./critics/meta_critique.js";
import { MLTaskMetaCriticCritic } from "./critics/ml_task_meta_critic.js";
import { ModelingDataWatchCritic } from "./critics/modeling_data_watch.js";
import { runCommand } from "./executor/command_runner.js";
import { readFile, writeFile } from "./executor/file_ops.js";
import { GuardrailViolation } from "./executor/guardrails.js";
import type { CriticResult, CriticIdentityProfile } from "./critics/base.js";
import { PlannerEngine } from "./planner/planner_engine.js";
import { ensureNoCriticBlocking } from "./orchestrator/critic_availability_guardian.js";
import { AutopilotStore } from "./state/autopilot_store.js";
import { CheckpointStore } from "./state/checkpoint_store.js";
import { ContextStore } from "./state/context_store.js";
import { HeavyTaskQueueStore } from "./state/heavy_queue_store.js";
import { PriorityQueueStore } from "./state/priority_queue_store.js";
import { PriorityQueueDispatcher } from "./orchestrator/priority_queue_dispatcher.js";
import { RoadmapStore } from "./state/roadmap_store.js";
import { ArtifactRegistry } from "./telemetry/artifact_registry.js";
import { logError, logInfo, logWarning } from "./telemetry/logger.js";
import { CodexProfile, getCodexProfile, resolveStateRoot, resolveWorkspaceRoot } from "./utils/config.js";
import { createDryRunError, isDryRunEnabled } from "./utils/dry_run.js";
import type {
  AutopilotAuditEntry,
  AutopilotState,
  HeavyTaskQueueItem,
  HeavyTaskUpdateInput,
  PlanNextInput,
  TaskPriority,
  TaskStatus as LegacyTaskStatus,
} from "./utils/types.js";
import type { OrchestratorRuntime } from "./orchestrator/orchestrator_runtime.js";
import type {
  StateMachine,
  Task,
  TaskStatus as OrchestratorTaskStatus,
  CriticHistoryRecord,
} from "./orchestrator/state_machine.js";
import {
  buildPlanSummaries,
  syncRoadmapFile,
  toLegacyStatus,
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
  experience_flow: ExperienceFlowCritic,
  weather_aesthetic: WeatherAestheticCritic,
  weather_coverage: WeatherCoverageCritic,
  motion_design: MotionDesignCritic,
  responsive_surface: ResponsiveSurfaceCritic,
  inspiration_coverage: InspirationCoverageCritic,
  stakeholder_narrative: StakeholderNarrativeCritic,
  demo_conversion: DemoConversionCritic,
  integration_completeness: IntegrationCompletenessCritic,
  modeling_reality: ModelingRealityCritic,
  modeling_reality_v2: ModelingRealityV2OrchestratorCritic,
  modeling_data_watch: ModelingDataWatchCritic,
  meta_critique: MetaCritiqueCritic,
  ml_task_meta: MLTaskMetaCriticCritic,
} as const;

export type CriticKey = keyof typeof CRITIC_REGISTRY;
export const CRITIC_KEYS = Object.keys(CRITIC_REGISTRY) as CriticKey[];
const ACTIVE_PERFORMANCE_STATUSES: OrchestratorTaskStatus[] = [
  "pending",
  "in_progress",
  "needs_review",
  "needs_improvement",
  "blocked",
];

type CriticPerformanceSeverity = "autopilot" | "director";

interface CriticUnderperformanceReport {
  critic: string;
  severity: CriticPerformanceSeverity;
  consecutiveFailures: number;
  totalObservations: number;
  failureCount: number;
  successCount: number;
  reason: string;
  latestSnippet?: string;
  taskId: string;
  identity?: CriticIdentityProfile | null;
}

export class SessionContext {
  readonly workspaceRoot: string;
  readonly stateRoot: string;
  readonly profile: CodexProfile;

  private readonly roadmapStore: RoadmapStore;
  private readonly contextStore: ContextStore;
  private readonly checkpointStore: CheckpointStore;
  private readonly artifactRegistry: ArtifactRegistry;
  private readonly autopilotStore: AutopilotStore;
  private readonly heavyTaskQueue: HeavyTaskQueueStore;
  private readonly priorityQueueStore: PriorityQueueStore;
  private readonly priorityQueueDispatcher: PriorityQueueDispatcher;
  private readonly orchestratorRuntime?: OrchestratorRuntime;
  private readonly stateMachine?: StateMachine;
  private lastRoadmapSyncMs = 0;
  private roadmapSyncLock: Promise<void> | null = null;
  private roadmapSyncedOnce = false;
  private legacyYamlWarningLogged = false;

  // Cache for plan_next to avoid rebuilding payloads when queue is unchanged
  private planNextCache = new Map<string, { timestamp: number; result: ReturnType<typeof buildPlanSummaries> }>();
  private lastRoadmapChangeMs = Date.now();
  private criticIdentityCache?: { path: string; map: Record<string, CriticIdentityProfile> };
  private readonly criticStrategyDefaultWindowMs = 4 * 60 * 60 * 1000; // 4 hours
  private readonly criticStrategyAdvisoryWindowMs = 12 * 60 * 60 * 1000; // 12 hours
  private readonly dryRun: boolean;

  constructor(runtime?: OrchestratorRuntime) {
    this.orchestratorRuntime = runtime;
    this.workspaceRoot = resolveWorkspaceRoot();
    this.stateRoot = resolveStateRoot(this.workspaceRoot);
    this.profile = getCodexProfile();
    if (process.env.WVO_CAPABILITY?.toLowerCase() !== "high") {
      logWarning("MCP capability not set to high; extended critics may be limited.", {
        wvo_capability: process.env.WVO_CAPABILITY ?? null,
        codex_profile: process.env.CODEX_PROFILE ?? null,
      });
    }
    this.dryRun = isDryRunEnabled();
    this.roadmapStore = new RoadmapStore(this.stateRoot);
    this.contextStore = new ContextStore(this.stateRoot);
    this.checkpointStore = new CheckpointStore(this.stateRoot);
    this.artifactRegistry = new ArtifactRegistry(this.stateRoot);
    this.autopilotStore = new AutopilotStore(this.stateRoot);
    this.heavyTaskQueue = new HeavyTaskQueueStore(this.stateRoot);
    // Initialize priority queue with blue/green guardrail: max 10 concurrent workers
    this.priorityQueueStore = new PriorityQueueStore(this.stateRoot);
    this.priorityQueueDispatcher = new PriorityQueueDispatcher(this.priorityQueueStore, 10);
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

  private ensureWritable(operation: string): void {
    if (this.dryRun) {
      throw createDryRunError(operation);
    }
  }

  private generateCorrelationId(prefix: string): string {
    return `${prefix}:${randomUUID()}`;
  }

  private normalizeRelativePath(relativePath: string): string {
    return path.posix.normalize(relativePath.replace(/\\/g, "/"));
  }

  private isStateRelativePath(relativePath: string): boolean {
    const normalized = this.normalizeRelativePath(relativePath);
    return normalized === "state" || normalized.startsWith("state/");
  }

  private resolveStateRelativePath(relativePath: string): string {
    const normalized = this.normalizeRelativePath(relativePath);
    const remainder = normalized === "state" ? "" : normalized.slice("state/".length);
    const absolute = path.resolve(this.stateRoot, remainder);
    if (!absolute.startsWith(this.stateRoot)) {
      throw new Error(`Path ${relativePath} escapes state root`);
    }
    return absolute;
  }

  async planNext(input: PlanNextInput, options?: { correlationId?: string }) {
    const correlationBase = options?.correlationId;
    const stateMachine = this.stateMachine;
    const runtimeStarted = this.orchestratorRuntime?.isStarted() ?? false;
    if (stateMachine && !this.dryRun && runtimeStarted) {
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
      const summaries = buildPlanSummaries(stateMachine, input.filters);
      this.planNextCache.set(cacheKey, {
        timestamp: Date.now(),
        result: summaries
      });
      return summaries.slice(0, limit);
    }

    const roadmap = await this.roadmapStore.read();

    // Guard against critic blocking loops before planning
    ensureNoCriticBlocking(roadmap, (message, details) => {
      logInfo(message, {
        source: "CriticAvailabilityGuardian",
        ...(details ?? {}),
      });
    });

    // Save roadmap if any tasks were unblocked
    await this.roadmapStore.write(roadmap);

    const planner = new PlannerEngine(roadmap, this.workspaceRoot);
    return planner.next(input);
  }

  async updatePlanStatus(taskId: string, status: OrchestratorTaskStatus, correlationId?: string) {
    this.ensureWritable("plan_update");
    let mutated = false;

    if (this.stateMachine) {
      if (this.syncYamlEnabled) {
        await this.ensureStateMachineSynced(correlationId);
      }
      try {
        const correlation = correlationId ?? this.generateCorrelationId("plan_update");
        await this.stateMachine.transition(taskId, status, undefined, correlation);
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
        const legacyStatus = toLegacyStatus(status);
        await this.roadmapStore.upsertTaskStatus(taskId, legacyStatus as LegacyTaskStatus);
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
    this.ensureWritable("context_write");
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
    this.ensureWritable("context_snapshot");
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
    if (this.isStateRelativePath(relativePath)) {
      const absolute = this.resolveStateRelativePath(relativePath);
      return fs.readFile(absolute, "utf8");
    }
    return readFile(this.workspaceRoot, relativePath);
  }

  async writeFile(relativePath: string, content: string) {
    this.ensureWritable(`fs_write:${relativePath}`);
    if (this.isStateRelativePath(relativePath)) {
      const absolute = this.resolveStateRelativePath(relativePath);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, content, "utf8");
      return;
    }
    await writeFile(this.workspaceRoot, relativePath, content);
  }

  async runShellCommand(cmd: string) {
    this.ensureWritable(`cmd_run:${cmd}`);
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
    this.ensureWritable("critics_run");
    const candidateKeys = requested?.length ? requested : CRITIC_KEYS;
    const validKeys: CriticKey[] = [];
    const invalidKeys: string[] = [];
    const requestedSet = new Set((requested ?? []).map((key) => key.toString()));

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

    const results: CriticResult[] = [];
    const underperformanceReports: CriticUnderperformanceReport[] = [];
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
    const identityConfigPath = path.join(
      this.workspaceRoot,
      'tools',
      'wvo_mcp',
      'config',
      'critic_identities.json'
    );
    const identityMap = await this.getCriticIdentities(identityConfigPath);
    const orderedKeys = [...validKeys].sort((a, b) => {
      const score = (key: CriticKey) => {
        if (requestedSet.has(key)) return -10;
        const authority = identityMap[key]?.authority?.toLowerCase() ?? "";
        if (authority === "critical") return -5;
        if (authority === "blocking") return -4;
        return 0;
      };
      return score(a) - score(b);
    });

    for (const key of orderedKeys) {
      const CriticCtor = CRITIC_REGISTRY[key];
      const identity = identityMap[key];
      const shouldRun = this.shouldRunCritic(key, identity, requestedSet.has(key));

      if (!shouldRun) {
        const skipReason = identity ? "strategic_skip_identity_window" : "strategic_skip_default";
        const skipResult: CriticResult = {
          critic: key,
          code: 0,
          stdout: skipReason,
          stderr: "",
          passed: true,
          analysis: null,
          identity: identity ?? null,
        };
        logInfo("Strategic critic skip", {
          critic: key,
          authority: identity?.authority ?? "unknown",
          reason: skipReason,
        });
        results.push(skipResult);
        continue;
      }

      const critic = new CriticCtor(this.workspaceRoot, {
        intelligenceEnabled,
        intelligenceLevel,
        researchManager,
        stateMachine: this.stateMachine,
        escalationConfigPath,
        escalationLogPath,
        identityConfigPath,
        defaultIdentity: {
          title: `${key.replace(/_/g, " ")}`.replace(/\b\w/g, (match) => match.toUpperCase()),
          mission: `Safeguard ${key} discipline.`,
          powers: ["Reports on findings when configuration is missing."],
          authority: "advisory",
          domain: key,
        },
      });
      try {
        const outcome = await critic.run(this.profile);
        results.push(outcome);
        const report = await this.evaluateCriticPerformance(outcome);
        if (report) {
          underperformanceReports.push(report);
        }
      } catch (error: unknown) {
        logError("Critic execution failed", {
          critic: key,
          error: (error as Error).message,
        });
        const outcome: CriticResult = {
          critic: key,
          code: -1,
          stdout: "",
          stderr: (error as Error).stack ?? (error as Error).message,
          passed: false,
        };
        results.push(outcome);
        const report = await this.evaluateCriticPerformance(outcome);
        if (report) {
          underperformanceReports.push(report);
        }
      }
    }
    await this.evaluateSystemicCriticBehaviour(underperformanceReports, results.length);
    return results;
  }

  private async evaluateCriticPerformance(result: CriticResult): Promise<CriticUnderperformanceReport | null> {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return null;
    }

    const history = stateMachine
      .getCriticHistory(result.critic, { limit: 12 })
      .filter((entry) => ((entry.metadata as { origin?: string } | undefined)?.origin) === "critic_runtime");

    if (history.length < 4) {
      return null;
    }

    const failureCount = history.filter((entry) => !entry.passed).length;
    const successCount = history.length - failureCount;
    let consecutiveFailures = 0;
    for (const entry of history) {
      if (entry.passed) {
        break;
      }
      consecutiveFailures += 1;
    }

    const failureRatio = history.length === 0 ? 0 : failureCount / history.length;
    let severity: CriticPerformanceSeverity | null = null;
    let reason: string | null = null;

    if (consecutiveFailures >= 5 || (history.length >= 6 && successCount === 0)) {
      severity = "director";
      reason = `No successful runs recorded in the last ${history.length} observations; ${consecutiveFailures} consecutive failures detected.`;
    } else if (consecutiveFailures >= 3 || (history.length >= 5 && failureRatio >= 0.8)) {
      severity = "autopilot";
      reason = `Critic ${result.critic} failed ${failureCount} of the last ${history.length} runs with ${consecutiveFailures} consecutive failures.`;
    } else {
      if (result.passed) {
        await this.resolveCriticRecovery(result, history);
      }
      return null;
    }

    const latestSnippet = this.extractResultSnippet(result);

    return this.escalateCriticUnderperformance({
      critic: result.critic,
      severity,
      reason,
      consecutiveFailures,
      historySize: history.length,
      failureCount,
      successCount,
      latestSnippet,
      identity: result.identity ?? null,
    });
  }

  private async evaluateSystemicCriticBehaviour(
    reports: CriticUnderperformanceReport[],
    totalCriticsEvaluated: number,
  ): Promise<void> {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return;
    }

    if (reports.length === 0) {
      await this.resolveSystemicCriticRecovery(totalCriticsEvaluated);
      return;
    }

    const affectedCritics = Array.from(new Set(reports.map((report) => report.critic)));
    const systemicThreshold = Math.max(2, Math.ceil(totalCriticsEvaluated * 0.6));
    if (affectedCritics.length < systemicThreshold) {
      return;
    }

    const severity: CriticPerformanceSeverity = reports.some((report) => report.severity === "director")
      ? "director"
      : "autopilot";

    const reason =
      severity === "director"
        ? `${affectedCritics.length} critics require director-level intervention after repeated failures.`
        : `${affectedCritics.length} critics show degraded performance and need coordinated remediation.`;

    await this.escalateSystemicCriticFailure({
      severity,
      reason,
      affectedCritics,
      totalCriticsEvaluated,
      reports,
    });
  }

  private async resolveCriticRecovery(result: CriticResult, history: CriticHistoryRecord[]): Promise<void> {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return;
    }

    const consecutivePasses = this.countConsecutivePasses(history);
    const minimumPassesRequired = 2;
    if (consecutivePasses < minimumPassesRequired) {
      return;
    }

    const activeTasks = stateMachine.getTasks({ status: ACTIVE_PERFORMANCE_STATUSES });
    const remediationTask = activeTasks.find((task) => {
      const metadata = task.metadata as Record<string, unknown> | undefined;
      if (!metadata) {
        return false;
      }
      return (
        metadata["source"] === "critic_performance_monitor" &&
        metadata["remediation_scope"] === "critic" &&
        metadata["critic"] === result.critic
      );
    });

    if (!remediationTask) {
      return;
    }

    const correlationId = `critic_performance:${result.critic}:${randomUUID()}:resolve`;
    const summary = `Critic ${result.critic} recorded ${consecutivePasses} consecutive passing runs; closing remediation task.`;
    const metadataPatch: Record<string, unknown> = {
      last_reason: summary,
      last_evaluated_at: new Date().toISOString(),
      consecutive_failures: 0,
      latest_snippet: this.extractResultSnippet(result),
      resolution_status: "recovered",
      resolution_details: {
        consecutive_passes: consecutivePasses,
        total_observations: history.length,
      },
    };

    await stateMachine.transition(remediationTask.id, "done", metadataPatch, correlationId);
    stateMachine.addContextEntry({
      entry_type: "decision",
      topic: `Critic ${result.critic} performance restored`,
      content: summary,
      related_tasks: [remediationTask.id],
      metadata: {
        source: "critic_performance_monitor",
        critic: result.critic,
        action: "resolve",
        remediation_scope: "critic",
        consecutive_passes: consecutivePasses,
        total_observations: history.length,
      },
    });

    logInfo("Closed critic performance remediation task", {
      critic: result.critic,
      taskId: remediationTask.id,
      consecutivePasses,
    });
  }

  private async resolveSystemicCriticRecovery(totalCriticsEvaluated: number): Promise<void> {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return;
    }

    const activeTasks = stateMachine.getTasks({ status: ACTIVE_PERFORMANCE_STATUSES });
    const systemicTask = activeTasks.find((task) => {
      const metadata = task.metadata as Record<string, unknown> | undefined;
      if (!metadata) {
        return false;
      }
      return metadata["source"] === "critic_performance_monitor" && metadata["remediation_scope"] === "global";
    });

    if (!systemicTask) {
      return;
    }

    const outstandingCriticTasks = activeTasks.filter((task) => {
      const metadata = task.metadata as Record<string, unknown> | undefined;
      if (!metadata) {
        return false;
      }
      return metadata["source"] === "critic_performance_monitor" && metadata["remediation_scope"] === "critic";
    });

    if (outstandingCriticTasks.length > 0) {
      return;
    }

    const correlationId = `critic_performance:systemic:${randomUUID()}:resolve`;
    const summary = `All monitored critics passed their latest evaluation (${totalCriticsEvaluated} critics). Closing systemic remediation task.`;
    const metadataPatch: Record<string, unknown> = {
      last_reason: summary,
      last_evaluated_at: new Date().toISOString(),
      affected_critics: [],
      report_count: 0,
      total_critics_evaluated: totalCriticsEvaluated,
      resolution_status: "recovered",
    };

    await stateMachine.transition(systemicTask.id, "done", metadataPatch, correlationId);
    stateMachine.addContextEntry({
      entry_type: "decision",
      topic: "Systemic critic performance restored",
      content: summary,
      related_tasks: [systemicTask.id],
      metadata: {
        source: "critic_performance_monitor",
        remediation_scope: "global",
        action: "resolve",
        total_critics_evaluated: totalCriticsEvaluated,
      },
    });

    logInfo("Closed systemic critic remediation task", {
      taskId: systemicTask.id,
      totalCriticsEvaluated,
    });
  }

  private countConsecutivePasses(history: CriticHistoryRecord[]): number {
    let count = 0;
    for (const entry of history) {
      if (!entry.passed) {
        break;
      }
      count += 1;
    }
    return count;
  }

  private async escalateCriticUnderperformance(input: {
    critic: string;
    severity: CriticPerformanceSeverity;
    reason: string;
    consecutiveFailures: number;
    historySize: number;
    failureCount: number;
    successCount: number;
    latestSnippet?: string;
    identity?: CriticIdentityProfile | null;
  }): Promise<CriticUnderperformanceReport> {
    const stateMachine = this.stateMachine!;
    const correlationId = `critic_performance:${input.critic}:${randomUUID()}`;
    const assignee = input.severity === "director" ? "Director Dana" : "Autopilot";
    const metadataPatch: Record<string, unknown> = {
      source: "critic_performance_monitor",
      critic: input.critic,
      severity: input.severity,
      consecutive_failures: input.consecutiveFailures,
      total_observations: input.historySize,
      failures: input.failureCount,
      successes: input.successCount,
      last_reason: input.reason,
      last_evaluated_at: new Date().toISOString(),
      remediation_scope: "critic",
      latest_snippet: input.latestSnippet,
    };

    if (input.identity) {
      metadataPatch.identity = input.identity;
    }

    const descriptionSections = [
      `Critic ${input.critic} is underperforming and needs immediate remediation.`,
      input.reason,
      `Observation window: ${input.historySize} runs`,
      `Consecutive failures: ${input.consecutiveFailures}`,
      `Failures: ${input.failureCount} | Successes: ${input.successCount}`,
      `Assigned to: ${assignee}`,
      "Expectations:\n- Diagnose root causes for the critic's repeated failures.\n- Patch critic configuration, training data, or underlying automation as needed.\n- Document findings in state/context.md and roadmap notes.\n- Close this task once the critic passes reliably.",
    ];

    if (input.identity) {
      const summaryLines = [
        `Identity: ${input.identity.title} (${input.identity.domain}, authority ${input.identity.authority})`,
        `Mission: ${input.identity.mission}`,
      ];
      if (input.identity.powers?.length) {
        summaryLines.push(`Signature powers: ${input.identity.powers.join("; ")}`);
      }
      if (input.identity.autonomy_guidance) {
        summaryLines.push(`Autonomy guidance: ${input.identity.autonomy_guidance}`);
      }
      descriptionSections.splice(1, 0, summaryLines.join("\n"));
    }

    if (input.latestSnippet) {
      descriptionSections.push(`Latest output snippet:\n${input.latestSnippet}`);
    }

    const description = descriptionSections.join("\n\n");
    const activeTasks = stateMachine.getTasks({ status: ACTIVE_PERFORMANCE_STATUSES });
    const existingTask = activeTasks.find((task) => {
      const metadata = task.metadata as Record<string, unknown> | undefined;
      const source = metadata?.["source"] as string | undefined;
      const critic = metadata?.["critic"] as string | undefined;
      return source === "critic_performance_monitor" && critic === input.critic;
    });

    let taskId: string;
    if (existingTask) {
      taskId = existingTask.id;
      if (existingTask.assigned_to !== assignee) {
        stateMachine.assignTask(existingTask.id, assignee, `${correlationId}:assign`);
      }
      stateMachine.updateTaskDetails(existingTask.id, { description }, `${correlationId}:describe`);
      await stateMachine.transition(existingTask.id, existingTask.status, metadataPatch, `${correlationId}:metadata`);
    } else {
      const newTaskId = `CRIT-PERF-${input.critic.toUpperCase()}-${randomUUID().slice(0, 6)}`;
      const created = stateMachine.createTask(
        {
          id: newTaskId,
          title: `[Critic:${input.critic}] Restore performance`,
          description,
          type: "task",
          status: "pending",
          assigned_to: assignee,
          metadata: metadataPatch,
        },
        `${correlationId}:create`,
      );
      taskId = created.id;
    }

    stateMachine.addContextEntry({
      entry_type: "decision",
      topic: `Critic ${input.critic} performance intervention`,
      content: `${input.reason}\n\nAssigned to: ${assignee}`,
      related_tasks: [taskId],
      metadata: {
        ...metadataPatch,
        action: existingTask ? "update" : "create",
      },
    });

    return {
      critic: input.critic,
      severity: input.severity,
      consecutiveFailures: input.consecutiveFailures,
      totalObservations: input.historySize,
      failureCount: input.failureCount,
      successCount: input.successCount,
      reason: input.reason,
      latestSnippet: input.latestSnippet,
      taskId,
      identity: input.identity ?? undefined,
    };
  }

  private async escalateSystemicCriticFailure(input: {
    severity: CriticPerformanceSeverity;
    reason: string;
    affectedCritics: string[];
    totalCriticsEvaluated: number;
    reports: CriticUnderperformanceReport[];
  }): Promise<void> {
    const stateMachine = this.stateMachine!;
    const assignee = input.severity === "director" ? "Director Dana" : "Autopilot";
    const correlationId = `critic_performance:systemic:${randomUUID()}`;
    const criticIdentities = input.reports.reduce<Record<string, CriticIdentityProfile>>((acc, report) => {
      if (report.identity) {
        acc[report.critic] = report.identity;
      }
      return acc;
    }, {});

    const metadataPatch: Record<string, unknown> = {
      source: "critic_performance_monitor",
      remediation_scope: "global",
      severity: input.severity,
      affected_critics: input.affectedCritics,
      total_critics_evaluated: input.totalCriticsEvaluated,
      report_count: input.reports.length,
      last_reason: input.reason,
      last_evaluated_at: new Date().toISOString(),
    };

    if (Object.keys(criticIdentities).length > 0) {
      metadataPatch.critic_identities = criticIdentities;
    }

    const description = [
      "Multiple critics are underperforming and require coordinated intervention.",
      input.reason,
      `Affected critics: ${input.affectedCritics.join(", ")}`,
      `Critics evaluated in run: ${input.totalCriticsEvaluated}`,
      `Reports captured: ${input.reports.length}`,
      `Assigned to: ${assignee}`,
      "Expectations:\n- Review individual remediation tasks and look for systemic issues.\n- Adjust critic configurations, training loops, or staffing mixes.\n- Provide a coordination brief in state/context.md.\n- Close this systemic task once individual critics are back on track.",
    ].join("\n\n");

    const activeTasks = stateMachine.getTasks({ status: ACTIVE_PERFORMANCE_STATUSES });
    const existingTask = activeTasks.find((task) => {
      const metadata = task.metadata as Record<string, unknown> | undefined;
      const source = metadata?.["source"] as string | undefined;
      const scope = metadata?.["remediation_scope"] as string | undefined;
      return source === "critic_performance_monitor" && scope === "global";
    });

    let taskId: string;
    if (existingTask) {
      taskId = existingTask.id;
      if (existingTask.assigned_to !== assignee) {
        stateMachine.assignTask(existingTask.id, assignee, `${correlationId}:assign`);
      }
      stateMachine.updateTaskDetails(existingTask.id, { description }, `${correlationId}:describe`);
      await stateMachine.transition(existingTask.id, existingTask.status, metadataPatch, `${correlationId}:metadata`);
    } else {
      const newTaskId = `CRIT-PERF-GLOBAL-${randomUUID().slice(0, 6)}`;
      const created = stateMachine.createTask(
        {
          id: newTaskId,
          title: "[Critics] Systemic performance remediation",
          description,
          type: "task",
          status: "pending",
          assigned_to: assignee,
          metadata: metadataPatch,
        },
        `${correlationId}:create`,
      );
      taskId = created.id;
    }

    stateMachine.addContextEntry({
      entry_type: "decision",
      topic: "Systemic critic performance alert",
      content: `${input.reason}\n\nAssigned to: ${assignee}`,
      related_tasks: [taskId],
      metadata: {
        ...metadataPatch,
        action: existingTask ? "update" : "create",
      },
    });
  }

  private extractResultSnippet(result: CriticResult, limit = 600): string | undefined {
    const source = result.stderr && result.stderr.trim().length > 0 ? result.stderr : result.stdout ?? "";
    const trimmed = source.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.length <= limit) {
      return trimmed;
    }
    return `${trimmed.slice(0, limit - 3)}...`;
  }

  private async getCriticIdentities(configPath: string): Promise<Record<string, CriticIdentityProfile>> {
    if (!configPath) {
      return {};
    }

    if (this.criticIdentityCache?.path === configPath) {
      return this.criticIdentityCache.map;
    }

    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, CriticIdentityProfile>;
      this.criticIdentityCache = {
        path: configPath,
        map: parsed ?? {},
      };
      return this.criticIdentityCache.map;
    } catch (error) {
      logWarning("Failed to load critic identity config", {
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
      this.criticIdentityCache = {
        path: configPath,
        map: {},
      };
      return {};
    }
  }

  private shouldRunCritic(
    key: CriticKey,
    identity: CriticIdentityProfile | undefined,
    explicitlyRequested: boolean,
  ): boolean {
    if (explicitlyRequested) {
      return true;
    }

    if (!identity) {
      return true;
    }

    const authority = identity.authority?.toLowerCase() ?? "";
    if (authority === "critical" || authority === "blocking") {
      return true;
    }

    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return authority !== "advisory";
    }

    const outstandingTasks = stateMachine
      .getTasks({ status: ACTIVE_PERFORMANCE_STATUSES })
      .some((task) => {
        const metadata = task.metadata as Record<string, unknown> | undefined;
        if (!metadata) return false;
        if (metadata.source !== "critic") return false;
        return metadata.critic === key;
      });

    if (outstandingTasks) {
      return true;
    }

    const history = stateMachine.getCriticHistory(key, { limit: 8 });
    const lastEntry = history[0];
    const hasRecentFailure = history.some((entry) => !entry.passed);
    if (hasRecentFailure) {
      return true;
    }

    if (!lastEntry) {
      return true;
    }

    const now = Date.now();
    const elapsedMs = now - (lastEntry.created_at ?? 0);
    const windowMs =
      authority === "advisory" ? this.criticStrategyAdvisoryWindowMs : this.criticStrategyDefaultWindowMs;

    return elapsedMs >= windowMs;
  }

  async recordArtifact(type: string, artifactPath: string, metadata?: Record<string, unknown>) {
    this.ensureWritable("artifact_record");
    await this.artifactRegistry.record({
      type,
      path: artifactPath,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }

  async recordAutopilotAudit(entry: AutopilotAuditEntry): Promise<AutopilotState> {
    this.ensureWritable("autopilot_record_audit");
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
    this.ensureWritable("heavy_queue_enqueue");
    return this.heavyTaskQueue.enqueue(input);
  }

  async updateHeavyTask(input: HeavyTaskUpdateInput): Promise<HeavyTaskQueueItem | null> {
    this.ensureWritable("heavy_queue_update");
    return this.heavyTaskQueue.updateStatus(input);
  }

  async listHeavyTasks(): Promise<HeavyTaskQueueItem[]> {
    return this.heavyTaskQueue.list();
  }

  /**
   * Dispatch a task to the priority queue with automatic priority classification
   * Interactive tasks are automatically routed to urgent lane
   */
  async dispatchPriorityTask(input: {
    summary: string;
    command?: string;
    notes?: string;
    isInteractive?: boolean;
    isCritical?: boolean;
    estimatedDurationMs?: number;
  }): Promise<HeavyTaskQueueItem> {
    this.ensureWritable("priority_queue_dispatch");
    return this.priorityQueueDispatcher.dispatchTask(input);
  }

  /**
   * Get next batch of tasks to execute from priority queue
   * Respects concurrency limits and priority order
   */
  async getNextPriorityBatch(maxTasks?: number): Promise<HeavyTaskQueueItem[]> {
    return this.priorityQueueDispatcher.getNextBatch(maxTasks);
  }

  /**
   * Start executing a task from the priority queue
   */
  async startPriorityTask(taskId: string): Promise<HeavyTaskQueueItem | null> {
    this.ensureWritable("priority_queue_start");
    return this.priorityQueueDispatcher.startTask(taskId);
  }

  /**
   * Complete a task execution with metrics
   */
  async completePriorityTask(
    taskId: string,
    durationMs: number,
    notes?: string
  ): Promise<HeavyTaskQueueItem | null> {
    this.ensureWritable("priority_queue_complete");
    return this.priorityQueueDispatcher.completeTask(taskId, durationMs, notes);
  }

  /**
   * Cancel a task execution
   */
  async cancelPriorityTask(taskId: string, reason?: string): Promise<HeavyTaskQueueItem | null> {
    this.ensureWritable("priority_queue_cancel");
    return this.priorityQueueDispatcher.cancelTask(taskId, reason);
  }

  /**
   * Get priority queue status and metrics
   */
  async getPriorityQueueStatus() {
    return this.priorityQueueDispatcher.getStatus();
  }

  /**
   * Verify interactive task priority guarantee (used by tests)
   */
  async verifyInteractivePriority() {
    return this.priorityQueueDispatcher.verifyInteractivePriority();
  }

  private async ensureStateMachineSynced(correlationBase?: string): Promise<void> {
    if (this.dryRun) {
      return;
    }
    if (this.roadmapSyncLock) {
      await this.roadmapSyncLock;
    }

    const promise = (async () => {
      if (!this.stateMachine || !this.syncYamlEnabled) {
        return;
      }

      const roadmapPath = path.join(this.stateRoot, "roadmap.yaml");
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

      if (this.roadmapSyncedOnce && mtimeMs <= this.lastRoadmapSyncMs) {
        return;
      }

      try {
        await syncRoadmapFile(
          this.stateMachine,
          this.workspaceRoot,
          correlationBase ? { correlationBase } : undefined
        );
        this.lastRoadmapSyncMs = mtimeMs || Date.now();
        this.roadmapSyncedOnce = true;
        this.invalidatePlanCache();
      } catch (error) {
        logError("Failed to sync roadmap file", { error });
      }
    })();

    this.roadmapSyncLock = promise;
    try {
      await promise;
    } finally {
      this.roadmapSyncLock = null;
    }
  }
}
