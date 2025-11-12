#!/usr/bin/env node

/**
 * E2E Test Orchestrator
 * Manages isolated test environments and coordinates test execution
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const TEST_STATE_ROOT = '/tmp/e2e_test_state';
const TEST_LOG_FILE = path.join(TEST_STATE_ROOT, 'e2e_test.log');
const MAX_RETRIES = 3;
const CYCLE_TIMEOUT = 60000; // 1 minute per cycle

class E2ETestOrchestrator {
  constructor() {
    this.processes = new Map();
    this.testResults = [];
    this.currentTest = null;
  }

  async initialize() {
    console.log('🚀 Initializing E2E Test Environment...');

    // Clean up any existing test state
    await this.cleanup();

    // Create fresh test directory structure
    await fs.mkdir(TEST_STATE_ROOT, { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'logs'), { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'evidence'), { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'analytics'), { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'critics'), { recursive: true });
    await fs.mkdir(path.join(TEST_STATE_ROOT, 'kb'), { recursive: true });

    // Create the roadmap.yaml file here to ensure it exists
    await fs.writeFile(path.join(TEST_STATE_ROOT, 'roadmap.yaml'), 'tasks: []\n', 'utf-8');

    // Initialize git branch for tests
    await this.initializeGitBranch();

    console.log('✅ Test environment initialized');
  }

  async cleanup() {
    console.log('🧹 Cleaning up test environment...');

    // Kill any running processes
    for (const [name, proc] of this.processes) {
      console.log(`  Killing process: ${name}`);
      proc.kill('SIGTERM');
    }
    this.processes.clear();

    // Remove test state directory
    try {
      await fs.rm(TEST_STATE_ROOT, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }

    // Remove any stale PID locks
    try {
      await fs.unlink(path.join(TEST_STATE_ROOT, '.mcp.pid'));
    } catch (error) {
      // File might not exist
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
      tasks: [
        {
          id: 'E2E-GOL-T1',
          title: 'Game of Life: Basic Glider Pattern',
          status: 'pending',
          epic: 'E2E-TEST',
          priority: 'high',
          description: 'Implement basic glider pattern simulation',
          acceptance: [
            'Glider pattern initialized successfully',
            'One generation computed correctly',
            'Output saved to state/logs/E2E-GOL-T1/output.txt'
          ],
          dependencies: []
        },
        {
          id: 'E2E-GOL-T2',
          title: 'Game of Life: Multi-Generation Evolution',
          status: 'pending',
          epic: 'E2E-TEST',
          priority: 'high',
          description: 'Evolve pattern for multiple generations',
          acceptance: [
            'Pattern loaded from T1 output',
            '10 generations computed',
            'State transitions verified',
            'Results saved to state/logs/E2E-GOL-T2/output.txt'
          ],
          dependencies: ['E2E-GOL-T1']
        },
        {
          id: 'E2E-GOL-T3',
          title: 'Game of Life: Pattern Analysis',
          status: 'pending',
          epic: 'E2E-TEST',
          priority: 'high',
          description: 'Analyze pattern evolution and detect cycles',
          acceptance: [
            'Pattern history from T2 loaded',
            'Cycle detection implemented',
            'Statistics calculated',
            'Final report saved to state/logs/E2E-GOL-T3/report.txt'
          ],
          dependencies: ['E2E-GOL-T2']
        }
      ]
    };

    const roadmapPath = path.join(TEST_STATE_ROOT, 'roadmap.yaml');
    const yaml = this.objectToYAML(roadmap);
    await fs.writeFile(roadmapPath, yaml, 'utf-8');

    console.log('✅ Roadmap created with GOL task chain');
  }

  objectToYAML(obj, indent = 0) {
    let yaml = '';
    const spaces = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}  - `;
            const itemYaml = this.objectToYAML(item, indent + 2);
            yaml += itemYaml.trim().replace(/\n/g, '\n' + spaces + '    ') + '\n';
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        }
      } else if (typeof value === 'object') {
        yaml += `${spaces}${key}:\n`;
        yaml += this.objectToYAML(value, indent + 1);
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }

    return yaml;
  }

  async startWave0() {
    console.log('🌊 Starting Wave 0 with isolated state...');

    return new Promise((resolve, reject) => {
      const wave0 = spawn('npm', ['run', 'wave0'], {
        cwd: path.join(WORKSPACE_ROOT, 'tools/wvo_mcp'),
        env: {
          ...process.env,
          WVO_STATE_ROOT: TEST_STATE_ROOT,
          WVO_DRY_RUN: '0',
          WVO_DISABLE_SEMANTIC_ENFORCER: '1',
          WAVE0_SINGLE_RUN: '0'
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

      if (status === 'completed') {
        console.log(`✅ Task ${taskId} completed successfully`);
        return { success: true, taskId };
      }

      if (status === 'failed') {
        console.log(`❌ Task ${taskId} failed`);
        return { success: false, taskId, reason: 'Task failed' };
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

  async runTestSuite() {
    console.log('\n🎯 Starting E2E Test Suite...\n');

    const tasks = ['E2E-GOL-T1', 'E2E-GOL-T2', 'E2E-GOL-T3'];
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

    console.log('Test Summary:');
    console.log(`  Total: ${report.summary.total}`);
    console.log(`  Passed: ${report.summary.passed}`);
    console.log(`  Failed: ${report.summary.failed}`);
    console.log(`  Success Rate: ${(report.summary.passed / report.summary.total * 100).toFixed(1)}%`);

    return report;
  }

  async commitResults(report) {
    console.log('\n📤 Committing test results to GitHub...');

    try {
      const message = `test(e2e): automated test run - ${report.summary.passed}/${report.summary.total} passed`;

      execSync(`git add -A`, { cwd: WORKSPACE_ROOT });
      execSync(`git commit -m "${message}"`, { cwd: WORKSPACE_ROOT });
      execSync(`git push origin test/e2e-harness`, { cwd: WORKSPACE_ROOT });

      console.log('✅ Results committed and pushed to GitHub');
    } catch (error) {
      console.warn('⚠️  Failed to commit results:', error.message);
    }
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

      await this.commitResults(report);

      console.log('\n✨ E2E Test Suite Complete!\n');

    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the orchestrator
const orchestrator = new E2ETestOrchestrator();
orchestrator.run().catch(console.error);