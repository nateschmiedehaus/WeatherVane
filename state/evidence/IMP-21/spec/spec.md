# IMP-21 SPEC: Prompt Compiler

**Task**: IMP-21 - Prompt Compiler (Skeleton + Canonicalization)
**Date**: 2025-10-29
**Phase**: SPEC

---

## Acceptance Criteria (ALL Must Pass)

### AC1: Compiler Skeleton Exists ✅ MUST HAVE

**Deliverable**: TypeScript class with compile method

**File**: `tools/wvo_mcp/src/prompt/compiler.ts`

**Interface**:
```typescript
export interface PromptInput {
  system: string;           // Core system instructions
  phase: string;            // Phase-specific role/instructions
  domain?: string;          // Domain context (placeholder)
  skills?: string;          // Available methods (placeholder)
  rubric?: string;          // Quality criteria (placeholder)
  context?: string;         // Task-specific anchors
}

export interface CompiledPrompt {
  text: string;             // Assembled prompt text
  hash: string;             // SHA-256 hash of canonical form
  slots: PromptInput;       // Original slots (for debugging)
  compiledAt: string;       // ISO timestamp
}

export class PromptCompiler {
  compile(input: PromptInput): CompiledPrompt;
  private canonicalize(input: PromptInput): string;
  private computeHash(canonical: string): string;
}
```

**Verification**:
- [ ] File exists at specified path
- [ ] TypeScript compiles without errors
- [ ] Exports PromptCompiler, PromptInput, CompiledPrompt
- [ ] `compile()` method returns valid CompiledPrompt

---

### AC2: Deterministic Canonicalization ✅ MUST HAVE

**Requirement**: Same input → same hash 100% of time

**Algorithm**:
1. Deep clone input (prevent mutation)
2. Sort all object keys recursively
3. Strip non-deterministic fields (timestamps, UUIDs, session IDs)
4. JSON.stringify with sorted keys
5. SHA-256 hash of canonical string

**Test**:
```typescript
const input = { phase: 'STRATEGIZE', system: 'You are...', domain: 'api' };
const hashes = [];
for (let i = 0; i < 100; i++) {
  const compiled = compiler.compile(input);
  hashes.push(compiled.hash);
}
assert(new Set(hashes).size === 1); // All hashes identical
```

**Verification**:
- [ ] 100-run test passes (100 identical hashes)
- [ ] Object key order doesn't affect hash
- [ ] Empty slots handled correctly
- [ ] Hash is 64-character hex string (SHA-256)

---

### AC3: Golden Tests Pass ✅ MUST HAVE

**Requirement**: Baseline prompts compile to expected format

**Golden Test Cases** (minimum 5):
1. **STRATEGIZE phase**: System + phase + context
2. **SPEC phase**: System + phase + rubric
3. **IMPLEMENT phase**: System + phase + domain + skills
4. **VERIFY phase**: System + phase + rubric
5. **Minimal**: System only (all other slots empty)

**Test Format**:
```json
{
  "name": "strategize_baseline",
  "input": {
    "system": "You are Claude, an AI assistant...",
    "phase": "STRATEGIZE: Define objective, KPIs, risks...",
    "context": "Task: IMP-21"
  },
  "expected": {
    "contains": ["STRATEGIZE", "objective", "risks"],
    "hashPattern": "[0-9a-f]{64}"
  }
}
```

**Verification**:
- [ ] 5+ golden tests defined
- [ ] All golden tests pass
- [ ] Tests cover all slot combinations
- [ ] Hash format validated

---

### AC4: Backward Compatibility ✅ MUST HAVE

**Requirement**: Flag OFF → no behavior change

**Feature Flag**: `PROMPT_COMPILER` (env var)
- `off` (default initially): Use legacy prompt assembly
- `observe`: Use compiler, log results, don't affect behavior
- `enforce`: Use compiler exclusively (future)

**Test**:
```typescript
// With flag OFF
process.env.PROMPT_COMPILER = 'off';
const legacyPrompt = getLegacyPrompt('STRATEGIZE');

// With flag OBSERVE
process.env.PROMPT_COMPILER = 'observe';
const compiledPrompt = getCompiledPrompt('STRATEGIZE');

// Should be functionally equivalent (not necessarily identical strings)
assert(compiledPrompt.text.includes(legacyPrompt.mainContent));
```

**Verification**:
- [ ] Flag OFF → existing tests pass
- [ ] Flag OBSERVE → new compiler used
- [ ] No runtime errors with flag OFF
- [ ] Graceful fallback on compilation errors

---

### AC5: Performance Budget ✅ MUST HAVE

**Requirement**: Compilation latency <10ms (p95)

**Rationale**: Prompt assembly is on hot path for every phase transition

**Measurement**:
```typescript
const times = [];
for (let i = 0; i < 1000; i++) {
  const start = performance.now();
  compiler.compile(input);
  times.push(performance.now() - start);
}
const p95 = percentile(times, 95);
assert(p95 < 10); // p95 <10ms
```

**Verification**:
- [ ] p50 <5ms
- [ ] p95 <10ms
- [ ] p99 <20ms
- [ ] No memory leaks (1000 iterations)

---

### AC6: Error Handling ✅ MUST HAVE

**Requirement**: Clear errors for invalid inputs

**Error Cases**:
1. Missing required slot (system)
2. Invalid slot types (number instead of string)
3. Circular references in input
4. Hash computation fails

**Error Class**:
```typescript
export class CompilationError extends Error {
  constructor(
    message: string,
    public code: string,
    public input?: Partial<PromptInput>
  ) {
    super(message);
    this.name = 'CompilationError';
  }
}
```

**Verification**:
- [ ] Missing system → throws CompilationError
- [ ] Invalid types → throws CompilationError
- [ ] Error messages are actionable
- [ ] Errors don't leak sensitive data

---

### AC7: Documentation ✅ MUST HAVE

**Requirement**: Clear explanation of compiler and usage

**Files**:
- `tools/wvo_mcp/src/prompt/README.md` - Usage guide
- JSDoc on all public methods
- Example code snippets

**Content**:
- What is the compiler?
- Why stable hash matters
- How to add new slots (for future work)
- Feature flag usage
- Troubleshooting guide

**Verification**:
- [ ] README exists and is complete
- [ ] All public methods have JSDoc
- [ ] Examples are runnable
- [ ] Troubleshooting covers common errors

---

## Out of Scope (Explicitly NOT in IMP-21)

❌ **Actual domain overlays** (IMP-23)
❌ **PersonaSpec integration** (IMP-22)
❌ **StateGraph hook** (IMP-24)
❌ **Attestation wiring** (IMP-05, IMP-24)
❌ **Eval harness** (IMP-35)
❌ **Production enforcement** (future)

**Rationale**: IMP-21 is foundation only. Integration happens in later tasks.

---

## IO Schemas

### Input Schema (TypeScript)
```typescript
export interface PromptInput {
  system: string;           // REQUIRED
  phase: string;            // REQUIRED
  domain?: string;          // OPTIONAL (placeholder)
  skills?: string;          // OPTIONAL (placeholder)
  rubric?: string;          // OPTIONAL (placeholder)
  context?: string;         // OPTIONAL
}
```

### Output Schema (TypeScript)
```typescript
export interface CompiledPrompt {
  text: string;             // REQUIRED - assembled prompt
  hash: string;             // REQUIRED - SHA-256 hex (64 chars)
  slots: PromptInput;       // REQUIRED - original input
  compiledAt: string;       // REQUIRED - ISO 8601 timestamp
}
```

### Error Schema
```typescript
export class CompilationError extends Error {
  name: 'CompilationError';
  code: 'MISSING_REQUIRED_SLOT' | 'INVALID_SLOT_TYPE' | 'HASH_COMPUTATION_FAILED';
  input?: Partial<PromptInput>;
}
```

---

## Compatibility

### Forward Compatibility
- **Adding new slots**: Optional fields in PromptInput (won't break existing calls)
- **Hash algorithm change**: Prefix hash with version (`v1:abc123...`)
- **Deprecation window**: N/A (new code)

### Backward Compatibility
- **Feature flag**: `off` → legacy assembly, `observe` → new compiler
- **Kill switch**: Set `PROMPT_COMPILER=off` to disable instantly
- **No data migration**: Compiler is stateless, no storage

### Rollback Plan
```bash
# Emergency rollback
export PROMPT_COMPILER=off
# Delete compiler files (if needed)
rm tools/wvo_mcp/src/prompt/compiler.ts
git revert <commit-hash>
```

---

## Non-Functional Budgets

| Budget | Target | Verification |
|--------|--------|--------------|
| Compilation latency (p95) | <10ms | Performance test (1000 runs) |
| Memory per compilation | <1MB | Memory profiler |
| Test runtime | <5s | CI time budget |
| Code size | <500 lines | File size check |
| Test coverage | ≥80% | Coverage report |

---

## Observability Spec

### Spans (Future - IMP-24)
Not in scope for IMP-21 (observe mode only, no production integration)

### Metrics (Future)
Not in scope for IMP-21 (no telemetry yet)

### Logs (Minimal)
```typescript
// DEBUG level only
logger.debug('Compiling prompt', { phase, slots: Object.keys(input) });
logger.debug('Compiled prompt', { hash, lengthChars: text.length });
```

---

## Verification Mapping

| AC | Verification Method | Gate | Artifact |
|----|---------------------|------|----------|
| AC1 | TypeScript build | Build fails if missing | `dist/prompt/compiler.js` |
| AC2 | 100-run hash stability test | Test fails if <100% match | `verify/hash_consistency.log` |
| AC3 | Golden test suite | Test fails if any fail | `verify/golden_tests.json` |
| AC4 | Backward compat test | Test fails if behavior changes | `verify/backward_compat.log` |
| AC5 | Performance benchmark | Test fails if p95 >10ms | `verify/perf_benchmark.json` |
| AC6 | Error case tests | Test fails if errors unclear | `__tests__/compiler.test.ts` |
| AC7 | Docs review | REVIEW phase checks docs | `src/prompt/README.md` |

---

## Success Metrics

**Quantitative**:
- Hash stability: 100% (100/100 runs identical)
- Golden tests: 100% pass rate (5+/5+ tests)
- Performance: p95 <10ms
- Coverage: ≥80% line coverage
- Build: 0 errors, 0 warnings

**Qualitative**:
- Code is understandable (no magic)
- Docs are clear (reviewer can use it)
- Hash algorithm is documented (not black box)
- Feature flag works (easy to toggle)

---

## Dependencies

**Requires**:
- TypeScript compiler
- Vitest (testing framework)
- crypto module (SHA-256 hashing)
- No external libraries for canonicalization (keep it simple)

**Enables**:
- IMP-22 (PersonaSpec)
- IMP-23 (Domain Overlays)
- IMP-24 (StateGraph Hook)

---

**Date**: 2025-10-29
**Status**: SPEC phase complete
**Next**: PLAN phase
