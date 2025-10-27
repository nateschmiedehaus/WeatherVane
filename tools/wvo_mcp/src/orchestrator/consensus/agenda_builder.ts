import type { AssembledContext } from "../context_assembler.js";
import type { Task } from "../state_machine.js";

import {
  getConsensusWorkloadSnapshot,
  type ConsensusWorkloadSnapshot,
  type EscalationSignal,
  type QuorumProfile,
} from "./workload_loader.js";

export type ConsensusDecisionType = "critical" | "strategic" | "specialist";

export interface ConsensusAgenda {
  decisionType: ConsensusDecisionType;
  rationale: string[];
  participants: string[];
  signals?: string[];
  expectedDurationSeconds?: number | null;
  expectedP90DurationSeconds?: number | null;
  tokenBudgetUsd?: number | null;
}

export interface AgendaOptions {
  forcedType?: ConsensusDecisionType;
  workload?: ConsensusWorkloadSnapshot | null;
}

function extractMetadata(task: Task): Record<string, unknown> {
  const metadata = task.metadata as Record<string, unknown> | undefined;
  return metadata ?? {};
}

function normaliseHandle(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const normalised = trimmed.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalised.length > 0 ? normalised : null;
}

function addParticipantsFromValue(target: Set<string>, value: unknown): void {
  if (!value) {
    return;
  }
  if (typeof value === "string") {
    const normalised = normaliseHandle(value);
    if (normalised) {
      target.add(normalised);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      addParticipantsFromValue(target, entry);
    }
  }
}

interface CriticIdentityMetadata {
  authority?: string;
  preferredDelegates: string[];
}

function parseCriticIdentity(value: unknown): CriticIdentityMetadata {
  if (!value || typeof value !== "object") {
    return { preferredDelegates: [] };
  }
  const record = value as Record<string, unknown>;
  const authorityRaw = record.authority;
  const authority =
    typeof authorityRaw === "string" && authorityRaw.trim().length > 0
      ? authorityRaw.trim().toLowerCase()
      : undefined;

  const delegates: string[] = [];
  const preferred = record.preferred_delegates;
  if (Array.isArray(preferred)) {
    for (const entry of preferred) {
      if (typeof entry === "string") {
        const normalised = normaliseHandle(entry);
        if (normalised) {
          delegates.push(normalised);
        }
      }
    }
  }

  return {
    authority,
    preferredDelegates: delegates,
  };
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function extractRetryCount(metadata: Record<string, unknown>): number {
  const candidates = [
    metadata.consensus_retry_count,
    metadata.retry_count,
    metadata.consensus_attempts,
    metadata.escalation_attempts,
  ];
  for (const candidate of candidates) {
    const numeric = asFiniteNumber(candidate);
    if (numeric !== null) {
      return Math.max(0, Math.floor(numeric));
    }
  }
  return 0;
}

function extractDurationSeconds(metadata: Record<string, unknown>, task: Task): number | null {
  const candidates = [
    metadata.consensus_duration_seconds,
    metadata.observed_duration_seconds,
    metadata.latest_consensus_duration_seconds,
    metadata.consensus_last_duration,
    metadata.consensus_elapsed_seconds,
    task.actual_duration_seconds,
  ];
  for (const candidate of candidates) {
    const numeric = asFiniteNumber(candidate);
    if (numeric !== null) {
      return numeric;
    }
  }
  return null;
}

function collectStringValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      results.push(entry.trim().toLowerCase());
    }
  }
  return results;
}

function resolveTokenBudget(
  decisionType: ConsensusDecisionType,
  workload: ConsensusWorkloadSnapshot | null,
  profile?: QuorumProfile,
): number | null {
  const fromProfile = profile?.tokenCostUsd;
  if (typeof fromProfile === "number" && Number.isFinite(fromProfile)) {
    return Number(fromProfile.toFixed(5));
  }
  const fromMap = workload?.tokenBudgetUsd?.[decisionType];
  if (typeof fromMap === "number" && Number.isFinite(fromMap)) {
    return Number(fromMap.toFixed(5));
  }
  const baseline = workload?.tokenBudgetUsd?.baseline;
  if (typeof baseline === "number" && Number.isFinite(baseline)) {
    return Number(baseline.toFixed(5));
  }
  return null;
}

function applyEscalationSignals(
  decisionType: ConsensusDecisionType,
  rationale: string[],
  signals: EscalationSignal[],
  retryCount: number,
  observedDuration: number | null,
  triggered: Set<string>,
): ConsensusDecisionType {
  let resolvedType = decisionType;
  for (const signal of signals) {
    if (signal.signal === "duration_p90_gt_900s" && typeof signal.thresholdSeconds === "number") {
      if (observedDuration !== null && observedDuration > signal.thresholdSeconds) {
        resolvedType = "critical";
        rationale.push(`signal:${signal.signal}`);
        triggered.add(signal.signal);
      }
    }
    if (signal.signal === "repeat_retries_gt_1" && typeof signal.threshold === "number") {
      if (retryCount > signal.threshold) {
        if (resolvedType === "specialist") {
          resolvedType = "strategic";
        }
        rationale.push(`signal:${signal.signal}`);
        triggered.add(signal.signal);
      }
    }
  }
  return resolvedType;
}

export function buildConsensusAgenda(
  task: Task,
  context: AssembledContext,
  options: AgendaOptions = {},
): ConsensusAgenda {
  const metadata = extractMetadata(task);
  const rationale: string[] = [];
  const workload = options.workload ?? getConsensusWorkloadSnapshot();
  const triggeredSignals = new Set<string>();
  const retryCount = extractRetryCount(metadata);
  const observedDuration = extractDurationSeconds(metadata, task);
  const criticFailures = collectStringValues(metadata.critic_failures ?? metadata.failed_critics);
  const criticIdentity = parseCriticIdentity(metadata.identity);

  let decisionType: ConsensusDecisionType = "strategic";
  if (options.forcedType) {
    decisionType = options.forcedType;
    rationale.push(`forced:${options.forcedType}`);
  } else if (typeof metadata.decision_type === "string") {
    const normalised = metadata.decision_type.toLowerCase();
    if (normalised === "critical" || normalised === "strategic" || normalised === "specialist") {
      decisionType = normalised;
      rationale.push(`metadata:${normalised}`);
    }
  }

  if (!options.forcedType && rationale.length === 0) {
    if (typeof task.estimated_complexity === "number" && task.estimated_complexity >= 7) {
      decisionType = "critical";
      rationale.push("complexity>=7");
    } else if (context.relevantConstraints.length > 3) {
      decisionType = "critical";
      rationale.push("constraints>=4");
    } else if (task.status === "needs_review" || task.status === "needs_improvement") {
      decisionType = "strategic";
      rationale.push(`status:${task.status}`);
    } else {
      decisionType = "specialist";
      rationale.push("default:specialist");
    }
  }

  if (!options.forcedType) {
    if (criticFailures.includes("security") || criticFailures.includes("security_critic")) {
      decisionType = "critical";
      rationale.push("critic:security");
    } else if (
      criticFailures.includes("integration_fury") ||
      criticFailures.includes("exec_review")
    ) {
      if (decisionType === "specialist") {
        decisionType = "strategic";
      }
      rationale.push("critic:high_severity");
    }
  }

  if (!options.forcedType) {
    if (criticIdentity.authority === "critical" && decisionType !== "critical") {
      decisionType = "critical";
      rationale.push("identity:critical");
    } else if (criticIdentity.authority === "blocking" && decisionType === "specialist") {
      decisionType = "strategic";
      rationale.push("identity:blocking");
    }
  }

  if (!options.forcedType && workload) {
    decisionType = applyEscalationSignals(
      decisionType,
      rationale,
      workload.escalationSignals,
      retryCount,
      observedDuration,
      triggeredSignals,
    );
  }

  const profile = workload?.quorumProfiles?.[decisionType];
  if (profile) {
    rationale.push(`profile:${decisionType}`);
  }

  const participants = new Set<string>(profile?.defaultParticipants ?? []);
  participants.add("atlas");
  participants.add("claude_council");
  if (decisionType === "critical") {
    participants.add("director_dana");
    participants.add("security_critic");
  }
  if (context.researchHighlights && context.researchHighlights.length > 0) {
    participants.add("research_orchestrator");
  }
  if (typeof metadata.delegate_agent === "string") {
    const normalisedDelegate = normaliseHandle(metadata.delegate_agent);
    if (normalisedDelegate) {
      participants.add(normalisedDelegate);
    }
  }
  addParticipantsFromValue(participants, metadata.consensus_participants ?? metadata.additional_participants);
  addParticipantsFromValue(participants, metadata.call_agents);
  addParticipantsFromValue(participants, metadata.escalate_to);
  if (typeof metadata.critic === "string") {
    const criticHandle = normaliseHandle(metadata.critic);
    if (criticHandle) {
      participants.add(criticHandle);
    }
  }
  for (const delegate of criticIdentity.preferredDelegates) {
    participants.add(delegate);
  }
  if (retryCount > 0 && !participants.has("research_orchestrator") && decisionType !== "specialist") {
    participants.add("research_orchestrator");
  }

  return {
    decisionType,
    rationale,
    participants: Array.from(participants),
    signals: triggeredSignals.size ? Array.from(triggeredSignals) : undefined,
    expectedDurationSeconds: profile?.medianDurationSeconds ?? null,
    expectedP90DurationSeconds: profile?.p90DurationSeconds ?? null,
    tokenBudgetUsd: resolveTokenBudget(decisionType, workload ?? null, profile),
  };
}
