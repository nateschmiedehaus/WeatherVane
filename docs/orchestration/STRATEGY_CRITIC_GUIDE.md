# Strategy Critic Guide

## Overview

The **StrategyReviewer** is an intelligent critic that evaluates strategic thinking quality BEFORE you proceed to design and implementation. It ensures you've thought deeply about WHY a task matters and WHAT you're trying to achieve.

**Purpose:** Prevent low-value tasks, superficial analysis, and wasted implementation effort by enforcing quality strategic thinking at the source.

**When it runs:**
- Manually via `npm run strategy:review [TASK-ID]`
- Via pre-commit hook (future integration)
- During automated quality gates

## Core Quality Checks

The StrategyReviewer evaluates 9 dimensions of strategic thinking:

### 1. Problem Statement Quality
**Checks for:**
- Specific, evidence-based problem description (not generic)
- Clear identification of affected stakeholders
- Quantified current impact where possible

**Common failures:**
- ❌ Generic: "The system needs improvement"
- ❌ Vague: "Quality should be better"
- ✅ Specific: "Agents skip STRATEGY phase 40% of the time (12/30 tasks), leading to 8 remediation tasks per cycle (20 hours wasted)"

### 2. Root Cause Analysis
**Checks for:**
- Deep analysis (goes beyond symptoms)
- Causal chain explained (X leads to Y which results in Z)
- Asks "why" 3-5 times to reach fundamental cause

**Common failures:**
- ❌ Shallow: "Agents don't think strategically"
- ❌ Symptom: "Code is buggy"
- ✅ Deep: "No enforcement mechanism exists → agents skip STRATEGY to save time → poor quality compounds → manual review catches issues too late → rework costs 10x more"

### 3. Evidence-Based Analysis
**Checks for:**
- Specific data: percentages, ratios, file paths, metrics
- Real examples: task IDs, timestamps, observable patterns
- Verification: references to state/evidence/, state/analytics/

**Common failures:**
- ❌ Opinion: "I noticed quality issues"
- ❌ Assertion: "I think this will help"
- ✅ Evidence: "Analysis of state/evidence/ shows 12/30 tasks (40%) lack strategy.md. Of those, 8 required remediation (evidence: -REMEDIATION- task IDs). Average remediation time: 2.5 hours"

### 4. Measurable Success Criteria
**Checks for:**
- SMART criteria (Specific, Measurable, Achievable, Relevant, Time-bound)
- Quantified targets (numbers, percentages, thresholds)
- Tracking mechanism specified

**Common failures:**
- ❌ Vague: "Better quality"
- ❌ Subjective: "Improved performance"
- ✅ Measurable: "100% of new tasks have strategy.md (measured by pre-commit hook rejection rate < 5%, tracked in state/analytics/strategy_reviews.jsonl)"

### 5. Impact Assessment
**Checks for:**
- Quantified value: time saved, tokens saved, cost reduction
- Multiple dimensions: efficiency, quality, velocity, risk, strategic
- Ranges if uncertain (10-20 hours, $10-$20)

**Common failures:**
- ❌ Hand-wavy: "Significant impact"
- ❌ Generic: "Will improve quality"
- ✅ Quantified: "Prevent 8 remediation tasks/cycle (8 * 2.5 hrs = 20 hrs). At 50k tokens/hr, save 1M tokens/cycle (~$15). Strategic: pattern extends to THINK, SPEC phases"

### 6. AFP/SCAS Alignment
**Checks for:**
- Via Negativa: What does this DELETE, SIMPLIFY, PREVENT?
- Refactor not Repair: Root cause or symptom?
- Complexity Control: Justified complexity increases
- Force Multiplier: Amplifies future value?

**Common failures:**
- ❌ No mention of AFP/SCAS principles
- ❌ Adding without considering deletion
- ✅ Explicit: "Via Negativa: Deletes manual review burden (automates routine checks). Prevents low-value tasks (catches at source). Refactor not Repair: Addresses root cause (no enforcement) not symptom."

### 7. Risk Awareness
**Checks for:**
- Honest assessment of what could go wrong
- Likelihood and impact estimates
- Mitigation strategies

**Common failures:**
- ❌ No risks mentioned (overly optimistic)
- ❌ Trivial risks only
- ✅ Honest: "Risk: Critic too strict → false positives → agent frustration. Likelihood: Medium (DesignReviewer has ~5% false positive rate). Impact: High (erodes trust). Mitigation: Human escalation path, analytics track rate, tune thresholds"

### 8. Intellectual Honesty
**Checks for:**
- Admits unknowns ("unclear", "uncertain", "need to investigate")
- Open questions documented
- Realistic about limitations

**Positive signal:**
- ✅ "Unknown: Will agents game the critic with longer but superficial docs? Mitigation: Monitor analytics, evolve semantic analysis"

### 9. Clear Recommendation
**Checks for:**
- YES/NO/DEFER decision
- Priority, urgency, effort estimate
- Justification for recommendation

**Common failures:**
- ❌ No recommendation (analysis without decision)
- ❌ Unclear action ("we should consider")
- ✅ Clear: "YES - proceed immediately. Priority: Critical. Urgency: Immediate. Effort: Medium (~900 LOC split into 3 sub-tasks). Strong evidence of problem, proven pattern, high ROI."

## How to Use

### Manual Review (Recommended for First Iteration)

```bash
cd tools/wvo_mcp
npm run strategy:review [TASK-ID]
cd ../..
```

**Example:**
```bash
cd tools/wvo_mcp
npm run strategy:review AFP-STRATEGY-THINK-CRITICS-20251105
cd ../..
```

**Exit codes:**
- `0` = Strategy approved, proceed to SPEC phase
- `1` = Strategy needs revision, see concerns below

### Review All Strategies

```bash
cd tools/wvo_mcp
npm run strategy:review
cd ../..
```

Discovers and reviews all `strategy.md` files in `state/evidence/`.

### Pre-commit Hook (Future Integration)

The StrategyReviewer will be integrated into the pre-commit hook (phase 3 integration):
- Automatically runs when you stage `strategy.md`
- Blocks commit if concerns found (exit code 1)
- Forces remediation iteration
- Tracks in `state/analytics/strategy_reviews.jsonl`

## Understanding Feedback

### Severity Levels

**HIGH (🔴):**
- Critical quality issues
- Must fix before approval
- Examples: No problem statement, shallow root cause, no evidence, vague criteria

**MEDIUM (🟡):**
- Important improvements needed
- Should fix for quality, but not blocking
- Examples: Generic language, weak evidence, no AFP/SCAS alignment

**LOW (🔵):**
- Nice-to-have improvements
- Optional enhancements
- Examples: Missing recommendation section, could add more detail

### Approval Outcomes

**✅ APPROVED (proceed):**
- All high-severity concerns addressed
- Strategy shows strong thinking (5+ strengths)
- No concerns or only low-severity suggestions
- **Action:** Proceed to SPEC phase

**⚠️ APPROVED (proceed_with_caution):**
- High-severity concerns resolved
- Some medium/low-severity concerns remain
- Strategy is good enough but has improvement opportunities
- **Action:** Proceed to SPEC phase, consider addressing concerns

**❌ BLOCKED (needs-revision):**
- One or more high-severity concerns
- Strategy quality insufficient
- **Action:** Do remediation work (see below)

## Remediation Workflow

**If StrategyReviewer blocks you, DO NOT just edit strategy.md superficially.**

That's compliance theater and will be rejected again.

### Proper Remediation Steps

**1. DO ACTUAL RESEARCH (30-60 minutes per critical issue):**

**missing_problem_statement:**
- Research the actual problem (grep, file reads, state/analytics/)
- Talk to stakeholders if needed
- Gather specific evidence
- Update strategy.md with findings

**shallow_root_cause:**
- Ask "why" 3-5 times to dig deeper
- Trace the causal chain
- Identify fundamental causes (not symptoms)
- Update strategy.md with deeper analysis

**no_evidence:**
- Gather specific data from codebase
- Count occurrences: `grep -r "pattern" | wc -l`
- Review task history: `ls state/evidence/ | grep REMEDIATION`
- Check metrics: `state/analytics/*.jsonl`
- Update strategy.md with concrete evidence

**vague_success_criteria:**
- Define WHAT you'll measure (specific metric)
- Define HOW you'll measure (tool, file, threshold)
- Define WHEN you'll measure (timeline)
- Update strategy.md with measurable criteria

**vague_impact_assessment:**
- Calculate time saved: tasks prevented * hours per task
- Calculate cost saved: tokens * rate
- Calculate quality impact: defects prevented
- Use ranges if uncertain: 10-20 hours, $10-$20
- Update strategy.md with quantified impact

**2. UPDATE strategy.md with REAL analysis:**
- Show your work: Include evidence, data, examples
- Be specific: Replace vague claims with numbers
- Be honest: Admit unknowns, acknowledge risks
- Think deeply: Go beyond surface observations

**3. RE-RUN StrategyReviewer:**
```bash
cd tools/wvo_mcp && npm run strategy:review [TASK-ID] && cd ../..
```

**4. ITERATE until approved (2-3 rounds is normal):**
- This is EXPENSIVE but NECESSARY
- Better to spend time on strategy than fix bad implementations
- Each iteration should show genuine improvement

## Common Anti-Patterns

### 1. The Generic Problem
**Bad:**
> "The system needs improvement. Quality should be better."

**Good:**
> "Agents skip the STRATEGY phase 40% of the time (evidence: 12 of 30 recent tasks in state/evidence/ lack strategy.md), leading to poor task selection and wasted implementation effort averaging 2.5 hours per remediation."

### 2. The Shallow Root Cause
**Bad:**
> "Agents don't think strategically."

**Good:**
> "No enforcement mechanism exists for STRATEGY phase → agents skip it to save time → poor quality compounds → human review catches it too late → rework costs 10x more (root cause: missing quality gate at phase 1)."

### 3. The Unsupported Claim
**Bad:**
> "I noticed quality issues with recent tasks."

**Good:**
> "Analysis of state/evidence/ shows 12/30 tasks (40%) lack strategy.md. Of those 12, 8 required significant rework (evidence: AFP-*-REMEDIATION-* task IDs). Average remediation time: 2.5 hours per task (measured from git log timestamps)."

### 4. The Vague Criterion
**Bad:**
> "Success means better quality and improved efficiency."

**Good:**
> "Success criteria: (1) 100% of new tasks have strategy.md (measured by pre-commit hook rejection rate < 5%), (2) StrategyReviewer approval rate > 80% on first review (tracked in state/analytics/strategy_reviews.jsonl), (3) Remediation tasks decrease by 30% within 4 weeks (compare state/roadmap.yaml REMEDIATION frequency)."

### 5. The Hand-Wavy Impact
**Bad:**
> "This will have significant impact on quality and efficiency."

**Good:**
> "Impact: Prevent 8 remediation tasks per 30-task cycle (8 * 2.5 hrs = 20 hrs saved). At 50k tokens/hour, save 1M tokens per cycle (~$15 at current rates). Strategic value: proven pattern can extend to THINK phase, SPEC phase (2-3x ROI multiplier)."

### 6. The Overly Optimistic Strategy
**Bad:**
> "This task will solve all our quality problems with no risks."

**Good:**
> "Risk 1: Critic too strict → false positives → agent frustration. Likelihood: Medium. Impact: High. Mitigation: Human escalation path, analytics track rate, tune thresholds. Risk 2: Agents game with longer superficial docs. Likelihood: High. Mitigation: Semantic analysis, evolve based on analytics."

## Quality Examples

### Example: Good Strategy.md

See `state/evidence/AFP-STRATEGY-THINK-CRITICS-20251105/strategy.md` for a comprehensive example of approved strategic thinking.

**Key characteristics:**
- Specific problem statement with evidence (40% compliance rate)
- Deep root cause analysis (5 levels of "why")
- Concrete evidence (file paths, task counts, time estimates)
- Measurable success criteria (quantified targets with tracking)
- Quantified impact (20 hours + 1M tokens = $15 saved per cycle)
- Explicit AFP/SCAS alignment (via negativa, refactor not repair)
- Honest risk assessment (false positives, gaming behavior)
- Open questions acknowledged (unknowns documented)
- Clear recommendation (YES, proceed immediately, high priority)

### Example: Bad Strategy.md (Compliance Theater)

```markdown
# Strategy Analysis

## Problem
The system needs improvement.

## Solution
We should implement a StrategyReviewer.

## Success
Quality will be better.

## Recommendation
Proceed.
```

**Why this fails:**
- Generic problem (what needs improvement?)
- No root cause analysis (why does it need improvement?)
- No evidence (where's the data?)
- Vague criteria (how will you measure "better"?)
- No impact assessment (what's the value?)
- No AFP/SCAS alignment
- No risks considered
- No depth (< 30 lines)

## Metrics and Analytics

All strategy reviews are logged to `state/analytics/strategy_reviews.jsonl`:

```json
{
  "timestamp": "2025-11-05T16:20:57.028Z",
  "task_id": "AFP-STRATEGY-THINK-CRITICS-20251105",
  "approved": true,
  "concerns_count": 2,
  "high_severity_count": 0,
  "strengths_count": 5,
  "summary": "Strategy shows good strategic thinking (5 strengths, 2 concerns)",
  "concerns": [...],
  "strengths": [...]
}
```

**Metrics to track:**
- Approval rate (target: >80% on first review, <100% to avoid rubber-stamping)
- Average concerns per review (should decrease over time as agents learn)
- Time from first submission to approval (should stabilize at 30-90 min)
- False positive rate (target: <10% based on human escalation)
- False negative rate (tasks that slip through but fail later - track remediation correlation)

## FAQ

**Q: Why is the minimum 30 lines?**
A: Strategic thinking requires depth. Generic 10-line docs show you haven't thought deeply enough. Most approved strategies are 40-60 substantive lines.

**Q: What if I don't have quantified data?**
A: Use ranges ("10-20 hours"), estimate honestly ("~1M tokens"), or gather data (grep, file counts, analytics). If truly unknown, say so explicitly and explain why.

**Q: Can I skip strategy for small tasks?**
A: Small tasks (1 file, < 20 LOC) may warrant brief strategy (~20 lines), but you still must think through WHY, WHAT, and impact. The template scales down for simple tasks.

**Q: What if the critic is wrong (false positive)?**
A: Human escalation is always available. Document why you disagree, provide additional evidence, and request manual review from Claude Council or Director Dana.

**Q: How long should remediation take?**
A: 30-60 minutes per high-severity concern for genuine research and analysis. If it takes < 10 minutes, you're probably being superficial.

**Q: Can I use AI to write my strategy?**
A: AI can help structure and format, but the THINKING must be yours. StrategyReviewer detects generic language and unsupported claims. Show your work.

**Q: What happens if I keep failing review?**
A: After 3-4 iterations, escalate to Claude Council or Director Dana. There may be a fundamental misunderstanding or the task may not be viable.

## Integration with Other Critics

**StrategyReviewer (Phase 1: STRATEGIZE):**
- Checks: WHY and WHAT (problem, root cause, evidence, success criteria, impact)
- Focus: Strategic thinking quality

**ThinkingCritic (Phase 4: THINK):**
- Checks: Edge cases, failure modes, assumptions, mitigation
- Focus: Risk and complexity analysis

**DesignReviewer (Phase 5: GATE):**
- Checks: AFP/SCAS principles, alternatives, complexity, implementation plan
- Focus: Design quality and thinking completeness

**Together they form a quality pipeline:**
STRATEGIZE (StrategyReviewer) → ... → THINK (ThinkingCritic) → GATE (DesignReviewer) → IMPLEMENT

Each enforces quality at its phase, preventing bad decisions from propagating downstream.

## Version History

- **v1.0** (2025-11-05): Initial release
  - 9 quality dimensions
  - Intelligent analysis with anti-gaming measures
  - Analytics tracking
  - Adaptive thresholds based on agent experience

---

**Remember:** StrategyReviewer is not a bureaucratic blocker. It's a thinking partner that ensures your work is based on solid strategic analysis, not rushed assumptions.

**Quality takes time. Strategy is where that time has the highest ROI.**
