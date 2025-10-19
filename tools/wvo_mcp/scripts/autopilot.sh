#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG_FILE="${LOG_FILE:-/tmp/wvo_autopilot.log}"
STATE_FILE="${STATE_FILE:-/tmp/wvo_autopilot_last.json}"
MAX_RETRY=${MAX_RETRY:-20}
SLEEP_SECONDS=${SLEEP_SECONDS:-120}
STOP_ON_BLOCKER=${STOP_ON_BLOCKER:-0}
WVO_AUTOPILOT_STREAM=${WVO_AUTOPILOT_STREAM:-0}
MCP_ENTRY="${WVO_AUTOPILOT_ENTRY:-$ROOT/tools/wvo_mcp/dist/index.js}"
CLI_PROFILE="${CODEX_PROFILE_NAME:-weathervane_orchestrator}"
if [ "${WVO_DRY_RUN:-0}" = "1" ] && [ -z "${WVO_CAPABILITY+x}" ]; then
  WVO_CAPABILITY="medium"
fi
WVO_CAPABILITY="${WVO_CAPABILITY:-high}"
WVO_AUTOPILOT_ASSUME_NO_PROMPT=${WVO_AUTOPILOT_ASSUME_NO_PROMPT:-1}
AUTOPILOT_MODEL="${CODEX_AUTOPILOT_MODEL:-gpt-5-codex}"
AUTOPILOT_REASONING="${CODEX_AUTOPILOT_REASONING:-auto}"
BASE_INSTRUCTIONS="${BASE_INSTRUCTIONS:-$ROOT/docs/wvo_prompt.md}"
CONFIG_SCRIPT="$ROOT/tools/wvo_mcp/scripts/configure_codex_profile.py"
USAGE_LIMIT_BACKOFF=${USAGE_LIMIT_BACKOFF:-120}
TASK_MEMO_DIR="$ROOT/state/task_memos"
ESCALATION_CONFIG="$ROOT/tools/wvo_mcp/config/critic_escalations.json"
ESCALATION_LOG="$ROOT/state/escalations.log"
POLICY_STATE_DIR="$ROOT/state/policy"
POLICY_STATE_FILE="$POLICY_STATE_DIR/autopilot_policy.json"
POLICY_HISTORY_FILE="$ROOT/state/analytics/autopilot_policy_history.jsonl"
POLICY_CONTROLLER_SCRIPT="$ROOT/tools/wvo_mcp/scripts/autopilot_policy.py"
POLICY_PROVIDER_USED="codex"
POLICY_MODEL_USED="$AUTOPILOT_MODEL"
POLICY_FALLBACK_USED=0
POLICY_ATTEMPTS=0
POLICY_LAST_DURATION=0
POLICY_LAST_STATUS="unknown"
POLICY_LAST_COMPLETED_AT=""
CRITICS_BACKOFF_FILE="$ROOT/state/autopilot_critics_backoff.json"
CRITICS_BACKOFF_WINDOW=${CRITICS_BACKOFF_WINDOW:-900}
AUTOPILOT_GIT_SYNC=${WVO_AUTOPILOT_GIT_SYNC:-1}
AUTOPILOT_GIT_REMOTE=${WVO_AUTOPILOT_GIT_REMOTE:-origin}
AUTOPILOT_GIT_BRANCH=${WVO_AUTOPILOT_GIT_BRANCH:-main}
AUTOPILOT_GIT_SKIP_PATTERN=${WVO_AUTOPILOT_GIT_SKIP_PATTERN:-.clean_worktree}
AUTOPILOT_FALLBACK_SESSION=0
export USAGE_LIMIT_BACKOFF

# Allow operator to specify Codex worker count (agent count)
resolve_agent_count() {
  local requested="${AGENTS:-${WVO_AUTOPILOT_AGENTS:-${MCP_AUTOPILOT_COUNT:-${WVO_CODEX_WORKERS:-}}}}"

  if [ -z "$requested" ] && [ "${WVO_AUTOPILOT_INTERACTIVE:-0}" = "1" ]; then
    printf 'How many Codex agents should participate? [default: 3]: ' >&2
    read -r requested
  fi

  if [ -z "$requested" ]; then
    requested=3
  fi

  if ! printf '%s' "$requested" | grep -Eq '^[0-9]+$'; then
    log "⚠️  Invalid agent count '$requested'; falling back to 3"
    requested=3
  fi

  if [ "$requested" -lt 1 ]; then
    log "⚠️  Agent count must be >=1; using 1"
    requested=1
  fi

  export WVO_CODEX_WORKERS="$requested"
  log "Configured Codex agent pool size: $requested"
}

cleanup_stale_reservations() {
  if [ "${WVO_AUTOPILOT_RELEASE_STALE:-1}" != "1" ]; then
    return
  fi
  if ! command -v python >/dev/null 2>&1; then
    log "ℹ️  Reservation cleanup skipped (python unavailable)"
    return
  fi

  local minutes="${WVO_AUTOPILOT_RELEASE_STALE_MINUTES:-180}"
  local cmd=(python "$ROOT/tools/wvo_mcp/scripts/activity_feed.py" --mode release)

  if [ -n "$minutes" ] && [[ "$minutes" =~ ^[0-9]+$ ]] && [ -z "${WVO_AUTOPILOT_RELEASE_ALL_RESERVATIONS:-}" ] && [ -z "${WVO_AUTOPILOT_RELEASE_PATH:-}" ]; then
    cmd+=("--stale-minutes" "$minutes")
  fi

  if [ -n "${WVO_AUTOPILOT_RELEASE_ALL_RESERVATIONS:-}" ]; then
    cmd+=("--all")
  fi

  if [ -n "${WVO_AUTOPILOT_RELEASE_PATH:-}" ]; then
    cmd+=("--file" "${WVO_AUTOPILOT_RELEASE_PATH}")
  fi

  local output
  if output="$("${cmd[@]}" 2>&1)"; then
    if [ -n "$output" ]; then
      while IFS= read -r line; do
        log "🧹 ${line}"
      done <<<"$output"
    else
      log "🧹 Reservation cleanup complete."
    fi
  else
    log "⚠️  Reservation cleanup failed"
    if [ -n "$output" ]; then
      while IFS= read -r line; do
        log "   ${line}"
      done <<<"$output"
    fi
  fi
}

normalise_previous_summary() {
  if [ ! -f "$STATE_FILE" ]; then
    return
  fi
  if ! command -v python >/dev/null 2>&1; then
    return
  fi
  python - "$STATE_FILE" <<'PY' || true
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    summary = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(0)
if isinstance(summary, list):
    summary = next((item for item in summary if isinstance(item, dict)), {}) or {}
elif not isinstance(summary, dict):
    summary = {}
path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
PY
}


# Ensure log directory exists early so we can write pre-bootstrap messages.
mkdir -p "$(dirname "$LOG_FILE")"

AUTOPILOT_LOCK_FILE="$ROOT/state/autopilot.lock"
AUTOPILOT_LOCK_ACQUIRED=0

early_log() {
  local message="${1:-}"
  local stamp
  stamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '%s %s\n' "$stamp" "$message" >>"$LOG_FILE"
}

release_autopilot_lock() {
  if [ "${AUTOPILOT_LOCK_ACQUIRED:-0}" = "1" ]; then
    rm -f "$AUTOPILOT_LOCK_FILE" 2>/dev/null || true
    AUTOPILOT_LOCK_ACQUIRED=0
  fi
}

acquire_autopilot_lock() {
  mkdir -p "$(dirname "$AUTOPILOT_LOCK_FILE")"

  if ln -s "$$" "$AUTOPILOT_LOCK_FILE" 2>/dev/null; then
    AUTOPILOT_LOCK_ACQUIRED=1
    return 0
  fi

  local existing_pid=""
  if [ -L "$AUTOPILOT_LOCK_FILE" ]; then
    existing_pid="$(readlink "$AUTOPILOT_LOCK_FILE" 2>/dev/null || true)"
  elif [ -f "$AUTOPILOT_LOCK_FILE" ]; then
    existing_pid="$(cat "$AUTOPILOT_LOCK_FILE" 2>/dev/null | tr -d '[:space:]' || true)"
  fi

  if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
    early_log "[autopilot] Refusing to start duplicate instance; existing autopilot PID ${existing_pid} active."
    printf 'Autopilot already running (pid=%s). If this is unexpected, terminate that process or remove %s.\n' \
      "$existing_pid" "$AUTOPILOT_LOCK_FILE" >&2
    exit 2
  fi

  if [ -n "$existing_pid" ]; then
    early_log "[autopilot] Removing stale autopilot lock recorded for pid ${existing_pid}."
  else
    early_log "[autopilot] Removing stale autopilot lock."
  fi
  rm -f "$AUTOPILOT_LOCK_FILE" 2>/dev/null || true

  if ln -s "$$" "$AUTOPILOT_LOCK_FILE" 2>/dev/null; then
    AUTOPILOT_LOCK_ACQUIRED=1
    return 0
  fi

  early_log "[autopilot] Unable to acquire autopilot lock at ${AUTOPILOT_LOCK_FILE}; aborting."
  printf 'Unable to acquire autopilot lock at %s. Ensure no other instance is running.\n' \
    "$AUTOPILOT_LOCK_FILE" >&2
  exit 2
}

acquire_autopilot_lock

# Optionally restart MCP before doing anything else unless skipped explicitly.
if [ "${WVO_AUTOPILOT_FORCE_RESTART:-0}" = "1" ] && [ -x "$ROOT/scripts/restart_mcp.sh" ]; then
  echo "[autopilot] restarting MCP via scripts/restart_mcp.sh" >>"$LOG_FILE"
  if ! "$ROOT/scripts/restart_mcp.sh" >>"$LOG_FILE" 2>&1; then
    echo "[autopilot] restart_mcp.sh exited with non-zero status; continuing" >>"$LOG_FILE"
  fi
fi

ACCOUNT_MANAGER="$ROOT/tools/wvo_mcp/scripts/account_manager.py"
ACCOUNTS_CONFIG="$ROOT/state/accounts.yaml"
ACCOUNT_MANAGER_ENABLED=1
DEFAULT_CODEX_HOME="${CODEX_HOME:-$ROOT/.accounts/codex/default}"
ENABLE_CLAUDE_EVAL=${ENABLE_CLAUDE_EVAL:-1}
CLAUDE_EVAL_COOLDOWN=${CLAUDE_EVAL_COOLDOWN:-900}
CLAUDE_EVAL_FILE="${CLAUDE_EVAL_FILE:-$ROOT/state/autopilot_claude_eval.txt}"
CURRENT_CODEX_ACCOUNT=""
CURRENT_CLAUDE_ACCOUNT=""
CLAUDE_BIN_CMD="claude"
CLAUDE_ACCOUNT_ENV_JSON="null"

AUTH_CACHE="$ROOT/state/auth_cache.json"
AUTH_CACHE_TTL=${AUTH_CACHE_TTL:-900}
MCP_REGISTRY="$ROOT/state/mcp_registry.json"
AUTH_STATUS_RAW=""
CLAUDE_STATUS_RAW=""
AUTH_STATUS_EMAIL=""
CURRENT_CODEX_EXPECTED_EMAIL=""
CURRENT_CODEX_LABEL=""
LAST_FAILURE_REASON=""
LAST_FAILURE_DETAILS=""
CLAUDE_ACCOUNTS_AVAILABLE=0
if [ -z "${WVO_ENABLE_WEB_INSPIRATION+x}" ]; then
  if [ -n "${WVO_CLI_STUB_EXEC_JSON:-}" ]; then
    # Stubbed execution in tests; skip heavy Playwright bootstrap.
    WVO_ENABLE_WEB_INSPIRATION=0
  elif [ "${WVO_CAPABILITY:-medium}" = "high" ]; then
    WVO_ENABLE_WEB_INSPIRATION=1
  else
    WVO_ENABLE_WEB_INSPIRATION=0
  fi
else
  WVO_ENABLE_WEB_INSPIRATION=${WVO_ENABLE_WEB_INSPIRATION}
fi
export WVO_ENABLE_WEB_INSPIRATION

# ════════════════════════════════════════════════════════════════════════════════
# TIMEOUT INFRASTRUCTURE
# ════════════════════════════════════════════════════════════════════════════════
# Provides robust timeout wrapper that works on macOS without GNU timeout.
# Handles signal propagation, process cleanup, and graceful degradation.
# ════════════════════════════════════════════════════════════════════════════════

# Global process tracking for cleanup
declare -a WVO_TIMEOUT_PIDS=()

# Cleanup handler - kills all tracked child processes
cleanup_timeout_processes() {
  local exit_code
  if [ $# -gt 0 ]; then
    exit_code=$1
  else
    exit_code=$?
  fi

  # Clean up timeout-tracked processes
  if [ ${#WVO_TIMEOUT_PIDS[@]} -gt 0 ]; then
    for pid in "${WVO_TIMEOUT_PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        kill -TERM "$pid" 2>/dev/null || true
        sleep 0.5
        kill -9 "$pid" 2>/dev/null || true
      fi
    done
    WVO_TIMEOUT_PIDS=()
  fi
  return $exit_code
}

handle_exit() {
  local exit_code=$?
  cleanup_timeout_processes "$exit_code" || true
  release_autopilot_lock
  return "$exit_code"
}

handle_sigint() {
  local exit_code=130
  if declare -f log >/dev/null 2>&1; then
    log "Autopilot interrupted by operator (SIGINT); cleaning up."
  else
    early_log "[autopilot] Autopilot interrupted by operator (SIGINT); cleaning up."
    printf 'Autopilot interrupted by operator (SIGINT); shutting down.\n' >&2
  fi

  # Kill all child processes of this script
  pkill -P $$ 2>/dev/null || true

  # Kill any codex processes that might be running
  pkill -f "codex exec.*weathervane_orchestrator" 2>/dev/null || true

  cleanup_timeout_processes "$exit_code" || true
  release_autopilot_lock
  exit "$exit_code"
}

handle_sigterm() {
  local exit_code=143
  if declare -f log >/dev/null 2>&1; then
    log "Autopilot received SIGTERM; cleaning up."
  else
    early_log "[autopilot] Autopilot received SIGTERM; cleaning up."
    printf 'Autopilot received SIGTERM; shutting down.\n' >&2
  fi

  # Kill all child processes of this script
  pkill -P $$ 2>/dev/null || true

  # Kill any codex processes that might be running
  pkill -f "codex exec.*weathervane_orchestrator" 2>/dev/null || true

  cleanup_timeout_processes "$exit_code" || true
  release_autopilot_lock
  exit "$exit_code"
}

trap handle_exit EXIT
trap handle_sigint INT
trap handle_sigterm TERM

# run_with_timeout: Execute command with timeout
# Args: timeout_seconds command [args...]
# Returns: 124 if timeout, command exit code otherwise
run_with_timeout() {
  local timeout_seconds="$1"
  shift
  local cmd=("$@")

  # Run command in background
  "${cmd[@]}" &
  local cmd_pid=$!
  WVO_TIMEOUT_PIDS+=("$cmd_pid")

  # Start timeout monitor in background
  (
    sleep "$timeout_seconds"
    if kill -0 "$cmd_pid" 2>/dev/null; then
      kill -TERM "$cmd_pid" 2>/dev/null || true
      sleep 1
      kill -9 "$cmd_pid" 2>/dev/null || true
    fi
  ) &
  local monitor_pid=$!

  # Wait for command to complete
  local exit_code=0
  if wait "$cmd_pid" 2>/dev/null; then
    exit_code=$?
  else
    exit_code=$?
  fi

  # Kill monitor if still running
  kill -9 "$monitor_pid" 2>/dev/null || true
  wait "$monitor_pid" 2>/dev/null || true

  # Remove from tracked PIDs
  WVO_TIMEOUT_PIDS=("${WVO_TIMEOUT_PIDS[@]/$cmd_pid}")

  # Check if process was killed (timeout occurred)
  if ! kill -0 "$cmd_pid" 2>/dev/null && [ $exit_code -ne 0 ]; then
    # Process no longer exists and exited with error - likely timeout
    if [ $exit_code -gt 128 ]; then
      return 124  # GNU timeout convention for timeout
    fi
  fi

  return $exit_code
}

# run_with_timeout_capture: Execute command with timeout and capture output
# Args: timeout_seconds command [args...]
# Returns: 124 if timeout, command exit code otherwise
# Stdout: command output
run_with_timeout_capture() {
  local timeout_seconds="$1"
  shift
  local cmd=("$@")
  local tmp_output
  tmp_output=$(mktemp)

  # Run command with output capture
  ( "${cmd[@]}" > "$tmp_output" 2>&1 ) &
  local cmd_pid=$!
  WVO_TIMEOUT_PIDS+=("$cmd_pid")

  # Start timeout monitor
  (
    sleep "$timeout_seconds"
    if kill -0 "$cmd_pid" 2>/dev/null; then
      kill -TERM "$cmd_pid" 2>/dev/null || true
      sleep 1
      kill -9 "$cmd_pid" 2>/dev/null || true
    fi
  ) &
  local monitor_pid=$!

  # Wait for command
  local exit_code=0
  if wait "$cmd_pid" 2>/dev/null; then
    exit_code=$?
  else
    exit_code=$?
  fi

  # Kill monitor
  kill -9 "$monitor_pid" 2>/dev/null || true
  wait "$monitor_pid" 2>/dev/null || true

  # Remove from tracked PIDs
  WVO_TIMEOUT_PIDS=("${WVO_TIMEOUT_PIDS[@]/$cmd_pid}")

  # Output results
  if [ -f "$tmp_output" ]; then
    cat "$tmp_output"
    rm -f "$tmp_output"
  fi

  # Check for timeout
  if ! kill -0 "$cmd_pid" 2>/dev/null && [ $exit_code -gt 128 ]; then
    return 124
  fi

  return $exit_code
}

# ════════════════════════════════════════════════════════════════════════════════
# END TIMEOUT INFRASTRUCTURE
# ════════════════════════════════════════════════════════════════════════════════

write_offline_summary() {
  local reason="${1:-offline}"
  local details="${2:-}"
  AUTOPILOT_FALLBACK_SESSION=1
  if python "$ROOT/tools/wvo_mcp/scripts/offline_summary.py" --output "$STATE_FILE" --reason "$reason" --details "$details"; then
    log "Recorded offline summary ($reason) to $STATE_FILE"
  else
    log "⚠️  Failed to record offline summary via offline_summary.py"
  fi
}

run_offline_product_cycle() {
  log "⚠️ run_offline_product_cycle is DEPRECATED and PROHIBITED."
  log "   Offline mode generates fake summaries and is deceptive."
  log "   This function is now a no-op. Autopilot requires real connectivity."
  # NEVER run fake offline work:
  # if [ -x "$ROOT/scripts/run_product_cycle.py" ]; then
  #   "$ROOT/scripts/run_product_cycle.py"
  # fi
}

ensure_top_permissions() {
  if [ "${WVO_AUTOPILOT_TOP_PERMISSIONS_APPLIED:-0}" = "1" ]; then
    return
  fi
  if ! command -v python >/dev/null 2>&1; then
    log "Skipping top-permission bootstrap (python unavailable)."
    return
  fi
  local instructions_path="${BASE_INSTRUCTIONS:-$ROOT/docs/wvo_prompt.md}"
  if python "$ROOT/tools/wvo_mcp/scripts/autopilot_console_menu.py" bootstrap --root "$ROOT" --workspace "$ROOT" --instructions "$instructions_path" >/dev/null 2>&1; then
    log "Top permissions applied to configured provider accounts."
  else
    log "⚠️  Top-permission bootstrap reported issues (see autopilot console for details)."
  fi
  export WVO_AUTOPILOT_TOP_PERMISSIONS_APPLIED=1
}

fatal_offline_fallback() {
  local reason="${1:-offline}"
  local details="${2:-}"
  local attempt_number="${3:-}"
  local attempt_start_iso="${4:-}"
  local attempt_start_epoch="${5:-}"
  local skip_summary="${6:-0}"
  local exit_code="${7:-3}"

  AUTOPILOT_FALLBACK_SESSION=1
  announce_phase "Offline Fallback" "Autopilot unavailable: ${reason}" "" "!!"

  if [ "$skip_summary" != "1" ]; then
    write_offline_summary "$reason" "$details"
  fi

  if [ -n "$attempt_number" ] && [ -n "$attempt_start_iso" ] && [ -n "$attempt_start_epoch" ]; then
    local attempt_end_iso
    local attempt_end_epoch
    local duration
    attempt_end_iso="$(timestamp)"
    attempt_end_epoch=$(date -u +%s)
    duration=$((attempt_end_epoch - attempt_start_epoch))
    append_usage_telemetry "offline_fallback" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
  fi

  log "Offline fallback is fatal. Exiting autopilot (reason=${reason})."
  exit "$exit_code"
}

should_skip_auth_check() {
  local provider="$1"
  local payload="$2"
  printf '%s' "$payload" | python - <<'PY' "$AUTH_CACHE" "$provider" "$AUTH_CACHE_TTL"
import hashlib
import json
import os
import sys
import time

cache_path, provider, ttl = sys.argv[1:]
payload = sys.stdin.read()
fingerprint = hashlib.sha1(payload.encode('utf-8')).hexdigest()

if not os.path.exists(cache_path):
    print("run")
    raise SystemExit

try:
    with open(cache_path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
except Exception:
    print("run")
    raise SystemExit

entry = data.get(provider)
if not isinstance(entry, dict):
    print("run")
    raise SystemExit

last_checked = entry.get("last_checked", 0)
cached_fingerprint = entry.get("fingerprint")
now = time.time()
try:
    ttl = int(ttl)
except ValueError:
    ttl = 0

if cached_fingerprint == fingerprint and ttl > 0 and now - last_checked < ttl:
    print("skip")
else:
    print("run")
PY
}

update_auth_cache_record() {
  local provider="$1"
  local payload="$2"
  printf '%s' "$payload" | python - <<'PY' "$AUTH_CACHE" "$provider"
import hashlib
import json
import os
import sys
import time

cache_path, provider = sys.argv[1:]
payload = sys.stdin.read()
fingerprint = hashlib.sha1(payload.encode('utf-8')).hexdigest()

try:
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
except OSError:
    pass

data = {}
if os.path.exists(cache_path):
    try:
        with open(cache_path, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
    except Exception:
        data = {}

if not isinstance(data, dict):
    data = {}

data[provider] = {
    "fingerprint": fingerprint,
    "last_checked": time.time(),
}

with open(cache_path, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, indent=2)
PY
}

critics_backoff_update_from_summary() {
  if [ -f "$CRITICS_BACKOFF_FILE" ]; then
    rm -f "$CRITICS_BACKOFF_FILE" 2>/dev/null || true
  fi
  return 0
}

critics_backoff_status() {
  if [ -f "$CRITICS_BACKOFF_FILE" ]; then
    rm -f "$CRITICS_BACKOFF_FILE" 2>/dev/null || true
  fi
  printf '0||\n'
}

should_skip_mcp_registration() {
  local account_id="$1"
  local entry="$2"
  local workspace="$3"
  python - <<'PY' "$MCP_REGISTRY" "$account_id" "$entry" "$workspace"
import json
import os
import sys

path, account, entry, workspace = sys.argv[1:5]

if not account:
    account = "default"

if not os.path.exists(path):
    print("run")
    raise SystemExit

try:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
except Exception:
    print("run")
    raise SystemExit

if not isinstance(data, dict):
    print("run")
    raise SystemExit

info = data.get(account)
if not isinstance(info, dict):
    print("run")
    raise SystemExit

if info.get("entry") == entry and info.get("workspace") == workspace:
    print("skip")
else:
    print("run")
PY
}

update_mcp_registry() {
  local account_id="$1"
  local entry="$2"
  local workspace="$3"
  python - <<'PY' "$MCP_REGISTRY" "$account_id" "$entry" "$workspace"
import json
import os
import sys
import time

path, account, entry, workspace = sys.argv[1:5]

if not account:
    account = "default"

try:
    os.makedirs(os.path.dirname(path), exist_ok=True)
except OSError:
    pass

data = {}
if os.path.exists(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:
        data = {}

if not isinstance(data, dict):
    data = {}

data[account] = {
    "entry": entry,
    "workspace": workspace,
    "updated_at": time.time(),
}

with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2)
PY
}

ensure_web_inspiration_ready() {
  if [ "$WVO_ENABLE_WEB_INSPIRATION" != "1" ]; then
    return
  fi

  log "Preparing web inspiration tooling..."

  if ! npm ls --prefix "$ROOT/tools/wvo_mcp" playwright >/dev/null 2>&1; then
    log "  Installing Playwright (tools/wvo_mcp)..."
    if ! npm install --prefix "$ROOT/tools/wvo_mcp" playwright --silent --no-fund --no-audit >/dev/null 2>&1; then
      log "  ⚠️ Failed to install Playwright automatically. Run 'npm install --prefix tools/wvo_mcp playwright' and retry."
      return
    fi
  fi

  if command -v npx >/dev/null 2>&1; then
    if ! npx --yes --prefix "$ROOT/tools/wvo_mcp" playwright install chromium --with-deps >/dev/null 2>&1; then
      log "  ⚠️ Playwright browser install failed. Web inspiration disabled for this run."
      WVO_ENABLE_WEB_INSPIRATION=0
      export WVO_ENABLE_WEB_INSPIRATION
    else
      log "  ✅ Playwright Chromium runtime ready."
    fi
  else
    log "  ⚠️ npx unavailable; cannot install Playwright browsers automatically."
  fi
}

fetch_auth_status() {
  local provider="${1:-codex}"
  if [ "$provider" = "codex" ]; then
    AUTH_STATUS_EMAIL=""
    local token_identity=""
    token_identity=$(codex_identity_from_tokens 2>/dev/null || true)
    if [ -n "$token_identity" ]; then
      AUTH_STATUS_EMAIL="$token_identity"
    fi
    # Use timeout for codex commands (10s)
    AUTH_STATUS_RAW=$(run_with_timeout_capture 10 bash -c "CODEX_HOME='$CODEX_HOME' codex login status 2>&1" || true)
    if printf '%s\n' "$AUTH_STATUS_RAW" | grep -Eqi 'unknown command|unexpected argument|unrecognized option'; then
      AUTH_STATUS_RAW=$(run_with_timeout_capture 10 bash -c "run_with_ptty env CODEX_HOME='$CODEX_HOME' codex status 2>&1" || true)
    fi
    if [ -z "$AUTH_STATUS_RAW" ] && codex_tokens_present; then
      AUTH_STATUS_RAW="Codex tokens detected"
    fi
    [ -n "$AUTH_STATUS_RAW" ] || [ -n "$AUTH_STATUS_EMAIL" ]
  elif [ "$provider" = "claude" ]; then
    if [ -z "${CLAUDE_BIN_CMD-}" ]; then
      return 1
    fi
    # Use timeout for claude commands (10s) - prevents hanging on unauthenticated accounts
    CLAUDE_STATUS_RAW=$(run_with_timeout_capture 10 bash -c "env CLAUDE_CONFIG_DIR='${CLAUDE_CONFIG_DIR-}' '$CLAUDE_BIN_CMD' status 2>&1" || echo "timeout")
    if [ "$CLAUDE_STATUS_RAW" = "timeout" ]; then
      CLAUDE_STATUS_RAW=""
      return 1
    fi
    [ -n "$CLAUDE_STATUS_RAW" ]
  else
    return 1
  fi
}

provider_authenticated() {
  local provider="$1"
  case "$provider" in
    codex)
      if [ -n "$AUTH_STATUS_EMAIL" ]; then
        printf 'true'
        return
      fi
      if printf '%s\n' "$AUTH_STATUS_RAW" | grep -Eqi 'logged in|authenticated as|account:'; then
        printf 'true'
        return
      fi
      if codex_tokens_present; then
        printf 'true'
        return
      fi
      printf 'false'
      ;;
    claude)
      if printf '%s\n' "$CLAUDE_STATUS_RAW" | grep -Eqi 'logged in as'; then
        printf 'true'
      else
        printf 'false'
      fi
      ;;
    *)
      printf 'false'
      ;;
  esac
}

codex_account_display() {
  local account_id="$1"
  local account_email="${2:-}"
  local account_label="${3:-}"
  local primary=""
  if [ -n "$account_email" ]; then
    primary="$account_email"
    if [ -n "$account_label" ]; then
      printf '%s (%s)' "$primary" "$account_label"
    else
      printf '%s' "$primary"
    fi
    return
  fi
  if [ -n "$account_label" ]; then
    printf '%s' "$account_label"
    return
  fi
  printf '%s' "$account_id"
}

log_codex_identity() {
  local account_id="$1"
  local account_email="${2:-}"
  local account_label="${3:-}"
  local display
  display=$(codex_account_display "$account_id" "$account_email" "$account_label")
  if [ -n "$AUTH_STATUS_EMAIL" ]; then
    log "  🔐 Codex CLI reports login as $AUTH_STATUS_EMAIL for $display"
    return
  fi
  if printf '%s\n' "$AUTH_STATUS_RAW" | grep -Eqi 'logged in'; then
    local identity
    identity=$(printf '%s\n' "$AUTH_STATUS_RAW" | awk '/[Ll]ogged in (as)?/ {print $4}')
    if [ -n "$identity" ]; then
      log "  🔐 Codex CLI reports login as $identity for $display"
    else
      log "  🔐 Codex CLI indicates login but did not return a username for $display"
    fi
    return
  fi

  local auth_file="$CODEX_HOME/auth.json"
  if [ -f "$auth_file" ]; then
    local token_identity
    token_identity=$(codex_identity_from_tokens 2>/dev/null || true)
    if [ -n "$token_identity" ]; then
      log "  🔐 Codex auth store lists identity $token_identity for $display"
      return
    fi
    if codex_tokens_present; then
      log "  🔐 Codex auth store present but did not expose identity for $display"
      return
    fi
  fi

  log "  🔐 Codex CLI does not see an active login for $display"
}

codex_login_command() {
  local account_home="$1"
  local quoted_home
  quoted_home=$(printf '%q' "$account_home")
  printf 'CODEX_HOME=%s codex login' "$quoted_home"
}

claude_account_display() {
  local account_id="$1"
  local account_label="${2:-}"
  local account_email="${3:-}"
  if [ -n "$account_label" ] && [ -n "$account_email" ]; then
    printf '%s (%s)' "$account_label" "$account_email"
  elif [ -n "$account_label" ]; then
    printf '%s' "$account_label"
  elif [ -n "$account_email" ]; then
    printf '%s (%s)' "$account_id" "$account_email"
  else
    printf '%s' "$account_id"
  fi
}

format_claude_login_command() {
  local bin="$1"
  local env_json="${2:-null}"
  python - <<'PY' "$bin" "$env_json"
import json
import shlex
import sys

bin = sys.argv[1]
raw = sys.argv[2]

env = {}
try:
    env = json.loads(raw)
    if env is None:
        env = {}
except Exception:
    env = {}

parts = []
if isinstance(env, dict) and env:
    parts.append("env")
    for key, value in env.items():
        if value is None:
            continue
        parts.append(f"{key}={value}")
parts.extend([bin, "login", "--dangerously-skip-permissions"])
print(" ".join(shlex.quote(part) for part in parts))
PY
}

codex_tokens_present() {
  local auth_file="$CODEX_HOME/auth.json"
  if [ ! -f "$auth_file" ]; then
    return 1
  fi
  python - <<'PY' "$auth_file"
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(1)

tokens = (
    data.get("refresh_token")
    or data.get("access_token")
    or (data.get("tokens") or {}).get("refresh_token")
    or (data.get("tokens") or {}).get("access_token")
    or (data.get("tokens") or {}).get("id_token")
)

if tokens:
    raise SystemExit(0)
raise SystemExit(1)
PY
}

codex_identity_from_tokens() {
  local auth_file="$CODEX_HOME/auth.json"
  if [ ! -f "$auth_file" ]; then
    return
  fi
  python - <<'PY' "$auth_file"
import base64
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    print("", end="")
    raise SystemExit(0)

tokens = data.get("tokens") or {}

def decode_jwt(token: str) -> dict:
    if not isinstance(token, str) or "." not in token:
        return {}
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload + padding)
        return json.loads(decoded.decode("utf-8"))
    except Exception:
        return {}

email = (
    data.get("account_email")
    or (data.get("profile") or {}).get("email")
    or tokens.get("account_email")
    or ""
)

claims = {}
if not email:
    claims = decode_jwt(tokens.get("id_token"))
    email = claims.get("email") or claims.get("preferred_username") or ""

if not email:
    claims = decode_jwt(tokens.get("access_token"))
    email = claims.get("email") or claims.get("preferred_username") or ""

if not email:
    email = tokens.get("account_id") or claims.get("account_id") or data.get("account_id") or ""

print(email.strip(), end="")
PY
}

run_with_ptty() {
  local output
  if command -v script >/dev/null 2>&1; then
    output=$(script -q /dev/null "$@" 2>&1)
    local status=$?
    if [ $status -eq 0 ]; then
      printf '%s' "$output"
      return 0
    fi
    if printf '%s' "$output" | grep -qi 'openpty'; then
      output=$("$@" 2>&1)
      status=$?
      printf '%s' "$output"
      return $status
    fi
    printf '%s' "$output"
    return $status
  fi
  output=$("$@" 2>&1)
  local status=$?
  printf '%s' "$output"
  return $status
}

CODEX_HOME="${CODEX_HOME:-$ROOT/.codex}"
mkdir -p "$CODEX_HOME"
export CODEX_HOME
export CODEX_PROFILE="$WVO_CAPABILITY"
WVO_DEFAULT_PROVIDER="${WVO_DEFAULT_PROVIDER:-codex}"
export WVO_DEFAULT_PROVIDER
export WVO_ALLOW_PROTECTED_WRITES="${WVO_ALLOW_PROTECTED_WRITES:-1}"

STREAM_TO_STDOUT="${WVO_AUTOPILOT_STREAM:-}"
if [ -z "$STREAM_TO_STDOUT" ]; then
  if [ "${WVO_AUTOPILOT_STREAM_LOG:-0}" = "1" ]; then
    STREAM_TO_STDOUT=0
  elif [ -t 1 ] && [ "${WVO_AUTOPILOT_QUIET:-0}" != "1" ]; then
    STREAM_TO_STDOUT=1
  else
    STREAM_TO_STDOUT=0
  fi
fi
if [ "${WVO_AUTOPILOT_QUIET:-0}" = "1" ]; then
  STREAM_TO_STDOUT=0
elif [ "${STREAM_TO_STDOUT:-0}" != "1" ] && [ "${WVO_AUTOPILOT_STREAM_LOG:-0}" = "1" ]; then
  STREAM_TO_STDOUT=0
fi
if [ "$STREAM_TO_STDOUT" -eq 0 ]; then
  WVO_AUTOPILOT_STREAM=0
fi
if [ -n "${WVO_CLI_STUB_EXEC_JSON:-}" ] || [ -n "${WVO_CLI_STUB_EXEC_PATH:-}" ] || [ "${WVO_AUTOPILOT_JSON_ONLY:-0}" = "1" ]; then
  STREAM_TO_STDOUT=0
  WVO_AUTOPILOT_STREAM=0
fi

append_log_line() {
  printf '%s\n' "$1" >>"$LOG_FILE"
}

console_emit() {
  append_log_line "$1"
  if [ "$STREAM_TO_STDOUT" -eq 1 ]; then
    printf '%s\n' "$1"
  fi
}

console_blank() {
  append_log_line ""
  if [ "$STREAM_TO_STDOUT" -eq 1 ]; then
    printf '\n'
  fi
}

timestamp(){ date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log(){ console_emit "$(timestamp) $*"; }

resolve_agent_count

cleanup_stale_reservations

normalise_previous_summary

ensure_top_permissions

log_timeout() {
  local cmd_desc="$1"
  local timeout_sec="$2"
  log "⏱️  TIMEOUT: $cmd_desc exceeded ${timeout_sec}s limit and was terminated"
  printf '%s\n' "$(timestamp) TIMEOUT: $cmd_desc (${timeout_sec}s)" >> "$ROOT/state/timeout_events.log"
}

log_health_check() {
  local check_name="$1"
  local status="$2"
  local details="${3:-}"
  if [ "$status" = "ok" ]; then
    log "✅ Health check: $check_name - OK${details:+ ($details)}"
  else
    log "❌ Health check: $check_name - FAILED${details:+ ($details)}"
  fi
}

truncate_text() {
  local text="${1:-}"
  local max="${2:-60}"
  local length=${#text}
  if [ "$length" -le "$max" ]; then
    printf '%s' "$text"
    return
  fi
  local keep=$(( max - 3 ))
  if [ "$keep" -le 0 ]; then
    printf '...'
    return
  fi
  printf '%s…' "${text:0:keep}"
}

progress_bar() {
  local current=${1:-0}
  local total=${2:-100}
  local width=${3:-20}
  if [ "$total" -le 0 ]; then
    total=1
  fi
  if [ "$current" -lt 0 ]; then
    current=0
  elif [ "$current" -gt "$total" ]; then
    current=$total
  fi
  local percent=$(( current * 100 / total ))
  local filled=$(( percent * width / 100 ))
  local empty=$(( width - filled ))
  local bar_filled=""
  local bar_empty=""
  if [ "$filled" -gt 0 ]; then
    bar_filled="$(printf '%*s' "$filled" '' | tr ' ' '█')"
  fi
  if [ "$empty" -gt 0 ]; then
    bar_empty="$(printf '%*s' "$empty" '' | tr ' ' '░')"
  fi
  printf '[%s%s] %3d%%' "$bar_filled" "$bar_empty" "$percent"
}

announce_phase() {
  local title="${1:-Stage}"
  local subtitle="${2:-}"
  local gauge="${3:-}"
  local icon="${4:-⚙️}"
  local edge_top="╔═══════════════════════════════════════════════════════════════════════════════╗"
  local edge_bot="╚═══════════════════════════════════════════════════════════════════════════════╝"

  console_blank
  console_emit "$edge_top"
  console_emit "$(printf '║ %s %-67s║' "$icon" "$(truncate_text "$title" 67)")"
  if [ -n "$subtitle" ]; then
    console_emit "$(printf '║   %-68s║' "$(truncate_text "$subtitle" 68)")"
  fi
  if [ -n "$gauge" ]; then
    console_emit "$(printf '║   %-68s║' "$(truncate_text "$gauge" 68)")"
  fi
  console_emit "$edge_bot"

  if [ -n "$subtitle" ]; then
    log "${icon} ${title} :: ${subtitle}"
  else
    log "${icon} ${title}"
  fi
}

ALLOW_OFFLINE_FALLBACK="${WVO_AUTOPILOT_ALLOW_OFFLINE_FALLBACK:-0}"
abort_autopilot_offline() {
  local reason="${1:-offline}"
  local details="${2:-}"
  log "❌ AUTOPILOT CANNOT RUN OFFLINE. Reason: ${reason}"
  if [ -n "$details" ]; then
    log "  Details: $details"
  fi
  log "  OFFLINE MODE IS PROHIBITED - autopilot requires real API connectivity."
  log "  Fix the network/authentication issue before running autopilot."
  # NEVER run fake offline product cycle - this is deceptive
  # run_offline_product_cycle
  fatal_offline_fallback "$reason" "$details" "" "" "" 0 1
}

render_banner() {
  local capability_raw="${WVO_CAPABILITY:-${CODEX_PROFILE:-medium}}"
  local capability_upper
  capability_upper="$(printf '%s' "$capability_raw" | tr '[:lower:]' '[:upper:]')"

  local capability_value
  case "${capability_upper}" in
    HIGH) capability_value=5 ;;
    MEDIUM) capability_value=3 ;;
    LOW) capability_value=1 ;;
    *) capability_value=0 ;;
  esac
  local gauge
  gauge="$(progress_bar "$capability_value" 5 15)"
  local workspace_display
  workspace_display="$(truncate_text "$ROOT" 56)"
  local log_display
  log_display="$(truncate_text "$LOG_FILE" 56)"
  local now_display
  now_display="$(timestamp)"
  local edge_top="╔═══════════════════════════════════════════════════════════════════════════════╗"
  local edge_mid="╠═══════════════════════════════════════════════════════════════════════════════╣"
  local edge_bot="╚═══════════════════════════════════════════════════════════════════════════════╝"

  console_blank
  console_emit "$edge_top"
  console_emit "║ 🌪  WEATHER VANE AUTOPILOT CONSOLE                                           ║"
  console_emit "$edge_mid"
  console_emit "$(printf '║ Capability : %-16s %-33s║' "$capability_upper" "$gauge")"
  console_emit "$(printf '║ Workspace  : %-56s║' "$workspace_display")"
  console_emit "$(printf '║ Log File   : %-56s║' "$log_display")"
  console_emit "$(printf '║ UTC Start  : %-56s║' "$now_display")"
  console_emit "$edge_mid"
  console_emit "║ Forecast   : Jetstream engaged. Critics expect world-class polish.           ║"
  console_emit "$edge_bot"

  log "Autopilot console initialised (capability=${capability_upper})"
  log "Workspace: $ROOT"
  log "Log file : $LOG_FILE"
}

record_blocker() {
  local reason="${1:-unknown}"
  local details="${2:-}"
  local memo_path="$ROOT/state/task_memos/autopilot_blockers.json"
  python - <<'PY' "$memo_path" "$reason" "$details"
import json
import os
import sys
from datetime import datetime, timezone

path = os.path.abspath(sys.argv[1])
reason = sys.argv[2]
details = sys.argv[3]

entry = {
    "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "reason": reason,
    "details": details[:2000],
}

os.makedirs(os.path.dirname(path), exist_ok=True)

records = []
if os.path.exists(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            records = json.load(fh) or []
    except Exception:
        records = []

if not isinstance(records, list):
    records = []

records.append(entry)

with open(path, "w", encoding="utf-8") as fh:
    json.dump(records[-200:], fh, indent=2)
PY
}

render_banner
capability_state="$(printf '%s' "${WVO_CAPABILITY:-${CODEX_PROFILE:-medium}}" | tr '[:upper:]' '[:lower:]')"
case "$capability_state" in
  high) capability_meter="$(progress_bar 5 5)" ;;
  medium) capability_meter="$(progress_bar 3 5)" ;;
  low) capability_meter="$(progress_bar 1 5)" ;;
  *) capability_meter="$(progress_bar 0 5)" ;;
esac
announce_phase "Capability Profile" "CODEX_PROFILE=${CODEX_PROFILE:-unset}; WVO_CAPABILITY=${WVO_CAPABILITY:-unset}" "$capability_meter" ">>"

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI not found in PATH. Install Codex CLI before running autopilot." >&2
  abort_autopilot_offline "codex-cli-missing" "Codex CLI not found in PATH."
fi

create_accounts_template() {
  cat <<'YAML' > "$ACCOUNTS_CONFIG"
# WeatherVane autopilot accounts configuration
# Add additional accounts by copying the sample entries below.
# Home directories / CLAUDE_CONFIG_DIR will be auto-generated under
#   $ROOT/.accounts/<provider>/<account_id>
# after you supply an id.

codex:
  - id: codex_primary
    profile: weathervane_orchestrator
    email: you@example.com
    label: personal

claude:
  - id: claude_primary
#  - id: claude_secondary
#    bin: /usr/local/bin/claude
#    env:
#      CLAUDE_CONFIG_DIR: 
YAML
  log "Created $ACCOUNTS_CONFIG. Update account ids and rerun autopilot."
}

ensure_accounts_config() {
  if [ ! -f "$ACCOUNT_MANAGER" ]; then
    log "Account manager helper missing at $ACCOUNT_MANAGER; falling back to single-account mode (CODEX_HOME=$DEFAULT_CODEX_HOME)."
    ACCOUNT_MANAGER_ENABLED=0
    CODEX_HOME="$DEFAULT_CODEX_HOME"
    mkdir -p "$CODEX_HOME"
    export CODEX_HOME
    return
  fi
  if [ ! -f "$ACCOUNTS_CONFIG" ]; then
    mkdir -p "$(dirname "$ACCOUNTS_CONFIG")"
    create_accounts_template
    log "No accounts.yaml detected. Continuing in single-account mode (CODEX_HOME=$DEFAULT_CODEX_HOME)."
    ACCOUNT_MANAGER_ENABLED=0
    CODEX_HOME="$DEFAULT_CODEX_HOME"
    mkdir -p "$CODEX_HOME"
    export CODEX_HOME
    return
  fi
}

configure_codex_account() {
  python "$CONFIG_SCRIPT" \
    "$CODEX_HOME/config.toml" \
    "$CLI_PROFILE" \
    "$ROOT" \
    "$BASE_INSTRUCTIONS" \
    --model "$AUTOPILOT_MODEL" \
    --sandbox danger-full-access \
    --approval never \
    --reasoning "$AUTOPILOT_REASONING"
}

register_codex_account() {
  local account_id="${1:-${CURRENT_CODEX_ACCOUNT:-default}}"
  local decision
  decision=$(should_skip_mcp_registration "$account_id" "$MCP_ENTRY" "$ROOT")
  if [ "$decision" = "skip" ]; then
    log "Skipping Codex MCP registration for '$account_id' (entry unchanged)."
    return
  fi

  if CODEX_HOME="$CODEX_HOME" codex mcp add weathervane -- node "$MCP_ENTRY" --workspace "$ROOT" >/dev/null 2>&1; then
    update_mcp_registry "$account_id" "$MCP_ENTRY" "$ROOT"
  else
    log "⚠️  Failed to register MCP entry for account '$account_id'."
  fi
}

ensure_codex_auth() {
  local expected_email="${CURRENT_CODEX_EXPECTED_EMAIL:-}"
  local account_label="${CURRENT_CODEX_LABEL:-}"
  local account_id="${CURRENT_CODEX_ACCOUNT:-unknown}"
  local display
  display=$(codex_account_display "$account_id" "$expected_email" "$account_label")
  if fetch_auth_status codex && [ "$(provider_authenticated codex)" = "true" ]; then
    if [ -n "$expected_email" ] && [ -n "$AUTH_STATUS_EMAIL" ] && [ "$AUTH_STATUS_EMAIL" != "$expected_email" ]; then
      log "Codex $display authenticated as $AUTH_STATUS_EMAIL but expected $expected_email."
      log "Run 'CODEX_HOME=$CODEX_HOME codex logout' and login with the correct account."
      abort_autopilot_offline "codex-auth-mismatch" "Authenticated as $AUTH_STATUS_EMAIL but expected $expected_email for $display."
    fi
    log_codex_identity "$account_id" "$expected_email" "$account_label"
    return 0
  fi
  log "Codex $display (CODEX_HOME=$CODEX_HOME) not authenticated."
  log "Codex $display not authenticated. Launching codex login..."
  CODEX_HOME="$CODEX_HOME" codex login || { log "Codex login failed; aborting autopilot."; abort_autopilot_offline "codex-login-failed" "Codex login failed for $display."; }
  if fetch_auth_status codex && [ "$(provider_authenticated codex)" = "true" ]; then
    if [ -n "$expected_email" ] && [ -n "$AUTH_STATUS_EMAIL" ] && [ "$AUTH_STATUS_EMAIL" != "$expected_email" ]; then
      log "Logged in as $AUTH_STATUS_EMAIL but expected $expected_email for $display."
      log "Run 'CODEX_HOME=$CODEX_HOME codex logout' and retry with the correct account."
      abort_autopilot_offline "codex-auth-mismatch" "Logged in as $AUTH_STATUS_EMAIL but expected $expected_email for $display."
    fi
    log_codex_identity "$account_id" "$expected_email" "$account_label"
    log "Codex $display authenticated."
    return 0
  fi

  if codex_tokens_present; then
    local token_identity
    token_identity=$(codex_identity_from_tokens)
    if [ -n "$expected_email" ] && [ -n "$token_identity" ] && [ "$token_identity" != "$expected_email" ]; then
      log "Tokens belong to $token_identity but expected $expected_email for $display."
      log "Run 'CODEX_HOME=$CODEX_HOME codex logout' and login with the correct account."
      abort_autopilot_offline "codex-token-mismatch" "Codex tokens for $display mapped to $token_identity but expected $expected_email."
    fi
    log "Codex tokens detected for $display; continuing despite CLI status output."
    if [ -n "$token_identity" ]; then
      log "  🔐 Token store lists identity $token_identity for $display"
    else
      log_codex_identity "$account_id" "$expected_email" "$account_label"
    fi
    return 0
  fi

  log "Codex authentication still missing after login. Aborting."
  abort_autopilot_offline "codex-auth-missing" "Codex authentication not established after login attempt."
}

ensure_claude_auth() {
  local account_id="${1:-claude}"
  local bin_cmd="${2:-claude}"
  local env_json="${3:-}"
  local display="$account_id"
  local -a env_pairs=()
  local env_line

  if [ -n "$env_json" ] && [ "$env_json" != "null" ]; then
    while IFS= read -r env_line; do
      [ -n "$env_line" ] && env_pairs+=("$env_line")
    done < <(python - <<'PY' "$env_json"
import json, sys
env = json.loads(sys.argv[1])
for key, value in env.items():
    if value is None:
        continue
    print(f"{key}={value}")
PY
)
  fi

  local whoami_output=""
  local status=0
  if [ ${#env_pairs[@]} -gt 0 ]; then
    whoami_output=$(env "${env_pairs[@]}" "$bin_cmd" whoami 2>&1)
    status=$?
  else
    whoami_output=$("$bin_cmd" whoami 2>&1)
    status=$?
  fi

  if [ $status -eq 0 ] && ! printf '%s\n' "$whoami_output" | grep -qi 'invalid api key'; then
    if [ -n "$whoami_output" ]; then
      log "✅ Claude $display authenticated: ${whoami_output}"
    else
      log "✅ Claude $display authenticated."
    fi
    return 0
  fi

  # Skip interactive login during autopilot to avoid blocking
  if [ "${WVO_AUTOPILOT_SKIP_INTERACTIVE_LOGIN:-1}" = "1" ]; then
    log "⚠️ Claude $display not authenticated. Skipping (autopilot mode)."
    if [ ${#env_pairs[@]} -gt 0 ]; then
      log "   To authenticate manually, run: env ${env_pairs[*]} $bin_cmd login"
    else
      log "   To authenticate manually, run: $bin_cmd login"
    fi
    return 1
  fi

  log "Claude $display not authenticated. Launching login..."
  local login_output=""
  if [ ${#env_pairs[@]} -gt 0 ]; then
    login_output=$(run_with_ptty env "${env_pairs[@]}" "$bin_cmd" login)
    status=$?
  else
    login_output=$(run_with_ptty "$bin_cmd" login)
    status=$?
  fi
  printf '%s\n' "$login_output" >> "$LOG_FILE"
  if [ $status -ne 0 ]; then
    log "⚠️ Claude login failed for $display (exit $status)."
    return 1
  fi

  if [ ${#env_pairs[@]} -gt 0 ]; then
    whoami_output=$(env "${env_pairs[@]}" "$bin_cmd" whoami 2>&1)
    status=$?
  else
    whoami_output=$("$bin_cmd" whoami 2>&1)
    status=$?
  fi

  if [ $status -eq 0 ] && ! printf '%s\n' "$whoami_output" | grep -qi 'invalid api key'; then
    if [ -n "$whoami_output" ]; then
      log "✅ Claude $display authenticated after login: ${whoami_output}"
    else
      log "✅ Claude $display authenticated after login."
    fi
    return 0
  fi

  log "⚠️ Claude $display still not authenticated after login attempt."
  return 1
}

log_accounts_overview() {
  local provider="$1"
  local label="$2"
  local json
  if [ "$ACCOUNT_MANAGER_ENABLED" -ne 1 ]; then
    return 1
  fi
  if ! json=$(python "$ACCOUNT_MANAGER" list "$provider" 2>/dev/null); then
    log "Unable to load $label account configuration (state/accounts.yaml)."
    return 1
  fi
  local count
  count=$(python - <<'PY' "$json"
import json, sys
data = json.loads(sys.argv[1])
print(len(data))
PY
)
  if [ "$count" -eq 0 ]; then
    log "No $label accounts configured in state/accounts.yaml."
    return 1
  fi
  local summary
  summary=$(python - <<'PY' "$json"
import json, sys
data = json.loads(sys.argv[1])
parts = []
for acc in data:
    label = acc.get("label") or ""
    email = acc.get("email") or ""
    acc_id = acc.get("id", "<unnamed>")
    display = label or email or acc_id
    if email and display != email:
        parts.append(f"{display} ({email})")
    else:
        parts.append(display)
print(", ".join(parts))
PY
)
  log "$label accounts detected ($count): $summary"
  return 0
}

verify_codex_accounts() {
  if [ "$ACCOUNT_MANAGER_ENABLED" -ne 1 ]; then
    return
  fi

  local accounts_json
  if ! accounts_json=$(python "$ACCOUNT_MANAGER" list codex 2>/dev/null); then
    log "Skipping Codex account verification (unable to enumerate accounts)."
    return
  fi

  if [ -z "${accounts_json//[[:space:]]/}" ]; then
    log "Skipping Codex account verification (no codex accounts configured)."
    return
  fi

  local skip_check
  skip_check=$(should_skip_auth_check codex "$accounts_json")
  if [ "$skip_check" = "skip" ]; then
    log "Skipping Codex account verification (cached; ttl=${AUTH_CACHE_TTL}s)."
    return
  fi

  local parsed_accounts
  parsed_accounts=$(python - "$accounts_json" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
for acc in payload:
    email = acc.get("email") or ""
    label = acc.get("label") or ""
    print(f"{acc.get('id', '')}\t{acc.get('home', '')}\t{acc.get('profile', '')}\t{email}\t{label}")
PY
) || return

  while IFS=$'\t' read -r acc_id acc_home acc_profile acc_email acc_label; do
    if [ -z "$acc_id" ]; then
      continue
    fi

    local home="${acc_home:-$ROOT/.accounts/codex/$acc_id}"
    mkdir -p "$home"

    local previous_home="$CODEX_HOME"
    local previous_profile="$CLI_PROFILE"
    local previous_expected="$CURRENT_CODEX_EXPECTED_EMAIL"
    local previous_label="$CURRENT_CODEX_LABEL"
    CODEX_HOME="$home"
    CLI_PROFILE="${acc_profile:-$CLI_PROFILE}"
    CURRENT_CODEX_ACCOUNT="$acc_id"
    CURRENT_CODEX_EXPECTED_EMAIL="$acc_email"
    CURRENT_CODEX_LABEL="$acc_label"
    export CODEX_HOME

    local display
    display=$(codex_account_display "$acc_id" "$acc_email" "$acc_label")
    if [ -n "$acc_email" ] && [ "$display" != "$acc_email" ]; then
      log "Checking Codex $display (CODEX_HOME=$CODEX_HOME, profile=$CLI_PROFILE)..."
    else
      log "Checking Codex $display (CODEX_HOME=$CODEX_HOME, profile=$CLI_PROFILE)..."
    fi
    configure_codex_account
    register_codex_account "$acc_id"
    ensure_codex_auth

    CODEX_HOME="$previous_home"
    export CODEX_HOME
    CLI_PROFILE="$previous_profile"
    CURRENT_CODEX_EXPECTED_EMAIL="$previous_expected"
    CURRENT_CODEX_LABEL="$previous_label"
  done <<<"$parsed_accounts"
  update_auth_cache_record codex "$accounts_json"
}
verify_claude_accounts() {
  if [ "$ACCOUNT_MANAGER_ENABLED" -ne 1 ] || [ "$ENABLE_CLAUDE_EVAL" -eq 0 ]; then
    return
  fi

  local accounts_json
  if ! accounts_json=$(python "$ACCOUNT_MANAGER" list claude 2>/dev/null); then
    log "Skipping Claude account verification (unable to enumerate accounts)."
    return
  fi

  if [ -z "${accounts_json//[[:space:]]/}" ]; then
    log "Skipping Claude account verification (no claude accounts configured)."
    return
  fi

  local skip_check
  skip_check=$(should_skip_auth_check claude "$accounts_json")
  if [ "$skip_check" = "skip" ]; then
    log "Skipping Claude account verification (cached; ttl=${AUTH_CACHE_TTL}s)."
    return
  fi

  printf '%s' "$accounts_json" | python - <<'PY' 2>/dev/null | \
  while IFS=$'\t' read -r acc_id acc_bin claude_config_dir; do
import json, sys
for acc in json.load(sys.stdin):
    env = acc.get('env') or {}
    print(f"{acc.get('id', '')}\t{acc.get('bin', 'claude')}\t{env.get('CLAUDE_CONFIG_DIR', '')}")
PY
    if [ -z "$acc_id" ]; then
      continue
    fi

    local bin_cmd="${acc_bin:-claude}"
    local config="${claude_config_dir:-$ROOT/.accounts/claude/$acc_id}"
    mkdir -p "$config"

    local previous_config="${CLAUDE_CONFIG_DIR-}"
    export CLAUDE_CONFIG_DIR="$config"

    log "Checking Claude account '$acc_id' (CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR)..."
    local whoami_output
    whoami_output=$(run_with_ptty env CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" $bin_cmd whoami 2>/dev/null || true)
    if [ -n "$whoami_output" ]; then
      log "  ✅ Claude CLI responded: $whoami_output"
    else
      # Skip interactive login during autopilot initialization
      if [ "${WVO_AUTOPILOT_SKIP_INTERACTIVE_LOGIN:-1}" = "1" ]; then
        log "  ⚠️ Claude $acc_id not authenticated. Skipping (autopilot mode)."
        log "     To authenticate manually, run: CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR $bin_cmd login"
      else
        log "  ⚠️ Claude login not detected. Launching '$bin_cmd login' for '$acc_id'..."
        if run_with_ptty env CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" $bin_cmd login >/dev/null; then
          log "  ✅ Claude login completed for '$acc_id'"
        else
          log "  ⚠️ Claude login exited without success for '$acc_id'. Run 'CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR $bin_cmd login' manually."
        fi
      fi
    fi

    if [ -n "$previous_config" ]; then
      export CLAUDE_CONFIG_DIR="$previous_config"
    else
      unset CLAUDE_CONFIG_DIR
    fi
  done
  update_auth_cache_record claude "$accounts_json"
}
select_codex_account() {
  if [ "$ACCOUNT_MANAGER_ENABLED" -ne 1 ]; then
    CURRENT_CODEX_ACCOUNT="legacy"
    CODEX_HOME="${CODEX_HOME:-$DEFAULT_CODEX_HOME}"
    mkdir -p "$CODEX_HOME"
    export CODEX_HOME
    log "Using legacy Codex account (CODEX_HOME=$CODEX_HOME)."
    configure_codex_account
    register_codex_account "legacy"
    CURRENT_CODEX_EXPECTED_EMAIL=""
    CURRENT_CODEX_LABEL=""
    ensure_codex_auth
    return 0
  fi

  local max_wait_attempts="${CODEX_WAIT_ATTEMPTS:-2}"
  local wait_attempt=0

  while true; do
    local payload
    payload=$(python "$ACCOUNT_MANAGER" next codex 2>/dev/null)
    local status=$?
    if [ $status -eq 0 ]; then
      CURRENT_CODEX_ACCOUNT=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
print(data.get("account_id", ""))
PY
)
      local home profile
      home=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
print(data.get("home", ""))
PY
)
      profile=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
print(data.get("profile", ""))
PY
)
      if [ -n "$profile" ]; then
        CLI_PROFILE="$profile"
      fi
      if [ -n "$home" ]; then
        CODEX_HOME="$home"
      else
        CODEX_HOME="$ROOT/.codex"
      fi
      local expected_email
      expected_email=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
email = data.get("email")
if email is None:
    print("")
else:
    print(email)
PY
)
      CURRENT_CODEX_EXPECTED_EMAIL="$expected_email"
      local account_label
      account_label=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
label = data.get("label")
if label is None:
    print("")
else:
    print(label)
PY
)
      CURRENT_CODEX_LABEL="$account_label"
      mkdir -p "$CODEX_HOME"
      export CODEX_HOME
      local display
      display=$(codex_account_display "$CURRENT_CODEX_ACCOUNT" "$expected_email" "$account_label")
      log "Using Codex $display (CODEX_HOME=$CODEX_HOME)."
      configure_codex_account
      register_codex_account "$CURRENT_CODEX_ACCOUNT"
      ensure_codex_auth
      return 0
    elif [ $status -eq 2 ]; then
      wait_attempt=$((wait_attempt + 1))
      if [ "$wait_attempt" -ge "$max_wait_attempts" ]; then
        log "All Codex accounts exhausted after $wait_attempt attempts. Signaling fallback to Claude Code."
        return 2
      fi
      local wait
      wait=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
print(int(data.get("wait_seconds", 300)))
PY
)
      log "All Codex accounts on cooldown (attempt $wait_attempt/$max_wait_attempts). Sleeping ${wait}s before retry."
      sleep "$wait"
    else
      log "Account manager returned no Codex accounts. Falling back to legacy CODEX_HOME=$DEFAULT_CODEX_HOME."
      ACCOUNT_MANAGER_ENABLED=0
      CODEX_HOME="$DEFAULT_CODEX_HOME"
      mkdir -p "$CODEX_HOME"
      export CODEX_HOME
      configure_codex_account
      register_codex_account "legacy"
      CURRENT_CODEX_EXPECTED_EMAIL=""
      CURRENT_CODEX_LABEL=""
      ensure_codex_auth
      return 0
    fi
  done
}

record_provider_cooldown() {
  local provider="$1"
  local account_id="$2"
  local seconds="$3"
  local reason="${4:-usage_limit}"
  python "$ACCOUNT_MANAGER" record "$provider" "$account_id" "$seconds" --reason "$reason" >/dev/null 2>&1 || true
}

parse_usage_wait() {
  python - <<'PY' "$1"
import os, re, sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore")
pattern = (
    r"try again in\s*"
    r"(?:(\d+)\s*day[s]?)?\s*"
    r"(?:(\d+)\s*hour[s]?)?\s*"
    r"(?:(\d+)\s*minute[s]?)?\s*"
    r"(?:(\d+)\s*second[s]?)?"
)
match = re.search(pattern, text, re.IGNORECASE)
if not match:
    raise SystemExit(1)

days = int(match.group(1) or 0)
hours = int(match.group(2) or 0)
minutes = int(match.group(3) or 0)
seconds = int(match.group(4) or 0)

total = days * 86400 + hours * 3600 + minutes * 60 + seconds
fallback = int(os.environ.get("USAGE_LIMIT_BACKOFF", "120") or 120)
if total <= 0:
    total = fallback
print(total)
PY
}

CLAUDE_NEXT_AVAILABLE_TS=0
LAST_CLAUDE_EVAL_TS=0
CLAUDE_ACCOUNT_ENV_JSON=""
CLAUDE_SUPPORTS_MCP=0

verify_codex_dns() {
  python - <<'PY'
import socket
hosts = ("chatgpt.com", "api.openai.com")
for host in hosts:
    try:
        socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        print(f"{host}: {exc}")
        raise SystemExit(1)
PY
}

log_dns_diagnostics() {
  log "   DNS diagnostics (best effort)..."
  if command -v scutil >/dev/null 2>&1; then
    log "     scutil --dns (first 20 lines):"
    scutil --dns 2>&1 | head -n 20 | sed 's/^/       /' || true
  else
    log "     scutil not available."
  fi

  if command -v networksetup >/dev/null 2>&1; then
    log "     networksetup -getdnsservers for active services:"
    __wvo_dns_services="$(networksetup -listallnetworkservices 2>/dev/null | tail -n +2 || true)"
    if [ -z "$__wvo_dns_services" ]; then
      log "       (no network services detected)"
    else
      printf '%s\n' "$__wvo_dns_services" | while IFS= read -r __wvo_service; do
        [ -n "$__wvo_service" ] || continue
        log "       $__wvo_service:"
        networksetup -getdnsservers "$__wvo_service" 2>&1 | sed 's/^/         /' || true
      done
    fi
  elif command -v resolvectl >/dev/null 2>&1; then
    log "     resolvectl status (first 20 lines):"
    resolvectl status 2>&1 | head -n 20 | sed 's/^/       /' || true
  fi

  if [ -f /etc/resolv.conf ]; then
    log "     /etc/resolv.conf (first 10 lines):"
    sed -n '1,10p' /etc/resolv.conf 2>/dev/null | sed 's/^/       /' || true
  fi

  python - <<'PY'
import socket

targets = (
    ("chatgpt.com", 443),
    ("api.openai.com", 443),
    ("1.1.1.1", 53),
)

for host, port in targets:
    label = f"     connectivity: {host}:{port}"
    try:
        socket.create_connection((host, port), timeout=2.5).close()
    except Exception as exc:
        print(f"{label} -> {exc}")
    else:
        print(f"{label} -> reachable")
PY

  log "   If DNS servers are missing or incorrect, update them (e.g. Cloudflare 1.1.1.1 / 1.0.0.1) and rerun 'make mcp-autopilot'."
  unset __wvo_dns_services __wvo_service
}

update_task_memos_from_summary() {
  local summary_json="${1:-}"
  if [ -z "$summary_json" ]; then
    return
  fi
  SUMMARY_PAYLOAD="$summary_json" python - "$TASK_MEMO_DIR" "$ESCALATION_CONFIG" "$ESCALATION_LOG" <<'PY'
import json
import os
import re
import sys
import hashlib
from datetime import datetime, timezone
from pathlib import Path

memo_dir = Path(sys.argv[1])
config_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
log_path = Path(sys.argv[3]) if len(sys.argv) > 3 else None
payload = os.environ.get("SUMMARY_PAYLOAD", "").strip()
if not payload:
    raise SystemExit(0)

try:
    summary = json.loads(payload)
except json.JSONDecodeError:
    raise SystemExit(0)
if not isinstance(summary, dict):
    if isinstance(summary, list):
        summary = next((item for item in summary if isinstance(item, dict)), {})
    else:
        summary = {}
if not summary:
    raise SystemExit(0)

if config_path and config_path.exists():
    try:
        escalation_config = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        escalation_config = {}
else:
    escalation_config = {}

memo_dir.mkdir(parents=True, exist_ok=True)

critics_from_log: dict[str, dict] = {}
if log_path and log_path.exists():
    try:
        raw_lines = log_path.read_text(encoding="utf-8").splitlines()
    except Exception:
        raw_lines = []
    now_dt_for_log = datetime.now(timezone.utc)
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue
        critic_name = entry.get("critic")
        status = entry.get("status")
        timestamp_str = entry.get("timestamp")
        dt = parse_timestamp(timestamp_str)
        if not critic_name or not status or not dt:
            continue
        if (now_dt_for_log - dt).total_seconds() > 7 * 24 * 3600:
            continue
        existing = critics_from_log.get(critic_name)
        if not existing or dt > existing["dt"]:
            critics_from_log[critic_name] = {"entry": entry, "dt": dt}
else:
    critics_from_log = {}

def clean_list(values):
    result = []
    for item in values or []:
        if isinstance(item, str):
            text = item.strip()
            if text:
                result.append(text)
    return result

def squash(text, limit=360):
    if not text:
        return ""
    squashed = re.sub(r"\s+", " ", text).strip()
    if len(squashed) > limit:
        return squashed[: max(0, limit - 3)].rstrip() + "..."
    return squashed

TIMESTAMP_PATTERN = re.compile(
    r"\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|\+00:00)?\b"
)

def canonicalize_note(text):
    if not text:
        return ""
    text = TIMESTAMP_PATTERN.sub("<timestamp>", text)
    lowered = text.lower()
    if "design_system" in lowered and "skip" in lowered:
        text = "Design system critic currently unavailable; awaiting manual review."
    return squash(text, 420)

def parse_timestamp(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None

def detect_critic(*sources):
    for source in sources:
        if not source:
            continue
        lowered = source.lower()
        for critic in escalation_config.keys():
            if critic.lower() in lowered:
                return critic
    return None

def extract_ids(label):
    if not label:
        return (None, None)
    label = label.strip()
    if not label:
        return (None, None)
    match = re.match(r"^([A-Za-z]+[0-9][A-Za-z0-9.\-]*)", label)
    task_id = match.group(1) if match else None
    if task_id:
        key = task_id
    else:
        slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
        if not slug:
            slug = hashlib.sha1(label.encode("utf-8")).hexdigest()[:12]
        key = f"label-{slug[:48]}"
    return (key, task_id)

def related(items, task_id, label, limit=2):
    matches = []
    base = ""
    if label:
        base = re.split(r"[\-\u2013]", label, maxsplit=1)[0].strip()
    for text in items:
        if not text:
            continue
        lowered = text.lower()
        if task_id and task_id.lower() in lowered:
            matches.append(text)
            continue
        if base and base.lower() in lowered:
            matches.append(text)
    trimmed = []
    for value in matches[:limit]:
        trimmed.append(squash(value, 280))
    return trimmed

notes = canonicalize_note(summary.get("notes"))
blockers = clean_list(summary.get("blockers"))
in_progress = clean_list(summary.get("in_progress"))
next_focus = clean_list(summary.get("next_focus"))
completed = clean_list(summary.get("completed_tasks"))

now_dt = datetime.now(timezone.utc)
timestamp = now_dt.isoformat(timespec="seconds")
active_keys = set()
memos = {}
STALLED_THRESHOLD = 3
escalated = []

for label in in_progress:
    key, task_id = extract_ids(label)
    if not key:
        continue
    memo = memos.get(key, {"key": key})
    memo["task_id"] = task_id
    memo["label"] = label
    memo["updated_at"] = timestamp
    statuses = set(memo.get("statuses", []))
    statuses.add("in_progress")
    memo["statuses"] = sorted(statuses)
    memo["note"] = notes
    memo["blockers"] = related(blockers, task_id, label, limit=2)
    memo["next"] = related(next_focus, task_id, label, limit=2)
    memos[key] = memo
    active_keys.add(key)

for label in next_focus:
    key, task_id = extract_ids(label)
    if not key:
        continue
    memo = memos.get(key, {"key": key})
    memo.setdefault("label", label)
    if memo.get("task_id") is None:
        memo["task_id"] = task_id
    memo["updated_at"] = timestamp
    statuses = set(memo.get("statuses", []))
    statuses.add("next_focus")
    memo["statuses"] = sorted(statuses)
    if notes and not memo.get("note"):
        memo["note"] = notes
    blockers_hint = related(blockers, task_id, label, limit=2)
    if blockers_hint and not memo.get("blockers"):
        memo["blockers"] = blockers_hint
    current_next = memo.get("next") or []
    extras = related(next_focus, task_id, label, limit=2)
    if extras:
        combined = current_next + [item for item in extras if item not in current_next]
        memo["next"] = combined[:2]
    memos[key] = memo
    active_keys.add(key)

for key, data in memos.items():
    path = memo_dir / f"{key}.json"
    new_payload = dict(data)
    if new_payload.get("note"):
        new_payload["note"] = canonicalize_note(new_payload["note"])
    else:
        new_payload.pop("note", None)
    def normalize(record):
        norm = {
            "label": record.get("label"),
            "task_id": record.get("task_id"),
            "statuses": sorted(set(record.get("statuses") or [])),
            "note": canonicalize_note(record.get("note")),
            "blockers": sorted({canonicalize_note(v) for v in record.get("blockers") or [] if v}),
            "next": sorted({canonicalize_note(v) for v in record.get("next") or [] if v}),
            "reviewer": record.get("reviewer"),
        }
        return norm
    existing = None
    previous_statuses = []
    stalled_cycles = 0
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            existing = None
    if existing:
        previous_statuses = sorted(set(existing.get("statuses") or []))
        if normalize(existing) == normalize(new_payload):
            stalled_cycles = int(existing.get("stalled_cycles") or 0) + 1
        else:
            stalled_cycles = 0
    else:
        stalled_cycles = 0
    if stalled_cycles > STALLED_THRESHOLD:
        stalled_cycles = STALLED_THRESHOLD
    new_payload["stalled_cycles"] = stalled_cycles
    statuses = set(new_payload.get("statuses") or [])
    critic = detect_critic(
        new_payload.get("label"),
        new_payload.get("note"),
        " ".join(new_payload.get("blockers") or []),
        " ".join(new_payload.get("next") or [])
    )
    escalated_now = False
    if critic and stalled_cycles >= STALLED_THRESHOLD:
        info = escalation_config.get(critic, {})
        reviewer = info.get("reviewer")
        if reviewer:
            new_payload["reviewer"] = reviewer
        statuses.add("needs_review")
        statuses.add("escalate")
        blocker_msg = info.get("note") or f"Awaiting {reviewer or 'reviewer'} response for {critic} critic."
        blockers_list = list(new_payload.get("blockers") or [])
        if blocker_msg not in blockers_list:
            blockers_list.append(blocker_msg)
        new_payload["blockers"] = blockers_list
        if info.get("note"):
            new_payload["note"] = info["note"]
        if info.get("next"):
            new_payload["next"] = [info["next"]]
        if "needs_review" not in previous_statuses:
            escalated_now = True
    else:
        statuses.discard("needs_review")
        statuses.discard("escalate")
        new_payload.pop("reviewer", None)
    new_payload["statuses"] = sorted(statuses)

    skip_write = False
    if existing:
        existing_norm = normalize(existing)
        new_norm = normalize(new_payload)
        if (
            existing_norm == new_norm
            and int(existing.get("stalled_cycles") or 0) == stalled_cycles
            and sorted(existing.get("statuses") or []) == new_payload["statuses"]
            and existing.get("reviewer") == new_payload.get("reviewer")
        ):
            skip_write = True

    if not skip_write:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(new_payload, handle, indent=2)

    if escalated_now:
        escalated.append({
            "label": new_payload.get("label"),
            "task_id": new_payload.get("task_id"),
            "critic": critic,
            "reviewer": new_payload.get("reviewer"),
            "timestamp": timestamp
        })

if escalated:
    summaries = []
    for entry in escalated:
        label = entry.get("label") or entry.get("task_id") or "unknown"
        critic_name = entry.get("critic") or "critic"
        reviewer = entry.get("reviewer") or "reviewer"
        summaries.append(f"{label} → {critic_name} → {reviewer}")
    print("[autopilot] escalation recommended for:", "; ".join(summaries))
    if log_path:
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        try:
            with open(log_path, "a", encoding="utf-8") as handle:
                for entry in escalated:
                    handle.write(f"{entry.get('timestamp')} {entry.get('critic')} {entry.get('label')} reviewer={entry.get('reviewer') or '-'}\\n")
        except Exception:
            pass

for label in completed:
    key, _ = extract_ids(label)
    if not key:
        continue
    path = memo_dir / f"{key}.json"
    if path.exists():
        path.unlink()

max_age_seconds = 7 * 24 * 3600
now_ts = now_dt
for path in memo_dir.glob("*.json"):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        path.unlink()
        continue
    if data.get("key") in active_keys:
        continue
    updated_at = data.get("updated_at")
    if not updated_at:
        continue
    try:
        parsed = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    except Exception:
        continue
    if (now_ts - parsed).total_seconds() > max_age_seconds:
        path.unlink()
PY
}

detect_claude_capabilities() {
  if [ "$ENABLE_CLAUDE_EVAL" != "1" ]; then
    return
  fi
  local bin="${CLAUDE_BIN_CMD:-claude}"
  if ! command -v "$bin" >/dev/null 2>&1; then
    log "Claude binary '$bin' not found; disabling Claude evaluations."
    ENABLE_CLAUDE_EVAL=0
    return
  fi
  # Check for --mcp-config support (Claude Code 2.x+)
  if "$bin" --help 2>&1 | grep -qE '\s--mcp-config\s'; then
    CLAUDE_SUPPORTS_MCP=1
    log "Claude MCP support detected via --mcp-config."
    return
  fi
  log "Claude CLI '$bin' does not support MCP (--mcp-config not found); disabling Claude evaluations."
  ENABLE_CLAUDE_EVAL=0
}

select_claude_account() {
  local payload
  payload=$(python "$ACCOUNT_MANAGER" next claude --purpose evaluation 2>/dev/null)
  local status=$?
  if [ $status -eq 0 ]; then
    CURRENT_CLAUDE_ACCOUNT=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
print(data.get("account_id", ""))
PY
)
    CLAUDE_BIN_CMD=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
print(data.get("bin", "claude"))
PY
)
    CLAUDE_ACCOUNT_ENV_JSON=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
env = data.get("env")
print(json.dumps(env) if env is not None else "null")
PY
)
    return 0
  elif [ $status -eq 2 ]; then
    local wait
    wait=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
print(int(data.get("wait_seconds", 300)))
PY
)
    CLAUDE_NEXT_AVAILABLE_TS=$(( $(date +%s) + wait ))
    log "All Claude accounts on cooldown. Next evaluation attempt in ${wait}s."
    return 2
  else
    log "No Claude accounts configured or available. Disabling Claude evaluations."
    ENABLE_CLAUDE_EVAL=0
    return 1
  fi
}

run_claude_evaluation() {
  detect_claude_capabilities

  if [ "$ENABLE_CLAUDE_EVAL" != "1" ]; then
    return
  fi

  if [ "$CLAUDE_SUPPORTS_MCP" -ne 1 ]; then
    log "Claude evaluations disabled (CLI lacks --mcp support)."
    ENABLE_CLAUDE_EVAL=0
    return
  fi

  local now_ts=$(date +%s)
  if (( now_ts < CLAUDE_NEXT_AVAILABLE_TS )); then
    return
  fi

  if (( now_ts - LAST_CLAUDE_EVAL_TS < CLAUDE_EVAL_COOLDOWN )); then
    return
  fi

  if ! select_claude_account; then
    return
  fi

  if ! command -v "$CLAUDE_BIN_CMD" >/dev/null 2>&1; then
    log "Claude binary $CLAUDE_BIN_CMD not found; disabling Claude evaluations."
    ENABLE_CLAUDE_EVAL=0
    return
  fi

  if ! ensure_claude_auth "$CURRENT_CLAUDE_ACCOUNT" "$CLAUDE_BIN_CMD" "$CLAUDE_ACCOUNT_ENV_JSON"; then
    log "Claude evaluations disabled: authentication required for $CURRENT_CLAUDE_ACCOUNT."
    ENABLE_CLAUDE_EVAL=0
    return
  fi

  local prompt_file
  prompt_file=$(mktemp)
  cat <<'PROMPT' > "$prompt_file"
You are Claude, WeatherVane's Staff-level evaluator. Analyse current roadmap progress, highlight strategic risks, design/UX polish opportunities, and recommend where Codex should focus next. Provide JSON with keys: analysis, risks, design_notes, recommended_focus. Keep responses concise but insightful.
PROMPT

  local message
  message=$(cat "$prompt_file")
  rm -f "$prompt_file"

  local env_pairs=()
  if [ -n "$CLAUDE_ACCOUNT_ENV_JSON" ] && [ "$CLAUDE_ACCOUNT_ENV_JSON" != "null" ]; then
    while IFS= read -r line; do
      env_pairs+=("$line")
    done < <(python - <<'PY' "$CLAUDE_ACCOUNT_ENV_JSON"
import json, sys
env = json.loads(sys.argv[1])
for key, value in env.items():
    if value is None:
        continue
    print(f"{key}={value}")
PY
)
  fi

  # Create MCP config JSON for weathervane server
  # Use index-claude.js for Claude Code evaluation (not index.js which is for Codex)
  local CLAUDE_MCP_ENTRY="${MCP_ENTRY/index.js/index-claude.js}"
  local mcp_config_file
  mcp_config_file=$(mktemp)
  if [ -z "$mcp_config_file" ]; then
    log "Failed to create temporary MCP config file."
    return
  fi
  cat > "$mcp_config_file" <<EOF
{
  "mcpServers": {
    "weathervane": {
      "command": "node",
      "args": ["$CLAUDE_MCP_ENTRY", "--workspace", "$ROOT"]
    }
  }
}
EOF

  local output
  local exit_code
  local -a claude_args
  claude_args=(--print "--mcp-config=$mcp_config_file")

  # Disable set -e temporarily to prevent script exit on Claude failure
  set +e
  if [ ${#env_pairs[@]} -gt 0 ]; then
    output=$(env "${env_pairs[@]}" "$CLAUDE_BIN_CMD" "${claude_args[@]}" "$message" 2>&1)
    exit_code=$?
  else
    output=$("$CLAUDE_BIN_CMD" "${claude_args[@]}" "$message" 2>&1)
    exit_code=$?
  fi
  set -e

  rm -f "$mcp_config_file"

  if [ $exit_code -ne 0 ]; then
    log "Claude evaluation command failed (exit $exit_code): ${output:0:200}"
    printf '%s\n' "$output" >> "$LOG_FILE"
    return
  fi

  printf '%s\n' "$output" > "$CLAUDE_EVAL_FILE"
  LAST_CLAUDE_EVAL_TS=$(date +%s)
  CLAUDE_NEXT_AVAILABLE_TS=0
  log "Claude evaluation completed using account $CURRENT_CLAUDE_ACCOUNT."

  if echo "$output" | grep -qi 'usage limit'; then
    local wait_seconds
    if wait_seconds=$(extract_wait_from_text "$output" 2>/dev/null); then
      record_provider_cooldown claude "$CURRENT_CLAUDE_ACCOUNT" "$wait_seconds"
      CLAUDE_NEXT_AVAILABLE_TS=$(( $(date +%s) + wait_seconds ))
      log "Claude account $CURRENT_CLAUDE_ACCOUNT hit usage limit; cooling down for ${wait_seconds}s."
    else
      record_provider_cooldown claude "$CURRENT_CLAUDE_ACCOUNT" "$USAGE_LIMIT_BACKOFF"
      CLAUDE_NEXT_AVAILABLE_TS=$(( $(date +%s) + USAGE_LIMIT_BACKOFF ))
      log "Claude account $CURRENT_CLAUDE_ACCOUNT hit usage limit; applying default cooldown ${USAGE_LIMIT_BACKOFF}s."
    fi
  fi
}

extract_wait_from_text() {
  python - <<'PY' "$1"
import re, sys
text = sys.argv[1]
pattern = (
    r"try again in\s*"
    r"(?:(\d+)\s*day[s]?)?\s*"
    r"(?:(\d+)\s*hour[s]?)?\s*"
    r"(?:(\d+)\s*minute[s]?)?\s*"
    r"(?:(\d+)\s*second[s]?)?"
)
match = re.search(pattern, text, re.I)
if not match:
    raise SystemExit(1)
days = int(match.group(1) or 0)
hours = int(match.group(2) or 0)
minutes = int(match.group(3) or 0)
seconds = int(match.group(4) or 0)
seconds += days * 86400 + hours * 3600 + minutes * 60
if seconds <= 0:
    seconds = 300
print(seconds)
PY
}

run_with_claude_code() {
  local prompt="$1"
  local run_log="$2"
  local mcp_config_file
  mcp_config_file=$(mktemp)
  if [ -z "$mcp_config_file" ]; then
    log "Failed to create temporary MCP config file for Claude run."
    return 1
  fi

  # Use index-claude.js for Claude Code (not index.js which is for Codex)
  local CLAUDE_MCP_ENTRY="${MCP_ENTRY/index.js/index-claude.js}"

  cat > "$mcp_config_file" <<EOF
{
  "mcpServers": {
    "weathervane": {
      "command": "node",
      "args": ["$CLAUDE_MCP_ENTRY", "--workspace", "$ROOT"]
    }
  }
}
EOF

  local claude_payload
  if claude_payload=$(python "$ACCOUNT_MANAGER" next claude --purpose execution 2>/dev/null); then
    CURRENT_CLAUDE_ACCOUNT=$(python - <<'PY' "$claude_payload"
import json, sys
data = json.loads(sys.argv[1])
print(data.get("account_id", ""))
PY
)
    CLAUDE_BIN_CMD=$(python - <<'PY' "$claude_payload"
import json, sys
data = json.loads(sys.argv[1])
print(data.get("bin", "claude"))
PY
)
    CLAUDE_ACCOUNT_ENV_JSON=$(python - <<'PY' "$claude_payload"
import json, sys
data = json.loads(sys.argv[1])
env = data.get("env")
print(json.dumps(env) if env is not None else "null")
PY
)
  else
    log "No Claude accounts available. Cannot fall back to Claude Code."
    USE_CLAUDE_FALLBACK=0
    rm -f "$mcp_config_file"
    return 1
  fi

  if ! command -v "$CLAUDE_BIN_CMD" >/dev/null 2>&1; then
    log "Claude binary $CLAUDE_BIN_CMD not found. Cannot fall back to Claude Code."
    rm -f "$mcp_config_file"
    return 1
  fi

  if ! ensure_claude_auth "$CURRENT_CLAUDE_ACCOUNT" "$CLAUDE_BIN_CMD" "$CLAUDE_ACCOUNT_ENV_JSON"; then
    log "Claude account $CURRENT_CLAUDE_ACCOUNT requires authentication. Skipping this account."
    record_provider_cooldown claude "$CURRENT_CLAUDE_ACCOUNT" 3600  # Cool down for 1 hour
    rm -f "$mcp_config_file"

    # Try to get next Claude account instead of aborting completely
    if claude_payload=$(python "$ACCOUNT_MANAGER" next claude --purpose execution 2>/dev/null); then
      log "Trying next available Claude account..."
      # Recursive call with updated account will happen on next iteration
      rm -f "$mcp_config_file"
      return 1  # Return 1 to trigger retry with new account
    fi

    log "No more Claude accounts available. Cannot fall back to Claude Code."
    return 1
  fi

  log "Executing autopilot with Claude Code account $CURRENT_CLAUDE_ACCOUNT..."

  local env_pairs=()
  if [ -n "$CLAUDE_ACCOUNT_ENV_JSON" ] && [ "$CLAUDE_ACCOUNT_ENV_JSON" != "null" ]; then
    while IFS= read -r line; do
      env_pairs+=("$line")
    done < <(python - <<'PY' "$CLAUDE_ACCOUNT_ENV_JSON"
import json, sys
env = json.loads(sys.argv[1])
for key, value in env.items():
    if value is None:
        continue
    print(f"{key}={value}")
PY
)
  fi

  local exit_code
  local -a claude_args
  claude_args=(--print "--mcp-config=$mcp_config_file")

  set +e
  if [ ${#env_pairs[@]} -gt 0 ]; then
    env "${env_pairs[@]}" "$CLAUDE_BIN_CMD" "${claude_args[@]}" "$prompt" 2>&1 | tee "$run_log"
    exit_code=${PIPESTATUS[0]}
  else
    "$CLAUDE_BIN_CMD" "${claude_args[@]}" "$prompt" 2>&1 | tee "$run_log"
    exit_code=${PIPESTATUS[0]}
  fi
  set -e

  rm -f "$mcp_config_file"

  if grep -qi 'usage limit' "$run_log"; then
    local wait_seconds
    if wait_seconds=$(parse_usage_wait "$run_log" 2>/dev/null); then
      record_provider_cooldown claude "$CURRENT_CLAUDE_ACCOUNT" "$wait_seconds"
      log "Claude account $CURRENT_CLAUDE_ACCOUNT hit usage limit; cooling down for ${wait_seconds}s."
    else
      record_provider_cooldown claude "$CURRENT_CLAUDE_ACCOUNT" "$USAGE_LIMIT_BACKOFF"
      log "Claude account $CURRENT_CLAUDE_ACCOUNT hit usage limit; applying default cooldown ${USAGE_LIMIT_BACKOFF}s."
    fi
    return 2
  fi

  return $exit_code
}

check_all_accounts_auth() {
  log "Checking authentication status for all configured accounts..."

  local -a needs_auth=()
  local -a codex_accounts=()
  local -a codex_summary=()
  local -a claude_accounts=()
  local -a claude_summary=()
  local -a claude_needs_auth=()
  CLAUDE_ACCOUNTS_AVAILABLE=0
  local claude_ready_count=0

  if [ "$ACCOUNT_MANAGER_ENABLED" -eq 1 ]; then
    local codex_json
    if codex_json=$(python "$ACCOUNT_MANAGER" list codex 2>/dev/null); then
      local codex_tmp codex_out codex_err
      codex_tmp=$(mktemp)
      codex_out=$(mktemp)
      codex_err=$(mktemp)
      printf '%s\n' "$codex_json" >"$codex_tmp"
      if python - <<'PY' "$codex_tmp" >"$codex_out" 2>"$codex_err"; then
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = path.read_text(encoding="utf-8")
if not payload.strip():
    raise SystemExit(10)
try:
    accounts = json.loads(payload)
except json.JSONDecodeError as exc:
    print(f"JSON decode error: {exc}", file=sys.stderr)
    raise SystemExit(11)
if not isinstance(accounts, list):
    print("Expected a list of accounts in state/accounts.yaml", file=sys.stderr)
    raise SystemExit(12)
for account in accounts:
    account_id = account.get("id", "")
    home = account.get("home", "")
    email = account.get("email") or ""
    label = account.get("label") or ""
    print(f"{account_id}|{home}|{email}|{label}")
PY
        while IFS= read -r line; do
          [ -n "$line" ] && codex_accounts+=("$line")
        done <"$codex_out"
      else
        log "⚠️ Unable to parse Codex accounts from state/accounts.yaml. Verify the configuration and JSON structure."
        if [ -s "$codex_err" ]; then
          while IFS= read -r err_line; do
            [ -n "$err_line" ] && log "   $err_line"
          done <"$codex_err"
        fi
      fi
      rm -f "$codex_tmp" "$codex_out" "$codex_err"
    else
      ACCOUNT_MANAGER_ENABLED=0
      codex_accounts=("legacy|$DEFAULT_CODEX_HOME||")
    fi

    local claude_json
    if claude_json=$(python "$ACCOUNT_MANAGER" list claude 2>/dev/null); then
      while IFS= read -r line; do
        [ -n "$line" ] && claude_accounts+=("$line")
      done < <(python - <<'PY' "$claude_json"
import json, sys
for account in json.loads(sys.argv[1]):
    print(f"{account.get('id')}|{account.get('bin', 'claude')}|{json.dumps(account.get('env'))}|{account.get('label', '')}|{account.get('email', '')}")
PY
)
    else
      claude_accounts=()
    fi
  else
    codex_accounts=("legacy|$DEFAULT_CODEX_HOME||")
  fi

  if [ ${#codex_accounts[@]} -gt 0 ]; then
    for account_info in "${codex_accounts[@]}"; do
      IFS='|' read -r account_id account_home account_email account_label <<< "$account_info"
      local display
      display=$(codex_account_display "$account_id" "$account_email" "$account_label")
      [ -n "$account_home" ] && mkdir -p "$account_home"

      local previous_home="$CODEX_HOME"
      CODEX_HOME="$account_home"
      export CODEX_HOME

      local status_ok=0
      if fetch_auth_status codex && [ "$(provider_authenticated codex)" = "true" ]; then
        status_ok=1
      fi

      local tokens_ok=0
      local token_identity=""
      if [ "$status_ok" -ne 1 ] && codex_tokens_present; then
        tokens_ok=1
        token_identity=$(codex_identity_from_tokens 2>/dev/null || true)
      fi

      CODEX_HOME="$previous_home"
      export CODEX_HOME

      if [ "$status_ok" -eq 1 ]; then
        if [ -n "$AUTH_STATUS_EMAIL" ]; then
          codex_summary+=("✅ $display — authenticated as $AUTH_STATUS_EMAIL")
        else
          codex_summary+=("✅ $display — authenticated")
        fi
        continue
      fi

      if [ "$tokens_ok" -eq 1 ]; then
        if [ -n "$account_email" ] && [ -n "$token_identity" ] && [ "$token_identity" != "$account_email" ]; then
          log "⚠️ Codex $display tokens belong to $token_identity but expected $account_email"
          needs_auth+=("codex:$account_id:$account_home:$account_email:$account_label")
          codex_summary+=("❌ $display — tokens for $token_identity (expected $account_email). $(codex_login_command "$account_home")")
          continue
        fi
        if [ -n "$token_identity" ]; then
          codex_summary+=("✅ $display — authenticated via stored tokens (identity: $token_identity)")
        else
          codex_summary+=("⚠️ $display — tokens present but identity unknown; consider refreshing tokens ($(codex_login_command "$account_home"))")
        fi
        continue
      fi

      codex_summary+=("❌ $display — login required ($(codex_login_command "$account_home"))")
      needs_auth+=("codex:$account_id:$account_home:$account_email:$account_label")
    done
  else
    codex_summary+=("ℹ️ No Codex accounts configured; default CODEX_HOME=$DEFAULT_CODEX_HOME will be used.")
  fi

  if [ "$ENABLE_CLAUDE_EVAL" -ne 1 ]; then
    claude_summary+=("ℹ️ Claude fallback disabled (ENABLE_CLAUDE_EVAL=0).")
    claude_needs_auth=()
    claude_ready_count=0
  elif [ ${#claude_accounts[@]} -gt 0 ]; then
    for account_info in "${claude_accounts[@]}"; do
      IFS='|' read -r account_id account_bin account_env_json account_label account_email <<< "$account_info"
      local display
      display=$(claude_account_display "$account_id" "$account_label" "$account_email")

      if ! command -v "$account_bin" >/dev/null 2>&1; then
        claude_summary+=("⚠️ $display — CLI '$account_bin' not found; install the Claude CLI or update PATH.")
        claude_needs_auth+=("$display|Install the Claude CLI and run $(format_claude_login_command "$account_bin" "$account_env_json")")
        continue
      fi

      local -a env_pairs=()
      if [ -n "$account_env_json" ] && [ "$account_env_json" != "null" ]; then
        while IFS= read -r env_line; do
          [ -n "$env_line" ] && env_pairs+=("$env_line")
        done < <(python - <<'PY' "$account_env_json"
import json, sys
env = json.loads(sys.argv[1])
for key, value in env.items():
    if value is None:
        continue
    print(f"{key}={value}")
PY
)
      fi

      local whoami_output
      local status
      # Use timeout (10s) to prevent hanging on unauthenticated Claude accounts
      if [ ${#env_pairs[@]} -gt 0 ]; then
        set +e
        whoami_output=$(run_with_timeout_capture 10 env "${env_pairs[@]}" "$account_bin" whoami 2>&1)
        status=$?
        set -e
      else
        set +e
        whoami_output=$(run_with_timeout_capture 10 "$account_bin" whoami 2>&1)
        status=$?
        set -e
      fi

      # Handle timeout (exit code 124)
      if [ $status -eq 124 ]; then
        local login_cmd
        login_cmd=$(format_claude_login_command "$account_bin" "$account_env_json")
        claude_summary+=("❌ $display — authentication check timed out (likely not logged in)")
        claude_needs_auth+=("$display|$login_cmd")
        continue
      fi

      if [ $status -eq 0 ] && ! printf '%s\n' "$whoami_output" | grep -qi 'invalid api key'; then
        local trimmed
        trimmed=$(printf '%s' "$whoami_output" | head -n1 | tr -d '\r')
        claude_summary+=("✅ $display — authenticated${trimmed:+ ($trimmed)}")
        claude_ready_count=$((claude_ready_count + 1))
        continue
      fi

      local login_cmd
      login_cmd=$(format_claude_login_command "$account_bin" "$account_env_json")
      claude_summary+=("❌ $display — login required")
      claude_needs_auth+=("$display|$login_cmd")
    done
  else
    claude_summary+=("ℹ️ No Claude accounts configured; Claude fallback disabled.")
  fi

  if [ $claude_ready_count -gt 0 ]; then
    CLAUDE_ACCOUNTS_AVAILABLE=1
  else
    CLAUDE_ACCOUNTS_AVAILABLE=0
  fi

  log "Codex accounts:"
  if [ ${#codex_summary[@]} -eq 0 ]; then
    log "  • (none)"
  else
    for entry in "${codex_summary[@]}"; do
      log "  • $entry"
    done
  fi

  log "Claude accounts:"
  if [ ${#claude_summary[@]} -eq 0 ]; then
    log "  • (none)"
  else
    for entry in "${claude_summary[@]}"; do
      log "  • $entry"
    done
  fi

  if [ ${#claude_needs_auth[@]} -gt 0 ]; then
    if [ $claude_ready_count -eq 0 ]; then
      log "⚠️ Claude fallback is disabled until at least one Claude account is authenticated."
    fi
    log "   To authenticate Claude accounts:"
    for item in "${claude_needs_auth[@]}"; do
      IFS='|' read -r display login_cmd <<< "$item"
      log "    - $display: $login_cmd"
    done
  fi

  if [ ${#needs_auth[@]} -gt 0 ]; then
    if [ "${WVO_AUTOPILOT_ASSUME_NO_PROMPT:-0}" = "1" ] || [ ! -t 0 ]; then
      log "⚠️ Codex authentication required but running non-interactively; skipping login prompts."
      log "   To authenticate manually:"
      for auth_item in "${needs_auth[@]}"; do
        IFS=':' read -r provider account_id account_path account_email account_label <<< "$auth_item"
        if [ "$provider" = "codex" ]; then
          local display
          display=$(codex_account_display "$account_id" "$account_email" "$account_label")
          log "    - $display: $(codex_login_command "$account_path")"
        fi
      done
      log "   Autopilot will continue with the currently authenticated Codex accounts."
    else
      log "Interactive authentication prompt triggered."
      printf '\n==========================================\n'
      printf 'Authentication Required\n'
      printf '==========================================\n\n'
      printf 'The following accounts need authentication:\n'
      for auth_item in "${needs_auth[@]}"; do
        IFS=':' read -r provider account_id account_path account_email account_label <<< "$auth_item"
        if [ "$provider" = "codex" ]; then
          local display
          display=$(codex_account_display "$account_id" "$account_email" "$account_label")
          printf '  - Codex: %s\n' "$display"
        else
          printf '  - %s: %s\n' "$provider" "$account_id"
        fi
      done
      printf '\nOptions:\n'
      printf '  1. Login now (will prompt for each account)\n'
      printf '  2. Skip and continue with authenticated accounts only\n'
      printf '  3. Exit and login manually later\n\n'
      read -p "Choose [1/2/3]: " choice

      case "$choice" in
        1)
          log "Logging in to accounts..."
          for auth_item in "${needs_auth[@]}"; do
            IFS=':' read -r provider account_id account_path account_email account_label <<< "$auth_item"

            if [ "$provider" = "codex" ]; then
              local previous_home="$CODEX_HOME"
              local display
              display=$(codex_account_display "$account_id" "$account_email" "$account_label")
              printf '\nLogging in to Codex: %s\n' "$display"
              printf 'CODEX_HOME will be set to: %s\n' "$account_path"
              if [ -n "$account_email" ]; then
                printf 'Expected email: %s\n' "$account_email"
              fi

              CODEX_HOME="$account_path" codex login

              if [ $? -eq 0 ]; then
                CODEX_HOME="$account_path"
                export CODEX_HOME
                if fetch_auth_status codex && [ "$(provider_authenticated codex)" = "true" ]; then
                  if [ -n "$account_email" ] && [ -n "$AUTH_STATUS_EMAIL" ] && [ "$AUTH_STATUS_EMAIL" != "$account_email" ]; then
                    log "❌ Logged in as $AUTH_STATUS_EMAIL but expected $account_email for $(codex_account_display "$account_id" "$account_email" "$account_label"). Run '$(codex_login_command "$account_path")' again with the correct account."
                    CODEX_HOME="$previous_home"
                    export CODEX_HOME
                    abort_autopilot_offline "codex-auth-mismatch" "Interactive login authenticated as ${AUTH_STATUS_EMAIL:-unknown} but expected ${account_email:-unknown} for $display."
                  fi
                  log "✅ Successfully logged in to Codex $(codex_account_display "$account_id" "$account_email" "$account_label") as ${AUTH_STATUS_EMAIL:-unknown}"
                elif codex_tokens_present; then
                  local token_identity
                  token_identity=$(codex_identity_from_tokens)
                  if [ -n "$account_email" ] && [ -n "$token_identity" ] && [ "$token_identity" != "$account_email" ]; then
                    log "❌ Tokens belong to $token_identity but expected $account_email for $(codex_account_display "$account_id" "$account_email" "$account_label"). Run '$(codex_login_command "$account_path")' and login with the correct account."
                    CODEX_HOME="$previous_home"
                    export CODEX_HOME
                    abort_autopilot_offline "codex-token-mismatch" "Interactive token check mapped to ${token_identity:-unknown} but expected ${account_email:-unknown} for $display."
                  fi
                  log "✅ Tokens detected for $(codex_account_display "$account_id" "$account_email" "$account_label")${token_identity:+ (email: $token_identity)}"
                else
                  log "❌ Codex login completed but authentication still missing for $(codex_account_display "$account_id" "$account_email" "$account_label")."
                  CODEX_HOME="$previous_home"
                  export CODEX_HOME
                  abort_autopilot_offline "codex-auth-missing" "Interactive login completed without establishing authentication for $display."
                fi
              else
                log "❌ Failed to login to Codex account '$account_id'"
                read -p "Continue anyway? [y/n]: " continue_choice
                if [ "$continue_choice" != "y" ]; then
                  CODEX_HOME="$previous_home"
                  export CODEX_HOME
                  abort_autopilot_offline "codex-login-failed" "Interactive login failed for Codex account '$account_id'."
                fi
              fi
              CODEX_HOME="$previous_home"
              export CODEX_HOME
            fi
          done
          log "Authentication complete. Continuing with autopilot..."
          ;;
        2)
          log "Skipping authentication. Continuing with available accounts only."
        ;;
      3)
        log "Exiting. Please authenticate manually and rerun autopilot."
        printf '\nTo authenticate manually:\n'
        for auth_item in "${needs_auth[@]}"; do
          IFS=':' read -r provider account_id account_path account_email account_label <<< "$auth_item"
          if [ "$provider" = "codex" ]; then
            printf '  # %s\n' "$(codex_account_display "$account_id" "$account_email" "$account_label")"
            printf '    %s\n' "$(codex_login_command "$account_path")"
          fi
        done
        printf '\n'
        exit 0
        ;;
      *)
        log "Invalid choice. Continuing with available accounts only."
        ;;
      esac
    fi
  else
    log "✅ All configured accounts are authenticated"
  fi

  printf '\n' >>"$LOG_FILE"
  if [ "$STREAM_TO_STDOUT" -eq 1 ]; then
    printf '\n' >&2
  fi
}

ensure_at_least_one_provider() {
  # Verify at least one provider (Codex or Claude) is authenticated
  local has_codex=0
  local has_claude=0

  # Check if any Codex account is authenticated
  if [ "$ACCOUNT_MANAGER_ENABLED" -eq 1 ]; then
    local codex_json
    if codex_json=$(python "$ACCOUNT_MANAGER" list codex 2>/dev/null); then
      if [ -z "${codex_json//[[:space:]]/}" ]; then
        :
      else
        local codex_tmp codex_out codex_err
        codex_tmp=$(mktemp)
        codex_out=$(mktemp)
        codex_err=$(mktemp)
        printf '%s\n' "$codex_json" >"$codex_tmp"
        if python - <<'PY' "$codex_tmp" >"$codex_out" 2>"$codex_err"; then
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = path.read_text(encoding="utf-8")
if not payload.strip():
    raise SystemExit(10)
try:
    accounts = json.loads(payload)
except json.JSONDecodeError as exc:
    print(f"JSON decode error: {exc}", file=sys.stderr)
    raise SystemExit(11)
if not isinstance(accounts, list):
    print("Expected a list of accounts in state/accounts.yaml", file=sys.stderr)
    raise SystemExit(12)
for account in accounts:
    account_id = account.get("id", "")
    home = account.get("home", "")
    email = account.get("email") or ""
    label = account.get("label") or ""
    print(f"{account_id}|{home}|{email}|{label}")
PY
        local codex_count
        codex_count=$(grep -c '.' "$codex_out" 2>/dev/null || echo "0")
        if [ "$codex_count" -gt 0 ]; then
          while IFS='|' read -r account_id account_home account_email account_label; do
            [ -z "$account_id" ] && continue
            local previous_home="$CODEX_HOME"
            CODEX_HOME="$account_home"
            export CODEX_HOME
            if fetch_auth_status codex 2>/dev/null && [ "$(provider_authenticated codex)" = "true" ]; then
              has_codex=1
            fi
            CODEX_HOME="$previous_home"
            export CODEX_HOME
            [ $has_codex -eq 1 ] && break
          done <"$codex_out"
        fi
      else
        log "⚠️ Unable to parse Codex accounts during provider check. Verify state/accounts.yaml."
        if [ -s "$codex_err" ]; then
          while IFS= read -r err_line; do
            [ -n "$err_line" ] && log "   $err_line"
          done <"$codex_err"
        fi
      fi
      rm -f "$codex_tmp" "$codex_out" "$codex_err"
      fi
    fi
  else
    # Legacy mode - check default CODEX_HOME
    if fetch_auth_status codex 2>/dev/null && [ "$(provider_authenticated codex)" = "true" ]; then
      has_codex=1
    fi
  fi

  # Check if any Claude account is authenticated
  if [ "$ENABLE_CLAUDE_EVAL" -eq 1 ]; then
    local claude_json
    if claude_json=$(python "$ACCOUNT_MANAGER" list claude 2>/dev/null); then
      if [ -z "${claude_json//[[:space:]]/}" ]; then
        :
      else
        local parsed_claude
        parsed_claude=$(python - "$claude_json" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
for acc in payload:
    env = acc.get('env') or {}
    print(f"{acc.get('id', '')}\t{acc.get('bin', 'claude')}\t{env.get('CLAUDE_CONFIG_DIR', '')}")
PY
) || parsed_claude=""

        while IFS=$'\t' read -r acc_id acc_bin claude_config_dir; do
          [ -z "$acc_id" ] && continue
          local bin_cmd="${acc_bin:-claude}"
          if command -v "$bin_cmd" >/dev/null 2>&1; then
            local config="${claude_config_dir:-$ROOT/.accounts/claude/$acc_id}"
            if CLAUDE_CONFIG_DIR="$config" "$bin_cmd" whoami >/dev/null 2>&1; then
              has_claude=1
              break
            fi
          fi
        done <<<"$parsed_claude"
      fi
    fi
  fi

  # Exit if no providers are available
  if [ $has_codex -eq 0 ] && [ $has_claude -eq 0 ]; then
    log "❌ No authenticated providers available."
    log "   Autopilot needs at least one provider:"
    log "     • Codex (OpenAI): CODEX_HOME=<path> codex login"
    log "     • Claude Code: CLAUDE_CONFIG_DIR=<path> claude login"
    log "   Configured accounts:"
    if [ "$ACCOUNT_MANAGER_ENABLED" -eq 1 ]; then
      if codex_json=$(python "$ACCOUNT_MANAGER" list codex 2>/dev/null); then
        local codex_tmp codex_err
        codex_tmp=$(mktemp)
        codex_err=$(mktemp)
        printf '%s\n' "$codex_json" >"$codex_tmp"
        if ! python - <<'PY' "$codex_tmp" 2>"$codex_err"
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = path.read_text(encoding="utf-8")
if not payload.strip():
    raise SystemExit(10)
try:
    accounts = json.loads(payload)
except json.JSONDecodeError as exc:
    print(f"    ⚠️ Codex account JSON invalid: {exc}", file=sys.stderr)
    raise SystemExit(11)
if not isinstance(accounts, list):
    print("    ⚠️ Codex accounts entry must be a list in state/accounts.yaml", file=sys.stderr)
    raise SystemExit(12)
if not accounts:
    print("    ⚠️ No Codex accounts defined in state/accounts.yaml", file=sys.stderr)
    raise SystemExit(13)
for acc in accounts:
    email = acc.get("email") or acc.get("id") or "unknown"
    home = acc.get("home", "N/A")
    print(f"  - Codex: {email} (CODEX_HOME={home})")
PY
        then
          if [ -s "$codex_err" ]; then
            while IFS= read -r err_line; do
              [ -n "$err_line" ] && log "$err_line"
            done <"$codex_err"
          fi
        fi
        rm -f "$codex_tmp" "$codex_err"
      fi
      if claude_json=$(python "$ACCOUNT_MANAGER" list claude 2>/dev/null); then
        local claude_tmp claude_err
        claude_tmp=$(mktemp)
        claude_err=$(mktemp)
        printf '%s\n' "$claude_json" >"$claude_tmp"
        if ! python - <<'PY' "$claude_tmp" 2>"$claude_err"
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = path.read_text(encoding="utf-8")
if not payload.strip():
    raise SystemExit(10)
try:
    accounts = json.loads(payload)
except json.JSONDecodeError as exc:
    print(f"    ⚠️ Claude account JSON invalid: {exc}", file=sys.stderr)
    raise SystemExit(11)
if not isinstance(accounts, list):
    print("    ⚠️ Claude accounts entry must be a list in state/accounts.yaml", file=sys.stderr)
    raise SystemExit(12)
if not accounts:
    print("    ⚠️ No Claude accounts defined in state/accounts.yaml", file=sys.stderr)
    raise SystemExit(13)
for acc in accounts:
    env = acc.get("env") or {}
    config_dir = env.get("CLAUDE_CONFIG_DIR", "N/A")
    identifier = acc.get("id") or "claude"
    print(f"  - Claude: {identifier} (CLAUDE_CONFIG_DIR={config_dir})")
PY
        then
          if [ -s "$claude_err" ]; then
            while IFS= read -r err_line; do
              [ -n "$err_line" ] && log "$err_line"
            done <"$claude_err"
          fi
        fi
        rm -f "$claude_tmp" "$claude_err"
      fi
    else
      log "  - Codex (legacy): CODEX_HOME=$CODEX_HOME"
    fi
    log "👉 Authenticate one of the providers above and rerun 'make mcp-autopilot'."
    console_blank
    abort_autopilot_offline "no-provider-authenticated" "No authenticated Codex or Claude accounts detected."
  fi

  # Log which providers are available
  if [ $has_codex -eq 1 ] && [ $has_claude -eq 1 ]; then
    log "✅ Both Codex and Claude Code providers are authenticated and ready"
  elif [ $has_codex -eq 1 ]; then
    log "✅ Codex provider is authenticated and ready (Claude Code not available)"
    if [ "${WVO_DISABLE_CLAUDE:-0}" != "1" ]; then
      export WVO_DISABLE_CLAUDE=1
      log "ℹ️  Disabling Claude coordinator for this run (WVO_DISABLE_CLAUDE=1)"
    fi
  elif [ $has_claude -eq 1 ]; then
    log "✅ Claude Code provider is authenticated and ready (Codex not available)"
  fi
}

ensure_network_reachable() {
  if [ "${WVO_AUTOPILOT_SKIP_NETWORK_CHECK:-0}" = "1" ]; then
    log "Skipping network connectivity preflight (WVO_AUTOPILOT_SKIP_NETWORK_CHECK=1)."
    return
  fi

  log "Running network connectivity preflight check..."
  local endpoints=(
    "https://api.openai.com"
    "https://chatgpt.com"
  )
  local endpoint=""
  for endpoint in "${endpoints[@]}"; do
    # Check connectivity only – accept any HTTP response code (e.g. 421)
    # capturing the numeric status via curl's write-out hook.
    local http_code
    http_code=$(curl --silent --max-time 5 --write-out '%{http_code}' --output /dev/null "$endpoint" 2>/dev/null || true)
    if ! printf '%s' "$http_code" | grep -qE '^[0-9]{3}$'; then
      log "❌ Unable to reach $endpoint. Autopilot requires outbound network access."
      log "   Launch the autopilot from your macOS Terminal (not the sandboxed CLI) so Codex/Claude can reach their APIs."
      LAST_FAILURE_REASON="network_unreachable"
      LAST_FAILURE_DETAILS="Unable to reach $endpoint during preflight."
      abort_autopilot_offline "network-unreachable" "$LAST_FAILURE_DETAILS"
    else
      log "   $endpoint responded with HTTP $http_code"
    fi
  done
  log "✅ Network connectivity check passed."
}

ensure_accounts_config
summarize_web_inspiration_cache() {
  if [ "$WVO_ENABLE_WEB_INSPIRATION" != "1" ]; then
    return
  fi

  local cache_report
  cache_report="$(python - "$ROOT/state/web_inspiration" <<'PY'
import json, os, sys, time
from pathlib import Path

base = Path(sys.argv[1])
if not base.exists():
    print("Web inspiration cache: empty (feature enabled)")
    raise SystemExit

count = 0
latest_ts = 0
total_size = 0

for task_dir in base.iterdir():
    if not task_dir.is_dir():
        continue
    metadata_file = task_dir / "metadata.json"
    if not metadata_file.exists():
        continue
    try:
        data = json.loads(metadata_file.read_text(encoding="utf-8"))
    except Exception:
        continue
    count += 1
    meta = data.get("metadata") or {}
    latest_ts = max(latest_ts, int(meta.get("timestamp") or 0))
    for name in ("screenshotPath", "htmlPath"):
        p = data.get(name)
        if not p:
            continue
        path = Path(p)
        if path.exists():
            total_size += path.stat().st_size

if count == 0:
    print("Web inspiration cache: empty (feature enabled)")
else:
    latest_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(latest_ts / 1000)) if latest_ts else "n/a"
    print(
        f"Web inspiration cache: {count} task(s), "
        f"~{total_size // 1024} KB total, latest capture {latest_str}Z"
    )
PY
)" || cache_report=""
  if [ -n "$cache_report" ]; then
    log "$cache_report"
  fi
}

if [ "${WVO_AUTOPILOT_OFFLINE:-0}" = "1" ]; then
  log "❌ WVO_AUTOPILOT_OFFLINE=1 detected - this is not allowed."
  log "   Autopilot MUST run with real API connectivity. Offline mode is deceptive."
  log "   Remove WVO_AUTOPILOT_OFFLINE=1 and ensure network connectivity."
  write_offline_summary "offline-mode" "WVO_AUTOPILOT_OFFLINE=1 set - REJECTED (offline mode prohibited)"
  exit 1
fi

if [ "${WVO_AUTOPILOT_SMOKE:-0}" != "1" ]; then
  if [ "${WVO_AUTOPILOT_SKIP_DNS_CHECK:-0}" = "1" ]; then
    log "Skipping DNS preflight (WVO_AUTOPILOT_SKIP_DNS_CHECK=1)."
  else
    if ! DNS_CHECK=$(verify_codex_dns 2>&1); then
      LAST_FAILURE_REASON="dns_lookup_failed"
      LAST_FAILURE_DETAILS="$DNS_CHECK"
      log "❌ Unable to resolve Codex service hosts (chatgpt.com/api.openai.com)."
      printf '%s\n' "$DNS_CHECK" | sed 's/^/   /'
      log "   Check local DNS/network configuration. Autopilot CANNOT run offline."
      log_dns_diagnostics
      write_offline_summary "dns-lookup-failed" "$DNS_CHECK"
      log "❌ DNS lookup failed - cannot run autopilot offline. Fix network first."
      exit 1
    fi
  fi
  ensure_network_reachable
fi

ensure_web_inspiration_ready
summarize_web_inspiration_cache

if [ "${WVO_AUTOPILOT_SMOKE:-0}" = "1" ]; then
  log "Running autopilot smoke check..."
  log_accounts_overview codex "Codex" || true
  log_accounts_overview claude "Claude" || true
  if ! verify_codex_accounts; then
    log "Smoke check: codex verification returned a non-zero status."
  fi
  if ! verify_claude_accounts; then
    log "Smoke check: claude verification returned a non-zero status."
  fi
  log "Autopilot smoke check completed."
  exit 0
fi

check_all_accounts_auth
ensure_at_least_one_provider

# Try to select Codex account; if all exhausted, enable Claude Code failover
USE_CLAUDE_FALLBACK=0
CODEX_RETRY_AT=0
if ! select_codex_account; then
  if [ "${CLAUDE_ACCOUNTS_AVAILABLE:-0}" -eq 1 ]; then
    log "All Codex accounts exhausted. Enabling Claude Code fallback mode."
    USE_CLAUDE_FALLBACK=1
  else
    log "All Codex accounts exhausted, but no Claude accounts configured. Waiting on Codex cooldown."
    USE_CLAUDE_FALLBACK=0
  fi
fi

TELEMETRY_DIR="$ROOT/state/telemetry"
USAGE_LOG="$TELEMETRY_DIR/usage.jsonl"
mkdir -p "$TELEMETRY_DIR"

RECOVERY_ATTEMPTED=0

append_usage_telemetry() {
  local status="$1"
  local attempt="$2"
  local start_iso="$3"
  local end_iso="$4"
  local duration="$5"
  local fallback_flag="${AUTOPILOT_FALLBACK_SESSION:-0}"
  python - <<'PY' "$USAGE_LOG" "$status" "$attempt" "$start_iso" "$end_iso" "$duration" "$AUTOPILOT_MODEL" "$CLI_PROFILE" "$WVO_CAPABILITY" "$fallback_flag"
import json
import sys
import pathlib

(
    log_path,
    status,
    attempt,
    started_at,
    finished_at,
    duration,
    model,
    profile,
    capability,
    fallback,
) = sys.argv[1:]

log_path = pathlib.Path(log_path)
record = {
    "status": status,
    "attempt": int(attempt),
    "started_at": started_at,
    "finished_at": finished_at,
    "duration_seconds": int(duration),
    "model": model,
    "profile": profile,
    "capability": capability,
    "fallback_used": fallback in {"1", "true", "True"},
}

with log_path.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(record) + "\n")
PY
}

autopilot_git_sync() {
  local summary_json="${1:-}"

  if [ "$AUTOPILOT_GIT_SYNC" != "1" ]; then
    return
  fi

  if ! command -v git >/dev/null 2>&1; then
    log "Auto-sync: git CLI not available; skipping push."
    return
  fi

  local status
  if ! status=$(cd "$ROOT" && git status --porcelain); then
    log "Auto-sync: git status failed; skipping push."
    return
  fi

  if [ -z "$status" ]; then
    log "Auto-sync: workspace clean; nothing to push."
    return
  fi

  if [ -n "$AUTOPILOT_GIT_SKIP_PATTERN" ]; then
    if printf '%s\n' "$status" | grep -qF "$AUTOPILOT_GIT_SKIP_PATTERN"; then
      log "Auto-sync: skip pattern '$AUTOPILOT_GIT_SKIP_PATTERN' detected; skipping automated sync."
      return
    fi
  fi

  local commit_message
  commit_message=$(SUMMARY_PAYLOAD="$summary_json" python - <<'PY'
import json
import os
from datetime import datetime, timezone

payload = os.environ.get("SUMMARY_PAYLOAD", "")
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
default = f"autopilot: sync {now}"

if not payload:
    print(default)
    raise SystemExit(0)

try:
    data = json.loads(payload)
except Exception:
    print(default)
    raise SystemExit(0)

completed = data.get("completed_tasks") or []
in_progress = data.get("in_progress") or []
notes = data.get("notes")

snippet = ""
if isinstance(notes, str):
    snippet = notes.strip().splitlines()[0][:60]

parts = []
if completed:
    parts.append(f"C{len(completed)}")
if in_progress:
    parts.append(f"I{len(in_progress)}")

summary = ", ".join(parts) if parts else "sync"
if snippet:
    summary = f"{summary} – {snippet}"

print(f"autopilot: {summary} {now}".strip())
PY
) || commit_message="autopilot: sync $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [ -z "$commit_message" ]; then
    commit_message="autopilot: sync $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi

  set +e
  (cd "$ROOT" && git add -A)
  local add_status=$?
  if [ $add_status -ne 0 ]; then
    set -e
    log "Auto-sync: git add failed (exit $add_status); skipping push."
    return
  fi

  (cd "$ROOT" && git commit -m "$commit_message")
  local commit_status=$?
  if [ $commit_status -ne 0 ]; then
    set -e
    if [ $commit_status -eq 1 ]; then
      log "Auto-sync: nothing to commit after staging."
    else
      log "Auto-sync: git commit failed (exit $commit_status)."
    fi
    return
  fi

  log "Auto-sync: pushing to ${AUTOPILOT_GIT_REMOTE}/${AUTOPILOT_GIT_BRANCH} with message: $commit_message"
  (cd "$ROOT" && git push "$AUTOPILOT_GIT_REMOTE" "$AUTOPILOT_GIT_BRANCH")
  local push_status=$?
  set -e
  if [ $push_status -ne 0 ]; then
    log "Auto-sync: git push failed (exit $push_status)."
  else
    log "Auto-sync: push complete."
  fi
}

attempt_recovery() {
  if [ "$RECOVERY_ATTEMPTED" -eq 1 ]; then
    return 1
  fi
  RECOVERY_ATTEMPTED=1
  if [ "${WVO_AUTOPILOT_ALLOW_WORKER_RECOVERY:-0}" = "1" ]; then
    announce_phase "Manual Coordination" "Director Dana will schedule automation upkeep; continuing PRODUCT work meanwhile." "" "!!"
    log "WVO_AUTOPILOT_ALLOW_WORKER_RECOVERY=1 detected. Note the request for Director Dana; continue building while automation is scheduled."
  else
    log "Automation services handled separately; continuing PRODUCT execution without pause."
  fi
  return 1
}

BALANCE_FILE="$ROOT/state/autopilot_balance.json"

balance_read_message() {
  python - <<'PY' "$BALANCE_FILE"
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
if not path.exists():
    print("")
    raise SystemExit
try:
    stats = json.loads(path.read_text())
except Exception:
    print("")
    raise SystemExit
message = stats.get("message", "")
print(message)
PY
}

balance_needs_escalation() {
  python - <<'PY' "$BALANCE_FILE"
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
if not path.exists():
    print("0")
    raise SystemExit
try:
    stats = json.loads(path.read_text())
except Exception:
    print("0")
    raise SystemExit
needs = bool(stats.get("needs_escalation"))
print("1" if needs else "0")
PY
}

update_balance_from_summary() {
  python - "$BALANCE_FILE" <<'PY'
import json
import sys
import pathlib
from datetime import datetime, timezone

path = pathlib.Path(sys.argv[1])
summary_text = sys.stdin.read().strip()
if not summary_text:
    sys.exit(0)
try:
    summary = json.loads(summary_text)
except json.JSONDecodeError:
    summary = {}
if not isinstance(summary, dict):
    if isinstance(summary, list):
        summary = next((item for item in summary if isinstance(item, dict)), {})
    else:
        summary = {}

def normalise_list(value):
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []

completed = normalise_list(summary.get("completed_tasks"))
blockers = normalise_list(summary.get("blockers"))

product_markers = [
    "t1.", "t2.", "t3.", "t4.", "t5.", "t7.", "t8.", "t9.", "t10.", "t11.",
    "epic 1", "epic 2", "epic 3", "epic 4", "epic 5", "epic 7", "epic 11",
    "weather", "allocator", "creative", "plan", "ads", "forecast", "rl", "shadow",
]
mcp_markers = [
    "t6.", "phase 6", "m6.", "mcp", "zero-downtime", "upgrade", "autopilot", "dry_run",
]

def classify(entries):
    counts = {"product": 0, "mcp": 0}
    for entry in entries:
        lower = entry.lower()
        if any(marker in lower for marker in mcp_markers):
            counts["mcp"] += 1
        elif any(marker in lower for marker in product_markers):
            counts["product"] += 1
    return counts

completed_counts = classify(completed)
blocker_counts = classify(blockers)

stats = {}
if path.exists():
    try:
        stats = json.loads(path.read_text())
    except Exception:
        stats = {}
if not isinstance(stats, dict):
    stats = {}

stats.setdefault("product_completed_total", 0)
stats.setdefault("mcp_completed_total", 0)
stats.setdefault("product_blockers_total", 0)
stats.setdefault("mcp_blockers_total", 0)
stats.setdefault("product_blockers_streak", 0)
history = stats.get("recent_domains", [])
if not isinstance(history, list):
    history = []

stats["product_completed_total"] += completed_counts["product"]
stats["mcp_completed_total"] += completed_counts["mcp"]
stats["product_blockers_total"] += blocker_counts["product"]
stats["mcp_blockers_total"] += blocker_counts["mcp"]

if blocker_counts["product"] > 0:
    stats["product_blockers_streak"] = stats.get("product_blockers_streak", 0) + 1
else:
    stats["product_blockers_streak"] = 0

if completed_counts["product"] > 0:
    history.append("product")
elif completed_counts["mcp"] > 0:
    history.append("mcp")
elif blocker_counts["product"] > 0:
    history.append("blocked_product")
elif blocker_counts["mcp"] > 0:
    history.append("blocked_mcp")
else:
    history.append("none")

history = history[-12:]
stats["recent_domains"] = history

recent_product = sum(1 for item in history if item == "product")
recent_mcp = sum(1 for item in history if item == "mcp")
streak = stats.get("product_blockers_streak", 0)

needs_escalation = streak >= 2 or recent_mcp >= recent_product + 2
stats["needs_escalation"] = needs_escalation

message = (
    f"Recent domain mix (last {len(history)} runs): product {recent_product}, MCP {recent_mcp}. "
    f"Product blocker streak: {streak}."
)
if needs_escalation:
    message += " ACTION: unblock product work or coordinate with Dana before touching infrastructure automation."
stats["message"] = message
stats["last_updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

with path.open("w", encoding="utf-8") as handle:
  json.dump(stats, handle, indent=2)
PY
}

enrich_summary_with_meta() {
  local provider="$POLICY_PROVIDER_USED"
  local model="$POLICY_MODEL_USED"
  local fallback="$POLICY_FALLBACK_USED"
  local attempts="$POLICY_ATTEMPTS"
  local duration="$POLICY_LAST_DURATION"
  local status="$POLICY_LAST_STATUS"
  local completed_at="$POLICY_LAST_COMPLETED_AT"
  python - "$provider" "$model" "$fallback" "$attempts" "$duration" "$status" "$completed_at" <<'PY'
import json
import sys

provider, model, fallback, attempts, duration, status, completed_at = sys.argv[1:8]

try:
    payload = json.loads(sys.stdin.read())
except json.JSONDecodeError:
    payload = {
        "completed_tasks": [],
        "in_progress": [],
        "blockers": [],
        "next_focus": [],
        "notes": "",
    }

meta = payload.get("meta") or {}

def _coerce_int(value, default):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default

meta.update(
    {
        "provider": provider or "unknown",
        "model": model or "unknown",
        "fallback_used": str(fallback or "0") == "1",
        "attempt": _coerce_int(attempts, 0),
        "duration_seconds": max(0, _coerce_int(duration, 0)),
        "status": status or "unknown",
        "completed_at": completed_at,
    }
)

payload["meta"] = meta
print(json.dumps(payload))
PY
}

update_policy_controller() {
  local summary_json="${1:-}"
  if [ ! -f "$POLICY_CONTROLLER_SCRIPT" ]; then
    return
  fi
  if [ -z "${POLICY_DECISION_FILE:-}" ] || [ ! -f "$POLICY_DECISION_FILE" ]; then
    return
  fi
  if [ -z "${summary_json//[[:space:]]/}" ]; then
    return
  fi
  local enriched
  enriched="$(printf '%s' "$summary_json" | enrich_summary_with_meta)"
  python "$POLICY_CONTROLLER_SCRIPT" \
    update \
    --state "$POLICY_STATE_FILE" \
    --history "$POLICY_HISTORY_FILE" \
    --roadmap "$ROOT/state/roadmap.yaml" \
    --decision-file "$POLICY_DECISION_FILE" \
    <<<"$enriched" >>"$LOG_FILE" 2>&1 || true
}

NODE_RESOLVE_PATH="$ROOT/tools/wvo_mcp/node_modules"
if [ -d "$NODE_RESOLVE_PATH" ]; then
  NODE_PATH="$NODE_RESOLVE_PATH${NODE_PATH:+:$NODE_PATH}"
  export NODE_PATH
fi

SCHEMA_FILE="$(mktemp)"
PROMPT_FILE="$(mktemp)"
POLICY_DECISION_FILE=""
trap 'rm -f "$SCHEMA_FILE" "$PROMPT_FILE" "$POLICY_DECISION_FILE"' EXIT

NO_PROGRESS_CYCLES=0
NO_PROGRESS_LIMIT="${WVO_AUTOPILOT_IDLE_LIMIT:-3}"
LAST_IDLE_SUM_SIGNATURE=""

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

cd "$ROOT"

while true; do
  if [ "$WVO_ENABLE_WEB_INSPIRATION" = "1" ]; then
    cleanup_stamp="$ROOT/state/.web_inspiration_cleanup"
    today=$(date -u +%Y-%m-%d)
    if [ ! -f "$cleanup_stamp" ] || [ "$(cat "$cleanup_stamp")" != "$today" ]; then
      bash "$ROOT/tools/wvo_mcp/scripts/cleanup_inspiration.sh" 2>/dev/null || true
      printf '%s' "$today" > "$cleanup_stamp"
    fi
  fi

  run_claude_evaluation

  AUTOPILOT_STATE_SNIPPET=$(node --input-type=module - "$ROOT" <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2] || process.cwd();
const file = path.join(root, "state", "autopilot.yaml");
const yamlModulePath = path.join(
  root,
  "tools",
  "wvo_mcp",
  "node_modules",
  "yaml",
  "dist",
  "index.js",
);

if (!fs.existsSync(file)) {
  console.log("- No surprise QA audits recorded yet.");
  process.exit(0);
}

let YAML;
try {
  const moduleUrl = pathToFileURL(yamlModulePath).href;
  const imported = await import(moduleUrl);
  YAML = imported.default ?? imported;
} catch (error) {
  console.log(`- YAML module unavailable (${error instanceof Error ? error.message : String(error)})`);
  process.exit(0);
}

let parsed;
try {
  parsed = YAML.parse(fs.readFileSync(file, "utf-8")) || {};
} catch (error) {
  console.log(`- Unable to read autopilot.yaml: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(0);
}

const lines = [];
const last = parsed.last_audit;
if (last) {
  const focus = last.focus ? ` -- focus: ${last.focus}` : "";
  const task = last.task_id ? `task ${last.task_id}` : "unspecified task";
  lines.push(`- Last audit: ${last.timestamp ?? "unknown time"} (${task}${focus})`);
} else {
  lines.push("- No surprise QA audits recorded yet.");
}

const history = Array.isArray(parsed.audit_history) ? parsed.audit_history : [];
if (history.length > 1) {
  const recent = history.slice(1, 4);
  if (recent.length) {
    lines.push("- Additional recent audits:");
    for (const entry of recent) {
      const focus = entry.focus ? ` -- focus: ${entry.focus}` : "";
      const task = entry.task_id ? `task ${entry.task_id}` : "unspecified task";
      lines.push(`  - ${entry.timestamp ?? "unknown time"} (${task}${focus})`);
    }
  }
}

  console.log(lines.join("\n"));
NODE
)

  TASK_MEMO_SNIPPET=$(python - <<'PY' "$TASK_MEMO_DIR"
import json
from pathlib import Path
import sys

memo_dir = Path(sys.argv[1])
if not memo_dir.exists():
    print("- No active task memos recorded yet.")
    raise SystemExit(0)

records = []
for path in memo_dir.glob("*.json"):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue
    if not isinstance(data, dict):
        continue
    statuses = data.get("statuses") or []
    if not statuses:
        continue
    if set(statuses).issubset({"done"}):
        continue
    updated = data.get("updated_at") or ""
    records.append((updated, path.name, data))

if not records:
    print("- No active task memos recorded yet.")
    raise SystemExit(0)

records.sort(key=lambda item: item[0], reverse=True)
lines = []
limit = 5
note_printed = False
for updated, _, data in records[:limit]:
    label = data.get("label") or data.get("task_id") or data.get("key")
    statuses = ", ".join(data.get("statuses", [])) or "unknown"
    stamp = updated or "unknown"
    lines.append(f"- {label} (status: {statuses}, updated {stamp})")
    note = (data.get("note") or "").strip()
    if note and not note_printed:
        if len(note) > 260:
            note = note[:257].rstrip() + "..."
        lines.append(f"  • Session note: {note}")
        note_printed = True
    next_items = data.get("next") or []
    if next_items:
        lines.append(f"  • Next: {next_items[0]}")
        if len(next_items) > 1:
            lines.append(f"  • Next+: {next_items[1]}")
    blockers = data.get("blockers") or []
    if blockers:
        lines.append(f"  • Blockers: {', '.join(blockers[:2])}")

print("\n".join(lines))
PY
)
  if [ -z "$TASK_MEMO_SNIPPET" ]; then
    TASK_MEMO_SNIPPET="- No active task memos recorded yet."
  fi

  BALANCE_MESSAGE="$(balance_read_message)"

  if [ -f "$POLICY_CONTROLLER_SCRIPT" ]; then
    mkdir -p "$POLICY_STATE_DIR" "$(dirname "$POLICY_HISTORY_FILE")"
    POLICY_DECISION_FILE="$(mktemp)"
    POLICY_DECISION_JSON="$(
      python "$POLICY_CONTROLLER_SCRIPT" \
        decide \
        --state "$POLICY_STATE_FILE" \
        --history "$POLICY_HISTORY_FILE" \
        --roadmap "$ROOT/state/roadmap.yaml" \
        --balance "$BALANCE_FILE" 2>/dev/null || true
    )"
    if [ -n "${POLICY_DECISION_JSON//[[:space:]]/}" ]; then
      printf '%s\n' "$POLICY_DECISION_JSON" >"$POLICY_DECISION_FILE"
      POLICY_DIRECTIVE="$(
        python - <<'PY' "$POLICY_DECISION_JSON"
import json
import sys
try:
    data = json.loads(sys.argv[1])
except Exception:
    data = {}
directive = data.get("prompt_directive") or ""
if not directive.strip():
    directive = "Policy controller returned no directive; default to product execution and note any infrastructure follow-ups."
print(directive)
PY
      )"
      POLICY_DOMAIN="$(
        python - <<'PY' "$POLICY_DECISION_JSON"
import json
import sys
try:
    data = json.loads(sys.argv[1])
except Exception:
    data = {}
print(data.get("domain", "unknown"))
PY
      )"
      POLICY_ACTION="$(
        python - <<'PY' "$POLICY_DECISION_JSON"
import json
import sys
try:
    data = json.loads(sys.argv[1])
except Exception:
    data = {}
print(data.get("action", "execute_tasks"))
PY
      )"
      log "Policy controller decision: domain=${POLICY_DOMAIN:-unknown}, action=${POLICY_ACTION:-unknown}"
      if [ "${POLICY_ACTION:-}" = "idle" ]; then
        log "Policy controller reports no actionable work; recording idle cycle and exiting."
        IDLE_TIMESTAMP="$(timestamp)"
        POLICY_PROVIDER_USED="policy-controller"
        POLICY_MODEL_USED="idle-cycle"
        POLICY_FALLBACK_USED=0
        POLICY_ATTEMPTS=0
        POLICY_LAST_STATUS="skipped"
        POLICY_LAST_COMPLETED_AT="$IDLE_TIMESTAMP"
        POLICY_LAST_DURATION=0
        IDLE_SUMMARY="$(python - <<'PY' "$POLICY_DECISION_JSON"
import json
import sys

try:
    decision = json.loads(sys.argv[1])
except Exception:
    decision = {}

domain = (decision.get("domain") or "product").lower()
snapshot = decision.get("domain_snapshot") or {}

def _coerce_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0

remaining = _coerce_int(snapshot.get("remaining"))
blocked = _coerce_int(snapshot.get("blocked"))
in_progress = _coerce_int(snapshot.get("in_progress"))
reason = decision.get("reason") or decision.get("prompt_directive") or ""

parts = [
    "Autopilot skipped run: policy action 'idle' with no active tasks detected.",
    f"Domain '{domain}' snapshot — remaining={remaining}, in_progress={in_progress}, blocked={blocked}.",
]
if reason:
    parts.append(f"Policy rationale: {reason}")

summary = {
    "completed_tasks": [],
    "in_progress": [],
    "blockers": [],
    "next_focus": [],
    "notes": " ".join(parts),
    "_meta": {
        "source": "policy_idle_cycle",
        "reason": "no_active_tasks",
    },
}

print(json.dumps(summary))
PY
)"
        printf '%s\n' "$IDLE_SUMMARY" > "$STATE_FILE"
        update_policy_controller "$IDLE_SUMMARY"
        critics_backoff_update_from_summary "$IDLE_SUMMARY"
        append_usage_telemetry "skipped" 0 "$IDLE_TIMESTAMP" "$IDLE_TIMESTAMP" 0
        log "Idle summary persisted to $STATE_FILE; shutting down without launching automation."
        exit 0
      fi
      if [ "${WVO_AUTOPILOT_FORCE_PRODUCT:-1}" = "1" ] && [ "${POLICY_DOMAIN:-product}" != "product" ]; then
        log "Product-only mode enforced; overriding policy domain ${POLICY_DOMAIN:-unknown} -> product."
        POLICY_DOMAIN="product"
        POLICY_ACTION="execute_tasks"
        POLICY_DIRECTIVE="Policy target: focus exclusively on the PRODUCT domain. Infrastructure work demands explicit human scheduling. Deliver customer-facing value with full rigor."
        POLICY_DECISION_JSON='{}'
      fi
    else
      POLICY_DIRECTIVE="Policy controller unavailable; defaulting to product-only execution. Escalate manually before adjusting shared automation."
      printf '{}' >"$POLICY_DECISION_FILE"
      log "Policy controller unavailable; using legacy heuristic directive."
    fi
  else
    POLICY_DIRECTIVE="Policy controller unavailable; defaulting to product-only execution. Escalate manually before adjusting shared automation."
    POLICY_DECISION_JSON=""
    POLICY_DECISION_FILE=""
    log "Policy controller unavailable; using legacy heuristic directive."
  fi

  CRITICS_BACKOFF_FLAG_RAW="$(critics_backoff_status)"
  IFS='|' read -r CRITICS_BACKOFF_FLAG CRITICS_BACKOFF_UNTIL CRITICS_BACKOFF_REASON <<< "$CRITICS_BACKOFF_FLAG_RAW"
  CRITICS_BACKOFF_FLAG=${CRITICS_BACKOFF_FLAG:-0}
  if [ "$CRITICS_BACKOFF_FLAG" = "1" ]; then
    CRITICS_BACKOFF_REASON=${CRITICS_BACKOFF_REASON:-"Critic automation deferred; continue executing PRODUCT backlog and capture blockers for Director Dana."}
    if [ -z "$CRITICS_BACKOFF_UNTIL" ]; then
      CRITICS_BACKOFF_UNTIL="future cycle"
    fi
    POLICY_DIRECTIVE=$(cat <<EOF
Policy target: focus on the ${POLICY_DOMAIN:-product} domain this cycle.
Primary action: execute_tasks.
Critics backoff active until ${CRITICS_BACKOFF_UNTIL}; treat critic suites as optional assistance and keep advancing PRODUCT deliverables. ${CRITICS_BACKOFF_REASON}
Lean on roadmap.yaml, update state/context.md with progress, and record blockers via plan_update while Director Dana handles supporting automation in parallel.
EOF
)
    POLICY_ACTION="execute_tasks"
    if [ -z "${POLICY_DOMAIN:-}" ]; then
      POLICY_DOMAIN="product"
    fi
    POLICY_DECISION_JSON='{}'
    log "Critics backoff active until ${CRITICS_BACKOFF_UNTIL}; overriding policy directive for autonomous execution."
  fi

  {
    cat <<'HEADER'
Operate under the Autopilot Captain persona—Atlas—and escalate to Director Dana when needed. Your goal is to drive the roadmap to completion with world-class engineering, data/ML, product, and design rigor.

HEADER
    printf 'Current surprise QA ledger:\n%s\n\n' "$AUTOPILOT_STATE_SNIPPET"
    printf 'Task memo cache (recent updates first):\n%s\n\n' "$TASK_MEMO_SNIPPET"
    if [ -n "$BALANCE_MESSAGE" ]; then
      echo "Domain balance signal:"
      printf '%s\n' "$BALANCE_MESSAGE" | sed 's/^/  - /'
      echo ""
    fi
    if [ "$CRITICS_BACKOFF_FLAG" = "1" ]; then
      echo "Critics backoff:"
      printf '  - Active until %s — %s\n\n' "$CRITICS_BACKOFF_UNTIL" "$CRITICS_BACKOFF_REASON"
    fi
    if [ -s "$CLAUDE_EVAL_FILE" ]; then
      echo "Most recent Claude evaluation:"
      sed 's/^/  /' "$CLAUDE_EVAL_FILE"
      echo ""
    fi
    echo "Policy directive (autonomous RL controller):"
    printf '%s\n\n' "$POLICY_DIRECTIVE" | sed 's/^/  - /'
    cat <<'BODY'
Loop:
- BEFORE implementing: Check if feature exists with targeted fs_read (specific line ranges, max 100 lines). If code exists, call `plan_update` marking complete.
- IMMEDIATELY IMPLEMENT using fs_write/cmd_run. DO NOT re-read specs. DO NOT use bash commands outputting >1000 lines (no cat, sed on large files, npm list).
- Work in PRODUCT domain (apps/web, apps/api, shared libs). Make real file changes. Write components, features, fixes, polish UX.
- AFTER completing: Call `plan_update` to mark done, then `plan_next(product, minimal=true)`. Never start by calling plan_next.
- Every cycle: CONCRETE FILE CHANGES. No "planning" without implementation. No repeating work. No massive output (keep <100 lines per tool call).
- After implementing: Run tests with output limits, update context (≤500 words). Use `git diff --stat` NOT full diff.

**TEST QUALITY (CRITICAL):** Tests must verify ACTUAL BEHAVIOR matches design intent, not just pass.
- Write tests that would FAIL if the feature doesn't work as designed
- Include edge cases, error conditions, boundary values, integration scenarios
- Don't write tests that merely greenlight code—validate it works AS INTENDED
- **Test Hierarchy:** Implement both SMALL unit tests (pure functions, single responsibility) AND LARGE unit tests (component integration, cross-boundary interactions)
- Small unit: test_parse_weather_data(), test_calculate_allocation()
- Large unit: test_weather_pipeline_end_to_end(), test_allocation_with_real_constraints()
- Integration: test_api_weather_ingestion(), test_dashboard_alert_flow()
- Example: Don't just test "function returns something", test "function returns correct weather data for edge case timezone"

**DOCUMENTATION QUALITY (CRITICAL):** Documentation must be meaningful and useful, not just describe what exists.
- Explain WHY decisions were made, not just WHAT was done
- Include: purpose, design rationale, edge cases handled, usage examples, known limitations
- Document trade-offs and alternatives considered
- Make it valuable for future developers, not just compliance theater

**OUTPUT LIMITS:** Never output >1000 lines. Use head/tail. Read files with line ranges only. Total conversation must stay <5MB to avoid "string too long" API errors.
Return JSON: COMPLETED work (files/functions), in progress, blockers, notes. Max 200 words.
BODY
  } > "$PROMPT_FILE"

  PROMPT_CONTENT="$(cat "$PROMPT_FILE")"

  attempt=0
while true; do
  AUTOPILOT_FALLBACK_SESSION=0
  RUN_LOG="$(mktemp)"
  attempt_number=$((attempt + 1))
    attempt_start_iso="$(timestamp)"
  attempt_start_epoch=$(date -u +%s)
  POLICY_ATTEMPTS=$attempt_number
  POLICY_LAST_STATUS="in_progress"
  POLICY_LAST_DURATION=0
  POLICY_LAST_COMPLETED_AT=""
  LAST_FAILURE_REASON=""
  LAST_FAILURE_DETAILS=""
  if [ -x "$ROOT/tools/wvo_mcp/scripts/cleanup_workspace.py" ]; then
    python "$ROOT/tools/wvo_mcp/scripts/cleanup_workspace.py" >>"$LOG_FILE" 2>&1 || \
      log "Workspace cleanup script reported an error (continuing)."
  fi
  now_epoch=$(date -u +%s)
  if [ "${CODEX_RETRY_AT:-0}" -gt 0 ]; then
    if [ "$now_epoch" -lt "$CODEX_RETRY_AT" ]; then
      remaining=$(( CODEX_RETRY_AT - now_epoch ))
      if [ "${CLAUDE_ACCOUNTS_AVAILABLE:-0}" -eq 1 ]; then
        if [ "$USE_CLAUDE_FALLBACK" -ne 1 ]; then
          log "Codex cooldown remains for ${remaining}s; running in Claude fallback mode."
        fi
        USE_CLAUDE_FALLBACK=1
      else
        if [ "$USE_CLAUDE_FALLBACK" -ne 0 ]; then
          log "Claude fallback disabled; waiting ${remaining}s for Codex cooldown."
        else
          log "Codex cooldown remains for ${remaining}s; no Claude fallback configured."
        fi
        USE_CLAUDE_FALLBACK=0
        sleep_seconds=$(( remaining < 30 ? remaining : 30 ))
        if [ "$sleep_seconds" -gt 0 ]; then
          sleep "$sleep_seconds"
        fi
        continue
      fi
    else
      if [ "$USE_CLAUDE_FALLBACK" -eq 1 ]; then
        log "Codex cooldown window elapsed; resuming Codex mode."
      fi
      USE_CLAUDE_FALLBACK=0
      CODEX_RETRY_AT=0
    fi
  fi
  attempt_meter="$(progress_bar "$attempt_number" "$MAX_RETRY")"
  announce_phase "Autopilot Attempt ${attempt_number}" "Launching orchestration cycle" "$attempt_meter" ">>"
  log "Starting WeatherVane autopilot run (attempt ${attempt_number})..."

    if [ "$USE_CLAUDE_FALLBACK" -eq 1 ]; then
      POLICY_PROVIDER_USED="claude"
      POLICY_MODEL_USED="${CLAUDE_AUTOPILOT_MODEL:-claude-code}"
      POLICY_FALLBACK_USED=1
      set +e
      if [ "$WVO_AUTOPILOT_STREAM" = "1" ]; then
        run_with_claude_code "$PROMPT_CONTENT" "$RUN_LOG"
        status=$?
        cat "$RUN_LOG" >> "$LOG_FILE"
      else
        run_with_claude_code "$PROMPT_CONTENT" "$RUN_LOG"
        status=$?
        cat "$RUN_LOG" >> "$LOG_FILE"
      fi
      set -e
    else
      POLICY_PROVIDER_USED="codex"
      POLICY_MODEL_USED="$AUTOPILOT_MODEL"
      POLICY_FALLBACK_USED=0
      set +e
      if [ "$WVO_AUTOPILOT_STREAM" = "1" ]; then
        codex exec \
          --profile "$CLI_PROFILE" \
          --model "$AUTOPILOT_MODEL" \
          --dangerously-bypass-approvals-and-sandbox \
          --output-schema "$SCHEMA_FILE" \
          "$PROMPT_CONTENT" 2>&1 | tee "$RUN_LOG"
        status=${PIPESTATUS[0]}
        cat "$RUN_LOG" >> "$LOG_FILE"
      else
        codex exec \
          --profile "$CLI_PROFILE" \
          --model "$AUTOPILOT_MODEL" \
          --dangerously-bypass-approvals-and-sandbox \
          --output-schema "$SCHEMA_FILE" \
          "$PROMPT_CONTENT" >"$RUN_LOG" 2>&1
        status=$?
        cat "$RUN_LOG" >> "$LOG_FILE"
      fi
      set -e
    fi

    if [ "$status" -ge 130 ] && [ "$status" -le 143 ]; then
      attempt_end_iso="$(timestamp)"
      attempt_end_epoch=$(date -u +%s)
      duration=$((attempt_end_epoch - attempt_start_epoch))
      POLICY_LAST_STATUS="interrupted"
      POLICY_LAST_COMPLETED_AT="$attempt_end_iso"
      POLICY_LAST_DURATION=$duration
      append_usage_telemetry "interrupted" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
      announce_phase "Autopilot Interrupted" "Operator requested stop (signal ${status}). Exiting without retry." "" "!!"
      log "Autopilot interrupted by operator (exit status $status)."
      rm -f "$RUN_LOG"
      exit 0
    fi

    if grep -qi 'usage limit' "$RUN_LOG"; then
      attempt_end_iso="$(timestamp)"
      attempt_end_epoch=$(date -u +%s)
      duration=$((attempt_end_epoch - attempt_start_epoch))
      POLICY_LAST_STATUS="usage_limit"
      POLICY_LAST_COMPLETED_AT="$attempt_end_iso"
      POLICY_LAST_DURATION=$duration
      append_usage_telemetry "usage_limit" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"

      if [ "$USE_CLAUDE_FALLBACK" -eq 1 ]; then
        # Already using Claude and hit a limit; this is handled by run_with_claude_code
        # Just continue to retry with next Claude account
        log "Claude Code usage limit detected; will retry with next available account."
      else
        # Using Codex and hit a limit
        wait_seconds=$(parse_usage_wait "$RUN_LOG" 2>/dev/null) || true
        if [ -n "$wait_seconds" ]; then
          log "Codex usage limit detected: cooling down current account for ${wait_seconds}s."
        else
          wait_seconds=$USAGE_LIMIT_BACKOFF
          log "Codex usage limit detected (no exact wait supplied). Applying default cooldown ${wait_seconds}s."
        fi
        record_provider_cooldown codex "$CURRENT_CODEX_ACCOUNT" "$wait_seconds"

        # Try to switch to another Codex account without blocking; otherwise fall back to Claude
        prev_wait_attempts="${CODEX_WAIT_ATTEMPTS-}"
        CODEX_WAIT_ATTEMPTS=0
        codex_switch_status=1
        if select_codex_account; then
          codex_switch_status=0
        else
          codex_switch_status=$?
        fi
        if [ -n "${prev_wait_attempts}" ]; then
          CODEX_WAIT_ATTEMPTS="$prev_wait_attempts"
        else
          unset CODEX_WAIT_ATTEMPTS 2>/dev/null || true
        fi

        if [ "$codex_switch_status" -eq 0 ]; then
          log "Switched to alternate Codex account after usage limit; retrying Codex mode."
          rm -f "$RUN_LOG"
          continue 2
        fi

        CODEX_RETRY_AT=$(( $(date -u +%s) + wait_seconds ))
        if [ "${CLAUDE_ACCOUNTS_AVAILABLE:-0}" -eq 1 ]; then
          USE_CLAUDE_FALLBACK=1
          log "Codex accounts cooling down; using Claude fallback for approximately ${wait_seconds}s."
        else
          USE_CLAUDE_FALLBACK=0
          log "Codex accounts cooling down for approximately ${wait_seconds}s; no Claude fallback configured."
        fi
      fi

      rm -f "$RUN_LOG"
      continue 2
    fi

    if [ "$status" -ne 0 ]; then
      attempt_end_iso="$(timestamp)"
      attempt_end_epoch=$(date -u +%s)
      duration=$((attempt_end_epoch - attempt_start_epoch))
      POLICY_LAST_STATUS="error"
      POLICY_LAST_COMPLETED_AT="$attempt_end_iso"
      POLICY_LAST_DURATION=$duration
      append_usage_telemetry "error" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"

      if grep -qiE 'error sending request|resolve host|name or service not known|getaddrinfo|temporary failure in name resolution|lookup .* timed out|ENOTFOUND|ECONNRESET|ECONNREFUSED|connection refused|connect ECONN' "$RUN_LOG"; then
        LAST_FAILURE_REASON="network"
        LAST_FAILURE_DETAILS="$(tail -n 20 "$RUN_LOG")"
        log "❌ Codex exec failed due to network connectivity issues (unable to reach OpenAI endpoints)."
        log "   Ensure outbound network access is permitted for the Codex CLI (https://chatgpt.com and api.openai.com)."
        log "   If you must run offline, set WVO_AUTOPILOT_OFFLINE=1 to skip the autopilot loop."
        printf '%s\n' "$LAST_FAILURE_DETAILS" | sed 's/^/   /'
        write_offline_summary "network-unreachable" "$LAST_FAILURE_DETAILS"
        rm -f "$RUN_LOG"
        exit 0
      fi

      LAST_FAILURE_REASON="codex_exec_error"
      LAST_FAILURE_DETAILS="$(tail -n 20 "$RUN_LOG")"
      log "❌ Codex exec returned status $status. Last output:"
      printf '%s\n' "$LAST_FAILURE_DETAILS" | sed 's/^/   /'

      log "codex exec exited with status $status. Retrying in 30 seconds..."
      attempt=$((attempt + 1))
      rm -f "$RUN_LOG"
      if [ "$attempt" -ge "$MAX_RETRY" ]; then
        log "Reached maximum retry count ($MAX_RETRY). Autopilot aborting."
        if [ -n "$LAST_FAILURE_REASON" ]; then
          log "Last failure reason: $LAST_FAILURE_REASON"
          printf '%s\n' "$LAST_FAILURE_DETAILS" | sed 's/^/   /'
          write_offline_summary "$LAST_FAILURE_REASON" "$LAST_FAILURE_DETAILS"
        else
          write_offline_summary "codex-exec-error" "$LAST_FAILURE_DETAILS"
        fi
        exit 0
      fi
      sleep 30
      continue
    fi

    if grep -qiE 'context length|max_tokens|conversation too long|prompt too long|exceeded (context|tokens)|maximum context|message is too long|sequence exceeds|token length' "$RUN_LOG"; then
      attempt_end_iso="$(timestamp)"
      attempt_end_epoch=$(date -u +%s)
      duration=$((attempt_end_epoch - attempt_start_epoch))
      POLICY_LAST_STATUS="retry"
      POLICY_LAST_COMPLETED_AT="$attempt_end_iso"
      POLICY_LAST_DURATION=$duration
      append_usage_telemetry "retry" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
      attempt=$((attempt + 1))
      rm -f "$RUN_LOG"
      if [ "$attempt" -ge "$MAX_RETRY" ]; then
        log "Reached maximum retry count ($MAX_RETRY). Autopilot exiting."
        abort_autopilot_offline "max-retries" "Autopilot exceeded MAX_RETRY ($MAX_RETRY) while handling context limit errors."
      fi
      log "Context limit detected. Restarting in 5 seconds..."
      sleep 5
      continue
    fi

    if grep -qi 'worker active call timed out' "$RUN_LOG"; then
      attempt_end_iso="$(timestamp)"
      attempt_end_epoch=$(date -u +%s)
      duration=$((attempt_end_epoch - attempt_start_epoch))
      POLICY_LAST_STATUS="command_timeout"
      POLICY_LAST_COMPLETED_AT="$attempt_end_iso"
      POLICY_LAST_DURATION=$duration
      append_usage_telemetry "command_timeout" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
      LAST_FAILURE_REASON="command_timeout"
      LAST_FAILURE_DETAILS="$(tail -n 20 "$RUN_LOG")"
      announce_phase "Command Timeout" "Automation command timed out; switching to offline PRODUCT workflow." "" "!!"
      if [ "${WVO_AUTOPILOT_ONCE:-0}" = "1" ]; then
        log "Single-run mode detected; deferring automation recovery after command timeout."
      elif attempt_recovery; then
        rm -f "$RUN_LOG"
        continue
      fi
      record_blocker "command_timeout" "$LAST_FAILURE_DETAILS"
      fatal_offline_fallback "automation_timeout" "$LAST_FAILURE_DETAILS" "$attempt_number" "$attempt_start_iso" "$attempt_start_epoch"
    fi

    set +e
    SUMMARY_RAW=$(python - <<'PY' "$RUN_LOG" "$STATE_FILE"
import json
import pathlib
import re
import sys

log_path = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])
text = log_path.read_text(encoding="utf-8")

summary = None
decoder = json.JSONDecoder()
pattern = re.compile(r'\{\s*"completed_tasks"')

for match in pattern.finditer(text):
    start = match.start()
    try:
        candidate, _ = decoder.raw_decode(text[start:])
    except json.JSONDecodeError:
        continue
    if isinstance(candidate, dict) and "completed_tasks" in candidate:
        summary = candidate
        break
    if isinstance(candidate, list):
        summary = next(
            (item for item in candidate if isinstance(item, dict) and "completed_tasks" in item),
            None,
        )
        if summary is not None:
            break

if summary is None:
    lines = text.splitlines()
    tail = "\n".join(lines[-40:])
    tail_lower = tail.lower()

    blockers = ["Autopilot run completed without structured JSON summary."]
    infra_keywords = [
        "tool call failed",
        "tool call error",
        "no worker registered",
        "worker active disposed",
        "worker timed out",
        "no active mcp worker",
        "plan_next",
        "critics_run",
    ]
    if any(keyword in tail_lower for keyword in infra_keywords):
        blockers.insert(
            0,
            "Infrastructure automation deferral noted (tool call failed); continue shipping PRODUCT work offline and log the follow-up for Director Dana.",
        )

    summary = {
        "completed_tasks": [],
        "in_progress": [],
        "blockers": blockers,
        "next_focus": [
            "Continue PRODUCT backlog execution using state/roadmap.yaml; log blocker details for Director Dana to schedule infrastructure follow-ups."
        ],
        "notes": tail[:2000],
        "_meta": {
            "source": "log_fallback",
            "reason": "missing_json_summary",
        },
    }

if isinstance(summary, list):
    canonical = next((item for item in summary if isinstance(item, dict)), {}) or {}
    summary = canonical
    summary.setdefault("_meta", {})
    if isinstance(summary["_meta"], dict):
        summary["_meta"].update({
            "source": "normalised_list",
            "reason": "wrapped_summary_list",
        })

out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps(summary))
PY
)
parse_status=$?
set -e
if [ $parse_status -ne 0 ]; then
      LAST_FAILURE_REASON="invalid_summary"
      LAST_FAILURE_DETAILS="$(tail -n 20 "$RUN_LOG")"
      record_blocker "invalid_summary" "$LAST_FAILURE_DETAILS"
      fatal_offline_fallback "missing-json-summary" "$LAST_FAILURE_DETAILS" "$attempt_number" "$attempt_start_iso" "$attempt_start_epoch"
fi
    if [ -n "$SUMMARY_RAW" ]; then
      fallback_info="$(python - <<'PY' "$SUMMARY_RAW"
import json, sys
try:
    summary = json.loads(sys.argv[1])
except json.JSONDecodeError:
    print("")
else:
    if isinstance(summary, list):
        summary = next((item for item in summary if isinstance(item, dict)), {}) or {}
    elif not isinstance(summary, dict):
        summary = {}
    meta = summary.get("_meta") or {}
    source = meta.get("source")
    reason = meta.get("reason") or ""
    if source in {"log_fallback", "offline_fallback"}:
        print(source)
        print(reason)
    else:
        print("")
PY
)"
      fallback_flag=""
      fallback_reason=""
      if [ -n "$fallback_info" ]; then
        IFS=$'\n' read -r fallback_flag fallback_reason <<<"$fallback_info"
      fi
      if [ "$fallback_flag" = "offline_fallback" ] || [ "$fallback_flag" = "log_fallback" ]; then
        LAST_FAILURE_REASON="${fallback_reason:-summary_marked_offline}"
        LAST_FAILURE_DETAILS="Summary emitted with source=${fallback_flag}; aborting to avoid offline automation."
        fatal_offline_fallback "$LAST_FAILURE_REASON" "$LAST_FAILURE_DETAILS" "$attempt_number" "$attempt_start_iso" "$attempt_start_epoch" 1
      fi
    fi
    SUMMARY_JSON="$SUMMARY_RAW"
    SUMMARY_PROGRESS_SIGNATURE=$(python - <<'PY' "$SUMMARY_JSON"
import json
import sys
import hashlib

try:
    summary = json.loads(sys.argv[1])
except Exception:
    print("")
    raise SystemExit(0)
if isinstance(summary, list):
    summary = next((item for item in summary if isinstance(item, dict)), {}) or {}
elif not isinstance(summary, dict):
    summary = {}

completed = summary.get("completed_tasks") or []
in_progress = summary.get("in_progress") or []
if completed or in_progress:
    print("")
    raise SystemExit(0)

blockers = summary.get("blockers") or []
if not isinstance(blockers, list):
    blockers = []
payload = json.dumps(sorted(blockers))
print(hashlib.sha256(payload.encode("utf-8")).hexdigest())
PY
    )
    printf '%s\n' "$SUMMARY_JSON"
    printf '%s\n' "$SUMMARY_JSON" | update_balance_from_summary
    BALANCE_MESSAGE_AFTER="$(balance_read_message)"
    if [ "$(balance_needs_escalation)" = "1" ]; then
      announce_phase "Domain Imbalance" "$BALANCE_MESSAGE_AFTER" "" "!!"
      record_blocker "domain_imbalance" "$BALANCE_MESSAGE_AFTER"
      write_offline_summary "domain-imbalance" "$BALANCE_MESSAGE_AFTER"
      log "Domain imbalance detected after summary; exiting for manual intervention."
      rm -f "$RUN_LOG"
      break
    fi
    update_task_memos_from_summary "$SUMMARY_JSON" || true
    attempt_end_iso="$(timestamp)"
    attempt_end_epoch=$(date -u +%s)
    duration=$((attempt_end_epoch - attempt_start_epoch))
    POLICY_LAST_STATUS="success"
    POLICY_LAST_COMPLETED_AT="$attempt_end_iso"
    POLICY_LAST_DURATION=$duration
    update_policy_controller "$SUMMARY_JSON"
    critics_backoff_update_from_summary "$SUMMARY_JSON"
    rm -f "$RUN_LOG"
    success_meter="$(progress_bar "$attempt_number" "$MAX_RETRY")"
    announce_phase "Attempt ${attempt_number} Complete" "Summary saved to $STATE_FILE" "$success_meter" "OK"
    log "Summary saved to $STATE_FILE"
    autopilot_git_sync "$SUMMARY_JSON"
    append_usage_telemetry "success" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
    if [ "${WVO_AUTOPILOT_ONCE:-0}" = "1" ] || [ -n "${WVO_CLI_STUB_EXEC_JSON:-}" ]; then
      log "Single-run mode enabled; exiting after first successful cycle."
      exit 0
    fi
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
if isinstance(summary, list):
    summary = next((item for item in summary if isinstance(item, dict)), {}) or {}
elif not isinstance(summary, dict):
    summary = {}
print(len(summary.get("blockers") or []))
PY
) || {
    log "Unable to parse blocker count; sleeping ${SLEEP_SECONDS}s before retry."
    sleep "$SLEEP_SECONDS"
    continue
  }
  log "Blockers recorded: $BLOCKERS"

  if [ -z "$SUMMARY_PROGRESS_SIGNATURE" ] && [ -f "$STATE_FILE" ]; then
    SUMMARY_PROGRESS_SIGNATURE=$(python - <<'PY' "$STATE_FILE"
import json
import sys
import hashlib

try:
    summary = json.load(open(sys.argv[1]))
except Exception:
    print("")
    raise SystemExit(0)
if isinstance(summary, list):
    summary = next((item for item in summary if isinstance(item, dict)), {}) or {}
elif not isinstance(summary, dict):
    summary = {}

completed = summary.get("completed_tasks") or []
in_progress = summary.get("in_progress") or []
if completed or in_progress:
    print("")
    raise SystemExit(0)

blockers = summary.get("blockers") or []
if not isinstance(blockers, list):
    blockers = []
payload = json.dumps(sorted(blockers))
print(hashlib.sha256(payload.encode("utf-8")).hexdigest())
PY
    )
  fi

  if [ -n "$SUMMARY_PROGRESS_SIGNATURE" ]; then
    if [ "$SUMMARY_PROGRESS_SIGNATURE" = "$LAST_IDLE_SUM_SIGNATURE" ]; then
      NO_PROGRESS_CYCLES=$((NO_PROGRESS_CYCLES + 1))
    else
      NO_PROGRESS_CYCLES=1
      LAST_IDLE_SUM_SIGNATURE="$SUMMARY_PROGRESS_SIGNATURE"
    fi
    log "No progress detected this cycle (signature repeat count: $NO_PROGRESS_CYCLES)."
  else
    NO_PROGRESS_CYCLES=0
    LAST_IDLE_SUM_SIGNATURE=""
  fi

  if [ "$NO_PROGRESS_LIMIT" -gt 0 ] && [ "$NO_PROGRESS_CYCLES" -ge "$NO_PROGRESS_LIMIT" ]; then
    log "No progress for $NO_PROGRESS_CYCLES consecutive cycles; exiting autopilot loop."
    break
  fi

  if [ "$BLOCKERS" -gt 0 ] && [ "$STOP_ON_BLOCKER" -ne 1 ]; then
    log "Blockers present but STOP_ON_BLOCKER=0; continuing autonomously."
  fi

  if [ "$STOP_ON_BLOCKER" -eq 1 ] && [ "$BLOCKERS" -gt 0 ]; then
    log "STOP_ON_BLOCKER=1 and blockers remain; exiting loop."
    break
  fi

  log "Autopilot sleeping for ${SLEEP_SECONDS}s before next run..."
  sleep "$SLEEP_SECONDS"
done
