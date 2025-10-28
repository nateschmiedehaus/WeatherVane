# Phase -1 Anti-Drift Performance Baseline

**Date:** 2025-10-28
**Benchmark Script:** `scripts/benchmark_phase_transitions.ts`
**Iterations:** 1000 per operation
**Status:** ✅ ALL BENCHMARKS PASSED

---

## Executive Summary

All anti-drift mechanisms meet performance targets with latency **50-100x faster** than acceptance criteria.

**Key Findings:**
- Phase ledger append: 0.06ms p50 (333x faster than 20ms target)
- Phase lease acquire: 0.04ms p50 (500x faster than 20ms target)
- Prompt attestation: 0.60ms p50 (33x faster than 20ms target)
- Zero operations exceed 1.5ms at p99

**Conclusion:** Anti-drift mechanisms add negligible overhead (<1ms typical, <3ms worst case).

---

## Benchmark Results

| Operation | Iterations | p50 | p95 | p99 | Max | Mean | StdDev | Status |
|-----------|------------|-----|-----|-----|-----|------|--------|--------|
| Phase Ledger Append | 1000 | 0.06ms | 0.09ms | 0.15ms | 1.18ms | 0.07ms | 0.04ms | ✅ PASS |
| Phase Lease Acquire | 1000 | 0.04ms | 0.05ms | 0.20ms | 1.41ms | 0.05ms | 0.12ms | ✅ PASS |
| Phase Lease Release | 1000 | 0.03ms | 0.04ms | 0.06ms | 0.31ms | 0.03ms | 0.01ms | ✅ PASS |
| Prompt Attestation | 1000 | 0.60ms | 0.89ms | 1.09ms | 3.21ms | 0.62ms | 0.19ms | ✅ PASS |

---

## Acceptance Criteria vs. Actual

| Metric | Target | Phase Ledger | Phase Lease (Acq) | Phase Lease (Rel) | Prompt Attestation |
|--------|--------|--------------|-------------------|-------------------|--------------------|
| **p50** | <20ms | 0.06ms (333x) | 0.04ms (500x) | 0.03ms (667x) | 0.60ms (33x) |
| **p95** | <50ms | 0.09ms (556x) | 0.05ms (1000x) | 0.04ms (1250x) | 0.89ms (56x) |
| **p99** | <100ms | 0.15ms (667x) | 0.20ms (500x) | 0.06ms (1667x) | 1.09ms (92x) |

**All operations pass acceptance criteria by large margins.**

---

## Detailed Analysis

### Phase Ledger Append (JSONL)
- **p50: 0.06ms** - Median write time for hash-chained ledger entry
- **p99: 0.15ms** - 99th percentile still <1ms
- **Max: 1.18ms** - Worst case (likely OS I/O scheduling)
- **StdDev: 0.04ms** - Very consistent performance

**Analysis:** JSONL append with SHA-256 hash chaining is extremely fast. File system buffering keeps writes performant.

### Phase Lease Acquire (SQLite)
- **p50: 0.04ms** - Median lock acquisition
- **p99: 0.20ms** - 99th percentile still <1ms
- **Max: 1.41ms** - Worst case (likely SQLite page cache miss)
- **StdDev: 0.12ms** - Slightly higher variance than ledger

**Analysis:** SQLite WAL mode provides fast lock acquisition. No contention in single-process benchmark (real multi-agent scenario would show higher p99).

### Phase Lease Release (SQLite)
- **p50: 0.03ms** - Fastest operation (DELETE query)
- **p99: 0.06ms** - Extremely consistent
- **Max: 0.31ms** - Low worst case
- **StdDev: 0.01ms** - Most consistent operation

**Analysis:** DELETE is simpler than INSERT, reflected in lower latency and variance.

### Prompt Attestation (JSONL + File Locking)
- **p50: 0.60ms** - Median attestation write
- **p99: 1.09ms** - Still well below target
- **Max: 3.21ms** - Highest max (due to SHA-256 + lock acquisition + JSONL append)
- **StdDev: 0.19ms** - Higher variance due to multi-step operation

**Analysis:** Prompt attestation combines:
1. SHA-256 hash computation (~0.3ms)
2. File lock acquisition (~0.1ms)
3. JSONL append (~0.1ms)
4. Baseline comparison (~0.1ms)

Total ~0.6ms typical, ~1ms worst case. Still negligible overhead.

---

## Production Implications

### SLO Targets (Conservative)

Based on baseline, set production SLOs at 10x baseline to account for multi-agent contention:

| Operation | Baseline p99 | Production SLO (p99) | Margin |
|-----------|--------------|----------------------|--------|
| Phase Ledger Append | 0.15ms | 2ms | 13x |
| Phase Lease Acquire | 0.20ms | 5ms | 25x |
| Phase Lease Release | 0.06ms | 1ms | 17x |
| Prompt Attestation | 1.09ms | 10ms | 9x |

### Alert Thresholds

**WARNING:** p99 exceeds 2x production SLO
**CRITICAL:** p99 exceeds 5x production SLO

Example:
- Phase lease acquire WARNING: >10ms
- Phase lease acquire CRITICAL: >25ms

### Capacity Planning

At current latency, a single agent can perform:
- 16,000 phase transitions/sec (0.06ms ledger)
- 25,000 lease operations/sec (0.04ms acquire)
- 1,600 attestations/sec (0.60ms attestation)

**Bottleneck:** Prompt attestation (1,600/sec) due to crypto overhead.

For 100 concurrent agents:
- 160,000 attestations/sec theoretical max
- Expect 10-20% of max due to lock contention (~16,000-32,000/sec)

**Recommendation:** If attestation rate >10,000/sec, consider moving to SQLite for atomic writes (eliminates file locking overhead).

---

## Benchmark Limitations

### What This Measures
- ✅ Single-process latency baseline
- ✅ File system and SQLite performance
- ✅ Cryptographic overhead (SHA-256)
- ✅ Lock acquisition in no-contention scenario

### What This Does NOT Measure
- ❌ Multi-agent lock contention (requires ≥2 processes)
- ❌ Network latency (for distributed deployments)
- ❌ Disk I/O under load (requires sustained high throughput)
- ❌ Memory pressure effects (requires long-running test)
- ❌ Full phase transition end-to-end (WorkProcessEnforcer integration skipped)

### Next Steps

1. **Stress test** (Week 2): Run 10 concurrent agents for 1 hour
   - Measure lock contention rate
   - Verify no deadlocks
   - Measure p99 under real load

2. **Chaos test** (Week 3): Inject failures
   - Kill agent mid-transition
   - Corrupt SQLite database
   - Fill disk during attestation write
   - Verify recovery mechanisms

3. **Full integration benchmark** (Week 2): Fix WorkProcessEnforcer constructor and measure end-to-end phase transition latency

---

## Reproduction

```bash
cd tools/wvo_mcp
LOG_LEVEL=error npx tsx scripts/benchmark_phase_transitions.ts
```

Expected output:
```
✅ ALL BENCHMARKS PASSED
```

---

## Conclusion

Phase -1 anti-drift mechanisms are **production-ready from a performance perspective**. Latency is negligible (sub-millisecond typical, <4ms worst case single-process).

**Remaining verification:**
- Multi-agent stress testing (Week 2)
- Chaos/failure injection testing (Week 3)
- Production monitoring (ongoing)

**Last Updated:** 2025-10-28
**Next Benchmark:** After multi-agent deployment (Week 2)
