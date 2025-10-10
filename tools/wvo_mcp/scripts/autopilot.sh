#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG_FILE="${LOG_FILE:-/tmp/wvo_autopilot.log}"
STATE_FILE="${STATE_FILE:-/tmp/wvo_autopilot_last.json}"
MAX_RETRY=${MAX_RETRY:-5}
SLEEP_SECONDS=${SLEEP_SECONDS:-300}
STOP_ON_BLOCKER=${STOP_ON_BLOCKER:-0}
CODEX_HOME="${CODEX_HOME:-$ROOT/.codex}"
CLI_PROFILE="${CODEX_PROFILE_NAME:-weathervane_orchestrator}"
WVO_CAPABILITY="${WVO_CAPABILITY:-medium}"
AUTOPILOT_MODEL="${CODEX_AUTOPILOT_MODEL:-gpt-5-codex}"
AUTOPILOT_REASONING="${CODEX_AUTOPILOT_REASONING:-auto}"
BASE_INSTRUCTIONS="${BASE_INSTRUCTIONS:-$ROOT/docs/wvo_prompt.md}"
CONFIG_SCRIPT="$ROOT/tools/wvo_mcp/scripts/configure_codex_profile.py"

mkdir -p "$CODEX_HOME"
export CODEX_HOME
export CODEX_PROFILE="$WVO_CAPABILITY"

if [ ! -f "$BASE_INSTRUCTIONS" ]; then
  echo "Base instructions not found at $BASE_INSTRUCTIONS. Cannot start autopilot." >&2
  exit 1
fi

if [ ! -f "$CONFIG_SCRIPT" ]; then
  echo "Config helper script missing: $CONFIG_SCRIPT" >&2
  exit 1
fi

python "$CONFIG_SCRIPT" \
  "$CODEX_HOME/config.toml" \
  "$CLI_PROFILE" \
  "$ROOT" \
  "$BASE_INSTRUCTIONS" \
  --model "$AUTOPILOT_MODEL" \
  --sandbox danger-full-access \
  --approval never \
  --reasoning "$AUTOPILOT_REASONING"

SCHEMA_FILE="$(mktemp)"
PROMPT_FILE="$(mktemp)"
trap 'rm -f "$SCHEMA_FILE" "$PROMPT_FILE"' EXIT

timestamp(){ date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log(){ printf '%s %s\n' "$(timestamp)" "$*" | tee -a "$LOG_FILE"; }

cat <<'SCHEMA' > "$SCHEMA_FILE"
{
  "type": "object",
  "properties": {
    "completed_tasks": { "type": "array", "items": { "type": "string" } },
    "in_progress": { "type": "array", "items": { "type": "string" } },
    "blockers": { "type": "array", "items": { "type": "string" } },
    "next_focus": { "type": "array", "items": { "type": "string" } },
    "notes": { "type": "string" }
  },
  "required": ["completed_tasks", "in_progress", "blockers", "next_focus", "notes"],
  "additionalProperties": false
}
SCHEMA

cat <<'PROMPT' > "$PROMPT_FILE"
Operate autonomously as the WeatherVane super-team. Your goal is to drive the roadmap to completion with world-class engineering, data/ML, product, and design rigor.

Loop:
1. Read state/roadmap.yaml and choose the highest-priority task(s) not done.
2. Run `cmd_run {"cmd":"codex version"}` as a lightweight heartbeat; checkpoint if resource limits appear tight.
3. For each chosen task:
   a. Audit docs/code/tests/design to understand requirements.
   b. Implement the work via fs_read/fs_write/cmd_run (code + tests + docs + design polish). Keep slices small enough to verify quickly.
   c. Run critics_run with ["build","tests","manager_self_check","data_quality","design_system","org_pm","exec_review"] and add allocator/causal/forecast critics when relevant. Use state/critics timestamps/results to skip suites that have already covered unchanged artifacts this session.
   d. Fix issues. If blocked, log the blocker clearly and mark the task blocked with plan_update.
   e. Record decisions, risks, and next actions via context_write (keep state/context.md ≤ 1000 words).
   f. Snapshot via context_snapshot.
   g. Update roadmap status with plan_update only after exit criteria are satisfied.
4. Prioritise shipping real work over repeated self-review loops while still running critics after meaningful changes land; if nothing changed, move forward instead of re-running the same suites.
5. Approximately once every 100 tasks/messages, deliberately audit a completed roadmap item for hidden gaps or regressions. If you find an issue, open a fresh task, deliver the fix, and document the improvement before resuming new work.
6. Spread surprise QA audits across different epics/milestones rather than clustering; skip the audit if you already inspected that item in the current session.
5. Repeat on remaining tasks. Stop only when no further progress is possible without human intervention.
Maintain production readiness, enforce ML/causal rigor, polish UX, and communicate like a Staff+/startup leader.
Return JSON summarizing completed tasks, tasks still in progress, blockers, next focus items, and overall notes.
PROMPT

cd "$ROOT"

while true; do
  attempt=0
  while true; do
    RUN_LOG="$(mktemp)"
    log "Starting WeatherVane autopilot run (attempt $((attempt + 1)))..."
    set +e
    codex exec \
      --profile "$CLI_PROFILE" \
      --model "$AUTOPILOT_MODEL" \
      --full-auto \
      --sandbox danger-full-access \
      --output-schema "$SCHEMA_FILE" \
      "$(cat "$PROMPT_FILE")" | tee "$RUN_LOG"
    status=${PIPESTATUS[0]}
    set -e
    cat "$RUN_LOG" >> "$LOG_FILE"

    if [ "$status" -ne 0 ]; then
      log "codex exec exited with status $status. Retrying in 30 seconds..."
      attempt=$((attempt + 1))
      rm -f "$RUN_LOG"
      if [ "$attempt" -ge "$MAX_RETRY" ]; then
        log "Reached maximum retry count ($MAX_RETRY). Autopilot pausing for ${SLEEP_SECONDS}s before next outer loop."
        sleep "$SLEEP_SECONDS"
        break
      fi
      sleep 30
      continue
    fi

    if grep -qiE 'context length|max_tokens|conversation too long|prompt too long|exceeded (context|tokens)|maximum context|message is too long|sequence exceeds|token length' "$RUN_LOG"; then
      attempt=$((attempt + 1))
      rm -f "$RUN_LOG"
      if [ "$attempt" -ge "$MAX_RETRY" ]; then
        log "Reached maximum retry count ($MAX_RETRY). Autopilot exiting."
        exit 1
      fi
      log "Context limit detected. Restarting in 5 seconds..."
      sleep 5
      continue
    fi

    SUMMARY_JSON=$(python - <<'PY' "$RUN_LOG" "$STATE_FILE"
import json, sys, pathlib
log_path = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])
summary = None
for line in log_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line:
        continue
    if line.startswith("{") and line.endswith("}"):
        try:
            summary = json.loads(line)
            break
        except json.JSONDecodeError:
            continue
if summary is None:
    raise SystemExit("No JSON summary found in autopilot output.")
out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps(summary))
PY
) || {
      log "Autopilot run completed without a valid JSON summary. Retrying in 30 seconds..."
      rm -f "$RUN_LOG"
      attempt=$((attempt + 1))
      if [ "$attempt" -ge "$MAX_RETRY" ]; then
        log "Reached maximum retry count ($MAX_RETRY). Autopilot pausing for ${SLEEP_SECONDS}s before next outer loop."
        sleep "$SLEEP_SECONDS"
        break
      fi
      sleep 30
      continue
    }
    printf '%s\n' "$SUMMARY_JSON"
    rm -f "$RUN_LOG"
    log "Summary saved to $STATE_FILE"
    break
  done

  if [ ! -f "$STATE_FILE" ]; then
    log "State file not present yet; sleeping ${SLEEP_SECONDS}s before retry."
    sleep "$SLEEP_SECONDS"
    continue
  fi

  BLOCKERS=$(python - <<'PY' "$STATE_FILE"
import json, sys
summary = json.load(open(sys.argv[1]))
print(len(summary.get("blockers") or []))
PY
) || {
    log "Unable to parse blocker count; sleeping ${SLEEP_SECONDS}s before retry."
    sleep "$SLEEP_SECONDS"
    continue
  }
  log "Blockers recorded: $BLOCKERS"

  if [ "$STOP_ON_BLOCKER" -eq 1 ] && [ "$BLOCKERS" -gt 0 ]; then
    log "Stopping because blockers require human attention."
    break
  fi

  log "Autopilot sleeping for ${SLEEP_SECONDS}s before next run..."
  sleep "$SLEEP_SECONDS"
done
