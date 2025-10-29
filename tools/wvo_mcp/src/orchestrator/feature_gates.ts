/**
 * Feature Gates - Flag-based feature activation during canary promotion
 *
 * This module provides a clean interface for gating features behind live flags
 * during the canary upgrade flow. Features can be safely toggled at runtime
 * without code changes.
 *
 * Usage:
 * ```ts
 * const gates = new FeatureGates(liveFlags);
 * if (gates.isCompactPromptMode()) {
 *   // Use compact headers
 * }
 * ```
 */

import type { LiveFlagKey, LiveFlagsReader } from '../state/live_flags.js';

export interface FeatureGatesReader {
  isCompactPromptMode(): boolean;
  getPromptMode(): 'compact' | 'verbose';
  isSandboxPoolEnabled(): boolean;
  getSandboxMode(): 'pool' | 'none';
  getSchedulerMode(): 'wsjf' | 'legacy';
  isAdminToolsEnabled(): boolean;
  isUpgradeToolsEnabled(): boolean;
  isRoutingToolsEnabled(): boolean;
  getObserverConfig(): {
    enabled: boolean;
    cadence: number;
    timeoutMs: number;
    model: string;
  };
  getQualityGraphEmbeddingMode(): 'tfidf' | 'neural';
}

export interface FeatureGatesConfig {
  liveFlags: LiveFlagsReader;
}

export class FeatureGates implements FeatureGatesReader {
  constructor(private readonly liveFlags: LiveFlagsReader) {}

  /**
   * Check if compact prompt mode is enabled
   * - 'compact': Reduced context, abbreviated prompts (efficient)
   * - 'verbose': Full context, detailed prompts (thorough)
   */
  isCompactPromptMode(): boolean {
    return this.liveFlags.getValue('PROMPT_MODE') === 'compact';
  }

  /**
   * Get current prompt mode
   */
  getPromptMode(): 'compact' | 'verbose' {
    return this.liveFlags.getValue('PROMPT_MODE') as 'compact' | 'verbose';
  }

  /**
   * Check if sandbox pooling is enabled
   * - 'pool': Reuse browser/agent processes (faster, less isolated)
   * - 'none': Fresh process each time (slower, more isolated - default)
   */
  isSandboxPoolEnabled(): boolean {
    return this.liveFlags.getValue('SANDBOX_MODE') === 'pool';
  }

  /**
   * Get current sandbox mode
   */
  getSandboxMode(): 'pool' | 'none' {
    return this.liveFlags.getValue('SANDBOX_MODE') as 'pool' | 'none';
  }

  /**
   * Check if administrative runtime tooling is enabled
   */
  isAdminToolsEnabled(): boolean {
    return this.liveFlags.getValue('ADMIN_TOOLS') === '1';
  }

  /**
   * Check if upgrade/patch tooling is enabled
   */
  isUpgradeToolsEnabled(): boolean {
    return this.liveFlags.getValue('UPGRADE_TOOLS') === '1';
  }

  /**
   * Check if route switching controls are enabled
   */
  isRoutingToolsEnabled(): boolean {
    return this.liveFlags.getValue('ROUTING_TOOLS') === '1';
  }

  getHolisticReviewCadence(): {
    enabled: boolean;
    minTasksPerGroup: number;
    maxTasksTracked: number;
    groupIntervalMinutes: number;
    globalIntervalMinutes: number;
    globalMinTasks: number;
  } {
    return {
      enabled: this.liveFlags.getValue('HOLISTIC_REVIEW_ENABLED') === '1',
      minTasksPerGroup: this.parsePositiveIntFlag('HOLISTIC_REVIEW_MIN_TASKS', 3, { max: 50 }),
      maxTasksTracked: this.parsePositiveIntFlag('HOLISTIC_REVIEW_MAX_TASKS_TRACKED', 6, { max: 20 }),
      groupIntervalMinutes: this.parsePositiveIntFlag('HOLISTIC_REVIEW_GROUP_INTERVAL_MINUTES', 45, {
        max: 1440,
      }),
      globalIntervalMinutes: this.parsePositiveIntFlag('HOLISTIC_REVIEW_GLOBAL_INTERVAL_MINUTES', 90, {
        max: 1440,
      }),
      globalMinTasks: this.parsePositiveIntFlag('HOLISTIC_REVIEW_GLOBAL_MIN_TASKS', 6, { max: 100 }),
    };
  }

  getObserverConfig(): {
    enabled: boolean;
    cadence: number;
    timeoutMs: number;
    model: string;
  } {
    const enabled = this.liveFlags.getValue('OBSERVER_AGENT_ENABLED') === '1';
    const cadence = this.parsePositiveIntFlag('OBSERVER_AGENT_CADENCE', 5, { max: 1000 });
    const timeoutMs = this.parsePositiveIntFlag('OBSERVER_AGENT_TIMEOUT_MS', 30000, {
      min: 1000,
      max: 300000,
    });
    const model = this.liveFlags.getValue('OBSERVER_AGENT_MODEL') || 'gpt-5.1-high';
    return { enabled, cadence, timeoutMs, model };
  }

  getQualityGraphEmbeddingMode(): 'tfidf' | 'neural' {
    const value = this.liveFlags.getValue('QUALITY_GRAPH_EMBEDDINGS');
    return value === 'neural' ? 'neural' : 'tfidf';
  }

  private parsePositiveIntFlag(
    key: LiveFlagKey,
    fallback: number,
    bounds: { min?: number; max?: number } = {},
  ): number {
    const raw = this.liveFlags.getValue(key);
    const parsed = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return fallback;
    }
    const min = bounds.min ?? 1;
    let result = Math.max(min, parsed);
    if (typeof bounds.max === 'number') {
      result = Math.min(bounds.max, result);
    }
    return result;
  }

  /**
   * Check if WSJF (Weighted Shortest Job First) scheduler is enabled
   * - 'wsjf': Multi-criteria priority scheduling (job value, duration, risk)
   * - 'legacy': Simple status-based priority (default)
   */
  isWsjfSchedulerEnabled(): boolean {
    return this.liveFlags.getValue('SCHEDULER_MODE') === 'wsjf';
  }

  /**
   * Get current scheduler mode
   */
  getSchedulerMode(): 'wsjf' | 'legacy' {
    return this.liveFlags.getValue('SCHEDULER_MODE') as 'wsjf' | 'legacy';
  }

  /**
   * Check if selective testing is enabled
   * - '1': Run only critical tests (fast)
   * - '0': Run all tests (thorough - default)
   */
  isSelectiveTestingEnabled(): boolean {
    return this.liveFlags.getValue('SELECTIVE_TESTS') === '1';
  }

  /**
   * Check if danger gates are enabled
   * - '1': Strict command safety enforcement
   * - '0': Relaxed safety checks (default)
   */
  isDangerGatesEnabled(): boolean {
    return this.liveFlags.getValue('DANGER_GATES') === '1';
  }

  /**
   * Check if multi-objective engine is enabled
   * - '1': Optimize for cost/speed/quality tradeoffs
   * - '0': Single-objective optimization (default)
   */
  isMoEngineEnabled(): boolean {
    return this.liveFlags.getValue('MO_ENGINE') === '1';
  }

  /**
   * Check if OpenTelemetry tracing is enabled
   * - '1': Enable OTEL instrumentation
   * - '0': Disabled (default)
   */
  isOtelEnabled(): boolean {
    return this.liveFlags.getValue('OTEL_ENABLED') === '1';
  }

  /**
   * Check if UI features are enabled
   * - '1': Enable UI functionality
   * - '0': Disabled (default)
   */
  isUiEnabled(): boolean {
    return this.liveFlags.getValue('UI_ENABLED') === '1';
  }

  /**
   * Check if research layer is enabled
   * - '1': Enable research manager and features (default)
   * - '0': Disabled
   */
  isResearchLayerEnabled(): boolean {
    return this.liveFlags.getValue('RESEARCH_LAYER') === '1';
  }

  /**
   * Check if intelligent critics are enabled
   * - '1': Enable critic intelligence enhancements (default)
   * - '0': Disabled
   */
  isIntelligentCriticsEnabled(): boolean {
    return this.liveFlags.getValue('INTELLIGENT_CRITICS') === '1';
  }

  /**
   * Check if efficient operations are enabled
   * - '1': Enable operation efficiency optimizations (default)
   * - '0': Disabled
   */
  isEfficientOperationsEnabled(): boolean {
    return this.liveFlags.getValue('EFFICIENT_OPERATIONS') === '1';
  }

  /**
   * Get research trigger sensitivity
   * - Range: 0.0 to 1.0 (default: 0.5)
   */
  getResearchTriggerSensitivity(): number {
    const value = this.liveFlags.getValue('RESEARCH_TRIGGER_SENSITIVITY');
    return Number.parseFloat(value as string) || 0.5;
  }

  /**
   * Get critic intelligence level
   * - Range: 1 to 3 (default: 2)
   */
  getCriticIntelligenceLevel(): number {
    const value = this.liveFlags.getValue('CRITIC_INTELLIGENCE_LEVEL');
    return Number.parseInt(value as string, 10) || 2;
  }

  /**
   * Check if critic reputation tracking is enabled
   * - '1': Enable reputation system
   * - '0': Disabled (default)
   */
  isCriticReputationEnabled(): boolean {
    return this.liveFlags.getValue('CRITIC_REPUTATION') === '1';
  }

  /**
   * Check if evidence linking is enabled
   * - '1': Enable evidence linking to decisions
   * - '0': Disabled (default)
   */
  isEvidenceLinkingEnabled(): boolean {
    return this.liveFlags.getValue('EVIDENCE_LINKING') === '1';
  }

  /**
   * Check if velocity tracking is enabled
   * - '1': Enable velocity metrics collection
   * - '0': Disabled (default)
   */
  isVelocityTrackingEnabled(): boolean {
    return this.liveFlags.getValue('VELOCITY_TRACKING') === '1';
  }

  /**
   * Check if consensus engine is enabled
   * - '1': Enable consensus mechanisms (default)
   * - '0': Disabled
   */
  isConsensusEngineEnabled(): boolean {
    return this.liveFlags.getValue('CONSENSUS_ENGINE') === '1';
  }

  /**
   * Check if new features should be disabled (emergency flag)
   * - '1': Disable new features for stability
   * - '0': Allow new features (default)
   */
  shouldDisableNewFeatures(): boolean {
    return this.liveFlags.getValue('DISABLE_NEW') === '1';
  }

  /**
   * Get snapshot of all feature gates
   */
  getSnapshot() {
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
      adminToolsEnabled: this.isAdminToolsEnabled(),
      upgradeToolsEnabled: this.isUpgradeToolsEnabled(),
      routingToolsEnabled: this.isRoutingToolsEnabled(),
    };
  }
}
