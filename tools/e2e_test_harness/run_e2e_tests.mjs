#!/usr/bin/env node

/**
 * Main E2E Test Runner
 * Coordinates orchestrator and operator monitor for complete E2E testing
 */

import { spawn, fork } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
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
    this.lastReportSummary = null;
    this.lastReportPath = null;
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

  async verifyInternetConnectivity() {
    console.log('🌐 Checking internet connectivity...');
    const probeUrl = process.env.E2E_CONNECTIVITY_URL ?? 'https://www.apple.com';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(probeUrl, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      console.log(`  ✅ Connectivity verified via ${probeUrl}`);
    } catch (error) {
      throw new Error(`Internet connectivity check failed (${error?.message ?? error}). Live agents require outbound access.`);
    }
  }

  async startOperatorMonitor() {
    console.log('🚀 Starting Operator Monitor...');

    return new Promise((resolve, reject) => {
      let resolved = false;
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
        if (msg?.type === 'ready' && !resolved) {
          resolved = true;
          console.log('✅ Operator Monitor ready\n');
          resolve();
        }
      });

      // Give it time to start if no IPC message arrives
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log('✅ Operator Monitor started\n');
          resolve();
        }
      }, 3000);
    });
  }

  async runOrchestrator() {
    console.log('🎯 Starting Test Orchestrator...\n');

    const reportFallback = this.watchReportFile({
      reportPath: this.getDefaultReportPath(),
      startTime: Date.now(),
    });

    const completionPromise = new Promise((resolve, reject) => {
      let resolved = false;
      this.orchestratorProcess = fork(
        path.join(__dirname, 'orchestrator.mjs'),
        [],
        {
          cwd: WORKSPACE_ROOT,
          silent: false,
          env: process.env
        }
      );

      const resolveOnce = (source) => {
        if (!resolved) {
          resolved = true;
          resolve({ source });
        }
      };

      this.orchestratorProcess.on('message', (msg) => {
        if (msg?.type === 'suite-complete') {
          this.lastReportSummary = msg.summary ?? null;
          this.lastReportPath = msg.reportPath ?? this.getDefaultReportPath();
          resolveOnce('orchestrator');
        } else if (msg?.type === 'suite-error') {
          if (!resolved) {
            resolved = true;
            reject(new Error(msg.error || 'Orchestrator reported failure'));
          }
        }
      });

      this.orchestratorProcess.on('exit', (code) => {
        if (resolved) {
          return;
        }
        if (code === 0) {
          resolved = true;
          resolve({ source: 'orchestrator-exit' });
        } else {
          resolved = true;
          reject(new Error(`Orchestrator exited with code ${code}`));
        }
      });

      this.orchestratorProcess.on('error', reject);
    });

    try {
      const result = await Promise.race([completionPromise, reportFallback.promise]);
      reportFallback.cancel();
      if (result?.source === 'report-fallback' && this.orchestratorProcess) {
        console.warn('⚠️  Report file detected but orchestrator promise never resolved. Forcing cleanup.');
        this.orchestratorProcess.kill('SIGTERM');
      }
    } catch (error) {
      reportFallback.cancel();
      throw error;
    }
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
      const reportPath = this.lastReportPath ?? '/tmp/e2e_test_state/e2e_test_report.json';
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

    const autopilotOnly = process.env.E2E_AUTOPILOT_ONLY === '1';
    const forcedProvider = process.env.FORCE_PROVIDER?.trim();
    if (autopilotOnly) {
      console.log('🔒 Autopilot-only guard enabled: exported logs will be locked read-only, and tampering will abort the run.\n');
    }
    if (forcedProvider) {
      console.log(`🧠 FORCE_PROVIDER=${forcedProvider} (Wave 0 will refuse to fall back)\n`);
    }

    let exitCode = 0;
    try {
      // Validate environment
      await this.validateEnvironment();
      await this.verifyInternetConnectivity();

      // Build MCP server
      await this.ensureBuild();

      // Start operator monitor
      await this.startOperatorMonitor();

      // Run test orchestrator
      await this.runOrchestrator();

      // Generate final report
      await this.generateFinalReport();

      console.log('✨ E2E Test Suite Complete!\n');
    } catch (error) {
      console.error('\n❌ E2E Test Suite Failed:', error.message);
      exitCode = 1;

    } finally {
      await this.cleanup();
      process.exit(exitCode);
    }
  }

  getDefaultReportPath() {
    return this.lastReportPath ?? path.join('/tmp/e2e_test_state', 'e2e_test_report.json');
  }

  async hydrateReportMetadata(reportPath) {
    try {
      const contents = await fs.readFile(reportPath, 'utf-8');
      const payload = JSON.parse(contents);
      this.lastReportSummary = payload.summary ?? this.lastReportSummary;
      this.lastReportPath = reportPath;
    } catch {
      // ignore parse errors / missing file
    }
  }

  watchReportFile({ reportPath, startTime, timeoutMs = 20 * 60 * 1000 }) {
    let cancelled = false;
    let timer = null;
    let timeoutTimer = null;

    const promise = new Promise((resolve, reject) => {
      const checkFile = async () => {
        if (cancelled) {
          return;
        }
        try {
          const stats = await fs.stat(reportPath);
          if (stats.mtimeMs >= startTime) {
            await this.hydrateReportMetadata(reportPath);
            clearInterval(timer);
            clearTimeout(timeoutTimer);
            resolve({ source: 'report-fallback' });
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn(`⚠️  Report watcher error: ${error.message}`);
          }
        }
      };

      timer = setInterval(checkFile, 3000);
      timeoutTimer = setTimeout(() => {
        clearInterval(timer);
        if (!cancelled) {
          reject(new Error('Report watcher timed out after 20 minutes.'));
        }
      }, timeoutMs);
    });

    return {
      promise,
      cancel: () => {
        cancelled = true;
        if (timer) clearInterval(timer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
      },
    };
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
