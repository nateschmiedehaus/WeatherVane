# THINK: AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM

**Task ID:** AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM-20251106
**Date:** 2025-11-06

---

## Revised Hierarchy (5 Levels, not 4)

**Insight from discussion:** Need META level above PROJECT for "work about work"

```
META (years-decades)          → How we think about work itself
  └─ PROJECT (1-3 years)      → Actual product/system work
       └─ EPIC (1-3 months)   → Major capabilities
            └─ TASK GROUP (1-2 weeks, optional) → Clustered work
                 └─ TASK (1-4 hours) → Individual changes
```

---

## Edge Cases

### Edge Case 1: Meta-Level Concerns

**What lives at META level?**

```
state/meta/
├── README.md                 # What is META level
│
├── strategy.md               # Phase 1: WHY do we have process?
│   ├── problem: "Software degrades without discipline"
│   ├── approach: "AFP/SCAS principles"
│   └── evolution: "Process improves based on outcomes"
│
├── spec.md                   # Phase 2: WHAT does good process achieve?
│   ├── outcomes: "Quality code, sustainable pace, self-improvement"
│   ├── metrics: "Defect rate, velocity, satisfaction"
│   └── anti-goals: "Not bureaucracy, not compliance theater"
│
├── plan.md                   # Phase 3: HOW is process structured?
│   ├── principles/
│   │   ├── afp_principles.md       # Economy, Coherence, Locality, Visibility, Evolution
│   │   ├── scas_patterns.md        # Via negativa, refactor not repair
│   │   └── hierarchy.md            # This document (meta about hierarchy!)
│   ├── enforcement/
│   │   ├── critics.md              # How critics work
│   │   ├── gates.md                # When to check quality
│   │   └── evidence.md             # What to document
│   └── evolution/
│       ├── pattern_fitness.md      # How patterns prove themselves
│       ├── deprecation.md          # How bad patterns die
│       └── improvement.md          # How process improves itself
│
├── think.md                  # Phase 4: WHAT could go wrong with process?
│   ├── bureaucracy_creep      # Process becomes goal, not means
│   ├── cargo_culting          # Following rules without understanding
│   ├── ossification           # Process stops evolving
│   └── mitigation            # How we prevent each
│
└── design.md                 # Phase 5: HOW do we validate process works?
    ├── metrics                # What we measure (defect rate, velocity, etc.)
    ├── evolution_policy       # How often we revisit (quarterly? annually?)
    └── kill_criteria          # When we abandon a process pattern
```

**Meta-level critics:**
- **ProcessCritic** (already exists!) validates individual tasks follow process
- **MetaCritic** (new) validates process itself is working
  - Checks: Is process delivering outcomes? Are patterns improving? Is evolution happening?
  - Runs: Quarterly, reviews metrics, triggers process improvements

**Key insight:** Current AFP/SCAS docs (AGENTS.md, CLAUDE.md, MANDATORY_WORK_CHECKLIST.md) should live at META level, not scattered.

---

### Edge Case 2: Cognitive Labor Varies by Level (but always present)

**Clarification from discussion:** Not "same format at every level" but "always do the thinking"

**Example: STRATEGY phase across levels**

**META level strategy.md:**
- **Depth:** 10+ pages, philosophical
- **Questions:** Why do we need process? What happens without it? How do we think about quality?
- **Time investment:** Weeks of debate, multiple stakeholders
- **Frequency:** Revisit annually, major updates every 3-5 years

**PROJECT level strategy.md:**
- **Depth:** 5-10 pages, business-focused
- **Questions:** Why this project? What stakeholder value? What market fit?
- **Time investment:** Days of research, leadership alignment
- **Frequency:** Revisit quarterly, major updates yearly

**EPIC level strategy.md:**
- **Depth:** 2-3 pages, capability-focused
- **Questions:** Why this epic now? What problem urgent? How fits project vision?
- **Time investment:** Hours of analysis, team discussion
- **Frequency:** Once at epic start, minor updates if scope changes

**TASK GROUP level strategy.md:**
- **Depth:** 0.5-1 page, clustering-focused
- **Questions:** Why group these tasks? What shared context? Worth clustering?
- **Time investment:** 30-60 minutes, lead engineer decision
- **Frequency:** Once at group creation

**TASK level strategy.md:**
- **Depth:** 0.5 page, problem-focused
- **Questions:** Why this change? What root cause? What goal?
- **Time investment:** 10-20 minutes, individual developer
- **Frequency:** Once per task

**Key principle:** Cognitive labor ALWAYS happens, but scales with impact. Meta decisions get weeks of thought, task decisions get minutes.

---

### Edge Case 3: Cross-Level Constraint Conflicts

**Scenario:** Project constraint conflicts with epic pattern, which level wins?

**Example:**
```
PROJECT constraint: "All new code TypeScript or Python"
EPIC pattern: "Use Rust for performance-critical paths" (approved in epic GATE)
TASK: "Implement performance-critical module"
```

**Resolution hierarchy (highest authority wins):**
1. **META** (if process principle violated) - e.g., "violates via negativa by adding language"
2. **PROJECT** (if architecture constraint violated) - e.g., "no Rust allowed"
3. **EPIC** (if epic-specific pattern violated)
4. **TASK GROUP** (if group pattern violated)
5. **TASK** (implementation details)

**In this example:**
- Epic pattern contradicts PROJECT constraint
- PROJECT wins (higher authority)
- **But:** Epic should have escalated during its own GATE
- **Fix:** Epic GATE missed this, must create remediation: AFP-WAVE0-ARCHITECTURE-ADD-RUST
- Block both epic pattern and task until architecture updated

**Lesson:** Epic GATE should check project constraints (hierarchy enforcer catches this)

---

### Edge Case 4: Orphaned Tasks (No Epic/Group)

**Scenario:** Small maintenance task doesn't fit any epic

**Options:**

1. **Create "Maintenance" pseudo-epic**
   - `state/epics/MAINTENANCE/`
   - Ongoing epic, never "done"
   - Collects small tasks

2. **Allow epic-less tasks with approval**
   - Tasks can specify `epic_id: null`
   - Requires Director Dana approval
   - Must justify why no epic (usually wrong)

3. **Force into nearest epic**
   - Everything belongs somewhere
   - If unclear, belongs in current wave (WAVE-0)

**Recommended:** Option 1 (Maintenance epic) - keeps hierarchy clean, admits reality of maintenance work

---

### Edge Case 5: Retroactive Evidence (Historical Work)

**Scenario:** WAVE-1 and WAVE-2 already done, how to create hierarchy retroactively?

**Options:**

1. **Full retroactive documentation**
   - Create strategy.md, spec.md, etc. from memory/git history
   - Pro: Complete history
   - Con: Time-consuming, may be inaccurate

2. **Minimal retroactive summary**
   - Create summary.md only (what was achieved, what learned)
   - Don't fabricate planning docs
   - Pro: Honest, quick
   - Con: Incomplete hierarchy

3. **No retroactive work**
   - Leave WAVE-1/2 as-is
   - Only apply hierarchy to WAVE-0 forward
   - Pro: No wasted effort
   - Con: Missing learnings

**Recommended:** Option 2 (minimal summary) - capture learnings for harvest, don't fake planning docs

**Implementation:**
```
state/epics/WAVE-1/
├── README.md                 # Existing
└── summary.md                # NEW: What we learned, patterns that emerged
    ├── successful_patterns   # Proof-driven development, critic-based quality
    ├── failed_patterns       # What didn't work
    └── harvest              # Extract for project-level patterns
```

---

### Edge Case 6: Empty Levels (Skipping Hierarchy)

**Scenario:** Can task skip task group level and go straight to epic?

**Answer:** YES - Task groups are **optional clustering**, not mandatory

**When to skip task group:**
- Task is standalone (no siblings)
- Task is one-off experiment
- Task doesn't share patterns with others

**When to create task group:**
- 3+ tasks share substantial context
- Tasks need coordination
- Shared pattern worth extracting

**Rule:** Never force hierarchy where it doesn't add value (via negativa applies to process too)

---

### Edge Case 7: Meta-Circular Process Evolution

**Challenge:** How do we improve the process using the process?

**Scenario:** We discover hierarchical enforcement is too rigid, needs improvement

**Resolution:**
1. **Create META-level task:** "AFP-META-RELAX-HIERARCHY-ENFORCEMENT"
2. **Follow META-level process:**
   - STRATEGIZE: Why is rigidity a problem? (meta analysis)
   - SPEC: What does better enforcement look like?
   - PLAN: How to update hierarchy_enforcer.ts and meta/plan/enforcement/
   - THINK: What could go wrong with relaxed enforcement?
   - DESIGN: (MetaCritic reviews) Does this align with AFP/SCAS?
3. **Update META level artifacts:** meta/plan/enforcement/gates.md
4. **Update PROJECT/EPIC/TASK-GROUP/TASK implementations:** Follow updated meta guidance

**Key insight:** Process improves itself by following itself (meta-circular)

**MetaCritic checks:**
- Are we measuring outcomes (defect rate, velocity)?
- Are patterns evolving (fitness scores changing)?
- Are we avoiding bureaucracy (evidence volume stable/decreasing)?
- Are engineers satisfied (surveys positive)?

**If MetaCritic fails:** Process is broken, needs META-level fix

---

## Failure Modes

### Failure Mode 1: Bureaucracy Creep at Higher Levels

**Description:** PROJECT/EPIC phases become compliance theater, not real thinking

**Symptoms:**
- Strategy docs copy-pasted boilerplate
- No actual debate in think.md
- Design.md just says "approved" with no analysis

**Root cause:** Hierarchy becomes goal, not means

**Prevention:**
- MetaCritic validates substance (not just format)
- Annual meta review: "Is process delivering value?"
- Kill criteria: If bureaucracy > value, simplify or remove

**Mitigation:**
- Lighter-weight templates at higher levels
- Allow narrative format (not just checklists)
- Focus on decisions made, not boxes checked

---

### Failure Mode 2: Constraint Ossification

**Description:** PROJECT constraints become unchangeable, block legitimate innovation

**Symptoms:**
- All new ideas require architecture escalation
- Engineers stop proposing improvements
- "That's not how we do things" becomes default answer

**Root cause:** No process for updating constraints

**Prevention:**
- Quarterly constraint review (are they still valid?)
- Fast-path for constraint updates (48-hour SLA)
- Measure: How many escalations succeed? (Should be >50%)

**Mitigation:**
- Override mechanism for experiments
- Sunset clause for constraints (expire after 1 year unless renewed)
- Escalation success rate tracked, triggers review if <30%

---

### Failure Mode 3: Orphaned Evidence (Process but No Outcomes)

**Description:** Perfect phase docs, no actual progress

**Symptoms:**
- All GATE phases pass
- Evidence looks great
- But no code shipped

**Root cause:** Process becomes goal, not means to quality code

**Prevention:**
- MetaCritic checks: "Was code actually shipped?"
- Measure cycle time: strategy → production
- Red flag if docs growing faster than code

**Mitigation:**
- Time-box phases (strategy = max 1 week, spec = max 3 days, etc.)
- "Evidence is lightweight" becomes principle
- Merge evidence docs into single file if they're short

---

### Failure Mode 4: Hierarchy Confusion (Who Decides?)

**Description:** Unclear which level decides what, decisions escalate unnecessarily

**Symptoms:**
- Task escalates to epic, epic escalates to project, project escalates to meta
- Decision paralysis
- Everything becomes "architectural decision"

**Root cause:** Decision boundaries unclear

**Prevention:**
- Document explicit decision boundaries:
  - META: Process principles only
  - PROJECT: Tech stack, architecture patterns, team structure
  - EPIC: Integration approach, shared patterns, capability scope
  - TASK GROUP: Concrete implementations, sequencing
  - TASK: File changes, code style, test approach
- Decision matrix in docs/processes/decision_boundaries.md

**Mitigation:**
- "Decide at lowest competent level" principle
- Escalation only when crossing level boundary
- Track escalations, identify frequent conflicts, clarify boundaries

---

### Failure Mode 5: Context Propagation Failure

**Description:** Downward flow breaks, tasks don't see higher-level decisions

**Symptoms:**
- Tasks re-debate patterns already decided at epic level
- GATE time doesn't decrease (no efficiency gain)
- Evidence duplication continues

**Root cause:** Automation broken or context reading skipped

**Prevention:**
- Automated context assembly (downward_context.ts)
- Critics check: "Did task reference higher-level patterns?"
- RED FLAG: Task design.md debates via negativa when epic already decided

**Mitigation:**
- Make context reading mandatory (pre-commit check)
- Template includes: "Higher-level patterns followed: [list]"
- Show context in task README automatically

---

### Failure Mode 6: Pattern Promotion Stagnation

**Description:** Upward flow breaks, good patterns stay buried at task level

**Symptoms:**
- Same patterns re-implemented in 10 tasks
- Project patterns never updated
- No learning from completed work

**Root cause:** Harvest automation never runs or ignored

**Prevention:**
- Quarterly harvest MANDATORY (scheduled, tracked)
- MetaCritic checks: "Did last quarter add patterns to project level?"
- Pattern fitness scores visible in dashboards

**Mitigation:**
- Manual harvest initially (automated later)
- Reward pattern promotion (gamify?)
- Make harvest visible to leadership

---

## Complexity Analysis

### Current System Complexity

```
Scattered decisions:
- 377 task files (11MB)
- Architecture decisions in 50+ files
- No clear decision authority
- Duplication everywhere

Cognitive load per task:
- 2 hours GATE (debate everything)
- 13 remediation cycles (conflicting guidance)
- Archeology to find precedents
```

**Cyclomatic complexity:** High (every decision point is task-local)

### Proposed System Complexity

```
Centralized decisions:
- META: 1 directory (principles)
- PROJECT: 1 directory (architecture)
- EPIC: N directories (N epics)
- TASK GROUP: M directories (M groups, optional)
- TASK: K directories (K tasks, lightweight)

Cognitive load per task:
- 15-30 min GATE (follow patterns)
- Rare remediation (patterns clear)
- Quick precedent lookup (centralized)
```

**Cyclomatic complexity:** Lower (decisions at appropriate level, not repeated)

**Trade-off:**
- Adds 4 levels of hierarchy (complexity up)
- But removes decision duplication (complexity down)
- Net: Complexity DECREASES (centralization wins)

**Justification:**
- COHERENCE: Decisions at right level
- ECONOMY: Via negativa at higher levels eliminates more
- LOCALITY: Related decisions near (architecture in project/, not scattered)
- VISIBILITY: Clear authority (who decides what)
- EVOLUTION: Pattern fitness enables improvement

---

## Complexity Mitigation

### Strategy 1: Keep Task Level Unchanged

**Don't disrupt:** Task-level process works, just add hierarchy above

### Strategy 2: Make Task Groups Optional

**Only cluster when valuable:** Don't force grouping

### Strategy 3: Lightweight Higher Levels

**Not heavyweight:** PROJECT/EPIC phase docs can be narrative, not checklist

### Strategy 4: Automate What's Automatable

**Tools help:**
- Automated context assembly (downward_context.ts)
- Automated harvest (upward_flow.ts)
- Automated constraint checking (hierarchy_enforcer.ts)

### Strategy 5: Progressive Adoption

**Rollout:**
1. Week 1-2: Structure only (no enforcement)
2. Week 3-4: Enforcement on new work only
3. Week 5+: Full enforcement, measure outcomes

**Escape valve:** If overhead increases, simplify immediately

---

## Alternative Approaches Revisited

### Alternative 1: Flat Process (No Hierarchy)

**Approach:** Keep task-only process, improve templates/automation

**Pros:**
- Simpler (fewer levels)
- Less disruption
- Faster to implement

**Cons:**
- Doesn't solve decision duplication
- No centralized architecture
- No pattern propagation
- Evidence continues to proliferate

**Rejected:** Doesn't address root cause (single-scale process for multi-scale work)

---

### Alternative 2: Two-Level Hierarchy (Project + Task)

**Approach:** Just PROJECT and TASK (skip epic, task group)

**Pros:**
- Simpler than 5 levels
- Still centralizes architecture
- Reduces duplication

**Cons:**
- Epic-level integration unclear (where does it go?)
- No clustering mechanism (task groups)
- May not scale to many tasks

**Consideration:** Start here, add levels if needed?

**Decision:** No - WAVE-0 already has epic structure (WAVE-0), would be awkward to remove

---

### Alternative 3: External Tool (Jira, Linear, etc.)

**Approach:** Use project management tool for hierarchy

**Pros:**
- Don't build it ourselves
- Proven tools
- Nice UI

**Cons:**
- LOCALITY violated (decisions far from code)
- Not in git (no version control)
- Proprietary platform (lock-in)
- Can't customize (AFP/SCAS-specific needs)

**Rejected:** Violates AFP/SCAS principles (especially LOCALITY)

---

## Testing Strategy (Detailed)

### Unit Tests (Tools)

```typescript
// tools/wvo_mcp/src/critics/__tests__/hierarchy_enforcer.test.ts
// 400 lines, see plan.md for details

// tools/harvest/__tests__/upward_flow.test.ts
describe('Pattern Harvesting', () => {
  it('extracts patterns from completed task group', async () => {
    // Given: Task group with 5 completed tasks
    // When: Run harvest
    // Then: Pattern extracted, fitness scored
  });

  it('promotes high-fitness pattern to epic level', async () => {
    // Given: Pattern used successfully in 5+ tasks
    // When: Fitness > 80%
    // Then: Pattern added to epic/harvest.md
  });

  it('ignores low-fitness pattern', async () => {
    // Given: Pattern used in 2 tasks, failed in 3
    // When: Fitness < 50%
    // Then: Pattern not promoted
  });
});

// tools/context/__tests__/downward_context.test.ts
describe('Context Propagation', () => {
  it('assembles full context chain for task', async () => {
    // Given: Meta → Project → Epic → Group → Task
    // When: Task reads context
    // Then: Sees all levels (patterns, constraints, etc.)
  });

  it('caches context for performance', async () => {
    // Given: Same epic patterns used by 10 tasks
    // When: Read 10 times
    // Then: Only parse once, cache rest
  });
});
```

### Integration Tests (Full Flow)

```typescript
// tests/integration/hierarchy_flow.test.ts
describe('Hierarchical Process End-to-End', () => {
  it('enforces project constraint at task level', async () => {
    // 1. Create project with constraint: "TypeScript only"
    // 2. Create epic (inherits constraint)
    // 3. Create task proposing Python
    // 4. Run task GATE
    // 5. Expect: BLOCKED with remediation options
    // 6. Create remediation task to update project
    // 7. Update project: "TypeScript or Python"
    // 8. Re-run original task GATE
    // 9. Expect: APPROVED
  });

  it('propagates patterns from project to task', async () => {
    // 1. Set project pattern: "Use Zod for validation"
    // 2. Create epic design (references pattern)
    // 3. Create task implementing new API endpoint
    // 4. Task reads context
    // 5. Expect: Task sees Zod pattern, doesn't re-debate
    // 6. Task GATE validates Zod used
  });

  it('harvests pattern from tasks to epic', async () => {
    // 1. Create task group: "API endpoints"
    // 2. Complete 5 tasks, all use pattern: "REST + Zod + OpenAPI"
    // 3. Run quarterly harvest
    // 4. Expect: Pattern extracted, fitness = 100%
    // 5. Pattern promoted to epic/harvest.md
    // 6. Next quarter: Pattern promoted to project/plan/patterns.md
  });
});
```

### Manual Tests (User Acceptance)

See plan.md for manual test plan

---

## Monitoring & Success Metrics

### Quantitative Metrics (Automated)

```yaml
metrics:
  task_gate_time:
    baseline: 120 minutes
    target: 30 minutes
    measurement: Time from GATE start to approval
    frequency: Per task

  evidence_volume:
    baseline: 11 MB (377 files)
    target: <2 MB growth/month
    measurement: du -sh state/evidence
    frequency: Weekly

  pattern_reuse:
    baseline: 0% (no mechanism)
    target: >60% of tasks reference higher-level patterns
    measurement: grep "Following epic pattern" state/evidence/*/design.md
    frequency: Monthly

  escalation_rate:
    baseline: Unknown
    target: <10% of tasks require escalation
    measurement: Count AFP-*-REMEDIATION-* tasks
    frequency: Monthly

  constraint_conflicts:
    baseline: Unknown
    target: <5 per quarter
    measurement: Log from hierarchy_enforcer.ts
    frequency: Quarterly
```

### Qualitative Metrics (Survey)

```yaml
surveys:
  engineer_satisfaction:
    questions:
      - "Hierarchy helps me find architecture decisions (1-5)"
      - "GATE time is reasonable (1-5)"
      - "Process enables quality without bureaucracy (1-5)"
      - "I understand decision authority (who decides what) (1-5)"
    frequency: Monthly
    target: >3.5 average across all questions
```

### MetaCritic Checks (Quarterly)

```yaml
meta_review:
  checks:
    - Are quantitative metrics improving? (gate time down, etc.)
    - Are qualitative metrics positive? (survey >3.5)
    - Are patterns evolving? (fitness scores changing)
    - Is evidence volume stable? (not growing unbounded)

  if_failing:
    - Trigger meta-level improvement task
    - Review process in meta/think.md (what's wrong?)
    - Update enforcement rules
    - Possibly simplify hierarchy
```

---

## Think Complete

**Edge cases identified:** 7 major cases
**Failure modes analyzed:** 6 modes with mitigation
**Complexity:** Justified (centralization decreases task-level complexity)
**Alternatives:** Reconsidered, hierarchy still best
**Testing:** Unit + integration + manual strategies defined
**Monitoring:** Metrics and reviews specified

**Next phase:** DESIGN (create design.md for GATE review)

---

**Think completed:** 2025-11-06
**Complexity increase justified:** Yes (centralizes decisions, reduces duplication)
**Failure modes mitigated:** Yes (prevention + mitigation for each)
**Next phase:** DESIGN (GATE checkpoint)
