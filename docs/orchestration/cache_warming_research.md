# Cache Warming Research Memo

## Purpose
Map a cache warming approach for WeatherVane orchestration that lowers cold-start latency without flooding upstream systems. The memo distils academic and industry patterns, evaluates their behaviour using an in-repo simulation helper, and recommends a guard-railed rollout path.

## Strategy Archetypes
- **Static warmers** preload the hottest keys on a schedule. They are operationally predictable and easy to reason about, but churn in the hotset inflates maintenance traffic and leaves the tail cold.
- **Predictive prefetchers** forecast future demand (e.g., via ML or recent access windows) and warm a slightly larger working set. They excel when predictions are accurate and the cache has enough headroom, but precision dips can saturate dependencies.
- **Demand-first caches** rely on natural reuse. They minimise write amplification yet keep cold misses expensive, which is unacceptable for WeatherOps dashboards where allocator and weather panels must wake up instantly during incident response.

## Simulation Findings
We captured the research scenarios in code (`shared/libs/performance/cache_warming.py`) and exercised them with unit tests (`tests/shared/libs/test_cache_warming.py`) to ensure the model flags risk conditions. Running the helper against a representative Product workload (210 req/min, 42% hotset, 20% hourly churn, 100 ms cold penalty) yields:

| Strategy    | Expected latency (ms) | Ops load/min | Warm coverage | Risk flags |
|-------------|----------------------:|--------------:|---------------:|------------|
| predictive  | 59.1                  | 5.30          | 0.55           | –          |
| static      | 72.0                  | 0.29          | 0.42           | –          |
| demand      | 80.4                  | 0.02          | 0.34           | low steady hit rate |

**Interpretation**
1. Predictive prefetching wins when recall ≥0.85 and precision ≥0.8; it buys ~20 ms versus static warmers even after accounting for extra warm traffic.
2. Static warmers are the safe fallback. If predictive precision dips below 0.75, the helper immediately surfaces the `prefetch-precision-low` risk so orchestration can fall back without manual babysitting.
3. Demand-only caching never meets WeatherOps SLOs in the sampled workloads because churned tenants cause long cold bursts that also de-optimise the allocator critic.

## Recommendation
Adopt a **hybrid predictive + safety rails** approach:
1. Keep the static hotset (top tenants, weather tiles, allocator projections) preloaded to guarantee baseline coverage.
2. Layer predictive prefetching on surplus capacity. Route predictions through Feature Store telemetry and clamp the warmed set when precision drops below 0.78 or churn spikes >30%.
3. Instrument the orchestrator to read the helper outputs so critic automation can flip between profiles without bespoke reasoning.

## Edge Cases & Safeguards
- Tenants with bursty promo launches: ensure the predictor receives promo schedules; otherwise set a manual warm range to dodge the `insufficient-recall-for-tail-traffic` flag.
- Sparse geographies with thin telemetry: fall back to static warming and log a director follow-up; the helper highlights capacity shortfalls when cache capacity lags the hotset.
- Integrity suite interactions: predictive warming must respect existing command allowlists; no shell chaining or dynamic command injection is required because the helper operates inside Python.

## Implementation Notes for Orchestration
- Embed the helper in the MCP orchestration planner so coordinator runs can simulate options before issuing worker commands.
- Persist metrics (precision, recall, churn) in `shared/data_context` to avoid recomputing per run and to keep the research assumptions observable.
- Surface `risk_flags` through the WeatherOps dashboard to explain why the system shifted warming strategies during audits.

## Follow-ups
1. Capture real precision/recall traces from the suggestion telemetry feed and feed them into the helper for calibration.
2. Wire the helper into the consolidated integrity suite once Director Dana unblocks the remaining MCP follow-ups.
3. Document operational runbooks (rolling deployments, failure fallbacks) once the predictor is instrumented in staging.
