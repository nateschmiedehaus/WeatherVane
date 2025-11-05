# Deep Thinking Analysis — [TASK-ID]

**Template Version:** 1.0
**Date:** [YYYY-MM-DD]
**Author:** [Agent/Council name]

---

## Purpose

This document captures **DEEP THINKING** about edge cases, failure modes, assumptions, and complexity before implementation.

**Instructions:**
- Think adversarially: What could go wrong?
- Challenge assumptions: What if I'm wrong?
- Consider edge cases: What breaks the happy path?
- Analyze complexity: Is this simpler than it looks? More complex?
- Plan mitigation: How will I handle failures?
- Aim for ~30-50 lines of substantive analysis

**Remember:** The goal is to PREVENT problems, not just document them. If you find a critical issue, GO BACK and revise your STRATEGY/SPEC/PLAN.

---

## Edge Cases

**What are the boundary conditions and edge cases for this task?**

Think through scenarios that break the "happy path":

### Data Edge Cases

**Empty/Null/Missing Data:**
- What if input is empty? null? undefined? missing entirely?
- Example: "If strategy.md is empty (0 bytes), critic should fail with guidance"

**Extreme Values:**
- What if input is huge? tiny? at max limits?
- Example: "If strategy.md is 10,000 lines, review might timeout → need timeout handling"

**Invalid/Malformed Data:**
- What if input format is wrong? corrupted? unexpected type?
- Example: "If strategy.md contains only template headings (no content), should detect and fail"

### Timing Edge Cases

**Race Conditions:**
- What if two processes access the same resource simultaneously?
- Example: "If two agents run StrategyReviewer on same task concurrently → file locking needed?"

**Ordering Issues:**
- What if events happen in unexpected order?
- Example: "If agent stages strategy.md before creating it → pre-commit hook should handle gracefully"

**Timeout/Latency:**
- What if operations take too long?
- Example: "If intelligence layer takes >30s → need timeout + fallback to heuristics"

### State Edge Cases

**State Transitions:**
- What if system is in unexpected state?
- Example: "If task directory exists but no strategy.md → clear error message needed"

**Concurrent Modifications:**
- What if data changes while processing?
- Example: "If strategy.md modified during review → detect with file hash?"

### Your Edge Cases

**List 5-10 specific edge cases for THIS task:**

1. **[Edge case 1]:**
   - Scenario: [What happens?]
   - Impact: [How bad is it?]
   - Mitigation: [How will you handle it?]

2. **[Edge case 2]:**
   - Scenario: [What happens?]
   - Impact: [How bad is it?]
   - Mitigation: [How will you handle it?]

3. **[Edge case 3]:**
   - Scenario: [What happens?]
   - Impact: [How bad is it?]
   - Mitigation: [How will you handle it?]

[Continue for 5-10 edge cases]

---

## Failure Modes

**How can this task fail? What are the failure scenarios?**

Think through all the ways this could go wrong:

### Implementation Failures

**Logic Errors:**
- What if your algorithm is wrong?
- Example: "Pattern matching for 'impact assessment' might miss valid sections with different wording → need semantic analysis"

**Integration Failures:**
- What if dependencies break?
- Example: "If critic base class changes interface → TypeScript will catch at compile time ✅"

**Performance Failures:**
- What if it's too slow?
- Example: "If review takes >5 minutes per task → agents will disable it → need <30s target"

### Operational Failures

**Resource Exhaustion:**
- What if you run out of resources?
- Example: "If analytics log grows to 100MB → need log rotation"

**Permission Errors:**
- What if you lack permissions?
- Example: "If state/analytics/ not writable → create directory with permissions check"

**Network/Service Failures:**
- What if external dependencies fail?
- Example: "If intelligence layer unavailable → graceful degradation to heuristics"

### Quality Failures

**False Positives:**
- What if you block good work?
- Example: "If critic flags valid strategy as bad → agent frustration → need human escalation path"

**False Negatives:**
- What if you approve bad work?
- Example: "If agent games critic with clever wording → quality still poor → need anti-gaming measures + analytics"

**Brittleness:**
- What if minor changes break everything?
- Example: "If template format changes → old tasks fail review → need version detection"

### Your Failure Modes

**List 5-10 specific failure modes for THIS task:**

1. **Failure Mode: [Name]**
   - Cause: [Why does this fail?]
   - Symptom: [How will you know it failed?]
   - Impact: [How bad is it? Critical/High/Medium/Low]
   - Likelihood: [High/Medium/Low]
   - Detection: [How will you detect this?]
   - Mitigation: [How will you prevent or recover?]

2. **Failure Mode: [Name]**
   - Cause: [Why does this fail?]
   - Symptom: [How will you know it failed?]
   - Impact: [Critical/High/Medium/Low]
   - Likelihood: [High/Medium/Low]
   - Detection: [How will you detect this?]
   - Mitigation: [How will you prevent or recover?]

[Continue for 5-10 failure modes]

---

## Assumptions

**What are you assuming to be true? What if these assumptions are wrong?**

Be ruthlessly honest about your assumptions:

### Technical Assumptions

**About the system:**
- "I assume strategy.md files are UTF-8 encoded" → What if they're not? (encoding detection)
- "I assume state/analytics/ directory exists" → What if it doesn't? (create with mkdir -p)
- "I assume TypeScript compilation works" → What if it fails? (caught by build step ✅)

**About dependencies:**
- "I assume critic base class provides pass/fail methods" → What if API changes? (TypeScript catches ✅)
- "I assume fs.readFileSync works" → What if file is locked? (error handling needed)

### Behavioral Assumptions

**About users/agents:**
- "I assume agents will follow remediation guidance" → What if they ignore it? (pre-commit hook enforcement)
- "I assume agents write strategies in English" → What if other languages? (pattern matching might fail)

**About workflow:**
- "I assume STRATEGY phase comes before PLAN" → What if agent skips? (enforce with tooling)
- "I assume one strategy.md per task" → What if multiple? (convention enforcement)

### Data Assumptions

**About input data:**
- "I assume strategy.md follows template format" → What if free-form? (detect and adapt)
- "I assume file paths are relative" → What if absolute? (path normalization)

### Your Assumptions

**List 10-15 specific assumptions for THIS task:**

1. **Assumption: [Statement]**
   - If wrong: [What happens?]
   - Likelihood wrong: [High/Medium/Low]
   - Impact if wrong: [Critical/High/Medium/Low]
   - Mitigation: [How will you handle if wrong?]

2. **Assumption: [Statement]**
   - If wrong: [What happens?]
   - Likelihood wrong: [High/Medium/Low]
   - Impact if wrong: [Critical/High/Medium/Low]
   - Mitigation: [How will you handle if wrong?]

[Continue for 10-15 assumptions]

---

## Complexity Analysis

**Is this simpler or more complex than it appears?**

### Apparent Complexity

**What it looks like at first glance:**
- [Initial impression of complexity]
- [Estimated difficulty: Simple/Medium/Complex/Very Complex]

**Example:**
> "At first glance: Create a file pattern checker → seems simple (~100 LOC)"

### Hidden Complexity

**What you discover when you dig deeper:**

**Essential Complexity (inherent to the problem):**
- What complexity MUST exist to solve this problem properly?
- Example: "Must detect semantic quality, not just pattern matching → requires intelligence layer → adds ~200 LOC + API calls"

**Accidental Complexity (from approach/tools):**
- What complexity is introduced by your approach?
- Example: "Duplicating pattern matching logic across StrategyReviewer and ThinkingCritic → could extract shared module"

**Interaction Complexity:**
- How does this interact with existing systems?
- Example: "Must integrate with: Critic base class, analytics logging, pre-commit hooks, CLI scripts → integration points add ~150 LOC"

**State Complexity:**
- How much state must be managed?
- Example: "Must track: review history, false positive rate, concern patterns → analytics tracking adds complexity"

### Your Complexity Analysis

**For THIS task, analyze:**

1. **Essential vs Accidental Complexity:**
   - Essential: [What complexity is unavoidable?]
   - Accidental: [What complexity could be eliminated?]
   - Ratio: [X% essential, Y% accidental]

2. **Cyclomatic Complexity:**
   - Estimated decision points: [Number of if/else, loops, switches]
   - Functions with >10 branches: [List them]
   - Mitigation: [How will you keep complexity under control?]

3. **Cognitive Complexity:**
   - How hard is this to understand?
   - Rate: [Simple/Medium/Hard/Very Hard]
   - Mitigations: [Good naming, comments, tests, docs]

4. **Integration Complexity:**
   - How many systems/components does this touch?
   - List: [Component 1, Component 2, ...]
   - Risk: [Higher integration points = higher risk]

5. **Temporal Complexity:**
   - Does this involve async operations? race conditions? timing?
   - Challenges: [What temporal issues exist?]
   - Mitigations: [How will you handle timing issues?]

---

## What Could Go Wrong?

**Paranoid thinking: What are the worst-case scenarios?**

Think like a pessimist. Murphy's Law applies.

### Worst-Case Scenarios

1. **Complete Failure:**
   - What if this completely fails?
   - Example: "Critic never works → all tasks fail review → agents can't commit → development blocked"
   - Mitigation: "Human override path, --no-verify flag with warning"

2. **Cascade Failure:**
   - What if this breaks other things?
   - Example: "Analytics logging fills disk → server crashes → all tools fail"
   - Mitigation: "Log rotation, disk space monitoring, max log size"

3. **Security Breach:**
   - What if this creates security vulnerability?
   - Example: "Agent injects code in strategy.md that executes during review → RCE"
   - Mitigation: "No eval(), no exec(), sanitize file paths, sandboxed review"

4. **Data Loss:**
   - What if this deletes/corrupts data?
   - Example: "Bug in file writing corrupts strategy.md → work lost"
   - Mitigation: "Atomic writes, backups, version control (git saves us)"

5. **Performance Degradation:**
   - What if this makes everything slow?
   - Example: "Review takes 10 minutes → agents bypass with --no-verify → tool abandoned"
   - Mitigation: "30s timeout, async option, performance monitoring"

### Your Worst-Case Scenarios

**List 5-8 specific worst-case scenarios:**

1. **Scenario: [Name]**
   - What happens: [Describe the disaster]
   - Probability: [High/Medium/Low]
   - Impact: [Catastrophic/Critical/High/Medium/Low]
   - Prevention: [How to prevent this?]
   - Recovery: [If it happens, how to recover?]

[Continue for 5-8 scenarios]

---

## Mitigation Strategies

**How will you prevent, detect, and recover from problems?**

### Prevention (Stop problems before they happen)

**Input Validation:**
- Validate all inputs before processing
- Example: "Check strategy.md exists, is readable, is text file before review"

**Error Handling:**
- Wrap risky operations in try/catch
- Example: "If fs.readFileSync fails → catch error, return clear message"

**Defensive Programming:**
- Assume inputs are malicious/wrong
- Example: "Sanitize file paths, check file sizes, timeout long operations"

**Testing:**
- Test edge cases before they hit production
- Example: "Test with: empty file, huge file, corrupt file, concurrent access"

### Detection (Know when something goes wrong)

**Logging:**
- Log all operations and errors
- Example: "Log to state/analytics/strategy_reviews.jsonl with timestamps"

**Monitoring:**
- Track metrics that indicate problems
- Example: "Monitor: false positive rate, review duration, error rate"

**Alerting:**
- Notify when thresholds exceeded
- Example: "If false positive rate > 15% → alert for tuning"

**Analytics:**
- Collect data to detect patterns
- Example: "Track which concerns are most common → improve guidance"

### Recovery (Fix problems when they happen)

**Graceful Degradation:**
- Fail safely, not catastrophically
- Example: "If intelligence layer fails → fall back to heuristics"

**Retry Logic:**
- Try again if transient failure
- Example: "If file locked → retry 3 times with exponential backoff"

**Human Escalation:**
- When automation can't decide, ask human
- Example: "If 3 reviews still blocked → escalate to Claude Council"

**Rollback:**
- Ability to undo if things go wrong
- Example: "Git allows reverting bad commits ✅"

### Your Mitigation Strategies

**For THIS task, document:**

1. **Prevention measures:** [List 5-10 specific preventions]
2. **Detection mechanisms:** [List 5-10 ways you'll detect problems]
3. **Recovery procedures:** [List 5-10 recovery strategies]

---

## Testing Strategy

**How will you verify this actually works?**

### Unit Testing

**What needs unit tests?**
- Individual functions and methods
- Example: "Test analyzeThinkingQuality() with 10+ examples (good/bad/edge cases)"

**Test cases to write:**
1. [Test case 1: Happy path]
2. [Test case 2: Empty input]
3. [Test case 3: Invalid input]
4. [Test case 4: Edge case X]
5. [Test case 5: Failure mode Y]
[Continue for 10+ test cases]

### Integration Testing

**What needs integration tests?**
- How components work together
- Example: "Test CLI script → critic → analytics logging end-to-end"

### Property-Based Testing

**What invariants must hold?**
- Properties that should always be true
- Example: "PROPERTY: If think.md approved → it MUST have edge cases section"

### Manual Testing

**What needs manual verification?**
- Real-world scenarios
- Example: "Test with 5 actual think.md files from state/evidence/"

### Stress Testing

**What needs stress testing?**
- Performance under load
- Example: "Test reviewing 100 tasks in parallel → performance, resource usage"

### Your Testing Strategy

**Document:**
1. **Test coverage target:** [X% of code, Y% of edge cases]
2. **Critical paths to test:** [List most important scenarios]
3. **Test data needed:** [What inputs do you need?]
4. **Success criteria:** [How do you know tests passed?]

---

## Pre-Implementation Checklist

Before implementing, verify:

- [ ] I identified 5-10 edge cases and have mitigation for each
- [ ] I identified 5-10 failure modes with detection and recovery
- [ ] I listed 10-15 assumptions and their risks
- [ ] I analyzed essential vs accidental complexity
- [ ] I thought through 5-8 worst-case scenarios
- [ ] I have prevention, detection, and recovery strategies
- [ ] I have a testing strategy with 10+ test cases
- [ ] I reconsidered my approach after finding issues

**If ANY box unchecked:** Keep thinking. You're not ready to implement.

**If you found CRITICAL issues:** GO BACK to STRATEGY/SPEC/PLAN and revise. Don't implement a flawed approach.

---

## Notes

[Any additional thoughts, concerns, or decisions made during deep thinking]

**Red flags discovered:**
- [Flag 1: Issue that makes you reconsider the approach]
- [Flag 2: Assumption that might be fatally wrong]
- [Flag 3: Complexity that might be unmanageable]

**Confidence level:**
- Overall confidence in this approach: [High/Medium/Low]
- If low/medium: What would increase confidence?

**Follow-up needed:**
- [Research question 1]
- [Prototype needed for X]
- [Consult expert on Y]

---

**Think Date:** [YYYY-MM-DD]
**Author:** [Your name/agent ID]
**Next Phase:** GATE (document design thinking)

---

## Anti-Patterns to Avoid

**This template should help you avoid:**
- 🚫 Happy-path only thinking ("it will work if everything goes right")
- 🚫 Ignoring edge cases ("that probably won't happen")
- 🚫 Assuming away problems ("users won't do that")
- 🚫 Underestimating complexity ("this should be easy")
- 🚫 No failure planning ("we'll deal with errors later")
- 🚫 Untestable designs ("we'll test it in production")
- 🚫 Hubris ("I've thought of everything")

**Remember:** The goal of THINK is to find problems BEFORE implementation, not during or after. Better to spend 1 hour thinking than 10 hours debugging.

**If you find a critical issue during THINK, don't just document it—GO BACK and fix your STRATEGY/SPEC/PLAN.**
