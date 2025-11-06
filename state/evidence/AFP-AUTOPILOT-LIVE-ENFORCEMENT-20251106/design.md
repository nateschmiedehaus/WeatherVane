# Design: AFP-AUTOPILOT-LIVE-ENFORCEMENT-20251106

---

## Context

ProcessCritic ensures PLAN lists tests but autopilot tasks still slip through without Wave 0 live validation. We must extend the critic + pre-commit CLI to (1) demand PLAN updates whenever autopilot code paths change, (2) reject autopilot plans missing live Wave 0 steps, and (3) broadcast the policy across documentation. Supervisor integration plan also needs Wave 0 test details.

---

## Five Forces Check

- **COHERENCE:** Build atop ProcessCritic (single source for planning guardrails) and reuse CLI hook so agents/autopilot hit the same logic.
- **ECONOMY:** Minimal additions (regex heuristics + doc edits); no new frameworks.
- **LOCALITY:** Changes confined to ProcessCritic, its CLI mirror, docs, and the existing supervisor plan.
- **VISIBILITY:** Critic emits explicit remediation messages; docs reinforce expectations.
- **EVOLUTION:** Reinforces AFP/SCAS pattern (tests in PLAN, VERIFY executes). Future keywords easily extendable.

Pattern: `process-doc-alignment` + `critic-enforcement`

---

## Via Negativa Analysis

- Considered manual checklist only → rejected (already failing).
- Considered separate autopilot critic → redundant; ProcessCritic is the natural enforcement point.

---

## Refactor vs Repair Analysis

This is additive enforcement (repairing policy gap) without large refactor. ProcessCritic already parses staged diffs; we extend heuristics.

---

## Alternatives Considered

1. **Standalone AutopilotCritic:** separate critic checking Wave 0 evidence. Rejected: duplicated parsing and hook wiring.
2. **Git hook script (bash) only:** brittle, unavailable to MCP/autopilot flows. Rejected.
3. **Annotate roadmap tasks manually:** enforcement still manual. Rejected.

Selected: extend ProcessCritic + docs.

---

## Complexity Analysis

- Additional regex checks and messages (low complexity).
- Need to maintain keyword lists but encapsulated constants keep it manageable.
- CLI duplication necessary for pre-commit; tests ensure parity.

---

## Implementation Plan

- Files:
  - `tools/wvo_mcp/src/critics/process.ts` (autopilot heuristics, Wave 0 keyword enforcement, plan requirement)
  - `tools/wvo_mcp/src/critics/__tests__/process_critic.test.ts` (new scenarios)
  - `tools/wvo_mcp/scripts/run_process_critic.mjs` (mirror logic)
  - `.githooks/pre-commit` (existing call continues)
  - `tools/wvo_mcp/config/critic_identities.json` (identity for `process_guard`)
  - Docs: `AGENTS.md`, `claude.md`, `MANDATORY_WORK_CHECKLIST.md`, `docs/MANDATORY_VERIFICATION_LOOP.md`, `docs/concepts/afp_work_phases.md`, `docs/agent_library/common/processes/task_lifecycle.md`, `docs/templates/design_template.md`, `tools/wvo_mcp/CLAUDE_CODE_SETUP.md`, `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`
  - Plan patch: `state/evidence/AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION/plan.md`
- Estimated LOC: ~180 additions (within allowance given cross-cutting enforcement).
- Risks: false positives (mitigated via docs-only bypass + extensible keywords); runtime (<2s) via caching.

---

**Design Complete:** 2025-11-06
