# WORK-PROCESS-FAILURES Specification

**Date**: 2025-10-29
**Task**: Comprehensive Quality & Reasoning Assurance System
**Phase**: SPEC
**Scope**: Detects technical failures, quality lapses, AND reasoning flaws

---

## Acceptance Criteria

### AC1: Pre-Flight Checks Integrated (Technical + Quality + Reasoning)
**Priority**: CRITICAL
**Description**: Before any task starts, automated pre-flight checks verify system health, code quality, and work process compliance

**Requirements**:
1. Script: `scripts/preflight_check.sh` exists and is executable
2. **Technical Checks**:
   - Build passes: `npm run build` → exit 0
   - Tests pass: `npm test` → exit 0
   - Type check passes: `npm run typecheck` → exit 0
   - Lint passes: `npm run lint` → exit 0
   - No uncommitted changes: `git status --porcelain` → empty
   - Dependencies installed: `node_modules/` exists
   - MCP server healthy: `curl http://localhost:3000/health` → 200
3. **Quality Checks** (NEW):
   - No files >500 lines: `find src/ -name "*.ts" -exec wc -l {} + | awk '$1>500'` → empty
   - No functions >50 lines: `npm run check:function-size` → exit 0
   - No TODOs in prod: `grep -r "TODO\|FIXME" src/ --exclude="*.test.ts"` → empty
   - Test coverage >80%: `npm run test:coverage` → all ≥80%
   - No magic numbers: `npm run check:magic-numbers` → exit 0
4. **Reasoning Checks** (NEW):
   - All assumptions documented: `bash scripts/check_assumptions.sh` → exit 0
   - Work process evidence exists: `bash scripts/check_evidence.sh` → exit 0
   - Adversarial questions answered: `bash scripts/check_adversarial_review.sh` → exit 0
5. Exit code: 0 if all pass, non-zero if any fail
6. Output: JSON report with pass/fail for each check (technical + quality + reasoning)
7. Performance: Completes in <30s
8. Integration: Called at start of IMPLEMENT phase (autopilot) and before VERIFY (manual)

**Verification**:
```bash
# Test 1: Clean state passes
bash scripts/preflight_check.sh
echo $? # Expected: 0

# Test 2: Dirty state fails
echo "test" > temp.txt
git add temp.txt
bash scripts/preflight_check.sh
echo $? # Expected: non-zero

# Test 3: Broken build fails
echo "syntax error" >> src/test.ts
bash scripts/preflight_check.sh
echo $? # Expected: non-zero

# Test 4: Performance check
time bash scripts/preflight_check.sh # Expected: <30s
```

**Evidence**:
- [ ] Script exists at `scripts/preflight_check.sh`
- [ ] All 7 checks implemented
- [ ] JSON report generated
- [ ] Performance <30s verified
- [ ] WorkProcessEnforcer integration complete
- [ ] Manual test execution passes

---

### AC2: Failure Hunting Protocol Established
**Priority**: CRITICAL
**Description**: Daily automated scans proactively hunt for latent failures

**Requirements**:
1. Script: `scripts/hunt_failures.sh` exists and is executable
2. Scans performed:
   - Flaky tests: Run full test suite 10x, identify non-deterministic tests
   - Dead code: Find unused exports, unreachable code
   - Type coverage: Find files with `any` types, missing type annotations
   - Security vulnerabilities: `npm audit` → 0 vulnerabilities
   - Outdated dependencies: `npm outdated` → check for security updates
   - Disabled tests: Find `.skip`, `.only`, commented tests
   - Build warnings: Capture and categorize all warnings
   - Lint warnings: Capture and categorize all warnings
3. Output: JSON report with findings categorized by severity
4. Storage: Reports saved to `state/analytics/failure_hunt_reports/YYYY-MM-DD.json`
5. Scheduling: Cron job runs daily at 02:00 UTC
6. Alert threshold: >5 new critical findings → notify

**Verification**:
```bash
# Test 1: Hunt script runs successfully
bash scripts/hunt_failures.sh
echo $? # Expected: 0

# Test 2: Report generated
test -f state/analytics/failure_hunt_reports/$(date +%Y-%m-%d).json
echo $? # Expected: 0

# Test 3: Flaky test detection works
# Manually create flaky test, run hunt, verify detected

# Test 4: Dead code detection works
# Create unused export, run hunt, verify detected

# Test 5: Cron job scheduled
crontab -l | grep hunt_failures.sh # Expected: entry exists
```

**Evidence**:
- [ ] Script exists at `scripts/hunt_failures.sh`
- [ ] All 8 scan types implemented
- [ ] JSON report format documented
- [ ] Cron job scheduled
- [ ] Alert logic implemented
- [ ] Manual test execution passes
- [ ] Sample report generated

---

### AC3: Zero-Skip Policy Enforced
**Priority**: CRITICAL
**Description**: System prevents task completion with any failures present

**Requirements**:
1. WorkProcessEnforcer VERIFY stage updated:
   - Runs pre-flight checks before marking task complete
   - Blocks completion if any critical failures exist
   - Logs block reason to telemetry
2. Git pre-commit hook installed:
   - Runs fast checks (<5s): lint, type check (incremental)
   - Blocks commit if critical failures found
   - Shows helpful error message with fix suggestions
3. CI pipeline updated:
   - Runs full test suite on every push
   - Blocks merge if any failures
   - Auto-creates fix tasks for failures
4. No bypass mechanism:
   - No `--no-verify` flag in scripts
   - No `SKIP_TESTS` environment variable
   - Emergency override requires manual file edit + justification comment

**Verification**:
```bash
# Test 1: WorkProcessEnforcer blocks on failure
# Simulate failure (break test), try to mark task done, verify blocked

# Test 2: Pre-commit hook blocks
echo "syntax error" >> src/test.ts
git commit -m "test" # Expected: blocked with error message

# Test 3: CI blocks merge
# Create PR with failing test, verify CI fails

# Test 4: No bypass possible
git commit --no-verify -m "test" # Expected: still blocked
SKIP_TESTS=1 npm test # Expected: env var ignored
```

**Evidence**:
- [ ] WorkProcessEnforcer updated with verification logic
- [ ] Pre-commit hook installed via Husky
- [ ] CI pipeline configured
- [ ] Bypass prevention verified
- [ ] Manual test execution passes
- [ ] Documentation updated with policy

---

### AC4: Auto-Task Creation for Failures
**Priority**: HIGH
**Description**: Every detected failure automatically creates a remediation task in roadmap

**Requirements**:
1. Failure parser: `tools/wvo_mcp/scripts/parse_failure.ts`
   - Parses test failure output (Vitest, Jest format)
   - Parses build failure output (TypeScript, ESLint format)
   - Extracts: test name, file path, line number, error message, stack trace
   - Generates unique hash for deduplication
2. Task creator: `tools/wvo_mcp/scripts/create_fix_task.ts`
   - Creates roadmap task with ID format: `FIX-{TYPE}-{SHORT_HASH}`
   - Sets priority based on failure severity
   - Populates description with error details + repro steps
   - Sets exit criteria: Test/build passes + no regressions
   - Adds to appropriate domain (mcp or product)
3. Integration:
   - CI calls on test/build failure
   - Hunt script calls for discovered issues
   - Health check daemon calls for service failures
4. Deduplication:
   - Check if task with same hash already exists
   - Update existing task (increment occurrence count)
   - Don't create duplicate tasks

**Verification**:
```bash
# Test 1: Parse test failure
npm test 2>&1 | npx tsx tools/wvo_mcp/scripts/parse_failure.ts --type test
# Expected: JSON with parsed failure details

# Test 2: Create task from failure
cat failure.json | npx tsx tools/wvo_mcp/scripts/create_fix_task.ts
# Expected: Task added to state/roadmap.yaml

# Test 3: Deduplication works
# Create same failure twice, verify only one task created

# Test 4: CI integration
# Push failing test, verify task auto-created
```

**Evidence**:
- [ ] parse_failure.ts implemented with tests
- [ ] create_fix_task.ts implemented with tests
- [ ] CI integration complete
- [ ] Hunt script integration complete
- [ ] Deduplication logic verified
- [ ] Manual test execution passes

---

### AC5: Detection Speed < 5 Minutes
**Priority**: HIGH
**Description**: 95% of failures detected within 5 minutes of occurrence

**Requirements**:
1. Watch mode runners:
   - `npm run watch:test` - Rerun tests on file change
   - `npm run watch:build` - Rebuild on file change
   - `npm run watch:typecheck` - Type check on file change
   - All watch modes running during active development
2. Health check daemon:
   - `scripts/health_check_daemon.sh` runs every 60s
   - Checks: MCP server health, database connection, file system integrity
   - Logs failures immediately to `state/analytics/health_checks.jsonl`
3. Telemetry:
   - Log timestamp when change occurs (file modified)
   - Log timestamp when failure detected (test fails)
   - Calculate Time to Detection (TTD)
   - Export metrics to `state/analytics/detection_metrics.jsonl`
4. Target: p95 TTD < 5min

**Verification**:
```bash
# Test 1: Watch modes work
npm run watch:test & # Start in background
echo "failing test" >> src/test.ts # Introduce failure
sleep 10 # Wait for detection
grep "FAIL" logs/watch_test.log # Expected: failure detected

# Test 2: Health check daemon works
bash scripts/health_check_daemon.sh &
# Simulate MCP server crash
sleep 60 # Wait for health check
grep "MCP_DOWN" state/analytics/health_checks.jsonl # Expected: logged

# Test 3: TTD metrics collected
# Introduce failure, wait for detection, check metrics
cat state/analytics/detection_metrics.jsonl | jq '.ttd_seconds' # Expected: <300
```

**Evidence**:
- [ ] Watch mode scripts implemented
- [ ] Health check daemon implemented
- [ ] Telemetry logging complete
- [ ] TTD metrics collection working
- [ ] p95 TTD <5min verified (sample of 20 failures)

---

### AC6: Dashboard and Reporting
**Priority**: MEDIUM
**Description**: Real-time dashboard shows failure count, trends, and status

**Requirements**:
1. Dashboard JSON: `state/analytics/failure_dashboard.json`
   - Current failure count by severity (critical, high, medium, low)
   - Trend: failures over last 7 days (chart data)
   - Top 5 failure types (by frequency)
   - MTTR by severity (mean time to resolution)
   - Zero-skip compliance rate (% tasks passing VERIFY)
   - Last update timestamp
2. Dashboard generator: `scripts/generate_dashboard.sh`
   - Reads from failure logs, telemetry, roadmap
   - Computes metrics
   - Writes JSON to dashboard file
   - Runs every 5 minutes via cron
3. Visualization:
   - JSON can be consumed by any dashboard tool
   - Initial target: File-based dashboard (JSON + Markdown)
   - Future: Web UI (Next.js page)

**Verification**:
```bash
# Test 1: Dashboard generation works
bash scripts/generate_dashboard.sh
test -f state/analytics/failure_dashboard.json
echo $? # Expected: 0

# Test 2: Dashboard content valid
cat state/analytics/failure_dashboard.json | jq '.failure_count'
# Expected: Valid JSON with required fields

# Test 3: Cron job scheduled
crontab -l | grep generate_dashboard.sh # Expected: entry exists

# Test 4: Dashboard updates automatically
# Wait 5 minutes, check timestamp changed
```

**Evidence**:
- [ ] Dashboard JSON schema documented
- [ ] Dashboard generator script implemented
- [ ] Cron job scheduled
- [ ] Sample dashboard generated
- [ ] Manual verification of metrics accuracy

---

### AC7: Learning System Integrated
**Priority**: MEDIUM
**Description**: Every failure generates a learning entry, updates prevention layer

**Requirements**:
1. Learning capture: `scripts/capture_learning.sh <failure_id>`
   - Prompts for: What went wrong? Root cause? Prevention strategy?
   - Creates learning entry: `docs/learnings/YYYY-MM-DD-{topic}.md`
   - Updates relevant documentation (CLAUDE.md, work process docs)
   - Adds automated check if possible (pre-flight, hunt script)
2. Learning review: `scripts/review_learnings.sh`
   - Shows all learnings from last 30 days
   - Identifies patterns (same root cause multiple times)
   - Suggests meta-learnings (learnings about the learning process)
3. Prevention layer update:
   - Every learning MUST result in a prevention update
   - Either: new pre-flight check, hunt scan, CI gate, documentation
   - Track: Which learning led to which prevention
   - Verify: Prevention catches the failure type

**Verification**:
```bash
# Test 1: Capture learning works
bash scripts/capture_learning.sh FIX-TEST-abc123
# Expected: Creates docs/learnings/YYYY-MM-DD-test-failure.md

# Test 2: Learning review works
bash scripts/review_learnings.sh
# Expected: Shows all learnings with summaries

# Test 3: Prevention layer updated
# Create learning, verify pre-flight check added or hunt scan updated

# Test 4: Prevention catches failure
# Re-introduce same failure, verify caught by new prevention
```

**Evidence**:
- [ ] Learning capture script implemented
- [ ] Learning review script implemented
- [ ] Prevention update workflow documented
- [ ] Sample learning entry created
- [ ] Prevention effectiveness verified (caught re-introduced failure)

---

### AC8: Performance Acceptable
**Priority**: MEDIUM
**Description**: Automation overhead doesn't slow down development workflow

**Requirements**:
1. Pre-commit hook: <5s (fast checks only)
2. Pre-flight check: <30s (comprehensive checks)
3. Hunt script: <5min (daily scan can be slow)
4. Dashboard generation: <10s
5. Watch mode CPU usage: <10% per runner
6. Disk space: <100MB for all logs/reports (with rotation)
7. CI pipeline: <10min total (parallel execution)

**Verification**:
```bash
# Test 1: Pre-commit speed
time git commit -m "test" # Expected: <5s

# Test 2: Pre-flight speed
time bash scripts/preflight_check.sh # Expected: <30s

# Test 3: Hunt script speed
time bash scripts/hunt_failures.sh # Expected: <5min

# Test 4: Dashboard speed
time bash scripts/generate_dashboard.sh # Expected: <10s

# Test 5: Watch mode CPU
npm run watch:test &
sleep 30
ps aux | grep "npm run watch:test" | awk '{print $3}' # Expected: <10%

# Test 6: Disk usage
du -sh state/analytics/ # Expected: <100MB

# Test 7: CI speed
# Measure CI pipeline duration # Expected: <10min
```

**Evidence**:
- [ ] All timing requirements met
- [ ] CPU usage within bounds
- [ ] Disk usage within bounds
- [ ] CI pipeline optimized (caching, parallel execution)

---

### AC9: Quality Gate Enforcement
**Priority**: HIGH
**Description**: Automated quality gates prevent poor design, unmaintainable code, and incomplete work

**Requirements**:
1. Script: `scripts/check_quality_gates.sh` exists and is executable
2. **Architecture Quality**:
   - Design quality score >0.85: `npm run analyze:design-quality` → score ≥0.85
   - Coupling check: `npm run analyze:coupling` → all modules loosely coupled
   - Cohesion check: `npm run analyze:cohesion` → all modules highly cohesive
3. **Maintainability**:
   - Maintainability index >65: `npm run analyze:maintainability` → all files ≥65
   - Cyclomatic complexity <15: `npm run analyze:complexity` → all functions <15
   - File size <500 lines: `find src/ -name "*.ts" | xargs wc -l` → all <500
   - Function size <50 lines: `npm run check:function-size` → all <50
4. **Completeness**:
   - No TODOs in prod: `grep -r "TODO\|FIXME\|XXX" src/ --exclude="*.test.ts"` → 0 results
   - No placeholder values: `grep -r "PLACEHOLDER\|TBD\|TODO" src/` → 0 results
   - No magic numbers: `npm run check:magic-numbers` → 0 violations
   - Error handling complete: `npm run check:error-handling` → all external calls wrapped
5. **Documentation**:
   - API docs complete: `npm run check:jsdoc` → 100% public APIs documented
   - README up-to-date: `bash scripts/check_doc_drift.sh` → no drift detected
6. Integration: Run before VERIFY phase (manual) and in CI pipeline (automated)
7. Output: JSON report with scores, violations, and recommendations

**Verification**:
```bash
# Test 1: Quality gates pass on clean code
bash scripts/check_quality_gates.sh
echo $? # Expected: 0

# Test 2: Large file triggers violation
# Create 600-line file
bash scripts/check_quality_gates.sh
echo $? # Expected: non-zero

# Test 3: TODO triggers violation
echo "// TODO: fix this" >> src/test.ts
bash scripts/check_quality_gates.sh
echo $? # Expected: non-zero

# Test 4: Complexity violation
# Create function with complexity >15
bash scripts/check_quality_gates.sh
echo $? # Expected: non-zero
```

**Evidence**:
- [ ] Quality gate script implemented
- [ ] All 6 quality checks working
- [ ] JSON report format documented
- [ ] CI integration complete
- [ ] Manual test verification passes
- [ ] Violations create FIX-QUAL-* tasks

---

### AC10: Reasoning Validation Enforcement
**Priority**: HIGH
**Description**: Automated reasoning checks prevent unchallenged assumptions, skipped thinking, and incomplete analysis

**Requirements**:
1. Script: `scripts/check_reasoning.sh` exists and is executable
2. **Assumption Validation**:
   - Scan for assumption keywords: `grep -r "assume\|should\|will\|always\|never" src/ docs/` → all documented
   - Check assumption register: `cat state/evidence/$TASK_ID/think/assumptions.md` → exists + non-empty
   - Validate assumptions tested: Each assumption has verification plan
3. **Work Process Compliance**:
   - All phases complete: `ls state/evidence/$TASK_ID/{strategize,spec,plan,think,implement,verify,review,pr,monitor}` → all exist
   - Evidence quality: Each phase has substantive content (not generic templates)
   - Phase sequence correct: Timestamps show STRATEGIZE → SPEC → ... → MONITOR order
4. **Adversarial Review**:
   - Review exists: `cat state/evidence/$TASK_ID/review/adversarial_review.md` → exists
   - Minimum questions: Review has ≥10 adversarial questions
   - Quality threshold: ≥8/10 questions have satisfactory answers
   - Gaps addressed: Any identified gaps either fixed or explicitly deferred
5. **Pre-Mortem (for complexity≥8)**:
   - Pre-mortem exists: `cat state/evidence/$TASK_ID/think/pre_mortem.md` → exists
   - Failure scenarios: ≥5 potential failure modes identified
   - Mitigations: Each failure mode has mitigation strategy
6. **Decision Documentation**:
   - Alternatives considered: Major decisions show ≥2 alternatives evaluated
   - Rationale documented: Each decision has justification
   - Trade-offs explicit: Pros/cons listed for each alternative
7. Integration: Run before VERIFY phase (manual) and by WorkProcessEnforcer (automated)
8. Output: JSON report with pass/fail for each check, specific violations

**Verification**:
```bash
# Test 1: Complete evidence passes
TASK_ID=WORK-PROCESS-FAILURES bash scripts/check_reasoning.sh
echo $? # Expected: 0

# Test 2: Missing phase fails
rm -rf state/evidence/$TASK_ID/think
bash scripts/check_reasoning.sh
echo $? # Expected: non-zero

# Test 3: Undocumented assumption fails
echo "// We assume users will..." >> src/test.ts
bash scripts/check_reasoning.sh
echo $? # Expected: non-zero (assumption not in register)

# Test 4: Incomplete adversarial review fails
# Review has only 5 questions (need 10)
bash scripts/check_reasoning.sh
echo $? # Expected: non-zero
```

**Evidence**:
- [ ] Reasoning validation script implemented
- [ ] All 7 reasoning checks working
- [ ] JSON report format documented
- [ ] WorkProcessEnforcer integration complete
- [ ] Manual test verification passes
- [ ] Violations create FIX-REASON-* tasks

---

### AC11: Autopilot & Manual Mode Integration
**Priority**: CRITICAL
**Description**: System works identically in autopilot (automated) and manual Claude Code sessions

**Requirements**:
1. **Shared Scripts**: All check scripts callable from both modes
   - `scripts/preflight_check.sh` - Same checks, same thresholds
   - `scripts/check_quality_gates.sh` - Same quality standards
   - `scripts/check_reasoning.sh` - Same reasoning validation
   - `scripts/hunt_failures.sh` - Same scans
2. **Autopilot Integration**:
   - WorkProcessEnforcer calls pre-flight at IMPLEMENT start
   - Quality gates checked before VERIFY
   - Reasoning validation before marking task complete
   - Failures block state transitions
3. **Manual Integration**:
   - CLAUDE.md instructs manual invocation
   - Same exit codes trigger same behavior
   - Same telemetry logged (source: "manual")
   - Same task auto-creation
4. **Enforcement Parity**:
   - Git hooks block both modes
   - CI pipeline validates both modes
   - Zero-skip policy applies to both
   - Quality thresholds identical
5. **Telemetry**:
   - Log execution source (autopilot vs manual)
   - Track compliance rate by source
   - Compare quality metrics by source
   - Dashboard shows both

**Verification**:
```bash
# Test 1: Autopilot mode (simulated)
SOURCE=autopilot bash scripts/preflight_check.sh
# Verify: Logged with source="autopilot"

# Test 2: Manual mode
SOURCE=manual bash scripts/preflight_check.sh
# Verify: Logged with source="manual", same checks run

# Test 3: Enforcement works in both
# Introduce failure, verify both modes blocked

# Test 4: Telemetry tracks both
cat state/analytics/preflight_runs.jsonl | jq '.source' | sort | uniq
# Expected: ["autopilot", "manual"]
```

**Evidence**:
- [ ] All scripts support SOURCE parameter
- [ ] WorkProcessEnforcer integration complete
- [ ] CLAUDE.md updated with manual instructions
- [ ] Telemetry logs source correctly
- [ ] Both modes verified working
- [ ] Enforcement parity confirmed

---

## Out of Scope

**Explicitly NOT included in this task:**

1. **Production Monitoring**: This task focuses on development/CI failures, not runtime failures in production
2. **APM Integration**: No Datadog, Sentry, or New Relic integration (separate task)
3. **Machine Learning**: No AI-based failure prediction (future enhancement)
4. **Auto-Fix**: System detects and creates tasks, but doesn't automatically fix (too risky)
5. **Cross-Repo Failures**: Only monitors WeatherVane mono-repo, not external dependencies
6. **Performance Regressions**: Not tracking performance metrics, only functional failures
7. **Web UI**: Dashboard is JSON-based, no visual web interface (future enhancement)

---

## Dependencies

**Required Before Implementation**:
- [x] ROADMAP-STRUCT complete (for auto-task creation)
- [ ] Node.js 18+ installed
- [ ] npm 8+ installed
- [ ] Git configured
- [ ] Husky installable (for git hooks)
- [ ] Cron available (for scheduling)

**Will Install During Implementation**:
- Husky (git hooks)
- lint-staged (fast pre-commit checks)
- Any missing dev dependencies

---

## Verification Matrix

| AC # | Requirement | Verification Method | Pass Criteria |
|------|-------------|---------------------|---------------|
| AC1 | Pre-flight script exists | File check | File at `scripts/preflight_check.sh` |
| AC1 | All 7 checks implemented | Code review | Each check in script |
| AC1 | Performance <30s | Timing test | `time` output <30s |
| AC1 | WorkProcessEnforcer integration | Code review | VERIFY stage calls script |
| AC2 | Hunt script exists | File check | File at `scripts/hunt_failures.sh` |
| AC2 | All 8 scans implemented | Code review | Each scan in script |
| AC2 | Daily cron scheduled | Cron check | `crontab -l` shows entry |
| AC2 | Reports generated | File check | JSON files in `state/analytics/` |
| AC3 | Pre-commit hook installed | Git hook check | `.husky/pre-commit` exists |
| AC3 | WorkProcessEnforcer blocks | Integration test | Simulated failure blocked |
| AC3 | CI blocks merge | CI test | Failing PR blocked |
| AC3 | No bypass possible | Bypass test | `--no-verify` doesn't work |
| AC4 | Failure parser works | Unit test | Parses sample failures |
| AC4 | Task creator works | Integration test | Creates roadmap task |
| AC4 | Deduplication works | Test | Same failure → one task |
| AC4 | CI integration | CI test | Failure → task created |
| AC5 | Watch modes work | Manual test | File change → test rerun |
| AC5 | Health check daemon works | Process test | Daemon running |
| AC5 | TTD metrics collected | Log check | Metrics in JSONL |
| AC5 | p95 TTD <5min | Statistical test | 20 samples, 19 <5min |
| AC6 | Dashboard JSON generated | File check | `failure_dashboard.json` exists |
| AC6 | Dashboard content valid | Schema validation | All fields present |
| AC6 | Cron job scheduled | Cron check | `crontab -l` shows entry |
| AC6 | Dashboard updates | Time check | Timestamp changes |
| AC7 | Learning capture works | Script test | Creates learning file |
| AC7 | Learning review works | Script test | Shows learnings |
| AC7 | Prevention layer updated | Code review | New check added |
| AC7 | Prevention catches failure | Re-test | Re-introduced failure caught |
| AC8 | Pre-commit <5s | Timing test | `time` output <5s |
| AC8 | Pre-flight <30s | Timing test | `time` output <30s |
| AC8 | Hunt <5min | Timing test | `time` output <5min |
| AC8 | Dashboard <10s | Timing test | `time` output <10s |
| AC8 | Watch CPU <10% | Resource test | `ps aux` output <10% |
| AC8 | Disk <100MB | Disk test | `du` output <100MB |
| AC8 | CI <10min | CI test | Pipeline duration <10min |

**Total Verification Points**: 35

**Pass Threshold**: 100% (all 35 must pass)

---

## Specification Complete

**Status**: Ready for PLAN phase

**Next Steps**:
1. Break down into granular implementation tasks (PLAN)
2. Analyze edge cases (THINK)
3. Implement all 8 ACs (IMPLEMENT)
4. Run verification matrix (VERIFY)
5. Adversarial review (REVIEW)
6. Create PR (PR)
7. Establish monitoring (MONITOR)

**Evidence**: This specification defines precisely what "comprehensive failure detection & prevention system" means, with 35 concrete verification points.
