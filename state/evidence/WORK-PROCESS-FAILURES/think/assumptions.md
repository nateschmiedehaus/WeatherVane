# WORK-PROCESS-FAILURES Assumptions

**Date**: 2025-10-29
**Task**: Comprehensive Quality & Reasoning Assurance System
**Phase**: THINK
**Complexity**: 10/10

---

## Assumption Register

### ASM-001: Developers Will Use System Honestly

**Assumption**: Developers will not intentionally circumvent quality checks

**Why We Assume This**:
- Team culture values quality
- Checks designed to help, not punish
- Gaming behavior is rational response to bad incentives

**Risk if Wrong**:
- Checks bypassed systematically
- False sense of security
- Quality degrades invisibly

**Validation**:
- [ ] Monitor for bypass patterns (T0DO vs TODO)
- [ ] Track suppression rate (high = bad incentives)
- [ ] Red team exercise (try to fool system)
- [ ] Anonymous feedback on check usefulness

**Mitigation if Wrong**:
- Adversarial detection (see Pre-Mortem Scenario 4)
- Semantic analysis instead of regex
- Focus on helping vs policing
- Improve check quality to reduce bypass motivation

**Status**: DOCUMENTED

---

### ASM-002: Bash Scripts Are Sufficient

**Assumption**: Bash scripts can implement all required checks without needing compiled language

**Why We Assume This**:
- Simple checks (lint, test, type)
- Existing tooling is CLI-based
- Speed: bash process orchestration is fast

**Risk if Wrong**:
- Performance too slow (bash overhead)
- Complex logic hard to maintain
- Platform compatibility issues (Windows)

**Validation**:
- [x] Benchmark bash vs TypeScript for simple checks
- [ ] Measure bash overhead on large codebases
- [ ] Test cross-platform (macOS, Linux, WSL)

**Mitigation if Wrong**:
- Rewrite critical path checks in TypeScript
- Use compiled binaries for performance-critical operations
- Maintain bash for orchestration, TypeScript for logic

**Status**: PARTIALLY VALIDATED (benchmarked, not cross-platform tested)

---

### ASM-003: MCP Server Health Check is Reliable

**Assumption**: HTTP request to localhost:3000/health is sufficient to determine MCP server health

**Why We Assume This**:
- Standard health check pattern
- Server exposes /health endpoint
- Fast check (<100ms)

**Risk if Wrong**:
- False positives (server responds but degraded)
- False negatives (health endpoint down, server functional)
- Network issues cause spurious failures

**Validation**:
- [ ] Test health check during server degradation
- [ ] Verify health endpoint reflects actual server state
- [ ] Measure false positive/negative rate

**Mitigation if Wrong**:
- Enhanced health check (test actual MCP operation, not just HTTP)
- Multiple checks (health + capability test)
- Retry logic with exponential backoff

**Status**: DOCUMENTED (not yet validated)

---

### ASM-004: 80% Test Coverage is Sufficient

**Assumption**: >80% line coverage indicates adequate testing

**Why We Assume This**:
- Industry standard threshold
- Balance between effort and confidence
- Diminishing returns beyond 80%

**Risk if Wrong**:
- Critical paths untested (<80% overall, but 0% on critical)
- False confidence (coverage ≠ quality)
- Trivial tests pad coverage

**Validation**:
- [ ] Analyze coverage distribution (is critical code covered?)
- [ ] Review test quality (assertions vs presence)
- [ ] Compare coverage to bug rate

**Mitigation if Wrong**:
- Require 100% coverage on critical paths
- Add coverage quality checks (assertions, branches)
- Differentiate integration vs unit test coverage

**Status**: DOCUMENTED

---

### ASM-005: Daily Hunt Frequency is Sufficient

**Assumption**: Running hunt script once per day (02:00 UTC) is frequent enough to catch latent issues

**Why We Assume This**:
- Most issues caught by continuous checks (watch mode, CI)
- Hunt for archaeology, not urgent issues
- Balance between thoroughness and resource usage

**Risk if Wrong**:
- Latent issues accumulate undetected
- 24-hour gap too long for critical issues
- Issues fixed before hunt runs (not tracked)

**Validation**:
- [ ] Track issue discovery time distribution
- [ ] Measure: How many issues found by hunt vs other checks?
- [ ] Experiment with 6-hour hunt frequency

**Mitigation if Wrong**:
- Increase frequency (every 6 hours)
- Prioritize hunt based on recent changes
- Run hunt on-demand when suspicious

**Status**: DOCUMENTED

---

### ASM-006: Git is Source of Truth for Changes

**Assumption**: Using git diff to determine changed files is reliable for incremental checks

**Why We Assume This**:
- Git is source control system
- All changes go through git
- Industry standard practice

**Risk if Wrong**:
- Untracked files missed
- Dirty state during development causes issues
- Git repository corruption breaks checks

**Validation**:
- [x] Test with untracked files (handled via git status --porcelain)
- [x] Test with dirty state (caught by pre-flight)
- [ ] Test with git corruption (error handling needed)

**Mitigation if Wrong**:
- Fallback: Check all files if git unavailable
- Warning: Show untracked files in report
- Graceful degradation: Skip git checks if repository broken

**Status**: MOSTLY VALIDATED

---

### ASM-007: Roadmap Contains All Tasks

**Assumption**: state/roadmap.yaml is canonical source for all tasks, including FIX-* tasks

**Why We Assume This**:
- Single source of truth
- Roadmap used for task routing, prioritization
- Auto-created tasks append to roadmap

**Risk if Wrong**:
- Tasks exist outside roadmap (lost tracking)
- Roadmap becomes stale
- Duplicate tracking systems

**Validation**:
- [ ] Verify all FIX-* tasks in roadmap
- [ ] Check for orphaned tasks in filesystem
- [ ] Audit: Are there tracking systems besides roadmap?

**Mitigation if Wrong**:
- Periodic reconciliation (scan filesystem, compare to roadmap)
- Enforce: Task creation only via roadmap
- Consolidate: Migrate other tracking to roadmap

**Status**: DOCUMENTED (requires validation)

---

### ASM-008: Thresholds Are Universal

**Assumption**: Same quality thresholds (file size 500, complexity 15, coverage 80%) apply to all code types

**Why We Assume This**:
- Simplicity (easier to understand, enforce)
- Consistency (no special cases)
- Fair (same standard for all)

**Risk if Wrong**:
- Test files need different thresholds (higher complexity OK)
- Generated code needs exclusions (can't control size)
- Prototypes need relaxed standards (exploratory code)

**Validation**:
- [x] Identified need for file-type-specific thresholds (tests, generated, prototypes)
- [ ] Measure actual distribution of metrics by file type
- [ ] Survey team: Are thresholds reasonable?

**Mitigation if Wrong**:
- File-type-specific thresholds (.test.ts = 25 complexity, .generated.ts = exempt)
- Configuration: .qualityrc.json with per-type overrides
- Documentation: Explain why different standards

**Status**: INVALIDATED (different thresholds needed per file type)

---

### ASM-009: Cron is Available

**Assumption**: Cron (or equivalent) is available for scheduled jobs on deployment environment

**Why We Assume This**:
- Standard on Unix systems
- Used for daily hunt, dashboard generation
- Reliable scheduling mechanism

**Risk if Wrong**:
- No scheduled execution (hunt never runs)
- System depends on manual triggering
- Deployment environment doesn't have cron (Docker, serverless)

**Validation**:
- [ ] Verify cron available in deployment environment
- [ ] Test cron job creation and execution
- [ ] Check alternative schedulers (systemd timers, Kubernetes CronJob)

**Mitigation if Wrong**:
- Alternative schedulers: systemd timers, Kubernetes CronJob
- Fallback: Manual triggering with reminders
- Cloud-native: AWS EventBridge, GCP Cloud Scheduler

**Status**: DOCUMENTED (environment-dependent)

---

### ASM-010: Evidence Quality Can Be Measured Automatically

**Assumption**: Evidence quality (completeness, specificity, substantiveness) can be scored algorithmically

**Why We Assume This**:
- Size heuristics (>500 words = likely substantive)
- Vocabulary diversity (Shannon entropy)
- Template detection (fuzzy matching)
- Cross-linking analysis

**Risk if Wrong**:
- False positives (long but low-quality evidence passes)
- False negatives (concise high-quality evidence fails)
- Gaming (pad with boilerplate to pass size check)

**Validation**:
- [ ] Manually score sample evidence (gold standard)
- [ ] Compare automated score to manual score
- [ ] Measure correlation (r > 0.7 acceptable)
- [ ] Iterate on scoring algorithm

**Mitigation if Wrong**:
- Human sampling (audit 10% of evidence manually)
- Multi-dimensional scoring (not just size)
- Machine learning (train on manually scored examples)
- Conservative: Err on side of false negatives (fail dubious evidence)

**Status**: DOCUMENTED (requires validation experiment)

---

### ASM-011: WorkProcessEnforcer Can Block Transitions

**Assumption**: WorkProcessEnforcer has authority to block state transitions when checks fail

**Why We Assume This**:
- Designed for enforcement
- Already blocks on other conditions
- Critical integration point

**Risk if Wrong**:
- WorkProcessEnforcer bypassed
- Checks run but don't block
- False sense of enforcement

**Validation**:
- [ ] Review WorkProcessEnforcer architecture
- [ ] Test: Does block work for new check types?
- [ ] Verify: No bypass mechanisms exist

**Mitigation if Wrong**:
- Redesign integration (different hook point)
- Add secondary enforcement (CI blocks merge)
- Log all bypasses, alert on attempts

**Status**: DOCUMENTED (requires code review)

---

### ASM-012: False Positives Are Acceptable <10%

**Assumption**: FP rate <10% is tolerable, won't cause alert fatigue

**Why We Assume This**:
- Research: FP rates <5% considered excellent, <10% good
- 90% precision is high bar
- Team tolerance for noise

**Risk if Wrong**:
- Even 10% FP causes fatigue
- Team abandons system
- Real issues missed in noise

**Validation**:
- [ ] Measure actual FP rate in first month
- [ ] Survey team: What FP rate is acceptable?
- [ ] Track: Alerts ignored vs acted upon

**Mitigation if Wrong**:
- Lower threshold: Target <5% FP
- Aggressive tuning: Disable high-FP checks
- User control: Allow per-developer sensitivity tuning

**Status**: DOCUMENTED (requires post-deployment data)

---

## Assumptions Summary

| ID | Assumption | Status | Risk if Wrong | Validation Plan |
|----|-----------|--------|---------------|-----------------|
| ASM-001 | Developers use honestly | DOCUMENTED | HIGH | Monitor bypass patterns, red team |
| ASM-002 | Bash is sufficient | PARTIAL | MEDIUM | Cross-platform testing |
| ASM-003 | MCP health check reliable | DOCUMENTED | LOW | Test during degradation |
| ASM-004 | 80% coverage sufficient | DOCUMENTED | MEDIUM | Analyze coverage distribution |
| ASM-005 | Daily hunt sufficient | DOCUMENTED | LOW | Measure issue discovery time |
| ASM-006 | Git is source of truth | MOSTLY VALID | MEDIUM | Test git corruption |
| ASM-007 | Roadmap contains all tasks | DOCUMENTED | LOW | Periodic reconciliation |
| ASM-008 | Thresholds universal | **INVALIDATED** | HIGH | File-type-specific thresholds |
| ASM-009 | Cron available | DOCUMENTED | HIGH | Environment verification |
| ASM-010 | Evidence quality measurable | DOCUMENTED | MEDIUM | Validation experiment |
| ASM-011 | WorkProcessEnforcer blocks | DOCUMENTED | HIGH | Code review + test |
| ASM-012 | <10% FP acceptable | DOCUMENTED | HIGH | Post-deployment measurement |

**Total Assumptions**: 12
**Validated**: 1.5 (ASM-006 mostly, ASM-002 partially)
**Documented**: 9.5
**Invalidated**: 1 (ASM-008 - need file-type-specific thresholds)

**High-Risk Assumptions** (need validation priority):
1. ASM-001: Honest usage (mitigation: semantic analysis)
2. ASM-008: Universal thresholds (mitigation: file-type overrides) ← INVALIDATED
3. ASM-009: Cron available (mitigation: alternative schedulers)
4. ASM-011: WorkProcessEnforcer blocks (mitigation: code review)
5. ASM-012: <10% FP tolerable (mitigation: aggressive tuning)

---

## Assumptions → Implementation Impact

**Task 1.3 (Quality Checks)** must handle:
- ASM-008 invalidated: Implement file-type-specific thresholds

**Task 3.1 (Failure Parser)** must handle:
- ASM-002: Consider TypeScript rewrite if bash too slow

**Task 6.2 (WorkProcessEnforcer)** must validate:
- ASM-011: Verify blocking authority works

**Task X.1 (Testing)** must validate:
- ASM-001: Red team adversarial testing
- ASM-003: Test MCP health check reliability
- ASM-004: Analyze coverage distribution

**Task X.3 (Performance)** must address:
- ASM-002: Benchmark bash vs TypeScript

**New Task Needed**: ASM-010 validation experiment (evidence quality scoring accuracy)

---

## Assumptions Complete

12 assumptions documented, 1 invalidated (ASM-008 → file-type thresholds needed), 5 high-risk requiring validation priority. All assumptions cross-referenced with implementation plan.
