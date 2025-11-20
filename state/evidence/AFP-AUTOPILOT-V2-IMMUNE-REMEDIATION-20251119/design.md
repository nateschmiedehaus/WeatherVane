# Design: AFP-AUTOPILOT-V2-IMMUNE-REMEDIATION-20251119

> Purpose: Document design thinking before implementation so AFP/SCAS principles guide the remediation.

---

## Context
Guardrail/tests were blocked by missing modules (`llm_chat`, `kpi_writer`), missing wave0 demo file, absent doc-check hook, and stale daily audit. Goal: restore required artifacts, rerun guardrail/tests/wave0 dry-run, and capture repo hygiene status.

---

## Five Forces Check
### COHERENCE
- Checked: enforce_commits script, prior llm_chat pattern, guardrail monitor expectations.
- Reuse pattern: minimal stub/bridge restoring required imports.
### ECONOMY
- Via negativa considered; deletion not viable because imports required. LOC ~120 net, ≤150.
### LOCALITY
- Changes limited to missing modules/demo/hook + evidence; no cross-module coupling.
### VISIBILITY
- Errors surfaced via guardrail monitor, wave0 lock messages, and explicit execa error propagation.
### EVOLUTION
- Stubs documented as temporary; configuration remains adaptable.

Pattern: `immune_remediation_stubs` (small restorations). Leverage: Medium. Assurance: targeted Vitest, guardrail monitor, wave0 dry-run.

Commit message metadata:
```
Pattern: immune_remediation_stubs
Deleted: n/a
```

---

## Via Negativa Analysis
- Cannot delete imports; restoring minimal stubs is the simplest path. No extraneous additions beyond required files.

---

## Refactor vs Repair Analysis
- This is a proper fix (restore missing artifacts) not a patch; files small (<200 LOC); debt: demo stub should be replaced with full implementation later.

---

## Alternatives Considered
1) Remove wave0 demo references → would break wave0 E2E; rejected.
2) Mock kpi_writer import in build config → hides real dependency; rejected.
Selected: restore minimal implementations to satisfy build/guardrail and document stub status.

---

## Complexity Analysis
- Low complexity; small stubs. Risk of future drift mitigated by documenting stub and leaving lock untouched.

---

## Implementation Plan
- Scope: `tools/wvo_mcp/src/tools/llm_chat.ts`; `tools/wvo_mcp/src/telemetry/kpi_writer.ts`; `tools/state/demos/gol/game_of_life.js`; `scripts/check_doc_edits.mjs`; audit evidence; task evidence.
- PLAN tests: `npx vitest run src/immune/gatekeeper.test.ts`; `node scripts/check_guardrails.mjs`; `npm run wave0 -- --once --epic=WAVE-0 --dry-run`; `npm run commit:check`.
- Autopilot scope: wave0 dry-run (respect lock).
- LOC: ~120 net; ≤5 functional files (evidence excluded).
- Risks: wave0 lock persists; other missing modules outside scope; repo dirty from others; vitest flag incompatibility.
- Assumptions: no new deps; guardrail monitor authoritative; lock not removed.

---

## Review Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope/LOC within limits
- [x] Tests authored in PLAN
- [x] Wave0 dry-run defined

---

**Design Date:** 2025-11-19  
**Author:** Codex

## GATE Review Tracking
- Run: `npm run gate:review AFP-AUTOPILOT-V2-IMMUNE-REMEDIATION-20251119`
