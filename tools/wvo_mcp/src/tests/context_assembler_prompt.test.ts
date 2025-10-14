import { describe, expect, it } from "vitest";

import { ContextAssembler } from "../orchestrator/context_assembler.js";
import type { LiveFlagsReader } from "../orchestrator/live_flags.js";
import type {
  ContextEntry,
  ContextEntryType,
  QualityMetric,
  RoadmapHealth,
  ResearchCacheRecord,
  StateMachine,
  Task,
  TaskDependency,
} from "../orchestrator/state_machine.js";

const TOKEN_ESTIMATE_CHAR_RATIO = 4;

class FakeStateMachine {
  private readonly tasks: Record<string, Task>;
  private readonly dependencies: Record<string, TaskDependency[]>;
  private readonly contextEntries: ContextEntry[];
  private readonly qualityMetrics: QualityMetric[];
  private readonly roadmapHealth: RoadmapHealth;
  private readonly researchCacheEntries: ResearchCacheRecord[];

  constructor(input: {
    tasks: Record<string, Task>;
    dependencies?: Record<string, TaskDependency[]>;
    contextEntries?: ContextEntry[];
    qualityMetrics?: QualityMetric[];
    roadmapHealth: RoadmapHealth;
    researchCacheEntries?: ResearchCacheRecord[];
  }) {
    this.tasks = input.tasks;
    this.dependencies = input.dependencies ?? {};
    this.contextEntries = input.contextEntries ?? [];
    this.qualityMetrics = input.qualityMetrics ?? [];
    this.roadmapHealth = input.roadmapHealth;
    this.researchCacheEntries = (input.researchCacheEntries ?? []).sort(
      (a, b) => (b.stored_at ?? 0) - (a.stored_at ?? 0)
    );
  }

  getTask(id: string): Task | null {
    return this.tasks[id] ?? null;
  }

  getDependencies(taskId: string): TaskDependency[] {
    return this.dependencies[taskId] ?? [];
  }

  getTasks(filter?: { status?: string[]; type?: string[] }): Task[] {
    const allTasks = Object.values(this.tasks);
    if (!filter) return allTasks;
    return allTasks.filter((task) => {
      const statusMatch = filter.status ? filter.status.includes(task.status) : true;
      const typeMatch = filter.type ? filter.type.includes(task.type) : true;
      return statusMatch && typeMatch;
    });
  }

  getContextEntries(filter?: { type?: ContextEntryType; since?: number }): ContextEntry[] {
    return this.contextEntries.filter((entry) => {
      const typeMatch = filter?.type ? entry.entry_type === filter.type : true;
      const sinceMatch = filter?.since ? entry.timestamp >= filter.since : true;
      return typeMatch && sinceMatch;
    });
  }

  getQualityMetrics(filter?: { taskId?: string; dimension?: string; since?: number }): QualityMetric[] {
    return this.qualityMetrics.filter((metric) => {
      const taskMatch = filter?.taskId ? metric.task_id === filter.taskId : true;
      const dimMatch = filter?.dimension ? metric.dimension === filter.dimension : true;
      const sinceMatch = filter?.since ? metric.timestamp >= filter.since : true;
      return taskMatch && dimMatch && sinceMatch;
    });
  }

  getRoadmapHealth(): RoadmapHealth {
    return this.roadmapHealth;
  }

  getWorkspaceRoot(): string {
    return process.cwd();
  }

  getRecentResearchCache(options: { limit?: number; kind?: string } = {}): ResearchCacheRecord[] {
    let records = this.researchCacheEntries;
    if (options.kind) {
      records = records.filter((record) => record.metadata?.kind === options.kind);
    }
    const limit = Math.max(0, options.limit ?? records.length);
    return records.slice(0, limit);
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_ESTIMATE_CHAR_RATIO);
}

describe("ContextAssembler prompt formatting", () => {
  it("produces prompts under budget even with verbose context", async () => {
    const longParagraph =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum vulputate, tellus nec porttitor tincidunt, nibh risus eleifend velit, non tincidunt dui augue vitae lectus.";
    const now = Date.now();

    const tasks: Record<string, Task> = {
      T1: {
        id: "T1",
        title: "Implement feature with exceptionally long descriptive text to validate prompt compaction",
        description: `${longParagraph} ${longParagraph} ${longParagraph}`,
        type: "task",
        status: "in_progress",
        created_at: now - 1000,
        estimated_complexity: 7,
      },
      T2: {
        id: "T2",
        title: "Dependency one with detailed explanation that could add bloat to the prompt if not truncated properly",
        type: "task",
        status: "done",
        created_at: now - 2000,
      },
      T3: {
        id: "T3",
        title: "Blocking dependency with verbose reasoning for being blocked due to multiple upstream issues",
        type: "task",
        status: "pending",
        created_at: now - 3000,
      },
    } as unknown as Record<string, Task>;

    const dependencies: Record<string, TaskDependency[]> = {
      T1: [
        { task_id: "T1", depends_on_task_id: "T2", dependency_type: "blocks" },
        { task_id: "T1", depends_on_task_id: "T3", dependency_type: "blocks" },
      ],
    };

    const contextEntries: ContextEntry[] = [
      {
        id: 1,
        timestamp: now - 100,
        entry_type: "decision",
        topic: "Architecture decision with extensive details extending beyond normal length",
        content: `${longParagraph} ${longParagraph}`,
      },
      {
        id: 2,
        timestamp: now - 50,
        entry_type: "constraint",
        topic: "Performance boundary condition",
        content: `${longParagraph} ${longParagraph}`,
      },
      {
        id: 3,
        timestamp: now - 30,
        entry_type: "learning",
        topic: "Recent discovery about rate limiting and retries",
        content: `${longParagraph} ${longParagraph}`,
      },
    ];

    const qualityMetrics: QualityMetric[] = [
      {
        id: 1,
        timestamp: now - 20,
        task_id: "T1",
        dimension: "code_elegance",
        score: 0.7,
      },
      {
        id: 2,
        timestamp: now - 10,
        task_id: "T1",
        dimension: "test_coverage",
        score: 0.65,
      },
    ];

    const stateMachine = new FakeStateMachine({
      tasks,
      dependencies,
      contextEntries,
      qualityMetrics,
      roadmapHealth: {
        totalTasks: 10,
        pendingTasks: 3,
        inProgressTasks: 2,
        completedTasks: 5,
        blockedTasks: 0,
        completionRate: 0.5,
        averageQualityScore: 0.82,
        currentPhase: "development",
      },
    }) as unknown as StateMachine;

    const assembler = new ContextAssembler(stateMachine, process.cwd(), {
      enableCodeSearch: false,
    });
    const assembled = await assembler.assembleForTask("T1", {
      includeCodeContext: true,
      includeQualityHistory: true,
      maxDecisions: 6,
      maxLearnings: 3,
      hoursBack: 24,
    });
    const verbosePrompt = assembler.formatForPrompt(assembled);
    const compactPrompt = assembler.formatForPromptCompact(assembled);
    const verboseTokens = estimateTokens(verbosePrompt);
    const compactTokens = estimateTokens(compactPrompt);

    expect(() => JSON.parse(compactPrompt)).not.toThrow();
    expect(compactTokens).toBeLessThanOrEqual(verboseTokens * 0.5);

    expect(verboseTokens).toBeLessThanOrEqual(600);
    expect(verbosePrompt.split("\n")).toBeTruthy();
  });

  it("surfaces research highlights when efficient operations enabled", async () => {
    const now = Date.now();
    const researchEntry: ContextEntry = {
      id: 1,
      entry_type: "learning",
      timestamp: now,
      topic: "Research insights: Cache warm strategies",
      content: "Incremental warming reduces cold-start latency by 40% in similar systems.",
      related_tasks: ["T-research"],
      confidence: 0.9,
      metadata: {
        trigger: { type: 'strategic-decision' },
      },
    } as ContextEntry;

    const stateMachine = new FakeStateMachine({
      tasks: {
        "T-research": {
          id: "T-research",
          title: "Design cache warm strategy",
          description: "Investigate better cache warming approaches",
          type: "task",
          status: "pending",
          created_at: now - 1000,
        } as Task,
      },
      contextEntries: [researchEntry],
      roadmapHealth: {
        totalTasks: 1,
        pendingTasks: 1,
        inProgressTasks: 0,
        completedTasks: 0,
        blockedTasks: 0,
        completionRate: 0,
        averageQualityScore: 0.9,
        currentPhase: "research",
      },
    });

    const liveFlags = {
      get: () => ({}),
      getValue: (key: string) => (key === 'EFFICIENT_OPERATIONS' ? '1' : '0'),
    } as unknown as LiveFlagsReader;

    const assembler = new ContextAssembler(stateMachine as unknown as StateMachine, process.cwd(), {
      enableCodeSearch: false,
      liveFlags,
    });

    const assembled = await assembler.assembleForTask("T-research");
    expect(assembled.researchHighlights).toBeDefined();
    expect(assembled.researchHighlights?.length).toBeGreaterThan(0);

    const prompt = assembler.formatForPrompt(assembled);
    expect(prompt).toContain("## Research Highlights");
  });

  it("falls back to research cache when no context entries exist", async () => {
    const now = Date.now();
    const tasks: Record<string, Task> = {
      "T-cache": {
        id: "T-cache",
        title: "Optimize cache warming pipeline",
        description: "Investigate academic best practices",
        type: "task",
        status: "pending",
        created_at: now,
      } as Task,
    } as unknown as Record<string, Task>;

    const researchCacheEntries: ResearchCacheRecord[] = [
      {
        cache_key: 'key-cache-topic',
        payload: [
          {
            title: 'Incremental cache warming reduces latency by 45%',
            summary: 'Detailed comparison of cache warming strategies.',
          },
        ],
        stored_at: now,
        expires_at: now + 7 * 24 * 60 * 60 * 1000,
        metadata: {
          kind: 'query',
          topic: 'cache warming pipeline',
        },
      },
    ];

    const stateMachine = new FakeStateMachine({
      tasks,
      roadmapHealth: {
        totalTasks: 1,
        pendingTasks: 1,
        inProgressTasks: 0,
        completedTasks: 0,
        blockedTasks: 0,
        completionRate: 0,
        averageQualityScore: 0.9,
        currentPhase: "research",
      },
      researchCacheEntries,
    }) as unknown as StateMachine;

    const liveFlags = {
      get: () => ({}),
      getValue: (key: string) => (key === 'EFFICIENT_OPERATIONS' ? '1' : '0'),
    } as unknown as LiveFlagsReader;

    const assembler = new ContextAssembler(stateMachine, process.cwd(), {
      enableCodeSearch: false,
      liveFlags,
    });

    const assembled = await assembler.assembleForTask('T-cache');
    expect(assembled.researchHighlights).toBeDefined();
    expect(assembled.researchHighlights?.some((line) => line.toLowerCase().includes('cache warming'))).toBe(true);
  });
});
