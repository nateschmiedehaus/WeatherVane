# Design: AFP-AUTOPILOT-V2-IMMUNE-20251119

> **Purpose:** Document your design thinking BEFORE implementing.
> This prevents compliance theater and ensures AFP/SCAS principles guide your work.

---

## Context

Phase 4 (Immune System) of Architecture V2 is partially implemented. Gatekeeper only logs messages; there is no enforceable gate for branch protection, commit hygiene, or CI blocking. Architecture V2 doesn’t enumerate SCAS traits or map them to modules, so design intent isn’t operationalized. Goal: implement a reusable Gatekeeper that enforces branch/commit/CI gates and update documentation to reflect SCAS-aligned immune design.

---

## Five Forces Check

### COHERENCE - Match the terrain
- [x] I searched for similar patterns in the codebase  
Modules checked (3 most similar):  
  - tools/wvo_mcp/scripts/enforce_commits.mjs (commit regex enforcement)  
  - tools/wvo_mcp/src/work_process/index.test.ts (process enforcement patterns)  
  - tools/wvo_mcp/ARCHITECTURE_V2.md (Immune design intent)
- Pattern I'm reusing: conventional-commit regex + fail-fast gating pattern from enforce_commits.

### ECONOMY - Achieve more with less
- [x] I explored deletion/simplification (via negativa - see next section)  
- Files/LOC estimate: 3 files (gatekeeper, test, doc), +120 -0 ≈ net +120 (≤150).

### LOCALITY - Related near, unrelated far
- [x] Related changes are in same module  
- Files changing: gatekeeper + test in src/immune, ARCHITECTURE_V2 doc, evidence files. Dependencies stay local to immune module.

### VISIBILITY - Important obvious, unimportant hidden
- [x] Errors are observable, interfaces are clear  
- Error handling: return booleans + structured messages; console.error for user-facing guidance.  
- Public API: `validatePush`, `validateCommitMessage`, `runCiGate` with options.

### EVOLUTION - Patterns prove fitness
- [x] I'm using proven patterns OR documenting new one for fitness tracking  
- Pattern fitness: commit regex mirrors enforce_commits; gating functions testable/observable.  
- Measuring success: tests + commit:check + wave0 dry-run outcomes.

**Pattern Decision:**

**Similar patterns found:**  
- enforce_commits.mjs: commit regex + CLI errors  
- wave0 gate enforcement tests: gate functions return structured results  
- Architecture V2 Immune description: conceptual branch/CI gating

**Pattern selected:** Reusable gate functions returning boolean + logging, configurable via options.  
**Why this pattern:** Simple, testable, mirrors existing enforce_commits behavior while keeping cohesion in immune module.

**Leverage Classification:**

**My code is:** Medium-High because it guards repository integrity and will be reused by hooks/agents.  
**Assurance strategy:** Unit tests for pass/fail paths, commit:check alignment, wave0 dry-run to observe runtime impact.

**Commit message will include:**
```
Pattern: immune_gatekeeper
Deleted: n/a (no >50 LOC deletion)
```

---

## Via Negativa Analysis

Existing enforce_commits script already validates messages, but it is CLI-oriented and not in immune module; no branch/CI gate exists. Deletion not sufficient because Immune System needs reusable API for orchestrator/hooks. Simplification: keep Gatekeeper minimal (no new deps, small surface).

---

## Refactor vs Repair Analysis

This is a refactor/complete implementation of the Immune component, not a patch. gatekeeper.ts is small (<200 LOC) so full replacement is feasible. No large functions exceed 50 LOC after change.

---

## Alternatives Considered

### Alternative 1: Hook-only enforcement
- What: Implement git hooks (pre-push/commit-msg) invoking shell scripts.  
- Pros: Immediate enforcement.  
- Cons: Harder to reuse in orchestrator; platform-specific; adds hook maintenance.  
- Why not selected: Want reusable TypeScript module for agents + hooks.

### Alternative 2: Integrate with existing enforce_commits.mjs via adapters
- What: Wrap existing script from immune module.  
- Pros: No new logic.  
- Cons: Still missing branch/CI gates; script is CLI-centric.  
- Why not selected: Need broader immune behaviors and better testability.

### Selected Approach: Reusable Gatekeeper API
- What: Implement TypeScript Gatekeeper with configurable protected branches, commit regex, and CI command + timeout; add unit tests; document SCAS alignment.  
- Why: Aligns with Architecture V2, testable, reusable by hooks/orchestrator.  
- AFP/SCAS alignment: Feedback loops (fail-fast), redundancy (multiple gates), visibility (clear errors), adaptability (configurable), locality (self-contained module).

---

## Complexity Analysis

- Complexity increases: Small increase due to options parsing and CI execution. Justified to enable configuration and observability. Mitigated by limiting surface area and tests for each path.  
- Complexity decreases: Consolidates immune logic in one module instead of scattered scripts.

---

## Implementation Plan

- **Scope:**  
  - `tools/wvo_mcp/src/immune/gatekeeper.ts` (implement options + enforcement)  
  - `tools/wvo_mcp/src/immune/gatekeeper.test.ts` (Vitest)  
  - `tools/wvo_mcp/ARCHITECTURE_V2.md` (Immune + SCAS details)  
  - Evidence files (strategy/spec/plan/think/design/implement/verify/review/monitor)
- **PLAN-authored tests:** Vitest gatekeeper tests (branch, commit regex, CI success/failure); `npm run commit:check`; `npm run wave0 -- --once --epic=WAVE-0 --dry-run`.
- **Autopilot scope:** Wave0 dry-run to ensure immune changes don’t break loop; capture logs if blocked.
- **Estimated LOC:** +120, -0, net +120 (≤150).  
- **Micro-batching compliance:** ≤5 files (gatekeeper.ts, gatekeeper.test.ts, ARCHITECTURE_V2.md, evidence updates).
- **Scope estimate (explicit):** Files = 3 non-evidence code/docs, LOC net +120 (within limits).

**Risk Analysis:**  
- Edge cases: empty branch, multiline commits, CI hang -> options + guards.  
- Failure modes: false positives/negatives -> tests.  
- Testing strategy: run Vitest filter + commit:check + wave0 dry-run.

**Assumptions:**  
- execa available; Vitest configured.  
- Protected branches default to `main` but configurable.  
- CI command provided/known; default safe placeholder allowed.  
- Wave0 dry-run feasible; if not, document blocker.

---

## Review Checklist (Self-Check)

- [x] I explored deletion/simplification (via negativa)
- [x] If adding code, I explained why deletion won't work
- [x] If modifying large files/functions, I considered full refactoring
- [x] I documented 2-3 alternative approaches
- [x] Any complexity increases are justified and mitigated
- [x] I estimated scope (files, LOC) and it's within limits
- [x] I thought through edge cases and failure modes
- [x] I authored the verification tests during PLAN (listed above) and have a testing strategy
- [x] If autopilot work, I defined the Wave 0 live loop (commands + telemetry) that VERIFY will execute

---

## Notes

- Maintain alignment with commit:check script to avoid divergent regex behavior.  
- Keep Gatekeeper pure (no git mutations) so it can be reused in hooks or orchestrator.

---

**Design Date:** 2025-11-19  
**Author:** Codex

---

## GATE Review Tracking

### Review 1: Pending (to be run via `npm run gate:review AFP-AUTOPILOT-V2-IMMUNE-20251119`)
