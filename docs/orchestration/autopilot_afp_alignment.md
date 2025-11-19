# Autopilot AFP Alignment Architecture

## Goal & Scope
- Scope: Map the AFP 10-phase lifecycle to an automated multi-agent stack for web development, and contrast the ideal setup with the current instituted guardrail-heavy process.
- Outcome: Clear phase-to-agent mapping, prioritized gaps/actions, and verification hooks that respect existing critics (Strategy/Thinking/Design/Tests/Process), Wave0 expectations, and file/LOC limits.

## Ideal Autonomy Pillars
- **Orchestrated phases:** Planner → spec/requirements agent → designer → implementer → tester → reviewer → deployer, with retries and self-healing.
- **Grounding:** RAG over repo/docs/evidence; live repo index; curated context packs per task; controlled external search.
- **Environments:** Ephemeral sandboxes with seeded fixtures/secrets; preview deploys for web; deterministic seeds for reproducibility.
- **Policy & safety:** File/secret allow/deny, PII/CVE scanning, kill switch, escalation protocol; untrusted execution for risky actions.
- **Quality gates:** Pre-implementation design gate, authored test plans, unit/integration/e2e/a11y/perf checks, coverage deltas, bundle-size budgets.
- **Observability:** Full trace of prompts/edits/tests, phase artifacts, cost/latency budgets, drift detection on patterns.

## AFP Phase → Agent/Tool Mapping
- **STRATEGIZE:**  
  - Ideal: Planner agent uses RAG + roadmap to choose framing, writes strategy with evidence; auto StrategyReviewer run.  
  - Current: Manual strategy docs + critic requirement; no dedicated planner orchestration.  
  - Gap/Action: Add planner module hook to auto-run StrategyReviewer and log transcript to `state/logs/<task>/phase/`.
- **SPEC:**  
  - Ideal: Requirements agent converts strategy to SMART acceptance + non-functional needs; links tests.  
  - Current: Manual spec.md; ProcessCritic enforces presence but not automation.  
  - Gap/Action: Template-driven spec agent with acceptance-to-test mapping; auto PlanReviewer/SpecReviewer invocation.
- **PLAN:**  
  - Ideal: Designer/planner agent emits architecture/tests-before-code, Wave0/live steps, file/LOC budget; auto plan critic.  
  - Current: Manual plan, file/LOC constraint (≤5/≤150) enforced by docs/hooks.  
  - Gap/Action: Plan agent that injects required test commands (`run_integrity_tests.sh`, `check_guardrails`, Wave0 live steps) and enforces budgets.
- **THINK:**  
  - Ideal: Risk/edge-case analyst agent with AFP/SCAS checklist; ThinkingCritic gating.  
  - Current: Manual think.md; critic available but not orchestrated.  
  - Gap/Action: Automate think phase with edge-case templates and critic hook; store structured risks for downstream agents.
- **GATE/DESIGN:**  
  - Ideal: Design agent + DesignReviewer auto-run; retries until approved; via-negativa prompts.  
  - Current: Manual design.md, reviewer run by agent/human.  
  - Gap/Action: PhaseExecutionManager integration to trigger reviewer, require approval before IMPLEMENT.
- **IMPLEMENT:**  
  - Ideal: Implementer agent uses structured edit tools, AST refactors, and respects file/LOC budgets; task graph aware.  
  - Current: Agents/code editors; constraints documented but not enforced by orchestrator.  
  - Gap/Action: Enforce budgets and module locality via agent tools; auto sandbox with seeded fixtures for web.
- **VERIFY:**  
  - Ideal: Tester agent executes authored commands (unit/integration/e2e/a11y/perf), collects artifacts, retries flaky tests.  
  - Current: Manual `run_integrity_tests.sh`, guardrail monitor optional, Wave0 live tests for autopilot changes.  
  - Gap/Action: Bind Verify to PLAN-authored commands; include accessibility/perf for web; automate guardrail monitor rerun.
- **REVIEW:**  
  - Ideal: Reviewer agent compares plan vs implementation, critics summary, drift detection; publishes PR-ready notes.  
  - Current: Manual review.md; ProcessCritic checks phase compliance.  
  - Gap/Action: Automated review agent that validates plan adherence, critic approvals, LOC/file limits, and policy scans.
- **PR:**  
  - Ideal: PR bot opens branch/PR, attaches preview URLs, changelog, and evidence bundle.  
  - Current: Manual; checks listed in AGENTS.md.  
  - Gap/Action: Scripted PR creation with preview deploy for web; auto-attach evidence hashes.
- **MONITOR:**  
  - Ideal: Post-merge monitoring agent watches logs/metrics, triggers rollbacks; learns from incidents.  
  - Current: Manual monitor.md; no automated telemetry loop.  
  - Gap/Action: Hook TaskFlow/Wave0 to collect post-merge signals, log to `state/analytics/` with alerts.

## Priority Gaps vs Current Process
1. **Automation of early phases:** Add planner/spec/plan/think agents with automatic critic calls; current flow relies on manual docs.  
2. **Environment & preview:** No ephemeral envs/preview deploys for web; add per-branch preview + seeded sandboxes.  
3. **Policy engine:** Guardrails focus on behaviour; add policy-as-code for FS/secret/PII/CVE checks in VERIFY.  
4. **Telemetry & evidence:** Evidence is manual; need phase logs, transcript hashes, and cost/latency budgets emitted automatically.  
5. **Task gating & budgets:** Hard constraints (≤5 files/≤150 LOC) not enforced by tooling; add orchestrator checks and auto task-splitting guidance.  
6. **Live validation:** Wave0 live loop optional unless touching autopilot; make Verify enforce Wave0 or TaskFlow smoke for autonomy changes.

## Rollout Path
- **Near Term (this cycle):**  
  - Publish this mapping doc and align teams.  
  - Automate guardrail monitor after daily audit; keep consolidated integrity tests in VERIFY.  
  - Add plan/think auto-critic triggers in orchestration backlog; start emitting phase transcript stubs from PhaseExecutionManager.
- **Mid Term:**  
  - Introduce planner/spec/think agents with critic hooks; enforce file/LOC budget at tool layer.  
  - Add preview deploy + seeded sandbox requirement for web tasks; integrate policy scans (PII/CVE) into VERIFY agent.  
  - Enable PR bot to attach evidence bundle + preview URL; add post-merge monitoring hook.

## Verification & Telemetry Expectations
- PLAN-authored commands to execute in VERIFY:  
  - `bash tools/wvo_mcp/scripts/run_integrity_tests.sh`  
  - `node tools/wvo_mcp/scripts/check_guardrails.mjs` (post-audit)  
  - Wave0 live loop (`npm run wave0`, `ps aux | grep wave0`) when touching autopilot code; not required for docs-only changes.  
- Evidence: Design/Strategy/Think reviewers run automatically per phase; store critic outputs and transcript hashes with task logs.  
- Metrics: track critic first-pass rate, guardrail monitor pass rate, preview deploy success, and LOC/file budget compliance.

## Via Negativa Targets
- Replace manual daily audit and guardrail reruns with orchestrator-managed hooks.  
- Reduce repeated evidence boilerplate by emitting structured phase logs and summaries automatically.  
- Remove ad-hoc verification steps by binding VERIFY strictly to PLAN-authored commands and automated policy scans.

## References
- AGENTS.md (AFP lifecycle, zero-bypass rules)  
- docs/orchestration/unified_autopilot_enhancement_plan.md (guardrail + dual-lane planning gaps)  
- docs/orchestration/AUTOPILOT_VALIDATION_RULES.md (live-fire validation expectations)
