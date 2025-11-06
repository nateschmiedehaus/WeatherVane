# SPEC: WAVE-1 – Governance & AFP Enforcement

**Epic ID:** WAVE-1
**Status:** Pending
**Date:** 2025-11-06

---

## Measurable Outcomes

### Outcome 1: Automated Quality Gates Block Non-Compliant Work
- **Metric:** 95%+ commits pass all critic gates on first attempt
- **Test:** Track compliance rate in `state/analytics/governance_metrics.jsonl` for 4 weeks
- **Success:** ≥95% first-pass success, critics catch real issues (validated by random audit)
- **Evidence:** Pre-commit logs show blocks, remediations created, quality maintained
- **Current baseline:** N/A (no automated gates exist)

### Outcome 2: Roadmap Structure Validated Automatically
- **Metric:** Zero invalid roadmap commits merge (100% structure compliance)
- **Test:** Attempt to commit orphan tasks, circular dependencies, invalid schemas - all blocked
- **Success:** Schema validation prevents all structural violations
- **Evidence:** Pre-commit hook blocks, clear error messages guide fixes
- **Current baseline:** Roadmap structure manually checked (inconsistent)

### Outcome 3: Complete Work Ledger and Audit Trail
- **Metric:** 100% of work trackable (who/what/when/why answerable)
- **Test:** Query audit trail for random sample (n=20), verify complete history
- **Success:** Every decision has evidence bundle, rationale preserved
- **Evidence:** `state/roadmap.yaml` + `state/evidence/` form complete ledger
- **Current baseline:** ~80% tracked (some work ad-hoc)

### Outcome 4: Remediation Loop Creates Learning
- **Metric:** ≥10 remediations analyzed, patterns identified, process improved
- **Test:** Mine remediation analytics, identify top 3 recurring issues, implement fixes
- **Success:** Remediation rate declining (patterns addressed reduce repeat issues)
- **Evidence:** `state/analytics/remediation_patterns.json` shows learning
- **Current baseline:** No remediation loop (manual follow-up ad-hoc)

### Outcome 5: Governance Overhead < Review Time Saved
- **Metric:** Compliance time < 30min/task, review time eliminated (~60min/task)
- **Test:** Measure time to pass gates vs. time for manual review (saved ≥50%)
- **Success:** Net time savings, engineers report productivity gain
- **Evidence:** Time tracking, satisfaction surveys
- **Current baseline:** ~60 min manual review per task

### Outcome 6: Override Rate Low (Governance Trusted)
- **Metric:** <5% of commits use `--no-verify` override
- **Test:** Track override usage in `state/analytics/governance_overrides.jsonl`
- **Success:** Rare overrides with legitimate justifications (not frustration)
- **Evidence:** Override logs reviewed monthly, patterns addressed
- **Current baseline:** N/A (no enforcement to override)

---

## Functional Requirements

### FR1: Critic Integration with Pre-Commit Hooks
**The system SHALL:**
- Integrate DesignReviewer, StrategyReviewer, ThinkingCritic, ProcessCritic with `.husky/pre-commit`
- Block commits if any critic reports concerns (exit code 1)
- Provide clear error messages with remediation guidance
- Log all blocks to analytics for pattern mining

**Validation:** Stage design.md with concerns, attempt commit, verify blocked with clear message

### FR2: Roadmap Schema Validation
**The system SHALL:**
- Validate epic/milestone/task/set structure against schema
- Enforce embedding (all tasks in sets, all sets in epics)
- Check dependencies (no circular deps, no missing blockers)
- Validate exit criteria format and completeness

**Validation:** Attempt to commit roadmap with orphan task, verify blocked; commit valid structure, verify allowed

### FR3: Work Ledger Completeness Checking
**The system SHALL:**
- Verify all tasks in roadmap have evidence bundles
- Check evidence bundles contain required phase docs (strategy/spec/plan/think/design)
- Detect missing documentation and block merge
- Generate audit reports on demand

**Validation:** Commit task without evidence bundle, verify blocked; complete bundle, verify allowed

### FR4: Automatic Remediation Task Creation
**The system SHALL:**
- When critic blocks commit, create remediation task automatically
- Format: `AFP-<ORIGINAL-TASK>-REMEDIATION-<TIMESTAMP>`
- Include critic concerns in task description
- Add to roadmap with reference to original task

**Validation:** Get blocked by critic, verify remediation task created in roadmap with correct format and details

### FR5: Override Tracking and Analytics
**The system SHALL:**
- Log all `--no-verify` usage with timestamp, user, justification (from commit message)
- Track override rate (percentage of commits)
- Generate monthly override reports
- Flag high override rate (>10%) for review

**Validation:** Use `--no-verify`, verify logged; check monthly report includes override with justification

### FR6: Guardrail Catalog and Documentation
**The system SHALL:**
- Maintain guardrail catalog in `meta/afp_scas_guardrails.yaml`
- Document each rule (what, why, how enforced)
- Include kill criteria (when to remove guardrail)
- Provide automated health check script

**Validation:** Read guardrail catalog, verify all rules documented; run health check, verify passes

### FR7: Audit Trail Querying
**The system SHALL:**
- Enable queries: "Who changed X?", "Why was Y decided?", "When did Z happen?"
- Combine roadmap history + git history + evidence bundles
- Export audit reports (CSV, JSON)
- Support time-range and task filtering

**Validation:** Query "why was AFP-W0-EPIC-BOOTSTRAP created?", verify returns strategy.md rationale

---

## Non-Functional Requirements

### NFR1: Performance (Gate Speed)
- **Requirement:** Pre-commit gates complete in <30 seconds (typical case)
- **Rationale:** Slow gates frustrate engineers, increase bypass temptation
- **Test:** Measure gate time over 100 commits, verify 95th percentile <30s
- **Mitigation:** Parallel critic execution, caching, incremental analysis

### NFR2: Reliability (Gate Uptime)
- **Requirement:** 99%+ gate availability (rarely fails due to infrastructure)
- **Rationale:** Gate failures block all work, critical path
- **Test:** Monitor gate failures over 4 weeks, verify <1% failure rate
- **Mitigation:** Graceful degradation (warn if critic fails, don't block)

### NFR3: Usability (Clear Error Messages)
- **Requirement:** 90%+ engineers understand error message without help
- **Rationale:** Unclear errors increase override rate, frustration
- **Test:** Survey engineers on error clarity, verify >90% "easy to understand"
- **Mitigation:** Include remediation guidance, examples, references to docs

### NFR4: Maintainability (Critic Tunability)
- **Requirement:** Adjust critic thresholds without code changes (config-driven)
- **Rationale:** Tuning critics requires iteration, can't redeploy constantly
- **Test:** Change AFP/SCAS threshold in config, verify takes effect immediately
- **Mitigation:** Externalize all thresholds, patterns, rules to config files

### NFR5: Observability (Governance Metrics)
- **Requirement:** Real-time governance dashboards (compliance rate, override rate, etc.)
- **Rationale:** Can't improve what's not measured
- **Test:** View dashboard, verify metrics updated within 5 minutes of commit
- **Mitigation:** Stream analytics to dashboard, JSONL logs queryable

---

## Acceptance Criteria (Exit Gates)

### Gate 1: Quality Gates Operational
- [ ] All 4 critics (Design/Strategy/Thinking/Process) integrated with pre-commit
- [ ] Commits blocked when critics have concerns (tested with intentional violations)
- [ ] Clear error messages guide remediation (verified by engineer feedback)
- [ ] False positive rate <10% (measured over 50 commits)

### Gate 2: Roadmap Gating Enforced
- [ ] Schema validation blocks invalid structure (tested with orphans, circular deps)
- [ ] Embedding validation catches unlinked tasks/sets (tested with manual violations)
- [ ] Dependency validation prevents premature starts (tested with blocked dependencies)
- [ ] Exit criteria format validated (tested with malformed criteria)

### Gate 3: Work Ledger Complete
- [ ] All tasks in roadmap have evidence bundles (100% coverage verified)
- [ ] Evidence bundles contain required docs (automated check passing)
- [ ] Audit queries functional (10 test queries answered correctly)
- [ ] Tamper detection operational (tested with unauthorized edit)

### Gate 4: Remediation Loop Functional
- [ ] Blocked commits create remediation tasks (tested with 5 blocks)
- [ ] Remediation format correct (task ID, description, reference)
- [ ] Analytics logged (remediation_patterns.json populated)
- [ ] Patterns identified (≥3 recurring issues documented)

### Gate 5: Guardrails Documented
- [ ] Guardrail catalog complete (all rules listed in meta/afp_scas_guardrails.yaml)
- [ ] Each rule documented (what/why/how/kill criteria)
- [ ] Health check script passing (automated validation)
- [ ] Documentation published (engineers can reference)

### Gate 6: Metrics Demonstrate Success
- [ ] Compliance rate ≥95% (measured over 4 weeks, n≥50 commits)
- [ ] Override rate <5% (tracked, legitimate justifications)
- [ ] Time saved > time spent (net ROI positive)
- [ ] Quality maintained (random audit n=20, zero defects)

### Gate 7: Exit Readiness Review Passed
- [ ] All W1.M1 tasks complete
- [ ] Documentation complete (governance guides published)
- [ ] WAVE-2 unblocked (foundation + governance proven)
- [ ] Stakeholder approval (Director Dana signs off)

---

## Out of Scope (Explicitly NOT in WAVE-1)

### Features deferred to later waves:
- **Advanced pattern mining** (ML-based) → WAVE-5 (need data first)
- **Automated critic tuning** (self-improving) → WAVE-5 (need feedback loop first)
- **Cross-repository governance** → WAVE-4 (single repo for now)
- **Predictive quality gates** (catch issues before they happen) → WAVE-5 (need historical data)

### Governance NOT enforced:
- **Code quality metrics** (test coverage, complexity) → WAVE-2 (after knowledge base)
- **Performance benchmarks** → WAVE-3 (stress testing)
- **Security scanning** → WAVE-3 (reliability focus)
- **Dependency vulnerability checks** → WAVE-2 (knowledge gathering)

**WAVE-1 scope:** AFP/SCAS process enforcement ONLY (not code quality, performance, security)

---

## Dependencies

### External:
- Git hooks framework (husky) installed ✅
- Pre-commit infrastructure operational ✅
- Node.js + npm (critic execution environment) ✅

### Internal:
- WAVE-0 M1 complete (critics exist: DesignReviewer, StrategyReviewer, ThinkingCritic, ProcessCritic) ✅
- WAVE-0 M3 complete (hierarchical structure: epic/set/task) ⏳ (in progress)
- Roadmap.yaml structure stable ✅
- Evidence bundle convention established ✅

### Blockers:
- None identified (all dependencies met or in progress)

---

## Constraints

### Time:
- **WAVE-1 duration:** 2-3 weeks (after WAVE-0 exits)
- **W1.M1 duration:** 2-3 weeks (single milestone)
- **Per-task time:** ≤3 days (9 tasks × 3 days = 27 days max)

### Resource:
- **LOC budget:** ~1000 LOC (enforcement logic, hooks, analytics)
- **Evidence size:** <5MB (governance documentation)
- **Disk:** <100MB (analytics logs)

### Quality:
- **AFP/SCAS minimum:** 7/9 score (governance itself must be AFP/SCAS compliant)
- **Test coverage:** 7/7 dimensions (per UNIVERSAL_TEST_STANDARDS.md)
- **Documentation:** All decisions rationale documented

---

## Metrics Dashboard

| Metric | Baseline | W1 Target | W2+ Target | Measurement |
|--------|----------|-----------|------------|-------------|
| Compliance rate | N/A | ≥95% | ≥98% | First-pass success % |
| Override rate | N/A | <5% | <2% | `--no-verify` usage % |
| Remediation rate | N/A | <20% | <10% | Blocks requiring rework % |
| False positive rate | N/A | <10% | <5% | Legitimate overrides % |
| Audit coverage | ~80% | 100% | 100% | Work with evidence % |
| Time saved | 0 | ≥30min/task | ≥45min/task | Review time eliminated |
| Quality defects | Unknown | 0 | 0 | Post-merge issues found |

**Measurement frequency:** Weekly snapshots, monthly reviews, quarterly deep dives

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md (how W1.M1 implements governance)
**Owner:** Director Dana
