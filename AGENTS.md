# Codex Agent Handbook (MCP)

**Scope:** This is the system-level playbook for Codex-based agents operating inside the WeatherVane Unified Autopilot. It mirrors `claude.md` but aligns wording and controls for Codex 5. Use it alongside the Atlas Briefing Pack and architecture overview.

---

## Session Startup Checklist
- Call MCP tools `plan_next --minimal` and `autopilot_status`; if either fails run `./tools/wvo_mcp/scripts/restart_mcp.sh` and log to `state/analytics/health_checks.jsonl`.
- Load the latest Atlas Briefing Pack (`docs/autopilot/AGENT_BRIEFING_PACK.json`) and skim `docs/autopilot/OVERVIEW.md#architecture` before touching the code.
- Keep `state/context.md` under 1,000 words; consult backups in `state/backups/context/` only when necessary.
- Use Atlas or Director Dana follow-ups for any consensus-created tasks; do not bypass review gates.
- Run `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` so TestsCritic records the real pass/fail state before declaring a task finished.
- Before you call a task complete, run `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task <TASK_ID>` for each task you touched (add `--all` for a full sweep) to confirm the STRATEGIZE→MONITOR artifacts exist. Treat any failure as a blocked task until fixed.
- Run `npm run validate:roadmap-evidence -- --json > state/evidence/<TASK_ID>/verify/roadmap_evidence_report.json` to keep roadmap metadata and filesystem artifacts aligned; warnings highlight legacy tasks that still lack full evidence.
- Enforce delta-note policy: run `node tools/wvo_mcp/scripts/check_delta_notes.ts` and ensure it passes (or that new tasks are created) before closing your loop. Unresolved notes must become explicit roadmap tasks (see META-POLICY-02).
- Run `node tools/wvo_mcp/scripts/classify_follow_ups.ts --enforce` and resolve any pending follow-ups by creating tasks or recording deferments. The checker now auto-ingests `AUTO-FU-*` tasks into roadmap epic `E-AUTO-FOLLOWUPS` and writes `state/automation/auto_follow_up_tasks.jsonl`; only suppress a bullet with `[ #auto-task=skip ]` when the deferment is documented (META-POLICY-03/05). Use report mode (no flag) for local audits.
- Run `node tools/wvo_mcp/scripts/check_performance_regressions.ts` to ensure key performance metrics have not regressed; update baselines intentionally with `--update-baseline` only after verifying improvements (META-PERF-01).
- Run `node tools/wvo_mcp/scripts/check_determinism.ts --task <TASK_ID> --output state/evidence/<TASK_ID>/verify/determinism_check.json` to prove seeds/timeouts are in place and tracing smokes are deterministic (IMP-DET-01). Treat failures as blockers.
- Run `node tools/wvo_mcp/scripts/check_structural_policy.ts --task <TASK_ID> --output state/evidence/<TASK_ID>/verify/structural_policy_report.json` to ensure changed source files retain companion tests or documented allowlist entries (IMP-POL-01).
- Run `node tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --task <TASK_ID> --output state/evidence/<TASK_ID>/verify/oracle_coverage.json` to confirm every risk in `risk_oracle_map.json` has executing oracles before advancing (IMP-ORC-01).

---

### Roadmap Task Schema (v2.0)

Always author roadmap entries using the new schema:

- `dependencies` exposes a `depends_on` array (legacy flat arrays are invalid).
- `exit_criteria` is a list of structured objects (include `prose` or `test`/`expect` pairs).
- `complexity_score`, `effort_hours`, and `required_tools` are required metadata fields.
- `evidence_path`, `work_process_phases`, and `evidence_enforcement` keep roadmap entries aligned with STRATEGIZE→MONITOR artifacts.

Example task:

```yaml
- id: FIX-QUALITY-Example
  title: "Harden WorkProcessEnforcer smoke coverage"
  status: pending
  dependencies:
    depends_on: []
  exit_criteria:
    - prose: "Smoke suite updated and passing"
    - test: "npm run test -- work_process_acceptance"
      expect: "exit 0"
  domain: mcp
  complexity_score: 5
  effort_hours: 2
  required_tools: []
  auto_created: true
  source_issue:
    type: quality
    severity: medium
    gap: "Smoke suite lacked parity coverage"
  evidence_path: state/evidence/FIX-QUALITY-Example
  work_process_phases:
    - strategize
    - spec
    - plan
    - think
    - implement
    - verify
    - review
    - pr
    - monitor
  evidence_enforcement: enforce
```

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
**STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR** (see `docs/autopilot/WORK_PROCESS.md` for the future‑proof stage contracts, artifacts, and fitness functions). Time‑boxed checklists in that doc are guidance for typical tasks; extend them with justification for high‑risk or novel work. Quality gates and acceptance criteria are never relaxed.

- **ENFORCEMENT IS ACTIVE:**
  - WorkProcessEnforcer BLOCKS tasks that skip phases
  - Skipping ANY phase = IMMEDIATE TASK FAILURE
  - Starting with IMPLEMENT = REJECTED
  - Claiming done without VERIFY = REJECTED
  - Backtracking is supported and required: VERIFY/REVIEW/PR/MONITOR may return the workflow to the earliest impacted phase (often IMPLEMENT or earlier). The enforcer and state graph now allow corrective backtracks and will re-run downstream phases with fresh evidence.
  - Anti-drift controls are on by default: immutable phase ledger (hash chain), evidence-gated transitions, phase leases for deterministic sequencing, and prompt attestation for header drift.
  - VERIFY/REVIEW/PR/MONITOR findings that reveal gaps force a return to the earliest affected phase (often IMPLEMENT or earlier); all downstream phases must be re-run with fresh evidence.
- Independent Codex agents (outside of MCP orchestration) must still execute the full STRATEGIZE→MONITOR loop, produce the same artifacts/checklists, and record evidence before claiming completion. When choosing methods in Strategy/Spec/Plan/Think, consult `docs/autopilot/STAGE_TOOLKITS.md` and pick only what fits the task risk; every chosen method must tie to an oracle, gate, or artifact. The toolkit is a living document—propose new methods via PR with evidence mapping and tags.
  - Verify/Review/Monitor must perform semantic evaluation of outputs: do not accept "ran and finished" as success if warnings/errors were emitted or if tests are trivial (no assertions). Treat non‑zero warnings in critical paths as failures unless explicitly allowed by Spec.
  - Strategy/Plan/Think must identify which Autopilot functionality (agent workflow, guardrail, or user journey) the work touches, and Review must confirm that functionality still operates (cite smoke runs, telemetry, or manual walkthroughs).
  - **Reality check requirement:** before declaring a phase (or task) complete, inspect the repository state (git status/diff), ensure artifacts/tests/telemetry referenced in your summary actually exist, and explicitly note any remaining gaps as follow-up work. Never assume previous summaries are accurate—validate with real evidence.
  - **“Do now” protocol:** interpret any “do now” request as an instruction to run the entire STRATEGIZE→MONITOR flow. Break the work into Strategy, Spec, Plan, and Think chunks first, then continue through Implement/Verify/Review/PR/Monitor with evidence at each step—never jump straight to coding.
- All violations logged to metrics and decision journal

### Cross‑Item Integration (Mandatory)

- Declare Related · DependsOn · Produces · Consumes for the task before IMPLEMENT in `state/roadmap.yaml` using the v2 schema (`dependencies.depends_on`, structured `exit_criteria`, required metadata). For prompt/graph/router work, Related MUST include the prompt family (IMP‑21/22/23/24/25/26/35/36/37) and, when applicable, IMP‑ADV‑01.2 (hint injection), IMP‑QG‑01, IMP‑VEC‑01.
- PLAN/THINK must state how the change integrates with those items (compiler slots, attestation coverage, eval variants, grounded citations, tool allowlists) and define oracles.
- IMPLEMENT must update shared typed contracts (TS/Zod or Python/Pydantic) instead of duplicating interfaces; keep attestation/eval/telemetry aligned.
- VERIFY must run roadmap linter and integration check (observe→enforce) and end‑to‑end smokes to prove context‑wide behavior; attach reports to evidence.
- REVIEW/PR must include a "Cross‑Item Integration" rubric note with explicit Related links and contract versions; attach linter/integration artifacts.

### Strategic Worthiness Gate (Mandatory)
- STRATEGIZE must justify "Why now" with evidence and consider Alternatives and Kill/Pivot triggers; it is valid to kill or rewrite a task here.
- REVIEW must challenge worthiness; if better options exist or evidence is weak, send the task back to STRATEGIZE or mark Kill/Defer.

### Deep Strategic Thinking (MANDATORY)

**CRITICAL: Strategy is About Finding Elegant Solutions, Not Just Following Requirements**

**Philosophy:**
- STRATEGIZE is not "write down what user asked for" - it's **"find the best possible solution"**
- Question assumptions, reframe problems, explore alternatives
- The problem statement might be wrong - your job is to find the real problem
- Optimize for long-term elegance, not short-term implementation speed

**Deep Strategic Thinking (REQUIRED):**
1. **Question the Problem**: Is this the right problem to solve? What's the root cause?
2. **Reframe the Goals**: What are we actually trying to achieve? (not just "what feature to build")
3. **Explore Alternatives**: What are 3-5 different approaches? (not just the obvious one)
4. **Consider Long-Term**: What's the elegant solution that scales? (not just "meets immediate need")
5. **Challenge Requirements**: Can we solve this more fundamentally? (question the "how", focus on the "why")

**Example:**
- ❌ **Surface thinking**: "User wants per-phase budgets" → implement per-phase budgets
- ✅ **Deep thinking**: "Why do we need budgets? To prevent waste. What causes waste? Lack of progress signal.
  Real solution: progress-based resource management, not just limits."

See `state/evidence/IMP-COST-01/strategize/strategy.md` for example of deep strategic thinking.

### Complete-Finish Policy
- Finish every task within the active loop—no partial completions or deferred fixes.
- Meet every acceptance criterion; builds must be clean (0 errors/warnings) and all tests must pass with no skips.
- Document as you go; never schedule documentation as a follow-up.
- Catch insufficient tokens or oversized tasks during Plan and escalate before starting.

### Gap Remediation Protocol (MANDATORY)
**Policy:** Gaps found in REVIEW (or any late phase) are BLOCKERS, not backlog items. Fix them NOW.

**Rules:**
1. **NO deferring to follow-up tasks** - Gaps must be fixed in the current work process loop
2. **Loop back immediately** - Return to the earliest impacted phase (typically IMPLEMENT, sometimes earlier)
3. **Re-run all downstream phases** - VERIFY → REVIEW → PR → MONITOR must all be re-executed with gap fixes
4. **Only exception** - Gaps explicitly marked "out of scope" in the SPEC acceptance criteria
5. **Update evidence** - All evidence documents must reflect the gap fixes

**Example Violation:**
- ❌ REVIEW finds: "Missing error handling" → Recommendation: "Add in follow-up task TASK-456"
- ✅ REVIEW finds: "Missing error handling" → Action: Loop back to IMPLEMENT, add error handling, re-run VERIFY/REVIEW/PR/MONITOR

**What counts as a gap:**
- Missing implementation details (validation, error handling, edge cases)
- Incomplete documentation (troubleshooting, examples, migration guides)
- Unverified assumptions (performance without benchmarks, compatibility without tests)
- Design flaws (tight coupling, no graceful degradation, missing rollback)

**What is NOT a gap (can be deferred):**
- Items explicitly listed as "out of scope" in SPEC
- Follow-up features that are separate user stories (not in current acceptance criteria)
- Nice-to-have improvements beyond core functionality
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

**See:** Added 2025-10-28 after session where gaps were incorrectly deferred to follow-up tasks.

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
- **Verification Levels: `docs/autopilot/VERIFICATION_LEVELS.md` - REQUIRED READING** - 4-level taxonomy preventing false completion (Level 1: Compilation, Level 2: Smoke Testing, Level 3: Integration, Level 4: Production)
- Observability: `docs/autopilot/Observability-OTel-GenAI.md`
- Run `node tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --task <TASK_ID> --output state/evidence/<TASK_ID>/verify/oracle_coverage.json` to confirm every risk in `risk_oracle_map.json` has executing oracles before advancing (IMP-ORC-01).
