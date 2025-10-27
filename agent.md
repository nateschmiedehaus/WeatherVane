# Agent Handbook (Codex / MCP)

**Scope:** This is the Codex-specific agent handbook. It mirrors [claude.md](claude.md) but sets OpenAI/Codex-specific stability/telemetry. Autopilot (MCP) uses this when Codex is the actor. WeatherVane is a separate product managed via MCP (see [docs/weathervane/Product-Handbook.md](docs/weathervane/Product-Handbook.md)).

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

## 1) Rapid Orientation

**Start every loop:** `plan_next --minimal`, `autopilot_status`; on failure run `./autopilot/scripts/restart_mcp.sh` and log.

**Finish in one loop:** Strategize → Spec → Plan → Think → Implement → Verify → Review → PR → Monitor. No partials.

**Consensus & critics:** Use Atlas/Dana tasks; run integrity batch before "done".

**Token hygiene:** Trim `state/context.md`; backups in `state/backups/context/`.

---

## 2) Codex Call Stability (required)

**Pin model** to a named, stable build (e.g., an `"o4-mini-YYYYMMDD"`/`"gpt-4.x-YYYYMMDD"`-style version if available).

**Temperature 0** (or the provider's deterministic decoding) with top-p constrained; still not perfectly deterministic → always log request/response, usage, finish reason, and any model fingerprint/version fields returned.

**Provider headers/versioning:** capture provider-specific version/fingerprint fields when provided; log for replay.

**MCP servers:** explicit allowlist; log negotiated servers.

---

## 3) Integration-First Development

Same as [claude.md](claude.md): **Search → Integrate → Verify** with programmatic checks.

**Red Flags:**
- ❌ Hardcoding values that should come from a system
- ❌ Creating new interfaces that duplicate existing ones
- ❌ Implementing functionality that already exists elsewhere
- ❌ Not using shared utilities (logger, config, cache, etc.)

**See:** [docs/autopilot/Integration-Verification.md](docs/autopilot/Integration-Verification.md)

---

## 4) Multi-Agent Controls

Supervisor, blackboard events, leases, idempotency keys, conflict resolution by deterministic score, and loop guard as in [claude.md](claude.md).

---

## 5) Observability

Use OpenTelemetry GenAI spans/metrics; enforce the same SLOs (success ≥95%, loop ≤2%, planner→tool p95 ≤1.5s, tool MTTR ≤30s).

**See:** [docs/autopilot/Observability-OTel-GenAI.md](docs/autopilot/Observability-OTel-GenAI.md)

---

## 6) Review & Zero-Gaps

**Inline evaluators** (groundedness/relevance/completeness) gate Review; failing scores auto-return to Implement.

**Gap = fail:** placeholder values, missing integrations, TODOs in prod, untested critical paths, unfulfilled acceptance criteria.

**See:** [docs/autopilot/Adversarial-Review.md](docs/autopilot/Adversarial-Review.md)

---

## 7) Escalation Rules

Identical to [claude.md](claude.md): Same error ≥3×, no progress >90m, or >5 iterations ⇒ **ESCALATE**.

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
- **Comprehensive Guide (v1):** [CLAUDE_v1.md](CLAUDE_v1.md) - Migration complete, see [coverage matrix](docs/autopilot/migration/claude_v1_coverage.json)
