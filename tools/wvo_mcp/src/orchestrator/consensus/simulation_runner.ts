import fs from "node:fs/promises";
import path from "node:path";

import type { Task } from "../state_machine.js";
import type { AssembledContext } from "../context_assembler.js";
import type { ConsensusEngine } from "./consensus_engine.js";

export interface SimulationTaskInput {
  id: string;
  title: string;
  status?: Task["status"];
  estimated_complexity?: number;
  metadata?: Record<string, unknown>;
  constraints?: string[];
}

export interface SimulationResult {
  decisions: Array<{
    id: string;
    taskId: string;
    type: string;
    participants: string[];
    quorumSatisfied: boolean;
  }>;
  summary: {
    total: number;
    byType: Record<string, number>;
  };
}

export async function runConsensusSimulation(
  workspaceRoot: string,
  tasks: SimulationTaskInput[],
  engineFactory: () => ConsensusEngine,
  outputPath = path.join(workspaceRoot, "experiments", "orchestration", "simulation_report.md"),
): Promise<SimulationResult> {
  const engine = engineFactory();

  const decisions = [];

  for (const item of tasks) {
    const task: Task = {
      id: item.id,
      title: item.title,
      description: item.title,
      type: "task",
      status: item.status ?? "needs_review",
      assigned_to: undefined,
      created_at: Date.now(),
      metadata: item.metadata ?? {},
      estimated_complexity: item.estimated_complexity,
    };

    const context: AssembledContext = {
      task,
      relatedTasks: [],
      relevantDecisions: [],
      relevantConstraints: (item.constraints ?? []).map((value, index) => ({
        id: index + 1,
        timestamp: Date.now(),
        entry_type: "constraint",
        topic: value,
        content: value,
        related_tasks: [item.id],
        metadata: {},
      })),
      recentLearnings: [],
      qualityIssuesInArea: [],
      overallQualityTrend: [],
      projectPhase: "development",
      velocityMetrics: {
        tasksCompletedToday: 0,
        averageTaskDuration: 0,
        qualityTrendOverall: "stable",
      },
      researchHighlights: [],
    };

    const decision = await engine.ensureDecision(task, context, {
      correlationId: `simulation:${task.id}`,
      force: true,
    });

    decisions.push({
      id: decision.id,
      taskId: decision.taskId,
      type: decision.type,
      participants: decision.agenda.participants,
      quorumSatisfied: decision.quorumSatisfied,
    });
  }

  const summary = decisions.reduce<SimulationResult["summary"]>(
    (acc, decision) => {
      acc.total += 1;
      acc.byType[decision.type] = (acc.byType[decision.type] ?? 0) + 1;
      return acc;
    },
    { total: 0, byType: {} },
  );

  await writeReport(outputPath, decisions, summary);

  return { decisions, summary };
}

async function writeReport(
  outputPath: string,
  decisions: SimulationResult["decisions"],
  summary: SimulationResult["summary"],
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const lines = [
    "# Consensus Simulation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total decisions: ${summary.total}`,
    ...Object.entries(summary.byType).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Decisions",
    "",
  ];

  for (const decision of decisions) {
    lines.push(
      `### ${decision.taskId} (${decision.type})`,
      `- Decision ID: ${decision.id}`,
      `- Participants: ${decision.participants.join(", ")}`,
      `- Quorum satisfied: ${decision.quorumSatisfied ? "yes" : "no"}`,
      "",
    );
  }

  await fs.writeFile(outputPath, lines.join("\n"), "utf8");
}
