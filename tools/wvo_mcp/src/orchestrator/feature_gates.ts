import type { LiveFlagsReader } from "../state/live_flags.js";

export type FeatureGatesReader = LiveFlagsReader;

type SandboxMode = "none" | "pool";
type SchedulerMode = "legacy" | "wsjf";
type PromptMode = "compact" | "verbose";
type QuotaPressure = "normal" | "elevated" | "high" | "critical";

export interface FeatureGateSnapshot {
  promptMode: PromptMode;
  sandboxMode: SandboxMode;
  schedulerMode: SchedulerMode;
  selectiveTests: boolean;
  dangerGates: boolean;
  moEngine: boolean;
  otelEnabled: boolean;
  uiEnabled: boolean;
  researchLayerEnabled: boolean;
  intelligentCriticsEnabled: boolean;
  efficientOperationsEnabled: boolean;
  researchTriggerSensitivity: number;
  criticIntelligenceLevel: number;
  criticReputationEnabled: boolean;
  evidenceLinkingEnabled: boolean;
  velocityTrackingEnabled: boolean;
  consensusEngineEnabled: boolean;
  disableNewFeatures: boolean;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function parseNumber(value: string | undefined, defaultValue: number, clamp?: [number, number]): number {
  const numeric = Number.parseFloat(value ?? "");
  if (!Number.isFinite(numeric)) return defaultValue;
  if (clamp) {
    const [min, max] = clamp;
    return Math.min(max, Math.max(min, numeric));
  }
  return numeric;
}

export class FeatureGates {
  constructor(private readonly flags: LiveFlagsReader) {}

  private getFlag(key: string, fallback: string): string {
    try {
      return this.flags.getValue(key as any) ?? fallback;
    } catch {
      return fallback;
    }
  }

  getPromptMode(): PromptMode {
    const mode = this.getFlag("PROMPT_MODE", "compact");
    return mode === "verbose" ? "verbose" : "compact";
  }

  isCompactPromptMode(): boolean {
    return this.getPromptMode() === "compact";
  }

  getSandboxMode(): SandboxMode {
    const mode = this.getFlag("SANDBOX_MODE", "none");
    return mode === "pool" ? "pool" : "none";
  }

  isSandboxPoolEnabled(): boolean {
    return this.getSandboxMode() === "pool";
  }

  getSchedulerMode(): SchedulerMode {
    const mode = this.getFlag("SCHEDULER_MODE", "legacy");
    return mode === "wsjf" ? "wsjf" : "legacy";
  }

  isWsjfSchedulerEnabled(): boolean {
    return this.getSchedulerMode() === "wsjf";
  }

  isSelectiveTestingEnabled(): boolean {
    return parseBoolean(this.getFlag("SELECTIVE_TESTS", "0"), false);
  }

  isDangerGatesEnabled(): boolean {
    return parseBoolean(this.getFlag("DANGER_GATES", "0"), false);
  }

  isMoEngineEnabled(): boolean {
    return parseBoolean(this.getFlag("MO_ENGINE", "0"), false);
  }

  isOtelEnabled(): boolean {
    return parseBoolean(this.getFlag("OTEL_ENABLED", "0"), false);
  }

  isUiEnabled(): boolean {
    return parseBoolean(this.getFlag("UI_ENABLED", "0"), false);
  }

  isResearchLayerEnabled(): boolean {
    return parseBoolean(this.getFlag("RESEARCH_LAYER", "1"), true);
  }

  isIntelligentCriticsEnabled(): boolean {
    return parseBoolean(this.getFlag("INTELLIGENT_CRITICS", "1"), true);
  }

  isEfficientOperationsEnabled(): boolean {
    return parseBoolean(this.getFlag("EFFICIENT_OPERATIONS", "1"), true);
  }

  getResearchTriggerSensitivity(): number {
    return parseNumber(this.getFlag("RESEARCH_TRIGGER_SENSITIVITY", "0.5"), 0.5, [0, 1]);
  }

  getCriticIntelligenceLevel(): number {
    return Math.round(parseNumber(this.getFlag("CRITIC_INTELLIGENCE_LEVEL", "2"), 2, [1, 3]));
  }

  isCriticReputationEnabled(): boolean {
    return parseBoolean(this.getFlag("CRITIC_REPUTATION", "0"), false);
  }

  isEvidenceLinkingEnabled(): boolean {
    return parseBoolean(this.getFlag("EVIDENCE_LINKING", "0"), false);
  }

  isVelocityTrackingEnabled(): boolean {
    return parseBoolean(this.getFlag("VELOCITY_TRACKING", "0"), false);
  }

  isConsensusEngineEnabled(): boolean {
    return parseBoolean(this.getFlag("CONSENSUS_ENGINE", "1"), true);
  }

  shouldDisableNewFeatures(): boolean {
    return parseBoolean(this.getFlag("DISABLE_NEW", "0"), false);
  }

  getQuotaPressure(): QuotaPressure {
    if (this.shouldDisableNewFeatures()) return "critical";
    if (!this.isEfficientOperationsEnabled()) return "high";
    if (!this.isIntelligentCriticsEnabled()) return "elevated";
    return "normal";
  }

  getSnapshot(): FeatureGateSnapshot {
    return {
      promptMode: this.getPromptMode(),
      sandboxMode: this.getSandboxMode(),
      schedulerMode: this.getSchedulerMode(),
      selectiveTests: this.isSelectiveTestingEnabled(),
      dangerGates: this.isDangerGatesEnabled(),
      moEngine: this.isMoEngineEnabled(),
      otelEnabled: this.isOtelEnabled(),
      uiEnabled: this.isUiEnabled(),
      researchLayerEnabled: this.isResearchLayerEnabled(),
      intelligentCriticsEnabled: this.isIntelligentCriticsEnabled(),
      efficientOperationsEnabled: this.isEfficientOperationsEnabled(),
      researchTriggerSensitivity: this.getResearchTriggerSensitivity(),
      criticIntelligenceLevel: this.getCriticIntelligenceLevel(),
      criticReputationEnabled: this.isCriticReputationEnabled(),
      evidenceLinkingEnabled: this.isEvidenceLinkingEnabled(),
      velocityTrackingEnabled: this.isVelocityTrackingEnabled(),
      consensusEngineEnabled: this.isConsensusEngineEnabled(),
      disableNewFeatures: this.shouldDisableNewFeatures(),
    };
  }
}
