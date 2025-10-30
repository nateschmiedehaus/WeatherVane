#!/usr/bin/env bash
#
# Prompt Evaluation Runner Script
#
# Usage:
#   bash scripts/run_prompt_evals.sh --mode quick              # Quick mode (5 tasks, ~2 min)
#   bash scripts/run_prompt_evals.sh --mode full               # Full mode (29 tasks, ~10 min)
#   bash scripts/run_prompt_evals.sh --mode full --agent codex # Test with Codex (OpenAI)
#   bash scripts/run_prompt_evals.sh --mode full --baseline    # Capture baseline
#   bash scripts/run_prompt_evals.sh --mode full --compare results/baseline/prompt_eval_baseline.json
#   bash scripts/run_prompt_evals.sh --mode full --filter STRATEGIZE-001  # Test single task
#   bash scripts/run_prompt_evals.sh --mode full --model haiku # Use Haiku instead of Sonnet
#
# Exit codes:
#   0: All tests passed (or success rate >= baseline - 5%)
#   1: Tests failed (or success rate < baseline - 5%)
#   2: Error (invalid args, missing dependencies, etc.)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
MODE="full"
MODEL="sonnet"
AGENT="claude"
BASELINE=false
COMPARE=""
FILTER=""
RUNS=1

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --agent)
      AGENT="$2"
      shift 2
      ;;
    --baseline)
      BASELINE=true
      shift
      ;;
    --compare)
      COMPARE="$2"
      shift 2
      ;;
    --filter)
      FILTER="$2"
      shift 2
      ;;
    --runs)
      RUNS="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --mode {quick|full}           Eval mode (default: full)"
      echo "  --agent {claude|codex|gpt4}   Agent to test (default: claude)"
      echo "  --model {sonnet|haiku|gpt-4}  Model to use (default: sonnet)"
      echo "  --baseline                    Capture baseline (requires --runs N)"
      echo "  --compare <path>              Compare against baseline file"
      echo "  --filter <task_id>            Run only specific task"
      echo "  --runs <N>                    Number of runs for baseline capture (default: 1)"
      echo "  --help                        Show this help"
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

# Validate agent
if [[ "$AGENT" != "claude" && "$AGENT" != "codex" && "$AGENT" != "gpt4" ]]; then
  echo -e "${RED}Invalid agent: $AGENT (must be 'claude', 'codex', or 'gpt4')${NC}"
  exit 2
fi

# Check API keys based on agent
if [[ "$AGENT" == "claude" ]]; then
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo -e "${RED}ANTHROPIC_API_KEY environment variable not set (required for Claude)${NC}"
    exit 2
  fi
else
  # codex or gpt4 use OpenAI
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo -e "${RED}OPENAI_API_KEY environment variable not set (required for Codex/GPT-4)${NC}"
    exit 2
  fi
fi

# Workspace root
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WORKSPACE_ROOT"

# Results directory
RESULTS_DIR="$WORKSPACE_ROOT/tools/wvo_mcp/evals/results"
mkdir -p "$RESULTS_DIR/runs"
mkdir -p "$RESULTS_DIR/baseline"

echo -e "${GREEN}Running Prompt Evaluations${NC}"
echo "Mode: $MODE"
echo "Agent: $AGENT"
echo "Model: $MODEL"
echo "Workspace: $WORKSPACE_ROOT"
echo ""

# Create CLI runner script
RUNNER_SCRIPT=$(cat <<'EOF'
import { runEvals, type EvalResults } from './src/evals/multi_model_runner';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] as 'quick' | 'full';
  const agent = args[1] as 'claude' | 'codex' | 'gpt4';
  const model = args[2] || undefined;
  const filter = args[3] || undefined;
  const workspaceRoot = args[4];

  try {
    const results = await runEvals({ mode, agent, model, filter }, workspaceRoot);

    // Write results
    const resultsPath = path.join(
      workspaceRoot,
      'tools/wvo_mcp/evals/results/runs',
      `${results.run_id}.json`
    );
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    console.log('\n=== RESULTS ===');
    console.log(`Run ID: ${results.run_id}`);
    console.log(`Success Rate: ${results.success_rate.toFixed(1)}%`);
    console.log(`Passed: ${results.passed}/${results.total_tasks}`);
    console.log(`Failed: ${results.failed}/${results.total_tasks}`);
    console.log(`P95 Latency: ${results.p95_latency_ms}ms`);
    console.log(`Total Tokens: ${results.total_tokens}`);
    console.log(`Cost: $${results.cost_usd.toFixed(2)}`);
    console.log(`\nResults saved: ${resultsPath}`);

    if (results.failed > 0) {
      console.log('\n=== FAILED TASKS ===');
      results.failed_tasks.forEach(t => {
        console.log(`❌ ${t.id} (${t.phase}): ${t.criteria_met}/${t.criteria_required} criteria met`);
        t.missing.forEach(m => console.log(`   - Missing: ${m}`));
      });
    }

    // Exit code: 0 if all passed, 1 if any failed
    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error running evals:', error);
    process.exit(2);
  }
}

main();
EOF
)

# Write runner script to temp file
TEMP_RUNNER="/tmp/run_evals_$$.mjs"
echo "$RUNNER_SCRIPT" > "$TEMP_RUNNER"

# Run evaluations
if [[ "$BASELINE" == "true" ]]; then
  echo -e "${YELLOW}Capturing baseline (${RUNS} runs)...${NC}"

  # Run N times
  SUCCESS_RATES=()
  for ((i=1; i<=$RUNS; i++)); do
    echo "Run $i/$RUNS..."

    if npx tsx "$TEMP_RUNNER" "$MODE" "$AGENT" "$MODEL" "$FILTER" "$WORKSPACE_ROOT"; then
      # Extract success rate from latest run
      LATEST_RUN=$(ls -t "$RESULTS_DIR/runs"/*.json | head -1)
      SUCCESS_RATE=$(jq '.success_rate' "$LATEST_RUN")
      SUCCESS_RATES+=("$SUCCESS_RATE")
      echo "  Success rate: ${SUCCESS_RATE}%"
    else
      echo -e "${RED}Run $i failed${NC}"
    fi
  done

  # Calculate mean and confidence interval
  if [[ ${#SUCCESS_RATES[@]} -gt 0 ]]; then
    MEAN=$(echo "${SUCCESS_RATES[@]}" | tr ' ' '\n' | awk '{sum+=$1} END {print sum/NR}')

    # Save baseline
    BASELINE_PATH="$RESULTS_DIR/baseline/prompt_eval_baseline.json"
    LATEST_RUN=$(ls -t "$RESULTS_DIR/runs"/*.json | head -1)
    cp "$LATEST_RUN" "$BASELINE_PATH"

    # Add baseline metadata
    jq --arg mean "$MEAN" --arg runs "$RUNS" \
      '. + {baseline_mean: ($mean | tonumber), baseline_runs: ($runs | tonumber)}' \
      "$BASELINE_PATH" > "$BASELINE_PATH.tmp" && mv "$BASELINE_PATH.tmp" "$BASELINE_PATH"

    echo -e "${GREEN}Baseline captured: ${BASELINE_PATH}${NC}"
    echo "Mean success rate: ${MEAN}% (n=${RUNS})"
  fi

elif [[ -n "$COMPARE" ]]; then
  echo -e "${YELLOW}Comparing against baseline: $COMPARE${NC}"

  # Run evaluation
  if npx tsx "$TEMP_RUNNER" "$MODE" "$AGENT" "$MODEL" "$FILTER" "$WORKSPACE_ROOT"; then
    LATEST_RUN=$(ls -t "$RESULTS_DIR/runs"/*.json | head -1)

    # Compare
    BASELINE_SUCCESS=$(jq '.success_rate' "$COMPARE")
    CURRENT_SUCCESS=$(jq '.success_rate' "$LATEST_RUN")
    DIFF=$(echo "$CURRENT_SUCCESS - $BASELINE_SUCCESS" | bc)

    echo ""
    echo "=== COMPARISON ==="
    echo "Baseline: ${BASELINE_SUCCESS}%"
    echo "Current: ${CURRENT_SUCCESS}%"
    echo "Difference: ${DIFF}%"

    # Threshold: allow up to 5% degradation
    if (( $(echo "$DIFF >= -5" | bc -l) )); then
      echo -e "${GREEN}✅ PASS: Within threshold (>= -5%)${NC}"
      rm -f "$TEMP_RUNNER"
      exit 0
    else
      echo -e "${RED}❌ FAIL: Degradation exceeds threshold (<5%)${NC}"
      rm -f "$TEMP_RUNNER"
      exit 1
    fi
  else
    echo -e "${RED}Evaluation failed${NC}"
    rm -f "$TEMP_RUNNER"
    exit 1
  fi

else
  # Normal run
  if npx tsx "$TEMP_RUNNER" "$MODE" "$AGENT" "$MODEL" "$FILTER" "$WORKSPACE_ROOT"; then
    echo -e "${GREEN}✅ All evaluations passed${NC}"
    rm -f "$TEMP_RUNNER"
    exit 0
  else
    echo -e "${RED}❌ Some evaluations failed${NC}"
    rm -f "$TEMP_RUNNER"
    exit 1
  fi
fi

# Cleanup
rm -f "$TEMP_RUNNER"
