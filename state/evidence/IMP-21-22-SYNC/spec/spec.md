# IMP-21-22-SYNC SPEC: Interface Coordination

**Task**: IMP-21-22-SYNC - Coordinate Prompt Compiler + PersonaSpec
**Date**: 2025-10-29
**Phase**: SPEC

---

## Acceptance Criteria (ALL Must Pass)

### AC1: Persona Slot Added to PromptInput ✅ MUST HAVE

**Deliverable**: PromptInput interface has optional persona field

**Interface Change**:
```typescript
// tools/wvo_mcp/src/prompt/compiler.ts

export interface PromptInput {
  system: string;           // Core system instructions
  phase: string;            // Phase-specific role/instructions
  domain?: string;          // Domain context
  skills?: string;          // Available methods
  rubric?: string;          // Quality criteria
  context?: string;         // Task-specific anchors
  persona?: string;         // NEW: Persona content (serialized)
}
```

**Verification**:
- [ ] persona field exists in PromptInput
- [ ] persona is optional (`?:` marker)
- [ ] TypeScript compiles without errors
- [ ] Existing tests still pass (backward compatible)

---

### AC2: Compiler Assembles Persona into Text ✅ MUST HAVE

**Requirement**: If persona slot provided, include in assembled prompt

**Implementation**:
```typescript
// In compiler.ts assembleText() method

private assembleText(input: PromptInput): string {
  const parts: string[] = [input.system, input.phase];

  if (input.domain) parts.push(`Domain: ${input.domain}`);
  if (input.skills) parts.push(`Skills: ${input.skills}`);
  if (input.rubric) parts.push(`Rubric: ${input.rubric}`);
  if (input.persona) parts.push(`Persona: ${input.persona}`);  // NEW
  if (input.context) parts.push(`Context: ${input.context}`);

  return parts.join('\n\n');
}
```

**Verification**:
- [ ] Persona appears in compiled text if provided
- [ ] Persona does NOT appear if not provided
- [ ] Hash changes when persona changes
- [ ] Hash stable across multiple compiles with same persona

---

### AC3: Adapter Stub Exists ✅ MUST HAVE

**Deliverable**: Stub adapter for IMP-22 to implement

**File**: `tools/wvo_mcp/src/persona_router/compiler_adapter.ts`

**Interface**:
```typescript
/**
 * PersonaSpec structure (from persona_router/persona_spec.ts)
 */
export interface PersonaSpec {
  phase_role?: string;           // Role for this phase (e.g., 'expert-planner')
  domain_overlays?: string[];    // Domain-specific content (e.g., ['api', 'web'])
  skill_packs?: string[];        // Available skill packs (e.g., ['typescript', 'vitest'])
  capabilities?: string[];       // Capabilities enabled (e.g., ['code', 'research'])
}

/**
 * Formats PersonaSpec for prompt compiler persona slot.
 *
 * This is a STUB implementation for IMP-21-22-SYNC.
 * IMP-22 will replace with proper canonicalization.
 *
 * @param spec - PersonaSpec to format
 * @returns Serialized string for compiler persona slot
 *
 * @example
 * const spec = { phase_role: 'expert-planner', domain_overlays: ['api'] };
 * const personaString = formatPersonaForCompiler(spec);
 * compiler.compile({ system: '...', phase: '...', persona: personaString });
 */
export function formatPersonaForCompiler(spec: PersonaSpec): string {
  // STUB: Simple JSON serialization
  // IMP-22 will implement proper canonicalization with sorted keys
  const parts: string[] = [];

  if (spec.phase_role) parts.push(`Role: ${spec.phase_role}`);
  if (spec.domain_overlays?.length) parts.push(`Overlays: ${spec.domain_overlays.join(', ')}`);
  if (spec.skill_packs?.length) parts.push(`Skills: ${spec.skill_packs.join(', ')}`);
  if (spec.capabilities?.length) parts.push(`Capabilities: ${spec.capabilities.join(', ')}`);

  return parts.join(' | ');
}
```

**Verification**:
- [ ] File exists at specified path
- [ ] TypeScript compiles
- [ ] Exports PersonaSpec and formatPersonaForCompiler
- [ ] Function returns string (even if stub)
- [ ] IMP-22 can replace implementation without breaking interface

---

### AC4: Integration Test Passes ✅ MUST HAVE

**Requirement**: Verify compiler + adapter work together

**Test File**: `tools/wvo_mcp/src/persona_router/__tests__/compiler_adapter.test.ts`

**Test Cases**:
```typescript
import { describe, it, expect } from 'vitest';
import { PromptCompiler } from '../../prompt/compiler';
import { formatPersonaForCompiler, PersonaSpec } from '../compiler_adapter';

describe('Compiler Adapter Integration (IMP-21-22-SYNC)', () => {
  it('should format persona for compiler', () => {
    const spec: PersonaSpec = {
      phase_role: 'expert-planner',
      domain_overlays: ['api'],
      skill_packs: ['typescript']
    };

    const personaString = formatPersonaForCompiler(spec);

    expect(personaString).toContain('expert-planner');
    expect(personaString).toContain('api');
    expect(personaString).toContain('typescript');
  });

  it('should compile prompt with persona slot', () => {
    const spec: PersonaSpec = {
      phase_role: 'expert-planner'
    };

    const compiler = new PromptCompiler();
    const compiled = compiler.compile({
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      persona: formatPersonaForCompiler(spec)
    });

    expect(compiled.text).toContain('expert-planner');
    expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should handle empty persona spec', () => {
    const spec: PersonaSpec = {};
    const personaString = formatPersonaForCompiler(spec);

    const compiler = new PromptCompiler();
    const compiled = compiler.compile({
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      persona: personaString
    });

    // Should compile without error
    expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should change hash when persona changes', () => {
    const spec1: PersonaSpec = { phase_role: 'planner' };
    const spec2: PersonaSpec = { phase_role: 'reviewer' };

    const compiler = new PromptCompiler();

    const hash1 = compiler.compile({
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      persona: formatPersonaForCompiler(spec1)
    }).hash;

    const hash2 = compiler.compile({
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      persona: formatPersonaForCompiler(spec2)
    }).hash;

    expect(hash1).not.toBe(hash2);
  });
});
```

**Verification**:
- [ ] All 4 tests pass
- [ ] No type errors
- [ ] Hash stability verified

---

### AC5: Backward Compatibility Preserved ✅ MUST HAVE

**Requirement**: IMP-21 tests still pass without persona slot

**Verification**:
```bash
# Run existing IMP-21 tests
npm test -- src/prompt/__tests__/compiler.test.ts
```

**Expected**:
- All 19 existing tests pass
- No new failures
- No type errors

**Test**: Verify optional persona doesn't break existing usage
```typescript
// In compiler.test.ts
it('should compile without persona slot (backward compat)', () => {
  const input: PromptInput = {
    system: 'You are Claude.',
    phase: 'STRATEGIZE'
    // No persona field
  };

  const compiler = new PromptCompiler();
  const compiled = compiler.compile(input);

  expect(compiled.text).toBe('You are Claude.\n\nSTRATEGIZE');
  expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
});
```

**Verification**:
- [ ] Existing IMP-21 tests pass (19/19)
- [ ] New backward compat test passes
- [ ] No persona in text when not provided

---

### AC6: Documentation Updated ✅ MUST HAVE

**Requirement**: README and docs explain persona slot

**Updates Required**:

1. **Prompt Compiler README** (`tools/wvo_mcp/src/prompt/README.md`):
   - Add persona slot to API reference
   - Add example with persona
   - Document feature flag interaction

2. **Adapter README** (`tools/wvo_mcp/src/persona_router/README.md`):
   - Document compiler adapter usage
   - Explain stub vs IMP-22 implementation

**Example Documentation**:
```markdown
## Persona Slot (IMP-22 Integration)

The compiler supports an optional `persona` slot for persona-aware prompts.

```typescript
import { PromptCompiler } from './prompt/compiler';
import { formatPersonaForCompiler } from './persona_router/compiler_adapter';

const personaSpec = {
  phase_role: 'expert-planner',
  domain_overlays: ['api']
};

const compiler = new PromptCompiler();
const compiled = compiler.compile({
  system: 'You are Claude.',
  phase: 'STRATEGIZE',
  persona: formatPersonaForCompiler(personaSpec)
});
```

**Feature Flag Interaction**:
- `PROMPT_COMPILER=observe` + `PERSONA_HASHING_ENABLED=observe` → Full integration
- `PROMPT_COMPILER=off` + `PERSONA_HASHING_ENABLED=observe` → Warning logged

**See**: IMP-22 for persona hashing implementation
```

**Verification**:
- [ ] README updated with persona slot docs
- [ ] Examples include persona usage
- [ ] Feature flag matrix documented

---

### AC7: No Circular Dependencies ✅ MUST HAVE

**Requirement**: Clean module dependencies

**Rules**:
- ✅ `prompt/` does NOT import from `persona_router/`
- ✅ `persona_router/` CAN import from `prompt/` (for types)
- ✅ Adapter lives in `persona_router/`, not `prompt/`

**Verification**:
```bash
# Check for circular dependencies
grep -r "from.*persona_router" tools/wvo_mcp/src/prompt/

# Should return NO results (or only test imports)
```

**Test**: Verify dependency direction
```typescript
// ✅ ALLOWED: persona_router imports from prompt
import { PromptInput } from '../prompt/compiler';

// ❌ FORBIDDEN: prompt imports from persona_router
// import { PersonaSpec } from '../persona_router/persona_spec';
```

**Verification**:
- [ ] No imports from persona_router in prompt/
- [ ] Adapter imports from prompt work correctly
- [ ] TypeScript compiles without circular dependency warnings

---

## Out of Scope (IMP-22 Will Handle)

❌ **Persona Canonicalization**: formatPersonaForCompiler is stub, IMP-22 implements sorting
❌ **Attestation Integration**: IMP-22 adds persona_hash to attestation
❌ **Ledger Updates**: IMP-22 persists persona hash
❌ **Telemetry**: IMP-22 emits persona drift events
❌ **Feature Flag `PERSONA_HASHING_ENABLED`**: IMP-22 adds flag logic

---

## IO Schemas

### PromptInput (Updated)

```typescript
export interface PromptInput {
  system: string;           // REQUIRED
  phase: string;            // REQUIRED
  domain?: string;          // OPTIONAL
  skills?: string;          // OPTIONAL
  rubric?: string;          // OPTIONAL
  persona?: string;         // OPTIONAL (NEW)
  context?: string;         // OPTIONAL
}
```

### PersonaSpec (From persona_router)

```typescript
export interface PersonaSpec {
  phase_role?: string;           // Role name (e.g., 'expert-planner')
  domain_overlays?: string[];    // Domain filters (e.g., ['api', 'web'])
  skill_packs?: string[];        // Skill sets (e.g., ['typescript'])
  capabilities?: string[];       // Enabled capabilities
}
```

### Adapter Function

```typescript
function formatPersonaForCompiler(spec: PersonaSpec): string
```

---

## Compatibility

### Forward Compatibility

- **IMP-22 replaces adapter**: Can replace formatPersonaForCompiler implementation without breaking compiler
- **Additional persona fields**: PersonaSpec can add fields, adapter handles serialization
- **Canonicalization upgrade**: IMP-22 can add sorted keys without changing interface

### Backward Compatibility

- **Optional persona slot**: Existing code without persona continues to work
- **No behavior change if persona missing**: Compiler assembles as before
- **Feature flag default off**: No impact on production until explicitly enabled

---

## Verification Mapping

| AC | Verification Method | Gate | Artifact |
|----|---------------------|------|----------|
| AC1 | TypeScript build | Build fails if interface invalid | compiler.ts diff |
| AC2 | Unit test | Test fails if persona not assembled | compiler.test.ts |
| AC3 | File exists + TypeScript build | Build fails if missing | compiler_adapter.ts |
| AC4 | Integration test suite | Test fails if integration broken | compiler_adapter.test.ts |
| AC5 | IMP-21 test suite | Test fails if backward compat broken | test results log |
| AC6 | Manual review | REVIEW phase checks docs | README.md diff |
| AC7 | Grep check | Build/test if circular deps | dependency check log |

---

## Success Metrics

**Quantitative**:
- Persona slot added: ✅ (1 field)
- Backward compat: 100% (19/19 IMP-21 tests pass)
- Integration tests: 100% (4/4 pass)
- Build: 0 errors, 0 warnings

**Qualitative**:
- IMP-22 can proceed without blocking
- No circular dependencies
- Clean module separation
- Well-documented handoff

---

**Date**: 2025-10-29
**Status**: SPEC phase complete
**Next**: PLAN phase (implementation steps)
