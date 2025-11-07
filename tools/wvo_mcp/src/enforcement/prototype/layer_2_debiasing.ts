/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Layer 2: Behavioral De-biasing
 *
 * Local Rules:
 * - IF task duration < expected THEN leave "present_bias_detected" scent
 * - IF confidence > 90% AND complexity > threshold THEN leave "overconfidence_detected" scent
 */

import { ScentEnvironment, ScentType, LayerName } from './scent_environment.js';

export interface TaskCompletion {
  taskId: string;
  phase: string;
  duration: number; // minutes
  confidence: number; // 0-100
  complexity: number; // 0-100
}

export class DebiasLayer {
  // Expected durations from research (PLAN-2)
  private expectedDurations: Record<string, number> = {
    'strategize': 30,
    'spec': 20,
    'plan': 45,
    'think': 30,
    'design': 30,
    'implement': 120,
    'verify': 45,
    'review': 30
  };

  constructor(private environment: ScentEnvironment) {}

  /**
   * Patrol task completions for cognitive biases.
   * Leaves scents based on de-biasing rules.
   */
  async patrol(completions: TaskCompletion[]): Promise<void> {
    for (const task of completions) {
      const expected = this.expectedDurations[task.phase] || 30;

      // Present bias check (rushed completion)
      if (task.duration < expected * 0.5) {
        await this.environment.leaveScent({
          type: ScentType.PRESENT_BIAS_DETECTED,
          strength: 0.85,
          decayRate: 0.3,
          taskId: task.taskId,
          layer: LayerName.L2_DEBIASING,
          metadata: {
            phase: task.phase,
            actualDuration: task.duration,
            expectedDuration: expected,
            ratio: task.duration / expected,
            warning: `Completed in ${task.duration}min, expected ${expected}min (${((task.duration / expected) * 100).toFixed(0)}%)`
          }
        });
      }

      // Overconfidence check
      if (task.confidence > 90 && task.complexity > 70) {
        await this.environment.leaveScent({
          type: ScentType.OVERCONFIDENCE_DETECTED,
          strength: 0.8,
          decayRate: 0.3,
          taskId: task.taskId,
          layer: LayerName.L2_DEBIASING,
          metadata: {
            phase: task.phase,
            confidence: task.confidence,
            complexity: task.complexity,
            warning: 'High confidence on complex task - likely overconfident (research: 86% LLM overconfidence rate)'
          }
        });
      }
    }
  }
}
