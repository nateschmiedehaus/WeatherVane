
# Universal Test Standards (7 Dimensions)

1. Correctness — expected behavior, nominal inputs  
2. Regression Safety — prior behavior preserved unless intentional  
3. Edge Coverage — null/empty/extreme/malformed inputs  
4. Determinism/Flakiness — seeded stability; minimal retries  
5. Performance — p50/p95/p99 within budgets  
6. Security/Inputs — injection/path traversal/overflow denied  
7. Observability — spans/metrics/logs with IDs; errors surfaced

**Template:** Given/When/Then cases; edge input table; seeded property tests; performance assertions; negative tests; telemetry assertions.
