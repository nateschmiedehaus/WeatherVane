import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionOutcome } from "../orchestrator/agent_pool.js";
import { ClaudeCodeCoordinator } from "../orchestrator/claude_code_coordinator.js";
import type { AssembledContext } from "../orchestrator/context_assembler.js";
import type { QualityMonitor } from "../orchestrator/quality_monitor.js";
import type { OperationsManager } from "../orchestrator/operations_manager.js";
import type { SchedulingReason, TaskScheduler } from "../orchestrator/task_scheduler.js";
import type { Task, TaskStatus } from "../orchestrator/state_machine.js";
import type { LiveFlagsReader } from "../orchestrator/live_flags.js";
import { DEFAULT_LIVE_FLAGS } from "../state/live_flags.js";

describe("ClaudeCodeCoordinator – network failure handling", () => {
  it("marks a task blocked when agents report a network failure", async () => {
    const task: Task = {
      id: "T-network",
      title: "Investigate network failure handling",
      status: "pending",
      type: "task",
      created_at: Date.now(),
      estimated_complexity: 3,
    };

    const scheduledTask = {
      task,
      priority: 42,
      reason: "dependencies_cleared" as SchedulingReason,
    };

    const agent = {
      id: "codex_worker_1",
      type: "codex" as const,
      role: "engineer" as const,
      baseRole: "engineer" as const,
      status: "idle" as const,
      completedTasks: 0,
      failedTasks: 0,
      avgDurationSeconds: 0,
    };

    const networkFailure: ExecutionOutcome = {
      success: false,
      output: "ERROR: error sending request for url (https://api.openai.com/v1/responses)",
      durationSeconds: 0,
      failureType: "network",
    };

    const agentPool = {
      assignTask: vi.fn().mockResolvedValue(agent),
      executeWithCodex: vi.fn().mockResolvedValue(networkFailure),
      getAvailableAgents: vi.fn().mockReturnValue([agent]),
      hasAvailableAgent: vi.fn().mockReturnValue(true),
      getCoordinatorType: vi.fn().mockReturnValue("claude_code"),
      isCoordinatorAvailable: vi.fn().mockReturnValue(true),
      getUsageRatio: vi.fn().mockReturnValue({ codex: 0, claude: 0, ratio: 0 }),
      completeTask: vi.fn(),
      promoteCoordinatorRole: vi.fn(),
    } as unknown as import("../orchestrator/agent_pool.js").AgentPool;

    const scheduler = Object.assign(new EventEmitter(), {
      getQueueLength: vi.fn().mockReturnValue(0),
      getQueueMetrics: vi.fn().mockReturnValue({
        updatedAt: Date.now(),
        size: 0,
        reasonCounts: {
          requires_review: 0,
          requires_follow_up: 0,
          dependencies_cleared: 0,
        },
        heads: {
          requires_review: [] as Array<{ id: string; title: string; priority: number }>,
          requires_follow_up: [] as Array<{ id: string; title: string; priority: number }>,
          dependencies_cleared: [] as Array<{ id: string; title: string; priority: number }>,
        },
        resource: {
          heavyTaskLimit: 1,
          activeHeavyTasks: 0,
          queuedHeavyTasks: 0,
        },
      }),
      releaseTask: vi.fn(),
      completeTask: vi.fn(),
    }) as unknown as TaskScheduler;

    const stateMachine = Object.assign(new EventEmitter(), {
      getTask: vi.fn().mockReturnValue(task),
      assignTask: vi.fn().mockReturnValue(task),
      transition: vi.fn(),
      recordQuality: vi.fn(),
      getAverageQualityScore: vi.fn().mockReturnValue(0.9),
      getRoadmapHealth: vi.fn().mockReturnValue({
        totalTasks: 1,
        pendingTasks: 1,
        inProgressTasks: 0,
        completedTasks: 0,
        blockedTasks: 0,
        completionRate: 0,
        averageQualityScore: 0.9,
        currentPhase: "foundation",
      }),
      getTasks: vi.fn().mockReturnValue([task]),
    }) as unknown as import("../orchestrator/state_machine.js").StateMachine;

    const context: AssembledContext = {
      task,
      relatedTasks: [],
      relevantDecisions: [],
      relevantConstraints: [],
      recentLearnings: [],
      qualityIssuesInArea: [],
      overallQualityTrend: [],
      filesToRead: [],
      projectPhase: "foundation",
      velocityMetrics: {
        tasksCompletedToday: 0,
        averageTaskDuration: 0,
        qualityTrendOverall: "stable",
      },
    };

    const contextAssembler = {
      assembleForTask: vi.fn().mockResolvedValue(context),
      formatForPromptCompact: vi.fn().mockReturnValue("{}"),
      formatForPrompt: vi.fn().mockReturnValue("{}"),
    } as unknown as import("../orchestrator/context_assembler.js").ContextAssembler;

    const qualityMonitor = {
      evaluate: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as QualityMonitor;

    const operationsObserver = {
      getSnapshot: vi.fn().mockReturnValue(undefined),
      handleNetworkFailure: vi.fn(),
    } as unknown as OperationsManager;

    const liveFlags: LiveFlagsReader = {
      get: () => ({ ...DEFAULT_LIVE_FLAGS }),
      getValue: (key) => DEFAULT_LIVE_FLAGS[key],
    };

    const coordinator = new ClaudeCodeCoordinator(
      process.cwd(),
      stateMachine,
      scheduler,
      agentPool,
      contextAssembler,
      liveFlags,
      qualityMonitor,
      undefined,
      operationsObserver,
      operationsObserver,
      undefined
    );

    await (coordinator as unknown as { executeTask(task: typeof scheduledTask): Promise<void> }).executeTask(
      scheduledTask
    );

    expect(scheduler.releaseTask).toHaveBeenCalledWith(task.id);
    expect(agentPool.completeTask).toHaveBeenCalledWith(task.id, false, 0, {
      failureType: "network",
    });

    const transitionCalls = (stateMachine.transition as ReturnType<typeof vi.fn>).mock.calls;
    const blockedTransition = transitionCalls.find(([, status]) => status === "blocked");
    expect(blockedTransition).toBeTruthy();
    const [, , metadata] = blockedTransition as [string, TaskStatus, Record<string, unknown>];
    expect(metadata).toMatchObject({
      blocker_reason: "network_offline",
      quality_issues: ["network_error"],
    });

    expect(operationsObserver.handleNetworkFailure).toHaveBeenCalledWith(
      task.id,
      agent.id,
      agent.type,
      networkFailure.output
    );
  });
});
