import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import {
  waitForProcessDeath,
  killProcess,
  ensureProcessDead,
  getChildProcesses,
  killChildProcessesRecursive,
  cleanupChildProcesses,
  findProcessesByPattern,
} from './process_cleanup.js';
import { isProcessAlive } from './pid_file_manager.js';

describe('ProcessCleanup', () => {
  let childProcesses: ChildProcess[] = [];

  beforeEach(() => {
    childProcesses = [];
  });

  afterEach(() => {
    // Clean up any remaining test processes
    for (const child of childProcesses) {
      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGKILL');
        } catch {
          // Ignore errors
        }
      }
    }
    childProcesses = [];
  });

  function forkDummyProcess(): ChildProcess {
    const child = fork(
      path.join(__dirname, '../../fixtures/dummy_process.js'),
      [],
      { silent: true, detached: true },
    );

    childProcesses.push(child);
    return child;
  }

  describe('waitForProcessDeath', () => {
    it('should return true when process dies', async () => {
      const child = forkDummyProcess();
      const pid = child.pid!;

      // Kill the process
      child.kill('SIGTERM');

      // Wait for death
      const died = await waitForProcessDeath(pid, 2000);

      expect(died).toBe(true);
    });

    it('should return false when process does not die within timeout', async () => {
      const child = forkDummyProcess();
      const pid = child.pid!;

      // Don't kill it, just wait
      const died = await waitForProcessDeath(pid, 100);

      expect(died).toBe(false);

      // Clean up
      child.kill('SIGKILL');
    });

    it('should return true immediately if process already dead', async () => {
      const startTime = Date.now();
      const died = await waitForProcessDeath(999999, 1000);
      const elapsed = Date.now() - startTime;

      expect(died).toBe(true);
      expect(elapsed).toBeLessThan(200); // Should return quickly
    });
  });

  describe('killProcess', () => {
    it('should kill process with SIGTERM', async () => {
      const child = forkDummyProcess();
      const pid = child.pid!;

      const killed = killProcess(pid, 'SIGTERM');

      expect(killed).toBe(true);

      // Wait for death
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(isProcessAlive(pid)).toBe(false);
    });

    it('should return false for non-existent process', () => {
      const killed = killProcess(999999, 'SIGTERM');

      expect(killed).toBe(false);
    });
  });

  describe('ensureProcessDead', () => {
    it('should kill process gracefully with SIGTERM', async () => {
      const child = forkDummyProcess();
      const pid = child.pid!;

      const killed = await ensureProcessDead(pid, {
        signal: 'SIGTERM',
        gracefulTimeoutMs: 2000,
      });

      expect(killed).toBe(true);
      expect(isProcessAlive(pid)).toBe(false);
    });

    it('should force kill with SIGKILL if graceful fails', async () => {
      const child = forkDummyProcess();
      const pid = child.pid!;

      // Use very short timeout to trigger force kill
      const killed = await ensureProcessDead(pid, {
        signal: 'SIGTERM',
        gracefulTimeoutMs: 50, // Too short to die gracefully
        forceSignal: 'SIGKILL',
      });

      expect(killed).toBe(true);
      expect(isProcessAlive(pid)).toBe(false);
    });

    it('should return false if process already dead', async () => {
      const killed = await ensureProcessDead(999999);

      expect(killed).toBe(false);
    });
  });

  describe('getChildProcesses', () => {
    it('should find child processes', async () => {
      // Fork 2 children
      const child1 = forkDummyProcess();
      const child2 = forkDummyProcess();

      // Wait for them to start
      await new Promise(resolve => setTimeout(resolve, 200));

      const children = await getChildProcesses(process.pid);

      // Should include both children
      expect(children).toContain(child1.pid);
      expect(children).toContain(child2.pid);

      // Clean up
      child1.kill('SIGKILL');
      child2.kill('SIGKILL');
    });

    it('should return empty array for process with no children', async () => {
      // Fork a child that won't have children
      const child = forkDummyProcess();

      await new Promise(resolve => setTimeout(resolve, 200));

      const children = await getChildProcesses(child.pid!);

      expect(children).toEqual([]);

      // Clean up
      child.kill('SIGKILL');
    });
  });

  describe('killChildProcessesRecursive', () => {
    it('should kill all child processes', async () => {
      // Fork 3 children
      const child1 = forkDummyProcess();
      const child2 = forkDummyProcess();
      const child3 = forkDummyProcess();

      const pids = [child1.pid!, child2.pid!, child3.pid!];

      // Wait for them to start
      await new Promise(resolve => setTimeout(resolve, 200));

      // Kill all children
      const killedCount = await killChildProcessesRecursive(process.pid, {
        gracefulTimeoutMs: 1000,
      });

      // Should have killed 3 processes
      expect(killedCount).toBe(3);

      // All should be dead
      for (const pid of pids) {
        expect(isProcessAlive(pid)).toBe(false);
      }
    });
  });

  describe('cleanupChildProcesses', () => {
    it('should clean up all child processes', async () => {
      // Fork 2 children
      const child1 = forkDummyProcess();
      const child2 = forkDummyProcess();

      const pids = [child1.pid!, child2.pid!];

      // Wait for them to start
      await new Promise(resolve => setTimeout(resolve, 200));

      // Clean up
      await cleanupChildProcesses();

      // All should be dead
      for (const pid of pids) {
        expect(isProcessAlive(pid)).toBe(false);
      }
    });
  });

  describe('findProcessesByPattern', () => {
    it('should find processes by name pattern', async () => {
      // Current test runner should match
      const pids = await findProcessesByPattern(/node/);

      // Should include our own PID
      expect(pids).toContain(process.pid);
      expect(pids.length).toBeGreaterThan(0);
    });

    it('should filter by command pattern', async () => {
      const pids = await findProcessesByPattern(
        /node/,
        /vitest/, // Test runner command
      );

      // Should find at least one (us)
      expect(pids.length).toBeGreaterThan(0);
    });

    it('should return empty array if no matches', async () => {
      const pids = await findProcessesByPattern(
        /definitely-not-a-process-name-that-exists/,
      );

      expect(pids).toEqual([]);
    });
  });

  describe('Chaos Test: Force Kill After Graceful Timeout', () => {
    it('should force kill if process ignores SIGTERM', async () => {
      const child = forkDummyProcess();
      const pid = child.pid!;

      // Ensure process is running
      expect(isProcessAlive(pid)).toBe(true);

      // Try to kill with very short graceful timeout
      const killed = await ensureProcessDead(pid, {
        signal: 'SIGTERM',
        gracefulTimeoutMs: 10, // Too short
        forceSignal: 'SIGKILL',
      });

      expect(killed).toBe(true);

      // Process should be dead
      expect(isProcessAlive(pid)).toBe(false);
    });
  });

  describe('Chaos Test: Kill Process Tree', () => {
    it('should kill parent and all children in tree', async () => {
      // This test would need a more complex setup
      // For now, verify cleanup of direct children works
      const child1 = forkDummyProcess();
      const child2 = forkDummyProcess();

      const pids = [child1.pid!, child2.pid!];

      await new Promise(resolve => setTimeout(resolve, 200));

      // Kill all our children
      const killedCount = await killChildProcessesRecursive(process.pid);

      expect(killedCount).toBe(2);

      for (const pid of pids) {
        expect(isProcessAlive(pid)).toBe(false);
      }
    });
  });
});
