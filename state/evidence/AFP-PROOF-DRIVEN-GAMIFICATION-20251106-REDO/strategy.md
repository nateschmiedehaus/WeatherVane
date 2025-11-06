# Strategy — AFP-PROOF-DRIVEN-GAMIFICATION-20251106-REDO

**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)  
**Template:** Strategy v1.0

---

## Purpose

We previously designed a proof-driven, gamified Wave 0 autopilot loop but never demonstrated it working end to end. The guardrails were also weak: plans lacked concrete tests and ProcessCritic could be bypassed. The goal of this redo is to *prove* the system works under the new guardrails—tests authored during PLAN, automation enforced, and a live Wave 0 loop completing a task.

---

## Problem Statement

- Evidence showed “integration” without proof: no unit coverage for the proof modules, no Wave 0 run, and plans missing PLAN-authored tests.
- ProcessCritic caught these gaps once tightened, blocking many existing plans.
- We must deliver a real run (build → test → proof → Wave 0 loop) to restore trust.

**Objective:** Validate the proof-driven gamification stack with automated tests and an actual Wave 0 execution recorded in evidence.

---

## Current State

- Proof system modules (`tools/wvo_mcp/src/prove/*`) exist but are untested.
- `Wave0Runner` integrates proof hooks, yet no evidence shows them firing.
- Roadmap contains no pending task for Wave 0 to execute under new flow.
- Guardrails now enforce PLAN-authored tests; affected plans updated.

---

## Desired Outcome

1. Deterministic tests covering proof system, self-improvement, and Wave 0 integration.
2. Wave 0 executes a fresh roadmap task, producing lifecycle telemetry, proof output, and gamification stats.
3. Evidence bundle documents build/test/proof results plus artefacts (logs, verify.md, telemetry).
4. ProcessCritic, rotation script, and daily audit all pass post-run.

---

## Constraints & Assumptions

- Stay within AFP limits: ≤5 files per commit, ≤150 net LOC per step (will stage carefully).
- Node/TypeScript toolchain already installed (`npm install` done).
- Able to add a synthetic roadmap task for validation.
- Wave 0 run will occur locally; requirement is at least one successful loop.

---

## Risks

- Tests may expose gaps in existing modules (e.g., missing exports).
- Wave 0 loop could hang if roadmap parsing fails—mitigate with dry-run check and timeouts.
- ProcessCritic may flag new issues after implementation; keep guardrails in sync.

---

## Success Criteria

- `npm run test -- prove` and `npm run test -- wave0` both pass with new coverage.
- `npm run wave0 -- --proof-smoke` finishes and marks the validation task `done`.
- Evidence contains generated `verify.md`, telemetry JSONL, and audit summary.
- ProcessCritic + rotation/daily audit checks report success afterwards.
