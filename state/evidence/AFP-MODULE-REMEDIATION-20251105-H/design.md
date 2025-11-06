# Design: AFP-MODULE-REMEDIATION-20251105-H

> **Purpose:** Document your design thinking BEFORE implementing.
> This prevents compliance theater and ensures AFP/SCAS principles guide your work.

---

## Context

**What problem are you solving and WHY?**

`npm run gate:review` currently executes `tools/wvo_mcp/scripts/run_design_review.ts` directly via ts-node. When the TypeScript hasn’t been emitted to `dist`, ts-node cannot resolve `../src/critics/design_reviewer.js`, causing `[Object: null prototype]` crashes that block GATE automation. Moving the CLI into the compiled toolchain eliminates ts-node loader quirks and aligns the reviewer with other MCP utilities.

---

## Five Forces Check

**Before proceeding, verify you've considered all five forces:**

### COHERENCE - Match the terrain
- [x] I searched for similar patterns in the codebase
- Modules checked (3 most similar): `tools/wvo_mcp/src/cli/run_with_codex.ts`, `tools/wvo_mcp/src/cli/run_consensus_simulation.ts`, `tools/wvo_mcp/src/index.ts`
- Pattern I'm reusing: compiled CLI entrypoint under `src/cli/` consumed from `dist/` after `npm run build`.

### ECONOMY - Achieve more with less
- [x] I explored deletion/simplification (via negativa - see next section)
- Code I can delete: legacy loader hacks (dynamic import, util.inspect debugging) and direct ts-node execution path. Net LOC change estimated +40 / -80 ⇒ net -40 LOC.

### LOCALITY - Related near, unrelated far
- [x] Related changes are in same module
- Files changing: new `src/cli/run_design_review.ts`, update `package.json` script, delete old `scripts/run_design_review.ts`, add evidence entries.
- Dependencies: remains within MCP tooling; no cross-application coupling.

### VISIBILITY - Important obvious, unimportant hidden
- [x] Errors are observable, interfaces are clear
- Error handling: CLI will continue to print color-coded summaries and exit non-zero on failure; build failures surface before execution.
- Public API: `npm run gate:review` remains the entrypoint, now backed by deterministic compiled JS.

### EVOLUTION - Patterns prove fitness
- [x] I'm using proven patterns OR documenting new one for fitness tracking
- Pattern fitness: other CLIs already live in `src/cli` and are compiled; adopting the same pattern ensures consistent telemetry and easier maintenance.

**Pattern Decision:**

**Similar patterns found:** [from COHERENCE search above]
- Pattern 1: `tools/wvo_mcp/src/cli/run_with_codex.ts` – compiled CLI wrapper invoking orchestrator runtime.
- Pattern 2: `tools/wvo_mcp/src/cli/run_consensus_simulation.ts` – uses compiled output with argument parsing.
- Pattern 3: `tools/wvo_mcp/src/index.ts` – central entrypoint exported via build.

**Pattern selected:** compiled CLI under `src/cli`.
**Why this pattern:** Matches existing tooling, avoids runtime ts-node dependency, ensures build artifacts exist prior to execution.

**Leverage Classification:**

**Code leverage level:** high

- High leverage because the CLI enforces AFP GATE discipline; reliability is critical for autonomy.

**My code is:** high **because** gating is safety-critical; downtime blocks autopilot workflows.
**Assurance strategy:** unit coverage already lives in critic; rely on `npm run build`, `npm run gate:review`, and direct design reviewer invocation for verification.

**Commit message will include:**
```
Pattern: cli.compiled_gate_review
Deleted: scripts/run_design_review.ts
```

---

## Via Negativa Analysis

**Can you DELETE or SIMPLIFY existing code instead of adding?**

What existing code did you examine for deletion/simplification?
- `tools/wvo_mcp/scripts/run_design_review.ts` – delete in favour of compiled CLI.
- `package.json` script path – simplify by pointing to compiled output.

**If you must add code, why is deletion/simplification insufficient?**

Need a new `src/cli` module to host the logic; otherwise there’s no compiled artifact. Added code is minimal and replaces brittle loader logic.

---

## Refactor vs Repair Analysis

**Are you patching a symptom or refactoring the root cause?**

- Proper fix: moves reviewer into compiled pipeline rather than patching ts-node errors.
- New file will be <200 LOC; no mega-function risk.
- Eliminates technical debt introduced by dynamic imports.

---

## Alternatives Considered

### Alternative 1: Keep ts-node but fix path resolution
- What: Adjust ts-node to import from `.ts` path or configure loaders.
- Pros: Smaller change.
- Cons: Still depends on ts-node runtime quirks; runtime overhead.
- Why not selected: Does not align with compiled CLI pattern; fragile.

### Alternative 2: Bundle reviewer into session runtime only
- What: Call reviewer via MCP session instead of CLI.
- Pros: No CLI maintenance.
- Cons: Breaks existing script workflow, harder to run locally.
- Why not selected: Deviates from established process.

### Selected Approach
- Refactor CLI into compiled `src/cli/run_design_review.ts`, delete old script, update npm command.
- Aligns with AFP (coherence, visibility) and SCAS guardrails.

---

## Complexity Analysis

- **Complexity increases:** none; moving to compiled code reduces runtime branches.
- **Complexity decreases:** removes loader hacks and error logging boilerplate; runtime path simpler.
- **Trade-offs:** Requires build before run; acceptable because build already part of workflow.

---

## Implementation Plan

**Scope:**
- Files to change: `tools/wvo_mcp/src/cli/run_design_review.ts` (new), `tools/wvo_mcp/scripts/run_design_review.ts` (delete), `tools/wvo_mcp/package.json` (script update), evidence docs.
- PLAN-authored tests: N/A – existing critic behaviour suffices; focus on integration via npm script.
- Autopilot scope: Not touching Wave 0 runtime.
- Estimated LOC: +80 -120 ≈ net -40 LOC.
- Micro-batching compliance: ≤5 files, ≤150 net LOC (met).

**Risk Analysis:**
- Edge cases: Design doc missing, multiple tasks; ensure CLI handles as before.
- Failure modes: Build skip would leave binary absent; mitigate by keeping `npm run build` prerequisite.
- Testing strategy: `npm run build --prefix tools/wvo_mcp`, `npm run gate:review --prefix tools/wvo_mcp`, direct critic invocation.

**Assumptions:**
- `tsconfig` already includes new `src/cli` path.
- No other tooling depends on .ts script path.
- Build artifacts are available before gate execution.

---

## Review Checklist (Self-Check)

- [x] I explored deletion/simplification (via negativa)
- [x] If adding code, I explained why deletion won't work
- [x] If modifying large files/functions, I considered full refactoring
- [x] I documented 2-3 alternative approaches
- [x] Any complexity increases are justified and mitigated
- [x] I estimated scope (files, LOC) and it's within limits
- [x] I thought through edge cases and failure modes
- [x] I authored the verification plan during PLAN
- [x] Not an autopilot Wave 0 change (N/A)

---

## Notes

- Until baseline TypeScript errors are resolved, `gate:review` falls back to running the new CLI through `ts-node` (the CLI prefers `dist/` when available and otherwise loads from `src/`). Once `npm run build` succeeds consistently we can flip the script to invoke the compiled artifact directly.

---

**Design Date:** 2025-11-06
**Author:** Codex (autonomous worker)

---

## GATE Review Tracking

### Review 1: [Pending]
- **DesignReviewer Result:** pending
- **Concerns Raised:** —
- **Remediation Task:** —
- **Time Spent:** —

### Review 2: [N/A]
### Review 3: [N/A]
