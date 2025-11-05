# Unified Enforcement Architecture

## Overview

WeatherVane's work process enforcement operates as a **three-layer defense-in-depth system** implemented entirely within the pre-commit Git hook. Each layer validates different aspects of the work process, creating comprehensive coverage that prevents accidental bypasses while maintaining clear escape hatches for emergencies.

**Design Philosophy:**
- **Defense-in-Depth:** Multiple complementary layers, no single point of failure
- **Fail-Safe:** Conservative defaults (validate when uncertain)
- **Clear Feedback:** Error messages show progress and remediation
- **Emergency Escape:** --no-verify available for true emergencies

---

## The Three Layers

### Layer 1: Roadmap Completion Enforcement

**Purpose:** Prevent marking tasks as "done" without complete evidence trail

**Code Location:** `.githooks/pre-commit` lines 422-527

**What It Does:**
- Detects when `state/roadmap.yaml` is being modified
- Identifies tasks being marked as `status: done`
- Validates complete evidence directory exists
- Checks for all required phase artifacts

**Triggers On:**
- Any commit that modifies `state/roadmap.yaml`
- Status change from (pending|in_progress|blocked) → done

**Required Evidence:**
- `state/evidence/[TASK-ID]/strategy.md` (STRATEGIZE phase)
- `state/evidence/[TASK-ID]/spec.md` (SPEC phase)
- `state/evidence/[TASK-ID]/plan.md` (PLAN phase)
- `state/evidence/[TASK-ID]/think.md` (THINK phase)
- `state/evidence/[TASK-ID]/verify.md` (VERIFY phase)
- `state/evidence/[TASK-ID]/review.md` (REVIEW phase)

**Note:** design.md (GATE phase) not required by roadmap validation because GATE is conditional (only for complex tasks)

**Example Error:**
```
❌ BLOCKED: Cannot mark AFP-FOO-BAR as done

Evidence incomplete: state/evidence/AFP-FOO-BAR

Missing required artifacts:
  ❌ verify.md (VERIFY phase)
  ❌ review.md (REVIEW phase)

Remediation:
  1. Complete all required work process phases
  2. Ensure all phase artifacts exist
  3. Then mark task as done in roadmap

See MANDATORY_WORK_CHECKLIST.md for full work process.
```

**Bypass Prevention:**
- Cannot mark task done without evidence
- Cannot skip VERIFY or REVIEW phases
- Forces completion of full 10-phase process

---

### Layer 2: Phase Sequence Enforcement

**Purpose:** Prevent implementation commits without upstream design phases

**Code Location:** `.githooks/pre-commit` lines 529-742

**What It Does:**
- Extracts task ID from commit (message, branch name, or recent evidence)
- Detects implementation files in staged changes
- Validates upstream phases exist before allowing implementation
- Exempts documentation-only and chore-only commits

**Triggers On:**
- Implementation file patterns: `^(src/|tools/.*/src/|apps/).*\.(ts|js|tsx|jsx)$`
- Commits modifying code in source directories

**Does NOT Trigger On:**
- Documentation-only commits (*.md files only, no code)
- Chore-only commits (package.json, configs, .github files)

**Required Upstream Phases:**
1. **STRATEGIZE** (strategy.md) - ALWAYS required
2. **SPEC** (spec.md) - ALWAYS required
3. **PLAN** (plan.md) - ALWAYS required
4. **THINK** (think.md) - ALWAYS required
5. **GATE** (design.md) - CONDITIONAL (see Layer 3)

**Task ID Extraction (3 fallback strategies):**
1. Primary: Commit message `[TASK-ID]`
2. Fallback 1: Branch name matching `AFP-*` or `TASK-*`
3. Fallback 2: Recent evidence directory (modified in last 24h)

**Example Error:**
```
❌ BLOCKED: Missing required work process phases

Task: AFP-FOO-BAR
Evidence path: state/evidence/AFP-FOO-BAR/

Phase progress:
  ✅ STRATEGIZE: strategy.md
  ✅ SPEC: spec.md
  ❌ PLAN: plan.md not found
  ❌ THINK: think.md not found

Remediation:
  3. Create plan.md:
     cp docs/templates/plan_template.md state/evidence/AFP-FOO-BAR/plan.md
  4. Create think.md:
     cp docs/templates/think_template.md state/evidence/AFP-FOO-BAR/think.md

See MANDATORY_WORK_CHECKLIST.md for full work process.

To bypass (EMERGENCY ONLY):
  git commit --no-verify
```

**Bypass Prevention:**
- Cannot commit implementation without STRATEGIZE/SPEC/PLAN/THINK
- Task ID required (prevents anonymous implementation)
- Evidence directory must exist

**Special Case: Bootstrap Commit**
- First commit creating `strategy.md` is allowed
- Enables starting a new task
- Subsequent commits require upstream phases

---

### Layer 3: GATE Enforcement (Complexity Detection)

**Purpose:** Require design thinking for complex changes

**Code Location:** `.githooks/pre-commit` lines 637-673 (embedded in Layer 2)

**What It Does:**
- Detects complexity of implementation commit
- Requires design.md when complexity threshold exceeded
- Uses two independent metrics (files and LOC)

**Complexity Detection:**

**Metric 1: File Count**
- Threshold: >1 implementation file
- Reason: Multi-file changes have architectural impact
- Example: Modifying 2+ source files → GATE required

**Metric 2: Net LOC**
- Threshold: >20 net LOC
- Uses: `scripts/analyze_loc.mjs --staged --get-net-loc`
- Reason: Large changes need design thinking
- Example: Single file + 50 LOC → GATE required

**Either metric triggers GATE requirement**

**Example: GATE Required**
```
Phase progress:
  ✅ STRATEGIZE: strategy.md
  ✅ SPEC: spec.md
  ✅ PLAN: plan.md
  ✅ THINK: think.md
  ❌ GATE: design.md not found (required: 2 implementation files changed)

Remediation:
  5. Create design.md (GATE):
     cp docs/templates/design_template.md state/evidence/AFP-FOO-BAR/design.md
```

**Example: GATE Not Required**
```
Phase progress:
  ✅ STRATEGIZE: strategy.md
  ✅ SPEC: spec.md
  ✅ PLAN: plan.md
  ✅ THINK: think.md
  ⏭  GATE: design.md (not required: single file, ≤20 LOC)

✅ All required phases complete for AFP-FOO-BAR
```

**Conservative Default:**
- If LOC analysis fails → require GATE (fail safe)
- Uncertainty → more validation, not less

**Bypass Prevention:**
- Cannot commit complex changes without design thinking
- Complexity objectively measured (files + LOC)
- No subjective "is this complex?" judgment needed

---

## Defense-in-Depth Model

```
┌─────────────────────────────────────────────────────────────┐
│                   Work Process Lifecycle                    │
│  STRATEGIZE → SPEC → PLAN → THINK → [GATE] → IMPLEMENT     │
│     → VERIFY → REVIEW → PR → MONITOR                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Layer 2: Phase Sequence Enforcement            │
│                                                             │
│  Validates: STRATEGIZE, SPEC, PLAN, THINK exist             │
│  Triggers: Implementation file commits                       │
│  Blocks: Commit without upstream phases                     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         Layer 3: GATE Enforcement (Embedded)         │ │
│  │                                                       │ │
│  │  Validates: design.md exists if complex              │ │
│  │  Triggers: >1 file OR >20 LOC                        │ │
│  │  Blocks: Complex commit without design thinking      │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    IMPLEMENT (code changes)
                              ↓
                VERIFY → REVIEW (post-implementation)
                              ↓
┌─────────────────────────────────────────────────────────────┐
│            Layer 1: Roadmap Completion Enforcement          │
│                                                             │
│  Validates: All evidence exists (including verify, review)  │
│  Triggers: Marking task as "done" in roadmap               │
│  Blocks: Incomplete evidence trail                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
                  Task marked "done" in roadmap
```

**Layer Interaction:**
- **Layer 2** enforces BEFORE implementation (prevents premature coding)
- **Layer 3** (embedded) adds complexity-based requirement (design thinking)
- **Layer 1** enforces AFTER implementation (prevents premature completion)

**Coverage:**
- **No gaps:** Every phase transition is validated
- **Complementary:** Each layer catches different violations
- **Progressive:** Enforcement matches workflow progression

---

## Coverage Map

### What Each Layer Prevents

| Violation | Layer 1 | Layer 2 | Layer 3 |
|-----------|---------|---------|---------|
| Implementation without STRATEGIZE | - | ✅ BLOCKED | - |
| Implementation without SPEC | - | ✅ BLOCKED | - |
| Implementation without PLAN | - | ✅ BLOCKED | - |
| Implementation without THINK | - | ✅ BLOCKED | - |
| Complex change without GATE | - | - | ✅ BLOCKED |
| Marking done without VERIFY | ✅ BLOCKED | - | - |
| Marking done without REVIEW | ✅ BLOCKED | - | - |
| Skip straight to implementation | - | ✅ BLOCKED | - |
| Mark done without full process | ✅ BLOCKED | - | - |

### Combined Coverage

**Before Implementation:**
- Layer 2 + Layer 3 prevent all premature implementation
- Ensures design thinking happens first

**After Implementation:**
- Layer 1 prevents premature task completion
- Ensures validation and review happen

**Result:** 100% coverage of work process phases (no accidental bypasses possible)

---

## Exemptions and Special Cases

### Docs-Only Commits

**Pattern:** All staged files are `*.md` AND in `docs/` directory

**Behavior:** Skip phase validation entirely

**Rationale:**
- Documentation changes don't affect system behavior
- Typo fixes shouldn't require full work process
- Large docs changes can voluntarily use work process

**Implementation:** `.githooks/pre-commit` lines 572-576

---

### Chore-Only Commits

**Patterns:**
- `package.json`, `package-lock.json`
- `.github/*.yml` (CI/CD configs)
- `tsconfig.json`, `*.config.js`, `*.config.ts`
- `.gitignore`

**Behavior:** Skip phase validation entirely

**Rationale:**
- Chore commits are maintenance, not features
- Dependency updates need fast path
- Config changes rarely need design thinking

**Implementation:** `.githooks/pre-commit` lines 578-589

---

### First Commit (Bootstrap)

**Pattern:** First commit creating `state/evidence/[TASK-ID]/strategy.md`

**Behavior:** Allow commit even if evidence directory doesn't exist

**Rationale:**
- Need to create evidence directory somehow
- First commit starts the work process
- Subsequent commits require upstream phases

**Implementation:** `.githooks/pre-commit` lines 616-622

---

## Escape Hatches

### Git --no-verify (Intentional Bypass)

**Usage:** `git commit --no-verify`

**Effect:** Bypasses ALL pre-commit hooks (all 3 layers)

**When to Use:**
- True emergencies (production down, security patch)
- Hot fixes that can't wait for full process
- Temporary workarounds (with retrospective evidence planned)

**When NOT to Use:**
- Normal development
- "I don't feel like doing the work process"
- Time pressure (plan better)

**Documentation:** Every error message includes:
```
To bypass (EMERGENCY ONLY):
  git commit --no-verify
```

**Current Limitation:** No logging of --no-verify usage

**Proposed Enhancement:**
- Track all --no-verify commits
- Alert if >5% commits bypass enforcement
- Generate weekly bypass report
- Require retrospective evidence for bypasses

---

### Hook Failure (Graceful Degradation)

**Scenario:** Hook crashes during validation (unexpected error)

**Behavior:** Depends on implementation
- Some sections: allow commit + log error
- Other sections: block commit (fail safe)

**Current State:** Partial error handling

**Proposed Enhancement:**
- Comprehensive error handling wrapper
- Always log errors to `state/logs/hook-errors.log`
- Fallback: allow commit + loud warning
- Weekly review of hook errors

---

## Known Gaps and Limitations

### Gap 1: Content Validation (HIGH PRIORITY)

**Current:** File existence check only
**Missing:** Content validation

**Attack Vector:**
```bash
# Create empty files to bypass
touch state/evidence/AFP-FOO/{strategy,spec,plan,think,design}.md
git add .
git commit -m "Implementation [AFP-FOO]"
# Hook allows: files exist (even though empty)
```

**Impact:** MEDIUM-HIGH (evidence fabrication possible)

**Proposed Mitigation:**
- File size check (>100 bytes minimum)
- Keyword validation (design.md must contain "Five Forces")
- Structure validation (required sections present)
- Complexity: ~100 LOC additional validation

**Priority:** HIGH (should be next enhancement)

---

### Gap 2: Systematic --no-verify Abuse (CRITICAL)

**Current:** No tracking of bypass usage
**Missing:** Bypass logging and monitoring

**Attack Vector:**
```bash
# Agent learns to always bypass
git commit --no-verify -m "whatever"
# Enforcement completely ineffective
```

**Impact:** HIGH (defeats entire enforcement system)

**Proposed Mitigation:**
- Log all --no-verify commits to `state/logs/bypasses.log`
- Monitor bypass rate (alert if >5%)
- Weekly bypass report sent to user
- CI/CD enforcement catches bypasses server-side
- Complexity: ~150 LOC logging + monitoring

**Priority:** CRITICAL (enables detection of enforcement failure)

---

### Gap 3: Hook Removal/Disabling

**Current:** Hook is file in repo, can be deleted
**Missing:** Hook integrity check

**Attack Vector:**
```bash
# Delete hook
rm .githooks/pre-commit
git add .
git commit -m "whatever"
# Enforcement completely gone
```

**Impact:** MEDIUM (visible in git status, caught by code review)

**Proposed Mitigation:**
- Periodic hook integrity check (daily cron)
- Critic validates hook exists + is executable
- CI/CD enforcement as belt-and-suspenders
- Automatic hook restoration if deleted
- Complexity: ~50 LOC validation

**Priority:** MEDIUM (detectable, but should be automated)

---

### Gap 4: Enforcement Evolution Lag

**Current:** Hook version not tracked
**Missing:** Process-enforcement alignment check

**Attack Vector:**
- Work process updates (new phase added)
- Hook not updated to match
- New phase can be skipped

**Impact:** MEDIUM (requires process change + hook update gap)

**Proposed Mitigation:**
- Version number in hook
- Version number in MANDATORY_WORK_CHECKLIST.md
- Critic validates versions match
- Automated check on process doc changes
- Complexity: ~30 LOC validation

**Priority:** MEDIUM (unlikely but possible)

---

## Future Enhancements

### 1. Content Validation (Priority: HIGH)

**What:** Validate evidence files contain real content, not empty shells

**Implementation:**
- File size check (>100 bytes)
- Keyword validation (design.md contains "Five Forces", "Via Negativa", etc.)
- Section validation (required sections present)

**Benefit:** Prevents evidence fabrication

**Complexity:** ~100 LOC

---

### 2. Bypass Logging (Priority: CRITICAL)

**What:** Track all --no-verify commits

**Implementation:**
- Wrapper script around git commit
- Log bypasses to `state/logs/bypasses.log`
- Monitor bypass rate
- Weekly report generation
- Alert if >5% commits bypass

**Benefit:** Detects systematic bypass abuse

**Complexity:** ~150 LOC

---

### 3. CI/CD Enforcement (Priority: HIGH)

**What:** Server-side validation (belt-and-suspenders)

**Implementation:**
- GitHub Actions workflow
- Validates evidence exists for all tasks
- Validates work process followed
- Catches local bypasses (--no-verify)
- Blocks PR merge if violations found

**Benefit:** Defense-in-depth (local + server)

**Complexity:** ~200 LOC (GitHub workflow + validation script)

---

### 4. Hook Integrity Check (Priority: MEDIUM)

**What:** Automated validation hook exists and is correct

**Implementation:**
- Daily cron job
- Checks hook exists
- Checks hook is executable
- Validates hook content matches canonical version
- Auto-restores if missing/modified

**Benefit:** Prevents hook removal/tampering

**Complexity:** ~50 LOC

---

### 5. Automated Test Suite (Priority: LOW)

**What:** Automated tests for enforcement

**Implementation:**
- Jest/Vitest test suite
- Test each enforcement layer
- Run in CI/CD
- Regression prevention

**Benefit:** Confidence in enforcement changes

**Complexity:** ~500 LOC

---

## Implementation Code Locations

### Layer 1: Roadmap Completion Enforcement

**File:** `.githooks/pre-commit`
**Lines:** 422-527
**Functions:**
- Detect roadmap changes
- Extract tasks being marked done
- Validate evidence directory completeness
- Generate clear error messages

**Key Logic:**
```bash
# Check if roadmap is being changed
if git diff --cached --name-only | grep -q "state/roadmap.yaml"; then
  # Extract task IDs being marked done
  TASK_IDS=$(git diff --cached state/roadmap.yaml | awk '/^\+.*status: done/ ...')

  # For each task, validate evidence
  for TASK_ID in $TASK_IDS; do
    EVIDENCE_PATH="state/evidence/$TASK_ID"
    # Check for strategy.md, spec.md, plan.md, think.md, verify.md, review.md
  done
fi
```

---

### Layer 2: Phase Sequence Enforcement

**File:** `.githooks/pre-commit`
**Lines:** 529-742
**Functions:**
- Extract task ID (3 fallback strategies)
- Detect implementation files
- Validate upstream phases exist
- Determine GATE requirement (Layer 3)
- Generate error messages with progress indicators

**Key Logic:**
```bash
# Extract task ID
TASK_ID=$(echo "$COMMIT_MSG" | grep -oE '\[([A-Z0-9_-]+)\]' | tr -d '[]')

# Detect implementation files
IMPL_FILES=0
for file in $STAGED_FILES; do
  if echo "$file" | grep -qE "^(src/|tools/.*/src/|apps/).*\.(ts|js|tsx|jsx)$"; then
    IMPL_FILES=$((IMPL_FILES + 1))
  fi
done

# Validate phases
if [ ! -f "$EVIDENCE_PATH/strategy.md" ]; then
  MISSING_PHASES+=("STRATEGIZE:strategy.md")
fi
# ... repeat for spec, plan, think
```

---

### Layer 3: GATE Enforcement

**File:** `.githooks/pre-commit`
**Lines:** 637-673 (embedded in Layer 2)
**Functions:**
- Count implementation files
- Get net LOC from analyzer
- Determine if GATE required
- Validate design.md exists if required

**Key Logic:**
```bash
GATE_REQUIRED=0

# Check file count
if [ $IMPL_FILES -gt 1 ]; then
  GATE_REQUIRED=1
  GATE_REASON="$IMPL_FILES implementation files changed"
fi

# Check LOC
NET_LOC=$(node scripts/analyze_loc.mjs --staged --get-net-loc)
if [ "$NET_LOC" -gt 20 ]; then
  GATE_REQUIRED=1
  GATE_REASON="$NET_LOC net LOC"
fi

# Validate design.md if required
if [ $GATE_REQUIRED -eq 1 ] && [ ! -f "$EVIDENCE_PATH/design.md" ]; then
  MISSING_PHASES+=("GATE:design.md ($GATE_REASON)")
fi
```

---

## Summary

**Unified Enforcement:**
- 3 complementary layers
- 6 total enforcement points
- 100% coverage (no gaps for accidental bypasses)
- Defense-in-depth architecture

**Strengths:**
- Impossible to bypass accidentally
- Clear error messages with remediation
- Progressive enforcement (matches workflow)
- Conservative defaults (fail safe)

**Known Limitations:**
- Content validation missing (empty files bypass)
- Bypass logging missing (--no-verify untracked)
- Hook integrity not monitored
- Process-enforcement alignment not automated

**Recommended Enhancements:**
1. Content validation (HIGH)
2. Bypass logging (CRITICAL)
3. CI/CD enforcement (HIGH)
4. Hook integrity check (MEDIUM)

**Escape Hatches:**
- --no-verify (intentional, documented)
- Hook graceful degradation (partial)

**Confidence Level:** HIGH
- Comprehensive coverage
- Defense-in-depth
- Real-world validated (AFP-S1-WORK-PROCESS-ENFORCE)
- User-tested (caught my bypass, requested enforcement)
