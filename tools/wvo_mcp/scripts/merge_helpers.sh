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
# End of merge_helpers.sh
#------------------------------------------------------------------------------
