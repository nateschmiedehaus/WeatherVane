import { describe, expect, it } from "vitest";

import { SessionContext } from "../session.js";
import type { CriticResult } from "../critics/base.js";
import type { CriticHistoryRecord, Task, TaskStatus } from "../orchestrator/state_machine.js";

class MockStateMachine {
  public tasks: Task[] = [];
  public contextEntries: Array<Record<string, unknown>> = [];
  public criticHistory: CriticHistoryRecord[] = [];

  createTask(task: Omit<Task, "created_at">): Task {
    const created: Task = {
      ...task,
      created_at: Date.now(),
    };
    this.tasks.push(created);
    return created;
  }

  getTasks(filter?: { status?: TaskStatus[] }): Task[] {
    if (!filter?.status) {
      return [...this.tasks];
    }
    return this.tasks.filter((task) => filter.status!.includes(task.status));
  }

  assignTask(taskId: string, agent: string): Task {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    task.assigned_to = agent;
    return task;
  }

  updateTaskDetails(taskId: string, updates: { description?: string }): Task {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (typeof updates.description === "string") {
      task.description = updates.description;
    }
    return task;
  }

  async transition(taskId: string, _status: TaskStatus, metadata?: Record<string, unknown>): Promise<Task> {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (metadata) {
      task.metadata = { ...(task.metadata ?? {}), ...metadata };
    }
    return task;
  }

  addContextEntry(entry: Record<string, unknown>) {
    this.contextEntries.push(entry);
    return entry;
  }

  recordCriticHistory(entry: Omit<CriticHistoryRecord, "id">): CriticHistoryRecord {
    const stored: CriticHistoryRecord = {
      ...entry,
      id: (this.criticHistory.length + 1) as number,
    };
    this.criticHistory.push(stored);
    return stored;
  }

  getCriticHistory(critic: string, options: { limit?: number } = {}): CriticHistoryRecord[] {
    const limit = Math.max(1, options.limit ?? 20);
    return this.criticHistory
      .filter((entry) => entry.critic === critic)
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .slice(0, limit);
  }
}

function buildResult(critic: string, passed: boolean, stderr?: string): CriticResult {
  return {
    critic,
    code: passed ? 0 : 1,
    stdout: passed ? "ok" : "",
    stderr: passed ? "" : stderr ?? "failure",
    passed,
  };
}

describe("SessionContext critic performance monitoring", () => {
  it("escalates persistent critic failures to Autopilot", async () => {
    const session = new SessionContext();
    const stateMachine = new MockStateMachine();
    (session as any).stateMachine = stateMachine;

    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      stateMachine.recordCriticHistory({
        critic: "tests",
        category: "runtime_failure",
        passed: false,
        stderr_sample: "failure",
        created_at: now - i * 1000,
        metadata: { origin: "critic_runtime" },
      });
    }

    const report = await (session as any).evaluateCriticPerformance(buildResult("tests", false));
    expect(report).not.toBeNull();
    expect(report?.severity).toBe("director");

    const tasks = stateMachine.getTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assigned_to).toBe("Director Dana");
    const metadata = tasks[0].metadata as Record<string, unknown> | undefined;
    expect(metadata).toBeDefined();
    expect(metadata).toMatchObject({
      source: "critic_performance_monitor",
      critic: "tests",
      severity: "director",
    });
  });

  it("creates systemic remediation when multiple critics fail together", async () => {
    const session = new SessionContext();
    const stateMachine = new MockStateMachine();
    (session as any).stateMachine = stateMachine;

    const reports: any[] = [
      {
        critic: "tests",
        severity: "autopilot",
        consecutiveFailures: 3,
        totalObservations: 5,
        failureCount: 5,
        successCount: 0,
        reason: "tests failing",
        taskId: "A",
      },
      {
        critic: "build",
        severity: "autopilot",
        consecutiveFailures: 3,
        totalObservations: 5,
        failureCount: 5,
        successCount: 0,
        reason: "build failing",
        taskId: "B",
      },
      {
        critic: "typecheck",
        severity: "director",
        consecutiveFailures: 5,
        totalObservations: 6,
        failureCount: 6,
        successCount: 0,
        reason: "typecheck failing",
        taskId: "C",
      },
    ] as Array<Record<string, unknown>>;

    await (session as any).evaluateSystemicCriticBehaviour(reports, 5);

    const systemicTask = stateMachine
      .getTasks()
      .find((task) => {
        const metadata = task.metadata as Record<string, unknown> | undefined;
        return metadata?.["source"] === "critic_performance_monitor" && metadata?.["remediation_scope"] === "global";
      });
    expect(systemicTask).toBeDefined();
    expect(systemicTask?.assigned_to).toBe("Director Dana");
    const metadata = systemicTask?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.["affected_critics"]).toEqual(["tests", "build", "typecheck"]);
  });
});
