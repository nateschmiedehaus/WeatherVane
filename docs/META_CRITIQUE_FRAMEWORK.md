# Meta-Critique Framework - Teaching Autopilot to Think Critically

**Date:** 2025-10-19
**Purpose:** Enable autopilot to generate deep, insightful critiques of its own work

---

## Problem Statement

**Current state:** Autopilot executes tasks blindly
- Follows instructions without questioning assumptions
- Doesn't notice when it's building the wrong thing
- Can't detect scope-reality gaps
- No awareness of foundational issues

**Desired state:** Autopilot thinks critically
- Questions its own assumptions
- Identifies gaps in understanding
- Spots when planning is disconnected from reality
- Generates actionable critiques

---

## Meta-Critique Dimensions

### Framework: 3D Analysis (Deeper/Wider/Narrower)

**DEEPER - Foundational Questions**
```
Ask: "What foundations are missing?"

Categories:
1. Data foundations
   - Do we have the data this requires?
   - Is the data quality verified?
   - How do we know data isn't corrupted?

2. Conceptual foundations
   - Do we understand the problem correctly?
   - Have we proven our hypothesis?
   - What are we assuming without verification?

3. Infrastructure foundations
   - What happens when systems fail?
   - Do we have observability?
   - Can we debug when it breaks?

4. Scientific foundations
   - Have we tested our assumptions?
   - Do we have ground truth?
   - How do we measure success?
```

**WIDER - Cross-Cutting Concerns**
```
Ask: "What are we ignoring that affects everything?"

Categories:
1. Non-functional requirements
   - Privacy/compliance (GDPR?)
   - Security (encryption, access control?)
   - Performance (latency, throughput?)
   - Cost (token usage, API costs?)

2. System-wide issues
   - Multi-tenancy (data isolation?)
   - Versioning (which model made this decision?)
   - Audit trail (why did it do that?)
   - Error handling (what if X fails?)

3. Organizational concerns
   - Documentation drift (docs vs code?)
   - Knowledge transfer (can others understand?)
   - Maintenance burden (technical debt?)
   - Operational complexity (can we run this?)
```

**NARROWER - Specific Technical Details**
```
Ask: "What specific technical issues will bite us?"

Categories:
1. API constraints
   - Rate limits (will we exceed?)
   - Minimums/maximums (platform constraints?)
   - Authentication (expiry, rotation?)

2. Data format issues
   - Numeric precision (float vs Decimal for money?)
   - Time zones (UTC vs local?)
   - Currency conversion (multi-currency?)

3. Edge cases
   - Missing data (how to handle?)
   - Outliers (Black Friday skews model?)
   - Zero/negative values (divide by zero?)
   - Null/undefined (error handling?)

4. Integration details
   - Webhook reliability (what if missed?)
   - Schema changes (API v2 vs v3?)
   - Backward compatibility (can old clients use?)
```

---

## Critique Generation Process

### Step 1: Scope Analysis

**Prompt for autopilot:**
```
Analyze the scope of [EPIC/MILESTONE/TASK]:

1. List all claimed features/capabilities
2. For each claim, answer:
   - Is this implemented? (check code)
   - Is this tested? (check tests)
   - Is this documented? (check docs)
   - What's the implementation maturity? (placeholder/partial/complete)

3. Calculate gap:
   - Planned features: N
   - Implemented features: M
   - Gap: (N - M) / N = X%

4. If gap > 50%, this is a RED FLAG
   - Why is scope so much larger than implementation?
   - Are we over-planning?
   - Are we under-delivering?
   - Should we descope or increase effort?
```

**Output format:**
```json
{
  "epic": "E13 - ML & Causality",
  "scope_analysis": {
    "planned_features": 50,
    "implemented_features": 5,
    "placeholder_features": 12,
    "partial_features": 3,
    "complete_features": 2,
    "gap_percentage": 0.90,
    "severity": "CRITICAL",
    "recommendation": "Reduce scope by 80% or increase implementation effort 10x"
  }
}
```

### Step 2: Assumption Validation

**Prompt for autopilot:**
```
Identify assumptions in [TASK/EPIC]:

For each assumption, answer:
1. What are we assuming? (be explicit)
2. Have we verified this assumption? (experiment, test, data check)
3. What happens if assumption is wrong?
4. How risky is this assumption? (low/medium/high/critical)

Examples of assumptions to look for:
- "We assume weather affects sales" → Verified with experiment?
- "We assume 90+ days of data available" → Checked database?
- "We assume propensity scoring works" → Is weather randomizable?
- "We assume customers want automation" → User interviews done?

For each HIGH or CRITICAL risk assumption:
- Create verification task
- Block dependent work until verified
```

**Output format:**
```json
{
  "assumptions": [
    {
      "assumption": "Weather affects sales significantly",
      "verified": false,
      "verification_method": "None - no experiment run",
      "if_wrong": "Entire business value proposition invalid",
      "risk": "CRITICAL",
      "action": "Create task: Run A/B test comparing weather-aware vs baseline recommendations"
    },
    {
      "assumption": "90+ days of sales data available",
      "verified": false,
      "verification_method": "None - not checked database",
      "if_wrong": "Cannot train MMM (insufficient data)",
      "risk": "CRITICAL",
      "action": "Create task: Validate data availability with SQL query"
    }
  ]
}
```

### Step 3: Method Appropriateness Check

**Prompt for autopilot:**
```
For ML/statistical tasks, verify methodology:

1. What is the problem type?
   - Classification? Regression? Causal inference? Optimization?

2. What method are we using?
   - Extract from code/docs

3. Is this method appropriate for this problem?
   - Check against methodology lookup table
   - Common errors:
     * Propensity scoring for observational data (need DID instead)
     * Linear regression for non-linear problems (need trees/NN)
     * Random train/test split for time series (need TimeSeriesSplit)
     * Deep learning for small data (need gradient boosting)
     * Correlation for causation (need experiments/DID)

4. What are the method's requirements?
   - Data volume? (Deep learning needs 10k+ samples)
   - Assumptions? (Linear regression assumes linearity)
   - Transformations? (MMM needs adstock)

5. Do we meet these requirements?
   - Check data volume
   - Check for required transformations in code
   - Check assumptions are validated

If method is WRONG or requirements UNMET:
- Flag as CRITICAL
- Suggest correct method
- Create task to fix
```

**Output format:**
```json
{
  "task": "T13.2.1 - Implement MMM",
  "problem_type": "media_mix_modeling",
  "method_used": "Linear regression with hardcoded elasticity",
  "appropriate": false,
  "issues": [
    {
      "issue": "Using hardcoded elasticity instead of learned parameters",
      "severity": "CRITICAL",
      "correct_method": "LightweightMMM or Robyn with Bayesian parameter estimation"
    },
    {
      "issue": "No adstock transformation found in code",
      "severity": "CRITICAL",
      "correct_approach": "Add carryover: adstocked[t] = spend[t] + decay * adstocked[t-1]"
    },
    {
      "issue": "No saturation curves",
      "severity": "HIGH",
      "correct_approach": "Add Hill saturation to capture diminishing returns"
    }
  ]
}
```

### Step 4: Dependency Reality Check

**Prompt for autopilot:**
```
For each task, verify dependencies are REAL not theoretical:

1. Code dependencies
   - Can we actually import the package?
   - Run: python -c "import package_name"
   - If fails, it's theoretical not real

2. Data dependencies
   - Does the file/table exist?
   - Run: SELECT COUNT(*) FROM table
   - If empty or missing, it's theoretical

3. API dependencies
   - Can we reach the API?
   - Run: curl -I https://api.example.com
   - Check rate limits, costs, authentication

4. Upstream task dependencies
   - Is upstream task actually complete?
   - Check: status = "done" AND critique passed AND tests pass
   - Don't trust status alone (might be placeholder)

For each MISSING or THEORETICAL dependency:
- Flag as blocker
- Create task to resolve
- Mark current task as blocked
```

**Output format:**
```json
{
  "task": "T13.2.1 - Train MMM",
  "dependencies_check": {
    "code_imports": {
      "required": ["robyn", "jax", "numpy"],
      "available": ["numpy"],
      "missing": ["robyn", "jax"],
      "status": "BLOCKED"
    },
    "data_requirements": {
      "required": ["sales_daily with 90+ rows"],
      "actual": ["sales_daily with 30 rows"],
      "status": "INSUFFICIENT"
    },
    "upstream_tasks": {
      "required": ["T13.1.1"],
      "status_claimed": "done",
      "actually_complete": false,
      "issue": "T13.1.1 marked done but critics found placeholder code",
      "status": "BLOCKED"
    },
    "overall": "BLOCKED - Cannot proceed until dependencies satisfied"
  }
}
```

### Step 5: Foundational Gap Analysis

**Prompt for autopilot:**
```
Check for foundational issues that block everything:

1. Data quality framework
   - How do we know data is good?
   - Do we validate: volume, completeness, outliers, gaps?
   - Can we trust the data for ML?

2. Experimentation framework
   - How do we test hypotheses?
   - Can we run A/B tests?
   - Do we have baseline metrics?

3. Observability framework
   - Can we debug when it breaks?
   - Do we log predictions, features, errors?
   - Can we trace: input → model → output?

4. Validation framework
   - How do we know it works?
   - Backtesting? Shadow mode? A/B tests?
   - Do we measure ROAS improvement?

5. Error handling framework
   - What happens when API is down?
   - What happens when model predicts negative?
   - What happens when data is missing?

For each missing framework:
- Estimate impact: "Without this, X% of features will fail"
- Prioritize: Which to build first?
- Create epic/milestone to address
```

**Output format:**
```json
{
  "foundational_gaps": [
    {
      "framework": "Data quality validation",
      "exists": false,
      "impact": "Without this, we might train models on corrupted data",
      "risk": "CRITICAL",
      "priority": 1,
      "recommendation": "Create epic for data quality framework before any ML training"
    },
    {
      "framework": "Model observability",
      "exists": false,
      "impact": "Without this, we can't debug model failures in production",
      "risk": "HIGH",
      "priority": 2,
      "recommendation": "Add logging for predictions, features, errors"
    }
  ]
}
```

### Step 6: Technical Debt & Complexity Analysis

**Prompt for autopilot:**
```
Measure complexity and technical debt:

1. Code complexity
   - Cyclomatic complexity (avg per file)
   - Dependency depth
   - Lines of code vs functionality ratio

2. Test coverage
   - % of code covered by tests
   - % of critical paths tested
   - Test quality (unit vs integration vs e2e)

3. Documentation coverage
   - % of functions documented
   - Docs-code alignment (do docs match reality?)
   - Examples provided?

4. Build/deploy complexity
   - Time to build
   - Time to deploy
   - Number of manual steps

5. Operational complexity
   - Number of services to monitor
   - Failure modes to handle
   - Runbooks documented?

Calculate technical debt score:
- Low debt: <20% files with high complexity, >70% test coverage, docs aligned
- Medium debt: 20-50% complex files, 40-70% coverage, some doc drift
- High debt: >50% complex, <40% coverage, significant drift

If HIGH debt:
- Recommend: Pause features, focus on cleanup
- Or: Rewrite from scratch if >70% of code is problematic
```

**Output format:**
```json
{
  "complexity_analysis": {
    "code_complexity": {
      "avg_cyclomatic": 12,
      "threshold": 10,
      "status": "CONCERNING"
    },
    "test_coverage": {
      "percentage": 35,
      "threshold": 70,
      "status": "INSUFFICIENT"
    },
    "documentation": {
      "coverage": 40,
      "alignment": 50,
      "status": "POOR"
    },
    "technical_debt_score": "HIGH",
    "recommendation": "Pause new features, spend 2 weeks on: test coverage +35%, refactor complex modules, align docs"
  }
}
```

---

## Integration into Autopilot

### Trigger Points for Meta-Critique

**1. Epic Completion**
- When epic reaches 75% done
- Run meta-critique on entire epic
- Generate report: gaps, assumptions, technical debt

**2. Weekly Review**
- Every Monday (or N cycles)
- Run meta-critique on active work
- Identify: scope creep, assumption drift, technical debt growth

**3. Pre-Release Review**
- Before marking milestone "ready for production"
- Run all critique dimensions
- Block release if CRITICAL issues found

**4. On-Demand**
- User triggers: `/critique [epic/task]`
- Or autopilot triggers: After 3 failed attempts at same task

### Autopilot Prompt Enhancement

**Add to autopilot system prompt:**
```
You are not just a task executor - you are a CRITICAL THINKER.

Before completing any task, ask yourself:

**DEEPER:**
- What foundations am I assuming exist?
- Have I verified my assumptions?
- What data/infrastructure/understanding is missing?

**WIDER:**
- What cross-cutting concerns am I ignoring?
- Security? Privacy? Cost? Observability?
- What will break when this scales?

**NARROWER:**
- What specific technical details will bite me?
- Rate limits? Time zones? Numeric precision?
- What edge cases haven't I considered?

**Meta-Critique Frequency:**
- After completing each EPIC: Run full 3D analysis
- Weekly: Check for scope-reality gaps
- Before "done": Verify no placeholder code, all tests pass, docs aligned

**Output Format:**
When you complete meta-critique, produce a report:
1. Scope analysis (planned vs implemented)
2. Assumption validation (what we're guessing)
3. Method appropriateness (using right algorithms?)
4. Dependency reality (theoretical vs actual)
5. Foundational gaps (missing frameworks)
6. Technical debt score

**Action on findings:**
- CRITICAL gaps → Create blocking tasks immediately
- HIGH gaps → Create high-priority tasks
- MEDIUM gaps → Document for future work
- Generate critique document: docs/CRITIQUE_{epic}_{date}.md
```

---

## Critique Document Template

**File:** `docs/CRITIQUE_{epic}_{date}.md`

```markdown
# Meta-Critique: {Epic Name}

**Date:** {ISO timestamp}
**Critic:** Autopilot Meta-Reviewer
**Epic:** {Epic ID and name}
**Status:** {Overall assessment}

---

## Executive Summary

**Scope Reality Gap:** {Planned vs Implemented percentage}
**Critical Issues:** {Number of blocking issues}
**High-Priority Issues:** {Number of high issues}
**Overall Risk:** {LOW/MEDIUM/HIGH/CRITICAL}

**Recommendation:** {1-sentence action}

---

## Deeper Analysis (Foundational)

### Missing Foundations

{For each missing framework:}
- **Framework:** {Name}
- **Impact:** {What breaks without this}
- **Risk:** {CRITICAL/HIGH/MEDIUM/LOW}
- **Recommendation:** {Create epic X, implement Y}

### Unvalidated Assumptions

{For each assumption:}
- **Assumption:** {What we're assuming}
- **Verified:** {Yes/No}
- **If Wrong:** {Impact}
- **Action:** {Verification task}

---

## Wider Analysis (Cross-Cutting)

### Missing Concerns

{For each concern:}
- **Concern:** {Privacy, Security, Cost, etc}
- **Current State:** {What we have}
- **Gap:** {What's missing}
- **Risk:** {Impact if ignored}

---

## Narrower Analysis (Technical)

### Technical Debt

- **Code Complexity:** {Score}
- **Test Coverage:** {Percentage}
- **Documentation:** {Alignment score}
- **Overall Debt:** {HIGH/MEDIUM/LOW}

### Specific Issues

{For each technical issue:}
- **Issue:** {Rate limits, time zones, etc}
- **Current:** {What we do now}
- **Problem:** {What will break}
- **Fix:** {Recommendation}

---

## Method Appropriateness

{For each ML/statistical task:}
- **Task:** {ID and name}
- **Problem Type:** {Classification, MMM, Causal, etc}
- **Method Used:** {Current approach}
- **Appropriate:** {Yes/No}
- **Issues:** {List problems}
- **Correct Method:** {Recommendation}

---

## Recommendations by Priority

### CRITICAL (Block release until fixed)

1. {Issue 1}
   - **Impact:** {Why critical}
   - **Fix:** {What to do}
   - **Task:** {Create T.X.X}

### HIGH (Fix within 1 week)

1. {Issue 1}
   - **Impact:** {Why high}
   - **Fix:** {What to do}

### MEDIUM (Fix within 1 month)

1. {Issue 1}

---

## Follow-Up Tasks Created

{List of tasks auto-created based on critique}

- [ ] T.X.X - {Task name} (Priority: CRITICAL)
- [ ] T.X.Y - {Task name} (Priority: HIGH)

---

## Metrics

- **Scope Gap:** {N}% unimplemented
- **Assumption Risk:** {N} critical unvalidated assumptions
- **Technical Debt:** {HIGH/MEDIUM/LOW}
- **Method Errors:** {N} incorrect algorithms detected

**Next Review:** {Date} (or after epic completion)
```

---

## Implementation

### 1. Create Meta-Critique Critic

**File:** `tools/wvo_mcp/src/critics/meta_critique.ts`

```typescript
export class MetaCritiqueCritic {
  async critique(epic: Epic): Promise<MetaCritiqueReport> {
    // Run all 6 analysis steps
    const scopeAnalysis = await this.analyzeScopeGap(epic);
    const assumptions = await this.validateAssumptions(epic);
    const methods = await this.checkMethodology(epic);
    const dependencies = await this.checkDependencies(epic);
    const foundations = await this.analyzeFoundations(epic);
    const techDebt = await this.analyzeTechnicalDebt(epic);

    // Aggregate findings
    const criticalIssues = this.findCriticalIssues([
      scopeAnalysis,
      assumptions,
      methods,
      dependencies,
      foundations,
      techDebt
    ]);

    // Generate report
    return {
      epic: epic.id,
      timestamp: new Date().toISOString(),
      scopeGap: scopeAnalysis.gapPercentage,
      criticalIssues: criticalIssues.length,
      risk: this.calculateOverallRisk(criticalIssues),
      recommendations: this.generateRecommendations(criticalIssues),
      followUpTasks: this.createFollowUpTasks(criticalIssues)
    };
  }
}
```

### 2. Add to Roadmap

**New tasks:**

```yaml
- id: T13.4.3
  title: Implement meta-critique framework for autopilot self-reflection
  status: pending
  dependencies: []
  exit_criteria:
    - tools/wvo_mcp/src/critics/meta_critique.ts implements 6 analysis dimensions
    - Autopilot runs meta-critique after epic completion
    - Meta-critique generates docs/CRITIQUE_{epic}_{date}.md reports
    - Critical findings auto-create blocking tasks
  description: >
    Enable autopilot to generate deep critiques of its own work using the
    3D analysis framework (deeper/wider/narrower). Teaches autopilot to
    think critically about assumptions, scope, methodology, and technical debt.
```

### 3. Enhance Autopilot Prompt

**Add to** `tools/wvo_mcp/scripts/autopilot.sh` **prompt section:**

```bash
**META-CRITIQUE DIRECTIVE:**

You are not just executing tasks - you are a CRITICAL THINKER.

Periodically (after epic completion or weekly), run meta-critique:

1. **Scope Analysis:** Planned vs implemented? Gap > 50% = RED FLAG
2. **Assumption Validation:** What am I assuming without proof?
3. **Method Check:** Am I using the right algorithm for this problem?
4. **Dependency Reality:** Do dependencies actually exist or are they theoretical?
5. **Foundation Check:** What critical frameworks are missing?
6. **Technical Debt:** Is complexity growing? Test coverage declining?

Output meta-critique to: docs/CRITIQUE_{epic}_{date}.md

If CRITICAL issues found:
- Create blocking tasks immediately
- Update roadmap with findings
- Add to context.md
```

---

## Example Meta-Critique Output

**Generated by autopilot for E13:**

```markdown
# Meta-Critique: E13 - ML & Causality Implementation

**Date:** 2025-10-19T12:00:00Z
**Critic:** Autopilot Meta-Reviewer
**Epic:** E13 - ML & Causality
**Status:** CRITICAL ISSUES FOUND

---

## Executive Summary

**Scope Reality Gap:** 90% unimplemented (50 features planned, 5 implemented)
**Critical Issues:** 7 blocking issues found
**High-Priority Issues:** 12 high issues
**Overall Risk:** CRITICAL

**Recommendation:** BLOCK epic progression until foundations built and scope reduced 80%.

---

## CRITICAL Issue #1: Scope-Reality Mismatch

**Finding:** Docs plan LSTM + Attention + Hierarchical Bayesian models, but code has `elasticity = 0.15` (hardcoded).

**Gap:** 90% of planned ML sophistication not implemented.

**Root Cause:** Planning ambitious features without verifying foundations exist.

**Impact:** Wasting effort on advanced planning while basics are broken.

**Recommendation:**
1. Reduce scope to: Basic MMM with Robyn (drop LSTM, Bayesian for now)
2. Ship basic MMM first, iterate to advanced features later
3. Create task: T13.2.0 - Verify MMM basics work before planning advanced features

---

## CRITICAL Issue #2: Unvalidated Core Assumption

**Assumption:** "Weather significantly affects sales"

**Verified:** NO - No experiment run, no statistical test

**If Wrong:** Entire business value proposition invalid

**Impact:** Building weather-aware platform without proving weather matters

**Recommendation:**
1. Create task: T13.0.1 - Run experiment: Compare sales in cold vs warm weeks
2. Statistical test: t-test p < 0.05 required to proceed
3. BLOCK all ML work until hypothesis validated

---

## CRITICAL Issue #3: Wrong Causal Method

**Task:** T13.3.1 - Causal inference

**Method Used:** Propensity score matching

**Problem:** Cannot use propensity scoring for weather (weather is not randomizable)

**Correct Method:** Difference-in-Differences or Synthetic Control

**Impact:** Results will be scientifically invalid

**Recommendation:**
1. Replace apps/model/causal_uplift.py PropensityScoreMatching with DID
2. Validate parallel trends assumption
3. Create test: test_no_propensity_scoring_for_weather()

---

{Continue for all 7 critical issues...}

---

## Follow-Up Tasks Auto-Created

- [x] T13.0.1 - Validate weather-sales hypothesis with experiment (CRITICAL)
- [x] T13.0.2 - Implement data quality framework (CRITICAL)
- [x] T13.2.0 - Ship basic MMM before planning advanced features (CRITICAL)
- [x] T13.3.0 - Replace propensity scoring with DID (CRITICAL)
- [ ] T13.4.4 - Add model observability (HIGH)
- [ ] T13.4.5 - Document failure modes (HIGH)

**Next Review:** 2025-10-26 (after critical tasks completed)
```

---

## Summary

**What this enables:**

1. **Autopilot generates deep critiques** (like the one I just provided)
2. **Thinks in 3 dimensions** (deeper/wider/narrower)
3. **Questions its own assumptions**
4. **Detects scope-reality gaps**
5. **Spots methodological errors**
6. **Auto-creates fix tasks**

**Key innovation:** Not just checking rules, but **reasoning about the work**.

**Next step:** Implement meta-critique critic and add trigger points to autopilot loop.
