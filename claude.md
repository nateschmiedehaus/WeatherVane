# Claude Agent Handbook (Claude / MCP)

**Scope:** This is the Claude-specific agent guide. It mirrors [agent.md](agent.md) (Codex) but sets Claude-specific stability/telemetry requirements. Autopilot (the MCP orchestration layer) uses this guide when Claude is the actor. WeatherVane is a separate product the Autopilot builds/operates via MCP tools (see [docs/weathervane/Product-Handbook.md](docs/weathervane/Product-Handbook.md)).

---

## 🚨 CRITICAL: ALWAYS FINISH TASKS COMPLETELY - NO FOLLOW-UPS

**Policy:** When you start a task, you MUST finish it completely in the current session. **NO exceptions.**

**Rules:**
1. **No partial completion** - Don't stop at "functionally complete" or "mostly done"
2. **No "follow-up sessions"** - If you start SPEC, you finish MONITOR
3. **No deferring fixes** - If REVIEW finds issues, fix them NOW
4. **All acceptance criteria met** - Check every criterion before claiming done
5. **Build must pass** - 0 errors, 0 warnings
6. **All tests pass** - No skipped tests, no disabled tests
7. **Documentation complete** - Not "will document later"

**If you can't finish in current session:**
- You shouldn't have started the task
- Token budget too low? Stop at previous task
- Task too large? Break it down in PLAN stage

**Violations:**
- ❌ "Runners created, StateGraph refactoring is a follow-up"
- ❌ "Tests pass but build has errors - will fix later"
- ❌ "Core complete, documentation is follow-up"
- ✅ Complete ALL work before moving to next task

**See:** [docs/autopilot/Complete-Finish-Policy.md](docs/autopilot/Complete-Finish-Policy.md) for full policy

---

## 1) Rapid Orientation (read first)

**Start every loop** by calling MCP tools `plan_next --minimal` and `autopilot_status`. If either fails, run `./autopilot/scripts/restart_mcp.sh` and log to `state/analytics/health_checks.jsonl`.

**Finish in one loop:** Strategize → Spec → Plan → Think → Implement → Verify → Review → PR → Monitor. No partials; build=0 errors; all tests pass; docs done.

**Respect consensus:** Failed-quorum decisions spawn follow-ups for Atlas/Dana—use them instead of bypassing.

**Token hygiene:** Keep `state/context.md` ≲ 1,000 words; overflows are auto-backed up in `state/backups/context/`.

---

## 2) Claude Call Stability (required)

**Pin model** to a fully qualified version build (e.g., `claude-sonnet-4-5-YYYYMMDD` when available).

**Send and log** `anthropic-version` header; log model name, stop reason, and token usage.

**Determinism:** Use `temperature: 0` and deterministic decoding for repeatability; still not perfectly deterministic—always record request/response for replay.

**MCP servers:** Declare explicit allowlist; log negotiated servers per session.

---

## 3) Integration-First Development

**Search → Integrate → Verify** before you write code.

- **Search** for existing registries, discovery, cache, auth, config
- **Integrate** (extend existing systems), don't duplicate
- **Verify** with programmatic scripts (see [docs/autopilot/Integration-Verification.md](docs/autopilot/Integration-Verification.md))

**Red Flags:**
- ❌ Hardcoding values that should come from a system
- ❌ Creating new interfaces that duplicate existing ones
- ❌ Implementing functionality that already exists elsewhere
- ❌ Not using shared utilities (logger, config, cache, etc.)

---

## 4) Multi-Agent Controls

**Supervisor node** gates/branches plans and can require human approval.

**Blackboard** via Redis Streams/Kafka: post typed events `PlanProposed`, `ToolExecuted`, `ReviewAccepted` with `task_id`, `agent_id`, `plan_hash`, `parent_event_id`, `idempotency_key`, `schema_version`.

**Leases & idempotency:** Per-task visibility timeouts and idempotent side effects to prevent double-work at `MCP_AUTOPILOT>1`.

**Loop guard:** Rolling hash of `(prompt, plan, tool spec)` → if repeat ≥3×/10m: mutate (alt tool/seed), or escalate.

---

## 5) Observability (OpenTelemetry GenAI)

**Trace** each state/step/tool call as GenAI spans with token/latency attributes.

**Metrics:** `tasks_success_total`, `plan_loop_detected_total`, `tool_latency_ms_bucket`, `queue_depth`, `lease_timeouts_total`.

**SLOs:** success ≥95%, loop ≤2%, planner→tool p95 ≤1.5s, tool MTTR ≤30s.

**See:** [docs/autopilot/Observability-OTel-GenAI.md](docs/autopilot/Observability-OTel-GenAI.md)

---

## 6) Review & Zero-Gaps

**Inline evaluators** (groundedness/relevance/completeness) gate Review; failing scores auto-return to Implement.

**Gap = fail:** placeholder values, missing integrations, TODOs in prod, untested critical paths, unfulfilled acceptance criteria.

**See:** [docs/autopilot/Adversarial-Review.md](docs/autopilot/Adversarial-Review.md)

---

## 7) Escalation Rules

Same error ≥3×, no progress >90m, or >5 iterations without resolution ⇒ **ESCALATE** with loop diary and proposed fix.

---

## 8) The Complete Protocol

**Strategize** → **Spec** → **Plan** → **Think** → **Implement** → **Verify** → **Review** → **PR** → **Monitor**

**Each stage has deep-dive documentation:**
- **Strategize:** [Strategize-Methodologies.md](docs/autopilot/Strategize-Methodologies.md) - Problem-solving & verification methodologies
- **Verify:** [Verification-Standards.md](docs/autopilot/Verification-Standards.md) - Complete 7-stage verification
- **Stress Testing:** [Stress-Testing.md](docs/autopilot/Stress-Testing.md) - 7 categories with targets
- **Review:** [Adversarial-Review.md](docs/autopilot/Adversarial-Review.md) - Adversarial questioning framework
- **Modularization:** [Modularization-Policy.md](docs/autopilot/Modularization-Policy.md) - File size thresholds

**See:** [docs/autopilot/ClaudeCouncil-Core.md](docs/autopilot/ClaudeCouncil-Core.md) for condensed core protocols

**See:** [docs/autopilot/ClaudeCouncil-Extended.md](docs/autopilot/ClaudeCouncil-Extended.md) for extended protocols & quality standards

---

## References

- **Core Protocols:** [docs/autopilot/ClaudeCouncil-Core.md](docs/autopilot/ClaudeCouncil-Core.md)
- **Extended Protocols:** [docs/autopilot/ClaudeCouncil-Extended.md](docs/autopilot/ClaudeCouncil-Extended.md)
- **Inline Evals:** [docs/autopilot/Inline-Evals.md](docs/autopilot/Inline-Evals.md)
- **Observability:** [docs/autopilot/Observability-OTel-GenAI.md](docs/autopilot/Observability-OTel-GenAI.md)
- **MCP Servers:** [docs/autopilot/MCP-Servers.md](docs/autopilot/MCP-Servers.md)
- **Documentation Index:** [docs/INDEX.md](docs/INDEX.md)
- **Comprehensive Guide (v1):** [CLAUDE_v1.md](CLAUDE_v1.md) - In migration, see [coverage matrix](docs/autopilot/migration/claude_v1_coverage.json)
