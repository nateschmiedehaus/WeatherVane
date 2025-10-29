# IMP-21 PLAN: Prompt Compiler (Skeleton + Canonicalization)

**Task**: IMP-21 - Prompt Compiler
**Date**: 2025-10-29
**Phase**: PLAN
**Previous Phases**: STRATEGIZE ✅, SPEC ✅

---

## Implementation Steps

### Step 1: Create Compiler Skeleton (~1.5 hours)

**Objective**: Basic TypeScript class with interfaces and stub methods

**Files to Create**:
- `tools/wvo_mcp/src/prompt/compiler.ts` - Main compiler class
- `tools/wvo_mcp/src/prompt/index.ts` - Public exports

**Interfaces to Define**:
```typescript
export interface PromptInput {
  system: string;
  phase: string;
  domain?: string;
  skills?: string;
  rubric?: string;
  context?: string;
}

export interface CompiledPrompt {
  text: string;
  hash: string;
  slots: PromptInput;
  compiledAt: string;
}

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

export class PromptCompiler {
  compile(input: PromptInput): CompiledPrompt;
  private canonicalize(input: PromptInput): string;
  private computeHash(canonical: string): string;
  private validateInput(input: PromptInput): void;
  private assembleText(input: PromptInput): string;
}
```

**Implementation Details**:
- `compile()`: Entry point, validates → assembles → canonicalizes → hashes
- `validateInput()`: Check required slots (system, phase), throw CompilationError if missing
- `assembleText()`: Simple string interpolation (no templating language)
- `canonicalize()`: Deep clone + sort keys (implementation in Step 2)
- `computeHash()`: SHA-256 using Node.js crypto module

**Verification Checkpoint**:
- TypeScript compiles without errors
- Can instantiate PromptCompiler
- Can call compile() with valid input (hash will be placeholder)

**Risks**:
- None (skeleton is straightforward)

---

### Step 2: Implement Deterministic Canonicalization (~2 hours)

**Objective**: Canonicalize function that eliminates all non-determinism

**Algorithm**:
```typescript
private canonicalize(input: PromptInput): string {
  // 1. Deep clone to prevent mutation
  const cloned = JSON.parse(JSON.stringify(input));

  // 2. Strip non-deterministic fields
  // (none in PromptInput currently, but prepare for future)

  // 3. Sort object keys recursively
  const sorted = this.sortKeys(cloned);

  // 4. Deterministic JSON stringify
  return JSON.stringify(sorted);
}

private sortKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(this.sortKeys.bind(this));

  const sorted: any = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = this.sortKeys(obj[key]);
  });
  return sorted;
}
```

**Implementation Details**:
- Deep clone prevents mutation of original input
- Recursive key sorting ensures determinism
- No external dependencies (pure JS/TS)

**Verification Checkpoint**:
- Same input object → same canonical string 100% of time
- Different key order → same canonical string
- Handles empty optional slots correctly

**Risks**:
- **Medium Risk**: JSON.stringify may not be deterministic across Node.js versions
- **Mitigation**: Test on current Node.js version, document version requirement

---

### Step 3: Implement SHA-256 Hashing (~30 minutes)

**Objective**: Compute stable hash from canonical form

**Implementation**:
```typescript
import { createHash } from 'crypto';

private computeHash(canonical: string): string {
  return createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
}
```

**Implementation Details**:
- Use Node.js built-in crypto module (no external dependencies)
- SHA-256 produces 64-character hex string
- UTF-8 encoding for canonical string

**Verification Checkpoint**:
- Hash is 64-character hex string
- Same canonical string → same hash
- Different canonical strings → different hashes

**Risks**:
- None (SHA-256 is standard and deterministic)

---

### Step 4: Create Golden Test Suite (~2 hours)

**Objective**: 5+ baseline prompts with expected outputs

**Test File**: `tools/wvo_mcp/src/prompt/__tests__/compiler.test.ts`

**Test Cases**:
1. **STRATEGIZE baseline**: System + phase + context
2. **SPEC baseline**: System + phase + rubric
3. **IMPLEMENT baseline**: System + phase + domain + skills
4. **VERIFY baseline**: System + phase + rubric
5. **Minimal baseline**: System only (all other slots empty)
6. **Hash stability test**: Same input 100 times → 100 identical hashes
7. **Key order independence**: `{phase, system}` vs `{system, phase}` → same hash
8. **Error handling**: Missing system slot → CompilationError

**Test Framework**: Vitest (already in project)

**Test Data Extraction**:
- Read actual prompts from existing phase definitions
- Extract to golden test fixtures

**Verification Checkpoint**:
- All 8 tests pass
- Hash stability test: 100% identical hashes
- Coverage ≥80% for compiler.ts

**Risks**:
- **Low Risk**: Golden test data may not match actual phase prompts perfectly
- **Mitigation**: Extract from real phase definitions, not make up synthetic data

---

### Step 5: Feature Flag Integration (~1 hour)

**Objective**: Support `PROMPT_COMPILER` environment variable with safe fallback

**Implementation**:
```typescript
// In compiler.ts or separate config file
export function shouldUseCompiler(): boolean {
  const flag = process.env.PROMPT_COMPILER || 'off';
  return flag === 'observe' || flag === 'enforce';
}

export function compileOrFallback(input: PromptInput, legacyFn: () => string): CompiledPrompt {
  if (!shouldUseCompiler()) {
    // Fallback to legacy assembly
    const text = legacyFn();
    return {
      text,
      hash: 'legacy-no-hash',
      slots: input,
      compiledAt: new Date().toISOString()
    };
  }

  const compiler = new PromptCompiler();
  return compiler.compile(input);
}
```

**Flag Values**:
- `off` (default): Use legacy prompt assembly, no compilation
- `observe`: Use compiler, log results, don't affect behavior (future: diff with legacy)
- `enforce`: Use compiler exclusively (future work, not in IMP-21)

**Verification Checkpoint**:
- `PROMPT_COMPILER=off` → existing tests pass (no behavior change)
- `PROMPT_COMPILER=observe` → compiler used, tests pass
- `PROMPT_COMPILER=enforce` → compiler used (same as observe for now)

**Risks**:
- None (feature flag is standard pattern)

---

### Step 6: Performance Benchmark (~1 hour)

**Objective**: Verify compilation latency meets p95 <10ms budget

**Benchmark Test**: `tools/wvo_mcp/src/prompt/__tests__/compiler.perf.test.ts`

**Implementation**:
```typescript
import { performance } from 'perf_hooks';

test('compilation performance budget', () => {
  const input: PromptInput = {
    system: 'You are Claude...',
    phase: 'STRATEGIZE: Define objective...',
    domain: 'api',
    skills: 'TypeScript, Node.js',
    context: 'Task: IMP-21'
  };

  const times: number[] = [];
  const compiler = new PromptCompiler();

  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    compiler.compile(input);
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.50)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];

  console.log(`Performance: p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, p99=${p99.toFixed(2)}ms`);

  expect(p50).toBeLessThan(5);   // p50 <5ms
  expect(p95).toBeLessThan(10);  // p95 <10ms
  expect(p99).toBeLessThan(20);  // p99 <20ms
});
```

**Verification Checkpoint**:
- p50 <5ms
- p95 <10ms
- p99 <20ms
- No memory leaks (run 10,000 iterations, check memory usage)

**Risks**:
- **Medium Risk**: Canonicalization may be slower than expected
- **Mitigation**: If too slow, optimize sortKeys() or use faster JSON library
- **Abort Trigger**: If p95 >50ms, design is flawed (see STRATEGIZE abort triggers)

---

### Step 7: Documentation (~1 hour)

**Objective**: Clear usage guide and API documentation

**Files to Create**:
- `tools/wvo_mcp/src/prompt/README.md` - Usage guide

**Content Sections**:
1. **What is the Prompt Compiler?**
   - Problem: Ad-hoc string concatenation, no stable hash
   - Solution: Typed slots + canonicalization + stable hash

2. **Why Stable Hash Matters**
   - Attestation: Detect prompt drift
   - Regression detection: Golden tests
   - Audit trail: Link task to prompt version

3. **Usage Example**:
```typescript
import { PromptCompiler } from './prompt/compiler';

const compiler = new PromptCompiler();
const compiled = compiler.compile({
  system: 'You are Claude, an AI assistant...',
  phase: 'STRATEGIZE: Define objective, KPIs, risks...',
  context: 'Task: IMP-21'
});

console.log(compiled.hash); // e4d909c2...
console.log(compiled.text); // Assembled prompt
```

4. **Feature Flag Usage**:
```bash
# Observe mode (safe to enable)
export PROMPT_COMPILER=observe

# Disable (fallback to legacy)
export PROMPT_COMPILER=off
```

5. **Adding New Slots** (for future work):
   - Add optional field to PromptInput
   - Update assembleText() to interpolate new slot
   - Add golden test for new slot

6. **Troubleshooting**:
   - Q: Hash changes between runs?
   - A: Check for timestamps or non-deterministic fields
   - Q: CompilationError "MISSING_REQUIRED_SLOT"?
   - A: Ensure system and phase fields are provided

**JSDoc on Public Methods**:
```typescript
/**
 * Compiles a prompt from typed slots with deterministic hash.
 *
 * @param input - Prompt slots (system, phase, domain, skills, rubric, context)
 * @returns Compiled prompt with assembled text and stable hash
 * @throws CompilationError if required slots missing or invalid types
 *
 * @example
 * const compiler = new PromptCompiler();
 * const compiled = compiler.compile({
 *   system: 'You are Claude...',
 *   phase: 'STRATEGIZE: Define...'
 * });
 * console.log(compiled.hash); // e4d909c2...
 */
public compile(input: PromptInput): CompiledPrompt {
  // ...
}
```

**Verification Checkpoint**:
- README exists and is complete
- All public methods have JSDoc
- Examples are runnable (copy-paste into Node.js REPL)
- Troubleshooting covers common errors

**Risks**:
- None (documentation is straightforward)

---

## Implementation Order (Strict Sequence)

1. ✅ **Skeleton** (Step 1) → TypeScript compiles
2. ✅ **Canonicalization** (Step 2) → Same input → same canonical string
3. ✅ **Hashing** (Step 3) → Same canonical string → same hash
4. ✅ **Golden Tests** (Step 4) → All tests pass, hash stability verified
5. ✅ **Feature Flag** (Step 5) → Backward compatibility verified
6. ✅ **Performance** (Step 6) → Latency budget met
7. ✅ **Documentation** (Step 7) → README and JSDoc complete

**Rationale**: Must implement canonicalization before testing hash stability. Must have golden tests before verifying feature flag. Must meet performance budget before documentation (no point documenting slow code).

---

## Rollback Plan

**If any step fails acceptance criteria**:

### Rollback Triggers:
1. Hash stability test fails (<100% identical hashes)
2. Performance budget violated (p95 >50ms)
3. Backward compatibility breaks (flag=off changes behavior)
4. Cannot integrate with existing phase system

### Rollback Actions:
```bash
# 1. Delete compiler files
rm -rf tools/wvo_mcp/src/prompt/

# 2. Remove feature flag references
# (none yet, IMP-21 is observe mode only)

# 3. Revert commits
git revert <commit-hash>

# 4. Document why rollback happened
echo "Rollback reason: [hash instability/performance/compat]" >> state/evidence/IMP-21/rollback.md
```

**No data migrations needed**: Compiler is stateless, no storage, no runtime integration yet (IMP-24).

---

## Integration Points (Future Work - NOT in IMP-21)

**IMP-21 is standalone library**. Integration happens in later tasks:

- **IMP-22 (PersonaSpec)**: Will add persona slot to PromptInput
- **IMP-23 (Domain Overlays)**: Will populate domain/rubric slots
- **IMP-24 (StateGraph Hook)**: Will call compiler before each runner
- **IMP-05 (Attestation)**: Will use hash for prompt drift detection

**For IMP-21**: Just build the library and tests. No StateGraph changes, no runner changes, no attestation wiring.

---

## Verification Checkpoints Summary

| Step | Checkpoint | Acceptance | Risk |
|------|-----------|-----------|------|
| 1. Skeleton | TypeScript compiles | 0 errors | None |
| 2. Canonicalization | Hash stability test | 100% identical hashes | Medium |
| 3. Hashing | SHA-256 output | 64-char hex string | None |
| 4. Golden Tests | Test suite passes | 8/8 tests pass, ≥80% coverage | Low |
| 5. Feature Flag | Backward compat | Flag=off → no behavior change | None |
| 6. Performance | Latency benchmark | p95 <10ms | Medium |
| 7. Documentation | README + JSDoc | Examples runnable | None |

---

## Effort Estimate

**Total Estimate**: 9 hours (about 1.5 days of focused work)

- Step 1 (Skeleton): 1.5 hours
- Step 2 (Canonicalization): 2 hours
- Step 3 (Hashing): 0.5 hours
- Step 4 (Golden Tests): 2 hours
- Step 5 (Feature Flag): 1 hour
- Step 6 (Performance): 1 hour
- Step 7 (Documentation): 1 hour

**Buffer**: +2 hours for debugging (total ~11 hours)

**Commit Strategy**:
- Commit after each step (7 commits total)
- Squash to 1-2 commits for PR (skeleton+tests, flag+docs)

---

## Success Criteria (From SPEC)

**All 7 Acceptance Criteria Must Pass**:
- [x] AC1: Compiler Skeleton Exists → Verified in Step 1
- [x] AC2: Deterministic Canonicalization → Verified in Step 2+4 (100-run test)
- [x] AC3: Golden Tests Pass → Verified in Step 4 (5+/5+ tests)
- [x] AC4: Backward Compatibility → Verified in Step 5 (flag=off)
- [x] AC5: Performance Budget → Verified in Step 6 (p95 <10ms)
- [x] AC6: Error Handling → Verified in Step 4 (CompilationError tests)
- [x] AC7: Documentation → Verified in Step 7 (README + JSDoc)

---

## Dependencies

**Build Dependencies**:
- TypeScript compiler (already in project)
- Vitest (already in project)
- Node.js crypto module (built-in)

**No New External Dependencies**: Keep it simple, use built-in modules only.

---

**Date**: 2025-10-29
**Status**: PLAN phase complete
**Next**: THINK phase (design decisions, trade-offs, architecture review)
