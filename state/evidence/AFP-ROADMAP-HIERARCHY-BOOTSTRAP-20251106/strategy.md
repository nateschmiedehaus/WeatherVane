# STRATEGY: AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106

**Task ID:** AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106
**Set:** wave0-roadmap-bootstrap
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

We're building a hierarchical work process system (W0.M3) that requires:
- Epic phase docs (strategy/spec/plan/think/design) for ALL epics
- Tasks organized into sets with set phase docs
- Review tasks at set and epic levels

**Current state:**
- **WAVE-0 epic:** Has phase docs ✅ (just created)
- **WAVE-0 sets:** Partially organized (W0.M3 has 5 sets, but W0.M1 and W0.M2 tasks not organized into sets)
- **WAVE-1 through WAVE-5 epics:** NO phase docs (marked "done" but only have placeholder evidence)
- **WAVE-1 through WAVE-5 sets:** Tasks not organized into sets, no set phase docs
- **Review tasks:** Missing from all sets and epics

**Pain points:**
1. **Bootstrap paradox:** Building hierarchy enforcement without our own roadmap being hierarchical
2. **Incomplete example:** Can't extract templates from WAVE-0 if W0.M1/M2 not organized
3. **False "done" status:** WAVE-1-5 marked done but not actually complete
4. **No review loops:** Missing critical review tasks that antagonistically seek improvements
5. **Can't enforce what we don't follow:** Hypocritical to require hierarchy from others

---

## Root Cause

**Why does this gap exist?**

**Historical:**
1. **Incremental roadmap evolution** - Built roadmap over time without enforcing structure
2. **Wave 0 created placeholder evidence** - Autopilot created empty bundles, marked waves "done"
3. **Task-first thinking** - Focused on individual tasks before organizing into sets
4. **Documentation debt** - Prioritized implementation over documentation

**Systemic:**
1. **No enforcement yet** - Pre-commit hooks don't yet require epic/set docs
2. **Bootstrap chicken-and-egg** - Need complete example before can enforce on others
3. **Process still evolving** - Hierarchical structure just being defined in W0.M3

**The core issue:** **Trying to enforce hierarchy we haven't demonstrated ourselves**

---

## Goal / Desired Outcome

**Complete hierarchical documentation for entire roadmap:**

### 1. Epic Phase Docs (6 epics)
- WAVE-0: ✅ Done
- WAVE-1: strategy.md started, need spec/plan/think/design
- WAVE-2: All 5 phase docs needed
- WAVE-3: All 5 phase docs needed
- WAVE-4: All 5 phase docs needed
- WAVE-5: All 5 phase docs needed

**Total:** 25 epic phase docs (5 already done, 20 to create)

### 2. Set Organization and Phase Docs
- **W0.M1 (Reboot Autopilot Core):** ~15 tasks → organize into 3-4 sets, create set phase docs
- **W0.M2 (Test Harness):** ~1 task → organize into 1 set, create set phase docs
- **W0.M3:** Already has 5 sets, need phase docs for remaining sets
- **W1.M1:** ~9 tasks → organize into 2-3 sets, create set phase docs
- **W2.M1:** ~9 tasks → organize into 2-3 sets, create set phase docs
- **W2.M2:** ~11 tasks → organize into 3-4 sets, create set phase docs
- **W3.M1:** ~6 tasks → organize into 2 sets, create set phase docs
- **W4.M1:** ~6 tasks → organize into 2 sets, create set phase docs
- **W5.M1:** ~21 tasks → organize into 5-6 sets, create set phase docs

**Estimated total:** ~25-30 sets, each needs strategy/spec/plan (3 docs per set = ~75-90 set phase docs)

### 3. Review Tasks
- **Set-level review tasks:** One per set (~25-30 tasks) - antagonistically seek improvements in set's work
- **Epic-level review tasks:** One per epic (6 tasks) - review all evidence, improve process for next epic

**Total new tasks:** ~31-36 review tasks to add to roadmap.yaml

### 4. Roadmap Structure Updates
- Fix WAVE-1 through WAVE-5 status from "done" to "pending"
- Add set structure to all milestones
- Add review tasks to roadmap.yaml
- Ensure all tasks have set_id and epic_id

---

## Strategic Urgency

**Why now?**

1. **Bootstrap requirement** - Can't enforce hierarchy on others until our own roadmap compliant
2. **W0.M3 in progress** - Currently building enforcement, need complete example
3. **Template extraction** - Need real examples to extract epic/set templates from
4. **Process credibility** - Hypocritical to require what we don't demonstrate

**Without this work:**
- Can't enforce epic/set gates (no example to point to)
- Can't extract templates (incomplete examples)
- Process compliance theater (do as I say, not as I do)
- W0.M3 blocked (can't finish hierarchy without complete example)

**With this work:**
- Complete example exists (WAVE-0 through WAVE-5 fully documented)
- Templates extractable (real patterns to generalize)
- Process credibility (we follow what we enforce)
- W0.M3 unblocked (can finish hierarchy implementation)

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Placeholder evidence (empty WAVE-1-5 bundles → substantive docs)
- False "done" status (misleading → accurate)
- Ad-hoc task organization (chaos → structure)
- Missing review loops (no learning → systematic improvement)

**What are we ADDING?**
- ~20 epic phase docs (~40,000 words)
- ~75-90 set phase docs (~30,000 words)
- ~31-36 review tasks
- Roadmap structure updates

**Is the addition justified?**
- **Yes:** This is one-time documentation investment
- **Yes:** Enables enforcement (can't enforce undocumented structure)
- **Yes:** Creates templates (reused for all future epics/sets)
- **Yes:** Establishes learning loops (review tasks compound value)

### COHERENCE (Match Terrain)

**Reusing proven patterns:**
- Epic/set structure from WAVE-0 (already established)
- Phase doc templates (strategy/spec/plan/think/design proven)
- Review tasks from postmortem culture (SRE, incident analysis)
- Hierarchical organization from agile (epics → stories)

### LOCALITY (Related near)

**Related work together:**
- All epic docs in `state/epics/WAVE-N/`
- All set docs in `state/task_groups/<set-id>/`
- All review tasks in respective sets/epics
- Hierarchical organization visible in directory structure

### VISIBILITY (Important obvious)

**Critical structure explicit:**
- Epic docs make wave purpose obvious
- Set docs make task clustering rationale obvious
- Review tasks make improvement loops obvious
- Directory structure makes hierarchy obvious

### EVOLUTION (Fitness)

**This work enables evolution:**
- Review tasks create learning loops
- Complete examples enable template extraction
- Structured organization enables pattern mining
- Audit trail enables retrospective analysis

---

## Alternatives Considered

### Alternative 1: Skip Documentation, Just Organize Tasks
**Approach:** Add set_id to tasks, skip phase docs

**Rejected because:**
- No rationale for clustering (why these tasks together?)
- No templates to extract (need examples)
- No learning loops (review tasks require docs to review)
- Defeats purpose of hierarchical *process* (structure alone insufficient)

### Alternative 2: Document Only WAVE-0, Leave Others Pending
**Approach:** Complete WAVE-0 fully, defer WAVE-1-5

**Rejected because:**
- Incomplete example (can't extract patterns from one epic)
- False dichotomy (waves marked "done" but not documented)
- Blocks future work (WAVE-1-5 can't start without planning)
- Missing context (why do waves exist? what do they achieve?)

### Alternative 3: Minimal Docs (Just Strategy, Skip Others)
**Approach:** Create only strategy.md for epics/sets, skip spec/plan/think/design

**Rejected because:**
- Incomplete cognitive labor (strategy alone insufficient)
- Poor template (need all phases for extraction)
- Inconsistent enforcement (can't require what we don't demonstrate)
- Missing critical thinking (spec/plan/think/design provide different lenses)

### Selected: Complete Documentation (All Epics, All Sets, All Phases)

**Why:**
- **One-time investment** - Do it right once, use forever
- **Complete example** - Can extract full templates
- **Process credibility** - Demonstrate what we enforce
- **Learning loops** - Review tasks compound value

---

## Success Criteria

**Task complete when:**

### Epic Documentation Complete
- [ ] All 6 waves have 5 phase docs (strategy/spec/plan/think/design)
- [ ] Each epic doc substantial (2-3 pages, not superficial)
- [ ] Epic docs explain WHY wave exists, WHAT it achieves, HOW it works

### Set Organization Complete
- [ ] All W0.M1 tasks organized into sets
- [ ] All W0.M2 tasks organized into sets
- [ ] All W1.M1 through W5.M1 tasks organized into sets
- [ ] Each set has rationale (why these tasks together?)

### Set Documentation Complete
- [ ] All sets have phase docs (strategy/spec/plan minimum)
- [ ] Set docs explain clustering rationale
- [ ] Set docs provide context for tasks within

### Review Tasks Added
- [ ] Each set has review task (antagonistic improvement seeking)
- [ ] Each epic has review task (cross-set learning)
- [ ] Review tasks properly formatted in roadmap.yaml

### Roadmap Structure Valid
- [ ] WAVE-1-5 status changed from "done" to "pending"
- [ ] All tasks have set_id and epic_id (no orphans)
- [ ] Sets defined in roadmap.yaml with task lists
- [ ] Review tasks at end of each set and epic

### Quality Validated
- [ ] Epic docs pass OutcomeCritic (measurable outcomes)
- [ ] Set docs pass ClusterCritic (logical grouping)
- [ ] Roadmap.yaml passes schema validation
- [ ] No orphan tasks or sets (embedding validated)

---

## Risks and Mitigations

### Risk 1: Scope Too Large (Won't Finish)
- **Threat:** ~100+ docs to create, overwhelming scope
- **Mitigation:** Break into waves (finish WAVE-0, then WAVE-1, etc.)
- **Mitigation:** Use templates (reduce per-doc time)
- **Mitigation:** Accept "good enough" (2-3 pages sufficient, not 10)

### Risk 2: Documentation Becomes Stale
- **Threat:** Waves evolve, docs become outdated
- **Mitigation:** Living documents (update as waves execute)
- **Mitigation:** Review tasks (built-in update mechanism)
- **Mitigation:** Mark as planning docs (subject to change)

### Risk 3: Effort > Value
- **Threat:** Time spent documenting > value gained
- **Mitigation:** This is bootstrap (one-time investment)
- **Mitigation:** Templates extracted (reused forever)
- **Mitigation:** Enforcement enabled (prevents future chaos)

---

## Estimated Effort

**Epic docs:** 20 docs × 3 hours/doc = 60 hours
**Set docs:** 80 docs × 1 hour/doc = 80 hours
**Set organization:** 25 sets × 1 hour/set = 25 hours
**Review tasks:** 35 tasks × 0.5 hour/task = 17.5 hours
**Roadmap updates:** 10 hours
**Testing/validation:** 10 hours

**Total:** ~200 hours (4-5 weeks full-time, or ongoing parallel work)

**Mitigation:** This is acceptable for bootstrap task establishing foundation for all future work

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md (define acceptance criteria precisely)
**Owner:** Claude Council
