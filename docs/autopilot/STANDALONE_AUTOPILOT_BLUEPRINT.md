# Stand‑Alone Autopilot for Software Development — High‑Integrity Blueprint

Purpose: vendor‑neutral, language/framework‑agnostic Autopilot with gates, policies, sandboxing, and HITL. This is a concrete, implementation‑ready plan that maps to our IMP backlog.

## 0) Reliability Promise (SLOs)
- Contract‑valid outputs: 100%
- Executed policy violations: 0% (blocked is fine)
- CI‑green PRs: ≥95% on golden repos
- Mean time to rollback: < 2 minutes (all changes gated and reversible)

## 1) System Architecture (Modules)
- Orchestrator as State Graph: finite graph; deterministic transitions; watchdog
- Contracts & Schemas: JSON Schema/Pydantic for ProblemSpec, Plan, TaskList, ChangeSet, CommitPlan, PRSummary, RiskReport
- Policy & Governance: OPA/Rego or jsonlogic for repo scope, diff caps, allow/deny lists, tests‑required, licensing, secret scanning
- Grounding & Knowledge: vector index + code knowledge graph; decisions must cite reachable artifacts
- Process‑level Verification: step verifiers/PRM (plan soundness, tool choice, coverage delta, migration risk)
- Safety & Security: moderation, secret redaction, allow/deny tool lists
- Sandboxed Execution: ephemeral container/VM; read‑only clone + scratch diffs; network allowlist; quotas
- Observability: OTEL spans; trace graph; attach schemas, policy verdicts, PRM scores, costs
- Reliability Patterns: idempotency keys, transactional outbox, retries/jitter, circuit breakers, dead‑letter queue, shadow/canary

## 2) Repo Layout (drop‑in)
- core/: state graph, runner, storage
- contracts/: schemas for ProblemSpec/Plan/ChangeSet/PRSummary
- policies/: OPA/jsonlogic
- tools/: typed adapters (git/ci/issue/code review/pkg manager/linter)
- qc/: validators, PRM verifier, grounding, gates
- sandbox/: container runner, allowlists
- knowledge/: embeddings + code graph
- observability/: otel init + metrics
- configs/: autopilot.yaml, tools.yaml

## 3) Five Quality Gates (ordered)
1) Pre‑flight: input validation, moderation/secret scan, policy scope/budget
2) Plan gate: schema + citations + PRM threshold
3) ChangeSet gate: policy (paths/diff size/tests/headers/rollback) → materialize in sandbox only
4) CI/Test gate: build/type/lint/tests/coverage; SBOM+vuln scan
5) Finalization: PR summary, approvals, labels; HITL for high‑impact; auto‑merge only when green and policy‑allowed

## 4) MCP‑style Tool Contracts
- Git commit plan, CI run schema examples; all tools declare typed IO

## 5) Core Models (Pydantic shorthand)
- ProblemSpec, Plan, Change, ChangeSet, PRSummary

## 6) Grounding & “Vectorized Graphs”
- Retrieval = top‑k embeddings ∩ graph‑reachable; gates require citations

## 7) Sandboxing & Side‑Effect Safety
- All builds/tests/lints inside ephemeral sandbox; PR‑only mutations; idempotent side effects; transactional outbox

## 8) Observability & Audit
- One trace per run; spans for plan/retrieval/tools/gates; metrics: ci_green_rate, contract_violation_rate, policy_block_rate, coverage_delta, loop_abort_count

## 9) Human‑in‑the‑Loop (HITL)
- Pause reasons: missing evidence, high impact, coverage drop, policy close‑call, retry loop; approve/request‑changes/escalate/abort

## 10) Red‑Team & Chaos
- Weekly prompt‑injection corpus, poisoned deps, flaky tests, broken network; expectation: halt or HITL

## 11) Configs
- tools.yaml for allowed tools/timeouts/budgets/policies; autopilot.yaml for SLOs/flags/sandbox
- OPA policy sketch for path allowlists, diff caps, tests‑required for src changes

## 12) Minimal Runner Loop (pseudo)
- Gate1 → Plan+Gate2 → ChangeSet+Gate3 (sandbox) → CI+Gate4 → PR+Gate5

## 13) Rollout (30 days)
- Week 1: contracts/validators; Gate 1–2; Git/CI adapters; sandbox skeleton; tracing
- Week 2: ChangeSet generation; Gate 3; lint/type; outbox; CI in sandbox
- Week 3: code graph + embeddings; grounding checks; Gate 4; coverage/license; HITL UI
- Week 4: OPA policies; Gate 5; chaos harness; SLO dashboards; enable low‑risk auto‑merge behind flag

## 14) Definition of Done
- 0 executed policy violations in 2‑week canary
- 0 contract‑violation escapes (all blocked)
- ≥95% CI‑green Autopilot PRs
- Incident drill passes (build break, network cut, prompt attack) with safe halt
- Complete trace DAG + reproducible artifacts for every run

## Mapping → Improvement Backlog
- IMP‑27 — Contracts & schema validators
- IMP‑28 — OPA policy pack + CI Action wiring
- IMP‑29 — Sandbox container runner + allowlists
- IMP‑30 — Transactional outbox + idempotency keys
- IMP‑31 — Trace DAG UI (or Phoenix integration)
- IMP‑32 — HITL panel UX
- IMP‑33 — Supply chain & repo hygiene gates (SBOM+vuln+secrets)
- IMP‑34 — Red‑team/chaos harness

This blueprint is scoped to the minimum required for a safe, reproducible, auditable Autopilot that can be dropped into any repo with high integrity.

---

## Conceptual Integration (End‑to‑End Map)

This section explains how every subsystem plugs into the whole, so the design is cohesive and auditable.

- Contracts as the universal boundary
  - All inputs/outputs between components are JSON‑schema/Pydantic models (ProblemSpec, Plan, ChangeSet, PRSummary, RiskReport). Nothing crosses a boundary untyped.
  - Validators (with auto‑repair) run before and after each agent/model/tool step. Contract failure ⇒ block or self‑repair; never emit invalid outputs.

- Orchestrator as policy‑driven state graph
  - The state graph calls each step (plan → retrieve → propose → implement → test → review → finalize) and enforces deterministic transitions.
  - Every edge is guarded by Quality Gates (see §3). An edge is taken only if the gate verdict is pass. Otherwise, loop for self‑revision or escalate to HITL.

- Gates compose policy, grounding, and sandboxing
  - Gate 1 validates inputs + moderation/secret scan + policy simulation.
  - Gate 2 requires groundedness (citations must be reachable in the code graph) and PRM (plan soundness) above threshold.
  - Gate 3 validates proposed ChangeSet against OPA policies, diff caps, tests‑required, and materializes only inside the sandbox.
  - Gate 4 runs build/type/lint/tests/coverage + SBOM/vuln scans inside the sandbox; coverage must meet policy.
  - Gate 5 opens PRs with full evidence; approvals + labels + HITL for high impact; optional auto‑merge only when everything is green.

- Knowledge as a double anchor (vector + graph)
  - Retrieval feeds planning/implementation with top‑k embeddings intersected with the code graph (imports, test coverage, deps). Claims without citations are rejected at Gate 2/4.

- Persona routing and multivariate prompting
  - For each phase/subtask, route to a specific persona (role + domain overlays + skill packs) and compile a deterministic prompt.
  - The compiled prompt’s hash and PersonaSpec hash are recorded (attestation); tool allowlists from PersonaSpec feed the tool router.

- Tool execution under strict routing and policy
  - Tool router enforces phase and PersonaSpec allowlists; anything out‑of‑phase or disallowed is rejected with a structured error.
  - All external side‑effects are queued via a transactional outbox with idempotency keys (e.g., open PR, post comment).

- Sandbox as the blast‑radius boundary
  - The sandbox mounts a read‑only repo clone and a scratch workspace for diffs; has network allowlists and quotas.
  - Only artifacts (diffs, logs) exit the sandbox; no direct pushes. Mutation happens via PRs only.

- Observability as the accountability fabric
  - Each step/tool call emits OTEL spans with attributes: schemas used, policy verdicts, PRM scores, costs, citations, prompt/persona hashes.
  - A trace DAG links steps causally. Metrics power SLOs and alerts.

- Ledger, attestation, leases for integrity
  - Phase ledger (hash chain) records every transition with artifact paths and prompt/persona hashes.
  - Prompt attestation detects header/prompt drift (warn or error by phase/policy).
  - Phase leases prevent concurrent access to the same task+phase in multi‑agent deployments.

- HITL woven into edges and PRs
  - Any low‑confidence or high‑impact verdict pauses; the UI presents diffs, citations, policy checks, CI status, and rollback steps.
  - Humans can Approve/Request Changes/Escalate/Abort; decisions are logged and fed back into learning.

- Security model
  - No VCS write creds in agent runtime; PRs go through a constrained adapter with idempotent calls.
  - Secret scanning, license checks, and SBOM/vulnerability scans are mandatory gates.

- Extensibility and language neutrality
  - Tool adapters (git/ci/linters/test runners) are pluggable; coverage and test detection are abstracted to work across Node, Python, Java, Go.
  - Policies are repo‑specific but share a common Rego/jsonlogic library.

- Deployment and rollout
  - Shadow/canary modes route a fraction of tasks to Autopilot; HITL enforced for high impact until SLOs are met.
  - Red‑team/chaos jobs run weekly to validate fail‑closed behavior.

Outcome: All parts reinforce each other — contracts prevent invalid IO, gates enforce policy and groundedness, sandboxing contains risk, observability proves behavior, and HITL governs uncertainty. The system is auditable (ledger/trace), safe (policies/sandbox), and effective (high CI‑green rate with fast rollback).
