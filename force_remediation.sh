#!/bin/bash
# Force autopilot to work on REMEDIATION tasks by clearing state and setting priority

set -e

echo "🔧 Forcing autopilot to REMEDIATION tasks..."

# 1. Stop autopilot
echo "1. Stopping autopilot..."
pkill -9 -f "node.*autopilot" || true
sleep 2

# 2. Clear state machine
echo "2. Clearing state machine database..."
rm -f state/orchestrator.db

# 3. Verify roadmap has REMEDIATION tasks
echo "3. Checking roadmap..."
REMEDIATION_COUNT=$(grep -c "REMEDIATION\|REM-T" state/roadmap.yaml || echo "0")
echo "   Found $REMEDIATION_COUNT REMEDIATION task references"

if [ "$REMEDIATION_COUNT" -lt "100" ]; then
    echo "   ⚠️  Roadmap looks incomplete, restoring from git..."
    git show HEAD:state/roadmap.yaml > state/roadmap.yaml
    REMEDIATION_COUNT=$(grep -c "REMEDIATION\|REM-T" state/roadmap.yaml || echo "0")
    echo "   Restored: $REMEDIATION_COUNT REMEDIATION task references"
fi

# 4. Set command
echo "4. Setting REMEDIATION command..."
cat > state/commands.json <<'EOF'
{
  "commands": [
    {
      "id": "CMD-FORCE-REMEDIATION",
      "instruction": "Work EXCLUSIVELY on REMEDIATION tasks. These are critical quality audits of ALL previously completed work. Do NOT work on any other tasks until ALL REMEDIATION tasks are complete.",
      "task_filter": "REMEDIATION",
      "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
      "status": "pending"
    }
  ],
  "last_updated": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
}
EOF

echo ""
echo "✅ Setup complete. Start autopilot with:"
echo "   npm run autopilot"
echo ""
echo "Expected behavior:"
echo "   - Fresh database will be created from roadmap.yaml"
echo "   - Command filter will restrict to REMEDIATION tasks"
echo "   - ~107 pending REMEDIATION tasks should be available"
echo "   - When ALL REMEDIATION tasks are complete:"
echo "     → Command auto-marks as 'completed'"
echo "     → Autopilot automatically moves on to other tasks (MLR, etc.)"
echo ""
echo "Max iterations: 1000 (plenty of time to complete all REMEDIATION)"
