#!/usr/bin/env bash
# Quality Checks Library
# Reusable functions for detecting quality issues in codebase
# Usage: source scripts/lib/quality_checks.sh

# ============================================
# FILE SIZE ANALYSIS
# ============================================

# Check if files exceed maximum line count
# Args: $1 = max_lines (default: 500)
#       $2 = path (default: src/)
# Returns: List of files exceeding limit
check_file_size() {
  local max_lines=${1:-500}
  local search_path=${2:-"src/"}

  find "$search_path" tools/wvo_mcp/src/ -name "*.ts" \
    -not -name "*.test.ts" \
    -not -name "*.spec.ts" \
    -not -name "*.generated.ts" \
    -not -path "*/node_modules/*" \
    -not -path "*/__tests__/*" \
    -exec sh -c 'wc -l "$1" | awk -v max="$2" "{if (\$1 > max) print \$2}"' _ {} "$max_lines" \; 2>/dev/null
}

# Count files exceeding size limit
# Args: $1 = max_lines (default: 500)
# Returns: Count of oversized files
count_oversized_files() {
  local max_lines=${1:-500}
  check_file_size "$max_lines" | wc -l
}

# Get file size statistics
# Returns: JSON with min, max, avg, median line counts
get_file_size_stats() {
  local files=$(find src/ tools/wvo_mcp/src/ -name "*.ts" -not -name "*.test.ts" -not -name "*.generated.ts" 2>/dev/null)
  local sizes=$(echo "$files" | xargs wc -l 2>/dev/null | awk '{print $1}' | grep -v "^total$")

  if [ -z "$sizes" ]; then
    echo '{"min":0,"max":0,"avg":0,"median":0,"count":0}'
    return
  fi

  local min=$(echo "$sizes" | sort -n | head -1)
  local max=$(echo "$sizes" | sort -n | tail -1)
  local avg=$(echo "$sizes" | awk '{sum+=$1; count++} END {if (count>0) print int(sum/count); else print 0}')
  local count=$(echo "$sizes" | wc -l)
  local median=$(echo "$sizes" | sort -n | awk '{a[NR]=$1} END {if (NR%2==1) print a[(NR+1)/2]; else print int((a[NR/2]+a[NR/2+1])/2)}')

  echo "{\"min\":$min,\"max\":$max,\"avg\":$avg,\"median\":$median,\"count\":$count}"
}

# ============================================
# TODO DETECTION
# ============================================

# Find TODOs in production code
# Args: $1 = path (default: src/)
# Returns: List of files with TODOs
find_todos() {
  local search_path=${1:-"src/"}

  grep -rl "TODO\|FIXME\|XXX\|HACK\|BUG" "$search_path" tools/wvo_mcp/src/ \
    --include="*.ts" \
    --exclude="*.test.ts" \
    --exclude="*.spec.ts" \
    --exclude-dir=__tests__ \
    --exclude-dir=node_modules 2>/dev/null || true
}

# Count TODOs in production code
# Returns: Count of files with TODOs
count_todos() {
  find_todos | wc -l
}

# Find TODOs with context
# Returns: TODO lines with file:line:content
get_todo_details() {
  local search_path=${1:-"src/"}

  grep -rn "TODO\|FIXME\|XXX\|HACK\|BUG" "$search_path" tools/wvo_mcp/src/ \
    --include="*.ts" \
    --exclude="*.test.ts" \
    --exclude="*.spec.ts" \
    --exclude-dir=__tests__ \
    --exclude-dir=node_modules 2>/dev/null || true
}

# Detect obfuscated TODOs (T0DO, T O DO, etc.)
# Returns: List of potential TODO obfuscations
find_obfuscated_todos() {
  local search_path=${1:-"src/"}

  # Pattern matches: T0DO, T.O.D.O, T O D O, T-O-D-O, etc.
  grep -rn "T[0Oo._-]\s*[0Oo._-]\s*D[0Oo._-]\s*[0Oo._-]" "$search_path" tools/wvo_mcp/src/ \
    --include="*.ts" \
    --exclude="*.test.ts" \
    --exclude="*.spec.ts" 2>/dev/null || true
}

# ============================================
# MAGIC NUMBER DETECTION
# ============================================

# Find potential magic numbers (numbers not in const/let/var declarations)
# Args: $1 = min_digits (default: 3)
# Returns: Lines with potential magic numbers
find_magic_numbers() {
  local min_digits=${1:-3}
  local pattern="\b[0-9]{$min_digits,}\b"

  grep -rn "$pattern" src/ tools/wvo_mcp/src/ \
    --include="*.ts" \
    --exclude="*.test.ts" \
    --exclude="*.spec.ts" 2>/dev/null | \
    grep -v "const\|let\|var\|interface\|type\|enum" || true
}

# Count potential magic numbers
count_magic_numbers() {
  find_magic_numbers | wc -l
}

# ============================================
# TEST COVERAGE ANALYSIS
# ============================================

# Get test coverage percentage
# Returns: Coverage percentage (0-100) or "N/A"
get_test_coverage() {
  if [ -f "coverage/coverage-summary.json" ] && command -v jq &> /dev/null; then
    jq -r '.total.lines.pct // "0"' coverage/coverage-summary.json 2>/dev/null || echo "0"
  else
    echo "N/A"
  fi
}

# Check if coverage meets threshold
# Args: $1 = threshold (default: 80)
# Returns: 0 if meets threshold, 1 otherwise
check_coverage_threshold() {
  local threshold=${1:-80}
  local coverage=$(get_test_coverage)

  if [ "$coverage" = "N/A" ]; then
    return 1
  fi

  if command -v bc &> /dev/null; then
    local result=$(echo "$coverage >= $threshold" | bc -l 2>/dev/null || echo "0")
    [ "$result" = "1" ]
  else
    # Fallback without bc
    local coverage_int=${coverage%.*}
    [ "$coverage_int" -ge "$threshold" ]
  fi
}

# ============================================
# ERROR HANDLING ANALYSIS
# ============================================

# Count async functions
count_async_functions() {
  grep -rn "async function\|async.*=>\|async\s\+(" src/ tools/wvo_mcp/src/ \
    --include="*.ts" \
    --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0"
}

# Count try-catch blocks
count_try_catch() {
  grep -rn "try\s*{" src/ tools/wvo_mcp/src/ \
    --include="*.ts" \
    --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0"
}

# Calculate error handling coverage (try-catch / async functions)
# Returns: Percentage (0-100)
get_error_handling_coverage() {
  local async_count=$(count_async_functions)
  local try_count=$(count_try_catch)

  if [ "$async_count" -eq 0 ]; then
    echo "100"
    return
  fi

  echo $((try_count * 100 / async_count))
}

# ============================================
# DOCUMENTATION CHECKS
# ============================================

# Check if README exists and is substantial
check_readme() {
  if [ -f "README.md" ] && [ $(wc -l < README.md) -gt 10 ]; then
    return 0
  else
    return 1
  fi
}

# Check if required documentation files exist
# Args: $@ = list of required doc paths
# Returns: List of missing docs
check_required_docs() {
  local missing=()

  for doc in "$@"; do
    if [ ! -f "$doc" ]; then
      missing+=("$doc")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    printf '%s\n' "${missing[@]}"
    return 1
  fi

  return 0
}

# ============================================
# ARCHITECTURE QUALITY
# ============================================

# Find circular dependencies (simplified - looks for bidirectional imports)
# Returns: Potential circular dependency pairs
find_circular_dependencies() {
  local search_path=${1:-"src/"}

  # This is a simplified check - full implementation would need dependency graph analysis
  # For now, just report if we find A imports B and B imports A patterns
  find "$search_path" -name "*.ts" -not -name "*.test.ts" | while read -r file; do
    local imports=$(grep -o "from ['\"]\..*['\"]" "$file" 2>/dev/null || true)
    echo "$file: $imports"
  done
}

# Calculate cyclomatic complexity (simplified)
# Args: $1 = file path
# Returns: Approximate complexity score
calculate_complexity() {
  local file=$1

  if [ ! -f "$file" ]; then
    echo "0"
    return
  fi

  # Count decision points: if, while, for, case, catch, &&, ||, ?
  local complexity=$(grep -o "if\|while\|for\|case\|catch\|&&\||||\?" "$file" | wc -l)
  echo "$complexity"
}

# Find high-complexity files
# Args: $1 = threshold (default: 50)
# Returns: Files exceeding complexity threshold
find_complex_files() {
  local threshold=${1:-50}
  local search_path=${2:-"src/"}

  find "$search_path" tools/wvo_mcp/src/ -name "*.ts" \
    -not -name "*.test.ts" \
    -not -name "*.generated.ts" | while read -r file; do
    local complexity=$(calculate_complexity "$file")
    if [ "$complexity" -gt "$threshold" ]; then
      echo "$file (complexity: $complexity)"
    fi
  done
}

# ============================================
# MAINTAINABILITY METRICS
# ============================================

# Calculate maintainability index (simplified)
# Returns: Score 0-100 (higher is better)
calculate_maintainability_index() {
  local total_lines=$(find src/ tools/wvo_mcp/src/ -name "*.ts" -not -name "*.test.ts" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo "1")
  local todo_count=$(count_todos)
  local oversized_files=$(count_oversized_files)
  local magic_numbers=$(count_magic_numbers)

  # Simplified formula: 100 - (penalties)
  local todo_penalty=$((todo_count * 2))
  local size_penalty=$((oversized_files * 5))
  local magic_penalty=$((magic_numbers / 10))

  local score=$((100 - todo_penalty - size_penalty - magic_penalty))

  # Clamp to 0-100
  if [ "$score" -lt 0 ]; then
    echo "0"
  elif [ "$score" -gt 100 ]; then
    echo "100"
  else
    echo "$score"
  fi
}

# ============================================
# QUALITY REPORT GENERATION
# ============================================

# Generate comprehensive quality report
# Returns: JSON report
generate_quality_report() {
  cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "file_size": {
    "oversized_count": $(count_oversized_files),
    "stats": $(get_file_size_stats)
  },
  "todos": {
    "count": $(count_todos),
    "obfuscated_count": $(find_obfuscated_todos | wc -l)
  },
  "magic_numbers": {
    "count": $(count_magic_numbers)
  },
  "error_handling": {
    "async_functions": $(count_async_functions),
    "try_catch_blocks": $(count_try_catch),
    "coverage_pct": $(get_error_handling_coverage)
  },
  "test_coverage": {
    "pct": "$(get_test_coverage)"
  },
  "maintainability_index": $(calculate_maintainability_index)
}
EOF
}

# ============================================
# UTILITY FUNCTIONS
# ============================================

# Check if file should be excluded from checks
# Args: $1 = file path
# Returns: 0 if should exclude, 1 otherwise
should_exclude_file() {
  local file=$1

  # Check .qualityignore if exists
  if [ -f ".qualityignore" ]; then
    while IFS= read -r pattern; do
      # Skip comments and empty lines
      [[ "$pattern" =~ ^#.*$ || -z "$pattern" ]] && continue

      # Simple glob matching
      if [[ "$file" == $pattern ]]; then
        return 0
      fi
    done < ".qualityignore"
  fi

  # Default exclusions
  case "$file" in
    *.test.ts|*.spec.ts|*.generated.ts|*/node_modules/*|*/__tests__/*)
      return 0
      ;;
  esac

  return 1
}

# Get file type for threshold determination
# Args: $1 = file path
# Returns: "test" | "generated" | "production"
get_file_type() {
  local file=$1

  case "$file" in
    *.test.ts|*.spec.ts)
      echo "test"
      ;;
    *.generated.ts)
      echo "generated"
      ;;
    *)
      echo "production"
      ;;
  esac
}

# Get threshold for file type
# Args: $1 = metric name (file_size, complexity, etc.)
#       $2 = file type (test, generated, production)
# Returns: Threshold value
get_threshold() {
  local metric=$1
  local file_type=$2

  case "$metric:$file_type" in
    file_size:test)
      echo "800"  # Tests can be longer
      ;;
    file_size:production)
      echo "500"
      ;;
    complexity:test)
      echo "100"  # Tests can be more complex
      ;;
    complexity:production)
      echo "50"
      ;;
    *)
      echo "0"
      ;;
  esac
}
