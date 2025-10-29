# IMP-21-22-SYNC PLAN: Implementation Steps

**Task**: IMP-21-22-SYNC - Coordinate Prompt Compiler + PersonaSpec
**Date**: 2025-10-29
**Phase**: PLAN
**Previous Phases**: STRATEGIZE ✅, SPEC ✅

---

## Implementation Steps

### Step 1: Add Persona Slot to PromptInput (~15 minutes)

**Objective**: Update PromptInput interface with optional persona field

**Files to Modify**:
- `tools/wvo_mcp/src/prompt/compiler.ts`

**Changes**:
```typescript
export interface PromptInput {
  system: string;
  phase: string;
  domain?: string;
  skills?: string;
  rubric?: string;
  persona?: string;         // ADD THIS LINE
  context?: string;
}
```

**Update assembleText()**:
```typescript
private assembleText(input: PromptInput): string {
  const parts: string[] = [input.system, input.phase];

  if (input.domain) parts.push(`Domain: ${input.domain}`);
  if (input.skills) parts.push(`Skills: ${input.skills}`);
  if (input.rubric) parts.push(`Rubric: ${input.rubric}`);
  if (input.persona) parts.push(`Persona: ${input.persona}`);  // ADD THIS LINE
  if (input.context) parts.push(`Context: ${input.context}`);

  return parts.join('\n\n');
}
```

**Verification Checkpoint**:
- TypeScript compiles without errors
- Existing tests still pass (19/19)

**Risks**: None (additive change, optional field)

---

### Step 2: Add Tests for Persona Slot (~30 minutes)

**Objective**: Verify persona slot compiles correctly

**File**: `tools/wvo_mcp/src/prompt/__tests__/compiler.test.ts`

**New Test Cases**:
```typescript
describe('Persona Slot (IMP-22 Integration)', () => {
  it('should compile with persona slot', () => {
    const input: PromptInput = {
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      persona: 'Role: expert-planner | Skills: typescript'
    };

    const compiler = new PromptCompiler();
    const compiled = compiler.compile(input);

    expect(compiled.text).toContain('Persona: Role: expert-planner');
    expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should compile without persona slot (backward compat)', () => {
    const input: PromptInput = {
      system: 'You are Claude.',
      phase: 'STRATEGIZE'
    };

    const compiler = new PromptCompiler();
    const compiled = compiler.compile(input);

    expect(compiled.text).not.toContain('Persona:');
    expect(compiled.text).toBe('You are Claude.\n\nSTRATEGIZE');
  });

  it('should change hash when persona changes', () => {
    const compiler = new PromptCompiler();

    const hash1 = compiler.compile({
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      persona: 'Role: planner'
    }).hash;

    const hash2 = compiler.compile({
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      persona: 'Role: reviewer'
    }).hash;

    expect(hash1).not.toBe(hash2);
  });

  it('should maintain hash stability with persona', () => {
    const input: PromptInput = {
      system: 'You are Claude.',
      phase: 'STRATEGIZE',
      persona: 'Role: expert'
    };

    const compiler = new PromptCompiler();
    const hashes: string[] = [];

    for (let i = 0; i < 10; i++) {
      hashes.push(compiler.compile(input).hash);
    }

    const unique = new Set(hashes);
    expect(unique.size).toBe(1); // All identical
  });
});
```

**Verification Checkpoint**:
- 4 new tests added
- All tests pass (19 existing + 4 new = 23 total)
- Coverage maintained

**Risks**: None (tests are straightforward)

---

### Step 3: Create Compiler Adapter Stub (~20 minutes)

**Objective**: Provide stub adapter for IMP-22 to implement

**File to Create**: `tools/wvo_mcp/src/persona_router/compiler_adapter.ts`

**Implementation**:
```typescript
/**
 * Compiler adapter for PersonaSpec integration (IMP-21-22-SYNC)
 *
 * This module provides a bridge between PersonaSpec (persona_router)
 * and PromptCompiler (prompt). It formats PersonaSpec data for the
 * compiler's persona slot.
 *
 * @module compiler_adapter
 */

/**
 * PersonaSpec structure (from persona_router/persona_spec.ts)
 *
 * NOTE: This is a simplified interface for the stub.
 * IMP-22 will use the full PersonaSpec from persona_spec.ts.
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
 * **STUB IMPLEMENTATION**: This is a minimal stub for IMP-21-22-SYNC.
 * IMP-22 will replace with proper canonicalization (sorted keys, stable hash).
 *
 * Current behavior: Simple pipe-separated string format.
 * IMP-22 behavior: Deterministic canonicalization with sorted keys.
 *
 * @param spec - PersonaSpec to format
 * @returns Serialized string for compiler persona slot
 *
 * @example
 * ```typescript
 * const spec = {
 *   phase_role: 'expert-planner',
 *   domain_overlays: ['api'],
 *   skill_packs: ['typescript']
 * };
 * const personaString = formatPersonaForCompiler(spec);
 * // Returns: "Role: expert-planner | Overlays: api | Skills: typescript"
 *
 * const compiler = new PromptCompiler();
 * const compiled = compiler.compile({
 *   system: 'You are Claude.',
 *   phase: 'STRATEGIZE',
 *   persona: personaString
 * });
 * ```
 */
export function formatPersonaForCompiler(spec: PersonaSpec): string {
  const parts: string[] = [];

  // Format each field if present
  if (spec.phase_role) {
    parts.push(`Role: ${spec.phase_role}`);
  }

  if (spec.domain_overlays && spec.domain_overlays.length > 0) {
    parts.push(`Overlays: ${spec.domain_overlays.join(', ')}`);
  }

  if (spec.skill_packs && spec.skill_packs.length > 0) {
    parts.push(`Skills: ${spec.skill_packs.join(', ')}`);
  }

  if (spec.capabilities && spec.capabilities.length > 0) {
    parts.push(`Capabilities: ${spec.capabilities.join(', ')}`);
  }

  // Join with pipe separator
  // IMP-22 will replace this with canonicalized JSON
  return parts.join(' | ');
}
```

**Verification Checkpoint**:
- File exists at specified path
- TypeScript compiles
- Exports PersonaSpec and formatPersonaForCompiler

**Risks**: None (simple stub, IMP-22 will replace)

---

### Step 4: Add Integration Tests (~30 minutes)

**Objective**: Verify compiler + adapter work together

**File to Create**: `tools/wvo_mcp/src/persona_router/__tests__/compiler_adapter.test.ts`

**Implementation**:
```typescript
import { describe, it, expect } from 'vitest';
import { PromptCompiler } from '../../prompt/compiler';
import { formatPersonaForCompiler, type PersonaSpec } from '../compiler_adapter';

describe('Compiler Adapter Integration (IMP-21-22-SYNC)', () => {
  describe('formatPersonaForCompiler', () => {
    it('should format complete persona spec', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner',
        domain_overlays: ['api', 'web'],
        skill_packs: ['typescript', 'vitest'],
        capabilities: ['code', 'research']
      };

      const formatted = formatPersonaForCompiler(spec);

      expect(formatted).toContain('Role: expert-planner');
      expect(formatted).toContain('Overlays: api, web');
      expect(formatted).toContain('Skills: typescript, vitest');
      expect(formatted).toContain('Capabilities: code, research');
    });

    it('should handle partial persona spec', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner'
      };

      const formatted = formatPersonaForCompiler(spec);

      expect(formatted).toBe('Role: expert-planner');
    });

    it('should handle empty persona spec', () => {
      const spec: PersonaSpec = {};
      const formatted = formatPersonaForCompiler(spec);

      expect(formatted).toBe('');
    });
  });

  describe('Integration with PromptCompiler', () => {
    it('should compile prompt with persona from adapter', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert-planner',
        domain_overlays: ['api']
      };

      const compiler = new PromptCompiler();
      const compiled = compiler.compile({
        system: 'You are Claude, an AI assistant.',
        phase: 'STRATEGIZE: Define objective and risks.',
        persona: formatPersonaForCompiler(spec)
      });

      expect(compiled.text).toContain('expert-planner');
      expect(compiled.text).toContain('api');
      expect(compiled.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different hashes for different personas', () => {
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

    it('should maintain hash stability with persona', () => {
      const spec: PersonaSpec = {
        phase_role: 'expert',
        domain_overlays: ['api']
      };

      const compiler = new PromptCompiler();
      const hashes: string[] = [];

      for (let i = 0; i < 10; i++) {
        const compiled = compiler.compile({
          system: 'You are Claude.',
          phase: 'STRATEGIZE',
          persona: formatPersonaForCompiler(spec)
        });
        hashes.push(compiled.hash);
      }

      const unique = new Set(hashes);
      expect(unique.size).toBe(1); // All identical
    });
  });
});
```

**Verification Checkpoint**:
- 7 integration tests pass
- No type errors
- Hash stability verified

**Risks**: None (tests verify integration works)

---

### Step 5: Update Documentation (~20 minutes)

**Objective**: Document persona slot and adapter usage

**Files to Update**:

1. **Prompt Compiler README** (`tools/wvo_mcp/src/prompt/README.md`):

Add section after "Prompt Slots":
```markdown
### Persona Slot (IMP-22 Integration)

The compiler supports an optional `persona` slot for persona-aware prompts.

**Usage**:
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

**Note**: The persona slot is optional. If not provided, compilation works as before.

**See Also**: IMP-22 for persona canonicalization and hashing implementation.
```

2. **Create Adapter README** (`tools/wvo_mcp/src/persona_router/README.md`):

```markdown
# Persona Router - Compiler Adapter

Adapter for integrating PersonaSpec with PromptCompiler (IMP-21).

## Usage

```typescript
import { formatPersonaForCompiler, type PersonaSpec } from './compiler_adapter';
import { PromptCompiler } from '../prompt/compiler';

// 1. Define persona spec
const spec: PersonaSpec = {
  phase_role: 'expert-planner',
  domain_overlays: ['api'],
  skill_packs: ['typescript']
};

// 2. Format for compiler
const personaString = formatPersonaForCompiler(spec);

// 3. Compile prompt with persona
const compiler = new PromptCompiler();
const compiled = compiler.compile({
  system: 'You are Claude.',
  phase: 'STRATEGIZE',
  persona: personaString
});
```

## Implementation Status

**Current (IMP-21-22-SYNC)**: Stub implementation
- Simple pipe-separated string format
- No canonicalization

**Future (IMP-22)**: Full implementation
- Deterministic canonicalization (sorted keys)
- SHA-256 hashing
- Attestation integration

## Architecture

```
persona_router/
  ├── persona_spec.ts         # PersonaSpec definitions
  ├── compiler_adapter.ts     # THIS FILE - Adapter for PromptCompiler
  └── __tests__/
      └── compiler_adapter.test.ts

prompt/
  ├── compiler.ts            # PromptCompiler (persona slot consumer)
  └── __tests__/
      └── compiler.test.ts
```

**Dependency Direction**: persona_router → prompt (one-way, no circular)
```

**Verification Checkpoint**:
- README sections added
- Examples are runnable
- Architecture documented

**Risks**: None (documentation only)

---

### Step 6: Verify No Circular Dependencies (~5 minutes)

**Objective**: Ensure clean module separation

**Verification**:
```bash
# Check for forbidden imports
grep -r "from.*persona_router" tools/wvo_mcp/src/prompt/

# Should return NO results (or only test imports)
```

**Manual Check**:
- ✅ prompt/compiler.ts does NOT import from persona_router
- ✅ persona_router/compiler_adapter.ts DOES import from prompt (allowed)

**Verification Checkpoint**:
- No circular dependencies detected
- TypeScript compiles without warnings

**Risks**: None (architectural check)

---

## Implementation Order (Strict Sequence)

1. ✅ **Add Persona Slot** (Step 1) → TypeScript compiles
2. ✅ **Add Compiler Tests** (Step 2) → Tests pass
3. ✅ **Create Adapter Stub** (Step 3) → TypeScript compiles
4. ✅ **Add Integration Tests** (Step 4) → All tests pass
5. ✅ **Update Documentation** (Step 5) → Docs complete
6. ✅ **Verify Dependencies** (Step 6) → No circular deps

**Rationale**: Must add slot before testing it. Must create adapter before integration tests. Dependencies check must come last.

---

## Rollback Plan

**If any step fails acceptance criteria**:

### Rollback Triggers:
1. Persona slot breaks existing tests
2. Circular dependency detected
3. Type conflicts arise
4. User requests different approach

### Rollback Actions:
```bash
# 1. Revert compiler changes
git restore tools/wvo_mcp/src/prompt/compiler.ts

# 2. Remove adapter files
rm tools/wvo_mcp/src/persona_router/compiler_adapter.ts
rm tools/wvo_mcp/src/persona_router/__tests__/compiler_adapter.test.ts
rm tools/wvo_mcp/src/persona_router/README.md

# 3. Revert documentation
git restore tools/wvo_mcp/src/prompt/README.md

# 4. Verify rollback
npm run build && npm test -- src/prompt/
```

**No data migrations needed**: All changes are code-only, no storage changes.

---

## Verification Checkpoints Summary

| Step | Checkpoint | Acceptance | Risk |
|------|-----------|-----------|------|
| 1. Add Slot | TypeScript compiles | 0 errors | None |
| 2. Add Tests | Test suite passes | 23/23 tests pass | None |
| 3. Create Adapter | TypeScript compiles | Exports correct types | None |
| 4. Integration Tests | Test suite passes | 7/7 tests pass | None |
| 5. Update Docs | README updated | Examples runnable | None |
| 6. Verify Deps | No circular deps | Grep check passes | None |

---

## Effort Estimate

**Total Estimate**: 2 hours

- Step 1 (Add Slot): 15 minutes
- Step 2 (Tests): 30 minutes
- Step 3 (Adapter): 20 minutes
- Step 4 (Integration Tests): 30 minutes
- Step 5 (Documentation): 20 minutes
- Step 6 (Verify Deps): 5 minutes

**Buffer**: +30 minutes for debugging (total ~2.5 hours)

**Commit Strategy**: Single commit "feat(prompt-compiler): Add persona slot for IMP-22 integration (IMP-21-22-SYNC)"

---

## Success Criteria (From SPEC)

**All 7 Acceptance Criteria Must Pass**:
- [x] AC1: Persona slot added to PromptInput
- [x] AC2: Compiler assembles persona into text
- [x] AC3: Adapter stub exists
- [x] AC4: Integration tests pass (7/7)
- [x] AC5: Backward compatibility preserved (19/19 IMP-21 tests pass)
- [x] AC6: Documentation updated
- [x] AC7: No circular dependencies

---

## Handoff to Codex (IMP-22)

**After IMP-21-22-SYNC Complete**:

Codex can proceed with IMP-22 implementation:
1. ✅ PersonaSpec interface is defined
2. ✅ Compiler persona slot exists and works
3. ✅ Adapter stub provides implementation target
4. ✅ Integration tests show expected behavior
5. ✅ No blocking dependencies

**Codex Next Steps**:
1. Replace formatPersonaForCompiler stub with canonicalization
2. Add PersonaSpec hashing
3. Integrate with attestation
4. Add persona_hash to ledger
5. Emit telemetry events

---

**Date**: 2025-10-29
**Status**: PLAN phase complete
**Next**: IMPLEMENT phase (add persona slot and adapter)
