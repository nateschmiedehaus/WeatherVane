# Coordinator Failover Strategy
## Allow Codex to act as Coordinator when Claude unavailable

**Date**: October 10, 2025
**Priority**: CRITICAL (missing resilience feature)

---

## Problem

Currently the system assumes Claude Code is always available as coordinator:
- Claude Code = Staff Engineer/Architect (complexity ≥8, reviews, strategic)
- Codex = Engineering Team (implementation, tests, docs)

**What happens when Claude hits rate limits?**
- All high-complexity tasks (≥8) block waiting for Claude
- All reviews block
- System becomes bottlenecked on single agent

**Need**: Codex must be able to act as coordinator when Claude unavailable.

---

## Solution: Dynamic Role Promotion

### 1. **Agent Role Flexibility**

Update `AgentPool` to support role promotion:

```typescript
export interface Agent {
  id: string;
  type: AgentType;
  role: AgentRole; // Can change at runtime
  baseRole: AgentRole; // Original role assignment
  status: 'idle' | 'busy' | 'failed';
  currentTask?: string;
  completedTasks: number;
  failedTasks: number;
  avgDurationSeconds: number;
  lastUsed?: number;
  cooldownUntil?: number;
  promotedAt?: number; // When promoted to coordinator
}

export class AgentPool extends EventEmitter {
  private coordinatorType: AgentType = 'claude_code'; // Default
  private coordinatorCandidates: string[] = []; // Eligible for promotion

  constructor(
    private workspaceRoot: string,
    private codexWorkers: number = 3
  ) {
    super();
    this.initializeAgents();
  }

  private initializeAgents(): void {
    // Initialize Claude Code coordinator
    this.agents.set('claude_code', {
      id: 'claude_code',
      type: 'claude_code',
      role: 'architect',
      baseRole: 'architect',
      status: 'idle',
      completedTasks: 0,
      failedTasks: 0,
      avgDurationSeconds: 0
    });

    // Initialize Codex workers
    for (let i = 1; i <= this.codexWorkers; i++) {
      const agent = {
        id: `codex_worker_${i}`,
        type: 'codex',
        role: i === 1 ? 'engineer' : i === 2 ? 'qa' : 'engineer',
        baseRole: i === 1 ? 'engineer' : i === 2 ? 'qa' : 'engineer',
        status: 'idle',
        completedTasks: 0,
        failedTasks: 0,
        avgDurationSeconds: 0
      };

      this.agents.set(agent.id, agent);

      // First Codex worker is eligible for coordinator promotion
      if (i === 1) {
        this.coordinatorCandidates.push(agent.id);
      }
    }
  }

  /**
   * Promote Codex to coordinator role
   */
  promoteCoordinatorRole(reason: string): void {
    const claudeAgent = this.agents.get('claude_code');
    if (!claudeAgent) return;

    // Check if Claude is actually unavailable
    if (claudeAgent.status !== 'idle' && claudeAgent.cooldownUntil) {
      const timeRemaining = claudeAgent.cooldownUntil - Date.now();
      if (timeRemaining > 0) {
        // Claude is on cooldown - promote Codex
        const candidate = this.coordinatorCandidates[0];
        if (candidate) {
          const codexAgent = this.agents.get(candidate);
          if (codexAgent) {
            codexAgent.role = 'architect';
            codexAgent.promotedAt = Date.now();
            this.coordinatorType = 'codex';

            logWarning('Promoted Codex to coordinator role', {
              codexId: candidate,
              reason,
              claudeCooldownRemaining: Math.round(timeRemaining / 1000) + 's'
            });

            this.emit('coordinator:promoted', {
              from: 'claude_code',
              to: candidate,
              reason,
              cooldownSeconds: Math.round(timeRemaining / 1000)
            });
          }
        }
      }
    }
  }

  /**
   * Demote Codex back to engineer role when Claude available
   */
  demoteCoordinatorRole(): void {
    const claudeAgent = this.agents.get('claude_code');
    if (!claudeAgent) return;

    // Check if Claude is now available
    const isClaudeAvailable = claudeAgent.status === 'idle' &&
                               (!claudeAgent.cooldownUntil || claudeAgent.cooldownUntil <= Date.now());

    if (isClaudeAvailable && this.coordinatorType === 'codex') {
      // Demote Codex back to engineer
      const candidate = this.coordinatorCandidates[0];
      if (candidate) {
        const codexAgent = this.agents.get(candidate);
        if (codexAgent && codexAgent.role === 'architect') {
          codexAgent.role = codexAgent.baseRole;
          codexAgent.promotedAt = undefined;
          this.coordinatorType = 'claude_code';

          logInfo('Demoted Codex back to engineer, Claude available again', {
            codexId: candidate
          });

          this.emit('coordinator:demoted', {
            from: candidate,
            to: 'claude_code'
          });
        }
      }
    }
  }

  /**
   * Get current coordinator agent type
   */
  getCoordinatorType(): AgentType {
    return this.coordinatorType;
  }

  /**
   * Check if coordinator is available
   */
  isCoordinatorAvailable(): boolean {
    const coordinatorAgent = this.coordinatorType === 'claude_code'
      ? this.agents.get('claude_code')
      : this.agents.get(this.coordinatorCandidates[0]);

    if (!coordinatorAgent) return false;

    return coordinatorAgent.status === 'idle' &&
           (!coordinatorAgent.cooldownUntil || coordinatorAgent.cooldownUntil <= Date.now());
  }
}
```

---

### 2. **Operations Manager Integration**

Update `OperationsManager` to monitor coordinator availability:

```typescript
export class OperationsManager extends EventEmitter implements ExecutionObserver {
  private lastCoordinatorCheck = 0;
  private readonly COORDINATOR_CHECK_INTERVAL = 30000; // Check every 30s

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly scheduler: TaskScheduler,
    private readonly agentPool: AgentPool,
    private readonly qualityMonitor: QualityMonitor,
    options: OperationsManagerOptions = {}
  ) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.telemetryExporter = new TelemetryExporter(this.stateMachine.getWorkspaceRoot());

    // Listen for agent cooldowns to trigger coordinator check
    this.agentPool.on('agent:cooldown', (data: any) => {
      if (data.agentId === 'claude_code') {
        this.checkCoordinatorAvailability('claude_cooldown');
      }
    });

    this.agentPool.on('agent:cooldown_cleared', (data: any) => {
      if (data.agentId === 'claude_code') {
        this.checkCoordinatorAvailability('claude_available');
      }
    });

    // Periodic check
    setInterval(() => {
      this.checkCoordinatorAvailability('periodic');
    }, this.COORDINATOR_CHECK_INTERVAL);

    // ... existing setup ...
  }

  handleRateLimit(agentId: string, agentType: 'codex' | 'claude_code', retryAfterSeconds: number, message: string): void {
    this.rateLimitCounters[agentType] += 1;

    // If Claude hits rate limit, promote Codex
    if (agentId === 'claude_code') {
      this.agentPool.promoteCoordinatorRole(`claude_rate_limit:${retryAfterSeconds}s`);
    }

    logWarning('Rate limit encountered', {
      agentId,
      agentType,
      retryAfterSeconds,
      message,
      counters: this.rateLimitCounters,
      coordinatorType: this.agentPool.getCoordinatorType()
    });

    this.emit('maintenance:rate_limit', { agentId, agentType, retryAfterSeconds, message });
    this.recomputeStrategy('rate_limit');
  }

  private checkCoordinatorAvailability(trigger: string): void {
    const now = Date.now();
    const currentCoordinator = this.agentPool.getCoordinatorType();

    // If Claude is coordinator, no action needed
    if (currentCoordinator === 'claude_code') {
      return;
    }

    // If Codex is coordinator, check if we can demote back to Claude
    if (currentCoordinator === 'codex') {
      this.agentPool.demoteCoordinatorRole();

      const newCoordinator = this.agentPool.getCoordinatorType();
      if (newCoordinator === 'claude_code') {
        logInfo('Coordinator switched back to Claude Code', {
          trigger,
          previousCoordinator: 'codex'
        });

        this.emit('coordinator:switched', {
          from: 'codex',
          to: 'claude_code',
          trigger
        });
      }
    }
  }

  getSnapshot(): OperationsSnapshot {
    const snapshot = { ...this.buildSnapshot() };

    // Add coordinator info
    return {
      ...snapshot,
      coordinatorType: this.agentPool.getCoordinatorType(),
      coordinatorAvailable: this.agentPool.isCoordinatorAvailable()
    };
  }
}
```

---

### 3. **Task Routing Adjustments**

Update routing logic in `AgentCoordinator`:

```typescript
private recommendAgentType(task: Task, context: AssembledContext): AgentType {
  const coordinatorType = this.agentPool.getCoordinatorType();

  // If Codex is acting as coordinator, adjust routing rules
  if (coordinatorType === 'codex') {
    // In Codex-coordinator mode:
    // - Use promoted Codex for high-complexity tasks
    // - Reviews still go to coordinator
    // - Implementation can use any available Codex worker

    if (task.status === 'needs_review') {
      return 'codex'; // Codex coordinator handles reviews
    }

    const complexity = task.estimated_complexity ?? 5;
    if (complexity >= 8) {
      return 'codex'; // Codex coordinator handles complex tasks
    }

    // Check context for architectural signals
    const hasArchitecturalDecisions = context.relevantDecisions.length > 3;
    const hasQualityIssues = context.qualityIssuesInArea.length > 0;

    if (hasArchitecturalDecisions || hasQualityIssues) {
      return 'codex'; // Codex coordinator for strategic work
    }

    return 'codex'; // Default to Codex workers
  }

  // Normal mode: Claude is coordinator
  if (task.status === 'needs_review') {
    return 'claude_code';
  }

  const complexity = task.estimated_complexity ?? 5;
  if (complexity >= 8) {
    return 'claude_code';
  }

  // Check for architectural/design work
  const title = task.title.toLowerCase();
  const description = (task.description || '').toLowerCase();
  const keywords = ['architecture', 'design', 'refactor', 'strategy', 'quality', 'review', 'analyze'];

  if (keywords.some(kw => title.includes(kw) || description.includes(kw))) {
    return 'claude_code';
  }

  // Check context for complexity signals
  const hasArchitecturalDecisions = context.relevantDecisions.length > 3;
  const hasQualityIssues = context.qualityIssuesInArea.length > 0;

  if (hasArchitecturalDecisions || hasQualityIssues) {
    return 'claude_code';
  }

  // Default to Codex for implementation work
  return 'codex';
}
```

---

### 4. **Monitoring and Observability**

Add telemetry for coordinator switches:

```typescript
// In OperationsManager.emitTelemetry()
private emitTelemetry(snapshot: OperationsSnapshot): void {
  const record: Record<string, unknown> = {
    type: 'operations_snapshot',
    mode: snapshot.mode,
    avgQuality: Number(snapshot.avgQuality.toFixed(3)),
    failureRate: Number(snapshot.failureRate.toFixed(3)),
    queueLength: snapshot.queueLength,
    codexUsagePercent: Number(snapshot.codexUsagePercent.toFixed(2)),
    claudeUsagePercent: Number(snapshot.claudeUsagePercent.toFixed(2)),
    blockedTasks: snapshot.blockedTasks,
    totalTasks: snapshot.totalTasks,
    rateLimitCodex: snapshot.rateLimitCodex,
    rateLimitClaude: snapshot.rateLimitClaude,

    // ✅ Add coordinator tracking
    coordinatorType: snapshot.coordinatorType,
    coordinatorAvailable: snapshot.coordinatorAvailable
  };

  const presetMix = this.formatPresetMix(snapshot.codexPresetStats);
  if (presetMix.length > 0) {
    record.presetMix = presetMix;
  }

  this.telemetryExporter.append(record);
}
```

---

### 5. **MCP Tools Update**

Update `orchestrator_status` tool to show coordinator info:

```typescript
// In index-orchestrator.ts
server.registerTool(
  'orchestrator_status',
  {
    description: `Get real-time orchestration status and metrics.

Shows:
- Agent pool status (Claude Code + Codex workers)
- Current coordinator (Claude or Codex)
- Task queue health
- Quality metrics
- Recent failures and recoveries
- System health

Use this to monitor autonomous operation.`,
    inputSchema: z.object({}).shape
  },
  async (_input: unknown) => {
    try {
      const snapshot = opsManager.getSnapshot();
      const health = stateMachine.getRoadmapHealth();
      const resilienceMetrics = resilience.getMetrics();

      return formatData({
        coordinator: {
          type: snapshot.coordinatorType,
          available: snapshot.coordinatorAvailable,
          note: snapshot.coordinatorType === 'codex'
            ? 'Codex promoted due to Claude unavailability'
            : 'Claude Code acting as primary coordinator'
        },
        agents: {
          total: snapshot.agent_pool.total_agents,
          busy: snapshot.agent_pool.busy_agents,
          idle: snapshot.agent_pool.idle_agents,
          codex_usage: `${snapshot.agent_pool.codex_usage_percent.toFixed(1)}%`,
          claude_usage: `${snapshot.agent_pool.claude_usage_percent.toFixed(1)}%`,
          target_ratio: targetCodexRatio
        },
        // ... rest of status ...
      }, '🎯 Orchestrator Status');
    } catch (error) {
      return formatError('Failed to get status', error instanceof Error ? error.message : String(error));
    }
  }
);
```

---

## Behavior Matrix

| Scenario | Claude Status | Codex Role | Task Routing |
|----------|--------------|------------|--------------|
| **Normal** | Available | Engineer | Complexity ≥8 → Claude, <8 → Codex |
| **Claude Rate Limited** | Cooldown | Promoted to Architect | All tasks → Codex (promoted handles strategic) |
| **Claude Returns** | Available | Demoted to Engineer | Back to normal: ≥8 → Claude, <8 → Codex |
| **Both Limited** | Cooldown | Cooldown | Queue stalls, wait for cooldown expiry |

---

## Testing Strategy

```typescript
// Test coordinator failover
async function testCoordinatorFailover() {
  const runtime = new OrchestratorRuntime('/path/to/workspace', {
    codexWorkers: 3
  });

  const agentPool = runtime.getAgentPool();

  // 1. Verify initial state
  console.assert(agentPool.getCoordinatorType() === 'claude_code');

  // 2. Simulate Claude rate limit
  agentPool.imposeCooldown('claude_code', 300, 'usage_limit');

  // 3. Verify Codex promotion
  agentPool.promoteCoordinatorRole('test');
  console.assert(agentPool.getCoordinatorType() === 'codex');

  // 4. Wait for cooldown expiry or clear it
  agentPool.clearCooldown('claude_code');

  // 5. Verify automatic demotion
  agentPool.demoteCoordinatorRole();
  console.assert(agentPool.getCoordinatorType() === 'claude_code');

  console.log('✅ Coordinator failover test passed');
}
```

---

## Impact

**Before**: System bottlenecked when Claude hits rate limits
**After**: Seamless failover to Codex, automatic switchback when Claude available

**Estimated Uptime Improvement**: 95% → 99.5%
