#!/usr/bin/env bash
#
# Quality Graph - Backfill Shell Wrapper
#
# Convenience script to backfill quality graph from historical tasks.
# Wraps the Python script with environment setup.
#
# Usage:
#   ./scripts/backfill_quality_graph.sh [--days N] [--dry-run] [--force]
#
# Examples:
#   ./scripts/backfill_quality_graph.sh --days 90 --dry-run
#   ./scripts/backfill_quality_graph.sh --days 30
#   ./scripts/backfill_quality_graph.sh --force

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Quality Graph Backfill"
echo "====================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 not found${NC}"
    echo "Please install Python 3.9 or later"
    exit 1
fi

# Check required Python packages
python3 -c "import numpy, sklearn, pydantic" 2>/dev/null || {
    echo -e "${YELLOW}Warning: Required Python packages not found${NC}"
    echo "Installing: numpy, scikit-learn, pydantic"
    pip3 install numpy scikit-learn pydantic
}

# Check tqdm (optional but recommended)
python3 -c "import tqdm" 2>/dev/null || {
    echo -e "${YELLOW}Note: tqdm not installed (progress bar will be basic)${NC}"
    echo "Install with: pip3 install tqdm"
    echo ""
}

# Run Python backfill script
echo "Workspace: $WORKSPACE_ROOT"
echo ""

python3 "$SCRIPT_DIR/backfill_quality_graph.py" "$WORKSPACE_ROOT" "$@"

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Backfill completed successfully${NC}"
else
    echo ""
    echo -e "${RED}❌ Backfill failed with exit code $exit_code${NC}"
fi

exit $exit_code
