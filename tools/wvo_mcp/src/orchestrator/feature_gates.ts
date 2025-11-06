import type { LiveFlagsReader } from '../state/live_flags.js';

export interface FeatureGatesSnapshot {
  promptMode: 'compact' | 'verbose';
  sandboxMode: 'none' | 'pool';
  schedulerMode: 'legacy' | 'wsjf' | string;
  selectiveTests: boolean;
  dangerGates: boolean;
  moEngine: boolean;
  otelEnabled: boolean;
  uiEnabled: boolean;
  researchLayerEnabled: boolean;
  intelligentCriticsEnabled: boolean;
  efficientOperationsEnabled: boolean;
  adminToolsEnabled: boolean;
  upgradeToolsEnabled: boolean;
  routingToolsEnabled: boolean;
  outcomeLoggingEnabled: boolean;
  researchTriggerSensitivity: number;
  criticIntelligenceLevel: number;
  consensusEngineEnabled: boolean;
  criticReputationEnabled: boolean;
  evidenceLinkingEnabled: boolean;
  velocityTrackingEnabled: boolean;
  disableNewFeatures: boolean;
}

export interface FeatureGatesReader {
  isCompactPromptMode(): boolean;
  getPromptMode(): 'compact' | 'verbose';
  isSandboxPoolEnabled(): boolean;
  getSandboxMode(): 'none' | 'pool';
  isWsjfSchedulerEnabled(): boolean;
  getSchedulerMode(): 'legacy' | 'wsjf' | string;
  isSelectiveTestingEnabled(): boolean;
  isDangerGatesEnabled(): boolean;
  isMoEngineEnabled(): boolean;
  isOtelEnabled(): boolean;
  isUiEnabled(): boolean;
  isAdminToolsEnabled(): boolean;
  isUpgradeToolsEnabled(): boolean;
  isRoutingToolsEnabled(): boolean;
  isOutcomeLoggingEnabled(): boolean;
  isResearchLayerEnabled(): boolean;
  isIntelligentCriticsEnabled(): boolean;
  isEfficientOperationsEnabled(): boolean;
  getResearchTriggerSensitivity(): number;
  getCriticIntelligenceLevel(): number;
  shouldDisableNewFeatures(): boolean;
  isConsensusEngineEnabled(): boolean;
  isCriticReputationEnabled(): boolean;
  isEvidenceLinkingEnabled(): boolean;
  isVelocityTrackingEnabled(): boolean;
  getSnapshot(): FeatureGatesSnapshot;
}

const truthy = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value === '') return fallback;
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'enabled';
};

const toNumber = (value: string | undefined, fallback: number) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export class FeatureGates implements FeatureGatesReader {
  constructor(private readonly liveFlags?: LiveFlagsReader) {}

  private getFlag(key: string): string | undefined {
    if (!this.liveFlags) return undefined;
    const value = this.liveFlags.getValue(key as any);
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
    if (typeof value === 'boolean') return value ? '1' : '0';
    return undefined;
  }

  isCompactPromptMode(): boolean {
    return this.getPromptMode() === 'compact';
  }

  getPromptMode(): 'compact' | 'verbose' {
    const value = this.getFlag('PROMPT_MODE');
    return value === 'verbose' ? 'verbose' : 'compact';
  }

  isSandboxPoolEnabled(): boolean {
    return this.getSandboxMode() === 'pool';
  }

  getSandboxMode(): 'none' | 'pool' {
    const value = this.getFlag('SANDBOX_MODE');
    return value === 'pool' ? 'pool' : 'none';
  }

  isWsjfSchedulerEnabled(): boolean {
    return this.getSchedulerMode() === 'wsjf';
  }

  getSchedulerMode(): 'legacy' | 'wsjf' | string {
    const value = this.getFlag('SCHEDULER_MODE');
    return value === 'wsjf' ? 'wsjf' : value === undefined || value === '' ? 'legacy' : value;
  }

  isSelectiveTestingEnabled(): boolean {
    return truthy(this.getFlag('SELECTIVE_TESTS'), false);
  }

  isDangerGatesEnabled(): boolean {
    return truthy(this.getFlag('DANGER_GATES'), false);
  }

  isMoEngineEnabled(): boolean {
    return truthy(this.getFlag('MO_ENGINE'), false);
  }

  isOtelEnabled(): boolean {
    return truthy(this.getFlag('OTEL_ENABLED'), false);
  }

  isUiEnabled(): boolean {
    return truthy(this.getFlag('UI_ENABLED'), false);
  }

  isAdminToolsEnabled(): boolean {
    return truthy(this.getFlag('ADMIN_TOOLS'), this.isUiEnabled());
  }

  isUpgradeToolsEnabled(): boolean {
    return truthy(this.getFlag('UPGRADE_TOOLS'), false);
  }

  isRoutingToolsEnabled(): boolean {
    return truthy(this.getFlag('ROUTING_TOOLS'), false);
  }

  isOutcomeLoggingEnabled(): boolean {
    return truthy(this.getFlag('OUTCOME_LOGGING'), true);
  }

  isResearchLayerEnabled(): boolean {
    return truthy(this.getFlag('RESEARCH_LAYER'), true);
  }

  isIntelligentCriticsEnabled(): boolean {
    return truthy(this.getFlag('INTELLIGENT_CRITICS'), true);
  }

  isEfficientOperationsEnabled(): boolean {
    return truthy(this.getFlag('EFFICIENT_OPERATIONS'), true);
  }

  getResearchTriggerSensitivity(): number {
    return toNumber(this.getFlag('RESEARCH_TRIGGER_SENSITIVITY'), 0.5);
  }

  getCriticIntelligenceLevel(): number {
    return Math.max(1, Math.min(3, Math.round(toNumber(this.getFlag('CRITIC_INTELLIGENCE_LEVEL'), 2))));
  }

  shouldDisableNewFeatures(): boolean {
    return truthy(this.getFlag('DISABLE_NEW'), false);
  }

  isConsensusEngineEnabled(): boolean {
    return truthy(this.getFlag('CONSENSUS_ENGINE'), true);
  }

  isCriticReputationEnabled(): boolean {
    return truthy(this.getFlag('CRITIC_REPUTATION'), false);
  }

  isEvidenceLinkingEnabled(): boolean {
    return truthy(this.getFlag('EVIDENCE_LINKING'), false);
  }

  isVelocityTrackingEnabled(): boolean {
    return truthy(this.getFlag('VELOCITY_TRACKING'), false);
  }

  getSnapshot(): FeatureGatesSnapshot {
    return {
      promptMode: this.getPromptMode(),
      sandboxMode: this.getSandboxMode(),
      schedulerMode: this.getSchedulerMode(),
      selectiveTests: this.isSelectiveTestingEnabled(),
      dangerGates: this.isDangerGatesEnabled(),
      moEngine: this.isMoEngineEnabled(),
      otelEnabled: this.isOtelEnabled(),
      uiEnabled: this.isUiEnabled(),
      adminToolsEnabled: this.isAdminToolsEnabled(),
      upgradeToolsEnabled: this.isUpgradeToolsEnabled(),
      routingToolsEnabled: this.isRoutingToolsEnabled(),
      outcomeLoggingEnabled: this.isOutcomeLoggingEnabled(),
      researchLayerEnabled: this.isResearchLayerEnabled(),
      intelligentCriticsEnabled: this.isIntelligentCriticsEnabled(),
      efficientOperationsEnabled: this.isEfficientOperationsEnabled(),
      researchTriggerSensitivity: this.getResearchTriggerSensitivity(),
      criticIntelligenceLevel: this.getCriticIntelligenceLevel(),
      consensusEngineEnabled: this.isConsensusEngineEnabled(),
      criticReputationEnabled: this.isCriticReputationEnabled(),
      evidenceLinkingEnabled: this.isEvidenceLinkingEnabled(),
      velocityTrackingEnabled: this.isVelocityTrackingEnabled(),
      disableNewFeatures: this.shouldDisableNewFeatures(),
    };
  }
}
