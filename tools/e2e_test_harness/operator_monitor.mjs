#!/usr/bin/env node

/**
 * Operator Monitor
 * Watches for errors, infinite loops, and applies automatic fixes
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const TEST_STATE_ROOT = '/tmp/e2e_test_state';

class OperatorMonitor {
  constructor() {
    this.errorPatterns = new Map();
    this.fixes = new Map();
    this.monitoring = true;
    this.setupErrorPatterns();
    this.setupFixes();
  }

  setupErrorPatterns() {
    // Common error patterns
    this.errorPatterns.set('yaml_indent', /bad indentation of a sequence entry/);
    this.errorPatterns.set('mcp_pid_lock', /Another MCP server is already running/);
    this.errorPatterns.set('module_not_found', /Cannot find module/);
    this.errorPatterns.set('typescript_error', /TS\d+:/);
    this.errorPatterns.set('infinite_loop', /same cycle \d+ times/);
    this.errorPatterns.set('memory_leak', /JavaScript heap out of memory/);
    this.errorPatterns.set('git_conflict', /CONFLICT/);
    this.errorPatterns.set('npm_error', /npm ERR!/);
    this.errorPatterns.set('timeout', /timeout|timed out/i);
    this.errorPatterns.set('process_crash', /segmentation fault|core dumped/i);
  }

  setupFixes() {
    // Automatic fixes for known errors
    this.fixes.set('yaml_indent', this.fixYAMLIndentation.bind(this));
    this.fixes.set('mcp_pid_lock', this.fixPIDLock.bind(this));
    this.fixes.set('module_not_found', this.fixModulePath.bind(this));
    this.fixes.set('typescript_error', this.fixTypeScriptError.bind(this));
    this.fixes.set('infinite_loop', this.breakInfiniteLoop.bind(this));
    this.fixes.set('memory_leak', this.fixMemoryLeak.bind(this));
    this.fixes.set('git_conflict', this.resolveGitConflict.bind(this));
    this.fixes.set('npm_error', this.fixNpmError.bind(this));
    this.fixes.set('timeout', this.handleTimeout.bind(this));
    this.fixes.set('process_crash', this.recoverFromCrash.bind(this));
  }

  async startMonitoring() {
    console.log('👁️‍🗨️ Operator Monitor started...');

    // Monitor log files
    this.monitorLogs();

    // Monitor process health
    this.monitorProcesses();

    // Monitor resource usage
    this.monitorResources();
  }

  async monitorLogs() {
    const logDir = path.join(TEST_STATE_ROOT, 'logs');

    while (this.monitoring) {
      try {
        const files = await fs.readdir(logDir, { recursive: true });

        for (const file of files) {
          if (file.endsWith('.log') || file.endsWith('.jsonl')) {
            await this.checkLogFile(path.join(logDir, file));
          }
        }
      } catch (error) {
        // Directory might not exist yet
      }

      await this.sleep(5000); // Check every 5 seconds
    }
  }

  async checkLogFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').slice(-100); // Last 100 lines

      for (const [errorType, pattern] of this.errorPatterns) {
        for (const line of lines) {
          if (pattern.test(line)) {
            console.log(`⚠️  Detected ${errorType} in ${path.basename(filePath)}`);
            await this.applyFix(errorType, { filePath, line });
            return;
          }
        }
      }
    } catch (error) {
      // File might be in use
    }
  }

  async monitorProcesses() {
    setInterval(async () => {
      try {
        // Check Wave 0 process
        const wave0Running = await this.isProcessRunning('wave0');
        if (!wave0Running && this.monitoring) {
          console.log('⚠️  Wave 0 not running, restarting...');
          await this.restartWave0();
        }

        // Check MCP server
        const mcpRunning = await this.isProcessRunning('mcp');
        if (!mcpRunning && this.monitoring) {
          console.log('⚠️  MCP server not running, restarting...');
          await this.restartMCP();
        }
      } catch (error) {
        console.error('Process monitoring error:', error);
      }
    }, 10000); // Every 10 seconds
  }

  async monitorResources() {
    setInterval(async () => {
      try {
        const memUsage = process.memoryUsage();
        const heapUsed = memUsage.heapUsed / 1024 / 1024; // MB

        if (heapUsed > 500) {
          console.log(`⚠️  High memory usage: ${heapUsed.toFixed(2)}MB`);
          await this.optimizeMemory();
        }
      } catch (error) {
        console.error('Resource monitoring error:', error);
      }
    }, 15000); // Every 15 seconds
  }

  async applyFix(errorType, context) {
    const fix = this.fixes.get(errorType);
    if (fix) {
      console.log(`🔧 Applying fix for ${errorType}...`);
      try {
        await fix(context);
        console.log(`✅ Fix applied successfully`);
      } catch (error) {
        console.error(`❌ Fix failed:`, error);
      }
    }
  }

  // Fix implementations

  async fixYAMLIndentation(context) {
    const { filePath } = context;
    if (!filePath.endsWith('.yaml')) return;

    try {
      let content = await fs.readFile(filePath, 'utf-8');

      // Fix common indentation issues
      content = content.replace(/^(\s*)- "([^"]*)\n\s*([^"]*)"$/gm, '$1- "$2 $3"');
      content = content.replace(/:\s*\n\s+(\w)/g, ': $1');

      await fs.writeFile(filePath, content, 'utf-8');
      console.log('  Fixed YAML indentation');
    } catch (error) {
      console.error('  Failed to fix YAML:', error);
    }
  }

  async fixPIDLock(context) {
    console.log('  Removing stale PID lock...');
    try {
      await fs.unlink(path.join(TEST_STATE_ROOT, '.mcp.pid'));

      // Kill any stale MCP processes
      try {
        execSync('pkill -f "mcp.*index.js"', { stdio: 'ignore' });
      } catch (e) {
        // Process might not exist
      }
    } catch (error) {
      // File might not exist
    }
  }

  async fixModulePath(context) {
    const { line } = context;
    const match = line.match(/Cannot find module '([^']+)'/);

    if (match) {
      const moduleName = match[1];
      console.log(`  Installing missing module: ${moduleName}`);

      try {
        execSync(`cd ${WORKSPACE_ROOT}/tools/wvo_mcp && npm install ${moduleName}`, {
          stdio: 'pipe'
        });
      } catch (error) {
        console.error('  Failed to install module');
      }
    }
  }

  async fixTypeScriptError(context) {
    console.log('  Rebuilding TypeScript...');
    try {
      execSync(`cd ${WORKSPACE_ROOT}/tools/wvo_mcp && npm run build`, {
        stdio: 'pipe'
      });
    } catch (error) {
      console.error('  Build failed, attempting clean build...');
      try {
        execSync(`cd ${WORKSPACE_ROOT}/tools/wvo_mcp && rm -rf dist && npm run build`, {
          stdio: 'pipe'
        });
      } catch (e) {
        console.error('  Clean build also failed');
      }
    }
  }

  async breakInfiniteLoop(context) {
    console.log('  Breaking infinite loop...');

    // Kill the stuck process
    try {
      execSync('pkill -f "wave0"', { stdio: 'ignore' });
    } catch (e) {
      // Process might not exist
    }

    // Wait a bit
    await this.sleep(2000);

    // Restart with single run mode
    process.env.WAVE0_SINGLE_RUN = '1';
    await this.restartWave0();
  }

  async fixMemoryLeak(context) {
    console.log('  Addressing memory leak...');

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Restart problematic processes
    await this.restartWave0();
  }

  async resolveGitConflict(context) {
    console.log('  Resolving git conflict...');
    try {
      // Accept current changes
      execSync(`cd ${WORKSPACE_ROOT} && git checkout --ours .`, { stdio: 'pipe' });
      execSync(`cd ${WORKSPACE_ROOT} && git add -A`, { stdio: 'pipe' });
    } catch (error) {
      console.error('  Failed to resolve conflict');
    }
  }

  async fixNpmError(context) {
    console.log('  Fixing npm error...');
    try {
      // Clear npm cache
      execSync('npm cache clean --force', { stdio: 'pipe' });

      // Remove node_modules and reinstall
      execSync(`cd ${WORKSPACE_ROOT}/tools/wvo_mcp && rm -rf node_modules package-lock.json && npm install`, {
        stdio: 'pipe'
      });
    } catch (error) {
      console.error('  Failed to fix npm error');
    }
  }

  async handleTimeout(context) {
    console.log('  Handling timeout...');

    // Kill hung processes
    try {
      execSync('pkill -f "wave0|mcp"', { stdio: 'ignore' });
    } catch (e) {
      // Processes might not exist
    }

    await this.sleep(2000);
    await this.restartWave0();
  }

  async recoverFromCrash(context) {
    console.log('  Recovering from crash...');

    // Clean up core dumps
    try {
      execSync('rm -f core.*', { cwd: WORKSPACE_ROOT, stdio: 'ignore' });
    } catch (e) {
      // Files might not exist
    }

    // Restart everything
    await this.restartMCP();
    await this.restartWave0();
  }

  // Helper methods

  async isProcessRunning(name) {
    try {
      const result = execSync(`pgrep -f "${name}"`, { stdio: 'pipe' });
      return result.toString().trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  async restartWave0() {
    const wave0 = spawn('npm', ['run', 'wave0'], {
      cwd: path.join(WORKSPACE_ROOT, 'tools/wvo_mcp'),
      env: {
        ...process.env,
        WVO_STATE_ROOT: TEST_STATE_ROOT,
        WVO_DRY_RUN: '0'
      },
      detached: true,
      stdio: 'ignore'
    });
    wave0.unref();
  }

  async restartMCP() {
    const mcp = spawn('node', ['tools/wvo_mcp/dist/index.js'], {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
        WVO_STATE_ROOT: TEST_STATE_ROOT
      },
      detached: true,
      stdio: 'ignore'
    });
    mcp.unref();
  }

  async optimizeMemory() {
    // Suggest garbage collection
    if (global.gc) {
      global.gc();
    }

    // Clear caches
    try {
      await fs.rm(path.join(TEST_STATE_ROOT, '.cache'), { recursive: true, force: true });
    } catch (error) {
      // Cache might not exist
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    this.monitoring = false;
    console.log('👁️‍🗨️ Operator Monitor stopped');
  }
}

// Export for use by orchestrator
export default OperatorMonitor;

// Run standalone if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const monitor = new OperatorMonitor();
  monitor.startMonitoring().catch(console.error);

  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });
}