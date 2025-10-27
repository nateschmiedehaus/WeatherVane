import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fork, type ChildProcess } from 'node:child_process';

import {
  isProcessAlive,
  getProcessIdentity,
  verifyProcessIdentity,
  readPidFile,
  writePidFile,
  cleanupPidFileIfDead,
  acquireLock,
  releaseLock,
} from './pid_file_manager.js';

describe('PidFileManager', () => {
  let testDir: string;
  let pidFilePath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'pid-test-'));
    pidFilePath = path.join(testDir, 'test.pid');
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('isProcessAlive', () => {
    it('should return true for own process', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('should return false for non-existent PID', () => {
      // PID 999999 is unlikely to exist
      expect(isProcessAlive(999999)).toBe(false);
    });

    it('should return true for init process (PID 1)', () => {
      if (process.platform !== 'win32') {
        expect(isProcessAlive(1)).toBe(true);
      }
    });
  });

  describe('getProcessIdentity', () => {
    it('should get identity for own process', async () => {
      const identity = await getProcessIdentity(process.pid);

      expect(identity).toBeDefined();
      expect(identity?.name).toContain('node');
      expect(identity?.commandLine).toContain('vitest');
    });

    it('should return null for non-existent PID', async () => {
      const identity = await getProcessIdentity(999999);
      expect(identity).toBeNull();
    });
  });

  describe('verifyProcessIdentity', () => {
    it('should verify own process identity', async () => {
      const isValid = await verifyProcessIdentity(
        process.pid,
        'node',
        /vitest/,
      );

      expect(isValid).toBe(true);
    });

    it('should reject wrong process name', async () => {
      const isValid = await verifyProcessIdentity(
        process.pid,
        'python',
        /vitest/,
      );

      expect(isValid).toBe(false);
    });

    it('should reject wrong command pattern', async () => {
      const isValid = await verifyProcessIdentity(
        process.pid,
        'node',
        /definitely-not-in-command/,
      );

      expect(isValid).toBe(false);
    });
  });

  describe('readPidFile', () => {
    it('should return null for non-existent file', async () => {
      const metadata = await readPidFile(pidFilePath);
      expect(metadata).toBeNull();
    });

    it('should parse valid PID file', async () => {
      const data = {
        pid: 12345,
        started_at: '2025-01-01T00:00:00Z',
        workspace: '/test/workspace',
        process_name: 'node',
        command_line: 'node test.js',
      };

      await fs.writeFile(pidFilePath, JSON.stringify(data));

      const metadata = await readPidFile(pidFilePath);

      expect(metadata).toEqual(data);
    });

    it('should return null for invalid JSON', async () => {
      await fs.writeFile(pidFilePath, 'not json');

      const metadata = await readPidFile(pidFilePath);
      expect(metadata).toBeNull();
    });

    it('should return null for missing pid field', async () => {
      await fs.writeFile(pidFilePath, JSON.stringify({ workspace: '/test' }));

      const metadata = await readPidFile(pidFilePath);
      expect(metadata).toBeNull();
    });
  });

  describe('writePidFile', () => {
    it('should write PID file with metadata', async () => {
      await writePidFile(pidFilePath, {
        pid: 12345,
        workspace: '/test/workspace',
        process_name: 'node',
        command_line: 'node test.js',
      });

      const content = await fs.readFile(pidFilePath, 'utf-8');
      const data = JSON.parse(content);

      expect(data.pid).toBe(12345);
      expect(data.workspace).toBe('/test/workspace');
      expect(data.started_at).toBeDefined();
    });

    it('should fail if file already exists (atomic lock)', async () => {
      await writePidFile(pidFilePath, {
        pid: 12345,
        workspace: '/test',
      });

      await expect(
        writePidFile(pidFilePath, {
          pid: 67890,
          workspace: '/test',
        }),
      ).rejects.toThrow('already exists');
    });

    it('should create parent directory if needed', async () => {
      const nestedPath = path.join(testDir, 'nested', 'dir', 'test.pid');

      await writePidFile(nestedPath, {
        pid: 12345,
        workspace: '/test',
      });

      const exists = fsSync.existsSync(nestedPath);
      expect(exists).toBe(true);
    });

    it('should set file permissions to 0600', async () => {
      await writePidFile(pidFilePath, {
        pid: 12345,
        workspace: '/test',
      });

      const stats = await fs.stat(pidFilePath);
      const mode = stats.mode & 0o777;

      // Should be readable/writable by owner only
      expect(mode).toBe(0o600);
    });
  });

  describe('cleanupPidFileIfDead', () => {
    it('should clean up PID file for dead process', async () => {
      // Write PID file with non-existent PID
      await writePidFile(pidFilePath, {
        pid: 999999,
        workspace: '/test',
      });

      const cleaned = await cleanupPidFileIfDead(pidFilePath);

      expect(cleaned).toBe(true);
      const exists = fsSync.existsSync(pidFilePath);
      expect(exists).toBe(false);
    });

    it('should not clean up PID file for alive process', async () => {
      // Write PID file with our own PID
      await writePidFile(pidFilePath, {
        pid: process.pid,
        workspace: '/test',
      });

      const cleaned = await cleanupPidFileIfDead(pidFilePath);

      expect(cleaned).toBe(false);
      const exists = fsSync.existsSync(pidFilePath);
      expect(exists).toBe(true);
    });

    it('should return true if PID file does not exist', async () => {
      const cleaned = await cleanupPidFileIfDead(pidFilePath);

      expect(cleaned).toBe(true);
    });
  });

  describe('acquireLock', () => {
    it('should acquire lock successfully', async () => {
      await acquireLock(pidFilePath, '/test/workspace');

      const metadata = await readPidFile(pidFilePath);

      expect(metadata?.pid).toBe(process.pid);
      expect(metadata?.workspace).toBe('/test/workspace');
    });

    it('should fail if another process holds lock', async () => {
      // Simulate another process holding lock
      await writePidFile(pidFilePath, {
        pid: 1, // init process (always alive)
        workspace: '/test',
      });

      await expect(
        acquireLock(pidFilePath, '/test/workspace'),
      ).rejects.toThrow(/already running/);
    });

    it('should succeed if stale PID file exists', async () => {
      // Write PID file with dead process
      await writePidFile(pidFilePath, {
        pid: 999999,
        workspace: '/test',
      });

      // Should clean up stale file and acquire lock
      await acquireLock(pidFilePath, '/test/workspace');

      const metadata = await readPidFile(pidFilePath);
      expect(metadata?.pid).toBe(process.pid);
    });
  });

  describe('releaseLock', () => {
    it('should release lock by deleting PID file', async () => {
      await acquireLock(pidFilePath, '/test');

      await releaseLock(pidFilePath);

      const exists = fsSync.existsSync(pidFilePath);
      expect(exists).toBe(false);
    });

    it('should not delete PID file if not owned by us', async () => {
      // Write PID file with different PID
      await writePidFile(pidFilePath, {
        pid: 1,
        workspace: '/test',
      });

      await releaseLock(pidFilePath);

      // File should still exist
      const exists = fsSync.existsSync(pidFilePath);
      expect(exists).toBe(true);
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      await acquireLock(pidFilePath, '/test');

      await releaseLock(pidFilePath);
      await releaseLock(pidFilePath);
      await releaseLock(pidFilePath);

      // Should not throw errors
      const exists = fsSync.existsSync(pidFilePath);
      expect(exists).toBe(false);
    });
  });

  describe('Chaos Test: Race Condition', () => {
    it('should prevent concurrent lock acquisition', async () => {
      // Try to acquire lock 10 times concurrently
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          acquireLock(pidFilePath, '/test'),
        ),
      );

      // Only one should succeed
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);

      // Clean up
      await releaseLock(pidFilePath);
    });
  });

  describe('Chaos Test: PID Reuse', () => {
    it('should not kill wrong process if PID is reused', async () => {
      // Fork a child process
      const child: ChildProcess = fork(
        path.join(__dirname, '../../fixtures/dummy_process.js'),
        [],
        { silent: true },
      );

      const childPid = child.pid;

      if (!childPid) {
        throw new Error('Failed to fork child');
      }

      // Write PID file claiming to be the child
      await writePidFile(pidFilePath, {
        pid: childPid,
        workspace: '/test',
        process_name: 'node',
        command_line: 'node unified_orchestrator.js',
      });

      // Child is running but command doesn't match
      const isValid = await verifyProcessIdentity(
        childPid,
        'node',
        /unified_orchestrator/,
      );

      // Should return false because command line doesn't match
      // (child is running dummy_process.js, not unified_orchestrator.js)
      expect(isValid).toBe(false);

      // Clean up
      child.kill();
      await releaseLock(pidFilePath);
    });
  });
});
