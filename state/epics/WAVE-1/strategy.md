# STRATEGY: WAVE-1 – Governance & AFP Enforcement

**Epic ID:** WAVE-1
**Status:** Pending
**Owner:** Director Dana
**Date:** 2025-11-06
**Dependencies:** WAVE-0 complete (foundation established)

---

## Problem Analysis

**What problem are we solving?**

With WAVE-0 foundation established (autonomous task execution, multi-layer proof validation, hierarchical process, git stability), the critical next gap is **process compliance enforcement**.

Current pain points:
1. **Manual compliance checking** - Humans must verify phase docs exist, AFP/SCAS principles followed
2. **Inconsistent quality** - Some work has deep analysis, others are superficial checkbox exercises
3. **No automated gates** - Can commit work without proper GATE phase, skip phases entirely
4. **Roadmap chaos** - Tasks added ad-hoc without validation of structure or dependencies
5. **No accountability** - If bad work merges, no clear audit trail or remediation path

**Root cause:** WAVE-0 established WHAT (process exists) but not HOW (process enforced automatically)

---

## Root Cause

**Why does enforcement gap exist?**

**Historical factors:**
1. **Process-first approach** - Built AFP 10-phase lifecycle (WAVE-0) before enforcement
2. **Critics built but not integrated** - DesignReviewer, StrategyReviewer exist but don't block merges
3. **Roadmap unstructured** - YAML file exists but has no schema validation or dependency checking
4. **Trust-based model** - Assumed engineers would follow process voluntarily

**Systemic issues:**
1. **Optional compliance = ignored compliance** - Without enforcement, process becomes suggestions
2. **Human review doesn't scale** - Manual quality checks become bottleneck
3. **No feedback loop** - If process failures aren't caught, can't learn from them
4. **Autonomous agents need guardrails** - Wave 0 autopilot has no constraints without enforcement

**The core issue:** **Foundation without governance = process compliance theater**

---

## Goal / Desired Outcome

**WAVE-1 makes AFP/SCAS compliance mandatory through automated enforcement:**

```
WAVE-0 (Foundation)  → Process exists, critics exist, hierarchy defined
   ↓
WAVE-1 (Governance)  → Process enforced automatically, critics block, structure validated
   ↓
Result: Cannot merge work that violates AFP/SCAS principles
```

**Specific objectives:**

### 1. Automated Quality Gates (W1.M1)
- **DesignReviewer blocks commits** if design.md missing or has AFP/SCAS concerns (score <7/9)
- **StrategyReviewer blocks** if strategy.md lacks via negativa analysis or alternatives
- **ThinkingCritic blocks** if think.md missing edge cases or failure modes
- **ProcessCritic blocks** if phases skipped, out of sequence, or test plan missing

### 2. Roadmap Gating & Structure Validation (W1.M1)
- **Schema validation** enforces epic/milestone/task/set structure
- **Embedding validation** ensures all tasks in sets, all sets in epics (no orphans)
- **Dependency validation** prevents starting tasks with incomplete blockers
- **Exit criteria gates** prevent proceeding to WAVE-N+1 until WAVE-N fully exits

### 3. Work Ledger & Audit Trail (W1.M1)
- **Complete tracking** of all work in roadmap.yaml + evidence bundles
- **Evidence validation** ensures strategy/spec/plan/think/design present for all tasks
- **Tamper detection** catches unauthorized modifications
- **Queryable history** enables learning from past decisions

### 4. Remediation Loop (W1.M1)
- **Automatic task creation** when critic blocks work
- **Remediation tracking** in analytics (how often blocked? what issues?)
- **Pattern identification** from remediations (recurring problems?)
- **Process evolution** based on learned patterns

### 5. Baseline Guardrails (W1.M1)
- **AFP/SCAS guardrail catalog** defining all enforcement rules
- **Automated evaluation** of guardrail health
- **Guardrail documentation** explaining rationale for each rule
- **Kill criteria** for guardrails that become burdensome

**Success metric:** 95%+ first-pass compliance, <5% override usage, zero undetected quality issues

---

## Strategic Urgency

**Why governance now (after WAVE-0)?**

**Timing factors:**

1. **Foundation complete**
   - WAVE-0 established process, critics, hierarchy (can't enforce what doesn't exist)
   - Now ready to automate enforcement

2. **Process debt accumulating**
   - Early WAVE-0 work shows quality variance (some excellent, some superficial)
   - Manual review can't keep up with volume
   - Need automation before scaling to WAVE-2+

3. **Autonomous operation requires guardrails**
   - Wave 0 autopilot currently unconstrained (can do anything)
   - Without governance, autonomous agents produce unchecked work
   - Need boundaries before increasing autonomy scope

4. **Scale approaching**
   - WAVE-2 (knowledge base) will multiply documentation volume
   - WAVE-3 (stress tests) will multiply task execution rate
   - Must establish governance NOW before scale makes it impossible

5. **Learning window open**
   - Small codebase = easier to implement governance
   - Can iterate on rules before they calcify
   - Patterns from WAVE-0 inform governance design

**Without WAVE-1:**
- Process compliance degrades to theater (docs exist but low quality)
- Autonomous agents produce unchecked work (trust without verification)
- Quality varies wildly (no minimum bar enforced)
- Manual review becomes permanent bottleneck (doesn't scale)

**With WAVE-1:**
- Compliance automatic (pre-commit blocks bad work)
- Autonomous agents bounded (can't violate AFP/SCAS)
- Quality baseline enforced (7/9 minimum)
- Manual review optional (guardrails catch issues automatically)

**Opportunity cost:** Every week without governance = compounding quality debt + unconstrained automation risk

---

## Strategic Fit

**How does WAVE-1 align with project vision?**

**Project goal:** Autonomous AI agent system for weather forecasting with proof-driven development

**WAVE-1 enables:**

### 1. Trustworthy Autonomy
- Wave 0 agents constrained by automated gates (can't merge bad work)
- Proof-driven (critics validate automatically before merge)
- Bounded creativity (explore within AFP/SCAS principles)
- **Governance makes autonomy safe**

### 2. Quality at Scale
- Consistent standards across all work (automated enforcement)
- Scales beyond human review capacity (critics don't get tired)
- Learning from failures (remediation analytics inform process evolution)
- **Governance enables scaling without quality degradation**

### 3. Evolutionary Safety
- Wave N → N+1 gates prevent premature advancement
- Exit criteria enforce learning milestones
- Audit trail enables regression analysis
- **Governance makes evolution safe and deliberate**

### 4. Institutional Memory
- Work ledger captures all decisions and rationale
- Evidence bundles preserve context
- Pattern mining identifies recurring themes
- **Governance creates organizational learning**

**Without WAVE-1:**
- Can't trust autonomous agents (no guardrails)
- Can't scale quality (manual review bottleneck)
- Can't evolve safely (no gates between waves)
- Can't learn systematically (no structured capture)

**With WAVE-1:**
- Autonomous agents trustworthy (bounded by governance)
- Quality scales (automated enforcement)
- Evolution safe (gates prevent skipping learning)
- Learning systematic (structured evidence capture)

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Manual quality review (→ automated critic integration): ~20 hours/week
- Compliance spot-checking (→ pre-commit hooks): ~5 hours/week
- Remediation coordination (→ automatic task creation): ~3 hours/week
- Roadmap validation (→ schema enforcement): ~2 hours/week
- Inconsistent standards (→ single source of truth): immeasurable cognitive load

**Total deletion value:** ~30 hours/week manual governance work eliminated

**What are we SIMPLIFYING?**
- Multiple review points → single pre-commit gate
- Scattered enforcement → centralized guardrail catalog
- Ad-hoc remediations → structured remediation loop
- Verbal standards → machine-enforceable rules

### COHERENCE (Match Terrain)

**Reusing proven patterns:**
- **Governance automation** - Regulated industries (SOX, HIPAA compliance automation)
- **Quality gates** - CI/CD pipelines (automated deployment gates, test gates)
- **Schema validation** - API design (OpenAPI, JSON Schema, protocol buffers)
- **Audit trails** - Financial systems (immutable ledgers, tamper detection)
- **Remediation loops** - Site reliability engineering (automatic incident creation, postmortems)

**Not inventing governance from scratch** - adapting proven regulatory and SRE patterns to AI agent development

### LOCALITY (Related near, unrelated far)

**Governance work clustered in WAVE-1:**
- All critic integration in W1.M1
- All roadmap gating in W1.M1
- All work ledger implementation in W1.M1
- All guardrail definition in W1.M1
- Related governance concerns together (not scattered across waves)

### VISIBILITY (Important obvious)

**Critical decisions explicit:**
1. **Compliance mandatory** - Pre-commit hooks enforce (not suggestions)
2. **AFP/SCAS minimum** - 7/9 score required (explicit bar)
3. **No bypass without justification** - `--no-verify` tracked and reviewed
4. **Remediation automatic** - Blocked work creates tasks (no manual follow-up)
5. **Audit trail complete** - All decisions preserved (no tribal knowledge)

### EVOLUTION (Fitness)

**Governance proves itself through:**
- **Remediation analytics** - Track what's blocked, why, how often (learning data)
- **Override tracking** - Measure bypass rate (governance health metric)
- **Compliance rate** - First-pass success percentage (process effectiveness)
- **Quality sampling** - Random audits of merged work (validation)
- **Pattern mining** - Identify recurring issues (process improvement input)

**Kill criteria defined:**
- If override rate >20% sustained (governance too strict)
- If remediation rate >40% sustained (standards unrealistic)
- If compliance cost > quality benefit (governance overhead too high)

**Fitness measured quarterly by MetaCritic**

---

## Alternatives Considered

### Alternative 1: Skip Governance, Trust Engineers
**Approach:** WAVE-0 process exists, rely on voluntary compliance

**Rejected because:**
- Humans forget steps (not malicious, just busy)
- Inconsistent interpretation of "good enough"
- No learning feedback (can't improve what's not measured)
- Autonomous agents have zero constraints (dangerous at scale)
- Historical evidence: voluntary compliance degrades over time

### Alternative 2: Governance Built Into WAVE-0
**Approach:** Foundation + enforcement in single epic

**Rejected because:**
- Can't enforce what doesn't exist (need process before governance)
- WAVE-0 scope already large (foundation alone is 3 milestones)
- Sequential learning (establish patterns, then enforce them)
- Risk of premature optimization (enforcing rules we haven't validated)

### Alternative 3: Lightweight Governance Only
**Approach:** Just roadmap schema validation, skip critic integration and ledger

**Rejected because:**
- Partial governance = circumventable governance (easy workarounds)
- No feedback loop (can't learn from what's not tracked)
- Quality still inconsistent (structure ≠ substance)
- Doesn't constrain autonomous agents effectively

### Alternative 4: Human Review + Light Automation
**Approach:** Automated checks for structure, human review for quality

**Rejected because:**
- Human review doesn't scale (bottleneck at WAVE-2+ volume)
- Inconsistent standards (different reviewers, different bars)
- No 24/7 coverage (blocks autonomous operation)
- Defeats purpose of autonomous AI agents

### Selected: Comprehensive Automated Governance (WAVE-1)

**Why:**
- **Scales:** Automated enforcement grows with codebase
- **Consistent:** Rules applied uniformly, no human variance
- **Learning:** Structured feedback from remediations
- **Bounded autonomy:** Enables safe autonomous operation
- **Provable:** Audit trail demonstrates compliance

**Trade-off accepted:** Higher upfront investment for long-term scalability

---

## Success Criteria (Epic-Level)

**WAVE-1 exits when ALL criteria met:**

### 1. Quality Gates Operational (W1.M1)
- [ ] DesignReviewer integrated with pre-commit, blocking commits with concerns
- [ ] StrategyReviewer validating via negativa and alternatives analysis
- [ ] ThinkingCritic enforcing edge case and failure mode analysis
- [ ] ProcessCritic validating phase sequence and test plan authorship
- [ ] All critics tuned to <10% false positive rate

### 2. Roadmap Gating Enforced (W1.M1)
- [ ] Schema validation prevents invalid epic/milestone/task/set structure
- [ ] Embedding validation catches orphan tasks or sets
- [ ] Dependency validation blocks starting tasks with incomplete blockers
- [ ] Exit criteria gates prevent premature wave transitions

### 3. Work Ledger Verified (W1.M1)
- [ ] All work tracked in roadmap.yaml or evidence bundles
- [ ] Evidence validation ensures complete phase documentation
- [ ] Tamper detection operational (catches unauthorized edits)
- [ ] Audit queries functional (who/what/when/why answerable)

### 4. Remediation Loop Proven (W1.M1)
- [ ] Blocked work automatically creates remediation tasks
- [ ] Remediation analytics logged and queryable
- [ ] Patterns identified from ≥10 remediations
- [ ] Process improvements implemented based on patterns

### 5. Baseline Guardrails Established (W1.M1)
- [ ] Guardrail catalog published (AFP/SCAS rules documented)
- [ ] Automated evaluation script validates guardrail health
- [ ] Documentation explains rationale for each rule
- [ ] Kill criteria defined for each guardrail

### 6. Exit Readiness Validated (W1.M1)
- [ ] 95%+ first-pass compliance rate measured
- [ ] <5% override (`--no-verify`) usage tracked
- [ ] Zero undetected quality issues in random sample (n=20)
- [ ] Governance documentation complete
- [ ] WAVE-2 can proceed (foundation + governance proven)

---

## Strategic Risks

### Risk 1: Enforcement Too Strict (Engineers Revolt)
- **Threat:** Pre-commit hooks block legitimate work, frustrate engineers, high bypass rate
- **Probability:** Medium (inevitable initial friction)
- **Impact:** High (undermines governance if ignored)
- **Mitigation:**
  - Clear error messages with remediation guidance
  - Appeal process (Director Dana overrides)
  - Monthly override review (tune critics)
  - Target <10% false positive rate

### Risk 2: Critics Have False Positives (Trust Erosion)
- **Threat:** DesignReviewer blocks good designs due to bad heuristics
- **Probability:** Medium (heuristics imperfect)
- **Impact:** High (erodes trust in governance)
- **Mitigation:**
  - Continuous critic tuning based on override feedback
  - Appeal examples added to critic training data
  - Monthly false positive rate measurement
  - Kill criteria if >20% sustained false positive rate

### Risk 3: Governance Overhead > Benefit (Bureaucracy)
- **Threat:** Time spent on compliance exceeds time saved by quality improvements
- **Probability:** Low (if via negativa applied rigorously)
- **Impact:** Critical (defeats purpose of automation)
- **Mitigation:**
  - MetaCritic quarterly reviews governance ROI
  - Kill criteria: If compliance time > review time saved
  - Streamline based on feedback
  - Delete guardrails that don't catch real issues

### Risk 4: Roadmap Schema Too Rigid
- **Threat:** Schema prevents legitimate structure variations
- **Probability:** Medium (hard to predict all valid patterns)
- **Impact:** Medium (workarounds emerge)
- **Mitigation:**
  - Schema versioning (can evolve)
  - Override mechanism for special cases
  - Quarterly schema review
  - Bias toward permissive (prevent chaos, allow creativity)

### Risk 5: Audit Trail Becomes Surveillance
- **Threat:** Engineers feel monitored, reduces psychological safety
- **Probability:** Low (if communicated as learning tool)
- **Impact:** Medium (reduces candor, harms culture)
- **Mitigation:**
  - Frame as organizational learning, not individual monitoring
  - Aggregate analytics (not individual performance tracking)
  - Blameless postmortem culture
  - Anonymous feedback on governance

---

## Success Metrics

### Quantitative (Measured Weekly)
- **Compliance rate:** ≥95% (commits pass all gates first try)
- **Override usage:** <5% (`--no-verify` rare)
- **Remediation rate:** <20% (most work passes without rework)
- **False positive rate:** <10% (critics mostly correct)
- **Audit coverage:** 100% (all work tracked)
- **Quality defect escape:** 0 (random sample of merged work)

### Qualitative (Surveyed Monthly)
- **Engineer satisfaction:** >70% "governance helpful, not burdensome"
- **Quality perception:** >80% "quality improved since governance"
- **Trust in autonomy:** >60% "trust Wave 0 with governance constraints"
- **Process clarity:** >85% "understand what's required and why"

### Evolutionary (Tracked Quarterly)
- **Remediations declining:** Pattern improvements reduce repeat issues
- **Override justifications:** Reasons trend toward legitimate, not frustration
- **Critic accuracy improving:** False positive rate declining
- **Governance ROI positive:** Time saved > time spent

---

## Strategic Assumptions

1. **Automated enforcement more effective than manual review**
   - Assumption: Computers enforce consistently, humans don't
   - Validation: Compliance rate comparison (pre/post governance)

2. **Engineers accept governance if ROI clear**
   - Assumption: People support helpful guardrails, resist bureaucracy
   - Validation: Monthly satisfaction surveys

3. **Critics tunable to acceptable false positive rate**
   - Assumption: <10% false positives achievable through iteration
   - Validation: Override tracking and critic refinement

4. **Remediation loop drives continuous improvement**
   - Assumption: Learning from blocks improves process over time
   - Validation: Pattern mining from remediation analytics

5. **Governance enables (not hinders) autonomous operation**
   - Assumption: Bounded autonomy safer than unbounded
   - Validation: Wave 0 success rate with governance vs. without

**If any assumption fails:** Re-evaluate WAVE-1 approach, potentially simplify or pivot governance strategy

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md (measurable outcomes and requirements)
**Owner:** Director Dana
**Reviewers:** Claude Council, Atlas
