/**
 * Adversarial Bullshit Detector - Final quality gate
 *
 * This is the LAST LINE OF DEFENSE against gaming the quality system.
 * It actively looks for signs that someone is:
 * - Changing tests to pass without fixing issues
 * - Fabricating evidence
 * - Documenting features that don't exist
 * - Building infrastructure but not using it
 * - Claiming integration without actual integration
 *
 * If this detector finds issues, the task is REJECTED immediately.
 * No debate, no exceptions.
 */

import { promises as fs } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

const execAsync = promisify(exec);

export interface TaskEvidence {
  taskId: string;
  title?: string;
  description?: string;
  buildOutput: string;
  testOutput: string;
  runtimeEvidence?: {
    type: 'screenshot' | 'logs' | 'cli_output';
    path: string;
    content?: string;
  }[];
  documentation: string[];
  changedFiles: string[];
  testFiles: string[];
}

export interface BullshitDetection {
  detected: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  description: string;
  evidence: string[];
  recommendation: string;
}

export interface BullshitReport {
  taskId: string;
  passed: boolean;
  detections: BullshitDetection[];
  summary: string;
}

export class AdversarialBullshitDetector {
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Run all adversarial checks on task evidence
   * Returns true if task passes, false if bullshit detected
   */
  async detectBullshit(evidence: TaskEvidence): Promise<BullshitReport> {
    logInfo('Running adversarial bullshit detector', { taskId: evidence.taskId });

    const detections: BullshitDetection[] = [];

    // Run all checks in parallel
    const checks = await Promise.all([
      this.checkTestIntegrity(evidence),
      this.checkEvidenceValidity(evidence),
      this.checkDocumentationCodeMatch(evidence),
      this.checkImplementationValidity(evidence),
      this.checkIntegrationReality(evidence),
      this.checkSuperficialCompletion(evidence),
    ]);

    // Flatten results
    checks.forEach(check => {
      if (check) {
        detections.push(...check);
      }
    });

    // Filter to only actual detections
    const actualDetections = detections.filter(d => d.detected);

    // Determine if task passes
    const hasCritical = actualDetections.some(d => d.severity === 'CRITICAL');
    const hasHigh = actualDetections.some(d => d.severity === 'HIGH');
    const passed = !hasCritical && !hasHigh;

    // Generate summary
    const summary = this.generateSummary(actualDetections, passed);

    return {
      taskId: evidence.taskId,
      passed,
      detections: actualDetections,
      summary,
    };
  }

  /**
   * Check 1: Test Integrity
   * Detect if tests were changed to pass without fixing the real issue
   */
  private async checkTestIntegrity(evidence: TaskEvidence): Promise<BullshitDetection[]> {
    const detections: BullshitDetection[] = [];

    try {
      // Check if test expectations changed without implementation changes
      const { stdout: gitDiff } = await execAsync(
        `cd ${this.workspaceRoot} && git diff HEAD~1 -- ${evidence.testFiles.join(' ')}`,
        { maxBuffer: 1024 * 1024 * 10 }
      );

      if (gitDiff.includes('expect(') && gitDiff.includes('-')) {
        // Test expectations were removed or changed
        const hasImplementationChanges = evidence.changedFiles.some(
          f => !f.includes('.test.') && !f.includes('.spec.')
        );

        if (!hasImplementationChanges) {
          detections.push({
            detected: true,
            severity: 'CRITICAL',
            category: 'test_integrity',
            description: 'Test expectations changed without corresponding implementation changes',
            evidence: ['Git diff shows test assertions modified', 'No implementation files changed'],
            recommendation: 'REJECT: Tests were weakened to pass without fixing the actual issue',
          });
        }
      }

      // Check for overly permissive mocks
      for (const testFile of evidence.testFiles) {
        const testFilePath = path.join(this.workspaceRoot, testFile);
        try {
          const content = await fs.readFile(testFilePath, 'utf-8');

          // Look for mocks that return success unconditionally
          if (content.includes('jest.fn(() => true)') || content.includes('jest.fn(() => { return true; })')) {
            detections.push({
              detected: true,
              severity: 'HIGH',
              category: 'test_integrity',
              description: `Test file ${testFile} contains unconditional success mocks`,
              evidence: ['Mock always returns true', 'May be hiding real failures'],
              recommendation: 'Investigate if mocks are masking real problems',
            });
          }
        } catch (err) {
          // File might not exist or not readable
        }
      }
    } catch (error) {
      // Git diff might fail if this is the first commit
      logWarning('Test integrity check failed', { error });
    }

    return detections;
  }

  /**
   * Check 2: Evidence Validity
   * Detect fabricated or misleading evidence
   */
  private async checkEvidenceValidity(evidence: TaskEvidence): Promise<BullshitDetection[]> {
    const detections: BullshitDetection[] = [];

    if (!evidence.runtimeEvidence || evidence.runtimeEvidence.length === 0) {
      // No runtime evidence provided - not necessarily bullshit, but suspicious for features
      detections.push({
        detected: true,
        severity: 'MEDIUM',
        category: 'evidence_validity',
        description: 'No runtime evidence provided',
        evidence: ['Task claims feature works but no screenshots/logs/output provided'],
        recommendation: 'Request runtime evidence: screenshots, CLI output, or logs',
      });
    } else {
      // Check if evidence files actually exist
      for (const ev of evidence.runtimeEvidence) {
        const evidencePath = path.join(this.workspaceRoot, ev.path);
        try {
          await fs.access(evidencePath);
        } catch {
          detections.push({
            detected: true,
            severity: 'CRITICAL',
            category: 'evidence_validity',
            description: `Evidence file does not exist: ${ev.path}`,
            evidence: [`Path ${ev.path} not found in workspace`],
            recommendation: 'REJECT: Evidence path is invalid or fabricated',
          });
        }
      }
    }

    return detections;
  }

  /**
   * Check 3: Documentation-Code Match
   * Detect documentation that describes features that don't exist
   */
  private async checkDocumentationCodeMatch(evidence: TaskEvidence): Promise<BullshitDetection[]> {
    const detections: BullshitDetection[] = [];

    for (const docFile of evidence.documentation) {
      const docPath = path.join(this.workspaceRoot, docFile);

      try {
        const docContent = await fs.readFile(docPath, 'utf-8');

        // Extract code references from documentation (function names, file paths)
        const functionRefs = docContent.match(/`([a-zA-Z_][a-zA-Z0-9_]+)\(\)`/g) || [];
        const fileRefs = docContent.match(/`([a-z_/]+\.[a-z]+)`/g) || [];

        // Check if referenced functions exist in changed files
        for (const funcRef of functionRefs) {
          const funcName = funcRef.replace(/`|\(\)/g, '');

          let found = false;
          for (const changedFile of evidence.changedFiles) {
            const changedPath = path.join(this.workspaceRoot, changedFile);
            try {
              const content = await fs.readFile(changedPath, 'utf-8');
              if (content.includes(`function ${funcName}`) || content.includes(`${funcName}:`)) {
                found = true;
                break;
              }
            } catch {
              // File might not exist
            }
          }

          if (!found) {
            detections.push({
              detected: true,
              severity: 'HIGH',
              category: 'documentation_code_match',
              description: `Documentation references function ${funcName} that doesn't exist in changed files`,
              evidence: [`Function ${funcName} mentioned in ${docFile}`, 'Not found in implementation files'],
              recommendation: 'Verify function actually exists or remove from documentation',
            });
          }
        }

        // Check if referenced files exist
        for (const fileRef of fileRefs) {
          const fileName = fileRef.replace(/`/g, '');
          const filePath = path.join(this.workspaceRoot, fileName);

          try {
            await fs.access(filePath);
          } catch {
            detections.push({
              detected: true,
              severity: 'CRITICAL',
              category: 'documentation_code_match',
              description: `Documentation references file ${fileName} that doesn't exist`,
              evidence: [`File ${fileName} mentioned in ${docFile}`, 'File not found in workspace'],
              recommendation: 'REJECT: Documentation describes non-existent implementation',
            });
          }
        }
      } catch (error) {
        // Doc file doesn't exist or not readable
      }
    }

    return detections;
  }

  /**
   * Check 4: Implementation Validity
   * Detect code that exists but doesn't actually work
   */
  private async checkImplementationValidity(evidence: TaskEvidence): Promise<BullshitDetection[]> {
    const detections: BullshitDetection[] = [];

    // Check if build output contains errors (despite claiming success)
    if (evidence.buildOutput.toLowerCase().includes('error') && !evidence.buildOutput.includes('0 errors')) {
      detections.push({
        detected: true,
        severity: 'CRITICAL',
        category: 'implementation_validity',
        description: 'Build output contains errors despite claiming success',
        evidence: ['Build output contains "error" keyword', 'Task claims build passed'],
        recommendation: 'REJECT: Build is not actually clean',
      });
    }

    // Check if test output shows failures
    const testFailurePatterns = [
      /(\d+) failed/,
      /✗/,
      /FAIL\s+/,
      /AssertionError/,
    ];

    for (const pattern of testFailurePatterns) {
      if (pattern.test(evidence.testOutput)) {
        detections.push({
          detected: true,
          severity: 'CRITICAL',
          category: 'implementation_validity',
          description: 'Test output shows failures',
          evidence: ['Tests are failing', 'Task claims tests pass'],
          recommendation: 'REJECT: Tests are not actually passing',
        });
        break;
      }
    }

    return detections;
  }

  /**
   * Check 5: Integration Reality
   * Detect claimed integrations that don't actually integrate
   */
  private async checkIntegrationReality(evidence: TaskEvidence): Promise<BullshitDetection[]> {
    const detections: BullshitDetection[] = [];

    // Check for framework-specific patterns
    const frameworkChecks = [
      {
        name: 'Prefect',
        required: ['@flow', '@task', 'from prefect'],
        description: 'Claims Prefect integration',
      },
      {
        name: 'FastAPI',
        required: ['@app.get', '@app.post', 'FastAPI'],
        description: 'Claims FastAPI integration',
      },
      {
        name: 'React',
        required: ['useState', 'useEffect', 'import React'],
        description: 'Claims React integration',
      },
    ];

    for (const check of frameworkChecks) {
      // Check if any documentation mentions this framework
      let mentionedInDocs = false;
      for (const docFile of evidence.documentation) {
        const docPath = path.join(this.workspaceRoot, docFile);
        try {
          const content = await fs.readFile(docPath, 'utf-8');
          if (content.toLowerCase().includes(check.name.toLowerCase())) {
            mentionedInDocs = true;
            break;
          }
        } catch {
          // Doc doesn't exist
        }
      }

      if (mentionedInDocs) {
        // Check if implementation actually uses the framework
        let usesFramework = false;
        for (const changedFile of evidence.changedFiles) {
          const filePath = path.join(this.workspaceRoot, changedFile);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            if (check.required.some(pattern => content.includes(pattern))) {
              usesFramework = true;
              break;
            }
          } catch {
            // File doesn't exist
          }
        }

        if (!usesFramework) {
          detections.push({
            detected: true,
            severity: 'CRITICAL',
            category: 'integration_reality',
            description: `Claims ${check.name} integration but doesn't use ${check.name} features`,
            evidence: [
              `Documentation mentions ${check.name}`,
              `Implementation doesn't use required patterns: ${check.required.join(', ')}`,
            ],
            recommendation: `REJECT: Not actually using ${check.name} framework`,
          });
        }
      }
    }

    return detections;
  }

  /**
   * Check 6: Superficial Completion
   * Detect infrastructure built but never used
   */
  private async checkSuperficialCompletion(evidence: TaskEvidence): Promise<BullshitDetection[]> {
    const detections: BullshitDetection[] = [];

    // Check for empty data files
    for (const changedFile of evidence.changedFiles) {
      if (changedFile.endsWith('.json') || changedFile.endsWith('.jsonl')) {
        const filePath = path.join(this.workspaceRoot, changedFile);
        try {
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');

          // Check if file is essentially empty
          if (stats.size < 10 || content.trim() === '{}' || content.trim() === '[]') {
            detections.push({
              detected: true,
              severity: 'HIGH',
              category: 'superficial_completion',
              description: `Data file ${changedFile} is empty or trivial`,
              evidence: [`File size: ${stats.size} bytes`, 'Contains no meaningful data'],
              recommendation: 'Verify system is actually being used, not just scaffolded',
            });
          }
        } catch {
          // File might not exist
        }
      }
    }

    return detections;
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(detections: BullshitDetection[], passed: boolean): string {
    if (passed) {
      return '✅ Task passes adversarial review - no bullshit detected';
    }

    const bySeverity = {
      CRITICAL: detections.filter(d => d.severity === 'CRITICAL').length,
      HIGH: detections.filter(d => d.severity === 'HIGH').length,
      MEDIUM: detections.filter(d => d.severity === 'MEDIUM').length,
      LOW: detections.filter(d => d.severity === 'LOW').length,
    };

    const summary = [
      '❌ TASK REJECTED - Bullshit detected by adversarial review',
      '',
      `Detections: ${detections.length} total`,
      `  - CRITICAL: ${bySeverity.CRITICAL}`,
      `  - HIGH: ${bySeverity.HIGH}`,
      `  - MEDIUM: ${bySeverity.MEDIUM}`,
      `  - LOW: ${bySeverity.LOW}`,
      '',
      'Top issues:',
    ];

    // Add top 3 most severe issues
    const topIssues = detections
      .sort((a, b) => {
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, 3);

    topIssues.forEach((issue, i) => {
      summary.push(`${i + 1}. [${issue.severity}] ${issue.description}`);
    });

    summary.push('');
    summary.push('Recommendation: Fix issues and resubmit for review');

    return summary.join('\n');
  }
}
