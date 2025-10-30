#!/usr/bin/env bash
# Setup Cron Jobs for Quality Assurance
# Installs cron jobs for automated hunting, health checks, and dashboard generation
# Usage: bash scripts/setup_cron.sh [--install|--uninstall|--list]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ACTION="${1:-install}"

# Cron configuration
DAILY_HUNT_TIME="02:00"        # 2 AM daily
HEALTH_CHECK_TIME="*/10"       # Every 10 minutes
DASHBOARD_GEN_TIME="*/15"      # Every 15 minutes

case "$ACTION" in
  --install|install)
    echo -e "${GREEN}📅 Installing cron jobs for quality assurance...${NC}"
    echo ""

    # Build cron entries
    CRON_ENTRIES=""

    # Daily technical failure hunt (2 AM)
    CRON_ENTRIES+="0 2 * * * cd $WORKSPACE_ROOT && bash scripts/hunt_failures.sh >> state/analytics/cron_hunt_failures.log 2>&1
"

    # Daily quality hunt (2:15 AM)
    CRON_ENTRIES+="15 2 * * * cd $WORKSPACE_ROOT && bash scripts/hunt_quality.sh >> state/analytics/cron_hunt_quality.log 2>&1
"

    # Daily reasoning hunt (2:30 AM)
    CRON_ENTRIES+="30 2 * * * cd $WORKSPACE_ROOT && bash scripts/hunt_reasoning.sh >> state/analytics/cron_hunt_reasoning.log 2>&1
"

    # Auto-task creation after hunts (3 AM)
    CRON_ENTRIES+="0 3 * * * cd $WORKSPACE_ROOT && npx tsx tools/wvo_mcp/src/quality/auto_task_cli.ts >> state/analytics/cron_auto_tasks.log 2>&1
"

    # Dashboard generation every 15 minutes
    CRON_ENTRIES+="*/15 * * * * cd $WORKSPACE_ROOT && npx tsx tools/wvo_mcp/src/quality/dashboard_cli.ts >> state/analytics/cron_dashboard.log 2>&1
"

    # Weekly cleanup of old tasks (Sunday 3 AM)
    CRON_ENTRIES+="0 3 * * 0 cd $WORKSPACE_ROOT && npx tsx tools/wvo_mcp/src/quality/auto_task_cli.ts --cleanup-days 30 >> state/analytics/cron_cleanup.log 2>&1
"

    # Get existing crontab (may not exist)
    EXISTING_CRON=$(crontab -l 2>/dev/null || echo "")

    # Remove existing QA cron jobs (lines with WORKSPACE_ROOT)
    CLEANED_CRON=$(echo "$EXISTING_CRON" | grep -v "$WORKSPACE_ROOT" || true)

    # Add header comment
    NEW_CRON="$CLEANED_CRON
# Quality Assurance Automation (WeatherVane)
$CRON_ENTRIES"

    # Install new crontab
    echo "$NEW_CRON" | crontab -

    echo -e "${GREEN}✅ Cron jobs installed successfully!${NC}"
    echo ""
    echo "Scheduled jobs:"
    echo "  - Daily failure hunt: 2:00 AM"
    echo "  - Daily quality hunt: 2:15 AM"
    echo "  - Daily reasoning hunt: 2:30 AM"
    echo "  - Auto-task creation: 3:00 AM"
    echo "  - Dashboard generation: Every 15 minutes"
    echo "  - Weekly task cleanup: Sunday 3:00 AM"
    echo ""
    echo "Logs will be written to: state/analytics/cron_*.log"
    ;;

  --uninstall|uninstall)
    echo -e "${YELLOW}🗑  Uninstalling quality assurance cron jobs...${NC}"
    echo ""

    # Get existing crontab
    EXISTING_CRON=$(crontab -l 2>/dev/null || echo "")

    # Remove QA cron jobs
    CLEANED_CRON=$(echo "$EXISTING_CRON" | grep -v "$WORKSPACE_ROOT" || true)
    CLEANED_CRON=$(echo "$CLEANED_CRON" | grep -v "Quality Assurance Automation" || true)

    # Install cleaned crontab
    if [ -z "$CLEANED_CRON" ]; then
      # Remove crontab entirely if empty
      crontab -r 2>/dev/null || true
      echo -e "${GREEN}✅ All cron jobs removed${NC}"
    else
      echo "$CLEANED_CRON" | crontab -
      echo -e "${GREEN}✅ Quality assurance cron jobs removed${NC}"
    fi
    ;;

  --list|list)
    echo -e "${GREEN}📋 Current cron jobs:${NC}"
    echo ""
    crontab -l 2>/dev/null || echo "No cron jobs installed"
    ;;

  --help|help)
    echo "Setup Cron Jobs for Quality Assurance"
    echo ""
    echo "Usage: $0 [ACTION]"
    echo ""
    echo "Actions:"
    echo "  install    Install quality assurance cron jobs (default)"
    echo "  uninstall  Remove quality assurance cron jobs"
    echo "  list       List current cron jobs"
    echo "  help       Show this help message"
    echo ""
    echo "Scheduled Jobs:"
    echo "  - Daily failure hunt (2:00 AM)"
    echo "  - Daily quality hunt (2:15 AM)"
    echo "  - Daily reasoning hunt (2:30 AM)"
    echo "  - Auto-task creation (3:00 AM)"
    echo "  - Dashboard generation (every 15 minutes)"
    echo "  - Weekly task cleanup (Sunday 3:00 AM)"
    exit 0
    ;;

  *)
    echo -e "${RED}Unknown action: $ACTION${NC}"
    echo "Use --help for usage information"
    exit 1
    ;;
esac
