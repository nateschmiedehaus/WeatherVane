# STRATEGIZE: FIX-META-TEST-GAMING

**Task ID**: FIX-META-TEST-GAMING
**Date**: 2025-10-30
**Source**: META-TESTING-STANDARDS REVIEW (Gap 3, deferred in FIX-META-TEST-ENFORCEMENT)

---

## Problem Statement (Surface Level)

**Gap identified**: Gaming detection deferred from FIX-META-TEST-ENFORCEMENT (AC6)

**Surface problem**: Need to detect when agents claim verification levels without actually doing the work (trivial tests, mock abuse, cherry-picked evidence)

---

## Problem Reframing (Deep Thinking)

### Question the Problem

**Is this the right problem to solve?**

Surface problem: "Detect gaming patterns (trivial tests, mock-only integration tests)"

**Real problem**: How do we distinguish genuine verification attempts from compliance theater?

**Why this distinction matters**:
- Simply checking for assertions could be gamed ("add assert(true)")
- Mock detection could penalize legitimate unit tests
- Need to understand **intent**: Is agent trying to verify, or trying to pass checks?

**Root cause**: Verification standards create pressure → pressure creates gaming incentives → gaming undermines standards

### Reframe the Goals

**What are we actually trying to achieve?**

NOT: "Catch agents gaming the system"

ACTUALLY: "Ensure verification evidence reflects genuine testing effort"

**Deeper goal**: Make gaming harder than doing real verification

**Insight**: Gaming detection is fundamentally about **evidence quality**, not just presence/absence of patterns

### What's the Elegant Solution?

**Option 1 (Surface fix)**: Static analysis for assertions, mock counts, deferral keywords
- Pros: Fast, automated, catches obvious gaming
- Cons: Brittle (easily gamed with "assert(true)"), false positives on legitimate code

**Option 2 (Semantic analysis)**: Parse test assertions to validate they're meaningful
- Pros: Detects "assert(true)" gaming
- Cons: Complex (need to understand what assertions mean), high false positive risk

**Option 3 (Heuristic scoring)**: Combine multiple weak signals (assertion count, mock ratio, evidence completeness, deferral quality)
- Pros: Harder to game (need to game multiple dimensions), probabilistic (not binary pass/fail)
- Cons: More complex, requires tuning thresholds

**Option 4 (Evidence-based review)**: Don't automate gaming detection, strengthen human/LLM review with gaming checklist
- Pros: Flexible, adapts to new gaming patterns, fewer false positives
- Cons: Not automated, requires reviewer training

**Option 5 (Adversarial LLM reviewer)**: Use LLM to read evidence and assess "does this feel like genuine verification?"
- Pros: Semantic understanding, adapts to context, can explain reasoning
- Cons: Expensive (tokens), slower, non-deterministic

**CHOSEN**: Option 3 + Option 5 hybrid: **Heuristic Scoring + LLM Spot-Checks**

**Why this wins**:
- Heuristic scoring (fast, cheap) flags suspicious tasks
- LLM review (slow, expensive) validates flagged tasks
- Combines automation with semantic understanding
- Avoids false positives from pure static analysis
- Can be tuned: Start with loose heuristics → tighten as gaming patterns emerge

### Long-Term Considerations

**5-year vision**: Gaming becomes harder than genuine verification (deterrence through difficulty)

**How to get there**:
1. Build multi-signal heuristic scoring (assertion quality, mock usage, evidence completeness, deferral reasonableness)
2. Use LLM adversarial review for borderline cases
3. Learn from gaming attempts (update heuristics when new patterns emerge)
4. Make standards clear (agents know what genuine verification looks like)
5. Reduce gaming incentives (make verification easier, not just detection better)

**What scales**: Probabilistic scoring + adaptive learning, not rigid rules

---

## Strategic Alternatives

### Alternative 1: Static Analysis Only
**Approach**: Check for assertions, count mocks, validate deferral keywords statically

**Detection Rules**:
- **Trivial tests**: Test files with 0 assertions OR all assertions are `assert(true)` / `expect(true).toBe(true)`
- **Mock abuse**: Integration tests (Level 3) where >80% of dependencies are mocked
- **Weak deferrals**: Deferral justifications containing "don't have time", "will do later", <20 words

**Pros**:
- Fast (milliseconds per task)
- Deterministic (same input → same output)
- Easy to explain (clear rules)

**Cons**:
- Brittle (easily gamed: "assert(1 + 1 === 2)")
- False positives (legitimate code flagged)
- Arms race (detect pattern → agent adapts → detect new pattern → repeat)

**Kill trigger**: If gaming continues despite detection (agents adapt patterns faster than we update rules)

---

### Alternative 2: Semantic Code Analysis
**Approach**: Parse test code ASTs, analyze what assertions actually check

**Detection Logic**:
- **Trivial assertions**: Parse assertion expressions, check if they test constants (assert(true), assert(1 === 1))
- **Weak assertions**: Check if assertions reference function outputs vs hardcoded values
- **Mock quality**: Analyze whether mocks reflect real API contracts vs empty stubs

**Pros**:
- Catches deeper gaming (assert(true) vs assert(1 === 1))
- Semantic understanding (what is being tested)
- Harder to game (requires understanding what "meaningful" means)

**Cons**:
- Complex implementation (AST parsing, expression analysis)
- Language-specific (TypeScript vs Python vs ...)
- Still brittle (can game by testing trivial properties)
- High false positive risk (legitimate tests flagged)

**Kill trigger**: If implementation complexity >10 hours OR false positive rate >20%

---

### Alternative 3: Evidence Completeness Scoring
**Approach**: Score evidence quality holistically, not just specific patterns

**Scoring Dimensions**:
- **Assertion Quality** (0-10): Test count, assertion count, assertion diversity
- **Integration Evidence** (0-10): Real API calls, auth, error handling, edge cases
- **Documentation Quality** (0-10): Evidence clarity, screenshots, outputs, reasoning
- **Deferral Quality** (0-10): Justification length, specificity, risk analysis, mitigation plan

**Formula**: `evidence_score = weighted_average([assertion, integration, docs, deferral])`

**Thresholds**:
- Score <4: High gaming risk → flag for LLM review
- Score 4-7: Medium risk → random spot-check
- Score >7: Low risk → approve

**Pros**:
- Multi-dimensional (harder to game all dimensions)
- Probabilistic (not binary pass/fail)
- Tunable (adjust weights as gaming patterns emerge)
- Captures intent (holistic quality vs specific patterns)

**Cons**:
- Requires tuning (what are right weights/thresholds?)
- Some subjectivity (how to score "documentation quality"?)
- May miss specific gaming patterns (focus on overall quality)

**Kill trigger**: If too many false positives (score <4 but genuine verification) OR too permissive (gaming passes with score >7)

---

### Alternative 4: Human/LLM Review Only
**Approach**: Don't automate detection, strengthen review process with gaming checklist

**Review Checklist**:
- [ ] Do tests have meaningful assertions? (not just `assert(true)`)
- [ ] Are integration tests using real dependencies? (or justified mocks)
- [ ] Is evidence complete? (test outputs, error cases, edge cases)
- [ ] Are deferrals justified? (specific reason, not "don't have time")
- [ ] Does evidence "feel" genuine? (gut check)

**Pros**:
- Flexible (adapts to new gaming patterns without code changes)
- Semantic understanding (human/LLM grasps intent)
- Fewer false positives (context-aware)
- Scales to complex gaming (not just pattern matching)

**Cons**:
- Not automated (requires reviewer for every task)
- Expensive (LLM tokens) or slow (human time)
- Non-deterministic (different reviewers may disagree)
- Doesn't scale to high task volumes

**Kill trigger**: If review time >5 min per task OR LLM cost >$0.50 per task

---

### Alternative 5 (RECOMMENDED): Heuristic Scoring + LLM Spot-Checks

**Approach**: Combine fast heuristic screening with expensive LLM review for suspicious cases

**Two-Stage Detection**:

**Stage 1: Heuristic Scoring** (fast, cheap, automated)
- Calculate evidence score (0-10) using multiple signals:
  - Assertion count/quality (basic checks, not semantic)
  - Mock ratio (% of dependencies mocked in integration tests)
  - Evidence completeness (test outputs present? error cases documented?)
  - Deferral quality (justification length, specificity)
- Flag tasks with score <5 for Stage 2

**Stage 2: LLM Adversarial Review** (slow, expensive, semantic)
- Run flagged tasks through LLM with adversarial prompt:
  - "Does this evidence reflect genuine verification or compliance theater?"
  - "Are test assertions meaningful or trivial?"
  - "Are integration tests actually testing integration?"
  - "Is the deferral justification reasonable?"
- LLM returns: GENUINE | SUSPICIOUS | GAMING with reasoning

**Thresholds**:
- Heuristic score <3: Auto-flag as HIGH RISK → LLM review
- Heuristic score 3-5: Flag as MEDIUM RISK → LLM review (random 50%)
- Heuristic score >5: LOW RISK → no review (trust heuristic)
- LLM says GAMING: Reject evidence, require re-verification
- LLM says SUSPICIOUS: Return to IMPLEMENT, request better evidence
- LLM says GENUINE: Approve despite low heuristic score (edge case)

**Pros**:
- Best of both: Fast heuristic + semantic LLM
- Cost-effective: Most tasks skip LLM review
- Adaptive: Update heuristics based on LLM findings
- Fewer false positives: LLM validates borderline cases
- Scales: Heuristics handle volume, LLM handles complexity

**Cons**:
- Two-stage complexity (build heuristics + LLM prompts)
- LLM cost for flagged tasks (~10-20% of tasks?)
- Still requires tuning (thresholds, weights)

**Why this wins**: Balances automation (cheap, fast) with intelligence (semantic, adaptive)

---

## Gaming Pattern Taxonomy

### Pattern 1: Trivial Tests
**Description**: Tests that run but don't validate anything meaningful

**Examples**:
```typescript
// GAMING: No assertions
it('should run function', () => {
  myFunction(); // No validation
});

// GAMING: Trivial assertion
it('should work', () => {
  expect(true).toBe(true);
});

// GAMING: Tautology
it('should return input', () => {
  expect(identity(5)).toBe(5); // Trivial logic
});
```

**Detection**:
- Heuristic: Test files with assertion_count < 1 per test OR assertions checking constants
- LLM: "Are these assertions testing real behavior or just calling functions?"

**False Positive Risk**: MEDIUM (some tests legitimately have few assertions)

---

### Pattern 2: Mock-Only Integration Tests
**Description**: Claiming Level 3 (integration) when all dependencies are mocked

**Examples**:
```typescript
// GAMING: All mocked, no real API
describe('API Integration', () => {
  it('fetches weather data', async () => {
    const mockAPI = jest.fn().mockResolvedValue({temp: 72});
    const result = await fetchWeather(mockAPI);
    expect(result.temp).toBe(72);
  });
});
```

**Detection**:
- Heuristic: Count mocks/stubs (jest.fn, sinon.stub) vs real API calls (fetch, http.get)
- LLM: "Is this actually testing integration with real dependencies?"

**False Positive Risk**: HIGH (unit tests legitimately mock dependencies)

**Mitigation**: Only flag if task claims Level 3 AND mock_ratio > 80%

---

### Pattern 3: Cherry-Picked Evidence
**Description**: Showing only passing tests, hiding failures

**Examples**:
```markdown
## Test Results

✅ 5/5 tests passing

<shows passing tests>

<doesn't mention 10 other tests that failed>
```

**Detection**:
- Heuristic: Check if evidence shows selective output (grep output but not full test run)
- LLM: "Does this evidence feel complete or cherry-picked?"

**False Positive Risk**: LOW (hard to accidentally cherry-pick)

---

### Pattern 4: Weak Deferral Justifications
**Description**: Deferring Level 3 with vague or lazy reasoning

**Examples**:
```markdown
## Level 3: Integration Testing ⏳ DEFERRED

**Reason**: Don't have time
**Justification**: Will do later

<no risk analysis, no mitigation plan>
```

**Detection**:
- Heuristic: Deferral justification <30 words OR contains ["don't have time", "will do later", "too busy"]
- LLM: "Is this a reasonable deferral justification with risk analysis?"

**False Positive Risk**: LOW (weak justifications are obviously weak)

---

### Pattern 5: False Documentation (Rare but Severe)
**Description**: Claiming tests exist when they don't, fabricating outputs

**Examples**:
```markdown
## Level 2: Smoke Testing ✅

Ran tests: `npm test`

Output:
```
15/15 tests passing
```

<but no test files actually exist in the codebase>
```

**Detection**:
- Heuristic: Cross-reference evidence claims with filesystem (do test files exist?)
- LLM: Cannot detect (would need code access)

**False Positive Risk**: N/A (this is outright fraud, not pattern matching)

---

## Why Now?

**Timing**: FIX-META-TEST-ENFORCEMENT establishes detection → perfect time to add gaming detection

**Urgency**: LOW-MEDIUM - Standards are new, gaming hasn't emerged yet (preventive measure)

**Risk of waiting**: If FIX-META-TEST-ENFORCEMENT deploys without gaming detection, agents may learn to game basic checks before we catch them

---

## Strategic Worthiness

### Why is this worth doing?

**Problem severity**: MEDIUM
- Gaming hasn't occurred yet (standards just established)
- But standards without gaming detection invite exploitation
- Prevention is cheaper than remediation

**Value**: Maintains integrity of verification standards, prevents gaming arms race

**Alternatives considered**: 5 alternatives evaluated (static, semantic, heuristic, human, hybrid)

### Why NOT do this?

**Do Nothing** option:
- Wait for gaming to emerge before building detection
- Risk: Gaming becomes normalized before we catch it
- Cost: Standards lose credibility

**Why Do Nothing fails**: Prevention is easier than detection after the fact

**Counterpoint**: Gaming may never emerge if standards are clear and verification is easy

**Rebuttal**: Gaming incentives exist whenever standards exist (better to prevent than assume good faith)

---

## Success Metrics

**Short-term (30 days after deployment)**:
- Heuristic scoring works (flags <20% of tasks as suspicious)
- LLM review is accurate (>80% agreement with manual review)
- False positive rate <10% (flagged tasks that weren't gaming)

**Medium-term (60 days)**:
- Gaming attempts detected (if any occur)
- Zero false completions due to gaming
- Agent feedback: "Gaming detection is fair"

**Long-term (90 days)**:
- Gaming becomes rare (deterrent effect)
- Detection adapts to new patterns (heuristics updated)
- Cost-effective (<$0.10 per task for LLM spot-checks)

---

## Strategic Decision

**CHOSEN**: Alternative 5 - Heuristic Scoring + LLM Spot-Checks (Hybrid)

**Rationale**:
1. Balances automation (cheap heuristics) with intelligence (semantic LLM)
2. Most tasks skip expensive LLM review (cost-effective)
3. Semantic understanding catches sophisticated gaming
4. Adaptive (update heuristics based on LLM findings)
5. Fewer false positives (LLM validates borderline cases)

**Implementation approach**:
- Build multi-signal heuristic scorer (assertion quality, mock ratio, evidence completeness, deferral quality)
- Create adversarial LLM review prompt for flagged tasks
- Two-stage detection (heuristic → LLM for suspicious cases)

**Scope**:
- Start with 4 gaming patterns (trivial tests, mock abuse, weak deferrals, cherry-picking)
- Deploy alongside FIX-META-TEST-ENFORCEMENT (bundled quality gates)
- Defer Pattern 5 (false documentation) to future work (requires filesystem cross-checks)

**Next**: SPEC phase - Define acceptance criteria for heuristic scoring + LLM review

---

**Strategic Thinking Applied**:
- ✅ Questioned the problem (gaming detection vs ensuring evidence quality)
- ✅ Reframed the goals (make gaming harder than genuine verification)
- ✅ Explored alternatives (5 options with kill triggers)
- ✅ Considered long-term (adaptive learning, deterrence through difficulty)
- ✅ Challenged requirements (prevention vs remediation, automation vs flexibility)
