/**
 * MCP Server with Orchestration Runtime
 *
 * This is the NEW entry point that uses the full orchestration system:
 * - StateMachine (SQLite backend)
 * - AgentPool (Claude Code + Codex workers)
 * - TaskScheduler (dependency resolution)
 * - QualityMonitor (continuous validation)
 * - ResilienceManager (rate/context limit handling)
 * - ClaudeCodeCoordinator (event-driven orchestration)
 */

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'node:path';

import { OrchestratorRuntime } from './orchestrator/orchestrator_runtime.js';
import type { TaskType, TaskStatus } from './orchestrator/state_machine.js';
import { logInfo, logError, logWarning } from './telemetry/logger.js';
import { formatData, formatError, formatSuccess } from './utils/response_formatter.js';
import { InspirationFetcher } from './web_tools/inspiration_fetcher.js';
import { SERVER_NAME, SERVER_VERSION } from './utils/version.js';
import { toJsonSchema } from './utils/schema.js';
import { normalizeClusterSpec } from './utils/cluster.js';

// ============================================================================
// Configuration
// ============================================================================

function resolveWorkspaceRoot(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      return path.resolve(args[i + 1]);
    }
  }
  return process.cwd();
}

const workspaceRoot = resolveWorkspaceRoot();

const codexWorkers = parseInt(process.env.CODEX_WORKERS || '3', 10);
const targetCodexRatio = parseFloat(process.env.TARGET_CODEX_RATIO || '5.0');

// ============================================================================
// Main Server
// ============================================================================

async function main() {
  logInfo('🚀 WVO MCP Server (Orchestrator) starting', {
    workspace: workspaceRoot,
    codexWorkers,
    targetCodexRatio
  });

  // Initialize orchestration runtime
  const runtime = new OrchestratorRuntime(workspaceRoot, {
    codexWorkers,
    targetCodexRatio
  });

  const stateMachine = runtime.getStateMachine();
  const opsManager = runtime.getOperationsManager();
  const webInspirationManager = runtime.getWebInspirationManager();
  const inspirationFetcher = new InspirationFetcher(runtime.getWorkspaceRoot());
  const emptyObjectSchema = toJsonSchema(z.object({}), 'EmptyObjectInput');

  // Initialize resilience manager
  const resilience = runtime.getResilienceManager();

  // Handle graceful shutdown
  const shutdown = () => {
    logInfo('Shutting down orchestrator runtime...');
    runtime.stop();
    void inspirationFetcher.dispose();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the autonomous orchestration loop
  runtime.start();

  logInfo('✅ Orchestration runtime started');

  // ============================================================================
  // MCP Server Setup
  // ============================================================================

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION
    },
    {
      capabilities: {}
    }
  );

  // ============================================================================
  // Orchestrator Tools
  // ============================================================================

  // Status - Get runtime metrics
  server.registerTool(
    'orchestrator_status',
    {
      description: `Get real-time orchestration status and metrics.

Shows:
- Agent pool status (Claude Code + Codex workers)
- Task queue health
- Quality metrics
- Recent failures and recoveries
- System health

Use this to monitor autonomous operation.`,
      inputSchema: emptyObjectSchema
    },
    async (_input: unknown) => {
      try {
        const snapshot = opsManager.getSnapshot();
        if (!snapshot) {
          return formatError('No snapshot available');
        }

        const health = stateMachine.getRoadmapHealth();
        const resilienceMetrics = resilience.getMetrics();
        const coordinatorType = snapshot.coordinatorType === 'claude_code' ? 'claude' : 'codex';
        const costsSnapshot = snapshot.costs;
        const codexCosts = costsSnapshot.providers.codex;
        const claudeCosts = costsSnapshot.providers.claude_code;

        return formatData({
          coordinator: {
            type: coordinatorType,
            available: snapshot.coordinatorAvailable,
            reason: snapshot.coordinatorReason
          },
          agents: {
            total: snapshot.agent_pool.total_agents,
            busy: snapshot.agent_pool.busy_agents,
            idle: snapshot.agent_pool.idle_agents,
            codex_usage: `${snapshot.agent_pool.codex_usage_percent.toFixed(1)}%`,
            claude_usage: `${snapshot.agent_pool.claude_usage_percent.toFixed(1)}%`,
            target_ratio: targetCodexRatio
          },
          queue: {
            ready: snapshot.queue.ready_count,
            pending: snapshot.queue.pending_count,
            review: snapshot.queue.review_count,
            improvement: snapshot.queue.improvement_count,
            batches: snapshot.queue.batches
          },
          roadmap: {
            total_tasks: health.totalTasks,
            completed: health.completedTasks,
            completion_rate: `${(health.completionRate * 100).toFixed(1)}%`,
            phase: health.currentPhase
          },
          quality: {
            average_score: health.averageQualityScore.toFixed(2),
            recent_executions: snapshot.quality.total_executions,
            average_duration: `${snapshot.quality.avg_duration_seconds.toFixed(0)}s`
          },
          token_budget: {
            average_prompt_tokens: snapshot.tokenMetrics.averagePromptTokens.toFixed(1),
            average_completion_tokens: snapshot.tokenMetrics.averageCompletionTokens.toFixed(1),
            average_total_tokens: snapshot.tokenMetrics.averageTotalTokens.toFixed(1),
            pressure: snapshot.tokenMetrics.pressure,
            target_prompt_budget: snapshot.tokenMetrics.targetPromptBudget,
            cache_eligible_executions: snapshot.tokenMetrics.cacheEligibleExecutions,
            cache_hit_executions: snapshot.tokenMetrics.cacheHitExecutions,
            cache_store_executions: snapshot.tokenMetrics.cacheStoreExecutions,
            cache_hit_rate_percent: `${(snapshot.tokenMetrics.cacheHitRate * 100).toFixed(1)}%`
          },
          costs: {
            last_hour_usd: Number(costsSnapshot.lastHourUSD.toFixed(2)),
            last_24h_usd: Number(costsSnapshot.last24hUSD.toFixed(2)),
            budget_pressure: (() => {
              if (costsSnapshot.alerts.some((alert) => alert.severity === 'critical')) {
                return 'critical';
              }
              if (costsSnapshot.alerts.some((alert) => alert.severity === 'warning')) {
                return 'warning';
              }
              return 'normal';
            })(),
            providers: {
              codex: {
                last_hour_usd: Number(codexCosts.lastHourUSD.toFixed(2)),
                last_24h_usd: Number(codexCosts.last24hUSD.toFixed(2)),
                hourly_limit_usd: codexCosts.budget.hourlyLimitUSD ?? null,
                daily_limit_usd: codexCosts.budget.dailyLimitUSD ?? null,
                hourly_utilization_percent:
                  codexCosts.hourlyUtilizationPercent !== null
                    ? Number(codexCosts.hourlyUtilizationPercent.toFixed(1))
                    : null,
                daily_utilization_percent:
                  codexCosts.dailyUtilizationPercent !== null
                    ? Number(codexCosts.dailyUtilizationPercent.toFixed(1))
                    : null,
                alert_threshold_percent: Number(
                  (codexCosts.budget.alertThresholdPercent * 100).toFixed(1),
                ),
                status: codexCosts.status,
              },
              claude_code: {
                last_hour_usd: Number(claudeCosts.lastHourUSD.toFixed(2)),
                last_24h_usd: Number(claudeCosts.last24hUSD.toFixed(2)),
                hourly_limit_usd: claudeCosts.budget.hourlyLimitUSD ?? null,
                daily_limit_usd: claudeCosts.budget.dailyLimitUSD ?? null,
                hourly_utilization_percent:
                  claudeCosts.hourlyUtilizationPercent !== null
                    ? Number(claudeCosts.hourlyUtilizationPercent.toFixed(1))
                    : null,
                daily_utilization_percent:
                  claudeCosts.dailyUtilizationPercent !== null
                    ? Number(claudeCosts.dailyUtilizationPercent.toFixed(1))
                    : null,
                alert_threshold_percent: Number(
                  (claudeCosts.budget.alertThresholdPercent * 100).toFixed(1),
                ),
                status: claudeCosts.status,
              },
            },
            alerts: costsSnapshot.alerts.map((alert) => ({
              severity: alert.severity,
              provider: alert.provider,
              period: alert.period,
              utilization_percent: Number(alert.utilizationPercent.toFixed(1)),
              limit_usd: Number(alert.limitUSD.toFixed(2)),
              actual_usd: Number(alert.actualUSD.toFixed(2)),
              message: alert.message,
            })),
          },
          validation: {
            total_failures: snapshot.validation.totalFailures,
            failures_last_hour: snapshot.validation.failuresLastHour,
            recent_failure_rate_percent: `${(snapshot.validation.recentFailureRate * 100).toFixed(1)}%`,
            failures_by_code: snapshot.validation.failuresByCode,
          shadow_failures: snapshot.validation.shadowFailures,
          enforced_failures: snapshot.validation.enforcedFailures,
          mode: snapshot.validation.mode,
          canary_acknowledged: snapshot.validation.canaryAcknowledged,
          retry_rate_percent: `${(snapshot.validation.retryRate * 100).toFixed(1)}%`,
          recoveries: {
            retries: snapshot.validation.recoveries.retries,
            reassignments: snapshot.validation.recoveries.reassignments,
            failures: snapshot.validation.recoveries.failures,
            last_recovery_at: snapshot.validation.recoveries.lastRecoveryAt
              ? new Date(snapshot.validation.recoveries.lastRecoveryAt).toISOString()
              : null,
          },
        },
        resilience: {
          tasks_with_retries: resilienceMetrics.tasksWithRetries,
          total_retry_attempts: resilienceMetrics.totalRetryAttempts,
          recent_context_limits: resilienceMetrics.recentContextLimits
        },
          inspiration: {
            enabled: snapshot.webInspiration.enabled,
            total_fetches: snapshot.webInspiration.totalFetches,
            successes: snapshot.webInspiration.successes,
            cache_hits: snapshot.webInspiration.cacheHits,
            failures: snapshot.webInspiration.failures,
            average_duration_ms: snapshot.webInspiration.averageDurationMs,
            average_size_kb: snapshot.webInspiration.averageSizeKb,
            top_categories: snapshot.webInspiration.topCategories
          },
          health_status: snapshot.health_status
        }, '🎯 Orchestrator Status');
      } catch (error) {
        return formatError('Failed to get status', error instanceof Error ? error.message : String(error));
      }
    }
  );

  // Self-Improvement Status - Get self-modification and phase completion status
  server.registerTool(
    'self_improvement_status',
    {
      description: `Get self-improvement and phase completion status.

Shows:
- Meta-work completion (MCP infrastructure phases)
- Recent self-modification restarts
- Phase completion status (PHASE-1, PHASE-2, PHASE-3)
- Restart loop risk detection
- Product work unblocking status

Use this to monitor the orchestrator's self-improvement cycle and transition to product work.`,
      inputSchema: emptyObjectSchema
    },
    async (_input: unknown) => {
      try {
        const status = runtime.getImprovementStatus();

        return formatData({
          meta_work_complete: status.metaWorkComplete,
          phases: status.phases.map((phase) => ({
            phase: phase.phase,
            complete: phase.complete,
            task_count: phase.taskIds.length,
            task_ids: phase.taskIds,
            last_checked: new Date(phase.lastChecked).toISOString()
          })),
          recent_restarts: status.recentRestarts.map((restart) => ({
            timestamp: new Date(restart.timestamp).toISOString(),
            task_id: restart.taskId,
            reason: restart.reason,
            success: restart.success
          })),
          restart_loop_risk: status.restartLoopRisk,
          message: status.metaWorkComplete
            ? '✅ MCP infrastructure complete - Working on product features'
            : '🔧 MCP infrastructure in progress - Self-improvement mode'
        }, '🚀 Self-Improvement Status');
      } catch (error) {
        return formatError('Failed to get self-improvement status', error instanceof Error ? error.message : String(error));
      }
    }
  );

  // Web inspiration capture
  const webInspirationCaptureInput = z.object({
    url: z.string().url(),
    taskId: z.string().optional(),
    viewport: z
      .object({
        width: z.number().min(640).max(3840),
        height: z.number().min(480).max(2160)
      })
      .optional(),
    timeoutMs: z.number().min(1000).max(15000).optional()
  });
  const webInspirationCaptureSchema = toJsonSchema(
    webInspirationCaptureInput,
    'WebInspirationCaptureInput'
  );

  server.registerTool(
    'web_inspiration_capture',
    {
      description: `Capture a screenshot and HTML snapshot of a website for design inspiration.

Parameters:
- url (required): Must be part of the allow list (default: awwwards.com, dribbble.com, behance.net, cssnectar.com, siteinspire.com)
- taskId (optional): When provided, caches assets under state/web_inspiration/<taskId>
- viewport (optional): { width, height } for screenshot (defaults to 1920x1080)
- timeoutMs (optional): Navigation timeout in milliseconds (default 10000)

Returns: screenshot path, HTML snapshot path, and metadata including size and duration. If assets already exist for the task they are returned from cache.`,
      inputSchema: webInspirationCaptureSchema
    },
    async (input: unknown) => {
      try {
        const parsed = webInspirationCaptureInput.parse(input);

        const result = await inspirationFetcher.capture(parsed);

        if (!result.success) {
          return formatError('Failed to capture web inspiration', result.error ?? 'Unknown error');
        }

        return formatSuccess('Web inspiration captured', {
          screenshot: result.screenshotPath,
          html: result.htmlPath,
          metadata: result.metadata
        });
      } catch (error) {
        return formatError('Failed to capture web inspiration', error instanceof Error ? error.message : String(error));
      }
    }
  );

  const webInspirationStatusInput = z.object({
    taskId: z.string().optional(),
    limit: z.number().min(1).max(100).optional()
  });
  const webInspirationStatusSchema = toJsonSchema(
    webInspirationStatusInput,
    'WebInspirationStatusInput'
  );

  server.registerTool(
    'web_inspiration_status',
    {
      description: `List cached web inspiration assets.

Parameters:
- taskId (optional): Filter by specific task
- limit (optional): Maximum number of results (default 20)

Returns: metadata for each inspiration asset including relative paths, sizes, and timestamps.` ,
      inputSchema: webInspirationStatusSchema
    },
    async (input: unknown) => {
      try {
        if (!webInspirationManager) {
          return formatError('Web inspiration feature is disabled', 'Set WVO_ENABLE_WEB_INSPIRATION=1 to enable');
        }

        const parsed = webInspirationStatusInput.parse(input ?? {});

        const assets = await webInspirationManager.listAssets({
          taskId: parsed.taskId,
          limit: parsed.limit
        });

        const formatted = assets.map((asset) => ({
          ...asset,
          screenshot: asset.screenshot ? path.relative(workspaceRoot, asset.screenshot) : undefined,
          html: asset.html ? path.relative(workspaceRoot, asset.html) : undefined
        }));

        return formatData({
          enabled: webInspirationManager.isEnabled(),
          total: formatted.length,
          assets: formatted
        }, '📸 Web Inspiration Assets');
      } catch (error) {
        return formatError('Failed to list inspiration assets', error instanceof Error ? error.message : String(error));
      }
    }
  );

  // Create Task
  const taskCreateInput = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(['epic', 'story', 'task', 'bug']).optional(),
    status: z.enum(['pending', 'in_progress', 'needs_review', 'needs_improvement', 'done', 'blocked']).optional(),
    epic_id: z.string().optional(),
    parent_id: z.string().optional(),
    estimated_complexity: z.number().int().min(1).max(10).optional(),
    depends_on: z.array(z.string()).optional(),
    cluster: z.object({
      id: z.string().min(1),
      instructions: z.string().optional(),
      tags: z.array(z.string().min(1)).optional(),
      strategy: z.enum(['clustered', 'sequential']).optional(),
      max_tasks_per_run: z.number().int().positive().optional()
    }).optional()
  });
  const taskCreateSchema = toJsonSchema(taskCreateInput, 'TaskCreateInput');

  server.registerTool(
    'task_create',
    {
      description: `Create a new task in the roadmap.

The orchestrator will automatically:
- Schedule it when dependencies are met
- Assign it to the best agent (Claude Code or Codex)
- Monitor quality continuously
- Handle failures with automatic retry

Parameters:
- id (required): Unique task ID (e.g., "T1.2.3")
- title (required): Task title
- description (optional): Detailed description
- type (optional): "epic", "story", "task", or "bug" (default: "task")
- status (optional): Initial status (default: "pending")
- epic_id (optional): Parent epic ID
- parent_id (optional): Parent task ID
- estimated_complexity (optional): 1-10 scale
- depends_on (optional): Array of task IDs this depends on

Example:
{
  "id": "T2.1.1",
  "title": "Implement weather feature caching",
  "description": "Add Redis caching for weather API calls",
  "type": "task",
  "estimated_complexity": 6,
  "depends_on": ["T2.1.0"]
}`,
      inputSchema: taskCreateSchema
      },
    async (input: unknown) => {
      try {
        const parsed = taskCreateInput.parse(input);

        const clusterSpec = normalizeClusterSpec(parsed.cluster);
        const metadata: Record<string, unknown> = {};
        if (clusterSpec) {
          metadata.cluster = clusterSpec;
        }

        // Create task
        const correlationBase = `mcp:task_create:${randomUUID()}`;
        const task = stateMachine.createTask({
          id: parsed.id,
          title: parsed.title,
          description: parsed.description,
          type: (parsed.type as TaskType) || 'task',
          status: (parsed.status as TaskStatus) || 'pending',
          epic_id: parsed.epic_id,
          parent_id: parsed.parent_id,
          estimated_complexity: parsed.estimated_complexity,
          metadata: Object.keys(metadata).length ? metadata : undefined
        }, `${correlationBase}:create`);

        // Add dependencies
        if (parsed.depends_on) {
          for (const depId of parsed.depends_on) {
            stateMachine.addDependency(parsed.id, depId, 'blocks');
          }
        }

        logInfo('Task created via MCP', { taskId: task.id, title: task.title });
        try {
          stateMachine.logEvent({
            timestamp: Date.now(),
            event_type: 'agent_decision',
            task_id: task.id,
            data: {
              tool: 'task_create',
              requested_status: task.status,
              depends_on: parsed.depends_on ?? [],
              cluster: clusterSpec ?? null,
            },
            correlation_id: `${correlationBase}:decision`,
          });
        } catch (error) {
          logWarning('Failed to record task_create event', {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        return formatSuccess(`Task ${task.id} created and scheduled`, {
          task_id: task.id,
          title: task.title,
          type: task.type,
          status: task.status,
          will_execute: 'Orchestrator will auto-assign when dependencies are met',
          correlation_id: correlationBase,
        });
      } catch (error) {
        return formatError('Failed to create task', error instanceof Error ? error.message : String(error));
      }
    }
  );

  // Get Task Status
  const taskStatusInput = z.object({
    task_id: z.string().min(1)
  });
  const taskStatusSchema = toJsonSchema(taskStatusInput, 'TaskStatusInput');

  server.registerTool(
    'task_status',
    {
      description: `Get detailed status of a specific task.

Shows:
- Current status and progress
- Assigned agent (if any)
- Dependencies and blockers
- Quality metrics
- Execution history

Parameters:
- task_id (required): Task ID to query`,
      inputSchema: taskStatusSchema
    },
    async (input: unknown) => {
      try {
        const parsed = taskStatusInput.parse(input);

        const task = stateMachine.getTask(parsed.task_id);
        if (!task) {
          return formatError(`Task not found: ${parsed.task_id}`);
        }

        // Get dependencies
        const deps = stateMachine.getDependencies(parsed.task_id);
        const dependents = stateMachine.getDependents(parsed.task_id);

        // Get quality metrics for this task
        const qualityMetrics = stateMachine.getQualityMetrics({ taskId: parsed.task_id });

        // Get recent events
        const events = stateMachine.getEvents({ taskId: parsed.task_id });
        const recentEvents = events.slice(-5);

        return formatData({
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            type: task.type,
            status: task.status,
            assigned_to: task.assigned_to || 'unassigned',
            complexity: task.estimated_complexity || 'not estimated',
            created_at: new Date(task.created_at).toISOString(),
            started_at: task.started_at ? new Date(task.started_at).toISOString() : null,
            completed_at: task.completed_at ? new Date(task.completed_at).toISOString() : null,
            duration: task.actual_duration_seconds ? `${Math.round(task.actual_duration_seconds / 60)}m` : null
          },
          dependencies: {
            blocks_on: deps.map(d => d.depends_on_task_id),
            blocked_by: dependents.map(d => d.task_id),
            is_ready: stateMachine.isTaskReady(parsed.task_id)
          },
          quality: qualityMetrics.map(m => ({
            dimension: m.dimension,
            score: m.score.toFixed(2),
            timestamp: new Date(m.timestamp).toISOString()
          })),
          recent_activity: recentEvents.map(e => ({
            type: e.event_type,
            timestamp: new Date(e.timestamp).toISOString(),
            agent: e.agent
          }))
        }, `📋 Task ${task.id}`);
      } catch (error) {
        return formatError('Failed to get task status', error instanceof Error ? error.message : String(error));
      }
    }
  );

  // List Ready Tasks
  server.registerTool(
    'tasks_ready',
    {
      description: `List tasks that are ready to be executed.

A task is "ready" when:
- Status is "pending"
- All blocking dependencies are complete
- No blockers

These are the tasks the orchestrator will assign next.

Parameters: none`,
      inputSchema: emptyObjectSchema
    },
    async (_input: unknown) => {
      try {
        const readyTasks = stateMachine.getReadyTasks();

        return formatData({
          count: readyTasks.length,
          tasks: readyTasks.map(t => ({
            id: t.id,
            title: t.title,
            type: t.type,
            complexity: t.estimated_complexity || 'unknown',
            epic_id: t.epic_id
          })),
          note: 'Orchestrator will auto-assign these tasks to available agents'
        }, `🎯 ${readyTasks.length} Ready Task(s)`);
      } catch (error) {
        return formatError('Failed to list ready tasks', error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ============================================================================
  // Connect and Start
  // ============================================================================

  const transport = new StdioServerTransport();
  await server.connect(transport as unknown as {
    start: () => Promise<void>;
    close: () => Promise<void>;
    send: (message: unknown) => Promise<void>;
  });

  logInfo('✅ MCP Server connected and ready', {
    tools: [
      'orchestrator_status',
      'self_improvement_status',
      'web_inspiration_capture',
      'web_inspiration_status',
      'task_create',
      'task_status',
      'tasks_ready'
    ]
  });
}

// ============================================================================
// Run
// ============================================================================

main().catch(error => {
  logError('Unhandled MCP server error', {
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  });
  process.exitCode = 1;
});
