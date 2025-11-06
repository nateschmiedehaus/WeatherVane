# CRITICAL: Wave 0 Requires Roadmap Restructuring

**Date:** 2025-11-05
**Author:** Claude Council
**Impact:** HIGH - Changes fundamental roadmap structure

---

## The Insight

**User observation:** "If this is going to be our philosophy, we must literally do live fire end-to-end tests with autopilot continuously throughout the roadmap, right? At least wherever is necessary to use autopilot."

**This is CORRECT and FUNDAMENTAL.**

If Wave 0 evolutionary autopilot is our development philosophy, then the **roadmap itself must reflect evolutionary validation cycles**, not just feature lists.

---

## Current Roadmap Structure (Problem)

**Current pattern:**
```
- Task: Implement feature X
- Task: Add capability Y
- Task: Build component Z
- Task: Test everything
```

**Problem:** Waterfall structure
- All implementation first
- Testing at the end
- No evolutionary validation
- No live-fire stress testing between stages

**This contradicts Wave 0 philosophy entirely.**

---

## Required Roadmap Structure (Solution)

**Evolutionary pattern:**

```
Wave 0: Minimal Viable
├─ Task: Implement Wave 0 (minimal autonomous loop)
├─ Task: Deploy Wave 0
├─ ⚠️ VALIDATION GATE: Live-fire Wave 0 (10 real tasks)
├─ Task: Analyze Wave 0 learnings
└─ Task: Define Wave 1 scope (based on gaps)

Wave 1: [Next Capability Tier]
├─ Task: Implement Wave 1 features (proven necessary by Wave 0)
├─ Task: Deploy Wave 1
├─ ⚠️ VALIDATION GATE: Live-fire Wave 1 (10 real tasks)
├─ Task: Analyze Wave 1 learnings
└─ Task: Define Wave 2 scope (based on gaps)

Wave 2: [Next Capability Tier]
├─ Task: Implement Wave 2 features (proven necessary by Wave 1)
├─ Task: Deploy Wave 2
├─ ⚠️ VALIDATION GATE: Live-fire Wave 2 (10 real tasks)
├─ Task: Analyze Wave 2 learnings
└─ Task: Define Wave 3 scope (based on gaps)

... and so on
```

---

## Key Principles

### 1. Validation Gates are MANDATORY

**NOT optional:**
- Every wave MUST have live-fire validation
- Minimum 10 real tasks per wave
- Validation BEFORE next wave definition
- Learnings captured and analyzed

**Why:** Can't define Wave N+1 without knowing what Wave N proved necessary

### 2. Waves Defined Incrementally

**NOT upfront:**
- Don't define Wave 5 before Wave 0 tested
- Each wave scope based on previous wave gaps
- Production stress testing reveals actual needs
- No speculation

**Why:** Antifragile systems evolve through stress, not prediction

### 3. Live-Fire Testing Throughout

**NOT just at the end:**
- Wave 0 runs on production tasks
- Wave 1 runs on production tasks
- Wave N runs on production tasks
- Continuous validation, not batch testing

**Why:** Only production reveals real failure modes

### 4. Autopilot-Specific Structure

**Where to apply:**
- Any roadmap section involving autonomous agents
- Any roadmap section involving AI decision-making
- Any roadmap section involving complex automation
- Basically: anywhere autopilot is a dependency

**Where NOT to apply:**
- Simple manual tasks (docs, config changes)
- One-off scripts
- Non-autonomous work

**Why:** Evolutionary validation only makes sense for complex, autonomous systems

---

## Concrete Roadmap Changes Needed

### Section: Autopilot Development

**BEFORE (waterfall):**
```yaml
- id: AUTO-001
  title: Implement task planning
  status: pending

- id: AUTO-002
  title: Implement quality gates
  status: pending

- id: AUTO-003
  title: Implement multi-agent coordination
  status: pending

- id: AUTO-004
  title: Test autopilot
  status: pending
```

**AFTER (evolutionary):**
```yaml
# Wave 0: Minimal Viable
- id: AUTO-W0-001
  title: Implement Wave 0 (minimal task loop)
  status: done

- id: AUTO-W0-002
  title: Deploy Wave 0
  status: done

- id: AUTO-W0-VALIDATE
  title: "🔥 LIVE-FIRE: Run Wave 0 on 10 production tasks"
  status: in_progress
  validation_gate: true
  exit_criteria:
    - min_tasks: 10
    - min_success_rate: 0.8
    - learnings_captured: true

- id: AUTO-W0-003
  title: Analyze Wave 0 learnings (what worked, broke, gaps)
  status: pending
  depends_on: AUTO-W0-VALIDATE

- id: AUTO-W0-004
  title: Define Wave 1 scope (based on W0 gaps)
  status: pending
  depends_on: AUTO-W0-003

# Wave 1: [TBD based on Wave 0 results]
- id: AUTO-W1-001
  title: "[Placeholder - will be defined after W0 validation]"
  status: pending
  depends_on: AUTO-W0-004

- id: AUTO-W1-VALIDATE
  title: "🔥 LIVE-FIRE: Run Wave 1 on 10 production tasks"
  status: pending
  validation_gate: true
  depends_on: AUTO-W1-001
```

---

## Implementation Requirements

### 1. Roadmap YAML Schema Change

Add new fields:
```yaml
validation_gate: boolean  # Is this a validation gate task?
exit_criteria:           # What must be true to pass?
  min_tasks: number
  min_success_rate: number
  learnings_captured: boolean
```

### 2. Wave 0 Runner Enhancement

**Current:** Runs tasks sequentially

**Needed:** Recognize validation gate tasks
- When encountering `validation_gate: true`
- Execute as validation suite
- Track success rate
- Capture learnings
- Block progression until exit criteria met

### 3. Roadmap Management Process

**New rule:** Can't mark Wave N+1 tasks as "ready" until Wave N validation gate passes

**Enforcement:**
- Pre-commit hook checks roadmap structure
- Blocks commits that skip validation gates
- Requires learnings documentation

---

## Timeline Impact

### Short-term (This Week)

1. ✅ Wave 0 implemented and running
2. 🔄 Wave 0 validation ongoing (10 tasks)
3. ⏳ Analyze learnings
4. ⏳ Define Wave 1 scope

**Estimated:** 3-5 days for full Wave 0 cycle

### Medium-term (Next 2-4 Weeks)

1. Restructure autopilot roadmap section (evolutionary waves)
2. Implement validation gate recognition in Wave 0
3. Add roadmap schema for validation gates
4. Document process in CLAUDE.md/AGENTS.md

### Long-term (Ongoing)

- Every 1-2 weeks: New wave validation
- Continuous refinement based on learnings
- Template extends to other autonomous systems

---

## Success Metrics

### Process Metrics

**Roadmap structure:**
- % of autopilot tasks with validation gates: Target 100%
- Average time between waves: Target 1-2 weeks
- Wave definition based on previous wave learnings: Target 100%

### Quality Metrics

**Autopilot evolution:**
- Success rate improvement wave-over-wave: Target +10-20% per wave
- Feature waste (features built but not needed): Target <10%
- Production incidents due to autopilot: Target decreasing trend

---

## Risks and Mitigations

**Risk 1: Feels slow initially**
- **Mitigation:** Show value through avoided waste (don't build wrong features)
- **Measure:** Track features NOT built because Wave N proved unnecessary

**Risk 2: Team pressure to skip validation**
- **Mitigation:** Enforce with pre-commit hooks, process discipline
- **Culture:** Celebrate when Wave N proves feature unnecessary (saved waste)

**Risk 3: Validation gates become checkbox theater**
- **Mitigation:** Require quantitative exit criteria, real learnings documentation
- **Review:** Audit validation gates for genuine insights vs. superficial pass

---

## Action Items

### Immediate (This Week)

- [x] Wave 0 running live
- [ ] Complete Wave 0 validation (10 tasks)
- [ ] Capture learnings document
- [ ] Define Wave 1 scope

### Short-term (Next Week)

- [ ] Restructure autopilot roadmap section
- [ ] Add validation_gate schema to roadmap.yaml
- [ ] Update CLAUDE.md/AGENTS.md with evolutionary process
- [ ] Commit Wave 0 evidence and process docs

### Medium-term (Next 2-4 Weeks)

- [ ] Enhance Wave 0 runner to recognize validation gates
- [ ] Implement exit criteria checking
- [ ] Add pre-commit validation gate enforcement
- [ ] Run Wave 1 validation

---

## Conclusion

**Wave 0 isn't just a feature - it's a PROCESS TRANSFORMATION.**

The roadmap must reflect evolutionary validation cycles wherever autopilot is involved. This means:
1. Validation gates embedded in roadmap
2. Waves defined incrementally based on learnings
3. Live-fire testing continuous, not batch
4. Production stress reveals actual needs

**This is how antifragile systems are built:**
- Start minimal
- Stress test in production
- Evolve based on learnings
- Repeat

**The roadmap is now a living evolutionary document, not a static feature list.**

---

**Document Complete:** 2025-11-05
**Status:** CRITICAL - Requires immediate roadmap restructuring
**Owner:** Claude Council + Director Dana (for roadmap authority)
