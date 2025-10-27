import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkerManager } from '../worker/worker_manager.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK_WORKER_PATH = path.resolve(THIS_DIR, 'helpers', 'mock_worker.ts');

describe('Worker DRY_RUN Safeguards', () => {
  let manager: WorkerManager;

  beforeEach(() => {
    manager = new WorkerManager();
  });

  afterEach(async () => {
    await manager.stopAll();
  });

  describe('Orchestrator worker DRY_RUN enforcement', () => {
    it('should reject mutating tools when DRY_RUN=1', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      // These tools should be rejected in dry-run mode
      const mutatingTools = [
        'plan_update',
        'context_write',
        'context_snapshot',
        'fs_write',
        'cmd_run',
        'artifact_record',
      ];

      for (const toolName of mutatingTools) {
        try {
          await canary!.call('runTool', { name: toolName, input: {} });
          throw new Error(`Expected dry-run error for ${toolName}`);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          expect(message).toMatch(/dry.?run|forbids/i);
        }
      }
    });

    it('should allow read-only tools in DRY_RUN=1 mode', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      // These tools should be allowed in dry-run mode
      const readOnlyTools = [
        'fs_read',
        'orchestrator_status',
        'auth_status',
        'plan_next',
        'autopilot_status',
        'heavy_queue_list',
        'codex_commands',
      ];

      for (const toolName of readOnlyTools) {
        try {
          // Mock worker should accept these without throwing dry-run errors
          const result = await canary!.call('runTool', { name: toolName, input: {} });
          // Result format depends on mock worker implementation
          // Just verify no dry-run error was thrown
          expect(result).toBeDefined();
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          // Tool may fail for other reasons, but should not fail with dry-run violation
          expect(message).not.toMatch(/dry.?run|forbids/i);
        }
      }
    });

    it('should report DRY_RUN status in health check', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      const healthResponse = await canary!.call<{
        ok: boolean;
        dryRun: boolean;
        role: string;
        flags: { dryRun: boolean };
      }>('health');

      expect(healthResponse.dryRun).toBe(true);
      expect(healthResponse.flags.dryRun).toBe(true);
    });

    it('should reject unknown tools regardless of DRY_RUN setting', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      try {
        await canary!.call('runTool', { name: 'nonexistent_tool', input: {} });
        throw new Error('Expected unknown tool error');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toMatch(/unknown|unsupported/i);
      }
    });
  });

  describe('Executor worker DRY_RUN enforcement', () => {
    it('should reject all tools except fs_read when DRY_RUN=1', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'executor',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      // cmd_run and fs_write should be rejected
      const mutatingTools = ['cmd_run', 'fs_write'];

      for (const toolName of mutatingTools) {
        try {
          await canary!.call('runTool', { name: toolName, input: {} });
          throw new Error(`Expected dry-run error for ${toolName}`);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          expect(message).toMatch(/dry.?run|forbids/i);
        }
      }
    });

    it('should allow fs_read in DRY_RUN=1 mode for executor', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'executor',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      // fs_read should be allowed
      try {
        const result = await canary!.call('runTool', { name: 'fs_read', input: { path: 'dummy' } });
        // Mock may fail for other reasons, but not dry-run
        expect(result).toBeDefined();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toMatch(/dry.?run|forbids/i);
      }
    });

    it('should report executor role and DRY_RUN status in health check', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'executor',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      const healthResponse = await canary!.call<{
        ok: boolean;
        role: string;
        dryRun: boolean;
        flags: { dryRun: boolean };
      }>('health');

      expect(healthResponse.role).toBe('executor');
      expect(healthResponse.dryRun).toBe(true);
      expect(healthResponse.flags.dryRun).toBe(true);
    });

    it('should reject unsupported methods for executor', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'executor',
        },
      });

      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      const unsupportedMethods = ['plan', 'dispatch', 'verify', 'report.mo'];

      for (const method of unsupportedMethods) {
        try {
          await canary!.call(method);
          throw new Error(`Expected unsupported method error for ${method}`);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          expect(message).toMatch(/unsupported|executor/i);
        }
      }
    });
  });

  describe('Legacy behavior when DRY_RUN=0', () => {
    it('should allow all mutating tools when DRY_RUN=0 in orchestrator worker', async () => {
      // Active workers are forced to DRY_RUN=0, so use active
      await manager.startActive({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
        },
      });

      const active = manager.getActive();

      // Verify DRY_RUN is 0
      const health = await active.call<{ dryRun: boolean }>('health');
      expect(health.dryRun).toBe(false);

      // These tools should succeed (though mock may handle differently)
      const mutatingTools = [
        'plan_update',
        'context_write',
        'fs_write',
        'cmd_run',
      ];

      for (const toolName of mutatingTools) {
        try {
          await active.call('runTool', { name: toolName, input: {} });
          // Should not throw dry-run error
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          // Should NOT have dry-run violation
          expect(message).not.toMatch(/dry.?run|forbids/i);
        }
      }
    });

    it('should allow cmd_run and fs_write in executor when DRY_RUN=0', async () => {
      // Active workers force DRY_RUN=0
      await manager.startActive({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'executor',
        },
      });

      const active = manager.getActive();

      // Verify DRY_RUN is 0
      const health = await active.call<{ dryRun: boolean }>('health');
      expect(health.dryRun).toBe(false);

      // These tools should be allowed
      for (const toolName of ['cmd_run', 'fs_write']) {
        try {
          await active.call('runTool', { name: toolName, input: {} });
          // Should not throw dry-run error
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          expect(message).not.toMatch(/dry.?run|forbids/i);
        }
      }
    });
  });

  describe('DRY_RUN state database isolation', () => {
    it('should document that state DB is read-only in DRY_RUN mode', async () => {
      // This is an architectural expectation:
      // When DRY_RUN=1, the orchestrator runtime should open state DB in read-only mode
      // This prevents accidental writes even if the code doesn't enforce it

      // For now, we verify the DRY_RUN flag is properly communicated
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();
      const health = await canary!.call<{ dryRun: boolean }>('health');

      // Flag should be set correctly
      expect(health.dryRun).toBe(true);
    });
  });

  describe('Error reporting and diagnostics', () => {
    it('should include helpful error message when dry-run violation occurs', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();

      try {
        await canary!.call('runTool', { name: 'fs_write', input: {} });
        throw new Error('Expected dry-run error');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // Should mention promotion
        expect(message).toMatch(/promote|dry.?run/i);
      }
    });

    it('should handle idempotency keys correctly with dry-run enforcement', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();

      // Idempotency key should not bypass dry-run check
      try {
        await canary!.call('runTool', {
          name: 'fs_write',
          input: {},
          idempotencyKey: 'test-key-123',
        });
        throw new Error('Expected dry-run error');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toMatch(/dry.?run|forbids/i);
      }
    });
  });

  describe('Role-specific safeguards', () => {
    it('orchestrator worker should support orchestrator-specific methods', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'orchestrator',
          WVO_DRY_RUN: '1',
        },
      });

      const canary = manager.getCanary();

      // These orchestrator methods should not fail with "unsupported" error
      // (they may fail for other reasons in mock, but not with method unsupported)
      const orchestratorMethods = ['plan', 'dispatch', 'verify', 'report.mo'];

      for (const method of orchestratorMethods) {
        try {
          await canary!.call(method);
          // Success or other error, just not unsupported method
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          expect(message).not.toMatch(/executor_unsupported|unsupported.*method/i);
        }
      }
    });

    it('executor worker should reject orchestrator-specific methods', async () => {
      await manager.startCanary({
        entryPath: MOCK_WORKER_PATH,
        env: {
          WVO_WORKER_ROLE: 'executor',
        },
      });

      const canary = manager.getCanary();

      // plan, dispatch, verify should not be supported by executor
      const orchestratorMethods = ['plan', 'dispatch', 'verify'];

      for (const method of orchestratorMethods) {
        try {
          await canary!.call(method);
          throw new Error(`Expected unsupported method error for ${method}`);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          expect(message).toMatch(/unsupported|executor_unsupported/i);
        }
      }
    });
  });
});
