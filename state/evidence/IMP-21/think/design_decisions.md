# IMP-21 THINK: Design Decisions & Trade-offs

**Task**: IMP-21 - Prompt Compiler
**Date**: 2025-10-29
**Phase**: THINK
**Previous Phases**: STRATEGIZE ✅, SPEC ✅, PLAN ✅

---

## Design Decision 1: Canonicalization Algorithm

### Question
How do we ensure deterministic serialization of JavaScript objects?

### Options Considered

**Option A: JSON.stringify() with sorted keys (CHOSEN)**
- **Pros**:
  - No external dependencies
  - Simple to understand and maintain
  - Recursive key sorting is straightforward
  - Handles nested objects naturally
- **Cons**:
  - Performance cost of recursive traversal
  - Must manually implement key sorting
  - JSON.stringify may have edge cases (circular refs, special chars)
- **Risk**: Medium (object traversal overhead)

**Option B: Use existing library (canonical-json, fast-json-stable-stringify)**
- **Pros**:
  - Battle-tested canonicalization
  - Optimized performance
  - Handles edge cases
- **Cons**:
  - External dependency (violates "keep it simple" principle)
  - Another version to track
  - May have features we don't need (overkill)
- **Risk**: Low (mature libraries)

**Option C: Custom binary serialization**
- **Pros**:
  - Potentially faster than JSON
  - More compact representation
- **Cons**:
  - Complex to implement correctly
  - Hard to debug (not human-readable)
  - Over-engineering for this use case
- **Risk**: High (implementation complexity)

### Decision: Option A (JSON.stringify with sorted keys)

**Rationale**:
1. **Simplicity**: No external dependencies, easy to understand
2. **Good enough**: PromptInput is small (<10 fields), performance acceptable
3. **Debuggable**: Canonical form is human-readable JSON
4. **Maintainable**: Future developers can read/modify easily

**Trade-off Accepted**: Slower than optimized libraries, but meets <10ms budget

**Validation**: Performance benchmark will verify this choice meets budget

---

## Design Decision 2: Hash Algorithm

### Question
Which cryptographic hash function should we use?

### Options Considered

**Option A: SHA-256 (CHOSEN)**
- **Pros**:
  - Industry standard for content addressing
  - 256-bit collision resistance is overkill for our needs (good thing)
  - Built into Node.js crypto module
  - 64-character hex output is reasonable length
- **Cons**:
  - Slower than non-cryptographic hashes (xxHash, CityHash)
  - Overkill for non-security use case
- **Risk**: None (standard algorithm)

**Option B: MD5**
- **Pros**:
  - Faster than SHA-256
  - Shorter output (32 chars)
- **Cons**:
  - Deprecated for security (collision attacks exist)
  - Even though we're not using for security, bad optics
  - Not worth the speed gain for <10ms budget
- **Risk**: Low (collision in practice), but poor perception

**Option C: Non-cryptographic hash (xxHash, MurmurHash)**
- **Pros**:
  - Much faster than SHA-256
  - Designed for hash tables, not security
- **Cons**:
  - Requires external library (not in Node.js)
  - Unfamiliar to most developers
  - No advantage if we meet performance budget anyway
- **Risk**: Low (mature libraries)

### Decision: Option A (SHA-256)

**Rationale**:
1. **Standard**: Everyone knows SHA-256, clear intent
2. **Future-proof**: If we later need security properties, we already have them
3. **Built-in**: No external dependencies
4. **Collision resistance**: Astronomically unlikely to have collisions

**Trade-off Accepted**: Slower than alternatives, but still fast enough

**Validation**: Performance benchmark will verify <10ms budget met

---

## Design Decision 3: Feature Flag States

### Question
How many states should the PROMPT_COMPILER flag have?

### Options Considered

**Option A: Two states (on/off)**
- **Pros**:
  - Simple, binary choice
  - Easy to understand
- **Cons**:
  - No observe mode (can't A/B test without risk)
  - Must go straight from off to enforced (risky)
- **Risk**: High (no gradual rollout)

**Option B: Three states (off/observe/enforce) (CHOSEN)**
- **Pros**:
  - Gradual rollout: off → observe → enforce
  - Observe mode: Use compiler, log results, compare with legacy
  - Safe experimentation (observe doesn't break anything)
- **Cons**:
  - More complex flag logic
  - Observe mode requires dual execution (compiler + legacy)
- **Risk**: Low (standard pattern for gradual rollout)

**Option C: Four states (off/shadow/observe/enforce)**
- **Pros**:
  - Shadow mode: Run compiler, log results, use legacy output
  - Observe mode: Run compiler, use compiler output, log results
  - Even more gradual rollout
- **Cons**:
  - Over-engineering for this use case
  - Shadow mode not needed (compiler has no side effects)
- **Risk**: Medium (complexity without benefit)

### Decision: Option B (off/observe/enforce)

**Rationale**:
1. **Gradual rollout**: Can enable observe mode immediately without risk
2. **A/B testing**: Observe mode allows comparison with legacy
3. **Standard pattern**: Common in feature flag systems
4. **Future work**: IMP-24 will use observe mode to validate before enforce

**Trade-off Accepted**: Slightly more complex than binary flag

**Implementation Note**: For IMP-21, only implement `off` and `observe`. `enforce` is same as `observe` (no legacy fallback yet). Distinction matters in IMP-24.

---

## Design Decision 4: Slot Design (Required vs Optional)

### Question
Which slots should be required vs optional in PromptInput?

### Options Considered

**Option A: All required**
- **Pros**:
  - No partial compilation
  - Clear contract
- **Cons**:
  - Forces callers to provide values even if not needed
  - Inflexible for future phases that don't need all slots
- **Risk**: High (breaks forward compatibility)

**Option B: Only system/phase required (CHOSEN)**
- **Pros**:
  - Flexible for different phase types
  - Future phases can use subset of slots
  - Backward compatible (can add slots without breaking)
- **Cons**:
  - Callers might forget to provide important slots
  - Must handle empty optional slots in assembly
- **Risk**: Low (TypeScript enforces required fields)

**Option C: All optional**
- **Pros**:
  - Maximum flexibility
- **Cons**:
  - No guarantees about what's provided
  - Prompts might be incomplete
  - Hard to catch errors at compile time
- **Risk**: High (no type safety)

### Decision: Option B (system/phase required, rest optional)

**Rationale**:
1. **System/phase are core**: Every phase needs these
2. **Domain/skills/rubric are contextual**: Not all phases need them
3. **Forward compatible**: IMP-22/23 will populate optional slots
4. **Type safety**: TypeScript enforces required fields

**Trade-off Accepted**: Callers must handle optional slots

**Validation**: Golden tests will verify all slot combinations work

---

## Design Decision 5: Slot Assembly Strategy

### Question
How should we assemble the final prompt text from slots?

### Options Considered

**Option A: Simple string interpolation (CHOSEN)**
```typescript
private assembleText(input: PromptInput): string {
  const parts = [input.system, input.phase];

  if (input.domain) parts.push(`Domain: ${input.domain}`);
  if (input.skills) parts.push(`Skills: ${input.skills}`);
  if (input.rubric) parts.push(`Rubric: ${input.rubric}`);
  if (input.context) parts.push(`Context: ${input.context}`);

  return parts.join('\n\n');
}
```
- **Pros**:
  - Simple, easy to understand
  - No templating language needed
  - Clear order of slots
- **Cons**:
  - Hardcoded formatting
  - No conditional logic (but we don't need it)
- **Risk**: None

**Option B: Template string with Handlebars/Mustache**
```typescript
const template = `
{{system}}

{{phase}}

{{#if domain}}Domain: {{domain}}{{/if}}
{{#if skills}}Skills: {{skills}}{{/if}}
...
`;
```
- **Pros**:
  - Flexible templating
  - Can change format without code changes
- **Cons**:
  - External dependency (Handlebars)
  - Overkill for this use case
  - Template itself needs to be versioned/hashed
- **Risk**: Medium (over-engineering)

**Option C: Pluggable assembler functions**
```typescript
type Assembler = (input: PromptInput) => string;

class PromptCompiler {
  constructor(private assembler: Assembler = defaultAssembler) {}
  // ...
}
```
- **Pros**:
  - Flexible, testable
  - Can swap assemblers for different phases
- **Cons**:
  - Over-engineering for this use case
  - Assembler function itself needs canonicalization
- **Risk**: Medium (unnecessary abstraction)

### Decision: Option A (Simple string interpolation)

**Rationale**:
1. **YAGNI**: We don't need templating complexity
2. **Simple**: Easy to understand and maintain
3. **Fast**: No parsing overhead
4. **Deterministic**: String concatenation is deterministic

**Trade-off Accepted**: Less flexible than templates, but we don't need flexibility

**Future Consideration**: If IMP-23 (Domain Overlays) needs complex formatting, revisit this decision

---

## Design Decision 6: Error Handling Strategy

### Question
How should we handle invalid inputs?

### Options Considered

**Option A: Throw custom CompilationError (CHOSEN)**
```typescript
export class CompilationError extends Error {
  constructor(message: string, public code: string, public input?: Partial<PromptInput>) {
    super(message);
    this.name = 'CompilationError';
  }
}
```
- **Pros**:
  - Clear error type (catch CompilationError specifically)
  - Structured error codes (MISSING_REQUIRED_SLOT, INVALID_SLOT_TYPE)
  - Includes input for debugging (but sanitized)
- **Cons**:
  - Custom error class (more code)
- **Risk**: None

**Option B: Throw standard Error**
```typescript
if (!input.system) throw new Error('Missing required slot: system');
```
- **Pros**:
  - Simpler, no custom class
- **Cons**:
  - Harder to catch specific error types
  - No structured error codes
  - No input context
- **Risk**: Low (standard pattern)

**Option C: Return Result<CompiledPrompt, CompilationError>**
```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

compile(input: PromptInput): Result<CompiledPrompt, CompilationError>
```
- **Pros**:
  - Functional error handling (no exceptions)
  - Caller forced to handle errors
- **Cons**:
  - Uncommon in TypeScript (more common in Rust/Haskell)
  - More verbose usage
- **Risk**: Medium (unfamiliar pattern for team)

### Decision: Option A (Throw custom CompilationError)

**Rationale**:
1. **Clear intent**: CompilationError signals prompt assembly failure
2. **Structured codes**: Easy to handle different error types
3. **Debugging**: Includes input context (sanitized)
4. **Standard pattern**: Common in TypeScript/Node.js

**Trade-off Accepted**: Must catch exceptions (but that's expected)

**Validation**: Golden tests will verify error messages are actionable

---

## Design Decision 7: Integration Timing

### Question
When should we integrate the compiler with StateGraph runners?

### Options Considered

**Option A: Integrate immediately in IMP-21**
- **Pros**:
  - End-to-end testing in production
  - Faster time to value
- **Cons**:
  - Risky (no observe period)
  - Couples IMP-21 to StateGraph changes
  - Violates "incremental" principle
- **Risk**: High (runtime integration without validation)

**Option B: Build library in IMP-21, integrate in IMP-24 (CHOSEN)**
- **Pros**:
  - IMP-21 is standalone library (testable in isolation)
  - Observe mode can run for days/weeks before integration
  - IMP-22/23 can build on top before integration
  - Rollback is easy (just don't integrate)
- **Cons**:
  - Delayed value delivery
  - Must wait for IMP-24 to see production impact
- **Risk**: Low (gradual rollout)

### Decision: Option B (Build library now, integrate later)

**Rationale**:
1. **Incremental**: IMP-21 is foundation, IMP-24 is integration
2. **Safe**: Can validate library in isolation before production use
3. **Parallel work**: IMP-22/23 can proceed while IMP-21 is in observe mode
4. **Testability**: Library is easier to test than integrated system

**Trade-off Accepted**: Delayed production use

**Timeline**:
- IMP-21 (this task): Build library + golden tests
- IMP-22/23: Build PersonaSpec + Domain Overlays on top
- IMP-24: Integrate with StateGraph (hook before each runner)
- Observe period: 1-2 weeks after IMP-24 before enforce mode

---

## Design Decision 8: Testing Strategy

### Question
What level of test coverage is sufficient?

### Options Considered

**Option A: Unit tests only**
- **Pros**:
  - Fast, isolated
  - Easy to maintain
- **Cons**:
  - Doesn't test integration with actual phase prompts
  - May miss edge cases
- **Risk**: Medium (incomplete testing)

**Option B: Unit tests + golden tests (CHOSEN)**
- **Pros**:
  - Unit tests verify correctness of each method
  - Golden tests verify real-world usage
  - Hash stability test (100 runs) catches non-determinism
- **Cons**:
  - More tests to maintain
  - Golden test data must be extracted from real prompts
- **Risk**: Low (comprehensive coverage)

**Option C: Unit tests + golden tests + integration tests**
- **Pros**:
  - Full coverage including StateGraph integration
- **Cons**:
  - Integration tests belong in IMP-24, not IMP-21
  - Over-testing for standalone library
- **Risk**: Low (but unnecessary for this task)

### Decision: Option B (Unit tests + golden tests)

**Rationale**:
1. **Unit tests**: Verify correctness of canonicalization, hashing, error handling
2. **Golden tests**: Verify real-world phase prompts compile correctly
3. **Hash stability test**: 100-run test catches non-determinism
4. **Coverage target**: ≥80% line coverage (specified in SPEC)

**Trade-off Accepted**: Golden tests require extracting real phase prompts (effort justified by regression protection)

**Test Files**:
- `__tests__/compiler.test.ts` - Unit tests + golden tests
- `__tests__/compiler.perf.test.ts` - Performance benchmark

---

## Architecture Review

### System Boundary

```
┌─────────────────────────────────────────────────────┐
│ IMP-21: Prompt Compiler (Standalone Library)       │
│                                                     │
│  ┌──────────────┐                                  │
│  │ PromptInput  │  (Typed slots)                   │
│  └──────┬───────┘                                  │
│         │                                           │
│         ▼                                           │
│  ┌──────────────────┐                              │
│  │ PromptCompiler   │                              │
│  │                  │                              │
│  │ - validate()     │  (Check required slots)     │
│  │ - assembleText() │  (String interpolation)     │
│  │ - canonicalize() │  (Sort keys, JSON)          │
│  │ - computeHash()  │  (SHA-256)                  │
│  └──────┬───────────┘                              │
│         │                                           │
│         ▼                                           │
│  ┌──────────────────┐                              │
│  │ CompiledPrompt   │  (Text + Hash + Metadata)   │
│  └──────────────────┘                              │
│                                                     │
└─────────────────────────────────────────────────────┘

Future Integration (IMP-24):

┌─────────────────────────────────────────────────────┐
│ StateGraph Runners (STRATEGIZE, SPEC, PLAN, ...)   │
│                                                     │
│  ┌──────────────────┐                              │
│  │ Runner           │                              │
│  │                  │                              │
│  │ 1. Get phase     │                              │
│  │ 2. Compile prompt│──────┐                       │
│  │ 3. Call LLM      │      │                       │
│  │ 4. Process result│      │                       │
│  └──────────────────┘      │                       │
│                            │                       │
│                            ▼                       │
│                  ┌──────────────────┐              │
│                  │ PromptCompiler   │              │
│                  └──────────────────┘              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Dependencies

**External Dependencies**: NONE (by design)
- Node.js crypto module (built-in)
- TypeScript (already in project)
- Vitest (already in project)

**Internal Dependencies**: NONE
- No imports from StateGraph
- No imports from runners
- Standalone library

**Future Dependencies** (IMP-24):
- StateGraph will depend on PromptCompiler
- Runners will call compiler before LLM invocation

### Data Flow

```
Input: PromptInput (from caller)
  │
  ▼
Validation (check required slots)
  │
  ▼
Assembly (interpolate slots into text)
  │
  ▼
Canonicalization (sort keys, JSON.stringify)
  │
  ▼
Hashing (SHA-256 of canonical form)
  │
  ▼
Output: CompiledPrompt (text + hash + metadata)
```

**Immutability**: PromptInput is not mutated (deep clone before canonicalization)

**No Side Effects**: Pure function (input → output, no state changes)

---

## Performance Analysis

### Estimated Latency Breakdown

For typical PromptInput (6 slots, ~500 chars total):

1. **Validation**: <0.1ms (field checks)
2. **Assembly**: <0.5ms (string interpolation)
3. **Canonicalization**: 2-5ms (recursive key sort + JSON.stringify)
4. **Hashing**: 1-3ms (SHA-256 of ~500 char string)

**Total Estimated**: 3-9ms (well within p95 <10ms budget)

### Performance Risks

**Risk 1: Large prompt inputs**
- If PromptInput grows to 10KB+ (e.g., full rubric text), canonicalization may exceed budget
- **Mitigation**: Keep slots concise, defer large content to later phases (IMP-23)

**Risk 2: Deep nesting**
- If future slots contain deeply nested objects, recursive key sort may be slow
- **Mitigation**: Keep PromptInput flat (no nested objects in current design)

**Risk 3: Memory allocation**
- Deep clone + sorted object + JSON string = 3x memory usage
- **Mitigation**: Acceptable for <10KB inputs, GC will clean up

**Validation**: Performance benchmark (Step 6 in PLAN) will measure actual latency

---

## Security Considerations

### Threat Model

**Non-Goals** (IMP-21 is not a security boundary):
- **Not protecting against malicious input**: Compiler runs in trusted context (autopilot)
- **Not preventing prompt injection**: That's LLM's responsibility
- **Not encrypting prompts**: Hash is for identity, not confidentiality

**Goals**:
- **Integrity**: Detect unintentional prompt changes
- **Auditability**: Link task to prompt version
- **Reproducibility**: Same input → same hash

### Potential Issues

**Issue 1: Sensitive data in prompts**
- **Risk**: PromptInput might contain API keys, credentials
- **Mitigation**: Caller's responsibility to sanitize (compiler doesn't inspect)
- **Future work**: IMP-24 could add sanitization layer

**Issue 2: Hash collision**
- **Risk**: Two different prompts hash to same value
- **Mitigation**: SHA-256 collision resistance is 2^128 operations (astronomically unlikely)

**Issue 3: Error leakage**
- **Risk**: CompilationError might leak sensitive input data
- **Mitigation**: Error messages don't include full input, just field names

**Verdict**: No security concerns for IMP-21 (standalone library in trusted context)

---

## Alternatives Not Chosen (Why Not)

### Alternative 1: Use LangChain PromptTemplate
- **Why not**: Heavy dependency, over-engineered for our needs
- **Decision**: Build minimal compiler instead

### Alternative 2: Store prompts in database
- **Why not**: IMP-21 is about compilation, not storage
- **Decision**: Stateless compiler, storage is future work (IMP-24 attestation)

### Alternative 3: Use content-addressable storage (CAS) like IPFS
- **Why not**: Over-engineering, we just need hash for identity
- **Decision**: SHA-256 hash is sufficient

### Alternative 4: Version prompts with semantic versioning
- **Why not**: Hash is better (content-based, not manual)
- **Decision**: Hash is automatic versioning

---

## Open Questions & Assumptions

### Assumptions

1. **Assumption**: PromptInput will remain small (<10KB)
   - **Validation**: Performance benchmark will test with realistic sizes
   - **Risk**: Low (current prompts are <2KB)

2. **Assumption**: JSON.stringify is deterministic within same Node.js version
   - **Validation**: Hash stability test (100 runs)
   - **Risk**: Medium (spec allows implementation variations)

3. **Assumption**: Future slots (IMP-22/23) will be optional strings
   - **Validation**: TypeScript interface allows adding optional fields
   - **Risk**: Low (forward compatible)

4. **Assumption**: No circular references in PromptInput
   - **Validation**: TypeScript interface doesn't allow circular refs
   - **Risk**: None (type system prevents)

### Open Questions (to be answered in later phases)

1. **Q**: How will IMP-24 handle compilation errors in production?
   - **A**: Deferred to IMP-24 (fallback to legacy? retry? alert?)

2. **Q**: Should hash be versioned (e.g., `v1:abc123...`)?
   - **A**: Not in IMP-21 (premature), revisit in IMP-24 if needed

3. **Q**: How will observe mode log results?
   - **A**: Deferred to IMP-24 (logger, metrics, telemetry)

4. **Q**: Should compiler support custom hash algorithms?
   - **A**: No (YAGNI), SHA-256 is sufficient

---

## Decision Log

| # | Decision | Rationale | Trade-off |
|---|----------|-----------|-----------|
| 1 | JSON.stringify + sorted keys | Simple, no dependencies | Slower than libraries |
| 2 | SHA-256 hash | Standard, built-in, future-proof | Slower than non-crypto |
| 3 | Three-state flag (off/observe/enforce) | Gradual rollout | Slightly more complex |
| 4 | system/phase required, rest optional | Flexible, forward compatible | Callers handle optionals |
| 5 | Simple string interpolation | YAGNI, fast, deterministic | Less flexible than templates |
| 6 | Throw CompilationError | Clear, structured, debuggable | Must catch exceptions |
| 7 | Build library, integrate later (IMP-24) | Safe, testable, incremental | Delayed value delivery |
| 8 | Unit tests + golden tests | Comprehensive, regression protection | More tests to maintain |

---

## Risk Mitigation Summary

| Risk | Mitigation | Validation |
|------|-----------|-----------|
| Hash instability | Recursive key sort + 100-run test | Hash stability test in VERIFY |
| Performance too slow | Simple algorithm + benchmark | Performance test in VERIFY |
| Over-engineering | Minimal slots, no templates, YAGNI | REVIEW phase checks simplicity |
| Integration breaks | Standalone library, IMP-24 integration | Feature flag + backward compat test |

---

**Date**: 2025-10-29
**Status**: THINK phase complete
**Next**: IMPLEMENT phase (start with Step 1: Compiler Skeleton)
