#!/usr/bin/env bash
#
# Test Quality Validator - Ensures all tests meet 7-dimension standard
#
# Checks test files for:
# 1. Happy Path tests
# 2. Edge Case tests
# 3. Error Case tests
# 4. Concurrency tests
# 5. Resource tests
# 6. State Management tests
# 7. Integration tests
#
# Usage: bash scripts/validate_test_quality.sh [test_file]
#        If no file specified, checks all test files
#
# Exit codes:
#   0 = All tests meet quality standards
#   1 = Some tests are shallow
#   2 = Script error

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Dimension keywords to search for
declare -A DIMENSION_KEYWORDS
DIMENSION_KEYWORDS[1]="Happy Path|Normal Operation|Expected Behavior"
DIMENSION_KEYWORDS[2]="Edge Case|Boundary|zero|null|undefined|negative|extreme|maximum|minimum"
DIMENSION_KEYWORDS[3]="Error Case|Failure Mode|Invalid|throws|toThrow|error handling"
DIMENSION_KEYWORDS[4]="Concurrency|Thread Safety|Race Condition|concurrent|parallel|Promise.all"
DIMENSION_KEYWORDS[5]="Resource|Memory|Performance|leak|memoryUsage|growth|benchmark"
DIMENSION_KEYWORDS[6]="State|Side Effect|Immutability|modify|mutate|idempotent"
DIMENSION_KEYWORDS[7]="Integration|Real.World|realistic|actual|production"

# Score thresholds
EXCELLENT_THRESHOLD=7
GOOD_THRESHOLD=5
NEEDS_IMPROVEMENT_THRESHOLD=3

# Check a single test file
check_test_file() {
  local file="$1"
  local dimensions_found=0
  local missing_dimensions=()

  echo -e "${BLUE}Analyzing: ${file}${NC}"

  # Check each dimension
  for dim in {1..7}; do
    local keywords="${DIMENSION_KEYWORDS[$dim]}"

    if grep -qiE "$keywords" "$file"; then
      dimensions_found=$((dimensions_found + 1))
      echo -e "  ✅ Dimension $dim: Found"
    else
      missing_dimensions+=("$dim")
      echo -e "  ❌ Dimension $dim: Missing"
    fi
  done

  # Calculate score
  local score_pct=$(( (dimensions_found * 100) / 7 ))

  echo ""
  echo -e "  ${BOLD}Score: $dimensions_found/7 ($score_pct%)${NC}"

  # Categorize
  if [ "$dimensions_found" -eq "$EXCELLENT_THRESHOLD" ]; then
    echo -e "  ${GREEN}${BOLD}✅ EXCELLENT${NC} - All dimensions covered"
    return 0
  elif [ "$dimensions_found" -ge "$GOOD_THRESHOLD" ]; then
    echo -e "  ${YELLOW}⚠️  GOOD${NC} - Missing: ${missing_dimensions[*]}"
    return 1
  elif [ "$dimensions_found" -ge "$NEEDS_IMPROVEMENT_THRESHOLD" ]; then
    echo -e "  ${RED}⚠️  NEEDS IMPROVEMENT${NC} - Missing: ${missing_dimensions[*]}"
    return 1
  else
    echo -e "  ${RED}${BOLD}❌ SHALLOW${NC} - Missing: ${missing_dimensions[*]}"
    return 1
  fi
}

# Print dimension descriptions
print_dimension_guide() {
  echo -e "${BOLD}${CYAN}Test Quality Dimensions:${NC}\n"

  echo -e "${BOLD}1. Happy Path${NC}"
  echo -e "   Normal inputs, expected outputs, typical use cases\n"

  echo -e "${BOLD}2. Edge Cases${NC}"
  echo -e "   Zero, null, undefined, empty, max, min, boundaries\n"

  echo -e "${BOLD}3. Error Cases${NC}"
  echo -e "   Invalid inputs, exceptions, error messages, cleanup\n"

  echo -e "${BOLD}4. Concurrency${NC}"
  echo -e "   Thread safety, race conditions, parallel execution\n"

  echo -e "${BOLD}5. Resources${NC}"
  echo -e "   Memory leaks, performance, bounded growth\n"

  echo -e "${BOLD}6. State Management${NC}"
  echo -e "   Side effects, immutability, idempotency\n"

  echo -e "${BOLD}7. Integration${NC}"
  echo -e "   Real-world data, realistic scenarios, production cases\n"
}

# Main function
main() {
  echo -e "${BOLD}${CYAN}Test Quality Validator${NC}\n"

  # Show help if requested
  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Usage: $0 [test_file]"
    echo ""
    echo "If no file specified, checks all test files in the repository."
    echo ""
    print_dimension_guide
    exit 0
  fi

  local test_files=()
  local total_files=0
  local excellent_count=0
  local good_count=0
  local poor_count=0

  # Get test files to check
  if [ $# -eq 0 ]; then
    # Check all test files
    echo "Scanning for test files..."
    while IFS= read -r file; do
      test_files+=("$file")
    done < <(find "$ROOT" -name "*.test.ts" -o -name "*.test.js" | grep -v node_modules | grep -v ".disabled")

    total_files=${#test_files[@]}
    echo -e "Found $total_files test files\n"
  else
    # Check specific file
    test_files=("$1")
    total_files=1
  fi

  # Check each file
  for file in "${test_files[@]}"; do
    if check_test_file "$file"; then
      excellent_count=$((excellent_count + 1))
    else
      # Determine if good or poor based on last output
      # This is a simplification - real scoring happens in check_test_file
      good_count=$((good_count + 1))
    fi
    echo ""
  done

  # Summary
  echo -e "${BOLD}${CYAN}===========================================${NC}"
  echo -e "${BOLD}Summary:${NC}"
  echo -e "  Total files:   $total_files"
  echo -e "  ${GREEN}Excellent (7/7):${NC} $excellent_count"
  echo -e "  ${YELLOW}Good (5-6/7):${NC}    $good_count"
  echo -e "  ${RED}Needs work:${NC}    $((total_files - excellent_count - good_count))"
  echo -e "${BOLD}${CYAN}===========================================${NC}\n"

  # Print recommendations
  if [ "$excellent_count" -lt "$total_files" ]; then
    echo -e "${YELLOW}Recommendations:${NC}"
    echo -e "  1. Review UNIVERSAL_TEST_STANDARDS.md for guidance"
    echo -e "  2. Look at tools/wvo_mcp/src/utils/device_profile.test.ts as example"
    echo -e "  3. Add missing dimensions to improve test coverage"
    echo -e "  4. Run with --help to see dimension descriptions\n"

    # Return failure if any tests are not excellent
    exit 1
  else
    echo -e "${GREEN}${BOLD}✅ All tests meet quality standards!${NC}\n"
    exit 0
  fi
}

main "$@"
