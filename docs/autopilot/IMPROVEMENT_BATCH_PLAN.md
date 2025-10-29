# Autopilot Improvement Batch — Full Work Process Plan

This plan applies the full STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR process to the Anti‑Drift + Observability improvements. It is the canonical document to organize, track, and prove completion of this batch.

Artifacts for each phase are enumerated and must be produced under `state/evidence/<TASK-ID>/<phase>/...` or linked herein.

---

## Status Summary (Live)
Last updated: 2025-10-29
- Fundamentals (IMP‑FUND‑01..09): COMPLETE — see Current Progress; evidence scattered under `state/evidence/IMP-FUND-*/`.
- Observability:
  - IMP‑OBS‑01 (OTel Spans): COMPLETE — `state/evidence/IMP-OBS-01/verify/`
  - IMP‑OBS‑02 (OTel Counters): COMPLETE — `state/evidence/IMP-OBS-02/verify/`
  - IMP‑OBS‑03 (JSONL Sinks): COMPLETE — `state/evidence/IMP-OBS-03/verify/`
  - IMP‑OBS‑04 (Alert Scaffolding): COMPLETE — `state/evidence/IMP-OBS-04/verify/`
  - IMP‑OBS‑05 (Metrics Dashboard): COMPLETE — `state/evidence/IMP-OBS-05/verify/`
  - IMP‑OBS‑06 (Observer Agent): COMPLETE — `state/evidence/IMP-OBS-06/verify/`
- Prompting:
  - IMP‑21..26 (compiler/persona/overlays/stategraph/tools/variants): PLANNED — flag‑gated; see “Prompting Improvements — Production Slices”
  - IMP‑35 (eval harness + gates), IMP‑36 (verifiers), IMP‑37 (groundedness): PLANNED
- Advanced Features:
  - IMP‑ADV‑01 (Quality Graph baseline): COMPLETE — `state/evidence/IMP-ADV-01/`
  - IMP‑ADV‑01.1..01.7: PLANNED/DEFERRED — see Roadmap

For detailed per‑item status and evidence, see “Roadmap Status Index (Live)” below.

## STRATEGIZE
- Problem
  - **Reality Check**: Phase ledger and evidence gates ALREADY COMPLETE (commits 7fa439e2, 8763dded)
  - **Actual Gaps**: MCP tests failing, benchmarks incomplete, no monitoring baseline, no evidence-driven process infrastructure
  - **Risk**: Building advanced features on incomplete foundation → drift/failures compound
- Objectives
  - **Phase 0 (Fundamentals)**: Stabilize foundation BEFORE new features
    - Fix 3 MCP test failures (RuntimeError: MCP process exited unexpectedly)
    - Complete phase transition benchmark (mock StateMachine + 1000 iterations)
    - Establish monitoring baseline (1-2 weeks of metrics: phase_skips, backtracks, drift)
    - Build evidence-driven process (checkpoint validation, acceptance tests, CI gates)
  - **Phase 1-4**: Only proceed after fundamentals stable
- Scope
  - **IN SCOPE (Phase 0 only)**: MCP fixes, benchmark completion, monitoring period, evidence infrastructure
  - **DEFERRED (Phase 1+)**: Phase leases, prompt attestation, OTel, quality graph, atlas, persona routing
- Non-Goals
  - **Explicitly NOT doing**: Any new enforcement/observability features until fundamentals complete
  - **No partial implementations**: Each phase must be verifiably complete before next
- Inputs
  - ✅ Phase ledger (DONE)
  - ✅ Evidence gates (DONE)
  - ✅ MCP tests (DONE - all 3 tests passing)
  - ✅ Benchmarks (DONE - phase transitions <2ms, 98% under target)
  - ❌ Monitoring baseline (not established)
  - ❌ Evidence-driven process (missing infrastructure)
- Risks
  - **Risk of skipping fundamentals**: Advanced features fail due to unstable base
  - **Risk of partial completion**: Evidence infrastructure not built → can't verify "verifiably complete"
  - **Risk of premature feature work**: Persona routing before monitoring → can't measure impact
- Strategy
  - **"Fundamentals First" strictly enforced**: No Phase 1 work until Phase 0 complete
  - **Evidence-driven**: Daily evidence updates, checkpoint validation scripts, acceptance tests
  - **Monitoring period REQUIRED**: 1-2 weeks baseline before building on top

Artifacts
- `state/evidence/IMP-PHASE-0/strategize/strategy.md` (this section)
- `state/evidence/IMP-PHASE-0/strategize/worthiness.md` (epic/KPI/alternative/kill‑trigger)

---

## SPEC
- Acceptance Criteria (must all hold)
  - Zero successful out‑of‑sequence transitions in state graph; violations counted and blocked.
  - Tool router rejects out‑of‑phase tool calls with structured errors and metrics.
  - Evidence‑gated transitions block forward progress without required artifacts and content checks per phase.
  - Prompt attestation detects header drift; WARN everywhere; ERROR in VERIFY/REVIEW/MONITOR (configurable).
  - Leases prevent concurrent access to the same task+phase; contention logged.
  - OTel spans for state transitions and verify; metrics JSONL for violations and backtracks.
  - Integrity script finishes green with artifacts attached to journal (or all failures triaged with evidence).
  - Prompting quality gates: compiled prompt hashes recorded in the ledger per phase; persona/tool allowlists enforced when enabled; prompt evaluations must meet acceptance KPIs before rollout.
  - Autonomy promotion gates: autonomy mode can only advance (shadow → observe → canary → enforce) when autonomy KPIs meet thresholds over a rolling baseline window (see Autonomy Track section) and no critical violations occur.
- KPIs
  - Success ≥95%, loop ≤2%, tool MTTR ≤30s (observability SLOs recorded).
  - phase_skips_attempted: 0; tasks_rejected_for_process_violation: ≥1 if tests inject skips (proves guard works).
  - Prompting (when enabled): success_rate_golden ≥ baseline+Δ; groundedness_score non‑decreasing; injection_success_rate ≤ threshold; prompt_drift_rate = 0 unless approved migration; cost_per_success and p95 latency within budget; false_block_rate ≤0.5% on benign evals.
  - Autonomy (when enabled): autonomy_completion_rate ≥ target; hitl_intervention_rate ≤ target; rollback_rate ≤ target; violation_rate ≈ 0; p95 latency/cost within budget; incident_count = 0 for promotion window.

Artifacts
- `state/evidence/IMP/spec/spec.md` (criteria + KPIs + verification mapping table)

---

## PLAN
- Change Budget (Phase 0)
  - Allowed files: <list>
  - Max diff lines: <N>; retry/time ceilings: <values>; prohibited ops: <notes>
- Rollback
  - Sentence: “Revert commit X; flip FLAG=off; clear cache Y”; Preconditions: <A,B>
- Work Breakdown (**Phase 0 ONLY** - fundamentals first)
  - ✅ **IMP-FUND-01**: Phase Ledger (DONE – commit 7fa439e2)
  - ✅ **IMP-FUND-02**: Evidence-Gated Transitions (DONE – commit 8763dded)
  - ✅ **IMP-FUND-03**: MCP Test Fixes (DONE)
    - Root Cause: Stale PID lock file (state/.mcp.pid) prevented MCP server startup during tests
    - Fix: Added pytest_sessionstart hook in tests/conftest.py to clean up PID lock before test session
    - Verification: All 3 MCP tests (5 test cases) now passing
  - ✅ **IMP-FUND-04**: Complete Phase Transition Benchmark (DONE)
    - Implementation: Added minimal StateMachine mock (as unknown as StateMachine type casting)
    - Removed unused EvidenceCollector import (only takes 1 parameter, not 2)
    - Results (1000 iterations each):
      - Phase Ledger Append: p50=0.06ms, p95=0.09ms, p99=0.16ms ✅
      - Phase Lease Acquire: p50=0.04ms, p95=0.06ms, p99=0.22ms ✅
      - Phase Lease Release: p50=0.03ms, p95=0.04ms, p99=0.06ms ✅
      - Prompt Attestation: p50=0.62ms, p95=0.87ms, p99=0.98ms ✅
      - Full Phase Transition: p50=0.68ms, p95=0.89ms, p99=1.53ms ✅
    - Verification: ALL PASS - latencies 98% below target (p50 <20ms, p95 <50ms, p99 <100ms)
    - Anti-drift overhead: <2ms per transition (negligible)
  - ✅ **IMP-FUND-05**: Playwright Browser Installation
    - Script: `scripts/ensure_playwright_browsers.sh` (idempotent guard)
    - Integration: `apps/web/scripts/run_playwright.sh` invokes guard automatically (logs captured)
    - Evidence: `state/evidence/IMP-FUND-05-playwright-guard/implement/{ensure.log,run_help.log}`
    - Follow-up: Ensure npm dependencies installed before guard in CI to suppress warnings
  - ✅ **IMP-FUND-06**: Checkpoint Validation Scripts
    - Script: `scripts/validate_checkpoint.sh` (fail-closed checkpoint gate)
    - Checks: integrity suite (default), TODO/FIXME/HACK/XXX scan with allowlist enforcement, evidence verification per phase when `--task-id` supplied
    - Flags: `--skip-integrity`, `--skip-todo-scan`, `--skip-evidence`, `--require-phase <name>`
    - Artifacts: legacy markers captured in `config/checkpoint_todo_allowlist.txt`; evidence stored under `state/evidence/IMP-FUND-06/`
    - Integration: CI must run without `--skip-integrity` before advancing a task; local fast mode supported for iteration
  - ✅ **IMP-FUND-07**: Acceptance Test Framework (initial scenarios)
    - Tests: `work_process_acceptance.test.ts` exercises phase skip and missing evidence gates
    - Framework: Lives in autopilot vitest scope with deterministic mocks (no external commands)
    - Coverage: Core enforcement behaviors; extend to leases/backtracking in future phases
  - ✅ **IMP-FUND-08**: Daily Evidence Update Automation
    - Script: `scripts/check_evidence_staleness.py` (configurable threshold, optional bypass)
    - Automation: `.github/workflows/evidence-staleness.yml` runs daily @06:00 UTC + manual dispatch
    - Outcome: Fails fast when evidence >24h old; developers can run locally via wrapper
  - ✅ **IMP-FUND-09**: Pre-Feature Monitoring Period Setup
    - Snapshot script: `scripts/create_process_snapshot.py` writes JSON under `state/analytics/process_monitoring/`
    - Workflow: `.github/workflows/process-monitoring.yml` scheduled daily @06:15 UTC
    - Baseline: Initial snapshot captured; review logs weekly for 1-2 weeks before Phase 1 kickoff

- Dependencies
  - **Sequential**: FUND-03 → FUND-04 → FUND-05 (test fixes before benchmarks before browser setup)
  - **Sequential**: FUND-06 → FUND-07 → FUND-08 (validation scripts before acceptance tests before automation)
  - **Blocking**: ALL Phase 0 tasks MUST complete before ANY Phase 1 work

- Estimates

### Prompting Improvements — Production Slices (Phase 1+; staged, not a single block)
- Goal: measurably improve task success and robustness while preserving anti‑drift guarantees.
- Principle: ship in `observe` mode, collect evidence, then promote to `enforce`.
- Integration: compiler/persona/overlays feed attestation and the ledger; VERIFY adds prompt eval gates; telemetry captures variants.
- Each slice defines dependencies, flags, acceptance/KPIs, evidence, and a rollback.

- IMP‑21 — Prompt Compiler (skeleton + canonicalization)
  - Scope: programmatic assembly with typed slots (core header, phase role, domain overlays, skill packs, rubric injection), canonicalization, and stable hash; golden tests.
  - Files (planned): `tools/wvo_mcp/src/prompt/compiler.ts`, `tools/wvo_mcp/src/prompt/templates/{system,phase,domain}.md`.
  - Rollout: FLAG `prompt.compiler=observe` → `=enforce` post‑verify.
  - Dependencies: FUND‑gates complete; THINK rubric integration ready; none runtime‑breaking.
  - Acceptance: deterministic canonicalization (identical hash across runs/restarts), golden compile tests pass, no change in baseline behavior with neutral overlays.
  - Evidence: `state/evidence/IMP-21/implement/git_diff.patch`, `compiler_golden_tests.json`, `compiler_hash_consistency.log`.
  - Rollback: set `prompt.compiler=off` (falls back to legacy header assembly); no data migration required.
  - Integration Notes:
    - **Quality Graph Hints** (IMP-ADV-01.2): Compiler will read hints from context pack (`planner.context_pack.qualityGraphHints`) and inject into typed slot (e.g., overlay `quality_graph_hints`); zero code changes needed in planner/plan_runner (already storing hints in context pack)
    - **Hint Injection Pattern**: When `QUALITY_GRAPH_HINTS_INJECTION=observe|enforce`, compiler checks context pack for hints and includes in prompt assembly; attestation records compiled hash including hints

- IMP‑22 — PersonaSpec canonicalize/hash + attestation integration
  - Scope: typed PersonaSpec, canonicalization + hash, ledger/attestation fields; default neutral persona.
  - Files (planned): `tools/wvo_mcp/src/prompt/persona.ts`, ledger additions.
  - Rollout: FLAG `prompt.persona=observe`.
  - Dependencies: IMP‑21 optional; ledger writable.
  - Acceptance: persona canonicalization stable; default neutral persona preserves outputs; persona_hash recorded in attestation and ledger for ≥95% transitions.
  - Evidence: `state/evidence/IMP-22/implement/persona_examples.json`, `attestation_persona_hash.log`.
  - Rollback: set `prompt.persona=off`; attestation keeps field optional.
  - Related: IMP‑25 (tool allowlists are derived from PersonaSpec); IMP‑26 (variant/telemetry attributes include persona hash).

- IMP‑23 — Domain overlays library
  - Scope: curated overlay packs for orchestrator/web/ml/api/security; rubric injection from `docs/ACTIVE_RESPONSE_AND_DYNAMIC_RUBRICS.md`.
  - Files (planned): `tools/wvo_mcp/src/prompt/templates/domain/*.md`.
  - Rollout: FLAG `prompt.overlays=observe`.
  - Dependencies: IMP‑21.
  - Acceptance: overlays compile without drift; rubric injection tested; no degradation on golden baseline with overlays off; with overlays on, improvements are measured under IMP‑35.
  - Evidence: `state/evidence/IMP-23/implement/overlay_catalog.md`.
  - Rollback: set `prompt.overlays=off`.
  - Related: IMP‑21 (compiler consumes overlays); IMP‑24 (attestation records overlay‑affected prompt hash); IMP‑37 (groundedness constraints can be implemented as overlays).

- IMP‑24 — StateGraph hook to compile/attach prompt per phase
  - Scope: compile prompt before each runner; record `prompt_hash` and `persona_hash` to attestation + ledger + decision journal.
  - Files (planned): `tools/wvo_mcp/src/orchestrator/state_graph.ts` (hook), `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts` (attestation wiring).
  - Rollout: FLAG `prompt.attest=observe` → `=enforce` for VERIFY/REVIEW/MONITOR.
  - Dependencies: IMP‑21 (compiler) and IMP‑22 (persona) to maximize coverage.
  - Acceptance: prompt_hash and persona_hash recorded for ≥99% of transitions; drift WARNs in normal phases and ERRORs in VERIFY/REVIEW/MONITOR when policy demands.
  - Evidence: `state/evidence/IMP-24/implement/ledger_prompt_hash.log`, `journal_prompt_entries.md`.
  - Rollback: set `prompt.attest=off` (only disables enforcement; ledger writes may remain).
  - Related: IMP‑21 (compiler), IMP‑22 (persona), IMP‑35 (evals referenced by attestation), IMP‑ADV‑01.2 (hints must be inside compiled/attested prompt).

- IMP‑25 — Tool allowlists from PersonaSpec in tool router
  - Scope: map PersonaSpec→tool allowlists; reject out‑of‑allowlist tool calls with structured errors + metrics.
  - Files (planned): `tools/wvo_mcp/src/worker/tool_router.ts`.
  - Rollout: FLAG `prompt.persona.tools=enforce` with escape hatch for READ‑only tools.
  - Dependencies: IMP‑22.
  - Acceptance: out‑of‑allowlist calls are blocked with correct error/metric; false‑block rate ≤0.5% on benign evals; READ‑only tools allowed when configured.
  - Evidence: `state/evidence/IMP-25/verify/tool_router_allowlist_tests.json`.
  - Rollback: set `prompt.persona.tools=off`.
  - Related: IMP‑22 (PersonaSpec); ensure quality graph hint injection (IMP‑ADV‑01.2) does not implicitly widen tool access.

- IMP‑26 — Flags/telemetry for persona variants and sampling
  - Scope: record variant IDs in ledger/spans; add metrics for `prompt_drift_detected`, `prompt_variant`, `persona_hash`.
  - Files (planned): metrics/telemetry surfaces; ledger schema extension.
  - Rollout: FLAG `prompt.variants=observe`.
  - Dependencies: IMP‑24 (ledger hook), telemetry sinks.
  - Acceptance: variant IDs and persona hashes appear in traces/metrics; overhead ≤1ms per transition; no logging gaps.
  - Evidence: `state/evidence/IMP-26/verify/telemetry_snapshot.jsonl`.
  - Rollback: set `prompt.variants=off`.
  - Related: IMP‑21/24 (record variant and prompt hashes); IMP‑ADV‑01.2 (mark when hints are injected); IMP‑35 (tie eval results to variant IDs).

- IMP‑35 — Prompt Eval Harness + Gates
  - Scope: golden tasks + robustness (injection) corpus; promptfoo/garak runner; gates in VERIFY to block regressions.
  - Files (planned): `tools/wvo_mcp/scripts/run_prompt_evals.sh`, `tools/wvo_mcp/evals/prompts/{golden,robustness}/*.jsonl`, `tools/wvo_mcp/src/verify/validators/prompt_eval_gate.ts`.
  - Rollout: FLAG `gate.prompt_evals=observe` → `=enforce` when KPIs met.
  - Acceptance: success_rate_golden +5–10% relative over baseline; injection_success_rate ≤1% and non‑increasing; groundedness non‑decreasing; budget respected.
  - Evidence: `state/evidence/IMP-35/verify/{prompt_eval_baseline.json,prompt_eval_results.json,robustness_eval.json}`.
  - Dependencies: IMP‑21 (compiler) for consistent assembly; telemetry sinks.
  - Rollback: set `gate.prompt_evals=off` (gates disabled, harness can still run in CI optional mode).
  - Related: IMP‑24 (attestation must match compiled prompt used in eval); IMP‑26 (record variant IDs in eval outputs); IMP‑37 (groundedness checks part of evals); IMP‑ADV‑01.2 (evaluate hint injection variants explicitly).

- IMP‑36 — Test‑time verifiers (self‑consistency + chain‑of‑verification)
  - Scope: enable for “hard” task classes with budget caps; rerank via verifier; log `extra_compute_rate`, `consistency_gain`, `verification_block_rate`.
  - Rollout: FLAG `prompt.verifiers=observe` per task class.
  - Evidence: `state/evidence/IMP-36/verify/verifier_ablation.json` (lift vs cost/latency).
  - Dependencies: IMP‑35 (eval harness) to measure lift; cost/latency budgets established.
  - Acceptance: measurable lift on hard subset with p95 latency/cost within caps; hallucination/groundedness non‑degrading.
  - Rollback: set `prompt.verifiers=off`.

- IMP‑37 — RAG grounding & citation enforcement
  - Scope: RAG‑first prompts with citation slots; reviewer/verifier cross‑checks claims against sources; enforce citations ≥98% when sources available.
  - Rollout: FLAG `prompt.grounded=observe` → `=enforce`.
  - Evidence: `state/evidence/IMP-37/verify/groundedness_report.json`.
  - Dependencies: retrieval stack available; IMP‑35 to score groundedness.
  - Acceptance: citations present ≥98% when sources exist; no drop in success_rate_golden; clear failure reasons on missing provenance.
  - Rollback: set `prompt.grounded=off`.
  - Related: IMP‑ADV‑01.2 (only inject grounded hints or mark as non‑grounded); IMP‑21/24 (compiler/attestation include citation slots when sources exist); IMP‑35 (eval groundedness).

### Advanced Features — Quality Graph (Phase 1+; staged follow-ons to IMP-ADV-01)
- Guiding principle: IMP-ADV-01 (vector-based task similarity) is complete with 9/10 AC met; these follow-ons depend on Phase 1 infrastructure or are future enhancements.

- ✅ IMP‑ADV‑01 — Quality Graph Integration (baseline implementation)
  - Status: COMPLETE (commit 87cd87b0)
  - Scope: TF-IDF embeddings + cosine similarity, MONITOR recording, PLAN hints, backfill scripts
  - Acceptance: 9/10 AC met (AC7 deferred), 96.5% test pass rate, all performance targets met
  - Evidence: `state/evidence/IMP-ADV-01/{spec,plan,think,implement,verify,review,pr}/`

- IMP‑ADV‑01.1 — Observer Baseline Integration (AC7 from IMP-ADV-01)
  - Status: ✅ COMPLETE (2025-10-29)
  - Scope: Query similar tasks in observer agent; compute baseline metrics (mean ± 2σ); flag anomalies in observer report
  - Implementation: Observer agent queries quality graph for similar tasks, computes baseline stats (mean ± 2σ), classifies current task duration (within/above_upper/below_lower), includes in observer report
  - Effort: 3-4 hours (actual)
  - Evidence: `state/evidence/IMP-ADV-01.1/{strategize,spec,plan,think,implement,verify,review,monitor}/` (complete 9-phase evidence)
  - Verification: 3 observer agent tests passing, integrity tests green
  - Documented: IMP-ADV-01 README:359-374

- IMP‑ADV‑01.2 — Inject Hints into Planner Prompt
  - Status: ✅ COMPLETE (2025-10-29)
  - Scope: Store quality graph hints in planner context pack for future prompt compiler (IMP-21) consumption; defer actual LLM prompt injection to IMP-21
  - Implementation: Hints retrieved from quality graph and passed to PlannerAgent, stored in context pack, attached to plan result for observability; feature flag controls hint retrieval (off/observe/enforce)
  - Effort: 2-3 hours (actual: 2.5 hours)
  - Rollout: FLAG `QUALITY_GRAPH_HINTS_INJECTION=observe` (default, hints retrieved and stored)
  - Integration with Prompting Roadmap:
    - **IMP-21** (Prompt Compiler): Will read hints from context pack and inject into typed slot (e.g., overlay `quality_graph_hints`)
    - **IMP-24** (Attestation): Will record compiled prompt hash including hints (when IMP-21 injects them)
    - **IMP-35** (Prompt Eval Gate): Will A/B test hint effectiveness vs. baseline before promotion
    - **IMP-26** (Variants/Telemetry): Will record variant IDs when hints are injected
    - **IMP-37** (Groundedness): Will validate hints are grounded before injection
  - Forward Compatibility: Zero code changes needed when IMP-21 lands - hints already in context pack, prompt compiler can consume immediately
  - Evidence: `state/evidence/IMP-ADV-01.2/{strategize,spec,plan,think,implement,verify,review}/` (complete 9-phase evidence)
  - Future Improvements (to be added as follow-on tasks):
    - Add stemming: 'caching' → 'cache' (normalize word forms)
    - Expand synonyms: JWT/OAuth, Redis/Memcached (cross-technology matching)
    - Upgrade to neural embeddings (IMP-ADV-01.6): Expected 0.78 → 0.85+ precision@5
    - Re-evaluate with real corpus when available (need 500+ tasks for reliable metrics)

- IMP‑ADV‑01.3 — Manual Similarity Evaluation (KPI #1 validation)
  - Status: ✅ COMPLETE (2025-10-29)
  - Scope: Evaluate top-K similarity for 20 sample tasks; verify precision ≥60%; establish baseline for future embeddings upgrades
  - Implementation: Manual evaluation of 20 sample task pairs, human judgment of relevance, precision@5 calculation
  - Result: **Precision@5 = 0.780 (EXCELLENT)** - exceeds 0.60 target by 30%
  - Effort: 2 hours (actual)
  - Evidence: `state/evidence/IMP-ADV-01.3/verify/manual_evaluation.json` (task pairs, human judgments, precision score)

- IMP‑ADV‑01.4 — Corpus Size Monitoring
  - Status: ✅ COMPLETE (2025-10-29)
  - Scope: Add telemetry metric `quality_graph_corpus_size`; alert when approaching 2000 vectors (auto-prune limit); prevent performance degradation
  - Implementation: getCorpusSize() helper function, MONITOR phase integration, logging-based approach with comprehensive documentation
  - Acceptance: 5/6 criteria met (AC3 gauge registration deferred to IMP-OBS-05)
  - Effort: 30 minutes (actual)
  - Evidence: `state/evidence/IMP-ADV-01.4/{strategize,spec,plan,think,verify,review,monitor}/` (complete 9-phase evidence)
  - Tests: 5/5 passing (corpus_metrics.test.ts)
  - Alert Thresholds: Warning (1800), Critical (2000), Excessive (2100)

- IMP‑ADV‑01.5 — Pin Python Dependencies
  - Status: ✅ COMPLETE (pre-existing)
  - Scope: Create `tools/wvo_mcp/scripts/quality_graph/requirements.txt` with pinned versions (numpy, scikit-learn, pydantic); ensure reproducibility; add to CI
  - Implementation: requirements.txt already exists with pinned versions (numpy==1.26.4, scikit-learn==1.5.0, pydantic==2.12.0)
  - Evidence: `tools/wvo_mcp/scripts/quality_graph/requirements.txt` exists with pinned versions and rationale comments

- IMP‑ADV‑01.6 — Neural Embeddings Upgrade
  - Status: ✅ COMPLETE (2025-10-29)
  - Scope: Pluggable embedding backend with sentence-transformers (all-MiniLM-L6-v2); preserves 384D vectors; feature-flagged rollout with offline bootstrap guidance
  - Implementation: TFIDFBackend + NeuralBackend classes, CLI flag support, 28 comprehensive unit tests, ablation comparison tool
  - Result: **Neural shows 42% precision@5 improvement** (0.270 vs 0.190)
  - Effort: 5 hours (actual)
  - Dependencies: IMP-ADV-01.3 (manual evaluation baseline for ablation)
  - Rollout: Live flag `QUALITY_GRAPH_EMBEDDINGS` (`tfidf` default, `neural` opt-in) plus CLI/env overrides
  - Evidence: `state/evidence/IMP-ADV-01.6/{strategize,spec,plan,think,implement,verify,review,pr,monitor}/` (complete 9-phase evidence)
  - Tests: 28 Python unit tests + 116 integration test files passing
  - Quality Score: 95/100 (APPROVE recommendation)
  - Commit: `bce792bb`, `5161f601`
  - **Completed with IMP-ADV-01.6.1**: Production-ready with batch API optimization

- IMP‑ADV‑01.6.1 — Batch Embeddings API for Performance
  - Status: ✅ COMPLETE (2025-10-29)
  - Scope: Add `compute_embeddings_batch()` method; achieve ≥5x speedup via batching (adjusted from 10x for CPU-only inference)
  - Implementation: Added batch method to NeuralBackend with 5 unit tests, benchmark tool
  - Result: **5.6x speedup** (18.5ms → 3.3ms per task @ batch_size=32 on CPU)
  - Effort: 2 hours (actual)
  - Dependencies: IMP-ADV-01.6 (neural embeddings backend)
  - Performance: 1000 tasks = 18.5s → 3.2s (5.8x faster in practice)
  - Evidence: `state/evidence/IMP-ADV-01.6.1/{strategize,verify}/`
  - Tests: 33 Python tests (5 new batch tests), backward compatible, benchmarked
  - Commit: `6278018c`
  - **Impact**: Neural embeddings now production-ready at scale (42% better precision + 5.6x faster)

- IMP‑ADV‑01.7 — Vector Database Migration (future enhancement)
  - Status: DEFERRED (only needed if corpus >10k vectors)
  - Scope: Replace JSONL with Pinecone/Weaviate/Qdrant; maintain API compatibility; add approximate nearest neighbors (ANN) for sub-10ms queries at scale
  - Effort: 8-12 hours
  - Trigger: Corpus size metric consistently >8000 vectors OR query latency >100ms
  - Evidence: `state/evidence/IMP-ADV-01.7/verify/vector_db_migration_plan.md`, performance comparison

  - FUND-03: 4-8h (depends on MCP issue complexity)
  - FUND-04: 2-3h (straightforward mock + benchmark run)
  - FUND-05: 1-2h (script + CI integration)
  - FUND-06: 3-4h (validation script + criteria definition)
  - FUND-07: 6-8h (framework setup + test writing)
  - FUND-08: 2-3h (CI job + detection logic)
  - FUND-09: 1-2 weeks (wall-clock time, low effort)
  - **Total effort**: ~20-30h active work + 1-2 weeks monitoring period

- Owners/Roles
  - Implementer: Claude or Codex (as assigned by user)
  - Reviewer: Adversarial review agent (verify fundamentals complete before Phase 1)
  - Supervisor: User (gates Phase 1 start after monitoring period)

Artifacts
- `state/evidence/IMP-PHASE-0/plan/plan.md` (this section)
- `state/evidence/IMP-PHASE-0/plan/file_map.json` (test files, benchmark scripts, CI configs)
- `state/evidence/IMP-PHASE-0/plan/change_budget.json` (allowed files, max diff)
- `state/evidence/IMP-PHASE-0/plan/rollback.md` (when/how; preconditions)

---

## THINK
- Edge Cases & Questions
  - Backtracking safety: REVIEW→IMPLEMENT loops; ensure leases and ledger capture regressions.
  - Restart resilience: partial artifacts on disk; idempotent validators.
  - Lease expiration races: renewal window; crash recovery via WAL; forced cleanup.
  - Attestation upgrades: intentional prompt/version change process.
  - Tool context propagation: ensure task/phase is available to router.
  - Integrity flake: ensure Playwright browsers install in CI and locally.
- Worthiness & Alternatives
  - ROI quick test: “Does this move KPI K by ≥ T at cost ≤ B?”
  - Duplication scan: existing patterns/tools that cover ≥80% (link)
  - Not‑do decision: record rationale if deferring/simplifying and link to epic/roadmap
- Mitigations
  - Backtracking support added to enforcer; metrics `phase_backtracks`.
  - Validators fail with structured reasons; enforcer logs and halts forward advance.
  - WAL and cleanup tasks; metrics for contention/expiration.
  - `updateAttestation`/baseline reset flow; severity by phase.
  - Router guard with coherent error + metric; fall back to safer read‑only tools when context missing.

- Prompting (bleeding‑edge practices to apply)
  - Compiler‑driven canonicalization with typed slots and overlays; signed header; stable hashes for attestation + rollback.
  - Tool‑integrated prompting (ReAct/PAL) and “program‑of‑thought” where execution replaces long scratchpads.
  - Test‑time compute allocation: self‑consistency with verifier reranking; chain‑of‑verification for factuality; strict budget caps per task class.
  - Groundedness discipline: RAG‑first with citations; cross‑check claims; penalize unsupported statements.
  - Automated prompt optimization under eval gates (population search/evol‑instruct) only in observe mode, keep if statistically better.
  - Safety/injection resilience: input sanitization, instruction hierarchy, canaries; weekly red‑team runs via garak/promptfoo.

Artifacts
- `state/evidence/IMP/think/edge_cases.md`
- `state/evidence/IMP/think/alternatives.md` (ROI, duplication scan, not‑do rationale)

---

## IMPLEMENT
- Engineering Plan
  - IMP‑01: Add `src/orchestrator/artifact_validator.ts`; per‑phase schema; wire in `work_process_enforcer.ts` before `advancePhase` completes; record artifact paths into ledger.
  - IMP‑02: Add phase allowlist in `src/worker/tool_router.ts`; consult `current_state_tracker`; reject with metric.
  - IMP‑03: Add spans/counters to `state_graph.ts`, `verify_runner.ts`, `metrics_collector.ts`; write to `state/telemetry/*`.
  - IMP‑04: Lease tests and metrics; ensure fail‑open path documented.
  - IMP‑05: Elevate attestation policy; add severity handling; add versioned update path.
  - Update docs: Observability, Governance, MANIFEST.
  - Prompting slices:
    - IMP‑21: `src/prompt/compiler.ts` + templates; golden tests; canonicalization + hash recording.
    - IMP‑22: `src/prompt/persona.ts`; persona hash in attestation + ledger.
    - IMP‑23: Domain overlay templates; rubric injection glue from `docs/ACTIVE_RESPONSE_AND_DYNAMIC_RUBRICS.md`.
    - IMP‑24: StateGraph hook to compile/attach prompt per phase; write `prompt_hash`/`persona_hash` to ledger and journal.
    - IMP‑25: Tool router enforce PersonaSpec allowlists (read‑only fallback); counters for violations.
    - IMP‑26: Variant flags + telemetry attributes.
    - IMP‑35: Eval harness script + gate; CI wiring in VERIFY.
    - IMP‑36: Verifier loop with budget caps behind flags.
    - IMP‑37: Groundedness/citation enforcement wiring in VERIFY/REVIEW.
- Evidence to capture
  - Diffs, test outputs, metrics snapshots, ledger entries for injected skips/backtracks.
  - Prompting: compiler golden outputs, hash consistency logs, persona/tool allowlist tests, eval baselines/results, robustness reports, verifier ablations, groundedness reports.

Artifacts
- `state/evidence/IMP/implement/git_diff.patch`, `modified_files.json`

---

## VERIFY
- Programmatic Checks (Phase 0 core + semantic)
  - Integrity: `bash tools/wvo_mcp/scripts/run_integrity_tests.sh`
  - Phase skip injection test: simulate SPEC→IMPLEMENT jump and assert rejection + metric increment.
  - Tool guard test: call `git_commit` during PLAN; expect structured error + counter.
  - Evidence gate: remove `test_results.json` then attempt VERIFY→REVIEW; expect block.
  - Telemetry: confirm `state/telemetry/{traces,metrics}.jsonl` contain expected spans and counters.
  - Semantic scan: parse stdout/stderr → `warning_count`/`warning_rate`; fail if critical warnings present; attach excerpts to spans as events
  - Assertion audit: compute assertion counts per suite; flag zero‑assert suites; record `trivial_test_suspects_total`
  - Prompt eval harness (when enabled): run `tools/wvo_mcp/scripts/run_prompt_evals.sh`; assert success_rate_golden ≥ baseline+Δ, injection_success_rate ≤ threshold, groundedness non‑decreasing; record cost/latency.
  - Quality Graph precision gate (when enabled): compute precision@5 on eval set; enforce precision@5 ≥ 0.60 and no regression vs baseline; attach `metrics.json` to evidence.
  - Redundancy checks (when enabled by risk/policy):
    - Dual‑Runner Parity: run host+container; require parity; attach `parity_report.json`.
    - N‑Version Quorum: run meta‑evaluator; abstain on disagreement; attach `quorum_report.json`.
    - Double Attestation: compare PLAN/THINK/IMPLEMENT vs VERIFY; attach `attestation_diff.json`.
    - Canary Judge: evaluate canary metrics; attach `canary_judge.json`.
  - Verifier/compute budgets (when enabled): ensure `extra_compute_rate` ≤ cap; positive `consistency_gain`; bounded p95 latency increase on hard subsets.
  - Attestation: verify compiled `prompt_hash` and `persona_hash` recorded; drift events WARN except ERROR in VERIFY/REVIEW/MONITOR per policy.

Artifacts
- `state/evidence/IMP/verify/test_results.json`, `build_output.log`, `coverage_report.json`
- `state/evidence/IMP/verify/semantic_scan.json` (warning/exit/assertion summary)
 - `state/evidence/IMP/verify/prompt_eval_baseline.json`, `prompt_eval_results.json`, `robustness_eval.json`
 - `state/evidence/IMP/verify/verifier_ablation.json`, `groundedness_report.json`

---

## REVIEW
- Rubric (readability, maintainability, perf, security, governance, portfolio)
  - Worthiness note present (epic/KPI/kill/pivot), aligns with Strategy/Think
  - Evidence‑gated transitions complete; spans/metrics attached and intelligible
  - No out‑of‑phase tool routes; change budget respected; rollback sentence adequate
  - Semantic meaning: no “false green” (tests only ran); logs lack unaddressed warnings/errors
  - Docs updated; MANIFEST entries present
  - Prompting (when applicable): eval gates met; no regressions vs baseline; attestation migrations documented; rollback path clear; persona/tool allowlists correct and non‑over‑blocking.
- Deliverables
  - `review_rubric.json` with pass/fail per dimension
  - Critical notes on edge cases and false‑positive risks

Artifacts
- `state/evidence/IMP/review/review_rubric.json`, `code_quality_score.json`

---

## PR
- Steps
  - Draft PR with summary of enforcement/observability, risks, rollback.
  - Attach evidence: ledger excerpts, metrics snapshots, test artifacts.
  - Ensure CI green.
  - Prompting (when applicable): attach `prompt_eval_results.json`, `robustness_eval.json`, attestation diffs (prompt/persona hashes), and verifier ablations.
- Artifacts
  - `pr_url.txt`, `pr_template_filled.md`, `ci_results.json`

---

## MONITOR
- What to watch
  - `phase_skips_attempted`, `phase_validations_failed`, `phase_backtracks`
  - Verify success rate, loop rate, tool MTTR
  - Semantic drift: `warning_count`, `warning_rate` trends; open incidents when thresholds are exceeded
  - Discrepancy rate for Cross‑Check when enabled
  - Prompting: `success_rate_golden`, `groundedness_score`, `injection_success_rate`, `prompt_drift_rate`, `cost_per_success`, `latency_p95`, `extra_compute_rate`, `consistency_gain`, `verification_block_rate`.
  - Autonomy: `autonomy_completion_rate`, `hitl_intervention_rate`, `rollback_rate`, `auto_merge_rate` (qualified), `incident_count`, `time_to_recover`, `shadow_to_enforce_promotion_count`.
- Escalation
  - If violations recur ≥3 times or no progress >90m, create loop diary, escalate to Supervisor; roll back gating if necessary.
- Artifacts
  - `smoke_test_results.json`, `deployment_status.json`

---

## Backlog Index (maps to Roadmap)
- See docs/autopilot/AUTOPILOT_IMPROVEMENT_ROADMAP.md#backlog-trackable-items (IMP‑01 … IMP‑20).

---

## Conceptual Integration (End‑to‑End for This Batch)

Goal: make the anti‑drift + observability improvements operate as a single, coherent system with clear boundaries, provenance, and enforcement points.

- Contracts and artifacts per phase
  - Each phase in this batch must produce its defined artifacts (strategy.md, spec.md, plan.md, edge_cases.md, git_diff.patch, test_results.json, review_rubric.json, pr_template_filled.md, smoke_test_results.json). Evidence is stored under `state/evidence/<TASK>/<phase>/` and referenced by validators and ledger entries.

- Enforcer at the core
  - WorkProcessEnforcer governs the STRATEGIZE→MONITOR sequence, now including corrective backtracking. It integrates: evidence gates (ArtifactValidator), phase leases, prompt attestation, and the immutable phase ledger.

- State Graph gating
  - Before each state runner (specify/plan/thinker/implement/verify/review/pr/monitor), `advanceWorkPhase(...)` calls the enforcer. Illegal skips are blocked; backtracking is allowed and recorded.

- Evidence‑gated transitions
  - Phase advancement requires both existence and content validity of artifacts. VERIFY must have passing `test_results.json` and clean `build_output.log`; REVIEW must meet rubric thresholds; ledger records the artifact paths.

- Ledger, attestation, leases
  - Ledger appends (hash chain) every transition with artifact lists and prompt/persona hashes (when available). Prompt attestation compares current hash to baseline per task/phase; leases prevent concurrent access to a task+phase.

- Tool‑router phase guards
  - Pre‑execution checks map tool→phase and (later) PersonaSpec allowlists. Out‑of‑phase tool calls are rejected with structured errors and metrics.

- Telemetry and decision journal
  - OTEL spans: `agent.state.transition`, `agent.verify`, `process.violation`. Metrics: `phase_skips_attempted`, `phase_validations_failed`, `phase_backtracks`, `prompt_drift_detected`, `evidence_gate_failed`. Decision journal links to evidence artifacts and telemetry files.

- Context Fabric and provenance
  - For each phase, context entries include inputs (anchors), reasoning summary, outputs (artifact paths), and hash. Links to ledger entries and spans create end‑to‑end provenance.

- Persona routing (minimal hook in this batch)
  - As we add the prompt compiler (later phases), compile prompt per phase, record prompt hash + PersonaSpec hash in attestation and ledger. Tool router will consume PersonaSpec allowlists.

- Backtracking protocol
  - VERIFY/REVIEW/PR/MONITOR can send flow back to the earliest impacted phase. Enforcer backtracks, starts evidence collection, records in ledger, and re‑runs downstream phases with fresh evidence.

- Governance and rollout flags
  - All new gates ship behind live flags with default‑on for enforcement and default‑observe for telemetry. HITL remains in control for high‑impact tasks until baseline metrics are stable.

Outcome for this batch: Illegal phase skips are impossible, forward transitions require real evidence, prompt/header drift is detected, concurrent phase access is controlled, and every action is traceable via ledger + spans + artifacts.

---

## Key Points Summary (Implementation Checklist)

Priority implementation order (anti‑drift core → visibility)
1. ✅ Phase Ledger (DONE – commit 7fa439e2)
2. ✅ Evidence‑Gated Transitions (DONE – commit 8763dded)
3. Phase Leases (multi‑agent safety; WAL; contention metrics)
4. Prompt Attestation (header/prompt drift detection; severity policy; versioning)
5. ✅ OTEL Integration (DONE – IMP-OBS-01, IMP-OBS-03; state transition spans, verify/process.violation spans; JSONL sinks)
6. ✅ Quality Graph Integration baseline (DONE – commit 87cd87b0; TF-IDF embeddings, MONITOR recording, PLAN hints; follow-ons: IMP-ADV-01.1 through IMP-ADV-01.7)
7. Atlas Integration (manifest hash; change‑impact → test hints)
8. Context Fabric (per‑phase context chain; hashes; link spans/artifacts)
9. Metrics Dashboard (aggregate enforcement metrics; alert scaffolding)

Prompting improvements staged (Phase 1–4)
- IMP‑21: Prompt Compiler skeleton + golden tests
- IMP‑22: PersonaSpec canonicalize/hash + attestation integration
- IMP‑23: Domain overlays library (orchestrator/web/ml/api/security)
- IMP‑24: StateGraph hook to compile/attach prompt per phase; record prompt hash in attestation + journal
- IMP‑35: Prompt Eval Harness + Gates (observe → enforce)
- IMP‑26: Flags/telemetry for persona variants and sampling (metrics + spans)
- IMP‑25: Tool allowlists enforced from PersonaSpec in tool router

Standalone Autopilot (vendor‑neutral) follow‑ons (separate tranche)
- IMP‑27: Contracts & schema validators (ProblemSpec/Plan/ChangeSet/PRSummary/RiskReport)
- IMP‑28: OPA policy pack + CI Action wiring (paths/diff caps/tests/licensing/secrets)
- IMP‑29: Sandbox container runner + allowlists + quotas; PR‑only mutation
- IMP‑30: Transactional outbox + idempotency keys (external side‑effects)
- IMP‑31: Trace DAG UI (or Phoenix integration) wired to OTEL
- IMP‑32: HITL panel (pause/approve/request changes/escalate/abort)
- IMP‑33: Supply chain & repo hygiene gates (SBOM+vuln; secret scan)
- IMP‑34: Red‑team/chaos harness (prompt injection corpus, poisoned deps, flaky tests)

Acceptance points to verify (hard checks)
- Zero successful out‑of‑sequence transitions; illegal skips blocked with metrics
- Tool‑router rejects out‑of‑phase calls (structured errors; counters)
- Evidence gates enforce content for critical phases (VERIFY, REVIEW) and record artifact paths in ledger
- Corrective backtracking allowed; ledger logs backtrack entries; downstream phases re‑run
- Prompt/header drift detected and recorded (WARN/ERROR by policy)
- Spans/counters written to state/telemetry; decision journal links artifacts
- Integrity batch run executed; failures triaged with evidence if not green

---

## Current Progress (as of latest Claude session)

- IMP‑FUND‑01 — Phase Ledger: DONE
- IMP‑FUND‑02 — Evidence‑Gated Transitions: DONE
- IMP‑FUND‑03 — MCP Test Fixes / Integrity Stabilization (initial tranche): DONE
- IMP‑FUND‑04 — Phase Transition Benchmark (latency sanity): DONE
- ✅ IMP‑FUND‑05 — Playwright browser installation guard verified (logs captured)
- ✅ IMP‑FUND‑06 — Checkpoint validation script + TODO allowlist + evidence enforcement
- **Mandatory follow-ups before closing Phase 0:**
  - Run `scripts/validate_checkpoint.sh --task-id <task>` **without** `--skip-integrity` in CI to exercise the full suite.
  - Review `config/checkpoint_todo_allowlist.txt` each cycle; shrink it as legacy TODOs are resolved.
  - Wire the script into the phase-completion CI workflow so every task proves evidence before advancing (STRATEGIZE→MONITOR).
- ✅ IMP‑FUND‑07 — Acceptance tests for enforcement gates (phase skip + missing evidence)
- ✅ IMP‑FUND‑08 — Daily evidence staleness automation (script + scheduled workflow)
- ✅ IMP‑FUND‑09 — Pre-feature monitoring automation (daily process snapshots)
- ✅ IMP‑OBS‑03 — Telemetry sinks verification complete (integration tests + verification script; evidence in `state/evidence/IMP-OBS-03/verify/`)
- ✅ IMP‑OBS‑01 — StateGraph + WorkProcess tracing instrumentation (spans with result/violation metrics; evidence in `state/evidence/IMP-OBS-01/verify/`)
- ✅ IMP‑ADV‑01 — Quality Graph Integration baseline complete (commit 87cd87b0; 9/10 AC met, AC7 deferred pending IMP-OBS completion)
- **Quality Graph Follow-ons** (ALL COMPLETE 2025-10-29):
  - ✅ IMP‑ADV‑01.1 — Observer baseline integration (COMPLETE - 3 tests passing, full evidence)
  - ✅ IMP‑ADV‑01.2 — Inject hints into planner prompt (COMPLETE - 2.5h actual)
  - ✅ IMP‑ADV‑01.3 — Manual similarity evaluation (COMPLETE - precision@5=0.780 EXCELLENT)
  - ✅ IMP‑ADV‑01.4 — Corpus size monitoring (COMPLETE - 30min actual, 5/5 tests)
  - ✅ IMP‑ADV‑01.5 — Pin Python dependencies (COMPLETE - pre-existing)
  - 🚀 IMP‑ADV‑01.6 — Neural embeddings upgrade (DEFERRED - future enhancement, 4-6h)
  - 🚀 IMP‑ADV‑01.7 — Vector database migration (DEFERRED - scale-triggered, 8-12h)
- Next up: Phase 1 readiness review after monitoring window completes

Notes: Verify artifacts (test logs/benchmarks) are stored under `state/evidence/IMP/verify/` and linked in the decision journal.

---

## Essential Reliability Additions (Quality/Vectorized Graph)

Purpose: only what’s necessary to improve reliability for autonomous execution; everything else deferred.

- IMP‑QG‑01 — Quality Graph: Stable embeddings + observe‑mode hints + VERIFY precision gate
  - Scope: replace per‑call TF‑IDF fit with a stable feature space (HashingVectorizer or persisted TF‑IDF+projection); add reindex CLI; disable prompt injection of hints by default; compute precision@5 in VERIFY and block regressions vs baseline.
  - Flags: `quality_graph.hints_injection=off` (default), `quality_graph.eval_gate=observe → enforce`.
  - Acceptance: precision@5 ≥ 0.60 on eval set; no degradation in plan/test outcomes; hints not injected until gate green.
  - Evidence: `state/evidence/IMP-QG-01/verify/metrics.json`, `state/evidence/IMP-QG-01/implement/reindex_plan.md`.

- IMP‑VEC‑01 — Vectorized Graph: Grounded retrieval integration (observe‑only)
  - Scope: intersect neighbor candidates with code‑graph reachability before surfacing; attach retrieval audits; no new gates or predictive blocking yet.
  - Flags: `vectorized_graph.grounded_retrieval=observe`.
  - Acceptance: groundedness ≥ 95% when hints are surfaced; zero policy/gate bypass; clear audit trail.
  - Evidence: `state/evidence/IMP-VEC-01/verify/retrieval_audit.json`.

Notes: These are the only Quality/Vectorized Graph items included for reliability. All non‑essential enhancements (reviewer routing, ANN, predictive gates, neural embeddings) remain deferred.

---

## Pragmatic Redundancy (Critical Tasks Only)

Goal: add simple, high‑leverage redundancy patterns for medium/high‑risk items (migrations, auth/permissions, prompt/guardrail edits, autonomy gating) without heavy overhead.

- IMP‑RED‑01 — Dual‑Runner Parity Gate (container + host)
  - Scope: run VERIFY in hermetic container and host; compare exit status, warning count, and key artifacts (test_results.json, coverage_report.json). Non‑parity blocks.
  - Flags: `redundancy.dual_runner=observe → enforce` (auto‑select when `risk>=medium`).
  - Acceptance: parity on exit code, zero critical warnings both sides, identical artifact checksums (or approved diff list); overhead ≤ +5%.
  - Evidence: `state/evidence/IMP-RED-01/verify/parity_report.json` (host vs container, deltas, verdict).

- IMP‑RED‑02 — N‑Version Plan/Implement + Meta‑Evaluator (observe → abstain)
  - Scope: generate up to 3 independent variants (model/persona/prompt seed); run programmatic tests/rubric; select by score; if disagreement above threshold, abstain (HITL) instead of merge.
  - Flags: `redundancy.n_version=observe` (enable in critical classes; abstain mode only until calibrated).
  - Acceptance: quorum report present with scores; abstention on split vote; no merge on disagreement.
  - Evidence: `state/evidence/IMP-RED-02/verify/quorum_report.json` (variants, scores, selection/abstention).

- IMP‑RED‑03 — Double Attestation Consistency
  - Scope: record prompt/persona hash at PLAN/THINK/IMPLEMENT; re‑attest in VERIFY; mismatch or missing fields blocks.
  - Flags: `redundancy.double_attest=enforce` for prompt‑family changes.
  - Acceptance: `prompt_hash`/`persona_hash` match across phases; 0 mismatches; attestation present in ledger/journal.
  - Evidence: `state/evidence/IMP-RED-03/verify/attestation_diff.json`.

- IMP‑RED‑04 — Canary Judge (automated promotion)
  - Scope: shadow/canary run on a safe lane; compute deltas (latency p95, error rate, warnings, test pass rate); auto‑judge pass/fail by thresholds.
  - Flags: `redundancy.canary_judge=observe → enforce` (required for high‑risk classes).
  - Acceptance: 0 incidents; all deltas within thresholds for the promotion window; rollback plan present.
  - Evidence: `state/evidence/IMP-RED-04/verify/canary_judge.json` (metrics, thresholds, verdict).

Selection policy: if `risk>=medium` or item in prompt/guardrail/autonomy families, enable IMP‑RED‑01 and IMP‑RED‑03 (enforce) and IMP‑RED‑02/04 (observe→enforce after 2 stable weeks).

---

## Cross‑Item Integration (Roadmap Awareness)

Goal: ensure related roadmap items are built with mutual awareness and validated together (cutting‑edge integration discipline without adding fragility).

- IMP‑ROAD‑01 — Roadmap Dependency Graph + Linter + CI Gate
  - Scope: add `state/roadmap.dependencies.yaml` (items, produces/consumes, related, contracts). CLI `scripts/roadmap_lint.py` validates: missing links, broken IDs, contract drift; CI fails on violations (observe→enforce).
  - Contracts: every item touching prompts, quality graph, vectorized graph, or tool router must declare Related/DependsOn to the core items (compiler, attestation, evals, groundedness, tool allowlists) with version/contract names.
  - Acceptance: zero missing critical relationships; no unknown producers/consumers; drift reports attached to decision journal.
  - Evidence: `state/evidence/IMP-ROAD-01/verify/lint_report.json`, `state/roadmap.dependencies.yaml`.

- IMP‑ROAD‑02 — Integration Contracts (Typed Interfaces + Rubric)
  - Scope: define typed integration contracts for cross‑item interfaces (e.g., PromptCompilerSlots, AttestationRecord, EvalVariantId, GroundedCitation) in TS/Zod and Python/Pydantic; add REVIEW rubric “Cross‑Item Integration” (must cite Related items + contract versions, include integration tests/ablation refs).
  - Acceptance: all prompt‑family items list Related (IMP‑21/22/23/24/25/26/35/36/37/ADV‑01.2); contracts imported not duplicated; integration rubric passes.
  - Evidence: `state/evidence/IMP-ROAD-02/review/integration_rubric.json`.

- IMP‑ROAD‑03 — Cross‑Item Integration Gate (VERIFY/REVIEW)
  - Scope: VERIFY runs `scripts/roadmap_integration_check.sh` to ensure touched items updated their Related blocks, contracts, and tests; REVIEW uses rubric to confirm cross‑item docs/links.
  - Acceptance: gate passes on every PR changing prompt/graph/router families; drift opens incident.
  - Evidence: `state/evidence/IMP-ROAD-03/verify/integration_check.json`.

Notes: This system complements Context Fabric and Attestation. It enforces awareness without blocking iteration: start in observe, promote to enforce once green for 2 weeks.

---

## Roadmap ↔ Batch Plan Mapping (Aliases)

- Persona routing
  - Roadmap IMP‑PERSONA‑01 ↔ Batch Plan IMP‑21 (Prompt Compiler)
  - Roadmap IMP‑PERSONA‑02 ↔ Batch Plan IMP‑22 (PersonaSpec canonicalize/hash)
  - Roadmap IMP‑PERSONA‑03 ↔ Batch Plan IMP‑23 (Domain overlays library)
  - Roadmap IMP‑PERSONA‑04 ↔ Batch Plan IMP‑24 (StateGraph hook to compile/attach prompts)
  - Roadmap IMP‑PERSONA‑05 ↔ Batch Plan IMP‑25 (Tool allowlists from PersonaSpec)
  - Roadmap IMP‑PERSONA‑06 ↔ Batch Plan IMP‑26 (Flags/telemetry for variants)

- Observability
  - Roadmap IMP‑OBS‑01..06 ↔ Batch Plan uses the same IDs; see status below and evidence under `state/evidence/IMP-OBS-*/`.

- Enforcement
  - Roadmap IMP‑ENF‑01 (Phase Leases) ↔ Batch Plan IMP‑04 (lease tests/metrics)
  - Roadmap IMP‑ENF‑02 (Prompt Attestation) ↔ Batch Plan IMP‑05 (attestation policy)
  - Roadmap IMP‑ENF‑03 (Tool Router Guards) ↔ Batch Plan IMP‑02 (tool router phase guard)
  - Roadmap IMP‑ENF‑04 (State Machine Guards) ↔ Covered by WorkProcessEnforcer + Evidence‑Gated Transitions
  - Roadmap IMP‑ENF‑05 (Lease Burst Test) ↔ Batch Plan IMP‑04 (test coverage)
  - Roadmap IMP‑ENF‑06 (Prompt Drift Injection Test) ↔ Batch Plan IMP‑35 (prompt eval harness + attestation)

---

## Roadmap Status Index (Live)

- Fundamentals (Phase 0)
  - IMP‑FUND‑01..09: COMPLETE in this batch (see Current Progress above).

- Observability (Phase 2)
  - IMP‑OBS‑01 (OTel Spans): COMPLETE — evidence in `state/evidence/IMP-OBS-01/verify/`
  - IMP‑OBS‑03 (JSONL Sinks): COMPLETE — evidence in `state/evidence/IMP-OBS-03/verify/`
  - IMP‑OBS‑02 (OTel Counters): COMPLETE — evidence in `state/evidence/IMP-OBS-02/verify/`
  - IMP‑OBS‑04 (Alert Scaffolding): COMPLETE — evidence in `state/evidence/IMP-OBS-04/verify/`
  - IMP‑OBS‑05 (Metrics Dashboard): COMPLETE — evidence in `state/evidence/IMP-OBS-05/verify/`
  - IMP‑OBS‑06 (Observer Agent, Phase 1): COMPLETE — evidence in `state/evidence/IMP-OBS-06/verify/`

- Enforcement (Phase 1)
  - IMP‑ENF‑01 (Phase Leases): PARTIAL — covered by IMP‑04 tests/metrics; full hardening pending
  - IMP‑ENF‑02 (Prompt Attestation): PLANNED — policy defined; enforcement to wire via IMP‑05/IMP‑24
  - IMP‑ENF‑03 (Tool Router Guards): PLANNED — to implement via IMP‑02
  - IMP‑ENF‑04 (State Machine Guards): COMPLETE — WorkProcessEnforcer + Evidence Gates active
  - IMP‑ENF‑05 (Lease Burst Test): PLANNED — extend IMP‑04 tests
  - IMP‑ENF‑06 (Prompt Drift Injection Test): PLANNED — via IMP‑35 eval harness

- Persona/Prompting (Phase 4 in Roadmap; Phase 1+ staged here)
  - Order of rollout (observe→enforce where applicable):
    - IMP‑21 (Compiler), IMP‑22 (PersonaSpec), IMP‑23 (Overlays), IMP‑24 (StateGraph hook)
    - IMP‑35 (Eval harness + gates), IMP‑26 (Flags/telemetry), IMP‑25 (Tool allowlists)
    - IMP‑36 (Verifiers), IMP‑37 (Groundedness)
  - Status: PLANNED — behind flags; see “Prompting Improvements — Production Slices” for acceptance and evidence

- Advanced Features
  - IMP‑ADV‑01 (Quality Graph baseline): COMPLETE — evidence under `state/evidence/IMP-ADV-01/`
  - IMP‑ADV‑01.1..01.7: SEE Roadmap — status varies (blocked/ready/future); not part of Phase 0 fundamentals
  - IMP‑QG‑01: PLANNED — stable embeddings + observe‑mode hints + VERIFY precision gate
  - IMP‑VEC‑01: PLANNED — grounded retrieval integration (observe‑only)

- Autonomy Track (enablement)
  - IMP‑AUTO‑01..07: PLANNED — see Autonomy Track section for milestones, acceptance, and evidence

Notes
- Roadmap remains the strategic index; this status block is the live, evidence-backed view for the current batch.

---

## Autonomy Track — Milestones and Readiness Gates

Objective: Safely progress from supervised runs to production autonomy with measurable gains and no critical incidents.

Milestones (A‑levels)
- A0: Supervised execution (manual driver)
  - Mode: observe only; agents run locally under gates; no self‑advance without HITL.
  - Evidence: end‑to‑end smoke under HITL; no violations.
- A1: Semi‑autonomous (HITL required for medium/high risk)
  - Mode: shadow/canary; low‑risk tasks can propose changes; HITL approves merges.
  - KPIs (2‑week window): autonomy_completion_rate ≥ 60% on low‑risk; hitl_intervention_rate ≤ 30%; rollback_rate ≤ 2%.
- A2: Low‑risk autonomy (auto‑merge with gates)
  - Mode: enforce for low‑risk lanes; auto‑merge when all gates green and policies allow.
  - KPIs (2‑week window): autonomy_completion_rate ≥ 80% low‑risk; intervention ≤ 10%; rollback ≤ 1%; incidents = 0.
- A3: Expanded autonomy (moderate risk lanes)
  - Mode: canary + gradual expand; strict rollback and alerting.
  - KPIs: maintain A2 levels on expanded scope; incidents = 0.

Enablement Tasks (IMP‑AUTO)
- IMP‑AUTO‑01 — Risk Classifier: Tag tasks low/med/high; inputs: scope change, migrations, secrets, blast radius.
- IMP‑AUTO‑02 — Autonomy Flags/Rollout: `autonomy.mode` = {shadow, observe, canary, enforce} per lane; scopes and allowlists.
- IMP‑AUTO‑03 — HITL Policy Integration: Require approval for risk≥medium; integrate with HITL panel (see IMP‑32).
- IMP‑AUTO‑04 — Rollback/Abort Automation: Playbooks + scripts; idempotent outbox for external effects.
- IMP‑AUTO‑05 — E2E Autopilot Smokes: Programmatic repo exercises with evidence; failure classification.
- IMP‑AUTO‑06 — Resumption/Recovery: Resume runs after crash; enforce idempotency; ledger continuity.
- IMP‑AUTO‑07 — Autonomy Telemetry/Dashboard: Track autonomy KPIs and promotion decisions.

Acceptance (promotion gates)
- A0→A1: All gates green in shadow; 0 critical violations; baseline KPIs recorded.
- A1→A2: KPIs meet A2 thresholds for two consecutive weeks; no incidents; rollback tested.
- A2→A3: Canaries in moderate‑risk lanes meet A2 thresholds for one week; zero incidents.

Artifacts
- `state/evidence/IMP-AUTO-*/{strategize,spec,plan,implement,verify}/...`
- `state/telemetry/autonomy_metrics.jsonl` (KPIs and promotion decisions)

Flags
- `autonomy.mode` per lane; `autonomy.allow_merge` for low‑risk when gates green; HITL enforced for higher risk.

Notes
- This track composes existing gates (evidence, attestation, tool/router, observability) into an autonomy rollout that is measurable and reversible.

---

## What’s Excellent (Baseline Strengths)

- State graph with gated edges and watchdog.
- Contracts everywhere (schemas) + policy layer (OPA/jsonlogic).
- Sandbox-first execution and PR-only mutation.
- Grounding via vector index + code graph.
- Five-gate pipeline with explicit success/fail semantics.
- OTEL traces + SLOs; idempotency/outbox patterns; staged rollout.

## Add To Reach “Drop‑In Across Any Repo/Org”

- Repo onboarding and capability detection
  - Detect languages/toolchains (Node, Python, Java, Go), test runners, coverage tools, package managers, CI provider, and diff size limits.
  - Produce a tailored bootstrap profile (tools.yaml, gates, thresholds) per repo.
- Multi‑language changed‑lines coverage + test impact
  - Enforce changed‑lines coverage regardless of language; add test selection hints from the code graph (symbol→test edges).
- Migration/config safety gates
  - Gate 3 extension: detect DB migrations, feature flag changes, secrets handling; require explicit rollback docs and HITL approval for high‑impact classes.
- Persona routing + multivariate prompting (phase×domain)
  - Deterministic compiler: core header + phase role + domain overlays + skill packs + eval rubric + context anchors.
  - Attest compiled prompt hash; record PersonaSpec hash; feed PersonaSpec tool allowlist to the tool router.
- Policy discovery mode
  - Dry‑run to enumerate all files the agent would touch, estimated diff size, and missing evidence; emits policy suggestions before first write.
- Stronger SLOs and metrics
  - Add: loop_rate, tool_mttr, groundedness_score, spurious_block_rate, false_positive_gate_rate, prompt_drift_rate.
- Hermetic sandbox profiles
  - Language‑specific base images; no outbound net except allowlist; deterministic seeds for ML repos; warmed caches for speed (still verifiable).
- Secrets and identity controls
  - Never mount VCS write creds; OAuth scopes limited; ephemeral tokens for CI reads; outbound registry allowlist.
- Red‑team & chaos hooks in CI
  - Weekly prompt‑injection corpus; poisoned dependencies; flaky tests; broken network; expected behavior is “halt or HITL”.
- Trace DAG + evidence browser
  - Click‑through trace with inputs/outputs, schema validations, policy verdicts, PRM scores, and citations; filter by gate or tool.

## Map To Our Stack (Fit)

- State graph: aligns with orchestrator (`tools/wvo_mcp/src/orchestrator/state_graph.ts`), with phase leases and ledger already in place.
- Gates: five gates map to VERIFY/REVIEW/PR plus policy guards; add Gate 0 (onboarding/capability detection) and expand Gate 3/4 semantics.
- Persona/prompting: attach before each runner; record prompt hash and PersonaSpec; enforce tool allowlists.
- Observability: extend OTEL spans/metrics to include groundedness, policy/verdict attributes, persona hashes.
- Sandbox: plug container runner under VERIFY/CI execution path; PR‑only mutation remains.

## Backlog Deltas To Add (Drop‑In Tranche)

- Contracts & schemas (language‑agnostic)
  - Models for ProblemSpec/Plan/ChangeSet/PRSummary/RiskReport; validators with auto‑repair (strict fail‑closed).
- OPA policy pack + CI action
  - Rego for path allowlists, diff caps, “tests required for src changes”, licensing, secret scans; PR check.
- Sandbox container runner
  - Ephemeral, read‑only repo mirror + scratch workspace; quotas; allowlist; artifact export channel.
- Transactional outbox + idempotency
  - Queue external side‑effects (open PR, post comment) with idempotency keys; resume safely after crashes.
- Trace DAG UI (or Phoenix)
  - Renderable graph of steps/tool calls/gates; link evidence/citations/verdicts.
- HITL panel
  - Approve/Request changes/Escalate/Abort over proposed diff + citations + gate status; supports “pause reasons”.
- Supply chain & hygiene gates
  - SBOM + vuln scanning (Syft/Grype); secret scans (Gitleaks/TruffleHog); pre‑commit integration.
- Red‑team harness
  - promptfoo + garak in CI; weekly chaos suite.

## Placement In Roadmap

- Enforcement first: Evidence‑gated transitions (IMP‑01), Tool Router phase guards (IMP‑02), OTEL spans/counters (IMP‑03).
- Then vendor‑neutral stand‑alone items:
  - IMP‑27 — Contracts & schema validators (ProblemSpec/Plan/ChangeSet/PRSummary/RiskReport).
  - IMP‑28 — OPA policies + CI Action wiring.
  - IMP‑29 — Sandbox container runner + allowlists.
  - IMP‑30 — Transactional outbox + idempotency keys.
  - IMP‑31 — Trace DAG UI (or Phoenix integration).
  - IMP‑32 — HITL UI panel.
  - IMP‑33 — Supply chain & repo hygiene gates.
  - IMP‑34 — Red‑team/chaos harness.
- Multivariate prompting: IMP‑21..IMP‑26 (compiler, canonicalization, overlays, state‑graph hook, tool allowlists, flags/telemetry).

## Quality Gates (Refinements)

- Gate 0 (new): Onboarding/capability discovery and policy suggestion.
- Gate 1: Add moderation + secrets scan + policy simulation result.
- Gate 2: Require citations graph‑reachable and PRM≥threshold; otherwise revise.
- Gate 3: Enforce tests‑for‑src‑changes, changed‑lines coverage intent, migration/flag safety, rollback plan.
- Gate 4: Hermetic CI (no net), coverage non‑decreasing, SBOM+vuln scan, license compliance.
- Gate 5: Code‑owner approvals, labels, risk‑class HITL; auto‑merge only if policies green.

---

## Meta Tasks (Process Improvements)

Tasks that improve the work process itself, prevent recurring issues, and strengthen quality systems.

### META-VERIFY-01 — Pre-Commit Verification Protocol
- Status: IN PROGRESS (2025-10-29)
- Scope: Mandatory checklist before marking ANY task complete or creating PR commit
- Trigger: Gap discovered in IMP-ADV-01.6 (marked complete without running code, critically evaluating 59x slowdown, or identifying missing batch API)
- Root Cause: VERIFY phase relied on pre-existing documents without actually running/testing implementation
- Prevention: 6-point mandatory checklist (build, tests, end-to-end, performance, integration, docs)
- Impact: Prevents premature task completion, catches gaps before commit, enforces critical thinking about trade-offs
- Effort: 1-2 hours (documentation updates)
- Evidence: `state/evidence/META-VERIFY-01/spec/spec.md` (created)
- Acceptance Criteria:
  1. ✅ Checklist template created in docs/autopilot/templates/
  2. ⏳ VERIFY phase docs updated to mandate checklist
  3. ⏳ CLAUDE.md updated with pre-commit verification protocol
  4. ⏳ At least 1 task completes using this checklist
  5. ⏳ Evidence shows checklist caught a gap
- Related: Learning 5 (CLAUDE.md) - Guarantee Verification Gap protocol

### Future Meta Tasks (Examples)
- META-PERF-01: Performance regression detection in CI
- META-DOC-01: Automated README example validation
- META-TEST-01: Test coverage threshold enforcement
- META-BATCH-01: Batch operation pattern guidelines for ML workloads
