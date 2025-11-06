import type { FeatureGatesReader, FeatureGatesSnapshot } from "../feature_gates.js";

export interface FeatureGateStubOptions {
  snapshot?: Partial<FeatureGatesSnapshot>;
  overrides?: Partial<FeatureGatesReader>;
}

const DEFAULT_SNAPSHOT: FeatureGatesSnapshot = {
  promptMode: "verbose",
  sandboxMode: "none",
  schedulerMode: "legacy",
  selectiveTests: false,
  dangerGates: false,
  moEngine: false,
  otelEnabled: false,
  uiEnabled: true,
  researchLayerEnabled: true,
  intelligentCriticsEnabled: true,
  efficientOperationsEnabled: true,
  adminToolsEnabled: false,
  upgradeToolsEnabled: false,
  routingToolsEnabled: false,
  outcomeLoggingEnabled: true,
  researchTriggerSensitivity: 0.5,
  criticIntelligenceLevel: 2,
  consensusEngineEnabled: true,
  criticReputationEnabled: false,
  evidenceLinkingEnabled: false,
  velocityTrackingEnabled: false,
  disableNewFeatures: false,
};

export function createFeatureGatesStub(options: FeatureGateStubOptions = {}): FeatureGatesReader {
  const snapshot: FeatureGatesSnapshot = {
    ...DEFAULT_SNAPSHOT,
    ...(options.snapshot ?? {}),
  };

  const base: FeatureGatesReader = {
    isCompactPromptMode: () => snapshot.promptMode === "compact",
    getPromptMode: () => snapshot.promptMode,
    isSandboxPoolEnabled: () => snapshot.sandboxMode === "pool",
    getSandboxMode: () => snapshot.sandboxMode,
    isWsjfSchedulerEnabled: () => snapshot.schedulerMode === "wsjf",
    getSchedulerMode: () => snapshot.schedulerMode,
    isSelectiveTestingEnabled: () => snapshot.selectiveTests,
    isDangerGatesEnabled: () => snapshot.dangerGates,
    isMoEngineEnabled: () => snapshot.moEngine,
    isOtelEnabled: () => snapshot.otelEnabled,
    isUiEnabled: () => snapshot.uiEnabled,
    isAdminToolsEnabled: () => snapshot.adminToolsEnabled,
    isUpgradeToolsEnabled: () => snapshot.upgradeToolsEnabled,
    isRoutingToolsEnabled: () => snapshot.routingToolsEnabled,
    isOutcomeLoggingEnabled: () => snapshot.outcomeLoggingEnabled,
    isResearchLayerEnabled: () => snapshot.researchLayerEnabled,
    isIntelligentCriticsEnabled: () => snapshot.intelligentCriticsEnabled,
    isEfficientOperationsEnabled: () => snapshot.efficientOperationsEnabled,
    getResearchTriggerSensitivity: () => snapshot.researchTriggerSensitivity,
    getCriticIntelligenceLevel: () => snapshot.criticIntelligenceLevel,
    shouldDisableNewFeatures: () => snapshot.disableNewFeatures,
    isConsensusEngineEnabled: () => snapshot.consensusEngineEnabled,
    isCriticReputationEnabled: () => snapshot.criticReputationEnabled,
    isEvidenceLinkingEnabled: () => snapshot.evidenceLinkingEnabled,
    isVelocityTrackingEnabled: () => snapshot.velocityTrackingEnabled,
    getSnapshot: () => ({ ...snapshot }),
  };

  if (!options.overrides) {
    return base;
  }

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in options.overrides!) {
        return Reflect.get(options.overrides!, prop, receiver);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
