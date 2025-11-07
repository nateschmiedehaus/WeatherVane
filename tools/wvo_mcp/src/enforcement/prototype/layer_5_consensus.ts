/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Layer 5: Multi-Agent Consensus
 *
 * Local Rules:
 * - IF scent detected: contradictory signals (quality_approved + bypass_pattern)
 * - THEN aggregate all layers' votes
 * - THEN leave "consensus_achieved" scent with decision
 */

import { ScentEnvironment, ScentType, LayerName, Scent } from './scent_environment.js';

export interface ConsensusDecision {
  taskId: string;
  phase: string;
  decision: 'approve' | 'block' | 'escalate';
  confidence: number;
  votes: Record<LayerName, number>; // -1 to +1
}

export class ConsensusLayer {
  constructor(private environment: ScentEnvironment) {}

  /**
   * Patrol for conflicting signals and achieve consensus.
   * Aggregates votes from all layers.
   */
  async patrol(taskIds: string[]): Promise<ConsensusDecision[]> {
    const decisions: ConsensusDecision[] = [];

    for (const taskId of taskIds) {
      // Gather all scents for this task
      const scents = await this.environment.detectScents({ taskId });

      // Check for conflicts
      const hasApproval = scents.some(s => s.type === ScentType.QUALITY_APPROVED);
      const hasPattern = scents.some(s => s.type === ScentType.BYPASS_PATTERN);

      if (hasApproval && hasPattern) {
        // Conflict detected - need consensus
        await this.environment.leaveScent({
          type: ScentType.CONSENSUS_REQUESTED,
          strength: 0.9,
          decayRate: 0.4,
          taskId,
          layer: LayerName.L5_CONSENSUS,
          metadata: {
            reason: 'conflicting_signals',
            approvals: scents.filter(s => s.type === ScentType.QUALITY_APPROVED).length,
            concerns: scents.filter(s => s.type === ScentType.BYPASS_PATTERN).length
          }
        });

        // Aggregate votes
        const votes = this.aggregateVotes(scents);
        const totalVote = Object.values(votes).reduce((sum, v) => sum + v, 0);

        // Decision based on aggregate
        let decision: 'approve' | 'block' | 'escalate';
        if (totalVote > 0.5) {
          decision = 'approve';
        } else if (totalVote < -0.5) {
          decision = 'block';
        } else {
          decision = 'escalate'; // Too close to call
        }

        const consensusDecision: ConsensusDecision = {
          taskId,
          phase: scents[0]?.metadata.phase || 'unknown',
          decision,
          confidence: Math.abs(totalVote),
          votes
        };

        decisions.push(consensusDecision);

        // Leave consensus scent
        await this.environment.leaveScent({
          type: ScentType.CONSENSUS_ACHIEVED,
          strength: 0.95,
          decayRate: 0.2,
          taskId,
          layer: LayerName.L5_CONSENSUS,
          metadata: {
            decision,
            confidence: Math.abs(totalVote),
            votes,
            totalVote
          }
        });
      }
    }

    return decisions;
  }

  /**
   * Aggregate votes from all layers.
   * Positive votes = approve, negative votes = block.
   */
  private aggregateVotes(scents: Scent[]): Record<LayerName, number> {
    const votes: Record<LayerName, number> = {
      [LayerName.L1_CONSTITUTIONAL]: 0,
      [LayerName.L2_DEBIASING]: 0,
      [LayerName.L3_DETECTION]: 0,
      [LayerName.L4_REMEDIATION]: 0,
      [LayerName.L5_CONSENSUS]: 0,
      [LayerName.L6_DOCUMENTATION]: 0,
      [LayerName.BOOTSTRAP]: 0
    };

    for (const scent of scents) {
      // Positive votes
      if (scent.type === ScentType.QUALITY_APPROVED) {
        votes[scent.layer] = scent.strength;
      }
      // Negative votes
      if (scent.type === ScentType.QUALITY_CONCERN ||
          scent.type === ScentType.BYPASS_PATTERN ||
          scent.type === ScentType.PRESENT_BIAS_DETECTED ||
          scent.type === ScentType.OVERCONFIDENCE_DETECTED) {
        votes[scent.layer] = -scent.strength;
      }
    }

    return votes;
  }
}
