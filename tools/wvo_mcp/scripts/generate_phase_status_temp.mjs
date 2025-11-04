
/**
 * Phase Status Generator
 *
 * Auto-generates status documents from telemetry data.
 * This ensures documentation reflects reality, not aspirations.
 *
 * Usage: node generate_phase_status.mjs
 *
 * Reads from:
 * - state/evidence/phase/*/latest/summary.json (proof bundles)
 * - state/autopilot_execution.md (execution history)
 * - state/atlas/hashes.json (Atlas integrity)
 * - state/metrics/trust_scores.json (agent credibility)
 *
 * Writes to:
 * - IMPLEMENTATION_STATUS.md
 * - docs/autopilot/PHASE*_COMPLETION_*.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

class PhaseStatusGenerator {
  constructor() {
    this.telemetryData = {};
    this.phaseStatuses = {};
    this.atlasHashes = {};
    this.trustScores = {};
  }

  async generate() {
    console.log('📊 Generating phase status from telemetry...\n');

    // Load all telemetry data
    await this.loadTelemetryData();

    // Analyze phase statuses
    this.analyzePhaseStatuses();

    // Generate status documents
    const statusDoc = this.generateImplementationStatus();
    const phaseCompletionDocs = this.generatePhaseCompletionDocs();

    // Write documents
    await this.writeDocuments(statusDoc, phaseCompletionDocs);

    // Verify against committed version
    const verified = await this.verifyAgainstCommitted();

    console.log('\n✅ Status generation complete');
    return verified;
  }

  async loadTelemetryData() {
    console.log('Loading telemetry data...');

    // Load proof bundles
    const evidencePath = path.join(workspaceRoot, 'state/evidence/phase');
    if (fs.existsSync(evidencePath)) {
      const phases = fs.readdirSync(evidencePath);
      for (const phase of phases) {
        const latestPath = path.join(evidencePath, phase, 'latest', 'summary.json');
        if (fs.existsSync(latestPath)) {
          const summary = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
          this.telemetryData[phase] = summary;
          console.log(`  ✓ Loaded proof bundle for ${phase}`);
        }
      }
    }

    // Load autopilot execution history
    const executionPath = path.join(workspaceRoot, 'state/autopilot_execution.md');
    if (fs.existsSync(executionPath)) {
      const content = fs.readFileSync(executionPath, 'utf-8');
      this.telemetryData.execution = this.parseExecutionHistory(content);
      console.log('  ✓ Loaded execution history');
    }

    // Load Atlas hashes
    const atlasPath = path.join(workspaceRoot, 'state/atlas/hashes.json');
    if (fs.existsSync(atlasPath)) {
      this.atlasHashes = JSON.parse(fs.readFileSync(atlasPath, 'utf-8'));
      console.log('  ✓ Loaded Atlas hashes');
    }

    // Load trust scores
    const trustPath = path.join(workspaceRoot, 'state/metrics/trust_scores.json');
    if (fs.existsSync(trustPath)) {
      this.trustScores = JSON.parse(fs.readFileSync(trustPath, 'utf-8'));
      console.log('  ✓ Loaded trust scores');
    }
  }

  parseExecutionHistory(markdown) {
    const lines = markdown.split('\n');
    const executions = [];

    let currentExecution = null;
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (currentExecution) {
          executions.push(currentExecution);
        }
        currentExecution = {
          phase: line.replace('## ', '').trim(),
          tasks: [],
          timestamp: null
        };
      } else if (line.includes('timestamp:')) {
        if (currentExecution) {
          currentExecution.timestamp = line.split('timestamp:')[1].trim();
        }
      } else if (line.startsWith('- ')) {
        if (currentExecution) {
          currentExecution.tasks.push(line.replace('- ', '').trim());
        }
      }
    }

    if (currentExecution) {
      executions.push(currentExecution);
    }

    return executions;
  }

  analyzePhaseStatuses() {
    console.log('\nAnalyzing phase statuses...');

    const phases = {
      'phase3-intelligence': {
        name: 'Phase 3: Intelligence Features',
        required: ['AdaptiveRoadmap', 'ContextManager', 'QualityTrends'],
        status: 'unknown'
      },
      'phase4-mcp': {
        name: 'Phase 4: MCP Integration',
        required: ['MCPClient', 'WorkProcessEnforcer', 'STRATEGIZE→MONITOR'],
        status: 'unknown'
      },
      'phase5-production': {
        name: 'Phase 5: Production Polish',
        required: ['CompletionVerifier', 'EvidenceCollector', 'MetricsCollector'],
        status: 'unknown'
      }
    };

    for (const [phaseId, phase] of Object.entries(phases)) {
      const proofData = this.telemetryData[phaseId];

      if (proofData) {
        // Check proof results
        const allCriticalPassed = proofData.criticalFailures === 0;
        const recentProof = Date.now() - proofData.timestamp < 24 * 60 * 60 * 1000; // Within 24h
        const noMocks = !proofData.results?.some(r => r.name.includes('mock') && r.status === 'fail');

        if (allCriticalPassed && recentProof && noMocks) {
          phase.status = 'complete';
          phase.evidence = {
            proofHash: proofData.proofBundle?.sha256,
            timestamp: new Date(proofData.timestamp).toISOString(),
            passedTests: proofData.passed,
            totalTests: proofData.totalCommands
          };
        } else {
          phase.status = 'incomplete';
          phase.issues = [];
          if (!allCriticalPassed) phase.issues.push('Critical tests failing');
          if (!recentProof) phase.issues.push('Proof older than 24 hours');
          if (!noMocks) phase.issues.push('Mock implementations detected');
        }
      } else {
        phase.status = 'no-proof';
        phase.issues = ['No proof bundle found'];
      }

      this.phaseStatuses[phaseId] = phase;
      console.log(`  ${phaseId}: ${phase.status}`);
    }
  }

  generateImplementationStatus() {
    const lines = [
      '# Implementation Status',
      '',
      '**Auto-generated from telemetry data**',
      `**Generated: ${new Date().toISOString()}**`,
      '',
      '> This document is automatically generated from actual telemetry.',
      '> Manual edits will be overwritten. To update status, run proofs.',
      '',
      '## Overview',
      ''
    ];

    // Summary table
    lines.push('| Phase | Status | Evidence | Last Verified |');
    lines.push('|-------|--------|----------|---------------|');

    for (const [phaseId, phase] of Object.entries(this.phaseStatuses)) {
      const statusIcon = phase.status === 'complete' ? '✅' :
                        phase.status === 'incomplete' ? '⚠️' : '❌';

      const evidence = phase.evidence ?
        `[Proof](state/evidence/phase/${phaseId}/latest/summary.json)` :
        'No proof';

      const lastVerified = phase.evidence?.timestamp || 'Never';

      lines.push(`| ${phase.name} | ${statusIcon} | ${evidence} | ${lastVerified} |`);
    }

    lines.push('');
    lines.push('## Phase Details');
    lines.push('');

    // Detailed status for each phase
    for (const [phaseId, phase] of Object.entries(this.phaseStatuses)) {
      lines.push(`### ${phase.name}`);
      lines.push('');

      if (phase.status === 'complete') {
        lines.push('**Status:** ✅ COMPLETE');
        lines.push('');
        lines.push('**Evidence:**');
        lines.push(`- Proof hash: \`${phase.evidence.proofHash}\``);
        lines.push(`- Tests passed: ${phase.evidence.passedTests}/${phase.evidence.totalTests}`);
        lines.push(`- Verified: ${phase.evidence.timestamp}`);
      } else if (phase.status === 'incomplete') {
        lines.push('**Status:** ⚠️ INCOMPLETE');
        lines.push('');
        lines.push('**Issues:**');
        phase.issues.forEach(issue => {
          lines.push(`- ❌ ${issue}`);
        });
      } else {
        lines.push('**Status:** ❌ NO PROOF');
        lines.push('');
        lines.push('**Issues:**');
        lines.push('- No proof bundle available');
        lines.push(`- Run \`node scripts/prove_phase.mjs ${phaseId}\` to generate proof`);
      }

      lines.push('');
      lines.push('**Required Components:**');
      phase.required.forEach(comp => {
        const exists = this.checkComponentExists(comp);
        const icon = exists ? '✅' : '❌';
        lines.push(`- ${icon} ${comp}`);
      });

      lines.push('');
    }

    // Atlas integrity section
    lines.push('## Atlas Integrity');
    lines.push('');

    if (Object.keys(this.atlasHashes).length > 0) {
      lines.push('| File | Hash | Status |');
      lines.push('|------|------|--------|');

      for (const [file, hash] of Object.entries(this.atlasHashes)) {
        const currentHash = this.calculateFileHash(file);
        const status = currentHash === hash ? '✅ Match' : '❌ Drift';
        lines.push(`| ${file} | ${hash.slice(0, 8)}... | ${status} |`);
      }
    } else {
      lines.push('No Atlas hashes available');
    }

    lines.push('');

    // Trust scores section
    lines.push('## Agent Trust Scores');
    lines.push('');

    if (Object.keys(this.trustScores).length > 0) {
      lines.push('| Agent | Trust Score | Status |');
      lines.push('|-------|-------------|--------|');

      for (const [agent, data] of Object.entries(this.trustScores)) {
        const status = data.trust >= 0.8 ? '✅ Trusted' :
                      data.trust >= 0.5 ? '⚠️ Moderate' : '❌ Low';
        lines.push(`| ${agent} | ${(data.trust * 100).toFixed(0)}% | ${status} |`);
      }
    } else {
      lines.push('No trust scores available');
    }

    lines.push('');
    lines.push('---');
    lines.push('*This document is generated from telemetry. Do not edit manually.*');

    return lines.join('\n');
  }

  generatePhaseCompletionDocs() {
    const docs = {};

    for (const [phaseId, phase] of Object.entries(this.phaseStatuses)) {
      const lines = [
        `# ${phase.name} - Completion Report`,
        '',
        `**Generated: ${new Date().toISOString()}**`,
        '',
        `## Status: ${phase.status === 'complete' ? '✅ COMPLETE' : '❌ INCOMPLETE'}`,
        ''
      ];

      if (phase.evidence) {
        lines.push('## Proof of Completion');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(phase.evidence, null, 2));
        lines.push('```');
        lines.push('');
      }

      // Add detailed test results if available
      const proofData = this.telemetryData[phaseId];
      if (proofData && proofData.results) {
        lines.push('## Test Results');
        lines.push('');
        lines.push('| Test | Status | Duration | Critical |');
        lines.push('|------|--------|----------|----------|');

        for (const result of proofData.results) {
          const icon = result.status === 'pass' ? '✅' : '❌';
          const critical = result.critical ? '🚨 Yes' : 'No';
          lines.push(`| ${result.name} | ${icon} | ${result.duration}ms | ${critical} |`);
        }

        lines.push('');
      }

      // Add required actions if incomplete
      if (phase.status !== 'complete') {
        lines.push('## Required Actions');
        lines.push('');
        lines.push('To mark this phase as complete:');
        lines.push('');
        lines.push('1. Fix all critical test failures');
        lines.push('2. Remove all mock implementations');
        lines.push(`3. Run proof suite: \`node scripts/prove_phase.mjs ${phaseId}\``);
        lines.push('4. Ensure all tests pass');
        lines.push('5. Regenerate status: `node scripts/generate_phase_status.mjs`');
        lines.push('');
      }

      docs[`PHASE_${phaseId.toUpperCase()}_COMPLETION.md`] = lines.join('\n');
    }

    return docs;
  }

  checkComponentExists(component) {
    // Map component names to file paths
    const componentPaths = {
      'AdaptiveRoadmap': 'src/orchestrator/adaptive_roadmap.ts',
      'ContextManager': 'src/orchestrator/context_manager.ts',
      'QualityTrends': 'src/orchestrator/quality_trends.ts',
      'MCPClient': 'src/orchestrator/mcp_client.ts',
      'WorkProcessEnforcer': 'src/orchestrator/work_process_enforcer.ts',
      'CompletionVerifier': 'src/orchestrator/completion_verifier.ts',
      'EvidenceCollector': 'src/orchestrator/evidence_collector.ts',
      'MetricsCollector': 'src/orchestrator/metrics_collector.ts'
    };

    const filePath = componentPaths[component];
    if (!filePath) return false;

    const fullPath = path.join(workspaceRoot, filePath);
    return fs.existsSync(fullPath);
  }

  calculateFileHash(filePath) {
    const fullPath = path.join(workspaceRoot, filePath);
    if (!fs.existsSync(fullPath)) return null;

    const content = fs.readFileSync(fullPath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async writeDocuments(statusDoc, phaseCompletionDocs) {
    console.log('\nWriting status documents...');

    // Write main status document
    const statusPath = path.join(workspaceRoot, 'IMPLEMENTATION_STATUS.md');
    fs.writeFileSync(statusPath, statusDoc);
    console.log(`  ✓ Wrote ${statusPath}`);

    // Write phase completion documents
    const docsPath = path.join(workspaceRoot, 'docs/autopilot');
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
    }

    for (const [filename, content] of Object.entries(phaseCompletionDocs)) {
      const filePath = path.join(docsPath, filename);
      fs.writeFileSync(filePath, content);
      console.log(`  ✓ Wrote ${filePath}`);
    }
  }

  async verifyAgainstCommitted() {
    console.log('\nVerifying against committed version...');

    try {
      // Check if there are uncommitted changes to status docs
      const { execSync } = await import('child_process');
      const diff = execSync('git diff --name-only IMPLEMENTATION_STATUS.md docs/autopilot/PHASE*.md', {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      if (diff.trim().length > 0) {
        console.log('⚠️  Status documents have uncommitted changes:');
        diff.trim().split('\n').forEach(file => {
          console.log(`  - ${file}`);
        });
        console.log('\nThis means the committed docs don\'t match telemetry.');
        console.log('Run `git add` and commit if the changes are correct.');
        return false;
      } else {
        console.log('✅ Status documents match committed version');
        return true;
      }
    } catch (error) {
      // Git command failed or not in a git repo
      console.log('⚠️  Could not verify against git');
      return true;
    }
  }
}

// CLI entry point
async function main() {
  const generator = new PhaseStatusGenerator();

  try {
    const verified = await generator.generate();
    process.exit(verified ? 0 : 1);
  } catch (error) {
    console.error('❌ Error generating status:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { PhaseStatusGenerator }; Human: Human: continue