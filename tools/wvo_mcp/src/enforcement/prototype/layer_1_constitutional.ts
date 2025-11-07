/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Layer 1: Constitutional AI
 *
 * Local Rules:
 * - IF evidence document created AND word count < threshold THEN leave "quality_concern" scent
 * - IF evidence document created AND word count >= threshold AND sections present THEN leave "quality_approved" scent
 */

import { ScentEnvironment, ScentType, LayerName } from './scent_environment.js';

export interface EvidenceDocument {
  taskId: string;
  phase: string;
  path: string;
  wordCount: number;
  sections: string[];
}

export class ConstitutionalLayer {
  constructor(private environment: ScentEnvironment) {}

  /**
   * Patrol evidence documents for quality violations.
   * Leaves scents based on constitutional rules.
   */
  async patrol(documents: EvidenceDocument[]): Promise<void> {
    // Get quality standards from bootstrap
    const standards = await this.environment.detectScents({
      types: [ScentType.QUALITY_STANDARD]
    });

    const minWordCount = standards[0]?.metadata.minWordCount || 500;

    for (const doc of documents) {
      if (doc.wordCount < minWordCount) {
        // Leave quality concern scent
        await this.environment.leaveScent({
          type: ScentType.QUALITY_CONCERN,
          strength: 0.9,
          decayRate: 0.3,
          taskId: doc.taskId,
          layer: LayerName.L1_CONSTITUTIONAL,
          metadata: {
            phase: doc.phase,
            wordCount: doc.wordCount,
            minRequired: minWordCount,
            reason: 'insufficient_depth',
            path: doc.path
          }
        });
      } else if (this.hasRequiredSections(doc)) {
        // Leave quality approved scent
        await this.environment.leaveScent({
          type: ScentType.QUALITY_APPROVED,
          strength: 0.8,
          decayRate: 0.5,
          taskId: doc.taskId,
          layer: LayerName.L1_CONSTITUTIONAL,
          metadata: {
            phase: doc.phase,
            wordCount: doc.wordCount,
            path: doc.path
          }
        });
      }
    }
  }

  /**
   * Check if document has required sections for its phase.
   */
  private hasRequiredSections(doc: EvidenceDocument): boolean {
    const requiredSections: Record<string, string[]> = {
      'strategize': ['Problem', 'Goal', 'Why'],
      'spec': ['Acceptance Criteria', 'Requirements'],
      'plan': ['Approach', 'Files', 'LOC Estimate'],
      'think': ['Edge Cases', 'Failure Modes'],
      'design': ['Via Negativa', 'Alternatives', 'Complexity']
    };

    const required = requiredSections[doc.phase] || [];
    return required.every(section =>
      doc.sections.some(s => s.toLowerCase().includes(section.toLowerCase()))
    );
  }
}
