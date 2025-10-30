#!/usr/bin/env bash
#
# Compare Claude vs Codex Eval Results
#
# Usage:
#   bash scripts/compare_agents.sh --mode {quick|full}
#
# Runs the same eval corpus against both Claude and Codex, then generates
# a comparison report showing which tasks each agent handles better.
#
# Requirements:
#   - ANTHROPIC_API_KEY environment variable
#   - OPENAI_API_KEY environment variable

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="full"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --mode {quick|full}  Eval mode (default: full)"
      echo "  --help               Show this help"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 2
      ;;
  esac
done

# Validate mode
if [[ "$MODE" != "quick" && "$MODE" != "full" ]]; then
  echo -e "${RED}Invalid mode: $MODE (must be 'quick' or 'full')${NC}"
  exit 2
fi

# Check API keys
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo -e "${RED}ANTHROPIC_API_KEY environment variable not set${NC}"
  exit 2
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo -e "${RED}OPENAI_API_KEY environment variable not set${NC}"
  exit 2
fi

# Workspace root
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WORKSPACE_ROOT"

# Results directory
RESULTS_DIR="$WORKSPACE_ROOT/tools/wvo_mcp/evals/results"
mkdir -p "$RESULTS_DIR/comparisons"

echo -e "${GREEN}===================================${NC}"
echo -e "${GREEN}  Claude vs Codex Comparison${NC}"
echo -e "${GREEN}===================================${NC}"
echo "Mode: $MODE"
echo "Workspace: $WORKSPACE_ROOT"
echo ""

# Run Claude evaluation
echo -e "${BLUE}=== Running Claude Evaluation ===${NC}"
bash "$WORKSPACE_ROOT/tools/wvo_mcp/scripts/run_prompt_evals.sh" --mode "$MODE" --agent claude

# Get Claude results file
CLAUDE_RESULTS=$(ls -t "$RESULTS_DIR/runs"/*.json | head -1)
echo -e "${GREEN}Claude results: $CLAUDE_RESULTS${NC}"
echo ""

# Run Codex evaluation
echo -e "${BLUE}=== Running Codex Evaluation ===${NC}"
bash "$WORKSPACE_ROOT/tools/wvo_mcp/scripts/run_prompt_evals.sh" --mode "$MODE" --agent codex

# Get Codex results file
CODEX_RESULTS=$(ls -t "$RESULTS_DIR/runs"/*.json | head -1)
echo -e "${GREEN}Codex results: $CODEX_RESULTS${NC}"
echo ""

# Create comparison script
COMPARISON_SCRIPT=$(cat <<'EOF'
import { compareAgents, type EvalResults } from './src/evals/multi_model_runner';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const claudePath = process.argv[2];
  const codexPath = process.argv[3];
  const outputPath = process.argv[4];

  // Load results
  const claudeResults = JSON.parse(fs.readFileSync(claudePath, 'utf-8')) as EvalResults;
  const codexResults = JSON.parse(fs.readFileSync(codexPath, 'utf-8')) as EvalResults;

  // Compare
  const comparison = compareAgents(claudeResults, codexResults);

  // Create report
  const report = {
    timestamp: new Date().toISOString(),
    mode: claudeResults.mode,
    claude: {
      model: claudeResults.model,
      success_rate: claudeResults.success_rate,
      passed: claudeResults.passed,
      failed: claudeResults.failed,
      p95_latency_ms: claudeResults.p95_latency_ms,
      cost_usd: claudeResults.cost_usd
    },
    codex: {
      model: codexResults.model,
      success_rate: codexResults.success_rate,
      passed: codexResults.passed,
      failed: codexResults.failed,
      p95_latency_ms: codexResults.p95_latency_ms,
      cost_usd: codexResults.cost_usd
    },
    comparison: {
      claude_success_rate: comparison.claude_success_rate,
      codex_success_rate: comparison.codex_success_rate,
      diff_percentage: comparison.diff_percentage,
      tasks_claude_better: comparison.tasks_claude_better,
      tasks_codex_better: comparison.tasks_codex_better,
      tasks_both_pass: comparison.tasks_both_pass,
      tasks_both_fail: comparison.tasks_both_fail
    }
  };

  // Save report
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n=== COMPARISON SUMMARY ===');
  console.log(`Claude Success Rate: ${comparison.claude_success_rate.toFixed(1)}%`);
  console.log(`Codex Success Rate: ${comparison.codex_success_rate.toFixed(1)}%`);
  console.log(`Difference: ${comparison.diff_percentage > 0 ? '+' : ''}${comparison.diff_percentage.toFixed(1)}%`);
  console.log('');
  console.log(`Both pass: ${comparison.tasks_both_pass.length} tasks`);
  console.log(`Both fail: ${comparison.tasks_both_fail.length} tasks`);
  console.log(`Claude better: ${comparison.tasks_claude_better.length} tasks`);
  console.log(`Codex better: ${comparison.tasks_codex_better.length} tasks`);
  console.log('');

  if (comparison.tasks_claude_better.length > 0) {
    console.log('Tasks Claude handles better:');
    comparison.tasks_claude_better.forEach(id => console.log(`  - ${id}`));
    console.log('');
  }

  if (comparison.tasks_codex_better.length > 0) {
    console.log('Tasks Codex handles better:');
    comparison.tasks_codex_better.forEach(id => console.log(`  - ${id}`));
    console.log('');
  }

  console.log(`\nComparison report saved: ${outputPath}`);
}

main();
EOF
)

# Write comparison script to temp file
TEMP_COMPARISON="/tmp/compare_agents_$$.mjs"
echo "$COMPARISON_SCRIPT" > "$TEMP_COMPARISON"

# Generate comparison report
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
COMPARISON_OUTPUT="$RESULTS_DIR/comparisons/claude-vs-codex-${TIMESTAMP}.json"

echo -e "${BLUE}=== Generating Comparison Report ===${NC}"
npx tsx "$TEMP_COMPARISON" "$CLAUDE_RESULTS" "$CODEX_RESULTS" "$COMPARISON_OUTPUT"

# Cleanup
rm -f "$TEMP_COMPARISON"

echo -e "${GREEN}Comparison complete!${NC}"
exit 0
