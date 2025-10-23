import fs from "node:fs";
import path from "node:path";

import { logWarning } from "../../telemetry/logger.js";
import { resolveStateRoot, resolveWorkspaceRoot } from "../../utils/config.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface QuorumProfile {
  name: string;
  defaultParticipants: string[];
  medianDurationSeconds?: number;
  p90DurationSeconds?: number;
  expectedIterations?: number;
  tokenCostUsd?: number;
  notes?: string;
}

export interface EscalationSignal {
  signal: string;
  thresholdSeconds?: number;
  threshold?: number;
  recommendedAction?: string;
}

export interface ConsensusWorkloadSnapshot {
  generatedAt?: string;
  sampleWindow?: {
    start?: string;
    end?: string;
  };
  quorumProfiles: Record<string, QuorumProfile>;
  escalationSignals: EscalationSignal[];
  tokenBudgetUsd: Record<string, number | undefined>;
}

interface RawConsensusWorkload {
  generated_at?: string;
  sample_window?: {
    start?: string;
    end?: string;
  };
  quorum_profiles?: Record<string, unknown>;
  escalation_signals?: unknown[];
  token_cost_per_run_usd?: number;
  token_budget_per_run?: {
    completion?: number;
    prompt?: number;
    total?: number;
  };
}

let cachedSnapshot: ConsensusWorkloadSnapshot | null = null;
let cachedAt = 0;
let cachedPath: string | null = null;

function resolveWorkloadPath(workspaceRoot?: string): string {
  const overridePath = process.env.WVO_CONSENSUS_WORKLOAD_PATH;
  if (overridePath && overridePath.trim().length > 0) {
    return path.resolve(overridePath);
  }
  const root = workspaceRoot ?? resolveWorkspaceRoot();
  const stateRoot = resolveStateRoot(root);
  return path.join(stateRoot, "analytics", "consensus_workload.json");
}

function normaliseParticipants(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const participants = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      participants.add(entry.trim().toLowerCase());
    }
  }
  return Array.from(participants);
}

function normaliseProfile(name: string, value: unknown): QuorumProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const durations = record.expected_duration_seconds as
    | { median?: unknown; p90?: unknown }
    | undefined;
  const profile: QuorumProfile = {
    name,
    defaultParticipants: normaliseParticipants(record.default_participants),
  };
  const medianRaw = durations?.median;
  const p90Raw = durations?.p90;
  if (typeof medianRaw === "number" && Number.isFinite(medianRaw)) {
    profile.medianDurationSeconds = medianRaw;
  }
  if (typeof p90Raw === "number" && Number.isFinite(p90Raw)) {
    profile.p90DurationSeconds = p90Raw;
  }
  if (typeof record.expected_iterations === "number" && Number.isFinite(record.expected_iterations)) {
    profile.expectedIterations = record.expected_iterations;
  }
  if (typeof record.token_cost_usd === "number" && Number.isFinite(record.token_cost_usd)) {
    profile.tokenCostUsd = Number(record.token_cost_usd.toFixed(5));
  }
  if (typeof record.notes === "string" && record.notes.trim().length > 0) {
    profile.notes = record.notes.trim();
  }
  return profile;
}

function normaliseSignal(value: unknown): EscalationSignal | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const signalRaw = entry.signal;
  if (typeof signalRaw !== "string" || signalRaw.trim().length === 0) {
    return null;
  }
  const signal: EscalationSignal = {
    signal: signalRaw.trim(),
  };
  if (typeof entry.threshold_seconds === "number" && Number.isFinite(entry.threshold_seconds)) {
    signal.thresholdSeconds = entry.threshold_seconds;
  }
  if (typeof entry.threshold === "number" && Number.isFinite(entry.threshold)) {
    signal.threshold = entry.threshold;
  }
  if (typeof entry.recommended_action === "string" && entry.recommended_action.trim().length > 0) {
    signal.recommendedAction = entry.recommended_action.trim();
  }
  return signal;
}

function normaliseSnapshot(raw: RawConsensusWorkload): ConsensusWorkloadSnapshot {
  const quorumProfiles: Record<string, QuorumProfile> = {};
  if (raw.quorum_profiles && typeof raw.quorum_profiles === "object") {
    for (const [key, value] of Object.entries(raw.quorum_profiles)) {
      const profile = normaliseProfile(key, value);
      if (profile) {
        quorumProfiles[key] = profile;
      }
    }
  }

  const signals: EscalationSignal[] = [];
  if (Array.isArray(raw.escalation_signals)) {
    for (const entry of raw.escalation_signals) {
      const signal = normaliseSignal(entry);
      if (signal) {
        signals.push(signal);
      }
    }
  }

  const tokenBudget: Record<string, number | undefined> = {};
  if (typeof raw.token_cost_per_run_usd === "number" && Number.isFinite(raw.token_cost_per_run_usd)) {
    tokenBudget.baseline = Number(raw.token_cost_per_run_usd.toFixed(5));
  }
  if (raw.token_budget_per_run && typeof raw.token_budget_per_run === "object") {
    if (
      typeof raw.token_budget_per_run.total === "number" &&
      Number.isFinite(raw.token_budget_per_run.total)
    ) {
      tokenBudget.total = Number(raw.token_budget_per_run.total.toFixed(2));
    }
    if (
      typeof raw.token_budget_per_run.prompt === "number" &&
      Number.isFinite(raw.token_budget_per_run.prompt)
    ) {
      tokenBudget.prompt = Number(raw.token_budget_per_run.prompt.toFixed(2));
    }
    if (
      typeof raw.token_budget_per_run.completion === "number" &&
      Number.isFinite(raw.token_budget_per_run.completion)
    ) {
      tokenBudget.completion = Number(raw.token_budget_per_run.completion.toFixed(2));
    }
  }

  for (const [key, profile] of Object.entries(quorumProfiles)) {
    if (profile.tokenCostUsd !== undefined) {
      tokenBudget[key] = profile.tokenCostUsd;
    }
  }

  return {
    generatedAt: raw.generated_at,
    sampleWindow: raw.sample_window,
    quorumProfiles,
    escalationSignals: signals,
    tokenBudgetUsd: tokenBudget,
  };
}

export function getConsensusWorkloadSnapshot(
  overridePath?: string,
): ConsensusWorkloadSnapshot | null {
  const resolvedPath = path.resolve(overridePath ?? resolveWorkloadPath());
  const now = Date.now();
  if (
    cachedSnapshot &&
    cachedPath === resolvedPath &&
    now - cachedAt < CACHE_TTL_MS
  ) {
    return cachedSnapshot;
  }

  try {
    const rawContent = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(rawContent) as RawConsensusWorkload;
    cachedSnapshot = normaliseSnapshot(parsed);
    cachedAt = now;
    cachedPath = resolvedPath;
    return cachedSnapshot;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") {
      logWarning("Failed to load consensus workload snapshot", {
        path: resolvedPath,
        error: nodeError?.message ?? String(error),
      });
    }
    cachedSnapshot = null;
    cachedAt = now;
    cachedPath = resolvedPath;
    return null;
  }
}

export function invalidateConsensusWorkloadCache(): void {
  cachedSnapshot = null;
  cachedAt = 0;
  cachedPath = null;
}
