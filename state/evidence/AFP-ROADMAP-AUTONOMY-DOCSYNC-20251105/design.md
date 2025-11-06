# Design: AFP-ROADMAP-AUTONOMY-DOCSYNC-20251105

> **Purpose:** Document design decisions driving the roadmap + knowledge-base overhaul so AFP/SCAS remains enforceable during implementation.

---

## Context

We must:
- Reframe the roadmap around AFP “waves” that deliver full autonomy proof (Autopilot can program WeatherVane and arbitrary software with 100% reliability).
- Update operational rules so agents execute waves first and maintain knowledge artifacts.
- Harden README automation to provide a trustworthy, auto-evolving local knowledge base without overwhelming git.

Current artifacts (`docs/ROADMAP.md`, `state/roadmap.yaml`, `AGENTS.md`, docsync config) are product-centric or loosely scoped, leading to roadmap drift and README floods.

Goal: Deliver cohesive roadmap + guardrails + tooling updates that keep Autopilot focused on the autonomy prize and ensure documentation stays accurate automatically.

---

## Five Forces Check

### COHERENCE
- ✅ Searched related patterns:
  1. `docs/AFP_QUICK_START.md` – framing AFP stages.
  2. `state/roadmap.yaml` existing autopilot epics.
  3. `docs/README_AUTOMATION.md` workflow guidance.
- Pattern: Re-purpose existing wave-style docs (e.g., `docs/AUTONOMOUS_PM_IMPLEMENTATION_GUIDE.md`) to frame phases.

### ECONOMY
- ✅ Via negativa: remove obsolete product phases, prune docsync scope.
- LOC estimate: docs heavy but net small (approx +200/-150). Analyzer/test update <80 LOC.

### LOCALITY
- Files grouped by concern: docs/roadmap, state/roadmap, agents instructions, docsync code/tests, ignore file, manifest.
- Dependencies manageable: docsync modules within `tools/docsync`, guardrail hook reused.

### VISIBILITY
- Errors visible: analyzer throws if directory cap exceeded; test ensures coverage; docs articulate rules.
- Public API: docsync CLI unchanged, new behaviour documented.

### EVOLUTION
- Using proven docsync pipeline; adding tests for maintainability.
- Roadmap waves create measurable milestones for future evolution.

**Pattern selected:** “Curated knowledge base with manifest guardrails” pattern from docsync (existing).  
**Leverage level:** Medium (tooling + documentation).  
**Assurance:** TypeScript tests (`tools/docsync/index.test.ts`), `npm run readme:check`, manual review of docs.

---

## Via Negativa Analysis

- Considered deleting docsync entirely → rejected (lose knowledge base).
- Prune roadmap instead of layering new sections; majority of product phases removed or compressed.
- `.docsyncignore` prevents generating README for caches instead of adding filtering logic everywhere.
- Pre-commit hook reused; only adjust logic when necessary (maybe no change).

---

## Refactor vs Repair

- This is a **refactor/restructure**: reshape roadmap, instructions, and tooling to align with autonomy root cause.
- No patchy hacks. We’re editing existing docs and code to address structural deficits.
- Technical debt removed: product-centric roadmap, uncontrolled docsync scope.
- New debt: directory cap may need updates when new modules added (documented process).

---

## Alternatives Considered

### Alternative 1: Minimal patch
- Keep existing roadmap, add appendix for autonomy.
- Pros: Low effort.
- Cons: Agents ignore appendix; product phases still dominate.
- Rejected: doesn’t reset priorities or enforce sequencing.

### Alternative 2: Build new roadmap tool
- Create new JSON schema + UI.
- Pros: Structured, explicit gating.
- Cons: Time-consuming; duplicates existing YAML infrastructure.
- Rejected: overkill for immediate need.

### Selected Approach
- Refactor existing docs/YAML to wave framing, adjust tooling & policies.
- Aligns with AFP via negativa (reuse structure), SCAS (clear exit criteria, guardrails).

---

## Complexity Analysis

- **Increased complexity:** Analyzer adds count cap + allowlist logic; manageable (documented, unit tested). Roadmap YAML more structured but still human-editable.
- **Decreased complexity:** Roadmap narrative simplified; docsync scope smaller; commits safer.
- **Trade-offs:** Hard cap may require updates; accept to ensure safety.

---

## Implementation Plan

- Files to change:
  - `docs/ROADMAP.md`
  - `state/roadmap.yaml`
  - `AGENTS.md` (+ maybe `docs/orchestration/roadmap_intake.md`)
  - `.docsyncignore` (new)
  - `tools/docsync/analyzer.ts`
  - `tools/docsync/index.test.ts` (add tests)
  - `docs/README_AUTOMATION.md`
  - `state/analytics/readme_manifest.json`
  - Generated `*/README.md` (curated set)
- Estimated LOC: +350 / -200 (docs) + 120 (code/tests) net +270 (within limit? use doc deletions to stay near boundaries; rely on docsize). If net >150, justify via doc/test weighting + via negativa removal.
- Micro-batching: commit may exceed 5 files due to READMEs → use `ALLOW_DOCSYNC_BULK=1` with README-only enforcement.

**Risk Analysis**
- Edge cases: Already covered in think doc (directory cap, missing modules, merge conflicts).
- Testing: `npm run readme:update -- --mode staged`, `npm run readme:check`, targeted `npm run test -- tools/docsync/index.test.ts` (or `npx vitest run`).
- Need to document how to update thresholds.

**Assumptions**
- Node env ready.
- Agents obey instructions once docs updated.
- `tools/docsync/index.test.ts` runnable; add new tests as part of suite.
- If assumptions break: adjust instructions or create follow-up tasks.

---

## Review Checklist

- [x] Via negativa explored
- [x] Additions justified
- [x] Large files considered (roadmap doc restructure)
- [x] Alternatives documented
- [x] Complexity trade-offs identified
- [x] Scope approximated
- [x] Edge cases + testing addressed

---

## Notes

- Run DesignReviewer once doc updated (post-implementation).  
- Provide mapping from old phase names to wave names in docs for continuity.  
- Evaluate whether `docs/orchestration/roadmap_intake.md` needs updates; if not, mention reason in final summary.  
- Capture README directory count pre/post in verification notes.

---

**Design Date:** 2025-11-05  
**Author:** Codex (Atlas Executor)

---

## GATE Review Tracking

### Review 1: 2025-11-05
- **DesignReviewer Result:** pending (to be run)
- **Concerns Raised:** N/A
- **Remediation Task:** N/A
- **Time Spent:** TBD

Further reviews will be logged after running the tool.
