/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Layer 4: Forced Remediation
 *
 * Local Rules:
 * - IF scent detected: "bypass_pattern" AND severity = critical THEN create remediation task
 * - THEN leave "remediation_created" scent
 */

import { ScentEnvironment, ScentType, LayerName } from './scent_environment.js';

export interface RemediationTask {
  taskId: string;
  originalTaskId: string;
  pattern: string;
  severity: 'critical' | 'high' | 'medium';
  created: number;
  concerns: Array<{
    type: string;
    phase: string;
    strength: number;
  }>;
}

export class RemediationLayer {
  private createdTasks: Set<string> = new Set();

  constructor(private environment: ScentEnvironment) {}

  /**
   * Patrol for bypass patterns and create remediation tasks.
   * Enforces quality by forcing fixes for detected bypasses.
   */
  async patrol(): Promise<RemediationTask[]> {
    const bypassPatterns = await this.environment.detectScents({
      types: [ScentType.BYPASS_PATTERN],
      minStrength: 0.7
    });

    const newTasks: RemediationTask[] = [];

    for (const pattern of bypassPatterns) {
      // Avoid creating duplicate remediation tasks
      const taskKey = `${pattern.taskId}_${pattern.metadata.pattern}`;
      if (this.createdTasks.has(taskKey)) continue;

      // Check if remediation already created
      const existing = await this.environment.detectScents({
        types: [ScentType.REMEDIATION_CREATED],
        taskId: pattern.taskId
      });
      if (existing.length > 0) continue;

      // Create remediation task
      const remediationTaskId = `${pattern.taskId}-REMEDIATION-${Date.now()}`;
      const task: RemediationTask = {
        taskId: remediationTaskId,
        originalTaskId: pattern.taskId,
        pattern: pattern.metadata.pattern,
        severity: 'critical',
        created: Date.now(),
        concerns: pattern.metadata.concerns || []
      };

      newTasks.push(task);
      this.createdTasks.add(taskKey);

      // Leave remediation scent
      await this.environment.leaveScent({
        type: ScentType.REMEDIATION_CREATED,
        strength: 1.0,
        decayRate: 0.1, // Persist (important)
        taskId: pattern.taskId,
        layer: LayerName.L4_REMEDIATION,
        metadata: {
          remediationTaskId,
          pattern: pattern.metadata.pattern,
          triggeredBy: pattern.id,
          created: Date.now(),
          severity: 'critical',
          concerns: pattern.metadata.concerns
        }
      });
    }

    return newTasks;
  }

  /**
   * Get all created remediation tasks.
   */
  getCreatedTasks(): string[] {
    return Array.from(this.createdTasks);
  }
}
