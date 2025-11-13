#!/usr/bin/env node

/**
 * Main E2E Test Runner
 * Coordinates orchestrator and operator monitor for complete E2E testing
 */

import { spawn, fork } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');

class E2ETestRunner {
  constructor() {
    this.startTime = Date.now();
    this.orchestratorProcess = null;
    this.monitorProcess = null;
  }

  async validateEnvironment() {
    console.log('🔍 Validating test environment...\n');

    const checks = [
      { name: 'Node.js', cmd: 'node --version', min: '20.0.0' },
      { name: 'npm', cmd: 'npm --version', min: '10.0.0' },
      { name: 'Git', cmd: 'git --version', min: '2.0.0' },
      { name: 'Claude CLI', cmd: 'which claude', required: true }
    ];

    let allPassed = true;

    for (const check of checks) {
      try {
        const result = execSync(check.cmd, { stdio: 'pipe' }).toString().trim();
        console.log(`  ✅ ${check.name}: ${result}`);
      } catch (error) {
        console.log(`  ❌ ${check.name}: Not found or version too old`);
        if (check.required !== false) {
          allPassed = false;
        }
      }
    }

    if (!allPassed) {
      throw new Error('Environment validation failed');
    }

    console.log('\n✅ Environment validated\n');
  }

  async ensureBuild() {
    console.log('🔨 Ensuring MCP server is built...');

    try {
      execSync('cd tools/wvo_mcp && npm run build', {
        cwd: WORKSPACE_ROOT,
        stdio: 'inherit'
      });
      console.log('✅ Build successful\n');
    } catch (error) {
      console.error('❌ Build failed');
      throw error;
    }
  }

  async startOperatorMonitor() {
    console.log('🚀 Starting Operator Monitor...');

    return new Promise((resolve, reject) => {
      this.monitorProcess = fork(
        path.join(__dirname, 'operator_monitor.mjs'),
        [],
        {
          cwd: WORKSPACE_ROOT,
          silent: false,
          env: process.env
        }
      );

      this.monitorProcess.on('error', reject);

      this.monitorProcess.on('message', (msg) => {
        if (msg.type === 'ready') {
          console.log('✅ Operator Monitor ready\n');
          resolve();
        }
      });

      // Give it time to start
      setTimeout(() => {
        console.log('✅ Operator Monitor started\n');
        resolve();
      }, 3000);
    });
  }

  async runOrchestrator() {
    console.log('🎯 Starting Test Orchestrator...\n');

    return new Promise((resolve, reject) => {
      this.orchestratorProcess = fork(
        path.join(__dirname, 'orchestrator.mjs'),
        [],
        {
          cwd: WORKSPACE_ROOT,
          silent: false,
          env: process.env
        }
      );

      this.orchestratorProcess.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Orchestrator exited with code ${code}`));
        }
      });

      this.orchestratorProcess.on('error', reject);
    });
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');

    // Kill monitor process
    if (this.monitorProcess) {
      this.monitorProcess.kill('SIGTERM');
    }

    // Kill orchestrator process
    if (this.orchestratorProcess) {
      this.orchestratorProcess.kill('SIGTERM');
    }

    // Kill any lingering processes
    try {
      execSync('pkill -f "wave0_gol_state|e2e_test_state"', { stdio: 'ignore' });
    } catch (e) {
      // Processes might not exist
    }

    console.log('✅ Cleanup complete');
  }

  async generateFinalReport() {
    console.log('\n📊 Final E2E Test Report\n');
    console.log('═══════════════════════════════════════');

    try {
      const reportPath = '/tmp/e2e_test_state/e2e_test_report.json';
      const report = JSON.parse(await fs.readFile(reportPath, 'utf-8'));

      console.log(`\nTest Execution Summary:`);
      console.log(`  Duration: ${((Date.now() - this.startTime) / 1000).toFixed(2)}s`);
      console.log(`  Total Tests: ${report.summary.total}`);
      console.log(`  Passed: ${report.summary.passed} ✅`);
      console.log(`  Failed: ${report.summary.failed} ❌`);
      console.log(`  Success Rate: ${(report.summary.passed / report.summary.total * 100).toFixed(1)}%`);

      console.log(`\nDetailed Results:`);
      for (const result of report.results) {
        const status = result.success ? '✅' : '❌';
        const reason = result.reason ? ` (${result.reason})` : '';
        console.log(`  ${status} ${result.taskId}${reason}`);
      }

      // Check if we met acceptance criteria
      const successRate = report.summary.passed / report.summary.total;
      if (successRate >= 0.95) {
        console.log('\n🎉 E2E Test Suite PASSED! (≥95% success rate achieved)');
      } else {
        console.log('\n⚠️  E2E Test Suite needs improvement (< 95% success rate)');
      }

    } catch (error) {
      console.log('⚠️  Could not read test report');
    }

    console.log('\n═══════════════════════════════════════\n');
  }

  async run() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║   E2E Online Testing Module v1.0.0     ║');
    console.log('║   With Operator Monitoring & Recovery  ║');
    console.log('╚═══════════════════════════════════════╝\n');

    try {
      // Validate environment
      await this.validateEnvironment();

      // Build MCP server
      await this.ensureBuild();

      // Start operator monitor
      await this.startOperatorMonitor();

      // Run test orchestrator
      await this.runOrchestrator();

      // Generate final report
      await this.generateFinalReport();

      console.log('✨ E2E Test Suite Complete!\n');
      process.exit(0);

    } catch (error) {
      console.error('\n❌ E2E Test Suite Failed:', error.message);
      process.exit(1);

    } finally {
      await this.cleanup();
    }
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Test interrupted by user');
  const runner = new E2ETestRunner();
  await runner.cleanup();
  process.exit(130);
});

process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught exception:', error);
  process.exit(1);
});

// Run the test suite
const runner = new E2ETestRunner();
runner.run().catch(console.error);