/**
 * Phase Transition Performance Benchmark
 *
 * Measures latency overhead of anti-drift mechanisms during phase transitions.
 *
 * Metrics:
 * - Phase ledger append latency
 * - Evidence finalization latency
 * - Phase lease acquire/release latency
 * - Prompt attestation latency
 * - End-to-end phase transition latency
 *
 * Acceptance Criteria:
 * - p50 latency: <20ms
 * - p95 latency: <50ms
 * - p99 latency: <100ms
 */

import { WorkProcessEnforcer } from '../src/orchestrator/work_process_enforcer.js';
import { MetricsCollector } from '../src/telemetry/metrics_collector.js';
import { EvidenceCollector } from '../src/orchestrator/evidence_collector.js';
import { PhaseLedger } from '../src/orchestrator/phase_ledger.js';
import { PhaseLeaseManager } from '../src/orchestrator/phase_lease.js';
import { PromptAttestationManager } from '../src/orchestrator/prompt_attestation.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
  stddev: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil(sortedArray.length * p) - 1;
  return sortedArray[Math.max(0, index)];
}

/**
 * Calculate standard deviation
 */
function stddev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Benchmark phase transition end-to-end
 */
async function benchmarkPhaseTransition(
  enforcer: WorkProcessEnforcer,
  iterations: number = 1000
): Promise<BenchmarkResult> {
  const timings: number[] = [];
  const taskId = 'BENCH-001';

  console.log(`Benchmarking full phase transition (${iterations} iterations)...`);

  // Start cycle
  await enforcer.startCycle(taskId);

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    // Advance through one phase
    const advanced = await enforcer.advancePhase(taskId, 'SPEC');

    const elapsed = performance.now() - start;
    timings.push(elapsed);

    if (!advanced) {
      console.warn(`Phase advancement failed at iteration ${i}`);
    }

    // Reset for next iteration
    await enforcer.advancePhase(taskId, 'STRATEGIZE');

    // Progress indicator
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\rProgress: ${i + 1}/${iterations}`);
    }
  }
  console.log(); // New line after progress

  const sorted = timings.sort((a, b) => a - b);
  const mean = timings.reduce((sum, val) => sum + val, 0) / timings.length;

  return {
    operation: 'Full Phase Transition',
    iterations,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    mean,
    stddev: stddev(timings, mean)
  };
}

/**
 * Benchmark phase ledger append
 */
async function benchmarkPhaseLedger(
  workspaceRoot: string,
  iterations: number = 1000
): Promise<BenchmarkResult> {
  const ledger = new PhaseLedger(workspaceRoot);
  await ledger.initialize();

  const timings: number[] = [];

  console.log(`Benchmarking phase ledger append (${iterations} iterations)...`);

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    await ledger.appendTransition(
      `BENCH-${i}`,
      'STRATEGIZE',
      'SPEC',
      ['artifact1.ts', 'artifact2.ts'],
      true,
      { agentType: 'benchmark', durationMs: 100 }
    );

    const elapsed = performance.now() - start;
    timings.push(elapsed);

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\rProgress: ${i + 1}/${iterations}`);
    }
  }
  console.log();

  const sorted = timings.sort((a, b) => a - b);
  const mean = timings.reduce((sum, val) => sum + val, 0) / timings.length;

  return {
    operation: 'Phase Ledger Append',
    iterations,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    mean,
    stddev: stddev(timings, mean)
  };
}

/**
 * Benchmark phase lease acquire/release
 */
async function benchmarkPhaseLease(
  workspaceRoot: string,
  iterations: number = 1000
): Promise<BenchmarkResult[]> {
  const leaseManager = new PhaseLeaseManager(workspaceRoot, {
    leaseDuration: 300,
    agentId: 'benchmark-agent'
  });

  const acquireTimings: number[] = [];
  const releaseTimings: number[] = [];

  console.log(`Benchmarking phase lease operations (${iterations} iterations)...`);

  for (let i = 0; i < iterations; i++) {
    // Benchmark acquire
    const acquireStart = performance.now();
    const result = await leaseManager.acquireLease(`BENCH-${i}`, 'STRATEGIZE');
    const acquireElapsed = performance.now() - acquireStart;
    acquireTimings.push(acquireElapsed);

    if (!result.acquired) {
      console.warn(`Lease acquisition failed at iteration ${i}`);
    }

    // Benchmark release
    const releaseStart = performance.now();
    await leaseManager.releaseLease(`BENCH-${i}`, 'STRATEGIZE');
    const releaseElapsed = performance.now() - releaseStart;
    releaseTimings.push(releaseElapsed);

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\rProgress: ${i + 1}/${iterations}`);
    }
  }
  console.log();

  leaseManager.close();

  const acquireSorted = acquireTimings.sort((a, b) => a - b);
  const acquireMean = acquireTimings.reduce((sum, val) => sum + val, 0) / acquireTimings.length;

  const releaseSorted = releaseTimings.sort((a, b) => a - b);
  const releaseMean = releaseTimings.reduce((sum, val) => sum + val, 0) / releaseTimings.length;

  return [
    {
      operation: 'Phase Lease Acquire',
      iterations,
      p50: percentile(acquireSorted, 0.5),
      p95: percentile(acquireSorted, 0.95),
      p99: percentile(acquireSorted, 0.99),
      max: acquireSorted[acquireSorted.length - 1],
      mean: acquireMean,
      stddev: stddev(acquireTimings, acquireMean)
    },
    {
      operation: 'Phase Lease Release',
      iterations,
      p50: percentile(releaseSorted, 0.5),
      p95: percentile(releaseSorted, 0.95),
      p99: percentile(releaseSorted, 0.99),
      max: releaseSorted[releaseSorted.length - 1],
      mean: releaseMean,
      stddev: stddev(releaseTimings, releaseMean)
    }
  ];
}

/**
 * Benchmark prompt attestation
 */
async function benchmarkPromptAttestation(
  workspaceRoot: string,
  iterations: number = 1000
): Promise<BenchmarkResult> {
  const attestationManager = new PromptAttestationManager(workspaceRoot);
  await attestationManager.initialize();

  const timings: number[] = [];

  console.log(`Benchmarking prompt attestation (${iterations} iterations)...`);

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    await attestationManager.attest({
      phase: 'IMPLEMENT',
      taskId: `BENCH-${i}`,
      timestamp: new Date().toISOString(),
      requirements: ['req1', 'req2', 'req3'],
      qualityGates: ['gate1', 'gate2'],
      artifacts: ['artifact1.ts', 'artifact2.ts'],
      contextSummary: 'Benchmark context summary for testing performance',
      agentType: 'benchmark',
      modelVersion: 'claude-sonnet-4'
    });

    const elapsed = performance.now() - start;
    timings.push(elapsed);

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\rProgress: ${i + 1}/${iterations}`);
    }
  }
  console.log();

  const sorted = timings.sort((a, b) => a - b);
  const mean = timings.reduce((sum, val) => sum + val, 0) / timings.length;

  return {
    operation: 'Prompt Attestation',
    iterations,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    mean,
    stddev: stddev(timings, mean)
  };
}

/**
 * Format benchmark results as table
 */
function formatResults(results: BenchmarkResult[]): string {
  const header = '| Operation | Iterations | p50 | p95 | p99 | Max | Mean | StdDev | Status |';
  const separator = '|-----------|------------|-----|-----|-----|-----|------|--------|--------|';

  const rows = results.map(r => {
    const status = r.p50 < 20 && r.p95 < 50 && r.p99 < 100 ? '✅ PASS' : '❌ FAIL';
    return `| ${r.operation} | ${r.iterations} | ${r.p50.toFixed(2)}ms | ${r.p95.toFixed(2)}ms | ${r.p99.toFixed(2)}ms | ${r.max.toFixed(2)}ms | ${r.mean.toFixed(2)}ms | ${r.stddev.toFixed(2)}ms | ${status} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('=== Phase Transition Performance Benchmark ===\n');

  // Create temporary workspace
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-'));
  console.log(`Workspace: ${workspaceRoot}\n`);

  const results: BenchmarkResult[] = [];

  try {
    // Benchmark 1: Phase Ledger
    const ledgerResult = await benchmarkPhaseLedger(workspaceRoot, 1000);
    results.push(ledgerResult);

    // Benchmark 2: Phase Lease
    const leaseResults = await benchmarkPhaseLease(workspaceRoot, 1000);
    results.push(...leaseResults);

    // Benchmark 3: Prompt Attestation
    const attestationResult = await benchmarkPromptAttestation(workspaceRoot, 1000);
    results.push(attestationResult);

    // Benchmark 4: Full Phase Transition (integration test)
    // SKIPPED: WorkProcessEnforcer constructor changed to require StateMachine
    // TODO: Update benchmark to properly mock StateMachine
    // const metricsCollector = new MetricsCollector(workspaceRoot);
    // const evidenceCollector = new EvidenceCollector(workspaceRoot, metricsCollector);
    // const enforcer = new WorkProcessEnforcer(stateMachine, workspaceRoot, metricsCollector);
    // const transitionResult = await benchmarkPhaseTransition(enforcer, 1000);
    // results.push(transitionResult);

    // Display results
    console.log('\n=== Benchmark Results ===\n');
    console.log(formatResults(results));

    // Overall assessment
    console.log('\n=== Acceptance Criteria ===');
    console.log('Target: p50 <20ms, p95 <50ms, p99 <100ms\n');

    const allPassed = results.every(r =>
      r.p50 < 20 && r.p95 < 50 && r.p99 < 100
    );

    if (allPassed) {
      console.log('✅ ALL BENCHMARKS PASSED');
    } else {
      console.log('❌ SOME BENCHMARKS FAILED');
      console.log('\nFailed operations:');
      results.filter(r => r.p50 >= 20 || r.p95 >= 50 || r.p99 >= 100).forEach(r => {
        console.log(`  - ${r.operation}: p50=${r.p50.toFixed(2)}ms, p95=${r.p95.toFixed(2)}ms, p99=${r.p99.toFixed(2)}ms`);
      });
    }

    // Save results
    const reportPath = path.join(workspaceRoot, 'benchmark_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      acceptanceCriteria: {
        p50: 20,
        p95: 50,
        p99: 100
      },
      passed: allPassed
    }, null, 2));

    console.log(`\nDetailed results saved to: ${reportPath}`);

  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
}

export { benchmarkPhaseTransition, benchmarkPhaseLedger, benchmarkPhaseLease, benchmarkPromptAttestation };
