/**
 * Performance Baseline Measurement for StateGraph
 *
 * SPIKE 1: Measure current performance before refactoring
 *
 * This test measures the current overhead of state_graph.ts to establish
 * a baseline for acceptable regression after modularization.
 *
 * Expected results:
 * - LLM calls dominate (1000-5000ms per state)
 * - Orchestration overhead: <10ms per state
 * - Total overhead for full flow: <100ms
 *
 * After refactoring, we'll compare against these baselines and fail if:
 * - Per-state regression > 5ms
 * - Total regression > 40ms (8 states × 5ms)
 */

import path from 'node:path';

import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ContextAssembler } from '../../context/context_assembler.js';
import { DecisionJournal } from '../../memory/decision_journal.js';
import { KnowledgeBaseResources } from '../../memory/kb_resources.js';
import { ProjectIndex } from '../../memory/project_index.js';
import { RunEphemeralMemory } from '../../memory/run_ephemeral.js';
import { ComplexityRouter } from '../complexity_router.js';
import { CriticalAgent } from '../critical_agent.js';
import { ImplementerAgent } from '../implementer_agent.js';
import type { ModelRouter, ModelSelection } from '../model_router.js';
import { PlannerAgent } from '../planner_agent.js';
import { ReviewerAgent } from '../reviewer_agent.js';
import { SupervisorAgent } from '../supervisor.js';
import { ThinkerAgent } from '../thinker_agent.js';
import { Verifier } from '../verifier.js';
import { StateGraph } from '../state_graph.js';

type ContextEmitFn = OmitThisParameter<ContextAssembler['emit']>;

const cwd = process.cwd();
const repoRoot = cwd.endsWith(`${path.sep}tools${path.sep}wvo_mcp`)
  ? path.resolve(cwd, '..', '..')
  : cwd;

describe('StateGraph Performance Baseline (SPIKE 1)', () => {
  let stateGraph: StateGraph;
  let contextEmitSpy: ReturnType<typeof vi.fn>;

  const task = {
    id: 'PERF-TEST-1',
    title: 'Performance baseline measurement',
    priorityTags: ['p0'],
  };

  beforeEach(() => {
    const selection: ModelSelection = {
      model: 'codex-5-high',
      provider: 'anthropic',
      capabilityTags: ['reasoning_high'],
      source: 'policy',
      reason: 'test',
    };

    const router: ModelRouter = {
      pickModel: vi.fn(() => selection),
      noteVerifyFailure: vi.fn(),
      clearTask: vi.fn(),
      setDecisionLogger: vi.fn(),
    } as unknown as ModelRouter;

    const journal = new DecisionJournal({
      workspaceRoot: repoRoot,
      runId: 'perf-baseline',
      disabled: true,
    });

    const memory = new RunEphemeralMemory();
    const kb = new KnowledgeBaseResources(repoRoot);
    const projectIndex = new ProjectIndex(repoRoot);

    const planner = new PlannerAgent({ router, memory, kb, projectIndex });
    const thinker = new ThinkerAgent(router);
    const implementer = new ImplementerAgent({ router, memory });
    const verifier = new Verifier(0.05);
    const reviewer = new ReviewerAgent(router);
    const critical = new CriticalAgent();
    const supervisor = new SupervisorAgent(router);
    const complexityRouter = new ComplexityRouter();

    contextEmitSpy = vi.fn(async () => 'context://stub');

    stateGraph = new StateGraph(
      {
        planner,
        thinker,
        implementer,
        verifier,
        reviewer,
        critical,
        supervisor,
        router,
        complexityRouter,
        journal,
        memory,
        contextAssembler: { emit: contextEmitSpy } as unknown as ContextAssembler,
      },
      {
        workspaceRoot: repoRoot,
        runId: 'perf-baseline',
      }
    );
  });

  it('measures baseline: single task full flow', async () => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    const result = await stateGraph.run(task);

    const duration = Date.now() - startTime;
    const memoryDelta = process.memoryUsage().heapUsed - startMemory;

    // Log baseline metrics
    console.log('\n📊 BASELINE METRICS (Single Task):');
    console.log(`   Total duration: ${duration}ms`);
    console.log(`   Memory delta: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Final state: ${result.finalState}`);

    // Record artifacts for comparison
    expect(result).toBeDefined();
    expect(duration).toBeLessThan(5000); // Sanity check: <5s for full flow
    expect(memoryDelta).toBeLessThan(50 * 1024 * 1024); // Sanity check: <50MB
  });

  it('measures baseline: 10 tasks sequential', async () => {
    const durations: number[] = [];
    const memoryReadings: number[] = [];

    for (let i = 0; i < 10; i++) {
      const taskI = { ...task, id: `PERF-TEST-${i}` };

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      await stateGraph.run(taskI);

      durations.push(Date.now() - startTime);
      memoryReadings.push(process.memoryUsage().heapUsed - startMemory);
    }

    // Calculate statistics
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const sorted = [...durations].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(durations.length * 0.5)];
    const p95 = sorted[Math.floor(durations.length * 0.95)];

    const avgMemory = memoryReadings.reduce((a, b) => a + b, 0) / memoryReadings.length;

    console.log('\n📊 BASELINE METRICS (10 Tasks):');
    console.log(`   Avg duration: ${avg.toFixed(2)}ms`);
    console.log(`   p50 duration: ${p50}ms`);
    console.log(`   p95 duration: ${p95}ms`);
    console.log(`   Avg memory: ${(avgMemory / 1024 / 1024).toFixed(2)}MB`);

    // Sanity checks
    expect(avg).toBeLessThan(5000);
    expect(p95).toBeLessThan(10000);
    expect(avgMemory).toBeLessThan(50 * 1024 * 1024);
  });

  it('measures baseline: context pack emissions', async () => {
    await stateGraph.run(task);

    // Count context pack emissions (one per state that runs)
    const emitCount = contextEmitSpy.mock.calls.length;

    console.log('\n📊 BASELINE METRICS (Context Packs):');
    console.log(`   Context packs emitted: ${emitCount}`);
    console.log(`   States visited: ${emitCount}`);

    // Should emit context packs for each state
    expect(emitCount).toBeGreaterThan(0);
    expect(emitCount).toBeLessThanOrEqual(8); // Max 8 states
  });

  it('measures baseline: memory stability over 100 tasks', async () => {
    const memoryReadings: number[] = [];

    for (let i = 0; i < 100; i++) {
      const taskI = { ...task, id: `PERF-TEST-${i}` };
      await stateGraph.run(taskI);

      // Sample every 10 tasks
      if (i % 10 === 0) {
        if (global.gc) global.gc();
        memoryReadings.push(process.memoryUsage().heapUsed);
      }
    }

    const firstReading = memoryReadings[0];
    const lastReading = memoryReadings[memoryReadings.length - 1];
    const memoryGrowth = lastReading - firstReading;

    console.log('\n📊 BASELINE METRICS (Memory Stability):');
    console.log(`   First reading: ${(firstReading / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Last reading: ${(lastReading / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);

    // Memory should not grow unbounded
    expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024); // <20MB growth over 100 tasks
  }, 60000); // 60s timeout for 100 tasks
});

/**
 * BASELINE RESULTS (to be filled in after running):
 *
 * Single Task:
 * - Duration: ___ms
 * - Memory: ___MB
 *
 * 10 Tasks:
 * - Avg: ___ms
 * - p50: ___ms
 * - p95: ___ms
 *
 * 100 Tasks:
 * - Memory growth: ___MB
 *
 * REGRESSION TARGETS (after refactoring):
 * - Per-task regression: <5ms (99th percentile)
 * - Memory regression: <2MB per 100 tasks
 * - Context pack count: same as baseline
 */
