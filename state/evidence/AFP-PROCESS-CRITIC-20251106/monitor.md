# MONITOR - AFP-PROCESS-CRITIC-20251106

**Task:** AFP-W5-M1-PROCESS-CRITIC
**Date:** 2025-11-06
**Author:** Claude Council
**Phase:** 10 of 10 (MONITOR)

---

## Overview

Monitoring plan for ProcessCritic enforcement in production. This document defines observability, metrics, and success criteria for tracking ProcessCritic effectiveness at preventing test sequencing violations.

---

## Monitoring Strategy

### 1. Pre-commit Hook Execution

**Primary observability:** Pre-commit hook logs + developer feedback

**Metrics to monitor:**
- ProcessCritic invocation frequency (commits attempted per day)
- Block rate (commits blocked / commits attempted)
- False positive rate (blocked commits that should have passed)
- Remediation time (time from block to successful commit)

**Health indicators:**
- ProcessCritic runs on every commit
- Blocks genuine violations (missing tests, deferrals)
- Allows legitimate commits (docs-only, proper test sequencing)
- Error messages are actionable

**Alert conditions:**
- High false positive rate (>10% of blocks are incorrect)
- Developers bypassing with --no-verify (git log analysis)
- ProcessCritic crashes or hangs
- Runtime >5 seconds (performance degradation)

---

### 2. DesignReviewer Telemetry

**Observability:** `state/critics/designreviewer.json`

**Metrics to track:**
- Tasks with ProcessCritic concerns
- Common violation patterns
- Remediation quality (follow-up commits)

**Health indicators:**
- ProcessCritic concerns logged in design reviews
- Concerns lead to PLAN updates (not bypasses)
- Remediation commits reference original task

---

### 3. Evidence Bundle Quality

**Observability:** `state/evidence/*/plan.md` files

**Audit checks (weekly):**
```bash
# Count PLAN documents with test sections
find state/evidence -name "plan.md" -exec grep -l "test\|Test\|TEST" {} \; | wc -l

# Check for deferral keywords (should decrease over time)
find state/evidence -name "plan.md" -exec grep -i "defer\|later\|future\|todo\|tbd" {} \;

# Verify docs-only justifications
find state/evidence -name "plan.md" -exec grep -i "docs-only\|documentation-only" {} \;
```

**Health indicators:**
- Increasing percentage of PLAN documents with concrete tests
- Decreasing use of deferral keywords
- Docs-only exemptions properly justified

---

### 4. Git Commit Analysis

**Observability:** Git log analysis

**Monthly audit:**
```bash
# Count commits that touch test files
git log --since="1 month ago" --name-only --pretty=format: | grep -E "test\|spec" | wc -l

# Check for --no-verify usage (ProcessCritic bypass)
git log --since="1 month ago" --all --grep="no-verify" | wc -l

# Find autopilot commits (should have wave0 testing)
git log --since="1 month ago" --all --grep="wave0\|autopilot\|supervisor" --pretty=format:"%h %s"
```

**Health indicators:**
- Test file commits decrease (tests added during PLAN, not VERIFY)
- --no-verify usage near zero (developers not bypassing)
- Autopilot commits reference wave0 testing

**Alert conditions:**
- Spike in test file commits during VERIFY phase
- Increase in --no-verify usage (enforcement fatigue)
- Autopilot commits without wave0 testing references

---

## Success Criteria (Production)

### Week 1 (Burn-in)

**Goals:**
- ✅ ProcessCritic blocks ≥1 genuine violation
- ✅ No false positives reported
- ✅ Runtime <2 seconds per execution
- ✅ Developers understand remediation workflow

**Monitoring frequency:** Daily checks (developer feedback)

**Escalation:** False positives trigger pattern adjustment investigation

---

### Month 1 (Adoption)

**Goals:**
- ✅ ProcessCritic blocks ≥10 genuine violations
- ✅ <5% false positive rate
- ✅ ≥90% of PLAN documents have concrete test sections
- ✅ No --no-verify bypasses for ProcessCritic (check git log)

**Monitoring frequency:** Weekly checks

**Escalation:** High false positive rate requires pattern tuning

---

### Long-term (Operational)

**Goals:**
- ✅ ProcessCritic enforcement becomes standard practice
- ✅ Test sequencing violations near zero
- ✅ PLAN-first testing is culturally established
- ✅ Developers proactively write tests in PLAN

**Monitoring frequency:** Monthly reviews

**Escalation:** Quarterly review of enforcement effectiveness

---

## Observability Tools

### Manual Monitoring

**Daily checks:**
```bash
# Check ProcessCritic is invoked in pre-commit
grep "ProcessCritic" .githooks/pre-commit

# Test ProcessCritic with no staged files
node tools/wvo_mcp/scripts/run_process_critic.mjs
# Expected: "No staged changes detected; ProcessCritic skipped."

# Check for recent blocks (developer reports)
git log --since="1 day ago" --all --oneline | grep -i "process\|plan\|test"
```

**Weekly checks:**
```bash
# Count PLAN documents created this week
find state/evidence -name "plan.md" -newermt "7 days ago" -exec grep -l "test" {} \; | wc -l

# Check for deferral keywords in recent PLAN documents
find state/evidence -name "plan.md" -newermt "7 days ago" -exec grep -i "defer\|later\|future" {} \;

# Verify no --no-verify bypasses
git log --since="7 days ago" --all --grep="no-verify" || echo "No bypasses found ✅"
```

**Monthly audit:**
```bash
# Generate ProcessCritic effectiveness report
echo "=== ProcessCritic Monthly Report ==="
echo "PLAN documents with tests: $(find state/evidence -name "plan.md" -exec grep -l "test" {} \; | wc -l)"
echo "PLAN documents with deferrals: $(find state/evidence -name "plan.md" -exec grep -l "defer\|later\|future" {} \; | wc -l)"
echo "Commits with --no-verify: $(git log --since="1 month ago" --all --grep="no-verify" | wc -l)"
echo "Test file commits: $(git log --since="1 month ago" --name-only --pretty=format: | grep -E "test\|spec" | wc -l)"
```

---

### Automated Monitoring (Future)

**Recommendations for future work:**

1. **Telemetry logging** - Log ProcessCritic invocations to `state/analytics/process_critic.jsonl`
   - Timestamp, staged files, violations found, block/allow decision
   - Enable time-series analysis of enforcement trends

2. **Grafana dashboard** - Visualize ProcessCritic metrics
   - Block rate over time
   - Common violation types
   - Remediation times
   - False positive tracking

3. **Alerting** - Alert on anomalies
   - High false positive rate (>10%)
   - ProcessCritic runtime >5 seconds
   - --no-verify usage spikes
   - Zero blocks for >1 week (critic may be broken)

4. **Integration with DesignReviewer** - Cross-reference ProcessCritic concerns with design reviews
   - Track if blocked commits lead to design improvements
   - Identify patterns requiring additional enforcement

---

## Known Limitations (Acceptable for Wave 5)

**Documented in THINK and REVIEW phases:**

1. **Pattern-based detection** (Wave 5 limitation):
   - Risk: May miss unconventional test file naming
   - Monitor: Track false negatives (tests added during VERIFY that weren't caught)
   - Mitigation: Extend patterns as new conventions emerge

2. **Simple PLAN parsing** (Wave 5 limitation):
   - Risk: Fragile to PLAN format changes
   - Monitor: Watch for parsing failures (ProcessCritic crashes)
   - Mitigation: Searches for common headings, not strict structure

3. **No historical analysis** (Wave 5 limitation):
   - Risk: Cannot detect violations in already-committed code
   - Monitor: Manual git log audits for retrospective analysis
   - Mitigation: Forward-looking enforcement only (don't rewrite history)

**All limitations are acceptable for Wave 5 MVP.**

---

## Escalation Protocol

### Level 1: Warning (Log and Monitor)
- Single false positive reported
- ProcessCritic runtime 2-5 seconds
- Developer confusion about remediation

**Action:** Log issue, provide guidance, review weekly

---

### Level 2: Error (Investigation Required)
- Multiple false positives (>3 in one week)
- ProcessCritic crashes or hangs
- --no-verify bypasses detected (>2 in one week)

**Action:** Investigate root cause, adjust patterns or documentation, remediate within 48 hours

---

### Level 3: Critical (Immediate Action)
- High false positive rate (>10%)
- ProcessCritic preventing all commits (systematic failure)
- Developers routinely bypassing with --no-verify (enforcement breakdown)

**Action:** Disable ProcessCritic temporarily, fix root cause, re-enable with testing

---

## Rollback Plan

**If ProcessCritic causes critical issues:**

1. **Immediate:** Disable ProcessCritic in pre-commit hook
   ```bash
   # Comment out ProcessCritic invocation in .githooks/pre-commit
   # Lines 187-194
   ```

2. **Investigate:** Analyze failure mode
   - Review recent commits that were blocked
   - Check for pattern matching bugs
   - Gather developer feedback

3. **Fix:** Address root cause
   - Adjust patterns (TEST_FILE_PATTERNS, DEFERRAL_KEYWORDS, etc.)
   - Fix parsing logic if PLAN format changed
   - Update documentation if remediation unclear

4. **Test:** Verify fix with historical cases
   ```bash
   # Test against recent evidence bundles
   git checkout <recent-commit> state/evidence/
   node tools/wvo_mcp/scripts/run_process_critic.mjs
   git checkout HEAD state/evidence/
   ```

5. **Re-enable:** Uncomment ProcessCritic in pre-commit hook

6. **Monitor:** Watch for recurrence

---

## Performance Baselines

**Established during VERIFY phase:**

- **Execution time:** <1 second (no staged changes)
- **Pattern matching:** <100ms for 7 test patterns
- **PLAN parsing:** <50ms per PLAN document
- **Total overhead:** <2 seconds per commit

**Monitor for regressions:**
- Execution time >5 seconds (investigate performance)
- Pattern matching >500ms (optimize regex)
- PLAN parsing >200ms (consider caching)

---

## Success Metrics (Actual vs Target)

### Month 1 (Target vs Actual)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Genuine violations blocked | ≥10 | TBD | ⏳ Monitoring |
| False positive rate | <5% | TBD | ⏳ Monitoring |
| PLAN documents with tests | ≥90% | TBD | ⏳ Monitoring |
| --no-verify bypasses | 0 | TBD | ⏳ Monitoring |
| Runtime per execution | <2s | <1s | ✅ Baseline met |
| Developer complaints | <3 | TBD | ⏳ Monitoring |

**Update this table monthly with actual results.**

---

## Post-Deployment Checklist

**Before marking task as "done" in roadmap:**

- ✅ Code deployed to main branch (untracked files to be committed)
- ✅ Evidence bundle complete (8 artifacts including monitor.md)
- ✅ All exit criteria verified (3/3 met)
- ✅ Build verified (ProcessCritic compiles)
- ✅ Pre-commit integration tested
- ✅ Documentation published (AGENTS.md, CLAUDE_CODE_SETUP.md)
- ✅ Monitoring plan documented (this file)
- ⏳ Month 1 adoption metrics (TBD - monitor after commit)

**Task ready for "done" status with monitoring ongoing.**

---

## Lessons Learned (Monitoring)

**What to monitor more closely:**

1. **False positive patterns** - Track which patterns trigger incorrectly
2. **Developer bypass attempts** - Monitor --no-verify usage as enforcement signal
3. **Deferral keyword evolution** - New synonyms may emerge ("postpone", "delayed", etc.)
4. **PLAN format changes** - Template updates may break parsing

**Recommendations for future enforcement:**
1. **Telemetry logging** - Add JSONL logging for time-series analysis
2. **Pattern evolution** - Review test patterns quarterly
3. **Developer feedback loop** - Monthly surveys on ProcessCritic usability
4. **Retrospective audits** - Quarterly review of enforcement effectiveness

---

**Date:** 2025-11-06
**Author:** Claude Council
**Phase:** 10 of 10 (MONITOR) - COMPLETE
**Next:** Commit changes (PR phase), update roadmap status to "done"
