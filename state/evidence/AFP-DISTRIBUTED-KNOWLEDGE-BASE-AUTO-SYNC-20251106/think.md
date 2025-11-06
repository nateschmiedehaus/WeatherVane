# Think: Edge Cases and Failure Modes

**Task ID:** AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106
**Phase:** THINK
**Date:** 2025-11-06

## Edge Case Analysis

### EC1: Concurrent README Updates (Merge Conflicts)

**Scenario:**
```
Agent A working in src/prove/ (adds feature X)
Agent B working in src/prove/ (fixes bug Y)
Both run readme_update.sh simultaneously
Both append to "Recent Changes"
```

**Failure Mode:**
```markdown
## Recent Changes

<<<<<<< HEAD
### AFP-X-001 - Added feature X
- Files: foo.ts
- Impact: medium
=======
### AFP-Y-002 - Fixed bug Y
- Files: bar.ts
- Impact: low
>>>>>>> branch-y
```

**Likelihood:** Medium (parallel work common in distributed systems)

**Impact:** High (blocks commits, confuses agents, loses changes)

**Mitigation Strategies:**

1. **Append-Only Design (ALREADY IN PLAN)**
   - Recent Changes is append-only (no edits to existing entries)
   - Each entry has unique timestamp + task ID
   - Git handles append conflicts better than edit conflicts

2. **Timestamp Ordering**
   ```bash
   # In readme_update.sh, use ISO 8601 timestamp for uniqueness
   TIMESTAMP=$(date -Iseconds)
   NEW_ENTRY="### [$TIMESTAMP] $TASK_ID - $CHANGE_DESC"
   ```

3. **Conflict Resolution Instructions**
   ```bash
   # In pre-commit hook, detect conflicts
   if grep -q "^<<<<<<< HEAD" "$README"; then
     echo "⚠️  README has merge conflict"
     echo "   Resolution: Keep both entries, sort by timestamp"
     echo "   Then: git add $README && git commit"
     exit 1
   fi
   ```

4. **Automated Conflict Resolution (Future)**
   - Script that auto-resolves append-only conflicts
   - Keeps both entries, sorts by timestamp
   - Validates YAML frontmatter after merge

**Test Case:**
```bash
# Simulate concurrent updates
git checkout -b branch-a
scripts/readme_update.sh src/prove AFP-TEST-A <<EOF
Feature A
medium
EOF
git add src/prove/README.md

git checkout -b branch-b main
scripts/readme_update.sh src/prove AFP-TEST-B <<EOF
Feature B
low
EOF
git add src/prove/README.md

git checkout branch-a
git merge branch-b
# Expected: Conflict in Recent Changes section
# Resolution: Keep both, sort by timestamp
```

**Complexity Score:** 6/10 (append-only helps, but conflicts still possible)

---

### EC2: Template Evolution (Backward Compatibility)

**Scenario:**
```
Month 1: Template has sections [Purpose, Recent Changes, Modules]
Month 6: Add new section [Security Considerations]
Result: 200 READMEs missing new section
```

**Failure Mode:**
- Inconsistent README structure across directories
- Newer agents expect sections that don't exist
- Manual migration required for 200+ files

**Likelihood:** High (templates evolve over time)

**Impact:** Medium (doesn't break automation, just inconsistency)

**Mitigation Strategies:**

1. **Graceful Degradation**
   - Scripts don't assume section existence
   - Check for section before inserting
   ```bash
   if grep -q "^## Security Considerations" "$README"; then
     # Section exists, update it
   else
     # Section missing, skip or append new section
     echo -e "\n## Security Considerations\n[TODO: Add security notes]" >> "$README"
   fi
   ```

2. **Version Frontmatter**
   ```yaml
   ---
   template_version: 1.0
   ---
   ```
   - Scripts check template_version before operating
   - Warn if version mismatch

3. **Migration Script (One-Time)**
   ```bash
   # scripts/readme_migrate.sh
   # Detects old template version
   # Adds new sections in correct order
   # Updates template_version
   ```

4. **Gradual Migration (Preferred - AFP Via Negativa)**
   - Don't force immediate migration (avoid disruption)
   - Update READMEs organically as tasks touch directories
   - Old structure still works, just not ideal
   - 90-day grace period for migration

**Test Case:**
```bash
# Create README with v1.0 template
scripts/readme_init.sh test_dir_v1

# Upgrade template to v2.0 (add Security section)
echo "## Security Considerations" >> docs/templates/readme_template.md
sed -i 's/template_version: 1.0/template_version: 2.0/' docs/templates/readme_template.md

# Attempt to update old README
scripts/readme_update.sh test_dir_v1 AFP-TEST
# Expected: Works, warns about version mismatch
```

**Complexity Score:** 4/10 (gradual migration avoids disruption)

---

### EC3: README Quality Degradation (Lazy Updates)

**Scenario:**
```
Agent writes lazy Recent Changes:
### AFP-123 - Updated stuff
- Files: things
- Impact: some

Result: Useless documentation
```

**Failure Mode:**
- READMEs become noise, not signal
- Agents stop reading them (defeats purpose)
- Knowledge graph loses value

**Likelihood:** Very High (agents optimize for speed, not quality)

**Impact:** Critical (undermines entire system)

**Mitigation Strategies:**

1. **Structured Prompts (ALREADY IN PLAN)**
   ```bash
   # In readme_update.sh
   echo "Files changed in $DIRECTORY:"
   echo "$CHANGED_FILES"
   read -p "📝 Change description (verb + what changed): " CHANGE_DESC
   read -p "🎯 Impact [low/medium/high]: " IMPACT

   # Validate format
   if [[ ${#CHANGE_DESC} -lt 10 ]]; then
     echo "❌ Description too short (min 10 chars)"
     exit 1
   fi
   ```

2. **Quality Check in Pre-Commit Hook**
   ```bash
   # Check for lazy descriptions
   if grep -E "stuff|things|updated|changed" "$README" | grep "^###"; then
     echo "⚠️  Lazy README description detected"
     echo "   Use specific verbs: Added, Fixed, Refactored, Removed"
     # Warning only, don't block (allow override)
   fi
   ```

3. **Periodic Quality Audit (Self-Improvement)**
   - Self-improvement system scans READMEs quarterly
   - Creates improvement tasks for low-quality READMEs
   - Agents rewrite lazy entries

4. **Examples in Template**
   ```markdown
   ## Recent Changes

   ### AFP-EXAMPLE-001 - Added proof validation layer
   - Files: prove/validator.ts, prove/types.ts
   - Impact: high
   - See: state/evidence/AFP-EXAMPLE-001/

   ❌ BAD: "Updated stuff" (too vague)
   ✅ GOOD: "Added proof validation layer" (specific action + what)
   ```

**Test Case:**
```bash
# Test quality check
echo "### AFP-BAD - Updated stuff" >> test_dir/README.md
git add test_dir/README.md
git commit -m "test"
# Expected: Warning (but allows commit)

# Test minimum length
scripts/readme_update.sh test_dir AFP-TEST <<EOF
x
low
EOF
# Expected: Blocked (description too short)
```

**Complexity Score:** 7/10 (cultural/behavioral issue, hard to enforce)

---

### EC4: Script Portability (macOS vs Linux)

**Scenario:**
```bash
# macOS sed requires -i with extension
sed -i.bak "s/foo/bar/" file.txt

# Linux sed works without extension
sed -i "s/foo/bar/" file.txt

Result: Scripts fail on one platform
```

**Failure Mode:**
- Bash scripts work on macOS, fail on Linux (or vice versa)
- CI/CD failures
- Contributor frustration

**Likelihood:** High (team uses both platforms)

**Impact:** Medium (blocks automation, but fixable)

**Mitigation Strategies:**

1. **POSIX-Compliant Bash (ALREADY IN PLAN)**
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail

   # Use POSIX-compatible commands
   # Avoid GNU-specific flags
   ```

2. **Cross-Platform sed Wrapper**
   ```bash
   # In readme_lib.sh
   sed_inplace() {
     # Portable in-place sed
     if [[ "$OSTYPE" == "darwin"* ]]; then
       sed -i.bak "$@"
     else
       sed -i "$@"
     fi
   }
   ```

3. **Cross-Platform date Wrapper**
   ```bash
   # In readme_lib.sh
   current_date() {
     # Portable ISO 8601 date
     if [[ "$OSTYPE" == "darwin"* ]]; then
       date -u +"%Y-%m-%d"
     else
       date -u --iso-8601=date
     fi
   }
   ```

4. **Test on Both Platforms (CI)**
   ```yaml
   # .github/workflows/test_readme_scripts.yml
   jobs:
     test:
       strategy:
         matrix:
           os: [ubuntu-latest, macos-latest]
       runs-on: ${{ matrix.os }}
       steps:
         - run: bash scripts/readme_init.sh test_dir
         - run: bash scripts/readme_update.sh test_dir
   ```

**Test Case:**
```bash
# Manual test on both platforms
# macOS
bash scripts/readme_init.sh test_dir_mac
bash scripts/readme_update.sh test_dir_mac AFP-TEST

# Linux (in Docker)
docker run --rm -v $PWD:/work ubuntu:latest bash -c "
  cd /work
  bash scripts/readme_init.sh test_dir_linux
  bash scripts/readme_update.sh test_dir_linux AFP-TEST
"

# Compare outputs
diff test_dir_mac/README.md test_dir_linux/README.md
# Expected: Identical (except timestamps)
```

**Complexity Score:** 5/10 (known problem, standard solutions)

---

### EC5: YAML Parsing Errors (Malformed Frontmatter)

**Scenario:**
```markdown
---
type: directory_readme
directory: src/prove
status: in-progress
last_updated: 2025-11-06
owner: WeatherVane
# Agent accidentally adds unquoted colon
bad_field: foo: bar
---
```

**Failure Mode:**
```
YAMLParseError: Unexpected token at line 7
Scripts that parse YAML crash
README becomes unreadable to automation
```

**Likelihood:** Medium (agents make mistakes, humans edit)

**Impact:** High (breaks automation, blocks commits)

**Mitigation Strategies:**

1. **YAML Validation in Pre-Commit Hook**
   ```bash
   # In pre-commit hook
   validate_yaml_frontmatter() {
     local readme="$1"

     # Extract frontmatter
     local yaml=$(sed -n '/^---$/,/^---$/p' "$readme")

     # Validate with yq or python
     if command -v yq >/dev/null; then
       echo "$yaml" | yq . >/dev/null 2>&1 || {
         echo "❌ Invalid YAML frontmatter in: $readme"
         echo "   Fix syntax errors and try again"
         return 1
       }
     fi
   }
   ```

2. **Safe YAML Generation (Quote All Values)**
   ```bash
   # In readme_init.sh and readme_update.sh
   # Always quote string values to avoid colon issues
   cat > "$README" <<EOF
   ---
   type: "directory_readme"
   directory: "$DIRECTORY_PATH"
   status: "in-progress"
   last_updated: "$CURRENT_DATE"
   owner: "WeatherVane Autopilot"
   dependencies: []
   consumers: []
   ---
   EOF
   ```

3. **Validation Tool**
   ```bash
   # scripts/readme_validate.sh
   # Validate all READMEs in repo
   find . -name "README.md" -exec bash -c '
     yaml=$(sed -n "/^---$/,/^---$/p" "$1")
     echo "$yaml" | yq . >/dev/null 2>&1 || echo "❌ Invalid: $1"
   ' _ {} \;
   ```

4. **Recovery from Corruption**
   ```bash
   # If YAML invalid, backup and regenerate frontmatter
   if ! validate_yaml_frontmatter "$README"; then
     # Backup
     cp "$README" "$README.broken"

     # Extract markdown body (after frontmatter)
     body=$(sed '1,/^---$/d; /^---$/,$d' "$README")

     # Regenerate frontmatter
     scripts/readme_init.sh "$(dirname "$README")"

     # Append preserved body
     echo "$body" >> "$README"
   fi
   ```

**Test Case:**
```bash
# Create README with invalid YAML
cat > test_dir/README.md <<EOF
---
type: directory_readme
bad: foo: bar
---
# Test
EOF

# Attempt to validate
bash scripts/readme_validate.sh test_dir/README.md
# Expected: Error reported

# Attempt to commit
git add test_dir/README.md
git commit -m "test"
# Expected: Blocked by pre-commit hook
```

**Complexity Score:** 6/10 (validation straightforward, recovery tricky)

---

### EC6: Pre-Commit Hook False Positives

**Scenario:**
```bash
# Agent changes script in scripts/ directory
git add scripts/new_tool.sh
git commit -m "Add new tool"

# Pre-commit hook checks: Does scripts/README.md exist?
# Answer: No (scripts/ is skipped in should_skip_readme_check)
# But hook logic has bug, blocks commit anyway
```

**Failure Mode:**
- Hook blocks legitimate commits
- Agent doesn't understand cryptic error
- Agent uses --no-verify (defeats purpose)

**Likelihood:** Medium (logic bugs, edge cases in skip rules)

**Impact:** High (frustration, workarounds, compliance erosion)

**Mitigation Strategies:**

1. **Explicit Skip List (ALREADY IN PLAN)**
   ```bash
   should_skip_readme_check() {
     case "$1" in
       "." | ".github" | "scripts" | "state" | "docs" | ".git" | "node_modules" )
         return 0  # Skip these directories
         ;;
       * )
         return 1  # Require README
         ;;
     esac
   }
   ```

2. **Clear Error Messages with Fix Instructions**
   ```bash
   if [[ ! -f "$README" ]]; then
     echo "❌ README missing in: $DIR"
     echo ""
     echo "   Fix: scripts/readme_init.sh $DIR"
     echo ""
     echo "   Or skip check: git commit --no-verify (emergency only)"
     exit 1
   fi
   ```

3. **Dry-Run Mode for Testing**
   ```bash
   # scripts/test_pre_commit.sh
   # Simulates pre-commit hook without blocking
   DRY_RUN=1 bash .git/hooks/pre-commit
   ```

4. **Emergency Override Documentation**
   ```markdown
   # In MANDATORY_WORK_CHECKLIST.md

   ## Pre-Commit Hook Failures

   If hook incorrectly blocks your commit:
   1. Verify README is actually up-to-date
   2. Check skip list in .git/hooks/pre-commit
   3. Emergency override: git commit --no-verify
   4. Create bug report for hook logic
   ```

**Test Case:**
```bash
# Test skip directories
touch scripts/new_file.sh
git add scripts/new_file.sh
git commit -m "test"
# Expected: Success (scripts/ skipped)

# Test non-skip directory
mkdir src/new_feature
touch src/new_feature/index.ts
git add src/new_feature/index.ts
git commit -m "test"
# Expected: Blocked (README missing)

# Test emergency override
git commit --no-verify -m "test"
# Expected: Success (override works)
```

**Complexity Score:** 5/10 (good error messages reduce impact)

---

### EC7: Propagation Loops (Infinite Recursion)

**Scenario:**
```
Child change triggers parent update
Parent update is detected as change
Triggers parent's parent update
Triggers root update
Root update triggers all children
Infinite loop
```

**Failure Mode:**
- Scripts recurse infinitely
- Fill disk with log files
- Consume CPU
- Never complete

**Likelihood:** Low (only if propagation logic is buggy)

**Impact:** Critical (infinite loop, system hang)

**Mitigation Strategies:**

1. **Propagation Depth Limit**
   ```bash
   # In readme_lib.sh
   MAX_PROPAGATION_DEPTH=3

   propagate_to_parent() {
     local depth="${PROPAGATION_DEPTH:-0}"

     if [[ $depth -ge $MAX_PROPAGATION_DEPTH ]]; then
       log_event "README_PROPAGATE" "$1" "SKIPPED max_depth=$depth"
       return 0
     fi

     export PROPAGATION_DEPTH=$((depth + 1))
     # ... propagate logic
   }
   ```

2. **Propagation Marker (Skip Already Propagated)**
   ```bash
   # In readme_update.sh
   # Check if this update was already propagated from child
   if [[ -f "$DIRECTORY/.readme_propagating" ]]; then
     echo "ℹ️  Skipping propagation (already in progress)"
     return 0
   fi

   # Create marker
   touch "$DIRECTORY/.readme_propagating"

   # Propagate
   propagate_to_parent "$DIRECTORY"

   # Remove marker
   rm "$DIRECTORY/.readme_propagating"
   ```

3. **Propagation Happens OUTSIDE Git Hook**
   - Pre-commit hook only CHECKS freshness
   - Does NOT trigger updates
   - Updates only happen via explicit readme_update.sh call
   - This breaks potential loops

4. **Circuit Breaker**
   ```bash
   # In readme_lib.sh
   PROPAGATION_LOG="state/analytics/readme_propagations.log"

   propagate_to_parent() {
     # Count recent propagations (last 5 seconds)
     local recent=$(grep "$(date +%Y-%m-%d)" "$PROPAGATION_LOG" | tail -10 | wc -l)

     if [[ $recent -gt 10 ]]; then
       echo "⚠️  Circuit breaker: Too many propagations"
       log_event "README_PROPAGATE" "$1" "CIRCUIT_BREAKER recent=$recent"
       return 1
     fi

     # ... propagate logic
   }
   ```

**Test Case:**
```bash
# Create nested directories
mkdir -p test/level1/level2/level3/level4

# Initialize READMEs
for dir in test test/level1 test/level1/level2 test/level1/level2/level3 test/level1/level2/level3/level4; do
  scripts/readme_init.sh "$dir"
done

# Update deepest level with --propagate
scripts/readme_update.sh test/level1/level2/level3/level4 AFP-TEST --propagate

# Check propagation stopped at depth 3
grep -c "AFP-TEST" test/README.md
grep -c "AFP-TEST" test/level1/README.md
grep -c "AFP-TEST" test/level1/level2/README.md
# Expected: 0, 0, 0 (or limited propagation, not infinite)
```

**Complexity Score:** 8/10 (recursion is inherently risky, needs multiple safeguards)

---

### EC8: Performance Degradation (Large Scale)

**Scenario:**
```
Repository has:
- 500 directories
- 10,000 files
- Commit touches 50 files across 20 directories
- Pre-commit hook checks all 20 directories
- Takes 30 seconds
- Agent frustrated, uses --no-verify
```

**Failure Mode:**
- Pre-commit hook too slow
- Agents bypass hook to avoid wait
- Compliance drops

**Likelihood:** Medium (as codebase grows)

**Impact:** Medium (annoyance, but not critical)

**Mitigation Strategies:**

1. **Only Check Changed Directories (ALREADY IN PLAN)**
   ```bash
   # In pre-commit hook
   # Only check directories with staged changes
   CHANGED_DIRS=$(git diff --cached --name-only | xargs -n1 dirname | sort -u)

   # NOT: Check all directories in repo
   ```

2. **Parallel Checks**
   ```bash
   # In pre-commit hook
   # Check directories in parallel
   for DIR in $CHANGED_DIRS; do
     check_readme_freshness "$DIR" &
   done

   # Wait for all background jobs
   wait
   ```

3. **Fast-Path for Single File Changes**
   ```bash
   # In pre-commit hook
   if [[ $(echo "$CHANGED_DIRS" | wc -l) -eq 1 ]]; then
     # Single directory changed, skip expensive checks
     # Just verify README exists and is staged
   fi
   ```

4. **Performance Benchmark**
   ```bash
   # Test with large commit
   time git commit -m "test" --dry-run
   # Target: <2 seconds for 20 directories
   ```

**Test Case:**
```bash
# Create 100 directories with READMEs
for i in {1..100}; do
  mkdir -p test_perf/dir_$i
  scripts/readme_init.sh test_perf/dir_$i
  touch test_perf/dir_$i/file.ts
done

# Stage all files
git add test_perf/

# Benchmark pre-commit hook
time git commit -m "test" --dry-run
# Expected: <5 seconds for 100 directories
```

**Complexity Score:** 4/10 (standard optimization techniques)

---

### EC9: README Corruption Recovery

**Scenario:**
```
Agent accidentally deletes README.md
OR
Merge conflict corrupts README.md
OR
Script bug writes invalid content
```

**Failure Mode:**
- README is missing/corrupted
- Automation fails
- Knowledge is lost

**Likelihood:** Low (git provides history, but possible)

**Impact:** Medium (recoverable from git, but disruptive)

**Mitigation Strategies:**

1. **Git is Backup (Primary Recovery)**
   ```bash
   # Recover deleted README
   git checkout HEAD -- src/prove/README.md

   # Recover from specific commit
   git show abc123:src/prove/README.md > src/prove/README.md
   ```

2. **Backup Before Modification**
   ```bash
   # In readme_update.sh
   # Create backup before modifying
   cp "$DIRECTORY/README.md" "$DIRECTORY/README.md.bak.$(date +%s)"

   # ... make changes

   # On success, remove backup
   rm "$DIRECTORY/README.md.bak.*"

   # On failure, restore from backup
   if [[ $? -ne 0 ]]; then
     mv "$DIRECTORY/README.md.bak.*" "$DIRECTORY/README.md"
   fi
   ```

3. **Corruption Detection**
   ```bash
   # In readme_validate.sh
   validate_readme_structure() {
     local readme="$1"

     # Check required sections exist
     grep -q "^## Purpose" "$readme" || return 1
     grep -q "^## Recent Changes" "$readme" || return 1
     grep -q "^## Navigation" "$readme" || return 1

     # Check YAML frontmatter valid
     validate_yaml_frontmatter "$readme" || return 1

     return 0
   }
   ```

4. **Auto-Regeneration from Template**
   ```bash
   # If README corrupted beyond repair
   if ! validate_readme_structure "$README"; then
     echo "⚠️  README corrupted, regenerating from template"

     # Backup corrupted file
     mv "$README" "$README.corrupted.$(date +%s)"

     # Regenerate from template
     scripts/readme_init.sh "$(dirname "$README")"

     echo "ℹ️  Manual review needed: merge content from backup"
   fi
   ```

**Test Case:**
```bash
# Simulate corruption
echo "CORRUPTED" > test_dir/README.md

# Validate detects corruption
bash scripts/readme_validate.sh test_dir/README.md
# Expected: Failure

# Recover from git
git checkout HEAD -- test_dir/README.md

# Verify recovery
bash scripts/readme_validate.sh test_dir/README.md
# Expected: Success
```

**Complexity Score:** 3/10 (git provides strong guarantees)

---

### EC10: Agent Non-Compliance (Behavioral)

**Scenario:**
```
Agent ignores README completely
OR
Agent edits template sections instead of Recent Changes
OR
Agent removes automation markers
OR
Agent creates README but doesn't follow template
```

**Failure Mode:**
- Knowledge graph degrades
- Inconsistent structure
- Automation breaks

**Likelihood:** High (agents are autonomous, may not understand rules)

**Impact:** High (undermines system, hard to detect)

**Mitigation Strategies:**

1. **Pre-Commit Hook Enforcement (ALREADY IN PLAN)**
   - Hook blocks commits with stale READMEs
   - Forces compliance at commit time
   - Can't bypass without --no-verify

2. **Structural Validation**
   ```bash
   # In pre-commit hook
   validate_readme_structure() {
     # Check required sections exist
     grep -q "^## Purpose" "$1" || {
       echo "❌ README missing required section: Purpose"
       return 1
     }
     grep -q "^## Recent Changes" "$1" || {
       echo "❌ README missing required section: Recent Changes"
       return 1
     }
     # ... check other sections
   }
   ```

3. **Periodic Audit (Self-Improvement)**
   ```bash
   # In self_improvement.ts
   async scanReadmeCompliance(): Promise<ImprovementOpportunity[]> {
     // Scan all READMEs
     // Check template compliance
     // Create improvement tasks for non-compliant READMEs
   }
   ```

4. **Documentation in Template**
   ```markdown
   # In docs/templates/readme_template.md

   ⚠️ **AUTOMATION NOTICE**
   This README is partially automated. Do not:
   - Remove YAML frontmatter (breaks parsing)
   - Delete Required sections (breaks structure)
   - Edit Recent Changes manually (use scripts/readme_update.sh)

   Safe to edit:
   - Purpose section (describe this directory)
   - Modules/Contents (list files)
   - Integration Points (document dependencies)
   ```

**Test Case:**
```bash
# Create non-compliant README
cat > test_dir/README.md <<EOF
# My Directory
Just some stuff
EOF

# Attempt to commit
git add test_dir/README.md
git commit -m "test"
# Expected: Blocked (missing required sections)

# Fix with template
scripts/readme_init.sh test_dir --force

# Commit succeeds
git add test_dir/README.md
git commit -m "test"
# Expected: Success
```

**Complexity Score:** 7/10 (behavioral issues hard to prevent, only detect/correct)

---

## Failure Mode Summary

| Edge Case | Likelihood | Impact | Complexity | Mitigation |
|-----------|-----------|--------|------------|------------|
| EC1: Concurrent Updates | Medium | High | 6/10 | Append-only + timestamp + conflict resolution |
| EC2: Template Evolution | High | Medium | 4/10 | Graceful degradation + gradual migration |
| EC3: Quality Degradation | Very High | Critical | 7/10 | Structured prompts + validation + audit |
| EC4: Script Portability | High | Medium | 5/10 | POSIX compliance + wrappers + CI tests |
| EC5: YAML Parsing Errors | Medium | High | 6/10 | Validation + safe generation + recovery |
| EC6: Hook False Positives | Medium | High | 5/10 | Clear skip list + good errors + override docs |
| EC7: Propagation Loops | Low | Critical | 8/10 | Depth limit + markers + circuit breaker |
| EC8: Performance Issues | Medium | Medium | 4/10 | Only check changed + parallel + fast-path |
| EC9: Corruption Recovery | Low | Medium | 3/10 | Git backup + validation + regeneration |
| EC10: Agent Non-Compliance | High | High | 7/10 | Hook enforcement + validation + audit |

## Critical Risks (Require Extra Attention)

### Risk 1: Quality Degradation (EC3)
**Why Critical:** Undermines entire value proposition

**Defense in Depth:**
1. Structured prompts (prevent at creation)
2. Pre-commit validation (detect at commit)
3. Periodic audit (detect and fix over time)
4. Examples in template (educate agents)

### Risk 2: Propagation Loops (EC7)
**Why Critical:** Can hang system, infinite resource consumption

**Defense in Depth:**
1. Depth limit (hard stop at 3 levels)
2. Propagation markers (prevent reentrancy)
3. Circuit breaker (detect runaway propagation)
4. Propagation happens outside git hook (break feedback loop)

### Risk 3: Agent Non-Compliance (EC10)
**Why Critical:** Autonomous agents may not follow rules

**Defense in Depth:**
1. Pre-commit hook (enforcement point)
2. Structural validation (detect violations)
3. Periodic audit (fix drift)
4. Clear documentation (educate agents)

## Complexity Analysis

**Total Complexity Score:** 62/100

**Breakdown:**
- Low complexity (3-4): 3 edge cases (EC2, EC8, EC9)
- Medium complexity (5-6): 4 edge cases (EC1, EC4, EC5, EC6)
- High complexity (7-8): 3 edge cases (EC3, EC7, EC10)

**Complexity Drivers:**
1. Behavioral issues (agents, quality) - hardest to control
2. Distributed coordination (concurrency, propagation) - race conditions
3. Cross-platform compatibility - environment diversity

**Complexity Justification:**
- Total implementation: ~300 LOC
- Complexity per LOC: 0.2 (reasonable)
- Mitigations add ~100 LOC (worth it for critical risks)

**AFP Via Negativa Check:**
- Can we REDUCE complexity by deleting features?
  - ❌ Can't delete freshness check (core value)
  - ❌ Can't delete automation (defeats purpose)
  - ✅ Can delete propagation (optional feature) → Reduces EC7 risk
  - ✅ Can make parent updates manual initially → Test before automating

**Revised Approach:**
- Phase 1: Local README automation (init + update + hook)
- Phase 2: Parent propagation (after proving Phase 1 works)

This reduces initial complexity from 62/100 to 48/100 (removes EC7 entirely for Phase 1).

---

## Recovery Procedures

### Procedure 1: Infinite Loop Detected
```bash
# 1. Kill runaway processes
ps aux | grep readme_update.sh | awk '{print $2}' | xargs kill -9

# 2. Remove propagation markers
find . -name ".readme_propagating" -delete

# 3. Check circuit breaker logs
tail -100 state/analytics/readme_propagations.log

# 4. Identify root cause
# 5. Fix script bug
# 6. Test in isolation before re-enabling
```

### Procedure 2: Mass README Corruption
```bash
# 1. Identify corrupted READMEs
bash scripts/readme_validate_all.sh > corrupted_list.txt

# 2. Backup corrupted files
while read readme; do
  cp "$readme" "$readme.corrupted.$(date +%s)"
done < corrupted_list.txt

# 3. Regenerate from template
while read readme; do
  scripts/readme_init.sh "$(dirname "$readme")" --force
done < corrupted_list.txt

# 4. Manual review and merge content
```

### Procedure 3: Pre-Commit Hook Blocking Legitimate Commits
```bash
# 1. Emergency override
git commit --no-verify -m "Emergency commit"

# 2. Create bug report
cat > state/escalations/README_HOOK_BUG_$(date +%s).md <<EOF
# Pre-Commit Hook False Positive

## Scenario
[Describe what you were committing]

## Error Message
[Paste error]

## Why This Should Pass
[Explain why README is actually up-to-date]

## Proposed Fix
[Suggest hook logic change]
EOF

# 3. Fix hook logic
# 4. Test fix
# 5. Commit hook fix
```

---

## THINK Phase Complete

**Key Insights:**
1. **Behavioral risks > Technical risks** - Quality degradation and agent compliance are hardest
2. **Append-only design is critical** - Solves concurrency, simplifies merges
3. **Via negativa opportunity** - Remove propagation from Phase 1 to reduce complexity
4. **Defense in depth works** - Multiple layers of validation/detection/recovery

**Complexity Justification:**
- Initial: 62/100 (with propagation)
- Revised: 48/100 (propagation in Phase 2)
- Per LOC: 0.16 (reasonable for automation)

**Critical Mitigations Required:**
1. Structured prompts (quality)
2. Depth limits (propagation)
3. Validation hooks (compliance)
4. Cross-platform wrappers (portability)

**Next Phase:** GATE (design.md with AFP/SCAS analysis and alternatives)
