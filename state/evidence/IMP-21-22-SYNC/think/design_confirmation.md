# IMP-21-22-SYNC THINK: Design Confirmation

**Task**: IMP-21-22-SYNC
**Date**: 2025-10-29
**Phase**: THINK

---

## Quick Design Confirmation

This is a simple coordination task with minimal design decisions. Most were already covered in PLAN, but confirming key choices:

### Decision 1: String vs Structured Persona Slot ✅ CONFIRMED

**Choice**: `persona?: string` (not PersonaInput object)

**Rationale**:
- Keeps compiler agnostic (doesn't need to know PersonaSpec structure)
- IMP-22 controls format via adapter
- More flexible for future changes
- Simpler implementation

**Risk**: None (stub adapter proves concept)

---

### Decision 2: Adapter Location ✅ CONFIRMED

**Choice**: `persona_router/compiler_adapter.ts` (not in prompt/)

**Rationale**:
- Clean dependency direction: persona_router → prompt (one-way)
- No circular dependencies
- Modularity: compiler doesn't import persona code

**Risk**: None (architectural best practice)

---

### Decision 3: Stub vs Full Implementation ✅ CONFIRMED

**Choice**: Stub implementation (IMP-22 replaces)

**Rationale**:
- Proves interface works
- Quick to implement (~20 min vs 2+ hours)
- IMP-22 owns canonicalization logic
- Reduces scope of this task

**Risk**: None (stub is well-documented, IMP-22 replaces)

---

## Implementation Approach ✅ CONFIRMED

Follow 6-step plan:
1. Add persona slot to PromptInput
2. Update assembleText() to include persona
3. Add compiler tests (4 tests)
4. Create adapter stub
5. Add integration tests (7 tests)
6. Update documentation

**Total Time**: ~2 hours
**Risk**: LOW (additive, backward compatible)

---

**Date**: 2025-10-29
**Status**: THINK phase complete (design confirmed)
**Next**: IMPLEMENT phase
