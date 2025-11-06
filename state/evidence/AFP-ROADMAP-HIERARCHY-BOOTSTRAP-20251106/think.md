# THINK: AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106

**Task ID:** AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106
**Set:** wave0-roadmap-bootstrap
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Edge Cases

### Edge Case 1: Wave Documentation Conflicts with Reality
**Scenario:** Document WAVE-2 (knowledge base) before executing it, but actual execution reveals different requirements

**How to handle:**
- Mark all WAVE-1+ docs as "PLANNING" (subject to change)
- Include assumptions section (explicit what we're guessing)
- Update docs during execution (living documents)
- Review tasks specifically check doc vs. reality alignment

**Why this works:**
- Planning docs still valuable (strategic thinking preserved)
- Can evolve without being "wrong" (expected to change)
- Learning captured through review tasks

### Edge Case 2: Task Doesn't Fit Any Set Cleanly
**Scenario:** Task spans multiple concerns, unclear which set it belongs to

**How to handle:**
- Assign to set with strongest connection
- Note spanning nature in task description
- Reference other sets in task docs
- Reform task may propose set restructuring

**Example:** Task improving both autopilot AND knowledge base → choose primary concern

### Edge Case 3: Set Has Only One Task
**Scenario:** After organization, some sets might have 1-2 tasks (seems too small)

**How to handle:**
- Allow small sets if rationale strong (don't force artificial grouping)
- Note in set strategy why standalone
- Consider merging during reform task
- Validate during ClusterCritic review

**Why acceptable:** Better authentic small sets than artificial large sets

### Edge Case 4: Review Task Finds Major Issues
**Scenario:** Set review identifies critical gaps requiring significant rework

**How to handle:**
- Review task creates remediation tasks
- Remediation tasks added to roadmap (not executed immediately)
- Reform task may propose larger restructuring
- Epic review synthesizes patterns across sets

**Not a failure:** Review tasks SHOULD find issues (that's the point)

### Edge Case 5: Reform Task Proposes Deleting Entire Wave
**Scenario:** Epic reform concludes WAVE-N unnecessary (radical via negativa)

**How to handle:**
- Serious proposal requiring Director Dana approval
- Document rationale thoroughly
- Show what outcomes still achieved without wave
- Trial period (defer wave, monitor impact)
- Reversible (can resurrect if needed)

**Why allowed:** Via negativa means questioning everything, including epics

### Edge Case 6: Documentation Templates Don't Fit
**Scenario:** WAVE-N has unique characteristics, standard template doesn't work

**How to handle:**
- Adapt template (not rigid rules)
- Document why adaptation needed
- Extract new template variant if pattern repeats
- Include in template evolution (WAVE-5 task)

**Example:** WAVE-4 (gauntlet) might need different structure than WAVE-1 (governance)

### Edge Case 7: Too Many Review/Reform Tasks
**Scenario:** 70+ review/reform tasks added, roadmap becomes overwhelming

**How to handle:**
- Review/reform tasks lower priority (nice-to-have)
- Execute after main work (not blocking)
- Batch reviews (one session covers multiple sets)
- Optional reform (only where high value)

**Priority:** Main work > review > reform

---

## Failure Modes

### Failure Mode 1: Scope Overwhelms (Never Finish)
**Symptom:** Stuck in Phase 2, can't get through all 6 waves

**Detection:**
- Time tracking per phase (should be ~1 week/wave)
- If >2 weeks on single wave, stuck

**Mitigation:**
- Accept "good enough" (2 pages, not 10)
- Use templates aggressively (don't reinvent)
- Parallelize where possible (epic docs concurrent)
- Reduce set doc depth if needed (strategy only, skip spec/plan)

**Escalation:**
- If >4 weeks total, pause and reassess
- Director Dana decides: continue, simplify, or defer

### Failure Mode 2: Documentation Quality Degrades
**Symptom:** Later waves have superficial docs (fatigue setting in)

**Detection:**
- Word count declining (WAVE-5 < WAVE-1)
- Critic rejections increasing
- Copy-paste between waves obvious

**Mitigation:**
- Take breaks between waves
- Review WAVE-0 example before each wave
- Critic validation catches (StrategyReviewer blocks superficial)
- Accept lower quality than reject entirely (better done than perfect)

**Escalation:**
- If critics consistently blocking, pause for quality reset

### Failure Mode 3: Roadmap.yaml Becomes Unmanageable
**Symptom:** 1500+ line YAML file, hard to edit, frequent merge conflicts

**Detection:**
- File size >1500 lines
- Edit time >30 min per change
- Frequent validation errors

**Mitigation:**
- Split roadmap into files (epic per file)
- Schema validation before edit
- Automated formatting
- Consider roadmap tool/UI (WAVE-5 task)

**Escalation:**
- If roadmap editing becomes blocker, refactor structure

### Failure Mode 4: Review Tasks Create Infinite Loop
**Symptom:** Review finds gaps → remediation → review finds more gaps → repeat

**Detection:**
- Remediation rate >50% (half of work needs rework)
- Review tasks taking longer than main work
- Pattern of "review creates review" recursion

**Mitigation:**
- Remediation threshold (only critical gaps)
- Time-box reviews (2 hours max per set)
- Accept imperfection (ship with known gaps)
- Reform addresses systemic issues (not task-by-task)

**Escalation:**
- If infinite loop detected, disable reviews temporarily

### Failure Mode 5: Reform Tasks Propose Too Much Change
**Symptom:** Every reform wants to restructure everything, chaos

**Detection:**
- Reform proposals >10 refactor tasks each
- Cross-wave restructuring proposals
- Conflicting reforms (A says add, B says delete)

**Mitigation:**
- Reform approval required (Director Dana)
- Batch reforms (implement after wave complete)
- Prioritize (top 3 reforms only)
- Accept incremental (not revolutionary) changes

**Escalation:**
- If reforms causing paralysis, defer all to WAVE-6

### Failure Mode 6: Templates Don't Generalize
**Symptom:** Each wave so different, can't extract reusable templates

**Detection:**
- Template extraction task blocked (no commonalities)
- Each wave reinventing structure
- Copy-paste not working

**Mitigation:**
- This is acceptable (waves ARE different)
- Extract meta-template (high-level structure)
- Embrace variation (not cookie-cutter)
- Document when to use which variant

**Not a failure:** Diversity of waves might be feature, not bug

---

## Dependencies

### External Dependencies:

**Git + file system operational:**
- Need to create ~100 files
- Need to edit roadmap.yaml (large file)
- Risk: Disk space, file system limits
- Mitigation: Check disk space before start

**Critic tools functional:**
- Need StrategyReviewer, OutcomeCritic, DesignReviewer, ClusterCritic
- Risk: Critic bugs block validation
- Mitigation: Fix critics first if broken

**Time availability:**
- ~200 hours estimated
- Risk: Other priorities interrupt
- Mitigation: Clear calendar, communicate timeline

### Internal Dependencies:

**WAVE-0 epic docs complete:**
- Status: ✅ DONE (committed)
- Provides template to follow

**wave0-epic-bootstrap set exists:**
- Status: ✅ EXISTS (has strategy/spec/plan)
- Provides set template example

**Roadmap.yaml structure stable:**
- Status: ✅ STABLE (no major changes expected)
- Safe to reorganize

### Circular Dependencies:

**None identified** - all dependencies linear (no cycles)

---

## Assumptions

### Assumption 1: Waves Will Actually Execute in Order
**Assumption:** WAVE-0 → WAVE-1 → WAVE-2 → ... sequentially

**If false:** Documentation assumes wrong sequencing, outcomes misaligned

**Validation:** Confirm with Director Dana that wave order correct

**Mitigation:** Mark as planning docs, update if order changes

### Assumption 2: Task Lists Are Reasonably Complete
**Assumption:** Current roadmap.yaml has most tasks identified

**If false:** Major tasks missing, set organization incomplete

**Validation:** Review with Director Dana before organizing

**Mitigation:** Add placeholder tasks if gaps obvious

### Assumption 3: Epic Purposes Are Clear
**Assumption:** We understand why each wave exists (foundation, governance, knowledge, etc.)

**If false:** Epic strategy docs will be speculative/wrong

**Validation:** Research each wave's domain before documenting

**Mitigation:** Mark assumptions explicitly, update during execution

### Assumption 4: Set Organization Will Be Stable
**Assumption:** Once organized into sets, structure won't radically change

**If false:** Documentation churn, rework

**Validation:** Review set proposals before creating docs

**Mitigation:** Reform tasks allow restructuring (not locked in)

### Assumption 5: Review/Reform Tasks Will Be Valuable
**Assumption:** Investing in review/reform loops produces improvements

**If false:** 70 tasks added that waste time

**Validation:** Track review outcomes (% creating real improvements)

**Mitigation:** If <30% valuable, stop creating them

### Assumption 6: Templates Will Be Extractable
**Assumption:** WAVE-0-5 docs will have enough commonality to extract templates

**If false:** Each epic unique, can't generalize

**Validation:** Compare WAVE-0 and WAVE-1 docs (do patterns emerge?)

**Mitigation:** Accept variation (meta-template with variants)

---

## Complexity Analysis

### Added Complexity:

**File count:**
- ~107 new files (epic docs, set docs, evidence)
- ~1 modified file (roadmap.yaml)

**LOC count:**
- ~100,000 LOC (documentation)
- ~500 LOC (roadmap structure)

**Cognitive load:**
- 6 waves to understand
- ~30 sets to define
- ~70 review/reform tasks to create
- Hierarchical relationships to track

**Maintenance burden:**
- Living documents (need updates as waves execute)
- Review/reform tasks (ongoing commitment)
- Template evolution (as patterns clarify)

### Is Complexity Justified?

**Benefits:**
- One-time bootstrap (don't repeat)
- Templates extracted (reused forever)
- Learning loops (compound value)
- Enforcement enabled (can't enforce undocumented)
- Credibility established (demonstrate what we preach)

**Costs:**
- ~200 hours investment (4-5 weeks)
- ~100K LOC to maintain
- Ongoing review/reform work

**ROI Analysis:**
- Break-even: If saves >200 hours total (through templates, enforcement, learning)
- Likely: Each wave reuses templates (6 waves × 40 hours = 240 hours saved)
- Plus: Enforcement prevents chaos (hours of rework avoided)
- Plus: Learning loops improve efficiency (compounds over time)

**Verdict:** ✅ Complexity justified (ROI positive within 6 months)

### Complexity Kill Criteria:

**If any of these occur, simplify or abort:**
1. Time to complete >8 weeks (double estimate)
2. Review tasks create >3 remediations per set (overhead too high)
3. Reform tasks produce 0 valuable changes (wasted effort)
4. Template extraction fails (no commonality found)
5. Maintenance burden >10 hours/month (ongoing cost too high)

**Review quarterly:** MetaCritic assesses if hierarchy remains valuable

---

## Open Questions

### Question 1: Should Reform Tasks Be Mandatory or Optional?
**Trade-off:**
- Mandatory: Ensures deep thinking, but may be overkill for simple sets
- Optional: Flexibility, but may be skipped too often

**Proposal:** Optional but encouraged (add to spec: "optional where value exists")

### Question 2: How Deep Should Set Docs Be?
**Trade-off:**
- Deep (2-3 pages): Provides context, but high overhead
- Shallow (1 page): Lower overhead, but may not provide enough context

**Proposal:** Minimum strategy/spec/plan (1 page each), optional think/design for complex sets

### Question 3: Should We Document WAVE-1-5 Before or After Execution?
**Trade-off:**
- Before (this task): Planning docs, may be wrong but enables thinking
- After (retrospective): Accurate, but no strategic thinking upfront

**Proposal:** Before (planning docs), update during execution (living documents)

### Question 4: What If We Discover New Waves Needed?
**Example:** WAVE-6 for production deployment not currently in roadmap

**Proposal:** Add waves as discovered, create docs following same template

### Question 5: Should Review/Reform Tasks Block Next Work?
**Trade-off:**
- Blocking: Ensures reviews happen, but slows progress
- Non-blocking: Maintains velocity, but reviews may be skipped

**Proposal:** Reviews block (must review before proceeding), reforms non-blocking (nice-to-have)

---

## Mitigation Strategies

### Strategy 1: Incremental Delivery (Wave by Wave)
- Complete WAVE-0 fully before starting WAVE-1
- Enables learning, template refinement
- Provides usable deliverables incrementally
- Reduces risk of abandoning mid-way

### Strategy 2: Template Aggressive Reuse
- Start each wave by copying WAVE-0 template
- Adapt rather than create from scratch
- Reduces per-doc time significantly
- Ensures consistency

### Strategy 3: Critic-Driven Quality Gates
- Run critics after each wave (not at end)
- Catch quality degradation early
- Force standards maintenance
- Provide objective feedback

### Strategy 4: Clear Completion Criteria Per Phase
- Each phase has checklist (from spec.md)
- Track progress visibly (todo list)
- Celebrate milestones (wave completion)
- Enable early exit if needed (not all-or-nothing)

### Strategy 5: Scheduled Breaks Between Waves
- 1 day break after each wave
- Prevents fatigue-driven quality degradation
- Allows reflection on patterns
- Maintains enthusiasm

---

**Think complete:** 2025-11-06
**Next phase:** design.md (AFP/SCAS validation and architecture)
**Owner:** Claude Council
