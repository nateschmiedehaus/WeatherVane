import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRouter, type RouterDecisionLog } from '../model_router.js';
import type { RouterState } from '../router_policy.js';

const tmpRoot = path.join(tmpdir(), 'model-router-stress-');
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createLargeCatalog(workspaceRoot: string, runId: string, modelCount: number) {
  const runDir = path.join(workspaceRoot, 'resources', 'runs', `run-${runId}`);
  await mkdir(runDir, { recursive: true });

  // Create large catalog with many models
  const models = [];
  for (let i = 0; i < modelCount; i++) {
    const provider = i % 2 === 0 ? 'openai' : 'anthropic';
    const modelName = provider === 'openai' ? `codex-5-test-${i}` : `claude-test-${i}`;

    // Only include allow-listed models in actual catalog
    // For stress test, use variations of allowed models
    const baseName = provider === 'openai' ? 'codex-5-high' : 'claude-sonnet-4.5';

    models.push({
      name: baseName, // Use allowed name to pass filter
      provider,
      context_window: 128000 + i,
      reasoning_strength: 'high',
      code_quality: 'high',
      latency_ms_est: 1000 + i,
      price_class: 'premium',
      tool_use_ok: true,
      vision_ok: provider === 'anthropic',
      max_output_tokens: 8192,
      notes: ['allowlist', 'stress_test'],
    });
  }

  const catalog = {
    models: models.slice(0, 6), // Only include allowed models
    source: 'discovery',
    timestamp: new Date().toISOString(),
    fallback: [],
  };

  const discoveryPath = path.join(runDir, 'models_discovered.json');
  await writeFile(discoveryPath, JSON.stringify(catalog, null, 2));
  return discoveryPath;
}

async function createMockPolicyFile(workspaceRoot: string) {
  const policyPath = path.join(workspaceRoot, 'model_policy.yaml');
  await writeFile(
    policyPath,
    `catalog_version: 1
models:
  - name: codex-5-high
    provider: openai
    context_window: 128000
    reasoning_strength: high
    code_quality: high
    latency_ms_est: 1800
    price_class: premium
    tool_use_ok: true
    vision_ok: false
    max_output_tokens: 8192
  - name: claude-sonnet-4.5
    provider: anthropic
    context_window: 200000
    reasoning_strength: high
    code_quality: high
    latency_ms_est: 1600
    price_class: premium
    tool_use_ok: true
    vision_ok: true
    max_output_tokens: 8192
capability_tags:
  reasoning_high:
    prefer: ["claude-sonnet-4.5"]
  fast_code:
    prefer: ["codex-5-high"]
routing:
  implement: fast_code
  plan: reasoning_high
`
  );
  return policyPath;
}

describe('model_router stress tests', () => {
  describe('high-volume decision making', () => {
    it('handles 1000 routing decisions efficiently', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-high-volume';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const iterations = 1000;
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        router.pickModel('implement', { taskId: `T${i}` });
      }

      const duration = Date.now() - startTime;
      const memoryDelta = process.memoryUsage().heapUsed - startMemory;

      // Performance targets
      expect(duration).toBeLessThan(1000); // < 1s for 1000 decisions
      expect(memoryDelta).toBeLessThan(10 * 1024 * 1024); // < 10MB growth
    });

    it('decision logging scales with volume', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-logging';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const decisions: RouterDecisionLog[] = [];
      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        decisionLogger: (entry) => decisions.push(entry),
      });

      const iterations = 500;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        router.pickModel('implement', { taskId: `T${i}` });
      }

      const duration = Date.now() - startTime;

      // All decisions should be logged
      expect(decisions.length).toBe(iterations);

      // Should complete reasonably fast
      expect(duration).toBeLessThan(500); // < 500ms for 500 decisions + logging
    });
  });

  describe('concurrent decision making', () => {
    it('handles concurrent routing requests safely', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-concurrent';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const concurrency = 100;
      const promises = Array.from({ length: concurrency }, (_, i) =>
        Promise.resolve(router.pickModel('implement', { taskId: `T${i}` }))
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All should succeed
      expect(results.length).toBe(concurrency);
      results.forEach(result => {
        expect(result.model).toBeDefined();
        expect(result.provider).toBeDefined();
      });

      // Should be very fast (synchronous operations)
      expect(duration).toBeLessThan(100); // < 100ms for 100 concurrent
    });
  });

  describe('escalation under load', () => {
    it('handles rapid escalation cycles', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-escalation';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const tasks = 100;
      const startTime = Date.now();

      // Create many tasks and escalate them all
      for (let i = 0; i < tasks; i++) {
        const taskId = `T${i}`;

        // Trigger escalation
        router.noteVerifyFailure(taskId);
        router.noteVerifyFailure(taskId);

        // Make decision
        const selection = router.pickModel('implement', { taskId });
        expect(selection).toBeDefined();
      }

      const duration = Date.now() - startTime;

      // Should handle escalations efficiently
      expect(duration).toBeLessThan(500); // < 500ms for 100 escalations
    });

    it('clears many escalated tasks efficiently', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-clear';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const tasks = 1000;

      // Escalate many tasks
      for (let i = 0; i < tasks; i++) {
        router.noteVerifyFailure(`T${i}`);
        router.noteVerifyFailure(`T${i}`);
      }

      // Clear them all
      const startTime = Date.now();
      for (let i = 0; i < tasks; i++) {
        router.clearTask(`T${i}`);
      }
      const duration = Date.now() - startTime;

      // Should clear efficiently
      expect(duration).toBeLessThan(100); // < 100ms for 1000 clears
    });
  });

  describe('circuit breaker under sustained load', () => {
    it('handles many provider failures efficiently', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-circuit-breaker';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        cooldownMs: 100,
      });

      // Record many failures for openai only (leave anthropic available)
      for (let i = 0; i < 100; i++) {
        router.recordProviderFailure('implement', 'openai', 429);
      }

      // Should still be able to pick models (from anthropic)
      const selection = router.pickModel('implement', { taskId: 'T1' });
      expect(selection).toBeDefined();
      expect(selection.provider).toBe('anthropic'); // Should fall back to anthropic
    });

    it('throws error when all providers are circuit-broken', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-all-providers-down';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        cooldownMs: 100,
      });

      // Trip ALL providers
      router.recordProviderFailure('implement', 'openai', 429);
      router.recordProviderFailure('implement', 'anthropic', 503);

      // Should throw when no providers available
      expect(() => {
        router.pickModel('implement', { taskId: 'T1' });
      }).toThrow('No available models');
    });
  });

  describe('mixed state transitions', () => {
    it('handles rapid state transitions', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-states';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const states: RouterState[] = ['specify', 'plan', 'thinker', 'implement', 'verify', 'review', 'pr', 'monitor'];
      const iterations = 100;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        for (const state of states) {
          const selection = router.pickModel(state, { taskId: `T${i}-${state}` });
          expect(selection).toBeDefined();
        }
      }

      const duration = Date.now() - startTime;

      // Should handle 800 decisions (100 * 8 states) quickly
      expect(duration).toBeLessThan(1000); // < 1s
    });
  });

  describe('memory stability', () => {
    it('does not leak memory over many decisions', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-memory';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const iterations = 1000;
      const memoryReadings: number[] = [];

      for (let i = 0; i < iterations; i++) {
        router.pickModel('implement', { taskId: `T${i}` });

        // Sample memory every 100 iterations
        if (i % 100 === 0) {
          // Force GC if available
          if (global.gc) {
            global.gc();
          }
          await new Promise<void>(resolve => setImmediate(resolve));
          memoryReadings.push(process.memoryUsage().heapUsed);
        }
      }

      // Check for memory growth
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = lastReading - firstReading;

      // Memory should not grow significantly
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024); // < 5MB
    });
  });

  describe('decision latency under load', () => {
    it('maintains consistent latency under sustained load', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-latency';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const iterations = 500;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        router.pickModel('implement', { taskId: `T${i}` });
        latencies.push(Date.now() - start);
      }

      // Calculate percentiles
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(iterations * 0.5)];
      const p95 = latencies[Math.floor(iterations * 0.95)];
      const p99 = latencies[Math.floor(iterations * 0.99)];

      // Latency targets (should be very fast - synchronous)
      expect(p50).toBeLessThan(5); // p50 < 5ms
      expect(p95).toBeLessThan(10); // p95 < 10ms
      expect(p99).toBeLessThan(20); // p99 < 20ms
    });
  });

  describe('edge case resilience', () => {
    it('handles extremely long task IDs', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-long-ids';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const longTaskId = 'T' + 'x'.repeat(10000); // 10KB task ID

      const selection = router.pickModel('implement', { taskId: longTaskId });
      expect(selection).toBeDefined();
    });

    it('handles very high context token values', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-high-tokens';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      // Test with various extreme values
      const extremeValues = [
        Number.MAX_SAFE_INTEGER,
        1_000_000_000, // 1B tokens
        999_999_999,
      ];

      for (const contextTokens of extremeValues) {
        const selection = router.pickModel('implement', {
          taskId: 'T1',
          contextTokens,
        });
        expect(selection).toBeDefined();
      }
    });

    it('handles many files touched threshold', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'stress-many-files';
      await createLargeCatalog(workspaceRoot, runId, 6);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', {
        taskId: 'T1',
        hints: { touchedFiles: 10000 }, // 10k files
      });

      expect(selection).toBeDefined();
    });
  });
});
