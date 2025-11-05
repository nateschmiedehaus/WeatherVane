# Think: AFP-S1-WORK-PROCESS-ENFORCE

## Edge Cases Analysis

### 1. No Task ID Found in Commit Message

**Scenario:** Commit message doesn't contain [TASK-ID] pattern

**Example:**
```bash
git commit -m "fix: bug in validation"
# No task ID in message
```

**What could go wrong:**
- Hook cannot determine which evidence directory to check
- Validation skipped entirely (security hole)
- False positive (blocks valid commits)

**Mitigation:**
```bash
# Fallback 1: Check branch name
BRANCH=$(git branch --show-current)
TASK_ID=$(echo "$BRANCH" | grep -oE 'AFP-[A-Z0-9_-]+|TASK-[A-Z0-9_-]+')

# Fallback 2: Check recent evidence directories (modified in last 24h)
if [ -z "$TASK_ID" ]; then
  RECENT_EVIDENCE=$(find state/evidence -maxdepth 1 -type d -mtime -1 | head -1)
  TASK_ID=$(basename "$RECENT_EVIDENCE")
fi

# Fallback 3: Prompt user
if [ -z "$TASK_ID" ]; then
  echo "❌ Cannot determine task ID"
  echo "   Add task ID to commit message: [AFP-TASK-ID]"
  echo "   Or create branch: git checkout -b AFP-TASK-ID"
  exit 1
fi
```

**Test cases:**
- Commit with [AFP-S1-TEST] → Extract AFP-S1-TEST
- Commit without task ID, branch = main → Prompt user
- Commit without task ID, branch = AFP-S1-TEST → Extract from branch
- Commit without task ID, recent evidence AFP-S1-FOO → Use AFP-S1-FOO

---

### 2. Evidence Directory Does Not Exist

**Scenario:** Task ID found but no evidence directory created

**Example:**
```bash
# Commit message has [AFP-NEW-TASK]
# But state/evidence/AFP-NEW-TASK/ doesn't exist
```

**What could go wrong:**
- Hook blocks valid first commit (starting new task)
- Confusing error message
- Deadlock (cannot create evidence without committing, cannot commit without evidence)

**Mitigation:**
```bash
if [ ! -d "$EVIDENCE_PATH" ]; then
  # Check if this is the FIRST commit for a new task
  STAGED_FILES=$(git diff --cached --name-only)

  # If only creating evidence directory, allow
  if echo "$STAGED_FILES" | grep -q "^state/evidence/$TASK_ID/strategy.md$"; then
    echo "✅ First commit: creating evidence directory"
    exit 0
  fi

  # If implementation files staged, block
  if echo "$STAGED_FILES" | grep -qE '^(src/|tools/.*/src/)'; then
    echo "❌ No evidence directory for $TASK_ID"
    echo "   Create directory: mkdir -p state/evidence/$TASK_ID"
    echo "   Start with STRATEGIZE phase: cp docs/templates/strategy_template.md state/evidence/$TASK_ID/strategy.md"
    exit 1
  fi

  # Otherwise allow (might be unrelated commit)
  exit 0
fi
```

**Test cases:**
- First commit adding strategy.md → ALLOW
- First commit with implementation → BLOCK
- Commit with evidence directory existing → Continue validation

---

### 3. Partial Phase Completion

**Scenario:** Some phase files exist, others don't

**Example:**
```
state/evidence/AFP-TEST/
  ├── strategy.md ✅
  ├── spec.md ✅
  └── plan.md ❌ (missing)
```

**What could go wrong:**
- Unclear which phase is next
- User confused about remediation
- Cannot determine progress

**Mitigation:**
```bash
function show_phase_progress() {
  local evidence_path="$1"

  echo "Phase progress:"

  # Define phases in order
  PHASES=("STRATEGIZE:strategy" "SPEC:spec" "PLAN:plan" "THINK:think" "GATE:design" "VERIFY:verify" "REVIEW:review")

  FIRST_MISSING=""

  for phase_pair in "${PHASES[@]}"; do
    PHASE_NAME="${phase_pair%%:*}"
    PHASE_FILE="${phase_pair##*:}"

    if [ -f "$evidence_path/${PHASE_FILE}.md" ]; then
      echo "  ✅ $PHASE_NAME: ${PHASE_FILE}.md"
    else
      echo "  ❌ $PHASE_NAME: ${PHASE_FILE}.md not found"
      if [ -z "$FIRST_MISSING" ]; then
        FIRST_MISSING="$PHASE_NAME"
      fi
    fi
  done

  if [ -n "$FIRST_MISSING" ]; then
    echo ""
    echo "Next phase: $FIRST_MISSING"
    echo "Create: cp docs/templates/${FIRST_MISSING,,}_template.md $evidence_path/${FIRST_MISSING,,}.md"
  fi
}
```

**Test cases:**
- All phases complete → Show all ✅
- Missing PLAN → Show ✅✅❌❌❌❌❌ + "Next phase: PLAN"
- Missing only VERIFY → Show ✅✅✅✅✅❌✅ + "Next phase: VERIFY"

---

### 4. GATE Required But Not Detected

**Scenario:** Multi-file change or >20 LOC but GATE check fails to trigger

**Example:**
```bash
# Changing 3 files (requires GATE)
# But file count logic broken
```

**What could go wrong:**
- Agent bypasses GATE phase
- Complex changes without design review
- Defeats purpose of enforcement

**Mitigation:**
```bash
# Conservative file counting
IMPL_FILES=$(git diff --cached --name-only | \
  grep -E '^(src/|tools/.*/src/|apps/).*\.(ts|js)$' | \
  wc -l | tr -d ' ')

# Conservative LOC counting (use existing smart LOC, but default to requiring GATE on failure)
NET_LOC=$(node scripts/analyze_loc.mjs --staged --get-net-loc 2>/dev/null || echo "999")

GATE_REQUIRED=0

if [ "$IMPL_FILES" -gt 1 ]; then
  GATE_REQUIRED=1
  GATE_REASON="$IMPL_FILES implementation files changed"
fi

if [ "$NET_LOC" -gt 20 ]; then
  GATE_REQUIRED=1
  GATE_REASON="${GATE_REASON:+$GATE_REASON, }$NET_LOC net LOC"
fi

# Default to requiring GATE if LOC analysis fails
if [ "$NET_LOC" = "999" ]; then
  GATE_REQUIRED=1
  GATE_REASON="LOC analysis failed (defaulting to require GATE)"
fi
```

**Test cases:**
- 2 files changed → GATE required
- 1 file, 50 LOC → GATE required
- 1 file, 10 LOC → GATE not required
- LOC script crashes → GATE required (safe default)
- 5 test files (150 LOC effective after 3x multiplier) → GATE not required

---

### 5. Documentation vs Implementation Commits

**Scenario:** Commit contains both docs and implementation

**Example:**
```bash
git add docs/README.md src/new_feature.ts
git commit -m "feat: add new feature [AFP-TEST]"
```

**What could go wrong:**
- Mixed commit types confuse validation
- Documentation changes force full validation
- False positives

**Mitigation:**
```bash
# Separate docs from implementation
STAGED_FILES=$(git diff --cached --name-only)

DOCS_FILES=$(echo "$STAGED_FILES" | grep -E '^docs/.*\.md$' | wc -l | tr -d ' ')
IMPL_FILES=$(echo "$STAGED_FILES" | grep -E '^(src/|tools/.*/src/).*\.(ts|js)$' | wc -l | tr -d ' ')

# If ONLY docs, skip validation
if [ "$DOCS_FILES" -gt 0 ] && [ "$IMPL_FILES" -eq 0 ]; then
  echo "✅ Documentation-only commit, skipping phase validation"
  exit 0
fi

# If ANY implementation, require validation
if [ "$IMPL_FILES" -gt 0 ]; then
  # Proceed with full validation
  validate_phases "$TASK_ID" "$EVIDENCE_PATH"
fi
```

**Test cases:**
- docs/README.md only → Skip validation
- docs/README.md + src/feature.ts → Full validation
- docs/README.md + state/evidence/AFP-TEST/strategy.md → Skip validation (evidence commit)

---

### 6. Test Files vs Implementation Files

**Scenario:** Commit contains only test files

**Example:**
```bash
git add src/__tests__/feature.test.ts
# 100 LOC test, but with 3x multiplier = 33 effective LOC
```

**What could go wrong:**
- Test files incorrectly require GATE
- Test LOC multiplier not applied
- Confusion about whether tests count as "implementation"

**Mitigation:**
```bash
# Check if ALL staged files are tests
ALL_FILES=$(git diff --cached --name-only | grep -E '\.(ts|js)$' | wc -l | tr -d ' ')
TEST_FILES=$(git diff --cached --name-only | grep -E '\.(test|spec)\.(ts|js)$' | wc -l | tr -d ' ')

if [ "$ALL_FILES" -eq "$TEST_FILES" ] && [ "$TEST_FILES" -gt 0 ]; then
  # All staged files are tests, use test LOC multiplier
  # Smart LOC already handles this via analyze_loc.mjs

  # Still require phase artifacts (tests are implementation)
  # But GATE requirement uses multiplied LOC
  validate_phases "$TASK_ID" "$EVIDENCE_PATH"
else
  # Mix of tests and implementation
  validate_phases "$TASK_ID" "$EVIDENCE_PATH"
fi
```

**Test cases:**
- feature.test.ts only (100 LOC) → No GATE (33 effective LOC)
- feature.test.ts (100 LOC) + feature.ts (50 LOC) → GATE required (150 LOC total)
- 5 test files (each 30 LOC = 150 total, 50 effective) → No GATE

---

### 7. Chore Commits (Dependencies, Config)

**Scenario:** Package updates, config changes, no actual code

**Example:**
```bash
git add package.json package-lock.json
git commit -m "chore: update dependencies"
```

**What could go wrong:**
- Dependency updates blocked unnecessarily
- False positives for routine maintenance
- User frustration

**Mitigation:**
```bash
# Chore commit patterns (no validation needed)
CHORE_PATTERNS=(
  '^package\.json$'
  '^package-lock\.json$'
  '^\.github/.*\.yml$'
  '^\.gitignore$'
  '^tsconfig\.json$'
  '^.*\.config\.(js|ts|mjs)$'
)

STAGED_FILES=$(git diff --cached --name-only)
ALL_CHORE=1

for file in $STAGED_FILES; do
  IS_CHORE=0
  for pattern in "${CHORE_PATTERNS[@]}"; do
    if echo "$file" | grep -qE "$pattern"; then
      IS_CHORE=1
      break
    fi
  done

  if [ $IS_CHORE -eq 0 ]; then
    ALL_CHORE=0
    break
  fi
done

if [ $ALL_CHORE -eq 1 ]; then
  echo "✅ Chore commit, skipping phase validation"
  exit 0
fi
```

**Test cases:**
- package.json only → Skip
- package.json + src/feature.ts → Full validation
- .github/workflows/ci.yml → Skip
- tsconfig.json + src/feature.ts → Full validation

---

### 8. Emergency Hotfixes

**Scenario:** Critical production bug needs immediate fix

**Example:**
```bash
git commit --no-verify -m "hotfix: critical security issue [EMERGENCY]"
```

**What could go wrong:**
- --no-verify bypasses logging
- No audit trail of bypasses
- Cannot track emergency fix patterns

**Mitigation:**
```bash
# Hook runs even with --no-verify, but exits 0 and logs

# Check if --no-verify was used (via git config or env var)
# Note: pre-commit hooks don't have direct access to --no-verify flag
# But we can log when hook is skipped

# Add logging at start of hook
LOG_FILE="state/analytics/work_process_bypasses.jsonl"

if [ "$GIT_AUTHOR_DATE" ]; then
  # Hook is running, create log entry if it exits early
  trap 'log_bypass_if_exited' EXIT
fi

function log_bypass_if_exited() {
  if [ $? -eq 0 ] && [ "$BYPASS_LOGGED" != "1" ]; then
    # Normal exit, no bypass
    return
  fi

  # Log bypass
  BYPASS_ENTRY=$(cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit_sha": "$(git rev-parse HEAD 2>/dev/null || echo 'pre-commit')",
  "task_id": "$TASK_ID",
  "bypassed_phases": $MISSING_PHASES_JSON,
  "reason": "manual --no-verify",
  "commit_message": "$(git log -1 --pretty=%B 2>/dev/null || echo '')"
}
EOF
)
  echo "$BYPASS_ENTRY" >> "$LOG_FILE"
}
```

**Test cases:**
- Normal commit → No log entry
- git commit --no-verify → Log entry created
- Check log file format → Valid JSON

---

### 9. Multiple Tasks in Single Commit

**Scenario:** Commit touches files from multiple tasks

**Example:**
```bash
git add state/evidence/AFP-TASK-1/ state/evidence/AFP-TASK-2/
git commit -m "docs: complete tasks 1 and 2"
```

**What could go wrong:**
- Hook validates only first task
- Other tasks bypass validation
- Inconsistent enforcement

**Mitigation:**
```bash
# Extract ALL task IDs from commit
TASK_IDS=$(echo "$COMMIT_MSG" | grep -oE '\[([A-Z0-9_-]+)\]' | tr -d '[]' | sort -u)

# If multiple task IDs found, validate each
if [ $(echo "$TASK_IDS" | wc -w) -gt 1 ]; then
  echo "⚠️  Multiple tasks in single commit: $TASK_IDS"
  echo "   Recommendation: One task per commit"
  echo "   Validating first task only: $(echo $TASK_IDS | awk '{print $1}')"
  TASK_ID=$(echo $TASK_IDS | awk '{print $1}')
fi

# Alternatively, BLOCK multiple tasks
if [ $(echo "$TASK_IDS" | wc -w) -gt 1 ]; then
  echo "❌ BLOCKED: Multiple tasks in single commit"
  echo "   Tasks found: $TASK_IDS"
  echo "   Recommendation: Split into separate commits (one per task)"
  exit 1
fi
```

**Decision:** WARN but allow (validate first task only) to avoid blocking legitimate multi-task updates

**Test cases:**
- [AFP-TASK-1] only → Validate TASK-1
- [AFP-TASK-1] and [AFP-TASK-2] → Warn + validate TASK-1
- No task IDs → Use fallback detection

---

### 10. Pre-Existing Commits (Retroactive Enforcement)

**Scenario:** Old commits without evidence directories

**Example:**
```bash
# Commit from 2 months ago has no evidence
git cherry-pick abc123def
```

**What could go wrong:**
- Hook blocks cherry-picks of old commits
- Cannot rebase historical branches
- Migration pain

**Mitigation:**
```bash
# Only enforce for NEW commits, not cherry-picks/rebases
if git log -1 --pretty=%B | grep -q "^(cherry picked from"; then
  echo "✅ Cherry-pick detected, skipping validation"
  exit 0
fi

# Check commit author date vs current date
COMMIT_DATE=$(git log -1 --format=%at)
CURRENT_DATE=$(date +%s)
AGE_DAYS=$(( ($CURRENT_DATE - $COMMIT_DATE) / 86400 ))

if [ $AGE_DAYS -gt 7 ]; then
  echo "✅ Old commit (${AGE_DAYS} days), skipping validation"
  exit 0
fi
```

**Test cases:**
- New commit today → Validate
- Cherry-pick from last month → Skip
- Rebase of branch from last week → Skip
- Amend of recent commit → Validate

---

## Failure Modes

### 1. Hook Crashes During Validation

**Failure:** Shell script error, undefined variable, syntax error

**Impact:** Commit blocked, user stuck

**Detection:**
- Hook exits with non-zero code
- Error message unclear
- User confused

**Recovery:**
```bash
# Wrap entire hook in error handler
set -euo pipefail
trap 'handle_error $? $LINENO' ERR

function handle_error() {
  local exit_code=$1
  local line_number=$2

  echo ""
  echo "❌ Pre-commit hook error (line $line_number)"
  echo "   This is a bug in the hook, not your commit."
  echo ""
  echo "   Temporary bypass:"
  echo "   git commit --no-verify"
  echo ""
  echo "   Please report: .githooks/pre-commit:$line_number crashed"

  # Log error for debugging
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"line\":$line_number,\"code\":$exit_code}" >> state/analytics/hook_errors.jsonl

  # Allow commit (don't block user due to hook bug)
  exit 0
}
```

**Mitigation:**
- Comprehensive error handling
- Graceful degradation (allow commit on hook failure)
- Logging for debugging
- Clear user message

---

### 2. Evidence Directory Deleted Mid-Commit

**Failure:** Directory exists at pre-commit start, deleted before validation

**Impact:** Validation fails unexpectedly

**Detection:**
- `[ ! -d "$EVIDENCE_PATH" ]` check passes initially
- Subsequent file checks fail

**Recovery:**
```bash
# Atomic check at start
if [ ! -d "$EVIDENCE_PATH" ]; then
  echo "❌ Evidence directory missing: $EVIDENCE_PATH"
  echo "   Was it deleted? Check: ls -la state/evidence/"
  exit 1
fi

# Re-check before each phase validation
function check_evidence_dir() {
  if [ ! -d "$EVIDENCE_PATH" ]; then
    echo "❌ Evidence directory disappeared during validation!"
    echo "   This should not happen. Check: ls -la state/evidence/"
    exit 1
  fi
}

check_evidence_dir
validate_strategy
check_evidence_dir
validate_spec
# etc.
```

**Mitigation:**
- Multiple checks throughout validation
- Clear error if directory disappears
- Suggest user check directory

---

### 3. LOC Analysis Script Fails

**Failure:** `scripts/analyze_loc.mjs` throws error or doesn't exist

**Impact:** Cannot determine GATE requirement

**Detection:**
- Script exits with non-zero code
- Returns invalid output
- File doesn't exist

**Recovery:**
```bash
# Safe LOC check with fallback
NET_LOC=$(node scripts/analyze_loc.mjs --staged --get-net-loc 2>/dev/null)
LOC_EXIT=$?

if [ $LOC_EXIT -ne 0 ] || [ -z "$NET_LOC" ]; then
  echo "⚠️  LOC analysis failed, defaulting to require GATE"
  GATE_REQUIRED=1
  GATE_REASON="LOC analysis unavailable (safe default)"
else
  if [ "$NET_LOC" -gt 20 ]; then
    GATE_REQUIRED=1
    GATE_REASON="$NET_LOC net LOC"
  fi
fi
```

**Mitigation:**
- Default to requiring GATE (conservative)
- Log analysis failure
- Warn user about fallback

---

### 4. File Pattern Matching Breaks

**Failure:** Regex patterns fail to match implementation files

**Impact:**
- Implementation files not detected
- Validation skipped
- Agents bypass enforcement

**Detection:**
- grep -E pattern fails
- No files matched when files exist
- Pattern doesn't match new file types

**Recovery:**
```bash
# Conservative file patterns (err on side of validation)
IMPL_PATTERNS=(
  '^src/.*\.(ts|js|tsx|jsx)$'
  '^tools/.*/src/.*\.(ts|js)$'
  '^apps/.*\.(ts|js|tsx|jsx)$'
  '^lib/.*\.(ts|js)$'
  '^packages/.*/src/.*\.(ts|js)$'
)

IMPL_FILES=0
STAGED_FILES=$(git diff --cached --name-only)

for file in $STAGED_FILES; do
  for pattern in "${IMPL_PATTERNS[@]}"; do
    if echo "$file" | grep -qE "$pattern"; then
      IMPL_FILES=$((IMPL_FILES + 1))
      break
    fi
  done
done

# If pattern matching uncertain, default to validating
if [ $IMPL_FILES -eq 0 ] && echo "$STAGED_FILES" | grep -qE '\.(ts|js|tsx|jsx)$'; then
  echo "⚠️  Uncertain file classification, validating to be safe"
  IMPL_FILES=1
fi
```

**Mitigation:**
- Multiple patterns for file matching
- Conservative defaults
- Validate uncertain cases

---

### 5. Infinite Validation Loop

**Failure:** Hook blocks commit → user fixes → hook still blocks → repeat

**Impact:** User cannot commit, stuck

**Detection:**
- Same error repeats 3+ times
- Evidence files exist but validation fails
- Hook logic error

**Recovery:**
```bash
# Add emergency escape hatch
BYPASS_COUNT_FILE=".git/bypass_count_${TASK_ID}"

if [ -f "$BYPASS_COUNT_FILE" ]; then
  BYPASS_COUNT=$(cat "$BYPASS_COUNT_FILE")
else
  BYPASS_COUNT=0
fi

BYPASS_COUNT=$((BYPASS_COUNT + 1))
echo "$BYPASS_COUNT" > "$BYPASS_COUNT_FILE"

if [ $BYPASS_COUNT -gt 5 ]; then
  echo ""
  echo "⚠️  EMERGENCY BYPASS: Validation failed 5+ times"
  echo "   This suggests a hook bug, not a compliance issue."
  echo "   Allowing commit and logging issue."
  echo ""
  echo "   Please report: Hook blocking valid commit for $TASK_ID"

  # Log infinite loop detection
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"task_id\":\"$TASK_ID\",\"bypass_count\":$BYPASS_COUNT}" >> state/analytics/hook_infinite_loops.jsonl

  # Reset counter and allow
  rm "$BYPASS_COUNT_FILE"
  exit 0
fi
```

**Mitigation:**
- Track validation attempts
- Auto-bypass after 5 failures
- Log infinite loop detection
- Alert to hook bug

---

## Testing Strategy

### Unit Tests (Hook Functions)

**Test file:** `.githooks/__tests__/pre-commit.test.sh`

```bash
#!/bin/bash

# Source hook functions (extract to pre-commit-lib.sh)
source .githooks/pre-commit-lib.sh

# Test 1: Extract task ID from commit message
test_extract_task_id_from_message() {
  COMMIT_MSG="feat: add feature [AFP-S1-TEST]"
  TASK_ID=$(extract_task_id "$COMMIT_MSG")
  assert_equals "AFP-S1-TEST" "$TASK_ID"
}

# Test 2: Extract task ID from branch
test_extract_task_id_from_branch() {
  BRANCH="AFP-S1-TEST-branch"
  TASK_ID=$(extract_task_id_from_branch "$BRANCH")
  assert_equals "AFP-S1-TEST" "$TASK_ID"
}

# Test 3: Detect implementation files
test_detect_impl_files() {
  FILES="src/feature.ts\ndocs/README.md"
  IMPL_COUNT=$(count_impl_files "$FILES")
  assert_equals "1" "$IMPL_COUNT"
}

# Test 4: Detect GATE requirement
test_gate_required_multiple_files() {
  IMPL_FILES=3
  NET_LOC=50
  GATE=$(check_gate_required $IMPL_FILES $NET_LOC)
  assert_equals "1" "$GATE"
}

# Test 5: Generate phase progress
test_show_phase_progress() {
  mkdir -p /tmp/test-evidence
  touch /tmp/test-evidence/strategy.md
  touch /tmp/test-evidence/spec.md

  OUTPUT=$(show_phase_progress "/tmp/test-evidence")
  assert_contains "✅ STRATEGIZE" "$OUTPUT"
  assert_contains "✅ SPEC" "$OUTPUT"
  assert_contains "❌ PLAN" "$OUTPUT"

  rm -rf /tmp/test-evidence
}

# Run all tests
run_tests
```

**Coverage:**
- Task ID extraction (all fallback strategies)
- Implementation file detection
- GATE requirement detection
- Phase progress display
- Error message generation

---

### Integration Tests (Git Workflow)

**Test file:** `scripts/test_pre_commit_hook.sh`

```bash
#!/bin/bash

# Integration test: Full git workflow with hook

# Setup
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"
git init
cp /path/to/.githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Test 1: Commit with all phases complete → SUCCESS
mkdir -p state/evidence/AFP-TEST
touch state/evidence/AFP-TEST/{strategy,spec,plan,think,design,verify,review}.md
echo "console.log('test')" > src/feature.ts
git add src/feature.ts
git commit -m "feat: test [AFP-TEST]"
assert_exit_code 0

# Test 2: Commit missing PLAN → BLOCKED
mkdir -p state/evidence/AFP-TEST-2
touch state/evidence/AFP-TEST-2/{strategy,spec}.md
echo "console.log('test2')" > src/feature2.ts
git add src/feature2.ts
git commit -m "feat: test2 [AFP-TEST-2]" 2>&1 | tee output.txt
assert_exit_code 1
assert_contains "❌ PLAN: plan.md not found" output.txt

# Test 3: Multi-file commit without GATE → BLOCKED
mkdir -p state/evidence/AFP-TEST-3
touch state/evidence/AFP-TEST-3/{strategy,spec,plan,think}.md
echo "console.log('test3')" > src/feature3.ts
echo "console.log('test4')" > src/feature4.ts
git add src/feature3.ts src/feature4.ts
git commit -m "feat: test3 [AFP-TEST-3]" 2>&1 | tee output.txt
assert_exit_code 1
assert_contains "GATE phase required" output.txt

# Test 4: Documentation-only → SUCCESS (no validation)
echo "# Docs" > docs/README.md
git add docs/README.md
git commit -m "docs: update readme"
assert_exit_code 0

# Test 5: Emergency bypass → SUCCESS + logged
mkdir -p state/evidence/AFP-TEST-5
echo "console.log('emergency')" > src/emergency.ts
git add src/emergency.ts
git commit --no-verify -m "hotfix: emergency [AFP-TEST-5]"
assert_exit_code 0
assert_file_exists state/analytics/work_process_bypasses.jsonl

# Cleanup
cd /
rm -rf "$TEST_DIR"
```

**Coverage:**
- Full workflow (all phases complete)
- Partial workflow (missing phases)
- GATE requirement detection
- Documentation exemptions
- Chore exemptions
- Bypass mechanism

---

### Behavior Tests (Real Workflow)

**Manual test checklist:**

1. **Start new task:**
   - [ ] Create branch: `git checkout -b AFP-TEST-BEHAVIOR`
   - [ ] Create evidence: `mkdir -p state/evidence/AFP-TEST-BEHAVIOR`
   - [ ] Add strategy: `touch state/evidence/AFP-TEST-BEHAVIOR/strategy.md`
   - [ ] Commit strategy: `git add state/evidence/AFP-TEST-BEHAVIOR/strategy.md && git commit -m "docs: strategy [AFP-TEST-BEHAVIOR]"`
   - [ ] Expected: SUCCESS (evidence commit allowed)

2. **Attempt implementation without phases:**
   - [ ] Add implementation: `echo "test" > src/test-behavior.ts`
   - [ ] Try commit: `git add src/test-behavior.ts && git commit -m "feat: test [AFP-TEST-BEHAVIOR]"`
   - [ ] Expected: BLOCKED (missing spec, plan, think, design)

3. **Complete SPEC phase:**
   - [ ] Add spec: `touch state/evidence/AFP-TEST-BEHAVIOR/spec.md`
   - [ ] Commit: `git add state/evidence/AFP-TEST-BEHAVIOR/spec.md && git commit -m "docs: spec [AFP-TEST-BEHAVIOR]"`
   - [ ] Retry implementation commit
   - [ ] Expected: BLOCKED (missing plan, think, design)

4. **Complete all phases:**
   - [ ] Add plan, think, design: `touch state/evidence/AFP-TEST-BEHAVIOR/{plan,think,design}.md`
   - [ ] Commit phases: `git add state/evidence/AFP-TEST-BEHAVIOR/ && git commit -m "docs: plan/think/gate [AFP-TEST-BEHAVIOR]"`
   - [ ] Retry implementation commit
   - [ ] Expected: SUCCESS (all phases complete)

5. **Test GATE requirement:**
   - [ ] Start new task with single file (<20 LOC)
   - [ ] Complete strategy, spec, plan, think (skip design)
   - [ ] Commit single file
   - [ ] Expected: SUCCESS (no GATE required)
   - [ ] Add second file
   - [ ] Commit both files
   - [ ] Expected: BLOCKED (GATE required for >1 file)

6. **Test bypass mechanism:**
   - [ ] Incomplete task
   - [ ] Emergency commit: `git commit --no-verify -m "hotfix: emergency"`
   - [ ] Expected: SUCCESS
   - [ ] Check log: `cat state/analytics/work_process_bypasses.jsonl`
   - [ ] Expected: Bypass logged

---

## Paranoid Thinking

### What if the hook is disabled?

**Scenario:** User removes `.git/hooks/pre-commit`

**Impact:** All enforcement bypassed

**Mitigation:**
- Document required setup in README
- CI/CD validation (belt + suspenders)
- Periodic hook health check
- Installation verification script

### What if agents learn to always use --no-verify?

**Scenario:** Agent instructions updated to bypass hook

**Impact:** Hook useless

**Mitigation:**
- Bypass logging (all --no-verify logged)
- Weekly bypass report (alert if >5% bypass rate)
- CI/CD enforcement (server-side validation)
- Social pressure (bypasses visible in analytics)

### What if evidence files are fabricated (empty)?

**Scenario:** Agent creates empty .md files to satisfy validation

**Impact:** Compliance theater, no real work

**Mitigation:**
- Content validation (check file size >100 bytes)
- Keyword checks (design.md must contain "COHERENCE", "ECONOMY", etc.)
- DesignReviewer integration (already exists)
- Random audit sampling

### What if validation is too strict (false positives)?

**Scenario:** Legitimate commits blocked incorrectly

**Impact:** User frustration, workarounds

**Mitigation:**
- Conservative exemptions (docs, chore, tests)
- Clear error messages with remediation
- Emergency bypass mechanism
- Feedback loop (track user complaints)

### What if hook becomes performance bottleneck?

**Scenario:** Hook takes >10 seconds to run

**Impact:** Slow commit workflow

**Mitigation:**
- No network calls (all local validation)
- Minimal file I/O (check existence only, not content)
- Early exits (skip validation for docs/chore)
- Performance monitoring (log hook duration)

---

## Assumptions Validation

### Assumption 1: Agents follow commit message format

**Validation:** Check last 100 commits for task ID patterns

```bash
git log -100 --oneline | grep -oE '\[([A-Z0-9_-]+)\]' | wc -l
```

**Expected:** >80% have task IDs

**If wrong:** Fallback to branch name extraction works

### Assumption 2: Evidence directories always named state/evidence/[TASK-ID]

**Validation:** Check existing evidence directories

```bash
ls state/evidence/ | grep -vE '^[A-Z0-9_-]+$'
```

**Expected:** No misnamed directories

**If wrong:** Pattern matching will fail, user will get clear error

### Assumption 3: Templates exist for all phases

**Validation:** Check template directory

```bash
ls docs/templates/{strategy,spec,plan,think,design}_template.md
```

**Expected:** All templates exist

**If wrong:** Error message will show wrong path, user will report

### Assumption 4: Smart LOC script is reliable

**Validation:** Test script with sample commits

```bash
echo "test" > test.ts
git add test.ts
node scripts/analyze_loc.mjs --staged --get-net-loc
```

**Expected:** Returns valid number

**If wrong:** Hook defaults to requiring GATE (safe)

---

## Risk Summary

**Low Risk:**
- Hook crashes (graceful degradation)
- LOC analysis fails (safe default)
- Template paths wrong (clear error)

**Medium Risk:**
- Task ID not detected (multiple fallbacks)
- File pattern matching breaks (conservative defaults)
- False positives (clear remediation)

**High Risk:**
- Agent learns to bypass systematically (mitigation: logging + CI/CD)
- Evidence fabrication (mitigation: content validation future enhancement)

**Overall Risk:** LOW (comprehensive error handling + fallbacks + escape hatches)

---

**Think Date:** 2025-11-05
**Author:** Claude Council
**Status:** Ready for GATE phase
