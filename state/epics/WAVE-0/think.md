# THINK: WAVE-0 – Foundation Stabilisation

**Epic ID:** WAVE-0
**Status:** In Progress
**Owner:** Director Dana
**Date:** 2025-11-06

---

## Edge Cases (Epic-Level)

### Edge Case 1: Bootstrap Paradox Handling
**Scenario:** WAVE-0 epic needs phase docs before tasks, but we're already executing WAVE-0 tasks

**Current state:**
- W0.M1 complete (30+ tasks executed)
- W0.M2 complete (test harness built)
- W0.M3 in progress (hierarchy being built)
- BUT: WAVE-0 epic has no phase docs (violates own rules)

**How handled:**
- Create epic docs retroactively (this task: AFP-W0-EPIC-BOOTSTRAP)
- Document WAVE-0 as it exists (not as we wish it was)
- Epic docs become proof of bootstrap strategy working
- Enforcement starts AFTER WAVE-0 compliant (not before)

**Why this works:**
- Concrete before abstract (WAVE-0 real, not hypothetical)
- Honest documentation (acknowledges bootstrap paradox)
- Enforcement deferred until self-compliant (avoid hypocrisy)

### Edge Case 2: Multi-Milestone Epic Sequencing
**Scenario:** M3 creates hierarchy, but M1/M2 already complete without hierarchy

**Potential issue:**
- Retrospective embedding (organizing already-done work)
- Risk of rewriting history (inauthentic evidence)
- Tension between "complete" (M1/M2 done) and "incomplete" (not embedded)

**How handled:**
- M1/M2 marked "COMPLETE" (they achieved their goals)
- Migration task (AFP-HIERARCHY-W0M1-MIGRATION) organizes them into sets
- Migration creates NEW artifacts (set phase docs), doesn't modify M1/M2 evidence
- Roadmap.yaml updated with set structure, but original evidence intact

**Why this works:**
- Respects historical truth (M1/M2 were complete when done)
- Migration is NEW work (not revision of old work)
- Sets provide context retrospectively (helpful, not deceptive)

### Edge Case 3: Circular Dependency (Epic Docs Need Epic Scope, But Scope Defined in Docs)
**Scenario:** Can't write epic strategy until we know scope, but scope is defined in strategy

**How breaking cycle:**
- Start with problem (known: fragmented autopilot, no hierarchy)
- Define goal based on problem (establish foundation)
- Scope emerges from goal (M1: autopilot, M2: testing, M3: hierarchy)
- Strategy documents this reasoning (not the other way around)

**Why this works:**
- Problem-first thinking (not solution-first)
- Goals follow from problems (not arbitrary)
- Scope is consequence of goals (not input)

### Edge Case 4: Epic Spans Multiple Repositories
**Scenario:** What if WAVE-0 required changes to external repos?

**Not an issue for WAVE-0:**
- All work contained in WeatherVane mono-repo
- No external dependencies requiring code changes

**If this were an issue:**
- Epic plan.md documents external changes required
- Set-level tasks handle each external repo
- Integration task coordinates across repos
- Epic exit criteria include all repos validated

### Edge Case 5: Epic Goals Change Mid-Execution
**Scenario:** Discover during M2 that hierarchy not needed (M3 becomes irrelevant)

**How handled:**
- Epic spec.md defines exit criteria (can test if goals met)
- If M1+M2 achieve all outcomes (autonomy, stability, proof), M3 optional
- Kill criteria: MetaCritic quarterly review assesses hierarchy value
- Can exit epic early if goals met (document why M3 skipped)

**Current status:**
- M1+M2 validated hierarchy needed (gaps documented)
- M3 addresses those gaps (not speculative)
- Early exit unlikely, but option exists

### Edge Case 6: Epic Never Completes (Infinite Scope Creep)
**Scenario:** WAVE-0 keeps expanding, WAVE-1 never starts

**Prevention mechanisms:**
1. **Strict exit criteria** (spec.md defines what "done" means)
2. **Time box** (4-6 weeks max, started 2025-11-05)
3. **Scope locked** (new work → WAVE-1, not W0.M4)
4. **Milestone gates** (each milestone must complete before next starts)

**If detected:**
- Director Dana reviews progress weekly
- If >6 weeks without exit, force exit readiness review
- Document gaps as WAVE-1 scope (accept imperfect foundation)
- Ship foundation, iterate in W1

---

## Failure Modes (Epic-Level)

### Failure Mode 1: Foundation Too Heavy (Process Overhead > Value)
**Symptom:** Engineers spend more time on phase docs than actual work

**Detection:**
- MetaCritic quarterly review: Time spent on docs vs. features
- Survey: "Is hierarchy helpful or burdensome?"
- Metrics: GATE time increasing (not decreasing)

**Mitigation:**
- Kill criteria defined (if burden > benefit, simplify)
- Quarterly review (not continuous - let pattern emerge)
- Via negativa: Delete hierarchy levels if not providing value

**Escalation:**
- If GATE time >50 min average (worse than baseline)
- If survey <50% "hierarchy helpful"
- Director Dana makes kill decision (not automatic)

### Failure Mode 2: Enforcement Too Strict (Blocks Legitimate Work)
**Symptom:** Pre-commit hooks rejecting valid commits, engineers frustrated

**Detection:**
- High `--no-verify` usage (>20% of commits)
- Git hook override justifications reviewed
- Engineer complaints about false positives

**Mitigation:**
- Smart enforcement (not dumb rules)
- Clear error messages with remediation guidance
- Appeal process (Director Dana can override hook)

**Escalation:**
- If >30% commits using `--no-verify`
- Review hook logic, fix false positives
- Consider loosening gates (better loose than ignored)

### Failure Mode 3: Hierarchy Becomes Compliance Theater
**Symptom:** Phase docs exist but are superficial, checkbox thinking

**Detection:**
- Critics finding many concerns (low approval rate)
- Docs <500 words (too minimal for epic)
- Copy-paste between epics (not authentic)

**Mitigation:**
- Critics enforce substance (reject superficial docs)
- OutcomeCritic validates measurability (reject vague)
- Code review catches copy-paste (human oversight)

**Escalation:**
- If >50% epic docs blocked by critics
- Review examples, provide better guidance
- May need to revise templates (make clearer)

### Failure Mode 4: Autopilot Can't Navigate Hierarchy
**Symptom:** Wave 0 struggles with epic/set context, makes poor decisions

**Detection:**
- Task selection errors (picking wrong priority)
- Context misunderstanding (task doesn't fit epic goal)
- Analytics show low success rate (<60%)

**Mitigation:**
- Provide clear context propagation (epic → set → task)
- Wave 0 reads epic/set docs before task selection
- Fall back to human selection if confidence low

**Escalation:**
- If Wave 0 success rate <70% (below target)
- Review context representation (may need summary)
- Wave 1 improvement: Better context embedding

### Failure Mode 5: Migration Breaks Existing Work
**Symptom:** Reorganizing M1 tasks into sets corrupts evidence or breaks references

**Detection:**
- Evidence bundle integrity checks fail
- Git history shows deleted evidence
- Broken links in documentation

**Mitigation:**
- Migration doesn't modify existing evidence (only adds sets)
- Test migration on copy of roadmap first
- Validate all references still work post-migration

**Escalation:**
- If any evidence lost: STOP, rollback, investigate
- Restore from git history
- Fix migration logic before retrying

### Failure Mode 6: Epic Docs Diverge from Reality
**Symptom:** Epic strategy says one thing, actual execution does another

**Detection:**
- Exit readiness review compares spec to reality
- Outcomes not achieved (spec promised X, got Y)
- Milestones don't match plan.md sequence

**Mitigation:**
- Keep epic docs living (update when scope changes)
- Don't backfill justifications (honest documentation)
- Quarterly review: Do epic docs match reality?

**Escalation:**
- If major divergence detected, update epic docs
- Document why divergence happened (learning)
- If divergence too large, consider epic failure

---

## Dependencies (Epic-Level)

### External Dependencies:

**Git (version 2.30+):**
- **Why needed:** Worktree safety, file locking features
- **Risk:** Older git lacks safety features (index.lock more frequent)
- **Mitigation:** Document minimum version in README
- **Blocker if:** Git <2.30 installed (upgrade required)

**Node.js (v18+) and npm (v9+):**
- **Why needed:** TypeScript execution, workspaces support
- **Risk:** Older versions lack features (ESM, workspace protocol)
- **Mitigation:** `.nvmrc` file specifies version
- **Blocker if:** Node <18 (Wave 0 won't run)

**Pre-commit hooks framework:**
- **Why needed:** Enforcement automation (gate validation)
- **Risk:** Not installed = no enforcement
- **Mitigation:** Setup script installs hooks
- **Blocker if:** Hooks not installed (enforcement manual)

### Internal Dependencies:

**W0.M1 Complete (Autopilot Core):**
- **Status:** ✅ COMPLETE (2025-11-05)
- **Provides:** Autonomous execution capability
- **Risk:** If M1 broken, can't validate M3 hierarchy with Wave 0
- **Mitigation:** M1 live-fire validated before M3 start

**W0.M2 Complete (Test Harness):**
- **Status:** ✅ COMPLETE (estimated)
- **Provides:** Safe testing environment
- **Risk:** If M2 broken, can't test M3 changes safely
- **Mitigation:** M2 validated with TaskFlow before M3 start

**Existing roadmap.yaml structure:**
- **Status:** 🔄 EVOLVING (adding sets, epics)
- **Provides:** Task inventory to organize
- **Risk:** If roadmap corrupt, migration fails
- **Mitigation:** Backup before migration, validate structure

**Existing critics (DesignReviewer, StrategyReviewer, etc.):**
- **Status:** ✅ OPERATIONAL
- **Provides:** Quality validation
- **Risk:** If critics broken, can't validate epic docs
- **Mitigation:** Test critics before relying on them

### Cross-Epic Dependencies:

**WAVE-1 (Governance):**
- **Relationship:** WAVE-0 must complete before WAVE-1 starts
- **Why:** Can't govern unstable foundation
- **Risk:** Pressure to start W1 early (skip W0 exit criteria)
- **Mitigation:** Strict W0 exit gates (Director Dana enforces)

**WAVE-2 (Knowledge):**
- **Relationship:** Needs W0 hierarchy to organize knowledge
- **Why:** Knowledge embedded in epic/set/task structure
- **Risk:** W2 planned before W0 complete (premature)
- **Mitigation:** W0 exit criteria include hierarchy proven

---

## Assumptions (Epic-Level)

### Assumption 1: Autonomy is Valuable
**Assumption:** Autonomous task execution worth the investment (M1 effort)
**If false:** M1 wasted, Wave 0 doesn't achieve goal
**Validation:** Wave 0 running for 4+ hours unattended (test ongoing)
**Status:** Partially validated (running, but <4 hours so far)

### Assumption 2: Hierarchy Scales
**Assumption:** 5-level hierarchy (META/PROJECT/EPIC/SET/TASK) doesn't become bureaucracy
**If false:** Engineers circumvent hierarchy, compliance theater
**Validation:** GATE time <30 min (hierarchy provides context, not burden)
**Status:** Unvalidated (need to measure GATE time with hierarchy)

### Assumption 3: Proof-Driven Catches Issues
**Assumption:** 3-layer validation (structural/critic/production) effective
**If false:** Issues slip through, validation overhead without benefit
**Validation:** 10 tasks × 3 layers, issues caught at appropriate layer
**Status:** Partially validated (structural + critic working, production layer TODO)

### Assumption 4: Git Hygiene is Solvable
**Assumption:** File locking + stash automation prevents index.lock
**If false:** Repository corruption risk persists, can't run unattended
**Validation:** 5 consecutive runs, zero incidents
**Status:** Unvalidated (need 5-run marathon test)

### Assumption 5: Engineers Will Follow Process
**Assumption:** Pre-commit hooks + clear docs = compliance
**If false:** High `--no-verify` usage, enforcement ignored
**Validation:** <10% commits using `--no-verify`
**Status:** Unvalidated (hooks not yet deployed)

### Assumption 6: Foundation Before Features is Right Strategy
**Assumption:** Better to stabilize W0 before starting W1 features
**If false:** Lost time, could have built features in parallel
**Validation:** W1 development faster because W0 foundation exists
**Status:** Unvalidated (won't know until W1 starts)

---

## Complexity Analysis (Epic-Level)

### Added Complexity:
1. **5-level hierarchy** (META/PROJECT/EPIC/SET/TASK)
   - Cognitive overhead: Understanding which level for what
   - Navigational overhead: Finding docs across 5 levels

2. **Mandatory embedding** (all tasks in sets, all sets in epics)
   - Enforcement overhead: Pre-commit hooks, gate validation
   - Documentation overhead: Set phase docs for even 1-task sets

3. **Hierarchical critics** (MetaCritic, VisionCritic, OutcomeCritic, ClusterCritic)
   - Validation overhead: More critics = more checks
   - Maintenance overhead: Keep critics in sync

4. **Bidirectional flow** (upward pattern harvest, downward context propagation)
   - Understanding overhead: How patterns flow up/down
   - Coordination overhead: Ensure patterns captured and applied

### Complexity Justified If:
- **ROI positive:** Time saved (GATE reduction, unnecessary work prevented) > time spent (phase docs)
- **Quality improved:** Fewer issues, better designs, cleaner code
- **Autonomy enabled:** Wave 0 makes better decisions with hierarchy context
- **Scales:** W1/W2/W3 easier because foundation exists

### Complexity Kill Criteria:
- **GATE time >50 min:** Hierarchy making things worse, not better
- **Engineer satisfaction <50%:** Process burden, not help
- **Evidence growth accelerating:** Hierarchy creating more overhead, not less
- **Autonomy degrading:** Wave 0 less effective with hierarchy

**Review frequency:** Quarterly (MetaCritic)

---

## Mitigation Strategies

### Strategy 1: Incremental Rollout
- Don't enforce all levels immediately
- Start with epic level (WAVE-0 bootstrap)
- Add set level (M3 migration)
- Consider META/PROJECT later (WAVE-1)

### Strategy 2: Clear Examples
- WAVE-0 epic docs = reference implementation
- Templates extracted from real examples (not abstract)
- Documentation points to examples (not just rules)

### Strategy 3: Escape Hatches
- `--no-verify` flag for legitimate exceptions
- Director Dana can override gates (appeal process)
- MetaCritic can recommend simplification (kill criteria)

### Strategy 4: Continuous Validation
- Weekly metrics review (GATE time, evidence growth)
- Quarterly MetaCritic (is hierarchy helping?)
- Exit readiness review (before declaring W0 complete)

### Strategy 5: Honest Documentation
- Don't backfill justifications (document as we go)
- Acknowledge bootstrap paradox (WAVE-0 retrofitted)
- Document failures and gaps (not just successes)

---

## Open Questions

### Question 1: Should META Level Be Required Now?
**Trade-off:** META level documents process governance (why AFP/SCAS, how process evolves)
- **Pro:** Complete 5-level hierarchy
- **Con:** May be premature (process still evolving)
- **Decision:** Phase 2 creates META templates, but enforcement optional (can add later)

### Question 2: How Often to Harvest Patterns?
**Trade-off:** Pattern harvesting (task → set → epic → project) could be:
- Continuous (on every commit)
- Periodic (weekly/monthly)
- Manual (when needed)
- **Decision:** Defer to WAVE-1 (W0 establishes hierarchy, W1 automates flow)

### Question 3: Should Sets Be Optional for Single-Task Epics?
**Trade-off:** Epic with 1 task still needs set (adds overhead)
- **Pro optional:** Reduces overhead for simple epics
- **Con optional:** Inconsistent (some tasks in sets, some not)
- **Decision:** Mandatory (user requirement: "all tasks have to be in sets")

### Question 4: How to Handle Cross-Epic Dependencies?
**Trade-off:** Task in WAVE-0 depends on task in WAVE-1
- **Option A:** Block WAVE-0 until WAVE-1 provides dependency
- **Option B:** WAVE-0 provides placeholder, WAVE-1 replaces
- **Decision:** Defer to when encountered (not a W0 issue currently)

---

**Think complete:** 2025-11-06
**Next phase:** design.md (architecture patterns and AFP/SCAS validation)
**Owner:** Director Dana
**Reviewers:** Claude Council, Atlas
