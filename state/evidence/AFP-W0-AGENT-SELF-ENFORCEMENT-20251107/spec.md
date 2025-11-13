# SPEC - AFP-W0-AGENT-SELF-ENFORCEMENT-20251107

**Task:** Agent Behavioral Self-Enforcement - Block Cheap Workarounds
**Created:** 2025-11-07T16:40:00Z
**Phase:** SPEC
**Parent Task:** AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107

## Executive Summary

This specification defines the functional and non-functional requirements for agent behavioral self-enforcement. The system must prevent "cheap or slick" workarounds at the agent instruction level, ensuring quality commitment before, during, and after task execution.

**Key Principle:** Agents must self-enforce quality standards without external supervision.

## Acceptance Criteria (Must-Have)

### AC1: Pre-Execution Quality Commitment ✅

**Given:** Agent receives a new task assignment
**When:** Agent prepares to start work
**Then:**
- Agent MUST read self-enforcement instructions before starting
- Agent MUST complete pre-execution checklist
- Agent MUST explicitly commit to quality standards
- Agent MUST plan all 10 AFP phases before writing code
- Checklist completion MUST be logged in evidence

**Success Validation:**
- Evidence directory contains `pre_execution_checklist.md`
- Checklist shows all items marked complete
- Timestamp shows checklist completed before first phase work
- Agent demonstrates understanding of "done" definition

**Failure Examples (Must Prevent):**
- ❌ Starting work without reading instructions
- ❌ Skipping checklist ("I know what to do")
- ❌ Implicit quality assumption without explicit commitment
- ❌ Planning only 1-2 phases instead of all 10

### AC2: Mid-Execution Self-Validation ✅

**Given:** Agent is working on a task (any phase)
**When:** Agent completes a phase or reaches decision point
**Then:**
- Agent MUST self-check quality at phase boundaries
- Agent MUST validate own work against standards
- Agent MUST catch and correct own shortcuts
- Agent MUST log self-check results
- Agent MUST NOT proceed if self-check fails

**Success Validation:**
- Evidence contains `mid_execution_checks.md`
- Self-checks logged at each phase boundary (10 times per task)
- Each check includes: What I did, Quality assessment, Shortcuts avoided, Next phase plan
- Failed checks trigger remediation before proceeding

**Failure Examples (Must Prevent):**
- ❌ Rushing through phases without self-check
- ❌ "Trust me, it's good" without validation
- ❌ Superficial self-checks (checkbox theater)
- ❌ Proceeding after failed self-check

### AC3: Post-Execution Proof Requirement ✅

**Given:** Agent believes task is complete
**When:** Agent prepares to claim "done"
**Then:**
- Agent MUST complete post-execution validation checklist
- Agent MUST provide proof for all quality criteria
- Agent MUST verify all 10 phases complete
- Agent MUST confirm all critics passed (if applicable)
- Agent MUST NOT claim done until proof verified

**Success Validation:**
- Evidence contains `post_execution_validation.md`
- Checklist shows all quality criteria verified
- Proof provided for each criterion (not just claimed)
- Timestamp shows validation completed before claiming done
- All phase documents present and comprehensive

**Failure Examples (Must Prevent):**
- ❌ Claiming done after partial work (e.g., only STRATEGIZE complete)
- ❌ "Done" without evidence verification
- ❌ Skipping validation checklist
- ❌ Proof = "trust me" instead of actual evidence

### AC4: Behavioral Pattern Detection ✅

**Given:** System tracks agent behavior over multiple tasks
**When:** System analyzes for bypass patterns
**Then:**
- System MUST identify common shortcut patterns
- System MUST document patterns with examples
- System MUST update anti-pattern library
- System MUST warn future agents about patterns
- Patterns MUST be agent-agnostic (not blaming specific agents)

**Success Validation:**
- File exists: `state/analytics/behavioral_patterns.json`
- Contains at least 5 documented bypass patterns
- Each pattern has: Description, Example, Prevention strategy
- Pattern library updated after pattern detection
- Future tasks reference pattern library in instructions

**Failure Examples (Must Prevent):**
- ❌ No pattern tracking (bypasses repeat)
- ❌ Blaming specific agents (not constructive)
- ❌ Patterns identified but not documented
- ❌ Pattern library exists but agents don't read it

### AC5: Multi-Agent Enforcement Consistency ✅

**Given:** Multiple agent types (Claude, Atlas, Dana, etc.) exist
**When:** Any agent receives a task
**Then:**
- ALL agent types MUST follow same self-enforcement process
- Instructions MUST be consistent across agent types
- Checklists MUST work for all agent types
- Quality standards MUST be uniform
- No agent-specific bypass opportunities

**Success Validation:**
- CLAUDE.md updated with self-enforcement
- AGENTS.md updated with self-enforcement
- docs/agent_self_enforcement_guide.md covers all agent types
- Live validation proves consistency (test with 2+ agent types)
- No agent-specific exceptions or workarounds

**Failure Examples (Must Prevent):**
- ❌ Only Claude has self-enforcement, others don't
- ❌ Different standards for different agents
- ❌ Agent-specific workarounds ("Atlas can skip this")
- ❌ Inconsistent checklist completion

### AC6: Zero Tolerance Documentation ✅

**Given:** Agent reads instructions
**When:** Agent looks for quality standards
**Then:**
- Zero tolerance policy MUST be explicit and prominent
- "Cheap or slick" workarounds MUST be defined with examples
- Consequences of bypass MUST be clear
- User expectation MUST be quoted directly
- Philosophy MUST explain WHY quality matters

**Success Validation:**
- Zero tolerance section in CLAUDE.md (prominent)
- Examples of bypasses with "NEVER do this" warnings
- User quote: "highest order specifications of quality control"
- Philosophy section explains autonomy requires self-governance
- No ambiguity about acceptable quality

**Failure Examples (Must Prevent):**
- ❌ Vague quality expectations
- ❌ "Do your best" without definition
- ❌ Missing examples of what NOT to do
- ❌ Bypasses mentioned but not prevented

### AC7: Live Validation Proof ✅

**Given:** Self-enforcement system is implemented
**When:** Real task assigned to agent
**Then:**
- Agent MUST demonstrate self-enforcement without prompting
- Pre-execution checklist MUST be completed
- Mid-execution checks MUST be logged
- Post-execution validation MUST be performed
- No human intervention required during process

**Success Validation:**
- Assign test task to agent
- Monitor for self-enforcement behavior
- Evidence shows checklist completion
- Quality maintained throughout
- Task completed successfully without shortcuts

**Failure Examples (Must Prevent):**
- ❌ Agent needs reminder to self-enforce
- ❌ Agent skips checklist
- ❌ Evidence missing self-checks
- ❌ Human intervention required

### AC8: Integration with Existing Enforcement ✅

**Given:** Existing enforcement (critics, hooks, etc.) exists
**When:** Agent works on task
**Then:**
- Self-enforcement MUST be primary (first line of defense)
- Existing enforcement MUST remain active (defense in depth)
- Self-enforcement MUST catch issues BEFORE critics
- No conflicts between enforcement layers
- Seamless integration, not separate systems

**Success Validation:**
- Agent self-catches issues before running critics
- Critics still run (defense in depth)
- Pre-commit hooks still active
- No enforcement conflicts
- Evidence shows self-enforcement + external enforcement both working

**Failure Examples (Must Prevent):**
- ❌ Self-enforcement replaces critics (removes defense in depth)
- ❌ Conflicts between enforcement layers
- ❌ Agent relies only on critics (no self-enforcement)
- ❌ Hooks disabled because "self-enforcement handles it"

### AC9: Remediation Loop for Failed Self-Checks ✅

**Given:** Agent performs self-check
**When:** Self-check identifies quality issue
**Then:**
- Agent MUST stop current work
- Agent MUST document the issue
- Agent MUST create remediation plan
- Agent MUST fix issue before proceeding
- Agent MUST re-validate after fix

**Success Validation:**
- Evidence shows failed self-check documented
- Remediation plan created and logged
- Fix implemented
- Re-validation passed before proceeding
- Timeline shows pause → fix → resume

**Failure Examples (Must Prevent):**
- ❌ Self-check fails but agent proceeds anyway
- ❌ Issue noted but not fixed
- ❌ "I'll fix it later" (never happens)
- ❌ No re-validation after fix

### AC10: Instruction Clarity and Actionability ✅

**Given:** Agent reads self-enforcement instructions
**When:** Agent tries to follow them
**Then:**
- Instructions MUST be unambiguous
- Checklists MUST have clear yes/no questions
- Examples MUST illustrate good vs bad behavior
- No interpretation required
- Agent knows exactly what to do

**Success Validation:**
- Instructions tested with multiple agents
- All agents interpret same way
- No questions about "what does this mean?"
- Checklists are straightforward
- Examples are concrete and specific

**Failure Examples (Must Prevent):**
- ❌ Vague instructions ("do quality work")
- ❌ Open-ended questions ("is this good enough?")
- ❌ Abstract examples ("avoid shortcuts")
- ❌ Requires interpretation ("use best judgment")

## Functional Requirements

### FR1: Pre-Execution Checklist System

**Description:** System that ensures agents commit to quality before starting work

**Components:**
1. Checklist template in docs/agent_self_enforcement_guide.md
2. Instructions in CLAUDE.md and AGENTS.md to use checklist
3. Evidence file: `pre_execution_checklist.md` (created by agent)
4. Validation: Checklist timestamp before first phase work

**Checklist Contents:**
- [ ] I have read and understood the task requirements
- [ ] I have read the self-enforcement guidelines
- [ ] I commit to completing all 10 AFP phases
- [ ] I commit to quality over speed
- [ ] I understand what "done" means (all phases + proof)
- [ ] I will self-check at phase boundaries
- [ ] I will not claim done without validation
- [ ] I will catch and correct my own shortcuts
- [ ] I understand "cheap or slick" workarounds to avoid
- [ ] I am ready to start with quality commitment

**Process:**
1. Agent receives task
2. Agent reads self-enforcement guide
3. Agent creates `pre_execution_checklist.md`
4. Agent completes checklist (all items)
5. Agent commits to quality
6. Agent begins work

### FR2: Mid-Execution Self-Check System

**Description:** System that ensures agents validate own work during execution

**Components:**
1. Self-check prompts at phase boundaries
2. Instructions to log self-checks
3. Evidence file: `mid_execution_checks.md` (created by agent)
4. Remediation trigger on failed checks

**Self-Check Template (per phase):**
```markdown
## Phase: [PHASE_NAME]
**Timestamp:** [ISO 8601]
**Phase Goal:** [What this phase should accomplish]

### What I Did:
- [Concrete actions taken]

### Quality Assessment:
- [ ] Phase goal achieved completely
- [ ] Evidence is comprehensive (not superficial)
- [ ] No shortcuts taken
- [ ] Standards met for this phase

### Shortcuts Avoided:
- [Specific shortcuts I was tempted to take but didn't]

### Next Phase Plan:
- [What I'll do in next phase]

### Self-Check Result:
- ✅ PASS - Proceeding to next phase
- ❌ FAIL - Need remediation (see below)

### Remediation (if needed):
- [Issue identified]
- [Fix plan]
- [Re-validation result]
```

**Process:**
1. Agent completes phase work
2. Agent reviews self-check template
3. Agent logs what was done
4. Agent assesses quality honestly
5. If pass: proceed to next phase
6. If fail: remediate, re-validate, then proceed

### FR3: Post-Execution Validation System

**Description:** System that ensures agents prove quality before claiming done

**Components:**
1. Validation checklist template
2. Instructions to complete before claiming done
3. Evidence file: `post_execution_validation.md` (created by agent)
4. Blocks "done" claim until validation passes

**Validation Checklist:**
- [ ] All 10 AFP phases completed
  - [ ] STRATEGIZE: strategy.md exists, comprehensive
  - [ ] SPEC: spec.md exists, unambiguous
  - [ ] PLAN: plan.md exists, tests authored
  - [ ] THINK: think.md exists, edge cases analyzed
  - [ ] GATE: design.md exists (if required), approved
  - [ ] IMPLEMENT: Code written, builds successfully
  - [ ] VERIFY: Tests run, all pass
  - [ ] REVIEW: Quality verified, score ≥95
  - [ ] PR: Changes committed, pushed
  - [ ] MONITOR: Outcomes tracked
- [ ] All critics passed (if applicable)
  - [ ] StrategyReviewer: ✅
  - [ ] ThinkingCritic: ✅
  - [ ] DesignReviewer: ✅ (if GATE required)
  - [ ] TestsCritic: ✅ (if tests required)
  - [ ] ProcessCritic: ✅
- [ ] Evidence quality verified
  - [ ] All phase documents comprehensive (not templates)
  - [ ] Real AI reasoning evident (not boilerplate)
  - [ ] Quality score ≥95/100
- [ ] Build verification passed (if code task)
  - [ ] Build succeeds: 0 errors
  - [ ] Tests pass: All tests green
  - [ ] Audit clean: 0 vulnerabilities
- [ ] Git integration complete
  - [ ] Changes committed with AFP task ID
  - [ ] Commit message references evidence bundle
  - [ ] Changes pushed to GitHub
- [ ] No shortcuts taken
  - [ ] I did not skip any phases
  - [ ] I did not use templates/boilerplate
  - [ ] I did not claim done without proof
  - [ ] I did not rush through phases

**Process:**
1. Agent believes task is done
2. Agent opens post_execution_validation.md
3. Agent reviews ALL checklist items
4. Agent provides proof for each item
5. Agent verifies all items checked
6. Only then: Agent claims done

### FR4: Behavioral Pattern Detection System

**Description:** System that identifies and documents bypass patterns

**Components:**
1. Pattern tracking file: `state/analytics/behavioral_patterns.json`
2. Pattern detection script (if automated) or manual review
3. Pattern library with examples
4. Integration with agent instructions (warnings)

**Pattern Schema:**
```json
{
  "patterns": [
    {
      "id": "BP001",
      "name": "Partial Phase Completion",
      "description": "Agent completes only 1-2 phases instead of all 10",
      "example": "Completing only STRATEGIZE, claiming task ready",
      "detection": "Evidence has < 8 phase documents",
      "prevention": "Pre-execution checklist commits to all 10 phases",
      "severity": "critical"
    }
  ]
}
```

**Process:**
1. Review completed tasks for bypass patterns
2. Identify common shortcuts
3. Document pattern with schema
4. Add to pattern library
5. Update agent instructions with warning
6. Future agents read pattern library

### FR5: Multi-Agent Instruction Updates

**Description:** System that ensures all agents have self-enforcement instructions

**Components:**
1. CLAUDE.md - Updated with self-enforcement section
2. AGENTS.md - Updated with self-enforcement section
3. docs/agent_self_enforcement_guide.md - Comprehensive guide (NEW)
4. Consistency check: All agents have same instructions

**Instruction Structure:**
```markdown
## Agent Behavioral Self-Enforcement

### Before Starting ANY Task:
1. Read docs/agent_self_enforcement_guide.md
2. Complete pre-execution checklist
3. Commit to quality standards
4. Plan all 10 AFP phases

### During Task Execution:
1. Self-check at each phase boundary
2. Log checks in mid_execution_checks.md
3. Remediate if check fails
4. Never proceed with failed check

### Before Claiming Done:
1. Complete post-execution validation
2. Verify all phases complete
3. Provide proof for all criteria
4. Only claim done after validation passes

### Zero Tolerance:
- No shortcuts
- No partial completions
- No "trust me" claims
- Quality > Speed always
```

**Coverage:**
- Claude (this agent) ✅
- Atlas (autopilot lead) ✅
- Dana (director) ✅
- Future agents ✅

## Non-Functional Requirements

### NFR1: Performance

**Requirement:** Self-enforcement must not significantly slow down task execution

**Metric:**
- Pre-execution checklist: < 2 minutes
- Mid-execution self-check: < 30 seconds per phase
- Post-execution validation: < 5 minutes
- Total overhead: < 15 minutes per task

**Rationale:** Quality takes time, but excessive overhead discourages use

**Validation:** Time logs show checklist completion times within limits

### NFR2: Usability

**Requirement:** Instructions must be clear and easy to follow

**Metric:**
- Agent can complete checklist without questions
- No ambiguous terms
- All examples concrete and specific
- Process straightforward

**Rationale:** Unclear instructions lead to inconsistent enforcement

**Validation:** Multiple agents interpret instructions identically

### NFR3: Maintainability

**Requirement:** Pattern library and instructions easy to update

**Metric:**
- Adding new pattern: < 10 minutes
- Updating instructions: < 30 minutes
- No code changes required for updates
- Documentation-only changes

**Rationale:** System must evolve as new bypass patterns discovered

**Validation:** Pattern added and instructions updated in < 40 minutes total

### NFR4: Scalability

**Requirement:** Self-enforcement works for all agents without bottleneck

**Metric:**
- No centralized enforcement agent (scales infinitely)
- Each agent self-enforces (parallel execution)
- No shared state requiring locks
- Pattern library read-only during task execution

**Rationale:** Autonomous execution requires parallel agent operation

**Validation:** Multiple agents can work simultaneously without conflict

### NFR5: Reliability

**Requirement:** Self-enforcement consistently catches bypasses

**Metric:**
- Detection rate: 100% of bypasses caught by self-checks
- False positive rate: < 5% (legitimate work not blocked)
- Remediation success rate: > 95% (failed checks fixed before proceeding)

**Rationale:** Unreliable enforcement worse than no enforcement (false confidence)

**Validation:** Test with intentional bypasses, verify all caught

### NFR6: Observability

**Requirement:** Self-enforcement behavior visible in evidence

**Metric:**
- All checklists logged
- All self-checks timestamped
- Remediation documented
- Pattern detection traceable

**Rationale:** Trust but verify - evidence proves enforcement working

**Validation:** Evidence review shows all self-enforcement artifacts present

## Success Metrics

### Leading Indicators (Process Metrics)

**1. Checklist Completion Rate**
- Target: 100% of tasks have pre-execution checklist
- Measurement: Count tasks with `pre_execution_checklist.md`
- Threshold: < 100% = system failing

**2. Self-Check Frequency**
- Target: 10 self-checks per task (one per phase)
- Measurement: Count entries in `mid_execution_checks.md`
- Threshold: < 8 = agent skipping checks

**3. Validation Completion Rate**
- Target: 100% of tasks have post-execution validation
- Measurement: Count tasks with `post_execution_validation.md`
- Threshold: < 100% = agents claiming done without proof

### Lagging Indicators (Outcome Metrics)

**4. Bypass Detection Rate**
- Target: 0 bypasses after 2-week burn-in
- Measurement: Manual review of completed tasks
- Threshold: > 0 = enforcement not working

**5. Quality Score Distribution**
- Target: 95% of tasks score ≥95/100
- Measurement: Aggregate quality scores
- Threshold: < 95% = standards too low or enforcement weak

**6. Phase Completion Rate**
- Target: 100% of tasks complete all 10 phases
- Measurement: Count phase documents per task
- Threshold: < 10 documents = phases being skipped

### Validation Metrics

**7. Live Validation Success**
- Target: Test tasks demonstrate self-enforcement
- Measurement: Assign test task, observe behavior
- Threshold: Any human intervention = system not autonomous

**8. Multi-Agent Consistency**
- Target: All agent types self-enforce identically
- Measurement: Compare evidence across agent types
- Threshold: Variance in enforcement = instructions unclear

**9. Pattern Library Growth**
- Target: Library stabilizes after initial population
- Measurement: New patterns added per week
- Threshold: Continuous growth = new bypasses being invented (bad)

## Out of Scope

**Explicitly NOT included in this task:**

1. **External monitoring agent** - Self-enforcement is primary, no external watcher
2. **Punishment/incentive system** - No scoring agents, no penalties
3. **Automated pattern detection** - Manual review initially, automation future work
4. **Agent performance scoring** - No agent rankings, no competition
5. **Historical task remediation** - Don't fix old tasks, only prevent future bypasses
6. **Code-level enforcement additions** - Previous task covered this
7. **Critic logic changes** - Existing critics remain unchanged
8. **Pre-commit hook modifications** - Existing hooks remain unchanged

## Dependencies

**This task depends on:**
1. ✅ AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107 (complete) - Code-level enforcement
2. ✅ Existing AFP 10-phase lifecycle documentation
3. ✅ Existing quality critics (StrategyReviewer, ThinkingCritic, etc.)
4. ✅ Existing pre-commit hooks

**Future tasks that depend on this:**
1. ⏭️ Automated pattern detection system (future enhancement)
2. ⏭️ Agent performance dashboards (future enhancement)
3. ⏭️ Multi-agent consensus on quality (future enhancement)

## Definition of Done

**This task is DONE when ALL of the following are TRUE:**

1. ✅ CLAUDE.md updated with self-enforcement section
2. ✅ AGENTS.md updated with self-enforcement section
3. ✅ docs/agent_self_enforcement_guide.md created (comprehensive guide)
4. ✅ state/analytics/behavioral_patterns.json created (pattern library)
5. ✅ All 10 acceptance criteria met
6. ✅ All 5 functional requirements implemented
7. ✅ All 6 non-functional requirements validated
8. ✅ Live validation proves self-enforcement works
9. ✅ Multi-agent consistency demonstrated
10. ✅ Evidence bundle complete (all 10 AFP phases)
11. ✅ Quality score ≥95/100
12. ✅ Git commit created and pushed
13. ✅ Zero bypasses detected in validation

**NOT done if:**
- ❌ Instructions exist but agents don't follow them
- ❌ Checklists exist but agents skip them
- ❌ Validation exists but agents claim done without it
- ❌ Pattern library exists but agents don't read it
- ❌ Works for Claude but not other agents
- ❌ Validation requires human intervention

## Verification Plan

**How we'll verify this task is complete:**

### Verification Test 1: Checklist Compliance
**Action:** Assign simple task to agent
**Expected:** Agent creates pre-execution checklist before starting
**Pass:** Checklist exists with timestamp before first phase work

### Verification Test 2: Self-Check Logging
**Action:** Monitor agent during multi-phase task
**Expected:** Agent logs self-checks at phase boundaries
**Pass:** mid_execution_checks.md has 10 entries

### Verification Test 3: Validation Requirement
**Action:** Wait for agent to finish task
**Expected:** Agent completes post-execution validation before claiming done
**Pass:** post_execution_validation.md exists with all items checked

### Verification Test 4: Bypass Prevention
**Action:** Review 5 completed tasks for bypass patterns
**Expected:** No bypasses detected (all phases complete, quality high)
**Pass:** 0 bypasses found

### Verification Test 5: Multi-Agent Consistency
**Action:** Assign same task to 2 different agent types
**Expected:** Both agents follow same self-enforcement process
**Pass:** Evidence shows identical enforcement artifacts

## Risk Assessment

### Risk 1: Agents Ignore Instructions (High Impact, Medium Probability)

**Mitigation:**
- Make instructions mandatory, not optional
- Pre-execution checklist blocks starting
- Post-execution validation blocks claiming done
- Pattern library warns about ignoring instructions

**Contingency:** If agents still ignore, escalate to user for instruction refinement

### Risk 2: Instructions Unclear (Medium Impact, Medium Probability)

**Mitigation:**
- Test with multiple agents
- Iterate on clarity
- Add concrete examples
- Use yes/no checklists (no interpretation)

**Contingency:** If still unclear after iteration, add more examples from real behavior

### Risk 3: False Sense of Security (High Impact, Low Probability)

**Mitigation:**
- Self-enforcement is primary, not only enforcement
- Keep all existing checks (critics, hooks, etc.)
- Defense in depth approach
- Regular validation of enforcement working

**Contingency:** If bypasses detected, investigate and improve instructions

## Conclusion

This specification defines a comprehensive agent behavioral self-enforcement system that:

1. **Prevents behavioral bypasses** through pre-, mid-, and post-execution checks
2. **Scales infinitely** through agent self-governance (no central bottleneck)
3. **Integrates seamlessly** with existing enforcement (defense in depth)
4. **Maintains quality** through explicit commitment and validation
5. **Evolves over time** through pattern detection and library updates

**The system is simple:** Agents commit to quality (pre), validate during work (mid), and prove quality (post). No complex code, no external monitoring, just clear expectations and self-governance.

**Ready for PLAN phase.**

---
Generated: 2025-11-07T16:40:00Z
Phase: SPEC
Task: AFP-W0-AGENT-SELF-ENFORCEMENT-20251107
Parent: AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107
Next: PLAN (design implementation approach and author tests)
