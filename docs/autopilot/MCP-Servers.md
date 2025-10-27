
# Remote MCP Servers — Patterns & Hardening

- **Separation:** Autopilot (client) connects to **remote** MCP servers exposing product tools (model registry, allocator, repo ops, telemetry).
- **Allowlist:** static server list; signed configs; per‑tool ACLs.
- **Security:** mTLS/signed tokens; redact PII; quotas & rate limits.
- **Versioning:** semver in tool schemas; graceful deprecation.
- **Observability:** propagate trace context; export per‑tool latencies and error taxonomy.
