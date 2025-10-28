import path from 'node:path';

import { ContextAssembler } from '../context/context_assembler.js';
import { DecisionJournal } from '../memory/decision_journal.js';
import { RunEphemeralMemory } from '../memory/run_ephemeral.js';
import { CurrentStateTracker } from '../telemetry/current_state_tracker.js';
import { logWarning, logError, logInfo } from '../telemetry/logger.js';
import {
  MetricsCollector,
  inferTaskType,
  type MetricsTags,
  type QualityMetrics,
  type EfficiencyMetrics,
  type LearningMetrics,
  type SystemHealthMetrics,
} from '../telemetry/metrics_collector.js';

import { ComplexityRouter } from './complexity_router.js';
import { CriticalAgent } from './critical_agent.js';
import { ImplementerAgent, type ImplementerAgentResult } from './implementer_agent.js';
import type { ModelRouter, ModelSelection } from './model_router.js';
import { PlannerAgent, type PlannerAgentResult } from './planner_agent.js';
import { ThinkerAgent } from './thinker_agent.js';
import { Verifier, type VerifierResult } from './verifier.js';
import { ReviewerAgent } from './reviewer_agent.js';
import { SupervisorAgent } from './supervisor.js';
import type { TaskEnvelope } from './task_envelope.js';




import type { IntegrityReport } from './verify_integrity.js';
import { runResolution, type ResolutionResult } from './resolution_engine.js';
import type { IncidentReporter } from './incident_reporter.js';
import type { RouterState } from './router_policy.js';
import { runSpecify } from './state_runners/specify_runner.js';
import { runPlan } from './state_runners/plan_runner.js';
import { runThinker } from './state_runners/thinker_runner.js';
import { runImplement } from './state_runners/implement_runner.js';
import { runVerify } from './state_runners/verify_runner.js';
import { runReview } from './state_runners/review_runner.js';
import { runPr } from './state_runners/pr_runner.js';
import { runMonitor } from './state_runners/monitor_runner.js';
import { SmokeCommand, type SmokeCommandResult } from './smoke_command.js';
import { ResolutionMetricsStore } from './resolution_metrics_store.js';
import type { WorkPhase } from './work_process_enforcer.js';


export type AutopilotState = RouterState;

const RETRY_LIMITS: Record<AutopilotState, number> = {
  specify: 2,
  plan: 2,
  thinker: 1,
  implement: 3,
  verify: 2,
  review: 2,
  pr: 1,
  monitor: 1,
};

type ContextAssemblerContract = {
  emit: ContextAssembler['emit'];
};

export interface StateGraphDependencies {
  planner: PlannerAgent;
  thinker: ThinkerAgent;
  implementer: ImplementerAgent;
  verifier: Verifier;
  reviewer: ReviewerAgent;
  critical: CriticalAgent;
  supervisor: SupervisorAgent;
  router: ModelRouter;
  complexityRouter: ComplexityRouter;
  journal: DecisionJournal;
  memory: RunEphemeralMemory;
  contextAssembler: ContextAssemblerContract;
  metricsCollector?: MetricsCollector;
  currentStateTracker?: CurrentStateTracker;
  checkpoint?: CheckpointClient;
  workProcessEnforcer?: import('./work_process_enforcer.js').WorkProcessEnforcer;
}

export interface StateGraphOptions {
  workspaceRoot: string;
  runId?: string;
  incidentReporter?: IncidentReporter;
}

export interface StateGraphTaskContext extends TaskEnvelope {}

export interface StateGraphResult {
  success: boolean;
  finalState: AutopilotState;
  notes: string[];
  artifacts: Record<string, unknown>;
}

export interface CheckpointClient {
  save(taskId: string, state: AutopilotState, payload: Record<string, unknown>, attempt: number): Promise<void>;
}

export class StateGraphError extends Error {
  constructor(message: string, readonly state: AutopilotState, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

export class StateGraph {
  private readonly attemptCounter = new Map<string, number>();
  private readonly planHashes = new Map<string, string>();
  private readonly patchHistory = new Map<string, Set<string>>();
  private readonly planDeltaRequired = new Set<string>();
  private readonly pendingThinker = new Set<string>();
  private readonly spikeBranches = new Map<string, string>();
  private readonly resolutionTraces = new Map<string, ResolutionResult[]>();
  private readonly contextPackRefs = new Map<string, Record<string, string>>();
  private readonly workspaceRoot: string;
  private readonly runId: string;
  private readonly incidentReporter?: IncidentReporter;
  private readonly resolutionMetrics: ResolutionMetricsStore;

  constructor(private readonly deps: StateGraphDependencies, options: StateGraphOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.runId = options.runId ?? process.env.WVO_RUN_ID ?? 'run-local';
    this.incidentReporter = options.incidentReporter;
    this.resolutionMetrics = new ResolutionMetricsStore(this.workspaceRoot);
  }

  async run(task: StateGraphTaskContext): Promise<StateGraphResult> {
    const startTime = performance.now();
    const statesVisited = new Set<AutopilotState>();
    let taskResult: StateGraphResult | null = null;

    const notes: string[] = [];
    const artifacts: Record<string, unknown> = {};
    this.contextPackRefs.delete(task.id);
    let current: AutopilotState | null = 'specify';

    // State carried across runners
    let thinkerInsights: string[] = [];
    let planResult: PlannerAgentResult | undefined;
    let implementResult: ImplementerAgentResult | undefined;
    let verifierResult: VerifierResult | undefined;
    let integrityReport: IntegrityReport | undefined;

    const routerDecisions: Array<{ state: AutopilotState; selection: ModelSelection }> = [];
    const resolutionTrace: ResolutionResult[] = [];
    const recordRouterDecision = (state: AutopilotState, selection?: ModelSelection) => {
      if (selection) {
        routerDecisions.push({ state, selection });
      }
    };

    const scopeSignal = this.deriveScopeSignal(task);
    const fileHints = this.extractFileHints(task);
    const testHints = this.extractTestHints(task);

    // Assess task complexity once for entire workflow
    const complexity = this.deps.complexityRouter.assessComplexity(task);
    logInfo('Task complexity assessed', {
      taskId: task.id,
      score: complexity.score,
      reasoning: complexity.reasoning,
    });

    // Start state tracking
    if (this.deps.currentStateTracker) {
      await this.deps.currentStateTracker.startTask(task.id, task.title);
    }

    try {
      while (current) {
        statesVisited.add(current);
        this.incrementAttempt(task.id, current);

        // Update current stage in state tracker
        if (this.deps.currentStateTracker) {
          await this.deps.currentStateTracker.updateStage(task.id, current);
        }

        switch (current) {
          case 'specify': {
            const modelSelection = this.selectModelForState(task, complexity);
            const result = await runSpecify(
              { task, attemptNumber: this.getAttempt(task.id, current), modelSelection },
              { supervisor: this.deps.supervisor }
            );
            const specify = result.artifacts.specify as any;
            Object.assign(artifacts, result.artifacts);
            notes.push(...result.notes);
            await this.emitContextPack('Supervisor', {
              taskId: task.id,
              goal: `Define acceptance for ${task.id}`,
              acceptanceCriteria: specify.acceptanceCriteria,
              constraints: specify.initialRisks,
              capability: 'reasoning_high',
              scopeSignal,
              fileHints,
              testHints,
              riskNotes: specify.initialRisks,
            });
            await this.checkpoint(task.id, current, this.checkpointPayload(specify));
            recordRouterDecision('specify', result.modelSelection ?? modelSelection);
            current = result.nextState;
            break;
          }
          case 'plan': {
            // CRITICAL: Validate and advance work process phase
            await this.advanceWorkPhase(task.id, current);

            await this.ensureRetryBudget(task, current);
            const modelSelection = this.selectModelForState(task, complexity);
            let result;
            try {
              result = await runPlan(
                {
                  task,
                  attemptNumber: this.getAttempt(task.id, current),
                  modelSelection,
                  requirePlanDelta: this.planDeltaRequired.has(task.id),
                  previousPlanHash: this.planHashes.get(task.id),
                  pendingThinker: this.pendingThinker.has(task.id),
                  spikeBranch: this.spikeBranches.get(task.id),
                },
                { planner: this.deps.planner }
              );
            } catch (error) {
              // Convert runner errors to StateGraphError for consistent error handling
              throw new StateGraphError(
                error instanceof Error ? error.message : String(error),
                current,
                { originalError: error }
              );
            }
            planResult = result.artifacts.plan as PlannerAgentResult;
            Object.assign(artifacts, result.artifacts);
            notes.push(...result.notes);
            // Update StateGraph internal state
            this.planHashes.set(task.id, planResult.planHash);
            this.planDeltaRequired.delete(task.id);
            if (result.requireThinker && this.pendingThinker.has(task.id)) {
              this.pendingThinker.delete(task.id);
            }
            if (result.spikeBranch) {
              this.spikeBranches.set(task.id, result.spikeBranch);
            }
            await this.emitContextPack('Planner', {
              taskId: task.id,
              goal: `Plan implementation for ${task.id}`,
              acceptanceCriteria: planResult.summary ? [planResult.summary] : [],
              constraints: this.defaultConstraints(task),
              capability: 'reasoning_high',
              scopeSignal,
              fileHints,
              testHints,
              openQuestions: planResult.requiresThinker ? ['Ambiguity flagged by planner'] : [],
              nextActions: ['Finalize file/function targets'],
            });
            await this.checkpoint(task.id, current, this.checkpointPayload(planResult));
            recordRouterDecision('plan', result.modelSelection ?? modelSelection);
            current = result.nextState;
            break;
          }
          case 'thinker': {
            // CRITICAL: Validate and advance work process phase
            await this.advanceWorkPhase(task.id, current);

            if (!planResult) {
              throw new StateGraphError('Thinker requires plan result', current);
            }
            const modelSelection = this.selectModelForState(task, complexity);
            const result = await runThinker(
              {
                task,
                attemptNumber: this.getAttempt(task.id, current),
                modelSelection,
                planHash: planResult.planHash,
              },
              { thinker: this.deps.thinker }
            );
            const reflection = result.artifacts.thinker as any;
            thinkerInsights = reflection.insights;
            Object.assign(artifacts, result.artifacts);
            notes.push(...result.notes);
            await this.emitContextPack('Thinker', {
              taskId: task.id,
              goal: `Explore ambiguities for ${task.id}`,
              acceptanceCriteria: [planResult.summary ?? ''],
              constraints: this.defaultConstraints(task),
              capability: 'reasoning_high',
              scopeSignal,
              fileHints,
              testHints,
              openQuestions: reflection.insights,
              riskNotes: reflection.escalationRecommended ? ['Requires closer supervision'] : [],
            });
            await this.checkpoint(task.id, current, this.checkpointPayload(reflection));
            recordRouterDecision('thinker', result.modelSelection ?? modelSelection);
            current = result.nextState;
            break;
          }
          case 'implement': {
            // CRITICAL: Validate and advance work process phase
            await this.advanceWorkPhase(task.id, current);

            if (!planResult) {
              throw new StateGraphError('Implement requires plan result', current);
            }
            await this.ensureRetryBudget(task, current);
            const modelSelection = this.selectModelForState(task, complexity);
            const result = await runImplement(
              {
                task,
                attemptNumber: this.getAttempt(task.id, current),
                modelSelection,
                planHash: planResult.planHash,
                insights: thinkerInsights,
                patchHistory: this.patchHistory.get(task.id),
              },
              { implementer: this.deps.implementer }
            );
            if (!result.success) {
              this.requirePlanDelta(task.id);
              await this.checkpoint(task.id, current, { status: 'failed' });
              notes.push(...result.notes);
              current = result.nextState;
              break;
            }
            implementResult = result.artifacts.implement as ImplementerAgentResult;
            Object.assign(artifacts, result.artifacts);
            notes.push(...result.notes);
            // Track patch
            if (!this.patchHistory.has(task.id)) {
              this.patchHistory.set(task.id, new Set());
            }
            this.patchHistory.get(task.id)!.add(implementResult.patchHash);
            await this.emitContextPack('Implementer', {
              taskId: task.id,
              goal: `Apply patch ${implementResult.patchHash.slice(0, 8)}`,
              acceptanceCriteria: planResult.summary ? [planResult.summary] : [],
              constraints: this.defaultConstraints(task),
              capability: 'fast_code',
              scopeSignal,
              fileHints,
              testHints,
              nextActions: ['Produce minimal diff', 'Update/extend tests'],
            });
            await this.checkpoint(task.id, current, this.checkpointPayload(implementResult));
            recordRouterDecision('implement', result.modelSelection ?? modelSelection);
            current = result.nextState;
            break;
          }
          case 'verify': {
            // CRITICAL: Validate and advance work process phase
            await this.advanceWorkPhase(task.id, current);

            if (!implementResult) {
              throw new StateGraphError('Verify requires implementation result', current);
            }
            await this.ensureRetryBudget(task, current);
            const modelSelection = this.selectModelForState(task, complexity);
            const coverageTarget = planResult?.coverageTarget ?? this.deps.verifier.getCoverageThreshold();
            const result = await runVerify(
              {
                task,
                attemptNumber: this.getAttempt(task.id, current),
                modelSelection,
                patchHash: implementResult.patchHash,
                coverageHint: implementResult.coverageHint,
                coverageTarget,
                changedFiles: implementResult.changedFiles,
                changedLinesCoverage: implementResult.changedLinesCoverage,
                touchedFilesDelta: implementResult.touchedFilesDelta,
                failingProofProvided: implementResult.failingProofProvided ?? false,
                mutationSmokeEnabled: implementResult.mutationSmokeEnabled ?? false,
                workspaceRoot: this.workspaceRoot,
                runId: this.runId,
              },
              {
                verifier: this.deps.verifier,
                noteVerifyFailure: (id) => this.deps.router.noteVerifyFailure(id),
                clearTask: (id) => this.deps.router.clearTask(id),
              }
            );
            verifierResult = result.artifacts.verify as VerifierResult;
            integrityReport = result.artifacts.integrity as IntegrityReport | undefined;
            Object.assign(artifacts, result.artifacts);
            notes.push(...result.notes);
            // Update StateGraph state from runner flags
            if (result.requirePlanDelta) {
              this.requirePlanDelta(task.id);
            }
            if (result.requireThinker) {
              this.pendingThinker.add(task.id);
            }
            if (result.spikeBranch) {
              this.spikeBranches.set(task.id, result.spikeBranch);
            }
            if (result.artifacts.resolution) {
              const resolution = result.artifacts.resolution as ResolutionResult;
              await this.resolutionMetrics.recordAttempt({
                taskId: task.id,
                attempt: this.getAttempt(task.id, current),
                timestamp: new Date().toISOString(),
                runId: this.runId,
                label: resolution.label,
              });
              this.recordResolutionTrace(task.id, resolutionTrace, resolution);
            }
            await this.emitContextPack('Verifier', {
              taskId: task.id,
              goal: 'Evaluate gates',
              acceptanceCriteria: [`Coverage >= ${verifierResult.coverageTarget}`],
              constraints: ['tests.run', 'lint.run', 'typecheck.run', 'security.scan', 'license.check'],
              capability: 'reasoning_high',
              scopeSignal,
              fileHints,
              testHints,
              riskNotes: verifierResult.success ? [] : ['Gate failure detected'],
            });
            await this.checkpoint(task.id, current, this.checkpointPayload(verifierResult));
            current = result.nextState;
            break;
          }
          case 'review': {
            // CRITICAL: Validate and advance work process phase
            await this.advanceWorkPhase(task.id, current);

            if (!implementResult || !verifierResult) {
              throw new StateGraphError('Review requires implementation and verification artifacts', current);
            }
            await this.ensureRetryBudget(task, current);
            const modelSelection = this.selectModelForState(task, complexity);
            const result = await runReview(
              {
                task,
                attemptNumber: this.getAttempt(task.id, current),
                modelSelection,
                patchHash: implementResult.patchHash,
                coverageDelta: verifierResult.coverageDelta,
              },
              { reviewer: this.deps.reviewer, critical: this.deps.critical }
            );
            const review = (result.artifacts.review as any).review;
            const critical = (result.artifacts.review as any).critical;
            Object.assign(artifacts, result.artifacts);
            notes.push(...result.notes);
            if (result.requirePlanDelta) {
              this.requirePlanDelta(task.id);
            }
            await this.emitContextPack('Reviewer', {
              taskId: task.id,
              goal: 'Rubric evaluation',
              acceptanceCriteria: [`Coverage delta ${verifierResult.coverageDelta.toFixed(2)}`],
              constraints: ['readability', 'maintainability', 'perf', 'security'],
              capability: 'reasoning_high',
              scopeSignal,
              fileHints,
              testHints,
              riskNotes: review.approved ? [] : ['Reviewer blocked'],
              openQuestions: critical.issues,
            });
            await this.checkpoint(task.id, current, artifacts.review as Record<string, unknown>);
            recordRouterDecision('review', result.modelSelection ?? modelSelection);
            current = result.nextState;
            break;
          }
          case 'pr': {
            // CRITICAL: Validate and advance work process phase
            await this.advanceWorkPhase(task.id, current);

            const modelSelection = this.selectModelForState(task, complexity);
            const result = await runPr(
              { task, attemptNumber: this.getAttempt(task.id, current), modelSelection },
              { supervisor: this.deps.supervisor }
            );
            const prResult = result.artifacts.pr as any;
            Object.assign(artifacts, result.artifacts);
            notes.push(...result.notes);
            if (result.requirePlanDelta) {
              this.requirePlanDelta(task.id);
            }
            await this.emitContextPack('Supervisor', {
              taskId: task.id,
              goal: 'Prepare PR checklist',
              acceptanceCriteria: prResult.checklist,
              constraints: this.defaultConstraints(task),
              capability: 'reasoning_high',
              scopeSignal,
              fileHints,
              testHints,
            });
            await this.checkpoint(task.id, current, this.checkpointPayload(prResult));
            recordRouterDecision('pr', result.modelSelection ?? modelSelection);
            current = result.nextState;
            break;
          }
          case 'monitor': {
            // CRITICAL: Validate and advance work process phase
            await this.advanceWorkPhase(task.id, current);

            const modelSelection = this.selectModelForState(task, complexity);
            const result = await runMonitor(
              {
                task,
                attemptNumber: this.getAttempt(task.id, current),
                modelSelection,
              },
              {
                supervisor: this.deps.supervisor,
                runAppSmoke: (input) => this.runAppSmoke(input.taskId, input.attempt),
                clearMemory: (id) => this.deps.memory.clearTask(id),
                clearRouter: (id) => this.deps.router.clearTask(id),
              }
            );
            const monitorResult = result.artifacts.monitor as any;
            Object.assign(artifacts, result.artifacts);
            notes.push(...result.notes);
            if (result.requirePlanDelta) {
              this.requirePlanDelta(task.id);
            }
            await this.emitContextPack('Supervisor', {
              taskId: task.id,
              goal: 'Monitor after merge readiness',
              acceptanceCriteria: ['App smoke passes', 'No regressions'],
              constraints: this.defaultConstraints(task),
              capability: 'cheap_batch',
              scopeSignal,
              fileHints,
              testHints,
            });
            await this.checkpoint(task.id, current, artifacts.monitor as Record<string, unknown>);
            recordRouterDecision('monitor', result.modelSelection ?? modelSelection);
            // Monitor is terminal - attach final artifacts
            if (!result.success) {
              current = result.nextState;
              break;
            }
            await this.resolutionMetrics.markClosed({
              taskId: task.id,
              attempt: this.getAttempt(task.id, 'verify'),
              timestamp: new Date().toISOString(),
              runId: this.runId,
            });
            artifacts.routerDecisions = routerDecisions;
            artifacts.resolutionTrace = resolutionTrace;
            if (this.spikeBranches.has(task.id)) {
              artifacts.spikeBranch = this.spikeBranches.get(task.id);
            }
            this.attachContextPackArtifacts(task.id, artifacts);
            taskResult = { success: true, finalState: 'monitor', notes, artifacts };
            return taskResult;
          }
          default:
            throw new StateGraphError(`Unknown state ${current}`, current);
        }
      }
    } catch (error) {
      if (error instanceof StateGraphError) {
        notes.push(`${error.state} failed: ${error.message}`);
        artifacts.error = { state: error.state, details: error.details };
        artifacts.routerDecisions = routerDecisions;
        artifacts.resolutionTrace = resolutionTrace;
        if (this.spikeBranches.has(task.id)) {
          artifacts.spikeBranch = this.spikeBranches.get(task.id);
        }
        this.attachContextPackArtifacts(task.id, artifacts);
        taskResult = { success: false, finalState: error.state, notes, artifacts };
        return taskResult;
      }
      throw error;
    } finally {
      // Record metrics regardless of success/failure
      await this.recordMetrics(task, complexity, taskResult, statesVisited, routerDecisions, startTime, verifierResult);

      // Complete state tracking
      if (this.deps.currentStateTracker) {
        const success = taskResult?.success ?? false;
        await this.deps.currentStateTracker.completeTask(task.id, success);
      }
    }

    artifacts.routerDecisions = routerDecisions;
    artifacts.resolutionTrace = resolutionTrace;
    if (this.spikeBranches.has(task.id)) {
      artifacts.spikeBranch = this.spikeBranches.get(task.id);
    }
    this.attachContextPackArtifacts(task.id, artifacts);
    taskResult = { success: false, finalState: current ?? 'specify', notes, artifacts };
    return taskResult;
  }

  private getAttempt(taskId: string, state: AutopilotState): number {
    const key = `${taskId}:${state}`;
    return this.attemptCounter.get(key) ?? 0;
  }

  private incrementAttempt(taskId: string, state: AutopilotState): void {
    const key = `${taskId}:${state}`;
    const next = (this.attemptCounter.get(key) ?? 0) + 1;
    this.attemptCounter.set(key, next);
  }

  private async ensureRetryBudget(task: TaskEnvelope, state: AutopilotState): Promise<void> {
    const attempt = this.getAttempt(task.id, state);
    if (attempt > RETRY_LIMITS[state]) {
      await this.handleIncident(task, state, attempt);
      throw new StateGraphError('Retry ceiling exceeded', state, { attempt, limit: RETRY_LIMITS[state] });
    }
  }

  private isDuplicatePatch(taskId: string, patchHash: string): boolean {
    if (!this.patchHistory.has(taskId)) {
      this.patchHistory.set(taskId, new Set());
    }
    const seen = this.patchHistory.get(taskId)!;
    if (seen.has(patchHash)) {
      logWarning('Duplicate patch detected', { taskId, patchHash });
      return true;
    }
    seen.add(patchHash);
    return false;
  }

  private requirePlanDelta(taskId: string): void {
    this.planDeltaRequired.add(taskId);
    this.deps.supervisor.requirePlanDelta(taskId);
  }

  private async handleIncident(task: TaskEnvelope, state: AutopilotState, attempt: number): Promise<void> {
    await this.resolutionMetrics.recordIncident({
      taskId: task.id,
      state,
      attempt,
      timestamp: new Date().toISOString(),
    });
    if (!this.incidentReporter) {
      return;
    }
    try {
      await this.incidentReporter.report({
        task,
        state,
        attempt,
        notes: ['Retry ceiling exceeded', `state=${state}`],
      });
      this.pendingThinker.add(task.id);
    } catch (error) {
      logWarning('Incident reporter failed', {
        taskId: task.id,
        state,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private recordResolutionTrace(taskId: string, trace: ResolutionResult[], resolution: ResolutionResult): void {
    trace.push(resolution);
    const existing = this.resolutionTraces.get(taskId) ?? [];
    existing.push(resolution);
    this.resolutionTraces.set(taskId, existing);
  }

  private selectModelForState(
    task: StateGraphTaskContext,
    complexity: ReturnType<ComplexityRouter['assessComplexity']>
  ): ModelSelection {
    return this.deps.complexityRouter.selectModel(complexity);
  }

  private checkpointPayload(payload: unknown): Record<string, unknown> {
    if (payload && typeof payload === 'object') {
      return { ...(payload as Record<string, unknown>) };
    }
    return { value: payload };
  }

  private async checkpoint(taskId: string, state: AutopilotState, payload: Record<string, unknown>): Promise<void> {
    const attempt = this.getAttempt(taskId, state);
    try {
      await this.deps.checkpoint?.save(taskId, state, payload, attempt);
    } catch (error) {
      logError('Failed to persist checkpoint', {
        taskId,
        state,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await this.deps.journal.record({
      taskId,
      state,
      attempt,
      payload,
    });
  }

  /**
   * Validate and advance work process phase before state transition
   * CRITICAL: Enforces STRATEGIZE→SPEC→PLAN→THINK→IMPLEMENT→VERIFY→REVIEW→PR→MONITOR sequence
   * Throws StateGraphError on illegal phase skips
   */
  private async advanceWorkPhase(taskId: string, nextState: AutopilotState): Promise<void> {
    if (!this.deps.workProcessEnforcer) {
      return; // Enforcer not configured, allow transition
    }

    try {
      const phaseMap: Record<AutopilotState, WorkPhase> = {
        specify: 'SPEC',
        plan: 'PLAN',
        thinker: 'THINK',
        implement: 'IMPLEMENT',
        verify: 'VERIFY',
        review: 'REVIEW',
        pr: 'PR',
        monitor: 'MONITOR'
      };

      const desiredPhase = phaseMap[nextState];

      if (!desiredPhase) {
        throw new StateGraphError(
          `phase_skip: Unknown desired phase for state ${nextState}`,
          nextState,
          { taskId }
        );
      }

      // Advance to next phase in work process
      // This validates evidence and checks for phase skips
      const advanced = await this.deps.workProcessEnforcer.advancePhase(taskId, desiredPhase);

      if (!advanced) {
        // Phase advancement was rejected (e.g., missing evidence, drift detected)
        throw new StateGraphError(
          `phase_skip: Cannot advance to ${nextState} - work process enforcement blocked transition`,
          nextState,
          {
            taskId,
            requiredPhase: desiredPhase,
            reason: 'Phase advancement validation failed'
          }
        );
      }

      logInfo('Work process phase advanced', {
        taskId,
        nextState,
        enforcement: 'pass'
      });
    } catch (error) {
      if (error instanceof StateGraphError) {
        throw error;
      }

      // If enforcer throws, this is a critical failure - fail closed
      logError('Work process enforcement failed', {
        taskId,
        nextState,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new StateGraphError(
        `phase_skip: Work process enforcer error during transition to ${nextState}`,
        nextState,
        {
          taskId,
          error: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  private async emitContextPack(
    agent: 'Planner' | 'Thinker' | 'Implementer' | 'Verifier' | 'Reviewer' | 'Critical' | 'Supervisor',
    payload: Omit<Parameters<ContextAssembler['emit']>[0], 'agent'>
  ): Promise<void> {
    if (!this.deps.contextAssembler) {
      return;
    }
    try {
      const uri = await this.deps.contextAssembler.emit({ agent, ...payload });
      this.recordContextPack(payload.taskId, agent, uri);
    } catch (error) {
      logWarning('Context assembler failed', {
        agent,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private recordContextPack(taskId: string, agent: string, uri: string | undefined): void {
    if (!uri) {
      return;
    }
    const slot = agent.toLowerCase();
    this.deps.memory.set(taskId, slot, 'context_pack_uri', uri);
    const existing = this.contextPackRefs.get(taskId) ?? {};
    existing[agent] = uri;
    this.contextPackRefs.set(taskId, existing);
  }

  private attachContextPackArtifacts(taskId: string, artifacts: Record<string, unknown>): void {
    const packs = this.contextPackRefs.get(taskId);
    if (packs) {
      artifacts.contextPacks = packs;
    }
    this.contextPackRefs.delete(taskId);
  }

  private extractFileHints(task: TaskEnvelope): string[] {
    const files = task.metadata?.files;
    if (Array.isArray(files)) {
      return files.filter((value): value is string => typeof value === 'string');
    }
    return [];
  }

  private extractTestHints(task: TaskEnvelope): string[] {
    const tests = task.metadata?.tests;
    if (Array.isArray(tests)) {
      return tests.filter((value): value is string => typeof value === 'string');
    }
    return [];
  }

  private deriveScopeSignal(task: TaskEnvelope): { filesTouched: number; approxChangedLines: number } {
    const files = this.extractFileHints(task);
    const lines = task.metadata?.approx_lines;
    return {
      filesTouched: files.length || 1,
      approxChangedLines: typeof lines === 'number' ? lines : Math.max(files.length * 40, 40),
    };
  }

  private defaultConstraints(task: TaskEnvelope): string[] {
    const constraints = [];
    if (task.metadata?.perf_budget) {
      constraints.push(`Perf budget ${task.metadata.perf_budget}`);
    }
    constraints.push('No secrets in context');
    constraints.push('Respect router locked models');
    return constraints;
  }

  private async runMutationSmoke(taskId: string, patchHash: string): Promise<boolean> {
    logInfo('Mutation smoke (stub) executed', { taskId, patchHash });
    return true;
  }

  private async runAppSmoke(taskId: string, attempt: number): Promise<SmokeCommandResult> {
    let emittedLogs = false;
    const command = new SmokeCommand({
      workspaceRoot: this.workspaceRoot,
      onChunk: (chunk) => {
        if (chunk.trim().length > 0) {
          emittedLogs = true;
        }
        this.appendSmokeLog(taskId, attempt, chunk);
      },
    });
    const result = await command.run();
    if (!emittedLogs && result.log.length === 0) {
      this.appendSmokeLog(taskId, attempt, '[app-smoke] (no output captured)');
    }
    return result;
  }

  private appendSmokeLog(taskId: string, attempt: number, chunk: string): void {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      return;
    }
    this.deps.journal
      .record({
        taskId,
        state: 'monitor-smoke',
        attempt,
        notes: lines,
      })
      .catch((error: Error) => {
        logWarning('Failed to record smoke log', {
          taskId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /**
   * Record metrics for completed task
   */
  private async recordMetrics(
    task: TaskEnvelope,
    complexity: ReturnType<ComplexityRouter['assessComplexity']>,
    result: StateGraphResult | null,
    statesVisited: Set<AutopilotState>,
    routerDecisions: Array<{ state: AutopilotState; selection: ModelSelection }>,
    startTime: number,
    verifierResult?: VerifierResult
  ): Promise<void> {
    if (!this.deps.metricsCollector) {
      return; // Metrics collection disabled
    }

    try {
      const endTime = performance.now();
      const durationMs = endTime - startTime;

      // Infer task type
      const { taskType, confidence } = inferTaskType(task);

      // Extract model info from router decisions
      const lastDecision = routerDecisions[routerDecisions.length - 1];
      const modelProvider = (lastDecision?.selection.provider ?? 'unknown') as MetricsTags['modelProvider'];
      const modelTier = lastDecision?.selection.model;

      // Build tags
      // Map complexity score to tier label
      const complexityTier: MetricsTags['complexityTier'] =
        complexity.score <= 3 ? 'low' :
        complexity.score <= 6 ? 'medium' :
        complexity.score <= 8 ? 'high' : 'critical';

      const tags: MetricsTags = {
        taskId: task.id,
        taskType,
        taskTypeConfidence: confidence,
        complexityTier,
        complexityScore: complexity.score,
        epic: task.metadata?.epic as string | undefined,
        milestone: task.metadata?.milestone as string | undefined,
        modelProvider,
        modelTier,
        usedComplexityRouter: true, // Always true in StateGraph
        usedWIPController: false, // Tracked at UnifiedOrchestrator level
        usedThinkStage: statesVisited.has('thinker'),
        usedResolutionEngine: statesVisited.has('verify'), // Resolution runs after verify
      };

      // Quality metrics
      // Extract coverage and regression info from verifier result
      const testCoverageDelta = verifierResult?.coverageDelta ?? 0;
      // Detect regression: if verify ran but tests failed, it's a regression
      const testsGate = verifierResult?.gateResults.find((g) => g.name === 'tests.run');
      const regressionIntroduced = statesVisited.has('verify') && testsGate?.success === false;

      const quality: QualityMetrics = {
        taskSucceeded: result?.success ?? false,
        firstPassReview: statesVisited.has('review') && !this.planDeltaRequired.has(task.id),
        iterationCount: routerDecisions.length, // Approximate - each decision represents an iteration
        testCoverageDelta,
        regressionIntroduced,
      };

      // Efficiency metrics
      // Estimate tokens and cost based on complexity and model tier
      // Note: These are estimates based on model tier pricing, not actual measured values
      // Actual token tracking would require instrumentation at model execution layer
      let estimatedTokens = 0;
      let estimatedCost = 0;

      if (routerDecisions.length > 0) {
        // Sum estimated cost across all router decisions (iterations)
        for (const decision of routerDecisions) {
          // Use simple estimation formula: baseTokens = 1500 + (complexity.score * 250)
          // This matches the logic in model_router.ts estimateTaskCost
          const baseTokens = 1500 + (complexity.score * 250);
          estimatedTokens += baseTokens;

          // Estimate cost based on model tier (rough pricing from ModelRegistry)
          // Base tier: $0.015/1K tokens
          let costPer1K = 0.015; // Default to base tier pricing
          const modelName = decision.selection.model.toLowerCase();
          if (modelName.includes('mini') || modelName.includes('small')) {
            costPer1K = 0.003; // Small models are cheaper
          } else if (modelName.includes('premium') || modelName.includes('max')) {
            costPer1K = 0.075; // Premium models are more expensive
          }
          estimatedCost += (baseTokens / 1000) * costPer1K;
        }
      }

      const efficiency: EfficiencyMetrics = {
        durationMs,
        promptTokens: Math.floor(estimatedTokens * 0.7), // Rough estimate: 70% prompt, 30% completion
        completionTokens: Math.floor(estimatedTokens * 0.3),
        totalTokens: estimatedTokens,
        costUsd: estimatedCost,
        retryOverheadTokens: routerDecisions.length > 1 ? Math.floor(estimatedTokens * 0.2) : 0, // 20% overhead for retries
      };

      // Learning metrics
      const learning: LearningMetrics = {};

      // System health metrics
      const systemHealth: SystemHealthMetrics = {
        providerAvailable: true,
        rateLimitHit: false,
        circuitBreakerTripped: false,
      };

      await this.deps.metricsCollector.recordTask(tags, quality, efficiency, learning, systemHealth);
      await this.deps.metricsCollector.flush();
    } catch (error) {
      logWarning('Failed to record metrics', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
