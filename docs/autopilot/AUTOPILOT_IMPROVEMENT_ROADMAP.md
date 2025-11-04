# Autopilot Improvement Roadmap — Anti-Drift + Observability Batch

Scope: This roadmap sequences the enforcement and visibility work discussed, with priorities, subphases, and acceptance criteria. Applies to Unified Autopilot and standalone agents using the same work process.

Related work process plan: see docs/autopilot/IMPROVEMENT_BATCH_PLAN.md

## Priority Order (Reality-Based)

**Phase 0: Fundamentals (REQUIRED FIRST)**
1. ✅ Phase Ledger (DONE – commit 7fa439e2)
2. ✅ Evidence-Gated Transitions (DONE – commit 8763dded)
3. ✅ MCP Test Fixes (DONE – 3 tests fixed, all passing)
4. ✅ Phase Transition Benchmark (DONE – all latencies <2ms, 98% under target)
5. ⏳ Integrity Stabilization (Playwright browser installation guard)
6. ⏳ Evidence-Driven Process Infrastructure (checkpoint validation, acceptance tests, CI gates)
7. ⏳ Pre-Feature Monitoring Period (1-2 weeks baseline metrics)

**Phase 1: Enforcement Hardening (After fundamentals stable)**
6. Phase Leases (Multi-agent safety)
7. Prompt Attestation (Drift detection)
8. Tool Router Phase Guards (Pre-execution rejection)
9. State Machine Guards (Illegal transition prevention)

**Phase 2: Observability (After enforcement proven)**
10. OTEL Integration (Spans, counters, sinks)
11. Metrics Dashboard (Aggregate enforcement metrics)
12. Observer Agent (Phase 1 - read-only notes)

**Phase 3: Advanced Features (After monitoring works)**
13. Quality Graph Integration (Vector tracking)
14. Atlas Integration (Impact analysis)
15. Context Fabric (Provenance tracking)
16. Cross-Check (Phase 3 - sampling re-run)

**Phase 4: Persona Routing (After core stable)**
17. Prompt Compiler skeleton + golden tests
18. PersonaSpec canonicalization + hash integration
19. Domain overlays library (orchestrator/web/ml/api/security)
20. StateGraph hook for prompt compilation per phase
21. Tool allowlist enforcement from PersonaSpec
22. Flags/telemetry for persona variants + sampling

## Breakdown by Item

2) Evidence-Gated Transitions
- Subphases:
  - Define per-phase artifact schema (required/optional) + content checks
  - Implement `ArtifactValidator` and wire to enforcer before phase advance
  - Record validated artifact paths in ledger entries
  - Tests: block on missing/invalid artifacts; allow on valid
- Acceptance:
  - VERIFY blocks without passing `test_results.json` and clean build logs
  - REVIEW blocks with rubric score < threshold
  - Ledger entries include `artifacts` list

3) Phase Leases
- Subphases:
  - Schema migration + WAL config (SQLite)
  - Acquire/release/renew paths, contention metrics
  - Graceful fail-open for single-agent runs
- Acceptance:
  - No concurrent phase execution for same task
  - Contention logged with holder and TTL

4) Prompt Attestation
- Subphases:
  - Compute canonical prompt hash; persist baseline; verify per transition
  - Versioning path for intentional changes
  - Drift severity and escalation policy
- Acceptance:
  - Drift detected if headers change; WARN/ERROR by phase severity

5) OTEL Integration
- Subphases:
  - agent.state.transition spans with {taskId,state,attempt}
  - agent.verify, process.violation, agent.cross_check spans
  - JSONL sinks at `state/telemetry/{traces,metrics}.jsonl`
- Acceptance:
  - Spans visible for every state; counters increment on violations

6) Quality Graph Integration
- Subphases:
  - Minimal vector schema and persistence (task_id → vector)
  - Similarity queries for plan/observer hints
  - Record vector deltas at MONITOR
- Acceptance:
  - Observer uses structural + vector hints

7) Atlas Integration
- Subphases:
  - Component hash capture into MANIFEST.yml
  - Impact analysis for changed files → test selection hints
- Acceptance:
  - PR blocked on manifest/docs drift; reviewer sees impact map

8) Context Fabric
- Subphases:
  - Per-phase context chain entries with hashes
  - Link artifacts and spans to context entries
- Acceptance:
  - Provenance queryable for any decision/artifact

9) Metrics Dashboard
- Subphases:
  - Aggregate enforcement metrics (phase_skips_attempted, backtracks, drift)
  - CLI view + optional web panel config
- Acceptance:
  - Real-time counters rendered; alert thresholds defined

## Phase Decomposition (STRATEGIZE → MONITOR)

For each phase, required sub-tasks and evidence (minimums):

STRATEGIZE
- Subtasks: Problem statement, approach, purpose alignment
- Evidence: `state/evidence/<task>/strategize/strategy.md` (purpose + risks)

SPEC
- Subtasks: Acceptance criteria, success metrics, DOD
- Evidence: `state/evidence/<task>/spec/spec.md` (quantified)

PLAN
- Subtasks: File/function map, timeline/estimates, dependencies
- Evidence: `state/evidence/<task>/plan/plan.md` + `file_map.json`

THINK
- Subtasks: Alternatives, edge cases, failure modes, mitigations
- Evidence: `state/evidence/<task>/think/edge_cases.md`

IMPLEMENT
- Subtasks: Minimal patch, tests updated/added, docs updated
- Evidence: `git_diff.patch`, `modified_files.json`

VERIFY
- Subtasks: Run tests, lint, type, security, license; coverage delta check
- Evidence: `test_results.json`, `build_output.log`, `coverage_report.json`

REVIEW
- Subtasks: Rubric evaluation; critical audit; actions captured
- Evidence: `review_rubric.json`, `code_quality_score.json`

PR
- Subtasks: Draft PR with template, CI green, risks/rollback
- Evidence: `pr_url.txt`, `pr_template_filled.md`, `ci_results.json`

MONITOR
- Subtasks: Post-merge smoke; telemetry check; rollback readiness
- Evidence: `smoke_test_results.json`, `deployment_status.json`

Backtracking Rules
- Triggered by failures in VERIFY/REVIEW/PR/MONITOR
- Return to earliest impacted phase; re-run downstream phases
- Enforcer records `phase_backtracks` and appends ledger entries

## Backlog (Prioritized by Phase)

### Phase 0: Fundamentals (MUST COMPLETE FIRST)
- ✅ **IMP-FUND-01** — Phase Ledger: Hash chaining + immutable audit trail (DONE – commit 7fa439e2)
- ✅ **IMP-FUND-02** — Evidence-Gated Transitions: Block phase advance without artifacts (DONE – commit 8763dded)
- ✅ **IMP-FUND-03** — MCP Test Fixes: Added pytest hook to clean stale PID locks (DONE – all 3 tests passing)
- ✅ **IMP-FUND-04** — Complete Phase Transition Benchmark: Mock StateMachine + run 1000 iterations (DONE – all latencies <2ms)
- ⏳ **IMP-FUND-05** — Playwright Browser Installation: Guard script + CI verification
- ⏳ **IMP-FUND-06** — Checkpoint Validation Scripts: Automated verification of "verifiably complete"
- ⏳ **IMP-FUND-07** — Acceptance Test Framework: End-to-end enforcement validation tests
- ⏳ **IMP-FUND-08** — Daily Evidence Update Automation: CI job for evidence docs
- ⏳ **IMP-FUND-09** — Pre-Feature Monitoring: 1-2 week baseline (phase_skips, backtracks, drift)

### Phase 1: Enforcement Hardening
- **IMP-ENF-01** — Phase Leases: SQLite-based multi-agent locks; WAL mode; contention metrics
- **IMP-ENF-02** — Prompt Attestation: SHA-256 drift detection; severity policy; versioning workflow
- **IMP-ENF-03** — Tool Router Phase Guards: Pre-execution rejection; tools→phases map; metrics
- **IMP-ENF-04** — State Machine Guards: Explicit allowed transitions; throw on illegal skips
- **IMP-ENF-05** — Lease Burst Test: 100 concurrent acquisitions; WAL verification
- **IMP-ENF-06** — Prompt Drift Injection Test: Mutate headers; verify detection by phase

### Phase 2: Observability
- **IMP-OBS-01** — OTel Spans: state.transition, verify, process.violation spans
- **IMP-OBS-02** — OTel Counters: phase_skips, backtracks, drift, rejections
- **IMP-OBS-03** — JSONL Sinks: traces.jsonl, metrics.jsonl under state/telemetry/
- **IMP-OBS-04** — Alert Scaffolding: Threshold config + example alert rules
- **IMP-OBS-05** — Metrics Dashboard: Aggregate enforcement metrics; CLI view
- **IMP-OBS-06** — Observer Agent (Phase 1): Read-only notes; cadence flags; decision journal

### Phase 3: Advanced Features
- **IMP-ADV-01** — Quality Graph: Vector schema; similarity queries; observer hints
- **IMP-ADV-02** — Atlas Integration: Manifest hash; change impact → test hints; PR checks
- **IMP-ADV-03** — Context Fabric: Per-phase context entries; hash linking; query helpers
- **IMP-ADV-04** — Cross-Check (Phase 3): Sampling re-run; discrepancy logging + spans
- **IMP-ADV-05** — Coverage Threshold: Changed-lines coverage gates + exemptions
- **IMP-ADV-06** — Reviewer Rubric Expansion: Line-anchored comments; low-FP gates
- **IMP-ADV-07** — Playwright Snapshot-Diff: Visual regression; artifact recording

### Phase 4: Persona Routing
- **IMP-PERSONA-01** — Prompt Compiler skeleton + golden tests (see docs/autopilot/Persona-Routing.md)
- **IMP-PERSONA-02** — PersonaSpec canonicalize/hash + prompt attestation integration
- **IMP-PERSONA-03** — Domain overlays library: orchestrator/web/ml/api/security under prompts/
- **IMP-PERSONA-04** — StateGraph hook: Compile/attach prompt per phase; record hash in attestation + journal
- **IMP-PERSONA-05** — Tool allowlist enforcement: PersonaSpec tool filtering in tool_router
- **IMP-PERSONA-06** — Flags/telemetry: Persona variants + sampling (metrics + spans with personaSpecHash/variantId)
