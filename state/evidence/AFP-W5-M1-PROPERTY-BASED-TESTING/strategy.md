# STRATEGIZE - Property-Based Testing Implementation

**Task:** AFP-W5-M1-PROPERTY-BASED-TESTING
**Date:** 2025-11-05
**Agent:** Claude Council

---

## WHY (Problem Analysis)

### Root Cause
Example-based testing only validates specific scenarios we think of. We're vulnerable to edge cases and combinations we don't anticipate. The roadmap mutation API is critical infrastructure - bugs here could corrupt the entire roadmap and break autopilot's ability to evolve itself.

### Strategic Context (AFP/SCAS Alignment)

**COHERENCE**: Property-based testing expresses invariants (what must ALWAYS be true) rather than implementation details
- "Cycles never created" vs "adding task T4 with deps [T3] creates no cycle"
- More robust to refactoring

**VISIBILITY**: Invariants make implicit assumptions explicit
- "Rate limits always enforced" documents a guardrail
- Reveals edge cases we didn't think of (fast-check finds them automatically)

**ECONOMY**: One property test = hundreds of example tests
- 20 runs × random inputs = better coverage than 20 manual examples
- Finds bugs example tests miss

**EVOLUTION**: Tests evolve with property discovery
- New invariant discovered → add property test
- Properties document system behavior better than examples

**LOCALITY**: Properties test contracts, not implementation
- Tests remain valid across refactors
- No coupling to internal structure

### Goal
Implement property-based testing for roadmap mutation API to validate core invariants:
1. Cycles never created by valid mutations
2. Orphan dependencies never created
3. Rate limits always enforced
4. Self-dependencies always detected
5. Idempotence (duplicate mutations rejected)

---

## Current State Analysis

**Completed:**
- ✅ Documentation added to UNIVERSAL_TEST_STANDARDS.md (285 lines)
- ✅ Best practices analysis completed
- ✅ Examples documented for common properties

**Remaining:**
- ❌ fast-check not yet installed
- ❌ No property tests written for mutation API
- ❌ Not integrated into CI

**Risk:** Mutation API has example-based tests but no invariant validation. Edge cases could slip through.

---

## Alternatives Considered

### Alternative 1: Just add more example-based tests
**Pros:** Familiar, no new dependencies
**Cons:**
- Can't cover all edge cases
- High maintenance (need to update when implementation changes)
- Doesn't validate invariants systematically

### Alternative 2: Property-based testing (CHOSEN)
**Pros:**
- Validates invariants automatically
- Generates hundreds of test cases
- Finds edge cases we don't think of
- Low maintenance (tests contracts, not implementation)
**Cons:**
- Requires learning fast-check API
- Slightly longer test runtime

### Alternative 3: Formal verification
**Pros:** Mathematical proof of correctness
**Cons:** Too heavy, impractical for this use case

**DECISION:** Use property-based testing (Alternative 2) - best balance of rigor and practicality.

---

## Success Criteria

**Technical:**
- fast-check installed as dev dependency
- 5+ property tests covering core invariants
- All property tests passing (20+ runs each)
- Tests run in CI alongside existing tests

**Quality:**
- Tests validate invariants, not implementation details
- Property generators produce valid random inputs
- Tests complete in reasonable time (<5s for all property tests)

**AFP/SCAS:**
- COHERENCE: Properties express system contracts clearly
- ECONOMY: One property test replaces many example tests
- VISIBILITY: Invariants explicitly documented in test names
- EVOLUTION: Properties can be extended as new invariants discovered

---

## Implementation Scope

**Files to Change:**
1. `tools/wvo_mcp/package.json` - Add fast-check dependency
2. `tools/wvo_mcp/src/orchestrator/__tests__/roadmap_mutations.test.ts` - Add property tests

**LOC Estimate:**
- package.json: +1 line (dependency)
- roadmap_mutations.test.ts: +150 lines (property tests)
- **Total:** ~151 LOC (well within 150 LOC limit)

**Complexity:** LOW
- Using existing test framework (vitest)
- Adding to existing test file
- No new infrastructure needed

---

## Next Phase: SPEC

Define precise exit criteria and acceptance tests for property-based testing implementation.
