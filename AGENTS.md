# Codex Agent Handbook (MCP)

**Scope:** This is the system-level playbook for Codex-based agents operating inside the WeatherVane Unified Autopilot. It mirrors `claude.md` but aligns wording and controls for Codex 5. Use it alongside the Atlas Briefing Pack and architecture overview.

---

## Session Startup Checklist
- Call MCP tools `plan_next --minimal` and `autopilot_status`; if either fails run `./tools/wvo_mcp/scripts/restart_mcp.sh` and log to `state/analytics/health_checks.jsonl`.
- Load the latest Atlas Briefing Pack (`docs/autopilot/AGENT_BRIEFING_PACK.json`) and skim `docs/autopilot/OVERVIEW.md#architecture` before touching the code.
- Keep `state/context.md` under 1,000 words; consult backups in `state/backups/context/` only when necessary.
- Use Atlas or Director Dana follow-ups for any consensus-created tasks; do not bypass review gates.
- Run `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` so TestsCritic records the real pass/fail state before declaring a task finished.

---

## System-Level Architecture Snapshot

### Operating Loop
- States: `Strategize → Spec → Plan → Think → Implement → Verify → Review → PR → Monitor`; complete a full loop in one session.
- Guardrails: lint, tests, type checks, security scans, license compliance, and changed-lines coverage enforced in Verify.
- Memory: run-ephemeral hints, project index (symbols/files), knowledge base resources, and decision journals stored at `resources://runs/<id>/`.

### Agent Roles
- Planner builds the task map from roadmap metadata and scoped context budgets.
- Thinker validates plan deltas and resolves open questions before implementation.
- Implementer applies patches, runs tests, and produces artifacts.
- Verifier executes the gate suite, collects coverage, and enforces retry policy.
- Reviewer consumes inline evaluators and rubrics to gate quality.
- Critical performs adversarial checks and escalates systemic issues.
- Supervisor finalizes PR handoff and monitors post-merge signals.

### Platform Components
- State graph (`tools/wvo_mcp/src/orchestrator/state_graph.ts`) orchestrates retries, leases, and checkpoints.
- Model router locks Codex/Claude calls to approved builds and trips circuit breakers on drift.
- Context Fabric assembles Local Context Packs, edit windows, and handoff bundles (`docs/autopilot/CONTEXT_FABRIC.md`).
- Policy controller applies governance, security, and quality policies defined in Atlas.
- Atlas introspection tracks component hashes (`docs/autopilot/MANIFEST.yml`) for drift detection.
- Roadmap ops integrates consensus tasks with staffing cues (`docs/autopilot/ROADMAP_OPS.md`).

### Knowledge & Evidence Flow
1. Planner pulls roadmap metadata and cache hints to size the work.
2. Context Assembler writes LCPs and evidence bundles to `resources://runs/<id>/context/`.
3. Implementer edits within provisioned windows and logs tool executions to the blackboard.
4. Verifier records gate outputs, router decisions, and coverage deltas for the run ledger.
5. Monitor stage runs synthetic smokes and captures the final decision snapshot.

### Observability & Governance
- Decision journals live at `resources://runs/<id>/journal.md`.
- OpenTelemetry GenAI spans record tool calls, token usage, and latency SLOs (success ≥95%, loop ≤2%, planner→tool p95 ≤1.5s, tool MTTR ≤30s).
- Atlas CI (`.github/workflows/atlas.yml`) blocks merges that violate manifest hashes or documentation integrity.

---

## Execution Protocol

### 🚨 MANDATORY WORK PROCESS - ENFORCED EVERYWHERE

**EVERY task MUST follow this exact sequence (inside or outside the Unified Autopilot loop):**
**STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR**

**ENFORCEMENT IS ACTIVE:**
- WorkProcessEnforcer BLOCKS tasks that skip phases
- Skipping ANY phase = IMMEDIATE TASK FAILURE
- Starting with IMPLEMENT = REJECTED
- Claiming done without VERIFY = REJECTED
- VERIFY/REVIEW/PR/MONITOR findings that reveal gaps force a return to the earliest affected phase (often IMPLEMENT or earlier); all downstream phases must be re-run with fresh evidence.
- Independent Codex agents (outside of MCP orchestration) must still execute the full STRATEGIZE→MONITOR loop, produce the same artifacts/checklists, and record evidence before claiming completion.
- All violations logged to metrics and decision journal

### Complete-Finish Policy
- Finish every task within the active loop—no partial completions or deferred fixes.
- Meet every acceptance criterion; builds must be clean (0 errors/warnings) and all tests must pass with no skips.
- Document as you go; never schedule documentation as a follow-up.
- Catch insufficient tokens or oversized tasks during Plan and escalate before starting.

### Codex Call Stability
- Pin requests to the designated Codex build (e.g., `o4-mini-YYYYMMDD` or `gpt-4.x-YYYYMMDD`) when provided.
- Use deterministic decoding (temperature 0, constrained top-p); log request/response IDs, finish reasons, and provider fingerprints.
- Capture provider headers/version fields and negotiated MCP servers for replayability.

### Integration-First Development
- **Search → Integrate → Verify**: locate existing connectors, configs, or utilities before writing code, extend them, and prove integration with programmatic checks.
- Avoid hardcoding values, duplicating interfaces, or skipping shared helpers (logger, config, cache, storage).

### Control Surfaces
- Supervisor node can pause routing or require human approval; respect lease durations and idempotency keys.
- Blackboard events (`PlanProposed`, `ToolExecuted`, `ReviewAccepted`) must include `task_id`, `agent_id`, `plan_hash`, `parent_event_id`, `idempotency_key`, `schema_version`.
- Loop guard tracks rolling hashes of prompt + plan + tool spec; mutate strategy or escalate if the same loop triggers ≥3 times in 10 minutes.

### Escalation Rules
- Escalate with a loop diary and proposed fix if the same error recurs ≥3 times, no progress >90 minutes, or >5 iterations occur without resolution.

---

## Learning System

<!-- INJECT_START: learning -->

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

<!-- INJECT_END: learning -->

---

## Repo Ops Quick Reference
- Project layout: `apps/api`, `apps/web`, `apps/worker`, `shared`, `tests`, `docs`.
- Primary commands: `make api`, `make web`, `make worker`, `make lint`, `make test`, `make smoke-context`, `python apps/worker/run.py <tenant>`.
- Commit hygiene: present-tense scope tags (e.g., `worker: add retention webhook`); ensure lint/tests pass and attach evidence in PR descriptions.
- Secrets must stay in environment variables; never commit `.env` files.
- Use `JsonStateStore` for connector cursors and validate geocoding coverage before enabling Autopilot for a tenant.

---

## References
- Architecture overview: `docs/autopilot/OVERVIEW.md`
- Briefing pack: `docs/autopilot/AGENT_BRIEFING_PACK.json`
- Tooling index: `docs/autopilot/TOOLBOX.md`
- Policies: `docs/autopilot/SECURITY.md`, `docs/autopilot/QUALITY_BAR.md`, `docs/autopilot/GOVERNANCE.md`
- Integration standards: `docs/autopilot/Integration-Verification.md`
- Complete-finish policy: `docs/autopilot/Complete-Finish-Policy.md`
- Observability: `docs/autopilot/Observability-OTel-GenAI.md`
