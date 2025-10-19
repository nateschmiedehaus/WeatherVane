/**
 * CriticReputationTracker
 *
 * Analyzes critic history to calculate reputation scores based on:
 * - Overall pass/fail accuracy
 * - False positive rate (failures that were later overridden)
 * - Consistency over time
 * - Category-specific performance
 *
 * This is a read-only analytics component that doesn't modify critic behavior.
 */

import type { StateMachine, CriticHistoryRecord } from './state_machine.js';

export interface CriticReputation {
  critic: string;
  totalChecks: number;
  passRate: number;
  failRate: number;
  recentPassRate: number; // Last 20 checks
  consistency: number; // 0-1, how stable the pass rate is
  confidence: number; // 0-1, overall reliability score
  categoryBreakdown: Record<string, {
    checks: number;
    passRate: number;
  }>;
  lastSeen: number | null;
}

export interface ReputationSummary {
  critics: CriticReputation[];
  timestamp: number;
  totalChecks: number;
  averageConfidence: number;
}

interface ReputationTrackerOptions {
  recentWindow?: number; // How many recent checks to consider for "recent" metrics
  consistencyWindow?: number; // Window size for consistency calculation
}

const DEFAULT_OPTIONS: Required<ReputationTrackerOptions> = {
  recentWindow: 20,
  consistencyWindow: 10,
};

export class CriticReputationTracker {
  private readonly options: Required<ReputationTrackerOptions>;

  constructor(
    private readonly stateMachine: StateMachine,
    options: ReputationTrackerOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get reputation for a specific critic
   */
  getCriticReputation(critic: string): CriticReputation | null {
    try {
      if (!critic || typeof critic !== 'string') {
        return null;
      }

      const history = this.stateMachine.getCriticHistory(critic, { limit: 100 });

      if (!history || history.length === 0) {
        return null;
      }

      return this.calculateReputation(critic, history);
    } catch (error) {
      // Silently fail - this is analytics, shouldn't break operations
      return null;
    }
  }

  /**
   * Get reputation summary for all critics
   */
  getAllReputations(): ReputationSummary {
    try {
      // Get all unique critics from history
      // Note: This is a simplified approach. In production, you'd query distinct critics from DB
      const allHistory = this.getAllCriticHistory();
      const criticNames = new Set(allHistory.map(h => h.critic).filter(Boolean));

      const critics: CriticReputation[] = [];
      let totalChecks = 0;
      let totalConfidence = 0;

      for (const critic of criticNames) {
        try {
          const history = allHistory.filter(h => h.critic === critic);
          if (history.length > 0) {
            const reputation = this.calculateReputation(critic, history);
            critics.push(reputation);
            totalChecks += reputation.totalChecks;
            totalConfidence += reputation.confidence;
          }
        } catch (error) {
          // Skip this critic if calculation fails
          continue;
        }
      }

      return {
        critics: critics.sort((a, b) => b.confidence - a.confidence),
        timestamp: Date.now(),
        totalChecks,
        averageConfidence: critics.length > 0 ? totalConfidence / critics.length : 0,
      };
    } catch (error) {
      // Return empty summary on error
      return {
        critics: [],
        timestamp: Date.now(),
        totalChecks: 0,
        averageConfidence: 0,
      };
    }
  }

  /**
   * Get critics ranked by confidence
   */
  getTopCritics(limit: number = 10): CriticReputation[] {
    const summary = this.getAllReputations();
    return summary.critics.slice(0, limit);
  }

  /**
   * Get critics that may need attention (low confidence, high inconsistency)
   */
  getFlaggingCritics(confidenceThreshold: number = 0.7): CriticReputation[] {
    const summary = this.getAllReputations();
    return summary.critics.filter(c =>
      c.confidence < confidenceThreshold ||
      c.consistency < 0.6
    );
  }

  private calculateReputation(critic: string, history: CriticHistoryRecord[]): CriticReputation {
    const totalChecks = history.length;
    const passes = history.filter(h => h.passed).length;
    const fails = history.filter(h => !h.passed).length;

    const passRate = totalChecks > 0 ? passes / totalChecks : 0;
    const failRate = totalChecks > 0 ? fails / totalChecks : 0;

    // Recent pass rate (last N checks)
    const recent = history.slice(0, this.options.recentWindow);
    const recentPasses = recent.filter(h => h.passed).length;
    const recentPassRate = recent.length > 0 ? recentPasses / recent.length : passRate;

    // Consistency: measure variance in pass rate over sliding windows
    const consistency = this.calculateConsistency(history);

    // Confidence: weighted combination of factors
    // - Higher pass rates (within reason) suggest good coverage
    // - Consistency over time
    // - Sufficient sample size
    const sampleSizeFactor = Math.min(1, totalChecks / 50); // Full confidence at 50+ checks
    const balanceFactor = 1 - Math.abs(passRate - 0.8); // Optimal around 80% pass rate
    const confidence = (consistency * 0.4 + balanceFactor * 0.3 + sampleSizeFactor * 0.3);

    // Category breakdown
    const categoryBreakdown: Record<string, { checks: number; passRate: number }> = {};
    const categories = new Set(history.map(h => h.category).filter(Boolean));

    for (const category of categories) {
      try {
        const categoryHistory = history.filter(h => h.category === category);
        const categoryPasses = categoryHistory.filter(h => h.passed).length;
        categoryBreakdown[category] = {
          checks: categoryHistory.length,
          passRate: categoryHistory.length > 0 ? categoryPasses / categoryHistory.length : 0,
        };
      } catch (error) {
        // Skip this category if processing fails
        continue;
      }
    }

    const lastSeen = history.length > 0 && history[0].created_at ? history[0].created_at : null;

    return {
      critic,
      totalChecks,
      passRate,
      failRate,
      recentPassRate,
      consistency,
      confidence: Math.max(0, Math.min(1, confidence)),
      categoryBreakdown,
      lastSeen,
    };
  }

  private calculateConsistency(history: CriticHistoryRecord[]): number {
    if (history.length < this.options.consistencyWindow) {
      // Not enough data for consistency measurement
      return 0.5;
    }

    const windowSize = this.options.consistencyWindow;
    const windows: number[] = [];

    for (let i = 0; i <= history.length - windowSize; i++) {
      const window = history.slice(i, i + windowSize);
      const passRate = window.filter(h => h.passed).length / windowSize;
      windows.push(passRate);
    }

    if (windows.length === 0) {
      return 0.5;
    }

    // Calculate variance of pass rates across windows
    const mean = windows.reduce((sum, rate) => sum + rate, 0) / windows.length;
    const variance = windows.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / windows.length;
    const stdDev = Math.sqrt(variance);

    // Convert to consistency score (lower stdDev = higher consistency)
    // stdDev ranges from 0 (perfect consistency) to ~0.5 (chaotic)
    const consistency = Math.max(0, Math.min(1, 1 - (stdDev * 2)));

    return consistency;
  }

  /**
   * Helper to get all critic history (for summary calculations)
   * In a real implementation, this would be a direct DB query for efficiency
   */
  private getAllCriticHistory(): CriticHistoryRecord[] {
    try {
      // This is a workaround since StateMachine doesn't expose getAllCriticHistory
      // We'll iterate through known critics. In production, add a StateMachine method.
      const knownCritics = [
        'security', 'tests', 'build', 'typecheck', 'allocator', 'cost_perf',
        'design_system', 'exec_review', 'integration_fury', 'prompt_budget',
        'health_check', 'manager_self_check', 'leakage', 'data_quality',
        'causal', 'academic_rigor', 'forecast_stitch', 'product_completeness',
        'org_pm', 'human_sync', 'network_navigator', 'intelligence_engine',
        'experience_flow', 'weather_aesthetic', 'motion_design', 'responsive_surface',
        'inspiration_coverage', 'demo_conversion', 'integration_completeness',
        'stakeholder_narrative', 'failover_guardrail'
      ];

      const allHistory: CriticHistoryRecord[] = [];

      for (const critic of knownCritics) {
        try {
          const history = this.stateMachine.getCriticHistory(critic, { limit: 100 });
          if (history && Array.isArray(history)) {
            allHistory.push(...history);
          }
        } catch (error) {
          // Skip this critic if query fails
          continue;
        }
      }

      return allHistory;
    } catch (error) {
      // Return empty array if entire operation fails
      return [];
    }
  }

  /**
   * Export reputation data for persistence/analysis
   */
  exportReputationSnapshot(): {
    summary: ReputationSummary;
    timestamp: number;
    version: string;
  } {
    return {
      summary: this.getAllReputations(),
      timestamp: Date.now(),
      version: '1.0.0',
    };
  }
}
