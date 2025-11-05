# GATE Empirical Testing Campaign: Code Review Tasks

**Macro Task**: AFP-GATE-TEST-MACRO-20251105

**Purpose**: Use genuine code review tasks as empirical testing ground for GATE enforcement validation.

---

## Why Code Reviews?

Code reviews are perfect for testing GATE because they:
1. **Require deep thinking** (can't fake via negativa analysis)
2. **Have measurable outcomes** (issues found, improvements made)
3. **Exercise all AFP/SCAS principles** (deletion, refactoring, complexity)
4. **Provide real value** (actual codebase improvements, not busywork)
5. **Natural fit for GATE** (design alternatives before changing code)

---

## Macro Task Structure

**5 Subtasks** (increasing complexity):

### Task 1: Review seven_lens_evaluator.ts (Simple)
**Complexity**: Simple
**Focus**: AFP alignment (hardcoded keywords, no validation)
**Scope**: 784 LOC, 1-2 refactorings expected
**Time**: 2-3 hours
**GATE Test**: First-time GATE experience on straightforward issues

### Task 2: Review base.ts critic (Simple-Medium)
**Complexity**: Simple-Medium
**Focus**: Code duplication + error handling gaps
**Scope**: 758 LOC, extract utilities + improve logging
**Time**: 2-3 hours
**GATE Test**: Via negativa (deletion opportunities)

### Task 3: Review context_assembler.ts (Medium)
**Complexity**: Medium
**Focus**: Error handling + type safety + repeated computation
**Scope**: 1,154 LOC, 3-4 improvements expected
**Time**: 3-4 hours
**GATE Test**: Remediation cycles (expect 1-2 rounds)

### Task 4: Review agent_coordinator.ts (Medium-Complex)
**Complexity**: Medium-Complex
**Focus**: Type violations (@ts-nocheck) + hardcoded costs
**Scope**: 1,217 LOC, significant refactoring likely
**Time**: 4-5 hours
**GATE Test**: At micro-batching limits, requires careful planning

### Task 5: Review unified_orchestrator.ts (Complex - CRITICAL)
**Complexity**: Complex
**Focus**: Monolith decomposition (50+ concerns in 3,858 LOC)
**Scope**: 3,858 LOC, major architectural refactoring
**Time**: 6-8 hours (or split into sub-tasks)
**GATE Test**: Stress test - too big for one batch, requires decomposition strategy

---

## Success Criteria (GATE Validation)

**For each subtask, measure:**

1. **Compliance**:
   - ✅ design.md created?
   - ✅ DesignReviewer invoked before implementation?
   - ✅ All sections filled with specifics?

2. **Quality**:
   - ✅ Design >100 LOC?
   - ✅ Specific file:line references?
   - ✅ 2+ alternatives documented?
   - ✅ Via negativa analysis (deletion explored)?

3. **Effectiveness**:
   - ✅ DesignReviewer provides useful feedback?
   - ✅ Remediation cycles happen (1-2 expected)?
   - ✅ Implementation matches design?
   - ✅ Actual code quality improvements?

4. **Usability**:
   - ✅ Clear what GATE wants?
   - ✅ Feedback actionable?
   - ✅ Time spent reasonable (not >50% of total)?

---

## Expected Outcomes

**GATE System Validation:**
- Empirical data on all 4 measurement criteria
- Real-world test of remediation cycles
- Proof that intelligent DesignReviewer catches issues
- Evidence of whether instruction volume is appropriate

**Codebase Improvements:**
- 3 files reviewed and improved
- 8-10 specific issues addressed
- Reduced complexity, better error handling, improved types
- Real value delivered (not busywork)

---

## Timeline

**Week 1 (Full Testing Campaign):**
- Monday: Task 1 (simple) - 2-3 hours
- Monday: Task 2 (simple-medium) - 2-3 hours
- Wednesday: Task 3 (medium) - 3-4 hours
- Thursday: Task 4 (medium-complex) - 4-5 hours
- Friday: Task 5 (complex) - 6-8 hours (or plan decomposition)

**Weekend:**
- Analyze metrics from all 5 tasks
- Calculate GATE effectiveness scores
- Identify improvement opportunities
- Generate comprehensive effectiveness report

---

## Metrics Collection

For each task, record in task evidence:

```yaml
task_id: AFP-GATE-TEST-REVIEW-SEVENLENS-20251105
complexity: simple

# Compliance
design_md_created: true/false
design_md_lines: N
ran_design_reviewer: true/false
sections_filled: N/N
specifics_present: true/false  # file:line refs

# Quality
alternatives_count: N
via_negativa_done: true/false  # explored deletion?
design_reviewer_pass: first_try | round_2 | round_3 | failed

# Effectiveness
design_reviewer_concerns: [list]
concerns_actionable: true/false
remediation_helpful: true/false
implementation_matches_design: true/false

# Usability
gate_time_minutes: N
total_time_minutes: N
gate_percentage: N%
confusion_incidents: [list if any]
helpful_aspects: [list]
```

---

## Deliverables

**For each subtask:**
1. design.md (GATE document)
2. Code improvements (actual changes)
3. metrics.yaml (measurement data)
4. summary.md (findings + recommendations)

**For macro task:**
1. aggregate_metrics.md (combined data from all 3)
2. gate_effectiveness_report.md (decision: keep, adjust, redesign)
3. recommendations.md (next steps for GATE optimization)

---

**This is the empirical test we designed in AFP-GATE-VIA-NEGATIVA-20251105.**

**Now we execute it.**
