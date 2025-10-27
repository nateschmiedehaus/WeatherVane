# Claude Agent Handbook (Claude / MCP)

**Scope:** This is the Claude-specific agent guide. It mirrors [AGENTS.md](AGENTS.md) (Codex) but sets Claude-specific stability/telemetry requirements. Autopilot (the MCP orchestration layer) uses this guide when Claude is the actor. WeatherVane is a separate product the Autopilot builds/operates via MCP tools (see [docs/weathervane/Product-Handbook.md](docs/weathervane/Product-Handbook.md)).

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

## 7.5) Systematic Learning & Self-Improvement Mandate

**Philosophy:** Every significant problem is a learning opportunity. The work process MUST evolve to prevent recurrence.

### When to Capture Learnings

**Trigger any of these:**
- ✅ **Major Issue Found** - Issue that took >30 min to diagnose OR blocked progress
- ✅ **Process Gap Discovered** - Work process failed to catch something it should have
- ✅ **Repeated Pattern** - Same type of issue encountered 2+ times
- ✅ **Architecture Insight** - Discovered how system actually works vs. assumptions
- ✅ **Tool/Method Innovation** - Found better way to verify/test/implement something

### Learning Capture Protocol

**When learning trigger occurs:**

1. **Document the Issue** (in commit message or docs/learnings/)
   - What went wrong?
   - Root cause (not just symptoms)
   - Why wasn't it caught earlier?
   - What stage should have caught it?

2. **Extract the Learning**
   - What assumption was wrong?
   - What check was missing?
   - What knowledge was lacking?
   - What process step failed?

3. **Define the Prevention**
   - What VERIFY check would have caught this?
   - What DISCOVER step was missing?
   - What documentation needs updating?
   - What automated check can prevent recurrence?

4. **Update Work Process**
   - Add check to appropriate stage (VERIFY, REVIEW, etc.)
   - Update CLAUDE.md or stage-specific docs
   - Create automated verification if possible
   - Document in commit message

### Examples from Real Sessions

**Learning 1: Build Artifact Verification (2025-10-27)**
- **Issue:** Code changes in src/ didn't appear in dist/ after build
- **Root Cause:** Didn't verify compiled output contained changes
- **Prevention:** Added to VERIFY stage: `grep "expected-code" dist/path/to/file.js`
- **Process Update:** VERIFY checklist now requires dist/ verification

**Learning 2: Path Resolution Complexity (2025-10-27)**
- **Issue:** workspaceRoot vs process.cwd() vs relative paths caused config loading failures
- **Root Cause:** Assumed process.cwd() == workspaceRoot, didn't test from multiple directories
- **Prevention:** Always use workspaceRoot parameter, test from different working directories
- **Process Update:** VERIFY stage requires testing from both workspace root and subdirectories

**Learning 3: Worker Architecture Discovery (2025-10-27)**
- **Issue:** Tried to test IPC worker standalone, worker exited silently
- **Root Cause:** DISCOVER phase skipped - didn't identify worker type before testing
- **Prevention:** DISCOVER must identify: standalone vs IPC, parent requirements, env vars needed
- **Process Update:** Added worker architecture checks to DISCOVER phase

**Learning 4: JSON Import in Node.js ESM (2025-10-27)**
- **Issue:** Import assertions not supported in current Node.js/TypeScript config
- **Root Cause:** Didn't check runtime compatibility of import syntax
- **Prevention:** Use dynamic fs.readFileSync for JSON in ESM contexts
- **Process Update:** Added ESM import patterns to IMPLEMENT best practices

### Systematic Learning Review

**After every major issue resolution:**
1. ✅ Create learning entry (format above)
2. ✅ Update relevant process document
3. ✅ Add automated check if possible
4. ✅ Include in commit message under "Learnings:" section

**Monthly Learning Audit:**
- Review all learnings from past month
- Identify patterns (what's breaking repeatedly?)
- Update core process documents
- Create meta-learnings about the learning process itself

**Learning Log Location:**
- `docs/learnings/YYYY-MM-DD-topic.md` - Detailed learning write-ups
- Commit messages - Concise "Learnings:" sections
- CLAUDE.md (this file) - High-impact learnings that affect core process

### Forward-Looking Problem Prevention

**Before starting ANY task:**
- Review recent learnings (past 2 weeks)
- Check if current task relates to past issues
- Apply preventions proactively

**During VERIFY stage:**
- Explicitly check for issues that occurred in past 30 days
- Run automated checks created from past learnings
- Document which past-issue checks passed

**Example Pre-Flight Checklist** (from learnings):
```bash
# Learning-based verification (2025-10-27 learnings)
grep "runtime.start" dist/src/worker/worker_entry.js  # Build artifact verification
test -f config/safety_limits.json                      # Path resolution check
grep "workspaceRoot" src/path/to/file.ts              # No process.cwd() usage
```

### Meta-Learning: Learning About Learning

**If same issue occurs twice:**
- Learning was incomplete or prevention insufficient
- Create meta-learning: "Why didn't the prevention work?"
- Update prevention to be more robust
- Add automated check to prevent the prevention from being bypassed

**Success Metrics:**
- Issue recurrence rate (target: <5% of issues recur within 90 days)
- Time to detection (issues caught earlier in process over time)
- Prevention automation (% of learnings with automated checks)

**See:** [docs/learnings/LEARNING_SYSTEM.md](docs/learnings/LEARNING_SYSTEM.md) for detailed learning capture templates and examples

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
