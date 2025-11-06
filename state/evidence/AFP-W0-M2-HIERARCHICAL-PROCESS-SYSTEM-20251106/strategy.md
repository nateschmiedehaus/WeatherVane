# STRATEGIZE: AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM

**Task ID:** AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM-20251106
**Type:** Milestone (WAVE-0.M2)
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

Current work process has single-scale approach: all work (whether changing 1 line or re-architecting entire system) goes through same 10-phase lifecycle with same evidence requirements. This creates:

1. **Process weight mismatch:** Project-level decisions (tech stack, architecture) have same evidence burden as task-level decisions (fix typo)
2. **Context fragmentation:** Architecture decisions scattered across 100+ task evidence files instead of centralized
3. **Decision re-litigation:** Every task re-debates patterns that should be decided once at higher level
4. **No harvesting mechanism:** Learnings from tasks don't propagate to epic/project level
5. **Unclear decision authority:** Who decides what, at what level?

**Current state:**
- 377 evidence files (11MB) in `state/evidence/`
- 13 remediation cycles for module work
- Process overhead consuming product work
- No clear hierarchy: task → ??? → project

---

## Root Cause

**Why does this problem exist?**

The 10-phase AFP process was designed for **task-level** work (≤5 files, ≤150 LOC) but we're using it for ALL scales of work:
- Tasks (1-4 hours)
- Milestones (weeks)
- Epics (months)
- Project (years)

**No process hierarchy = one-size-fits-all = poor fit everywhere.**

Missing:
1. **Project-level process:** Vision, mission, architecture, governance (annually)
2. **Epic-level process:** Outcomes, milestones, integration (quarterly)
3. **Task group-level process:** Clustering, patterns, batch testing (weekly)
4. **Upward flow:** Task learnings → Epic patterns → Project architecture
5. **Downward flow:** Project patterns → Epic design → Task implementation

---

## Goal / Desired Outcome

**What's the desired outcome?**

**Create 5-level hierarchical work process system (including META level for process itself):**

```
META (years-decades)          → Work about work (AFP/SCAS principles, process evolution)
  └─ PROJECT (1-3 years)      → Actual product/system work
       └─ EPIC (1-3 months)   → Major capabilities
            └─ TASK GROUP (1-2 weeks, optional) → Clustered work
                 └─ TASK (1-4 hours) → Individual changes
```

**Key insight:** Current AFP/SCAS documentation (AGENTS.md, CLAUDE.md, principles) lives scattered. Should live at META level - governance for "how we think about work."

**Each level has:**
1. **Cognitive labor phases:** All levels do strategy/spec/plan/think/design (depth varies by impact)
   - META: Weeks of philosophical debate (why process exists)
   - PROJECT: Days of research (why this product)
   - EPIC: Hours of analysis (why this capability now)
   - TASK GROUP: 30-60 min (why cluster these tasks)
   - TASK: 10-20 min (why this change)

2. **Right evidence:**
   - META: AFP principles, SCAS patterns, process evolution rules
   - PROJECT: Architecture, tech stack, constraints, governance
   - EPIC: Outcomes, integration approach, shared patterns
   - TASK GROUP: Clustering rationale, shared pattern, reflection
   - TASK: Problem analysis, design validation (existing)

3. **Hierarchical critics:**
   - MetaCritic: Validates process itself is working (quarterly review)
   - VisionCritic: Validates project vision (annual)
   - OutcomeCritic: Validates epic outcomes (per epic)
   - ClusterCritic: Validates task grouping (per group)
   - DesignReviewer: Validates task design (per task, existing)

4. **Bidirectional flow:**
   - Upward: Task learnings → Group → Epic → Project → META (quarterly harvest)
   - Downward: META principles → Project patterns → Epic design → Group pattern → Task (context propagation)

5. **Hierarchical enforcement:**
   - Tasks violating higher-level constraints are BLOCKED
   - Must resolve via remediation task (update constraint OR change approach)
   - Authority flows downward: META > PROJECT > EPIC > GROUP > TASK

**Success metrics:**
- Task GATE time: 2 hours → 15 minutes (patterns decided at higher level)
- Architecture decisions: Scattered across 377 files → Centralized in `state/project/architecture.md`
- Pattern propagation: Manual → Automated (quarterly harvest cycle)
- Decision authority: Unclear → Explicit (documented per level)

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)
- **Deletes at higher levels eliminate more work:** Deleting at project level eliminates epics, at epic level eliminates milestones
- **Reduces decision re-litigation:** Patterns decided once at epic level, not re-debated in 20 tasks
- **Minimal evidence at low levels:** Task that follows epic pattern needs less GATE evidence

### COHERENCE (Match terrain)
- **Process weight matches impact:** Small decisions (tasks) = light process, big decisions (project) = heavy process
- **Patterns flow downward:** Project establishes patterns, epics select, task groups specialize, tasks implement
- **Learnings flow upward:** Successful task patterns promoted to group/epic/project

### LOCALITY (Related near, unrelated far)
- **All project decisions in one place:** `state/project/architecture.md` not scattered
- **All epic decisions in epic directory:** `state/epics/WAVE-0/outcomes.md` not scattered
- **Task groups cluster related work:** Shared context in one place

### VISIBILITY (Important obvious)
- **Project-level patterns immediately visible:** Not buried in task evidence
- **Epic-level outcomes clear:** Measurable, documented in outcomes.md
- **Decision authority explicit:** Each level documents who decides what

### EVOLUTION (Fitness)
- **Pattern promotion:** Proven at task → promoted to group → epic → project
- **Pattern deprecation:** Low fitness patterns automatically deprecated
- **Natural selection:** Good ideas rise, bad ideas die

---

## Why Now?

**Urgency factors:**

1. **Evidence proliferation:** 377 files growing, 11MB and counting
2. **Remediation spiral:** 13 cycles for module work indicates systemic issue
3. **Process overhead consuming product work:** Recent commits mostly process enforcement
4. **WAVE-0 needs structure:** Currently 30+ tasks with no grouping/shared patterns
5. **Foundation timing:** Better to fix process foundation now before WAVE-3/4/5 multiply the problem

**Opportunity:**
- WAVE-0 in progress (can migrate immediately)
- WAVE-1/2 done (can analyze retrospectively for patterns)
- Clean slate for WAVE-3+ (will follow new hierarchy from start)

---

## Strategic Fit

**How does this align with project vision?**

**Project goal:** Autonomous AI agent system with proof-driven development

**This milestone enables:**
1. **Autonomy at scale:** Agents can make decisions at appropriate level (not everything escalates)
2. **Proof at all levels:** Project-level governance, epic-level integration tests, task-group batch tests
3. **Self-improvement:** Pattern harvesting enables system to learn what works
4. **Reduced meta-work:** Less time on process, more on product

**Without this:**
- Process continues to consume product work
- Evidence accumulation unsustainable
- Decision authority unclear (blocks autonomy)
- No learning mechanism (defeats self-improvement)

---

## Success Criteria Preview

**How will we know this worked?**

**Quantitative:**
- Task GATE time: <30 min (85% reduction from 2 hours)
- Evidence growth: <2MB/month (80% reduction)
- Decision re-litigation: <10% of tasks re-debate patterns
- Pattern propagation: 100% automated (quarterly harvest)

**Qualitative:**
- Architecture decisions findable in <5 min (not archeology)
- New engineers understand strategy in <1 hour (read project/vision.md)
- Autonomous agents know decision authority (documented per level)

**Validation:**
- WAVE-0 successfully migrated to new structure
- WAVE-3 tasks reference epic patterns (not re-debating)
- Quarterly harvest extracts 5-10 patterns from completed work

---

## Alternatives Considered

**1. Keep current single-scale process**
- Rejected: Evidence shows unsustainable (remediation spiral, overhead)

**2. Only add project/epic levels (skip task groups)**
- Rejected: Misses clustering opportunity (5-10 related tasks share patterns)

**3. Make process optional/lightweight across all levels**
- Rejected: We want process compliance; hierarchy makes it sustainable

**4. External tool instead of in-repo structure**
- Rejected: LOCALITY principle says decisions near affected code

---

## Phase 2 Preview: SPEC

**Next phase will define:**
- Exact evidence requirements per level
- Phase definitions for project/epic/task-group
- Critic specifications
- Harvest/context flow mechanisms
- Migration plan for existing work

---

**Strategize completed:** 2025-11-06
**Next phase:** SPEC (define exact requirements)
**Owner:** Claude Council
**Reviewers:** Atlas, Director Dana
