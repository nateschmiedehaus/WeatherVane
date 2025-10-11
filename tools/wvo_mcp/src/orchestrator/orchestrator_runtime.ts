import { AgentPool } from './agent_pool.js';
import { ClaudeCodeCoordinator } from './claude_code_coordinator.js';
import { ContextAssembler } from './context_assembler.js';
import { OperationsManager } from './operations_manager.js';
import { WebInspirationManager } from './web_inspiration_manager.js';
import { QualityMonitor } from './quality_monitor.js';
import { TaskScheduler } from './task_scheduler.js';
import { StateMachine } from './state_machine.js';
import { SelfImprovementManager } from './self_improvement_manager.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { AuthChecker } from '../utils/auth_checker.js';

export interface OrchestratorRuntimeOptions {
  codexWorkers?: number;
  targetCodexRatio?: number;
  enableAutoRestart?: boolean;
  maxRestartsPerWindow?: number;
  restartWindowMinutes?: number;
}

export class OrchestratorRuntime {
  private readonly stateMachine: StateMachine;
  private readonly scheduler: TaskScheduler;
  private readonly agentPool: AgentPool;
  private readonly contextAssembler: ContextAssembler;
  private readonly qualityMonitor: QualityMonitor;
  private readonly operationsManager: OperationsManager;
  private readonly webInspirationManager: WebInspirationManager | undefined;
  private readonly selfImprovementManager: SelfImprovementManager;
  private readonly coordinator: ClaudeCodeCoordinator;
  private started = false;

  constructor(
    private readonly workspaceRoot: string,
    options: OrchestratorRuntimeOptions = {}
  ) {
    const codexWorkers = options.codexWorkers ?? 3;

    this.stateMachine = new StateMachine(workspaceRoot);
    this.scheduler = new TaskScheduler(this.stateMachine);
    this.agentPool = new AgentPool(workspaceRoot, codexWorkers);
    this.contextAssembler = new ContextAssembler(this.stateMachine, workspaceRoot);
    this.qualityMonitor = new QualityMonitor(this.stateMachine);
    this.operationsManager = new OperationsManager(
      this.stateMachine,
      this.scheduler,
      this.agentPool,
      this.qualityMonitor,
      {
        targetCodexRatio: options.targetCodexRatio,
      }
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
      this.qualityMonitor,
      this.webInspirationManager,
      this.operationsManager,
      this.operationsManager,
      this.selfImprovementManager
    );
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
    this.agentPool.removeAllListeners();
    this.qualityMonitor.removeAllListeners();
    this.stateMachine.close();
    logInfo('Orchestrator runtime stopped');
  }

  getOperationsManager(): OperationsManager {
    return this.operationsManager;
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

  getWebInspirationManager(): WebInspirationManager | undefined {
    return this.webInspirationManager;
  }

  getSelfImprovementManager(): SelfImprovementManager {
    return this.selfImprovementManager;
  }

  getImprovementStatus() {
    return this.selfImprovementManager.getStatus();
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
