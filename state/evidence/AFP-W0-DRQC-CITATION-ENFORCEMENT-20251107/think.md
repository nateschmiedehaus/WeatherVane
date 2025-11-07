# THINK - AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107

**Task:** DRQC Citation Enforcement - Mandatory Research Citations in Every Phase
**Created:** 2025-11-07T16:20:00Z
**Phase:** THINK

## Edge Cases & Failure Modes

### Edge Case 1: Citation Format Variations

**Scenario:** Agents format citations slightly differently
**Examples:**
- `**DRQC Citation:** Page 8, Live-Fire` (missing quotes around section)
- `**Citation:** Page 8, "Live-Fire"` (missing "DRQC" prefix)
- `Page 8, "Live-Fire": Always run...` (non-standard format)

**Impact:** Regex fails to extract, falsely reports missing citations

**Mitigation:**
- Make regex permissive: optional quotes, optional "DRQC" prefix
- Accept "Citation:", "DRQC Citation:", "Research Citation:" as valid
- Warn on non-standard format but don't block

**Test:** Test 1 should cover format variations

### Edge Case 2: Multi-line Quotes

**Scenario:** DRQC quote spans multiple lines
**Example:**
```markdown
**DRQC Citation:** Page 8, "Live-Fire"
> Always run the program (or a realistic harness),
> not just lints. Add property-based tests + a tiny
> mutation budget per PR.
```

**Impact:** Regex captures only first line

**Mitigation:**
- Update regex to capture multi-line quotes
- Use `[\s\S]` instead of `.` to match newlines
- Stop at next `**` or section boundary

**Test:** Add test case for multi-line quotes

### Edge Case 3: PDF Not in Repo Root

**Scenario:** PDF moved, renamed, or missing
**Impact:** Cannot validate page references, all tasks blocked

**Mitigation:**
- Check PDF existence before validation
- If missing: warn but don't block (degraded mode)
- Log warning to `state/drqc_warnings.jsonl`
- Allow commit with warning

**Test:** Mock missing PDF scenario

### Edge Case 4: Concordance Table Malformed

**Scenario:** Table has wrong columns or missing rows
**Examples:**
- Only 2 columns instead of 3
- Header row missing
- Empty rows

**Impact:** extractConcordance() returns null or incomplete data

**Mitigation:**
- Be permissive: accept 2-column tables (merge last 2 columns)
- Ignore empty rows
- Require only header + ≥1 data row
- Warn if table seems malformed but has some data

**Test:** Test 3 should cover malformed tables

### Edge Case 5: VERIFY Without Code Changes

**Scenario:** Documentation-only task with verify.md
**Impact:** No tests to run, can't provide execution logs

**Mitigation:**
- Detect docs-only tasks (no `.ts`, `.js`, `.py` files changed)
- For docs tasks: accept "N/A - documentation only" in live-fire section
- Still require DRQC citation explaining verification approach

**Test:** Integration test with docs-only task

### Edge Case 6: Citing Same Page Multiple Times

**Scenario:** Multiple decisions cite same DRQC page/section
**Impact:** Concordance has duplicate citations

**Mitigation:**
- Allow duplicates (different decisions, same principle)
- Don't enforce uniqueness of citations
- Count total citations, not unique citations

**Test:** Concordance with duplicate citations should pass

### Edge Case 7: Page Reference Off-by-One

**Scenario:** Agent cites "Page 46" (PDF has 45 pages)
**Impact:** Validation fails

**Mitigation:**
- Show clear error: "Page 46 exceeds PDF page count (45)"
- Suggest checking page number
- Don't auto-correct (could be wrong citation)

**Test:** Test 2 covers this

### Edge Case 8: Nested Code Blocks in verify.md

**Scenario:** Live-fire output contains code with triple backticks
**Example:**
````markdown
## Live-Fire Output
```
$ verify.sh
Running tests...
Error: ```example``` failed
```
````

**Impact:** Markdown parser breaks

**Mitigation:**
- Use quadruple backticks for outer block: `````
- Document in DRQC_CITATION_GUIDE.md
- Regex should handle escaped backticks

**Test:** verify.md with nested code blocks

### Edge Case 9: Exemption Abuse

**Scenario:** Agent adds `[skip-drqc]` to every commit
**Impact:** DRQC enforcement bypassed

**Mitigation:**
- Log all exemptions to `state/drqc_exemptions.jsonl`
- Weekly review of exemptions (manual)
- If >20% of commits exempt → investigate
- Pre-commit hook shows: "Exemption logged for review"

**Test:** Cannot test enforcement, but logging should work

### Edge Case 10: Concordance Missing Obvious Decisions

**Scenario:** Plan has 5 major decisions, concordance has 1 entry
**Impact:** Concordance incomplete

**Mitigation:**
- Heuristic: count "Approach:", "Alternative:", "Decision:" sections
- Warn if concordance entries << decision sections
- Don't block (can't perfectly detect all decisions)
- Rely on human review (DesignReviewer)

**Test:** Plan with multiple approaches, minimal concordance → warning

### Edge Case 11: DRQC Page Count Changes

**Scenario:** DRQC PDF updated to 50 pages
**Impact:** Hard-coded MAX_PAGES = 45 is wrong

**Mitigation:**
- Read PDF page count dynamically (if possible)
- Fallback to hard-coded 45 if PDF unreadable
- Document in code: "Update if DRQC PDF changes"

**Test:** Mock PDF with different page count

### Edge Case 12: Concurrent Commits

**Scenario:** Two agents commit phase docs simultaneously
**Impact:** Merge conflicts in evidence directory

**Mitigation:**
- Not a DRQC issue (general git workflow)
- Standard git conflict resolution applies
- Each task has separate evidence dir (unlikely to conflict)

**Test:** N/A (git handles this)

## Complexity Analysis

### Regex Complexity

**Citation Extraction Regex:**
```typescript
/\*\*(?:DRQC )?Citation:\*\* Page (\d+),\s*"?([^"\n]+)"?\s*>\s*([\s\S]+?)(?=\n\*\*|\n#{2,}|$)/gs
```

**Complexity:** O(n) where n = document length
**Risk:** Catastrophic backtracking on malformed input

**Mitigation:**
- Use atomic groups where possible
- Limit lookbehind length
- Test on large documents (>10KB)
- Timeout regex after 100ms

### Concordance Parsing Complexity

**Table Extraction:**
```typescript
/###\s+Concordance\s+\(([^)]+)\)\s*\n\s*\|.*\|.*\|.*\|\s*\n\s*\|[-:]+\|[-:]+\|[-:]+\|\s*\n((?:\|.*\|.*\|.*\|\s*\n)+)/m
```

**Complexity:** O(n) where n = document length
**Risk:** Large tables (>100 rows) slow parsing

**Mitigation:**
- Limit table size check (warn if >50 rows)
- Tables typically small (<10 rows)
- Acceptable performance risk

### File I/O Complexity

**Reading phase documents:** O(k) where k = number of phase docs (≤10)
**Reading DRQC PDF:** Once per commit (cached)

**Total Commit Overhead:**
- Read 10 phase docs: ~10ms
- Extract citations: ~50ms
- Validate: ~20ms
- Check concordance: ~30ms
- Total: ~110ms (well under 500ms NFR)

### Memory Complexity

**Peak Memory:**
- Phase docs: ~50KB each × 10 = 500KB
- DRQC PDF: 287KB
- Extracted citations: ~10KB
- Total: <1MB (negligible)

## Failure Mode Analysis

### FM1: ProcessCritic Crashes

**Trigger:** Malformed regex, unexpected input
**Impact:** Pre-commit hook fails, commit blocked
**Detection:** Try-catch around validation logic
**Recovery:** Log error, skip DRQC checks, allow commit with warning
**Prevention:** Comprehensive test coverage

### FM2: False Positives (Blocks Valid Work)

**Trigger:** Regex too strict, valid citation not recognized
**Impact:** Developer frustration, workflow blocked
**Detection:** User reports "I have citations but hook blocks me"
**Recovery:** Make regex more permissive, deploy fix
**Prevention:** Test with real-world examples (this task's own docs)

### FM3: False Negatives (Allows Invalid Work)

**Trigger:** Regex too permissive, accepts non-citations
**Impact:** Tasks pass without real DRQC grounding
**Detection:** Manual audit finds missing citations
**Recovery:** Tighten regex, re-validate historical tasks
**Prevention:** Balance permissiveness with accuracy

### FM4: Performance Degradation

**Trigger:** Very large phase documents (>100KB)
**Impact:** Commits take >500ms
**Detection:** NFR1 violation
**Recovery:** Optimize regex, add document size limit
**Prevention:** Profile with large docs

### FM5: PDF Unavailable

**Trigger:** PDF deleted, corrupted, or moved
**Impact:** Cannot validate page references
**Detection:** File existence check
**Recovery:** Degrade gracefully (warn, don't block)
**Prevention:** Document PDF location requirement

## Mitigation Strategies

### Strategy 1: Graceful Degradation

**Principle:** Prefer warnings over hard blocks where possible

**Implementation:**
- PDF missing → warn, allow commit
- Concordance malformed → warn, allow if has some entries
- Citation format non-standard → warn, allow if detectable

**Exceptions (hard blocks):**
- Zero citations (no DRQC grounding at all)
- Zero concordance (no evidence mapping)
- VERIFY without execution logs (compile-only, violates DRQC)

### Strategy 2: Comprehensive Logging

**Log all DRQC events:**
- `state/drqc_exemptions.jsonl` - Exempted commits
- `state/drqc_warnings.jsonl` - Non-blocking warnings
- `state/drqc_blocks.jsonl` - Blocked commits (for analysis)

**Review cadence:** Weekly review of logs

### Strategy 3: Progressive Enforcement

**Phase 1 (Week 1):** Warn-only mode
- All checks run, but don't block commits
- Log all violations
- Gather data on false positive rate

**Phase 2 (Week 2):** Soft enforcement
- Block only zero-citation cases
- Warn on all other violations

**Phase 3 (Week 3+):** Full enforcement
- Block all violations per spec
- Exemptions require justification

**Rollback Plan:** If false positive rate >10%, revert to warn-only

### Strategy 4: Test-Driven Enforcement

**Before deploying:**
- Run all 5 test suites
- Integration test with this task's own docs
- Manual test: deliberately break citations, verify block
- Performance test: commit with 10 phase docs

**Continuous validation:**
- Add new test for each reported false positive
- Update regex to fix, re-run all tests

### Strategy 5: Documentation-First

**Before enforcement goes live:**
- Publish DRQC_CITATION_GUIDE.md
- Update MANDATORY_WORK_CHECKLIST.md
- Announce in CLAUDE.md
- Wait 24h for feedback before enforcing

## Design Decisions

### Decision 1: Regex vs. Parser

**Options:**
1. Regex for extraction (chosen)
2. Markdown parser library
3. Custom parser

**Chosen:** Regex

**Justification:**
- Simpler (no dependencies)
- Fast (O(n) complexity)
- Sufficient for structured format
- Easy to test and debug

**Trade-off:** Less robust than parser, but acceptable for structured input

### Decision 2: Hard Block vs. Warning

**Options:**
1. Hard block all violations
2. Warn on all violations
3. Mixed (block critical, warn others)

**Chosen:** Mixed (Strategy 1 above)

**Justification:**
- Balance quality (require citations) with usability (don't frustrate)
- Zero citations = hard block (no DRQC grounding)
- Malformed citations = warn (agent tried, just needs format fix)

**Trade-off:** More complex logic, but better UX

### Decision 3: Page Validation Depth

**Options:**
1. Just check page number ≤ 45
2. Parse PDF, verify text match
3. No validation

**Chosen:** Just check page number ≤ 45

**Justification:**
- Parsing PDF is complex (dependencies, performance)
- Page number check catches typos (most common error)
- Manual review catches wrong citations

**Trade-off:** Can't verify quote accuracy, but acceptable

### Decision 4: Concordance Strictness

**Options:**
1. Require exact 3-column format
2. Allow variations (2 columns, extra columns)
3. Don't validate structure

**Chosen:** Allow variations (Edge Case 4)

**Justification:**
- Agents may format tables differently
- Core value is mapping decisions → evidence
- Strict format may frustrate without adding value

**Trade-off:** Can't perfectly validate, but gets most value

### Decision 5: Exemption Mechanism

**Options:**
1. No exemptions (always enforce)
2. Manual exemption (ask admin)
3. Self-service exemption with logging

**Chosen:** Self-service with logging

**Justification:**
- Don't block trivial tasks (config updates)
- Trust agents to self-exempt responsibly
- Logging enables audit

**Trade-off:** Potential abuse, but weekly review catches it

## DRQC Citations for This Design

**Decision:** Use regex over parser
**DRQC Citation:** Page 10, "Minimal Change, Maximal Proof"
> "Small diffs, strong evidence."

**Interpretation:** Regex is minimal (no dependencies), provides sufficient evidence extraction for our structured format. Parser would be larger change without proportional quality benefit.

**Decision:** Graceful degradation (warn vs. block)
**DRQC Citation:** Page 18, "No gate, no progress"
> "Any gate fail → loop and remediate (don't advance on 'best effort')."

**Interpretation:** Zero citations = gate fail (hard block). Malformed citations = not "best effort" (can fix), but attempted compliance (warn, allow).

**Decision:** Progressive enforcement rollout
**DRQC Citation:** Page 20, "Monitor - Stay Accountable"
> "Schedule synthetic checks; parse logs/metrics for anomalies."

**Interpretation:** Week 1 warn-only mode is monitoring. Week 2 soft enforcement reacts to anomalies (false positives). Week 3 full enforcement after validation.

**Decision:** Test-driven enforcement
**DRQC Citation:** Page 7, "Verify - Tests That Fight Back"
> "Make pbt, instantiate symmetry cases, make mut."

**Interpretation:** Tests 1-5 fight back against false positives/negatives. Property tests (citation extraction idempotent) ensure correctness.

### Concordance (Think)

| Action | DRQC Citation | Artifact |
|--------|---------------|----------|
| Identify 12 edge cases | Page 10, "Counterexample mindset" | Edge Cases 1-12 above |
| Analyze complexity | Page 10, "Minimal change" | Complexity Analysis section |
| Define 5 failure modes | Page 20, "Monitor" | FM1-FM5 above |
| Choose regex over parser | Page 10, "Small diffs, strong evidence" | Decision 1 |
| Graceful degradation | Page 18, "No gate, no progress" | Decision 2, Strategy 1 |
| Progressive rollout | Page 20, "Monitor" | Strategy 3 |
| Test-driven | Page 7, "Verify - Tests That Fight Back" | Strategy 4 |

---
Generated by Claude Council
Date: 2025-11-07T16:20:00Z
Phase: THINK
Task: AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107
Status: Complete

**Next:** GATE phase (design.md) with DesignReviewer validation
