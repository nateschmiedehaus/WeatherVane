# Autopilot Improvement Batch — Full Work Process Plan

This plan applies the full STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR process to the Anti‑Drift + Observability improvements. It is the canonical document to organize, track, and prove completion of this batch.

Artifacts for each phase are enumerated and must be produced under `state/evidence/<TASK-ID>/<phase>/...` or linked herein.

---

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
- KPIs
  - Success ≥95%, loop ≤2%, tool MTTR ≤30s (observability SLOs recorded).
  - phase_skips_attempted: 0; tasks_rejected_for_process_violation: ≥1 if tests inject skips (proves guard works).

Artifacts
- `state/evidence/IMP/spec/spec.md` (criteria + KPIs)

---

## PLAN
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
  - ⏳ **IMP-FUND-05**: Playwright Browser Installation
    - Script: Guard script to ensure browsers installed before tests
    - CI: Verification job
    - Docs: Update test running instructions
  - ⏳ **IMP-FUND-06**: Checkpoint Validation Scripts
    - Script: `scripts/validate_checkpoint.sh` - verify "verifiably complete" criteria
    - Checks: All tests pass, build succeeds, no TODOs in production code, evidence docs up-to-date
    - Integration: Run in CI after each phase completion claim
  - ⏳ **IMP-FUND-07**: Acceptance Test Framework
    - Tests: End-to-end enforcement validation (inject phase skips, verify rejection)
    - Framework: `tests/acceptance/` directory structure
    - Coverage: All enforcement mechanisms validated end-to-end
  - ⏳ **IMP-FUND-08**: Daily Evidence Update Automation
    - CI job: Update evidence docs daily based on git activity
    - Detection: Identify changed files → update corresponding evidence docs
    - Verification: Evidence docs never more than 24h stale
  - ⏳ **IMP-FUND-09**: Pre-Feature Monitoring Period
    - Duration: 1-2 weeks
    - Metrics: phase_skips_attempted, phase_backtracks, prompt_drift_detected, evidence_gate_failed
    - Baseline: Establish normal operating ranges
    - Decision: Only proceed to Phase 1 if metrics stable

- Dependencies
  - **Sequential**: FUND-03 → FUND-04 → FUND-05 (test fixes before benchmarks before browser setup)
  - **Sequential**: FUND-06 → FUND-07 → FUND-08 (validation scripts before acceptance tests before automation)
  - **Blocking**: ALL Phase 0 tasks MUST complete before ANY Phase 1 work

- Estimates
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

---

## THINK
- Edge Cases & Questions
  - Backtracking safety: REVIEW→IMPLEMENT loops; ensure leases and ledger capture regressions.
  - Restart resilience: partial artifacts on disk; idempotent validators.
  - Lease expiration races: renewal window; crash recovery via WAL; forced cleanup.
  - Attestation upgrades: intentional prompt/version change process.
  - Tool context propagation: ensure task/phase is available to router.
  - Integrity flake: ensure Playwright browsers install in CI and locally.
- Mitigations
  - Backtracking support added to enforcer; metrics `phase_backtracks`.
  - Validators fail with structured reasons; enforcer logs and halts forward advance.
  - WAL and cleanup tasks; metrics for contention/expiration.
  - `updateAttestation`/baseline reset flow; severity by phase.
  - Router guard with coherent error + metric; fall back to safer read‑only tools when context missing.

Artifacts
- `state/evidence/IMP/think/edge_cases.md`

---

## IMPLEMENT
- Engineering Plan
  - IMP‑01: Add `src/orchestrator/artifact_validator.ts`; per‑phase schema; wire in `work_process_enforcer.ts` before `advancePhase` completes; record artifact paths into ledger.
  - IMP‑02: Add phase allowlist in `src/worker/tool_router.ts`; consult `current_state_tracker`; reject with metric.
  - IMP‑03: Add spans/counters to `state_graph.ts`, `verify_runner.ts`, `metrics_collector.ts`; write to `state/telemetry/*`.
  - IMP‑04: Lease tests and metrics; ensure fail‑open path documented.
  - IMP‑05: Elevate attestation policy; add severity handling; add versioned update path.
  - Update docs: Observability, Governance, MANIFEST.
- Evidence to capture
  - Diffs, test outputs, metrics snapshots, ledger entries for injected skips/backtracks.

Artifacts
- `state/evidence/IMP/implement/git_diff.patch`, `modified_files.json`

---

## VERIFY
- Programmatic Checks (examples)
  - Integrity: `bash tools/wvo_mcp/scripts/run_integrity_tests.sh`
  - Phase skip injection test: simulate SPEC→IMPLEMENT jump and assert rejection + metric increment.
  - Tool guard test: call `git_commit` during PLAN; expect structured error + counter.
  - Evidence gate: remove `test_results.json` then attempt VERIFY→REVIEW; expect block.
  - Attestation drift: mutate headers; expect detection; policy by phase.
  - Lease contention: spawn dual workers targeting same task+phase; assert one blocked.
  - Telemetry: confirm `state/telemetry/{traces,metrics}.jsonl` contain expected spans and counters.

Artifacts
- `state/evidence/IMP/verify/test_results.json`, `build_output.log`, `coverage_report.json`

---

## REVIEW
- Rubric (readability, maintainability, perf, security, governance)
  - Evidence‑gated transitions complete
  - No out‑of‑phase tool routes
  - Spans/metrics attached and intelligible
  - Docs updated; MANIFEST entries present
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
- Artifacts
  - `pr_url.txt`, `pr_template_filled.md`, `ci_results.json`

---

## MONITOR
- What to watch
  - `phase_skips_attempted`, `phase_validations_failed`, `phase_backtracks`, `prompt_drift_detected` trends
  - Verify success rate, loop rate, tool MTTR
  - Discrepancy rate for Cross‑Check when enabled
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
2. Evidence‑Gated Transitions (block forward progress without artifacts; ledger records paths)
3. Phase Leases (multi‑agent safety; WAL; contention metrics)
4. Prompt Attestation (header/prompt drift detection; severity policy; versioning)
5. OTEL Integration (state transition spans, verify/process.violation spans; JSONL sinks)
6. Quality Graph Integration (minimal vectors; observer hints)
7. Atlas Integration (manifest hash; change‑impact → test hints)
8. Context Fabric (per‑phase context chain; hashes; link spans/artifacts)
9. Metrics Dashboard (aggregate enforcement metrics; alert scaffolding)

Persona routing and multivariate prompting (Phase 4 adds)
- IMP‑21: Prompt Compiler skeleton + golden tests
- IMP‑22: PersonaSpec canonicalize/hash + attestation integration
- IMP‑23: Domain overlays library (orchestrator/web/ml/api/security)
- IMP‑24: StateGraph hook to compile/attach prompt per phase; record prompt hash in attestation + journal
- IMP‑25: Tool allowlists enforced from PersonaSpec in tool router
- IMP‑26: Flags/telemetry for persona variants and sampling (metrics + spans)

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
