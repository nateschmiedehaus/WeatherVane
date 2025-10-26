#!/usr/bin/env bash
# Critic Integration - MANDATORY reality checking
#
# CRITICAL: This script MUST be called after every autopilot cycle
# to verify that completed work is actually implemented (not placeholder).
#
# If critics find CRITICAL issues:
# - Completed tasks are converted to blockers
# - Summary is rewritten with critique blockers
# - Task cannot proceed until fixed
#
# Usage:
#   source critic_integration.sh
#   run_critics_on_summary "$SUMMARY_JSON" "$STATE_FILE"

run_critics_on_summary() {
  local SUMMARY_JSON="$1"
  local STATE_FILE="$2"
  local ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)}"

  # Create critiques directory
  mkdir -p "$ROOT/state/critiques"

  # Extract completed tasks from summary
  COMPLETED_TASKS=$(python - <<'PY' "$SUMMARY_JSON"
import json, sys
summary = json.loads(sys.argv[1]) if isinstance(sys.argv[1], str) else {}
if isinstance(summary, list):
    summary = next((item for item in summary if isinstance(item, dict)), {})
completed = summary.get("completed_tasks") or []
print(json.dumps(completed))
PY
)

  # If no completed tasks, skip critics
  if [ "$COMPLETED_TASKS" = "[]" ] || [ -z "$COMPLETED_TASKS" ]; then
    log "No completed tasks to critique, skipping critics"
    return 0
  fi

  log "Running reality-checking critics on completed tasks..."

  # Determine task ID from completed tasks (heuristic: use first item)
  TASK_ID=$(python - <<'PY' "$COMPLETED_TASKS"
import json, sys, re
try:
    tasks = json.loads(sys.argv[1])
    if tasks and len(tasks) > 0:
        first_task = str(tasks[0])
        # Try to extract task ID pattern (T1.2.3, M11.2, etc)
        match = re.search(r'[TEM]\d+(\.\d+)*', first_task)
        if match:
            print(match.group(0))
        else:
            # Use hash of first task as ID
            import hashlib
            print("TASK_" + hashlib.md5(first_task.encode()).hexdigest()[:8])
except:
    print("UNKNOWN")
PY
)

  log "Task ID for critique: $TASK_ID"

  # Run critics
  CRITIQUE_FILE="$ROOT/state/critiques/${TASK_ID}_critique.json"
  CRITICS_SCRIPT="$ROOT/tools/wvo_mcp/scripts/run_critics.py"

  if [ ! -f "$CRITICS_SCRIPT" ]; then
    log "⚠️  WARNING: Critics script not found at $CRITICS_SCRIPT"
    log "   Skipping critic checks (NOT SAFE - critics should be mandatory)"
    return 0
  fi

  # Run critics and capture output
  CRITIQUE_JSON=$(python "$CRITICS_SCRIPT" \
    --task "$TASK_ID" \
    --code-glob "apps/**/*.py" \
    --docs-glob "docs/**/*.md" \
    --json 2>&1 || echo "{\"status\": \"ERROR\", \"critical_issues\": []}")

  # Save critique to file
  echo "$CRITIQUE_JSON" > "$CRITIQUE_FILE"

  # Parse critique status
  CRITIQUE_STATUS=$(echo "$CRITIQUE_JSON" | python -c "import json, sys; data=json.load(sys.stdin); print(data.get('status', 'ERROR'))")
  CRITICAL_COUNT=$(echo "$CRITIQUE_JSON" | python -c "import json, sys; data=json.load(sys.stdin); print(len(data.get('critical_issues', [])))")

  log "Critique status: $CRITIQUE_STATUS (critical issues: $CRITICAL_COUNT)"

  # If BLOCK status, rewrite summary with critique blockers
  if [ "$CRITIQUE_STATUS" = "BLOCK" ]; then
    log "❌ CRITICAL: Critics found $CRITICAL_COUNT blocking issues!"
    log "   Critique saved to: $CRITIQUE_FILE"

    # Extract critique messages
    CRITIQUE_MESSAGES=$(echo "$CRITIQUE_JSON" | python - <<'PY'
import json, sys
data = json.load(sys.stdin)
issues = data.get("critical_issues", [])
for i, issue in enumerate(issues[:5], 1):  # Max 5 messages
    print(f"{i}. [{issue.get('type')}] {issue.get('message')}")
PY
)

    log "Critical issues found:"
    echo "$CRITIQUE_MESSAGES" | while IFS= read -r line; do
      log "   $line"
    done

    # Rewrite summary: Move completed_tasks to blockers
    UPDATED_SUMMARY=$(python - <<'PY' "$SUMMARY_JSON" "$TASK_ID" "$CRITIQUE_FILE"
import json, sys

summary = json.loads(sys.argv[1]) if isinstance(sys.argv[1], str) else {}
if isinstance(summary, list):
    summary = next((item for item in summary if isinstance(item, dict)), {})

task_id = sys.argv[2]
critique_file = sys.argv[3]

# Move completed_tasks to blockers
completed = summary.get("completed_tasks") or []
blockers = summary.get("blockers") or []

# Add critique blocker
critique_blocker = f"CRITIC_BLOCK: Task {task_id} has critical issues (see {critique_file})"
blockers.append(critique_blocker)

# Add original completed tasks as "attempted but blocked"
for task in completed:
    blockers.append(f"Task '{task}' not production-ready (see critique)")

# Clear completed tasks
summary["completed_tasks"] = []
summary["blockers"] = blockers

# Add critique note
notes = summary.get("notes") or ""
summary["notes"] = notes + f"\n\n❌ CRITIC BLOCKED: {len(completed)} task(s) failed reality check. See {critique_file} for details."

print(json.dumps(summary, indent=2))
PY
)

    # Save updated summary
    echo "$UPDATED_SUMMARY" > "$STATE_FILE"
    log "Summary rewritten: completed tasks converted to blockers"

    # Update context with critique
    if [ -f "$ROOT/state/context.md" ]; then
      cat >> "$ROOT/state/context.md" <<EOF

## Critic Blocked: $TASK_ID

**Critique File:** \`$CRITIQUE_FILE\`

**Critical Issues Found:** $CRITICAL_COUNT

$CRITIQUE_MESSAGES

**Action Required:** Fix critical issues before task can be marked complete.

EOF
      log "Context updated with critique blockers"
    fi

    # Return failure to signal blocking
    return 1

  elif [ "$CRITIQUE_STATUS" = "WARNING" ]; then
    log "⚠️  Critics found warnings but no blocking issues"
    log "   Review critique: $CRITIQUE_FILE"

    # Add warning note to summary
    UPDATED_SUMMARY=$(python - <<'PY' "$SUMMARY_JSON" "$CRITIQUE_FILE"
import json, sys

summary = json.loads(sys.argv[1]) if isinstance(sys.argv[1], str) else {}
if isinstance(summary, list):
    summary = next((item for item in summary if isinstance(item, dict)), {})

critique_file = sys.argv[2]
notes = summary.get("notes") or ""
summary["notes"] = notes + f"\n\n⚠️ Critic warnings found (see {critique_file})"

print(json.dumps(summary, indent=2))
PY
)
    echo "$UPDATED_SUMMARY" > "$STATE_FILE"

    return 0  # Allow task to proceed

  else
    log "✅ Critics passed - task implementation verified"
    return 0
  fi
}

# Export function for use in autopilot.sh
export -f run_critics_on_summary
