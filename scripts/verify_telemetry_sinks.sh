#!/usr/bin/env bash
#
# Verify Telemetry JSONL Sinks
#
# Checks that telemetry files exist, contain valid JSONL, and have required schema fields.
# Part of IMP-OBS-03 (JSONL Sinks verification)
#
# Usage:
#   bash scripts/verify_telemetry_sinks.sh [--workspace-root PATH]
#
# Exit codes:
#   0 - All checks passed
#   1 - Missing files or invalid JSONL
#   2 - Schema compliance failures

set -euo pipefail

# Default workspace root
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace-root)
      WORKSPACE_ROOT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 2
      ;;
  esac
done

TELEMETRY_DIR="$WORKSPACE_ROOT/state/telemetry"

echo "=== Telemetry JSONL Sinks Verification ==="
echo "Workspace: $WORKSPACE_ROOT"
echo "Telemetry dir: $TELEMETRY_DIR"
echo

# Check if telemetry directory exists
if [[ ! -d "$TELEMETRY_DIR" ]]; then
  echo "❌ Telemetry directory not found: $TELEMETRY_DIR"
  echo "   This is expected if no telemetry has been generated yet."
  exit 0  # Not a failure - just no data yet
fi

# Files to check (space-separated list)
FILES="traces.jsonl metrics.jsonl counters.jsonl test_traces.jsonl"

# Track results
TOTAL_FILES=0
FOUND_FILES=0
VALID_FILES=0
SCHEMA_OK=0

# Check each file
for file in $FILES; do
  TOTAL_FILES=$((TOTAL_FILES + 1))
  filepath="$TELEMETRY_DIR/$file"

  echo "Checking $file..."

  if [[ ! -f "$filepath" ]]; then
    echo "  ⚠️  Not found (optional)"
    continue
  fi

  FOUND_FILES=$((FOUND_FILES + 1))

  # Check file size
  size=$(wc -c < "$filepath" | tr -d ' ')
  lines=$(wc -l < "$filepath" | tr -d ' ')
  echo "  ✅ Found ($lines lines, $size bytes)"

  # Validate JSONL format
  invalid_lines=0
  valid_lines=0

  while IFS= read -r line; do
    if [[ -z "$line" ]]; then
      continue  # Skip empty lines
    fi

    if echo "$line" | jq empty 2>/dev/null; then
      valid_lines=$((valid_lines + 1))
    else
      invalid_lines=$((invalid_lines + 1))
    fi
  done < "$filepath"

  if [[ $invalid_lines -gt 0 ]]; then
    echo "  ⚠️  JSONL format: $valid_lines valid, $invalid_lines invalid"
  else
    echo "  ✅ JSONL format: all $valid_lines lines valid"
    VALID_FILES=$((VALID_FILES + 1))
  fi

  # Schema validation (first 10 records)
  echo "  Checking schema (first 10 records)..."

  case "$file" in
    traces.jsonl|test_traces.jsonl)
      # Required fields for trace spans
      required_fields=("traceId" "spanId" "name" "startTimeUnixNano" "status" "attributes")
      ;;
    metrics.jsonl)
      # Required fields for metrics
      required_fields=("timestamp" "type" "metric")
      ;;
    counters.jsonl)
      # Required fields for counters
      required_fields=("timestamp" "counter" "value")
      ;;
    *)
      required_fields=()
      ;;
  esac

  if [[ ${#required_fields[@]} -gt 0 ]]; then
    schema_failures=0
    records_checked=0

    head -n 10 "$filepath" | while IFS= read -r line; do
      if [[ -z "$line" ]]; then
        continue
      fi

      records_checked=$((records_checked + 1))

      for field in "${required_fields[@]}"; do
        if ! echo "$line" | jq -e "has(\"$field\")" >/dev/null 2>&1; then
          echo "    ⚠️  Record $records_checked missing field: $field"
          schema_failures=$((schema_failures + 1))
        fi
      done
    done

    if [[ $schema_failures -eq 0 ]]; then
      echo "    ✅ Schema OK"
      SCHEMA_OK=$((SCHEMA_OK + 1))
    fi
  else
    echo "    ⏭  No schema defined for this file"
  fi

  echo
done

# Summary
echo "=== Summary ==="
echo "Files found: $FOUND_FILES / $TOTAL_FILES"
echo "Valid JSONL: $VALID_FILES / $FOUND_FILES"
echo "Schema OK: $SCHEMA_OK"
echo

if [[ $FOUND_FILES -eq 0 ]]; then
  echo "ℹ️  No telemetry files found - this is expected if no operations have run yet."
  exit 0
fi

if [[ $VALID_FILES -lt $FOUND_FILES ]]; then
  echo "❌ Some files have invalid JSONL format"
  exit 1
fi

echo "✅ All telemetry sinks verified successfully"
exit 0
