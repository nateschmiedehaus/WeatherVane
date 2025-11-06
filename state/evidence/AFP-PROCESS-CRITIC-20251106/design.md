# Design: AFP-PROCESS-CRITIC-20251106

---

## Context

To enforce the new test sequencing policy programmatically, we need a ProcessCritic that analyzes phase artefacts and staged diffs, flagging cases where PLAN lacks tests or VERIFY (post-implementation) introduces new tests without PLAN updates.

---

## Five Forces Check

- **COHERENCE:** Leverage existing critic framework in `tools/wvo_mcp/src/critics/` and integrate with pre-commit pipeline.
- **ECONOMY:** Implement logic via a single critic with minimal hook changes (<150 net LOC, ≤5 files).
- **LOCALITY:** Confine changes to critic code, registration, tests, and supporting docs.
- **VISIBILITY:** Critic outputs clear guidance (e.g., "PLAN missing tests section.") so agents understand remediation.
- **EVOLUTION:** Builds on existing reviewer pattern, extending enforcement capabilities.

Pattern: `critic-enforcement`

---

## Via Negativa Analysis

No existing critic enforces test sequencing; cannot delete/repurpose another without losing functionality. Addition justified.

---

## Refactor vs Repair

Refactor by adding a critic to address root cause (lack of enforcement) rather than patching hooks ad hoc.

---

## Alternatives Considered

1. **Git hook-only shell script**. Rejected: duplication of logic, hard to reuse in MCP/autopilot.
2. **Extend DesignReviewer** to check PLAN tests. Rejected: design reviewer focuses on AFP thinking; mixing phases would bloat design.md checks.

Selected approach: new ProcessCritic integrated into critic pipeline.

---

## Complexity Analysis

Moderate: new critic plus tests, minor hook adjustments. Acceptable trade-off for automatic enforcement.

---

## Implementation Plan

- Files:
  - `tools/wvo_mcp/src/critics/process.ts` (new critic)
  - `tools/wvo_mcp/src/critics/__tests__/process_critic.test.ts`
  - `tools/wvo_mcp/src/session.ts` (register `process_guard`)
  - `tools/wvo_mcp/scripts/run_process_critic.mjs` (CLI runner)
  - `.githooks/pre-commit` (invoke CLI)
  - Docs: update `AGENTS.md`, `tools/wvo_mcp/CLAUDE_CODE_SETUP.md` to notify agents
- Estimated LOC: ~140 additions.
- Risks: false positives (docs-only), git command failures, runtime overhead. Mitigate via keyword checks, graceful fallbacks, caching.

---

**Design Complete:** 2025-11-06
