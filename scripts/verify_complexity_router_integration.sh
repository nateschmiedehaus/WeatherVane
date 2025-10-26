#!/usr/bin/env bash
#
# Programmatic Integration Verification: ComplexityRouter
#
# This script verifies that ComplexityRouter is properly integrated end-to-end.
# It checks that:
# 1. ComplexityRouter is called by StateGraph
# 2. Model selection is passed from StateGraph -> Runners -> Agents
# 3. Agents accept and use the modelSelection parameter
# 4. Integration tests exist and verify the flow
#
# Exit 0 on success, 1 on failure.
# Low-token, simple, naturally evolving.

set -e

WORKSPACE_ROOT="/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane"
cd "$WORKSPACE_ROOT/tools/wvo_mcp" || exit 1

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ComplexityRouter Integration Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILURES=0

# Check 1: ComplexityRouter is called in StateGraph
echo -n "1. ComplexityRouter.assessComplexity() called in StateGraph... "
if grep -q "complexityRouter\.assessComplexity" src/orchestrator/state_graph.ts; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo "   Missing: StateGraph should call complexityRouter.assessComplexity()"
  FAILURES=$((FAILURES + 1))
fi

# Check 2: StateGraph selects model for each state
echo -n "2. StateGraph.selectModelForState() exists... "
if grep -q "selectModelForState" src/orchestrator/state_graph.ts; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo "   Missing: StateGraph should have selectModelForState() method"
  FAILURES=$((FAILURES + 1))
fi

# Check 3: Runners receive modelSelection from context
echo -n "3. State runners pass modelSelection to agents... "
RUNNER_FILES=(
  "src/orchestrator/state_runners/plan_runner.ts"
  "src/orchestrator/state_runners/thinker_runner.ts"
  "src/orchestrator/state_runners/implement_runner.ts"
  "src/orchestrator/state_runners/review_runner.ts"
)
RUNNER_PASS=true
for runner in "${RUNNER_FILES[@]}"; do
  if ! grep -q "modelSelection" "$runner"; then
    echo -e "${RED}✗${NC}"
    echo "   Missing in: $runner"
    RUNNER_PASS=false
    FAILURES=$((FAILURES + 1))
    break
  fi
done
if $RUNNER_PASS; then
  echo -e "${GREEN}✓${NC}"
fi

# Check 4: Agents accept modelSelection parameter
echo -n "4. Agents accept modelSelection parameter... "
AGENT_FILES=(
  "src/orchestrator/planner_agent.ts"
  "src/orchestrator/thinker_agent.ts"
  "src/orchestrator/implementer_agent.ts"
  "src/orchestrator/reviewer_agent.ts"
)
AGENT_PASS=true
for agent in "${AGENT_FILES[@]}"; do
  if ! grep -q "modelSelection\?" "$agent"; then
    echo -e "${RED}✗${NC}"
    echo "   Missing in: $agent (should have 'modelSelection?: ModelSelection' in input interface)"
    AGENT_PASS=false
    FAILURES=$((FAILURES + 1))
    break
  fi
done
if $AGENT_PASS; then
  echo -e "${GREEN}✓${NC}"
fi

# Check 5: Agents use modelSelection with fallback
echo -n "5. Agents use modelSelection with fallback (either ?? or if pattern)... "
USE_PASS=true
for agent in "${AGENT_FILES[@]}"; do
  # Accept both patterns: "modelSelection ??" or "if (!modelSelection)"
  if ! grep -E "(modelSelection \?\?|if \(\!modelSelection\))" "$agent" >/dev/null; then
    echo -e "${RED}✗${NC}"
    echo "   Missing in: $agent (should use 'input.modelSelection ?? fallback' or 'if (!modelSelection)' pattern)"
    USE_PASS=false
    FAILURES=$((FAILURES + 1))
    break
  fi
done
if $USE_PASS; then
  echo -e "${GREEN}✓${NC}"
fi

# Check 6: Source tracking logs exist
echo -n "6. Agents log source tracking (ComplexityRouter vs ModelRouter)... "
SOURCE_PASS=true
for agent in "${AGENT_FILES[@]}"; do
  if ! grep -q "source:" "$agent"; then
    echo -e "${YELLOW}⚠${NC}"
    echo "   Warning: $agent doesn't log source tracking (recommended but not required)"
    SOURCE_PASS=false
    break
  fi
done
if $SOURCE_PASS; then
  echo -e "${GREEN}✓${NC}"
fi

# Check 7: Integration tests exist
echo -n "7. Integration tests exist... "
INTEGRATION_TEST="src/orchestrator/__tests__/complexity_router_integration.test.ts"
if [ -f "$INTEGRATION_TEST" ]; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo "   Missing: $INTEGRATION_TEST"
  FAILURES=$((FAILURES + 1))
fi

# Check 8: Integration tests verify agents use ComplexityRouter
echo -n "8. Integration tests verify agents use ComplexityRouter output... "
if grep -q "expect(mockRouter.pickModel).not.toHaveBeenCalled()" "$INTEGRATION_TEST" 2>/dev/null; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo "   Missing: Integration tests should verify ModelRouter NOT called when ComplexityRouter provided"
  FAILURES=$((FAILURES + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}✅ All integration checks passed${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  exit 0
else
  echo -e "${RED}❌ $FAILURES integration check(s) failed${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "ComplexityRouter is NOT properly integrated."
  echo "Fix the failures above before claiming integration complete."
  echo ""
  exit 1
fi
