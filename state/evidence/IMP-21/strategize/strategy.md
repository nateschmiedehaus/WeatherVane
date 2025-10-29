# IMP-21 STRATEGIZE: Prompt Compiler (Skeleton + Canonicalization)

**Task**: IMP-21 - Prompt Compiler
**Date**: 2025-10-29
**Phase**: STRATEGIZE
**Epic**: Prompting Improvements (Phase 1)
**Dependencies**: IMP-FUND-01 to IMP-FUND-09 (COMPLETE)

---

## Objective (One Sentence)

Build a **deterministic prompt compiler** that assembles prompts from typed slots (header, phase, domain, skills, rubric) with stable hash for attestation, enabling future overlay/persona systems while maintaining backward compatibility via feature flag.

---

## Success KPI

**Primary**: Deterministic canonicalization verified by identical hash across 100 runs/restarts

**Leading Indicators**:
- Golden compile tests pass (baseline prompts → expected output)
- No behavior change with neutral overlays (shadow mode verification)
- Hash stability test: same input → same hash 100% of time
- Compilation latency: <10ms for typical prompt assembly

**Measurement**:
```typescript
// Golden test pattern
const input = { phase: 'STRATEGIZE', domain: 'api', ... };
const hash1 = compiler.compile(input).hash;
const hash2 = compiler.compile(input).hash;
assert(hash1 === hash2); // Must be identical
```

---

## Two Invariants (Will Not Break)

### Invariant 1: No Runtime Breaks
- **Guarantee**: Can toggle `prompt.compiler=off` → falls back to legacy prompt assembly
- **Why Critical**: Autopilot must not break if compiler has bugs
- **Verification**: Integration test with flag off → all existing tests pass
- **Enforcement**: Feature flag with safe fallback path

### Invariant 2: Phase Order Integrity
- **Guarantee**: Compiler does not affect phase sequencing or enforcement
- **Why Critical**: WorkProcessEnforcer relies on phase order
- **Verification**: Phase transition tests still pass with compiler enabled
- **Enforcement**: Compiler is pure function (input → output), no side effects

---

## Top 2 Risks

### Risk 1: Hash Instability (High Impact, Medium Likelihood)
- **Description**: Canonicalization doesn't eliminate all non-determinism (timestamps, object key order, JSON serialization differences)
- **Impact**: Attestation system breaks, can't detect prompt drift
- **Likelihood**: Medium (object key order in JS/TS can vary)
- **Mitigation**:
  - Sort all object keys before hashing
  - Strip timestamps/session IDs from canonical form
  - Use deterministic JSON stringifier
  - 100-run stability test in VERIFY phase
- **Revisit By**: 2025-11-05 (1 week)
- **Risk Appetite**: LOW - hash must be stable or attestation is useless

### Risk 2: Over-Engineering (Medium Impact, Medium Likelihood)
- **Description**: Build complex slot system when simple string templates would suffice
- **Impact**: Wasted effort, maintenance burden, harder to understand
- **Likelihood**: Medium (easy to over-design compilers)
- **Mitigation**:
  - Start with minimal typed slots (5-6 only: system, phase, domain, skills, rubric, context)
  - No conditional logic in compiler (pure assembly)
  - No template language (just string interpolation)
  - Golden tests keep it grounded in real use cases
- **Revisit By**: 2025-11-05 (1 week)
- **Risk Appetite**: MEDIUM - prefer simple over flexible

---

## Scope Guardrails

### IN SCOPE (This Task - IMP-21)
✅ **Compiler Skeleton**:
- TypeScript class with `compile(input)` method
- Typed input interface (PromptInput with slots)
- Typed output interface (CompiledPrompt with text + hash)

✅ **Canonicalization**:
- Deterministic JSON serialization (sorted keys)
- Strip timestamps, session IDs, UUIDs
- Stable hash algorithm (SHA-256)

✅ **Typed Slots** (minimal set):
- `system`: Core system instructions
- `phase`: Phase-specific role/instructions
- `domain`: Domain context (api, web, ml, etc.) - PLACEHOLDER only
- `skills`: Available methods/tools - PLACEHOLDER only
- `rubric`: Quality criteria - PLACEHOLDER only
- `context`: Task-specific context anchors

✅ **Golden Tests**:
- Baseline prompts from existing phases
- Hash stability test (100 runs)
- Backward compat test (flag off → same behavior)

✅ **Feature Flag**:
- `prompt.compiler=observe` (default: off initially)
- Fallback to legacy assembly when off

### OUT OF SCOPE (Future Tasks)
❌ **Domain Overlays** (IMP-23):
- Actual domain-specific content
- Rubric injection from docs
- Overlay catalog

❌ **PersonaSpec** (IMP-22):
- Persona definitions
- Tool allowlist derivation
- Persona hash integration

❌ **StateGraph Integration** (IMP-24):
- Hook to compile before each runner
- Ledger/attestation wiring
- Prompt drift detection

❌ **Eval Harness** (IMP-35):
- Golden task corpus
- Robustness testing
- Gates for promotion

❌ **Production Rollout**:
- Only observe mode in this task
- Enforce mode is future work

---

## Abort Triggers (Blast-Radius Limiters)

**ABORT if any of these occur**:

1. **Hash instability >1%**: If 100-run test shows >1 different hash → design is flawed
2. **Compilation latency >50ms**: Prompt assembly is hot path, can't be slow
3. **Backward compat breaks**: If flag=off doesn't preserve 100% existing behavior
4. **Collision with IMP-05**: If Codex's attestation work conflicts with compiler design
5. **Scope creep**: If THINK/IMPLEMENT reveals we need IMP-22/23/24 to proceed

**Rollback Plan**: Delete `src/prompt/compiler.ts`, remove feature flag, no migrations needed

---

## Link to Purpose (Long-Lived Invariants)

### Why This Matters
**Problem**: Current prompt assembly is ad-hoc string concatenation
- Can't detect prompt drift (no stable hash)
- Can't swap overlays/personas (no typed slots)
- Hard to test (no golden reference)
- Coupling between phases and prompt content

**Solution**: Compiler with typed slots + canonicalization
- Stable hash → attestation works (IMP-05 depends on this)
- Typed slots → overlays/personas can plug in (IMP-22/23)
- Golden tests → regression detection
- Separation of concerns → easier to evolve

### Alignment with Invariants
- **Anti-drift**: Hash stability enables prompt drift detection
- **Backward compat**: Feature flag ensures safe rollout
- **Evidence-driven**: Golden tests provide verification oracle
- **Incremental**: Observe mode first, enforce mode later

---

## Success Looks Like (Concrete Outcomes)

**At End of IMP-21**:
1. ✅ `tools/wvo_mcp/src/prompt/compiler.ts` exists (~300 lines)
2. ✅ Compiles baseline prompt (STRATEGIZE phase) → identical hash 100 times
3. ✅ Golden test suite passes (5-10 baseline prompts)
4. ✅ Feature flag works (off → legacy, observe → compiler)
5. ✅ Documentation explains typed slots and canonicalization
6. ✅ Ready for IMP-22 (PersonaSpec) and IMP-23 (Overlays) to build on top

**Evidence of Success**:
- `state/evidence/IMP-21/verify/compiler_hash_consistency.log` shows 100/100 identical hashes
- `state/evidence/IMP-21/verify/golden_tests.json` shows all tests passing
- `state/evidence/IMP-21/verify/backward_compat.log` shows flag=off preserves behavior

---

## Related Work & Integration Points

**Depends On**:
- IMP-FUND-02 (Evidence Gates): No dependency, just uses existing phase system
- Existing phase definitions: Will extract prompts for golden tests

**Enables**:
- IMP-22 (PersonaSpec): Compiler provides persona slot for injection
- IMP-23 (Domain Overlays): Compiler provides domain/rubric slots
- IMP-24 (StateGraph Hook): Will call compiler before each runner
- IMP-05 (Attestation): Compiler provides stable hash for attestation

**Integrates With**:
- WorkProcessEnforcer: Reads phase from enforcer, provides compiled prompt
- State runners: Will eventually consume compiled prompts (IMP-24)

**No Integration Yet** (observe mode only):
- Not wired into actual autopilot flow (IMP-24)
- Just a library with tests

---

## Effort Estimate

**From IMPROVEMENT_BATCH_PLAN**: Not explicitly estimated, part of Phase 1

**Rough Estimate**:
- Compiler skeleton: 2-3 hours
- Canonicalization: 2-3 hours
- Golden tests: 2-3 hours
- Documentation: 1-2 hours
- **Total**: 7-11 hours (about 1 day of focused work)

**Checkpoint Plan**:
- After skeleton: Can compile basic prompt, no hash yet
- After canonicalization: Hash is stable
- After golden tests: Regression detection works
- After flag integration: Ready for observe mode

---

## Next Steps

1. **SPEC**: Define TypeScript interfaces, hash algorithm, golden test format
2. **PLAN**: Break down into 4 implementation steps (skeleton, canon, tests, flag)
3. **THINK**: Design decisions on canonicalization, slot types, hash algorithm
4. **IMPLEMENT**: Build the compiler
5. **VERIFY**: Run golden tests, hash stability test, backward compat test
6. **REVIEW**: Check for over-engineering, ensure KPIs met
7. **PR**: Commit with observe flag (not enforced yet)
8. **MONITOR**: Track hash stability in observe mode

---

**Date**: 2025-10-29
**Status**: STRATEGIZE phase complete
**Next**: SPEC phase
