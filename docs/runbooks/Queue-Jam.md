
# Runbook: Queue Jam

**Symptoms:** growing queue depth, lease timeouts, throughput down.

**Actions:**
1) Extend visibility timeout to ≥2× current p95.
2) Shard queue by task type; increase workers within token budget.
3) Split hotspot tasks into sub‑tasks.

**Verify:** queue half‑life <10m.
