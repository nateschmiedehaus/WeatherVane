# SPEC: WAVE-0 – Foundation Stabilisation

**Epic ID:** WAVE-0
**Status:** In Progress
**Owner:** Director Dana
**Date:** 2025-11-06

---

## Measurable Outcomes

**WAVE-0 complete when ALL outcomes validated:**

### Outcome 1: Autonomous Task Execution
- **Metric:** Autopilot runs ≥4 hours unattended without human intervention
- **Test:** Start Wave 0 runner, monitor for 4+ hours, log all interventions
- **Success:** Zero manual interventions required (agent selects tasks, executes work, handles errors autonomously)
- **Evidence:** `state/analytics/wave0_runs.jsonl` shows continuous operation
- **Current baseline:** ~1 hour before intervention needed (estimated)

### Outcome 2: Git Worktree Stability
- **Metric:** Zero index.lock incidents across 5 consecutive autopilot runs
- **Test:** Run Wave 0 five times end-to-end, monitor for git errors
- **Success:** No index.lock, no stash conflicts, clean working trees maintained
- **Evidence:** Git logs show no corruption, `git fsck` passes
- **Current baseline:** 1-2 incidents per 10 runs (estimated)

### Outcome 3: Multi-Layer Proof Validation
- **Metric:** All W0 tasks validated at 3 layers (structural + critic + production)
- **Test:** Execute 10 W0 tasks, verify proof system catches issues at each layer
- **Success:**
  - Structural: File organization validates (naming, locations)
  - Critic: AFP/SCAS compliance validates (DesignReviewer, etc.)
  - Production: Real-world outcomes validate (metrics, feedback)
- **Evidence:** `state/evidence/*/verify.md` shows all 3 layers validated
- **Current baseline:** Structural (partial), Critic (partial), Production (missing)

### Outcome 4: Hierarchical Process Enforced
- **Metric:** 100% of WAVE-0 tasks embedded in sets with epic context
- **Test:** Scan roadmap.yaml, verify all tasks have set_id and epic_id
- **Success:**
  - Zero orphan tasks (every task in a set)
  - All sets linked to WAVE-0 epic
  - Epic/set phase docs exist before tasks added
- **Evidence:** Roadmap validation script passes, pre-commit hooks enforcing
- **Current baseline:** ~40% embedded (many orphan tasks)

### Outcome 5: Process Quality Gates
- **Metric:** GATE time reduced 70% (from ~100 min to <30 min average)
- **Test:** Measure GATE phase duration on 10 tasks (time from design.md creation to approval)
- **Success:** Average ≤30 minutes for standard tasks (hierarchy provides context)
- **Evidence:** `state/analytics/gate_metrics.jsonl` shows time reduction
- **Current baseline:** ~100 min average (estimated from past tasks)

### Outcome 6: Evidence Volume Control
- **Metric:** Evidence growth <2MB/month (vs current ~11MB accumulated)
- **Test:** Measure `state/evidence/` size weekly for 4 weeks
- **Success:** Growth rate <500KB/week, total <2MB increase per month
- **Evidence:** Weekly size snapshots in analytics
- **Current baseline:** 11MB total, ~377 files (unconstrained growth)

---

## Functional Requirements

### FR1: Autonomous Task Selection
**The system SHALL:**
- Read roadmap.yaml and identify pending tasks autonomously
- Apply prioritization logic (dependencies, wave sequence, urgency)
- Select next task without human prompt
- Log selection rationale to analytics

**Validation:** Run Wave 0, verify it selects tasks autonomously from roadmap

### FR2: Autonomous Task Execution
**The system SHALL:**
- Execute full AFP 10-phase lifecycle for selected task
- Create evidence bundle (strategy/spec/plan/think/design/implement/verify/review)
- Update task status in roadmap on completion
- Handle transient errors gracefully (retry, backoff)

**Validation:** Monitor Wave 0 executing task end-to-end without intervention

### FR3: Graceful Error Handling
**The system SHALL:**
- Detect when stuck (3 consecutive failures on same step)
- Escalate to human with context (what tried, what failed, proposed fix)
- NOT corrupt repository state on error
- Log all error conditions to analytics

**Validation:** Inject errors (missing file, network timeout), verify graceful handling

### FR4: Multi-Layer Proof Validation
**The system SHALL implement 3 validation layers:**

**Layer 1: Structural Validation**
- File naming conventions (`kebab-case.ts`, `SCREAMING_SNAKE.md`)
- Directory organization (`state/evidence/<TASK>/`, `docs/`, `tools/`)
- Required files present (strategy.md, spec.md, plan.md for sets)

**Layer 2: Critic Validation**
- StrategyReviewer validates strategic thinking (via negativa, alternatives)
- DesignReviewer validates AFP/SCAS compliance (7/9 minimum score)
- ThinkingCritic validates depth of analysis (edge cases, failure modes)
- ProcessCritic validates phase compliance

**Layer 3: Production Validation**
- Metrics tracked (GATE time, evidence size, success rate)
- Feedback loop from production usage
- Pattern fitness measured (how often patterns reused)

**Validation:** Execute task, verify all 3 layers run and catch issues

### FR5: Hierarchical Work Process Enforcement
**The system SHALL:**
- Block epic from having tasks until strategy/spec/plan/think/design exist
- Block set from having tasks until strategy/spec/plan exist
- Require all tasks to have set_id and epic_id (no orphans)
- Enforce via pre-commit hooks (fail commit if violations found)

**Validation:** Attempt to add task without epic docs, verify hook blocks

### FR6: Git Hygiene Automation
**The system SHALL:**
- Lock files during concurrent operations (prevent index.lock)
- Auto-stash uncommitted changes before operations
- Auto-restore stash after operations complete
- Validate working tree clean before starting new task

**Validation:** Run concurrent Wave 0 instances, verify no corruption

### FR7: Evidence Bundle Management
**The system SHALL:**
- Create evidence directory `state/evidence/<TASK-ID>/` on task start
- Write all phase docs to evidence directory (not scattered)
- Include metadata (timestamps, agent, task status)
- Archive old evidence (move to `state/archive/` after 90 days)

**Validation:** Execute task, verify evidence bundle created with all artifacts

### FR8: Analytics and Telemetry
**The system SHALL log to JSONL files:**
- `wave0_runs.jsonl` - execution logs (task, start, end, status, errors)
- `gate_metrics.jsonl` - GATE phase durations
- `proof_validation.jsonl` - validation results from all 3 layers
- `pattern_fitness.jsonl` - pattern reuse tracking

**Validation:** Run task, verify all analytics files updated

---

## Non-Functional Requirements

### NFR1: Performance
- **Task selection:** <5 seconds (read roadmap, select task)
- **Phase transitions:** <10 seconds (write evidence, update status)
- **Full task execution:** <30 minutes for standard tasks (not stuck)
- **Memory footprint:** <500MB for Wave 0 process

### NFR2: Reliability
- **Uptime:** ≥4 hours continuous operation without crash
- **Error recovery:** 95% of transient errors recovered automatically
- **Data integrity:** Zero repository corruptions across 10 runs
- **Graceful degradation:** If critic fails, log warning and continue (don't block)

### NFR3: Maintainability
- **Code simplicity:** ≤500 LOC for Wave 0 core logic (runner + executor)
- **Configuration:** All tunable params in config (not hardcoded)
- **Logging:** All decisions logged with rationale (auditable)
- **Documentation:** README explains how to run, monitor, debug Wave 0

### NFR4: Extensibility
- **Wave N evolution:** Wave 0 → Wave 1 → Wave 2 clear upgrade path
- **Pluggable critics:** Add new critics without changing core logic
- **Custom validators:** Add validation layers without refactoring
- **Pattern library:** Easy to add new AFP/SCAS patterns to library

### NFR5: Observability
- **Real-time monitoring:** Can observe Wave 0 execution in progress
- **Health checks:** Endpoint/command to check Wave 0 status (running, stuck, crashed)
- **Audit trail:** Full history of decisions, actions, outcomes
- **Error diagnosis:** Logs provide enough context to debug failures

---

## Success Criteria (Epic-Level)

**WAVE-0 exits when ALL criteria met:**

### Exit Criterion 1: Autonomy Demonstrated
- [ ] Wave 0 runs ≥4 hours unattended (logged)
- [ ] Completes ≥5 tasks end-to-end without intervention
- [ ] Selects tasks autonomously from roadmap
- [ ] Escalates only when truly stuck (documented in logs)

### Exit Criterion 2: Stability Proven
- [ ] Zero git incidents (index.lock, stash conflicts) across 5 runs
- [ ] Zero repository corruptions (`git fsck` passes)
- [ ] Clean working trees maintained (no uncommitted debris)
- [ ] Git hygiene critic passing consistently

### Exit Criterion 3: Proof System Operational
- [ ] Structural validation automated (file structure checks)
- [ ] Critic validation integrated (DesignReviewer, StrategyReviewer, etc.)
- [ ] Production feedback loop established (metrics tracked)
- [ ] All 3 layers catching issues in practice (evidence in logs)

### Exit Criterion 4: Hierarchy Enforced
- [ ] WAVE-0 epic has all 5 phase docs (strategy/spec/plan/think/design)
- [ ] All W0.M1/M2/M3 milestones organized into sets
- [ ] 100% of tasks embedded in sets (zero orphans)
- [ ] Pre-commit hooks block violations (tested)

### Exit Criterion 5: Process Quality Improved
- [ ] GATE time <30 min average (measured on 10 tasks)
- [ ] Evidence growth <2MB/month (measured weekly × 4)
- [ ] AFP/SCAS compliance 90%+ (DesignReviewer approval rate)
- [ ] Process overhead reduced (time to ship feature, not just phase)

### Exit Criterion 6: Exit Readiness Review Passed
- [ ] Guardrail baseline established (dashboard green)
- [ ] Wave 0 validation report published (`state/evidence/W0-EXIT-READINESS/`)
- [ ] Lessons learned documented (what worked, what broke, gaps)
- [ ] Wave 1 scope defined based on W0 gaps

### Exit Criterion 7: Documentation Complete
- [ ] WAVE-0 epic phase docs (strategy/spec/plan/think/design) published
- [ ] Process guides updated (how to use hierarchy, gates, critics)
- [ ] Templates extracted (epic/set templates from W0 examples)
- [ ] README files guide new contributors through hierarchy

---

## Acceptance Tests

### Test 1: Autonomous Execution (4-hour soak)
```bash
# Start Wave 0
cd tools/wvo_mcp && npm run wave0 &
WAVE0_PID=$!

# Monitor for 4 hours
timeout 14400 tail -f state/analytics/wave0_runs.jsonl

# Verify no interventions needed
ps aux | grep $WAVE0_PID  # Should still be running
grep "escalation" state/analytics/wave0_runs.jsonl  # Should be empty or rare
```

**Pass criteria:** Wave 0 runs 4+ hours, completes ≥3 tasks, zero manual interventions

### Test 2: Git Stability (5-run marathon)
```bash
# Run Wave 0 five times sequentially
for i in {1..5}; do
  echo "Run $i"
  cd tools/wvo_mcp && npm run wave0:once  # Single task
  git fsck --full  # Check integrity
  test -f .git/index.lock && echo "FAIL: index.lock found" && exit 1
done
```

**Pass criteria:** All 5 runs complete, no index.lock errors, `git fsck` passes

### Test 3: Multi-Layer Proof (10-task sample)
```bash
# Execute 10 tasks, verify 3-layer validation
for task in $(head -10 tasks.txt); do
  # Structural layer
  test -d "state/evidence/$task" || echo "FAIL: Missing evidence dir"

  # Critic layer
  grep "DesignReviewer.*approved" "state/evidence/$task/verify.md" || echo "FAIL: No critic validation"

  # Production layer
  grep "metrics" "state/analytics/proof_validation.jsonl" || echo "FAIL: No production validation"
done
```

**Pass criteria:** All 10 tasks validated at all 3 layers, issues caught at appropriate layer

### Test 4: Hierarchical Enforcement
```bash
# Attempt to add task without epic docs
echo "  - id: ORPHAN-TASK" >> state/roadmap.yaml
git add state/roadmap.yaml
git commit -m "test: orphan task"  # Should FAIL due to pre-commit hook

# Verify hook blocked
test $? -eq 0 && echo "FAIL: Hook should have blocked commit"
```

**Pass criteria:** Pre-commit hook blocks orphan task, provides clear error message

### Test 5: GATE Time Reduction
```bash
# Measure GATE phase on 10 tasks
for task in $(head -10 gate_tasks.txt); do
  START=$(date +%s)
  # Create design.md
  cp docs/templates/design_template.md state/evidence/$task/design.md
  # Fill it out...
  # Run DesignReviewer
  cd tools/wvo_mcp && npm run gate:review $task
  END=$(date +%s)
  DURATION=$((END - START))
  echo "$task,$DURATION" >> gate_times.csv
done

# Calculate average
awk -F, '{sum+=$2} END {print sum/NR}' gate_times.csv  # Should be <1800 (30 min)
```

**Pass criteria:** Average GATE time ≤30 minutes across 10 tasks

---

## Out of Scope (Explicitly NOT in WAVE-0)

### Features deferred to WAVE-1 (Governance):
- Distributed consensus (multi-agent decision making)
- Advanced conflict resolution
- Automated code review (beyond critics)
- Self-modification of core process

### Features deferred to WAVE-2 (Knowledge):
- Semantic search over evidence
- Pattern recommendation engine
- Automated documentation generation
- Cross-project learning

### Features deferred to WAVE-3+ (Advanced):
- Multi-repository orchestration
- Cloud deployment automation
- Production monitoring integration
- User-facing features (forecasting, APIs)

**WAVE-0 scope:** Foundation ONLY (autonomous execution, proof validation, hierarchical process, git stability)

---

## Risk Acceptance

### Accepted Risk 1: Wave 0 May Be Too Minimal
- **Risk:** Wave 0 too simple, lacks features needed for real autonomy
- **Acceptance:** This is a learning exercise - gaps inform Wave 1
- **Mitigation:** Capture all gaps in learnings doc, define Wave 1 scope

### Accepted Risk 2: Process May Feel Heavy Initially
- **Risk:** Epic/set gates slow down initial task creation
- **Acceptance:** Short-term friction for long-term clarity
- **Mitigation:** Show value through GATE time reduction, evidence volume control

### Accepted Risk 3: Hierarchy May Need Revision
- **Risk:** 5-level hierarchy (META/PROJECT/EPIC/SET/TASK) proves wrong fit
- **Acceptance:** We'll learn from W0, can revise in W1
- **Mitigation:** Track hierarchy pain points, survey team quarterly

---

## Dependencies

### External Dependencies:
- **Git:** Version 2.30+ (for worktree safety features)
- **Node.js:** v18+ (for TypeScript execution)
- **npm:** v9+ (for workspaces support)
- **Pre-commit:** Hooks framework installed

### Internal Dependencies:
- **W0.M1 Complete:** Autopilot core (supervisor, agents, libs, adapters) integrated
- **W0.M2 Complete:** Test harness (TaskFlow) operational for safe validation
- **W0.M3 In Progress:** Hierarchical process templates (this epic creates them)

### Blockers:
- None currently identified (all dependencies met or in progress)

---

## Metrics Dashboard (Track Weekly)

| Metric | Baseline | W0 Target | W1 Target | Current |
|--------|----------|-----------|-----------|---------|
| Autopilot uptime | ~1 hour | ≥4 hours | ≥24 hours | TBD |
| Git incidents | 1-2/10 runs | 0/5 runs | 0/20 runs | TBD |
| GATE time (min) | ~100 | <30 | <15 | TBD |
| Evidence growth | Unconstrained | <2MB/mo | <1MB/mo | 11MB total |
| Task embedding | ~40% | 100% | 100% | TBD |
| AFP/SCAS score | ~6/9 | 7/9+ | 8/9+ | TBD |
| Success rate | Unknown | ≥80% | ≥95% | TBD |

**Measurement frequency:** Weekly snapshots, monthly reviews

---

## Constraints

### Time Constraints:
- **WAVE-0 duration:** 4-6 weeks (started 2025-11-05)
- **Phase doc creation:** ≤2 hours per epic doc (not days)
- **GATE phase:** <30 min average (target, not hard limit)

### Resource Constraints:
- **LOC budget:** ≤500 LOC for Wave 0 core (already met)
- **Evidence size:** <2MB growth per month
- **Memory:** <500MB for Wave 0 process
- **Disk:** <100MB for all W0 artifacts

### Quality Constraints:
- **AFP/SCAS minimum:** 7/9 score on all work
- **Test coverage:** 7/7 dimensions (per UNIVERSAL_TEST_STANDARDS.md)
- **Documentation:** All decisions rationale documented
- **Proof validation:** All 3 layers operational

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md (how milestones integrate)
**Owner:** Director Dana
**Reviewers:** Claude Council, Atlas
