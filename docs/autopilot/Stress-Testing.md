
# Stress & Resilience Testing

**Categories & Targets**
1) High‑Volume — 1000+ iterations. Targets: sync p50<10ms/p95<50ms/p99<100ms; async p50<100ms/p95<500ms/p99<1s.
2) Concurrency & Races — 10–100 parallel ops; assert no corruption.
3) Memory Leak — 100+ iterations; growth <5MB/100 runs; force GC if available.
4) Edge & Malformed — long strings (≥1000 chars), MAX_SAFE_INTEGER, `../../../etc/passwd`, null/empty.
5) Performance Benchmarks — compare to baseline p50/p95/p99; fail if regression >50%.
6) Resource Exhaustion — disk full, timeouts, 429/5xx; graceful degradation.
7) Unforeseen Errors — fuzz; document new bugs.

**Example:** ENAMETOOLONG on long runIds fixed by truncation/hashing.

**Artifacts:** include raw results and any flamegraphs in the PR.
