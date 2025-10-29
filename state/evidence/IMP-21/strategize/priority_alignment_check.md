# IMP-21 Priority Alignment Check

**Task**: IMP-21 - Prompt Compiler (skeleton + canonicalization)
**Date**: 2025-10-29
**Phase**: STRATEGIZE (Pre-Work Alignment)

---

## Alignment Verification

### 1. Autopilot Command Alignment

**Command Check**:
```bash
mcp__weathervane__command_autopilot --action list
```

**Result**:
- Active command: "Work EXCLUSIVELY on REMEDIATION tasks" (task_filter: "REMEDIATION")
- IMP-21 task filter: N/A (not a REMEDIATION task)

**Conflict?**: YES - but working ON autopilot infrastructure, not BY autopilot

**User Override**: User explicitly directed: "work on improvement batch plan tasks as i have said"

**Verdict**: ✅ PROCEED (user override applies)

---

### 2. Roadmap Priority Alignment (IMPROVEMENT_BATCH_PLAN.md)

**Primary Source of Truth Check**:
- ✅ **Task in IMPROVEMENT_BATCH_PLAN.md**: YES (line 151)
- ✅ **Current phase**: Phase 1 (Prompting Improvements — Production Slices)
- ✅ **Phase 0 complete**: YES (all IMP-FUND-01 to IMP-FUND-09 done)
- ⏳ **Monitoring baseline**: Started Oct 28/29 (may need 1-2 weeks per plan line 60)
- ✅ **Listed in "Order of rollout"**: YES (line 731 - first in sequence)

**Task Details from IMPROVEMENT_BATCH_PLAN.md**:
- **Scope**: Programmatic assembly with typed slots, canonicalization, stable hash
- **Files**: `tools/wvo_mcp/src/prompt/compiler.ts`, templates
- **Rollout**: FLAG `prompt.compiler=observe` → `=enforce`
- **Dependencies**: FUND-gates complete ✅, THINK rubric integration ready, none runtime-breaking
- **Acceptance**: Deterministic canonicalization, golden tests pass, no baseline behavior change

---

### 3. Dependency Verification

**Prerequisites**:
- ✅ IMP-FUND-01 (Phase Ledger): COMPLETE
- ✅ IMP-FUND-02 (Evidence Gates): COMPLETE
- ✅ IMP-FUND-03 to IMP-FUND-09: COMPLETE
- ✅ FUND-gates complete (per IMP-21 dependencies)
- ⚠️ THINK rubric integration: Mentioned but not blocking (can be placeholder)

**Blockers**: NONE

---

### 4. Timing Appropriateness

**Monitoring Period Concern**:
- Line 603: "Next up: Phase 1 readiness review after monitoring window completes"
- Monitoring started: Oct 28/29
- Expected period: 1-2 weeks
- Current date: Oct 29 (day 1-2 of monitoring)

**User Intent**:
- User said: "work on improvement batch plan tasks"
- User approved: "go ahead" when asked about IMP-21

**Sequencing**:
- IMP-21 is first in Phase 1 rollout sequence (line 731)
- No prerequisites incomplete
- Can be implemented with FLAG=observe (non-disruptive)

**Verdict**: ✅ PROCEED (user intent clear, can implement in observe mode)

---

### 5. Collision Check with Other Work

**Codex Work**: IMP-05 (Prompt Attestation)
- IMP-05: Attestation policy, severity handling
- IMP-21: Prompt Compiler
- **Overlap?**: NO - different systems
- **Integration point**: IMP-24 (StateGraph hook) will integrate both
- **Safe to proceed in parallel**: YES ✅

---

## Overall Alignment Verdict

**Status**: ✅ **ALIGNED - PROCEED**

**Justification**:
1. Task explicitly in IMPROVEMENT_BATCH_PLAN.md Phase 1
2. All Phase 0 dependencies complete
3. User explicitly approved working on this task
4. No collision with Codex's IMP-05 work
5. Can implement with observe flag (non-disruptive)
6. Monitoring period concern overridden by user intent

**Monitoring Period Note**:
While IMPROVEMENT_BATCH_PLAN suggests waiting for monitoring window, implementing IMP-21 with FLAG=observe is safe and aligns with "ship in observe mode, collect evidence" strategy (line 147).

---

## Abort Triggers

**STOP work if**:
1. User directs to switch to different task
2. Discover IMP-05 (Codex) has major conflicts with IMP-21 design
3. THINK rubric integration proves to be blocking (not just nice-to-have)
4. Implementation reveals runtime-breaking changes (violates "none runtime-breaking" dependency)

---

**Date**: 2025-10-29
**Approved By**: User (explicit "go ahead")
**Next Phase**: STRATEGIZE (objective, KPIs, risks)
