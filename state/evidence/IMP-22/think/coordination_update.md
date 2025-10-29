# IMP-22 THINK: Coordination Update

**Date**: 2025-10-29
**Update**: IMP-21-22-SYNC completion resolves open questions

---

## Open Questions (from Codex) - NOW RESOLVED

### Q1: Final name/location for compiler adapter export

**Status**: ✅ RESOLVED (IMP-21-22-SYNC)

**Solution**:
- **Location**: `tools/wvo_mcp/src/persona_router/compiler_adapter.ts`
- **Interface**:
  ```typescript
  export interface PersonaSpec {
    phase_role?: string;
    domain_overlays?: string[];
    skill_packs?: string[];
    capabilities?: string[];
  }

  export function formatPersonaForCompiler(spec: PersonaSpec): string
  ```
- **Compiler Integration**: PromptInput now has `persona?: string` slot
- **Tests**: 6 integration tests prove interface works

### Q2: Should persona hash be included in telemetry counters or separate JSON lines?

**Decision**: Augment existing `prompt_drift_detected` metadata with `{dimension: 'persona'}`

**Rationale**:
- Reuses existing counter infrastructure
- Easy to query: filter by dimension
- No new telemetry fields needed

### Q3: Storage schema for ledger - confirm JSON structure can accept new field

**Decision**: JSON structure supports additive fields (no migration needed)

**Evidence**:
- Phase ledger uses JSON columns
- Backward compatible: older entries without field parse fine
- Verified in ledger tests

---

## Implementation Decisions

### 1. Canonicalization Algorithm

**Approach**: Deterministic JSON with sorted keys

**Steps**:
1. Deep clone PersonaSpec to prevent mutation
2. Sort all object keys alphabetically
3. Sort all array elements deterministically:
   - domain_overlays: alphabetically by domain name
   - skill_packs: alphabetically by skill pack ID
   - capabilities: alphabetically
4. JSON.stringify with sorted structure

**Performance Target**: <1ms per canonicalization (will benchmark)

### 2. Hash Function

```typescript
export function hashPersonaSpec(spec: PersonaSpec): string {
  const canonical = canonicalizePersonaSpec(spec);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
```

**Reuses**: Same SHA-256 approach as PromptCompiler (consistent)

### 3. Backward Compatibility

**Stub Replacement Strategy**:
- Keep `formatPersonaForCompiler()` function signature
- Replace pipe-separated format with JSON canonicalization
- Tests remain valid (output format changes but interface stable)

**Migration**:
- No breaking changes (function signature unchanged)
- Existing integration tests still pass
- New tests added for canonicalization specifics

---

## Edge Cases Addressed

### Empty/Partial PersonaSpec

```typescript
// Empty
hashPersonaSpec({}) → deterministic hash of '{}'

// Partial
hashPersonaSpec({ phase_role: 'planner' }) → stable hash
```

### Array Ordering

```typescript
// These produce SAME hash (sorted internally):
hashPersonaSpec({ domain_overlays: ['web', 'api'] })
hashPersonaSpec({ domain_overlays: ['api', 'web'] })
```

### Undefined vs Missing Fields

```typescript
// These produce SAME hash:
hashPersonaSpec({ phase_role: 'planner', domain_overlays: undefined })
hashPersonaSpec({ phase_role: 'planner' })
```

---

## Next: IMPLEMENT Phase

Ready to proceed with implementation:
1. Replace stub `formatPersonaForCompiler()` with canonicalization
2. Add `canonicalizePersonaSpec()` helper
3. Add `hashPersonaSpec()` function
4. Update tests (keep existing 6, add canonicalization tests)
5. Integrate with PromptAttestation
6. Update WorkProcessEnforcer
7. Add telemetry support

**Date**: 2025-10-29
**Status**: THINK phase updated with IMP-21-22-SYNC resolution
