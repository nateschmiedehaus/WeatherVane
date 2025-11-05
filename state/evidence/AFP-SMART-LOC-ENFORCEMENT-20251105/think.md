# AFP-SMART-LOC-ENFORCEMENT-20251105: Think

## Edge Cases

1. **Renamed files with changes**
   - Git shows as delete + add
   - Risk: Double-count LOC
   - Mitigation: Deletion credit will offset addition naturally

2. **Generated files** (dist/, *.generated.ts)
   - Should not enforce LOC limits
   - Detection: Path patterns, file headers
   - Action: Skip analysis entirely

3. **Binary files** (images, PDFs)
   - `git diff --numstat` shows "-" for binary
   - Action: Skip analysis

4. **Whitespace-only changes**
   - Reformatting shouldn't count as additions
   - Effective LOC calculation handles this
   - Pure whitespace = 0 effective LOC

5. **File with 100% comments** (pure documentation)
   - Should not be blocked
   - Effective LOC = 0
   - Pattern bonus: well-documented

6. **Monorepo with different standards**
   - Apps vs. tools vs. docs may need different limits
   - File-type tiers handle this
   - Override mechanism for exceptions

7. **Moved code** (cut from A, paste to B)
   - Shows as delete in A, add in B
   - Deletion credit applies
   - Net effect: roughly neutral

8. **Type-only files** (interfaces, types)
   - Verbose but low complexity
   - Counted as 0.5x weight in effective LOC
   - 1.5x multiplier for types files

9. **Large refactoring** (delete 500, add 400)
   - Net -100, but analyzer sees 400 added
   - Deletion credit: +250
   - Adjusted limit handles well

10. **Test file with minimal assertions** (400 LOC, poor quality)
    - Currently: Gets 3.0x multiplier (allowed)
    - Future: Test quality critic could flag
    - For now: Warning but not blocked

## Failure Modes

1. **Agents exploit multipliers**
   - Scenario: Rename core logic file to .test.ts to get 3x multiplier
   - Impact: Circumvents enforcement
   - Detection: Analytics show unusual test files
   - Mitigation: Review override logs, critic for file naming conventions
   - Likelihood: Low (requires malice)

2. **Multipliers miscalibrated**
   - Scenario: 3.0x for tests is too generous, allows bloated tests
   - Impact: Test quality degrades
   - Detection: Test suite size grows without coverage increase
   - Mitigation: Tune multipliers based on analytics, shadow mode first
   - Likelihood: Medium (calibration is guesswork initially)

3. **False positives on legitimate long files**
   - Scenario: Complex algorithm genuinely needs 400 LOC
   - Impact: Forces artificial splitting, hurts readability
   - Detection: Agent feedback, override usage
   - Mitigation: Override mechanism, adjust multipliers
   - Likelihood: Low if multipliers well-tuned

4. **Performance degradation**
   - Scenario: Analyzing 50-file commit takes >10 seconds
   - Impact: Slow commits, agents bypass with --no-verify
   - Detection: Timing logs, agent complaints
   - Mitigation: Optimize (cache, parallel), limit analysis depth
   - Likelihood: Low for typical commits (<20 files)

5. **Pattern detection fails**
   - Scenario: File has 50 imports but they're all 150-char long (formatting)
   - Impact: False bonus awarded
   - Detection: Analytics show pattern bonus correlated with violations
   - Mitigation: Refine pattern detection logic
   - Likelihood: Low (imports are typically short)

6. **Effective LOC miscalculation**
   - Scenario: Complex one-liner counted as 1 LOC, but has high complexity
   - Impact: Bloated code passes enforcement
   - Detection: Cyclomatic complexity analysis (future)
   - Mitigation: Add complexity metrics in v2
   - Likelihood: Medium (LOC is imperfect proxy for complexity)

7. **Override abuse**
   - Scenario: Agent always uses LOC_OVERRIDE, never splits code
   - Impact: Enforcement becomes meaningless
   - Detection: Analytics show >50% override rate for agent
   - Mitigation: Review overrides, require justification, escalate pattern
   - Likelihood: Medium (depends on agent discipline)

8. **Git diff parsing fails**
   - Scenario: `git diff --numstat` format changes or fails
   - Impact: Script crashes, blocks all commits
   - Detection: Pre-commit hook fails
   - Mitigation: Fallback to flat limit, graceful error handling
   - Likelihood: Very low (git format stable)

9. **File content read fails**
   - Scenario: Permission error, encoding issue
   - Impact: Can't calculate effective LOC
   - Detection: Script error
   - Mitigation: Fall back to total LOC only (no effective calc)
   - Likelihood: Low

10. **Analytics log corruption**
    - Scenario: Concurrent writes, disk full
    - Impact: Log entry lost or malformed
    - Detection: Periodic log validation
    - Mitigation: Append-only JSONL is resilient, non-critical for enforcement
    - Likelihood: Very low

## Assumptions & Validation

### Assumption 1: File paths reliably indicate content type
- **Evidence:** Established conventions (.test.ts for tests, docs/ for docs)
- **Validation:** Pattern matching + manual review of misclassifications
- **Risk if wrong:** Files get wrong multiplier
- **Mitigation:** Override mechanism, analytics logging

### Assumption 2: Deletion indicates refactoring (via negativa)
- **Evidence:** AFP principle - deletion is valued
- **Validation:** Track deletion credit usage, review contexts
- **Risk if wrong:** Churn gets rewarded (delete/add same code)
- **Mitigation:** Net LOC still matters, extreme churn triggers strong warning

### Assumption 3: Comments don't indicate bloat
- **Evidence:** Well-documented code is good
- **Validation:** "well-documented" pattern gives bonus
- **Risk if wrong:** Agents pad with useless comments
- **Mitigation:** Comment quality not enforced here (future: doc critic)

### Assumption 4: Tests can be legitimately long
- **Evidence:** Comprehensive tests > artificially split tests
- **Validation:** 3.0x multiplier allows 450 LOC
- **Risk if wrong:** Bloated test files
- **Mitigation:** Test quality validation (separate concern)

### Assumption 5: Effective LOC approximates complexity
- **Evidence:** Removing boilerplate focuses on actual logic
- **Validation:** Compare effective LOC to cyclomatic complexity (sample)
- **Risk if wrong:** Complex code passes as simple
- **Mitigation:** Future: add cyclomatic complexity analysis

### Assumption 6: Progressive warnings educate
- **Evidence:** Warnings > errors for marginal cases
- **Validation:** Track warning → fix rate vs. bypass rate
- **Risk if wrong:** Warnings ignored, bloat accumulates
- **Mitigation:** Tune thresholds, escalate to errors if needed

### Assumption 7: 150 LOC base limit is appropriate
- **Evidence:** Current system uses this, anecdotally reasonable
- **Validation:** Analytics show most commits within limit
- **Risk if wrong:** Too strict or too loose
- **Mitigation:** Tunable via config, adjust based on data

### Assumption 8: Multipliers cover edge cases
- **Evidence:** Spec defines tiered approach
- **Validation:** Monitor false positive rate
- **Risk if wrong:** Legitimate files blocked or bloat allowed
- **Mitigation:** Shadow mode week 1, tune multipliers

### Assumption 9: Agents will use override responsibly
- **Evidence:** Current --no-verify usage is pragmatic, not malicious
- **Validation:** Track override justifications
- **Risk if wrong:** Enforcement bypassed habitually
- **Mitigation:** Review logs, escalate patterns

### Assumption 10: Analytics enable tuning
- **Evidence:** JSONL logging captures all metadata
- **Validation:** Query logs for trends (override rate, false positives)
- **Risk if wrong:** Can't tune system effectively
- **Mitigation:** Rich logging schema, periodic reviews

## Complexity Analysis

**System complexity:**
- **Essential complexity:** Context-aware limits, deletion credits (can't simplify further)
- **Accidental complexity:** Pattern detection heuristics (could be simpler)
- **Integration complexity:** Bash hook ← Node script ← TypeScript module (unavoidable)

**Cyclomatic complexity estimate:**
- `analyzeFileLOC`: ~15 decision points (moderate)
- `calculateEffectiveLOC`: ~8 decision points (low)
- `getFileTypeMultiplier`: ~10 decision points (low - just pattern matching)

**Cognitive complexity:**
- Formula is transparent: `adjustedLimit = base * multiplier + deletionCredit + patternBonus`
- File type tiers are explicit table
- Progressive warnings are straightforward thresholds

**Reduction opportunities:**
- Could remove pattern detection (simpler but less intelligent)
- Could use flat multipliers per category instead of fine-grained
- Trade-off: simplicity vs. accuracy

## Mitigation Strategies

### Prevention

1. **Shadow mode deployment** - Collect data before enforcing
2. **Conservative multipliers** - Start strict, loosen based on evidence
3. **Override logging** - Track all bypasses for review
4. **Clear error messages** - Explain what to do, not just what's wrong
5. **Config file** - Easy tuning without code changes

### Detection

1. **Analytics dashboard** - Weekly review of metrics
2. **Anomaly detection** - Flag unusual patterns (high override rate, weird file types)
3. **Agent feedback** - Solicit complaints, treat as signals
4. **Periodic audits** - Manual review of blocked/allowed commits

### Recovery

1. **Fallback flag** - `USE_SMART_LOC=0` reverts to flat limit
2. **Quick multiplier updates** - Config file, no code deploy
3. **Override mechanism** - Unblock agents while investigating
4. **Rollback plan** - Revert to flat limit if system fails

## Testing Strategy

### Unit Tests

1. **File type detection** - 10 test cases covering all tiers
2. **Deletion credits** - 5 test cases with varying deletions
3. **Effective LOC** - 8 test cases with different patterns
4. **Pattern detection** - 6 test cases for each pattern
5. **Progressive enforcement** - 4 test cases for each severity
6. **Adjusted limit calculation** - 10 test cases combining factors

### Integration Tests

1. **CLI script** - Mock git diff, verify analysis output
2. **Pre-commit hook** - Simulate commit, check exit codes
3. **Analytics logging** - Verify JSONL entries created
4. **Override mechanism** - Test both commit message and file-based

### Acceptance Tests

Run all acceptance criteria from spec:
- AC1-AC7 as automated tests
- Edge cases as manual scenarios
- Performance benchmarks (<2s for 20 files)

### Manual Testing

1. **Real commits** - Test on actual work, not just mocks
2. **Agent feedback** - Deploy to one agent first, gather feedback
3. **False positive hunt** - Actively try to find bad blocks
4. **Gaming attempts** - Try to exploit system, verify mitigations

## Paranoid Worst-Case Scenarios

1. **Total system failure** - Script crashes on every commit
   - Impact: No commits possible
   - Prevention: Graceful error handling, fallback to flat limit
   - Recovery: Emergency revert, investigate offline

2. **Mass override abuse** - All agents bypass habitually
   - Impact: Enforcement becomes meaningless
   - Prevention: Make system helpful, not adversarial
   - Recovery: Review why bypasses happening, fix root cause

3. **False positive epidemic** - Legitimate commits blocked
   - Impact: Productivity halt, agent frustration
   - Prevention: Shadow mode, conservative multipliers
   - Recovery: Emergency multiplier increase, apology commits

4. **Performance disaster** - Commits take >30 seconds
   - Impact: Agents bypass, complain loudly
   - Prevention: Performance tests, optimization
   - Recovery: Disable effective LOC calc (expensive part)

5. **Gaming becomes epidemic** - Agents exploit multipliers
   - Impact: Code quality degrades despite "passing" enforcement
   - Prevention: Audit logs, clear consequences
   - Recovery: Tighten multipliers, add heuristic detectors

6. **Analytics explosion** - Logs grow to GB, slow system
   - Impact: Disk full, analysis slow
   - Prevention: Log rotation, size monitoring
   - Recovery: Truncate logs, aggregate older entries

7. **Complexity cascade** - System becomes unmaintainable
   - Impact: Future changes require deep system knowledge
   - Prevention: Clear documentation, modular design
   - Recovery: Simplify or replace with simpler system

## Decision: Proceed?

**YES**, because:
1. User explicitly requested smarter enforcement
2. Current system demonstrably too crude (we bypassed it 3x today)
3. Benefits (via negativa incentive, test comprehensiveness) outweigh risks
4. Risks are mitigated (shadow mode, fallback, logging, override)
5. Reversible if it fails (4-week decision point)

**Proceed with caution:**
- Deploy shadow mode first (warnings only)
- Monitor closely first week
- Tune multipliers based on data
- Be ready to revert if needed
