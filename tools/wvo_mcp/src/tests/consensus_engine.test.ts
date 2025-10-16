import { describe, expect, it, beforeEach } from "vitest";

import type { AssembledContext } from "../orchestrator/context_assembler.js";
import type { Task, ContextEntry } from "../orchestrator/state_machine.js";
import { ConsensusEngine } from "../orchestrator/consensus/consensus_engine.js";
import { buildConsensusAgenda } from "../orchestrator/consensus/agenda_builder.js";

describe("ConsensusEngine", () => {
  const baseTask: Task = {
    id: "T-test",
    title: "Pilot consensus",
    description: "Scaffold consensus engine",
    type: "task",
    status: "needs_review",
    assigned_to: undefined,
    created_at: Date.now(),
    metadata: {},
  };

  const baseContext: AssembledContext = {
    task: baseTask,
    relatedTasks: [],
    relevantDecisions: [],
    relevantConstraints: [],
    recentLearnings: [],
    qualityIssuesInArea: [],
    overallQualityTrend: [],
    projectPhase: "development",
    velocityMetrics: {
      tasksCompletedToday: 1,
      averageTaskDuration: 3600,
      qualityTrendOverall: "stable",
    },
    researchHighlights: [],
  };

  class MockStateMachine {
    public entries: ContextEntry[] = [];

    addContextEntry(entry: Omit<ContextEntry, "id" | "timestamp">) {
      const stored: ContextEntry = {
        id: this.entries.length + 1,
        timestamp: Date.now(),
        ...entry,
      };
      this.entries.unshift(stored);
      return stored;
    }

    getContextEntries(filter?: { type?: string; topic?: string }) {
      return this.entries.filter((entry) => {
        if (filter?.type && entry.entry_type !== filter.type) {
          return false;
        }
        if (filter?.topic && !entry.topic?.includes(filter.topic)) {
          return false;
        }
        return true;
      });
    }
  }

  let stateMachine: MockStateMachine;
  let engine: ConsensusEngine;

  beforeEach(() => {
    stateMachine = new MockStateMachine();
    engine = new ConsensusEngine({ stateMachine: stateMachine as unknown as any, enabled: true });
  });

  it("builds an agenda with inferred type", () => {
    const agenda = buildConsensusAgenda(baseTask, baseContext);
    expect(agenda.decisionType).toBe("strategic");
    expect(agenda.participants).toContain("atlas");
  });

  it("records a consensus decision when none exists", async () => {
    const decision = await engine.ensureDecision(baseTask, baseContext);
    expect(decision.taskId).toBe(baseTask.id);
    expect(decision.proposals.length).toBeGreaterThan(0);
    expect(stateMachine.entries).toHaveLength(1);
    const entry = stateMachine.entries[0];
    expect(entry.topic).toMatch(/Consensus decision/);
    const consensus = entry.metadata?.consensus as { id?: string } | undefined;
    expect(consensus?.id).toBe(decision.id);
  });

  it("reuses recent decisions when not forced", async () => {
    const first = await engine.ensureDecision(baseTask, baseContext);
    const second = await engine.ensureDecision(baseTask, baseContext);
    expect(second.id).toBe(first.id);
    expect(stateMachine.entries).toHaveLength(1);
  });

  it("requires consensus only when enabled and task warrants it", async () => {
    const disabled = new ConsensusEngine({
      stateMachine: stateMachine as unknown as any,
      enabled: false,
    });
    expect(disabled.shouldEnsureDecision(baseTask, baseContext)).toBe(false);
    expect(engine.shouldEnsureDecision(baseTask, baseContext)).toBe(true);
  });

  it("records telemetry when provided", async () => {
    class StubTelemetry {
      public recorded: string[] = [];
      async recordDecision(decision: { id: string }): Promise<void> {
        this.recorded.push(decision.id);
      }
    }

    const telemetry = new StubTelemetry();
    const instrumented = new ConsensusEngine({
      stateMachine: stateMachine as unknown as any,
      enabled: true,
      telemetryRecorder: telemetry as unknown as any,
    });

    const decision = await instrumented.ensureDecision(baseTask, baseContext);
    expect(telemetry.recorded).toContain(decision.id);
  });
});
