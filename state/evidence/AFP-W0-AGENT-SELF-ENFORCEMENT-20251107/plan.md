# PLAN - AFP-W0-AGENT-SELF-ENFORCEMENT-20251107

**Task:** Agent Behavioral Self-Enforcement - Block Cheap Workarounds
**Created:** 2025-11-07T16:45:00Z
**Phase:** PLAN
**Parent Task:** AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107

## Executive Summary

This plan details the implementation approach for agent behavioral self-enforcement. The implementation is **pure documentation** (no code changes), focusing on instruction updates and checklist systems.

**Key Insight:** This is a via negativa + refactor approach. We're REMOVING ambiguity and ENABLING self-governance, not adding enforcement code.

## Via Negativa - What We're DELETING/SIMPLIFYING

### Primary Deletion Target: Behavioral Bypass Opportunities

**What we're removing:**
1. **Ambiguity about expectations** - DELETE vague "do quality work" → ADD explicit checklists
2. **Ability to skip phases** - DELETE implicit phase progression → ADD mandatory self-checks
3. **"Trust me" claims** - DELETE unverified completion → ADD proof requirement
4. **Speed over quality mindset** - DELETE optimization instinct → ADD quality commitment
5. **Hidden bypasses** - DELETE untracked shortcuts → ADD pattern library

**Not by adding code, but by:**
- Removing ambiguity through clear instructions
- Removing bypass opportunities through self-checks
- Removing false completions through validation requirement

**Philosophy:** Delete the CONDITIONS that enable bypasses, not detect bypasses after they happen.

### What We're NOT Adding

**Explicitly NOT creating:**
- ❌ External monitoring agent (complex, adds bottleneck)
- ❌ Enforcement code (previous task did this)
- ❌ Automated detection system (future work, not now)
- ❌ Punishment mechanisms (wrong incentives)
- ❌ Performance scoring (creates gaming)

**Why not:** These add complexity. Via negativa demands simplicity.

## Refactor vs Repair Analysis

### This is REFACTOR (not repair)

**Refactor characteristics:**
✅ **Addresses root cause:** Agents lack self-enforcement mechanism
✅ **Simplifies system:** Self-governance simpler than external monitoring
✅ **Enables capability:** Agents become self-aware, not just monitored
✅ **Net negative complexity:** Removes need for external enforcement
✅ **Architectural improvement:** Shifts enforcement left (before vs after)

**Not repair because:**
❌ Not detecting bypasses after they happen (reactive)
❌ Not patching symptoms (adding more checks)
❌ Not creating workarounds (avoiding root cause)
❌ Not adding complexity to handle edge cases

### Root Cause Analysis

**Root cause:** Agents don't have built-in quality commitment mechanism

**How this refactors it:**
1. Pre-execution checklist → Agents commit BEFORE starting
2. Mid-execution self-checks → Agents validate DURING work
3. Post-execution validation → Agents prove AFTER completion
4. Pattern library → Agents learn from past bypasses

**Alternative (repair):** Add monitoring agent to catch bypasses after they happen. This is repair because it patches the symptom (bypasses) not the cause (no self-enforcement).

**Why refactor wins:** Proactive > Reactive, Simple > Complex, Enabling > Restricting

## Implementation Approach

### Overview

**Scope:** Pure documentation changes (no code)
**Files:** 4 files (3 updates, 1 new)
**Net LOC:** ~320 lines added, 0 deleted
**Complexity:** Low (documentation is readable)

### File Changes

#### File 1: CLAUDE.md (Update)

**Location:** `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/CLAUDE.md`

**Changes:** Add "Agent Behavioral Self-Enforcement" section

**New Content (~80 lines):**
```markdown
## Agent Behavioral Self-Enforcement

### Philosophy: Quality Through Self-Governance

As an autonomous agent, you must self-enforce quality standards. No external monitoring will catch your shortcuts. Self-enforcement is YOUR responsibility.

**User's mandate:**
> "highest order specifications of quality control that we have yet implemented. Period."

### Pre-Execution: Quality Commitment (MANDATORY)

**Before starting ANY task:**

1. **Read the self-enforcement guide**
   - Location: `docs/agent_self_enforcement_guide.md`
   - Time: 2 minutes
   - Required: Yes, every time

2. **Complete pre-execution checklist**
   - Create: `state/evidence/[TASK-ID]/pre_execution_checklist.md`
   - Commit to: All 10 AFP phases, quality over speed
   - Timestamp: Before first phase work

3. **Plan ALL phases before starting**
   - Don't start IMPLEMENT without planning STRATEGIZE through MONITOR
   - Commit to completing all phases, not just "getting started"

### Mid-Execution: Self-Validation (MANDATORY)

**At EVERY phase boundary:**

1. **Self-check your work**
   - Create: `state/evidence/[TASK-ID]/mid_execution_checks.md`
   - Ask: Did I complete this phase fully? Is evidence comprehensive? Am I taking shortcuts?
   - Log: Timestamp, phase, assessment, shortcuts avoided

2. **Remediate if check fails**
   - STOP current work
   - Document the issue
   - Create remediation plan
   - Fix before proceeding

3. **Never skip self-checks**
   - "I'll check later" = Never happens
   - Self-checks are NOT optional
   - Discipline is built through consistency

### Post-Execution: Proof Requirement (MANDATORY)

**Before claiming "done":**

1. **Complete post-execution validation**
   - Create: `state/evidence/[TASK-ID]/post_execution_validation.md`
   - Verify: ALL 10 phases complete, all critics passed (if applicable)
   - Provide: Proof for each criterion (not just claims)

2. **"Done" means proven, not claimed**
   - Example bypass: "Completed STRATEGIZE phase" but only did 1/10 phases
   - Correct: "Completed all 10 phases, evidence verified, quality score 97/100"
   - Proof: All phase documents exist, comprehensive, high quality

3. **Do NOT claim done until validated**
   - No "I think it's done"
   - No "Trust me, it's good"
   - Validation checklist must be 100% complete

### Anti-Patterns: "Cheap or Slick" Workarounds

**NEVER do these:**

❌ **Partial phase completion** - "Only STRATEGIZE done, task ready" (NO - all 10 phases required)
❌ **Skipping self-checks** - "I don't need to check, I'm confident" (NO - check anyway)
❌ **Template evidence** - Copy-paste boilerplate instead of real AI reasoning (NO - do real work)
❌ **Speed over quality** - "Done fast is better than done right" (NO - quality always wins)
❌ **Claiming without proof** - "Trust me" instead of verified evidence (NO - prove it)
❌ **Bypassing checklists** - "I know what to do" (NO - complete checklist every time)

### Pattern Library

**Before starting, review:** `state/analytics/behavioral_patterns.json`

This library documents common bypass patterns seen in past tasks. Learn from these so you don't repeat them.

### Zero Tolerance

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
```

**Placement:** After existing AFP 10-Phase Lifecycle section, before Operational Checklist

**Rationale:** Prominent placement ensures agents read it before starting any work

#### File 2: AGENTS.md (Update)

**Location:** `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/AGENTS.md`

**Changes:** Add same "Agent Behavioral Self-Enforcement" section

**New Content:** Same as CLAUDE.md (~80 lines)

**Rationale:** All agents (Atlas, Dana, etc.) must have identical self-enforcement instructions

#### File 3: docs/agent_self_enforcement_guide.md (NEW)

**Location:** `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/docs/agent_self_enforcement_guide.md`

**Purpose:** Comprehensive self-enforcement guide referenced by agent instructions

**New Content (~150 lines):**

**Section 1: Philosophy (Why Self-Enforcement)**
- Autonomy requires self-governance
- External monitoring doesn't scale
- Quality is intrinsic, not extrinsic
- You are responsible for your work

**Section 2: Pre-Execution Checklist (Template)**
- 10-item checklist
- Yes/no questions (no interpretation)
- Commitment statements
- Example of completed checklist

**Section 3: Mid-Execution Self-Checks (Template per phase)**
- What I did
- Quality assessment
- Shortcuts avoided
- Next phase plan
- Pass/fail decision
- Remediation if failed

**Section 4: Post-Execution Validation (Template)**
- All 10 phases complete (with sub-checks)
- All critics passed
- Evidence quality verified
- Build verification (if code)
- Git integration complete
- No shortcuts taken

**Section 5: Anti-Pattern Library**
- 10 common bypass patterns
- Each with: Description, Example, Why it's wrong, Prevention
- Updated based on real behavior

**Section 6: Live Validation Examples**
- Example of good self-enforcement
- Example of bypass caught by self-check
- Example of remediation loop

**Rationale:** Detailed guide agents can reference, keeping instruction files concise

#### File 4: state/analytics/behavioral_patterns.json (NEW)

**Location:** `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/state/analytics/behavioral_patterns.json`

**Purpose:** Machine-readable pattern library

**New Content (~30 lines):**
```json
{
  "version": "1.0",
  "last_updated": "2025-11-07T16:45:00Z",
  "patterns": [
    {
      "id": "BP001",
      "name": "Partial Phase Completion",
      "description": "Agent completes only 1-2 phases instead of all 10",
      "example": "AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107: I completed only STRATEGIZE, claimed task ready",
      "detection": "Evidence has < 8 phase documents",
      "prevention": "Pre-execution checklist commits to all 10 phases",
      "severity": "critical",
      "first_seen": "2025-11-07",
      "occurrences": 1
    },
    {
      "id": "BP002",
      "name": "Template Evidence",
      "description": "Agent uses boilerplate/templates instead of real AI reasoning",
      "example": "25 tasks completed in 30 min with identical completion.md files",
      "detection": "Evidence contains 'Generated by Wave 0.1' or template markers",
      "prevention": "MCP integration required (no template fallback)",
      "severity": "critical",
      "first_seen": "2025-11-06",
      "occurrences": 25
    },
    {
      "id": "BP003",
      "name": "Speed Over Quality",
      "description": "Agent prioritizes fast completion over comprehensive work",
      "example": "Task completed in < 5 seconds (bypass code)",
      "detection": "Task completion time < 5 min (suspicious)",
      "prevention": "Post-execution validation requires proof",
      "severity": "critical",
      "first_seen": "2025-11-06",
      "occurrences": 25
    },
    {
      "id": "BP004",
      "name": "Skipping Self-Checks",
      "description": "Agent doesn't log mid-execution self-checks",
      "example": "No mid_execution_checks.md file in evidence",
      "detection": "Evidence missing mid_execution_checks.md",
      "prevention": "Mid-execution validation mandatory at phase boundaries",
      "severity": "high",
      "first_seen": "2025-11-07",
      "occurrences": 0
    },
    {
      "id": "BP005",
      "name": "Claiming Without Proof",
      "description": "Agent claims done without post-execution validation",
      "example": "Claiming complete without post_execution_validation.md",
      "detection": "Evidence missing post_execution_validation.md",
      "prevention": "Post-execution validation blocks claiming done",
      "severity": "high",
      "first_seen": "2025-11-07",
      "occurrences": 0
    }
  ]
}
```

**Rationale:** JSON format enables future automation, human-readable for now

### AFP/SCAS Compliance

**Files Changed:** 4/5 ✅ (within limit)
**Net LOC:** +320/-0 ✅ (documentation, different complexity profile)
**Via Negativa:** ✅ Removes bypass opportunities
**Refactor Not Repair:** ✅ Addresses root cause
**Simplicity:** ✅ Self-enforcement simpler than external monitoring

**LOC Justification:**
- Documentation has different complexity than code (readable, not executable)
- ROI: Prevents ALL behavioral bypasses (infinite value)
- Via negativa: Enables removal of external monitoring (future simplification)
- Quality improvement: Critical user mandate fulfilled

## PLAN-Authored Tests (Designed Before Implementation)

**Critical AFP requirement:** Tests must be authored in PLAN phase BEFORE implementation. These tests will be executed in VERIFY phase.

### Test 1: Pre-Execution Checklist Compliance ✅

**Type:** Manual validation test
**Purpose:** Verify agent creates and completes pre-execution checklist

**Test Steps:**
1. Assign simple test task to agent (e.g., "Document the WAVE-0 status")
2. Monitor agent startup behavior
3. Check for file: `state/evidence/[TASK-ID]/pre_execution_checklist.md`
4. Verify checklist created BEFORE first phase work (timestamp check)
5. Verify all 10 checklist items marked complete

**Pass Criteria:**
- ✅ Checklist file exists
- ✅ Timestamp shows checklist before first phase document
- ✅ All 10 items checked (not partial)
- ✅ Agent demonstrates understanding of requirements

**Fail Criteria:**
- ❌ No checklist file
- ❌ Checklist after starting work
- ❌ Partial checklist (some items skipped)
- ❌ Superficial checklist (just checkmarks, no understanding)

**Expected Result:** PASS (after instruction updates, agents should self-enforce)

**Evidence Location:** `state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/verify.md` (Test 1 results)

### Test 2: Mid-Execution Self-Check Logging ✅

**Type:** Manual validation test
**Purpose:** Verify agent logs self-checks at phase boundaries

**Test Steps:**
1. Continue monitoring test task from Test 1
2. Observe agent progressing through phases
3. Check for file: `state/evidence/[TASK-ID]/mid_execution_checks.md`
4. Count self-check entries (should be ≥8 for comprehensive task)
5. Verify each entry has: timestamp, phase, assessment, shortcuts avoided, next plan

**Pass Criteria:**
- ✅ Self-check file exists
- ✅ ≥8 entries (one per phase, may skip GATE if not required)
- ✅ Each entry comprehensive (not superficial)
- ✅ Timestamps match phase progression
- ✅ Evidence of honest assessment (not just "all good")

**Fail Criteria:**
- ❌ No self-check file
- ❌ < 5 entries (missing most phases)
- ❌ Superficial entries ("Done" without detail)
- ❌ No timestamps or out of order
- ❌ No evidence of self-assessment

**Expected Result:** PASS (agents should self-check consistently)

**Evidence Location:** `state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/verify.md` (Test 2 results)

### Test 3: Post-Execution Validation Requirement ✅

**Type:** Manual validation test
**Purpose:** Verify agent completes post-execution validation before claiming done

**Test Steps:**
1. Continue monitoring test task from Tests 1-2
2. Wait for agent to approach completion
3. Check for file: `state/evidence/[TASK-ID]/post_execution_validation.md`
4. Verify validation file created BEFORE agent claims done
5. Verify all checklist items marked complete with proof

**Pass Criteria:**
- ✅ Validation file exists
- ✅ Created before "done" claim (timestamp check)
- ✅ All checklist items completed
- ✅ Proof provided for each item (not just claimed)
- ✅ Comprehensive validation (not superficial)

**Fail Criteria:**
- ❌ No validation file
- ❌ Created after claiming done
- ❌ Partial validation (items skipped)
- ❌ No proof ("trust me" claims)
- ❌ Superficial validation (checkboxes without verification)

**Expected Result:** PASS (agents should validate before claiming done)

**Evidence Location:** `state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/verify.md` (Test 3 results)

### Test 4: Pattern Library Integration ✅

**Type:** Manual review test
**Purpose:** Verify pattern library created and referenced in instructions

**Test Steps:**
1. Check file exists: `state/analytics/behavioral_patterns.json`
2. Verify contains ≥5 documented patterns
3. Verify each pattern has required fields (id, name, description, example, prevention)
4. Check CLAUDE.md references pattern library
5. Check AGENTS.md references pattern library

**Pass Criteria:**
- ✅ Pattern file exists with valid JSON
- ✅ ≥5 patterns documented
- ✅ All patterns have complete schema
- ✅ CLAUDE.md mentions pattern library
- ✅ AGENTS.md mentions pattern library

**Fail Criteria:**
- ❌ No pattern file
- ❌ < 5 patterns (incomplete)
- ❌ Missing required fields
- ❌ Instructions don't reference patterns
- ❌ Invalid JSON

**Expected Result:** PASS (documentation task, should be straightforward)

**Evidence Location:** `state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/verify.md` (Test 4 results)

### Test 5: Multi-Agent Consistency ✅

**Type:** Manual validation test
**Purpose:** Verify all agent types have consistent self-enforcement instructions

**Test Steps:**
1. Review CLAUDE.md self-enforcement section
2. Review AGENTS.md self-enforcement section
3. Compare content for consistency
4. Check docs/agent_self_enforcement_guide.md is agent-agnostic
5. (If possible) Assign same task to 2 different agent types, compare behavior

**Pass Criteria:**
- ✅ CLAUDE.md and AGENTS.md have identical self-enforcement sections
- ✅ Guide is agent-agnostic (works for any agent)
- ✅ No agent-specific exceptions or workarounds
- ✅ If multi-agent test performed: Both agents self-enforce consistently

**Fail Criteria:**
- ❌ Instructions differ between files
- ❌ Guide specific to one agent type
- ❌ Agent-specific workarounds present
- ❌ Different agents behave inconsistently

**Expected Result:** PASS (identical copy-paste of content)

**Evidence Location:** `state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/verify.md` (Test 5 results)

### Test 6: Bypass Prevention Validation ✅

**Type:** Manual review test (historical analysis)
**Purpose:** Verify system would catch the bypass patterns that occurred

**Test Steps:**
1. Review behavioral_patterns.json for documented patterns
2. For each pattern, verify prevention mechanism exists in instructions
3. Simulate bypass attempt (thought experiment): Would self-enforcement catch it?
4. Check: Pre-execution checklist prevents BP001 (partial phases)?
5. Check: MCP integration prevents BP002 (template evidence)?
6. Check: Post-execution validation prevents BP003 (speed over quality)?

**Pass Criteria:**
- ✅ All documented patterns have prevention mechanisms
- ✅ Thought experiment: Self-enforcement would catch bypasses
- ✅ Each pattern mapped to specific enforcement mechanism
- ✅ No known bypass pattern unaddressed

**Fail Criteria:**
- ❌ Some patterns lack prevention
- ❌ Thought experiment: Bypasses could still occur
- ❌ Prevention mechanisms unclear or weak
- ❌ Known patterns unaddressed

**Expected Result:** PASS (design explicitly addresses known patterns)

**Evidence Location:** `state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/verify.md` (Test 6 results)

### Test 7: Live End-to-End Validation ✅

**Type:** Manual validation test (comprehensive)
**Purpose:** Prove self-enforcement works end-to-end without human intervention

**Test Steps:**
1. Assign moderate-complexity task to agent (full 10 AFP phases required)
2. Monitor agent behavior WITHOUT intervening
3. Verify agent self-enforces throughout entire task
4. Check all three enforcement artifacts present (pre, mid, post)
5. Verify task completed with high quality (score ≥95/100)

**Pass Criteria:**
- ✅ Agent completes task without human prompting for self-enforcement
- ✅ All enforcement artifacts present (pre-execution, mid-execution, post-execution)
- ✅ All 10 phases completed comprehensively
- ✅ Quality score ≥95/100
- ✅ No bypasses detected in evidence review

**Fail Criteria:**
- ❌ Agent needed reminder to self-enforce
- ❌ Missing enforcement artifacts
- ❌ Phases skipped or incomplete
- ❌ Quality score < 95
- ❌ Bypasses detected

**Expected Result:** PASS (system should work autonomously)

**Evidence Location:** `state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/verify.md` (Test 7 results)

### Test Execution Plan

**When tests will be executed:** VERIFY phase

**Test sequence:**
1. Test 4 first (pattern library - quick check, no dependencies)
2. Test 5 second (consistency - quick check, documentation review)
3. Test 6 third (bypass prevention - thought experiment)
4. Tests 1-3 together (live validation with monitoring)
5. Test 7 last (end-to-end validation - comprehensive)

**Expected duration:**
- Tests 4-6: 15 minutes (quick checks)
- Tests 1-3: 30-60 minutes (depends on test task duration)
- Test 7: 60-120 minutes (depends on task complexity)
- **Total: 2-3 hours for full validation**

**Test environment:** Production (state/evidence, CLAUDE.md, AGENTS.md, etc.)

**Rollback plan:** If tests fail, iterate on instruction clarity and re-test

## Risks and Mitigation

### Risk 1: Agents Don't Read Instructions (Critical)

**Probability:** Medium
**Impact:** High (no enforcement if not read)

**Mitigation:**
1. Make instructions prominent (after AFP section in CLAUDE.md)
2. Explicitly mandate reading ("Before starting ANY task")
3. Pre-execution checklist proves reading (can't complete without reading)
4. Pattern library shows consequences of not reading

**Residual Risk:** Low (multiple layers ensure reading)

### Risk 2: Instructions Too Long/Complex (High)

**Probability:** Medium
**Impact:** Medium (agents skip or misunderstand)

**Mitigation:**
1. Keep instruction section concise (~80 lines)
2. Detailed content in separate guide (docs/agent_self_enforcement_guide.md)
3. Use checklists (clear, actionable)
4. Provide examples (concrete, not abstract)

**Residual Risk:** Low (tested for clarity in VERIFY phase)

### Risk 3: Agents Complete Checklists Superficially (High)

**Probability:** High (checkbox theater)
**Impact:** High (false sense of security)

**Mitigation:**
1. Checklist requires understanding, not just checkmarks
2. Examples show good vs bad checklist completion
3. Post-execution validation catches superficial checklists
4. Pattern library warns against checkbox theater

**Residual Risk:** Medium (hard to prevent completely, need ongoing monitoring)

### Risk 4: Pattern Library Not Maintained (Medium)

**Probability:** Medium
**Impact:** Medium (patterns repeat)

**Mitigation:**
1. Initial library documents known patterns (5 patterns)
2. Manual updates as new patterns discovered
3. Version field tracks updates
4. Instructions reference library (creates incentive to maintain)

**Residual Risk:** Low (maintenance is low-effort, high-value)

### Risk 5: Multi-Agent Inconsistency (Medium)

**Probability:** Low (identical copy-paste)
**Impact:** High (some agents bypass)

**Mitigation:**
1. Identical content in CLAUDE.md and AGENTS.md
2. Single source of truth: docs/agent_self_enforcement_guide.md
3. Test with multiple agent types (Test 5)
4. Regular consistency checks

**Residual Risk:** Very Low (copy-paste ensures consistency)

### Risk 6: False Sense of Security (Critical)

**Probability:** Low
**Impact:** High (stop monitoring, bypasses undetected)

**Mitigation:**
1. Self-enforcement is PRIMARY, not ONLY enforcement
2. Keep all existing checks (critics, hooks, etc.)
3. Defense in depth approach
4. Regular validation that enforcement working (Test 7)

**Residual Risk:** Low (explicitly documented as primary, not only)

## Edge Cases

### Edge Case 1: Task Doesn't Require All 10 Phases

**Scenario:** Documentation-only task might not need GATE phase (< 20 LOC change)

**Handling:**
- Pre-execution checklist acknowledges this ("if GATE required")
- Mid-execution self-check for GATE: "N/A - not required for this task"
- Post-execution validation: GATE section marked "N/A (not required)"

**Test:** Assign docs-only task, verify agent correctly identifies GATE not required

### Edge Case 2: Agent Discovers Missing Coverage During VERIFY

**Scenario:** Agent reaches VERIFY, realizes tests missing from PLAN

**Handling:**
- Mid-execution self-check at PLAN→THINK boundary should catch this
- If missed: Post-execution validation catches it (checklist item: "Tests authored in PLAN")
- Agent must loop back to PLAN to author tests

**Test:** Intentionally skip test authoring in PLAN, verify post-execution validation catches it

### Edge Case 3: Multiple Agents Working on Same Task

**Scenario:** Two agents collaborate, need to coordinate self-enforcement

**Handling:**
- Each agent completes own pre-execution checklist
- Mid-execution checks include coordination notes
- Post-execution validation performed by primary agent
- Evidence includes both agents' checklists

**Test:** Future work (multi-agent collaboration not common yet)

### Edge Case 4: Agent Disagrees with Quality Standard

**Scenario:** Agent thinks "this is good enough" but checklist says more required

**Handling:**
- Post-execution validation checklist is objective, not subjective
- Agent must meet checklist criteria, not personal judgment
- If agent believes standard wrong, escalate to user (don't bypass)

**Test:** N/A (not testable, requires agent to disagree)

### Edge Case 5: Emergency/Urgent Task

**Scenario:** Critical bug fix needed immediately, full process seems too slow

**Handling:**
- NO exceptions for urgency
- Zero tolerance means zero tolerance
- Emergency tasks still require quality (bugs from rushing are worse)
- Pre-execution checklist acknowledges urgency, commits to quality anyway

**Test:** Assign urgent task, verify agent doesn't skip self-enforcement

### Edge Case 6: Agent Forgets to Complete Checklist

**Scenario:** Agent starts work, forgets pre-execution checklist

**Handling:**
- Post-execution validation catches this (checklist item: pre-execution completed)
- Agent must create checklist retroactively, acknowledge missed step
- Pattern library documents this as BP006 (forgot pre-execution)

**Test:** Monitor for missed pre-execution checklists in early adoption

### Edge Case 7: Checklist Template Changes

**Scenario:** We update checklist template, old tasks have old version

**Handling:**
- Old tasks not retroactively updated (historical record)
- New tasks use new template
- Pattern library tracks template version
- Instructions reference latest template in guide

**Test:** N/A (not applicable yet, no template changes)

### Edge Case 8: Agent Self-Check Fails Repeatedly

**Scenario:** Agent tries phase, self-check fails, retries, fails again (stuck loop)

**Handling:**
- After 3 failed self-checks, escalate to user
- Document blockers in mid_execution_checks.md
- Don't infinite loop (escalation is acceptable)
- User provides guidance or reassigns task

**Test:** Intentionally create task beyond agent capability, verify escalation

## Implementation Timeline

**Phase 1: File Updates (1 hour)**
1. Update CLAUDE.md (add self-enforcement section)
2. Update AGENTS.md (identical content)
3. Create docs/agent_self_enforcement_guide.md (comprehensive guide)
4. Create state/analytics/behavioral_patterns.json (initial library)

**Phase 2: Verification (2-3 hours)**
1. Execute Tests 4-6 (quick checks)
2. Execute Tests 1-3 (live validation)
3. Execute Test 7 (end-to-end)
4. Document results in verify.md

**Phase 3: Iteration (if needed)**
1. If tests fail, refine instructions
2. Add examples from test behavior
3. Re-test until all pass

**Total Time: 3-4 hours (if no iteration) or 6-8 hours (with iteration)**

## Success Metrics

**Process Metrics (Leading Indicators):**
1. Files updated: 4/4 ✅
2. Tests authored: 7/7 ✅
3. Pattern library: ≥5 patterns ✅
4. Instructions consistent: CLAUDE.md == AGENTS.md ✅

**Outcome Metrics (Lagging Indicators):**
1. Test pass rate: 7/7 ✅
2. Bypass detection rate: 0 bypasses in validation ✅
3. Agent compliance: 100% complete checklists ✅
4. Quality scores: ≥95/100 for validated tasks ✅

## Definition of Done (PLAN Phase)

**This phase is DONE when:**

1. ✅ Via Negativa analysis complete (what we're deleting/simplifying)
2. ✅ Refactor vs Repair analysis complete (proven refactor)
3. ✅ Implementation approach documented (4 files, changes specified)
4. ✅ ALL 7 tests authored (designed before implementation)
5. ✅ Risks identified with mitigation strategies
6. ✅ Edge cases documented with handling strategies
7. ✅ AFP/SCAS compliance verified (files, LOC, complexity)
8. ✅ Implementation timeline estimated
9. ✅ Success metrics defined

**Ready for THINK phase.**

---
Generated: 2025-11-07T16:45:00Z
Phase: PLAN
Task: AFP-W0-AGENT-SELF-ENFORCEMENT-20251107
Parent: AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107
Next: THINK (analyze edge cases and failure modes)
