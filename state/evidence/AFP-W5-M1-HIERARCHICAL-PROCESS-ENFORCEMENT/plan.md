# PLAN - Hierarchical Work Process Enforcement

**Task:** AFP-W5-M1-HIERARCHICAL-PROCESS-ENFORCEMENT
**Date:** 2025-11-05

---

## Architecture

```
Pre-Commit Hook
    ↓
hierarchy_check.sh
    ├→ Extract context (commit message, staged files, git branch)
    ├→ Detect hierarchical level (task/task-set/epic)
    ├→ Check for evidence bundle
    └→ Block or allow (with logging)
```

**Rationale:** Keep hook simple (bash), put logic in testable script.

---

## Detection Heuristics

### Task Level
- Commit message matches: `AFP-W[0-5]-M[0-9]+-[A-Z-]+$`
- Single task ID mentioned
- No "task set" or "epic" keywords

### Task-Set Level
- Multiple task IDs mentioned: `AFP-.*AFP-.*` (2+ matches)
- Keywords: "task set", "tasks 1-3", "work through"
- User explicitly creates `state/evidence/*-TASKS-*` bundle

### Epic Level
- Commit message matches: `WAVE-[0-5]` or `W[0-5].M[0-9]+`
- Keywords: "epic", "milestone", "wave"
- User explicitly creates `state/evidence/WAVE-*` or `EPIC-*` bundle

---

## Implementation Plan

### File 1: `.git/hooks/pre-commit` (enhance existing)
**Location:** Line ~100 (after AFP checks, before docsync)
**Addition:** ~15 lines

```bash
# Hierarchical process check
if [ -z "$SKIP_HIERARCHY_CHECK" ]; then
  echo "🏗️  Checking hierarchical work process compliance..."
  if ! bash .git/hooks/lib/hierarchy_check.sh; then
    exit 1
  fi
fi
```

### File 2: `.git/hooks/lib/hierarchy_check.sh` (new)
**LOC:** ~80 lines

```bash
#!/usr/bin/env bash

# Extract commit message
COMMIT_MSG=$(git log --format=%B -n 1 2>/dev/null || cat .git/COMMIT_EDITMSG 2>/dev/null || echo "")

# Detect level
detect_level() {
  # Count task IDs
  TASK_COUNT=$(echo "$COMMIT_MSG" | grep -o "AFP-W[0-5]-M[0-9]+-[A-Z-]+" | wc -l)

  if [[ "$COMMIT_MSG" =~ WAVE-[0-5]|W[0-5].M[0-9]+|epic ]]; then
    echo "epic"
  elif [[ $TASK_COUNT -gt 1 ]] || [[ "$COMMIT_MSG" =~ "task set"|"tasks [0-9]" ]]; then
    echo "task-set"
  elif [[ $TASK_COUNT -eq 1 ]]; then
    echo "task"
  else
    echo "unknown"
  fi
}

LEVEL=$(detect_level)

# Check evidence bundle
check_evidence() {
  local level=$1
  local task_id=$(echo "$COMMIT_MSG" | grep -o "AFP-W[0-5]-M[0-9]+-[A-Z-]+" | head -1)

  case $level in
    task)
      [ -f "state/evidence/$task_id/strategy.md" ]
      ;;
    task-set)
      # Look for any *-TASKS-* bundle
      find state/evidence -name "*-TASKS-*" -type d | head -1 | xargs -I {} test -f {}/assessment.md
      ;;
    epic)
      # Look for WAVE-* or EPIC-* bundle
      find state/evidence -name "WAVE-*" -o -name "EPIC-*" -type d | head -1 | xargs -I {} test -f {}/strategic_analysis.md
      ;;
  esac
}

if [ "$LEVEL" != "unknown" ] && ! check_evidence "$LEVEL"; then
  echo "❌ HIERARCHICAL PROCESS VIOLATION"
  echo ""
  echo "Detected Level: $LEVEL"
  echo "Missing evidence bundle for hierarchical process"
  echo ""
  echo "Override: SKIP_HIERARCHY_CHECK=1 git commit"
  exit 1
fi

exit 0
```

### File 3: Test validation
**Manual Test Cases:**
1. Commit with single task ID → Should pass if strategy.md exists
2. Commit with 2+ task IDs → Should fail without assessment.md
3. Commit with WAVE- → Should fail without strategic_analysis.md
4. Override with SKIP_HIERARCHY_CHECK=1 → Should log and pass

---

## Files Changed Summary

1. `.git/hooks/pre-commit` (+15 LOC)
2. `.git/hooks/lib/hierarchy_check.sh` (+80 LOC, new file)

**Total:** 95 LOC (under 150 limit ✅)

---

## Via Negativa Check

**Can we delete instead of add?**
- No - this is NEW enforcement capability
- No existing check covers hierarchical processes

**Can we simplify?**
- Detection heuristics could be simpler, but would miss cases
- Current design is minimal for requirements

---

## Risks & Mitigations

**Risk 1:** False positives (detecting wrong level)
- **Mitigation:** Override mechanism + logging for review

**Risk 2:** Hook performance
- **Mitigation:** Simple bash script, no external calls, <100ms

**Risk 3:** User confusion
- **Mitigation:** Clear error messages with examples

---

## Next Phase: THINK

Analyze edge cases and potential failure modes.
