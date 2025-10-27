
# Claude Council — Extended Protocols & Quality Standards

- **SLOs:** success ≥95% (rolling 200), loop ≤2%, MTTR_tool ≤30s, planner→tool p95 ≤1.5s.
- **Methods:** Synthetic Data Simulation; Controlled Integration Harness; Incremental Capability Verification; Property‑Based Testing; Regression Benchmarking; Snapshot/Visual; State Space; Chaos/Fault Injection; Five Whys/Pre‑Mortem/Fault Tree/FMEA; Trace & Profiling.
- **Stress & Chaos:** high‑volume, concurrency, memory leak detection, edge inputs, resource exhaustion, unforeseen error injection.
- **Multi‑Agent:** typed events with leases/idempotency; shard locks; deterministic conflict scoring; Agent Quality Score (AQS).
- **Quality Gates:** Gate0 Contracts → Gate1 Build/Lint → Gate2 Tests/Coverage → Gate3 OAT/Stress → Gate4 Shadow/Canary.
- **Observability & RQS:** OTel GenAI spans; RQS = 0.4·Success + 0.2·(1‑Loop) + 0.2·Latency + 0.2·ErrorBudget (promote if >0.85).
- **Security & Config:** SBOM, pinned deps, secrets scan, env schema validation.
- **Runbooks:** rate‑limit, queue jam, loop spike, provider outage.
