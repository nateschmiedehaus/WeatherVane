import { randomUUID } from "node:crypto";

import type { ConsensusTelemetryRecorder } from "../../telemetry/consensus_metrics.js";
import { logInfo } from "../../telemetry/logger.js";
import type { AssembledContext } from "../context_assembler.js";
import type { StateMachine, Task, ContextEntry } from "../state_machine.js";

import { buildConsensusAgenda, type ConsensusAgenda, type ConsensusDecisionType } from "./agenda_builder.js";
import { getConsensusWorkloadSnapshot, type ConsensusWorkloadSnapshot } from "./workload_loader.js";

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
  durationSeconds?: number;
  tokenCostUsd?: number;
}

const DEFAULT_DECISION_FRESHNESS_MS = 6 * 60 * 60 * 1000; // 6 hours

function normaliseMetadata(task: Task): Record<string, unknown> {
  const metadata = task.metadata as Record<string, unknown> | undefined;
  return metadata ?? {};
}

function extractIdentityAuthority(metadata: Record<string, unknown>): string | null {
  const identity = metadata.identity;
  if (!identity || typeof identity !== "object") {
    return null;
  }
  const authority = (identity as Record<string, unknown>).authority;
  if (typeof authority === "string" && authority.trim().length > 0) {
    return authority.trim().toLowerCase();
  }
  return null;
}

function extractSeverity(metadata: Record<string, unknown>): string | null {
  const severity = metadata.severity;
  if (typeof severity === "string" && severity.trim().length > 0) {
    return severity.trim().toLowerCase();
  }
  return null;
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

    const authority = extractIdentityAuthority(metadata);
    if (authority === "critical") {
      return true;
    }
    if (authority === "blocking" && metadata.source === "critic") {
      return true;
    }

    const severity = extractSeverity(metadata);
    if (severity === "director") {
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
    const startedAt = Date.now();
    const freshnessWindow = options.refreshWindowMs ?? this.freshnessWindowMs;
    const existing = this.findExistingDecision(task.id, freshnessWindow);
    if (existing && !options.force) {
      return existing;
    }

    const workload = getConsensusWorkloadSnapshot();
    const agenda = buildConsensusAgenda(task, context, {
      forcedType: options.type,
      workload,
    });
    const decision = this.createDecision(task, context, agenda, workload);

    if (!decision.quorumSatisfied) {
      const escalated = new Set(decision.escalatedTo ?? []);
      escalated.add("autopilot");
      decision.escalatedTo = Array.from(escalated);
    }

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

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    decision.durationSeconds = elapsedSeconds;

    await this.telemetry?.recordDecision(decision);

    await this.handlePostDecision(task, decision, options.correlationId);

    return decision;
  }

  private createDecision(
    task: Task,
    context: AssembledContext,
    agenda: ConsensusAgenda,
    workload: ConsensusWorkloadSnapshot | null,
  ): ConsensusDecision {
    const proposals = this.generateProposals(task, context, agenda);
    const selectedIndex = Math.max(
      proposals.findIndex((proposal) => proposal.author === "atlas"),
      0,
    );

    const quorumRequirement = this.resolveQuorumRequirement(agenda, workload);
    const quorumSatisfied = agenda.participants.length >= quorumRequirement;
    const escalatedTo = this.resolveEscalationTargets(agenda, quorumSatisfied);

    const tokenBudget = this.resolveTokenBudget(agenda, workload);
    const metadata: Record<string, unknown> = {
      rationale: agenda.rationale,
    };
    if (agenda.signals?.length) {
      metadata.triggered_signals = agenda.signals;
    }
    if (typeof agenda.expectedDurationSeconds === "number") {
      metadata.expected_duration_seconds = agenda.expectedDurationSeconds;
    }
    if (typeof agenda.expectedP90DurationSeconds === "number") {
      metadata.expected_p90_duration_seconds = agenda.expectedP90DurationSeconds;
    }
    if (tokenBudget !== undefined) {
      metadata.token_budget_usd = tokenBudget;
    }
    const staffingNotes = workload?.quorumProfiles?.[agenda.decisionType]?.notes;
    if (staffingNotes) {
      metadata.staffing_notes = staffingNotes;
    }

    return {
      id: `CONS-${task.id}-${randomUUID().slice(0, 6)}`,
      taskId: task.id,
      type: agenda.decisionType,
      quorumSatisfied,
      proposals,
      selectedProposalIndex: selectedIndex,
      metadata,
      agenda,
      createdAt: Date.now(),
      escalatedTo: escalatedTo ?? undefined,
      tokenCostUsd: tokenBudget,
    };
  }

  private resolveQuorumRequirement(
    agenda: ConsensusAgenda,
    workload: ConsensusWorkloadSnapshot | null,
  ): number {
    const profile = workload?.quorumProfiles?.[agenda.decisionType];
    const defaultCount = profile?.defaultParticipants.length ?? 0;
    if (defaultCount >= 2) {
      return defaultCount;
    }
    return agenda.decisionType === "critical" ? 3 : 2;
  }

  private resolveTokenBudget(
    agenda: ConsensusAgenda,
    workload: ConsensusWorkloadSnapshot | null,
  ): number | undefined {
    const fromAgenda = agenda.tokenBudgetUsd;
    if (typeof fromAgenda === "number" && Number.isFinite(fromAgenda)) {
      return Number(fromAgenda.toFixed(5));
    }
    const mapValue = workload?.tokenBudgetUsd?.[agenda.decisionType];
    if (typeof mapValue === "number" && Number.isFinite(mapValue)) {
      return Number(mapValue.toFixed(5));
    }
    const baseline = workload?.tokenBudgetUsd?.baseline;
    if (typeof baseline === "number" && Number.isFinite(baseline)) {
      return Number(baseline.toFixed(5));
    }
    return undefined;
  }

  private resolveEscalationTargets(
    agenda: ConsensusAgenda,
    quorumSatisfied: boolean,
  ): string[] | null {
    const targets = new Set<string>();
    if (agenda.decisionType === "critical") {
      targets.add("director_dana");
      targets.add("security_critic");
    }
    if (agenda.signals?.includes("duration_p90_gt_900s")) {
      targets.add("director_dana");
      targets.add("security_critic");
    }
    if (agenda.signals?.includes("repeat_retries_gt_1")) {
      targets.add("research_orchestrator");
    }
    if (!quorumSatisfied && !targets.size) {
      targets.add("autopilot");
    }
    return targets.size ? Array.from(targets) : null;
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
      } else if (normalized.includes("security")) {
        recommendation = "Pause for security posture review and update the risk register before execution.";
        proposalRisks.push("Pending security consensus review");
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
    const needsFollowUp =
      !decision.quorumSatisfied ||
      decision.type === "critical" ||
      (decision.escalatedTo?.length ?? 0) > 0;
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

    const escalatedTargets = decision.escalatedTo ?? [];
    const assignedTo =
      decision.type === "critical" ||
      escalatedTargets.some((value) => value.toLowerCase().includes("dana"))
        ? "Director Dana"
        : "Autopilot";
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
            escalated_to: escalatedTargets,
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
