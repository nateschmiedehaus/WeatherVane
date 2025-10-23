# Research Backlog Sweep — 2025-10-20

## Summary
- Product roadmap still has critical slices without the pre-work needed to define success; twelve pending items rely on unknown exit criteria.
- Consensus/staffing, storytelling surfaces, ads automation, and ingestion hardening each lack the research artifacts needed to unblock implementation and critic gating.
- New research work should capture empirical evidence (workload traces, moderated sessions, API constraints, data quality baselines) so downstream builders can execute without re-discovery.
- The tasks below formalise owners, deliverables, and acceptance checkpoints so Atlas can hand crisply scoped work to execution teams and Director Dana can track systemic gaps.

## Gap Matrix
| Cluster | Impacted roadmap slices | Evidence of gap | Risk if unaddressed | Proposed research task |
| --- | --- | --- | --- | --- |
| Consensus & staffing telemetry | `T3.3.2`–`T3.3.4` | No empirical workload model beyond `docs/orchestration/consensus_engine.md`; staffing heuristics and cost envelopes undefined | Critic gating stalls because quorum rules, escalation paths, and budget guardrails remain hypothetical | `TASK-RESEARCH-CONSENSUS-BENCHMARKS` |
| Experiments & storytelling experience | `T3.4.3`–`T3.4.7` | `unknown` exit criteria on Experiments/Reports; only wireframes exist, zero moderated validation or success metrics | UI work risks rework and exec-review failures; analytics can’t prove value to personas | `TASK-RESEARCH-EXPERIENCE-VALIDATION` |
| Ads automation readiness | `T5.1.1`, `T5.1.2`, `T5.2.1`, `T5.2.2` | No unified API capability matrix; credential, rate-limit, and compliance requirements undocumented | Platform integrations slip; security/allocator critics stay blocked without scoped guardrails | `TASK-RESEARCH-AD-AUTOMATION` |
| Data quality guardrails | `T7.1.1`, `T7.1.3`, `T7.2.1` | Ingestion/data-quality tasks carry `unknown` criteria; no shared thresholds for geocoding completeness, schema drift, or incremental dedupe | Weather model validation (E12/E13) lacks trustworthy data inputs; DQ critic can’t sign off | `TASK-RESEARCH-DATA-GUARDRAILS` |

## Detailed Recommendations

### 1. Consensus & Staffing Telemetry Research
- **Current state:** Architecture exists in `docs/orchestration/consensus_engine.md`, but there is no dataset on decision types, quorum failures, or staffing cost. Integration critics (`integration_fury`, `manager_self_check`) depend on quantifiable policies.
- **Research objectives:** capture at least two weeks of task/critic telemetry, classify decision difficulty, map escalation paths, and benchmark token/runtime cost by participant mix.
- **Key questions:** What quorum rules keep throughput ≥90% while containing cost pressure? Which critic failures actually require Director Dana vs. Atlas escalation? How often does consensus need historical context refresh?
- **Deliverables:** workload dataset (`state/analytics/consensus_workload.json`), decision taxonomy memo, staffing heuristics playbook, updated prompt templates validated by at least one dry-run.
- **Success signals:** consensus simulations replay real traces with <5% drift; staffing recommendations feed into `state/analytics/orchestration_metrics.json` ahead of `T3.3.4`.

### 2. Experiments & Storytelling Experience Validation
- **Current state:** Personas (`docs/product/user_journeys.md`) and wireframes exist, yet Experiments/Reports tasks still list `unknown` exit criteria and lack moderated testing or analytics baselines.
- **Research objectives:** run moderated sessions with each primary persona (Sarah, Leo, Priya), validate comprehension of Experiments + Reports narratives, and define measurable success metrics (e.g., approval latency, export engagement).
- **Key questions:** Which copy/layout variants let operators approve experiments in under three minutes? What evidence do execs need to trust storytelling surfaces? How should analytics events map to user intent?
- **Deliverables:** research report with clips/notes, updated acceptance metrics inserted into `docs/UX_CRITIQUE.md`, instrumentation checklist for analytics SDK, Figma/hi-fi references tagged with success signals.
- **Success signals:** `unknown` criteria replaced with explicit metrics; design_system + exec_review critics receive pre-fed evidence packages once implementation resumes.

### 3. Ads Automation Readiness & Compliance Sweep
- **Current state:** API documentation snippets live under `docs/api/`, but there is no consolidated view of scope/permissions, sandbox gaps, or spend guardrail implications for allocator coupling.
- **Research objectives:** compile Meta + Google Ads operation matrices (create/update/delete), credential flows, rate-limit envelopes, review compliance restrictions, and map required proofs for `critic:security` and `critic:allocator`.
- **Key questions:** Which operations require standard vs. extended scopes? What sandbox evidence satisfies security before production credentials are stored? How do rate limits shape batching strategies for allocator outputs?
- **Deliverables:** ads capability matrix (`docs/api/ads_capability_matrix.md`), vaulting/credential SOP, risk register with mitigations, mock flows validated via sandbox or stub harness.
- **Success signals:** allocator + security critics agree on guardrails; implementation tasks gain precise scope, and automation CLI prototypes can run in dry-run mode without unknowns.

### 4. Data Quality Guardrails & Incremental Hygiene
- **Current state:** Weather ingestion and cache warming docs exist, yet data pipeline tasks still carry `unknown` exit criteria; no shared thresholds for geocoding coverage, schema validation, or dedupe accuracy.
- **Research objectives:** benchmark current ingestion success rates, define DMA/geohash coverage thresholds, specify schema validation rules, and outline incremental dedupe acceptance tests.
- **Key questions:** What coverage floor keeps modeling error <5%? Which schema changes must halt pipelines vs. warn? How should incremental jobs reconcile late-arriving data without double counting?
- **Deliverables:** DQ metric dashboard spec, geocoding coverage report, schema validation checklist, incremental ingestion playbook with pytest fixtures.
- **Success signals:** Data-quality critic can adopt the thresholds; weather model validation (E12/E13) inherits trusted inputs, and ingestion jobs expose alerting hooks before implementation work restarts.

## Next Steps
- Track the four research tasks in `state/roadmap.yaml` under the general backlog so Atlas and Director Dana can sequence staffing.
- Brief execution teams once research milestones land; dependent roadmap slices should not resume until the deliverables above are published.
- Feed resulting artifacts into `state/context.md` and critic evidence packs so future loops can verify readiness without another sweep.

