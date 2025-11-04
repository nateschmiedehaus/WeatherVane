#!/bin/bash
# detect_test_gaming.sh - Gaming pattern detection for verification evidence
# Covers: Autopilot + Manual sessions, All agent platforms (Claude, Codex, future)

WORKSPACE_ROOT="${WORKSPACE_ROOT:-.}"
TASK_ID=""
EVIDENCE_PATH=""
OUTPUT_FORMAT="json"
VERBOSE=false

# Initialize results
GAMING_DETECTED=false
declare -a PATTERNS_FOUND

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task)
      TASK_ID="$2"
      EVIDENCE_PATH="$WORKSPACE_ROOT/state/evidence/$TASK_ID"
      shift 2
      ;;
    --evidence-path)
      EVIDENCE_PATH="$2"
      shift 2
      ;;
    --format)
      OUTPUT_FORMAT="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      cat <<HELP
Usage: detect_test_gaming.sh [OPTIONS]

Detect gaming patterns in verification evidence (autopilot or manual sessions).

OPTIONS:
  --task <ID>              Task ID (looks in state/evidence/<ID>)
  --evidence-path <path>   Direct path to evidence directory
  --format <json|text>     Output format (default: json)
  --verbose                Show detailed output
  --help                   Show this help

EXAMPLES:
  # Autopilot task
  detect_test_gaming.sh --task FIX-META-TEST-ENFORCEMENT

  # Manual session
  detect_test_gaming.sh --evidence-path state/evidence/MY-TASK

  # Text format
  detect_test_gaming.sh --task MY-TASK --format text

EXIT CODES:
  0  No gaming detected
  1  Gaming patterns found
  2  Error (invalid arguments, missing files)

HELP
      exit 0
      ;;
    *)
      echo "Error: Unknown option: $1"
      echo "Run with --help for usage"
      exit 2
      ;;
  esac
done

# Validate evidence path exists
if [[ -z "$EVIDENCE_PATH" ]]; then
  echo "Error: Must provide --task or --evidence-path"
  exit 2
fi

if [[ ! -d "$EVIDENCE_PATH" ]]; then
  echo "Error: Evidence path not found: $EVIDENCE_PATH"
  exit 2
fi

[[ "$VERBOSE" == "true" ]] && echo "Scanning evidence: $EVIDENCE_PATH" >&2

##############################################################################
# Pattern 1: Detect tests without assertions
##############################################################################
detect_no_assertions() {
  local evidence_path="$1"
  
  # Find test files
  local test_files=$(find "$evidence_path" -type f \( \
    -name "*.test.ts" -o \
    -name "*.test.js" -o \
    -name "*.spec.ts" -o \
    -name "*.spec.js" \
  \) 2>/dev/null || true)
  
  if [[ -z "$test_files" ]]; then
    [[ "$VERBOSE" == "true" ]] && echo "No test files found" >&2
    return
  fi
  
  while IFS= read -r test_file; do
    [[ -z "$test_file" ]] && continue
    
    # Count assertions
    local assertion_count=$(grep -Ec "expect\(|assert\(|should\.|toBe\(|toEqual\(|toHaveBeenCalled|toMatchSnapshot" "$test_file" 2>/dev/null || true)
    assertion_count=${assertion_count:-0}

    # Count test cases
    local test_count=$(grep -Ec "test\(|it\(|describe\(" "$test_file" 2>/dev/null || true)
    test_count=${test_count:-0}
    
    # Flag if tests exist but no assertions
    if [[ $test_count -gt 0 && $assertion_count -eq 0 ]]; then
      PATTERNS_FOUND+=("{\"type\":\"no_assertions\",\"severity\":\"high\",\"file\":\"$test_file\",\"message\":\"Test file has $test_count test blocks but 0 assertions\"}")
      GAMING_DETECTED=true
      [[ "$VERBOSE" == "true" ]] && echo "❌ No assertions: $test_file" >&2
    fi
    
    # Check for trivial assertions
    local trivial_count=$(grep -Ec "expect\(true\)|expect\(1\)\.toBe\(1\)|assert\(true\)|expect\(false\)\.toBe\(false\)" "$test_file" 2>/dev/null || true)
    trivial_count=${trivial_count:-0}
    if [[ $trivial_count -gt 0 && $assertion_count -gt 0 ]]; then
      local trivial_ratio=$((trivial_count * 100 / assertion_count))
      if [[ $trivial_ratio -gt 50 ]]; then
        PATTERNS_FOUND+=("{\"type\":\"trivial_assertions\",\"severity\":\"medium\",\"file\":\"$test_file\",\"message\":\"Found $trivial_count trivial assertions out of $assertion_count total ($trivial_ratio%)\"}")
        GAMING_DETECTED=true
        [[ "$VERBOSE" == "true" ]] && echo "⚠️  Trivial assertions: $test_file" >&2
      fi
    fi
  done <<< "$test_files"
}

##############################################################################
# Pattern 2: Detect mock-heavy integration tests
##############################################################################
detect_mock_abuse() {
  local evidence_path="$1"
  
  # Find integration test files
  local integration_files=$(find "$evidence_path" -type f \( \
    -name "*.integration.test.*" -o \
    -name "*integration*.test.*" \
  \) 2>/dev/null || true)
  
  if [[ -z "$integration_files" ]]; then
    # Check if claims Level 3 but has no integration files
    local verify_file="$evidence_path/verify/verification_summary.md"
    if [[ -f "$verify_file" ]]; then
      local claims_level3=$(grep -c "Level 3.*✅\|Level 3.*achieved\|Level 3.*COMPLETE" "$verify_file" 2>/dev/null || true)
      claims_level3=${claims_level3:-0}
      
      if [[ $claims_level3 -gt 0 ]]; then
        PATTERNS_FOUND+=("{\"type\":\"missing_integration\",\"severity\":\"high\",\"file\":\"$verify_file\",\"message\":\"Claims Level 3 (Integration Testing) but no integration test files found\"}")
        GAMING_DETECTED=true
        [[ "$VERBOSE" == "true" ]] && echo "❌ Missing integration tests" >&2
      fi
    fi
    return
  fi
  
  while IFS= read -r test_file; do
    [[ -z "$test_file" ]] && continue
    
    # Count mocks
    local mock_count=$(grep -Ec "vi\.mock\(|jest\.mock\(|sinon\.stub\(|\.fn\(\)|mock\(|stub\(" "$test_file" 2>/dev/null || true)
    mock_count=${mock_count:-0}

    # Count real integrations (heuristic)
    local real_count=$(grep -Ec "fetch\(|axios\.|http\.|pool\.query\(|await .+\(|new .+Client\(|prisma\." "$test_file" 2>/dev/null || true)
    real_count=${real_count:-0}
    
    # Calculate mock ratio
    local total=$((mock_count + real_count))
    if [[ $total -gt 0 ]]; then
      local mock_ratio=$((mock_count * 100 / total))
      
      # Flag if >80% mocking in "integration" test
      if [[ $mock_ratio -gt 80 && $mock_count -gt 0 ]]; then
        PATTERNS_FOUND+=("{\"type\":\"mock_heavy\",\"severity\":\"high\",\"file\":\"$test_file\",\"message\":\"Integration test has $mock_ratio% mocking ($mock_count mocks, $real_count real API calls)\"}")
        GAMING_DETECTED=true
        [[ "$VERBOSE" == "true" ]] && echo "❌ Mock-heavy integration: $test_file" >&2
      fi
    fi
  done <<< "$integration_files"
}

##############################################################################
# Pattern 3: Detect weak deferral justifications
##############################################################################
detect_weak_deferrals() {
  local evidence_path="$1"
  local verify_file="$evidence_path/verify/verification_summary.md"
  
  if [[ ! -f "$verify_file" ]]; then
    [[ "$VERBOSE" == "true" ]] && echo "No verification summary found" >&2
    return
  fi
  
  # Extract deferral sections
  local deferrals=$(sed -n '/## What Was NOT Tested/,/^## /p' "$verify_file" 2>/dev/null || true)
  
  if [[ -z "$deferrals" ]]; then
    return
  fi
  
  # Weak patterns to detect
  local weak_patterns=(
    "don't have time"
    "don't have time"
    "too lazy"
    "too hard"
    "will do later"
    "not important"
    "seems to work"
    "probably fine"
    "don't know how"
    "too complex"
  )
  
  for pattern in "${weak_patterns[@]}"; do
    if echo "$deferrals" | grep -qi "$pattern"; then
      PATTERNS_FOUND+=("{\"type\":\"weak_deferral\",\"severity\":\"high\",\"file\":\"$verify_file\",\"message\":\"Weak deferral justification contains: '$pattern'\"}")
      GAMING_DETECTED=true
      [[ "$VERBOSE" == "true" ]] && echo "❌ Weak deferral: '$pattern'" >&2
    fi
  done
  
  # Check for missing required fields
  if ! echo "$deferrals" | grep -q "Reason:"; then
    PATTERNS_FOUND+=("{\"type\":\"incomplete_deferral\",\"severity\":\"medium\",\"file\":\"$verify_file\",\"message\":\"Deferral section missing 'Reason:' field\"}")
    [[ "$VERBOSE" == "true" ]] && echo "⚠️  Incomplete deferral: missing Reason" >&2
  fi
  
  if ! echo "$deferrals" | grep -q "Validation plan:"; then
    PATTERNS_FOUND+=("{\"type\":\"incomplete_deferral\",\"severity\":\"medium\",\"file\":\"$verify_file\",\"message\":\"Deferral section missing 'Validation plan:' field\"}")
    [[ "$VERBOSE" == "true" ]] && echo "⚠️  Incomplete deferral: missing Validation plan" >&2
  fi
}

##############################################################################
# Output results
##############################################################################
output_results() {
  local task_id="$1"
  local evidence_path="$2"
  
  if [[ "$OUTPUT_FORMAT" == "json" ]]; then
    # JSON output
    local patterns_json=$(IFS=','; echo "${PATTERNS_FOUND[*]}")
    cat <<JSON
{
  "task_id": "$task_id",
  "evidence_path": "$evidence_path",
  "gaming_detected": $GAMING_DETECTED,
  "pattern_count": ${#PATTERNS_FOUND[@]},
  "patterns": [
    $patterns_json
  ],
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
  else
    # Text output
    echo "Gaming Detection Report"
    echo "======================="
    echo "Task: $task_id"
    echo "Evidence: $evidence_path"
    echo ""
    
    if [[ "$GAMING_DETECTED" == "true" ]]; then
      echo "⚠️  Gaming patterns detected: ${#PATTERNS_FOUND[@]}"
      echo ""
      for pattern in "${PATTERNS_FOUND[@]}"; do
        # Parse JSON and format
        local type=$(echo "$pattern" | grep -o '"type":"[^"]*"' | cut -d'"' -f4)
        local severity=$(echo "$pattern" | grep -o '"severity":"[^"]*"' | cut -d'"' -f4)
        local message=$(echo "$pattern" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
        local severity_upper=$(echo "$severity" | tr '[:lower:]' '[:upper:]')
        echo "- [$severity_upper] $type: $message"
      done
    else
      echo "✅ No gaming patterns detected"
    fi
  fi
}

##############################################################################
# Main execution
##############################################################################
main() {
  # Run all detection patterns
  detect_no_assertions "$EVIDENCE_PATH"
  detect_mock_abuse "$EVIDENCE_PATH"
  detect_weak_deferrals "$EVIDENCE_PATH"
  
  # Output results
  output_results "$TASK_ID" "$EVIDENCE_PATH"
  
  # Exit code
  if [[ "$GAMING_DETECTED" == "true" ]]; then
    exit 1  # Gaming found
  else
    exit 0  # Clean
  fi
}

# Entry point
main
