# Work Process Enforcement — Impossible To Fake

This document defines the enforcement layer that guarantees agents (Autopilot, standalone Codex, or Claude) follow STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR with zero tolerance for skips and explicit support for corrective backtracking.

## 10 Enforcement Strategies (with tradeoffs)

1) Immutable Phase Ledger (hash chain)
- What: Append-only JSONL with hash chaining for every phase transition.
- Pro: Tamper-evident, easy to audit; cheap to run.
- Con: Detects skips after the fact unless wired inline.
- Fit: Baseline for trust; pairs with gating.

2) Evidence-Gated Transitions
- What: Per-phase artifact and content validation (e.g., strategy.md, spec.md, test_results.json).
- Pro: Prevents “done by declaration”; blocks forward progress without proof.
- Con: Requires curation of checks; risk of over-constraining early phases.
- Fit: Primary guard for correctness.

3) Phase Leases (deterministic scheduler sequencing)
- What: Time-bounded locks per task+phase (SQLite WAL) to prevent concurrent edits.
- Pro: Eliminates race conditions in multi-agent scenarios.
- Con: Operational complexity; lease cleanup/renewal paths.
- Fit: Essential under concurrency.

4) Prompt Attestation (anti-drift)
- What: Hash and persist the prompt header/contract; verify on transitions.
- Pro: Detects silent header drift; blocks “illusion of enforcement”.
- Con: Needs versioning path for intentional changes.
- Fit: Prevent regressions from prompt edits.

5) Tool Router Phase Guards
- What: Map tools → required phase; reject out-of-phase tool calls.
- Pro: Stops misuse at source (e.g., `git_commit` in PLAN).
- Con: Requires complete mapping and task context propagation.
- Fit: Defense-in-depth at tool boundary.

6) State Machine Transition Guards
- What: Allowed transition map; throw on disallowed jumps (e.g., SPEC→IMPLEMENT).
- Pro: Clear invariants; early failures.
- Con: Needs backtracking paths defined to avoid over-restriction.
- Fit: Core safety net.

7) OTel Process Spans + Metrics
- What: agent.state.transition, process.violation, agent.verify metrics.
- Pro: Visibility; alerting on skips/violations.
- Con: Observability, not enforcement.
- Fit: Required for SLOs and monitoring.

8) Observer/Cross-Check (read-only)
- What: Post-VERIFY analysis and sampled re-runs.
- Pro: Detects flake/drift; improves reliability.
- Con: Time cost; not a hard gate initially.
- Fit: Matures to optional gating.

9) Governance Hooks (Atlas/CI)
- What: Block merges on manifest/docs drift; require ledger/metrics artifacts.
- Pro: Prevents “merge without evidence”.
- Con: Only at PR boundary.
- Fit: Completes end-to-end guardrails.

10) Context Fabric Provenance
- What: Track inputs/reasoning/outputs per phase; hash and link to ledger.
- Pro: Explains decisions; supports audits and learning.
- Con: Storage and discipline overhead.
- Fit: Best with Observer/Graph.

Comparison summary
- Immediate blockers: 2 (Evidence Gates), 6 (Transitions), 5 (Tool Guards)
- Anti-drift: 1 (Ledger), 4 (Attestation), 3 (Leases)
- Visibility: 7 (OTel), 8 (Observer), 10 (Context), 9 (Governance)

## Backtracking Policy (now enforced)
- Allowed: VERIFY/REVIEW/PR/MONITOR may send the workflow back to any earlier phase.
- Behavior: Enforcer updates the current phase backward, records a backtrack entry in the ledger, manages leases, and restarts evidence collection for the earlier phase.
- Metrics: `phase_backtracks` counter increments with from/to attributes.
- Rationale: Ensures fixes occur at the earliest impacted phase and that all downstream phases re-run with fresh evidence.

## Current Status
- Phase ledger: enabled
- Evidence gates: integrated in enforcer (expand content checks over time)
- Leases: enabled (best-effort; fail-open for single-agent)
- Prompt attestation: enabled (warn-level drift detection; can elevate)
- State Graph guards: enabled (forward sequencing + backtracking support via enforcer)
- Tool router guards: planned (Phase 2)
- OTel spans/metrics: partially implemented; expand in Phase 0
- Observer/Cross-Check: planned (Phases 1 and 3)
- Governance and Context Fabric: ongoing

