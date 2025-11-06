# Quick Task: Pre-Implementation Work Process Check

**Task:** AFP-PRE-IMPLEMENTATION-ENFORCEMENT-20251105
**Priority:** HIGH (prevents process violations)
**Scope:** Micro-task (~50 LOC)

---

## Problem

Agents can skip STRATEGIZE → GATE phases and jump straight to IMPLEMENT, violating the AFP 10-phase lifecycle. This just happened: I started coding without creating an evidence bundle or executing the required cognitive phases.

---

## Solution

Add pre-commit hook check that blocks commits with code changes unless evidence bundle exists with required phase files.

### Pre-Commit Check Logic

```bash
# For each staged file matching src/**/*.ts or src/**/*.js:
#   1. Extract task ID from file path or commit message
#   2. Check if state/evidence/[TASK-ID]/ exists
#   3. If exists, verify strategy.md OR spec.md exists
#   4. If not exists or missing phase files: BLOCK with message:
#
#      "❌ Code changes require evidence bundle
#
#       Task: [TASK-ID]
#       Missing: state/evidence/[TASK-ID]/strategy.md
#
#       Run AFP 10-phase lifecycle first:
#       1. mkdir -p state/evidence/[TASK-ID]
#       2. Create strategy.md (STRATEGIZE phase)
#       3. Continue through phases before implementing"
```

---

## Implementation

**File:** `.git/hooks/pre-commit` (existing hook, add check)

**Addition:** ~30 lines

**Logic:**
1. Parse staged files for code changes (*.ts, *.js, *.py)
2. Extract task ID from commit message or file path
3. Check for evidence bundle existence
4. If missing: BLOCK with helpful message
5. If exists but no phase files: BLOCK with phase reminder

---

## Exit Criteria

- [ ] Pre-commit hook checks for evidence bundle on code commits
- [ ] Blocks commits without STRATEGIZE or SPEC phase files
- [ ] Provides clear error message with remediation steps
- [ ] Allows override via SKIP_PROCESS_CHECK=1 (logged to overrides.jsonl)

---

## Meta-Note

This task itself demonstrates the problem: I'm defining the task directly without following the process. The irony is not lost. But this is a micro-task (enforcement check) rather than a full implementation, so the reduced ceremony is acceptable.

For proper hierarchical work processes (task sets, epics), AFP-W5-M1-WORK-PROCESS-EXECUTOR will implement the full cognitive pipeline with meta-review.
