# Persona Routing and Multivariate Prompting (Programmatic)

Goal: deterministically assemble the right prompt per task, phase, and domain by composing phase roles, domain overlays, skill packs, and eval rubrics; capture hashes for attestation and learning.

## Fit in the System
- Flow: feature extraction → persona routing → prompt compilation → attestation → agent call → eval + evidence → ledger/telemetry
- Integration points:
  - Router: `tools/wvo_mcp/src/persona_router/*` (feature_extractor.ts, routing_rules.ts, persona_spec.ts)
  - Compiler (new): `tools/wvo_mcp/src/prompt_compiler/compiler.ts`
  - State graph hook: `tools/wvo_mcp/src/orchestrator/state_graph.ts` (compile just-in-time per phase)
  - Attestation: `tools/wvo_mcp/src/orchestrator/prompt_attestation.ts` (store compiled prompt hash)
  - Tool router guard: `tools/wvo_mcp/src/worker/tool_router.ts` (allowlist from PersonaSpec)

## Inputs and Signals
- Task signals: paths, labels, LOC delta, filetypes, component criticality
- Phase: STRATEGIZE, SPEC, PLAN, THINK, IMPLEMENT, VERIFY, REVIEW, PR, MONITOR
- Risk/scope: tiny/small/medium/large (code touch count, cross-component)
- Context: LCP anchors (code/tests/kb/decisions), prior failures, telemetry
- Domain detection: rules + lightweight classifier over path/tokens (ml, ux, api, orchestrator, security, data)

## Phase Personas (core roles)
- STRATEGIZE — Autonomy Systems Strategist (orchestrator/guardrails/risk)
- SPEC — Requirements Engineer (measurable ACs/SLOs)
- PLAN — Delivery Planner (critical path, deps, estimates)
- THINK — Staff Reviewer (deep reasoning: failures/leases/ledger/attestation)
- IMPLEMENT — Senior Implementer (TS/Node/tests/telemetry)
- VERIFY — Verification Engineer (tests, coverage, security/license)
- REVIEW — Adversarial Reviewer (readability/maintainability/perf/security)
- PR — Release Engineer (PR hygiene, evidence bundling)
- MONITOR — SRE/Observability Engineer (dashboards/alerts/smokes)

## Domain Overlays (plug-in expertise)
- Orchestrator (state_graph, enforcer, leases/ledger/attestation)
- ML (repro, tolerances, seeds, dataset contracts)
- UX (Playwright, a11y, snapshot policy)
- API/Infra (schema/migrations/compatibility contracts)
- Security (secrets/policy/attack surfaces)
- Data (ETL/contracts/backfills)

## Skill Packs (toggle per persona)
- Build/Test, Orchestrator, Observability, Web/UX, ML/Stats, Security, Git/PR

## Scope Brackets
- Tiny: ≤10 LOC; minimal evidence but still VERIFY/REVIEW
- Small: single module, unit tests only
- Medium: multi-module, unit+integration
- Large: cross-component, multi-repo; multi-agent review and expanded smokes

## Eval Rubrics (LLM + programmatic)
- Strategy Fitness: names the Autopilot behavior guarded; measurable success
- Spec Completeness: ACs testable; negative paths; traceable to tests
- Plan Verifiability: ≤3 steps; acceptance signals per step
- Implement Integration: reuse helpers; no dup interfaces; tests cover changed symbols
- Verify Sufficiency: all gates; changed-lines coverage; smokes run
- Review Quality: line-anchored comments; high-sev issues flagged
- PR Evidence: ledger/attestation/telemetry attached; rollback plan
- Monitor Readiness: dashboards/alerts defined; alert tests pass

Programmatic checks:
- Grep/hash assertions (keywords present; artifact hashes linked to changed files)
- Changed-lines coverage threshold
- Artifact non-emptiness and expected strings
- Synthetic alert tests (push counters; ensure alerts fire)
- Lease/attestation outcomes recorded

## PersonaSpec Schema (JSON)
- phase_role: string (e.g., "Implementer")
- domain_overlays: string[] (e.g., ["orchestrator","security"])
- skill_packs: string[]
- scope: "tiny"|"small"|"medium"|"large"
- eval_rubrics: string[] (ids)
- tool_allowlist: string[] (tool names)
- model_caps: string[] (e.g., reasoning_high, fast_code)
- budget: { max_tokens?: number }

Canonicalization:
- Provide `canonicalize()` and `hash()` so identical specs → identical hashes; sort all arrays.

## Prompt Compiler (deterministic)
- Compose blocks:
  - Core governance header (mandatory STRATEGIZE→MONITOR + safety)
  - Phase header (role goals, exit criteria, allowed tools)
  - Domain overlay text (per overlay)
  - Skill pack snippets (tools/commands/checks)
  - Eval rubric prompt (LLM-as-judge) + programmatic checklist summary
  - Context anchors (LCP; trimmed to budget)
- Output: `{ text, hash, meta: { agent, phase, overlays, rubricIds, modelCaps, toolAllowlist } }`
- Record: prompt hash and PersonaSpec hash in attestation/ledger/telemetry

## Router Logic (rules + weights)
1) Feature extraction → domain scores (e.g., apps/model/** → ml=0.9; apps/web/** → ux=0.8; tools/wvo_mcp/** → orchestrator=1.0)
2) Phase role from state graph → base persona
3) Overlays: include top N domains over threshold; always add orchestrator overlay when touching enforcer/graph paths
4) Risk → add Security overlay; raise rubric thresholds; require Critical reviewer later
5) Produce PersonaSpec; pass to compiler; attach allowlist to tool router

## Model Routing
- Strategize/Spec/Review: reasoning_high (Claude/Codex variant)
- Implement: fast_code (Codex)
- Verify: fast_code (runners), reasoning_high for semantic diffs
- Think: reasoning_ultra when ambiguity/risk high; else reasoning_high
- Parallelism: planner/thinker fan-out + merge; reviewer + critical dual-run

## Multivariate Variants
- Dimensions: model caps, rubric weights, overlay set, context size, allowlist strictness, risk posture
- Flags: `personaCompilerEnabled`, `personaPromptVariantsEnabled`, `personaVariantSampleRate`
- Telemetry: record `{ personaSpecHash, overlays, rubricIds, variantId, promptHash }` on spans; add to ledger

## Tests
- Golden prompts per phase/overlay; invariant to insertion order
- Routing fuzz tests for mixed/ambiguous domains
- Attestation drift tests when headers/overlays change

## Example (STRATEGIZE for ML+Orchestrator)
- Inputs: apps/model/** + tools/wvo_mcp/**; phase=STRATEGIZE; high risk
- PersonaSpec: phase_role=Autonomy Strategist; overlays=[orchestrator, ml]; packs=[Orchestrator, Observability, ML/Stats]; rubrics=[StrategyFitness, RiskCoverage]; allowlist=[read/search]; model_caps=[reasoning_high]
- Compiler: assemble blocks; hash; attest; run; record artifacts

## Backlog Mapping (this batch)
- IMP‑21 — Prompt Compiler skeleton + golden tests
- IMP‑22 — PersonaSpec canonicalize/hash + attestation integration
- IMP‑23 — Domain overlays library (orchestrator/web/ml/api/security)
- IMP‑24 — State graph hook: compile/attach prompt per phase; record prompt hash in attestation + journal
- IMP‑25 — Tool allowlists: enforce via tool router guard
- IMP‑26 — Flags + telemetry/metrics for persona variants and sampling

