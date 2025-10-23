import { AgentPool } from './agent_pool.js';
import { AgentCoordinator } from './agent_coordinator.js';
import { ContextAssembler } from './context_assembler.js';
import { OperationsManager } from './operations_manager.js';
import { ResilienceManager } from './resilience_manager.js';
import { WebInspirationManager } from './web_inspiration_manager.js';
import { QualityMonitor } from './quality_monitor.js';
import { TaskScheduler } from './task_scheduler.js';
import { StateMachine } from './state_machine.js';
import { SelfImprovementManager } from './self_improvement_manager.js';
import { LiveFlags } from '../state/live_flags.js';
import { FeatureGates } from './feature_gates.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { AuthChecker } from '../utils/auth_checker.js';
import { CodeSearchIndex } from '../utils/code_search.js';
import { deriveResourceLimits, loadActiveDeviceProfile } from '../utils/device_profile.js';
import { isDryRunEnabled } from '../utils/dry_run.js';
import { ResearchManager } from '../intelligence/research_manager.js';
import { ResearchOrchestrator } from './research_orchestrator.js';
import { TokenEfficiencyManager } from './token_efficiency_manager.js';
import { ModelManager } from '../models/model_manager.js';
import { CriticModelSelector } from '../utils/critic_model_selector.js';
import { ActivityFeedWriter } from './activity_feed_writer.js';
import { HolisticReviewManager, type HolisticReviewStatus } from './holistic_review_manager.js';
import { browserManager } from '../utils/browser.js';

export interface OrchestratorRuntimeOptions {
  codexWorkers?: number;
  targetCodexRatio?: number;
  enableAutoRestart?: boolean;
  maxRestartsPerWindow?: number;
  restartWindowMinutes?: number;
  heavyTaskLimit?: number;
  enableClaudeCoordinator?: boolean;
  holisticReview?: {
    minTasksPerGroup?: number;
    maxGroupIntervalMinutes?: number;
    maxTasksTracked?: number;
    globalIntervalMinutes?: number;
    globalMinTasks?: number;
  };
}

export class OrchestratorRuntime {
  private readonly stateMachine: StateMachine;
  private readonly scheduler: TaskScheduler;
  private readonly agentPool: AgentPool;
  private readonly contextAssembler: ContextAssembler;
  private readonly qualityMonitor: QualityMonitor;
  private readonly operationsManager: OperationsManager;
  private readonly resilienceManager: ResilienceManager;
  private readonly webInspirationManager: WebInspirationManager | undefined;
  private readonly selfImprovementManager: SelfImprovementManager;
  private readonly coordinator: AgentCoordinator;
  private readonly codeSearchIndex: CodeSearchIndex;
  private readonly liveFlags: LiveFlags;
  private readonly featureGates: FeatureGates;
  private readonly researchManager: ResearchManager | undefined;
  private readonly researchOrchestrator: ResearchOrchestrator | undefined;
  private readonly tokenEfficiencyManager?: TokenEfficiencyManager;
  private readonly modelManager: ModelManager;
  private readonly criticModelSelector: CriticModelSelector;
  private readonly activityFeed?: ActivityFeedWriter;
  // NEW: Enhanced orchestration features (opt-in via live flags)
  private readonly criticReputationTracker?: import('./critic_reputation_tracker.js').CriticReputationTracker;
  private readonly decisionEvidenceLinker?: import('../telemetry/decision_evidence_linker.js').DecisionEvidenceLinker;
  // Promise caches to prevent race conditions in lazy loading
  private criticReputationTrackerPromise?: Promise<import('./critic_reputation_tracker.js').CriticReputationTracker | null>;
  private decisionEvidenceLinkerPromise?: Promise<import('../telemetry/decision_evidence_linker.js').DecisionEvidenceLinker | null>;
  private readonly holisticReviewManager: HolisticReviewManager;
  private started = false;

  constructor(
    private readonly workspaceRoot: string,
    options: OrchestratorRuntimeOptions = {}
  ) {
    const deviceProfile = loadActiveDeviceProfile(workspaceRoot);
    const resourcePlan = deriveResourceLimits(deviceProfile);
    const codexWorkers = options.codexWorkers ?? resourcePlan.codexWorkers;
    const enableClaudeCoordinator = options.enableClaudeCoordinator ?? process.env.WVO_DISABLE_CLAUDE !== '1';
    const heavyTaskLimit = options.heavyTaskLimit ?? resourcePlan.heavyTaskConcurrency;

    const dryRun = isDryRunEnabled();
    this.stateMachine = new StateMachine(workspaceRoot, { readonly: dryRun });
    this.liveFlags = new LiveFlags({ workspaceRoot });
    this.featureGates = new FeatureGates(this.liveFlags);
    browserManager.setLiveFlags(this.liveFlags);
    browserManager.setFeatureGates(this.featureGates);
    this.modelManager = new ModelManager(workspaceRoot);
    const researchFlagEnabled = this.featureGates.isResearchLayerEnabled();
    this.researchManager = researchFlagEnabled
      ? new ResearchManager({ stateMachine: this.stateMachine })
      : undefined;
    if (researchFlagEnabled) {
      logInfo('Strategic research layer enabled');
    }
    const researchSensitivity = this.featureGates.getResearchTriggerSensitivity();
    this.scheduler = new TaskScheduler(this.stateMachine, {
      heavyTaskLimit,
      researchSignalsEnabled: researchFlagEnabled,
      researchSensitivity,
    });
    this.scheduler.setResearchConfig({
      enabled: researchFlagEnabled,
      sensitivity: researchSensitivity,
    });
    if (this.researchManager) {
      this.researchOrchestrator = new ResearchOrchestrator(
        this.scheduler,
        this.researchManager,
        this.stateMachine,
      );
    } else {
      this.researchOrchestrator = undefined;
    }
    this.agentPool = new AgentPool();
    this.criticModelSelector = new CriticModelSelector(
      workspaceRoot,
      this.modelManager,
      this.agentPool.getUsageEstimator()
    );
    this.codeSearchIndex = new CodeSearchIndex(this.stateMachine, workspaceRoot);
    this.contextAssembler = new ContextAssembler(this.stateMachine, workspaceRoot, {
      codeSearch: this.codeSearchIndex,
      liveFlags: this.liveFlags,
      featureGates: this.featureGates,
      maxHistoryItems: 3,
    });
    this.qualityMonitor = new QualityMonitor(this.stateMachine, {
      workspaceRoot,
      liveFlags: this.liveFlags,
    });
    this.operationsManager = new OperationsManager(
      this.stateMachine,
      this.scheduler,
      this.agentPool,
      this.qualityMonitor,
      {
        targetCodexRatio: options.targetCodexRatio,
        liveFlags: this.liveFlags,
      }
    );
    if (!dryRun) {
      this.tokenEfficiencyManager = new TokenEfficiencyManager(
        workspaceRoot,
        this.operationsManager,
      );
    }
    this.resilienceManager = new ResilienceManager(
      this.stateMachine,
      this.agentPool
    );

    // Initialize self-improvement manager
    this.selfImprovementManager = new SelfImprovementManager(
      this.stateMachine,
      {
        workspaceRoot,
        enableAutoRestart: options.enableAutoRestart ?? true,
        maxRestartsPerWindow: options.maxRestartsPerWindow ?? 3,
        restartWindowMinutes: options.restartWindowMinutes ?? 10,
        restartScriptPath: './scripts/restart_mcp.sh',
      }
    );

    // Listen to self-improvement events
    this.selfImprovementManager.on('restart:success', (data) => {
      logInfo('Self-improvement restart successful', data);
    });

    this.selfImprovementManager.on('restart:failed', (data) => {
      logError('Self-improvement restart failed', data);
    });

    this.selfImprovementManager.on('meta-work:complete', (data) => {
      logInfo('🎉 MCP infrastructure complete, transitioning to product work', data);
    });

    this.selfImprovementManager.on('product-work:unblocked', (data) => {
      logInfo('Product work tasks unblocked', data);
    });

    // NEW: Initialize enhanced orchestration features (opt-in, lazy-loaded)
    // These will be initialized on first use via getter methods

    // Lazy-load WebInspirationManager only when enabled for efficiency
    this.webInspirationManager = process.env.WVO_ENABLE_WEB_INSPIRATION === '1'
      ? new WebInspirationManager(workspaceRoot, this.stateMachine, this.operationsManager)
      : undefined;

    this.coordinator = new AgentCoordinator(
      workspaceRoot,
      this.stateMachine,
      this.scheduler,
      this.agentPool,
      this.contextAssembler,
      this.liveFlags,
      this.featureGates,
      this.qualityMonitor,
      this.webInspirationManager,
      this.operationsManager,
      this.operationsManager,
      this.resilienceManager,
      this.selfImprovementManager,
      this.modelManager
    );

    this.activityFeed = new ActivityFeedWriter({
      workspaceRoot,
      stateMachine: this.stateMachine,
      scheduler: this.scheduler,
      agentPool: this.agentPool,
      operationsManager: this.operationsManager,
      coordinator: this.coordinator,
    });

    const holisticOptions = options.holisticReview ?? {};
    this.holisticReviewManager = new HolisticReviewManager(this.stateMachine, {
      minTasksPerGroup: holisticOptions.minTasksPerGroup,
      maxGroupIntervalMs: holisticOptions.maxGroupIntervalMinutes
        ? holisticOptions.maxGroupIntervalMinutes * 60 * 1000
        : undefined,
      maxTasksTracked: holisticOptions.maxTasksTracked,
      globalIntervalMs: holisticOptions.globalIntervalMinutes
        ? holisticOptions.globalIntervalMinutes * 60 * 1000
        : undefined,
      globalMinTasks: holisticOptions.globalMinTasks,
      dryRun,
    });

    logInfo('Adaptive resource scheduling initialised', {
      codexWorkers,
      heavyTaskLimit,
      recommendedConcurrency: resourcePlan.recommendedConcurrency,
      hasAccelerator: resourcePlan.hasAccelerator,
      deviceProfileId: resourcePlan.profileId,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    void this.performAuthCheck();
    await this.modelManager.initialize();
    await this.criticModelSelector.load();
    this.coordinator.start();
    this.holisticReviewManager.start();
    logInfo('Orchestrator runtime started');
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.coordinator.stop();
    this.operationsManager.stop();
    this.tokenEfficiencyManager?.dispose();
    this.modelManager.stop();
    this.activityFeed?.stop();
    this.holisticReviewManager.stop();
    this.scheduler.destroy();
    this.researchOrchestrator?.dispose();
    this.agentPool.removeAllListeners();
    this.qualityMonitor.removeAllListeners();
    this.liveFlags.dispose();
    this.stateMachine.close();
    logInfo('Orchestrator runtime stopped');
  }

  isStarted(): boolean {
    return this.started;
  }

  getOperationsManager(): OperationsManager {
    return this.operationsManager;
  }

  getResilienceManager(): ResilienceManager {
    return this.resilienceManager;
  }

  getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  getAgentPool(): AgentPool {
    return this.agentPool;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  getLiveFlags(): LiveFlags {
    return this.liveFlags;
  }

  getFeatureGates(): FeatureGates {
    return this.featureGates;
  }

  getResearchManager(): ResearchManager | undefined {
    return this.researchManager;
  }

  getResearchOrchestrator(): ResearchOrchestrator | undefined {
    return this.researchOrchestrator;
  }

  getWebInspirationManager(): WebInspirationManager | undefined {
    return this.webInspirationManager;
  }

  getSelfImprovementManager(): SelfImprovementManager {
    return this.selfImprovementManager;
  }

  getImprovementStatus() {
    return this.selfImprovementManager.getStatus();
  }

  getModelManager(): ModelManager {
    return this.modelManager;
  }

  getCriticModelSelector(): CriticModelSelector {
    return this.criticModelSelector;
  }

  getHolisticReviewStatus(): HolisticReviewStatus {
    return this.holisticReviewManager.getStatus();
  }

  // NEW: Lazy-loaded enhanced orchestration features
  async getCriticReputationTracker() {
    // Return cached promise to prevent race conditions
    if (this.criticReputationTrackerPromise) {
      return this.criticReputationTrackerPromise;
    }

    const enabled = this.liveFlags.getValue('CRITIC_REPUTATION') === '1';
    if (!enabled) {
      return null;
    }

    // Cache the promise immediately to prevent concurrent loads
    this.criticReputationTrackerPromise = (async () => {
      const { CriticReputationTracker } = await import('./critic_reputation_tracker.js');
      const tracker = new CriticReputationTracker(this.stateMachine);
      logInfo('Critic reputation tracking initialized');
      return tracker;
    })();

    return this.criticReputationTrackerPromise;
  }

  async getDecisionEvidenceLinker() {
    // Return cached promise to prevent race conditions
    if (this.decisionEvidenceLinkerPromise) {
      return this.decisionEvidenceLinkerPromise;
    }

    const enabled = this.liveFlags.getValue('EVIDENCE_LINKING') === '1';
    if (!enabled) {
      return null;
    }

    // Cache the promise immediately to prevent concurrent loads
    this.decisionEvidenceLinkerPromise = (async () => {
      const { DecisionEvidenceLinker } = await import('../telemetry/decision_evidence_linker.js');
      const linker = new DecisionEvidenceLinker(this.stateMachine);
      logInfo('Decision evidence linking initialized');
      return linker;
    })();

    return this.decisionEvidenceLinkerPromise;
  }

  private parseResearchSensitivity(raw: string): number {
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) {
      return 0.5;
    }
    if (parsed <= 0) return 0;
    if (parsed >= 1) return 1;
    return Math.round(parsed * 100) / 100;
  }

  private async performAuthCheck(): Promise<void> {
    try {
      const checker = new AuthChecker();
      const status = await checker.checkAll();
      if (!status.codex.authenticated) {
        logWarning('Codex authentication missing', { guidance: 'Run `codex login` or configure state/accounts.yaml and rerun login.' });
      }
      if (!status.claude_code.authenticated) {
        logWarning('Claude authentication missing', { guidance: 'Run `claude login` with the configured CLAUDE_CONFIG_DIR.' });
      }
    } catch (error) {
      logWarning('Authentication check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
