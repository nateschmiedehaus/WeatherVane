import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Agent } from "../orchestrator/agent_pool.js";
import { ClaudeCodeCoordinator } from "../orchestrator/claude_code_coordinator.js";
import type { AssembledContext } from "../orchestrator/context_assembler.js";
import type { SchedulingReason } from "../orchestrator/task_scheduler.js";
import type { Task } from "../orchestrator/state_machine.js";
import { standardPromptHeader } from "../utils/prompt_headers.js";
import type { LiveFlagsReader } from "../orchestrator/live_flags.js";
import { DEFAULT_LIVE_FLAGS } from "../state/live_flags.js";

describe("ClaudeCodeCoordinator prompt header integration", () => {
  const originalProjectName = process.env.WVO_PROJECT_NAME;
  const originalEnvironment = process.env.WVO_ENVIRONMENT;

  beforeEach(() => {
    process.env.WVO_PROJECT_NAME = "WeatherVane";
    process.env.WVO_ENVIRONMENT = "production";
  });

  afterEach(() => {
    if (originalProjectName === undefined) {
      delete process.env.WVO_PROJECT_NAME;
    } else {
      process.env.WVO_PROJECT_NAME = originalProjectName;
    }

    if (originalEnvironment === undefined) {
      delete process.env.WVO_ENVIRONMENT;
    } else {
      process.env.WVO_ENVIRONMENT = originalEnvironment;
    }
  });

  it("prepends the standard prompt header to composed prompts", () => {
    const task: Task = {
      id: "T-header",
      title: "Ensure prompts include standard header",
      status: "pending",
      type: "task",
      created_at: Date.now(),
      estimated_complexity: 3,
    };

    const agent: Agent = {
      id: "codex-1",
      type: "codex",
      role: "engineer",
      baseRole: "engineer",
      status: "idle",
      completedTasks: 0,
      failedTasks: 0,
      avgDurationSeconds: 0,
    };

    const context: AssembledContext = {
      task,
      relatedTasks: [],
      relevantDecisions: [],
      relevantConstraints: [],
      recentLearnings: [],
      qualityIssuesInArea: [],
      overallQualityTrend: [],
      filesToRead: [],
      projectPhase: "PHASE-5",
      velocityMetrics: {
        tasksCompletedToday: 0,
        averageTaskDuration: 0,
        qualityTrendOverall: "stable",
      },
    };

    const contextAssembler = {
      formatForPromptCompact: vi.fn().mockReturnValue("{\"evidence\": []}"),
      formatForPrompt: vi.fn().mockReturnValue("{\"evidence\": []}"),
    } as unknown as import("../orchestrator/context_assembler.js").ContextAssembler;

    const liveFlags: LiveFlagsReader = {
      get: () => ({ ...DEFAULT_LIVE_FLAGS }),
      getValue: (key) => DEFAULT_LIVE_FLAGS[key],
    };

    const coordinator = new ClaudeCodeCoordinator(
      process.cwd(),
      new EventEmitter() as unknown as import("../orchestrator/state_machine.js").StateMachine,
      new EventEmitter() as unknown as import("../orchestrator/task_scheduler.js").TaskScheduler,
      {
        assignTask: vi.fn(),
        completeTask: vi.fn(),
        executeWithCodex: vi.fn(),
        getAvailableAgents: vi.fn().mockReturnValue([agent]),
        hasAvailableAgent: vi.fn().mockReturnValue(true),
        getCoordinatorType: vi.fn().mockReturnValue("claude_code"),
        isCoordinatorAvailable: vi.fn().mockReturnValue(true),
        getUsageRatio: vi.fn().mockReturnValue({ codex: 0, claude: 0, ratio: 0 }),
        promoteCoordinatorRole: vi.fn(),
      } as unknown as import("../orchestrator/agent_pool.js").AgentPool,
      contextAssembler,
      liveFlags,
      {
        evaluate: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
      } as unknown as import("../orchestrator/quality_monitor.js").QualityMonitor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    const prompt = (coordinator as unknown as {
      composePrompt(
        task: Task,
        agent: Agent,
        context: AssembledContext,
        options: { reason: SchedulingReason }
      ): string;
    }).composePrompt(task, agent, context, { reason: "dependencies_cleared" });

    const expectedHeader = standardPromptHeader({
      projectName: "WeatherVane",
      projectPhase: context.projectPhase,
      environment: "production",
      promptMode: "compact",
      agentType: agent.type,
      agentRole: agent.role,
      intent: "execute",
    });

    expect(prompt.startsWith(`${expectedHeader}\n\n`)).toBe(true);
    expect(prompt).toContain("WeatherVane Execution Brief");
  });
});
