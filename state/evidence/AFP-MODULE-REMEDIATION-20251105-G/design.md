# Design: AFP-MODULE-REMEDIATION-20251105-G

> **Purpose:** Document your design thinking BEFORE implementing.
> This prevents compliance theater and ensures AFP/SCAS principles guide your work.

---

## Context

**What problem are you solving and WHY?**

- Autopilot’s TypeScript build currently fails (TS2307) because `executor/command_runner` no longer exists, halting critic execution, session shell helpers, and ML meta-critic fallbacks.
- Without a guardrailed command runner the orchestrator cannot safely execute shell steps, blocking roadmap work and violating AFP guardrails.
- Missing-module tracking is manual; regressions slip through until `tsc` is run by hand. We need an enforced, Autopilot-only inventory to keep remediation tasks flowing without WeatherVane noise.

---

## Five Forces Check

**Before proceeding, verify you've considered all five forces:**

### COHERENCE - Match the terrain
- [x] I searched for similar patterns in the codebase
- Modules checked (3 most similar): `tools/wvo_mcp/src/executor/file_ops.ts`, `tools/wvo_mcp/src/executor/guardrails.ts`, `graveyard/20251104-reachability/tools/wvo_mcp/src/executor/command_runner.ts`
- Pattern I'm reusing: Executor helpers that wrap core Node APIs with guardrails + tracing.

### ECONOMY - Achieve more with less
- [x] I explored deletion/simplification (via negativa - see next section)
- Code I can delete: no unused executor call sites surfaced; goal is to restore missing primitive with guardrails. Net additions limited to ≤120 LOC (command runner + script tweaks).
- LOC estimate: +120 -10 ≈ net +110 LOC (≤150 limit).

### LOCALITY - Related near, unrelated far
- [x] Related changes are in same module
- Files changing: executor command runner (new), imports in critics/session, existing inventory script (`tools/wvo_mcp/scripts/generate_module_index.ts`), followups tracker.
- Dependencies: confined to executor + telemetry + scripts already co-located under `tools/wvo_mcp`.

### VISIBILITY - Important obvious, unimportant hidden
- [x] Errors are observable, interfaces are clear
- Error handling: guardrail violations throw `GuardrailViolation`; command failures return `CommandResult` with stdout/stderr; tracing span captures metadata.
- Public API: single `runCommand` export returning `CommandResult`; inventory script outputs JSON/MD artifacts.

### EVOLUTION - Patterns prove fitness
- [x] I'm using proven patterns OR documenting new one for fitness tracking
- Pattern fitness: prior command runner (graveyard) and current executor helpers demonstrate viability; new inventory output will live under `state/analytics` so drift is measurable.
- If new pattern: hierarchical inventory is an extension—success measured by absence of missing-module regressions and smaller remediation backlog.

**Pattern Decision:**

**Similar patterns found:** [from COHERENCE search above]
- Pattern 1: `tools/wvo_mcp/src/executor/file_ops.ts` — guardrailed FS wrapper leveraging tracing + dry-run enforcement.
- Pattern 2: `tools/wvo_mcp/src/executor/guardrails.ts` — allow-listing + workspace safety for shell commands.
- Pattern 3: `graveyard/20251104-reachability/tools/wvo_mcp/src/executor/command_runner.ts` — legacy `runCommand` shape using `execa` + tracing.

**Pattern selected:** Guardrailed executor wrapper with tracing (blend of file_ops + legacy command runner).
**Why this pattern:** Matches existing executor abstractions, keeps guardrail enforcement centralized, minimizes new concepts.

**OR**

**New pattern needed:** N/A.
**Why existing patterns don't fit:** N/A.
**How this pattern differs:** N/A.

**Leverage Classification:**

**Code leverage level:** high

- **Critical:** Auth, payments, core abstractions → formal verification or 100% test coverage
- **High:** Public APIs, frequently changed → comprehensive testing
- **Medium:** Business logic, orchestrators → happy path + error cases
- **Low:** Utils, rarely changed → smoke tests

**My code is:** high **because** command execution is foundational to Autopilot task orchestration and misbehaviour is high impact.
**Assurance strategy:** unit coverage via existing critic tests (mocked command runner), manual `tsc` verification, and regenerated inventory artifacts to prove zero missing modules.

**Commit message will include:**
```
Pattern: executor.run_command_guardrailed
Deleted: n/a (net additions ≤150 LOC)
```

**See:** [docs/AFP_QUICK_START.md](../AFP_QUICK_START.md) for five forces details and examples.

---

## Via Negativa Analysis

**Can you DELETE or SIMPLIFY existing code instead of adding?**

What existing code did you examine for deletion/simplification?
- `tools/wvo_mcp/src/session.ts#runShellCommand` — cannot delete; orchestrator still needs to execute shell commands.
- `tools/wvo_mcp/src/critics/base.ts#run` — critics rely on shell execution path for their work.

**If you must add code, why is deletion/simplification insufficient?**

- Without restoring `runCommand` the orchestrator loses execution capability entirely; there is nothing to simplify because the primitive is missing.
- Inventory automation addition is necessary to expose regressions proactively; no existing script covers missing modules hierarchically or focuses on Autopilot scope.

---

## Refactor vs Repair Analysis

**Are you patching a symptom or refactoring the root cause?**

- Is this a PATCH/WORKAROUND or a PROPER FIX? Proper fix—restores the missing primitive with guardrail compliance rather than stubbing.
- If modifying file >200 LOC or function >50 LOC: Files touched remain <200 LOC after change; inventory script change is additive but keeps structure cohesive.
- What technical debt does this create (if any)? Slight coupling of missing-module inventory to the module index script; documented and acceptable until inventory warrants extraction.

---

## Alternatives Considered

**List 2-3 approaches you evaluated:**

### Alternative 1: Decommission shell execution
- What: Remove shell execution support, delete call sites, rely on manual interventions.
- Pros: Fewer moving parts.
- Cons: Autopilot loses ability to run build/lint/tests; critics fail; violates roadmap goals.
- Why not selected: Does not meet requirements, breaks Autopilot workflows.

### Alternative 2: Inline `execa` calls in consumers
- What: Invoke `execa` directly inside critics/session without shared helper.
- Pros: One less executor file to maintain.
- Cons: Duplicated guardrail logic, higher risk of inconsistencies, harder to test.
- Why not selected: Violates coherence/locality; increases maintenance burden.

### Selected Approach
- What: Restore guardrailed `runCommand`, update imports/tests, enhance module index script to emit hierarchical missing-module inventory, and update followups to enforce Autopilot focus.
- Why: Centralized execution primitive honours guardrails and keeps critics/session functioning; inventory automation provides proactive visibility with minimal footprint.
- How it aligns with AFP/SCAS: Reuses proven executor patterns (coherence), keeps additions minimal (economy), confines changes to executor + tooling (locality), surfaces guardrail and inventory data (visibility), and creates measurable telemetry for future evolution (evolution).

---

## Complexity Analysis

**How does this change affect complexity?**

- **Complexity increases:** Moderate increase within `generate_module_index.ts` to emit inventory artefacts.
  - Is this increase JUSTIFIED? Yes; avoids new script while ensuring inventory runs alongside module catalog, keeping guardrail-limited file count.
  - How will you MITIGATE this complexity? Encapsulate inventory logic in helper functions, document intent, and keep output deterministic.

- **Complexity decreases:** Restoring centralized command execution removes ad-hoc command handling and resolves missing-module noise.
  - What are you simplifying/removing? Eliminates TypeScript errors and implicit assumptions that shell execution is unavailable.

- **Trade-offs:** Accept tighter coupling between module catalog and inventory generation in exchange for automated visibility without exceeding file or LOC budgets.

**Remember:** Not all complexity is bad. But it must be WORTH IT.

---

## Implementation Plan

**Scope:**
- Files to change: `tools/wvo_mcp/src/executor/command_runner.ts` (new), `tools/wvo_mcp/src/critics/base.ts`, `tools/wvo_mcp/src/critics/base.test.ts`, `tools/wvo_mcp/src/critics/ml_task_meta_critic.ts`, `tools/wvo_mcp/src/session.ts`, `tools/wvo_mcp/scripts/generate_module_index.ts`, `state/evidence/AFP-MODULE-REMEDIATION-20251105/followups.md`.
- Estimated LOC: +120 -10 ≈ net +110 LOC.
- Micro-batching compliance: Source code touches remain ≤5 files; evidence/update file kept separate; total LOC within ≤150 target.

**Risk Analysis:**
- Edge cases: Guardrail false positives, dry-run scenarios, `tsc` diagnostic format changes.
- Failure modes: `execa` rejection not wrapped, inventory write failing mid-run, script mis-grouping modules.
- Testing strategy: `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json`, rerun module inventory generator, rely on critic unit tests that mock runCommand for behavioural coverage.

**Assumptions:**
- `execa` remains available and compatible.
- Writing under `state/analytics` is acceptable for automation outputs.
- Integrating inventory with module generation aligns with governance workflows.

---

## Review Checklist (Self-Check)

Before implementing, verify:

- [x] I explored deletion/simplification (via negativa)
- [x] If adding code, I explained why deletion won't work
- [x] If modifying large files/functions, I considered full refactoring
- [x] I documented 2-3 alternative approaches
- [x] Any complexity increases are justified and mitigated
- [x] I estimated scope (files, LOC) and it's within limits
- [x] I thought through edge cases and failure modes
- [x] I have a testing strategy

**If ANY box unchecked:** Revisit your design. You're not ready to implement.

---

## Notes

- Autopilot-only scope; WeatherVane roadmap items remain untouched. Inventory output filters to `tools/wvo_mcp` to keep focus tight.

---

**Design Date:** 2025-11-29
**Author:** Codex (autonomous worker)

---

## GATE Review Tracking

**GATE is ITERATIVE - expect multiple rounds:**

### Review 1: [Date]
- **DesignReviewer Result:** [pending/needs-revision/approved]
- **Concerns Raised:** [list any concerns]
- **Remediation Task:** [TASK-ID-REMEDIATION-XXX if created]
- **Time Spent:** [hours on remediation work]

### Review 2: [Date] (if needed)
- **DesignReviewer Result:** [pending/needs-revision/approved]
- **Concerns Raised:** [list any concerns]
- **Remediation Task:** [TASK-ID-REMEDIATION-XXX if created]
- **Time Spent:** [hours on remediation work]

### Review 3: [Date] (if needed)
- **DesignReviewer Result:** [pending/needs-revision/approved]
- **Final Approval:** [yes/no]
- **Total GATE Effort:** [X hours across all reviews + remediation]

**IMPORTANT:** If DesignReviewer finds issues, you MUST:
1. Create remediation task (new STRATEGIZE→MONITOR cycle)
2. Do actual research/exploration (30-60 min per critical issue)
3. **Update UPSTREAM phase artifacts** (strategy, spec, plan docs)
   - Via negativa concern → revise PLAN to show deletion analysis
   - Refactor concern → revise STRATEGY to target root cause
   - Alternatives concern → revise SPEC with new requirements
4. Update design.md with revised approach (reflects upstream changes)
5. Re-submit for review

**Superficial edits to pass GATE = compliance theater = rejected.**

**Remember:** design.md is a SUMMARY of phases 1-4. If DesignReviewer finds
fundamental issues, you may need to GO BACK and revise your strategy, spec, or
plan. This is EXPENSIVE but NECESSARY to ensure quality. GATE enforces that
implementation is based on SOLID thinking, not rushed assumptions.
