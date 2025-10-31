#!/usr/bin/env bash

# check_drift.sh - Automate attestation hash drift detection
# Part of FIX-DRIFT-DETECTION-IMP24
# Detects when eval prompts differ from production prompts

set -euo pipefail

# ============================================================================
# Pre-flight Checks
# ============================================================================

# Check jq is installed (Edge Case 7)
if ! command -v jq &>/dev/null; then
  echo "❌ ERROR: jq is required but not installed"
  echo ""
  echo "Install jq:"
  echo "  macOS:   brew install jq"
  echo "  Ubuntu:  apt-get install jq"
  echo "  Fedora:  dnf install jq"
  exit 2
fi

# ============================================================================
# Default Values
# ============================================================================

BASELINE_PATH="${BASELINE_PATH:-tools/wvo_mcp/evals/results/baseline/prompt_eval_baseline.json}"
CURRENT_PATH="${CURRENT_PATH:-}"  # Will auto-detect latest run
THRESHOLD="${THRESHOLD:-10}"  # 10% drift threshold

# ============================================================================
# Help Text
# ============================================================================

show_help() {
  cat <<'EOF'
Usage: bash tools/wvo_mcp/scripts/check_drift.sh [OPTIONS]

Detect when eval prompts differ from production prompts via attestation hash
comparison.

OPTIONS:
  --baseline <path>    Path to baseline eval results JSON
                       Default: tools/wvo_mcp/evals/results/baseline/prompt_eval_baseline.json

  --current <path>     Path to current eval results JSON
                       Default: Latest file in tools/wvo_mcp/evals/results/runs/

  --threshold <percent> Drift threshold percentage (default: 10)
                       Drift >threshold triggers alert (exit 1)
                       Drift ≤threshold is acceptable (exit 0)

  --help               Show this help message

EXAMPLES:
  # Check latest run vs baseline (default)
  bash tools/wvo_mcp/scripts/check_drift.sh

  # Custom baseline path
  bash tools/wvo_mcp/scripts/check_drift.sh --baseline /path/to/baseline.json

  # Custom threshold (warn at 15% instead of 10%)
  bash tools/wvo_mcp/scripts/check_drift.sh --threshold 15

  # Specify both baseline and current
  bash tools/wvo_mcp/scripts/check_drift.sh \
    --baseline baseline.json \
    --current current.json

EXIT CODES:
  0 - No significant drift detected (drift ≤ threshold)
  1 - Drift detected (drift > threshold)
  2 - Error (missing files, invalid JSON, etc.)

OUTPUT:
  ✅ No drift: All tasks have matching attestation hashes
  ⚠️  Minor drift: Some drift but within tolerance
  ❌ Drift detected: Exceeds threshold, recapture recommended

For more info: See tools/wvo_mcp/evals/README.md#drift-detection

EOF
}

# ============================================================================
# Argument Parsing
# ============================================================================

while [[ $# -gt 0 ]]; do
  case $1 in
    --baseline)
      BASELINE_PATH="$2"
      shift 2
      ;;
    --current)
      CURRENT_PATH="$2"
      shift 2
      ;;
    --threshold)
      THRESHOLD="$2"
      shift 2
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      echo "❌ ERROR: Unknown option: $1"
      echo ""
      show_help
      exit 2
      ;;
  esac
done

# ============================================================================
# Auto-detect Current Run (if not specified)
# ============================================================================

if [[ -z "$CURRENT_PATH" ]]; then
  # Find latest run file (most recent by modification time)
  RUNS_DIR="tools/wvo_mcp/evals/results/runs"

  if [[ ! -d "$RUNS_DIR" ]]; then
    echo "❌ ERROR: No eval runs directory found: $RUNS_DIR"
    echo ""
    echo "Run evals first:"
    echo "  bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full"
    exit 2
  fi

  CURRENT_PATH=$(ls -t "$RUNS_DIR"/*.json 2>/dev/null | head -1)

  if [[ -z "$CURRENT_PATH" ]]; then
    echo "❌ ERROR: No eval runs found in $RUNS_DIR"
    echo ""
    echo "Run evals first:"
    echo "  bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full"
    exit 2
  fi

  echo "ℹ️  Auto-detected current run: $(basename "$CURRENT_PATH")"
fi

# ============================================================================
# Function: Load Baseline Hashes (AC1)
# ============================================================================

load_baseline_hashes() {
  local baseline_path="$1"

  # Check file exists
  if [[ ! -f "$baseline_path" ]]; then
    echo "❌ ERROR: Baseline file not found: $baseline_path"
    echo ""
    echo "Create baseline first:"
    echo "  bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full --baseline"
    exit 2
  fi

  # Parse JSON and extract hashes
  # Format: "TASK-ID=hash"
  local hashes
  hashes=$(jq -r '.tasks[]? | "\(.id)=\(.attestation_hash // "")"' "$baseline_path" 2>&1)

  if [[ $? -ne 0 ]]; then
    echo "❌ ERROR: Failed to parse baseline JSON"
    echo ""
    echo "Details:"
    echo "$hashes"
    echo ""
    echo "Check file format: $baseline_path"
    exit 2
  fi

  # Check for empty result (Edge Case 3)
  if [[ -z "$hashes" ]] || [[ $(echo "$hashes" | wc -l) -eq 0 ]]; then
    echo "❌ ERROR: Baseline has 0 tasks (invalid baseline)"
    echo ""
    echo "Recapture baseline:"
    echo "  bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full --baseline"
    exit 2
  fi

  echo "$hashes"
}

# ============================================================================
# Function: Load Current Run Hashes (AC2)
# ============================================================================

load_current_hashes() {
  local current_path="$1"

  # Check file exists
  if [[ ! -f "$current_path" ]]; then
    echo "❌ ERROR: Current run file not found: $current_path"
    echo ""
    echo "Run evals first:"
    echo "  bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full"
    exit 2
  fi

  # Parse JSON and extract hashes
  local hashes
  hashes=$(jq -r '.tasks[]? | "\(.id)=\(.attestation_hash // "")"' "$current_path" 2>&1)

  if [[ $? -ne 0 ]]; then
    echo "❌ ERROR: Failed to parse current run JSON"
    echo ""
    echo "Details:"
    echo "$hashes"
    echo ""
    echo "Check file format: $current_path"
    exit 2
  fi

  # Check for empty result
  if [[ -z "$hashes" ]] || [[ $(echo "$hashes" | wc -l) -eq 0 ]]; then
    echo "❌ ERROR: Current run has 0 tasks (invalid run)"
    exit 2
  fi

  echo "$hashes"
}

# ============================================================================
# Function: Compare Hashes (AC3)
# ============================================================================

compare_hashes() {
  local baseline="$1"  # newline-separated "id=hash"
  local current="$2"
  local threshold="$3"

  local drift_count=0
  local total_count=0
  local drifted_tasks=""

  # Iterate over baseline tasks
  while IFS='=' read -r task_id baseline_hash; do
    ((total_count++))

    # Edge Case 6: Handle null/empty hash in baseline
    if [[ -z "$baseline_hash" ]]; then
      echo "⚠️  WARNING: Task $task_id has empty attestation hash in baseline (old format?)"
      ((drift_count++))
      drifted_tasks+="  - $task_id: <empty> → <current>\n"
      continue
    fi

    # Find current hash for this task
    current_hash=$(echo "$current" | grep "^${task_id}=" | cut -d'=' -f2)

    # Edge Case 1: Task in baseline but not in current
    if [[ -z "$current_hash" ]]; then
      echo "⚠️  WARNING: Task $task_id in baseline but not in current run (task removed from corpus?)"
      continue  # Don't count as drift
    fi

    # Edge Case 6: Handle null/empty hash in current
    if [[ -z "$current_hash" ]]; then
      echo "⚠️  WARNING: Task $task_id has empty attestation hash in current run"
      ((drift_count++))
      drifted_tasks+="  - $task_id: ${baseline_hash:0:10}... → <empty>\n"
      continue
    fi

    # Compare hashes
    if [[ "$baseline_hash" != "$current_hash" ]]; then
      ((drift_count++))
      drifted_tasks+="  - $task_id: ${baseline_hash:0:10}... → ${current_hash:0:10}...\n"
    fi
  done <<< "$baseline"

  # Calculate drift rate
  drift_rate=$(awk "BEGIN {printf \"%.1f\", ($drift_count / $total_count) * 100}")

  # Output results
  echo ""
  if (( $(echo "$drift_rate > $threshold" | bc -l) )); then
    # Significant drift (Edge Case 5: strict >)
    echo "❌ DRIFT DETECTED ($drift_count/$total_count tasks, ${drift_rate}%)"
    echo ""
    echo "Drifted tasks:"
    echo -e "$drifted_tasks"
    print_guidance
    return 1
  elif (( drift_count > 0 )); then
    # Minor drift (within tolerance)
    echo "⚠️  Minor drift detected ($drift_count/$total_count tasks, ${drift_rate}%) - within tolerance"
    echo ""
    echo "Drifted tasks:"
    echo -e "$drifted_tasks"
    echo ""
    echo "ℹ️  Drift is <${threshold}% threshold - no action needed"
    echo "   Monitor for further drift. If persists, consider recapture."
    return 0
  else
    # No drift
    echo "✅ No drift detected ($total_count tasks checked)"
    return 0
  fi
}

# ============================================================================
# Function: Print Guidance (AC4, AC5)
# ============================================================================

print_guidance() {
  cat <<'EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 WHAT TO DO NEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Why recapture baseline?
────────────────────────
- Baseline prompts differ from production prompts
- Eval results may not reflect current behavior
- Quality gate decisions based on stale data
- Prompt changes (PromptCompiler, personas, overlays) not tested

When to recapture:
──────────────────
✅ After PromptCompiler changes (IMP-21)
✅ After persona updates (IMP-22)
✅ After overlay changes (IMP-23)
✅ After major refactoring
❌ NOT for minor tweaks (<10% drift)

How to recapture:
─────────────────
  bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full --baseline --runs 5

This will:
  1. Run full eval suite 5 times (statistical confidence)
  2. Calculate mean + confidence intervals
  3. Update baseline file with new attestation hashes
  4. Resolve drift (hashes will match on next check)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 Prompt Drift Detection (FIX-DRIFT-DETECTION-IMP24)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Baseline: $BASELINE_PATH"
  echo "Current:  $CURRENT_PATH"
  echo "Threshold: ${THRESHOLD}%"
  echo ""

  # Load hashes
  echo "Loading baseline hashes..."
  baseline_hashes=$(load_baseline_hashes "$BASELINE_PATH")

  echo "Loading current run hashes..."
  current_hashes=$(load_current_hashes "$CURRENT_PATH")

  # Compare
  echo "Comparing hashes..."
  compare_hashes "$baseline_hashes" "$current_hashes" "$THRESHOLD"

  # Exit code from compare_hashes
  exit $?
}

# Run main
main
