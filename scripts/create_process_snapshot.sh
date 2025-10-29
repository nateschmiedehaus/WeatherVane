#!/usr/bin/env bash
# IMP-FUND-09: Process Monitoring Snapshot Script
# Captures daily baseline metrics for phase skips, backtracks, drift

set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT_DIR="${WORKSPACE_ROOT}/state/analytics/process_monitoring"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
SNAPSHOT_FILE="${SNAPSHOT_DIR}/snapshot_${TIMESTAMP}.json"

# Create directory if it doesn't exist
mkdir -p "${SNAPSHOT_DIR}"

echo "📸 Creating process monitoring snapshot at ${TIMESTAMP}"

# Initialize snapshot JSON
cat > "${SNAPSHOT_FILE}" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "version": "1.0.0",
  "metrics": {
EOF

# Collect phase skips from phase ledger  
PHASE_SKIPS=$(grep -c "phase_skip" "${WORKSPACE_ROOT}/tools/wvo_mcp/state/phase_ledger.jsonl" 2>/dev/null || echo "0")
echo "  Phase skips: ${PHASE_SKIPS}"

# Collect backtracks from phase ledger
BACKTRACKS=$(grep -c "backtrack" "${WORKSPACE_ROOT}/tools/wvo_mcp/state/phase_ledger.jsonl" 2>/dev/null || echo "0")
echo "  Backtracks: ${BACKTRACKS}"

# Collect process violations
VIOLATIONS=$(grep -c "process_violation" "${WORKSPACE_ROOT}/tools/wvo_mcp/state/phase_ledger.jsonl" 2>/dev/null || echo "0")
echo "  Process violations: ${VIOLATIONS}"

# Collect task completion metrics
TASKS_DONE=$(find "${WORKSPACE_ROOT}/state/evidence" -name "monitor.md" 2>/dev/null | wc -l | tr -d ' ')
echo "  Tasks completed: ${TASKS_DONE}"

# Collect drift detections
DRIFT_DETECTIONS=$(grep -c "drift" "${WORKSPACE_ROOT}/tools/wvo_mcp/state/phase_ledger.jsonl" 2>/dev/null || echo "0")
echo "  Drift detections: ${DRIFT_DETECTIONS}"

# Write metrics to JSON
cat >> "${SNAPSHOT_FILE}" <<EOF
    "phase_skips": ${PHASE_SKIPS},
    "backtracks": ${BACKTRACKS},
    "process_violations": ${VIOLATIONS},
    "tasks_completed": ${TASKS_DONE},
    "drift_detections": ${DRIFT_DETECTIONS}
  },
  "sources": {
    "phase_ledger": "tools/wvo_mcp/state/phase_ledger.jsonl",
    "evidence_dir": "state/evidence"
  }
}
EOF

echo "✅ Snapshot saved to ${SNAPSHOT_FILE}"
echo ""
echo "Summary:"
echo "  • Phase skips: ${PHASE_SKIPS}"
echo "  • Backtracks: ${BACKTRACKS}"
echo "  • Process violations: ${VIOLATIONS}"
echo "  • Tasks completed: ${TASKS_DONE}"
echo "  • Drift detections: ${DRIFT_DETECTIONS}"
