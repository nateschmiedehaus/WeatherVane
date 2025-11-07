/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Layer 3: Automated Detection
 *
 * Local Rules:
 * - IF scent detected: "quality_concern" OR "present_bias_detected" THEN leave "bypass_pattern" scent
 * - IF scent detected: multiple quality concerns for same task THEN leave "quality_trend" scent
 */

import { ScentEnvironment, ScentType, LayerName, Scent } from './scent_environment.js';

export class DetectionLayer {
  constructor(private environment: ScentEnvironment) {}

  /**
   * Patrol scent environment for bypass patterns and quality trends.
   * Aggregates signals from other layers.
   */
  async patrol(): Promise<void> {
    // Detect quality concerns
    const qualityConcerns = await this.environment.detectScents({
      types: [ScentType.QUALITY_CONCERN],
      minStrength: 0.5
    });

    // Detect biases
    const biases = await this.environment.detectScents({
      types: [ScentType.PRESENT_BIAS_DETECTED, ScentType.OVERCONFIDENCE_DETECTED],
      minStrength: 0.5
    });

    // Group by taskId
    const taskConcerns = new Map<string, Scent[]>();
    for (const scent of [...qualityConcerns, ...biases]) {
      const existing = taskConcerns.get(scent.taskId) || [];
      existing.push(scent);
      taskConcerns.set(scent.taskId, existing);
    }

    // Detect bypass patterns
    for (const [taskId, concerns] of taskConcerns.entries()) {
      if (concerns.length >= 2) {
        // Multiple concerns = likely bypass pattern
        // Check if we already detected this pattern
        const existingPattern = await this.environment.detectScents({
          types: [ScentType.BYPASS_PATTERN],
          taskId
        });

        if (existingPattern.length === 0) {
          await this.environment.leaveScent({
            type: ScentType.BYPASS_PATTERN,
            strength: 1.0,
            decayRate: 0.2, // Persist longer (important signal)
            taskId,
            layer: LayerName.L3_DETECTION,
            metadata: {
              pattern: 'BP001', // Partial phase completion
              concernCount: concerns.length,
              concerns: concerns.map(c => ({
                type: c.type,
                phase: c.metadata.phase,
                strength: c.strength,
                layer: c.layer
              })),
              detectedAt: Date.now()
            }
          });
        }
      }
    }

    // Detect quality trends (historical)
    const allScents = await this.environment.detectScents({});
    const qualityApprovals = allScents.filter(s => s.type === ScentType.QUALITY_APPROVED);
    const qualityIssues = allScents.filter(s =>
      s.type === ScentType.QUALITY_CONCERN ||
      s.type === ScentType.BYPASS_PATTERN
    );

    const trendDirection = qualityApprovals.length > qualityIssues.length ? 'positive' : 'negative';
    const ratio = qualityApprovals.length / (qualityIssues.length || 1);

    await this.environment.leaveScent({
      type: ScentType.QUALITY_TREND,
      strength: 0.6,
      decayRate: 0.8, // Decay fast (transient signal)
      taskId: 'SYSTEM',
      layer: LayerName.L3_DETECTION,
      metadata: {
        direction: trendDirection,
        approvals: qualityApprovals.length,
        issues: qualityIssues.length,
        ratio,
        assessment: ratio > 2 ? 'healthy' : ratio > 1 ? 'stable' : 'concerning'
      }
    });
  }
}
