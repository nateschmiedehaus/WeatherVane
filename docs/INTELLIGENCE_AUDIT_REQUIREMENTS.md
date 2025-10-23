# Intelligence Audit Requirements - Beyond Checkbox Thinking

**Date**: 2025-10-23
**Status**: REQUIREMENT DEFINITION
**Priority**: CRITICAL - Affects quality gate system design

---

## User Requirement (Exact Words)

> "intelligence audits should be expanded to encompass the various domains of skill and knowledge and thought required for that given task or group, and this could be specific design stuff, academic knowledge, cutting edge science, expertise in a field, specific experience, philosopphy, modes of thinking and ontology, etc... really it must really capture a genius and he/she may think about a task. it's not just going to be checking boxes"

---

## What This Means

### Current State (TOO MECHANICAL):
Quality gates currently check:
- ✅ Build passes
- ✅ Tests pass
- ✅ Code exists
- ✅ Documentation exists
- ✅ No superficial completion patterns

**Problem**: These are **checkboxes**. They don't capture how a **genius domain expert** would think about the task.

### Required State (DEEP INTELLIGENCE):

For EACH task, the intelligence audit should think like multiple domain experts:

1. **Academic/Scientific Expert**
   - Is the theory sound?
   - Are the assumptions valid?
   - Is this state-of-the-art or outdated?
   - What does the literature say?
   - Are there known pitfalls?

2. **Domain Specialist**
   - For weather forecasting: Does this make meteorological sense?
   - For ML: Is this the right model architecture?
   - For infrastructure: Is this production-grade?
   - What would a 20-year veteran notice?

3. **Design/Aesthetic Expert**
   - Is this elegant or clunky?
   - Does the abstraction make sense?
   - Is this beautiful code or a hack?
   - Would this win design awards?

4. **Philosopher/Systems Thinker**
   - What are the epistemological assumptions?
   - How does this fit the broader ontology?
   - What modes of thinking are appropriate here?
   - Are we asking the right questions?

5. **Cutting-Edge Researcher**
   - Is there newer research we should use?
   - Are we using 2023 methods when 2025 methods exist?
   - What does arXiv say about this?
   - What would SOTA look like?

6. **Experienced Practitioner**
   - What lessons from production would apply?
   - What failure modes exist in the real world?
   - What would someone who's "been there" say?
   - Where are the gotchas?

---

## Examples: How a Genius Would Think

### Example 1: "Implement GAM model for forecast decomposition"

**Checkbox thinking** (current):
- ✅ GAM class exists
- ✅ Tests pass
- ✅ Documentation written
- ✅ Build passes

**Genius thinking** (required):
- **Statistician**: "Is this using the right spline basis? Thin-plate or cubic? What about identifiability constraints? Are the smoothness parameters estimated or fixed? Did you check residual diagnostics?"
- **Domain Expert**: "For weather forecasting, additive models might miss interaction effects - temperature × humidity matters for heat index. Did you consider that?"
- **ML Researcher**: "GAMs are interpretable but limited. Did you compare against neural GAMs (2024 paper) or consider shape constraints for monotonicity?"
- **Software Architect**: "How does this scale? GAM fitting is O(n³) - did you test with 100k+ data points? What about incremental updates?"
- **Philosopher**: "You're assuming additivity as the correct ontology for weather patterns. What's the epistemic justification? What if weather is fundamentally non-additive?"

### Example 2: "Implement quality gate orchestrator"

**Checkbox thinking** (current):
- ✅ QualityGateOrchestrator class exists
- ✅ Integration tests pass
- ✅ Called by unified_orchestrator
- ✅ Logs decisions

**Genius thinking** (required):
- **Systems Thinker**: "What happens when quality gates disagree? Who has final authority? What's the conflict resolution mechanism? Can this deadlock?"
- **Governance Expert**: "How do we prevent 'quality gate fatigue' where gates get ignored? What's the escalation path? Who audits the auditors?"
- **Adversarial Thinker**: "How could someone game this system? Could they weaken tests to pass gates? Could they fabricate evidence? How do we detect that?"
- **Academic Researcher**: "What does software engineering research say about code review effectiveness? Are we using evidence-based practices or cargo-culting?"
- **UX Designer**: "Is this going to slow down developers to the point they disable it? How do we balance rigor with velocity?"
- **Philosopher**: "What's the theory of quality here? Deontological (follow the rules) or consequentialist (outcomes matter)? Can quality be fully automated or does it require human judgment?"

### Example 3: "Implement resource lifecycle manager"

**Checkbox thinking** (current):
- ✅ ResourceLifecycleManager class exists
- ✅ acquire() and release() methods implemented
- ✅ Tests for acquisition and release
- ✅ No memory leaks in tests

**Genius thinking** (required):
- **Systems Programmer**: "Did you handle signal interrupts (SIGTERM, SIGINT)? What about process crashes? What if cleanup never runs? Is there an external watchdog?"
- **Distributed Systems Expert**: "What happens in concurrent scenarios? Race conditions? Deadlocks? Did you use lock-free algorithms or mutexes? What's the ordering guarantee?"
- **Performance Engineer**: "What's the overhead of lifecycle tracking? What about hot paths? Did you profile this? Could this be the bottleneck?"
- **Academic**: "What's the formal model? Is this based on linear types, RAII, or some other theory? Is it proven safe?"
- **Practitioner**: "I've seen resource managers leak in production when exceptions happen during cleanup. Did you test exception-in-destructor scenarios? What about reentrancy?"

---

## Implementation Approach

### Phase 1: Task-Specific Domain Analysis

When a task is created, identify required domains:

```typescript
interface TaskDomainRequirements {
  taskId: string;
  requiredDomains: Array<{
    domain: 'statistics' | 'design' | 'systems' | 'philosophy' | 'academic' | 'practitioner' | ...;
    expertise: string; // "weather forecasting", "distributed systems", "UX design"
    perspective: string; // What angle to review from
    keyQuestions: string[]; // Questions a genius in this domain would ask
  }>;
}
```

**Example**:
```typescript
{
  taskId: "T1.1.1",
  requiredDomains: [
    {
      domain: "statistics",
      expertise: "time series modeling",
      perspective: "model specification correctness",
      keyQuestions: [
        "Are the distributional assumptions valid?",
        "Did you check stationarity?",
        "What about autocorrelation in residuals?"
      ]
    },
    {
      domain: "philosophy",
      expertise: "epistemology of prediction",
      perspective: "ontological assumptions",
      keyQuestions: [
        "What's the theory of causation here?",
        "Are you predicting or understanding?",
        "What's the epistemic status of the forecast?"
      ]
    }
  ]
}
```

### Phase 2: Multi-Perspective Review

The quality gate orchestrator should:

1. **Identify task domain** (from description, epic, context)
2. **Generate domain-specific questions** (what would a genius ask?)
3. **Use POWERFUL models** (Opus, GPT-5) with domain-specific prompts
4. **Multi-perspective synthesis** (integrate insights from all domains)
5. **Identify blind spots** (what perspectives are we missing?)

### Phase 3: Genius-Level Prompting

Instead of:
```
"Review this task completion. Check if tests pass and code exists."
```

Use:
```
"You are reviewing a GAM implementation for weather forecasting.

Think like:
- A statistics professor who has published 50+ papers on GAMs
- A meteorologist with 20 years forecasting experience
- An ML researcher who follows latest neural-GAM work
- A systems thinker questioning the ontological assumptions
- A software architect concerned with production scalability

For each perspective, ask:
- What would a genius in this domain immediately notice?
- What questions would they ask that others wouldn't?
- What failure modes would only an expert see?
- What state-of-the-art approaches are we missing?
- What philosophical assumptions are we making?

Provide a multi-perspective critique that goes beyond checkboxes."
```

### Phase 4: Integration with Existing Quality Gates

**Enhance adversarial_bullshit_detector.ts**:

Add new detection category: `intellectual_depth`

```typescript
async checkIntellectualDepth(evidence: TaskEvidence, domains: DomainRequirement[]): Promise<Detection[]> {
  const detections: Detection[] = [];

  for (const domain of domains) {
    const critique = await this.runDomainExpertReview(evidence, domain);

    if (critique.depth === 'superficial') {
      detections.push({
        detected: true,
        severity: 'CRITICAL',
        category: 'intellectual_depth',
        description: `Task lacks ${domain.expertise} depth - a domain expert would reject this`,
        evidence: critique.concerns,
        recommendation: `Engage ${domain.expertise} expert for review`
      });
    }
  }

  return detections;
}
```

---

## Required Changes to Quality Gate System

### 1. Domain Registry
Create `state/domain_expertise.yaml`:
```yaml
domains:
  - id: statistics_timeseries
    name: "Time Series Statistics"
    keyQuestions:
      - "Are distributional assumptions tested?"
      - "Is stationarity verified?"
      - "Are residuals checked?"
    expertModel: "claude-opus-4 with statistics reasoning"

  - id: philosophy_epistemology
    name: "Epistemology & Ontology"
    keyQuestions:
      - "What's the theory of knowledge here?"
      - "What assumptions are implicit?"
      - "What modes of thinking are appropriate?"
    expertModel: "gpt-5-codex with philosophical reasoning"
```

### 2. Task Domain Tagging
Extend roadmap.yaml task format:
```yaml
tasks:
  - id: T1.1.1
    title: "Implement GAM model"
    domains:
      - statistics_timeseries
      - domain_weather
      - software_architecture
      - philosophy_epistemology
```

### 3. Genius-Level Review Prompt Templates
Create `tools/wvo_mcp/prompts/genius_reviews/`:
- `statistics_expert.md`
- `domain_specialist.md`
- `philosopher.md`
- `researcher.md`
- `practitioner.md`

Each with **deep domain-specific questions** that checkboxes would never capture.

### 4. Synthesis Engine
Create `GeniusSynthesizer` that:
- Runs all domain-expert reviews
- Identifies conflicts between perspectives
- Synthesizes a multi-perspective judgment
- Flags blind spots (missing perspectives)

---

## Success Criteria

A quality gate should be able to detect:

1. **Theoretical Errors**: "This violates the central limit theorem"
2. **Design Inelegance**: "This is a code smell - better abstraction exists"
3. **Epistemological Confusion**: "You're confusing correlation with causation"
4. **Outdated Approaches**: "This is 2023 tech, 2025 has better methods"
5. **Domain-Specific Gotchas**: "In production weather systems, this fails at UTC boundary"
6. **Missing Perspectives**: "You haven't considered the UX impact on forecasters"
7. **Philosophical Blindness**: "Your ontology assumes determinism but weather is stochastic"

**Current gates cannot detect any of these.** This is the gap to close.

---

## Next Steps

1. ✅ Document this requirement (this file)
2. ⏳ Design domain registry format
3. ⏳ Create genius-level prompt templates
4. ⏳ Implement multi-perspective review in quality_gate_orchestrator
5. ⏳ Test with real tasks (GAM, resource manager, etc.)
6. ⏳ Measure improvement (can it detect domain-specific issues?)
7. ⏳ Integrate with autopilot

---

## Open Questions

1. **How to identify required domains for each task?**
   - Manual tagging in roadmap?
   - AI inference from task description?
   - Both?

2. **How many perspectives per task?**
   - Minimum: 3 (academic, practitioner, philosopher)
   - Maximum: 7 (all domains)
   - Complexity-based?

3. **How to handle perspective conflicts?**
   - Academic says "theoretically correct"
   - Practitioner says "will fail in production"
   - Who wins?

4. **Token cost?**
   - Genius-level reviews need POWERFUL models (Opus, GPT-5)
   - Multiple perspectives = multiple API calls
   - Need budget planning

5. **Validation?**
   - How do we know the genius reviews are actually genius-level?
   - Who reviews the reviewers?
   - Meta-quality problem

---

## Summary

**Current quality gates**: Checkbox thinking (does code exist, do tests pass)

**Required quality gates**: Genius thinking (what would a domain expert immediately see that others miss)

**Gap**: Massive - we need multi-perspective domain-expert reviews that capture theoretical, practical, philosophical, and cutting-edge knowledge.

**Action**: Enhance quality gate system to support domain-tagged tasks with genius-level multi-perspective reviews.

---

**Signed**: Claude (Strategic Reviewer)
**Date**: 2025-10-23
**Status**: Requirement captured, implementation design proposed
**Next**: Implement domain registry and genius prompt templates
