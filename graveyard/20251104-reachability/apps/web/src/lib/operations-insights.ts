import type {
  ConsensusEscalationSignal,
  ConsensusQuorumProfile,
  ConsensusWorkloadResponse,
} from "../types/operations";

const PARTICIPANT_LABELS: Record<string, string> = {
  atlas: "Atlas",
  claude_council: "Claude Council",
  director_dana: "Director Dana",
  security_critic: "Security Critic",
  research_orchestrator: "Research Orchestrator",
  autopilot: "Automation engine",
  operations_steward: "Operations Steward",
};

const QUORUM_ORDER = ["critical", "strategic", "specialist"];

function resolveHierarchyRank(name: string): number {
  const index = QUORUM_ORDER.indexOf(name);
  return index === -1 ? 99 : index;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function roundTo(amount: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export function formatConsensusParticipant(handle: string): string {
  const normalized = handle.trim().toLowerCase();
  if (!normalized) {
    return "Unknown";
  }
  const mapped = PARTICIPANT_LABELS[normalized];
  if (mapped) {
    return mapped;
  }
  const fallback = normalized.replace(/[_\W]+/g, " ").trim();
  return fallback ? titleCase(fallback) : "Unknown";
}

export function formatConsensusParticipants(handles: string[]): string[] {
  return handles.map(formatConsensusParticipant);
}

export function formatConsensusDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) {
    return "—";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = seconds / 60;
  if (minutes >= 120) {
    return `${(minutes / 60).toFixed(1)}h`;
  }
  if (minutes >= 10) {
    return `${Math.round(minutes)} min`;
  }
  return `${minutes.toFixed(1)} min`;
}

export function formatTokenBudgetUsd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) {
    return "—";
  }
  if (amount >= 1) {
    const rounded = roundTo(amount, 2);
    return `$${rounded.toFixed(2)}`;
  }
  if (amount >= 0.1) {
    const rounded = roundTo(amount, 3);
    return `$${rounded.toFixed(3)}`;
  }
  if (amount >= 0.01) {
    const rounded = roundTo(amount, 5);
    return `$${rounded.toFixed(5)}`;
  }
  const rounded = roundTo(amount, 5);
  return `$${rounded.toFixed(5)}`;
}

export function sortQuorumProfiles(profiles: ConsensusQuorumProfile[]): ConsensusQuorumProfile[] {
  return [...profiles].sort((a, b) => {
    const rankA =
      typeof a.hierarchy_rank === "number"
        ? a.hierarchy_rank
        : resolveHierarchyRank(a.name);
    const rankB =
      typeof b.hierarchy_rank === "number"
        ? b.hierarchy_rank
        : resolveHierarchyRank(b.name);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.display_name.localeCompare(b.display_name);
  });
}

export interface ConsensusTierSummary {
  name: string;
  displayName: string;
  participants: string[];
  medianDuration: string;
  p90Duration: string;
  tokenBudget: string;
  notes?: string | null;
}

export function buildConsensusTierSummaries(
  workload: ConsensusWorkloadResponse,
): ConsensusTierSummary[] {
  return sortQuorumProfiles(workload.quorum_profiles).map((profile) => ({
    name: profile.name,
    displayName: profile.display_name,
    participants: formatConsensusParticipants(profile.default_participants),
    medianDuration: formatConsensusDuration(profile.median_duration_seconds ?? null),
    p90Duration: formatConsensusDuration(profile.p90_duration_seconds ?? null),
    tokenBudget: formatTokenBudgetUsd(profile.token_cost_usd ?? null),
    notes: profile.notes,
  }));
}

export interface ConsensusDecisionMixSummary {
  name: string;
  displayName: string;
  count: number;
}

export function summarizeDecisionMix(
  decisionMix: Record<string, number>,
): ConsensusDecisionMixSummary[] {
  return QUORUM_ORDER.map((name) => ({
    name,
    displayName: titleCase(name),
    count: Math.max(0, Math.trunc(decisionMix[name] ?? 0)),
  }));
}

export interface ConsensusEscalationSummary {
  signal: string;
  threshold: string;
  recommendedAction: string | null;
}

export function buildEscalationSummaries(
  signals: ConsensusEscalationSignal[],
): ConsensusEscalationSummary[] {
  return signals.map((signal) => {
    let thresholdLabel = "—";
    if (signal.threshold_seconds != null && Number.isFinite(signal.threshold_seconds)) {
      thresholdLabel = `${formatConsensusDuration(signal.threshold_seconds)} p90`;
    } else if (signal.threshold != null && Number.isFinite(signal.threshold)) {
      thresholdLabel = `>${signal.threshold}`;
    }
    return {
      signal: signal.signal,
      threshold: thresholdLabel,
      recommendedAction: signal.recommended_action ?? null,
    };
  });
}
