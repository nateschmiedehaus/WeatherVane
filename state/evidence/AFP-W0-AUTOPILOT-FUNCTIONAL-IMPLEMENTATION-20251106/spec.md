# SPEC: Wave 0 Autopilot Functional Implementation

**Task ID:** AFP-W0-AUTOPILOT-FUNCTIONAL-IMPLEMENTATION-20251106
**Date:** 2025-11-06
**Owner:** Claude Council

---

## Acceptance Criteria

### AC1: Full AFP 10-Phase Execution
**Requirement:** Wave 0 executes all 10 AFP phases (STRATEGIZE → SPEC → PLAN → THINK → GATE → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR) with real analysis and work

**Test:**
```bash
# Execute Wave 0 on test task
cd tools/wvo_mcp && WAVE0_SINGLE_RUN=1 npm run wave0

# Inspect evidence bundle
ls state/evidence/[TASK-ID]/
cat state/evidence/[TASK-ID]/strategy.md
cat state/evidence/[TASK-ID]/design.md
cat state/evidence/[TASK-ID]/implement.md
cat state/evidence/[TASK-ID]/verify.md
```

**Success:**
- All 10 phase files exist AND contain real content (not placeholders)
- strategy.md contains WHY analysis with evidence from codebase (≥3 file references)
- spec.md contains measurable acceptance criteria (≥3 criteria)
- plan.md contains architecture + PLAN-authored tests (≥1 test defined before implementation)
- think.md contains edge cases and failure modes (≥3 scenarios analyzed)
- design.md contains AFP/SCAS analysis that passes DesignReviewer (7/9+ score)
- implement.md shows real code changes (file paths, diffs, rationale documented)
- verify.md shows test execution results (build passed + PLAN-authored tests executed)
- review.md shows quality gates passed (ProcessCritic validation results)
- monitor.md shows completion status

**Measurement:** Semantic analysis of evidence files (grep for placeholder phrases should return 0 results)

---

### AC2: Real Code Implementation
**Requirement:** Wave 0 makes actual code changes to the repository (not just evidence file generation)

**Test:**
```bash
# Before Wave 0
git status
BEFORE_COMMIT=$(git rev-parse HEAD)

# Execute Wave 0 on implementation task
cd tools/wvo_mcp && WAVE0_SINGLE_RUN=1 npm run wave0

# After Wave 0
git diff $BEFORE_COMMIT --stat
git diff $BEFORE_COMMIT --name-only | grep -v "state/evidence"
```

**Success:**
- ≥1 file modified outside state/evidence/ directory
- Changes implement task requirements (manual verification)
- Build passes: `npm run build` succeeds
- Tests pass: `npm test` succeeds
- Changes follow AFP/SCAS principles (measurable via DesignReviewer score ≥7/9)

**Measurement:** `git diff` shows non-zero changes outside evidence directory, build and tests passing

---

### AC3: Quality Gates Enforced
**Requirement:** Wave 0 runs quality gates (DesignReviewer, ProcessCritic) and respects their verdicts (blocks on concerns, proceeds on approval)

**Test:**
```bash
# Execute Wave 0, monitor quality gate execution
cd tools/wvo_mcp && WAVE0_SINGLE_RUN=1 npm run wave0 2>&1 | tee wave0_run.log

# Check analytics for quality gate results
cat state/analytics/gate_metrics.jsonl | tail -1
cat state/evidence/[TASK-ID]/verify.md
```

**Success:**
- DesignReviewer executes on design.md (logged in analytics)
- ProcessCritic executes on evidence bundle (logged in analytics)
- If concerns found:
  - Wave 0 attempts auto-remediation (≤3 attempts) OR
  - Wave 0 escalates to human with specific context (logged in analytics)
- If approved: Wave 0 proceeds to next phase
- Quality gate bypass rate = 0% (Wave 0 never skips quality checks)

**Measurement:** Analytics logs show quality gate execution for 100% of tasks, approval/remediation decisions tracked

---

### AC4: Autonomous Operation (1-hour soak test)
**Requirement:** Wave 0 completes ≥1 task end-to-end without human intervention in 1-hour observation period

**Test:**
```bash
# Start Wave 0 in continuous mode
cd tools/wvo_mcp && npm run wave0 &
WAVE0_PID=$!

# Monitor for 1 hour
timeout 3600 tail -f state/analytics/wave0_runs.jsonl

# Verify completion
ps aux | grep $WAVE0_PID  # Should still be running or gracefully exited
cat state/roadmap.yaml | grep -A5 "[completed task ID]"  # Status should be "done"
```

**Success:**
- Wave 0 selects task autonomously from roadmap (no human prompt)
- Executes all 10 AFP phases without manual intervention
- Commits changes to git (or creates commit ready for push)
- Updates task status in roadmap.yaml to "done"
- No crashes, no stuck states (verified by continuous log output)
- No manual interventions required (observation confirms autopilot behavior)

**Measurement:** Observe logs for 1 hour, verify ≥1 task completed with status updated in roadmap

---

### AC5: Evidence Quality Validation
**Requirement:** Wave 0-generated evidence passes critic quality review at ≥70% approval rate

**Test:**
```bash
# Execute Wave 0 on 10 test tasks
for i in {1..10}; do
  cd tools/wvo_mcp && WAVE0_SINGLE_RUN=1 npm run wave0
  TASK_ID=$(cat state/analytics/wave0_runs.jsonl | tail -1 | jq -r '.taskId')

  # Run critics on generated evidence
  npm run strategy:review $TASK_ID 2>&1 | tee review_$i.log
  npm run think:review $TASK_ID 2>&1 | tee think_$i.log
  cd ../..
done

# Calculate approval rate
grep "APPROVED" review_*.log | wc -l  # Should be ≥7/10
grep "APPROVED" think_*.log | wc -l    # Should be ≥7/10
```

**Success:**
- StrategyReviewer approval rate ≥70% (≥7 out of 10 tasks)
- ThinkingCritic approval rate ≥70% (≥7 out of 10 tasks)
- Critic feedback is actionable (when blocked, specific improvements suggested)
- Wave 0 learns from feedback (approval rate improves over time - measured across multiple runs)

**Measurement:** Run critics on Wave 0 output, calculate approval percentage, compare to human baseline (≥70%)

---

## Functional Requirements

### FR1: MCP Integration for Tool Execution
**Description:** Wave 0 must integrate with MCP (Model Context Protocol) to call Claude Code tools (Read, Edit, Write, Bash, Grep, Glob) for performing actual work

**Priority:** Critical

**Rationale:** Without MCP integration, Wave 0 cannot execute real work (remains a stub). This is THE core capability.

**Implementation Requirements:**
- Create MCP client wrapper (or use existing MCP TypeScript library)
- Support Read tool (read files for context gathering)
- Support Edit tool (modify existing files)
- Support Write tool (create new files)
- Support Bash tool (run build, tests, validation scripts)
- Support Grep/Glob tools (search codebase for context)
- Handle MCP errors gracefully (network timeout, tool failure, permission denied)
- Log all MCP calls to analytics (tool name, parameters, result, execution time)

---

### FR2: AFP Phase Execution Engine
**Description:** Wave 0 must execute each AFP phase with real analysis (not placeholders)

**Priority:** Critical

**Rationale:** AFP 10-phase lifecycle is the process foundation - skipping phases or using placeholders defeats the purpose.

**Implementation Requirements:**

**STRATEGIZE phase:**
- Read task definition from roadmap.yaml
- Read epic/set context (check for README files)
- Read related files from codebase (grep for keywords, find similar patterns)
- Analyze WHY this task matters (evidence-based reasoning)
- Write strategy.md with substantive analysis (≥30 lines, not generic template)

**SPEC phase:**
- Define ≥3 measurable acceptance criteria based on task requirements
- Define functional requirements (what system must do)
- Define non-functional requirements (performance, reliability, maintainability targets)
- Write spec.md with clear success metrics

**PLAN phase:**
- Design approach following AFP/SCAS principles (via negativa, refactor not repair)
- Identify files to change (grep for patterns, find similar implementations)
- Estimate LOC (conservative estimate based on similar changes)
- **CRITICAL:** Author tests BEFORE implementation (PLAN-authored tests requirement)
  - Define ≥1 test in plan.md (test description, success criteria, how to execute)
  - ProcessCritic will validate tests exist before allowing IMPLEMENT
- Write plan.md with architecture, approach, and verification strategy

**THINK phase:**
- Analyze edge cases (what inputs could break this? what assumptions are fragile?)
- Identify failure modes (what can go wrong? what are the consequences?)
- Assess complexity (is this increase justified? can we simplify?)
- Write think.md with depth analysis (≥3 edge cases, ≥3 failure modes)

**GATE phase:**
- Create design.md with AFP/SCAS analysis:
  - Via Negativa: What are we deleting/simplifying?
  - Refactor not Repair: Addressing root cause or patching symptoms?
  - Alternatives: What other approaches were considered? (≥2 alternatives)
  - Complexity: Is increase justified? What's the ROI?
  - Implementation Plan: Files, LOC, risks, testing approach
- Run DesignReviewer for quality check
- If concerns found: attempt remediation (up to 3 attempts) or escalate
- If approved: proceed to IMPLEMENT

**IMPLEMENT phase:**
- Execute actual code changes using MCP tools (Edit, Write)
- Make PLAN-authored tests pass (run tests, fix failures iteratively)
- Follow refactor-not-repair principle (address root cause)
- Document changes in implement.md (what changed, why, how tested)

**VERIFY phase:**
- Run build: `npm run build` (must pass)
- Run PLAN-authored tests (execute tests defined in PLAN phase)
- Run existing tests: `npm test` (must not break existing functionality)
- Capture results in verify.md (build status, test results, pass/fail counts)

**REVIEW phase:**
- Run ProcessCritic (validate AFP compliance)
- Confirm quality gates passed
- Document review results in review.md

**PR phase (optional for autopilot):**
- Commit changes with proper commit message format
- Either: auto-commit to feature branch OR create PR (configurable)

**MONITOR phase:**
- Update monitor.md with completion status
- Log analytics (execution time, LOC changed, tests passed, quality scores)

---

### FR3: Quality Gate Integration
**Description:** Wave 0 must run quality gates (DesignReviewer, ProcessCritic) and respect their verdicts

**Priority:** High

**Rationale:** Quality gates prevent low-quality work from proceeding. Autopilot must enforce quality rigorously (no shortcuts).

**Implementation Requirements:**
- Integrate DesignReviewer into GATE phase (run on design.md)
- Integrate ProcessCritic into REVIEW phase (run on evidence bundle)
- Parse critic results (approved vs blocked, concerns list)
- If approved: proceed to next phase
- If blocked: attempt remediation
  - Remediation strategy: re-run phase with critic feedback incorporated into prompt
  - Max remediation attempts: 3
  - After 3 failures: escalate to human (log to state/escalations/, update task status to "blocked")
- Log all quality gate executions to state/analytics/gate_metrics.jsonl

---

### FR4: Evidence Bundle Management
**Description:** Wave 0 must generate complete, high-quality evidence bundles for all tasks

**Priority:** High

**Rationale:** Evidence bundles are the audit trail proving work was done correctly. Incomplete evidence undermines trust.

**Implementation Requirements:**
- Create evidence directory: state/evidence/[TASK-ID]/
- Generate all 10 AFP phase files (strategy.md through monitor.md)
- Content must be substantive (not placeholders - semantic analysis should pass)
- Include metadata.json (task ID, title, execution mode, timestamps, quality scores)
- Include phases.json (phase status tracking)
- Update summary.md with execution results (status, proof snapshot, references)
- Archive old evidence (move to state/archive/ after 90 days - optional for Wave 0, defer to Wave 1)

---

### FR5: Task Selection and Status Management
**Description:** Wave 0 must autonomously select tasks from roadmap and update status correctly

**Priority:** High

**Rationale:** Autonomous operation requires no human intervention for task selection.

**Implementation Requirements:**
- Read state/roadmap.yaml (parse YAML structure)
- Find pending tasks (status: "pending")
- Apply prioritization logic:
  - Wave 0.0: simple first-found (no complex prioritization)
  - Future: respect dependencies, urgency, epic sequence
- Update task status: pending → in_progress → done/blocked
- Log task selection rationale to analytics (why this task chosen?)

---

### FR6: Error Handling and Escalation
**Description:** Wave 0 must handle errors gracefully and escalate when stuck

**Priority:** High

**Rationale:** Autonomous operation will encounter errors (MCP timeouts, quality gate failures, unexpected file states). Must not crash or corrupt repository.

**Implementation Requirements:**
- Detect stuck state (3 consecutive failures on same phase)
- Escalate to human with context:
  - What was attempted (phase, tool calls, parameters)
  - What failed (error messages, stack traces)
  - What was tried for remediation (retry attempts, different approaches)
  - Proposed fix (if known) or request for guidance
- Log escalation to state/escalations/[TASK-ID]-escalation.md
- Update task status to "blocked" in roadmap
- Do NOT corrupt repository state (git worktree must remain clean on error)
- Implement rollback capability (if git errors detected, stash changes and revert)

---

### FR7: Git Hygiene and Safety
**Description:** Wave 0 must maintain clean git worktree and never corrupt repository

**Priority:** Critical

**Rationale:** Repository corruption blocks all work. Git safety is non-negotiable.

**Implementation Requirements:**
- Validate clean worktree before starting task (`git status` must show clean or only evidence files)
- Use LeaseManager to prevent concurrent task execution (file locking)
- Auto-stash uncommitted changes before operations (if any exist outside evidence/)
- Auto-restore stash after operations complete
- Commit changes atomically (all or nothing - no partial commits)
- Respect micro-batching limits (≤5 files, ≤150 LOC per commit)
- Run `git fsck` after each commit (detect corruption immediately)
- If git errors detected: rollback changes, log error, escalate

---

### FR8: Analytics and Telemetry
**Description:** Wave 0 must log comprehensive analytics for all executions

**Priority:** Medium

**Rationale:** Analytics enable learning, debugging, and performance improvement.

**Implementation Requirements:**
- Log to state/analytics/wave0_runs.jsonl (JSONL format for easy parsing):
  - Task ID, title, status
  - Start time, end time, execution time (ms)
  - Phases executed (which phases completed, which failed)
  - Quality gate results (DesignReviewer approval, ProcessCritic validation)
  - Error information (if any)
- Log to state/analytics/gate_metrics.jsonl:
  - Task ID, phase (GATE/REVIEW)
  - Critic name (DesignReviewer, ProcessCritic)
  - Approval/blocked status
  - Concerns list (if blocked)
  - Remediation attempts
  - Duration (time from design.md creation to approval)
- Log MCP tool calls (optional - useful for debugging):
  - Tool name, parameters, result summary, execution time

---

## Non-Functional Requirements

### NFR1: Performance
- **Task selection:** <5 seconds (read roadmap.yaml, parse YAML, find pending task)
- **Phase execution:** <2 minutes per phase average (total task execution <20 minutes for standard tasks)
- **MCP tool calls:** <10 seconds per tool call (timeouts at 30 seconds)
- **Build verification:** Use existing build cache (don't force clean builds)
- **Memory footprint:** <500MB for Wave 0 process

**Target:** Complete standard task in <30 minutes end-to-end

---

### NFR2: Reliability
- **Uptime:** ≥1 hour continuous operation without crash (partial soak test)
- **Error recovery:** ≥90% of transient errors recovered automatically (retry logic)
- **Data integrity:** Zero repository corruptions across 10 test runs (`git fsck` passes after each run)
- **Graceful degradation:** If critic fails, log warning but continue (don't block on critic infrastructure issues)

**Target:** 90% task success rate on standard tasks (well-defined requirements, existing patterns, low complexity)

---

### NFR3: Maintainability
- **Code simplicity:** ≤700 LOC for execution engine (target 500-600 LOC, acceptable up to 700 LOC)
- **Modularity:** Each AFP phase is a separate function (executeStrategize(), executeSpec(), etc.) - easy to test and modify independently
- **Configuration:** All tunable parameters in config (not hardcoded):
  - Rate limit (WAVE0_RATE_LIMIT_MS env var)
  - Remediation max attempts (default 3, configurable)
  - MCP timeout (default 30s, configurable)
  - Quality gate strictness (defer to Wave 1)
- **Logging:** All decisions logged with rationale (auditable execution trail)
- **Documentation:** README explains how to run, monitor, debug Wave 0

**Target:** New developer can understand Wave 0 execution flow in <30 minutes of code reading

---

### NFR4: Extensibility
- **Wave evolution:** Clear path from Wave 0.0 → 0.1 → 0.2 → 0.3 (incremental improvements)
- **Pluggable critics:** Add new critics without changing core execution logic
- **Custom phases:** Easy to add new AFP phases (if process evolves) without refactoring
- **Pattern library:** Easy to add new AFP/SCAS patterns to reference during GATE phase

**Target:** Adding new critic requires <50 LOC and no changes to execution engine

---

### NFR5: Observability
- **Real-time monitoring:** Can observe Wave 0 execution in progress (tail -f state/analytics/wave0_runs.jsonl)
- **Health checks:** Can check Wave 0 status (running, stuck, crashed) via ps aux | grep wave0 and log analysis
- **Audit trail:** Full history of decisions, actions, outcomes in analytics JSONL files
- **Error diagnosis:** Logs provide enough context to debug failures (stack traces, tool call parameters, MCP responses)

**Target:** Diagnose Wave 0 failure in <10 minutes using only logs (no code debugging needed)

---

## Quality Standards

### Code Quality
- **Test coverage:** 7/7 dimensions per UNIVERSAL_TEST_STANDARDS.md
  - Unit tests for each AFP phase executor function
  - Integration tests for MCP client
  - End-to-end test for full task execution
  - Error handling tests (simulate MCP failures)
  - Quality gate integration tests
  - Git safety tests (worktree corruption scenarios)
  - Performance tests (task execution time)
- **AFP/SCAS score:** 7/9 minimum (this task must pass own quality gates)
- **Complexity:** Cyclomatic complexity ≤10 per function (keep functions simple)
- **Documentation:** README + inline comments for complex logic

### Process Compliance
- [ ] All 10 AFP phases followed for this task (meta: Wave 0 implementation must follow AFP)
- [ ] Evidence bundle complete (this task's evidence under state/evidence/AFP-W0-AUTOPILOT-FUNCTIONAL-IMPLEMENTATION-20251106/)
- [ ] PLAN-authored tests defined before implementation (this spec defines tests as acceptance criteria)
- [ ] DesignReviewer approval before IMPLEMENT

---

## Exit Criteria

**This task exits when ALL of the following are true:**

- [ ] All 5 acceptance criteria (AC1-AC5) validated and passing
- [ ] All 8 functional requirements (FR1-FR8) implemented
- [ ] All 5 non-functional requirements (NFR1-NFR5) met
- [ ] Code quality standards achieved (7/7 test dimensions, AFP/SCAS 7/9+)
- [ ] Build passes: `cd tools/wvo_mcp && npm run build` succeeds
- [ ] Tests pass: `cd tools/wvo_mcp && npm test` succeeds (including new Wave 0 tests)
- [ ] Live validation: 1-hour soak test completes ≥1 task autonomously
- [ ] Evidence bundle complete: state/evidence/AFP-W0-AUTOPILOT-FUNCTIONAL-IMPLEMENTATION-20251106/ has all 10 phase files
- [ ] Quality gates passed: DesignReviewer approved design.md, ProcessCritic validated evidence

**Final validation test:**
```bash
# Clean slate
git status  # Must be clean

# Run Wave 0 on real task
cd tools/wvo_mcp && WAVE0_SINGLE_RUN=1 npm run wave0

# Verify real work done
git diff --stat  # Should show changes outside state/evidence/
npm run build     # Must pass
npm test          # Must pass

# Verify evidence quality
TASK_ID=$(cat state/analytics/wave0_runs.jsonl | tail -1 | jq -r '.taskId')
cat state/evidence/$TASK_ID/strategy.md | grep -i "placeholder"  # Should return nothing
npm run strategy:review $TASK_ID  # Should approve or provide actionable feedback

# Success: Task status updated, code committed, evidence generated, quality validated
```

---

## Constraints

### Technical Constraints
- **MCP dependency:** Requires MCP client library or custom wrapper (investigate in PLAN phase)
- **Micro-batching limits:** ≤5 files, ≤150 LOC per commit (enforcement via pre-commit hook)
  - This constraint means Wave 0 implementation must be split into ~4-5 sub-tasks
  - Each sub-task delivers one cohesive capability (e.g., sub-task 1: MCP client, sub-task 2: STRATEGIZE/SPEC/PLAN executors, sub-task 3: THINK/GATE executors, sub-task 4: IMPLEMENT/VERIFY executors, sub-task 5: REVIEW/PR/MONITOR executors)
- **TypeScript/Node.js:** Must use existing tech stack (no new languages)
- **Git safety:** Must never corrupt repository (test with git fsck after each operation)

### Process Constraints
- **AFP compliance:** This task must follow AFP 10-phase lifecycle (meta-requirement: building autopilot using autopilot process)
- **PLAN-authored tests:** Tests must be defined in plan.md BEFORE implementation (ProcessCritic enforces)
- **Quality gates:** DesignReviewer must approve design.md before IMPLEMENT phase
- **Evidence completeness:** All 10 phase files must exist and be substantive (not placeholders)

### Resource Constraints
- **Development time:** Target <1 week (5-7 calendar days)
- **LOC budget:** Target 500-600 LOC, acceptable up to 700 LOC (split into 4-5 micro-batches)
- **Token budget:** Wave 0 will consume tokens on each execution - must monitor and stay within reasonable limits
- **Evidence growth:** Each Wave 0 execution creates evidence bundle - must respect <2MB/month target

---

## Traceability

### Maps to Strategic Objectives (from strategy.md):

**Strategic objective: Unblock WAVE-0 completion**
- → AC4 (Autonomous Operation) - demonstrates ≥4 hour unattended operation capability
- → FR2 (AFP Phase Execution) - proves full lifecycle execution
- → FR7 (Git Hygiene) - proves worktree stability

**Strategic objective: Enable autonomous task execution**
- → AC1 (Full AFP Execution) - all phases executed with real analysis
- → AC2 (Real Code Implementation) - actual work delivered
- → FR1 (MCP Integration) - enables real tool execution

**Strategic objective: Prove quality enforcement works**
- → AC3 (Quality Gates Enforced) - DesignReviewer and ProcessCritic integrated
- → AC5 (Evidence Quality) - generated evidence passes critic review
- → FR3 (Quality Gate Integration) - quality checks are real, not bypassed

**Strategic objective: Save 30 hours per 40 tasks**
- → NFR1 (Performance) - task execution <30 minutes
- → NFR2 (Reliability) - 90% success rate on standard tasks
- → AC4 (Autonomous Operation) - runs unattended

**Strategic objective: Provide force multiplier (2-4x velocity increase)**
- → AC4 (Autonomous Operation) - 24/7 execution capability
- → NFR2 (Reliability) - high success rate enables volume
- → FR5 (Task Selection) - autonomously selects next work

### Validates Success Criteria (from strategy.md):

**Success criterion 1: ✅ Full AFP 10-Phase Execution**
- → AC1 (maps directly)
- → FR2 (implements this)

**Success criterion 2: ✅ Real Code Changes Delivered**
- → AC2 (maps directly)
- → FR1, FR2, FR6 (enable this)

**Success criterion 3: ✅ Quality Gates Enforced**
- → AC3 (maps directly)
- → FR3 (implements this)

**Success criterion 4: ✅ Autonomous Operation Demonstrated**
- → AC4 (maps directly)
- → FR5, FR6, FR7 (enable this)

**Success criterion 5: ✅ Evidence Quality Validated**
- → AC5 (maps directly)
- → FR4 (implements this)

**All 5 strategic success criteria have clear traceability to acceptance criteria and functional requirements.**

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md (Design implementation approach, author tests)
**Owner:** Claude Council

---

## Notes

### Test Strategy Summary:
Each acceptance criterion defines its own test (see AC1-AC5 above). Additional tests will be defined in plan.md following PLAN-authored tests requirement.

### Out of Scope (Deferred to WAVE-1):
- Multi-task planning (Wave 0 executes 1 task at a time)
- Intelligent prioritization (Wave 0 uses simple first-found)
- Self-healing (Wave 0 escalates to human when stuck)
- Advanced error recovery (Wave 0 has basic retry logic only)
- Pattern recommendation engine (Wave 0 references existing patterns manually)
- Cross-task learning (Wave 0 treats each task independently)

### Dependencies on Other W0 Tasks:
- **W0.M1 git hygiene:** Required for FR7 (git safety) - must be operational before Wave 0 live execution
- **Critic infrastructure:** DesignReviewer, ProcessCritic must be functional for FR3 (quality gates)
- **TaskFlow harness:** Useful for testing Wave 0 safely before live execution (recommended but not blocking)

### Risk Acceptance:
Accepting that Wave 0.0 will not be perfect:
- 50-70% success rate on first attempts is acceptable (will improve to 90%+ over time)
- Some quality gate false positives are expected (tune thresholds based on data)
- Some tasks will require human escalation (complex/novel work beyond Wave 0.0 capability)

Focus is **minimally viable but fully functional** - establishes foundation for iterative improvement in Wave 0.1/0.2/0.3.
