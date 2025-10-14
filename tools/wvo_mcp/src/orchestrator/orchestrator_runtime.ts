import { AgentPool } from './agent_pool.js';
import { ClaudeCodeCoordinator } from './claude_code_coordinator.js';
import { ContextAssembler } from './context_assembler.js';
import { OperationsManager } from './operations_manager.js';
import { ResilienceManager } from './resilience_manager.js';
import { WebInspirationManager } from './web_inspiration_manager.js';
import { QualityMonitor } from './quality_monitor.js';
import { TaskScheduler } from './task_scheduler.js';
import { StateMachine } from './state_machine.js';
import { SelfImprovementManager } from './self_improvement_manager.js';
import { LiveFlags } from './live_flags.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { AuthChecker } from '../utils/auth_checker.js';
import { CodeSearchIndex } from '../utils/code_search.js';
import { deriveResourceLimits, loadActiveDeviceProfile } from '../utils/device_profile.js';
import { ResearchManager } from '../intelligence/research_manager.js';
import { ResearchOrchestrator } from './research_orchestrator.js';

export interface OrchestratorRuntimeOptions {
  codexWorkers?: number;
  targetCodexRatio?: number;
  enableAutoRestart?: boolean;
  maxRestartsPerWindow?: number;
  restartWindowMinutes?: number;
  heavyTaskLimit?: number;
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
  private readonly coordinator: ClaudeCodeCoordinator;
  private readonly codeSearchIndex: CodeSearchIndex;
  private readonly liveFlags: LiveFlags;
  private readonly researchManager: ResearchManager | undefined;
  private readonly researchOrchestrator: ResearchOrchestrator | undefined;
  private started = false;

  constructor(
    private readonly workspaceRoot: string,
    options: OrchestratorRuntimeOptions = {}
  ) {
    const deviceProfile = loadActiveDeviceProfile(workspaceRoot);
    const resourcePlan = deriveResourceLimits(deviceProfile);
    const codexWorkers = options.codexWorkers ?? resourcePlan.codexWorkers;
    const heavyTaskLimit = options.heavyTaskLimit ?? resourcePlan.heavyTaskConcurrency;

    this.stateMachine = new StateMachine(workspaceRoot);
    this.liveFlags = new LiveFlags({ workspaceRoot });
    const researchFlagEnabled = this.liveFlags.getValue('RESEARCH_LAYER') === '1';
    this.researchManager = researchFlagEnabled
      ? new ResearchManager({ stateMachine: this.stateMachine })
      : undefined;
    if (researchFlagEnabled) {
      logInfo('Strategic research layer enabled');
    }
    const researchSensitivity = this.parseResearchSensitivity(
      this.liveFlags.getValue('RESEARCH_TRIGGER_SENSITIVITY'),
    );
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
    this.agentPool = new AgentPool(workspaceRoot, codexWorkers);
    this.codeSearchIndex = new CodeSearchIndex(this.stateMachine, workspaceRoot);
    this.contextAssembler = new ContextAssembler(this.stateMachine, workspaceRoot, {
      codeSearch: this.codeSearchIndex,
      liveFlags: this.liveFlags,
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

    // Lazy-load WebInspirationManager only when enabled for efficiency
    this.webInspirationManager = process.env.WVO_ENABLE_WEB_INSPIRATION === '1'
      ? new WebInspirationManager(workspaceRoot, this.stateMachine, this.operationsManager)
      : undefined;

    this.coordinator = new ClaudeCodeCoordinator(
      workspaceRoot,
      this.stateMachine,
      this.scheduler,
      this.agentPool,
      this.contextAssembler,
      this.liveFlags,
      this.qualityMonitor,
      this.webInspirationManager,
      this.operationsManager,
      this.operationsManager,
      this.resilienceManager,
      this.selfImprovementManager
    );

    logInfo('Adaptive resource scheduling initialised', {
      codexWorkers,
      heavyTaskLimit,
      recommendedConcurrency: resourcePlan.recommendedConcurrency,
      hasAccelerator: resourcePlan.hasAccelerator,
      deviceProfileId: resourcePlan.profileId,
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.performAuthCheck();
    this.coordinator.start();
    logInfo('Orchestrator runtime started');
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.coordinator.stop();
    this.operationsManager.stop();
    this.scheduler.destroy();
    this.researchOrchestrator?.dispose();
    this.agentPool.removeAllListeners();
    this.qualityMonitor.removeAllListeners();
    this.liveFlags.dispose();
    this.stateMachine.close();
    logInfo('Orchestrator runtime stopped');
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
