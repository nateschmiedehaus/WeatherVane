import fs from "node:fs/promises";
import path from "node:path";

import type { ConsensusDecision } from "../orchestrator/consensus/consensus_engine.js";
import { resolveStateRoot } from "../utils/config.js";

export interface ConsensusHistoryEntry {
  id: string;
  taskId: string;
  type: string;
  timestamp: string;
  quorumSatisfied: boolean;
  participants?: string[];
  durationSeconds?: number;
  tokenCostUsd?: number;
}

export interface StaffingGuidanceProfile {
  defaultParticipants: string[];
  medianDurationSeconds: number | null;
  p90DurationSeconds: number | null;
  expectedIterations?: number | null;
  tokenCostUsd?: number | null;
  notes?: string;
}

export interface StaffingGuidanceSignal {
  signal: string;
  recommendedAction?: string;
  thresholdSeconds?: number | null;
  observedValue?: number | null;
}

export interface StaffingGuidance {
  source: string;
  sampleWindow?: {
    start?: string;
    end?: string;
  };
  profiles: Record<string, StaffingGuidanceProfile>;
  escalationTriggers: {
    durationP90Seconds?: number | null;
    retryThreshold?: number | null;
    signals: StaffingGuidanceSignal[];
  };
  tokenBudgetUsd: Record<string, number | null>;
}

export interface ConsensusMetricsSnapshot {
  updatedAt: string;
  totalDecisions: number;
  byType: Record<string, number>;
  history: ConsensusHistoryEntry[];
  staffingGuidance?: StaffingGuidance;
}

interface ConsensusWorkloadObservation {
  id: string;
  task_id: string;
  task_title?: string | null;
  type: string;
  timestamp: string;
  participants: string[];
  quorum_satisfied: boolean;
  duration_seconds?: number | null;
  token_cost_usd?: number | null;
}

interface ConsensusWorkloadSummary {
  total_decisions: number;
  by_type: Record<string, number>;
}

interface ConsensusWorkloadProfile {
  default_participants?: string[];
  expected_duration_seconds?: {
    median?: number;
    p90?: number;
  };
  expected_iterations?: number;
  token_cost_usd?: number;
  notes?: string;
}

interface ConsensusWorkloadDataset {
  generated_at?: string;
  sample_window?: {
    start?: string;
    end?: string;
  };
  sources?: Record<string, string>;
  quorum_profiles?: Record<string, ConsensusWorkloadProfile>;
  escalation_signals?: Array<{
    signal?: string;
    threshold_seconds?: number;
    threshold?: number;
    observed_p90_success?: number;
    observed_retry_rate?: number;
    recommended_action?: string;
  }>;
  token_cost_per_run_usd?: number;
  token_budget_per_run?: {
    completion?: number;
    prompt?: number;
    total?: number;
  };
  decision_mix?: Record<string, number>;
  execution_health?: Record<string, unknown>;
  live_observations?: ConsensusWorkloadObservation[];
  live_summary?: ConsensusWorkloadSummary;
}

function createDefaultSnapshot(): ConsensusMetricsSnapshot {
  return {
    updatedAt: new Date(0).toISOString(),
    totalDecisions: 0,
    byType: {},
    history: [],
  };
}

export class ConsensusTelemetryRecorder {
  private readonly metricsPath: string;
  private readonly workloadPath: string;

  constructor(private readonly workspaceRoot: string) {
    const stateRoot = resolveStateRoot(workspaceRoot);
    this.metricsPath = path.join(
      stateRoot,
      "analytics",
      "orchestration_metrics.json",
    );
    this.workloadPath = path.join(
      stateRoot,
      "analytics",
      "consensus_workload.json",
    );
  }

  async recordDecision(decision: ConsensusDecision): Promise<void> {
    await this.ensureDirectory();
    const snapshot = await this.readSnapshot();
    const recordedAt = new Date().toISOString();

    snapshot.totalDecisions += 1;
    snapshot.byType[decision.type] = (snapshot.byType[decision.type] ?? 0) + 1;

    const existingDataset = await this.readWorkloadDataset();
    const observation = this.buildObservation(decision, existingDataset, recordedAt);
    const updatedDataset = await this.updateWorkloadDataset(existingDataset, observation);

    const historyEntry: ConsensusHistoryEntry = {
      id: decision.id,
      taskId: decision.taskId,
      type: decision.type,
      timestamp: recordedAt,
      quorumSatisfied: decision.quorumSatisfied,
      participants: Array.isArray(decision.agenda?.participants)
        ? [...decision.agenda.participants]
        : undefined,
    };

    if (typeof observation.duration_seconds === "number") {
      historyEntry.durationSeconds = observation.duration_seconds;
    }
    if (typeof observation.token_cost_usd === "number") {
      historyEntry.tokenCostUsd = observation.token_cost_usd;
    }

    snapshot.history.unshift(historyEntry);

    if (snapshot.history.length > 50) {
      snapshot.history.splice(50);
    }

    if (updatedDataset) {
      const guidance = this.buildStaffingGuidance(updatedDataset);
      if (guidance) {
        snapshot.staffingGuidance = guidance;
      }
    }

    snapshot.updatedAt = recordedAt;

    await fs.writeFile(this.metricsPath, JSON.stringify(snapshot, null, 2), "utf8");
  }

  private async ensureDirectory(): Promise<void> {
    const dir = path.dirname(this.metricsPath);
    await fs.mkdir(dir, { recursive: true });
  }

  private async readSnapshot(): Promise<ConsensusMetricsSnapshot> {
    try {
      const content = await fs.readFile(this.metricsPath, "utf8");
      const parsed = JSON.parse(content) as ConsensusMetricsSnapshot;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.totalDecisions === "number" &&
        parsed.byType &&
        typeof parsed.byType === "object"
      ) {
        return parsed;
      }
      return createDefaultSnapshot();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return createDefaultSnapshot();
      }
      throw error;
    }
  }

  private async readWorkloadDataset(): Promise<ConsensusWorkloadDataset | null> {
    try {
      const content = await fs.readFile(this.workloadPath, "utf8");
      return JSON.parse(content) as ConsensusWorkloadDataset;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private buildObservation(
    decision: ConsensusDecision,
    dataset: ConsensusWorkloadDataset | null,
    timestamp: string,
  ): ConsensusWorkloadObservation {
    const participants = Array.isArray(decision.agenda?.participants)
      ? [...decision.agenda.participants]
      : [];
    const durationSeconds = this.extractDuration(decision);
    const tokenCostUsd = this.extractTokenCost(decision);

    const guidance = dataset ? this.buildStaffingGuidance(dataset) : undefined;
    const profile = guidance?.profiles?.[decision.type];

    const resolvedDuration =
      durationSeconds ??
      profile?.medianDurationSeconds ??
      null;
    const resolvedTokenCost =
      tokenCostUsd ??
      profile?.tokenCostUsd ??
      guidance?.tokenBudgetUsd?.[decision.type] ??
      guidance?.tokenBudgetUsd?.baseline ??
      null;

    return {
      id: decision.id,
      task_id: decision.taskId,
      task_title: decision.agenda?.rationale?.[0] ?? null,
      type: decision.type,
      timestamp,
      participants,
      quorum_satisfied: decision.quorumSatisfied,
      duration_seconds: resolvedDuration,
      token_cost_usd: resolvedTokenCost,
    };
  }

  private async updateWorkloadDataset(
    dataset: ConsensusWorkloadDataset | null,
    observation: ConsensusWorkloadObservation,
  ): Promise<ConsensusWorkloadDataset | null> {
    const nextDataset = dataset ?? {};
    const observations = Array.isArray(nextDataset.live_observations)
      ? [observation, ...nextDataset.live_observations]
      : [observation];

    if (observations.length > 100) {
      observations.splice(100);
    }

    nextDataset.live_observations = observations;

    const summary: ConsensusWorkloadSummary = nextDataset.live_summary ?? {
      total_decisions: 0,
      by_type: {},
    };
    summary.total_decisions = (summary.total_decisions ?? 0) + 1;
    summary.by_type = summary.by_type ?? {};
    summary.by_type[observation.type] = (summary.by_type[observation.type] ?? 0) + 1;
    nextDataset.live_summary = summary;

    nextDataset.generated_at = observation.timestamp;

    try {
      await fs.mkdir(path.dirname(this.workloadPath), { recursive: true });
      await fs.writeFile(this.workloadPath, JSON.stringify(nextDataset, null, 2), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EROFS") {
        return dataset;
      }
      throw error;
    }

    return nextDataset;
  }

  private extractDuration(decision: ConsensusDecision): number | null {
    const direct = typeof decision.durationSeconds === "number" ? decision.durationSeconds : null;
    if (direct !== null && Number.isFinite(direct)) {
      return direct;
    }
    const metadata = decision.metadata as Record<string, unknown> | undefined;
    const fromMetadata = metadata?.observed_duration_seconds;
    if (typeof fromMetadata === "number" && Number.isFinite(fromMetadata)) {
      return fromMetadata;
    }
    return null;
  }

  private extractTokenCost(decision: ConsensusDecision): number | null {
    const direct = typeof decision.tokenCostUsd === "number" ? decision.tokenCostUsd : null;
    if (direct !== null && Number.isFinite(direct)) {
      return Number(direct.toFixed(5));
    }
    const metadata = decision.metadata as Record<string, unknown> | undefined;
    const fromMetadata = metadata?.token_cost_usd;
    if (typeof fromMetadata === "number" && Number.isFinite(fromMetadata)) {
      return Number(fromMetadata.toFixed(5));
    }
    return null;
  }

  private buildStaffingGuidance(dataset: ConsensusWorkloadDataset): StaffingGuidance | null {
    if (!dataset || typeof dataset !== "object" || !dataset.quorum_profiles) {
      return null;
    }

    const profiles: Record<string, StaffingGuidanceProfile> = {};
    for (const [key, value] of Object.entries(dataset.quorum_profiles)) {
      const participants = Array.isArray(value.default_participants)
        ? value.default_participants.map(String)
        : [];
      const median = value.expected_duration_seconds?.median ?? null;
      const p90 = value.expected_duration_seconds?.p90 ?? null;
      profiles[key] = {
        defaultParticipants: participants,
        medianDurationSeconds: typeof median === "number" ? median : null,
        p90DurationSeconds: typeof p90 === "number" ? p90 : null,
        expectedIterations:
          typeof value.expected_iterations === "number" ? value.expected_iterations : null,
        tokenCostUsd:
          typeof value.token_cost_usd === "number" ? Number(value.token_cost_usd.toFixed(5)) : null,
        notes: value.notes,
      };
    }

    const tokenBudget: Record<string, number | null> = {
      baseline:
        typeof dataset.token_cost_per_run_usd === "number"
          ? Number(dataset.token_cost_per_run_usd.toFixed(5))
          : null,
    };
    for (const [key, profile] of Object.entries(profiles)) {
      tokenBudget[key] = profile.tokenCostUsd ?? null;
    }
    if (dataset.token_budget_per_run?.total !== undefined) {
      tokenBudget.total =
        typeof dataset.token_budget_per_run.total === "number"
          ? Number(dataset.token_budget_per_run.total.toFixed(2))
          : null;
    }

    const signals: StaffingGuidanceSignal[] = [];
    let durationTrigger: number | null = null;
    let retryTrigger: number | null = null;
    if (Array.isArray(dataset.escalation_signals)) {
      for (const entry of dataset.escalation_signals) {
        if (!entry?.signal) {
          continue;
        }
        if (entry.signal === "duration_p90_gt_900s" && typeof entry.threshold_seconds === "number") {
          durationTrigger = entry.threshold_seconds;
        }
        if (entry.signal === "repeat_retries_gt_1" && typeof entry.threshold === "number") {
          retryTrigger = entry.threshold;
        }
        signals.push({
          signal: entry.signal,
          recommendedAction: entry.recommended_action,
          thresholdSeconds:
            typeof entry.threshold_seconds === "number" ? entry.threshold_seconds : null,
          observedValue:
            typeof entry.observed_p90_success === "number"
              ? entry.observed_p90_success
              : typeof entry.observed_retry_rate === "number"
                ? entry.observed_retry_rate
                : null,
        });
      }
    }

    return {
      source: "state/analytics/consensus_workload.json",
      sampleWindow: dataset.sample_window,
      profiles,
      escalationTriggers: {
        durationP90Seconds: durationTrigger,
        retryThreshold: retryTrigger,
        signals,
      },
      tokenBudgetUsd: tokenBudget,
    };
  }
}
