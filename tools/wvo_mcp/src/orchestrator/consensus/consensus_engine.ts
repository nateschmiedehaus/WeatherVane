import { randomUUID } from "node:crypto";

import type { AssembledContext } from "../context_assembler.js";
import type { StateMachine, Task, ContextEntry } from "../state_machine.js";
import { logInfo } from "../../telemetry/logger.js";
import { buildConsensusAgenda, type ConsensusAgenda, type ConsensusDecisionType } from "./agenda_builder.js";
import type { ConsensusTelemetryRecorder } from "../../telemetry/consensus_metrics.js";

export interface ConsensusEngineOptions {
  stateMachine: StateMachine;
  enabled?: boolean;
  decisionFreshnessMs?: number;
  telemetryRecorder?: ConsensusTelemetryRecorder;
}

export interface EnsureDecisionOptions {
  type?: ConsensusDecisionType;
  force?: boolean;
  correlationId?: string;
  refreshWindowMs?: number;
}

export interface ConsensusProposal {
  author: string;
  summary: string;
  recommendation: string;
  risks: string[];
  effortEstimateHours?: number;
  confidence?: number;
}

export interface ConsensusDecision {
  id: string;
  taskId: string;
  type: ConsensusDecisionType;
  quorumSatisfied: boolean;
  proposals: ConsensusProposal[];
  selectedProposalIndex: number;
  metadata: Record<string, unknown>;
  agenda: ConsensusAgenda;
  createdAt: number;
  escalatedTo?: string[];
}

const DEFAULT_DECISION_FRESHNESS_MS = 6 * 60 * 60 * 1000; // 6 hours

function normaliseMetadata(task: Task): Record<string, unknown> {
  const metadata = task.metadata as Record<string, unknown> | undefined;
  return metadata ?? {};
}

export class ConsensusEngine {
  private readonly stateMachine: StateMachine;
  private readonly enabled: boolean;
  private readonly freshnessWindowMs: number;
  private readonly telemetry?: ConsensusTelemetryRecorder;

  constructor(options: ConsensusEngineOptions) {
    this.stateMachine = options.stateMachine;
    this.enabled = options.enabled ?? false;
    this.freshnessWindowMs = options.decisionFreshnessMs ?? DEFAULT_DECISION_FRESHNESS_MS;
    this.telemetry = options.telemetryRecorder;
  }

  shouldEnsureDecision(task: Task, context: AssembledContext): boolean {
    if (!this.enabled) {
      return false;
    }

    const metadata = normaliseMetadata(task);
    if (metadata.consensus_required === true) {
      return true;
    }

    if (metadata.delegate_scope === "systemic") {
      return true;
    }

    if (task.status === "needs_review" || task.status === "needs_improvement") {
      return true;
    }

    if (context.relevantConstraints.length >= 4) {
      return true;
    }

    return false;
  }

  async ensureDecision(
    task: Task,
    context: AssembledContext,
    options: EnsureDecisionOptions = {},
  ): Promise<ConsensusDecision> {
    const freshnessWindow = options.refreshWindowMs ?? this.freshnessWindowMs;
    const existing = this.findExistingDecision(task.id, freshnessWindow);
    if (existing && !options.force) {
      return existing;
    }

    const agenda = buildConsensusAgenda(task, context, { forcedType: options.type });
    const decision = this.createDecision(task, context, agenda);

    const contentLines = [
      `Consensus ${decision.type} decision recorded for task ${task.id} (${task.title}).`,
      `Participants: ${decision.agenda.participants.join(", ")}`,
    ];
    if (decision.proposals.length > 0) {
      const selected = decision.proposals[decision.selectedProposalIndex];
      contentLines.push(`Selected proposal by ${selected.author}: ${selected.recommendation}`);
    }

    this.stateMachine.addContextEntry({
      entry_type: "decision",
      topic: `Consensus decision:${task.id}`,
      content: contentLines.join("\n"),
      related_tasks: [task.id],
      metadata: {
        consensus: decision,
        agenda,
        correlation_id: options.correlationId ?? null,
      },
    });

    logInfo("Consensus decision captured", {
      taskId: task.id,
      decisionId: decision.id,
      type: decision.type,
      participants: decision.agenda.participants,
      rationale: decision.agenda.rationale,
    });

    await this.telemetry?.recordDecision(decision);

    await this.handlePostDecision(task, decision, options.correlationId);

    return decision;
  }

  private createDecision(task: Task, context: AssembledContext, agenda: ConsensusAgenda): ConsensusDecision {
    const proposals = this.generateProposals(task, context, agenda);
    const selectedIndex = Math.max(
      proposals.findIndex((proposal) => proposal.author === "atlas"),
      0,
    );

    const quorumRequirement = agenda.decisionType === "critical" ? 3 : agenda.decisionType === "strategic" ? 2 : 2;
    const quorumSatisfied = agenda.participants.length >= quorumRequirement;
    const escalatedTo = quorumSatisfied ? undefined : ["autopilot"];

    return {
      id: `CONS-${task.id}-${randomUUID().slice(0, 6)}`,
      taskId: task.id,
      type: agenda.decisionType,
      quorumSatisfied,
      proposals,
      selectedProposalIndex: selectedIndex,
      metadata: {
        rationale: agenda.rationale,
      },
      agenda,
      createdAt: Date.now(),
      escalatedTo,
    };
  }

  private generateProposals(
    task: Task,
    context: AssembledContext,
    agenda: ConsensusAgenda,
  ): ConsensusProposal[] {
    const metadata = normaliseMetadata(task);
    const risks = Array.isArray(metadata.risks) ? metadata.risks.map(String) : [];

    const baseRecommendation =
      typeof metadata.preferred_strategy === "string"
        ? metadata.preferred_strategy
        : "Proceed with scoped implementation";

    const proposals: ConsensusProposal[] = agenda.participants.map((participant) => {
      const normalized = participant.toLowerCase();
      let recommendation = baseRecommendation;
      const proposalRisks = [...risks];

      if (normalized.includes("dana")) {
        recommendation = "Hold for Director Dana review and incorporate UX/product polish tasks.";
        proposalRisks.push("Requires executive sign-off before implementation");
      } else if (normalized.includes("research_orchestrator")) {
        recommendation = "Run research spike to validate assumptions prior to implementation.";
        proposalRisks.push("Experiment design not yet validated");
      } else if (normalized.includes("claude")) {
        recommendation = "Prepare consensus summary and pair with Atlas to execute";
      }

      const effortHours =
        typeof task.estimated_complexity === "number"
          ? Math.max(1, task.estimated_complexity)
          : undefined;

      return {
        author: normalized,
        summary: `Proposal from ${participant} for task ${task.id}`,
        recommendation,
        risks: proposalRisks,
        effortEstimateHours: effortHours,
        confidence: normalized.includes("atlas") ? 0.75 : 0.6,
      };
    });

    if (!proposals.length) {
      proposals.push({
        author: "atlas",
        summary: `Fallback proposal for ${task.id}`,
        recommendation: baseRecommendation,
        risks,
        effortEstimateHours:
          typeof task.estimated_complexity === "number"
            ? Math.max(1, task.estimated_complexity)
            : undefined,
        confidence: 0.6,
      });
    }

    return proposals;
  }

  private async handlePostDecision(
    task: Task,
    decision: ConsensusDecision,
    correlationId?: string,
  ): Promise<void> {
    const needsFollowUp = !decision.quorumSatisfied || decision.type === "critical";
    if (!needsFollowUp) {
      return;
    }

    const createTaskFn = (this.stateMachine as unknown as {
      createTask?: (
        task: Omit<Task, "created_at">,
        correlationId?: string,
      ) => Task;
    }).createTask;

    if (typeof createTaskFn !== "function") {
      return;
    }

    const assignedTo = decision.type === "critical" ? "Director Dana" : "Autopilot";
    const followUpId = `CONS-FOLLOW-${decision.id}`;

    try {
      createTaskFn(
        {
          id: followUpId,
          title: `[Consensus] Follow-up for ${task.title}`,
          description: `Review consensus decision ${decision.id} (${decision.type}) for task ${task.id}.`,
          type: "task",
          status: "pending",
          assigned_to: assignedTo,
          metadata: {
            source: "consensus_followup",
            decision_id: decision.id,
            original_task_id: task.id,
            participants: decision.agenda.participants,
            quorum_satisfied: decision.quorumSatisfied,
          },
        },
        correlationId ? `${correlationId}:followup` : `consensus:${decision.id}:followup`,
      );
    } catch (error) {
      logInfo("Failed to create consensus follow-up task", {
        taskId: task.id,
        decisionId: decision.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private findExistingDecision(taskId: string, freshnessMs: number): ConsensusDecision | null {
    const entries = this.stateMachine.getContextEntries({
      type: "decision",
      topic: `Consensus decision:${taskId}`,
    });
    if (!entries.length) {
      return null;
    }

    const latest = entries[0];
    if (Date.now() - latest.timestamp > freshnessMs) {
      return null;
    }

    return this.extractDecisionMetadata(latest);
  }

  private extractDecisionMetadata(entry: ContextEntry): ConsensusDecision | null {
    const metadata = entry.metadata as Record<string, unknown> | undefined;
    if (!metadata?.consensus) {
      return null;
    }

    const consensus = metadata.consensus as ConsensusDecision;
    if (!consensus?.id || consensus.taskId === undefined) {
      return null;
    }
    return consensus;
  }
}
