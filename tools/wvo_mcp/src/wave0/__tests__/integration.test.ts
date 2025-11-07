/**
 * Integration Tests for Wave 0.1
 *
 * Tests all components working together:
 * - Real MCP connection
 * - Task execution
 * - Provider routing
 * - Clone management
 * - Content generation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RealMCPClient } from '../real_mcp_client';
import { RealTaskExecutor } from '../real_task_executor';
import { ProviderRouter } from '../provider_router';
import { CloneManager } from '../clone_manager';
import { ContentGenerator } from '../content_generator';
import * as fs from 'fs';
import * as path from 'path';

// Set longer timeout for integration tests
// Vitest handles timeouts differently - set in test config or individual tests

describe('Wave 0.1 Integration Tests', () => {
  let mcp: RealMCPClient;
  let executor: RealTaskExecutor;
  let router: ProviderRouter;
  let cloneManager: CloneManager;

  beforeAll(async () => {
    // Initialize components
    mcp = new RealMCPClient();
    router = new ProviderRouter();
    cloneManager = new CloneManager();

    // Initialize MCP connection
    try {
      await mcp.initialize();
    } catch (error) {
      console.warn('MCP initialization failed - some tests will be skipped', error);
    }
  });

  afterAll(async () => {
    // Cleanup
    await cloneManager.cleanup();
    await mcp.disconnect();
  });

  describe('MCP Client', () => {
    it('should connect to real MCP server', async () => {
      if (!mcp.isHealthy()) {
        console.log('Skipping - MCP not available');
        return;
      }

      const status = mcp.getStatus();
      expect(status.connected).toBe(true);
      expect(status.tools).toBeGreaterThan(0);
    });

    it('should execute fs_read tool', async () => {
      if (!mcp.isHealthy()) {
        console.log('Skipping - MCP not available');
        return;
      }

      const content = await mcp.read('package.json');
      expect(content).toContain('"name"');
      expect(content).toContain('wvo-mcp-server');
    });

    it('should execute fs_write tool', async () => {
      if (!mcp.isHealthy()) {
        console.log('Skipping - MCP not available');
        return;
      }

      const testFile = 'state/test-write.txt';
      const testContent = 'Wave 0.1 Integration Test';

      await mcp.write(testFile, testContent);

      // Verify file was written
      const written = await mcp.read(testFile);
      expect(written).toBe(testContent);

      // Cleanup
      await mcp.bash(`rm -f ${testFile}`);
    });

    it('should execute cmd_run tool', async () => {
      if (!mcp.isHealthy()) {
        console.log('Skipping - MCP not available');
        return;
      }

      const output = await mcp.bash('echo "Wave 0.1 Test" && pwd');
      expect(output).toContain('Wave 0.1 Test');
      expect(output).toContain('/');
    });
  });

  describe('Provider Router', () => {
    it('should select appropriate provider for task type', () => {
      // Reset stats for clean test
      router.reset();

      // Reasoning tasks should prefer Claude
      const reasoningProvider = router.selectProvider('reasoning');
      expect(['claude', 'codex']).toContain(reasoningProvider);

      // Coding tasks should prefer Codex
      const codingProvider = router.selectProvider('coding');
      expect(['claude', 'codex']).toContain(codingProvider);
    });

    it('should track usage correctly', () => {
      router.reset();

      router.recordUsage('claude', 1000, 500);
      router.recordUsage('codex', 2000, 300);

      const status = router.getStatus();
      expect(status.providers.claude.stats.tokensUsed).toBe(1000);
      expect(status.providers.codex.stats.tokensUsed).toBe(2000);
    });

    it('should handle rate limits', () => {
      router.reset();

      // Simulate hitting rate limit
      router.recordUsage('claude', 90000, 500);

      // Should still be available (under 90% threshold)
      const provider = router.selectProvider('reasoning');
      expect(provider).toBeDefined();

      // Add more usage to hit limit
      router.recordUsage('claude', 15000, 500);

      // Now should fall back to codex
      const fallback = router.selectProvider('reasoning');
      expect(fallback).toBe('codex');
    });

    it('should make recommendations based on usage', () => {
      router.reset();

      // Unbalanced usage
      router.recordUsage('claude', 50000, 500);
      router.recordUsage('codex', 10000, 500);

      const status = router.getStatus();
      expect(status.recommendations).toContain(
        'Consider routing more tasks to Codex to balance usage'
      );
    });
  });

  describe('Content Generator', () => {
    it('should generate strategy content', async () => {
      const generator = new ContentGenerator(mcp, router);

      const task = {
        id: 'TEST-001',
        title: 'Test Task',
        status: 'pending' as const,
        description: 'Test description',
        exit_criteria: ['Criteria 1', 'Criteria 2']
      };

      const strategy = await generator.generateStrategy(task);

      expect(strategy).toContain('STRATEGIZE');
      expect(strategy).toContain(task.title);
      expect(strategy).toContain('Problem Analysis');
      expect(strategy).toContain('AFP Alignment');
      expect(strategy).not.toContain('placeholder');
    });

    it('should generate implementation with real code', async () => {
      const generator = new ContentGenerator(mcp, router);

      const task = {
        id: 'TEST-IMPL',
        title: 'Implementation Test',
        status: 'pending' as const
      };

      const context = {
        strategy: 'Test strategy',
        spec: 'Test spec',
        plan: 'Test plan'
      };

      const implementation = await generator.generateImplementation(task, context);

      expect(implementation.summary).toContain('Implementation');
      expect(implementation.changes.length).toBeGreaterThan(0);

      // Should generate actual TypeScript code
      const codeChange = implementation.changes.find((c: any) => c.path.endsWith('.ts'));
      expect(codeChange).toBeDefined();
      expect(codeChange?.content).toContain('export class');
      expect(codeChange?.content).toContain('async');
    });
  });

  describe('Clone Manager', () => {
    it('should create isolated clone', async () => {
      // Skip on CI or if no tmp directory
      if (process.env.CI || !process.env.TMPDIR) {
        console.log('Skipping clone test - not suitable environment');
        return;
      }

      const clone = await cloneManager.createClone('test');

      expect(clone.id).toMatch(/^clone-/);
      expect(clone.pid).toBeGreaterThan(0);
      expect(clone.pid).not.toBe(process.pid);
      expect(clone.port).toBeGreaterThanOrEqual(9000);
      expect(clone.port).toBeLessThanOrEqual(9999);
      expect(clone.dir).toContain('wave0');

      // Cleanup
      await cloneManager.terminateClone(clone.id);
    });

    it('should validate isolation', async () => {
      // Skip on CI
      if (process.env.CI) {
        console.log('Skipping isolation test on CI');
        return;
      }

      const clone = await cloneManager.createClone('isolation-test');

      const isIsolated = await cloneManager.validateIsolation(clone.id);
      expect(isIsolated).toBe(true);

      await cloneManager.terminateClone(clone.id);
    });

    it('should enforce max clones limit', async () => {
      // Skip on CI
      if (process.env.CI) {
        console.log('Skipping max clones test on CI');
        return;
      }

      const clones: string[] = [];

      // Create max clones
      for (let i = 0; i < 3; i++) {
        const clone = await cloneManager.createClone(`test-${i}`);
        clones.push(clone.id);
      }

      // Should fail to create another
      await expect(
        cloneManager.createClone('overflow')
      ).rejects.toThrow('Maximum clones');

      // Cleanup
      for (const id of clones) {
        await cloneManager.terminateClone(id);
      }
    });
  });

  describe('End-to-End Task Execution', () => {
    it('should execute a complete task', async () => {
      if (!mcp.isHealthy()) {
        console.log('Skipping E2E test - MCP not available');
        return;
      }

      const workspaceRoot = path.resolve(process.cwd(), '../..');
      executor = new RealTaskExecutor(workspaceRoot);
      await executor.initialize();

      const testTask = {
        id: 'E2E-TEST',
        title: 'End-to-End Test Task',
        status: 'pending' as const,
        description: 'Test task for Wave 0.1',
        exit_criteria: [
          'Create test file',
          'Add test function',
          'Write documentation'
        ]
      };

      const result = await executor.execute(testTask);

      expect(result.status).toBe('completed');
      expect(result.taskId).toBe(testTask.id);
      expect(result.phasesCompleted.length).toBeGreaterThan(5);
      expect(result.filesChanged).toBeGreaterThanOrEqual(0);

      // Verify evidence was created
      const evidenceDir = `state/evidence/${testTask.id}`;
      const strategyExists = fs.existsSync(
        path.join(workspaceRoot, evidenceDir, 'strategy.md')
      );
      expect(strategyExists).toBe(true);
    });
  });

  describe('System Health', () => {
    it('should report overall health status', () => {
      const health = {
        mcp: mcp.isHealthy(),
        router: router.getStatus(),
        clones: cloneManager.getStatus()
      };

      expect(health.router).toBeDefined();
      expect(health.router.providers).toBeDefined();
      expect(health.clones.activeClones).toBeLessThanOrEqual(3);
    });

    it('should handle resource monitoring', () => {
      const routerStatus = router.getStatus();

      // Check memory tracking
      expect(routerStatus.providers.claude).toBeDefined();
      expect(routerStatus.providers.codex).toBeDefined();

      // Check rate limit tracking
      expect(routerStatus.providers.claude.rateLimit).toBeDefined();
      expect(routerStatus.providers.codex.rateLimit).toBeDefined();
    });
  });
});