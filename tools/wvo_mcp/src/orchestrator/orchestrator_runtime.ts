import { AgentPool } from './agent_pool.js';
import { ClaudeCodeCoordinator } from './claude_code_coordinator.js';
import { ContextAssembler } from './context_assembler.js';
import { OperationsManager } from './operations_manager.js';
import { WebInspirationManager } from './web_inspiration_manager.js';
import { QualityMonitor } from './quality_monitor.js';
import { TaskScheduler } from './task_scheduler.js';
import { StateMachine } from './state_machine.js';
import { logInfo, logWarning } from '../telemetry/logger.js';
import { AuthChecker } from '../utils/auth_checker.js';

export interface OrchestratorRuntimeOptions {
  codexWorkers?: number;
  targetCodexRatio?: number;
}

export class OrchestratorRuntime {
  private readonly stateMachine: StateMachine;
  private readonly scheduler: TaskScheduler;
  private readonly agentPool: AgentPool;
  private readonly contextAssembler: ContextAssembler;
  private readonly qualityMonitor: QualityMonitor;
  private readonly operationsManager: OperationsManager;
  private readonly webInspirationManager: WebInspirationManager | undefined;
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
      this.operationsManager
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

  getWebInspirationManager(): WebInspirationManager | undefined {
    return this.webInspirationManager;
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
