
# Claude Agent Handbook (Claude / MCP)

> **Scope:** Claude-specific agent guide. Mirrors `AGENTS.md` (Codex) but sets **Claude-specific stability/telemetry**. Autopilot (MCP orchestration layer) uses this when Claude acts. **WeatherVane** is a separate product Autopilot builds/operates via MCP tools (see `docs/weathervane/Product-Handbook.md`).

## 1) Rapid Orientation
- Start each loop: `plan_next --minimal`, `autopilot_status`. If either fails: `./autopilot/scripts/restart_mcp.sh` and log to `state/analytics/health_checks.jsonl`.
- **NO FOLLOW-UPS**: `Strategize → Spec → Plan → Think → Implement → Verify → Review → PR → Monitor`. Finish in one session; build=0 errors; tests pass; docs done.
- Respect consensus: failed-quorum decisions spawn follow-ups (Atlas/Dana).
- Token hygiene: keep `state/context.md` ≲ 1,000 words (backups in `state/backups/context/`).

## 2) Claude Call Stability (required)
- Pin **model** to fully qualified build (e.g., `claude-sonnet-4-5-20250929` when available).
- Send and log **`anthropic-version`** header; log model name, stop reason, token usage.
- Use `temperature: 0` for repeatability (not perfect determinism) and **record** request/response JSON.
- Declare MCP servers via explicit allowlist; log negotiated set per session.

## 3) Integration‑First Development (Search → Integrate → Verify)
- Search existing registries/discovery/cache/auth/config.
- Integrate/extend; do not duplicate.
- Verify programmatically; see `docs/autopilot/Integration-Verification.md`.

## 4) Multi‑Agent Controls
- **Supervisor** gate; optional human-in-the-loop.
- **Blackboard** events (Redis Streams/Kafka): `PlanProposed`, `ToolExecuted`, `ReviewAccepted` with `task_id`, `agent_id`, `plan_hash`, `parent_event_id`, `idempotency_key`, `schema_version`.
- **Leases & idempotency** around side-effects; shard-lock state transitions.
- **Loop guard**: rolling hash of (prompt, plan, tool spec) → if repeated ≥3×/10m mutate (alt tool/seed) or escalate.

## 5) Observability (OpenTelemetry GenAI)
- Trace each state/step/tool as GenAI spans with token/latency attrs.
- Metrics: `tasks_success_total`, `plan_loop_detected_total`, `tool_latency_ms_bucket`, `queue_depth`, `lease_timeouts_total`.
- SLOs: success ≥95%, loop ≤2%, planner→tool p95 ≤1.5s, tool MTTR ≤30s.

## 6) Review & Zero-Gaps
- Inline evaluators (groundedness/relevance/completeness) gate Review; failing scores return to Implement.
- **Gap = fail**: placeholders, missing integrations, TODOs in prod, untested critical paths, unmet acceptance criteria.

## 7) Escalation Rules
- Same error ≥3×, no progress >90m, or >5 iterations without resolution ⇒ **ESCALATE** with loop diary + proposed fix.

**See also:** Core/Extended council docs, Inline-Evals, Observability, MCP-Servers under `docs/autopilot/`.
