# Strategy Analysis — AFP-AUTOPILOT-V2-IMMUNE-REMEDIATION-20251119

**Template Version:** 1.0  
**Date:** 2025-11-19  
**Author:** Codex

---

## Purpose

Remediate upstream blockers undermining Immune System verification: restore missing modules (llm_chat, kpi_writer), unblock wave0 dry-run (game_of_life demo), refresh daily audit, fix doc-check hook, and clear repo hygiene warnings so guardrails/tests can run cleanly.

---

## Hierarchical Context

- ✅ AGENTS.md and MANDATORY_WORK_CHECKLIST reviewed (AFP lifecycle, micro-batching).
- ✅ state/context.md notes ongoing integrity work and prior Immune task.
- ✅ tools/wvo_mcp/ARCHITECTURE_V2.md describes Immune role; wave0 scripts depend on demo assets.
- Evidence from prior task shows guardrail monitor failing due to missing modules and stale audit.

---

## Problem Statement

`npm run test` and guardrail monitor fail from missing modules (`llm_chat.js`, `kpi_writer.js`); wave0 dry-run fails due to missing Game of Life demo and lockfile; doc-check hook missing script; daily audit is stale; repo hygiene warnings persist. These block credible verification of Immune behavior.

Stakeholders: Autopilot operators/reviewers (blocked CI), downstream tasks needing wave0 validation, guardrail monitors, repo maintainers.

---

## Root Cause Analysis

- Removed/missing files (`llm_chat.ts`, `kpi_writer.ts`, demo) break TypeScript build and wave0 imports.
- Pre-commit hook references absent `scripts/check_doc_edits.mjs`.
- Daily audit not run in >24h triggers guardrail failure.
- Repo dirtiness from prior work triggers commit:check warnings.

---

## Current State vs Desired State

Current: Build fails on missing modules; wave0 dry-run crashes; guardrail monitor fails; doc-check hook missing; daily audit stale; repo dirty.  
Desired: Modules restored; wave0 dry-run completes (or blocked only by active lock); guardrail monitor passes; doc-check hook present; daily audit refreshed; repo hygiene documented/clean.  
Gap: Multiple missing artifacts + stale audit + hygiene.

---

## Success Criteria

1. `npm run test -- --filter gatekeeper` (or direct Vitest file) executes without missing-module errors.  
2. Guardrail monitor (`node tools/wvo_mcp/scripts/check_guardrails.mjs`) passes.  
3. `npm run wave0 -- --once --epic=WAVE-0 --dry-run` completes or fails only on active lock (no missing-file errors).  
4. Daily audit refreshed with evidence under `state/evidence/AFP-ARTIFACT-AUDIT-20251119/`.  
5. Doc-check hook present (`scripts/check_doc_edits.mjs`) and no hook errors.  
6. Repo hygiene addressed or documented (commit:check warnings resolved or deferred with owner sign-off).

---

## Impact Assessment

- **Quality/Reliability:** Restores guardrail/CI confidence.  
- **Velocity:** Enables verification for Immune tasks and wave0 flows.  
- **Risk Reduction:** Prevents silent bypass of tests due to missing assets; reduces audit/monitor failures.  
- **Strategic:** Keeps Immune System credible and SCAS-aligned (feedback/observability).
