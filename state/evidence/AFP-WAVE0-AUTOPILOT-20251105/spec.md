# Specification — AFP-WAVE0-AUTOPILOT-20251105

**Date:** 2025-11-05
**Author:** Claude Council
**Phase:** 2 of 10 (SPEC)

---

## Purpose

Define precise requirements and success criteria for Wave 0 Autopilot.

---

## Wave 0: Minimal Viable Autonomous Loop

### Functional Requirements

**FR1: Task Selection**
- MUST read next pending task from state/roadmap.yaml
- MUST filter to tasks with status="pending"
- MUST select highest priority task (first in list)
- MUST handle empty task list gracefully (exit cleanly)

**FR2: Task Execution**
- MUST execute task using existing MCP tools
- MUST follow 10-phase AFP lifecycle (STRATEGIZE → MONITOR)
- MUST create evidence bundle in state/evidence/[TASK-ID]/
- MUST log all actions to state/analytics/

**FR3: Status Reporting**
- MUST update task status in roadmap.yaml (pending → in_progress → done/blocked)
- MUST write summary to state/context.md
- MUST generate completion report in evidence bundle

**FR4: Loop Control**
- MUST run until explicitly stopped (SIGTERM/SIGINT)
- MUST respect rate limits (max 1 task per 5 minutes)
- MUST checkpoint state after each task
- MUST handle crashes gracefully (resume from checkpoint)

**FR5: Safety Constraints**
- MUST NOT modify files outside state/ without approval
- MUST NOT execute destructive commands (rm -rf, git reset --hard, etc.)
- MUST NOT exceed token budget (max 500k tokens per task)
- MUST NOT violate micro-batching limits (≤5 files, ≤150 LOC per task)

---

### Non-Functional Requirements

**NFR1: Simplicity**
- Wave 0 implementation ≤150 LOC
- Wave 0 ≤3 files
- No external dependencies beyond existing MCP tools
- No complex state machine (simple loop)

**NFR2: Observability**
- Every action logged to state/analytics/wave0_runs.jsonl
- Clear success/failure status
- Execution time per task tracked
- Token usage per task tracked

**NFR3: Recoverability**
- Crash-safe: Can resume from last checkpoint
- Idempotent: Re-running same task produces same result
- No state corruption on failure

**NFR4: Performance**
- Task execution within 30 minutes (timeout)
- Startup within 5 seconds
- Shutdown within 2 seconds (graceful)

---

## Success Criteria

### Acceptance Criteria

**AC1: Wave 0 completes 10 production tasks**
- Tasks from actual roadmap (not synthetic)
- ≥8/10 tasks completed successfully
- ≤2/10 tasks blocked/failed

**AC2: Evidence captured for all tasks**
- 10/10 tasks have evidence bundles
- Each bundle has: strategy.md, spec.md, summary.md
- Logs in state/analytics/wave0_runs.jsonl

**AC3: Learnings documented**
- ≥5 concrete observations about what worked
- ≥3 concrete observations about what broke
- ≥5 capability gaps identified for Wave 1

**AC4: AFP compliance maintained**
- Micro-batching: 100% of tasks ≤5 files, ≤150 LOC
- No guardrail violations
- No security incidents

**AC5: Process documented**
- Wave 0 implementation guide (≤2 pages)
- Wave 1 definition based on gaps
- Evolutionary framework template (≤2 pages)

---

## Metrics

### Quantitative Metrics

1. **Task Completion Rate:**
   - Target: ≥80% (8/10 tasks)
   - Measured: completed / total attempted

2. **Execution Time:**
   - Target: ≤30 min per task (average)
   - Measured: end_time - start_time per task

3. **Token Efficiency:**
   - Target: ≤500k tokens per task
   - Measured: sum of all API calls per task

4. **Error Rate:**
   - Target: ≤20% (2/10 tasks)
   - Measured: failed or blocked / total

5. **Recovery Success:**
   - Target: 100% (all crashes recover)
   - Measured: successful resumes / total crashes

### Qualitative Metrics

1. **Simplicity Score:**
   - Is Wave 0 code readable in <10 minutes? (YES/NO)
   - Can someone modify Wave 0 without confusion? (YES/NO)

2. **Learning Quality:**
   - Are learnings specific and actionable? (YES/NO)
   - Do learnings inform Wave 1 clearly? (YES/NO)

3. **AFP Alignment:**
   - Does Wave 0 embody Via Negativa? (YES/NO)
   - Is evolution path clear? (YES/NO)

---

## Scope Boundaries

### IN SCOPE for Wave 0

✅ **Core Loop:**
- Task selection from roadmap
- Task execution with MCP tools
- Status updates
- Evidence capture
- Basic logging

✅ **Safety:**
- Rate limiting
- Token budgets
- File access controls
- Command guardrails

✅ **Observability:**
- Execution logs
- Performance metrics
- Error tracking

### OUT OF SCOPE for Wave 0

❌ **Advanced Planning:**
- Multi-task coordination
- Dependency resolution
- Resource optimization
- (May add in Wave 1 if gaps prove necessary)

❌ **Quality Gates:**
- Automated critics (beyond basic AFP checks)
- Multi-agent review
- Consensus mechanisms
- (May add in Wave 1 if quality issues emerge)

❌ **Intelligence:**
- Complex decision-making
- Strategic reasoning
- Learning from history
- (May add in Wave 2+ if patterns emerge)

❌ **UI/UX:**
- Dashboard
- Real-time monitoring
- Interactive controls
- (May add in Wave 3+ if operational needs emerge)

**Philosophy:** Start with absolute minimum. Add capabilities ONLY when Wave 0 stress testing proves them necessary.

---

## Validation Plan

### Phase 1: Implementation (Days 1-2)

1. Implement Wave 0 core loop (~150 LOC, 3 files)
2. Unit test basic functions
3. Build succeeds with zero errors
4. npm audit shows 0 vulnerabilities

### Phase 2: Stress Testing (Days 2-3)

1. Select 10 real tasks from roadmap (mix of complexities)
2. Run Wave 0 on each task
3. Monitor for crashes, errors, violations
4. Capture logs and evidence

### Phase 3: Analysis (Day 3)

1. Review 10 task results
2. Calculate success rate, execution time, token usage
3. Document what worked, what broke, gaps
4. Define Wave 1 scope based on learnings

### Phase 4: Documentation (Day 3)

1. Write Wave 0 implementation guide
2. Write Wave 1 requirements (based on gaps)
3. Write evolutionary framework template
4. Commit all artifacts

---

## Risk Mitigation

**Risk:** Wave 0 too simple to test anything meaningful

**Mitigation:**
- Define "minimal BUT functional" - must complete end-to-end loop
- If too broken, add minimal fixes until testable
- Measure by task completion, not feature count

**Risk:** Wave 0 breaks existing autopilot

**Mitigation:**
- Wave 0 runs alongside current autopilot (not replacement)
- Separate entry point (run_wave0.ts vs. existing autopilot)
- No shared state modifications

**Risk:** Production testing causes incidents

**Mitigation:**
- Select low-risk tasks (documentation, analysis, refactoring)
- Avoid tasks that modify critical infrastructure
- Monitor closely, have rollback ready
- Run with human supervision initially

---

## Dependencies

**Required:**
- MCP tools (mcp__weathervane__plan_next, mcp__weathervane__plan_update, etc.)
- State management (state/roadmap.yaml, state/context.md)
- Existing AFP infrastructure (critics, guardrails)
- TypeScript build system

**Provided by existing system:**
- Task representation (roadmap.yaml format)
- Evidence directory structure (state/evidence/)
- Analytics logging (state/analytics/)
- MCP server (tools/wvo_mcp/)

---

## Definition of Done

Wave 0 is DONE when:

- [x] Implementation complete (≤150 LOC, ≤3 files)
- [x] Build passes (zero errors)
- [x] Tests pass (unit tests for core functions)
- [x] npm audit passes (zero vulnerabilities)
- [x] 10 production tasks executed
- [x] Success rate ≥80% (8/10 completed)
- [x] All tasks have evidence bundles
- [x] Learnings documented (≥5 worked, ≥3 broke, ≥5 gaps)
- [x] Wave 1 defined (based on gaps)
- [x] Process documentation complete (guides + template)
- [x] Committed to repo with evidence

**Only when ALL criteria met can Wave 0 be considered complete.**

---

**SPEC Complete:** 2025-11-05
**Next Phase:** PLAN (design Wave 0 implementation approach)
