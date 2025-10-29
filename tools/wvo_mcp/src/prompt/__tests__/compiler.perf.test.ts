import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';
import { PromptCompiler, type PromptInput } from '../compiler';

/**
 * Performance budget tests for prompt compilation.
 *
 * Targets (from SPEC AC5):
 * - p50 < 5ms
 * - p95 < 10ms
 * - p99 < 20ms
 *
 * Run with: npm test -- compiler.perf.test.ts
 */
describe('PromptCompiler Performance', () => {
  it('should meet p95 <10ms latency budget (1000 iterations)', () => {
    const input: PromptInput = {
      system: 'You are Claude, an AI assistant for software engineering. You help with planning, coding, and debugging.',
      phase: 'STRATEGIZE: Define objective, identify top 2 risks, set success KPIs, and link to long-lived invariants.',
      domain: 'api',
      skills: 'TypeScript, Node.js, Vitest, Performance optimization',
      rubric: 'All code must be tested, documented, and meet performance budgets.',
      context: 'Task: IMP-21 - Prompt Compiler (Skeleton + Canonicalization)',
    };

    const compiler = new PromptCompiler();
    const times: number[] = [];

    // Warm-up (5 runs)
    for (let i = 0; i < 5; i++) {
      compiler.compile(input);
    }

    // Actual benchmark (1000 runs)
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      compiler.compile(input);
      times.push(performance.now() - start);
    }

    // Calculate percentiles
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.50)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];
    const max = times[times.length - 1];

    console.log('\nPerformance Results (1000 iterations):');
    console.log(`  p50: ${p50.toFixed(2)}ms`);
    console.log(`  p95: ${p95.toFixed(2)}ms`);
    console.log(`  p99: ${p99.toFixed(2)}ms`);
    console.log(`  max: ${max.toFixed(2)}ms`);

    // Verify budgets
    expect(p50).toBeLessThan(5); // p50 < 5ms
    expect(p95).toBeLessThan(10); // p95 < 10ms
    expect(p99).toBeLessThan(20); // p99 < 20ms
  });

  it('should handle large prompts within budget', () => {
    // Create a large prompt input (~5KB)
    const largeText = 'Lorem ipsum dolor sit amet. '.repeat(50);
    const input: PromptInput = {
      system: `You are Claude. ${largeText}`,
      phase: `STRATEGIZE: ${largeText}`,
      domain: 'api',
      skills: largeText,
      rubric: largeText,
      context: largeText,
    };

    const compiler = new PromptCompiler();
    const times: number[] = [];

    // Run 100 iterations (fewer for large inputs)
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      compiler.compile(input);
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];

    console.log(`\nLarge prompt p95: ${p95.toFixed(2)}ms`);

    // More lenient budget for large prompts
    expect(p95).toBeLessThan(50); // p95 < 50ms
  });

  it('should not leak memory over many iterations', () => {
    const input: PromptInput = {
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
    };

    const compiler = new PromptCompiler();

    // Force GC if available (run with --expose-gc)
    if (global.gc) {
      global.gc();
    }

    const initialMemory = process.memoryUsage().heapUsed;

    // Run 10,000 iterations
    for (let i = 0; i < 10000; i++) {
      compiler.compile(input);
    }

    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

    console.log(`\nMemory increase after 10k iterations: ${memoryIncrease.toFixed(2)}MB`);

    // Memory increase should be minimal (<10MB)
    expect(memoryIncrease).toBeLessThan(10);
  });

  it('should have consistent performance across restarts', () => {
    const input: PromptInput = {
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      context: 'Task 1',
    };

    const compiler = new PromptCompiler();

    // Run 3 batches of 100 iterations
    const batchResults: number[] = [];

    for (let batch = 0; batch < 3; batch++) {
      const times: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        compiler.compile(input);
        times.push(performance.now() - start);
      }

      times.sort((a, b) => a - b);
      const p95 = times[Math.floor(times.length * 0.95)];
      batchResults.push(p95);
    }

    console.log(`\nBatch p95 results: ${batchResults.map(x => x.toFixed(2)).join('ms, ')}ms`);

    // All batches should be within 2x of each other (consistency)
    const minP95 = Math.min(...batchResults);
    const maxP95 = Math.max(...batchResults);
    const ratio = maxP95 / minP95;

    expect(ratio).toBeLessThan(2); // Variance < 2x
  });
});
