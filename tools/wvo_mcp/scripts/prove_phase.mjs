#!/usr/bin/env node

/**
 * Phase Proof Suite Runner
 *
 * Executes REAL commands to prove a phase is actually complete.
 * No more false claims - everything must be executable and verifiable.
 *
 * Usage: node prove_phase.mjs <phase-id>
 * Example: node prove_phase.mjs phase4-mcp
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

// Phase proof definitions
const PHASE_PROOFS = {
  'phase3-intelligence': {
    name: 'Phase 3: Intelligence Features',
    commands: [
      {
        name: 'Check feature flags enabled',
        cmd: 'grep "enableAdaptiveRoadmap.*true\\|enableContextManager.*true\\|enableQualityTrends.*true" src/orchestrator/orchestrator_loop.ts',
        critical: true
      },
      {
        name: 'Test MCP integration',
        cmd: 'node test_mcp_integration.mjs',
        critical: true
      },
      {
        name: 'Verify no mock data in production',
        cmd: 'grep -r "mockResponse\\|mockData" src/ --include="*.ts" | grep -v test | wc -l',
        expect: '0',
        critical: true
      },
      {
        name: 'Check AdaptiveRoadmap exists',
        cmd: 'test -f src/orchestrator/adaptive_roadmap.ts && echo "exists"',
        expect: 'exists',
        critical: true
      },
      {
        name: 'Check ContextManager exists',
        cmd: 'test -f src/orchestrator/context_manager.ts && echo "exists"',
        expect: 'exists',
        critical: true
      },
      {
        name: 'Check QualityTrends exists',
        cmd: 'test -f src/orchestrator/quality_trends.ts && echo "exists"',
        expect: 'exists',
        critical: true
      },
      {
        name: 'Build passes',
        cmd: 'npm run build',
        critical: true
      },
      {
        name: 'Tests pass',
        cmd: 'npm test',
        critical: true
      }
    ]
  },

  'phase4-mcp': {
    name: 'Phase 4: MCP Integration & Process Enforcement',
    commands: [
      {
        name: 'Test real MCP tools',
        cmd: 'node scripts/mcp_tool_cli.mjs plan_next \'{ "minimal": true, "viaHarness": true }\'',
        critical: true
      },
      {
        name: 'Check MCP client has real tools',
        cmd: 'grep "mcp__weathervane__plan_next" src/orchestrator/mcp_client.ts',
        critical: true
      },
      {
        name: 'Check WorkProcessEnforcer exists',
        cmd: 'test -f src/orchestrator/work_process_enforcer.ts && echo "exists"',
        expect: 'exists',
        critical: true
      },
      {
        name: 'Verify quality gates not stubbed',
        cmd: 'grep "return true.*Simplified\\|return true.*stubbed" src/orchestrator/work_process_enforcer.ts | wc -l',
        expect: '0',
        critical: true
      },
      {
        name: 'Check all 9 phases defined',
        cmd: 'grep -o "STRATEGIZE\\|SPEC\\|PLAN\\|THINK\\|IMPLEMENT\\|VERIFY\\|REVIEW\\|PR\\|MONITOR" src/orchestrator/work_process_enforcer.ts | sort -u | wc -l',
        expect: '9',
        critical: true
      },
      {
        name: 'MCP integration enabled by default',
        cmd: 'grep "enableMCPIntegration.*true" src/orchestrator/orchestrator_loop.ts',
        critical: true
      },
      {
        name: 'Process enforcement enabled by default',
        cmd: 'grep "enableWorkProcessEnforcement.*true" src/orchestrator/orchestrator_loop.ts',
        critical: true
      },
      {
        name: 'Build passes',
        cmd: 'npm run build',
        critical: true
      },
      {
        name: 'Tests pass',
        cmd: 'npm test',
        critical: true
      },
      {
        name: 'Atlas integrity check',
        cmd: 'node ../oss_autopilot/scripts/run_vitest.mjs --scope=autopilot --filter=atlas',
        critical: false  // May not have vitest setup
      }
    ]
  },

  'phase5-production': {
    name: 'Phase 5: Production Polish',
    commands: [
      {
        name: 'Check CompletionVerifier exists',
        cmd: 'test -f src/orchestrator/completion_verifier.ts && echo "exists"',
        expect: 'exists',
        critical: true
      },
      {
        name: 'Check EvidenceCollector exists',
        cmd: 'test -f src/orchestrator/evidence_collector.ts && echo "exists"',
        expect: 'exists',
        critical: true
      },
      {
        name: 'Check MetricsCollector exists',
        cmd: 'test -f src/orchestrator/metrics_collector.ts && echo "exists"',
        expect: 'exists',
        critical: true
      },
      {
        name: 'Evidence directory exists',
        cmd: 'test -d state/evidence && echo "exists"',
        expect: 'exists',
        critical: false
      },
      {
        name: 'Proof scripts directory exists',
        cmd: 'test -d state/evidence/proofs && echo "exists"',
        expect: 'exists',
        critical: false
      },
      {
        name: 'Build passes',
        cmd: 'npm run build',
        critical: true
      },
      {
        name: 'Tests pass',
        cmd: 'npm test',
        critical: true
      },
      {
        name: 'No security vulnerabilities',
        cmd: 'npm audit --json | jq ".metadata.vulnerabilities.critical"',
        expect: '0',
        critical: false
      }
    ]
  },

  'all': {
    name: 'All Phases',
    commands: []  // Will be populated with all phase commands
  }
};

// Populate 'all' with commands from all phases
PHASE_PROOFS.all.commands = [
  ...PHASE_PROOFS['phase3-intelligence'].commands,
  ...PHASE_PROOFS['phase4-mcp'].commands,
  ...PHASE_PROOFS['phase5-production'].commands
];

class PhaseProver {
  constructor(phaseId) {
    this.phaseId = phaseId;
    this.phase = PHASE_PROOFS[phaseId];

    if (!this.phase) {
      console.error(`Unknown phase: ${phaseId}`);
      console.log('Available phases:', Object.keys(PHASE_PROOFS).join(', '));
      process.exit(1);
    }

    // Setup evidence directory
    this.timestamp = Date.now();
    this.evidenceDir = path.join(workspaceRoot, 'state/evidence/phase', phaseId, String(this.timestamp));
    fs.mkdirSync(this.evidenceDir, { recursive: true });

    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async run() {
    console.log(`\n🔍 Running proof suite for: ${this.phase.name}`);
    console.log(`Evidence directory: ${this.evidenceDir}\n`);

    for (const command of this.phase.commands) {
      await this.runCommand(command);
    }

    // Generate summary
    const summary = this.generateSummary();

    // Save results
    this.saveResults(summary);

    // Print summary
    this.printSummary(summary);

    // Exit with appropriate code
    process.exit(summary.overallSuccess ? 0 : 1);
  }

  async runCommand(command) {
    console.log(`\n▶️  ${command.name}`);
    console.log(`   Command: ${command.cmd.slice(0, 100)}...`);

    const startTime = Date.now();
    let result = {
      name: command.name,
      command: command.cmd,
      critical: command.critical,
      timestamp: startTime,
      duration: 0,
      exitCode: 0,
      stdout: '',
      stderr: '',
      status: 'pending',
      sha256: '',
      expected: command.expect || null
    };

    try {
      // Run command
      const output = execSync(command.cmd, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 60000  // 60 second timeout
      });

      result.stdout = output;
      result.exitCode = 0;
      result.duration = Date.now() - startTime;

      // Check expected output if specified
      if (command.expect) {
        const actualOutput = output.trim();
        if (actualOutput === command.expect) {
          result.status = 'pass';
          console.log(`   ✅ PASS (output matches expected: ${command.expect})`);
        } else {
          result.status = 'fail';
          console.log(`   ❌ FAIL (expected: ${command.expect}, got: ${actualOutput.slice(0, 50)}...)`);
        }
      } else {
        result.status = 'pass';
        console.log(`   ✅ PASS (${result.duration}ms)`);
      }

      this.passed++;

    } catch (error) {
      result.exitCode = error.status || 1;
      result.stdout = error.stdout || '';
      result.stderr = error.stderr || error.message;
      result.duration = Date.now() - startTime;
      result.status = 'fail';

      console.log(`   ❌ FAIL (exit code: ${result.exitCode})`);

      if (command.critical) {
        console.log(`   ⚠️  CRITICAL FAILURE - This blocks phase completion`);
      }

      if (result.stderr) {
        console.log(`   Error: ${result.stderr.split('\n')[0]}`);
      }

      this.failed++;
    }

    // Calculate SHA256 of output
    const outputContent = result.stdout + result.stderr;
    result.sha256 = crypto.createHash('sha256').update(outputContent).digest('hex');

    // Save individual result
    this.saveCommandResult(result);

    this.results.push(result);

    return result;
  }

  saveCommandResult(result) {
    // Save command output
    const sanitizedName = result.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const outputFile = path.join(this.evidenceDir, `${sanitizedName}_output.txt`);
    const jsonFile = path.join(this.evidenceDir, `${sanitizedName}_result.json`);

    fs.writeFileSync(outputFile, result.stdout + '\n--- STDERR ---\n' + result.stderr);
    fs.writeFileSync(jsonFile, JSON.stringify(result, null, 2));
  }

  generateSummary() {
    const criticalFailures = this.results.filter(r => r.critical && r.status === 'fail');
    const nonCriticalFailures = this.results.filter(r => !r.critical && r.status === 'fail');

    return {
      phaseId: this.phaseId,
      phaseName: this.phase.name,
      timestamp: this.timestamp,
      evidenceDir: this.evidenceDir,
      totalCommands: this.results.length,
      passed: this.passed,
      failed: this.failed,
      criticalFailures: criticalFailures.length,
      nonCriticalFailures: nonCriticalFailures.length,
      overallSuccess: criticalFailures.length === 0,
      results: this.results,
      proofBundle: {
        sha256: this.calculateBundleHash(),
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()  // 24 hours
      }
    };
  }

  calculateBundleHash() {
    const bundleContent = JSON.stringify(this.results.map(r => ({
      name: r.name,
      status: r.status,
      sha256: r.sha256
    })));

    return crypto.createHash('sha256').update(bundleContent).digest('hex');
  }

  saveResults(summary) {
    const summaryFile = path.join(this.evidenceDir, 'summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

    // Also save to latest symlink
    const latestDir = path.join(workspaceRoot, 'state/evidence/phase', this.phaseId, 'latest');
    try {
      if (fs.existsSync(latestDir)) {
        fs.unlinkSync(latestDir);
      }
      fs.symlinkSync(this.evidenceDir, latestDir);
    } catch (error) {
      // Symlink creation might fail on Windows
      console.log(`Note: Could not create latest symlink: ${error.message}`);
    }
  }

  printSummary(summary) {
    console.log('\n' + '='.repeat(80));
    console.log(`PROOF SUITE SUMMARY: ${summary.phaseName}`);
    console.log('='.repeat(80));

    console.log(`\n📊 Results:`);
    console.log(`   Total commands: ${summary.totalCommands}`);
    console.log(`   ✅ Passed: ${summary.passed}`);
    console.log(`   ❌ Failed: ${summary.failed}`);
    console.log(`   🚨 Critical failures: ${summary.criticalFailures}`);
    console.log(`   ⚠️  Non-critical failures: ${summary.nonCriticalFailures}`);

    if (summary.criticalFailures > 0) {
      console.log(`\n❌ CRITICAL FAILURES (blocks phase completion):`);
      this.results
        .filter(r => r.critical && r.status === 'fail')
        .forEach(r => {
          console.log(`   - ${r.name}`);
          if (r.expected) {
            console.log(`     Expected: ${r.expected}`);
          }
        });
    }

    if (summary.nonCriticalFailures > 0) {
      console.log(`\n⚠️  NON-CRITICAL FAILURES:`);
      this.results
        .filter(r => !r.critical && r.status === 'fail')
        .forEach(r => {
          console.log(`   - ${r.name}`);
        });
    }

    console.log(`\n📁 Evidence saved to:`);
    console.log(`   ${summary.evidenceDir}`);

    console.log(`\n🔐 Proof bundle hash:`);
    console.log(`   ${summary.proofBundle.sha256}`);

    console.log(`\n📅 Valid until:`);
    console.log(`   ${summary.proofBundle.expiresAt}`);

    if (summary.overallSuccess) {
      console.log(`\n✅ PHASE PROOF SUCCESSFUL - Phase can be marked complete`);
    } else {
      console.log(`\n❌ PHASE PROOF FAILED - Phase CANNOT be marked complete`);
      console.log(`   Fix all critical failures before claiming completion.`);
    }
  }
}

// CLI entry point
async function main() {
  const phaseId = process.argv[2];

  if (!phaseId) {
    console.error('Usage: node prove_phase.mjs <phase-id>');
    console.log('\nAvailable phases:');
    Object.entries(PHASE_PROOFS).forEach(([id, phase]) => {
      console.log(`  ${id.padEnd(20)} - ${phase.name}`);
    });
    process.exit(1);
  }

  const prover = new PhaseProver(phaseId);
  await prover.run();
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { PhaseProver, PHASE_PROOFS };