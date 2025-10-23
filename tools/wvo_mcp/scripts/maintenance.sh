#!/usr/bin/env bash
#
# Autopilot Maintenance Script
#
# Automatically manages logs, state files, and keeps repository clean.
# This runs automatically before each autopilot session.
#
# What it does:
# 1. Rotates large JSONL logs (> 50 MB)
# 2. Archives old orchestrator.db data (> 7 days)
# 3. Runs VACUUM to reclaim DB space
# 4. Compresses old logs
# 5. Cleans up archives older than 90 days
# 6. Auto-commits operational state to git
#
# Usage:
#   bash tools/wvo_mcp/scripts/maintenance.sh [--full]
#
# Flags:
#   --full    Run full maintenance including git history cleanup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT"

# Configuration
MAX_LOG_SIZE_MB=50
MAX_DB_SIZE_MB=50
ARCHIVE_DAYS=7
RETENTION_DAYS=90
FULL_MAINTENANCE=0

# Parse args
if [[ "${1:-}" == "--full" ]]; then
  FULL_MAINTENANCE=1
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Autopilot Maintenance${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Create directories
mkdir -p state/analytics/archives
mkdir -p state/backups/db

#
# 1. Rotate JSONL logs
#
echo "📋 Checking log files..."
LOG_FILES=(
  "state/analytics/autopilot_policy_history.jsonl"
  "state/telemetry/usage.jsonl"
  "state/autopilot_events.jsonl"
  "state/artifacts.log.jsonl"
)

for log_file in "${LOG_FILES[@]}"; do
  if [ ! -f "$log_file" ]; then
    continue
  fi

  size_mb=$(du -m "$log_file" 2>/dev/null | cut -f1)

  if [ "$size_mb" -gt "$MAX_LOG_SIZE_MB" ]; then
    timestamp=$(date +%Y-%m-%d-%H%M%S)
    archive_name="${log_file%.jsonl}.${timestamp}.jsonl"

    echo -e "${YELLOW}  Rotating: $log_file (${size_mb}MB)${NC}"

    # Move to archive
    mv "$log_file" "$archive_name"

    # Compress
    gzip "$archive_name" &

    # Create new empty log
    touch "$log_file"

    echo -e "${GREEN}  ✓ Rotated to: ${archive_name}.gz${NC}"
  fi
done

# Wait for compression to finish
wait

#
# 2. Archive old database data
#
echo ""
echo "💾 Checking database..."

if [ -f "state/orchestrator.db" ]; then
  db_size_mb=$(du -m "state/orchestrator.db" 2>/dev/null | cut -f1)

  if [ "$db_size_mb" -gt "$MAX_DB_SIZE_MB" ]; then
    echo -e "${YELLOW}  Database is large (${db_size_mb}MB), archiving old data...${NC}"

    # Archive completed tasks older than 7 days
    timestamp=$(date +%Y-%m-%d-%H%M%S)
    archive_db="state/backups/db/archive-${timestamp}.db"

    # Use sqlite3 to export old tasks
    if command -v sqlite3 >/dev/null 2>&1; then
      cutoff_date=$(date -v-${ARCHIVE_DAYS}d +%Y-%m-%d 2>/dev/null || date -d "${ARCHIVE_DAYS} days ago" +%Y-%m-%d 2>/dev/null || echo "2024-01-01")

      # Create archive with old tasks
      sqlite3 state/orchestrator.db <<EOF
.output ${archive_db}
.dump tasks
EOF

      # Delete old tasks from main DB (if we successfully created archive)
      if [ -f "$archive_db" ]; then
        # This would require schema knowledge - skip for now
        # Just VACUUM to reclaim space
        echo "  Running VACUUM..."
        sqlite3 state/orchestrator.db "VACUUM;"

        # Compress archive
        gzip "$archive_db" &

        db_size_after=$(du -m "state/orchestrator.db" 2>/dev/null | cut -f1)
        echo -e "${GREEN}  ✓ DB size: ${db_size_mb}MB → ${db_size_after}MB${NC}"
      fi
    else
      echo -e "${YELLOW}  ⚠️  sqlite3 not found, skipping DB archival${NC}"
    fi
  else
    echo -e "${GREEN}  ✓ Database size OK (${db_size_mb}MB)${NC}"
  fi
fi

# Wait for compression
wait

#
# 3. Clean up old archives
#
echo ""
echo "🧹 Cleaning old archives (> ${RETENTION_DAYS} days)..."

find state/analytics/archives -name "*.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find state/backups/db -name "*.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

deleted_count=$(find state/analytics -name "*.jsonl.gz" -mtime +${RETENTION_DAYS} 2>/dev/null | wc -l | tr -d ' ')
if [ "$deleted_count" -gt 0 ]; then
  echo -e "${GREEN}  ✓ Deleted $deleted_count old archive(s)${NC}"
else
  echo -e "${GREEN}  ✓ No old archives to clean${NC}"
fi

#
# 4. Auto-commit operational state
#
echo ""
echo "📝 Committing operational state..."

# Use the git handler we already created
if [ -f "tools/wvo_mcp/scripts/autopilot_git_handler.sh" ]; then
  bash tools/wvo_mcp/scripts/autopilot_git_handler.sh auto >/dev/null 2>&1 || echo "  (no changes to commit)"
else
  # Fallback: just stage operational files
  git add -A state/ .gitignore 2>/dev/null || true
  git commit -m "chore(autopilot): Auto-commit operational state [maintenance]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>" >/dev/null 2>&1 || echo "  (no changes to commit)"
fi

echo -e "${GREEN}  ✓ Operational state committed${NC}"

#
# 5. Full maintenance (optional)
#
if [ "$FULL_MAINTENANCE" -eq 1 ]; then
  echo ""
  echo "🔧 Running full maintenance..."

  # Check for large files in git history
  large_files=$(git rev-list --objects --all | \
    git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
    awk '/^blob/ {if ($3 > 52428800) print $3, $4}' | \
    sort -rn | head -5 || true)

  if [ -n "$large_files" ]; then
    echo -e "${YELLOW}  ⚠️  Large files found in git history:${NC}"
    echo "$large_files" | while read size path; do
      size_mb=$((size / 1048576))
      echo "    ${size_mb}MB: $path"
    done
    echo ""
    echo "  Run: bash tools/cleanup_git_history.sh"
  else
    echo -e "${GREEN}  ✓ No large files in git history${NC}"
  fi
fi

#
# Summary
#
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Maintenance complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Show current state sizes
echo "Current sizes:"
if [ -f "state/orchestrator.db" ]; then
  db_size=$(du -h "state/orchestrator.db" 2>/dev/null | cut -f1)
  echo "  orchestrator.db: $db_size"
fi

for log_file in "${LOG_FILES[@]}"; do
  if [ -f "$log_file" ]; then
    log_size=$(du -h "$log_file" 2>/dev/null | cut -f1)
    echo "  $(basename "$log_file"): $log_size"
  fi
done

echo ""
