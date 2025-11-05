import type { ProviderName, ProviderUsage, SubscriptionLimitTracker } from "./subscription_tracker.js";
import { logInfo } from "../telemetry/logger.js";

export interface UsageEstimate {
  taskName: string;
  expectedTokens: number;
  expectedRequests: number;
  risk: "low" | "medium" | "high";
}

export interface ProviderCandidate {
  provider: ProviderName;
  account: string;
}

export interface ProviderRecommendation {
  preferred_provider: ProviderName;
  fallback_provider: ProviderName | null;
  quota_pressure: "normal" | "elevated" | "high" | "critical";
  reasoning: string;
}

export class UsageEstimator {
  constructor(private readonly tracker: SubscriptionLimitTracker) {}

  estimateTask(taskName: string, expectedTokens: number): UsageEstimate {
    const risk =
      expectedTokens < 2000 ? "low" : expectedTokens < 6000 ? "medium" : "high";

    return {
      taskName,
      expectedTokens,
      expectedRequests: 1,
      risk,
    };
  }

  recommendProvider(
    estimate: UsageEstimate,
    candidates: ProviderCandidate[],
  ): ProviderRecommendation {
    if (candidates.length === 0) {
      throw new Error("No provider candidates available for recommendation.");
    }

    // Simple heuristic for bootstrap mode: prefer Claude, fall back to Codex if available.
    const claudeCandidate = candidates.find((candidate) => candidate.provider === "claude");
    const codexCandidate = candidates.find((candidate) => candidate.provider === "codex");

    const preferred = claudeCandidate ?? codexCandidate ?? candidates[0];
    const fallback =
      preferred.provider === "claude" ? codexCandidate ?? null : claudeCandidate ?? null;

    const quotaPressure = this.estimateQuotaPressure(preferred.provider);

    logInfo("Usage estimator recommendation", {
      task: estimate.taskName,
      preferred: preferred.provider,
      fallback: fallback?.provider,
      quotaPressure,
    });

    return {
      preferred_provider: preferred.provider,
      fallback_provider: fallback?.provider ?? null,
      quota_pressure: quotaPressure,
      reasoning:
        quotaPressure === "normal"
          ? "Using default provider preference."
          : `Quota pressure ${quotaPressure}.`,
    };
  }

  private estimateQuotaPressure(provider: ProviderName): "normal" | "elevated" | "high" | "critical" {
    // SubscriptionLimitTracker exposes usage via internal map; use public events to infer.
    // For bootstrap we report normal unless we detect usage above 80% thresholds.
    try {
      const snapshot = (this.tracker as any).usage as Map<string, ProviderUsage>;
      if (!snapshot || snapshot.size === 0) {
        return "normal";
      }

      const providerUsage = Array.from(snapshot.values()).find(
        (usage) => usage.provider === provider,
      );

      if (!providerUsage) {
        return "normal";
      }

      const percent = providerUsage.warnings.percentage_used;
      if (percent >= 0.95) return "critical";
      if (percent >= 0.85) return "high";
      if (percent >= 0.7) return "elevated";
      return "normal";
    } catch {
      return "normal";
    }
  }
}
