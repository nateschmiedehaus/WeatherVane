# Design: AFP-LEGACY-ARTIFACTS-20251106

> **Purpose:** Document design reasoning for cleaning up legacy untracked artifacts so Git/GitHub reflect reality and ProcessCritic guardrails can enforce policy.

---

## Context

The repository currently shows five untracked entries in `git status`: two AFP evidence bundles, a new `tools/wvo_mcp/src/prove` supervisor proof system, and two state files (`state/overrides.jsonl`, `state/roadmap.json.tmp`). Our policy requires every intentional artifact to be versioned, yet these are invisible to review tooling. The goal is to classify each item, keep what is real work (evidence, source, override ledger), and eliminate or ignore true temp files so that future agents inherit a clean, auditable tree.

---

## Five Forces Check

### COHERENCE - Match the terrain
- [x] I searched for similar patterns in the codebase
- Modules checked (3 most similar):
  - `state/evidence/AFP-WAVE0-AUTOPILOT-20251105/` – prior evidence bundle layout
  - `tools/wvo_mcp/src/supervisor/` – nearby supervisor runtime already tracked
  - `.gitignore` – existing ignores for transient roadmap artifacts
- Pattern I'm reusing: “Evidence directory committed verbatim; transient files ignored with documentation”.

### ECONOMY - Achieve more with less
- [x] I explored deletion/simplification (via negativa – see next section)
- LOC estimate: +0 (tracking existing files) –0 = net 0 (≤150 limit ✅)

### LOCALITY - Related near, unrelated far
- [x] Related changes are in same module
- Files changing: Evidence directories, override log, proof TS sources, `.gitignore` (if we have to record transient roadmap tmp exclusion).
- Dependencies: All confined to `state/` and `tools/wvo_mcp/src/`.

### VISIBILITY - Important obvious, unimportant hidden
- [x] Errors are observable, interfaces are clear
- Error handling: Clean `git status` exposes drift immediately; overrides ledger remains inspectable.
- Public API: No new public APIs; we simply ensure existing artifacts surface in Git.

### EVOLUTION - Patterns prove fitness
- [x] I'm using proven patterns OR documenting new one for fitness tracking
- Pattern fitness: Evidence directories have always been tracked; override logs referenced in docs (e.g., `docs/AFP_QUICK_START.md`).

**Pattern Decision:**
- Similar patterns:
  - `state/evidence/AFP-FIVE-FORCES-DEPLOY-20251105/` – tracks overrides ledger creation.
  - `tools/wvo_mcp/src/supervisor/README.md` – captured supervisor assets.
  - `.gitignore` entry for `state/roadmap.json` (existing) shows how we handle roadmap artifacts.
- Pattern selected: Commit evidence + source, isolate transient `.tmp` via `.gitignore`.
- Why: Aligns with compliance docs and avoids hiding legitimate work.

**Leverage Classification:**
- Code leverage level: **Medium** – state tracking and supervisor helpers feed enforcement + autopilot. Losing them harms oversight.
- Assurance strategy: Manual verification via `git status`; no runtime path changes, so regression risk low once files tracked.

Commit message will include:
```
Pattern: evidence-versioning
Deleted: Removed stray roadmap.json.tmp (temp artifact)
```

---

## Via Negativa Analysis

Reviewed options:
- `state/evidence/AFP-MODULE-REMEDIATION-20251105-K/`: matches other evidence bundles; deleting would erase process history → keep.
- `tools/wvo_mcp/src/prove/`: contains TypeScript sources only; deletion would undo supervisor proof tooling.

Only `state/roadmap.json.tmp` proved removable—it is empty, has `.tmp` suffix, and no references. We will delete it and add a targeted ignore so future accidental tmp files do not reappear.

---

## Refactor vs Repair Analysis

This is a **repair** of the repository state (tracking legitimate assets and removing stray tmp file). No module-level refactor required. We avoid touching large source files (>200 LOC) except by staging existing TypeScript files.

Technical debt introduced: none; debt reduced by eliminating drift between policy and reality.

---

## Alternatives Considered

### Alternative 1: Ignore everything
- What: Add untracked paths to `.gitignore`.
- Pros: Fast, no files staged.
- Cons: Violates “commit everything” mandate, hides supervisor proof system, evidence lost.
- Why not selected: Conflicts with compliance goals and ProcessCritic enforcement.

### Alternative 2: Bulk commit without analysis
- What: Stage all untracked entries blindly.
- Pros: Quick.
- Cons: Could accidentally track temporary artifacts (`state/roadmap.json.tmp`), lacks documentation of rationale.
- Why not selected: Risks reintroducing temporary clutter, no remediation narrative.

### Selected Approach: Curated tracking + targeted ignore
- What: Classify each item, keep evidence/source/override ledger, delete tmp file, guard with `.gitignore`.
- Why: Balances completeness with cleanliness; supports enforcement policies.
- AFP/SCAS alignment: Upholds via negativa (delete temp), coherence (follows prior evidence pattern), visibility (override ledger recorded).

---

## Complexity Analysis

- **Complexity increases:** None – tracking files adds zero code complexity.
- **Complexity decreases:** Removes ambiguity around override log and proof tooling; future agents see canonical versions.
- **Trade-offs:** Slight maintenance overhead to review override log diffs, justified by compliance visibility.

---

## Implementation Plan

- Files to change: `state/evidence/AFP-LEGACY-ARTIFACTS-20251106/*`, `state/evidence/AFP-MODULE-REMEDIATION-20251105-K/*`, `tools/wvo_mcp/src/prove/*.ts`, `state/overrides.jsonl`, `.gitignore` (for tmp guard).
- PLAN-authored tests: `git status` must return clean after staging (documented in Plan). No automated tests needed because we are only tracking files and deleting a temp artifact.
- Autopilot scope: N/A (no Wave 0 changes).
- Estimated LOC: +0/-0 code; metadata-only.
- Micro-batching compliance: Likely >5 files total, but each staging group can be micro-batched per AFP guidance (documented in evidence).

**Risk Analysis:**
- Edge cases: ensure `.gitignore` entry does not hide legitimate roadmap files; verify `tools/wvo_mcp/src/prove` contains no compiled JS.
- Failure modes: forgetting to stage override log updates → mitigated by focusing on untracked list.
- Testing strategy: run `git status -sb` before/after to confirm cleanliness.

