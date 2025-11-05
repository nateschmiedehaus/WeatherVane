import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../executor/command_runner.js", () => ({
  runCommand: vi.fn(),
}));

import { runCommand } from "../executor/command_runner.js";
import type { StateMachine, Task, TaskStatus } from "../orchestrator/state_machine.js";
import { Critic } from "./base.js";

class MockStateMachine {
  public tasks: Task[] = [];
  public createdTasks: Task[] = [];
  public contextEntries: Array<Record<string, unknown>> = [];
  public transitions: Array<{ taskId: string; status: TaskStatus }> = [];
  public criticHistory: Array<{
    id: number;
    critic: string;
    category: string;
    passed: boolean;
    stderr_sample?: string;
    created_at: number;
    metadata?: Record<string, unknown>;
  }> = [];

  getTasks(filter?: { status?: TaskStatus[] }): Task[] {
    if (!filter?.status || filter.status.length === 0) {
      return [...this.tasks];
    }
    return this.tasks.filter((task) => filter.status!.includes(task.status));
  }

  createTask(task: Task, _correlationId?: string): Task {
    const stored: Task = {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      status: task.status,
      assigned_to: task.assigned_to,
      epic_id: task.epic_id,
      parent_id: task.parent_id,
      created_at: Date.now(),
      started_at: task.started_at,
      completed_at: task.completed_at,
      estimated_complexity: task.estimated_complexity,
      actual_duration_seconds: task.actual_duration_seconds,
      metadata: task.metadata ? { ...task.metadata } : undefined,
    };
    this.tasks.push(stored);
    this.createdTasks.push(stored);
    return stored;
  }

  async transition(
    taskId: string,
    newStatus: TaskStatus,
    metadata?: Record<string, unknown>,
  ): Promise<Task> {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    task.status = newStatus;
    if (metadata) {
      task.metadata = { ...(task.metadata ?? {}), ...metadata };
    }
    this.transitions.push({ taskId, status: newStatus });
    return task;
  }

  addContextEntry(entry: Record<string, unknown>) {
    const enriched = { ...entry, id: this.contextEntries.length + 1 };
    this.contextEntries.push(enriched);
    return enriched;
  }

  recordCriticHistory(entry: {
    critic: string;
    category: string;
    passed: boolean;
    stderr_sample?: string;
    created_at: number;
    metadata?: Record<string, unknown>;
  }) {
    const stored = {
      id: this.criticHistory.length + 1,
      critic: entry.critic,
      category: entry.category,
      passed: entry.passed,
      stderr_sample: entry.stderr_sample,
      created_at: entry.created_at,
      metadata: entry.metadata,
    };
    this.criticHistory.push(stored);
    return stored;
  }

  getCriticHistory(critic: string, options: { limit?: number } = {}) {
    const limit = Math.max(1, options.limit ?? 20);
    return this.criticHistory
      .filter((record) => record.critic === critic)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }
}

class TestCritic extends Critic {
  protected command(_profile: string): string | null {
    return "echo test";
  }
}

describe("Critic escalation orchestration", () => {
  const runCommandMock = vi.mocked(runCommand);
  let workspace: string;
  let configPath: string;
  let identityPath: string;
  let stateMachine: MockStateMachine;
  let critic: TestCritic;

  beforeEach(() => {
    vi.resetModules();
    runCommandMock.mockReset();
    workspace = mkdtempSync(path.join(os.tmpdir(), "critic-base-test-"));
    mkdirSync(path.join(workspace, "state"), { recursive: true });

    configPath = path.join(workspace, "critics.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        test: {
          reviewer: "Test Reviewer",
          note: "Test note",
          next: "Test next step",
          delegates: [
            {
              agent: "Autopilot",
              scope: "global",
              createTask: true,
              callAgents: ["qa"],
              taskTitle: "[Test] Autopilot follow-up",
              taskDescription: "Coordinate a remediation plan for the failing critic.",
            },
          ],
        },
      }),
      "utf8",
    );

    identityPath = path.join(workspace, "identities.json");
    writeFileSync(
      identityPath,
      JSON.stringify({
        test: {
          title: "Test Ranger",
          mission: "Validate test behavior in unit scenarios.",
          powers: ["Runs synthetic checks", "Surfaces reproduction steps"],
          authority: "blocking",
          domain: "quality",
          autonomy_guidance: "Keep scope tight, escalate chronic failures.",
          preferred_delegates: ["Autopilot"],
        },
      }),
      "utf8",
    );

    stateMachine = new MockStateMachine();
    critic = new TestCritic(workspace, {
      stateMachine: stateMachine as unknown as StateMachine,
      escalationConfigPath: configPath,
      escalationLogPath: path.join(workspace, "state", "escalations.log"),
      identityConfigPath: identityPath,
    });
  });

  it("creates follow-up tasks for delegates when critics fail", async () => {
    runCommandMock.mockRejectedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "synthetic failure",
    });

    const result = await critic.run("default");

    expect(result.passed).toBe(false);
    expect(stateMachine.createdTasks).toHaveLength(1);

    const task = stateMachine.createdTasks[0];
    expect(task.metadata?.source).toBe("critic");
    expect(task.metadata?.critic).toBe("test");
    expect(task.metadata?.delegate_agent).toBe("Autopilot");

    const createEntries = stateMachine.contextEntries.filter(
      (entry) => entry.metadata && (entry.metadata as Record<string, unknown>)?.action === "create",
    );
    expect(createEntries.length).toBeGreaterThan(0);

    expect(stateMachine.criticHistory[0]?.metadata?.identity).toMatchObject({
      title: "Test Ranger",
      authority: "blocking",
    });
  });

  it("reuses existing follow-up tasks on repeated failures", async () => {
    runCommandMock.mockRejectedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "first failure",
    });
    await critic.run("default");

    runCommandMock.mockRejectedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "second failure",
    });
    await critic.run("default");

    expect(stateMachine.createdTasks).toHaveLength(1);
    expect(stateMachine.tasks).toHaveLength(1);

    const updateEntries = stateMachine.contextEntries.filter(
      (entry) => entry.metadata && (entry.metadata as Record<string, unknown>)?.action === "update",
    );
    expect(updateEntries.length).toBeGreaterThan(0);
  });

  it("marks delegated tasks complete once the critic passes", async () => {
    runCommandMock.mockRejectedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "first failure",
    });
    await critic.run("default");

    runCommandMock.mockResolvedValueOnce({
      code: 0,
      stdout: "ok",
      stderr: "",
    });
    const successResult = await critic.run("default");

    expect(successResult.passed).toBe(true);
    expect(
      stateMachine.transitions.some((transition) => transition.status === "done"),
    ).toBe(true);
  });
});
