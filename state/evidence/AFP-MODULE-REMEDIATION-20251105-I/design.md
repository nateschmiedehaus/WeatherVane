# Design: AFP-MODULE-REMEDIATION-20251105-I

> **Purpose:** Document your design thinking BEFORE implementing.
> This prevents compliance theater and ensures AFP/SCAS principles guide your work.

---

## Context

**What problem are you solving and WHY?**

TypeScript compilation for the MCP server is blocked by persistent diagnostics in tests and supporting modules. These failures force us to rely on ts-node fallbacks (violating coherence) and undermine automated gating. We need an AFP-aligned assessment that classifies each error and recommends deletion, consolidation, or fixes so future tasks can close the gaps deliberately.

---

## Five Forces Check

### COHERENCE - Match the terrain
- [x] I searched for similar patterns in the codebase
- Modules checked: `state/evidence/AFP-MODULE-REMEDIATION-20251105-G/design.md`, `tools/wvo_mcp/src/critics/ml_task_aggregator.ts`, `tools/wvo_mcp/src/orchestrator/feature_gates.ts`
- Pattern I'm reusing: structured remediation plan (analysis doc + follow-up subtasks) used in earlier module cleanups.

### ECONOMY - Achieve more with less
- [x] I explored deletion/simplification (via negativa) – plan prioritises removing obsolete tests/mocks where safe.
- LOC estimate: analysis-only task (docs + follow-up entries); no code changes yet.

### LOCALITY - Related near, unrelated far
- [x] Work is documentation/analysis, touching `state/evidence/...` and follow-up tracker only.

### VISIBILITY - Important obvious, unimportant hidden
- [x] Outcome will be explicit analysis file enumerating each diagnostic with recommended remediation.

### EVOLUTION - Patterns prove fitness
- [x] Builds on previous module remediation approach; future tasks will cite the analysis as source of truth.

**Pattern selected:** Evidence-first remediation catalog.
**Why:** Keeps implementation tasks lean, ensures AFP compliance before coding.

**Leverage level:** high (unlocking TypeScript build is critical). Assurance via thorough documentation, command outputs saved in evidence.

**Commit message will include:**
```
Pattern: remediation.analysis_catalog
Deleted: n/a
```

---

## Via Negativa Analysis

- Evaluated deleting disabled or redundant tests; analysis will flag suites eligible for removal.
- If a diagnostic stems from unused module, recommend decommissioning instead of patching.

---

## Refactor vs Repair Analysis

- This task is discovery only; subsequent implementation tasks will choose refactor vs repair. Analysis will highlight when refactoring entire suite is preferable to patching fixtures.

---

## Alternatives Considered

1. **Implement fixes immediately** – rejected; risk of violating micro-batching while scope unclear.
2. **Ignore diagnostics** – rejected; violates AFP/SCAS visibility and blocks compiled workflows.
3. **Selected** – produce comprehensive remediation plan, then schedule targeted fixes/deletions.

---

## Complexity Analysis

- Complexity decreases by making diagnostics explicit and actionable.
- No additional code complexity introduced.

---

## Implementation Plan

**Scope:** create `analysis.md`, update follow-ups, record verification commands. No tests authored (analysis only). Not an autopilot Wave 0 change.

**Risk Analysis:** misclassification mitigated by including references/usage notes for each diagnostic.

**Assumptions:** error list complete; no hidden diagnostics in other configs.

---

## Review Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope within guardrails
- [x] Testing strategy defined (command outputs captured as evidence)

---

## Notes
- Follow-up tasks will reference this analysis when implementing fixes.

---

**Design Date:** 2025-11-06
**Author:** Codex (autonomous worker)

---

## GATE Review Tracking
- Review pending.
