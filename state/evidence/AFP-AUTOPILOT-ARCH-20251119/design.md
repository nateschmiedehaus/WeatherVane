# Design: AFP-AUTOPILOT-ARCH-20251119

> **Purpose:** Map AFP phases to an automated agent stack with actionable alignment steps while honoring existing guardrails.

---

## Context

We need a concrete architecture doc that translates the AFP 10-phase lifecycle and guardrails (critics, live testing, daily audits) into an autonomous multi-agent pipeline for web development. Current process is heavy on manual evidence and behavioural mandates; orchestration lacks explicit phase-to-agent assignments, sandbox/policy mapping, and automated telemetry. This design outlines the blueprint for that mapping plus a comparison against the current instituted process to surface actionable gaps.

---

## Five Forces Check

### COHERENCE - Match the terrain
- [x] I searched for similar patterns in the codebase  
  Modules checked: `docs/orchestration/unified_autopilot_enhancement_plan.md`, `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`, `docs/orchestration/ORCHESTRATOR_EVOLUTION_SPEC.md`.
- Pattern I'm reusing: orchestration/validation docs pattern with clear objectives, gaps, and phased initiatives.

### ECONOMY - Achieve more with less
- [x] I explored deletion/simplification (via negativa)  
  - Code/doc I can delete: not deleting existing docs; via negativa captured as future automation to remove manual ceremony.  
  - LOC estimate: +~120 (doc) + evidence; non-evidence net within ≤150.

### LOCALITY - Related near, unrelated far
- [x] Related changes are in same module  
  - Files changing: new doc under `docs/orchestration/`, `state/context.md`, evidence folder.  
  - Dependencies localized to orchestration/process docs.

### VISIBILITY - Important obvious, unimportant hidden
- [x] Errors are observable, interfaces are clear  
  - Doc will include telemetry/kill-switch expectations and guardrail alignment so failures are visible.  
  - Public API: mapping tables and action list are explicit.

### EVOLUTION - Patterns prove fitness
- [x] I'm using proven patterns OR documenting new one for fitness tracking  
  - Pattern selected: roadmap/enhancement doc with gap analysis + phased actions (seen in unified_autopilot_enhancement_plan).  
  - Fitness: proven to align stakeholders; will track via guardrail monitor passing and Wave0 live runs once implemented.

**Pattern Decision:**  
Using existing orchestration design doc pattern; no new pattern needed.

**Leverage Classification:**  
My code is: **medium** because it is architecture documentation guiding orchestrator behaviour (not executing production logic directly).  
Assurance strategy: design review, guardrail monitor rerun, integrity tests for transparency.

Commit message will include:
```
Pattern: orchestration-architecture-doc
Deleted: none
```

---

## Via Negativa Analysis

Existing manual ceremony could be deleted once automation exists (e.g., manual evidence boilerplate, manual guardrail runs). Since this task delivers guidance, not code, no direct deletion now. The doc will call out which ceremonies to remove and replace with automated hooks (daily audit automation, auto-preview deploys, policy enforcement pipelines).

---

## Refactor vs Repair Analysis

- This is a **proper fix** to clarify architecture (not a patch). It addresses root cause of unclear mapping rather than adding reminders.  
- No large code files modified; main change is new doc.  
- Technical debt: minimal; risk is doc staleness mitigated by tying steps to existing scripts and guardrails.

---

## Alternatives Considered

### Alternative 1: Keep process-only guidance
- What: Reiterate AGENTS.md requirements without architecture mapping.
- Pros: Low effort; no new material.
- Cons: Does not bridge to automation; fails user request; keeps manual burden high.
- Why not selected: Does not solve root cause.

### Alternative 2: Full implementation spike in Wave0 code
- What: Directly modify orchestrator to embed AFP mapping and automation.
- Pros: Immediate automation progress.
- Cons: High risk, exceeds file/LOC scope, conflicts with existing WIP, bypasses design gate expectations.
- Why not selected: Out of scope; would violate constraints.

### Selected Approach: Targeted architecture + alignment doc
- What: Author a focused doc mapping AFP phases to agents/tools/sandboxes with gap analysis and phased actions; align with current guardrails and constraints.
- Why: Meets request while staying within scope; prepares for future implementation.
- AFP/SCAS alignment: Via negativa (reduce manual steps), coherence (reuse existing guardrails), evolution (phased rollout), visibility (telemetry), economy (minimal files).

---

## Complexity Analysis

- **Complexity increases:** Slight increase from new doc; justified to reduce behavioural ambiguity. Mitigation: keep concise, structured tables.
- **Complexity decreases:** Provides clear mapping that lowers cognitive load and reduces repeated explanations.
- **Trade-offs:** Small doc maintenance overhead vs. improved clarity and compliance; acceptable.

---

## Implementation Plan

- **Scope:**  
  - Files: `docs/orchestration/autopilot_afp_alignment.md` (new doc), `state/context.md` (short update), evidence files for AFP phases (strategy/spec/plan/think/design/implement/verify/review/monitor).  
  - PLAN-authored tests: Documented verification commands—`bash tools/wvo_mcp/scripts/run_integrity_tests.sh`; `node tools/wvo_mcp/scripts/check_guardrails.mjs` (post-audit); manual doc review. No new automated tests needed for docs-only work.  
  - Autopilot scope: No Wave0 code changes; note live loop commands (`npm run wave0`, `ps aux | grep wave0`) as future requirement if automation implemented.  
  - Estimated LOC: +~120 doc; non-evidence files ≤5 and ≤150 net LOC.  
  - Micro-batching: Compliant (1 new doc, 1 context update, evidence).

- **Risk Analysis:**  
  - Edge cases: guardrail monitor still failing → rerun after audit; integrity tests failing due to existing WIP → capture output.  
  - Failure modes: doc too generic → ensure concrete actions and owners.  
  - Testing: run integrity + guardrail scripts; capture outputs in verify.md.

- **Assumptions:**  
  - Critics and scripts run locally; Wave0 live testing not required for docs-only change.  
  - `docs/orchestration/` is accepted location for architecture alignment content.  
  - File/LOC constraints apply; evidence files excluded from limit.

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

**Design Date:** 2025-11-19  
**Author:** Codex

---

## GATE Review Tracking

### Review 1: 2025-11-19
- Reviewer/Tool: DesignReviewer
- Result: Pending (to run after drafting)
