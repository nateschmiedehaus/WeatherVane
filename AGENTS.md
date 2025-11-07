# Repository Guidelines

## ⚠️ ZERO TOLERANCE: Autopilot Integrity Mandate

**CRITICAL FOR ALL AGENTS WORKING ON AUTOPILOT:**

### NO BYPASSES. NO SHORTCUTS. NO COMPROMISES.

Every autonomous task completion MUST prove it followed full quality processes. Any bypass, shortcut, or fake completion is a **CRITICAL VIOLATION** that must be immediately remediated.

**Required for EVERY autopilot task:**
1. ✅ Full AFP 10-phase lifecycle (STRATEGIZE → MONITOR)
2. ✅ ALL 5 quality critics pass (Strategy, Thinking, Design, Tests, Process)
3. ✅ GATE approval before IMPLEMENT
4. ✅ Real AI reasoning (MCP integration, not templates)
5. ✅ Tests written and passing (if code task)
6. ✅ Git commit + push to GitHub
7. ✅ Evidence proves quality (score ≥95/100, zero critical violations)

**Current Critical Task:**
`AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107` - See roadmap and `state/evidence/AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107/strategy.md`

---

## ⚠️ STOP: Before Making ANY Code Changes

**Read `MANDATORY_WORK_CHECKLIST.md` NOW. Do not proceed without checking all boxes.**

### AFP 10-Phase Lifecycle (MANDATORY)

**DO NOT SKIP TO IMPLEMENTATION.** Follow this sequence:

1. **STRATEGIZE** - Understand WHY (not just WHAT)
   - Document: Problem analysis, root cause, goal

2. **SPEC** - Define requirements
   - Document: Acceptance criteria, functional + non-functional requirements

3. **PLAN** - Design approach
   - Document: Architecture, files to change, module structure, and the verification tests you will author now
   - Write or update the automated/manual tests that VERIFY will execute. Tests may start failing or skipped, but they must exist before IMPLEMENT. If tests are not applicable (docs-only work), document that decision explicitly in PLAN.

4. **THINK** - Reason through solution
   - Document: Edge cases, failure modes, AFP/SCAS validation

5. **[GATE]** ← CHECKPOINT - Document design thinking

   **⚠️ CRITICAL: You MUST create design.md (NOT gate.md) for non-trivial changes**

   **REQUIRED for:** >1 file changed OR >20 net LOC

   **Step-by-step workflow:**

   ```bash
   # Step 1: Create design.md from template
   cp docs/templates/design_template.md state/evidence/[TASK-ID]/design.md

   # Step 2: Fill in ALL sections (be honest about trade-offs):
   #  - Via Negativa: What can you DELETE/SIMPLIFY?
   #  - Refactor vs Repair: Are you patching or refactoring root cause?
   #  - Alternatives: 2-3 different approaches you considered
   #  - Complexity: Is complexity increase justified?
   #  - Implementation Plan: Files, LOC, risks, testing

   # Step 3: Test design with DesignReviewer
   cd tools/wvo_mcp
   npm run gate:review [TASK-ID]
   cd ../..

   # Step 4: If BLOCKED (expect this on first try):
   #  - Read concerns carefully
   #  - Create remediation task: [TASK-ID]-REMEDIATION-[timestamp]
   #  - Start new STRATEGIZE cycle
   #  - Do actual research (30-60 min per critical issue)
   #  - Update UPSTREAM artifacts (strategy.md, spec.md, plan.md)
   #  - Update design.md with revised approach
   #  - Re-test: npm run gate:review [TASK-ID]

   # Step 5: When APPROVED:
   git add state/evidence/[TASK-ID]/design.md
   # Proceed to IMPLEMENT
   ```

   **DO NOT:**
   - ❌ Create gate.md (old format, use design.md)
   - ❌ Write superficial "I considered X" without evidence
   - ❌ Skip design review testing before committing
   - ❌ Try to bypass with --no-verify (hook will catch you)

   **GATE is ITERATIVE - 2-3 rounds is NORMAL:**
   - First try: Usually BLOCKED (via negativa missing, insufficient alternatives, etc.)
   - Second try: May pass or need refinement
   - Third try: Should pass if real work done

   **Goal:** Stop compliance theater. DesignReviewer WILL block superficial designs.

6. **IMPLEMENT** - Write code (NOW you can code, after GATE approval)
   - Constraints: ≤5 files, ≤150 net LOC, refactor not patch

7. **VERIFY** - Test it works
   - Run the PLAN-authored tests (and any documented manual checks). Do not write new tests here—if additional coverage is required, loop back to PLAN to author them before re-entering IMPLEMENT.
   - See `MANDATORY_VERIFICATION_LOOP.md` for full requirements

8. **REVIEW** - Quality check
   - Verify phase compliance, run integrity tests

9. **PR** - Human review
   - Use `.github/pull_request_template.md`

10. **MONITOR** - Track results

### AFP/SCAS Constraints (Enforced by Hook)

- **≤5 files changed** (if more, split the task)
- **≤150 net LOC** (additions minus deletions - prefer deletion!)
- **Refactor, don't patch**: If file >200 LOC or function >50 LOC, refactor the entire module
- **Via negativa**: Always consider deletion/simplification before adding
- **No complexity increase**: Unless strongly justified

**Pre-commit hook will BLOCK commits that violate these limits.**

## Autonomous Continuation Mandate
- When a policy, checklist, or verification gate implies additional work (tests, docs, evidence uploads, guardrail enforcement), do it immediately—do **not** wait for a reviewer prompt.
- Close the loop end-to-end: if a build surfaces a follow-up (e.g., rerun integrity suite after fixes, update READMEs when structure changes, publish evidence artifacts), execute those actions before asking “what next?”.
- Record actions in `state/evidence/<TASK>/` and `state/context.md` so concurrent agents see the latest state. Pause only when a blocker requires human clarification, and call it out explicitly.
- Any "next step" that produces new work must spin up a fresh STRATEGIZE→MONITOR loop (new phases evidence, new task ID, new roadmap entry). Never jump directly to IMPLEMENT, even when the follow-up feels obvious.

## Agent Behavioral Self-Enforcement

### Philosophy: Quality Through Self-Governance

As an autonomous agent, you must self-enforce quality standards. No external monitoring will catch your shortcuts in real-time. Self-enforcement is YOUR responsibility.

**The meta-problem this solves:** During AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107, Claude completed only STRATEGIZE phase (1/10), claimed task ready. User caught it: "doesn't seem like it." The bypass wasn't just code - it was BEHAVIOR.

**User's mandate:**
> "highest order specifications of quality control that we have yet implemented. Period."

### Pre-Execution: Quality Commitment (MANDATORY)

**Before starting ANY task:**

1. **Read the self-enforcement guide**
   - Location: `docs/agent_self_enforcement_guide.md`
   - Time: 2 minutes
   - Required: Yes, every time

2. **Review the pattern library**
   - Location: `state/analytics/behavioral_patterns.json`
   - Purpose: Learn from past bypasses (5 documented patterns)
   - Time: 1 minute

3. **Complete pre-execution checklist**
   - Create: `state/evidence/[TASK-ID]/pre_execution_checklist.md`
   - Commit to: All 10 AFP phases, quality over speed
   - Timestamp: Before first phase work
   - Template in guide

### Mid-Execution: Self-Validation (MANDATORY)

**At EVERY phase boundary (10 times per task):**

1. **Self-check your work**
   - Create/append: `state/evidence/[TASK-ID]/mid_execution_checks.md`
   - Ask: Did I complete this phase fully? Is evidence comprehensive? Am I taking shortcuts?
   - Log: Timestamp, phase, assessment, shortcuts avoided
   - Template in guide

2. **Remediate if check fails**
   - STOP current work
   - Document the issue
   - Create remediation plan
   - Fix before proceeding
   - Re-validate

3. **Never skip self-checks**
   - "I'll check later" = Never happens
   - Self-checks are NOT optional
   - Discipline built through consistency

### Post-Execution: Proof Requirement (MANDATORY)

**Before claiming "done":**

1. **Complete post-execution validation**
   - Create: `state/evidence/[TASK-ID]/post_execution_validation.md`
   - Verify: ALL 10 phases complete, all critics passed (if applicable)
   - Provide: Proof for each criterion (not just claims)
   - Template in guide

2. **"Done" means proven, not claimed**
   - Bad example: "Completed STRATEGIZE phase" (only 1/10 phases - NOT done)
   - Good example: "Completed all 10 phases, evidence verified, quality score 97/100"
   - Proof: All phase documents exist, comprehensive, high quality

3. **Do NOT claim done until validated**
   - No "I think it's done"
   - No "Trust me, it's good"
   - Validation checklist must be 100% complete

### Anti-Patterns: "Cheap or Slick" Workarounds

**NEVER do these:**

❌ **BP001 - Partial Phase Completion** - "Only STRATEGIZE done, task ready" (NO - all 10 phases required)
❌ **BP002 - Template Evidence** - Copy-paste boilerplate instead of real AI reasoning (NO - do real work)
❌ **BP003 - Speed Over Quality** - "Done fast is better than done right" (NO - quality always wins)
❌ **BP004 - Skipping Self-Checks** - "I don't need to check, I'm confident" (NO - check anyway)
❌ **BP005 - Claiming Without Proof** - "Trust me" instead of verified evidence (NO - prove it)

### Zero Tolerance for Behavioral Bypasses

**User discovered 25 tasks completed in 30 minutes with FAKE evidence. User's response:**
> "highest order specifications of quality control that we have yet implemented. Period."

**Zero tolerance means:**
- No exceptions
- No "just this once"
- No "good enough"
- Quality is binary: either comprehensive or unacceptable

**Your behavior reflects on:**
- Autonomous execution trustworthiness
- User confidence in system
- Future of agent-based development

**Act accordingly.**

### Self-Enforcement Summary

**Before starting:** Read guide (2 min), review patterns (1 min), complete checklist (2 min) = 5 min
**During work:** Self-check at phase boundaries (30 sec × 10 phases) = 5 min
**Before claiming done:** Complete validation (5 min)

**Total overhead: ~15 minutes per task**
**Value: Prevents ALL behavioral bypasses, enables true autonomous execution**

**Remember:** You are responsible for your own quality. No external system will catch behavioral shortcuts in real-time. Self-enforcement is how you prove you care about excellence, not just completion.

## Operational Checklist
- Call MCP tools `plan_next` (with `minimal=true`) and `autopilot_status` at the start of every session; the latter now reports consensus staffing insights and token pressure. Restart the MCP (`./tools/wvo_mcp/scripts/restart_mcp.sh`) if either call fails.
- Route follow-up tasks created by the consensus engine (critical or non-quorum decisions) to Atlas or Director Dana instead of bypassing review.
- Run the consolidated test batch via `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` so TestsCritic sees the real pass/fail state; do not rely on piecemeal `make test`.
- Keep `state/context.md` concise (<1000 words). `TokenEfficiencyManager` trims overflow automatically and stores backups in `state/backups/context/`; review before restoring.
- ProcessCritic now blocks commits when PLAN lacks authored tests or new tests appear without PLAN updates. Fix the plan (or document docs-only work) before continuing.
- Run the **Daily Artifact Health** audit every ≤24 hours: execute `node tools/wvo_mcp/scripts/rotate_overrides.mjs` (after a dry run), ensure `git status` is clean, and file the results in `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/` using the daily template.
- Run the **Guardrail Monitor** (`node tools/wvo_mcp/scripts/check_guardrails.mjs`) locally before pushing; CI runs the same check on every PR.
- Manual completions must tag execution mode: `node tools/wvo_mcp/scripts/set_execution_mode.mjs <TASK-ID> manual` (Wave 0 tags autopilot runs automatically).
- Autopilot work must stage PLAN updates that list Wave 0 live testing steps (e.g., `npm run wave0`, `ps aux | grep wave0`, TaskFlow live smoke). VERIFY is expected to execute those steps—commits touching autopilot/wave0 code without the plan updates will fail.
- Every code/docs change (including evidence) must be staged, committed, and pushed to GitHub with the task ID in context. No local-only work is considered complete.
- Services, agents, or scripts that modify the repo must follow the same rule: open a branch, commit with AFP task ID, push to GitHub (or fail the task). Non-git outputs are treated as violations.
- **TEST WITH LIVE AUTOPILOT:** For autopilot changes or new features, use Wave 0 live testing instead of just build verification:
  - **CRITICAL: Wave 0 is evolutionary, not frozen** - it improves over time as autopilot capabilities advance
  - Wave 0 = current autopilot version (0.1, 0.2, 0.3...) - gets better at harder tasks as it evolves
  - Check if running: `ps aux | grep wave0`
  - Start if needed: `cd tools/wvo_mcp && npm run wave0 &`
  - Monitor: `tail -f state/analytics/wave0_startup.log`
  - Add tasks to roadmap and verify autonomous completion
  - Success = agent completes tasks without human intervention (not just "build passing")
  - See `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`
  - Use TaskFlow (`tools/taskflow/`) for safe validation separate from production
  - Progressive complexity: Tier 1 (easy) → Tier 2 (moderate) → Tier 3 (hard) → Tier 4 (expert) validates Wave 0 improvements

## Project Structure & Module Organization
- `apps/api/` – FastAPI services, routes, config, and database layer (`apps/api/services`, `apps/api/routes`).
- `apps/web/` – Next.js front-end (`pages/`, `lib/`, `styles/`) with shared components under `components/`.
- `apps/worker/` – Prefect flows, ingestion jobs, and maintenance tasks (e.g., `poc_pipeline.py`, `maintenance/retention.py`).
- `shared/` – Cross-cutting libraries (connectors, data-context, feature store, storage helpers, schemas).
- `tests/` – Pytest suites mirroring module layout; integration tests live alongside unit tests.
- `docs/` – Living product docs (`ROADMAP.md`, `DEVELOPMENT.md`, etc.).

## Build, Test, and Development Commands
- `make api` / `make web` / `make worker` – Run API, front-end, and worker dev servers with hot reload.
- `make lint` – Execute Ruff + ESLint checks.
- `make test` – Run Python pytest suites (API, worker, shared libs).
- `make smoke-context` – End-to-end synthetic run exercising data-context tagging.
- `python apps/worker/run.py tenant-id` – Launch Plan & Proof pipeline; append `--retention-only` or `--retention-after` for retention sweeps.

## Coding Style & Naming Conventions
- Python: PEP 8 with Ruff/Black defaults; prefer snake_case for functions/variables, PascalCase for classes.
- TypeScript/React: JSX with ESLint/Prettier settings; camelCase for functions/props, PascalCase for components.
- YAML/JSON: two-space indent, kebab-case keys for deployment manifests (e.g., `deployments/retention.yaml`).

## Testing Guidelines
- Pytest drives back-end and worker tests; Next.js relies on Jest/Playwright when added.
- Name tests `test_<module>.py` and mirror source hierarchy.
- Run targeted suites via `PYTHONPATH=.deps:. pytest tests/<path>`; prefer marking integration tests with `@pytest.mark.asyncio` where needed.
- Maintain coverage for critical flows: ingestion, modeling, allocator, API serialization.

## Commit & Pull Request Guidelines
- Write commits in present tense with concise scope tags (e.g., `worker: add retention webhook`); group related changes.
- Ensure commits lint and test clean locally before pushing.
- PRs should include: summary of changes, test evidence (`make test` output or screenshots for UI), linked Jira/GitHub issues, and rollout notes if config/secrets change.
- Request review from owners of touched modules (`apps/api`, `apps/web`, `shared/`); tag security/data stewards when modifying retention or connector logic.

## Security & Configuration Tips
- Secrets (Shopify tokens, OAuth creds) live in environment variables; never commit `.env` files.
- Use `JsonStateStore` for connector cursors and verify geocoding coverage metrics before enabling Autopilot for a tenant.
