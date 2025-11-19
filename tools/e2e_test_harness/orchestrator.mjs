#!/usr/bin/env node

/**
 * E2E Test Orchestrator
 * Manages isolated test environments and coordinates test execution
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const TEST_STATE_ROOT = '/tmp/e2e_test_state';
const TEST_LOG_FILE = path.join(TEST_STATE_ROOT, 'e2e_test.log');
const MAX_RETRIES = 3;
const CYCLE_TIMEOUT = 60000; // 1 minute per cycle
const LOGS_ROOT = path.join(WORKSPACE_ROOT, 'state', 'logs');

class E2ETestOrchestrator {
  constructor() {
    this.processes = new Map();
    this.testResults = [];
    this.currentTest = null;
    this.runId = new Date().toISOString();
    this.autopilotOnly = process.env.E2E_AUTOPILOT_ONLY === '1';
    this.autopilotLockPath = null;
    this.logTag = process.env.E2E_LOG_EXPORT_TAG?.trim() || null;
    this.forcedProvider = process.env.FORCE_PROVIDER?.trim()?.toLowerCase() || null;
    if (this.forcedProvider && !['claude', 'codex'].includes(this.forcedProvider)) {
      throw new Error(`Unsupported FORCE_PROVIDER value: ${this.forcedProvider}`);
    }
  }

  notifyParent(type, payload = {}) {
    if (typeof process.send === 'function') {
      process.send({ type, ...payload });
    }
  }

  async initialize() {
    console.log('🚀 Initializing E2E Test Environment...');

    // Clean up any existing test state
    await this.cleanup();
    await this.ensureAutopilotLock();

    // Create fresh test directory structure
    await fs.mkdir(TEST_STATE_ROOT, { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'logs'), { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'evidence'), { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'analytics'), { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'critics'), { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'kb'), { recursive: true });

    // Create the roadmap.yaml file here to ensure it exists
    const emptyRoadmap = {
      epics: []
    };
    await fs.writeFile(path.join(TEST_STATE_ROOT, 'roadmap.yaml'), YAML.stringify(emptyRoadmap), 'utf-8');

    // Note: orchestrator.db is no longer created here - LiveFlags handles missing database gracefully

    // Initialize git branch for tests
    await this.initializeGitBranch();

    console.log('✅ Test environment initialized');
  }

  async cleanup(options = {}) {
    const preserveState = options.preserveState === true;
    console.log(`🧹 Cleaning up test environment...${preserveState ? ' (state preserved)' : ''}`);

    // Kill any running processes
    for (const [name, proc] of this.processes) {
      console.log(`  Killing process: ${name}`);
      proc.kill('SIGTERM');
    }
    this.processes.clear();

    // Remove test state directory
    if (!preserveState) {
      try {
        await fs.rm(TEST_STATE_ROOT, { recursive: true, force: true });
      } catch (error) {
        // Directory might not exist
      }
    } else {
      console.log('  Skipping /tmp/e2e_test_state removal');
    }

    // Remove any stale PID locks
    try {
      await fs.unlink(path.join(TEST_STATE_ROOT, '.mcp.pid'));
    } catch (error) {
      // File might not exist
    }

    if (options.releaseLock) {
      await this.releaseAutopilotLock();
    }
  }

  async ensureAutopilotLock() {
    if (!this.autopilotOnly) {
      return;
    }
    await fs.mkdir(LOGS_ROOT, { recursive: true });
    const lockPath = path.join(LOGS_ROOT, '.autopilot_lock');
    if (await pathExists(lockPath)) {
      const existing = await fs.readFile(lockPath, 'utf-8').catch(() => 'unknown');
      throw new Error(
        `Autopilot lock already present at ${lockPath}. Another run may be active or manual edits were detected.\n${existing}`,
      );
    }
    const payload = {
      runId: this.runId,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    await fs.writeFile(lockPath, JSON.stringify(payload, null, 2), 'utf-8');
    this.autopilotLockPath = lockPath;
  }

  async releaseAutopilotLock() {
    if (this.autopilotLockPath) {
      await fs.rm(this.autopilotLockPath, { force: true }).catch(() => {});
      this.autopilotLockPath = null;
    }
  }

  async initializeGitBranch() {
    console.log('🌿 Initializing test git branch...');

    try {
      // Create or switch to test branch
      execSync('git checkout -B test/e2e-harness', {
        cwd: WORKSPACE_ROOT,
        stdio: 'pipe'
      });

      console.log('✅ Git branch ready: test/e2e-harness');
    } catch (error) {
      console.warn('⚠️  Git branch creation failed, continuing without branch isolation');
    }
  }

  async createGOLRoadmap() {
    console.log('📝 Creating GOL task roadmap...');

    const roadmap = {
      epics: [
        {
          id: 'E2E-GOL',
          title: 'E2E Game of Life Chain',
          status: 'in_progress',
          domain: 'e2e',
          milestones: [
            {
              id: 'E2E-GOL-M1',
              title: 'Sequential Wave 0 Validation',
              status: 'in_progress',
              tasks: [
                {
                  id: 'E2E-GOL-T1',
                  title: 'Game of Life: Basic Glider Pattern',
                  status: 'pending',
                  priority: 'high',
                  set_id: 'wave0-gol',
                  description: 'Implement basic glider pattern simulation',
                  dependencies: [],
                  acceptance: [
                    'Glider pattern initialized successfully',
                    'One generation computed correctly',
                    'Output saved to state/logs/E2E-GOL-T1/output.txt'
                  ]
                },
                {
                  id: 'E2E-GOL-T2',
                  title: 'Game of Life: Multi-Generation Evolution',
                  status: 'pending',
                  priority: 'high',
                  set_id: 'wave0-gol',
                  description: 'Evolve pattern for multiple generations',
                  dependencies: ['E2E-GOL-T1'],
                  acceptance: [
                    'Pattern loaded from T1 output',
                    '10 generations computed',
                    'State transitions verified',
                    'Results saved to state/logs/E2E-GOL-T2/output.txt'
                  ]
                },
                {
                  id: 'E2E-GOL-T3',
                  title: 'Game of Life: Pattern Analysis',
                  status: 'pending',
                  priority: 'high',
                  set_id: 'wave0-gol',
                  description: 'Analyze pattern evolution and detect cycles',
                  dependencies: ['E2E-GOL-T2'],
                  acceptance: [
                    'Pattern history from T2 loaded',
                    'Cycle detection implemented',
                    'Statistics calculated',
                    'Final report saved to state/logs/E2E-GOL-T3/report.txt'
                  ]
                },
                {
                  id: 'E2E-GOL-T4',
                  title: 'Game of Life: Oscillator Diagnostics',
                  status: 'pending',
                  priority: 'high',
                  set_id: 'wave0-gol',
                  description: 'Classify multiple seed patterns and measure translation vectors',
                  dependencies: ['E2E-GOL-T3'],
                  acceptance: [
                    'Blinker, Toad, Beacon, and Glider analyzed',
                    'Cycle periods and displacement recorded',
                    'Summary saved to state/logs/E2E-GOL-T4/oscillators.txt'
                  ]
                },
                {
                  id: 'E2E-GOL-T5',
                  title: 'Game of Life: Stability Forecasting',
                  status: 'pending',
                  priority: 'high',
                  set_id: 'wave0-gol',
                  description: 'Extend simulation timeline and compute stability metrics',
                  dependencies: ['E2E-GOL-T4'],
                  acceptance: [
                    'History extended with 20 forecasted generations',
                    'Peak/min/avg live cell counts computed',
                    'Trend + stability index written to state/logs/E2E-GOL-T5/forecast.txt'
                  ]
                },
                {
                  id: 'E2E-GOL-T6',
                  title: 'Game of Life: Interactive CLI Experience',
                  status: 'pending',
                  priority: 'high',
                  set_id: 'wave0-gol',
                  description: 'Ship a self-contained CLI Game of Life tool people can run locally',
                  dependencies: ['E2E-GOL-T5'],
                  acceptance: [
                    'CLI script saved alongside prior artefacts (state/logs/E2E-GOL-T6/cli_gol.js)',
                    'Instructions include usage examples (initial board, commands, quit)',
                    'Supports editing cells, stepping generations, running multiple steps, and loading preset patterns'
                  ]
                },
                {
                  id: 'E2E-GOL-T7',
                  title: 'Game of Life: Desktop Launcher',
                  status: 'pending',
                  priority: 'high',
                  set_id: 'wave0-gol',
                  description: 'Provide a shell command that starts a lightweight desktop app with a GOL grid rendered in a browser window (no terminal interaction).',
                  dependencies: ['E2E-GOL-T6'],
                  acceptance: [
                    'Launcher script saved (state/logs/E2E-GOL-T7/run_gol.sh) and marked executable.',
                    'HTML/JS assets emitted so the launcher opens a local browser window (no terminal UI).',
                    'Controls documented: mouse clicks toggle cells, buttons start/step/clear/load presets, with instructions in state/logs/E2E-GOL-T7/instructions.txt.'
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const roadmapPath = path.join(TEST_STATE_ROOT, 'roadmap.yaml');
    const yamlDoc = YAML.stringify(roadmap);
    await fs.writeFile(roadmapPath, yamlDoc, 'utf-8');

    console.log('✅ Roadmap created with GOL task chain');
  }

  async startWave0() {
    console.log('🌊 Starting Wave 0 with isolated state...');

    return new Promise((resolve, reject) => {
      const wave0 = spawn('npm', ['run', 'wave0'], {
        cwd: path.join(WORKSPACE_ROOT, 'tools/wvo_mcp'),
        env: {
          ...process.env,
          WVO_WORKSPACE_ROOT: WORKSPACE_ROOT,
          WVO_STATE_ROOT: TEST_STATE_ROOT,
          WVO_DRY_RUN: '0',
          WVO_DISABLE_SEMANTIC_ENFORCER: '1',
          WAVE0_RATE_LIMIT_MS: '1000',
          WAVE0_EMPTY_RETRY_LIMIT: '1',
          WAVE0_TARGET_EPICS: 'E2E-GOL',
          PROOF_SYSTEM_ENABLED: '0'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      wave0.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (text.includes('No pending tasks')) {
          console.log('  Wave 0 idle, checking for completed tasks...');
        }
      });

      wave0.stderr.on('data', (data) => {
        console.error(`Wave 0 error: ${data}`);
      });

      wave0.on('error', reject);

      wave0.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Wave 0 exited with code ${code}`));
        } else {
          resolve(output);
        }
      });

      this.processes.set('wave0', wave0);

      // Give it time to initialize
      setTimeout(() => resolve(output), 5000);
    });
  }

  async monitorExecution(taskId, timeout = CYCLE_TIMEOUT) {
    console.log(`👁️  Monitoring execution of ${taskId}...`);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check if task completed
      const status = await this.getTaskStatus(taskId);

      if (status === 'completed' || status === 'done') {
        console.log(`✅ Task ${taskId} completed successfully`);
        return { success: true, taskId };
      }

      if (status === 'failed' || status === 'blocked') {
        console.log(`❌ Task ${taskId} ${status}`);
        return { success: false, taskId, reason: status === 'blocked' ? 'Task blocked' : 'Task failed' };
      }

      // Check for infinite loops or hanging
      const isHanging = await this.detectHanging(taskId);
      if (isHanging) {
        console.log(`⚠️  Detected hanging in ${taskId}, attempting recovery...`);
        await this.recoverFromHang(taskId);
      }

      await this.sleep(5000); // Check every 5 seconds
    }

    console.log(`⏱️  Task ${taskId} timed out`);
    return { success: false, taskId, reason: 'Timeout' };
  }

  async getTaskStatus(taskId) {
    try {
      const roadmapPath = path.join(TEST_STATE_ROOT, 'roadmap.yaml');
      const content = await fs.readFile(roadmapPath, 'utf-8');

      // Simple regex to find task status
      const regex = new RegExp(`id:\\s*${taskId}[\\s\\S]*?status:\\s*(\\w+)`, 'm');
      const match = content.match(regex);

      return match ? match[1] : 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  async detectHanging(taskId) {
    // Check if log file hasn't been updated in 30 seconds
    try {
      const logPath = path.join(TEST_STATE_ROOT, 'logs', taskId, 'phase', 'implement.jsonl');
      const stats = await fs.stat(logPath);
      const age = Date.now() - stats.mtimeMs;
      return age > 30000; // 30 seconds
    } catch (error) {
      return false;
    }
  }

  async recoverFromHang(taskId) {
    console.log(`🔧 Attempting to recover ${taskId}...`);

    // Kill and restart Wave 0
    const wave0 = this.processes.get('wave0');
    if (wave0) {
      wave0.kill('SIGTERM');
      this.processes.delete('wave0');
    }

    // Mark task as pending again
    await this.updateTaskStatus(taskId, 'pending');

    // Restart Wave 0
    await this.sleep(2000);
    await this.startWave0();
  }

  async updateTaskStatus(taskId, status) {
    const roadmapPath = path.join(TEST_STATE_ROOT, 'roadmap.yaml');
    let content = await fs.readFile(roadmapPath, 'utf-8');

    const regex = new RegExp(`(id:\\s*${taskId}[\\s\\S]*?status:\\s*)\\w+`, 'm');
    content = content.replace(regex, `$1${status}`);

    await fs.writeFile(roadmapPath, content, 'utf-8');
  }

  async exportArtifacts(report) {
    const sourceDir = path.join(TEST_STATE_ROOT, 'logs');
    const tag = this.logTag;
    const destinationDir = tag
      ? path.join(WORKSPACE_ROOT, 'state', 'logs', tag)
      : path.join(WORKSPACE_ROOT, 'state', 'logs');
    try {
      await fs.mkdir(destinationDir, { recursive: true });
      const entries = await fs.readdir(sourceDir);
      const summaries = [];
      for (const entry of entries) {
        const src = path.join(sourceDir, entry);
        const dest = path.join(destinationDir, entry);
        await this.verifyExistingExport(dest);
        await fs.rm(dest, { recursive: true, force: true });
        await fs.cp(src, dest, { recursive: true });
        const summary = await computeDirectoryHash(dest);
        await this.writeTaskProvenance(dest, summary);
        if (this.autopilotOnly) {
          await chmodRecursive(dest);
        }
        summaries.push({
          taskId: entry,
          repoPath: dest.replace(`${WORKSPACE_ROOT}${path.sep}`, ''),
          files: summary.files,
          sha256: summary.sha256,
        });
      }
      await this.writeRunMeta(destinationDir, summaries, report);
      console.log(`📦 Artifacts exported to ${destinationDir}`);
    } catch (error) {
      console.warn('⚠️  Failed to export artifacts:', error.message);
    }
  }

  async verifyExistingExport(dest) {
    if (!this.autopilotOnly) {
      return;
    }
    const provenancePath = path.join(dest, 'autopilot_provenance.json');
    if (!(await pathExists(provenancePath))) {
      return;
    }
    try {
      const expected = JSON.parse(await fs.readFile(provenancePath, 'utf-8'));
      const actual = await computeDirectoryHash(dest);
      if (expected.sha256 && expected.sha256 !== actual.sha256) {
        throw new Error(
          `Detected manual edits in ${dest}. Remove the directory or disable E2E_AUTOPILOT_ONLY before re-running.`,
        );
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async writeTaskProvenance(dest, summary) {
    const payload = {
      runId: this.runId,
      provider: this.forcedProvider ?? 'auto',
      autopilotOnly: this.autopilotOnly,
      generatedAt: new Date().toISOString(),
      files: summary.files,
      sha256: summary.sha256,
    };
    const filePath = path.join(dest, 'autopilot_provenance.json');
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    if (this.autopilotOnly) {
      await fs.chmod(filePath, 0o444).catch(() => {});
    }
  }

  async writeRunMeta(destinationDir, summaries, report) {
    try {
      const payload = {
        runId: this.runId,
        startedAt: new Date(this.startTime).toISOString(),
        finishedAt: new Date().toISOString(),
        autopilotOnly: this.autopilotOnly,
        providerOverride: this.forcedProvider ?? null,
        logTag: this.logTag,
        tasks: summaries,
      };
      if (report?.summary) {
        payload.summary = report.summary;
      }
      const filePath = path.join(destinationDir, 'run_meta.json');
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      if (this.autopilotOnly) {
        await fs.chmod(filePath, 0o444).catch(() => {});
      }
    } catch (error) {
      console.warn('⚠️  Failed to write run_meta.json:', error.message);
    }
  }

  async runTestSuite() {
    console.log('\n🎯 Starting E2E Test Suite...\n');

    const tasks = ['E2E-GOL-T1', 'E2E-GOL-T2', 'E2E-GOL-T3', 'E2E-GOL-T4', 'E2E-GOL-T5', 'E2E-GOL-T6', 'E2E-GOL-T7'];
    const results = [];

    for (const taskId of tasks) {
      console.log(`\n📋 Executing ${taskId}...`);

      let retries = 0;
      let result = null;

      while (retries < MAX_RETRIES) {
        result = await this.monitorExecution(taskId);

        if (result.success) {
          break;
        }

        retries++;
        console.log(`  Retry ${retries}/${MAX_RETRIES}...`);
      }

      results.push(result);

      if (!result.success) {
        console.log(`❌ ${taskId} failed after ${MAX_RETRIES} retries`);
        break; // Stop chain if a task fails
      }
    }

    return results;
  }

  async generateReport(results) {
    console.log('\n📊 Generating Test Report...\n');

    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      results: results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };

    const reportPath = path.join(TEST_STATE_ROOT, 'e2e_test_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    await this.exportArtifacts(report);

    console.log('Test Summary:');
    console.log(`  Total: ${report.summary.total}`);
    console.log(`  Passed: ${report.summary.passed}`);
    console.log(`  Failed: ${report.summary.failed}`);
    console.log(`  Success Rate: ${(report.summary.passed / report.summary.total * 100).toFixed(1)}%`);

    return report;
  }

  async commitResults(report) {
    console.log('\n📤 Committing test results to GitHub...');
    console.log('⚠️  Commit skipped in harness mode (results recorded locally only).');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run() {
    this.startTime = Date.now();

    try {
      await this.initialize();
      await this.createGOLRoadmap();
      await this.startWave0();

      const results = await this.runTestSuite();
      const report = await this.generateReport(results);
      this.testResults = results;

      await this.commitResults(report);

      console.log('\n✨ E2E Test Suite Complete!\n');
      this.notifyParent('suite-complete', {
        reportPath: path.join(TEST_STATE_ROOT, 'e2e_test_report.json'),
        summary: report?.summary ?? null,
      });
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      this.notifyParent('suite-error', { error: error?.message ?? String(error) });
      throw error;
    } finally {
      await this.cleanup({
        preserveState: process.env.E2E_PRESERVE_STATE === '1',
        releaseLock: true,
      });
      this.notifyParent('suite-cleanup-complete', {
        preserved: process.env.E2E_PRESERVE_STATE === '1',
      });
      await this.releaseAutopilotLock();
    }
  }
}

// Run the orchestrator
const orchestrator = new E2ETestOrchestrator();
orchestrator.run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function computeDirectoryHash(target) {
  const hash = crypto.createHash('sha256');
  let files = 0;

  async function walk(current, relative = '.') {
    const stats = await fs.lstat(current);
    if (stats.isDirectory()) {
      const entries = await fs.readdir(current);
      for (const entry of entries) {
        await walk(path.join(current, entry), path.join(relative, entry));
      }
      return;
    }
    if (stats.isFile()) {
      files += 1;
      hash.update(`${relative}:${stats.size}:`);
      const data = await fs.readFile(current);
      hash.update(data);
    }
  }

  await walk(target);
  return { files, sha256: hash.digest('hex') };
}

async function chmodRecursive(target) {
  try {
    const stats = await fs.lstat(target);
    if (stats.isDirectory()) {
      await fs.chmod(target, 0o555).catch(() => {});
      const entries = await fs.readdir(target);
      for (const entry of entries) {
        await chmodRecursive(path.join(target, entry));
      }
    } else if (stats.isFile()) {
      await fs.chmod(target, 0o444).catch(() => {});
    }
  } catch {
    // ignore permission errors for locking
  }
}
