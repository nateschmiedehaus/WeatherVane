/**
 * Tests for TelemetryManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TelemetryManager, type LogLevel } from './telemetry_manager.js';

describe('TelemetryManager', () => {
  const testDir = path.join(process.cwd(), 'test-telemetry');
  const testLogPath = path.join(testDir, 'test.jsonl');

  let manager: TelemetryManager;

  beforeEach(async () => {
    // Clean test directory
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });

    manager = new TelemetryManager({
      logPath: testLogPath,
      rotationThreshold: 1000, // Small threshold for testing
      bufferSize: 10,
      flushInterval: 100,
      maxErrorLength: 100,
      enableCompression: false, // Disable for easier testing
      retentionDays: 1,
      minLevel: 'debug',
    });

    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Basic logging', () => {
    it('should log entries to file', async () => {
      await manager.log('info', { message: 'test' });
      await manager.flush();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe('info');
      expect(entry.data.message).toBe('test');
      expect(entry.timestamp).toBeTypeOf('number');
    });

    it('should filter logs by level', async () => {
      const debugManager = new TelemetryManager({
        logPath: testLogPath,
        minLevel: 'warn',
      });
      await debugManager.initialize();

      await debugManager.log('debug', { msg: 'debug' });
      await debugManager.log('info', { msg: 'info' });
      await debugManager.log('warn', { msg: 'warn' });
      await debugManager.flush();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0]).data.msg).toBe('warn');

      await debugManager.close();
    });
  });

  describe('Error truncation', () => {
    it('should truncate long error messages', async () => {
      const longError = 'F841 '.repeat(1000); // Very long error

      await manager.log('error', { error: longError });
      await manager.flush();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.data.error.length).toBeLessThan(longError.length);
      expect(entry.data.error.length).toBeLessThanOrEqual(100);
      expect(entry.data.errorHash).toBeTypeOf('string');
    });

    it('should summarize linter errors', async () => {
      const linterError = `F841 Local variable \`roas_floor_active\` is assigned to but never used
   --> apps/allocator/optimizer.py:305:21

F401 [*] \`dataclasses.field\` imported but unused
  --> apps/allocator/train.py:18:36

F401 [*] \`pandas\` imported but unused
  --> apps/allocator/train.py:24:18

Found 53 errors.`;

      await manager.log('error', { error: linterError });
      await manager.flush();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.data.error).toContain('linting errors');
      expect(entry.data.error).toContain('F841');
      expect(entry.data.error).toContain('F401');
      expect(entry.data.error.length).toBeLessThan(linterError.length);
    });

    it('should handle nested telemetry errors', async () => {
      const longError = 'X'.repeat(1000);

      await manager.log('error', {
        telemetry: {
          meta: {
            error: longError,
            agent: 'worker-1',
          },
        },
      });
      await manager.flush();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.data.telemetry.meta.error.length).toBeLessThanOrEqual(100);
      expect(entry.data.telemetry.meta.errorHash).toBeTypeOf('string');
      expect(entry.data.telemetry.meta.agent).toBe('worker-1');
    });
  });

  describe('Ring buffer', () => {
    it('should batch writes', async () => {
      // Log multiple entries
      for (let i = 0; i < 5; i++) {
        await manager.log('info', { index: i });
      }

      // Not flushed yet (buffer < 80%)
      const contentBefore = await fs.readFile(testLogPath, 'utf-8').catch(() => '');
      expect(contentBefore.trim().split('\n').filter(Boolean).length).toBe(0);

      // Flush
      await manager.flush();

      // Now all entries present
      const contentAfter = await fs.readFile(testLogPath, 'utf-8');
      const lines = contentAfter.trim().split('\n');
      expect(lines.length).toBe(5);
    });

    it('should auto-flush when buffer reaches threshold', async () => {
      // Log 9 entries (90% of buffer size 10)
      for (let i = 0; i < 9; i++) {
        await manager.log('info', { index: i });
      }

      // Should trigger auto-flush at 80%
      await new Promise(resolve => setTimeout(resolve, 50));

      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
    });
  });

  describe('Rotation', () => {
    it('should rotate log file when size exceeds threshold', async () => {
      // Log enough data to trigger rotation (threshold = 1000 bytes)
      const largeData = 'X'.repeat(200);
      for (let i = 0; i < 10; i++) {
        await manager.log('info', { data: largeData });
      }

      await manager.flush();

      // Wait for rotation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check that rotated file exists
      const files = await fs.readdir(testDir);
      const rotatedFiles = files.filter(f => f.startsWith('test.') && f !== 'test.jsonl');

      expect(rotatedFiles.length).toBeGreaterThan(0);

      // Check that new log file is empty or small
      const stats = await fs.stat(testLogPath);
      expect(stats.size).toBeLessThan(1000);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate identical errors', async () => {
      const error = 'Same error message';

      // Log same error 5 times
      for (let i = 0; i < 5; i++) {
        await manager.log('error', { error });
      }

      await manager.flush();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      // Should only log once due to deduplication
      expect(lines.length).toBe(1);
    });

    it('should not deduplicate different errors', async () => {
      await manager.log('error', { error: 'Error 1' });
      await manager.log('error', { error: 'Error 2' });
      await manager.log('error', { error: 'Error 3' });

      await manager.flush();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      expect(lines.length).toBe(3);
    });
  });

  describe('Performance', () => {
    it('should handle high throughput', async () => {
      // Create manager with higher rotation threshold to avoid rotation during test
      const perfManager = new TelemetryManager({
        logPath: testLogPath,
        rotationThreshold: 1000000, // 1MB - won't rotate during test
        bufferSize: 2000,
        flushInterval: 100,
        maxErrorLength: 100,
        enableCompression: false,
        retentionDays: 1,
        minLevel: 'info',
      });
      await perfManager.initialize();

      const startTime = Date.now();

      // Log 1000 entries
      for (let i = 0; i < 1000; i++) {
        await perfManager.log('info', { index: i });
      }

      await perfManager.flush();

      const duration = Date.now() - startTime;

      // Should complete in under 1 second
      expect(duration).toBeLessThan(1000);

      // Verify all entries logged
      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(1000);

      await perfManager.close();
    });
  });

  describe('Cleanup', () => {
    it('should flush remaining entries on close', async () => {
      await manager.log('info', { message: 'test' });

      // Close without explicit flush
      await manager.close();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      expect(lines.length).toBe(1);
    });
  });
});
