# IMP-21-22-SYNC STRATEGIZE: Coordinate Prompt Compiler + PersonaSpec

**Task**: IMP-21-22-SYNC - Coordinate IMP-21 (Prompt Compiler) with IMP-22 (PersonaSpec)
**Date**: 2025-10-29
**Phase**: STRATEGIZE
**Type**: Coordination / Handshake Task

---

## Context

- **IMP-21 (Prompt Compiler)**: ✅ COMPLETE (Claude)
  - Built standalone prompt compiler with typed slots
  - Canonicalization + SHA-256 hash implemented
  - Feature flag: `PROMPT_COMPILER` (off/observe/enforce)
  - Location: `tools/wvo_mcp/src/prompt/`

- **IMP-22 (PersonaSpec)**: ⏳ STRATEGIZE/SPEC/PLAN COMPLETE (Codex)
  - Planned persona canonicalization + hashing
  - Attestation integration designed
  - Feature flag: `PERSONA_HASHING_ENABLED` (observe/off)
  - Location: `tools/wvo_mcp/src/persona_router/`

**Problem**: IMP-22 expects IMP-21 to provide a persona slot, but IMP-21 was built without knowing IMP-22's requirements. Need to sync interfaces before Codex implements IMP-22.

---

## Objective (One Sentence)

Align IMP-21's prompt compiler interface with IMP-22's PersonaSpec requirements by adding a persona slot, creating a shared adapter, and coordinating feature flags so Codex can implement IMP-22 without blocking or breaking IMP-21.

---

## Success KPI

**Primary**: IMP-22 implementation can proceed without modifying IMP-21 core logic (only additive changes)

**Leading Indicators**:
- Persona slot added to PromptInput interface
- Compiler adapter exists for IMP-22 to use
- Feature flags coordinated (both default to observe mode)
- Type definitions shared between modules
- No circular dependencies between prompt/ and persona_router/

**Measurement**:
- IMP-22 implementation can import from IMP-21 without conflicts
- IMP-21 tests still pass after persona slot added
- Both feature flags can be toggled independently

---

## Two Invariants (Will Not Break)

### Invariant 1: No Breaking Changes to IMP-21

- **Guarantee**: Persona slot is OPTIONAL in PromptInput (backward compatible)
- **Why Critical**: IMP-21 is already committed (0ac0efea), can't break existing API
- **Verification**: IMP-21 tests still pass after adding persona slot
- **Enforcement**: Persona slot has `?:` optional marker in TypeScript

### Invariant 2: No Circular Dependencies

- **Guarantee**: Prompt compiler does NOT import from persona_router, only provides slots
- **Why Critical**: Modularity - compiler should be agnostic to persona implementation
- **Verification**: Check imports with `grep -r "from.*persona_router" tools/wvo_mcp/src/prompt/`
- **Enforcement**: Adapter lives in persona_router, not prompt

---

## Top 2 Risks

### Risk 1: Interface Mismatch (High Impact, Medium Likelihood)

- **Description**: IMP-22 expects different persona data structure than IMP-21 can provide
- **Impact**: IMP-22 implementation stalls, needs rework
- **Likelihood**: Medium (Codex planned without seeing IMP-21 code)
- **Mitigation**:
  - Define explicit PersonaInput interface (shared type)
  - Create adapter in persona_router that converts PersonaSpec → PersonaInput
  - Document expected structure in both modules
  - Add integration test that calls both IMP-21 and IMP-22 code
- **Revisit By**: 2025-11-01 (before IMP-22 implementation starts)
- **Risk Appetite**: LOW - must resolve before IMP-22 coding

### Risk 2: Feature Flag Confusion (Medium Impact, Low Likelihood)

- **Description**: Two feature flags (`PROMPT_COMPILER` and `PERSONA_HASHING_ENABLED`) lead to confusing state matrix
- **Impact**: Developers don't know which flag to set for testing
- **Likelihood**: Low (both default to observe/off)
- **Mitigation**:
  - Document flag interaction matrix in README
  - Both flags default to observe mode (safe)
  - Persona hashing fails gracefully if compiler off
  - Add sanity check in code that warns if flags misaligned
- **Revisit By**: 2025-11-01
- **Risk Appetite**: MEDIUM - acceptable if documented

---

## Scope Guardrails

### IN SCOPE (This Sync Task)

✅ **Add Persona Slot to PromptInput**:
- Add `persona?: string | PersonaInput` to PromptInput interface
- Update assembleText() to handle persona slot (if provided)
- Update tests to verify persona slot works
- Update README to document persona slot

✅ **Create Shared Types**:
- Define PersonaInput interface (or reuse string)
- Export from prompt/compiler.ts or shared types file
- Document expected structure

✅ **Create Compiler Adapter (stub)**:
- Location: `tools/wvo_mcp/src/persona_router/compiler_adapter.ts`
- Purpose: Convert PersonaSpec → PersonaInput for compiler
- Stub implementation (IMP-22 will fill in)

✅ **Feature Flag Coordination**:
- Document flag interaction matrix
- Add sanity check warnings
- Update README with flag guidance

✅ **Integration Test**:
- Test that persona slot compiles correctly
- Test that adapter stub works (even if minimal)

### OUT OF SCOPE (IMP-22 Will Handle)

❌ **PersonaSpec Canonicalization**: IMP-22 implements
❌ **Attestation Integration**: IMP-22 implements
❌ **Ledger Updates**: IMP-22 implements
❌ **Telemetry**: IMP-22 implements
❌ **Actual persona content population**: IMP-24 implements

---

## Abort Triggers (Blast-Radius Limiters)

**ABORT if any of these occur**:

1. **IMP-21 tests break**: If persona slot causes any existing test to fail
2. **Circular dependency detected**: If prompt imports from persona_router
3. **Type conflicts**: If PersonaInput conflicts with existing types
4. **User says stop**: If user wants different approach

**Rollback Plan**: Revert persona slot addition, delete adapter stub, no harm done

---

## Link to Purpose (Long-Lived Invariants)

### Why This Matters

**Problem**: IMP-22 can't proceed without knowing IMP-21's interface
- Codex planned IMP-22 assuming persona slot exists
- IMP-21 was built without persona awareness
- Need handshake to align before IMP-22 implementation

**Solution**: Add minimal persona slot to IMP-21, create adapter stub for IMP-22
- Backward compatible (optional slot)
- No circular dependencies (adapter in persona_router)
- IMP-22 can proceed with implementation

### Alignment with Invariants

- **Anti-drift**: Both modules use stable hashing (already designed)
- **Modularity**: Clean separation (compiler agnostic, adapter in persona_router)
- **Backward compat**: Optional slot doesn't break existing code
- **Feature flags**: Both can be toggled independently

---

## Success Looks Like (Concrete Outcomes)

**At End of IMP-21-22-SYNC**:

1. ✅ PromptInput has `persona?: string` slot (or PersonaInput type)
2. ✅ Compiler assembles persona into prompt text (if provided)
3. ✅ Adapter stub exists at `tools/wvo_mcp/src/persona_router/compiler_adapter.ts`
4. ✅ Integration test verifies persona slot works
5. ✅ IMP-21 tests still pass (backward compatible)
6. ✅ Documentation updated (README, feature flag matrix)
7. ✅ Codex can start IMP-22 implementation without blocking

**Evidence of Success**:
- `state/evidence/IMP-21-22-SYNC/verify/integration_test.log` shows persona compilation works
- `state/evidence/IMP-21-22-SYNC/verify/backward_compat.log` shows IMP-21 tests pass
- `tools/wvo_mcp/src/persona_router/compiler_adapter.ts` exists (stub)

---

## Related Work & Integration Points

**Builds On**:
- IMP-21 (Prompt Compiler): Adds persona slot ✅
- IMP-22 (PersonaSpec): Uses persona slot ⏳

**Enables**:
- IMP-22 (PersonaSpec): Can implement without blocking on IMP-21
- IMP-24 (StateGraph Hook): Will populate persona slot from router
- IMP-25 (Tool Allowlists): Will use persona hash for enforcement

**Integrates With**:
- Feature flags: Both PROMPT_COMPILER and PERSONA_HASHING_ENABLED
- Type system: Shared PersonaInput type

---

## Coordination Points (Codex Needs to Know)

### 1. Persona Slot Interface

**Decision Needed**: What structure for persona slot?

**Option A: Simple String** (RECOMMENDED):
```typescript
export interface PromptInput {
  system: string;
  phase: string;
  domain?: string;
  skills?: string;
  rubric?: string;
  context?: string;
  persona?: string;  // NEW: Serialized persona content
}
```
- **Pros**: Simple, IMP-22 controls serialization format
- **Cons**: Compiler doesn't know persona structure

**Option B: Structured Object**:
```typescript
export interface PersonaInput {
  role: string;
  overlays: string[];
  capabilities: string[];
}

export interface PromptInput {
  // ...
  persona?: PersonaInput;
}
```
- **Pros**: Type-safe, compiler can format persona sections
- **Cons**: Couples compiler to persona structure, less flexible

**Recommendation**: **Option A (string)** - keeps compiler agnostic, IMP-22 controls format

### 2. Compiler Adapter Location

**Location**: `tools/wvo_mcp/src/persona_router/compiler_adapter.ts`

**Purpose**: Convert PersonaSpec → string for compiler persona slot

**Stub Interface**:
```typescript
export interface PersonaSpec {
  phase_role?: string;
  domain_overlays?: string[];
  skill_packs?: string[];
  capabilities?: string[];
}

export function formatPersonaForCompiler(spec: PersonaSpec): string {
  // Stub: IMP-22 will implement
  // For now, just serialize as JSON
  return JSON.stringify(spec);
}
```

### 3. Feature Flag Interaction Matrix

| PROMPT_COMPILER | PERSONA_HASHING_ENABLED | Behavior |
|----------------|------------------------|----------|
| off | off | Legacy prompt assembly, no persona ✅ Default |
| off | observe | Legacy prompt, persona hash logged (warning) |
| observe | off | Compiler used, no persona hash |
| observe | observe | Compiler + persona hash (ideal for testing) ✅ Recommended |
| enforce | observe | Compiler required, persona hash logged |
| enforce | enforce | Full integration (future production) |

**Sanity Check**: If PERSONA_HASHING_ENABLED=observe but PROMPT_COMPILER=off, warn that persona won't be in prompt

### 4. Integration Test Requirements

**Test**: Both IMP-21 and IMP-22 code work together

```typescript
// Integration test (IMP-21-22-SYNC)
import { PromptCompiler } from '../prompt/compiler';
import { formatPersonaForCompiler } from '../persona_router/compiler_adapter';

test('persona slot integrates with compiler', () => {
  const personaSpec = {
    phase_role: 'expert-planner',
    domain_overlays: ['api'],
    skill_packs: ['typescript']
  };

  const personaString = formatPersonaForCompiler(personaSpec);

  const compiler = new PromptCompiler();
  const compiled = compiler.compile({
    system: 'You are Claude.',
    phase: 'STRATEGIZE',
    persona: personaString
  });

  expect(compiled.text).toContain('expert-planner');
  expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
});
```

---

## Effort Estimate

**Rough Estimate**:
- Add persona slot to compiler: 30 minutes
- Update tests: 30 minutes
- Create adapter stub: 15 minutes
- Integration test: 30 minutes
- Documentation: 30 minutes
- **Total**: 2-2.5 hours

**Commit Strategy**: Single commit "feat(prompt-compiler): Add persona slot for IMP-22 integration"

---

## Next Steps

1. **SPEC**: Define persona slot interface and adapter contract
2. **PLAN**: Break down into implementation steps
3. **IMPLEMENT**: Add persona slot, create adapter stub, update tests
4. **VERIFY**: Run integration test, verify backward compat
5. **REVIEW**: Check for gaps, ensure IMP-22 can proceed
6. **PR**: Commit changes
7. **HANDOFF**: Notify Codex that IMP-22 can proceed

---

**Date**: 2025-10-29
**Status**: STRATEGIZE phase
**Next**: SPEC phase (define interfaces)
