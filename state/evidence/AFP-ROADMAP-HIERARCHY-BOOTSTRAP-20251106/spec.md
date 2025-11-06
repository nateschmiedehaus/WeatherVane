# SPEC: AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106

**Task ID:** AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106
**Set:** wave0-roadmap-bootstrap
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Acceptance Criteria

### Epic Documentation (6 waves × 5 docs = 30 total)

**AC1: All waves have complete phase documentation**
- [ ] WAVE-0: strategy.md ✅, spec.md ✅, plan.md ✅, think.md ✅, design.md ✅
- [ ] WAVE-1: strategy.md ✅ (partial), spec.md ✅ (partial), plan.md, think.md, design.md
- [ ] WAVE-2: strategy.md, spec.md, plan.md, think.md, design.md
- [ ] WAVE-3: strategy.md, spec.md, plan.md, think.md, design.md
- [ ] WAVE-4: strategy.md, spec.md, plan.md, think.md, design.md
- [ ] WAVE-5: strategy.md, spec.md, plan.md, think.md, design.md

**AC2: Epic docs are substantial and strategic**
- Each strategy.md: ≥2 pages (~1000 words) explaining WHY epic exists, urgency, alignment
- Each spec.md: ≥2 pages (~1000 words) with measurable outcomes, exit criteria
- Each plan.md: ≥2 pages (~1000 words) with milestone breakdown, integration design
- Each think.md: ≥1 page (~500 words) with edge cases, failure modes, dependencies
- Each design.md: ≥2 pages (~1000 words) with architecture, AFP/SCAS validation

**AC3: Epic docs pass critic validation**
- [ ] All strategy.md pass StrategyReviewer (via negativa, alternatives, AFP/SCAS)
- [ ] All spec.md have measurable outcomes (OutcomeCritic validates)
- [ ] All design.md score ≥7/9 AFP/SCAS (DesignReviewer validates)

### Set Organization (~25-30 sets)

**AC4: All tasks organized into sets**
- [ ] W0.M1 (Reboot Autopilot Core): 15 tasks → 3-4 sets
- [ ] W0.M2 (Test Harness): 1 task → 1 set
- [ ] W0.M3 (Hierarchical Process): 10 tasks → 5 sets ✅ (already defined)
- [ ] W1.M1 (Governance): 9 tasks → 2-3 sets
- [ ] W2.M1 (README automation): 9 tasks → 2-3 sets
- [ ] W2.M2 (Prompt architecture): 11 tasks → 3-4 sets
- [ ] W3.M1 (Autonomy stress tests): 6 tasks → 2 sets
- [ ] W4.M1 (Autonomy gauntlet): 6 tasks → 2 sets
- [ ] W5.M1 (Continuous evolution): 21 tasks → 5-6 sets

**AC5: Set clustering is logical**
- Each set groups related tasks (shared goal, dependencies, or pattern)
- Set size: 2-5 tasks (not too small, not too large)
- Set rationale documented in set strategy.md
- No orphan tasks (all have set_id)

**AC6: Set structure added to roadmap.yaml**
```yaml
milestones:
  - id: W0.M1
    sets:
      - id: w0m1-supervisor-integration
        title: "Supervisor & Agent Integration"
        tasks:
          - AFP-W0-M1-MVP-SUPERVISOR-SCAFFOLD
          - AFP-W0-M1-MVP-AGENTS-SCAFFOLD
          - AFP-W0-M1-AUTOPILOT-MVP-STRANGLER
      - id: w0m1-supervisor-integration-review
        title: "Review: Supervisor Integration Set"
        tasks:
          - AFP-W0-M1-SUPERVISOR-INTEGRATION-REVIEW
```

### Set Documentation (~25-30 sets × 3 docs = 75-90 docs)

**AC7: All sets have phase docs (minimum strategy/spec/plan)**
- [ ] Each set has strategy.md (why these tasks together? what pattern?)
- [ ] Each set has spec.md (what outcomes? how measured?)
- [ ] Each set has plan.md (how tasks sequence? what dependencies?)
- Optional: think.md, design.md for complex sets only

**AC8: Set docs provide task context**
- Set strategy explains clustering rationale (why these tasks together)
- Set spec defines collective outcomes (not just sum of task outcomes)
- Set plan shows task sequencing and dependencies
- Set docs save time (task docs reference set context instead of duplicating)

**AC9: Set docs location**
```
state/task_groups/<set-id>/
  strategy.md
  spec.md
  plan.md
  [think.md]  # optional
  [design.md] # optional
```

### Set-Level Review Tasks (CRITICAL)

**AC10: Each set has antagonistic review task**

Review task template:
```yaml
- id: AFP-<SET-ID>-REVIEW
  title: "Review: <Set Name>"
  status: pending
  set_id: <parent-set-id>-review  # Review tasks in their own mini-set
  epic_id: <parent-epic-id>
  dependencies:
    - <all tasks in reviewed set>
  description: >
    Antagonistically review all work in <set-name> set. Seek improvements,
    challenge assumptions, identify gaps, propose enhancements.

    Review checklist:
    - Did tasks achieve set outcomes? (compare spec.md vs reality)
    - Were AFP/SCAS principles followed? (via negativa, coherence, etc.)
    - What could be improved? (be specific, not generic)
    - What patterns emerged? (capture for reuse)
    - What gaps exist? (missing tests, docs, edge cases)
    - What should be refactored? (technical debt identified)

    Deliverables:
    - state/evidence/AFP-<SET-ID>-REVIEW/findings.md (improvements list)
    - state/evidence/AFP-<SET-ID>-REVIEW/patterns.md (reusable patterns)
    - Remediation tasks created for critical gaps (if any)
```

**AC11: Review task characteristics**
- **Antagonistic:** Actively seeks problems, not just validates
- **Specific:** Identifies concrete improvements (not vague "could be better")
- **Learning-focused:** Captures patterns for reuse
- **Evidence-based:** References actual work artifacts
- **Action-oriented:** Creates remediation tasks for critical issues

**AC12: Review task placement**
- At END of each set (after all set tasks complete)
- Blocks next set (must review before proceeding)
- Creates dedicated findings.md and patterns.md evidence

### Set-Level Reform Tasks (ADVANCED)

**AC12b: Each set has AFP/SCAS reform task**

Reform task template:
```yaml
- id: AFP-<SET-ID>-REFORM
  title: "Reform: <Set Name> via AFP/SCAS"
  status: pending
  set_id: <parent-set-id>-reform
  epic_id: <parent-epic-id>
  dependencies:
    - AFP-<SET-ID>-REVIEW  # Reform after review
  description: >
    Use AFP/SCAS principles to fundamentally reform <set-name> work.
    Go beyond incremental improvements - question core assumptions,
    research alternatives, align with project goals at deep level.

    Reform process:
    1. RESEARCH: Internet research on similar problems/solutions
       - How do others solve this? (academic, industry, open source)
       - What patterns exist? (design patterns, architectural patterns)
       - What principles apply? (from other domains)

    2. SIMULATED DISCUSSION: Multi-perspective analysis
       - Via negativa: What can we DELETE entirely?
       - Coherence: What proven patterns match this terrain?
       - Locality: How can we cluster better?
       - Visibility: What should be more obvious?
       - Evolution: How do we measure fitness?

    3. PROJECT ALIGNMENT: Deep goal analysis
       - Does this set serve project vision? (weather forecasting + autonomy)
       - Is this optimal approach? (or legacy thinking?)
       - What would we do starting fresh? (greenfield thinking)

    4. CONCRETE PROPOSALS: Actionable reforms
       - Specific changes (not vague "could improve")
       - AFP/SCAS rationale (which principles violated/improved)
       - Migration path (how to get from current to reformed)
       - Risk analysis (what could go wrong)

    Deliverables:
    - state/evidence/AFP-<SET-ID>-REFORM/research.md (findings from internet)
    - state/evidence/AFP-<SET-ID>-REFORM/analysis.md (multi-perspective thinking)
    - state/evidence/AFP-<SET-ID>-REFORM/alignment.md (project goal fit)
    - state/evidence/AFP-<SET-ID>-REFORM/proposals.md (concrete reforms)
    - Refactor tasks created (if reforms approved)
```

**AC12c: Reform task characteristics**
- **Research-driven:** Internet research, not just introspection
- **Multi-perspective:** Considers via negativa, coherence, locality, visibility, evolution
- **Goal-aligned:** Validates against actual project goals (not just process)
- **Concrete:** Produces specific proposals with migration paths
- **Optional:** Only for sets where reform potential exists (not mandatory)

### Epic-Level Review Tasks (CRITICAL)

**AC13: Each epic has cross-set review task**

Epic review task template:
```yaml
- id: AFP-<WAVE-ID>-EPIC-REVIEW
  title: "Epic Review: <Wave Name>"
  status: pending
  set_id: <wave-id>-epic-review  # Epic review in its own set
  epic_id: <wave-id>
  dependencies:
    - <all set review tasks in epic>
    - <epic exit readiness task>
  description: >
    Review all evidence and outcomes across <wave-name> epic. Synthesize
    learnings, identify cross-set patterns, improve work process for next epic.

    Review checklist:
    - Did epic achieve strategic goals? (compare strategy.md vs reality)
    - What patterns emerged across sets? (commonalities, anti-patterns)
    - How effective was the work process? (AFP phases helpful? overhead?)
    - What should change for next epic? (process improvements)
    - What knowledge should persist? (lessons for future waves)
    - Was hierarchical structure helpful? (epic/set/task organization)

    Deliverables:
    - state/evidence/AFP-<WAVE-ID>-EPIC-REVIEW/synthesis.md (cross-set learnings)
    - state/evidence/AFP-<WAVE-ID>-EPIC-REVIEW/process-improvements.md (changes for next wave)
    - state/evidence/AFP-<WAVE-ID>-EPIC-REVIEW/lessons.md (persistent knowledge)
    - Update to work process templates (if improvements identified)
```

**AC14: Epic review characteristics**
- **Cross-set synthesis:** Identifies patterns across multiple sets
- **Process-focused:** Evaluates work process effectiveness
- **Forward-looking:** Proposes improvements for next epic
- **Knowledge capture:** Extracts lessons for institutional memory
- **Template evolution:** Updates process templates based on learnings

**AC15: Epic review placement**
- At END of epic (after all set reviews + exit readiness)
- Blocks next wave (must review before WAVE-N+1 starts)
- Creates synthesis, process improvements, and lessons documents

### Epic-Level Reform Tasks (ADVANCED)

**AC15b: Each epic has AFP/SCAS reform task**

Epic reform task template:
```yaml
- id: AFP-<WAVE-ID>-EPIC-REFORM
  title: "Epic Reform: <Wave Name> via AFP/SCAS"
  status: pending
  set_id: <wave-id>-epic-reform
  epic_id: <wave-id>
  dependencies:
    - AFP-<WAVE-ID>-EPIC-REVIEW  # Reform after review
  description: >
    Use AFP/SCAS principles to fundamentally reform entire <wave-name> epic.
    Question whether this wave should exist at all, how it integrates with
    project vision, and what radical simplifications possible.

    Epic reform process:
    1. STRATEGIC RESEARCH: Why do similar projects structure work this way?
       - Study autonomous AI agent systems (academic + industry)
       - Study weather forecasting development (domain-specific)
       - Study evolutionary development (Wave N → N+1 patterns)

    2. FUNDAMENTAL QUESTIONING: Via negativa at epic scale
       - Can we DELETE this entire wave? (what if it didn't exist?)
       - Can we MERGE with another wave? (reduce epic count)
       - Can we SIMPLIFY radically? (10x fewer tasks, same outcome)

    3. PROJECT VISION ALIGNMENT: Deep strategy analysis
       - Does wave serve "autonomous weather forecasting"? (core mission)
       - Is timing right? (should this be earlier/later/never?)
       - Are outcomes essential? (nice-to-have vs must-have)

    4. ARCHITECTURAL REFORM: System-level improvements
       - How do waves integrate? (better sequencing possible?)
       - What cross-wave patterns? (commonalities to extract?)
       - How does project evolve? (Wave N+1 informed by Wave N learnings?)

    Deliverables:
    - state/evidence/AFP-<WAVE-ID>-EPIC-REFORM/strategic-research.md
    - state/evidence/AFP-<WAVE-ID>-EPIC-REFORM/fundamental-questions.md
    - state/evidence/AFP-<WAVE-ID>-EPIC-REFORM/vision-alignment.md
    - state/evidence/AFP-<WAVE-ID>-EPIC-REFORM/architectural-reform.md
    - Roadmap restructuring proposals (if radical changes needed)
```

**AC15c: Epic reform characteristics**
- **Strategic depth:** Questions existence of wave itself (radical via negativa)
- **Research-intensive:** Draws from multiple domains (AI agents + weather + dev process)
- **Vision-driven:** Validates against core mission (autonomous weather forecasting)
- **System-level:** Considers cross-wave integration and evolution
- **Optional but encouraged:** Major value in questioning fundamental assumptions

### Roadmap Structure Updates

**AC16: WAVE-1 through WAVE-5 status corrected**
- [ ] WAVE-1: status changed from "done" to "pending"
- [ ] WAVE-2: status changed from "done" to "pending"
- [ ] WAVE-3: status changed from "done" to "pending"
- [ ] WAVE-4: status changed from "done" to "pending"
- [ ] WAVE-5: status changed from "done" to "pending"

**AC17: All tasks have set_id and epic_id**
- [ ] Scan all tasks, verify set_id present (no orphans)
- [ ] Scan all tasks, verify epic_id present (no orphans)
- [ ] Pre-commit hook validates (blocks commits with orphans)

**AC18: Sets defined in roadmap structure**
```yaml
milestones:
  - id: W0.M1
    title: "Reboot Autopilot Core"
    sets:
      - id: w0m1-supervisor-integration
        title: "Supervisor & Agent Integration"
        description: "Scaffold supervisor, agents, and integration"
        tasks: [list of task IDs]
      - id: w0m1-supervisor-integration-review
        title: "Review: Supervisor Integration"
        tasks: [AFP-W0-M1-SUPERVISOR-INTEGRATION-REVIEW]
```

---

## Functional Requirements

### FR1: Epic Documentation Must Be Strategic
**The epic docs SHALL:**
- Explain WHY epic exists (problem, urgency, strategic fit)
- Define WHAT success means (measurable outcomes, exit criteria)
- Describe HOW work is organized (milestones, sets, integration)
- Analyze risks and dependencies (think deeply, not superficially)
- Validate AFP/SCAS alignment (score ≥7/9)

**Validation:** Read epic docs, verify substantial strategic thinking (not checkbox)

### FR2: Set Documentation Must Provide Context
**The set docs SHALL:**
- Explain clustering rationale (why these tasks grouped)
- Define collective outcomes (set goal beyond individual tasks)
- Show task sequencing (dependencies, parallel work opportunities)
- Reduce task doc duplication (task refers to set context)

**Validation:** Read set docs, verify tasks reference them (context reused not duplicated)

### FR3: Set Review Tasks Must Be Antagonistic
**The set review tasks SHALL:**
- Actively seek improvements (not just validate completion)
- Challenge assumptions (question decisions made during work)
- Identify gaps (missing tests, docs, edge cases)
- Propose concrete actions (specific remediations, not vague)
- Capture patterns (document reusable learnings)

**Validation:** Review task descriptions include antagonistic language ("challenge", "identify gaps", "what could be better")

### FR4: Epic Review Tasks Must Synthesize Learning
**The epic review tasks SHALL:**
- Identify cross-set patterns (commonalities across sets)
- Evaluate process effectiveness (was hierarchical structure helpful?)
- Propose process improvements (concrete changes for next wave)
- Capture institutional knowledge (lessons that persist)
- Update templates (work process evolution)

**Validation:** Epic review tasks produce synthesis, process improvements, and lessons documents

### FR5: Roadmap Structure Must Be Valid
**The roadmap SHALL:**
- Follow schema (epic → milestone → set → task hierarchy)
- Have no orphans (all tasks in sets, all sets in milestones)
- Include review tasks (one per set, one per epic)
- Sequence correctly (review tasks depend on work tasks)

**Validation:** Schema validation script passes, no errors

---

## Non-Functional Requirements

### NFR1: Documentation Quality (Substantial, Not Superficial)
- **Requirement:** Epic docs ≥2 pages each, set docs ≥1 page each
- **Rationale:** Superficial docs don't provide context, waste effort
- **Test:** Word count verification (epic strategy ≥1000 words)
- **Mitigation:** Critic validation (StrategyReviewer rejects superficial)

### NFR2: Documentation Consistency (Reusable Templates)
- **Requirement:** All docs follow consistent structure (extractable templates)
- **Rationale:** Templates speed future work, enforce standards
- **Test:** Compare docs, verify similar sections across epics/sets
- **Mitigation:** Start with WAVE-0 template, adapt for each wave

### NFR3: Effort Reasonable (Not Overwhelming)
- **Requirement:** Total effort ≤200 hours (achievable in 4-5 weeks)
- **Rationale:** Bootstrap investment acceptable, but must be bounded
- **Test:** Time tracking per doc, adjust approach if exceeding
- **Mitigation:** Accept "good enough" (2-3 pages sufficient)

### NFR4: Review Tasks Actionable (Produce Real Improvements)
- **Requirement:** ≥50% of review tasks produce remediation tasks or process changes
- **Rationale:** Reviews without action are wasted effort
- **Test:** Track review outcomes, verify action rate
- **Mitigation:** Antagonistic framing ("identify gaps" not "validate completion")

---

## Out of Scope

**Explicitly NOT in this task:**
- Executing the wave work (just planning/organizing)
- Implementing enforcement hooks (separate W0.M3 tasks)
- Extracting templates from examples (separate task after this)
- Migrating legacy work to new structure (separate migration task)

**This task:** Documentation and organization ONLY

---

## Dependencies

**Requires:**
- WAVE-0 epic docs complete ✅ (template to follow)
- Roadmap.yaml readable/editable ✅
- Evidence directory structure ✅ (`state/epics/`, `state/task_groups/`)

**Blocks:**
- W0.M3 template extraction (needs complete examples)
- W0.M3 enforcement implementation (needs structure to enforce)
- WAVE-1 start (needs planning docs before execution)

---

## Validation Tests (For VERIFY Phase)

### Test 1: Epic Documentation Completeness
```bash
# Verify all waves have 5 phase docs
for wave in WAVE-{0..5}; do
  for doc in strategy spec plan think design; do
    test -f "state/epics/$wave/$doc.md" || echo "MISSING: $wave/$doc.md"
  done
done
```

**Pass criteria:** Zero missing files

### Test 2: Set Organization Completeness
```bash
# Verify all tasks have set_id
grep -E "^\s+- id: AFP-" state/roadmap.yaml | while read -r line; do
  task_id=$(echo "$line" | grep -oP 'id: \K[^\s]+')
  grep -A 5 "id: $task_id" state/roadmap.yaml | grep "set_id:" || echo "MISSING set_id: $task_id"
done
```

**Pass criteria:** Zero missing set_id values

### Test 3: Review Task Presence
```bash
# Verify each set has review task
# Count sets
set_count=$(grep -E "^\s+- id: [a-z0-9-]+-[a-z]+" state/roadmap.yaml | wc -l)
# Count review tasks
review_count=$(grep -E "title:.*Review:" state/roadmap.yaml | wc -l)

echo "Sets: $set_count, Reviews: $review_count"
test $review_count -ge $set_count || echo "FAIL: Not all sets have review tasks"
```

**Pass criteria:** Review tasks ≥ set count

### Test 4: Documentation Quality Check
```bash
# Verify epic docs are substantial (≥1000 words)
for file in state/epics/WAVE-*/strategy.md; do
  word_count=$(wc -w < "$file")
  test $word_count -ge 1000 || echo "TOO SHORT: $file ($word_count words)"
done
```

**Pass criteria:** All epic strategies ≥1000 words

### Test 5: Critic Validation
```bash
# Run critics on all epic docs
cd tools/wvo_mcp
for wave in WAVE-{0..5}; do
  npm run strategy:review $wave || echo "BLOCKED: $wave strategy"
  npm run design:review $wave || echo "BLOCKED: $wave design"
done
```

**Pass criteria:** All critics pass (or approved overrides documented)

---

## Success Metrics

**Quantitative:**
- Epic docs created: 30 (6 epics × 5 docs)
- Set docs created: ~80 (25-30 sets × 3 docs)
- Review tasks added: ~35 (25-30 set reviews + 6 epic reviews)
- Roadmap structure: 100% valid (schema passes)
- Task embedding: 100% (no orphans)

**Qualitative:**
- Documentation substantial (not superficial)
- Review tasks actionable (not checkbox)
- Structure navigable (easy to find context)
- Templates extractable (patterns clear)

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md (execution approach)
**Owner:** Claude Council
