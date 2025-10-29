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
- Run `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` before declaring a task finished. Follow it with `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task <TASK_ID>` for each task you touched (use `--all` for a full sweep) to fail fast if any STRATEGIZE→MONITOR artifacts are missing; fix gaps immediately.

**🚨 MANDATORY PROCESS - NO EXCEPTIONS (AUTOPILOT OR SOLO CLAUDE SESSIONS):**
**STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR**  
See `docs/autopilot/WORK_PROCESS.md` for stage contracts (Think Pack, observability, fitness functions) and future‑proof enforcement. Time‑boxed stage checklists are defaults for typical tasks; extend with justification for high‑risk/novel work. Gates and acceptance criteria remain mandatory.

- **Enforcement is ACTIVE:**
  - Skipping ANY phase = IMMEDIATE TASK FAILURE
  - Starting with IMPLEMENT = REJECTED
  - Claiming done without VERIFY = REJECTED
  - WorkProcessEnforcer will BLOCK violating tasks
  - Violations are logged and tracked in metrics
  - Corrective backtracking is supported and required: if gaps are found late, return to the earliest impacted phase (often IMPLEMENT or earlier); the enforcer records backtracks and restarts evidence collection, and all downstream phases must be re-run.
  - Anti-drift controls: immutable phase ledger, evidence-gated transitions, phase leases for deterministic sequencing, and prompt attestation of headers are in force.
  - If VERIFY/REVIEW/PR/MONITOR expose gaps, you must loop back to the earliest impacted phase (often IMPLEMENT or earlier) and rerun every downstream phase with new evidence.
  - When operating outside the Unified Autopilot, you must still execute the full STRATEGIZE→MONITOR sequence, capture the same artifacts/checklists, and provide verifiable evidence before declaring the task complete.
  - Strategy, Plan, and Think must explicitly tie the work to Autopilot functionality (which agent behavior, guardrail, or workflow you’re changing), and Review must prove that functionality still works (e.g., smoke runs, telemetry, manual checks).
  - **Reality check before claiming success:** confirm the changes exist in the repository (git status/diff), that automated evidence (tests, telemetry artifacts, ledger entries) is present, and that outstanding gaps called out in specs are either resolved or clearly marked as follow-up tasks. Do not rely on summaries or assumptions—inspect the repo state directly and link the proof in outputs.
  - **“Do now” protocol:** treat any “do now” request as shorthand for running the full STRATEGIZE→MONITOR workflow. Break the problem into Strategy, Spec, Plan, and Think steps first, then proceed through Implement/Verify/Review/PR/Monitor with evidence at each stage. Never jump straight to coding.

**Finish in one loop:** No partials; build=0 errors; all tests pass; docs done.

**Respect consensus:** Failed-quorum decisions spawn follow-ups for Atlas/Dana—use them instead of bypassing.

**Token hygiene:** Keep `state/context.md` ≲ 1,000 words; overflows are auto-backed up in `state/backups/context/`.

---

### Cross‑Item Integration (Mandatory)

- Before IMPLEMENT: declare Related · DependsOn · Produces · Consumes for this task in `state/roadmap.dependencies.yaml`. For prompt/graph/router work, Related MUST include IMP‑21/22/23/24/25/26/35/36/37 and, when applicable, IMP‑ADV‑01.2 (hint injection), IMP‑QG‑01, IMP‑VEC‑01.
- PLAN/THINK: specify how the change integrates with Related items (compiler slots, attestation coverage, eval variant IDs, grounded citations, tool allowlists) and define oracles.
- IMPLEMENT: update shared typed integration contracts (TS/Zod, Python/Pydantic) vs duplicating interfaces; keep attestation/eval/telemetry in sync.
- VERIFY: run roadmap linter and integration check (observe→enforce) and end‑to‑end smokes to prove context‑wide behavior; attach reports to evidence.
- REVIEW/PR: include "Cross‑Item Integration" rubric with explicit links to Related items + contract versions; attach linter/integration artifacts.

---

### Gap Remediation Protocol (MANDATORY)

**Policy:** Gaps found in REVIEW (or any late phase) are BLOCKERS, not backlog items. Fix them NOW.

**Rules:**
1. **NO deferring to follow-up tasks** - Gaps must be fixed in the current work process loop
2. **Loop back immediately** - Return to the earliest impacted phase (typically IMPLEMENT, sometimes earlier)
3. **Re-run all downstream phases** - VERIFY → REVIEW → PR → MONITOR must all be re-executed with gap fixes
4. **Only exception** - Gaps explicitly marked "out of scope" in the SPEC acceptance criteria
5. **Update evidence** - All evidence documents must reflect the gap fixes

**Example Violation:**
- ❌ REVIEW finds: "Missing schema versioning field" → Recommendation: "Add in follow-up task PROJ-123"
- ✅ REVIEW finds: "Missing schema versioning field" → Action: Loop back to IMPLEMENT, add schema_version field, re-run VERIFY/REVIEW/PR/MONITOR

**What counts as a gap:**
- Missing implementation details (schema fields, error handling, edge cases)
- Incomplete documentation (troubleshooting guides, examples, migration docs)
- Unverified assumptions (performance claims without benchmarks, compatibility without tests)
- Design flaws (tight coupling, missing graceful degradation, no rollback plan)

**What is NOT a gap (can be deferred):**
- Items explicitly listed as "out of scope" in SPEC (e.g., "No PoC for research task")
- Follow-up features that are separate user stories (not part of current acceptance criteria)
- Nice-to-have improvements that don't affect core functionality
- Performance optimizations beyond stated requirements

**Process:**
1. REVIEW identifies gaps → List each gap with severity
2. For each gap NOT explicitly out-of-scope in SPEC:
   - Determine earliest impacted phase (usually IMPLEMENT)
   - Loop back to that phase
   - Fix the gap with implementation changes
   - Update all affected evidence documents
3. Re-run VERIFY → REVIEW → PR → MONITOR
4. If new gaps found, repeat (should be rare with thorough THINK phase)

**See:** This protocol was added 2025-10-28 after session where gaps were incorrectly deferred to follow-up tasks.

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

**See:** [docs/autopilot/Observability-OTel-GenAI.md](docs/autopilot/Observability-OTel-GenAI.md) and method toolkits at [docs/autopilot/STAGE_TOOLKITS.md](docs/autopilot/STAGE_TOOLKITS.md) for Strategy/Spec/Plan/Think. Choose only the methods that fit the task risk, and map each to an oracle, gate, or artifact. The toolkit is a living document; propose additions with when‑to‑use, steps, and evidence mapping.

**Semantic evaluation mandate:** In VERIFY/REVIEW/MONITOR, interpret output meaning, not just presence. Reject "it ran" if logs show warnings/errors or trivial tests (no assertions). Treat warnings in critical paths as failures unless Spec explicitly allows them.

---

## 6) Review & Zero-Gaps

**Inline evaluators** (groundedness/relevance/completeness) gate Review; failing scores auto-return to Implement.

**Gap = fail:** placeholder values, missing integrations, TODOs in prod, untested critical paths, unfulfilled acceptance criteria.

**See:** [docs/autopilot/Adversarial-Review.md](docs/autopilot/Adversarial-Review.md)

---

## 7) Escalation Rules

Same error ≥3×, no progress >90m, or >5 iterations without resolution ⇒ **ESCALATE** with loop diary and proposed fix.

---

<!-- SYNC_START: learning -->

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

**Learning 5: Guarantee Verification Gap (2025-10-27)**
- **Issue:** Guaranteed "autopilot will complete tasks autonomously" when orchestrator only 30% done
- **Root Cause:** Made guarantee based on safety fix (circuit breaker), never verified functional completeness
- **Prevention:** MANDATORY pre-guarantee verification checklist (see below)
- **Process Update:** Cannot make ANY guarantee without running verification checklist first
- **Full Learning:** docs/learnings/2025-10-27-guarantee-verification-gap.md

### Pre-Guarantee Verification (MANDATORY)

**Before making ANY guarantee or capability claim, you MUST:**

1. **STOP**: Do not proceed with the guarantee
2. **RUN CHECKLIST**:
   - [ ] Read IMPLEMENTATION_STATUS.md or similar docs
   - [ ] Verify claimed features marked ✅ (not ⏳ or ❌)
   - [ ] Search for TODOs: `grep -r "TODO\|FIXME\|not implemented" relevant/path`
   - [ ] Check for disabled/stubbed tests
   - [ ] Distinguish: Safety vs Functionality (be explicit which)
   - [ ] If claiming functionality: Run end-to-end test of workflow
   - [ ] Document what IS and IS NOT guaranteed
3. **SCOPE**: Write explicit sections:
   - "What I CAN guarantee (with evidence)"
   - "What I CANNOT guarantee (gaps/missing work)"
4. **PROCEED**: Only then make guarantee with documented verification

**Red flags requiring extra verification:**
- 🚩 Guaranteeing something you just built (not production-tested)
- 🚩 User explicitly asks "can you guarantee X?"
- 🚩 Complex multi-step workflows
- 🚩 Implementation doc says "in progress" or "X% complete"

**Never guarantee functionality based on:**
- ❌ "Build succeeded" (only proves it compiles)
- ❌ "Dry run worked" (may not test actual functionality)
- ❌ "I implemented X" (doesn't mean Y works end-to-end)
- ❌ "User requested it" (doesn't make it true)

**Violation = erodes trust, wastes time, creates debt**

### Systematic Learning Review

**After every major issue resolution:**
1. ✅ Create learning entry (format above)
2. ✅ Update relevant process document
3. ✅ Add automated check if possible
4. ✅ Include in commit message under "Learnings:" section

<!-- SYNC_END: learning -->

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

## 7.6) Pre-Commit Verification Protocol (MANDATORY)

**Trigger**: BEFORE marking ANY task complete in MONITOR phase OR creating PR commit.

**Purpose**: Prevent premature completion, catch gaps before commit, ensure critical thinking about implementation.

### Mandatory 6-Point Checklist

Use template: `docs/autopilot/templates/verify/verification_checklist.md`

#### 1. Build Verification
- ✅ `npm run build` → 0 errors
- ✅ `npm run lint` → 0 errors or documented warnings
- ✅ `npm run typecheck` → 0 errors

**Gate**: If build fails, task is NOT complete. Return to IMPLEMENT.

#### 2. Test Verification
- ✅ Full test suite passes
- ✅ Related tests for modified modules pass
- ✅ Integration/smoke tests pass (if applicable)
- ✅ No unexplained skipped tests

**Gate**: If tests fail, task is NOT complete. Return to IMPLEMENT.

#### 3. End-to-End Functional Verification
- ✅ **Actually ran the code** with realistic data (NOT just reading documents)
- ✅ **Verified outputs are correct** (not just "no errors")
- ✅ **Tested error cases** and edge cases
- ✅ **Error messages are actionable**

**Examples**:
```bash
# For neural embeddings, must actually run:
QUALITY_GRAPH_EMBEDDINGS=neural python3 scripts/quality_graph/record_task_vector.py <workspace> <task-id>
# And verify: output has 384D vectors, similarity scores make sense
```

**Gate**: If functionality doesn't work, task is NOT complete.

#### 4. Performance Validation (for performance-sensitive changes)
- ✅ **Measured actual latency** with realistic data (not estimated)
- ✅ **Critically evaluated trade-offs**: Is Nx slower acceptable? For what use case?
- ✅ **Identified missing optimizations**: Batching, caching, GPU, parallelization
- ✅ **Documented performance characteristics**

**Red Flags**:
- 🚩 >10x slower without clear justification
- 🚩 >100ms latency for frequent operations
- 🚩 No batch API for ML model inference
- 🚩 CPU-only when GPU available
- 🚩 Re-loading models/resources on every call

**Gate**: If performance is unacceptable, create optimization task OR implement now.

#### 5. Integration Verification
- ✅ Upstream callers still work
- ✅ Downstream consumers can use new feature
- ✅ Feature flags tested (all values: on/off/invalid)
- ✅ Rollback path verified

**Gate**: If integration breaks, task is NOT complete.

#### 6. Documentation Verification
- ✅ README examples actually work (run them yourself)
- ✅ Performance claims are measured (not guessed)
- ✅ Trade-offs honestly documented

**Gate**: If docs are wrong, update them BEFORE committing.

### Enforcement

**MONITOR phase MUST verify checklist complete** before creating completion.md.

If ANY item fails:
1. Mark task status as "BLOCKED - verification failed"
2. Return to earliest impacted phase (usually IMPLEMENT)
3. Fix the gap
4. Re-run VERIFY → REVIEW → PR → MONITOR

**See**: `docs/autopilot/templates/verify/verification_checklist.md` for full template with examples.

**See**: META-VERIFY-01 (state/evidence/META-VERIFY-01/) for rationale and learnings.

---

## 7.7) Priority Alignment Gates (MANDATORY)

**Policy**: Before starting ANY task, verify it aligns with current priorities. Before completing ANY task, verify it still serves the right goals.

### STRATEGIZE Phase: Pre-Work Alignment Check (MANDATORY)

**Trigger**: BEFORE creating SPEC, PLAN, or any implementation artifacts

**Checklist** (ALL must pass before proceeding):

1. **Autopilot Command Alignment**
   - [ ] Check active autopilot commands: `mcp__weathervane__command_autopilot --action list`
   - [ ] If command has task_filter (e.g., "REMEDIATION"), verify this task matches the filter
   - [ ] If command says "EXCLUSIVELY", do NOT work on non-matching tasks

2. **Roadmap Priority Alignment** (PRIMARY SOURCE OF TRUTH)
   - [ ] **Read docs/autopilot/IMPROVEMENT_BATCH_PLAN.md**: What is the current phase status?
   - [ ] **Verify task is in active phase**: Is this task listed in current phase priorities?
   - [ ] **Check phase gates**: Are all prerequisites for this phase complete?
   - [ ] **Cross-reference roadmap.yaml**: Does task epic_id align with IMPROVEMENT_BATCH_PLAN?
   - [ ] **If task NOT in IMPROVEMENT_BATCH_PLAN**: Get explicit user approval before proceeding

**Note**: IMPROVEMENT_BATCH_PLAN.md is the canonical source for autopilot infrastructure priorities. If a task isn't listed there, question why you're working on it.

3. **Dependency Verification**
   - [ ] All prerequisite tasks are COMPLETE (not in_progress or blocked)
   - [ ] No blocking issues exist for this task
   - [ ] Required monitoring/baseline periods are complete

4. **Timing Appropriateness**
   - [ ] Not waiting for monitoring period to complete
   - [ ] Not blocked by external dependencies
   - [ ] Sequencing is correct (foundation before features)

**GATE**: If ANY check fails → STOP and ask user:
- "This task doesn't align with [X]. Should I work on it anyway, or switch to [Y]?"
- Document the misalignment in strategize evidence
- Get explicit approval before proceeding

**Example Violations**:
- ❌ Working on CRIT-PERF-GLOBAL-9dfa06.2 (critics framework) when it's NOT in IMPROVEMENT_BATCH_PLAN.md
- ❌ Working on E-GENERAL task when autopilot command says "REMEDIATION only"
- ❌ Starting Phase 2 features when Phase 1 monitoring period incomplete
- ❌ Implementing task X when prerequisite task Y is blocked
- ❌ Working on prompting improvements when fundamentals phase not complete

**Real Violation from 2025-10-29**:
Started implementing CRIT-PERF-GLOBAL-9dfa06.2 without checking:
- Task NOT in IMPROVEMENT_BATCH_PLAN.md Phase 0-1 priorities ❌
- Autopilot command says work EXCLUSIVELY on REMEDIATION tasks ❌
- Should have asked user before spending 3 hours on STRATEGIZE/SPEC/PLAN ❌

**Correct behavior**: Check IMPROVEMENT_BATCH_PLAN.md FIRST, see task not listed, STOP and ask user.

---

### REVIEW Phase: Post-Work Alignment Verification (MANDATORY)

**Trigger**: During REVIEW phase, before approving implementation

**Checklist** (ALL must pass before APPROVE):

1. **Strategic Alignment Check**
   - [ ] Task still aligns with priorities (no strategy shifts during work)
   - [ ] Implementation actually serves the stated goals in STRATEGIZE
   - [ ] No higher-priority work was delayed by this task
   - [ ] Timing is still appropriate (priorities haven't changed)

2. **Opportunity Cost Analysis**
   - [ ] This work was the best use of time vs. alternatives
   - [ ] No critical blockers emerged that should have been addressed first
   - [ ] Effort spent aligns with value delivered

3. **Follow-Up Impact**
   - [ ] Follow-up work is scoped and tracked
   - [ ] Dependencies on this work are unblocked appropriately
   - [ ] No unexpected downstream blockers created

**GATE**: If strategic misalignment discovered → Document in REVIEW:
- What changed during implementation?
- Should this work be discarded/pivoted?
- What should be done instead?

**Example Discoveries**:
- ⚠️ "Implemented feature X, but monitoring shows users need Y instead"
- ⚠️ "Built infrastructure for 33 critics, but only 3 are actually used"
- ⚠️ "Optimization saved 10ms, but critical bug took 10 hours to work around"

---

### Enforcement

**How to Enforce**:
1. STRATEGIZE evidence MUST include "Priority Alignment Check" section
2. REVIEW evidence MUST include "Strategic Alignment Verification" section
3. WorkProcessEnforcer should check for these sections (future automation)
4. PR commits should reference alignment verification in evidence

**Consequences of Violation**:
- Task is rejected in REVIEW phase → loop back to STRATEGIZE
- Wasted implementation effort (hours/days of misdirected work)
- Erosion of trust in work process
- Critical work delayed while working on wrong priorities

---

### When to Override

**Rare exceptions** (require explicit user approval):
1. Emergency hotfix for production incident
2. User explicitly requests specific task despite misalignment
3. Strategic pivot documented and approved mid-task

**Never skip alignment check** - even for small tasks. Small misalignments compound.

---

## 8) The Complete Protocol

**Strategize** → **Spec** → **Plan** → **Think** → **Implement** → **Verify** → **Review** → **PR** → **Monitor**

**Each stage has deep-dive documentation:**
- **Strategize:** [Strategize-Methodologies.md](docs/autopilot/Strategize-Methodologies.md) - Problem-solving & verification methodologies
- **Verify:** [Verification-Standards.md](docs/autopilot/Verification-Standards.md) - Complete 7-stage verification
- **Stress Testing:** [Stress-Testing.md](docs/autopilot/Stress-Testing.md) - 7 categories with targets
- **Review:** [Adversarial-Review.md](docs/autopilot/Adversarial-Review.md) - Adversarial questioning framework
- **Modularization:** [Modularization-Policy.md](docs/autopilot/Modularization-Policy.md) - File size thresholds

**IMPORTANT**: See section 7.6 for Pre-Commit Verification Protocol (MANDATORY before MONITOR phase)

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
