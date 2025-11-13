# Think: TODO/Stub Prevention Edge Cases & Failure Modes

**Task ID:** AFP-TODO-STUB-PREVENTION-20251113
**Date:** 2025-11-13

## Edge Cases (Scenario → Impact → Detection → Mitigation)

### EC1: Clever TODO Evasion
**Scenario:** Agent writes `// @todo` or `// TBD` or `// INCOMPLETE` instead of `// TODO`
**Impact:** Stub implementation bypasses pre-commit detection
**Detection:** Add more marker patterns to regex
**Mitigation:**
- Expand regex to: `TODO|FIXME|XXX|HACK|TBD|@todo|INCOMPLETE|NOT IMPLEMENTED|PLACEHOLDER`
- Case-insensitive matching
- Detect pattern: `implement.*later|finish.*this|stub`

### EC2: TODO in String Literals
**Scenario:** Legitimate code has `const message = "TODO list app"`
**Impact:** False positive blocks valid commit
**Detection:** Grep shows +line with string literal
**Mitigation:**
- Exclude lines matching: `["'\`].*TODO.*["'\`]` (quoted strings)
- Exclude lines matching: `=.*TODO` (likely assignment)
- Manual override: Add `// cspell:disable-line` to bypass

### EC3: TODO in Commented-Out Code
**Scenario:** Code has `// const x = 1; // TODO: remove`
**Impact:** Should this be blocked? Debatable.
**Detection:** Nested comment pattern
**Mitigation:** BLOCK - commented code shouldn't be committed anyway

### EC4: Minimal Design Just Above Threshold
**Scenario:** Agent writes exactly 51 lines of fluff to pass 50-line check
**Impact:** Superficial design still passes
**Detection:** Template content detection, section validation
**Mitigation:**
- Require specific sections (not just line count)
- Detect repetitive content (same line repeated)
- Require code examples or pseudocode in algorithm tasks

### EC5: Design With Generic Sections
**Scenario:** Agent adds "## Algorithm Specification" with text "See plan.md"
**Impact:** Section exists but has no content
**Detection:** Section length check
**Mitigation:**
- Require each section to be ≥5 lines
- Detect cross-references without content: `see plan|see spec|see above`
- Require concrete content (code, pseudocode, or detailed steps)

### EC6: Tests That Superficially Match Criteria
**Scenario:** Acceptance: "Implement GOL algorithm", Test: "GOL module loads successfully"
**Impact:** Keyword matching shows overlap but test doesn't validate algorithm
**Detection:** Test only checks imports/initialization, not behavior
**Mitigation:**
- Detect shallow test patterns: `loads|imports|defined|exists`
- Require tests with assertions about behavior: `calculates|transforms|returns|produces`
- Warn if tests don't include concrete values: `expect(...).toBe(specificValue)`

### EC7: Roadmap Task Without Acceptance Criteria
**Scenario:** Task in roadmap.yaml has no `acceptance:` field
**Impact:** ProcessCritic can't validate test coverage
**Detection:** Empty acceptance array
**Mitigation:**
- Don't block (allow tasks without formal criteria)
- Log warning: "Task has no acceptance criteria, skipping test validation"
- Recommend adding criteria for better validation

### EC8: Algorithm Task Mislabeled
**Scenario:** Task title is "Refactor GOL module" (refactor, not algorithm)
**Impact:** DesignReviewer doesn't require algorithm section
**Detection:** Keywords don't match
**Mitigation:**
- Expand algorithm detection: `implement|calculate|compute|sort|search|process|transform|generate`
- Allow manual override in design.md: `<!-- DESIGN_TYPE: algorithm -->`
- Check task description and acceptance criteria for algorithm keywords

### EC9: Pre-Commit Hook Bypassed
**Scenario:** Agent uses `git commit --no-verify` or `SKIP_AFP=1`
**Impact:** All pre-commit checks bypassed
**Detection:** Git history shows --no-verify in workflow
**Mitigation:**
- Document that --no-verify is for emergencies only
- Add post-commit hook that warns if pre-commit was skipped
- CI job validates all commits, catches bypassed commits

### EC10: False Negative - Stub Without TODO
**Scenario:** Implementation is `function gol() { return { status: 'ok' }; }` (no TODO but clearly a stub)
**Impact:** Stub passes TODO detection
**Detection:** Need semantic analysis of implementation
**Mitigation:**
- Add heuristic: If implementation file is <50 LOC and has no logic (only returns, no conditionals/loops)
- Detect stub patterns: `return { status|throw new Error.*not implemented|console.log.*placeholder`
- ProcessCritic: Require tests to actually run the implementation and assert on concrete outputs

### EC11: Performance - Large Commits
**Scenario:** Commit has 100 changed files, each needs checking
**Impact:** Pre-commit takes >5 seconds, frustrates developers
**Detection:** Performance test with large commit
**Mitigation:**
- Use `git diff --cached` efficiently (single pass)
- Limit checks to .ts/.js/.mjs files only
- Cache roadmap.yaml parse (don't re-parse per file)
- Parallelize critic runs if possible

### EC12: Merge Conflicts in Evidence Files
**Scenario:** Two branches both modify design.md, merge creates conflict markers
**Impact:** Design.md has `<<<<<<< HEAD` markers, might pass length check
**Detection:** Conflict markers present
**Mitigation:**
- Pre-commit checks for conflict markers first
- Block any file with `<<<<<<<|=======|>>>>>>>` patterns
- Require clean merge before commit

## Failure Modes (Cause → Symptom → Impact → Detection → Recovery)

### FM1: Regex Catastrophic Backtracking
**Cause:** Complex regex pattern with nested quantifiers
**Symptom:** Pre-commit hook hangs on large file
**Impact:** Developer can't commit, workflow blocked
**Detection:** Timeout after 30 seconds
**Recovery:**
- Use simpler patterns, avoid nested `.*`
- Test regex on large files before deploying
- Add timeout to grep commands: `timeout 10s grep ...`

### FM2: False Positive on Legitimate Code
**Cause:** Detection rules too strict, block valid commits
**Symptom:** Developer repeatedly blocked, loses trust
**Impact:** Developers use `--no-verify` to bypass, system useless
**Detection:** High false positive rate in user feedback
**Recovery:**
- Provide escape hatch: Add `// suppress:TODO` annotation
- Collect false positives, refine patterns
- Allow WIP branches to bypass strict checks

### FM3: DesignReviewer Crash on Malformed YAML
**Cause:** Roadmap.yaml has syntax error
**Symptom:** ProcessCritic throws exception parsing YAML
**Impact:** Pre-commit fails, blocks all commits
**Detection:** Exception in critic output
**Recovery:**
- Wrap YAML parsing in try-catch
- If parse fails, log warning and ALLOW commit (don't block on infrastructure error)
- Validate roadmap.yaml in CI separately

### FM4: Circular Dependency - Critics Require Build
**Cause:** Critics are TypeScript, need to be built before running
**Symptom:** Pre-commit tries to run critics but they're not compiled
**Impact:** Critics don't run, stubs pass through
**Detection:** `Cannot find module` errors
**Recovery:**
- Ensure `cd tools/wvo_mcp && npm run build` in CI/pre-push hook
- Pre-commit hook checks if dist/ exists before running TypeScript critics
- Fallback to bash-only checks if TypeScript unavailable

### FM5: Test Retroactively Added After IMPLEMENT
**Cause:** Agent implements code, THEN adds tests to plan.md to pass ProcessCritic
**Symptom:** Tests in PLAN but written after IMPLEMENT
**Impact:** Defeats "test-first" requirement
**Detection:** Git history shows plan.md modified after implementation files
**Recovery:**
- ProcessCritic checks file timestamps
- BLOCK if plan.md was modified AFTER source files
- Require tests to be committed BEFORE or WITH implementation (same commit is OK)

### FM6: Agent Splits Commit to Bypass
**Cause:** Agent commits design.md first (passes), then commits stub separately
**Symptom:** Each commit individually passes, but together violate rules
**Impact:** Stub implementation gets through
**Detection:** Historical analysis needed
**Recovery:**
- ProcessCritic validates ENTIRE task state, not just current commit
- Before marking task DONE, verify design + implementation + tests all present
- PR review checks entire task branch, not individual commits

### FM7: Keyword Matching Too Simplistic
**Cause:** Acceptance criterion: "User can play GOL", Test: "User authentication works"
**Symptom:** Both have "user", shows false overlap
**Impact:** Irrelevant test appears to cover criterion
**Detection:** Low overlap ratio despite keyword match
**Recovery:**
- Use longer keyword phrases (3+ words)
- Require multiple keyword matches, not just one
- Weight domain-specific keywords higher (GOL, grid, cell > user, can)

### FM8: Design Template Updated, Old Tasks Grandfathered
**Cause:** We add new required sections, old tasks fail retroactively
**Symptom:** Can't modify old tasks without expanding design
**Impact:** Backwards incompatible, blocks maintenance
**Detection:** Task created before template change
**Recovery:**
- Add design template version header: `<!-- DESIGN_VERSION: 2 -->`
- Only enforce new rules for new versions
- Allow old designs to pass with WARNING, not BLOCK

### FM9: Wave 0 Autonomy Creates WIP Branches
**Cause:** Wave 0 learns WIP branches bypass checks, always uses WIP
**Symptom:** All Wave 0 work on WIP branches, never enforced
**Impact:** Defeats purpose of prevention system
**Detection:** Roadmap tasks assigned to Wave 0 all on WIP branches
**Recovery:**
- Wave 0 executor code: BLOCK WIP branch creation for production tasks
- Only allow WIP for experimental/debugging tasks
- Require task status=done to merge, even from WIP branch

### FM10: Agent Confusion Persists Despite Detection
**Cause:** Agent still confuses task despite ProcessCritic warning
**Symptom:** Agent ignores "suspicious tests" warning, continues
**Impact:** Domain mismatch not actually fixed
**Detection:** Warning logged but not acted on
**Recovery:**
- Escalate "suspicious tests" from WARN to BLOCK if overlap <20%
- Require agent to acknowledge warning: Add comment in plan.md addressing concern
- Reviewer (human or AI) must explicitly approve domain mismatch

## Assumptions & Risks

### Assumption 1: Git Hooks Are Installed
**Risk:** Fresh clone doesn't have hooks, pre-commit doesn't run
**Mitigation:**
- Bootstrap script installs hooks: `make install-hooks`
- README documents hook requirement
- CI validates hooks are installed in PRs

### Assumption 2: Agents Don't Maliciously Bypass
**Risk:** If agent wants to bypass, it can use `--no-verify`
**Mitigation:**
- This is behavioral enforcement, not security
- CI validates all commits, catches bypasses
- Audit log tracks --no-verify usage

### Assumption 3: Keywords Sufficient for Detection
**Risk:** NLP/semantic meaning requires more than keywords
**Mitigation:**
- Accept some false negatives (better than complex AI)
- Iterate on patterns based on real incidents
- Add manual review for ambiguous cases

### Assumption 4: Roadmap.yaml is Authoritative
**Risk:** If roadmap is wrong, validation is wrong
**Mitigation:**
- Roadmap is human-curated, highest authority
- If roadmap is unclear, ask human to clarify
- Don't auto-fix roadmap based on tests

### Assumption 5: Design Length Correlates With Quality
**Risk:** Verbose fluff can be >50 lines, concise brilliance can be <50
**Mitigation:**
- Length is minimum bar, not quality measure
- Combine with section requirements (not just length)
- DesignReviewer also checks AFP/SCAS score (orthogonal metric)

## Complexity Analysis

### Algorithmic Complexity
- TODO detection: O(n) where n = lines in changed files (fast)
- DesignReviewer: O(m) where m = lines in design.md (fast)
- ProcessCritic: O(k*t) where k = acceptance criteria, t = test descriptions (fast, k and t typically <20)

### Integration Complexity
- **HIGH**: Pre-commit hook integration with existing checks
- **MEDIUM**: TypeScript critics need build step
- **LOW**: Bash-based checks are simple

### Cognitive Complexity
- **MEDIUM**: Developers need to understand new rules
- **LOW**: Error messages provide clear guidance
- **HIGH**: Agents need to deeply understand requirements (this is the point!)

### Operational Complexity
- **LOW**: No new infrastructure required
- **MEDIUM**: Need to maintain regex patterns as bypasses discovered
- **LOW**: Tests ensure checks don't regress

## Mitigation Strategy (Prevent → Detect → Recover)

### Prevent
- Comprehensive regex patterns for TODO variations
- Section requirements, not just line count
- Keyword matching with domain specificity
- Template version for backwards compatibility

### Detect
- Performance tests with large commits
- False positive tracking in user feedback
- Retroactive validation against historical incidents (AUTO-GOL-T1)
- CI validation catches bypassed commits

### Recover
- Clear error messages with remediation steps
- Escape hatches for legitimate edge cases (suppress annotations)
- Manual review for ambiguous cases
- Iterate patterns based on real-world usage

## Worst-Case Thinking

### Worst Case 1: System Creates False Sense of Security
**Scenario:** Developers trust checks blindly, don't review carefully
**Impact:** Sophisticated bypasses go undetected
**Mitigation:** Document that checks are MINIMUM bar, not replacement for review

### Worst Case 2: Agent Arms Race
**Scenario:** Agents learn to game specific patterns, we add more patterns, repeat
**Impact:** Ever-growing complexity, diminishing returns
**Mitigation:** Focus on root cause (agent understanding requirements) not symptoms

### Worst Case 3: Legitimate Innovation Blocked
**Scenario:** Novel approach doesn't match expected patterns, blocked
**Impact:** Stifles creativity
**Mitigation:** Allow human override with explanation, learn from exceptions

### Worst Case 4: Performance Degradation
**Scenario:** Checks slow down commit workflow significantly
**Impact:** Developers frustrated, bypass system
**Mitigation:** Performance tests, optimization, caching, timeout limits

## Testing Strategy (Thinking)

1. **Unit Tests**: Each detection pattern in isolation
2. **Integration Test**: Run all checks against AUTO-GOL-T1 evidence
3. **Performance Test**: 100-file commit completes in <5s
4. **False Positive Test**: Known-good commits still pass
5. **Bypass Test**: Known bypasses are caught
6. **Edge Case Test**: Each EC1-EC12 has corresponding test

## Next Actions

Proceed to DESIGN phase with detailed architecture for each detection layer.
