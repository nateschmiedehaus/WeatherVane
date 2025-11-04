# Unified Autopilot — Architecture, Gaps, and Recovery Plan

This guide crystallizes the unified spec we owe Codex/Claude (and future agents): what exists today, what is still broken, and how we will reach the “Perfect Unified Autopilot” described in the Opus vision plus the RECOVERY_PLAYBOOK. Treat it as the single reference when scoping slices, writing prompts, or validating work.

## 1. Current Architecture Snapshot

| Layer | What Exists Today | Gaps & Risks |
| --- | --- | --- |
| **State Graph** | `StateGraph` coordinates Planner → Thinker → Implementer → Verifier → Reviewer → Critical → Supervisor. ContextAssembler emits LCPs per state and journals URIs. | Retry ceilings and plan-delta enforcement are only partially wired; Verify → Resolution loop is still a stub, and spike/incident flows are not implemented. |
| **Context & Memory** | `tools/wvo_mcp/src/context/*` builds laddered LCPs with budgets; `RunEphemeralMemory`, `ProjectIndex`, and `DecisionJournal` capture run state. | No deterministic invalidation; KB pointers lack freshness hashes per anchor; mutation-smoke and coverage metadata are not fed back into LCP budgets. |
| **Model Router & Policies** | `model_policy.yaml`, `model_router.ts`, and router guard tests enforce the locked provider set (Codex 5 + Claude 4.x). ProviderManager now normalizes aliases (`claude_code` → `claude`). | Discovery catalog still allows stale providers when SDK returns unexpected names; escalation heuristics are inline instead of centralized; router decisions are not written to telemetry spans. |
| **Quality Gates** | `QualityGateOrchestrator` exists, Verify calls real commands, and integration tests ensure `unified_orchestrator.ts` references the orchestrator. | Resolution engine does not yet classify blockers into taxonomy labels; Quality Gate evidence is not persisted to the ledger; Monitor does not force plan deltas on smoke failures. |
| **Atlas / Context System Docs** | Atlas manifest/cards/briefing pack describe state-graph, context fabric, router, and policies. | Manifest drifts whenever prompts/docs change; reviewers lack a single plan doc summarizing phase work (this file fills that gap). |

## 2. Gap Inventory (Objective View)

1. **Harness & Offline Readiness** (Stage 0) – DONE for Vitest + bootstrap-offline, but `make test` still depends on PyPI connectivity unless `.wheels/` is populated. Need CI hook to verify wheel cache freshness.
2. **Model Lockdown & Router Policy (Phase 1)** – Router guard tests only scan a handful of files. `router_policy.ts` is still inline logic; we must move capability→model mappings and escalation ceilings into a shared config consumed by Planner/Supervisor/Implementer.
3. **Resolution Taxonomy & Integrity Guards (Phase 2)** – `verify_integrity.ts` exists but mutation-smoke + placeholder detectors are not enforced before Verify exits. Resolution engine lacks plan-delta journaling, block labels, or spike triggers.
4. **State Graph Modularization & Incident Flow (Phase 3)** – Monolithic `state_graph.ts` mixes runner logic. No MRFC scaffolding exists under `repro/<task>/`. Spike branches are not tracked in journal.md.
5. **Reviewer/Critical Agents & Rubric (Phase 4)** – Reviewer emits JSON today, but the rubric is not validated and Critical agent does not escalate secrets/prompt-injection findings to `policy.require_human`.
6. **CI + Scripts + Integration Tests (Phase 5)** – `scripts/app_smoke_e2e.sh` exists but Monitor state never invokes it; `run_integrity_tests.sh` still fails when pytest isn’t installed. Need GH workflows for atlas regeneration, model catalog refresh, and nightly runs.
7. **Telemetry & Observability (Phase 6)** – OTEL spans don’t include router decisions, resolution labels, or spike metadata. Ledger JSON lacks links to new artifacts (LCP URIs, Atlas manifest hash, etc.).
8. **Acceptance & Docs (Phase 7)** – Need refreshed MODEL_ROUTING_POLICY, CONTEXT_SYSTEM, reviewer rubric prompt, and evidence-chain examples that mirror the now-locked plan.

## 3. Recovery Plan (Phases)

The table merges Opus’ “Perfect Unified Autopilot” blueprint with our RECOVERY_PLAYBOOK slices. Every item must run through **STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR** (legacy “Specify” language maps to SPEC), with artifacts recorded under `resources://runs/<id>/`.

| Phase | Target Outcomes | Key Tasks |
| --- | --- | --- |
| **Phase 0 – Foundations & Legacy Pruning** | Zero traces of the legacy autopilot flow; contributors see one prompt, one evidence checklist. | ✅ PR template banner, ✅ master prompt call-out, ✅ delete/archive remaining legacy scripts/docs, ❏ ensure plan_next/autopilot_status surfaces Unified-only instructions. |
| **Phase 1 – Model Lockdown & Router Policy** | Router consumes a single `router_policy.ts`; discovery catalog emits allow-listed JSON per run. | ✅ `router_policy.ts` module + alias handling, ✅ planner/implementer memory hooks, ✅ discovery pipeline now enforces the allow-list via CLI/SDK artifacts with journaling, ✅ router guard tests expanded across planner/thinker/implementer/reviewer/critical/supervisor/state graph surfaces. |
| **Phase 2 – Resolution Taxonomy & Integrity Guards** | Verify feeds a resolution engine that labels blockers (missing_dependency, flaky_test, etc.) and enforces plan-delta evidence. | ✅ `blocker_taxonomy.ts` + `resolution_engine.ts` classify failures + journal plan deltas, ✅ `verify_integrity.ts` enforces changed-line coverage/skips/placeholders with mutation smoke flag, ✅ Implementer returns changed file metadata + failing-proof hints and Resolution now writes JSON artifacts for Supervisor/Monitor evidence chains. |
| **Phase 3 – State Graph Modularization & Incident Flow** | Each state runner is testable; retries respect ceilings; incidents produce MRFC patches and call `policy.require_human`. | ❏ Split `state_graph.ts` into runner helpers, ❏ enforce plan-delta before reattempts, ❏ implement spike branch tracking + journaling, ❏ add `incident_reporter.ts` that writes `repro/<task>/README.md` + instrumentation logs. |
| **Phase 4 – Agents, Reviewer Rubric, Critical Pass** | Reviewer JSON adheres to rubric; Critical agent escalates secrets/prompt-injection; Supervisor manages plan hashes + coverage targets. | ❏ Update `tools/wvo_mcp/prompts/reviewer_rubric.md` to include resolution-proof checks, ❏ wire Critical agent to `policy.require_human`, ❏ ensure Planner/Implementer log coverage goals & changed-files data into run memory. |
| **Phase 5 – CI, Scripts, Integration Tests** | Integrity tests run in CI; Monitor executes smoke script; GH workflows enforce atlas + catalog drift. | ✅ Monitor now shells out to `scripts/app_smoke_e2e.sh` (vitest stubs for web + monitor runner), ✅ `run_integrity_tests.sh` auto-populates `.wheels/` + honors offline flags (current blocker: missing `/opt/homebrew/bin/python3.10`), ❏ add `.github/workflows/atlas.yml` + `refresh-model-catalog.yml` gating diffs. |
| **Phase 6 – Telemetry & Observability** | Ledger/OTEL spans capture router decisions, resolution labels, spike branches, mutation smoke status. | ❏ Extend telemetry writers, ❏ ensure decision journal records plan hashes, rubric JSON, incident metadata, and `resources://` artifact links. |
| **Phase 7 – Acceptance & Rollout** | Quality gate integration tests cover verify failure→resolution loops + incident path; docs describe router policy, context budgets, evidence chain. | ❏ Add end-to-end integration tests (Verify failure -> resolution -> success, incident path), ❏ document sample evidence chain in `docs/autopilot/`, ❏ prep rollout PR with canary + CI proof. |

## 4. Execution Protocol (Agents & Tools)

1. **STRATEGIZE** – Identify the problem, select an approach, and connect the work to WeatherVane’s purpose **and the specific Autopilot functionality (agent behavior, user workflow, or quality gate) the change serves or protects**. Persist the decision in `resources://runs/<id>/journal.md` and ensure the phase ledger records the entry.
2. **SPEC** – Restate acceptance criteria, success metrics, and definition of done quoting this doc + RECOVERY_PLAYBOOK. Include the Autopilot scenarios or workflows that must continue to function after the change. Store the artifact (e.g., `docs/autopilot/spec.md`) and link it in the ledger entry.
3. **PLAN** – Break work into ≤3 verifiable steps per slice; map each step to concrete Autopilot components (state runners, tools, prompts, dashboards) and identify the functional checks required. Record the plan hash, dependencies, and impacted files in the journal + ledger.
4. **THINK (optional)** – Mandatory for ambiguous or high-risk slices. Document open questions, assumptions, spike proposals in the Task Thread (journal “### Team Panel”), and explicitly analyze functional risks (e.g., “Will planner dispatch still operate?”). Capture the decision and mitigation strategy in the ledger.
5. **IMPLEMENT** – Emit minimal diffs with tests/docs. For autopilot code, run `node tools/oss_autopilot/scripts/run_vitest.mjs --scope=autopilot`; ensure unit tests target changed symbols.
6. **VERIFY** – Execute all mandated gates (`tests.run`, `lint.run`, `typecheck.run`, `security.scan`, `license.check`, Playwright UI tests where applicable, `scripts/app_smoke_e2e.sh`). Attach signed outputs to `resources://` paths and reference them in the ledger.
7. **REVIEW** – Use reviewer rubric JSON; cite file+line references; include risk & rollback plan. Reviewers must confirm the Autopilot functionality identified in STRATEGIZE/PLAN/THINK still works (link evidence: smoke runs, manual walkthroughs, telemetry). Store the verdict alongside the ledger entry.
8. **PR** – Summarize changes, evidence, risks, and link to the RECOVERY phase advanced. Include prompt-header attestation + phase ledger hashes in the evidence bundle.
9. **MONITOR** – Run Monitor smoke or equivalent; log outputs + metrics. If smoke fails, file plan-delta before merging and keep the lease open until resolved.

**Rework loops:** If VERIFY, REVIEW, PR, or MONITOR uncover defects or missing evidence, the task must return to the earliest impacted phase (often IMPLEMENT or PLAN), redo the work, and then re-run every downstream phase with fresh ledger entries, leases, and artifacts. No phase may be skipped during re-entry.

### Tool & Context Notes
- Always run `plan_next` (minimal) before picking a new slice. If MCP tools are unavailable, log the outage in `state/autopilot_execution.md`.
- Atlas & router guard tests now fail on drift; when editing prompts/docs/policy files run `npx tsx tools/wvo_mcp/src/atlas/generate_atlas.ts`.
- For offline environments, populate `.wheels/` via `pip download` and run `make bootstrap-offline` before invoking pytest.

## 5. Immediate Next Actions

1. **Phase 1 kickoff** – Build `router_policy.ts`, refactor agents to consume it, and extend router guard tests to cover the full orchestrator directory.
2. **Resolution engine spike** – Implement taxonomy enums + journaling stubs to unblock Phase 2.
3. **CI wiring** – Land `.github/workflows/atlas.yml` + `refresh-model-catalog.yml` so atlas drift cannot sneak back in.

Record each action in `state/autopilot_execution.md` with date, stage/phase, and artifacts.
