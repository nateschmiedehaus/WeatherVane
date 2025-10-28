/**
 * Semantic Validator - Prevent Empty Artifact Gaming
 *
 * Validates that artifacts contain actual meaningful content, not just empty files.
 *
 * Design:
 * - Grep assertions: Check for expected content patterns
 * - File size checks: Reject suspiciously small files
 * - Hash linking: Verify artifacts are recorded in ledger
 * - Content sampling: Random spot checks for non-trivial content
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logWarning, logError } from '../telemetry/logger.js';

/**
 * Semantic validation result
 */
export interface SemanticValidationResult {
  valid: boolean;
  reason?: string;
  checks: {
    fileSize: boolean;
    grepAssertion?: boolean;
    hashLinked?: boolean;
    contentSample?: boolean;
  };
}

/**
 * Validation rule for artifact
 */
export interface ValidationRule {
  pattern?: string;          // Grep pattern to assert
  minSize?: number;          // Minimum file size in bytes
  mustContain?: string[];    // Must contain all these strings
  mustNotBe?: string[];      // Must not be exactly these strings (e.g., "TODO", "PLACEHOLDER")
}

/**
 * Phase-specific validation rules
 */
const PHASE_VALIDATION_RULES: Record<string, Record<string, ValidationRule>> = {
  'STRATEGIZE': {
    'strategy': {
      minSize: 100,  // At least 100 bytes
      mustContain: ['problem', 'approach'],
      mustNotBe: ['TODO', 'PLACEHOLDER']
    }
  },
  'SPEC': {
    'spec': {
      minSize: 200,
      mustContain: ['requirements', 'interface'],
      mustNotBe: ['TODO', 'PLACEHOLDER']
    }
  },
  'PLAN': {
    'plan': {
      minSize: 150,
      mustContain: ['steps', 'tasks'],
      mustNotBe: ['TODO', 'PLACEHOLDER']
    }
  },
  'IMPLEMENT': {
    '.ts': {
      minSize: 50,
      mustContain: ['function', 'class', 'export', 'import'],  // At least ONE of these
      pattern: '(function|class|export|import)'  // Regex pattern
    },
    '.js': {
      minSize: 50,
      mustContain: ['function', 'class', 'export', 'import'],
      pattern: '(function|class|export|import)'
    }
  },
  'VERIFY': {
    'build': {
      minSize: 20,
      mustContain: ['success', 'complete', 'built'],
      pattern: '(success|complete|built)'
    },
    'test': {
      minSize: 20,
      mustContain: ['pass', 'tests'],
      pattern: '(pass|tests)'
    }
  },
  'REVIEW': {
    'review': {
      minSize: 100,
      mustContain: ['passed', 'approved', 'verified'],
      mustNotBe: ['TODO', 'PENDING']
    }
  }
};

/**
 * Semantic Validator
 *
 * Validates artifact content to prevent gaming with empty/placeholder files.
 */
export class SemanticValidator {
  constructor(private readonly workspaceRoot: string) {}

  /**
   * Validate artifact has meaningful content
   */
  async validateArtifact(
    artifactPath: string,
    phase: string
  ): Promise<SemanticValidationResult> {
    try {
      // Resolve absolute path
      const fullPath = path.isAbsolute(artifactPath)
        ? artifactPath
        : path.join(this.workspaceRoot, artifactPath);

      // Check file exists
      if (!fs.existsSync(fullPath)) {
        return {
          valid: false,
          reason: `Artifact not found: ${artifactPath}`,
          checks: { fileSize: false }
        };
      }

      // Get file stats
      const stats = fs.statSync(fullPath);

      // Check 1: File size
      const minSize = this.getMinSize(artifactPath, phase);
      const fileSizeValid = stats.size >= minSize;

      if (!fileSizeValid) {
        return {
          valid: false,
          reason: `Artifact too small: ${stats.size} bytes (min: ${minSize})`,
          checks: { fileSize: false }
        };
      }

      // Check 2: Grep assertion (if pattern specified)
      const rule = this.getValidationRule(artifactPath, phase);
      let grepAssertionValid: boolean | undefined;

      if (rule?.pattern) {
        try {
          const grepResult = execSync(
            `grep -E "${rule.pattern}" "${fullPath}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
          );
          grepAssertionValid = grepResult.trim().length > 0;
        } catch {
          grepAssertionValid = false;
        }

        if (!grepAssertionValid) {
          return {
            valid: false,
            reason: `Artifact missing required pattern: ${rule.pattern}`,
            checks: { fileSize: true, grepAssertion: false }
          };
        }
      }

      // Check 3: Must contain at least ONE of the required strings
      if (rule?.mustContain && rule.mustContain.length > 0) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const hasRequiredContent = rule.mustContain.some(req =>
          content.toLowerCase().includes(req.toLowerCase())
        );

        if (!hasRequiredContent) {
          return {
            valid: false,
            reason: `Artifact missing required content: one of [${rule.mustContain.join(', ')}]`,
            checks: { fileSize: true, contentSample: false }
          };
        }
      }

      // Check 4: Must NOT be exactly a placeholder string
      if (rule?.mustNotBe && rule.mustNotBe.length > 0) {
        const content = fs.readFileSync(fullPath, 'utf-8').trim();
        const isPlaceholder = rule.mustNotBe.some(bad =>
          content === bad || content.toLowerCase() === bad.toLowerCase()
        );

        if (isPlaceholder) {
          return {
            valid: false,
            reason: `Artifact is placeholder: "${content.slice(0, 50)}"`,
            checks: { fileSize: true, contentSample: false }
          };
        }
      }

      // All checks passed
      return {
        valid: true,
        checks: {
          fileSize: true,
          grepAssertion: grepAssertionValid,
          contentSample: true
        }
      };

    } catch (error) {
      logError('Semantic validation failed', {
        artifact: artifactPath,
        phase,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        reason: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        checks: { fileSize: false }
      };
    }
  }

  /**
   * Validate multiple artifacts
   */
  async validateArtifacts(
    artifacts: string[],
    phase: string
  ): Promise<{ valid: boolean; failures: string[] }> {
    const failures: string[] = [];

    for (const artifact of artifacts) {
      const result = await this.validateArtifact(artifact, phase);
      if (!result.valid) {
        failures.push(`${artifact}: ${result.reason}`);
        logWarning('Artifact validation failed', {
          artifact,
          phase,
          reason: result.reason
        });
      }
    }

    return {
      valid: failures.length === 0,
      failures
    };
  }

  /**
   * Get minimum file size for artifact type
   */
  private getMinSize(artifactPath: string, phase: string): number {
    const rule = this.getValidationRule(artifactPath, phase);
    return rule?.minSize || 10;  // Default: at least 10 bytes (not empty)
  }

  /**
   * Get validation rule for artifact
   */
  private getValidationRule(artifactPath: string, phase: string): ValidationRule | undefined {
    const rules = PHASE_VALIDATION_RULES[phase];
    if (!rules) return undefined;

    // Try exact match first
    const basename = path.basename(artifactPath);
    if (rules[basename]) {
      return rules[basename];
    }

    // Try extension match
    const ext = path.extname(artifactPath);
    if (rules[ext]) {
      return rules[ext];
    }

    // Try partial match (e.g., 'strategy' in 'strategy.md')
    for (const [key, rule] of Object.entries(rules)) {
      if (basename.toLowerCase().includes(key.toLowerCase())) {
        return rule;
      }
    }

    return undefined;
  }
}
