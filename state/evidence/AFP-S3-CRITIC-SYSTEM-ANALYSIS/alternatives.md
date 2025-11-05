# FUNDAMENTAL ALTERNATIVES: Critic Architecture from First Principles

**Task ID:** AFP-S3-CRITIC-SYSTEM-ANALYSIS
**Date:** 2025-11-05
**Purpose:** Question the critic system from ground zero - should it exist?

---

## The Deepest Via Negativa Question

**NOT:** "How do we refactor critics?"
**BUT:** "Should critics exist at all? What problem do they solve? Is there a simpler way?"

---

## Problem Definition (What Critics Try to Solve)

**P1: Quality enforcement before task completion**
- Need: Ensure code meets standards before marking task "done"
- Current: exit_criteria in roadmap → critic runs → pass/fail

**P2: Automated code review**
- Need: Catch issues without human review
- Current: 46 critics check different aspects (lint, test, design, etc.)

**P3: AFP/SCAS compliance**
- Need: Enforce via negativa, refactor not repair, complexity control
- Current: Document reviewers (design, strategy, thinking) check these

**P4: Runtime quality (observation)**
- Need: Test actual behavior (performance, API health, DB queries)
- Current: 5 observation critics spawn servers, run tests, collect metrics

**P5: Intelligent escalation**
- Need: Auto-create remediation tasks when critics fail
- Current: Escalation system in base.ts (200 LOC, rarely used?)

---

## OPTION 1: Delete Everything - Use Industry Standard Tools

### What This Means

**DELETE:** All 46 critics (8,078 LOC)

**REPLACE WITH:**

**For P1 (Quality enforcement):**
```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run lint      # ESLint, Prettier
      - run: npm run typecheck # TypeScript
      - run: npm test          # Jest
      - run: npm audit         # Security
      - run: npm run build     # Build check
```

**For P2 (Automated review):**
- Use GitHub's built-in checks (required status checks)
- Use Codecov for coverage
- Use SonarQube for code quality
- Use CodeQL for security

**For P3 (AFP/SCAS):**
- **PROBLEM:** No standard tool checks for "via negativa"
- **OPTIONS:**
  - A: Custom ESLint rules (lightweight)
  - B: GitHub PR templates with checklists
  - C: Manual review (human, not automation)

**For P4 (Observation):**
- Use Datadog/New Relic/Sentry (professional monitoring)
- Use k6/Artillery for load testing
- Use Lighthouse for frontend performance
- **PROBLEM:** These cost money, critics are free

**For P5 (Escalation):**
- **LOST:** No auto-task creation
- **ALTERNATIVE:** GitHub Issues created manually

### ROI Analysis

**SAVINGS:**
- Delete 8,078 LOC (100% of critic code)
- Delete maintenance burden (bugs, updates, tests)
- Use battle-tested tools (ESLint, Jest, GitHub Actions)
- Free infrastructure (GitHub's servers)

**COSTS:**
- Lose intelligent escalation (auto-task creation)
- Lose AFP/SCAS automated enforcement
- Lose observation critics (runtime testing)
- Lose integration with orchestrator
- Lose adaptive thresholds (agent track record)
- Lose local pre-commit checks (GitHub Actions requires push)

**VERDICT:** **35-40% of critics replaceable**, **60-65% provide unique value**

### What to Keep vs Delete

**DELETABLE (shell wrappers, ~1,500 LOC):**
- build → GitHub Actions
- tests → GitHub Actions
- security → GitHub Actions + Dependabot
- typecheck → GitHub Actions
- Most simple critics

**KEEP (unique value, ~6,500 LOC):**
- Document reviewers (AFP/SCAS enforcement)
- Observation critics (runtime testing)
- ML critics (domain-specific validation)
- Anything with intelligent logic

**HYBRID RECOMMENDATION:** Delete 20% of critics, refactor 80%

---

## OPTION 2: Restore Original Vision - Agentic Critics

### What Was Intended (Per User)

Critics should be:
- ✅ **Fully agentic** - AI agents, not scripts
- ✅ **Counter-argumentative** - Argue back, don't just fail
- ✅ **Reconsiderative** - Update beliefs based on rebuttals
- ✅ **Objectively reviewing** - Through adversarial dialogue

### What Exists Today

- ❌ Shell command wrappers (35%)
- ❌ Regex pattern matchers (15%)
- ❌ Metric collectors (40%)
- ⚠️ Partial agentic (10%): Document reviewers have *some* intelligence

### Gap Analysis

**Document reviewers (closest to vision):**
```typescript
// CURRENT: Regex-based static analysis
if (!content.includes("Via Negativa")) {
  concerns.push({ severity: "high", msg: "Missing via negativa" });
}

// ORIGINAL VISION: Agentic dialogue
const argument = await ai.argue({
  proposal: design,
  stance: "This design adds complexity without deletion",
  evidence: ["No via negativa section", "150 LOC added, 0 deleted"],
  alternatives: [
    "Could you DELETE existing code instead?",
    "Could you SIMPLIFY rather than add features?"
  ]
});

// Human responds to argument
const rebuttal = await human.respond(argument);

// Critic reconsiders
const revised = await critic.reconsider(rebuttal);
```

**Observation critics (currently passive):**
```typescript
// CURRENT: Collect metrics, report issues
const traces = await this.observe();
const issues = this.analyzeTraces(traces);
return issues.length > 0 ? this.fail() : this.pass();

// ORIGINAL VISION: Active hypothesis testing
const hypothesis = "API will handle 1000 req/s";
const experiment = await this.designExperiment(hypothesis);
const result = await this.runExperiment(experiment);

if (result.refutes(hypothesis)) {
  const argument = await this.argue({
    claim: "API cannot scale to requirements",
    evidence: result,
    recommendation: "Refactor to async processing"
  });
  return this.engageDebate(argument);
}
```

### What It Would Take to Restore Vision

**Architecture changes:**
```typescript
// NEW: Critics are agents with beliefs
interface AgenticCritic {
  // Core review with argumentation
  reviewWithDialogue(artifact: Artifact): Promise<Review>;

  // Respond to rebuttals
  reconsider(rebuttal: Rebuttal): Promise<RevisedReview>;

  // Propose alternatives
  synthesizeAlternatives(problem: Problem): Promise<Alternative[]>;

  // Update beliefs based on evidence
  updateWorldModel(evidence: Evidence): void;

  // Confidence tracking
  getConfidence(): number; // 0-1

  // Explain reasoning
  explainReasoning(): Explanation;
}

// Dialogue system
interface CriticDebate {
  rounds: Round[];  // Back-and-forth arguments
  resolution: Resolution | "ongoing";
  participantBeliefs: BeliefState[];
}
```

**Implementation estimate:**
- **Core agentic framework:** 2,000-3,000 LOC
- **LLM integration:** OpenAI API, prompts, context management
- **Belief tracking:** Bayesian updates, confidence intervals
- **Dialogue management:** Turn-taking, resolution detection
- **Total:** +5,000 LOC for infrastructure
- **Per-critic conversion:** 2-4 hours each × 46 = 92-184 hours

**COST:** Massive (5,000+ LOC, 2-3 weeks work)

**BENEFIT:** Aligns with original vision, much more powerful

**RISK:** High complexity, LLM costs, may be over-engineered

**VERDICT:** **Ambitious but potentially transformative**

---

## OPTION 3: Policy-as-Code (Simpler Than Agentic)

### Concept

Instead of classes or agents, use **declarative policies**.

**Example:**
```yaml
# state/policies/design_quality.yaml
policy: design-must-have-via-negativa
description: All designs must include via negativa analysis
applies_to:
  - design.md
rules:
  - check: section_exists
    section: "Via Negativa"
    severity: critical
  - check: section_min_lines
    section: "Via Negativa"
    min_lines: 5
  - check: deletion_quantified
    pattern: "DELETE.*LOC|remove.*LOC"
    severity: high
remediation:
  - "Add Via Negativa section"
  - "Quantify what will be deleted"
  - "Explain why deletion is better than addition"

escalation:
  on_failure: create_task
  delegate_to: ["human_reviewer"]
  cooldown_hours: 24
```

**Policy engine (simple):**
```typescript
// Policy engine: 500 LOC (vs 8,078 for critics)
class PolicyEngine {
  async enforce(artifact: Artifact, policy: Policy): Promise<Result> {
    for (const rule of policy.rules) {
      const check = CHECKS[rule.check];  // Pluggable
      const result = await check(artifact, rule);
      if (!result.passed) {
        return this.fail(rule, policy.remediation);
      }
    }
    return this.pass();
  }
}

// Pluggable checks
const CHECKS = {
  section_exists: (doc, rule) => doc.includes(rule.section),
  section_min_lines: (doc, rule) => countLines(doc, rule.section) >= rule.min_lines,
  deletion_quantified: (doc, rule) => new RegExp(rule.pattern).test(doc),
  // ... more checks
};
```

**Benefits:**
- ✅ Simple (500 LOC engine vs 8,078 LOC critics)
- ✅ Declarative (YAML vs TypeScript)
- ✅ No compilation (edit YAML, instant effect)
- ✅ Non-technical users can edit policies
- ✅ Version control policies separately
- ✅ Test policies easily (just YAML parsing)

**Limitations:**
- ❌ Not agentic (no dialogue)
- ❌ Limited to predefined checks
- ❌ No learning/adaptation

**VERDICT:** **Sweet spot** - Much simpler than current critics, more flexible than agents

---

## OPTION 4: Test-Driven Quality (No Critics Needed)

### Concept

**Thesis:** Good tests make critics unnecessary.

**Instead of critics checking quality, tests define quality:**

```typescript
// CURRENT: DesignReviewerCritic checks for via negativa
if (!design.includes("Via Negativa")) {
  return this.fail("Missing via negativa section");
}

// ALTERNATIVE: Test that design has via negativa
describe('Design Quality', () => {
  it('must include via negativa analysis', () => {
    const design = fs.readFileSync('design.md', 'utf-8');
    expect(design).toContain('Via Negativa');
    expect(design).toContain('DELETE');
  });

  it('must quantify deletions', () => {
    const design = fs.readFileSync('design.md', 'utf-8');
    expect(design).toMatch(/DELETE \d+ LOC/);
  });
});
```

**For observation critics:**
```typescript
// CURRENT: APIObservationCritic spawns server, tests endpoints
class APIObservationCritic {
  async observe() { /* complex logic */ }
}

// ALTERNATIVE: Integration tests
describe('API Performance', () => {
  it('should handle 100 req/s', async () => {
    const results = await loadTest({ rps: 100, duration: 10 });
    expect(results.p95_latency).toBeLessThan(500);
  });

  it('should not have N+1 queries', async () => {
    const queries = await captureQueries(() => api.get('/users'));
    expect(queries.length).toBeLessThan(5);
  });
});
```

**Benefits:**
- ✅ Standard test framework (Jest, not custom critics)
- ✅ Developers already know how to write tests
- ✅ Test coverage tools work out of box
- ✅ No custom infrastructure (8,078 LOC → 0)

**Limitations:**
- ❌ Tests are pass/fail (no argumentation)
- ❌ No intelligent escalation
- ❌ No adaptive thresholds
- ❌ Tests must be written explicitly (not auto-generated)

**VERDICT:** **Viable for 80% of critic functionality** - Much simpler

---

## OPTION 5: Consensus Protocol (Multiple Agents Debate)

### Concept

Instead of one critic reviewing, have **multiple agents debate quality**.

**Design:**
```typescript
// Diverse panel of reviewers
const panel = [
  new ViaNegativaAgent(),   // Argues for deletion
  new ComplexityAgent(),    // Argues against complexity
  new ShippingAgent(),      // Argues for speed
  new QualityAgent(),       // Argues for correctness
];

// Debate format
const debate = await conductDebate({
  proposal: design,
  panel: panel,
  rounds: 3,
  resolution: "consensus" | "majority" | "dictator"
});

// Each agent presents arguments
Round 1:
  ViaNegativaAgent: "This adds 150 LOC without deleting anything. REJECT."
  ShippingAgent: "But it solves user problem quickly. APPROVE."
  ComplexityAgent: "150 LOC is within budget. NEUTRAL."
  QualityAgent: "Missing tests. REJECT."

// Agents update beliefs based on others' arguments
Round 2:
  ViaNegativaAgent: "ShippingAgent has a point about user value. REVISE: Approve if 50 LOC deleted."
  QualityAgent: "If tests added, I'll approve. CONDITIONAL."

// Resolution
Consensus: APPROVE with conditions:
  - Delete 50 LOC
  - Add tests
```

**Benefits:**
- ✅ Multiple perspectives (not single critic bias)
- ✅ Dialectical reasoning (Socratic method)
- ✅ Self-correcting (agents challenge each other)
- ✅ Transparent (full debate visible)

**Costs:**
- ❌ Complex (need debate protocol)
- ❌ Slow (N agents × M rounds)
- ❌ Expensive (N × LLM calls)

**VERDICT:** **Intellectually interesting, practically expensive**

---

## Comparison Matrix

| Option | Complexity | Power | Cost | Time to Implement | Aligns with Vision |
|--------|------------|-------|------|-------------------|-------------------|
| 1. Delete (Use standard tools) | ⭐ | ⭐⭐ | Free | 2-3 days | ❌ No (loses unique value) |
| 2. Restore agentic vision | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | High (LLM) | 2-3 weeks | ✅ Yes (original intent) |
| 3. Policy-as-code | ⭐⭐ | ⭐⭐⭐ | Free | 1 week | ⚠️ Partial (no dialogue) |
| 4. Test-driven | ⭐ | ⭐⭐⭐ | Free | 1 week | ❌ No (tests aren't critics) |
| 5. Consensus protocol | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Very High | 2-4 weeks | ✅✅ Yes+ (even better) |
| 6. Incremental refactor (current plan) | ⭐⭐⭐ | ⭐⭐⭐ | Free | 5-7 days | ⚠️ Partial (improves structure) |

---

## Recommended Decision Framework

### Question 1: Is the original vision (agentic critics) still valid?

**If YES:** Choose Option 2 or 5
- Option 2: Single agentic critics
- Option 5: Multi-agent consensus (even better)

**If NO:** Choose Option 1, 3, or 4
- Option 1: Delete and use standard tools
- Option 3: Policy-as-code (middle ground)
- Option 4: Test-driven (simplest)

### Question 2: What's the priority - Speed or Vision?

**If SPEED:** Choose Option 1, 3, or 4 (1-2 weeks)
**If VISION:** Choose Option 2 or 5 (2-4 weeks)

### Question 3: What's the ROI of 8,078 LOC?

**If ROI is LOW:** Delete (Option 1) - use standard tools
**If ROI is HIGH:** Keep and improve (Option 2, 3, or 6)

---

## My Honest Assessment

### What I Initially Missed

I assumed "refactor critics" when I should have asked:
1. **Should critics exist?** (Via negativa at architectural level)
2. **What's the vision?** (Agentic vs scripted)
3. **What's the ROI?** (8,078 LOC vs standard tools)

### What I Now Understand

**The gap:**
- **Vision:** Agentic critics with counter-argumentation
- **Reality:** Shell script wrappers + regex checkers

**The question:**
- Do we restore the vision? (Option 2/5)
- Do we simplify? (Option 3/4)
- Do we delete? (Option 1)

### My Recommendation (Updated)

**SHORT TERM (5-7 days):**
- Execute HYBRID of Option 1 + 6:
  - DELETE simple critics (shell wrappers) → GitHub Actions
  - REFACTOR complex critics (observation, document reviewers)
  - Reduce from 8,078 → 5,000 LOC
  - Improve structure (extract base classes)

**MEDIUM TERM (2-3 weeks):**
- Pilot Option 2 (agentic critics) with ONE critic:
  - Convert DesignReviewerCritic to agentic
  - Test dialogue-based review
  - Measure: developer satisfaction, quality improvement

**LONG TERM (1-2 months):**
- Based on pilot results:
  - If successful: Roll out to all critics (Option 2)
  - If too complex: Adopt policy-as-code (Option 3)
  - If insufficient value: Delete remaining critics (Option 1)

---

## Conclusion

The deepest via negativa question is not "how to refactor critics" but **"should critics exist?"**

**Answer:** It depends on whether we restore the original vision (agentic) or settle for simpler alternatives (policies, tests, GitHub Actions).

**My bias:** I jumped to "refactor" without questioning "exist." User is right to call this out.

**Correct approach:** This fundamental questioning should have been in STRATEGIZE, with alternatives explored in PLAN, and risks analyzed in THINK.

**What to do now:**
1. User decides: Restore vision (Option 2/5) vs Simplify (Option 3/4) vs Delete (Option 1)?
2. Based on decision, we adjust PLAN and GATE phases
3. This analysis document becomes part of the evidence trail

**Next:** User feedback on direction, then proceed to GATE (design.md) with chosen option.
