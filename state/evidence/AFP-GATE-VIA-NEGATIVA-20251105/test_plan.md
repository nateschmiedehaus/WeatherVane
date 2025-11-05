# GATE Enforcement Empirical Validation Test Plan

**Task**: AFP-GATE-VIA-NEGATIVA-20251105

**Objective**: Validate that current GATE system is effective before simplifying or enhancing

---

## Test Philosophy

**"Measure before you delete" - AFP principle applied to enforcement**

Current system has:
- 281 lines of instructions
- 760 lines of enforcement code
- Never been tested in practice

**We need data to answer:**
1. Is this the right amount of enforcement?
2. Does automation make instructions redundant?
3. What's the optimal balance?

---

## Test Protocol

### Pilot Tasks (3 tasks)

**Select 3 tasks of varying complexity:**
1. **Simple** (2 files, ~50 LOC): Test baseline GATE behavior
2. **Medium** (3-4 files, ~100 LOC): Test remediation cycles
3. **Complex** (5 files, ~150 LOC): Test at threshold limits

**Requirements for each task:**
- Must follow full GATE workflow
- Must run DesignReviewer before committing
- Must document pain points in real-time
- Must record all remediation cycles

### Instrumentation

**Add logging to capture:**

```typescript
// In run_design_review.ts, add timing:
const startTime = Date.now();
// ... run review ...
const duration = Date.now() - startTime;

// Log to state/analytics/gate_metrics.jsonl:
{
  timestamp: new Date().toISOString(),
  task_id: taskId,
  duration_ms: duration,
  attempt_number: attemptNumber, // track remediation cycles
  passed: result.passed,
  concerns_count: result.concerns?.length || 0,
  design_loc: designContent.split('\n').length,
  mentioned_files: extractedFiles.length,
  fake_files_detected: fakeFiles.length
}
```

**Track in task evidence:**
- Time started GATE process
- Time spent on each remediation cycle
- What was confusing (notes)
- What was helpful (notes)

### Measurement Criteria

| Metric | Target | Red Flag |
|--------|--------|----------|
| **Compliance** | | |
| Creates design.md (not gate.md) | 100% | <90% |
| Runs DesignReviewer before commit | 100% | <80% |
| Follows workflow steps | >90% | <70% |
| **Quality** | | |
| Design.md length | >100 lines | <50 lines |
| Specific file paths mentioned | >3 files | <2 files |
| Alternatives documented | ≥2 options | <2 options |
| Remediation cycles | 1-2 avg | 0 or >4 |
| **Effectiveness** | | |
| First-try pass rate | 30-70% | <20% or >80% |
| Fake files caught | >80% if attempted | <50% |
| Time spent on GATE | 30-90 min | <15 min or >180 min |
| **Usability** | | |
| Agent confusion incidents | <2 per task | >4 per task |
| False positive blocks | <10% | >20% |
| Clear what to fix | >90% | <70% |

---

## Success Criteria

**GATE system is effective if pilot shows:**

✅ **High compliance** (>90% following workflow)
✅ **Quality improvement** (designs >100 lines with specifics)
✅ **Iterative behavior** (1-2 remediation cycles)
✅ **Appropriate difficulty** (30-70% pass first try)
✅ **Usable feedback** (<2 confusion incidents per task)

**If ALL criteria met → Keep current system, run 7 more tasks to confirm**

---

## Failure Mode Decision Tree

### If Compliance Low (<80%)

**Possible causes:**
1. Instructions unclear
2. Automation not working
3. Agent doesn't know GATE exists

**Diagnosis:**
- Check: Did agent see AGENTS.md GATE section?
- Check: Did pre-commit hook run?
- Check: Error messages clear?

**Remediation:**
- Add examples (show good design.md)
- Add quick-start guide (5 lines at top)
- Improve error messages (clearer steps)

### If Quality Low (designs <50 lines, no specifics)

**Possible causes:**
1. DesignReviewer too lenient
2. Template not guiding well
3. Agent gaming keyword checks

**Diagnosis:**
- Check: What passes DesignReviewer that shouldn't?
- Check: Are fake files being caught?
- Check: Are alternatives actually different?

**Remediation:**
- Tighten DesignReviewer checks
- Add depth scoring (not just keywords)
- Require minimum LOC per section

### If Pass Rate Wrong (<20% or >80%)

**Too hard (<20% pass):**
- DesignReviewer too strict
- False positives blocking good work
- Instructions/template misaligned with checks

**Fix:**
- Loosen checks (review false positives)
- Align template with DesignReviewer expectations
- Add examples of passing designs

**Too easy (>80% pass):**
- DesignReviewer too lenient
- Checks easily gamed
- Not enforcing depth

**Fix:**
- Tighten checks
- Add proof-of-work verification
- Require more specificity

### If Remediation Cycles Wrong (0 or >4)

**No cycles (0):**
- Everyone passing first try (too easy)
- No one iterating (not learning)

**Fix:**
- Tighten checks to force iteration
- Add progressive depth requirements

**Too many cycles (>4):**
- DesignReviewer unclear what to fix
- Agent stuck in loop
- False positives

**Fix:**
- Improve remediation guidance
- Add escalation path (human review)
- Review false positive patterns

### If Usability Poor (>2 confusion incidents)

**Common confusion points:**
- "Where do I run DesignReviewer?"
- "What does concern type X mean?"
- "How do I fix this issue?"
- "What's the difference between GATE and REVIEW?"

**Fix:**
- Add FAQ section
- Improve error messages with examples
- Add progressive disclosure (quick start + deep dive)

---

## Test Execution Plan

### Week 1: Pilot (3 tasks)

**Monday: Simple task**
- Agent: Codex (or any available)
- Task: Small refactoring (2 files, ~50 LOC)
- Record: All metrics, pain points, time spent

**Wednesday: Medium task**
- Agent: Same as Monday for consistency
- Task: Feature addition (3-4 files, ~100 LOC)
- Record: Same metrics, note any remediation cycles

**Friday: Complex task**
- Agent: Same as Monday for consistency
- Task: Larger feature (5 files, ~150 LOC - at threshold)
- Record: Same metrics, stress test enforcement

**Weekend: Analysis**
- Review all 3 tasks
- Calculate metrics
- Identify patterns
- Decision: Continue, adjust, or redesign?

### Week 2: Validation (7 more tasks)

**If Week 1 successful:**
- Run 7 more tasks (mix of agents)
- Confirm patterns hold
- Build confidence in metrics

**If Week 1 needs adjustment:**
- Make targeted fixes based on data
- Re-run 3 pilot tasks
- Then run 7 validation tasks

### Week 3: Optimization

**Based on 10 tasks of data:**
- Calculate optimal instruction volume
- Refine DesignReviewer thresholds
- Add/remove enforcement based on gaming observed
- Document best practices

---

## Data Collection Template

**For each pilot task, record:**

```yaml
task_id: AFP-PILOT-GATE-001
complexity: simple  # simple, medium, complex
agent: codex

# Compliance
created_design_md: true  # not gate.md
ran_design_reviewer: true
followed_workflow: true

# Quality
design_md_lines: 145
files_mentioned: 4
alternatives_count: 3
remediation_cycles: 2

# Effectiveness
first_try_pass: false
fake_files_attempted: 1
fake_files_caught: 1
time_spent_minutes: 65

# Usability
confusion_incidents: 1  # "Where to run npm command"
false_positives: 0
clear_remediation: true

# Notes
pain_points:
  - "Wasn't sure if I ran DesignReviewer correctly (no output confirmation)"
  - "First remediation guidance was clear, second cycle was repetitive"
helpful_aspects:
  - "Template structure was very helpful"
  - "File verification caught my mistake immediately"
  - "Specific concern types told me exactly what to fix"

suggestions:
  - "Add example of good design.md"
  - "Show approval message more clearly"
```

---

## Decision Matrix (After 3 Pilot Tasks)

| Scenario | Compliance | Quality | Pass Rate | Cycles | Decision |
|----------|------------|---------|-----------|--------|----------|
| 🟢 Success | >90% | >100 LOC | 30-70% | 1-2 | Continue to 10 tasks |
| 🟡 Minor issues | >80% | >80 LOC | 20-80% | 1-3 | Targeted fixes, re-pilot |
| 🟠 Major issues | <80% | <80 LOC | <20% or >80% | 0 or >4 | Significant redesign |
| 🔴 Critical failure | <70% | <50 LOC | <10% or >90% | 0 or >6 | Fundamental rethink |

---

## Expected Outcome

**Hypothesis:** Current GATE system will show:

1. **High compliance** (agents follow workflow when enforced)
2. **Good quality** (designs >100 lines with specifics)
3. **Healthy iteration** (1-2 remediation cycles)
4. **Appropriate difficulty** (40-60% pass first try)
5. **Some usability friction** (1-2 confusion points per task)

**If hypothesis correct:**
- Keep core system
- Add examples
- Add FAQ for common confusion
- Run 7 more tasks to validate

**If hypothesis incorrect:**
- Data will tell us exactly what to fix
- Targeted adjustments based on metrics
- Re-test to confirm improvements

---

## Meta-Note: Eating Our Own Dogfood

**This very task (AFP-GATE-VIA-NEGATIVA-20251105) should go through GATE.**

**Questions:**
1. What did we try to DELETE first?
   - Considered deleting all enforcement (too radical)
   - Considered deleting verbose instructions (premature without data)
   - Selected: DELETE assumptions, ADD empirical measurement

2. What are 2 other approaches?
   - **Alt A**: Simplify immediately (via negativa by default)
   - **Alt B**: Enhance immediately (add examples, dashboards, etc)
   - **Selected**: Measure first, then decide (AFP: evidence-based)

3. Why is this approach simpler?
   - One test cycle reveals what to fix
   - Avoids over-engineering OR under-engineering
   - Data-driven decisions prevent thrashing

**This task demonstrates GATE working as intended: forcing consideration of alternatives before implementation.**

---

## Next Steps

1. **Create instrumentation** (add metrics logging to run_design_review.ts)
2. **Select 3 pilot tasks** (from roadmap or create test tasks)
3. **Run Week 1** (3 tasks with full measurement)
4. **Analyze results** (calculate metrics, identify patterns)
5. **Decision point** (continue, adjust, or redesign)

**Estimated effort:** 1 week pilot + 1 week validation = 2 weeks total

**Value:** Definitive answer on whether GATE enforcement is right-sized, under-powered, or over-engineered.
