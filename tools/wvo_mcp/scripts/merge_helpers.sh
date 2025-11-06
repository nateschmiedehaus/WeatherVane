#!/usr/bin/env bash
# Merge Helpers - Intelligent Git Conflict Resolution
# MVP Batch 1: Auto-merge + Union merge + Validation + Telemetry
#
# Purpose: Provides intelligent merge strategies to preserve work from multiple agents
# when git conflicts occur. Replaces conservative "git checkout --ours" approach.

set -euo pipefail

#------------------------------------------------------------------------------
# attempt_auto_merge - Try git's built-in three-way merge
#
# Uses git merge-file to attempt automatic merge of non-overlapping changes.
# This succeeds when agents modified different parts of the file.
#
# Args:
#   $1 - Path to conflicted file
#
# Returns:
#   0 if auto-merge succeeds (both changes merged)
#   1 if auto-merge fails (overlapping changes detected)
#------------------------------------------------------------------------------
attempt_auto_merge() {
  local file=$1

  # Extract base, ours, theirs versions from git index
  # :1: = common ancestor (base)
  # :2: = our version (current branch)
  # :3: = their version (incoming branch)
  git show :1:"$file" > "$file.base" 2>/dev/null || return 1
  git show :2:"$file" > "$file.ours" 2>/dev/null || return 1
  git show :3:"$file" > "$file.theirs" 2>/dev/null || return 1

  # Attempt three-way merge
  # -p = output to stdout (we redirect to file)
  if git merge-file -p "$file.ours" "$file.base" "$file.theirs" > "$file.merged" 2>/dev/null; then
    mv "$file.merged" "$file"
    return 0  # Success - merged both changes
  else
    return 1  # Failed - overlapping changes
  fi
}

#------------------------------------------------------------------------------
# attempt_union_merge - Keep both versions with conflict markers
#
# Always succeeds. Creates file with both versions marked for manual review.
# This is the fallback strategy that preserves all work for human decision.
#
# Args:
#   $1 - Path to conflicted file
#
# Returns:
#   0 (always succeeds)
#------------------------------------------------------------------------------
attempt_union_merge() {
  local file=$1

  # Create file with conflict markers (both versions visible)
  {
    echo "<<<<<<< OURS (Agent A)"
    cat "$file.ours"
    echo "======="
    echo ">>>>>>> THEIRS (Agent B)"
    cat "$file.theirs"
  } > "$file"

  return 0  # Always succeeds
}

#------------------------------------------------------------------------------
# validate_merge - Ensure merged file is syntactically valid
#
# Validates merged file based on file type (TypeScript, JSON, Bash).
# Catches syntax errors before staging to prevent broken builds.
#
# Args:
#   $1 - Path to merged file
#
# Returns:
#   0 if validation passes (file is valid)
#   1 if validation fails (syntax errors detected)
#------------------------------------------------------------------------------
validate_merge() {
  local file=$1

  # Syntax check based on file type
  case "$file" in
    *.ts|*.tsx)
      # TypeScript validation (type checking)
      if ! npx tsc --noEmit "$file" 2>/dev/null; then
        return 1  # TypeScript errors
      fi
      ;;
    *.json)
      # JSON validation (syntax check)
      if ! jq . "$file" >/dev/null 2>&1; then
        return 1  # JSON syntax error
      fi
      ;;
    *.sh)
      # Bash validation (syntax check)
      if ! bash -n "$file" 2>/dev/null; then
        return 1  # Bash syntax error
      fi
      ;;
    *)
      # Unknown file type - skip validation (assume ok)
      # Don't block merge for file types we don't validate
      ;;
  esac

  return 0  # Validation passed
}

#------------------------------------------------------------------------------
# log_merge_decision - Log merge decision to telemetry (JSONL)
#
# Records merge decisions for audit trail and metrics. Non-blocking - failures
# don't stop the merge workflow.
#
# Args:
#   $1 - Path to file
#   $2 - Resolution strategy (auto_merge, semantic_merge, union_merge, fallback_ours)
#   $3 - Result (kept_both, needs_review, discarded_theirs, validation_failed)
#
# Returns:
#   0 (always succeeds, non-blocking)
#------------------------------------------------------------------------------
log_merge_decision() {
  local file=$1
  local strategy=$2
  local result=$3

  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local telemetry_file="state/analytics/git_merge_decisions.jsonl"

  # Ensure directory exists
  mkdir -p "$(dirname "$telemetry_file")" 2>/dev/null || true

  # Build JSON event (minimal metadata for Batch 1)
  local event=$(jq -n \
    --arg ts "$timestamp" \
    --arg f "$file" \
    --arg s "$strategy" \
    --arg r "$result" \
    '{timestamp: $ts, file: $f, resolution_strategy: $s, result: $r}' 2>/dev/null || echo "{}")

  # Append to telemetry log (non-blocking - don't fail merge if this fails)
  echo "$event" >> "$telemetry_file" 2>/dev/null || true

  return 0  # Never fails (telemetry is non-critical)
}

#------------------------------------------------------------------------------
# attempt_semantic_merge_typescript - Structure-aware merge for TypeScript files
#
# Extracts imports and functions from both versions, merges them by structure
# rather than line numbers. Succeeds when both sides add different functions.
#
# Args:
#   $1 - Path to conflicted TypeScript file
#
# Returns:
#   0 if semantic merge succeeds (both sides' structures preserved)
#   1 if semantic merge fails (same function name modified differently)
#------------------------------------------------------------------------------
attempt_semantic_merge_typescript() {
  local file=$1

  # Extract imports from both sides (single-line only - MVP limitation)
  local imports_ours=$(grep '^import ' "$file.ours" 2>/dev/null | sort -u || true)
  local imports_theirs=$(grep '^import ' "$file.theirs" 2>/dev/null | sort -u || true)

  # Merge imports (union, deduplicate)
  local imports_merged=$(echo -e "$imports_ours\n$imports_theirs" | grep -v '^$' | sort -u)

  # Extract functions from both sides (export function only - MVP limitation)
  local functions_ours=$(grep '^export function ' "$file.ours" 2>/dev/null || true)
  local functions_theirs=$(grep '^export function ' "$file.theirs" 2>/dev/null || true)

  # Merge functions (keep both if different names, conflict if same name)
  local functions_merged=$(merge_typescript_functions "$functions_ours" "$functions_theirs")
  if [ $? -ne 0 ]; then
    return 1  # Conflict (same function name modified differently)
  fi

  # Rebuild file: imports + blank line + functions
  {
    echo "$imports_merged"
    echo ""
    echo "$functions_merged"
  } > "$file"

  # Validate with TypeScript compiler
  if validate_merge "$file"; then
    return 0  # Success
  else
    return 1  # Validation failed
  fi
}

#------------------------------------------------------------------------------
# merge_typescript_functions - Helper to merge function lists
#
# Checks if functions have different names (safe to merge) or same names
# (conflict requiring manual resolution).
#
# Args:
#   $1 - Functions from ours
#   $2 - Functions from theirs
#
# Returns:
#   Merged functions (stdout)
#   0 if merge succeeds (different names)
#   1 if conflict detected (same name)
#------------------------------------------------------------------------------
merge_typescript_functions() {
  local functions_ours=$1
  local functions_theirs=$2

  # Extract function names (simplified: "export function name(")
  local names_ours=$(echo "$functions_ours" | sed -n 's/^export function \([a-zA-Z0-9_]*\)(.*/\1/p' | sort)
  local names_theirs=$(echo "$functions_theirs" | sed -n 's/^export function \([a-zA-Z0-9_]*\)(.*/\1/p' | sort)

  # Check for name collisions
  local collisions=$(comm -12 <(echo "$names_ours") <(echo "$names_theirs"))
  if [ -n "$collisions" ]; then
    return 1  # Conflict: same function name in both
  fi

  # Union merge (keep both - different names)
  echo -e "$functions_ours\n$functions_theirs" | grep -v '^$'
  return 0
}

#------------------------------------------------------------------------------
# attempt_semantic_merge_json - Key-based merge for JSON files
#
# Uses jq's * operator to recursively merge JSON keys. Prefers right side
# (theirs) on key conflicts.
#
# Args:
#   $1 - Path to conflicted JSON file
#
# Returns:
#   0 if semantic merge succeeds (keys merged)
#   1 if merge fails (invalid JSON produced)
#------------------------------------------------------------------------------
attempt_semantic_merge_json() {
  local file=$1

  # Use jq's * operator for recursive merge
  # Prefers right side (theirs) on key conflicts
  if jq -s '.[0] * .[1]' "$file.ours" "$file.theirs" > "$file.merged" 2>/dev/null; then
    # Validate merged JSON
    if validate_merge "$file.merged"; then
      mv "$file.merged" "$file"
      return 0  # Success
    fi
  fi

  return 1  # Merge or validation failed
}

#------------------------------------------------------------------------------
# End of merge_helpers.sh
#------------------------------------------------------------------------------
