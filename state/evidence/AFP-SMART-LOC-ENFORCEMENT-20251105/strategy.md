# AFP-SMART-LOC-ENFORCEMENT-20251105: Strategy

## Problem Statement

Current AFP micro-batching enforcement uses a flat 150 LOC limit that is **too crude** and doesn't distinguish between:

- **Harmful bloat**: 150 lines of tangled business logic (bad) ❌
- **Valuable completeness**: 300 lines of comprehensive test suite (good) ✅
- **Necessary verbosity**: 400 lines of well-documented template with examples (good) ✅
- **Type safety**: 200 lines of interface definitions (neutral, but verbose) ➡️

**User feedback:** "can is there a more nuanced and sophisticated thing we can do about LOC limits? i fear it doesn't consider things that actually require more LOC, but obiously we want to remain conservaitve, just smarter"

**Current harm:**
- Forces artificial splitting of legitimate long files (tests, templates, guides)
- Requires `--no-verify` bypasses that undermine all enforcement
- Treats via negativa refactorings (delete 200, add 200 = net 0) same as pure bloat (add 200 = net 200)
- No credit for deletion (discourages cleanup)
- No consideration of file context (test vs. core logic)

## Root Cause Analysis

The flat limit exists because:
1. Simple to understand and enforce
2. Prevents "just one more feature" scope creep
3. Forces thinking about decomposition

But it fails because:
1. **Context-blind**: Doesn't know test vs. logic vs. docs
2. **Deletion-agnostic**: No via negativa incentive
3. **Pattern-deaf**: Can't detect boilerplate/types/imports
4. **Binary**: Pass/fail with no nuance

**Core issue:** We encoded a **heuristic** (small commits good) as a **rule** (150 LOC max), losing the intelligence behind the heuristic.

## Success Criteria

**Quantitative:**
- Zero false positives on legitimate long files (tests, templates, docs)
- 90%+ catch rate for actual bloat (god functions, scope creep)
- <5% of commits require `--no-verify` bypass
- Deletion credits measurably increase refactoring commits

**Qualitative:**
- Agents don't complain about "dumb limits"
- Enforcement feels helpful, not adversarial
- Clear, actionable feedback on what to do when over limit
- Maintains conservative posture while being intelligent

**Behavioral:**
- Encourage comprehensive tests (not artificially split)
- Reward deletion/refactoring (via negativa)
- Guide toward better decomposition (not just "split it")
- Maintain AFP discipline (don't create loophole)

## Impact Assessment

**If we do nothing:**
- Agents will bypass with `--no-verify` habitually
- Enforcement becomes theater, not real constraint
- Loss of trust in guardrails ("why follow dumb rules?")
- Test quality suffers (split artificially to meet limit)

**If we implement smart enforcement:**
- Enforcement becomes pedagogical (teaches good patterns)
- Via negativa gets structural incentive (deletion credits)
- Tests/docs can be comprehensive without penalty
- Core logic remains strict (where it matters)

**Risks of smart enforcement:**
- Complexity could create loopholes
- "Smart" could mean "gaming the system"
- Multipliers could be tuned poorly
- More code to maintain

**Mitigation:**
- Start conservative, tune based on data
- Log all overrides for review
- Make multipliers visible and auditable
- Keep simple fallback (block >500 LOC regardless)

## AFP/SCAS Alignment

**Via Negativa:**
- Deletion credits structurally incentivize cleanup
- Pattern detection rewards removing boilerplate
- "Effective LOC" metric focuses on actual complexity, not noise

**Refactor Not Repair:**
- Recommendations guide toward proper decomposition
- File-type tiers prevent patching core logic
- Progressive warnings catch incremental bloat

**Complexity Control:**
- Future: integrate cyclomatic complexity analysis
- Effective LOC removes comment/import noise
- Core logic tier remains strictest

**Micro-Batching:**
- Still enforces small changes
- But "small" is now context-aware
- 150 LOC of core logic still blocked
- 300 LOC of tests allowed

**SCAS Principle:**
- Local rules (file-type detection) create global coherence (right limits per context)
- Multipliers are simple, fractal pattern
- System teaches itself what's acceptable through analytics

## Risks & Assumptions

**Assumptions:**
1. File path patterns correlate with content type (tests end in .test.ts)
2. Deletion indicates refactoring, not just churn
3. Effective LOC (minus boilerplate) approximates complexity
4. Progressive warnings educate without blocking
5. Analytics logging enables tuning

**Risks:**
1. **Gaming:** Agents could exploit multipliers (e.g., fake test files)
   - **Mitigation:** Audit override logs, track patterns
2. **Complexity:** System becomes hard to understand
   - **Mitigation:** Clear documentation, visible formula
3. **Tuning:** Multipliers could be wrong
   - **Mitigation:** Start conservative, adjust based on data
4. **Maintenance:** More code to maintain
   - **Mitigation:** Well-tested, modular design

## Strategic Recommendation

**Proceed with smart enforcement** for these reasons:

1. **User asked for it:** Direct feedback that current system is too crude
2. **Evidence of harm:** We just had to use `--no-verify` 3 times for legitimate infrastructure
3. **AFP-aligned:** Via negativa credits, effective LOC, context awareness all embody principles better than flat limit
4. **Measurable:** Can track false positives, bypasses, deletion rate
5. **Reversible:** If it fails, revert to flat limit

**Decision point:** 4 weeks after deployment
- If bypass rate increases: system is too loose, tighten
- If bypass rate decreases: system is working, tune further
- If false positives persist: adjust multipliers

**Not doing this risks:** Enforcement becoming ignored, AFP discipline eroding, agent trust declining.
