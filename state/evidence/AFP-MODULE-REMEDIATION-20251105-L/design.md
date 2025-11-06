# Design: AFP-MODULE-REMEDIATION-20251105-L

> Patch residual TypeScript diagnostics in pattern mining stub and research orchestrator.

---

## Context
- `PatternMiningClient.findPatterns` returns an object missing `source`, violating `PatternInsight` contract.
- `ResearchOrchestrator.composeContent` formats `alternative.confidence` directly; the type is optional, producing TS18048.
- Both issues affect live code rather than tests; quick fixes restore TypeScript build.

---

## Five Forces
- **Coherence:** Follow existing pattern of stubs using explicit `source` labels (e.g., `'stub'`).
- **Economy:** Minimal additions (one property + optional default). No new abstractions.
- **Locality:** Changes confined to respective modules.
- **Visibility:** Confidence fallback clarifies behaviour; stub annotation signals incomplete implementation.
- **Evolution:** Documented defaults make future implementation swap easier.

**Leverage:** Medium-high (unblocks `npm run build`). Testing via TypeScript compile.

---

## Via Negativa
- Deleting stub not viable (orchestrator uses it). Instead of larger refactor, add minimal fields.

---

## Alternatives
1. **Broader refactor** of pattern mining to real implementation – heavy, unnecessary.
2. **Optional chaining in orchestrator** without default – still leaves string `undefined`.
3. **Selected** – inject sensible defaults and leverage existing `normalizeConfidence`.

---

## Complexity
- Decreases by making behaviour explicit.

---

## Implementation Plan
1. Return `PatternInsight` with `source: 'stub'`, `tags: ['placeholder']`, ensuring unchanged semantics.
2. When composing alternative strings, call `normalizeConfidence(alternative.confidence ?? 0.6)` before formatting.
3. Run `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json`.

Scope: 2 files, ~10 LOC.

---

## Checklist
- [x] Via negativa considered
- [x] Alternatives evaluated
- [x] Scope within guardrails
- [x] Verification defined

---

**Design Date:** 2025-11-06
**Author:** Codex
