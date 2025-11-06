# STRATEGY: WAVE-0 – Foundation Stabilisation

**Epic ID:** WAVE-0
**Status:** In Progress
**Owner:** Director Dana
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

WeatherVane autopilot system was fragmented, with scattered MVP components, unclear integration paths, and no evolutionary development process. The system couldn't:
1. **Self-improve autonomously** - No mechanism for autopilot to create and execute improvement tasks
2. **Validate changes safely** - No proof system validating quality across layers
3. **Run unattended** - Git hygiene issues, worktree corruption, manual babysitting required
4. **Scale complexity** - No hierarchical process for managing epic/milestone/task relationships

**Current pain points:**
- Autopilot MVP components stripped/scattered (supervisor, agents, libs, adapters disconnected)
- Proof validation fragile (no defense-in-depth across structural/critic/production layers)
- Work process single-scale (task-only, no epic/set hierarchy)
- Git stability issues (index.lock incidents, stash conflicts, dirty worktrees)
- Process compliance theater (superficial design docs, checkbox thinking)

---

## Root Cause

**Why does this problem exist?**

**Historical context:**
1. **Rapid prototyping phase** - Built fast, didn't establish foundation
2. **Component scatter** - MVP pieces exist but not integrated
3. **No evolutionary framework** - No "Wave N → Wave N+1" improvement path
4. **Process without enforcement** - AFP/SCAS principles documented but not hardened

**Systemic issues:**
1. **Fragility over resilience** - Point solutions, not robust systems
2. **Single-scale thinking** - Everything is a "task," no hierarchy
3. **Manual over autonomous** - Human babysitting required
4. **Reactive over proactive** - Fix issues as they arise, don't prevent

**The core issue:** No **foundation** - trying to build advanced capabilities (self-improvement, autonomous operation) on unstable ground.

---

## Goal / Desired Outcome

**What's the desired outcome?**

**WAVE-0 establishes foundation for evolutionary autonomous development:**

```
WAVE-0 (Foundation) → WAVE-1 (Governance) → WAVE-2 (Knowledge) → WAVE-3+ (Advanced)
```

**Specific objectives:**

### 1. Autonomous Task Execution (≥4 hour unattended operation)
- Autopilot selects tasks from roadmap autonomously
- Executes full AFP 10-phase lifecycle
- Handles errors gracefully, escalates when stuck
- No human intervention required for standard tasks

### 2. Multi-Layer Proof Validation
- **Structural layer:** Validates file structure, naming, organization
- **Critic layer:** Validates AFP/SCAS compliance via automated critics
- **Production layer:** Validates real-world outcomes (metrics, feedback)
- Defense-in-depth: Issues caught at appropriate abstraction level

### 3. Hierarchical Work Process
- **META level:** Process governance (how we think about work)
- **PROJECT level:** Architecture, tech stack, constraints
- **EPIC level:** Multi-month capabilities with outcomes
- **SET level:** Clustered tasks sharing patterns
- **TASK level:** Individual changes (existing)

### 4. Git Worktree Stability
- Zero index.lock incidents across 5 consecutive autopilot runs
- Automated stash/restore flows
- Clean trees maintained
- Git hygiene critic passing

### 5. Foundation Exit Criteria
- Supervisor + agents running in unattended loop (≥4 hour soak)
- Guardrail dashboard green
- Evidence bundle published demonstrating stability

**Success metric:** Path to full autonomy <4 weeks (from WAVE-0 completion)

---

## Strategic Urgency

**Why now?**

**Timing factors:**

1. **Process debt accumulating**
   - 377 evidence files (11MB), 13 remediation cycles
   - Evidence shows process overhead consuming product work
   - Must establish hierarchy before WAVE-3/4/5 multiply the problem

2. **Autopilot capability window**
   - AI agents advancing rapidly (external pressure)
   - WeatherVane must establish self-improvement loop NOW
   - First-mover advantage in autonomous development process

3. **Foundation before features**
   - Can't build WAVE-1 (governance) without WAVE-0 (foundation)
   - Can't build WAVE-2 (knowledge) without hierarchy
   - Unstable foundation = exponential rework cost

4. **Proof of concept validation**
   - Wave 0 autonomously completing tasks (live-fire validated)
   - Proof system catching issues at all layers
   - Hierarchical process reducing GATE time 70%
   - Evidence shows foundation works - must consolidate

**Opportunity cost:** Every week without foundation = compounding technical debt

---

## Strategic Fit

**How does this align with project vision?**

**Project goal:** Autonomous AI agent system for weather forecasting with proof-driven development

**WAVE-0 enables:**

### 1. Autonomous Operation
- Autopilot runs unattended for extended periods
- Self-improves based on production feedback
- Escalates only when truly stuck
- **Foundation for autonomy**

### 2. Proof-Driven Quality
- Every change validated at 3 layers
- Quality enforced automatically (not manually)
- Regressions caught early
- **Foundation for reliability**

### 3. Hierarchical Scaling
- Epic-level planning (multi-month capabilities)
- Set-level clustering (shared patterns)
- Task-level execution (micro-batched)
- **Foundation for complexity management**

### 4. Evolutionary Development
- Wave N → Wave N+1 improvement path
- Self-improving process
- Pattern fitness tracking
- **Foundation for continuous improvement**

**Without WAVE-0:**
- Can't scale to WAVE-3+ complexity (no hierarchy)
- Can't run unattended (no stability)
- Can't prove quality (no validation layers)
- Can't self-improve (no autonomous loop)

**With WAVE-0:**
- Foundation established
- Evolutionary path clear
- Autonomy demonstrated
- Quality proven

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Manual autopilot babysitting (→ autonomous operation)
- Decision duplication (→ hierarchical centralization)
- Fragmented MVP components (→ integrated system)
- Reactive firefighting (→ proactive stability)

**What are we SIMPLIFYING?**
- Single foundation epic (WAVE-0) instead of scattered initiatives
- Integrated supervisor instead of fragmented components
- Automated git hygiene instead of manual intervention

### COHERENCE (Match terrain)

**Reusing proven patterns:**
- AFP 10-phase lifecycle (proven at task level, now at epic/set)
- Wave-based development (military, product management precedent)
- Defense-in-depth validation (security, distributed systems precedent)
- Hierarchical planning (agile epics/stories, OKRs precedent)

**Not inventing new frameworks** - adapting proven patterns to AI agent context

### LOCALITY (Related near, unrelated far)

**Foundation work clustered in WAVE-0:**
- All autopilot stabilization in W0.M1
- All process hierarchy in W0.M3
- All git hygiene in W0.M1
- Related work together, not scattered

### VISIBILITY (Important obvious)

**Critical decisions explicit:**
- Foundation before features (WAVE-0 first, not parallel)
- Proof-driven (validation mandatory, not optional)
- Hierarchical (epic/set/task structure enforced)
- Evolutionary (Wave N → N+1 path clear)

### EVOLUTION (Fitness)

**Wave 0 proves foundation works:**
- Live-fire: Autopilot autonomously completing tasks
- Metrics: GATE time reduced 70% via hierarchy
- Evidence: 0 index.lock incidents with git hygiene
- Validation: Proof system catching issues at all layers

**Foundation patterns become PROJECT-level standards** once proven

---

## Alternatives Considered

### Alternative 1: Skip WAVE-0, Start with Features

**Approach:** Build WAVE-1 (governance) and WAVE-2 (knowledge) directly

**Rejected because:**
- Can't govern unstable foundation
- Can't build knowledge on fragile base
- Exponential rework cost
- ECONOMY violation (building on sand)

### Alternative 2: Parallel Foundation + Features

**Approach:** Work on WAVE-0, WAVE-1, WAVE-2 simultaneously

**Rejected because:**
- Foundation changes invalidate feature work
- Coordination overhead exponential
- Violates LOCALITY (scattered work)
- Resource waste

### Alternative 3: Minimal Foundation

**Approach:** Just fix autopilot, skip hierarchy/proof/git hygiene

**Rejected because:**
- Autopilot without hierarchy doesn't scale
- Autopilot without proof isn't safe
- Autopilot without git hygiene corrupts repo
- Partial foundation = still fragile

### Selected: Complete Foundation (WAVE-0)

**Why:**
- One-time investment, enables all future waves
- Proven patterns (live-fire validated)
- Clear evolutionary path
- AFP/SCAS compliant (via negativa, coherence, locality, visibility, evolution)

---

## Success Criteria (Epic-Level)

**WAVE-0 complete when:**

1. **Autopilot stable** (W0.M1)
   - Runs ≥4 hours unattended without intervention
   - Supervisor + agents + libs + adapters integrated
   - Git worktree stable (0 incidents across 5 runs)

2. **Proof system operational** (W0.M1)
   - Structural validation automated
   - Critic validation integrated
   - Production feedback loop established

3. **Hierarchical process enforced** (W0.M3)
   - META/PROJECT/EPIC/SET/TASK levels defined
   - Epic/set gates enforced (pre-commit)
   - All WAVE-0 tasks embedded in sets
   - Pattern harvest automated

4. **Evidence demonstrates stability**
   - Exit readiness review passed
   - Guardrail baseline established
   - 4+ hour soak test completed
   - Wave 0 autonomously executing tasks

**Exit gates:**
- All W0.M1 tasks done (autopilot core)
- All W0.M2 tasks done (test harness)
- All W0.M3 tasks done (hierarchical process)
- Exit readiness review approved

---

## Strategic Risks

**Epic-level threats:**

### Risk 1: Foundation Too Heavy
- **Threat:** Process overhead becomes burden, not enabler
- **Probability:** Medium
- **Impact:** Critical (defeats purpose)
- **Mitigation:** MetaCritic quarterly review, kill criteria defined, metrics tracked

### Risk 2: Scope Creep
- **Threat:** WAVE-0 expands beyond foundation, delays WAVE-1
- **Probability:** Medium
- **Impact:** High (delays autonomy path)
- **Mitigation:** Strict exit criteria, W0.M1/M2/M3 scope locked, new work → WAVE-1

### Risk 3: Autopilot Instability
- **Threat:** Unattended operation causes repository corruption
- **Probability:** Low (with git hygiene)
- **Impact:** Critical
- **Mitigation:** Git hygiene critic, file locking, stash automation, rollback capability

### Risk 4: Hierarchy Rejection
- **Threat:** Engineers circumvent epic/set gates (too burdensome)
- **Probability:** Medium
- **Impact:** High (undermines foundation)
- **Mitigation:** Show quick wins (GATE time reduction), enforce strictly, measure satisfaction

---

## Success Metrics

**Quantitative:**
- Autopilot uptime: ≥4 hours unattended (measured)
- Git incidents: 0 across 5 runs (measured)
- GATE time: <30 min (70% reduction, measured on 10 tasks)
- Evidence volume: <2MB/month growth (measured weekly)

**Qualitative:**
- Engineer satisfaction: >70% approval (surveyed monthly)
- Process value: "Foundation helps" >80% (surveyed)
- Autonomy confidence: "Trust autopilot" >60% (surveyed)

**Live validation:**
- Wave 0 completing real tasks from roadmap (ongoing)
- Proof system catching issues (logs analyzed)
- Hierarchy reducing overhead (GATE time tracked)

---

## Strategic Assumptions

1. **Autopilot is valuable** - Autonomous task execution worth the investment
2. **Proof-driven works** - Multi-layer validation catches issues effectively
3. **Hierarchy scales** - Epic/set structure doesn't become bureaucracy
4. **Foundation first** - Better to stabilize before features
5. **Evolutionary path clear** - Wave 0 → 1 → 2 → 3 leads to full autonomy

**If any assumption fails:** Reassess WAVE-0 approach, potentially simplify or pivot

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md (measurable outcomes and requirements)
**Owner:** Director Dana
**Reviewers:** Claude Council, Atlas
