/**
 * Discovery Reframer
 *
 * Transforms negative language into positive framing:
 * - "Proof FAILED" → "Discovery phase complete"
 * - "Fix errors" → "Apply improvements"
 * - "Blocked" → "Discovering requirements"
 *
 * Makes iteration feel like progress, not failure.
 */

import type {
  ProofResult,
  PhaseResult,
  Discovery,
  OpportunityMessage,
  ReframedResult,
  TaskPhase,
} from './types.js';

export class DiscoveryReframer {
  private readonly ENCOURAGEMENT_LEVEL = process.env.ENCOURAGEMENT_LEVEL || 'moderate';

  /**
   * Language reframing map
   */
  private readonly REFRAME_MAP: Record<string, string> = {
    // Status names
    unproven: 'discovering',
    blocked: 'gathering requirements',
    remediation: 'improvement',
    failed: 'discovered',
    error: 'opportunity',

    // Action verbs
    'fix': 'improve',
    'repair': 'enhance',
    'debug': 'investigate',
    'patch': 'refine',
  };

  /**
   * Reframe proof result to positive language
   */
  reframeProofResult(result: ProofResult): ReframedResult {
    if (result.status === 'proven') {
      return {
        original: result,
        reframed: {
          status: 'Proven',
          message: this.generateSuccessMessage(result),
          discoveries: [],
        },
      };
    }

    // Unproven → Discovery complete
    const opportunities = result.discoveries.map((d) => this.transformDiscovery(d));

    return {
      original: result,
      reframed: {
        status: 'Discovery Complete',
        message: this.generateDiscoveryMessage(result.discoveries.length),
        discoveries: opportunities,
      },
    };
  }

  /**
   * Reframe phase result
   */
  reframePhaseResult(result: PhaseResult): ReframedResult {
    if (result.outcome === 'success') {
      return {
        original: result,
        reframed: {
          status: 'Complete',
          message: result.message,
          discoveries: [],
        },
      };
    }

    const opportunities = (result.discoveries || []).map((d) => this.transformDiscovery(d));

    return {
      original: result,
      reframed: {
        status: 'Discovery Complete',
        message: this.generateDiscoveryMessage(opportunities.length),
        discoveries: opportunities,
      },
    };
  }

  /**
   * Transform discovery to opportunity message
   */
  transformDiscovery(discovery: Discovery): OpportunityMessage {
    // Reframe title (remove negative words)
    let title = discovery.title;
    for (const [negative, positive] of Object.entries(this.REFRAME_MAP)) {
      title = title.replace(new RegExp(negative, 'gi'), positive);
    }

    return {
      icon: '✨',
      title: `Opportunity: ${title}`,
      description: discovery.description,
      actionable: this.getActionableGuidance(discovery),
    };
  }

  /**
   * Get actionable guidance for a discovery
   */
  private getActionableGuidance(discovery: Discovery): string {
    switch (discovery.severity) {
      case 'critical':
        return 'Address this first - it blocks other work';
      case 'high':
        return 'Important improvement - prioritize this';
      case 'medium':
        return 'Valuable enhancement - address when ready';
      case 'low':
        return 'Minor polish - can defer if needed';
      default:
        return 'Address this improvement';
    }
  }

  /**
   * Generate success message for proven result
   */
  private generateSuccessMessage(result: ProofResult): string {
    const checkCount = result.checks.length;
    const passedCount = result.checks.filter((c) => c.success).length;
    const timeSeconds = (result.executionTimeMs / 1000).toFixed(1);

    switch (this.ENCOURAGEMENT_LEVEL) {
      case 'none':
        return `All ${passedCount}/${checkCount} checks passed in ${timeSeconds}s`;
      case 'low':
        return `✅ All ${passedCount}/${checkCount} checks passed in ${timeSeconds}s`;
      case 'moderate':
        return `✅ Excellent! All ${passedCount}/${checkCount} checks passed in ${timeSeconds}s`;
      case 'high':
        return `✅ Outstanding work! All ${passedCount}/${checkCount} checks passed in ${timeSeconds}s 🎉`;
      default:
        return `✅ All ${passedCount}/${checkCount} checks passed in ${timeSeconds}s`;
    }
  }

  /**
   * Generate discovery message
   */
  private generateDiscoveryMessage(discoveryCount: number): string {
    switch (this.ENCOURAGEMENT_LEVEL) {
      case 'none':
        return `Found ${discoveryCount} ${discoveryCount === 1 ? 'issue' : 'issues'}`;
      case 'low':
        return `✅ Discovery complete: found ${discoveryCount} ${discoveryCount === 1 ? 'opportunity' : 'opportunities'}`;
      case 'moderate':
        return `✅ Discovery phase complete! Found ${discoveryCount} improvement ${discoveryCount === 1 ? 'opportunity' : 'opportunities'}`;
      case 'high':
        return `✅ Great work on discovery! Found ${discoveryCount} valuable improvement ${discoveryCount === 1 ? 'opportunity' : 'opportunities'} 🔬`;
      default:
        return `✅ Discovery complete: found ${discoveryCount} ${discoveryCount === 1 ? 'opportunity' : 'opportunities'}`;
    }
  }

  /**
   * Generate encouraging message for phase completion
   */
  generateEncouragingMessage(phase: TaskPhase): string {
    const baseMessage = `${phase.title} complete`;

    switch (this.ENCOURAGEMENT_LEVEL) {
      case 'none':
        return baseMessage;
      case 'low':
        return `✅ ${baseMessage}`;
      case 'moderate':
        return `✅ ${baseMessage}! Moving to next phase`;
      case 'high':
        return `✅ ${baseMessage}! Excellent progress! 🎉`;
      default:
        return `✅ ${baseMessage}`;
    }
  }

  /**
   * Get display name for task status (positive framing)
   */
  getStatusDisplayName(status: string): string {
    const displayNames: Record<string, string> = {
      pending: 'Ready to start',
      in_progress: 'Actively progressing',
      discovering: 'Discovering improvements',
      improving: 'Applying improvements',
      proven: 'Fully proven',
      blocked: 'Gathering requirements',
      unproven: 'Discovering',
    };

    return displayNames[status] || status;
  }

  /**
   * Format discovery list for display
   */
  formatDiscoveryList(opportunities: OpportunityMessage[]): string {
    if (opportunities.length === 0) {
      return 'No improvements needed';
    }

    let output = `\nDiscovered ${opportunities.length} improvement ${opportunities.length === 1 ? 'opportunity' : 'opportunities'}:\n\n`;

    for (const [index, opp] of opportunities.entries()) {
      output += `${opp.icon} **Opportunity ${index + 1}:** ${opp.title}\n`;
      output += `   ${opp.description}\n`;
      output += `   → ${opp.actionable}\n\n`;
    }

    return output;
  }
}
