# Thinking Critic Guide

## Overview

The **ThinkingCritic** is an intelligent reviewer that evaluates deep thinking quality BEFORE implementation. It ensures you've thought through edge cases, failure modes, assumptions, and complexity.

**Purpose:** Prevent bugs, crashes, and design flaws by enforcing deep analytical thinking at Phase 4 (THINK) before proceeding to implementation.

**When it runs:**
- Manually via `npm run think:review [TASK-ID]`
- Via pre-commit hook (future integration)
- During automated quality gates

## Core Quality Checks

The ThinkingCritic evaluates 7 dimensions of deep thinking:

### 1. Edge Cases Coverage
**Checks for:**
- 5-10 specific boundary conditions identified
- Each edge case has: scenario, impact, mitigation
- Concrete examples (not generic categories)

**Common failures:**
- ❌ Generic: "What if input is invalid?"
- ❌ Few: Only 1-2 edge cases mentioned
- ✅ Specific: "What if strategy.md is 10MB → review timeout after 30s → fallback to heuristics, log warning"

**Categories to cover:**
- Data: empty, null, huge, tiny, invalid, malformed
- Timing: race conditions, timeouts, ordering issues
- State: unexpected states, concurrent modifications

### 2. Failure Modes Analysis
**Checks for:**
- 5-10 specific ways this could fail
- Each failure mode has: cause, symptom, impact, likelihood, detection, mitigation
- All three mitigation types: prevention, detection, recovery

**Common failures:**
- ❌ No failures listed (overly optimistic)
- ❌ Failures without mitigation
- ✅ Comprehensive: "False positives (critic blocks good work) → Impact: High, Likelihood: Medium → Detection: track rate in analytics → Mitigation: human escalation + threshold tuning"

**Categories to cover:**
- Implementation: logic errors, integration breaks, performance
- Operational: resource exhaustion, permissions, network failures
- Quality: false positives, false negatives, brittleness

### 3. Assumptions Documentation
**Checks for:**
- 10-15 specific assumptions listed
- Each assumption has: if-wrong scenario, likelihood, impact, mitigation
- Honest about what you're taking for granted

**Common failures:**
- ❌ No assumptions listed (pretending certainty)
- ❌ Assumptions without risk assessment
- ✅ Explicit: "Assume UTF-8 encoding → If wrong: parse errors → Likelihood: Low → Impact: Medium → Mitigation: detect encoding, convert or fail gracefully"

**Categories to cover:**
- Technical: file format, dependencies, system behavior
- Behavioral: user actions, agent behavior, workflow
- Data: input format, size constraints, validity

### 4. Complexity Analysis
**Checks for:**
- Essential vs accidental complexity distinguished
- Realistic complexity estimate (LOC, functions, components)
- Cyclomatic and cognitive complexity considered

**Common failures:**
- ❌ "This is simple" (without analysis)
- ❌ No distinction between essential and accidental
- ✅ Realistic: "Essential: semantic analysis (~200 LOC). Accidental: duplicate pattern matching (~50 LOC could be extracted). Total: ~600 LOC vs initial estimate of ~300 LOC."

### 5. Mitigation Strategies
**Checks for:**
- Prevention strategies (5-10): input validation, defensive programming
- Detection mechanisms (5-10): logging, monitoring, analytics
- Recovery procedures (5-10): graceful degradation, retry, rollback

**Common failures:**
- ❌ Only prevention OR only detection (one-dimensional)
- ❌ Vague: "We'll handle errors"
- ✅ Concrete: "Prevention: validate file exists before read. Detection: log all reviews to analytics. Recovery: if intelligence layer fails, fall back to heuristics."

### 6. Testing Strategy
**Checks for:**
- 10+ specific test cases documented
- Unit tests AND integration tests planned
- Edge cases and failure modes covered in tests

**Common failures:**
- ❌ "We'll test it" (no specifics)
- ❌ Only happy path tests
- ✅ Comprehensive: "Test 1: Empty think.md → expect fail with guidance. Test 2: 10MB think.md → expect timeout + fallback. Test 3: Concurrent reviews → check file locking. [10+ more cases]"

### 7. Paranoid Thinking
**Checks for:**
- Worst-case scenarios considered (5-8)
- Security, data loss, cascade failures thought through
- Prevention and recovery for disasters

**Common failures:**
- ❌ No worst-case thinking (optimism bias)
- ❌ Superficial: "might fail"
- ✅ Paranoid: "Worst case: Analytics log fills disk → server crash → all tools fail → Prevention: log rotation, 100MB max size. Recovery: automated cleanup script runs daily."

## How to Use

### Manual Review

```bash
cd tools/wvo_mcp
npm run think:review [TASK-ID]
cd ../..
```

**Example:**
```bash
cd tools/wvo_mcp
npm run think:review AFP-STRATEGY-THINK-CRITICS-20251105
cd ../..
```

**Exit codes:**
- `0` = Thinking approved, proceed to GATE phase
- `1` = Thinking needs deeper analysis, see concerns below

### Review All Think Documents

```bash
cd tools/wvo_mcp
npm run think:review
cd ../..
```

Discovers and reviews all `think.md` files in `state/evidence/`.

## Understanding Feedback

### Severity Levels

**HIGH (🔴):** Critical - must fix before approval
**MEDIUM (🟡):** Important - should fix for quality
**LOW (🔵):** Nice-to-have - optional improvements

### Common Concerns

**no_edge_cases / insufficient_edge_cases:**
- You need 5-10 specific boundary conditions
- For each: scenario, impact, mitigation
- Be concrete, not generic

**no_failure_modes / no_failure_mitigation:**
- Document 5-10 ways this could fail
- For each: cause, symptom, impact, likelihood, detection, mitigation
- Include prevention + detection + recovery

**no_assumptions / no_assumption_risk_assessment:**
- List 10-15 specific assumptions
- For each: if-wrong, likelihood, impact, mitigation
- Be honest about what you're taking for granted

**incomplete_mitigation:**
- Need all three: prevention, detection, recovery
- 5-10 strategies in EACH category
- Be specific, not vague

**no_testing_strategy / insufficient_test_cases:**
- Document 10+ specific test cases
- Cover: happy path, empty input, invalid input, edge cases, failure modes
- Include unit AND integration tests

**no_paranoid_thinking:**
- Consider 5-8 worst-case scenarios
- Security breaches, data loss, cascade failures, performance degradation
- For each: prevention and recovery

## Remediation Workflow

**If ThinkingCritic blocks you, DO NOT just expand think.md superficially.**

### Proper Remediation Steps

**1. DO ACTUAL DEEP THINKING (30-60 min per high-severity concern):**

**no_edge_cases:**
- Think through: empty data, extreme values, invalid input, timing issues, state issues
- For each: What happens? How bad? How to handle?
- Document 5-10 specific scenarios

**no_failure_modes:**
- Think through: logic errors, performance failures, resource exhaustion, false positives/negatives
- For each: cause, symptom, impact, likelihood, detection, mitigation
- Document 5-10 failure scenarios

**no_assumptions:**
- List everything you're assuming: file format, dependencies, behavior, data
- For each: What if I'm wrong? Likelihood? Impact? How to mitigate?
- Document 10-15 assumptions

**incomplete_mitigation:**
- Prevention: input validation, error handling, defensive programming, testing
- Detection: logging, monitoring, analytics, alerting
- Recovery: graceful degradation, retry logic, human escalation, rollback
- Document 5-10 strategies in EACH category

**no_testing_strategy:**
- Unit tests: Which functions? What cases? (10+)
- Integration tests: Which components together?
- Edge case tests: Cover all boundary conditions
- Failure tests: Test error handling
- Document specific test cases, not just "we'll test"

**2. UPDATE think.md with REAL analysis:**
- Be specific: Concrete scenarios, not categories
- Be comprehensive: 5-10 items per section minimum
- Be honest: Admit what could go wrong
- Think adversarially: What breaks this?

**3. RE-RUN ThinkingCritic:**
```bash
cd tools/wvo_mcp && npm run think:review [TASK-ID] && cd ../..
```

**4. ITERATE until approved (2-3 rounds is normal)**

**5. IF YOU FIND CRITICAL ISSUES:** GO BACK to STRATEGY/SPEC/PLAN and revise
- Don't just document problems - FIX THE APPROACH
- THINK is your last chance to catch design flaws

## Quality Examples

### Good Edge Case Analysis

```markdown
### Edge Case 1: Empty think.md (0 bytes)
- Scenario: Agent stages empty file
- Impact: High (blocks commit with unclear error)
- Mitigation: Check file size before review, return clear guidance message

### Edge Case 2: Huge think.md (10MB+)
- Scenario: Agent pastes large external content
- Impact: Medium (review timeout, agent blocked)
- Mitigation: 30s timeout, fallback to heuristics, warn about size

### Edge Case 3: Concurrent reviews
- Scenario: Two agents review same task simultaneously
- Impact: Low (might corrupt analytics log)
- Mitigation: Atomic file writes, consider file locking if needed
```

### Good Failure Mode Analysis

```markdown
### Failure Mode: False Positives
- Cause: Pattern matching too strict OR agent uses non-standard wording
- Symptom: Good thinking doc fails review, agent frustrated
- Impact: High (erodes trust, tool abandonment)
- Likelihood: Medium (DesignReviewer has ~5% false positive rate)
- Detection: Track approval rate in analytics (target: 80-90%, not 100%)
- Mitigation: Human escalation path always available, tune thresholds based on data
```

### Good Assumption Analysis

```markdown
### Assumption: think.md files are UTF-8 encoded
- If wrong: Parse errors, review fails with cryptic message
- Likelihood wrong: Low (repo standard is UTF-8)
- Impact if wrong: Medium (blocks agent)
- Mitigation: Detect encoding with chardet, convert or fail gracefully with clear message
```

## Metrics and Analytics

All thinking reviews are logged to `state/analytics/thinking_reviews.jsonl`:

```json
{
  "timestamp": "2025-11-05T16:33:35.182Z",
  "task_id": "AFP-TASK-20251105",
  "approved": true,
  "concerns_count": 2,
  "high_severity_count": 0,
  "strengths_count": 6,
  "summary": "Thinking shows good depth (6 strengths, 2 concerns)"
}
```

**Metrics to track:**
- Approval rate (target: 80-90% on first review)
- Average concerns per review
- Time from first submission to approval
- False positive rate (track human overrides)

## FAQ

**Q: Why 30 lines minimum?**
A: Deep thinking takes space. Edge cases (5-10), failure modes (5-10), assumptions (10-15), mitigation (15+), testing (10+) = easily 30-50 substantive lines.

**Q: Can I skip THINK for small tasks?**
A: Small tasks can have brief thinking (~20 lines), but you still must think through edge cases, failure modes, assumptions. The template scales down.

**Q: What if I find a critical issue during THINK?**
A: GO BACK to STRATEGY/SPEC/PLAN and revise. Don't just document the problem - fix the approach. THINK is your last chance before implementation.

**Q: How long should THINK take?**
A: 30-60 minutes for genuine deep thinking. If < 10 minutes, you're being superficial.

**Q: What if ThinkingCritic is wrong (false positive)?**
A: Human escalation always available. Document why you disagree, provide evidence, request manual review from Claude Council or Director Dana.

## Integration with Other Critics

**StrategyReviewer (Phase 1: STRATEGIZE):**
- Checks: WHY and WHAT
- Focus: Strategic thinking quality

**ThinkingCritic (Phase 4: THINK):**
- Checks: Edge cases, failure modes, assumptions, mitigation, testing
- Focus: Depth of analysis, paranoid thinking

**DesignReviewer (Phase 5: GATE):**
- Checks: AFP/SCAS principles, alternatives, complexity, implementation plan
- Focus: Design quality

**Together:** STRATEGIZE (why/what) → ... → THINK (depth/risks) → GATE (design/AFP) → IMPLEMENT

## Version History

- **v1.0** (2025-11-05): Initial release
  - 7 quality dimensions
  - Intelligent analysis with anti-gaming measures
  - Analytics tracking
  - Adaptive thresholds

---

**Remember:** ThinkingCritic ensures you've thought deeply about edge cases, failure modes, and risks BEFORE implementation. Better to find problems in THINK phase than in production.

**Deep thinking prevents expensive debugging.**
