import * as fs from 'fs';
import * as path from 'path';
import { logWarning } from '../telemetry/logger.js';

/**
 * Result of verification level detection
 */
export interface DetectionResult {
  level: 1 | 2 | 3 | null;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  deferred?: {
    reason: string;
    justification: string;
  };
}

/**
 * Detects achieved verification level from evidence documents
 *
 * Level 1 (Compilation): Code compiles, types check
 * Level 2 (Smoke Testing): Tests run with assertions
 * Level 3 (Integration Testing): Real dependencies tested OR explicitly deferred
 */
export class VerificationLevelDetector {
  /**
   * Detect verification level from evidence directory
   * @param evidencePath - Path to evidence directory (e.g., state/evidence/TASK-ID)
   * @returns Detection result with level, confidence, and evidence
   */
  detectLevel(evidencePath: string): DetectionResult {
    try {
      // Check if evidence directory exists
      if (!fs.existsSync(evidencePath)) {
        return {
          level: null,
          confidence: 'low',
          evidence: ['Evidence directory does not exist']
        };
      }

      // Parse all evidence files
      const content = this.parseEvidence(evidencePath);

      // Detect each level (bottom-up approach)
      const level1 = this.detectLevel1(content);
      const level2 = this.detectLevel2(content);
      const level3Result = this.detectLevel3(content);

      // Check for explicit deferral
      const deferral = this.detectDeferral(content);

      // Determine highest achieved level
      let level: 1 | 2 | 3 | null = null;
      let confidence: 'high' | 'medium' | 'low' = 'low';
      const evidence: string[] = [];

      if (level3Result === true) {
        level = 3;
        confidence = 'high';
        evidence.push('Integration testing evidence found');
      } else if (level3Result === 'deferred' && deferral) {
        level = 3;
        confidence = 'high';
        evidence.push('Level 3 explicitly deferred with justification');
        return { level, confidence, evidence, deferred: deferral };
      } else if (level2) {
        level = 2;
        confidence = level2.confidence;
        evidence.push(...level2.evidence);
      } else if (level1) {
        level = 1;
        confidence = level1.confidence;
        evidence.push(...level1.evidence);
      }

      return { level, confidence, evidence };

    } catch (error) {
      return {
        level: null,
        confidence: 'low',
        evidence: [`Error detecting level: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Parse all markdown files in evidence directory
   */
  private parseEvidence(evidencePath: string): string {
    const content: string[] = [];

    // Read all subdirectories (implement, verify, review, etc.)
    const subdirs = ['implement', 'verify', 'review', 'monitor', 'strategize', 'spec', 'plan', 'think', 'pr'];

    for (const subdir of subdirs) {
      const subdirPath = path.join(evidencePath, subdir);
      if (!fs.existsSync(subdirPath)) continue;

      const files = fs.readdirSync(subdirPath).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(subdirPath, file);
        try {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          content.push(`\n=== ${subdir}/${file} ===\n${fileContent}`);
        } catch (error) {
          logWarning('Failed to read evidence file', {
            file: filePath,
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue parsing other files
        }
      }
    }

    return content.join('\n');
  }

  /**
   * Detect Level 1: Compilation
   * Evidence: Build output, typecheck, compilation success, or explicit Level 1 claim
   */
  private detectLevel1(content: string): { confidence: 'high' | 'medium'; evidence: string[] } | null {
    const evidence: string[] = [];
    let hasStrongEvidence = false;

    // Strong evidence: Explicit "Level 1" with checkmark (✅) or PASS
    if (/Level 1.*✅|Level 1.*PASS|Level 1.*achieved|Level 1.*complete/i.test(content)) {
      evidence.push('Level 1 explicitly verified');
      hasStrongEvidence = true;
    }

    // Strong evidence: Build output with "0 errors"
    if (/npm run build|pnpm build|yarn build/i.test(content) && /0 errors?/i.test(content)) {
      evidence.push('Build executed with 0 errors');
      hasStrongEvidence = true;
    }

    // Strong evidence: TypeScript compilation success
    if (/tsc|typecheck/i.test(content) && /0 errors?/i.test(content)) {
      evidence.push('TypeScript compilation successful');
      hasStrongEvidence = true;
    }

    // Medium evidence: Build artifacts mentioned
    if (/dist\/|build\/.*\.js|compiled successfully/i.test(content)) {
      evidence.push('Build artifacts mentioned');
      if (!hasStrongEvidence) {
        hasStrongEvidence = false; // Keep as medium if no other strong evidence
      }
    }

    if (evidence.length === 0) {
      return null;
    }

    return {
      confidence: hasStrongEvidence ? 'high' : 'medium',
      evidence
    };
  }

  /**
   * Detect Level 2: Smoke Testing
   * Evidence: Test execution with assertions, or explicit Level 2 claim
   */
  private detectLevel2(content: string): { confidence: 'high' | 'medium'; evidence: string[] } | null {
    const evidence: string[] = [];
    let hasStrongEvidence = false;

    // Strong evidence: Explicit "Level 2" with checkmark (✅) or PASS
    if (/Level 2.*✅|Level 2.*PASS|Level 2.*achieved|Level 2.*complete/i.test(content)) {
      evidence.push('Level 2 explicitly verified');
      hasStrongEvidence = true;
    }

    // Strong evidence: Test execution with passing tests
    const testRunMatch = content.match(/npm test|pnpm test|yarn test|vitest|jest|mocha/i);
    const passingMatch = content.match(/(\d+)\/\1 passing|(\d+) passing|all tests? passed?/i);

    if (testRunMatch && passingMatch) {
      evidence.push('Tests executed with passing results');
      hasStrongEvidence = true;
    }

    // Strong evidence: Assertions found
    if (/expect\(|assert\(|should\.|toBe\(|toEqual\(/i.test(content)) {
      evidence.push('Test assertions found');
      hasStrongEvidence = true;
    }

    // Medium evidence: Test file creation mentioned
    if (/\.test\.ts|\.spec\.ts|\.test\.js|describe\(|it\(/i.test(content)) {
      evidence.push('Test files mentioned');
      if (!hasStrongEvidence) {
        hasStrongEvidence = false; // Keep as medium if no other strong evidence
      }
    }

    if (evidence.length === 0) {
      return null;
    }

    return {
      confidence: hasStrongEvidence ? 'high' : 'medium',
      evidence
    };
  }

  /**
   * Detect Level 3: Integration Testing
   * Evidence: Real API calls, auth, dependencies, explicit Level 3 claim, OR explicit deferral
   * @returns true (achieved), 'deferred' (explicitly deferred), or false (not achieved)
   */
  private detectLevel3(content: string): boolean | 'deferred' {
    // Check for explicit deferral FIRST (highest priority)
    // Use negative lookbehind to avoid matching "Level 1-3" or "Level 2-3"
    if (/(?<![\d-])Level 3[\s(:].*(DEFERRED|⏳)/i.test(content)) {
      return 'deferred';
    }

    // Strong evidence: Explicit "Level 3" with checkmark (✅) or PASS
    if (/(?<![\d-])Level 3[\s(:].*(✅|PASS|achieved|complete)/i.test(content)) {
      return true;
    }

    // Strong evidence: Integration testing with real dependencies
    const integrationPatterns = [
      /integration test/i,
      /real API|actual API|live API/i,
      /real dependencies|actual dependencies/i,
      /end-?to-?end|e2e/i,
      /fetch\(.*http|axios\.|http\.get/i
    ];

    for (const pattern of integrationPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect explicit Level 3 deferral with justification
   */
  private detectDeferral(content: string): { reason: string; justification: string } | null {
    // Pattern 1: Verification status line format
    // Matches: "**Level 3 ...**: ⏳ DEFERRED (implementation deferred to dedicated session)"
    const pattern1 = content.match(/Level 3[^:]*:.*?(?:⏳|DEFERRED)\s*\(([^)]{10,})\)/i);
    if (pattern1) {
      return {
        reason: pattern1[1].trim().substring(0, 200),
        justification: 'See evidence for full details'
      };
    }

    // Pattern 2: Full format with Reason and Justification fields
    const pattern2 = content.match(
      /Level 3.*(?:DEFERRED|⏳).*?(?:Reason|Why deferred):\s*([^\n]+).*?(?:Justification|Risk|Mitigation):\s*([^\n]+)/is
    );
    if (pattern2) {
      return {
        reason: pattern2[1].trim().substring(0, 200),
        justification: pattern2[2].trim().substring(0, 200)
      };
    }

    // Pattern 3: Simple deferral with explanation nearby
    const pattern3 = content.match(
      /Level 3.*(?:DEFERRED|⏳)[\s\S]{0,300}?(?:Reason|because|due to)[:\s]+([^\n]{10,})/i
    );
    if (pattern3) {
      return {
        reason: pattern3[1].trim().substring(0, 200),
        justification: 'See evidence for full details'
      };
    }

    return null;
  }
}
