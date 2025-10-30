# Unified Work Process (Future‑Proof)

This document is the single source of truth for the Autopilot work process across Strategy, Spec, Plan, Think, Implement, Verify, Review, PR, and Monitor. It defines stable contracts, artifacts, fitness functions, and enforcement so the process remains durable as the system evolves.

## Sequence (Mandatory)
STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR

- Skipping ANY phase = immediate task failure
- Starting at IMPLEMENT = rejected
- Claiming done without VERIFY = rejected
- Backtracking allowed/required when late gaps are found (rerun downstream phases with fresh evidence)

## STRATEGIZE Phase: Deep Strategic Thinking (MANDATORY)

**CRITICAL: Strategy is About Finding Elegant Solutions, Not Just Following Requirements**

**Philosophy:**
- STRATEGIZE is not "write down what user asked for" - it's **"find the best possible solution"**
- Question assumptions, reframe problems, explore alternatives
- The problem statement might be wrong - your job is to find the real problem
- Optimize for long-term elegance, not short-term implementation speed

**Deep Strategic Thinking Process (REQUIRED):**

1. **Question the Problem**:
   - Is this the right problem to solve?
   - What's the root cause vs symptoms?
   - Could we solve this more fundamentally?

2. **Reframe the Goals**:
   - What are we actually trying to achieve? (not just "what feature to build")
   - What's the value proposition?
   - What outcomes matter most?

3. **Explore Alternatives**:
   - What are 3-5 different approaches? (not just the obvious one)
   - What's the elegant long-term solution?
   - What's the MVP that provides baseline data for better solutions?

4. **Consider Long-Term**:
   - What's the solution that scales?
   - What infrastructure enables better solutions later?
   - How does this integrate with existing systems?

5. **Challenge Requirements**:
   - Can we solve this more fundamentally?
   - Question the "how", focus on the "why"
   - Is there a better abstraction?

**Example of Deep vs Surface Thinking:**
- ❌ **Surface**: "User wants per-phase budgets" → implement per-phase budgets
- ✅ **Deep**: "Why budgets? To prevent waste. What causes waste? Lack of progress signal. Real solution: progress-based resource management + static budgets as MVP for data collection."

**Artifacts:**
- `state/evidence/<TASK-ID>/strategize/strategy.md` with Problem Reframing section
- Alternative approaches analysis (3-5 options with tradeoffs)
- Phased approach recommendation (MVP → elegant solution)
- Integration points with existing systems

See `state/evidence/IMP-COST-01/strategize/strategy.md` for comprehensive example.

## Cross‑Item Integration (Mandatory)

Purpose: ensure every change works in context by declaring and validating relationships between related roadmap items (e.g., prompt compiler/attestation/evals/router, quality graph, vectorized retrieval).

- Declare relationships early
  - In STRATEGIZE/SPEC, list Related · DependsOn · Produces · Consumes for this task in `state/roadmap.yaml` using the v2 schema (`dependencies.depends_on`, structured `exit_criteria`, required metadata).
  - Prompt/graph/router changes MUST relate to: IMP‑21/22/23/24/25/26/35/36/37; and, when applicable, IMP‑ADV‑01.2 (hint injection), IMP‑QG‑01, IMP‑VEC‑01.
- Plan/Think integration
  - PLAN must state how outputs integrate with Related items (contracts/slots/gates/telemetry), with a verification map.
  - THINK must enumerate integration risks/oracles (attestation alignment, eval variant IDs, grounded citations, tool allowlists).
- Verify and Review together
  - VERIFY must run roadmap linter and integration check (observe→enforce):
    - `scripts/roadmap_lint.py` validates `state/roadmap.dependencies.yaml` (no missing links, no contract drift)
    - `scripts/roadmap_integration_check.sh` confirms attestation/eval/telemetry/tool router alignment and no gate bypass
    - run end‑to‑end smokes to prove context‑wide correctness
  - REVIEW rubric requires explicit Related links + contract versions and attaches linter/integration reports.


## Gap Remediation Protocol (MANDATORY)

**Core Principle:** Gaps found in REVIEW or late phases are BLOCKERS, not backlog items. Fix them NOW within the current work process loop.

**Enforcement Rules:**
1. **NO deferring to follow-up tasks** - Gaps MUST be fixed before declaring task complete
2. **Loop back immediately** - Return to earliest impacted phase (typically IMPLEMENT, sometimes SPEC/PLAN if fundamental design issue)
3. **Re-run ALL downstream phases** - After fixing gaps, re-execute VERIFY → REVIEW → PR → MONITOR with updated evidence
4. **Only exception** - Gaps explicitly marked "out of scope" in SPEC acceptance criteria (rare, must be documented)
5. **Update ALL evidence documents** - Implementation.md, verify.md, review.md, monitor.md must all reflect gap fixes

**Gap Classification:**

**MUST FIX NOW (blockers):**
- Missing implementation details (schema fields, validation, error handling, edge cases)
- Incomplete documentation (troubleshooting guides, examples, migration docs, configuration)
- Unverified assumptions (performance claims without benchmarks, compatibility without tests)
- Design flaws (tight coupling, missing graceful degradation, no rollback plan, race conditions)
- Unfulfilled acceptance criteria from SPEC

**CAN DEFER (not blockers):**
- Items explicitly listed as "out of scope" in SPEC (must be documented with rationale)
- Separate user stories not in current acceptance criteria (e.g., "PoC for research task")
- Nice-to-have improvements beyond core requirements
- Performance optimizations beyond stated SLOs

**Remediation Process:**

1. **Gap Discovery** (usually in REVIEW phase)
   - List each gap with severity (High/Medium/Low)
   - Check SPEC: Is gap explicitly out-of-scope? If yes → defer, if no → continue

2. **Impact Analysis**
   - Which phase introduced the gap? (STRATEGIZE/SPEC/PLAN/THINK/IMPLEMENT)
   - Which evidence documents need updating?
   - Are there related gaps that should be fixed together?

3. **Loop Back**
   - Return to earliest impacted phase (e.g., if design issue → PLAN, if implementation detail → IMPLEMENT)
   - Fix ALL identified gaps (don't defer partial fixes)
   - Update all affected evidence documents with fixes

4. **Re-Verification**
   - Re-run VERIFY phase: check build, tests, documentation completeness
   - Re-run REVIEW phase: confirm gaps are resolved, no new gaps introduced
   - Update PR phase: amend commit or add new commit with gap fixes
   - Re-run MONITOR phase: update completion summary with gap remediation notes

5. **Acceptance**
- Task complete ONLY when REVIEW shows no unresolved gaps (or all gaps are explicitly out-of-scope)
- All evidence documents updated and consistent
- Build passes, tests pass, documentation complete

## Task Delta Notes (MANDATORY)

Downstream gates (VERIFY/REVIEW/PR/MONITOR) often surface additional work—extra tests, docs, telemetry, scripts—that was not declared earlier in the loop. Every time this happens, capture it with a **Task Delta Note** so the requirement is enforceable and auditable.

- **When to create one:** any new verification command, benchmark, documentation deliverable, telemetry capture, or artifact discovered after SPEC/PLAN. If VERIFY needs a new test, or REVIEW requests a doc addition, log it.
- **Where to record:** append an entry to `state/evidence/<TASK-ID>/monitor/plan.md` under a `## Delta Notes` heading (create the file/heading if missing).
- **Entry format:** include timestamp (UTC ISO), phase that discovered the requirement, summary of the new deliverable, owner, and status (`pending` → `in_progress` → `complete`). Link to evidence (test logs, docs, telemetry) once fulfilled.
- **Blocking rule:** a task cannot exit the work process until every delta note is marked `complete` or SPEC explicitly exempts it. REVIEW must fail if open delta notes remain.
- **Automation:** supervisors/scripts must convert any outstanding delta notes into explicit roadmap tasks if they cannot be completed inside the current loop. No informal follow-up lists; every residual requirement is tracked as its own task ID.
- **Follow-up classifier:** run `node tools/wvo_mcp/scripts/classify_follow_ups.ts` to ensure every "next step"/follow-up note in implement/verify/review/monitor evidence is classified (`immediate_fix`, `scheduled_improvement`, `research_spike`, `monitoring_watch`, `external_dependency`) and either linked to a roadmap task (`status: task_created`) or documented with deferment metadata (`owner`, `defer_until`, `rationale`). The run emits auto-created `AUTO-FU-*` entries to `state/automation/auto_follow_up_tasks.jsonl`; review/import them, and only opt out with `[ #auto-task=skip ]` when the deferment is justified in evidence. CI fails while pending follow-ups remain.
- **Determinism audit:** run `node tools/wvo_mcp/scripts/check_determinism.ts --task <TASK-ID> --output state/evidence/<TASK-ID>/verify/determinism_check.json` to confirm shared seeds/timeouts are active and tracing smokes produce stable spans/counters (IMP-DET-01). Any failure blocks advancement.
- **Structural policy gate:** run `node tools/wvo_mcp/scripts/check_structural_policy.ts --task <TASK-ID> --output state/evidence/<TASK-ID>/verify/structural_policy_report.json`; address any missing test coverage or document allowlist entries before continuing (IMP-POL-01).
- **Risk→oracle coverage:** run `node tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --task <TASK-ID> --output state/evidence/<TASK-ID>/verify/oracle_coverage.json` to prove every risk in the THINK map has passing oracles (IMP-ORC-01).
- **PR metadata:** run `node tools/wvo_mcp/scripts/check_pr_metadata.ts --task <TASK-ID> --output state/evidence/<TASK-ID>/verify/pr_metadata_report.json` and ensure `pr/why_now.txt` + `pr/pr_risk_label.txt` exist with valid data (IMP-PR-01).
- **Performance regressions (META-PERF-01):** run `node tools/wvo_mcp/scripts/check_performance_regressions.ts` to compare current telemetry averages against stored baselines. Address regressions immediately or update baselines with `--update-baseline` only after documenting the improvement and evidence.
- **Tooling:** run `node tools/wvo_mcp/scripts/check_delta_notes.ts` before declaring a task done; treat a non-zero exit as a blocker until each note is resolved or promoted to a new roadmap task.
- **Ledger link:** when looping back to an earlier phase, reference the delta note in the ledger entry so auditors can trace remediation to execution.

**Example Scenarios:**

**Scenario 1: Missing Implementation Detail**
- REVIEW finds: "Missing schema_version field for config files"
- Gap out-of-scope? NO (not in SPEC exclusions)
- Action: Loop back to IMPLEMENT → add schema_version to BaseConfigSchema → update implementation.md → re-run VERIFY/REVIEW/PR/MONITOR
- Result: Gap fixed in current loop, no follow-up task created

**Scenario 2: Research Task Without PoC**
- REVIEW finds: "No proof-of-concept implementation"
- Gap out-of-scope? YES (SPEC line 321: "Research task, implementation in follow-up")
- Action: Note in REVIEW that gap is explicitly out-of-scope, defer to follow-up task
- Result: Task complete, follow-up task for implementation is acceptable

**Scenario 3: Multiple Related Gaps**
- REVIEW finds: "Missing schema versioning (Medium), missing Python dependencies (Low), missing troubleshooting guide (Low)"
- Gap out-of-scope? NO for all three
- Action: Loop back to IMPLEMENT → fix all three gaps together → update implementation.md → re-run VERIFY/REVIEW/PR/MONITOR
- Result: All gaps fixed in single loop, one evidence update

**Common Violations:**
- ❌ "Design complete, implementation gaps will be fixed in follow-up task"
- ❌ "Tests pass but documentation is TODO, will document later"
- ❌ "REVIEW found 4 issues, addressed 2, deferring 2 to backlog"
- ✅ "REVIEW found 4 issues, looped back to IMPLEMENT, fixed all 4, re-ran VERIFY/REVIEW/PR/MONITOR"

**Rationale:**
- Prevents technical debt accumulation
- Ensures complete, production-ready work
- Maintains high quality bar
- Prevents "it's 90% done" syndrome
- Forces proper scoping in SPEC phase

**History:**
- Added 2025-10-28 after incident where research task gaps were incorrectly deferred to follow-up tasks
- Clarified that gaps are blockers unless explicitly out-of-scope in SPEC

## Future‑Proof Principles
- Contract‑first evolution (versioned schemas, tool contracts, prompt headers)
- Change via seams (adapters + flags; no hard coupling)
- Fitness functions as gates (stability, coupling, complexity, latency, coverage)
- Observability as contract (documented spans/counters/logs verified continuously)
- Safe rollout (flags, canary/shadow, rollback plans)
- Learning loop (incidents → tests/gates/docs updates)

## Time‑Box Policy (Guidance, Not Hard Caps)
- The listed time limits are defaults for typical, low‑risk work. They focus attention; they do not relax gates or acceptance criteria.
- Extend the box when risk/novelty/impact is higher. Record justification + new cap in the decision journal.
- If a box expires with high‑severity items unresolved, do not proceed to Implement. Either:
  - escalate to THINK (deepen analysis), or
  - split the task in PLAN, or
  - add a supervisor review.
- Time‑boxes never override Complete‑Finish; all artifacts and gates remain mandatory. Use them to prevent over‑analysis, not to shorten the process.
- Recommended multipliers for high‑risk work: Strategy×2, Spec×2, Plan×2, Think×2 (tune with supervisor).

## Worthiness & Alignment Gate (Portfolio‑Aware)
- At Strategy, Think, and Review: explicitly answer “Is this worth doing now?”
- Requirements:
  - Link to a task group/epic and Autopilot objective (why it matters)
  - State the success KPI and expected delta (leading + lagging)
  - Identify duplication/alternatives (simpler path, deferral, or not‑do)
  - Record a kill/pivot trigger (pre‑mortem signal to stop)
- Evidence: add a brief “Worthiness” note to the decision journal with epic ID, KPI, and kill trigger

## Method Toolkits Are Living
- The stage toolkits are not exhaustive. They should be expanded, pruned, and reorganized as we learn which methods deliver the best signal.
- Add new methods to `docs/autopilot/STAGE_TOOLKITS.md` with when‑to‑use signals, steps, and explicit evidence mapping (gate/metric/span/journal). Keep them persona‑agnostic and short.

## Canonical Artifacts
- Think Pack (versioned): edge cases, failure modes, oracles, observability, constraints, assumptions, determinism settings
- Evolution Plan: compatibility matrix, deprecation schedule, migration/rollback
- Fitness Function Set: thresholds and run locations (Verify/Monitor)
- ADR entry: rationale, alternatives, revisit-by date

## Stage Guidelines (persona‑agnostic)

### STRATEGIZE
- Outcome: razor‑clear objective, linked to purpose and long‑lived invariants
- **MANDATORY FIRST STEP: Priority Alignment Check**
  - [ ] **Read docs/autopilot/IMPROVEMENT_BATCH_PLAN.md**: What is current phase (0, 1, 2+)?
  - [ ] **Verify task in active phase**: Is this task listed in current phase priorities?
  - [ ] **Check autopilot commands**: `mcp__weathervane__command_autopilot --action list`
  - [ ] **Verify alignment**: Task matches command filter (if "EXCLUSIVELY" → MUST match)
  - [ ] **Check dependencies**: All prerequisite tasks COMPLETE (not in_progress/blocked)
  - [ ] **If NOT aligned**: STOP and ask user before proceeding
- Checklist (≤5 mins):
  - One‑sentence objective + success KPI (add a leading indicator for short feedback)
  - Two invariants you will not break (e.g., phase order; no ungated writes)
  - Top 2 risks with "revisit by" and an explicit risk appetite (low/med/high)
  - Scope guardrails (what's out) and a clear "abort if" trigger (blast‑radius limiter)
- Artifacts: **priority_alignment_check.md** (MANDATORY), objective brief, north‑star invariants, risk register (with dates)
- Acceptance: priority alignment verified AND objective/KPI, invariants, risks, and scope guards recorded
- Method toolkit: see `docs/autopilot/STAGE_TOOLKITS.md#strategy-toolkit`
- **GATE**: Cannot proceed to SPEC without priority alignment check passing

### SPEC
- Outcome: contracts that survive change; explicit compat and budgets
- Checklist (≤10 mins):
  - IO schemas + typed error classes; note idempotency and retry semantics
  - Compatibility: forward/backward envelope, deprec window, kill switch
  - Non‑functional budgets: latency, test runtime, changed‑lines coverage target
  - Observability spec: 2 spans (state.transition, verify) + attrs; where stored
  - Map every spec item → gate/metric (what proves it, where it runs)
- Artifacts: JSON Schemas + error semantics; compat note; budgets; obs spec
- Acceptance: every spec requirement has a proving step defined (used by Plan)
- Method toolkit: see `docs/autopilot/STAGE_TOOLKITS.md#spec-toolkit`

### PLAN
- Outcome: smallest change that integrates at seams and can be rolled back
- Checklist (≤10 mins):
  - Pick the seam/adapter; name any capability flag used
  - Rollback sentence (when to trigger, how to revert) + preconditions checklist
  - Allowed files + max diff lines; note runtime/browsers/deps readiness
  - Verification map: spec→gate/test owners and locations; single‑session feasible (or split)
- Artifacts: plan hash; change budget; migration/rollback note; verification map
- Acceptance: single‑session feasible; rollback clear; spec→proof map complete
- Method toolkit: see `docs/autopilot/STAGE_TOOLKITS.md#plan-toolkit`
 - Integration: declare/update Related · DependsOn · Produces · Consumes in `state/roadmap.dependencies.yaml`; include an integration verification map (which contracts/gates/telemetry are touched and how they’ll be proven).

### THINK
- Outcome: ambiguity resolved; risks, oracles, observability, and constraints defined
- Checklist (≤10 mins):
  - Three edge cases (inputs/env/state/concurrency); note one unknown to test first
  - Two failure modes with how you’ll prove mitigations (test/assert/log/metric)
  - One oracle per risk (assertion/metric query written now, not later)
  - Determinism plan (seed/timeouts/wait‑for) + tiny instrumentation note (what span/counter proves behavior)
- Artifacts: Think Pack vN (edge‑case ledger; failure‑mode notes; oracles; determinism)
- Exit: at least one oracle per high‑risk path; no high×high open; constraints clarified
- Method toolkit: see `docs/autopilot/STAGE_TOOLKITS.md#think-toolkit`
 - Integration: list two integration risks and their oracles (e.g., attestation alignment with compiled prompt, eval variant IDs present, grounded citations recorded, tool allowlists unchanged); note any cross‑item contract updates needed.

### IMPLEMENT
- Outcome: minimal diff that satisfies oracles; spans/counters inserted
- Rules: stay inside edit window; warn at 80% of diff budget, block at 100% unless Plan updated
- Tests: add the two risk tests and the two spans per Spec; keep patch small and focused
- Evidence: record Think Pack/spec version in journal; scoped commit title (what + why)

### VERIFY
- Outcome: all oracles mapped and green; gates pass; integrity clean; outputs semantically correct
- Gates: tests, lint, type, security, license, changed‑lines coverage; (optional) pilot a tiny variance check on flaky‑suspect subset
- Semantic validation:
  - Parse stdout/stderr for warning/error/regression signals; treat non-empty critical warnings as failures unless explicitly allowed
  - Require non-zero assertion counts for key suites; flag trivial tests (no asserts, catch-all try/catch)
  - Normalize and check exit codes; missing/ignored exit codes are failures
- Policies: start with one structural graph policy (changed node must have a test edge)
- Integration checks: run `scripts/roadmap_lint.py` and `scripts/roadmap_integration_check.sh`; attach reports; run end-to-end smokes to prove in-context behavior.
- Telemetry parity: run `node --loader ./tools/wvo_mcp/node_modules/ts-node/esm.mjs tools/wvo_mcp/scripts/check_telemetry_parity.ts --workspace-root . --report state/evidence/<TASK-ID>/verify/telemetry_parity_report.json`; fail closed if OTEL snapshots diverge from JSONL sinks.
- Delta notes: if VERIFY uncovers new commands/tests/artifacts, create/update the Task Delta Note in `monitor/plan.md` and link the produced evidence before leaving this phase.
- Failure: attach failing gate and minimal logs; return to earliest impacted phase; require plan-delta if implementation path is exhausted

### REVIEW
- Outcome: approve only if future‑proof criteria met and outputs mean what they should
- **MANDATORY: Strategic Alignment Verification**
  - [ ] Task still aligns with priorities (no strategy shifts during implementation)
  - [ ] Implementation serves stated goals from STRATEGIZE
  - [ ] No higher-priority work delayed by this task
  - [ ] Opportunity cost was justified (best use of time vs. alternatives)
  - [ ] Follow-up work is scoped and tracked
  - [ ] **If misalignment discovered**: Document what changed, consider discarding/pivoting work
- Rubric: contracts versioned; seams/flags present; budgets respected; tests prove oracles; observability present; non‑goals respected
- Semantic review: verify that logs/results indicate success without hidden warnings; detect "false green" (tests that only run, not assert)
- Portfolio alignment: confirm Worthiness note exists (epic, KPI link, kill/pivot criteria)
- Optional: dual lightweight reviews; surface only disagreements
- **GATE**: Cannot approve if strategic misalignment detected (loop back to STRATEGIZE)

### STRATEGIZE
- Outcome: decide whether to do, defer, pivot, or kill the task based on evidence and portfolio fit (it is valid to remove or completely rewrite a task at this stage).
- Checklist (≤10 mins):
  - Why now: problem statement tied to metrics/incidents/user demand; cite evidence (links to telemetry/incidents/requests).
  - Value hypothesis + KPI: expected impact (e.g., success_rate, groundedness, loop_rate), target delta, and cost envelope (time, tokens, risk class).
  - Alternatives considered: Do Nothing (status quo), Simpler/cheaper path, Policy/process fix; include opportunity cost and cost‑of‑delay.
  - Worthiness test: if impact/effort ratio < threshold, propose kill or defer; include explicit kill/pivot triggers (what evidence cancels work).
  - Duplication scan: search repo/roadmap for similar/overlapping work; prefer integration/extension over duplication.
  - Integration awareness: declare Related · DependsOn · Produces · Consumes in `state/roadmap.dependencies.yaml` (or note “none” with rationale).
  - Risk classification: low/medium/high; list compliance/data/safety considerations; note required redundancy patterns if risk≥medium.
- Artifacts: Strategy note with links to evidence; Worthiness/Alternatives doc; Kill/Pivot triggers; dependency entry or “none” note.
- Acceptance: a clear “Go / Pivot / Kill / Defer” decision with rationale; it is acceptable to kill the task here and return to the backlog with a note.

### PR
- Outcome: PR with evidence chain and attested prompts/manifests; CI green; rollback plan linked
- Include one‑sentence “why now” and a computed risk label

### MONITOR
- Outcome: post‑merge checks validate SLOs and negative oracles; drift detectors and deprecation telemetry in place; learnings captured; warnings remain near zero
- Run tiny BATs/smokes; 24–72h watch for negative oracles; alert on phase‑skip counter > 0 or rising cross‑check discrepancies; capture short learnings if triggered
- Semantic drift: scan logs for warning/error patterns; track `warning_count` and `warning_rate`; open incidents when thresholds are exceeded

## Observability Contract (minimal set)
- Spans: agent.state.transition, agent.verify, agent.cross_check, process.validation (+ process.violation events)
- Attributes: taskId, state, attempt, model.provider, coverageTarget, coverageDelta, failingGate, violation.kind
- Counters: phase_skips_attempted, phase_validations_failed, tasks_rejected_for_process_violation, cross_check_discrepancies
- Files: traces → `state/telemetry/traces.jsonl`, metrics → `state/telemetry/metrics.jsonl`

Defaults (keep unless justified): two spans (state.transition, verify) and one counter (phase_skips_attempted). Everything above ties to evidence (gate, metric, span, or journal link).

## Determinism & De‑Flaking
- Seed randomness; bound timeouts; readiness/wait‑for signals; snapshot determinism documented in Think Pack

## Acceptance (process‑level)
- Strategy/Spec/Plan/Think keep artifacts current with revisit dates
- Implement references Think Pack version and installs observability as specified
- Verify enforces gates + fitness functions and evaluates every oracle; unmapped oracle = failure
- Review uses future‑proof rubric; approves only with complete proofs
- Monitor confirms observability contract and captures learnings

---

See also: OVERVIEW.md, Complete‑Finish‑Policy.md, Observability‑OTel‑GenAI.md, Integration‑Verification.md.
