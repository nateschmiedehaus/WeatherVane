#!/usr/bin/env bash
# Reasoning Checks Library
# Reusable functions for validating thinking, assumptions, and work process compliance
# Usage: source scripts/lib/reasoning_checks.sh

# ============================================
# ASSUMPTIONS VALIDATION
# ============================================

# Check if assumptions register exists for task
# Args: $1 = task_id
# Returns: 0 if exists, 1 otherwise
assumptions_register_exists() {
  local task_id=$1
  local assumptions_file="state/evidence/$task_id/think/assumptions.md"

  [ -f "$assumptions_file" ]
}

# Get assumptions register path
# Args: $1 = task_id
# Returns: Path to assumptions register
get_assumptions_register() {
  local task_id=$1
  echo "state/evidence/$task_id/think/assumptions.md"
}

# Count documented assumptions (ASM-001, ASM-002, etc.)
# Args: $1 = task_id
# Returns: Count of assumptions
count_assumptions() {
  local task_id=$1
  local assumptions_file=$(get_assumptions_register "$task_id")

  if [ ! -f "$assumptions_file" ]; then
    echo "0"
    return
  fi

  grep -c "ASM-[0-9]" "$assumptions_file" || echo "0"
}

# Check assumptions register substantiveness
# Args: $1 = task_id
#       $2 = min_lines (default: 20)
# Returns: 0 if substantial, 1 otherwise
check_assumptions_substantive() {
  local task_id=$1
  local min_lines=${2:-20}
  local assumptions_file=$(get_assumptions_register "$task_id")

  if [ ! -f "$assumptions_file" ]; then
    return 1
  fi

  local line_count=$(wc -l < "$assumptions_file")
  [ "$line_count" -gt "$min_lines" ]
}

# Find undocumented assumptions in code
# Args: $1 = search_path (default: src/)
# Returns: Lines with assumption keywords
find_undocumented_assumptions() {
  local search_path=${1:-"src/"}

  # Keywords that often indicate undocumented assumptions
  local keywords="we assume|users will|this should|will always|will never|expected to|relies on|depends on|assumes that"

  grep -ri "$keywords" "$search_path" tools/wvo_mcp/src/ \
    --include="*.ts" \
    --exclude="*.test.ts" \
    --exclude="*.spec.ts" 2>/dev/null || true
}

# Count undocumented assumptions
count_undocumented_assumptions() {
  find_undocumented_assumptions | wc -l
}

# Validate assumption structure
# Args: $1 = task_id
# Returns: JSON with validation results
validate_assumption_structure() {
  local task_id=$1
  local assumptions_file=$(get_assumptions_register "$task_id")

  if [ ! -f "$assumptions_file" ]; then
    echo '{"valid":false,"reason":"assumptions_register_not_found"}'
    return
  fi

  local has_ids=$(grep -q "ASM-[0-9]" "$assumptions_file" && echo "true" || echo "false")
  local has_risk=$(grep -q "Risk if Wrong" "$assumptions_file" && echo "true" || echo "false")
  local has_validation=$(grep -q "Validation" "$assumptions_file" && echo "true" || echo "false")
  local has_mitigation=$(grep -q "Mitigation" "$assumptions_file" && echo "true" || echo "false")

  cat <<EOF
{
  "valid": $([ "$has_ids" = "true" ] && [ "$has_risk" = "true" ] && echo "true" || echo "false"),
  "has_ids": $has_ids,
  "has_risk_section": $has_risk,
  "has_validation_plan": $has_validation,
  "has_mitigation": $has_mitigation
}
EOF
}

# ============================================
# WORK PROCESS COMPLIANCE
# ============================================

# Check if evidence directory exists
# Args: $1 = task_id
# Returns: 0 if exists, 1 otherwise
evidence_directory_exists() {
  local task_id=$1
  [ -d "state/evidence/$task_id" ]
}

# Get required phases
# Returns: Array of phase names
get_required_phases() {
  echo "strategize spec plan think implement verify review pr monitor"
}

# Check if phase directory exists
# Args: $1 = task_id
#       $2 = phase_name
# Returns: 0 if exists, 1 otherwise
phase_exists() {
  local task_id=$1
  local phase=$2

  [ -d "state/evidence/$task_id/$phase" ]
}

# Get missing phases
# Args: $1 = task_id
# Returns: Space-separated list of missing phases
get_missing_phases() {
  local task_id=$1
  local missing=()

  for phase in $(get_required_phases); do
    if ! phase_exists "$task_id" "$phase"; then
      missing+=("$phase")
    fi
  done

  echo "${missing[@]}"
}

# Check phase evidence quality
# Args: $1 = task_id
#       $2 = phase_name
#       $3 = min_lines (default: 50)
# Returns: 0 if quality acceptable, 1 otherwise
check_phase_quality() {
  local task_id=$1
  local phase=$2
  local min_lines=${3:-50}

  if ! phase_exists "$task_id" "$phase"; then
    return 1
  fi

  local phase_dir="state/evidence/$task_id/$phase"
  local total_lines=$(find "$phase_dir" -type f -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo "0")

  [ "$total_lines" -ge "$min_lines" ]
}

# Count phases with insufficient evidence
# Args: $1 = task_id
# Returns: Count of low-quality phases
count_low_quality_phases() {
  local task_id=$1
  local count=0

  for phase in $(get_required_phases); do
    if ! check_phase_quality "$task_id" "$phase"; then
      count=$((count + 1))
    fi
  done

  echo "$count"
}

# ============================================
# ADVERSARIAL REVIEW VALIDATION
# ============================================

# Get adversarial review path
# Args: $1 = task_id
# Returns: Path to adversarial review
get_adversarial_review() {
  local task_id=$1
  echo "state/evidence/$task_id/review/adversarial_review.md"
}

# Check if adversarial review exists
# Args: $1 = task_id
# Returns: 0 if exists, 1 otherwise
adversarial_review_exists() {
  local task_id=$1
  local review_file=$(get_adversarial_review "$task_id")

  [ -f "$review_file" ]
}

# Count questions in adversarial review
# Args: $1 = task_id
# Returns: Question count
count_adversarial_questions() {
  local task_id=$1
  local review_file=$(get_adversarial_review "$task_id")

  if [ ! -f "$review_file" ]; then
    echo "0"
    return
  fi

  # Count markdown headers that end with "?"
  grep -c "^###.*?" "$review_file" || echo "0"
}

# Check if adversarial review has gaps section
# Args: $1 = task_id
# Returns: 0 if has gaps section, 1 otherwise
check_adversarial_gaps() {
  local task_id=$1
  local review_file=$(get_adversarial_review "$task_id")

  if [ ! -f "$review_file" ]; then
    return 1
  fi

  grep -q "## Gaps\|## Issues\|## Concerns" "$review_file"
}

# Validate adversarial review quality
# Args: $1 = task_id
# Returns: JSON with validation results
validate_adversarial_review() {
  local task_id=$1
  local review_file=$(get_adversarial_review "$task_id")

  if [ ! -f "$review_file" ]; then
    echo '{"valid":false,"reason":"review_not_found","question_count":0}'
    return
  fi

  local question_count=$(count_adversarial_questions "$task_id")
  local has_gaps=$(check_adversarial_gaps "$task_id" && echo "true" || echo "false")
  local is_valid=$([ "$question_count" -ge 10 ] && [ "$has_gaps" = "true" ] && echo "true" || echo "false")

  cat <<EOF
{
  "valid": $is_valid,
  "question_count": $question_count,
  "min_questions": 10,
  "has_gaps_section": $has_gaps
}
EOF
}

# ============================================
# PRE-MORTEM VALIDATION
# ============================================

# Get pre-mortem path
# Args: $1 = task_id
# Returns: Path to pre-mortem
get_pre_mortem() {
  local task_id=$1
  echo "state/evidence/$task_id/think/pre_mortem.md"
}

# Check if pre-mortem exists
# Args: $1 = task_id
# Returns: 0 if exists, 1 otherwise
pre_mortem_exists() {
  local task_id=$1
  local pre_mortem_file=$(get_pre_mortem "$task_id")

  [ -f "$pre_mortem_file" ]
}

# Count failure scenarios in pre-mortem
# Args: $1 = task_id
# Returns: Scenario count
count_failure_scenarios() {
  local task_id=$1
  local pre_mortem_file=$(get_pre_mortem "$task_id")

  if [ ! -f "$pre_mortem_file" ]; then
    echo "0"
    return
  fi

  grep -c "## Failure Scenario\|### Failure Scenario" "$pre_mortem_file" || echo "0"
}

# Check if pre-mortem has mitigations
# Args: $1 = task_id
# Returns: 0 if has mitigations, 1 otherwise
check_pre_mortem_mitigations() {
  local task_id=$1
  local pre_mortem_file=$(get_pre_mortem "$task_id")

  if [ ! -f "$pre_mortem_file" ]; then
    return 1
  fi

  grep -q "### Prevention\|### Mitigation" "$pre_mortem_file"
}

# Get task complexity from roadmap
# Args: $1 = task_id
# Returns: Complexity score (0-10)
get_task_complexity() {
  local task_id=$1

  if [ -f "state/roadmap.yaml" ] && command -v yq &> /dev/null; then
    yq ".tasks[] | select(.id == \"$task_id\") | .complexity_score" state/roadmap.yaml 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

# Check if pre-mortem is required
# Args: $1 = task_id
# Returns: 0 if required, 1 if not
is_pre_mortem_required() {
  local task_id=$1
  local complexity=$(get_task_complexity "$task_id")

  [ "$complexity" -ge 8 ]
}

# Validate pre-mortem
# Args: $1 = task_id
# Returns: JSON with validation results
validate_pre_mortem() {
  local task_id=$1
  local complexity=$(get_task_complexity "$task_id")
  local required=$(is_pre_mortem_required "$task_id" && echo "true" || echo "false")

  if [ "$required" = "false" ]; then
    echo '{"valid":true,"required":false,"reason":"complexity_below_threshold"}'
    return
  fi

  local exists=$(pre_mortem_exists "$task_id" && echo "true" || echo "false")

  if [ "$exists" = "false" ]; then
    echo "{\"valid\":false,\"required\":true,\"reason\":\"pre_mortem_not_found\",\"complexity\":$complexity}"
    return
  fi

  local scenario_count=$(count_failure_scenarios "$task_id")
  local has_mitigations=$(check_pre_mortem_mitigations "$task_id" && echo "true" || echo "false")
  local is_valid=$([ "$scenario_count" -ge 5 ] && [ "$has_mitigations" = "true" ] && echo "true" || echo "false")

  cat <<EOF
{
  "valid": $is_valid,
  "required": true,
  "complexity": $complexity,
  "scenario_count": $scenario_count,
  "min_scenarios": 5,
  "has_mitigations": $has_mitigations
}
EOF
}

# ============================================
# DECISION DOCUMENTATION
# ============================================

# Get strategy file path
# Args: $1 = task_id
# Returns: Path to strategy file
get_strategy_file() {
  local task_id=$1
  echo "state/evidence/$task_id/strategize/strategy.md"
}

# Check if alternatives are documented
# Args: $1 = task_id
# Returns: 0 if alternatives documented, 1 otherwise
check_alternatives_documented() {
  local task_id=$1
  local strategy_file=$(get_strategy_file "$task_id")

  if [ ! -f "$strategy_file" ]; then
    return 1
  fi

  grep -q "## Alternatives\|Alternative [0-9]" "$strategy_file"
}

# Check if trade-offs are documented
# Args: $1 = task_id
# Returns: 0 if trade-offs documented, 1 otherwise
check_tradeoffs_documented() {
  local task_id=$1
  local strategy_file=$(get_strategy_file "$task_id")

  if [ ! -f "$strategy_file" ]; then
    return 1
  fi

  grep -qi "trade.?off\|pros.*cons\|advantage.*disadvantage" "$strategy_file"
}

# Validate decision documentation
# Args: $1 = task_id
# Returns: JSON with validation results
validate_decision_documentation() {
  local task_id=$1
  local strategy_file=$(get_strategy_file "$task_id")

  if [ ! -f "$strategy_file" ]; then
    echo '{"valid":false,"reason":"strategy_file_not_found"}'
    return
  fi

  local has_alternatives=$(check_alternatives_documented "$task_id" && echo "true" || echo "false")
  local has_tradeoffs=$(check_tradeoffs_documented "$task_id" && echo "true" || echo "false")
  local is_valid=$([ "$has_alternatives" = "true" ] && [ "$has_tradeoffs" = "true" ] && echo "true" || echo "false")

  cat <<EOF
{
  "valid": $is_valid,
  "has_alternatives": $has_alternatives,
  "has_tradeoffs": $has_tradeoffs
}
EOF
}

# ============================================
# EVIDENCE QUALITY SCORING
# ============================================

# Calculate word count for evidence file
# Args: $1 = file_path
# Returns: Word count
get_word_count() {
  local file=$1

  if [ ! -f "$file" ]; then
    echo "0"
    return
  fi

  wc -w < "$file"
}

# Calculate vocabulary diversity (unique words / total words)
# Args: $1 = file_path
# Returns: Diversity score (0.0-1.0)
calculate_vocabulary_diversity() {
  local file=$1

  if [ ! -f "$file" ]; then
    echo "0.0"
    return
  fi

  local total_words=$(wc -w < "$file")
  local unique_words=$(tr '[:space:]' '\n' < "$file" | tr '[:upper:]' '[:lower:]' | sort -u | wc -l)

  if [ "$total_words" -eq 0 ]; then
    echo "0.0"
    return
  fi

  # Calculate diversity (use bc if available)
  if command -v bc &> /dev/null; then
    echo "scale=2; $unique_words / $total_words" | bc
  else
    # Fallback: integer division with 2 decimal places
    echo $((unique_words * 100 / total_words))
  fi
}

# Check for templated content (common boilerplate phrases)
# Args: $1 = file_path
# Returns: 0 if likely templated, 1 if original
detect_templated_content() {
  local file=$1

  if [ ! -f "$file" ]; then
    return 1
  fi

  # Common template phrases
  local template_patterns=(
    "TODO: Fill in"
    "To be determined"
    "TBD"
    "Lorem ipsum"
    "Example text"
    "Placeholder"
    "FIXME"
  )

  for pattern in "${template_patterns[@]}"; do
    if grep -qi "$pattern" "$file"; then
      return 0
    fi
  done

  return 1
}

# Score evidence quality
# Args: $1 = file_path
# Returns: JSON with quality metrics
score_evidence_quality() {
  local file=$1

  if [ ! -f "$file" ]; then
    echo '{"score":0,"reason":"file_not_found"}'
    return
  fi

  local word_count=$(get_word_count "$file")
  local diversity=$(calculate_vocabulary_diversity "$file")
  local is_templated=$(detect_templated_content "$file" && echo "true" || echo "false")

  # Scoring criteria:
  # - Word count ≥500: +0.4
  # - Diversity ≥0.3: +0.3
  # - Not templated: +0.3
  local score=0

  if [ "$word_count" -ge 500 ]; then
    score=$((score + 40))
  fi

  # Diversity check (simplified)
  if command -v bc &> /dev/null; then
    local diversity_check=$(echo "$diversity >= 0.3" | bc -l)
    if [ "$diversity_check" = "1" ]; then
      score=$((score + 30))
    fi
  fi

  if [ "$is_templated" = "false" ]; then
    score=$((score + 30))
  fi

  cat <<EOF
{
  "score": $(echo "scale=2; $score / 100" | bc 2>/dev/null || echo "0"),
  "word_count": $word_count,
  "vocabulary_diversity": $diversity,
  "is_templated": $is_templated,
  "threshold": 0.8
}
EOF
}

# ============================================
# COMPREHENSIVE REASONING REPORT
# ============================================

# Generate reasoning validation report
# Args: $1 = task_id
# Returns: JSON report
generate_reasoning_report() {
  local task_id=$1

  cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "task_id": "$task_id",
  "assumptions": $(validate_assumption_structure "$task_id"),
  "work_process": {
    "evidence_exists": $(evidence_directory_exists "$task_id" && echo "true" || echo "false"),
    "missing_phases": "$(get_missing_phases "$task_id")",
    "low_quality_phases": $(count_low_quality_phases "$task_id")
  },
  "adversarial_review": $(validate_adversarial_review "$task_id"),
  "pre_mortem": $(validate_pre_mortem "$task_id"),
  "decisions": $(validate_decision_documentation "$task_id")
}
EOF
}

# ============================================
# UTILITY FUNCTIONS
# ============================================

# Check if task is in roadmap
# Args: $1 = task_id
# Returns: 0 if exists, 1 otherwise
task_exists_in_roadmap() {
  local task_id=$1

  if [ ! -f "state/roadmap.yaml" ]; then
    return 1
  fi

  if command -v yq &> /dev/null; then
    yq ".tasks[] | select(.id == \"$task_id\")" state/roadmap.yaml &>/dev/null
  else
    grep -q "id: $task_id" state/roadmap.yaml
  fi
}

# Get task status from roadmap
# Args: $1 = task_id
# Returns: Task status
get_task_status() {
  local task_id=$1

  if [ -f "state/roadmap.yaml" ] && command -v yq &> /dev/null; then
    yq ".tasks[] | select(.id == \"$task_id\") | .status" state/roadmap.yaml 2>/dev/null || echo "unknown"
  else
    echo "unknown"
  fi
}

# Validate task is ready for reasoning checks
# Args: $1 = task_id
# Returns: 0 if ready, 1 otherwise
is_task_ready_for_reasoning_checks() {
  local task_id=$1

  # Task must exist in roadmap
  if ! task_exists_in_roadmap "$task_id"; then
    return 1
  fi

  # Task must have evidence directory
  if ! evidence_directory_exists "$task_id"; then
    return 1
  fi

  return 0
}
