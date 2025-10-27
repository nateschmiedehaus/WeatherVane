# Unified Autopilot Recovery & Completion Plan

This document captures the authoritative roadmap for turning the current Unified Autopilot prototype into a production-grade multi-agent system. Every work item must run through the **Specify → Plan → (Think) → Implement → Verify → Review → PR → Monitor** loop, recording artifacts in the decision journal.

## Stage 0 – Stabilize & Instrument (Days 0‑2)

| Task | Outcome |
| --- | --- |
| Baseline reality check | Install deps, run `npm test`, Python suites, `make lint`, capture failures, log in journal. |
| Logging & metrics scaffolding | Structured logs on every state transition; Prometheus counters/histograms exposed via `/metrics`. |

- **Immediate fixes**
  - Root `npm test` script runs `vitest` so CI has a Node-based sanity check.
  - `make bootstrap` (or `pip install .[dev]`) is required before `make test`; document + enforce in CI so `pytest` is available.
  - Offline sandboxes use `make bootstrap-offline` (wheel cache under `.wheels/`) plus `make test-py` for Python-only verification when Node/npm tooling is blocked.

### Legacy Autopilot Cleanup Log

| Date | Action |
| --- | --- |
| 2025-10-27 | `.github/PULL_REQUEST_TEMPLATE.md` now explicitly flags the Unified Autopilot evidence checklist so contributors stop pasting the legacy template. |
| 2025-10-27 | `docs/wvo_prompt.md` declares itself the single source of truth and instructs agents to archive any remaining legacy prompts or scripts on sight. |

## Stage 1 – Make the Pipeline Real (Days 3‑7)

1. **Implementer actually edits code** – Build a `CodeEditor` service that applies LLM-generated diffs via MCP (`fs_*`, `cmd_run`). Update `ImplementerAgent` to call Codex, write files, and stage changes.
2. **Verify runs real commands** – Replace `NoopToolRunner` with actual gate execution (`tests.run`, `lint.run`, etc.), capture artifacts + coverage.
3. **Resolution loop acts on evidence** – Parse gate logs, attach MRFC stubs, enforce plan deltas and Thinker reruns when required.

## Stage 2 – Context Fabric V2 (Days 8‑12)

1. **Real context builder** – Implement Ladder (nearby/module/repo/KB/decisions), enforce token budgets, add `context.expand`, edit windows per agent.
2. **Team knowledge flow** – Rich team panels, spike tracking, formal handoff packages stored under `resources://runs/<run>/handoff/`.

## Stage 3 – Governance & Roadmap Ops (Days 13‑20)

1. **Roadmap operations API** – Implement schema/store/ops/MCP tools for roadmap mutations plus tests.
2. **Reframe + detectors** – Loop detection, spec drift, dependency thrash detectors feeding Reframe state with RFC/ADR artifacts and shadow-plan validation.

## Stage 4 – Real Multi-Agent Execution (Days 21‑30)

1. **Actual LLM agents** – Wire Codex 5 + Claude 4.5 via MCP, persist transcripts, use Atlas prompts.
2. **Planner task intelligence** – Feature extraction for routing; log hints for future ML.
3. **Queueing & retries** – After reliability proven, integrate BullMQ for prioritized task execution.

## Stage 5 – Learning & Observability (Month 2)

1. **Routing feedback loop** – Track per-model success, adjust capability priorities, persist stats.
2. **Continuous improvement** – Nightly canaries, Grafana dashboards, optional MLflow/W&B for experiments.

## Extended Phase Backlog

These phases build on the Stage work above; each slice must run through Spec → Plan → Think → Implement → Verify → Review → PR → Monitor with journal entries.

### Phase 0 – Foundations & Legacy Pruning
- Remove legacy autopilot prompts/docs/scripts; all contributors should see Unified Autopilot instructions only.
  - ✅ `AUTOPILOT_*.md`, `DOCKER_*`, and related docs now live under `docs/autopilot/legacy/` with stubs pointing back to this playbook.
  - ✅ `run_wvo_autopilot.sh`, `scripts/docker-autopilot.sh`, `tools/wvo_mcp/scripts/autopilot.sh`, and companions now short-circuit with guidance to `make autopilot` / `autopilot_unified.sh`.
- Update `.github` templates + MCP prompts so they reference this recovery plan, not the legacy flow.

### Phase 1 – Model Lockdown & Router Policy
1. **Discovery/catalog** – Implement `model_discovery.ts`, emitting allow-listed catalog JSON per run.
2. **router_policy.ts** – Central table for capability priorities, escalation thresholds, fallback rules.
3. **Router hardening** – Consume policy module, enforce allow-list, log every decision, add fast_code/long_context/cheap_batch escalation heuristics.
4. **Tests** – Vitest suites for discovery filtering + router ranking.

### Phase 2 – Resolution Taxonomy & Integrity Guards
1. **Taxonomy module** – Blocker labels, ceilings, spike/Thinker requirements, evidence expectations.
2. **Resolution engine** – Playbooks per label with journaled plan delta/actionables.
3. **Integrity gate** – `verify_integrity.ts` with changed-line coverage, skip/placeholder/no-op detection, mutation smoke hook.
4. **Implementer outputs** – Changed file metadata, coverage hints, failing-proof flag, touched-files ratio cached for Verify.

### Phase 3 – State Graph Modularization & Incident Flow
1. Split per-state runners for readability; enforce retry ceilings + integrate resolution loop, spike branches, incident reporter.
2. Monitor state runs `scripts/app_smoke_e2e.sh` and forces plan delta on failure.
3. Incident reporter produces MRFC (under `repro/<task>/`) and triggers `policy.require_human`.

### Phase 4 – Agents, Reviewer Rubric, Critical Pass
1. Reviewer outputs rubric JSON (resolution proof, design, perf/security, maintainability, executive quality) and enforces minimum scores.
2. Critical agent scans for secret/auth issues and escalates via policy.
3. Planner/Supervisor/Implementer consume router policy hints, store plan hashes, coverage targets, changed-files metadata.
4. Update `.github/PULL_REQUEST_TEMPLATE.md` + `tools/wvo_mcp/prompts/reviewer_rubric.md` with Resolution Proof checklist.

### Phase 5 – CI, Scripts, Integration Tests
1. Add hermetic smoke run coverage inside Monitor + dedicated Vitest verifying `scripts/app_smoke_e2e.sh` stub.
2. Expand `quality_gate_integration.test.ts` to simulate Verify failure → Resolution loop → Plan delta → success, plus incident flow tests.
3. Ensure CI workflows trigger both scopes (`test:autopilot`, `test:web`) and the integrity scripts.

#### Phase 5 – Autopilot Quality Gate Specification
- **Goal**: Prove that Unified Autopilot can self-govern with 100 % reliability through Spec → Plan → Think → Implement → Verify → Review → PR → Monitor before it is allowed to touch new WeatherVane product work. Any WeatherVane commands we run in this phase exist solely to validate Autopilot’s gates.
- **Acceptance Criteria**
  1. Monitor state automatically invokes `scripts/app_smoke_e2e.sh` (or its hermetic stub in CI) and fails closed: a smoke error forces a plan delta + Resolution entry before any retry.
  2. `quality_gate_integration.test.ts` contains scenarios for (a) Verify failure → Resolution loop → plan delta → success and (b) incident escalation that proves `policy.require_human` is honored.
  3. `tools/wvo_mcp/scripts/run_integrity_tests.sh` bootstraps wheels/offline deps before pytest so CI + TestsCritic see the real pass/fail signal even in sealed sandboxes. (✅ Script now auto-populates `.wheels/` when missing, honors `INTEGRITY_OFFLINE`/`INTEGRITY_PREFER_WHEELS`, and bails early if the pinned Python toolchain is unavailable.)
  4. GitHub workflows (`test-autopilot.yml`, `test-web.yml`, `integrity.yml`, `atlas.yml`, `refresh-model-catalog.yml`) all trigger in CI and block merges on Phase 5 regressions; artifacts are attached to the decision journal.
  5. After items 1‑4 are green, run Unified Autopilot on a live WeatherVane backlog slice (e.g., via `make autopilot` or `run_wvo_autopilot.sh`) and capture the full Spec→Monitor transcript plus reviewer rubric in `state/autopilot_execution.md`. This serves as the “Autopilot tested on real work” proof.
  6. Any slice that touches design or UX layers must attach Playwright screenshot artifacts (or an equivalent headless-capture baseline) to the Verify/Monitor evidence so reviewers can inspect the rendered change without rerunning the suite, and every other slice must capture the quality-manager artifacts relevant to its scope (e.g., perf traces for Perf Manager, security scan logs for Security Manager, ingestion diffs for Data Manager).
  7. Think + Review stages must document how the change integrates with the surrounding stack (modules, pipelines, orchestration) *and* why it remains conceptually correct for WeatherVane’s long-term product direction—quality gates trigger plan deltas (never dead-end failures) whenever integration proof or purpose alignment is missing so the Spec→Plan loop can refine the solution.
  8. If Monitor/Verify uncovers upstream or downstream risks that block the component, Autopilot either fixes them immediately (when within scope) or records a plan-delta note + routed follow-up so the dependency is guaranteed to close before declaring the slice complete.
- **Implementation Notes**
  - Extend Monitor’s runner (`state_graph.ts`/`monitor_state.ts`) with a `SmokeCommand` helper that shells out to `scripts/app_smoke_e2e.sh` (or `npm run smoke --prefix tools/wvo_mcp` during hermetic CI) and streams logs into the journal. Add Vitest coverage in `monitor_state.test.ts`.
  - Augment `quality_gate_integration.test.ts` with fixtures that stub MCP tool output, forcing Verify to observe failing pytest logs, emit a taxonomy label, and only proceed once Resolution records a plan delta + Think replay.
  - Patch `tools/wvo_mcp/scripts/run_integrity_tests.sh` to call `. scripts/python_toolchain.sh`, auto-populate `.wheels/` via `pip download` when online, honor `INTEGRITY_OFFLINE`/`INTEGRITY_PREFER_WHEELS`, and fail fast if the pinned Python interpreter is missing; document the flow in `docs/autopilot/RECOVERY_PLAYBOOK.md`.
  - Ensure `ShellToolRunner` receives the active `ProcessManager` so every gate command spawns in its own process group (POSIX) or gets `taskkill /T` (Windows). Ctrl‑C (or ProcessManager.stop) must tear down all watchers, preventing the post-run meltdowns we observed.
  - Create or update GitHub workflows so `test:autopilot`, `test:web`, `run_integrity_tests.sh`, and Atlas/model-catalog refresh run on every PR. Workflows should upload smoke + gate artifacts to `${{ github.workspace }}/artifacts/autopilot-phase5/`.
  - Define a “live-task validation” checklist in `state/autopilot_execution.md` capturing: roadmap task ID, autopilot transcript URI, gate command SHAs, integrity batch result, reviewer rubric summary (with flexibility to note loops back to Spec/Plan/Think/Implement/Verify/Review when the protocol iterates), Monitor timestamp, and links to the scope-appropriate quality-manager artifacts (Playwright screenshots, Lighthouse/perf traces, data-ingestion audit tables, etc.).
  - Update reviewer rubric prompts to explicitly accommodate iterative Spec→Plan→Think→Implement→Verify→Review loops (and the possible return to earlier stages) so the rubric can record partial passes, required deltas, and resumed work without blocking valid protocol-driven iteration **while** flagging when integration evidence or purpose alignment is absent and reminding reviewers to confirm upstream/downstream blockers were either fixed or journaled for follow-up.

### Phase 6 – Telemetry & Documentation
1. Extend OTEL spans + ledger entries with router decisions, resolution labels, spike branches, mutation smoke status.
2. Decision journal: persist plan hashes, rubric JSON, incident metadata, artifacts.
3. Refresh docs (`CONTEXT_SYSTEM.md`, `MODEL_ROUTING_POLICY.md`, runbooks) with router policy + evidence chain examples.

### Phase 7 – Acceptance & Rollout
1. Quality gate integration tests prove “resolve, don’t stall” behavior end-to-end.
2. Assemble sample evidence chain (journal excerpt + artifacts) and document in `docs/autopilot/`.
3. Prepare rollout PR referencing incident/stub instructions, nightly canary readiness, and CI proof.

## Execution Protocol for Codex

1. **Specify** – Restate goal + acceptance criteria; cite relevant docs.
2. **Plan** – Break down steps, record plan hash in journal.
3. **Think (optional)** – Document open questions, spike proposals when ambiguity exists.
4. **Implement** – Minimal diffs, update docs/tests concurrently, log MCP tool calls.
5. **Verify** – Run required commands, attach artifacts, confirm coverage thresholds.
6. **Review** – Self-review checklist (readability, maintainability, perf, security) referencing file+line.
7. **PR** – Summarize changes, link evidence, note risks/rollback.
8. **Monitor** – Execute `scripts/app_smoke_e2e.sh` or relevant smokes, log outputs.

Maintain `state/autopilot_execution.md` (or equivalent) with timestamps, artifacts, and blockers for every task. No step is “done” until Monitor passes or a plan-delta is filed.
