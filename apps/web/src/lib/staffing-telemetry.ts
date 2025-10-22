import {
  formatConsensusDuration,
  formatConsensusParticipants,
  formatTokenBudgetUsd,
} from "./operations-insights";
import type {
  OrchestrationHistoryEntry,
  OrchestrationMetricsResponse,
  StaffingGuidance,
  StaffingGuidanceSignal,
  CriticPerformanceSnapshot,
  CriticPerformanceEntry,
} from "../types/operations";

export interface DecisionHistoryRow {
  id: string;
  taskId: string;
  type: string;
  timestamp: string;
  timestampLabel: string;
  participantsLabel: string;
  durationLabel: string;
  tokenCostLabel: string;
  quorumSatisfied: boolean;
}

export interface DecisionTypeSummary {
  type: string;
  count: number;
}

export interface ProfileSummary {
  name: string;
  participantsLabel: string;
  medianDurationLabel: string;
  p90DurationLabel: string;
  notes?: string | null;
}

export interface TokenBudgetSummary {
  name: string;
  label: string;
}

export interface EscalationSignalSummary {
  signal: string;
  thresholdLabel: string;
  observedLabel: string;
  recommendedAction?: string | null;
}

export interface CriticPerformanceRow {
  critic: string;
  title?: string | null;
  domain?: string | null;
  passed: boolean;
  statusLabel: string;
  summary?: string | null;
  timestampLabel: string;
}

export interface CriticPerformanceView {
  total: number;
  passing: number;
  failing: number;
  updatedLabel: string;
  critics: CriticPerformanceRow[];
}

function parseTimestamp(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatTelemetryTimestamp(value?: string | null): string {
  const parsed = value ? parseTimestamp(value) : null;
  if (!parsed) {
    return "—";
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildDecisionTypeSummary(byType: Record<string, number>): DecisionTypeSummary[] {
  return Object.entries(byType)
    .map(([type, count]) => ({
      type,
      count: Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function normaliseHistoryOrder(history: OrchestrationHistoryEntry[]): OrchestrationHistoryEntry[] {
  return [...history].sort((a, b) => {
    const left = parseTimestamp(a.timestamp);
    const right = parseTimestamp(b.timestamp);
    if (left && right) {
      return right.getTime() - left.getTime();
    }
    if (left) return -1;
    if (right) return 1;
    return 0;
  });
}

export function buildDecisionHistoryRows(
  history: OrchestrationHistoryEntry[],
  options?: { limit?: number },
): DecisionHistoryRow[] {
  const limit = options?.limit ?? 5;
  const ordered = normaliseHistoryOrder(history);
  return ordered.slice(0, limit).map((entry) => {
    const timestampLabel = formatTelemetryTimestamp(entry.timestamp);
    const participantsLabel = formatConsensusParticipants(entry.participants).join(" · ") || "—";
    const durationLabel = formatConsensusDuration(entry.duration_seconds ?? null);
    const tokenCostLabel = formatTokenBudgetUsd(entry.token_cost_usd ?? null);

    return {
      id: entry.id,
      taskId: entry.task_id,
      type: entry.type,
      timestamp: entry.timestamp,
      timestampLabel,
      participantsLabel,
      durationLabel,
      tokenCostLabel,
      quorumSatisfied: entry.quorum_satisfied,
    };
  });
}

export function buildProfileSummaries(
  guidance: StaffingGuidance | undefined | null,
): ProfileSummary[] {
  if (!guidance) {
    return [];
  }
  return Object.entries(guidance.profiles ?? {})
    .map(([name, profile]) => ({
      name,
      participantsLabel: formatConsensusParticipants(profile.default_participants ?? []).join(" · ") || "—",
      medianDurationLabel: formatConsensusDuration(profile.median_duration_seconds ?? null),
      p90DurationLabel: formatConsensusDuration(profile.p90_duration_seconds ?? null),
      notes: profile.notes ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildTokenBudgetSummaries(
  guidance: StaffingGuidance | undefined | null,
): TokenBudgetSummary[] {
  if (!guidance) {
    return [];
  }
  return Object.entries(guidance.token_budget_usd ?? {}).map(([name, value]) => ({
    name,
    label: formatTokenBudgetUsd(value ?? null),
  }));
}

function formatObservedValue(signal: StaffingGuidanceSignal): string {
  if (signal.observed_value == null || !Number.isFinite(signal.observed_value)) {
    return "—";
  }
  if (signal.observed_value >= 1000) {
    return signal.observed_value.toFixed(0);
  }
  if (signal.observed_value >= 10) {
    return signal.observed_value.toFixed(1);
  }
  return signal.observed_value.toFixed(2);
}

export function buildEscalationSignals(
  guidance: StaffingGuidance | undefined | null,
): EscalationSignalSummary[] {
  if (!guidance) {
    return [];
  }
  const signals = guidance.escalation_triggers?.signals ?? [];
  return signals.map((signal) => ({
    signal: signal.signal,
    thresholdLabel: signal.threshold_seconds
      ? `${formatConsensusDuration(signal.threshold_seconds)} threshold`
      : "—",
    observedLabel: formatObservedValue(signal),
    recommendedAction: signal.recommended_action ?? null,
  }));
}

function buildCriticStatusLabel(entry: CriticPerformanceEntry): string {
  if (entry.passed) {
    return "Passing";
  }
  if (entry.exit_code != null) {
    return `Failing (exit ${entry.exit_code})`;
  }
  return "Failing";
}

export function buildCriticPerformanceView(
  snapshot: CriticPerformanceSnapshot | undefined | null,
): CriticPerformanceView | null {
  if (!snapshot) {
    return null;
  }

  const updatedLabel = formatTelemetryTimestamp(snapshot.summary?.last_updated ?? null);
  const critics = (snapshot.critics ?? []).map<CriticPerformanceRow>((entry) => ({
    critic: entry.critic,
    title: entry.title ?? null,
    domain: entry.domain ?? null,
    passed: Boolean(entry.passed),
    statusLabel: buildCriticStatusLabel(entry),
    summary: entry.summary ?? null,
    timestampLabel: formatTelemetryTimestamp(entry.timestamp ?? null),
  }));

  return {
    total: snapshot.summary?.total ?? critics.length,
    passing: snapshot.summary?.passing ?? critics.filter((entry) => entry.passed).length,
    failing: snapshot.summary?.failing ?? critics.filter((entry) => !entry.passed).length,
    updatedLabel,
    critics,
  };
}

export function deriveTelemetrySnapshot(
  metrics: OrchestrationMetricsResponse,
  historyLimit = 5,
) {
  return {
    updatedLabel: formatTelemetryTimestamp(metrics.updated_at),
    totalDecisions: metrics.total_decisions,
    decisionTypes: buildDecisionTypeSummary(metrics.by_type),
    history: buildDecisionHistoryRows(metrics.history, { limit: historyLimit }),
    profiles: buildProfileSummaries(metrics.staffing_guidance ?? null),
    tokenBudgets: buildTokenBudgetSummaries(metrics.staffing_guidance ?? null),
    signals: buildEscalationSignals(metrics.staffing_guidance ?? null),
    sampleWindow: metrics.staffing_guidance?.sample_window ?? null,
    criticPerformance: buildCriticPerformanceView(metrics.critic_performance ?? null),
  };
}
