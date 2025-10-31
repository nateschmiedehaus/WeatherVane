#!/usr/bin/env bash
#
# Run Integrated Prompt Evaluations (IMP-21..26 Integration)
#
# Tests prompts compiled with PromptCompiler, personas, and domain overlays.
#
# Usage:
#   bash scripts/run_integrated_evals.sh --mode {quick|full} [OPTIONS]
#
# Options:
#   --mode {quick|full}       Quick (5 tasks) or full (29 tasks) [REQUIRED]
#   --model {sonnet|haiku}    Model to use (default: sonnet)
#   --test-variants           Test baseline + personas + overlays (default: false)
#   --personas "P1,P2,P3"     Comma-separated persona descriptions
#   --overlays "O1,O2,O3"     Comma-separated domain overlays
#   --output FILE             Save results to file (default: stdout)
#   --help                    Show this help
#
# Examples:
#   # Baseline only (no variants)
#   bash scripts/run_integrated_evals.sh --mode quick
#
#   # Test with domain overlays
#   bash scripts/run_integrated_evals.sh --mode full --test-variants --overlays "orchestrator,api,security"
#
#   # Test with personas
#   bash scripts/run_integrated_evals.sh --mode full --test-variants --personas "planner focused,implementer focused"
#
#   # Full comparison (baseline + personas + overlays)
#   bash scripts/run_integrated_evals.sh --mode full --test-variants \
#     --personas "planner focused,implementer focused" \
#     --overlays "orchestrator,api,security" \
#     --output results/integrated_eval_results.json

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Defaults
MODE=""
MODEL="sonnet"
TEST_VARIANTS="false"
PERSONAS=""
OVERLAYS=""
OUTPUT_FILE=""

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
    --test-variants)
      TEST_VARIANTS="true"
      shift
      ;;
    --personas)
      PERSONAS="$2"
      shift 2
      ;;
    --overlays)
      OVERLAYS="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --help)
      head -n 30 "$0" | tail -n +3 | sed 's/^# //'
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate required args
if [[ -z "$MODE" ]]; then
  echo -e "${RED}Error: --mode required (quick|full)${NC}"
  exit 1
fi

if [[ "$MODE" != "quick" && "$MODE" != "full" ]]; then
  echo -e "${RED}Error: --mode must be 'quick' or 'full'${NC}"
  exit 1
fi

# Check API key
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo -e "${RED}Error: ANTHROPIC_API_KEY environment variable required${NC}"
  exit 1
fi

# Navigate to workspace root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$WORKSPACE_ROOT"

echo -e "${GREEN}=== Integrated Prompt Evaluations (IMP-21..26) ===${NC}"
echo ""
echo "Mode: $MODE"
echo "Model: $MODEL"
echo "Test Variants: $TEST_VARIANTS"
[[ -n "$PERSONAS" ]] && echo "Personas: $PERSONAS"
[[ -n "$OVERLAYS" ]] && echo "Overlays: $OVERLAYS"
echo ""

# Build TypeScript runner if needed
if [[ ! -f "tools/wvo_mcp/dist/src/evals/compiler_integrated_runner.js" ]]; then
  echo -e "${YELLOW}Building TypeScript runner...${NC}"
  cd tools/wvo_mcp
  npm run build
  cd "$WORKSPACE_ROOT"
fi

# Create CLI wrapper script
CLI_SCRIPT=$(cat <<EOF
import { runIntegratedEvals } from './dist/src/evals/compiler_integrated_runner.js';

const options = {
  mode: '$MODE',
  model: '$MODEL',
  testVariants: $TEST_VARIANTS,
  personas: ${PERSONAS:+["${PERSONAS//,/\",\"}"]}${PERSONAS:-[]},
  overlays: ${OVERLAYS:+["${OVERLAYS//,/\",\"}"]}${OVERLAYS:-[]},
  workspaceRoot: process.cwd()
};

console.error('[IntegratedEvals] Starting evaluation...');
runIntegratedEvals(options)
  .then(results => {
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('[IntegratedEvals] ERROR:', error.message);
    process.exit(1);
  });
EOF
)

# Run evaluation
echo -e "${YELLOW}Running integrated evaluations...${NC}"
echo ""

if [[ -n "$OUTPUT_FILE" ]]; then
  # Save to file
  echo "$CLI_SCRIPT" | node --input-type=module - > "$OUTPUT_FILE"
  echo -e "${GREEN}Results saved to: $OUTPUT_FILE${NC}"

  # Show summary
  echo ""
  echo "=== Summary ==="
  jq -r '.variant_results[] | "\(.variant_id): \(.success_rate * 100 | floor)% success (\(.improvement_over_baseline | floor)pp vs baseline)"' "$OUTPUT_FILE"
  echo ""
  jq -r '"Best variant: \(.best_variant.variant_id) (\(.best_variant.success_rate * 100 | floor)%)"' "$OUTPUT_FILE"
else
  # Output to stdout
  echo "$CLI_SCRIPT" | node --input-type=module -
fi

echo ""
echo -e "${GREEN}Integrated evaluation complete!${NC}"
