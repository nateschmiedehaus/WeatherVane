import { performance } from 'node:perf_hooks';
import { PromptCompiler } from '../src/prompt/compiler.js';
import type { PromptInput } from '../src/prompt/compiler.js';

function benchmarkOverlays() {
  const compiler = new PromptCompiler();
  
  const originalFlag = process.env.PROMPT_OVERLAYS;
  process.env.PROMPT_OVERLAYS = 'observe';
  
  console.log('IMP-23 Overlay Performance Benchmark');
  console.log('Target: p95 < 5ms overhead\n');
  
  // Baseline (no overlay)
  const baseline = measure(compiler, { system: 'You are Claude.', phase: 'IMPLEMENT' });
  
  // With overlay
  const withOverlay = measure(compiler, { system: 'You are Claude.', phase: 'IMPLEMENT', domain: 'orchestrator' });
  
  const overhead = withOverlay.p95 - baseline.p95;
  
  console.log('Baseline p95:', baseline.p95.toFixed(3), 'ms');
  console.log('With overlay p95:', withOverlay.p95.toFixed(3), 'ms');
  console.log('Overhead:', overhead.toFixed(3), 'ms');
  console.log();
  
  const pass = overhead < 5.0;
  console.log('AC6 Result:', pass ? '✅ PASS' : '❌ FAIL', '(target: <5ms)');
  
  process.env.PROMPT_OVERLAYS = originalFlag;
  return pass ? 0 : 1;
}

function measure(compiler: PromptCompiler, input: PromptInput) {
  const latencies: number[] = [];
  
  // Warm-up
  for (let i = 0; i < 10; i++) {
    compiler.compile(input);
  }
  
  // Measure 1000 iterations
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    compiler.compile(input);
    latencies.push(performance.now() - start);
  }
  
  latencies.sort((a, b) => a - b);
  return {
    p50: latencies[Math.floor(1000 * 0.50)],
    p95: latencies[Math.floor(1000 * 0.95)],
  };
}

process.exit(benchmarkOverlays());
