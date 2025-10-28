/**
 * Evidence Collector
 *
 * Collects EXECUTABLE EVIDENCE that work is actually complete.
 * No more false claims - everything must be provable with telemetry.
 *
 * This is the foundation of the meta-fix: Completion badges can only
 * be earned through verifiable evidence, not claims.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export interface ExecutableEvidence {
  timestamp: number;
  phase: string;
  taskId: string;
  type: 'mcp_call' | 'test_run' | 'build_output' | 'git_diff' | 'coverage' | 'telemetry' | 'atlas_hash' | 'phase_artifact' | 'verification_failure';

  // The actual proof
  evidence: {
    command?: string;           // Command that was run
    output?: string;            // Output from command
    exitCode?: number;          // Exit code
    artifacts?: string[];       // Files created/modified
    checksums?: Record<string, string>;  // File checksums
    mcpCalls?: MCPCallRecord[];        // MCP tool calls made
    coverage?: CoverageRecord;          // Test coverage data
    telemetry?: TelemetryRecord[];     // System telemetry
  };

  // Verification that can be re-run
  verificationScript?: string;  // Script to re-verify this evidence
  verified: boolean;            // Was this evidence verified?
}

export interface MCPCallRecord {
  tool: string;
  params: any;
  response: any;
  timestamp: number;
  duration: number;
  success: boolean;
  wasMocked: boolean;  // CRITICAL: Did this use mock data?
}

export interface CoverageRecord {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
  threshold: number;
  passed: boolean;
}

export interface TelemetryRecord {
  event: string;
  data: any;
  timestamp: number;
}

export interface EvidenceBundle {
  phase: string;
  taskId: string;
  startTime: number;
  endTime: number;
  evidence: ExecutableEvidence[];

  // Summary of what was proven
  proven: {
    realMCPCalls: number;
    mockedMCPCalls: number;
    testsRun: number;
    testsPassed: number;
    buildSucceeded: boolean;
    coveragePercent: number;
    artifactsCreated: string[];
    gitChanges: number;
  };

  // Can this be marked complete?
  meetsCompletionCriteria: boolean;
  missingEvidence: string[];
}

/**
 * Collects and verifies executable evidence of work completion
 */
export class EvidenceCollector {
  private currentEvidence: ExecutableEvidence[] = [];
  private readonly evidencePath: string;
  private readonly proofScriptsPath: string;
  private activePhase: string | null = null;
  private activeTaskId: string | null = null;
  private startTime: number = 0;

  constructor(private readonly workspaceRoot: string) {
    this.evidencePath = path.join(workspaceRoot, 'state/evidence');
    this.proofScriptsPath = path.join(workspaceRoot, 'state/evidence/proofs');

    // Ensure directories exist
    if (!fs.existsSync(this.evidencePath)) {
      fs.mkdirSync(this.evidencePath, { recursive: true });
    }
    if (!fs.existsSync(this.proofScriptsPath)) {
      fs.mkdirSync(this.proofScriptsPath, { recursive: true });
    }
  }

  /**
   * Start collecting evidence for a phase/task
   */
  startCollection(phase: string, taskId: string): void {
    this.activePhase = phase;
    this.activeTaskId = taskId;
    this.startTime = Date.now();
    this.currentEvidence = [];

    logInfo('Started evidence collection', {
      phase,
      taskId,
      timestamp: this.startTime
    });
  }

  /**
   * Collect MCP call evidence
   */
  collectMCPCall(call: MCPCallRecord): void {
    if (!this.activePhase) return;

    // CRITICAL: Flag if this was mocked
    if (call.wasMocked) {
      logWarning('MCP call used mock data - NOT valid evidence', {
        tool: call.tool,
        taskId: this.activeTaskId
      });
    }

    const evidence: ExecutableEvidence = {
      timestamp: Date.now(),
      phase: this.activePhase,
      taskId: this.activeTaskId!,
      type: 'mcp_call',
      evidence: {
        mcpCalls: [call]
      },
      verified: !call.wasMocked,  // Only verified if NOT mocked

      // Script to re-verify this MCP call works
      verificationScript: this.generateMCPVerificationScript(call)
    };

    this.currentEvidence.push(evidence);
    this.saveEvidence(evidence);
  }

  /**
   * Collect test run evidence
   */
  collectTestRun(command: string, output: string, exitCode: number): void {
    if (!this.activePhase) return;

    // Parse test results
    const testsPassed = !output.includes('FAIL') && exitCode === 0;
    const testsRun = (output.match(/\d+ passing/)?.[0]?.match(/\d+/)?.[0]) || '0';

    const evidence: ExecutableEvidence = {
      timestamp: Date.now(),
      phase: this.activePhase,
      taskId: this.activeTaskId!,
      type: 'test_run',
      evidence: {
        command,
        output: output.slice(0, 10000),  // First 10KB
        exitCode
      },
      verified: testsPassed,

      // Script to re-run tests
      verificationScript: this.generateTestVerificationScript(command)
    };

    this.currentEvidence.push(evidence);
    this.saveEvidence(evidence);
  }

  /**
   * Collect build output evidence
   */
  collectBuildOutput(command: string, output: string, exitCode: number): void {
    if (!this.activePhase) return;

    const buildSucceeded = !output.includes('error') && exitCode === 0;

    const evidence: ExecutableEvidence = {
      timestamp: Date.now(),
      phase: this.activePhase,
      taskId: this.activeTaskId!,
      type: 'build_output',
      evidence: {
        command,
        output: output.slice(0, 10000),
        exitCode,
        artifacts: this.findBuildArtifacts()
      },
      verified: buildSucceeded,

      verificationScript: this.generateBuildVerificationScript()
    };

    this.currentEvidence.push(evidence);
    this.saveEvidence(evidence);
  }

  /**
   * Collect git diff evidence
   */
  collectGitDiff(): void {
    if (!this.activePhase) return;

    try {
      const diff = execSync('git diff --stat', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8'
      });

      const filesChanged = diff.split('\n').filter(line => line.includes('|')).length;

      const evidence: ExecutableEvidence = {
        timestamp: Date.now(),
        phase: this.activePhase,
        taskId: this.activeTaskId!,
        type: 'git_diff',
        evidence: {
          command: 'git diff --stat',
          output: diff,
          artifacts: diff.split('\n')
            .filter(line => line.includes('|'))
            .map(line => line.split('|')[0].trim())
        },
        verified: filesChanged > 0,

        verificationScript: this.generateGitVerificationScript()
      };

      this.currentEvidence.push(evidence);
      this.saveEvidence(evidence);

    } catch (error) {
      logError('Failed to collect git diff', { error: String(error) });
    }
  }

  /**
   * Collect coverage evidence
   */
  collectCoverage(coverageData: CoverageRecord): void {
    if (!this.activePhase) return;

    const evidence: ExecutableEvidence = {
      timestamp: Date.now(),
      phase: this.activePhase,
      taskId: this.activeTaskId!,
      type: 'coverage',
      evidence: {
        coverage: coverageData
      },
      verified: coverageData.passed,

      verificationScript: this.generateCoverageVerificationScript()
    };

    this.currentEvidence.push(evidence);
    this.saveEvidence(evidence);
  }

  /**
   * Collect telemetry evidence
   */
  collectTelemetry(events: TelemetryRecord[]): void {
    if (!this.activePhase) return;

    const evidence: ExecutableEvidence = {
      timestamp: Date.now(),
      phase: this.activePhase,
      taskId: this.activeTaskId!,
      type: 'telemetry',
      evidence: {
        telemetry: events
      },
      verified: true,

      verificationScript: this.generateTelemetryVerificationScript()
    };

    this.currentEvidence.push(evidence);
    this.saveEvidence(evidence);
  }

  /**
   * Collect Atlas hash evidence
   */
  collectAtlasHash(): void {
    if (!this.activePhase) return;

    try {
      // Get Atlas hash
      const atlasPath = path.join(this.workspaceRoot, 'docs/atlas/atlas.md');
      if (fs.existsSync(atlasPath)) {
        const content = fs.readFileSync(atlasPath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex');

        const evidence: ExecutableEvidence = {
          timestamp: Date.now(),
          phase: this.activePhase,
          taskId: this.activeTaskId!,
          type: 'atlas_hash',
          evidence: {
            checksums: {
              'docs/atlas/atlas.md': hash
            }
          },
          verified: true,

          verificationScript: this.generateAtlasVerificationScript(hash)
        };

        this.currentEvidence.push(evidence);
        this.saveEvidence(evidence);
      }
    } catch (error) {
      logError('Failed to collect Atlas hash', { error: String(error) });
    }
  }

  /**
   * Finalize evidence collection and generate bundle
   */
  finalizeCollection(): EvidenceBundle {
    if (!this.activePhase || !this.activeTaskId) {
      throw new Error('No active collection to finalize');
    }

    // Analyze collected evidence
    const realMCPCalls = this.currentEvidence
      .filter(e => e.type === 'mcp_call' && e.verified)
      .length;

    const mockedMCPCalls = this.currentEvidence
      .filter(e => e.type === 'mcp_call' && !e.verified)
      .length;

    const testEvidence = this.currentEvidence.filter(e => e.type === 'test_run');
    const testsRun = testEvidence.length;
    const testsPassed = testEvidence.filter(e => e.verified).length;

    const buildEvidence = this.currentEvidence.find(e => e.type === 'build_output');
    const buildSucceeded = buildEvidence?.verified || false;

    const coverageEvidence = this.currentEvidence.find(e => e.type === 'coverage');
    const coveragePercent = coverageEvidence?.evidence.coverage?.statements || 0;

    const gitEvidence = this.currentEvidence.find(e => e.type === 'git_diff');
    const gitChanges = gitEvidence?.evidence.artifacts?.length || 0;

    const artifactsCreated = this.currentEvidence
      .flatMap(e => e.evidence.artifacts || [])
      .filter((v, i, a) => a.indexOf(v) === i);  // Unique

    // Determine what's missing
    const missingEvidence: string[] = [];

    if (realMCPCalls === 0 && mockedMCPCalls > 0) {
      missingEvidence.push('All MCP calls were mocked - need real integration');
    }

    if (testsRun === 0) {
      missingEvidence.push('No test runs recorded');
    }

    if (testsPassed < testsRun) {
      missingEvidence.push(`${testsRun - testsPassed} tests failed`);
    }

    if (!buildSucceeded) {
      missingEvidence.push('Build did not succeed');
    }

    if (coveragePercent < 80) {
      missingEvidence.push(`Coverage ${coveragePercent}% below 80% threshold`);
    }

    if (gitChanges === 0) {
      missingEvidence.push('No git changes detected');
    }

    // Create bundle
    const bundle: EvidenceBundle = {
      phase: this.activePhase,
      taskId: this.activeTaskId,
      startTime: this.startTime,
      endTime: Date.now(),
      evidence: this.currentEvidence,
      proven: {
        realMCPCalls,
        mockedMCPCalls,
        testsRun,
        testsPassed,
        buildSucceeded,
        coveragePercent,
        artifactsCreated,
        gitChanges
      },
      meetsCompletionCriteria: missingEvidence.length === 0,
      missingEvidence
    };

    // Save bundle
    this.saveBundle(bundle);

    // Generate proof scripts
    this.generateProofScripts(bundle);

    // Reset for next collection
    this.activePhase = null;
    this.activeTaskId = null;
    this.currentEvidence = [];

    logInfo('Evidence collection finalized', {
      phase: bundle.phase,
      taskId: bundle.taskId,
      meetsCompletion: bundle.meetsCompletionCriteria,
      missingCount: missingEvidence.length
    });

    return bundle;
  }

  /**
   * Generate MCP verification script
   */
  private generateMCPVerificationScript(call: MCPCallRecord): string {
    return `#!/bin/bash
# Verify MCP call: ${call.tool}
# Generated: ${new Date().toISOString()}

echo "Testing MCP tool: ${call.tool}"
echo '${JSON.stringify(call.params)}' | mcp call ${call.tool}

if [ $? -eq 0 ]; then
  echo "✅ MCP call verified"
  exit 0
else
  echo "❌ MCP call failed"
  exit 1
fi`;
  }

  /**
   * Generate test verification script
   */
  private generateTestVerificationScript(command: string): string {
    return `#!/bin/bash
# Verify tests pass
# Generated: ${new Date().toISOString()}

cd ${this.workspaceRoot}
${command}

if [ $? -eq 0 ]; then
  echo "✅ Tests verified"
  exit 0
else
  echo "❌ Tests failed"
  exit 1
fi`;
  }

  /**
   * Generate build verification script
   */
  private generateBuildVerificationScript(): string {
    return `#!/bin/bash
# Verify build succeeds
# Generated: ${new Date().toISOString()}

cd ${this.workspaceRoot}
npm run build

if [ $? -eq 0 ]; then
  echo "✅ Build verified"
  exit 0
else
  echo "❌ Build failed"
  exit 1
fi`;
  }

  /**
   * Generate git verification script
   */
  private generateGitVerificationScript(): string {
    return `#!/bin/bash
# Verify git changes exist
# Generated: ${new Date().toISOString()}

cd ${this.workspaceRoot}
CHANGES=$(git diff --stat | wc -l)

if [ $CHANGES -gt 0 ]; then
  echo "✅ Git changes verified: $CHANGES files"
  exit 0
else
  echo "❌ No git changes found"
  exit 1
fi`;
  }

  /**
   * Generate coverage verification script
   */
  private generateCoverageVerificationScript(): string {
    return `#!/bin/bash
# Verify test coverage meets threshold
# Generated: ${new Date().toISOString()}

cd ${this.workspaceRoot}
npm run test -- --coverage

# Parse coverage from output
COVERAGE=$(npm run test -- --coverage 2>&1 | grep "Statements" | awk '{print $3}' | sed 's/%//')

if [ "$COVERAGE" -ge 80 ]; then
  echo "✅ Coverage verified: $COVERAGE%"
  exit 0
else
  echo "❌ Coverage below threshold: $COVERAGE%"
  exit 1
fi`;
  }

  /**
   * Generate telemetry verification script
   */
  private generateTelemetryVerificationScript(): string {
    return `#!/bin/bash
# Verify telemetry is being collected
# Generated: ${new Date().toISOString()}

cd ${this.workspaceRoot}

# Check for telemetry files
if [ -f state/logs/orchestrator.jsonl ]; then
  EVENTS=$(wc -l < state/logs/orchestrator.jsonl)
  echo "✅ Telemetry verified: $EVENTS events"
  exit 0
else
  echo "❌ No telemetry found"
  exit 1
fi`;
  }

  /**
   * Generate Atlas verification script
   */
  private generateAtlasVerificationScript(expectedHash: string): string {
    return `#!/bin/bash
# Verify Atlas integrity
# Generated: ${new Date().toISOString()}

cd ${this.workspaceRoot}

if [ -f docs/atlas/atlas.md ]; then
  HASH=$(sha256sum docs/atlas/atlas.md | awk '{print $1}')

  if [ "$HASH" = "${expectedHash}" ]; then
    echo "✅ Atlas integrity verified"
    exit 0
  else
    echo "❌ Atlas hash mismatch"
    echo "Expected: ${expectedHash}"
    echo "Got: $HASH"
    exit 1
  fi
else
  echo "❌ Atlas not found"
  exit 1
fi`;
  }

  /**
   * Find build artifacts
   */
  private findBuildArtifacts(): string[] {
    const artifacts: string[] = [];

    // Check for dist directory
    const distPath = path.join(this.workspaceRoot, 'dist');
    if (fs.existsSync(distPath)) {
      const files = execSync('find dist -type f -name "*.js" | head -20', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8'
      }).trim().split('\n');

      artifacts.push(...files.filter(f => f.length > 0));
    }

    return artifacts;
  }

  /**
   * Save individual evidence
   */
  private saveEvidence(evidence: ExecutableEvidence): void {
    const filename = `${evidence.type}_${evidence.timestamp}.json`;
    const filepath = path.join(this.evidencePath, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(evidence, null, 2));
    } catch (error) {
      logError('Failed to save evidence', { error: String(error) });
    }
  }

  /**
   * Save evidence bundle
   */
  private saveBundle(bundle: EvidenceBundle): void {
    const filename = `bundle_${bundle.phase}_${bundle.taskId}_${bundle.endTime}.json`;
    const filepath = path.join(this.evidencePath, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(bundle, null, 2));

      logInfo('Evidence bundle saved', {
        path: filepath,
        meetsCompletion: bundle.meetsCompletionCriteria
      });
    } catch (error) {
      logError('Failed to save evidence bundle', { error: String(error) });
    }
  }

  /**
   * Generate proof scripts for bundle
   */
  private generateProofScripts(bundle: EvidenceBundle): void {
    const scriptName = `proof_${bundle.phase}_${bundle.taskId}.sh`;
    const scriptPath = path.join(this.proofScriptsPath, scriptName);

    const lines = [
      '#!/bin/bash',
      `# Proof script for ${bundle.phase} - ${bundle.taskId}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      'echo "Running proof verification for ${bundle.phase}"',
      'FAILURES=0',
      ''
    ];

    // Add individual verification scripts
    for (const evidence of bundle.evidence) {
      if (evidence.verificationScript) {
        lines.push(`# Verify ${evidence.type}`);
        lines.push('(');
        lines.push(evidence.verificationScript);
        lines.push(') || FAILURES=$((FAILURES + 1))');
        lines.push('');
      }
    }

    // Final check
    lines.push('if [ $FAILURES -eq 0 ]; then');
    lines.push('  echo "✅ All proofs verified"');
    lines.push('  exit 0');
    lines.push('else');
    lines.push('  echo "❌ $FAILURES proofs failed"');
    lines.push('  exit 1');
    lines.push('fi');

    try {
      fs.writeFileSync(scriptPath, lines.join('\n'));
      fs.chmodSync(scriptPath, '755');

      logInfo('Proof script generated', {
        path: scriptPath
      });
    } catch (error) {
      logError('Failed to generate proof script', { error: String(error) });
    }
  }

  /**
   * Verify evidence bundle with proof scripts
   */
  async verifyBundle(bundlePath: string): Promise<boolean> {
    try {
      const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
      const scriptName = `proof_${bundle.phase}_${bundle.taskId}.sh`;
      const scriptPath = path.join(this.proofScriptsPath, scriptName);

      if (!fs.existsSync(scriptPath)) {
        logWarning('Proof script not found', { scriptPath });
        return false;
      }

      const output = execSync(scriptPath, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8'
      });

      logInfo('Proof verification complete', {
        phase: bundle.phase,
        taskId: bundle.taskId,
        verified: true
      });

      return true;

    } catch (error) {
      logError('Proof verification failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Get evidence summary for reporting
   */
  getEvidenceSummary(): any {
    const files = fs.readdirSync(this.evidencePath)
      .filter(f => f.startsWith('bundle_'));

    const bundles = files.map(f => {
      const content = fs.readFileSync(path.join(this.evidencePath, f), 'utf-8');
      return JSON.parse(content);
    });

    return {
      totalBundles: bundles.length,
      completedPhases: bundles.filter(b => b.meetsCompletionCriteria).map(b => b.phase),
      failedPhases: bundles.filter(b => !b.meetsCompletionCriteria).map(b => ({
        phase: b.phase,
        missing: b.missingEvidence
      })),
      statistics: {
        totalMCPCalls: bundles.reduce((sum, b) => sum + b.proven.realMCPCalls + b.proven.mockedMCPCalls, 0),
        realMCPCalls: bundles.reduce((sum, b) => sum + b.proven.realMCPCalls, 0),
        mockedMCPCalls: bundles.reduce((sum, b) => sum + b.proven.mockedMCPCalls, 0),
        totalTests: bundles.reduce((sum, b) => sum + b.proven.testsRun, 0),
        passedTests: bundles.reduce((sum, b) => sum + b.proven.testsPassed, 0),
        averageCoverage: bundles.reduce((sum, b) => sum + b.proven.coveragePercent, 0) / bundles.length
      }
    };
  }

  /**
   * Collect phase-specific artifacts
   */
  collectPhaseArtifact(artifactType: string, artifact: any): void {
    if (!this.activePhase || !this.activeTaskId) {
      logWarning('No active collection for phase artifact', { artifactType });
      return;
    }

    // Store the artifact as executable evidence
    const evidence: ExecutableEvidence = {
      type: 'phase_artifact',
      timestamp: Date.now(),
      phase: this.activePhase || 'unknown',
      taskId: this.activeTaskId || 'unknown',
      evidence: {
        command: `echo "Phase artifact: ${artifactType}"`,
        output: JSON.stringify(artifact),
        exitCode: 0
      },
      verificationScript: this.generateArtifactVerificationScript(artifactType, artifact),
      verified: false
    };

    this.currentEvidence.push(evidence);

    logInfo('Phase artifact collected', {
      phase: this.activePhase,
      taskId: this.activeTaskId,
      artifactType
    });
  }

  /**
   * Collect verification failure evidence
   */
  collectVerificationFailure(phase: string, errors: string[]): void {
    if (!this.activePhase || !this.activeTaskId) {
      logWarning('No active collection for verification failure', { phase });
      return;
    }

    const evidence: ExecutableEvidence = {
      type: 'verification_failure',
      timestamp: Date.now(),
      phase: phase,
      taskId: this.activeTaskId || 'unknown',
      evidence: {
        output: errors.join('\n'),
        exitCode: 1
      },
      verificationScript: `#!/bin/bash\necho "Verification failed with ${errors.length} errors"\nexit 1`,
      verified: true
    };

    this.currentEvidence.push(evidence);

    logWarning('Verification failure recorded', {
      phase,
      errorCount: errors.length,
      taskId: this.activeTaskId
    });
  }

  /**
   * Generate artifact verification script
   */
  private generateArtifactVerificationScript(artifactType: string, artifact: any): string {
    return `#!/bin/bash
# Verify artifact: ${artifactType}
# Generated: ${new Date().toISOString()}

echo "Checking artifact type: ${artifactType}"
echo '${JSON.stringify(artifact)}' | jq '.'

if [ $? -eq 0 ]; then
  echo "✅ Artifact verified"
  exit 0
else
  echo "❌ Artifact verification failed"
  exit 1
fi`;
  }
}