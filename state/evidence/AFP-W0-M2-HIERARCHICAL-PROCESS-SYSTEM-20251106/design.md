# Design: AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM

**Task ID:** AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM-20251106
**Date:** 2025-11-06

---

## Context

**Problem:** Single-scale work process (task-level) applied to multi-scale work (META, project, epic, groups, tasks) creates:
- Process weight mismatch (same effort for 1-line change as architecture decision)
- Decision duplication (377 files re-debating architecture)
- No learning mechanism (patterns don't propagate upward)
- No governance for process itself (AFP/SCAS scattered across docs)

**Root cause:** No hierarchical structure matching decision magnitude

**Goal:** 5-level hierarchy where:
- META level governs process itself (AFP/SCAS principles)
- Each level does cognitive labor (strategy/spec/plan/think/design) at appropriate depth
- Constraints flow downward (authority), learnings flow upward (harvest)
- Violations blocked at task level, forced to resolve at appropriate level

---

## Five Forces Check

### COHERENCE (Match the terrain)

**Pattern reviewed:**
- Existing: Task-level AFP 10-phase process
- Similar: Project management hierarchies (agile epics/stories, OKRs, PERT charts)
- Selected: Adapt AFP phases to all levels, not invent new frameworks

**How this matches terrain:**
- Software decisions naturally hierarchical (architecture > module > function > line)
- Process should match this structure
- Already have epics in roadmap.yaml (WAVE-0, WAVE-1) - extend, don't replace

**Reusing proven pattern:** "Fractal AFP" - same principles at every scale
- META: AFP about AFP (process improves itself using AFP)
- PROJECT: AFP for product (architecture using via negativa)
- EPIC: AFP for capabilities (outcomes, not outputs)
- TASK GROUP: AFP for clusters (shared patterns)
- TASK: AFP for changes (existing)

### ECONOMY (Via Negativa - Achieve more with less)

**What can we DELETE?**

**Option 1:** Delete all 377 task evidence files, keep only high-level
- **Analysis:** Too extreme, lose audit trail and learning
- **Rejected**

**Option 2:** Delete decision duplication by centralizing at higher levels
- **Analysis:** YES! Instead of 50 files debating "should we use TypeScript?", one PROJECT decision
- **Estimated savings:** 60-70% reduction in evidence volume
- **Selected**

**Option 3:** Delete task groups (keep 4 levels not 5)
- **Analysis:** No. Optional level, only create when valuable
- **Via negativa applied to hierarchy itself**

**What gets DELETED by this design:**
1. **Architecture re-debates:** Once decided at PROJECT, tasks don't re-litigate
2. **Pattern duplication:** Shared pattern extracted to task group, not repeated in 10 tasks
3. **Scattered documentation:** AFP principles consolidated in META, not scattered across AGENTS.md, CLAUDE.md, etc.

**Economy metric:**
- Current: 377 files, 11MB
- Projected: ~150 task files (lightweight), ~20 group files, ~10 epic files, 1 project, 1 meta
- Net: ~180 total files, <5MB
- **Reduction: 52% fewer files, 55% less storage**

### LOCALITY (Related near, unrelated far)

**What's grouped together:**
- **META level:** All process principles in `state/meta/` (not scattered)
- **PROJECT level:** All architecture decisions in `state/project/WEATHERVANE-2025/plan/` (not per-task)
- **EPIC level:** All epic patterns in `state/epics/[EPIC-ID]/` (milestone context together)
- **TASK GROUP level:** Related tasks share `state/task_groups/[GROUP]/plan/pattern.md`
- **TASK level:** Individual evidence in `state/evidence/[TASK-ID]/` (unchanged)

**Coupling analysis:**
- Tasks loosely coupled to groups (optional)
- Groups loosely coupled to epics (just references pattern)
- Epics loosely coupled to project (just selects patterns)
- Project loosely coupled to meta (follows principles)

**Dependency graph:**
```
META (principles)
  ↓ guides
PROJECT (architecture) ← reads META principles
  ↓ provides patterns
EPIC (integration) ← reads PROJECT patterns, selects subset
  ↓ specializes
TASK GROUP (concrete pattern) ← reads EPIC design, implements
  ↓ distributes
TASK (code) ← reads GROUP pattern, follows
```

**Locality preserved:** Each level references parent, doesn't copy-paste

### VISIBILITY (Important obvious, unimportant hidden)

**What's immediately visible:**
1. **Process principles:** `state/meta/plan/principles/afp_principles.md` (not buried in AGENTS.md section 3.2.1)
2. **Architecture decisions:** `state/project/WEATHERVANE-2025/plan/architecture.md` (not archeology across 50 task files)
3. **Epic outcomes:** `state/epics/WAVE-0/spec.md` (not inferred from task list)
4. **Decision authority:** Explicit hierarchy (META > PROJECT > EPIC > GROUP > TASK)

**What's hidden (appropriately):**
- Task-level implementation details (in state/evidence/, not polluting higher levels)
- Deprecated patterns (moved to state/archive/ after fitness <30%)
- Experimental work (in research/, not mixed with production)

**Error visibility (Hierarchical enforcement):**
```
❌ HIERARCHICAL CONSTRAINT VIOLATION

Level: PROJECT
Constraint: TypeScript/Python only
Violated by: Task AFP-XYZ proposes Rust

BLOCKED. Choose:
1. Revise task (use TypeScript)
2. Escalate (create AFP-ARCHITECTURE-ADD-RUST)
3. Exception (requires Director Dana approval)
```

**Failure is explicit, resolution clear.**

### EVOLUTION (Patterns prove fitness)

**How patterns evolve:**

1. **Task-level experimentation:**
   - Engineer tries new approach in task
   - Documents in task/design.md
   - If successful, noted in task/review.md

2. **Task group promotion:**
   - Pattern used in 3+ tasks
   - Cluster into task group
   - Extract to `group/plan/pattern.md`
   - Track fitness: success rate across tasks

3. **Epic promotion:**
   - Pattern successful across multiple groups
   - Fitness >80% (8/10 tasks succeed using it)
   - Add to `epic/harvest.md`
   - Becomes recommended pattern for epic

4. **Project promotion:**
   - Pattern successful across multiple epics
   - Fitness >90% (9/10 epics succeed)
   - Add to `project/plan/architecture.md`
   - Becomes mandatory pattern (constraint)

5. **META promotion:**
   - Pattern successful across projects (if multi-project)
   - Proven in production for >1 year
   - Add to `meta/plan/principles/`
   - Becomes AFP/SCAS principle

**Deprecation (via negativa applied to patterns):**
- Fitness <50% for 2 quarters → marked deprecated
- Fitness <30% for 1 quarter → removed
- Alternative must exist before deprecation
- Migration guide created

**Pattern example lifecycle:**
```
Week 1: Task AFP-API-1 tries "Zod validation"
Week 2: Tasks AFP-API-2, AFP-API-3 also use Zod (fitness: 100%, 3/3 success)
Week 3: Create task group "api-endpoints", extract Zod pattern
Month 2: 10 tasks use Zod, 9 succeed, 1 fails (fitness: 90%)
Month 3: Promote to epic WAVE-0 harvest: "Recommended: Zod for validation"
Year 1: Multiple epics use Zod, 95% fitness
Year 2: Promote to project architecture: "Mandatory: All APIs use Zod"
Year 5: Promote to META: "AFP principle: Type-safe validation at boundaries"
```

**Evolution is data-driven, not opinion-based.**

---

## Via Negativa Analysis

**(Already covered in ECONOMY above, but restating explicitly)**

**High-level via negativa (META/PROJECT/EPIC):**
- PROJECT asks: "Can we DELETE an entire capability?" (e.g., drop microservices, go monolith)
- EPIC asks: "Can we DELETE an entire milestone?" (simplify scope)
- TASK GROUP asks: "Can we DELETE tasks by solving root cause once?" (refactor instead of patch 5 times)

**Each level applies via negativa at its scale.**

**Via negativa applied to hierarchy itself:**
- Task groups are **optional** (only create if valuable, not mandatory)
- Can skip levels if appropriate (standalone task = no group)
- If a level adds no value, DELETE it

**This design itself uses via negativa:**
- **Deleted:** Decision duplication (60-70% reduction)
- **Deleted:** Scattered docs (consolidated at META)
- **Deleted:** Unclear authority (explicit hierarchy)

---

## Refactor vs Repair Analysis

**Current system analysis:**
- **File count:** work_process/index.ts (400 LOC), critics/* (5 files)
- **Complexity:** Task-focused, no hierarchy
- **Age:** Established, working at task level

**Is current system >200 LOC?** Yes (~400 LOC)

**Should we REFACTOR?** YES

**Refactor approach:**
1. **Don't patch** task-level process to add hierarchy
2. **Redesign from scratch** with hierarchy as first principle
3. **Extract reusable pieces** (critics, evidence templates) and adapt to all levels
4. **New architecture:** Hierarchical, not flat

**Refactor scope:**
- Keep: Task-level process (working), evidence format, existing critics
- Refactor: Add hierarchy above, add hierarchical enforcement, add bidirectional flow
- Delete: N/A (not removing existing, adding above it)

**This is REFACTOR (rearchitect), not REPAIR (patch).**

---

## Alternatives Considered

### Alternative 1: Keep Single-Scale Process

**Approach:** Improve task-level process (better templates, faster critics)

**Pros:**
- Simpler (no new levels)
- Less disruption
- Faster to implement

**Cons:**
- Doesn't solve decision duplication
- No centralized architecture
- Evidence continues to proliferate
- No governance for process itself

**Rejected:** Doesn't address root cause

---

### Alternative 2: External Tool (Jira, Confluence)

**Approach:** Use PM tool for hierarchy, keep AFP process for tasks only

**Pros:**
- Don't build hierarchy ourselves
- Proven tools, nice UI

**Cons:**
- **LOCALITY violation:** Decisions far from code (in Jira, not git)
- **EVOLUTION impossible:** Can't track pattern fitness in Jira
- **VISIBILITY poor:** Have to leave IDE, lose context
- **COHERENCE broken:** Different systems for different levels

**Rejected:** Violates 3 of 5 AFP/SCAS forces

---

### Alternative 3: Two-Level Only (Project + Task)

**Approach:** Just PROJECT and TASK (skip meta, epic, group)

**Pros:**
- Simpler (fewer levels)
- Easier adoption

**Cons:**
- **No META governance:** Process itself has no structure
- **Epic integration unclear:** WAVE-0 already exists in roadmap, where does it go?
- **No clustering mechanism:** Can't extract shared patterns

**Rejected:** WAVE-0/1/2 already exist as epics, would need to remove them (worse)

---

### Selected Approach: 5-Level Hierarchy

**Why selected:**
- **Matches terrain:** Software decisions naturally hierarchical
- **Enables via negativa at scale:** Delete at higher level = more savings
- **Reuses proven pattern:** AFP at all levels (fractal)
- **Preserves existing work:** Task-level unchanged, epics already exist
- **Enables evolution:** Pattern fitness tracking at all levels

---

## Complexity Analysis

### Current Complexity

**Quantitative:**
- Files: 377 evidence files
- Storage: 11 MB
- Decision points: Every task debates everything
- Cyclomatic complexity: High (no reuse)

**Qualitative:**
- Architecture scattered
- No decision authority
- Pattern extraction manual
- Process governance unclear

**Developer experience:**
- GATE time: 2 hours per task
- Archeology: 30 min to find precedent
- Remediation: 13 cycles for module work

---

### Proposed Complexity

**Quantitative:**
- Files: ~180 (52% reduction)
  - 1 meta, 1 project, ~10 epics, ~20 groups, ~150 tasks
- Storage: <5 MB (55% reduction)
- Decision points: Centralized at appropriate level
- Cyclomatic complexity: Lower (reuse via hierarchy)

**Qualitative:**
- Architecture centralized (`state/project/plan/`)
- Decision authority explicit (5 levels)
- Pattern extraction automated (quarterly harvest)
- Process governance structured (`state/meta/`)

**Developer experience:**
- GATE time: 15-30 min per task (patterns pre-decided)
- Precedent lookup: <5 min (centralized)
- Remediation: Rare (patterns clear)

---

### Complexity Increase Justification

**Yes, adding 4 levels above tasks is complexity increase.**

**But:**
1. **Centralizes decisions** (removes duplication complexity)
2. **Explicit authority** (removes "who decides?" complexity)
3. **Automated flows** (removes manual pattern extraction complexity)
4. **Matches natural structure** (software is already hierarchical)

**Net complexity:** DECREASES (centralization > hierarchy overhead)

**Per-task complexity:** SIGNIFICANTLY DECREASES (follow patterns, don't re-debate)

**Trade-off accepted:** Small hierarchy overhead for large per-task simplification

---

## Implementation Plan Summary

**(Detailed plan in plan.md, summarized here for design review)**

### Phase 1: Structure (Week 1-2)
- Create `state/meta/`, `state/project/WEATHERVANE-2025/`, `state/task_groups/`
- Templates for all levels
- Documentation (hierarchical_overview.md)

### Phase 2: Critics (Week 3-4)
- HierarchyEnforcer (blocks violations)
- MetaCritic, VisionCritic, OutcomeCritic, ClusterCritic
- Tests (unit + integration)

### Phase 3: Automation (Week 5-6)
- Upward flow (pattern harvest)
- Downward context (pattern propagation)
- Pattern fitness tracking

### Phase 4: Migration (Week 6-7)
- WAVE-0 migrated to new structure
- Existing work organized
- Validate with real tasks

### Phase 5: Validation (Week 7-8)
- 10 tasks through new system
- Measure metrics (GATE time, evidence volume)
- Engineer feedback
- Iterate based on data

**Total:** 7-8 weeks, 10 micro-batched tasks (each ≤150 LOC)

---

## Risk Analysis & Mitigation

### Risk 1: Adoption Resistance (Medium probability, High impact)
**Mitigation:** Show quick wins, lead by example, optional initially

### Risk 2: Over-Engineering (Medium probability, Medium impact)
**Mitigation:** Start minimal (skip task groups initially), measure, iterate

### Risk 3: Constraint Conflicts (Low probability, High impact)
**Mitigation:** Clear escalation path, override mechanism, quarterly review

### Risk 4: Migration Effort (Medium probability, Medium impact)
**Mitigation:** Incremental migration, parallel work, automate drafts

### Risk 5: Bureaucracy Creep (High probability, Critical impact)
**Mitigation:** MetaCritic quarterly review, kill criteria, lightweight formats

**Rollback plan:** If overhead increases (not decreases), disable enforcement in <1 day

---

## Testing Strategy

### Unit Tests (Week 3-4)
- HierarchyEnforcer: Constraint violation detection
- Critics: MetaCritic, VisionCritic, OutcomeCritic, ClusterCritic
- Automation: Pattern harvest, context propagation
- Target: 80% code coverage

### Integration Tests (Week 5)
- Full hierarchy enforcement flow
- Context propagation chain
- Pattern promotion lifecycle
- Target: All critical paths

### Manual Tests (Week 6)
- WAVE-0 migration (real data)
- Constraint violation (synthetic)
- User acceptance (3 engineers)
- Target: >70% satisfaction

### Production Validation (Week 7-8)
- First 10 tasks through system
- Measure: GATE time, evidence volume, pattern reuse
- Target: 70% reduction in GATE time

---

## Success Criteria

### Week 4 (MVP)
- Structure exists, templates available
- HierarchyEnforcer working, blocks violations
- Basic enforcement functional

### Week 6 (Feature Complete)
- All critics implemented and tested
- Automation working (harvest, context)
- WAVE-0 migrated
- Documentation complete

### Week 8 (Validated)
- 10 tasks completed successfully
- GATE time <30 min (measured)
- Evidence volume <2MB growth/month
- Engineer feedback >70% positive

### Month 3 (Adoption)
- 50% of new tasks use hierarchy
- Pattern reuse >60%
- No rollback required

---

## Pattern & Commit Footer

**Pattern:** `hierarchical-process-fractal`
- AFP at all scales (META, PROJECT, EPIC, GROUP, TASK)
- Cognitive labor appropriate to impact
- Bidirectional flow (harvest up, context down)
- Enforcement through hierarchy

**Code leverage:** High (reuses AFP principles across all levels)

**Assurance:** Unit + integration + manual + production validation

**Commit footer:**
```
Pattern: hierarchical-process-fractal
Deleted: Decision duplication (60-70% evidence reduction)
Cognitive Leverage: 5 (META → PROJECT → EPIC → GROUP → TASK all use same framework)
```

---

## Reviewer Checklist

**For DesignReviewer critic:**

- [x] **Via negativa:** Deletes decision duplication, centralizes at higher levels
- [x] **Refactor not repair:** Redesigns process architecture (not patching)
- [x] **Alternatives:** Considered 3 alternatives, justified selection
- [x] **Complexity:** Justified increase (centralization > hierarchy overhead)
- [x] **AFP/SCAS 5 forces:** All forces satisfied (see above)
- [x] **Implementation plan:** Micro-batched, testable, measurable
- [x] **Risk analysis:** 5 risks identified with mitigation
- [x] **Pattern specified:** hierarchical-process-fractal with code leverage
- [x] **Cognitive labor:** Appropriate at all levels (META weeks, TASK minutes)

**Ready for GATE approval.**

---

**Design completed:** 2025-11-06
**Next phase:** Await GATE review (DesignReviewer)
**Then:** IMPLEMENT (10 micro-batched tasks)
