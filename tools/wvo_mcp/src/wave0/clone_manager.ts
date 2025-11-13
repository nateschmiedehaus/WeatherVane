/**
 * Clone Manager for Wave 0.1
 *
 * Enables Wave 0 to test improvements on itself safely.
 * This is critical for self-improvement:
 * - Creates isolated test instances
 * - Manages PIDs and ports
 * - Ensures no resource leaks
 * - Validates changes before production
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as net from 'net';
import { logInfo, logError, logWarning } from '../telemetry/logger.js';

export interface CloneInfo {
  id: string;
  pid: number;
  dir: string;
  port: number;
  process: ChildProcess;
  created: Date;
  status: 'initializing' | 'ready' | 'testing' | 'terminated';
}

export interface CloneTestResult {
  success: boolean;
  tasksCompleted: number;
  errors: string[];
  resourceUsage: {
    memory: number;
    cpu: number;
  };
}

export class CloneManager {
  private activeClones: Map<string, CloneInfo> = new Map();
  private portRangeStart = 9000;
  private portRangeEnd = 9999;
  private maxClones = 3;
  private cloneTimeout = 300000; // 5 minutes max per clone

  /**
   * Create a clone of Wave 0 for testing
   */
  async createClone(purpose: string): Promise<CloneInfo> {
    if (this.activeClones.size >= this.maxClones) {
      throw new Error(`Maximum clones (${this.maxClones}) already active`);
    }

    const cloneId = `clone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    logInfo(`CloneManager: Creating clone ${cloneId} for ${purpose}`);

    try {
      // Create isolated directory
      const cloneDir = await this.createCloneDirectory(cloneId);

      // Copy Wave 0 code
      await this.copyWave0Code(cloneDir);

      // Find available port
      const port = await this.findAvailablePort();

      // Create isolated state directory
      const stateDir = path.join(cloneDir, 'state');
      await fs.mkdir(stateDir, { recursive: true });

      // Start cloned Wave 0 instance
      const cloneProcess = await this.startClone(cloneId, cloneDir, port, stateDir);

      const cloneInfo: CloneInfo = {
        id: cloneId,
        pid: cloneProcess.pid!,
        dir: cloneDir,
        port,
        process: cloneProcess,
        created: new Date(),
        status: 'initializing'
      };

      this.activeClones.set(cloneId, cloneInfo);

      // Set timeout for cleanup
      setTimeout(() => {
        if (this.activeClones.has(cloneId)) {
          logWarning(`Clone ${cloneId} timeout - terminating`);
          this.terminateClone(cloneId);
        }
      }, this.cloneTimeout);

      // Wait for clone to be ready
      await this.waitForCloneReady(cloneInfo);
      cloneInfo.status = 'ready';

      logInfo(`CloneManager: Clone ${cloneId} ready`, {
        pid: cloneInfo.pid,
        port: cloneInfo.port,
        dir: cloneInfo.dir
      });

      return cloneInfo;

    } catch (error) {
      logError(`Failed to create clone ${cloneId}`, { error });
      // Cleanup on failure
      if (this.activeClones.has(cloneId)) {
        await this.terminateClone(cloneId);
      }
      throw error;
    }
  }

  /**
   * Create isolated directory for clone
   */
  private async createCloneDirectory(cloneId: string): Promise<string> {
    const tmpBase = process.env.TMPDIR || '/tmp';
    const cloneDir = path.join(tmpBase, `wave0-${cloneId}`);

    // Ensure directory doesn't exist
    try {
      await fs.rmdir(cloneDir, { recursive: true });
    } catch {
      // Directory doesn't exist, which is fine
    }

    await fs.mkdir(cloneDir, { recursive: true });
    return cloneDir;
  }

  /**
   * Copy Wave 0 code to clone directory
   */
  private async copyWave0Code(cloneDir: string): Promise<void> {
    // We're already in the tools/wvo_mcp directory
    const sourceDir = path.resolve(process.cwd());

    // Copy only necessary files (not node_modules, state, etc.)
    const filesToCopy = [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'src',
      'scripts',
      'dist'
    ];

    for (const file of filesToCopy) {
      const src = path.join(sourceDir, file);
      const dest = path.join(cloneDir, file);

      try {
        const stats = await fs.stat(src);
        if (stats.isDirectory()) {
          await this.copyDirectory(src, dest);
        } else {
          await fs.copyFile(src, dest);
        }
      } catch (error) {
        logWarning(`Skipping ${file}: ${error}`);
      }
    }
  }

  /**
   * Recursively copy directory
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and other large directories
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Find an available port for the clone
   */
  private async findAvailablePort(): Promise<number> {
    for (let port = this.portRangeStart; port <= this.portRangeEnd; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error('No available ports in range');
  }

  /**
   * Check if port is available
   */
  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', () => {
        resolve(false);
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port);
    });
  }

  /**
   * Start cloned Wave 0 instance
   */
  private async startClone(
    cloneId: string,
    cloneDir: string,
    port: number,
    stateDir: string
  ): Promise<ChildProcess> {
    const env = {
      ...process.env,
      WAVE0_CLONE_ID: cloneId,
      WAVE0_PORT: port.toString(),
      WAVE0_STATE: stateDir,
      WAVE0_MODE: 'test',
      MCP_PORT: (port + 1000).toString(), // MCP server on different port
      NODE_ENV: 'test'
    };

    // Start the clone - for now just run a simple process that stays alive
    // In production, this would run the actual Wave 0 executor
    const cloneProcess = spawn('node', ['-e', `
      console.log('Clone ${cloneId} started on port ${port}');
      // Keep process alive for testing
      setInterval(() => {
        process.stdout.write('.');
      }, 10000);
    `], {
      cwd: cloneDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false // Don't detach - we want to control it
    });

    // Log clone output
    cloneProcess.stdout?.on('data', (data) => {
      logInfo(`Clone ${cloneId}: ${data.toString().trim()}`);
    });

    cloneProcess.stderr?.on('data', (data) => {
      logWarning(`Clone ${cloneId} error: ${data.toString().trim()}`);
    });

    cloneProcess.on('exit', (code) => {
      logInfo(`Clone ${cloneId} exited with code ${code}`);
      this.activeClones.delete(cloneId);
    });

    return cloneProcess;
  }

  /**
   * Wait for clone to be ready
   */
  private async waitForCloneReady(clone: CloneInfo): Promise<void> {
    // For our simple test clone, just wait a bit and check if process is still running
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if process is still running
    if (clone.process.exitCode !== null) {
      throw new Error(`Clone ${clone.id} exited unexpectedly`);
    }

    // For test purposes, we consider it ready if it's still running after a short delay
    // In production, this would check actual readiness signals
    return;
  }

  /**
   * Check if we can connect to clone
   */
  private canConnectToClone(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(1000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, 'localhost');
    });
  }

  /**
   * Test modifications on a clone
   */
  async testOnClone(
    cloneId: string,
    modifications: { path: string; content: string }[]
  ): Promise<CloneTestResult> {
    const clone = this.activeClones.get(cloneId);
    if (!clone) {
      throw new Error(`Clone ${cloneId} not found`);
    }

    clone.status = 'testing';
    logInfo(`CloneManager: Testing modifications on ${cloneId}`);

    const result: CloneTestResult = {
      success: true,
      tasksCompleted: 0,
      errors: [],
      resourceUsage: { memory: 0, cpu: 0 }
    };

    try {
      // Apply modifications to clone
      for (const mod of modifications) {
        const filePath = path.join(clone.dir, mod.path);
        await fs.writeFile(filePath, mod.content, 'utf-8');
      }

      // Rebuild clone
      const buildResult = await this.executeOnClone(clone, 'npm run build');
      if (buildResult.exitCode !== 0) {
        result.errors.push(`Build failed: ${buildResult.stderr}`);
        result.success = false;
        return result;
      }

      // Run tests
      const testResult = await this.executeOnClone(clone, 'npm test');
      if (testResult.exitCode !== 0) {
        result.errors.push(`Tests failed: ${testResult.stderr}`);
        result.success = false;
      }

      // Test task execution
      // TODO: Actually give clone a task and verify it completes

      // Measure resource usage
      result.resourceUsage = await this.measureResourceUsage(clone);

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Execute command on clone
   */
  private executeOnClone(
    clone: CloneInfo,
    command: string
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', command], {
        cwd: clone.dir,
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('exit', (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr
        });
      });
    });
  }

  /**
   * Measure resource usage of clone
   */
  private async measureResourceUsage(clone: CloneInfo): Promise<{ memory: number; cpu: number }> {
    try {
      const result = await this.executeOnClone(
        clone,
        `ps -o pid,rss,pcpu -p ${clone.pid} | tail -n 1`
      );

      const parts = result.stdout.trim().split(/\s+/);
      return {
        memory: parseInt(parts[1] || '0') * 1024, // RSS in bytes
        cpu: parseFloat(parts[2] || '0')
      };
    } catch {
      return { memory: 0, cpu: 0 };
    }
  }

  /**
   * Validate clone is properly isolated
   */
  async validateIsolation(cloneId: string): Promise<boolean> {
    const clone = this.activeClones.get(cloneId);
    if (!clone) return false;

    try {
      // Check no shared file handles
      const lsofResult = await this.executeOnClone(
        clone,
        `lsof -p ${clone.pid} 2>/dev/null | grep -v ${clone.dir} | grep -E "/(home|Users)" | wc -l`
      );

      const sharedFiles = parseInt(lsofResult.stdout.trim());
      if (sharedFiles > 0) {
        logWarning(`Clone ${cloneId} has ${sharedFiles} shared file handles`);
        return false;
      }

      // Check network isolation (should only have its own port)
      const netResult = await this.executeOnClone(
        clone,
        `lsof -p ${clone.pid} -i 2>/dev/null | grep LISTEN | wc -l`
      );

      const listeners = parseInt(netResult.stdout.trim());
      if (listeners > 2) { // Should only have Wave 0 port and MCP port
        logWarning(`Clone ${cloneId} has ${listeners} network listeners`);
        return false;
      }

      return true;
    } catch (error) {
      logError(`Isolation validation failed for ${cloneId}`, { error });
      return false;
    }
  }

  /**
   * Terminate a clone
   */
  async terminateClone(cloneId: string): Promise<void> {
    const clone = this.activeClones.get(cloneId);
    if (!clone) return;

    logInfo(`CloneManager: Terminating clone ${cloneId}`);

    try {
      // Graceful shutdown
      clone.process.kill('SIGTERM');

      // Wait briefly for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Force kill if still running
      if (clone.process.exitCode === null) {
        clone.process.kill('SIGKILL');
      }

      // Cleanup directory
      await fs.rmdir(clone.dir, { recursive: true });

    } catch (error) {
      logError(`Failed to terminate clone ${cloneId}`, { error });
    } finally {
      this.activeClones.delete(cloneId);
      clone.status = 'terminated';
    }
  }

  /**
   * Terminate all clones
   */
  async terminateAll(): Promise<void> {
    const cloneIds = Array.from(this.activeClones.keys());

    await Promise.all(
      cloneIds.map(id => this.terminateClone(id))
    );
  }

  /**
   * Get status of all clones
   */
  getStatus(): any {
    const status: any = {
      activeClones: this.activeClones.size,
      maxClones: this.maxClones,
      clones: []
    };

    for (const [id, clone] of this.activeClones) {
      status.clones.push({
        id,
        pid: clone.pid,
        port: clone.port,
        status: clone.status,
        uptime: Date.now() - clone.created.getTime()
      });
    }

    return status;
  }

  /**
   * Cleanup on exit
   */
  async cleanup(): Promise<void> {
    logInfo('CloneManager: Cleaning up all clones');
    await this.terminateAll();
  }
}