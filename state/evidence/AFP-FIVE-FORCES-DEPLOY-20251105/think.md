# Think: AFP Five Forces Deployment

**Task ID:** AFP-FIVE-FORCES-DEPLOY-20251105
**Date:** 2025-11-05
**Phase:** THINK

---

## Edge Cases & Failure Modes

### EC1: Amend Commits

**Scenario:** User runs `git commit --amend` to fix commit message.

**Problem:** Hook runs again, but commit message might not be in expected location.

**Solution:**
- Hook should check both `git log -1 --pretty=%B` (for amends) and `.git/COMMIT_EDITMSG` (for new commits)
- Fallback chain ensures message found

**Test:** `git commit -m "test" && git commit --amend -m "Pattern: test_pattern"`

---

### EC2: Merge Commits

**Scenario:** User merges branch, hook runs on merge commit.

**Problem:** Merge commits have special format, might not have pattern reference.

**Solution:**
- Detect merge commits: `git rev-parse -q --verify MERGE_HEAD`
- Skip pattern check for merges (not user code, just integration)
- Still check LOC limit (in case merge brings huge changes)

**Test:** Create branch, modify code, merge → hook should allow without pattern

---

### EC3: Revert Commits

**Scenario:** User runs `git revert <hash>` to undo previous commit.

**Problem:** Revert is deletion-heavy, not addition. Pattern reference doesn't make sense.

**Solution:**
- Detect revert: Check if commit message starts with "Revert"
- Skip pattern check for reverts
- Deletion accounting satisfied automatically (reverting = deleting)

**Test:** Make commit, revert it → hook should allow

---

### EC4: Empty Commits

**Scenario:** User runs `git commit --allow-empty` for triggers/tags.

**Problem:** No code changes, pattern reference irrelevant.

**Solution:**
- Detect empty commit: `git diff --cached --quiet`
- Skip all checks except commit message sanity

**Test:** `git commit --allow-empty -m "trigger deploy"` → should allow

---

### EC5: Initial Commit

**Scenario:** First commit in new repo, no previous commits exist.

**Problem:** `git log -1` fails (no commits yet).

**Solution:**
- Detect initial commit: `git rev-parse --verify HEAD` fails
- Read message from `.git/COMMIT_EDITMSG` only
- Apply same rules (still need pattern reference)

**Test:** In empty repo, make first commit → hook should work

---

### EC6: Interactive Rebase

**Scenario:** User runs `git rebase -i`, hook runs multiple times.

**Problem:** Each rebased commit gets hook called. Messages might be preserved from original.

**Solution:**
- Hook reads commit message as-is
- If original commits had pattern references, they're preserved
- If not, rebase will fail (user must fix messages)

**Mitigation:** Provide clear error during rebase with fix instructions

**Test:** Rebase 3 commits without patterns → hook should block with helpful message

---

### EC7: Commit Message from File

**Scenario:** User runs `git commit -F message.txt`.

**Problem:** Message not in expected location initially.

**Solution:**
- Hook reads `.git/COMMIT_EDITMSG` which contains message from file
- Same validation logic works

**Test:** `echo "Pattern: test" > msg.txt && git commit -F msg.txt` → should work

---

### EC8: No Commit Message Editor

**Scenario:** User runs `git commit` without `-m`, editor never opened (CI environment).

**Problem:** `.git/COMMIT_EDITMSG` might be empty or missing.

**Solution:**
- Check if file exists and non-empty
- If empty/missing, provide clear error: "No commit message found. Use -m or set EDITOR."

**Test:** `EDITOR=true git commit` (editor exits immediately) → should fail clearly

---

### EC9: Very Long Commit Messages

**Scenario:** User writes essay in commit message (>1000 lines).

**Problem:** Grep/search might be slow, hook times out.

**Solution:**
- Only check first 100 lines of commit message for pattern/deletion
- Patterns should be near top anyway (convention)
- If timeout risk, add `head -100` to message extraction

**Test:** Commit with 2000-line message → hook completes in <10 seconds

---

### EC10: Special Characters in Pattern Names

**Scenario:** Pattern name has regex special chars: "error_handling (v2.1)"

**Problem:** Grep might interpret as regex, fail to match.

**Solution:**
- Use `grep -F` (fixed string) for pattern matching, not regex
- Or escape special chars in pattern name

**Test:** `git commit -m "Pattern: auth (v2.0+beta)"` → should match

---

### EC11: Multi-Line Pattern References

**Scenario:** User formats commit message with pattern on separate line:
```
Fix user authentication

Pattern: jwt_validation
Deleted: old session-based auth (-50 LOC)
```

**Problem:** Grep might miss if looking for specific format.

**Solution:**
- Pattern check looks for "Pattern:" anywhere in message (multi-line safe)
- Deletion check looks for "Deleted:" anywhere
- No line-position requirements

**Test:** Multi-line commit message → should find pattern/deletion

---

### EC12: Multiple Patterns in One Commit

**Scenario:** Commit uses 2 patterns: error logging + caching.

**Problem:** Only one "Pattern:" line.

**Solution:**
- Allow multiple pattern references:
  ```
  Pattern: error_logging_with_context
  Pattern: cache_with_ttl
  ```
- Grep matches if ANY "Pattern:" found
- Document in guide that multiple patterns OK

**Test:** Commit with 2 pattern lines → should pass

---

### EC13: Typos in Pattern References

**Scenario:** User writes "Patern:" or "Patttern:" (typo).

**Problem:** Hook doesn't find it, blocks commit.

**Solution:**
- Don't try to be smart with fuzzy matching (complexity)
- Provide clear error: "Did you mean 'Pattern:'? (check spelling)"
- User fixes typo, commits again

**Test:** `git commit -m "Patern: test"` → should fail with helpful hint

---

### EC14: Override Without Reason

**Scenario:** User tries `git commit --override=""` (empty reason).

**Problem:** Defeats purpose of override logging.

**Solution:**
- Check if reason is non-empty: `[ -n "$REASON" ]`
- If empty, reject: "Override requires non-empty reason"

**Test:** `git config hooks.override "" && git commit` → should fail

---

### EC15: Override Persists Across Commits

**Scenario:** User sets override, commits, then commits again. Second commit shouldn't have override.

**Problem:** Git config might persist.

**Solution:**
- Immediately unset after reading: `git config --unset hooks.override`
- Each override is one-time use

**Test:** Set override, commit twice → only first should override

---

### EC16: State Directory Doesn't Exist

**Scenario:** Fresh clone, `state/` directory not created yet.

**Problem:** `echo >> state/overrides.jsonl` fails (directory missing).

**Solution:**
- Create directory first: `mkdir -p state`
- Then write to file

**Test:** Delete `state/`, make override commit → should create directory

---

### EC17: Hook Disabled Temporarily

**Scenario:** Emergency deploy, need to bypass ALL checks.

**Problem:** --override still requires pattern reference.

**Solution:**
- Environment variable: `SKIP_AFP=1 git commit`
- Logs to overrides with reason "SKIP_AFP environment variable"
- Only for emergencies

**Test:** `SKIP_AFP=1 git commit -m "emergency"` → should allow

---

### EC18: Pattern Name with Newline

**Scenario:** User accidentally includes newline in pattern: "Pattern: test\n"

**Problem:** Might break parsing.

**Solution:**
- Trim whitespace from extracted pattern in logs
- Grep will still find it (matches anywhere)

**Test:** Weird formatting → should still work or fail clearly

---

## Complexity Analysis

**Pre-commit hook complexity:**

**Current complexity (existing checks):**
- LOC limit check: O(n) where n = changed files
- File count check: O(n)
- Cyclomatic: ~5 (mostly linear)

**Added complexity:**
- Pattern check: O(m) where m = commit message length (~constant)
- Deletion check: O(n) for LOC count + O(m) for message check
- Override check: O(1) git config read
- Cyclomatic: +8 (two new check functions, override logic)

**Total cyclomatic complexity:** ~13 (still reasonable for bash)

**Performance:**
- Existing checks: ~2 seconds
- Pattern/deletion check: ~1 second (grep on small text)
- Override check: ~0.5 seconds (git config read/write)
- **Total: ~3.5 seconds (well under 10 second budget)**

**Complexity justified:** Adds 8 cyclomatic complexity but provides mechanical enforcement of five forces. Alternative (manual review) would be inconsistent.

**Mitigation:** Keep check functions separate and simple. No nesting beyond 2 levels.

---

## Failure Mode Analysis

### FM1: Hook Crashes

**Symptom:** Bash error, commit aborted.

**Causes:**
- Syntax error in hook
- Missing dependency (git, awk, grep)
- Filesystem error (permissions)

**Mitigation:**
- Test hook thoroughly before deployment
- Use `set -e` to fail fast on errors
- Provide clear error message with "Contact maintainer" instructions

**Recovery:** User can bypass with `git commit --no-verify` (emergency escape)

---

### FM2: Hook Too Slow

**Symptom:** Hook takes >10 seconds, users frustrated.

**Causes:**
- Large commit (thousands of files)
- Slow filesystem
- Regex complexity

**Mitigation:**
- Use simple grep (not complex regex)
- Only check first 100 lines of commit message
- Cache LOC count if calculated multiple times

**Detection:** Time the hook, log if >10 seconds

**Recovery:** Optimize slow parts or increase timeout

---

### FM3: Hook Too Strict

**Symptom:** Override rate >30%, users bypass constantly.

**Causes:**
- Pattern reference requirement too rigid
- Deletion accounting catches false positives
- Legitimate use cases not considered

**Mitigation:**
- Week 1: Monitor override log
- Adjust rules if >10% override rate
- Add more escape hatches if needed

**Recovery:** Revert hook changes, redesign, redeploy

---

### FM4: Hook Too Loose

**Symptom:** Code muck still accumulating, no pattern reuse.

**Causes:**
- Pattern reference not specific enough ("Pattern: misc")
- Deletion accounting easy to fake
- Override used liberally

**Mitigation:**
- Week 2: Audit pattern references manually
- Tighten rules if gaming detected
- Remove override option if abused

**Recovery:** Add stricter validation

---

### FM5: Documentation Unclear

**Symptom:** Users don't know how to comply, many support requests.

**Causes:**
- Quick-start guide too technical
- Examples not clear
- Error messages not helpful

**Mitigation:**
- Include examples in every error message
- Link to quick-start in error messages
- Update docs based on common questions

**Recovery:** Rewrite unclear sections

---

### FM6: Override Log Grows Unbounded

**Symptom:** `state/overrides.jsonl` becomes megabytes.

**Causes:**
- High override usage
- No log rotation

**Mitigation:**
- Weekly review includes log size check
- Archive old overrides (>1 month)
- Alert if >1000 overrides in a week

**Recovery:** Rotate logs, investigate high usage

---

### FM7: Pattern Names Collide

**Symptom:** Two different patterns with same name.

**Causes:**
- No central pattern registry
- Different modules use same name differently

**Mitigation:**
- Week 2: Start pattern catalog (centralized naming)
- Name patterns with scope: "orchestrator/error_logging"

**Recovery:** Rename patterns, update commits

---

### FM8: AFP Checklist Ignored

**Symptom:** Design documents exist but five forces not actually considered.

**Causes:**
- Compliance theater (check boxes without thinking)
- Template too long (TL;DR)

**Mitigation:**
- GATE review catches shallow thinking
- DesignReviewer critic validates thinking depth

**Recovery:** Reject superficial designs, require real analysis

---

## Risk Mitigation Summary

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hook crashes | Low | High | Thorough testing |
| Hook too slow | Medium | Medium | Performance budget (10s) |
| Hook too strict | High | Medium | Override + monitoring |
| Hook too loose | Medium | High | Weekly audit |
| Docs unclear | High | Low | Examples everywhere |
| Override abuse | Medium | High | Weekly review + tightening |
| Pattern collision | Low | Medium | Central catalog (week 2) |
| Compliance theater | Medium | Medium | GATE review depth |

**Overall risk:** MEDIUM. Mitigations in place for all major risks. 2-week review provides kill switch.

---

## AFP/SCAS Self-Check

**Does this implementation follow AFP principles?**

**COHERENCE:** ✅
- Pre-commit hooks are standard pattern (matching existing checks)
- Markdown documentation follows existing structure
- Commit message format builds on existing conventions

**ECONOMY:** ⚠️
- Adding +300 LOC (exceeds limit)
- Deleting -10 LOC (minimal)
- Justification: Foundational change, mostly docs, can't split
- Could we delete more? Not without removing useful documentation.

**LOCALITY:** ✅
- All changes in 4 related files (git hooks, templates, docs, checklist)
- Dependencies are local (hook → docs → checklist)
- No scattered changes

**VISIBILITY:** ✅
- Error messages explain what failed + how to fix
- Override logging makes abuse visible
- Documentation links in all error messages

**EVOLUTION:** ✅
- Override log enables pattern fitness tracking
- Pattern references enable usage tracking
- 2-week review provides adaptation mechanism

**Verdict:** AFP-compliant with exception for LOC limit (justified).

---

**Next Phase:** GATE (create design.md synthesizing strategy/spec/plan/think)
