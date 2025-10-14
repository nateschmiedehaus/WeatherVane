#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG_FILE="${LOG_FILE:-/tmp/wvo_autopilot.log}"
STATE_FILE="${STATE_FILE:-/tmp/wvo_autopilot_last.json}"
MAX_RETRY=${MAX_RETRY:-20}
SLEEP_SECONDS=${SLEEP_SECONDS:-120}
STOP_ON_BLOCKER=${STOP_ON_BLOCKER:-0}
MCP_ENTRY="${WVO_AUTOPILOT_ENTRY:-$ROOT/tools/wvo_mcp/dist/index.js}"
CLI_PROFILE="${CODEX_PROFILE_NAME:-weathervane_orchestrator}"
WVO_CAPABILITY="${WVO_CAPABILITY:-medium}"
AUTOPILOT_MODEL="${CODEX_AUTOPILOT_MODEL:-gpt-5-codex}"
AUTOPILOT_REASONING="${CODEX_AUTOPILOT_REASONING:-auto}"
BASE_INSTRUCTIONS="${BASE_INSTRUCTIONS:-$ROOT/docs/wvo_prompt.md}"
CONFIG_SCRIPT="$ROOT/tools/wvo_mcp/scripts/configure_codex_profile.py"
USAGE_LIMIT_BACKOFF=${USAGE_LIMIT_BACKOFF:-120}
TASK_MEMO_DIR="$ROOT/state/task_memos"
ESCALATION_CONFIG="$ROOT/tools/wvo_mcp/config/critic_escalations.json"
ESCALATION_LOG="$ROOT/state/escalations.log"
export USAGE_LIMIT_BACKOFF

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
WVO_ENABLE_WEB_INSPIRATION=${WVO_ENABLE_WEB_INSPIRATION:-0}
export WVO_ENABLE_WEB_INSPIRATION

write_offline_summary() {
  local reason="${1:-offline}"
  local details="${2:-}"
  WVO_OFFLINE_REASON="$reason" WVO_OFFLINE_DETAILS="$details" python - "$STATE_FILE" <<'PY'
import json
import os
import sys
from pathlib import Path

path = Path(sys.argv[1])
reason = os.environ.get("WVO_OFFLINE_REASON", "offline")
details = os.environ.get("WVO_OFFLINE_DETAILS", "").strip()

summary = {
    "completed_tasks": [],
    "in_progress": [],
    "blockers": [f"Autopilot unavailable: {reason}"],
    "next_focus": [],
    "notes": details,
}

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
PY
  log "Recorded offline summary ($reason) to $STATE_FILE"
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
      log "  ⚠️ Playwright browser install failed. Run 'npx --yes --prefix tools/wvo_mcp playwright install chromium --with-deps'."
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
    AUTH_STATUS_RAW=$(CODEX_HOME="$CODEX_HOME" codex login status 2>&1 || true)
    if printf '%s\n' "$AUTH_STATUS_RAW" | grep -Eqi 'unknown command|unexpected argument|unrecognized option'; then
      AUTH_STATUS_RAW=$(run_with_ptty env CODEX_HOME="$CODEX_HOME" codex status 2>&1 || true)
    fi
    if [ -z "$AUTH_STATUS_RAW" ] && codex_tokens_present; then
      AUTH_STATUS_RAW="Codex tokens detected"
    fi
    [ -n "$AUTH_STATUS_RAW" ] || [ -n "$AUTH_STATUS_EMAIL" ]
  elif [ "$provider" = "claude" ]; then
    if [ -z "${CLAUDE_BIN_CMD-}" ]; then
      return 1
    fi
    CLAUDE_STATUS_RAW=$(env CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR-}" "$CLAUDE_BIN_CMD" status 2>&1 || true)
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

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI not found in PATH. Install Codex CLI before running autopilot." >&2
  exit 1
fi

timestamp(){ date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log(){ printf '%s %s\n' "$(timestamp)" "$*" | tee -a "$LOG_FILE"; }

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
      exit 1
    fi
    log_codex_identity "$account_id" "$expected_email" "$account_label"
    return 0
  fi
  log "Codex $display (CODEX_HOME=$CODEX_HOME) not authenticated."
  log "Codex $display not authenticated. Launching codex login..."
  CODEX_HOME="$CODEX_HOME" codex login || { log "Codex login failed; aborting autopilot."; exit 1; }
  if fetch_auth_status codex && [ "$(provider_authenticated codex)" = "true" ]; then
    if [ -n "$expected_email" ] && [ -n "$AUTH_STATUS_EMAIL" ] && [ "$AUTH_STATUS_EMAIL" != "$expected_email" ]; then
      log "Logged in as $AUTH_STATUS_EMAIL but expected $expected_email for $display."
      log "Run 'CODEX_HOME=$CODEX_HOME codex logout' and retry with the correct account."
      exit 1
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
      exit 1
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
  exit 1
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

  local skip_check
  skip_check=$(should_skip_auth_check codex "$accounts_json")
  if [ "$skip_check" = "skip" ]; then
    log "Skipping Codex account verification (cached; ttl=${AUTH_CACHE_TTL}s)."
    return
  fi

  printf '%s' "$accounts_json" | python - <<'PY' 2>/dev/null | \
  while IFS=$'\t' read -r acc_id acc_home acc_profile acc_email acc_label; do
import json, sys
for acc in json.load(sys.stdin):
    email = acc.get("email") or ""
    label = acc.get("label") or ""
    print(f"{acc.get('id', '')}\t{acc.get('home', '')}\t{acc.get('profile', '')}\t{email}\t{label}")
PY
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
  done
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
  local -a claude_accounts=()
  CLAUDE_ACCOUNTS_AVAILABLE=0

  # Get all codex accounts from config
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
    print(f"{account['id']}|{account.get('bin', 'claude')}|{json.dumps(account.get('env'))}")
PY
)
    else
      claude_accounts=()
    fi
  else
    # Single account mode
    codex_accounts=("legacy|$DEFAULT_CODEX_HOME||")
  fi

  if [ ${#claude_accounts[@]} -gt 0 ]; then
    CLAUDE_ACCOUNTS_AVAILABLE=1
  else
    CLAUDE_ACCOUNTS_AVAILABLE=0
  fi

  # Check each codex account
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
          log "✅ Codex $display authenticated as $AUTH_STATUS_EMAIL"
        else
          log "✅ Codex $display is authenticated"
          log_codex_identity "$account_id" "$account_email" "$account_label"
        fi
        continue
      fi

      if [ "$tokens_ok" -eq 1 ]; then
        if [ -n "$account_email" ] && [ -n "$token_identity" ] && [ "$token_identity" != "$account_email" ]; then
          log "⚠️ Codex $display tokens belong to $token_identity but expected $account_email"
          needs_auth+=("codex:$account_id:$account_home:$account_email:$account_label")
          continue
        fi
        if [ -n "$token_identity" ]; then
          log "✅ Codex $display authenticated via stored tokens (identity: $token_identity)"
        else
          log "⚠️ Codex $display has tokens but identity is unknown; treating as authenticated"
        fi
        continue
      fi

      log "❌ Codex $display needs authentication"
      needs_auth+=("codex:$account_id:$account_home:$account_email:$account_label")
    done
  fi

  # Check claude accounts
  if [ ${#claude_accounts[@]} -gt 0 ]; then
    for account_info in "${claude_accounts[@]}"; do
      IFS='|' read -r account_id account_bin account_env_json <<< "$account_info"
      if command -v "$account_bin" >/dev/null 2>&1; then
        log "✅ Claude account '$account_id' CLI is available"
      else
        log "⚠️  Claude account '$account_id' CLI not found ($account_bin)"
      fi
    done
  fi

  # Prompt for login if needed
  if [ ${#needs_auth[@]} -gt 0 ]; then
    echo ""
    echo "=========================================="
    echo "Authentication Required"
    echo "=========================================="
    echo ""
    echo "The following accounts need authentication:"
    for auth_item in "${needs_auth[@]}"; do
      IFS=':' read -r provider account_id account_path account_email account_label <<< "$auth_item"
      if [ "$provider" = "codex" ]; then
        local display
        display=$(codex_account_display "$account_id" "$account_email" "$account_label")
        echo "  - Codex: $display"
      else
        echo "  - $provider: $account_id"
      fi
    done
    echo ""
    echo "Options:"
    echo "  1. Login now (will prompt for each account)"
    echo "  2. Skip and continue with authenticated accounts only"
    echo "  3. Exit and login manually later"
    echo ""
    read -p "Choose [1/2/3]: " choice

    case "$choice" in
      1)
        log "Logging in to accounts..."
        for auth_item in "${needs_auth[@]}"; do
          IFS=':' read -r provider account_id account_path account_email account_label <<< "$auth_item"

          if [ "$provider" = "codex" ]; then
            echo ""
            local previous_home="$CODEX_HOME"
            local display
            display=$(codex_account_display "$account_id" "$account_email" "$account_label")
            echo "Logging in to Codex: $display"
            echo "CODEX_HOME will be set to: $account_path"
            if [ -n "$account_email" ]; then
              echo "Expected email: $account_email"
            fi
            echo ""

            CODEX_HOME="$account_path" codex login

            if [ $? -eq 0 ]; then
              CODEX_HOME="$account_path"
              export CODEX_HOME
              if fetch_auth_status codex && [ "$(provider_authenticated codex)" = "true" ]; then
                if [ -n "$account_email" ] && [ -n "$AUTH_STATUS_EMAIL" ] && [ "$AUTH_STATUS_EMAIL" != "$account_email" ]; then
                  log "❌ Logged in as $AUTH_STATUS_EMAIL but expected $account_email for $(codex_account_display "$account_id" "$account_email" "$account_label"). Run 'CODEX_HOME=$account_path codex logout' and retry with the correct account."
                  CODEX_HOME="$previous_home"
                  export CODEX_HOME
                  exit 1
                fi
                log "✅ Successfully logged in to Codex $(codex_account_display "$account_id" "$account_email" "$account_label") as ${AUTH_STATUS_EMAIL:-unknown}"
              elif codex_tokens_present; then
                local token_identity
                token_identity=$(codex_identity_from_tokens)
                if [ -n "$account_email" ] && [ -n "$token_identity" ] && [ "$token_identity" != "$account_email" ]; then
                  log "❌ Tokens belong to $token_identity but expected $account_email for $(codex_account_display "$account_id" "$account_email" "$account_label"). Run 'CODEX_HOME=$account_path codex logout' and login with the correct account."
                  CODEX_HOME="$previous_home"
                  export CODEX_HOME
                  exit 1
                fi
                log "✅ Tokens detected for $(codex_account_display "$account_id" "$account_email" "$account_label")${token_identity:+ (email: $token_identity)}"
              else
                log "❌ Codex login completed but authentication still missing for $(codex_account_display "$account_id" "$account_email" "$account_label")."
                CODEX_HOME="$previous_home"
                export CODEX_HOME
                exit 1
              fi
              CODEX_HOME="$previous_home"
              export CODEX_HOME
            else
              log "❌ Failed to login to Codex account '$account_id'"
              echo ""
              read -p "Continue anyway? [y/n]: " continue_choice
              if [ "$continue_choice" != "y" ]; then
                CODEX_HOME="$previous_home"
                export CODEX_HOME
                exit 1
              fi
              CODEX_HOME="$previous_home"
              export CODEX_HOME
            fi
          fi
        done
            log "Authentication complete. Continuing with autopilot..."
        ;;
      2)
        log "Skipping authentication. Continuing with available accounts only."
        ;;
      3)
        log "Exiting. Please authenticate manually and rerun autopilot."
        echo ""
        echo "To authenticate manually:"
        for auth_item in "${needs_auth[@]}"; do
          IFS=':' read -r provider account_id account_path account_email account_label <<< "$auth_item"
          if [ "$provider" = "codex" ]; then
            echo "  # $(codex_account_display "$account_id" "$account_email" "$account_label")"
            echo "  CODEX_HOME=$account_path codex login"
          fi
        done
        echo ""
        exit 0
        ;;
      *)
        log "Invalid choice. Continuing with available accounts only."
        ;;
    esac
  else
    log "✅ All configured accounts are authenticated"
  fi

  echo ""
}

ensure_at_least_one_provider() {
  # Verify at least one provider (Codex or Claude) is authenticated
  local has_codex=0
  local has_claude=0

  # Check if any Codex account is authenticated
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
      done < <(echo "$claude_json" | python - <<'PY'
import json, sys
for acc in json.load(sys.stdin):
    env = acc.get('env') or {}
    print(f"{acc.get('id', '')}\t{acc.get('bin', 'claude')}\t{env.get('CLAUDE_CONFIG_DIR', '')}")
PY
)
    fi
  fi

  # Exit if no providers are available
  if [ $has_codex -eq 0 ] && [ $has_claude -eq 0 ]; then
    echo ""
    echo "❌ No authenticated providers available!"
    echo ""
    echo "Autopilot requires at least one authenticated provider to run:"
    echo "  - Codex (OpenAI): Run 'CODEX_HOME=<path> codex login'"
    echo "  - Claude Code: Run 'CLAUDE_CONFIG_DIR=<path> claude login'"
    echo ""
    echo "Configured accounts:"
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
              [ -n "$err_line" ] && echo "$err_line"
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
              [ -n "$err_line" ] && echo "$err_line"
            done <"$claude_err"
          fi
        fi
        rm -f "$claude_tmp" "$claude_err"
      fi
    else
      echo "  - Codex (legacy): CODEX_HOME=$CODEX_HOME"
    fi
    echo ""
    echo "Please authenticate at least one provider and rerun autopilot."
    exit 1
  fi

  # Log which providers are available
  if [ $has_codex -eq 1 ] && [ $has_claude -eq 1 ]; then
    log "✅ Both Codex and Claude Code providers are authenticated and ready"
  elif [ $has_codex -eq 1 ]; then
    log "✅ Codex provider is authenticated and ready (Claude Code not available)"
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
  local endpoint
  for endpoint in "${endpoints[@]}"; do
    if ! curl --silent --head --max-time 5 "$endpoint" >/dev/null 2>&1; then
      log "❌ Unable to reach $endpoint. Autopilot requires outbound network access."
      log "   Launch the autopilot from your macOS Terminal (not the sandboxed CLI) so Codex/Claude can reach their APIs."
      exit 1
    fi
  done
  log "✅ Network connectivity check passed."
}

ensure_accounts_config
ensure_web_inspiration_ready
summarize_web_inspiration_cache() {
  if [ "$WVO_ENABLE_WEB_INSPIRATION" != "1" ]; then
    return
  fi

  python - <<'PY' "$ROOT/state/web_inspiration"
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
}

summarize_web_inspiration_cache

if [ "${WVO_AUTOPILOT_OFFLINE:-0}" = "1" ]; then
  log "WVO_AUTOPILOT_OFFLINE=1 detected; skipping Codex autopilot run."
  write_offline_summary "offline-mode" "WVO_AUTOPILOT_OFFLINE=1 set; skipping Codex autopilot run."
  exit 0
fi

if [ "${WVO_AUTOPILOT_SMOKE:-0}" != "1" ]; then
  if ! DNS_CHECK=$(verify_codex_dns 2>&1); then
    LAST_FAILURE_REASON="dns_lookup_failed"
    LAST_FAILURE_DETAILS="$DNS_CHECK"
    log "❌ Unable to resolve Codex service hosts (chatgpt.com/api.openai.com)."
    printf '%s\n' "$DNS_CHECK" | sed 's/^/   /'
    log "   Check local DNS/network configuration or set WVO_AUTOPILOT_OFFLINE=1 to skip Codex."
    log_dns_diagnostics
    write_offline_summary "dns-lookup-failed" "$DNS_CHECK"
    exit 0
  fi
  ensure_network_reachable
fi

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

append_usage_telemetry() {
  local status="$1"
  local attempt="$2"
  local start_iso="$3"
  local end_iso="$4"
  local duration="$5"
  python - <<'PY' "$USAGE_LOG" "$status" "$attempt" "$start_iso" "$end_iso" "$duration" "$AUTOPILOT_MODEL" "$CLI_PROFILE" "$WVO_CAPABILITY"
import json
import sys
import pathlib

log_path = pathlib.Path(sys.argv[1])
record = {
    "status": sys.argv[2],
    "attempt": int(sys.argv[3]),
    "started_at": sys.argv[4],
    "finished_at": sys.argv[5],
    "duration_seconds": int(sys.argv[6]),
    "model": sys.argv[7],
    "profile": sys.argv[8],
    "capability": sys.argv[9],
}
with log_path.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(record) + "\n")
PY
}

NODE_RESOLVE_PATH="$ROOT/tools/wvo_mcp/node_modules"
if [ -d "$NODE_RESOLVE_PATH" ]; then
  NODE_PATH="$NODE_RESOLVE_PATH${NODE_PATH:+:$NODE_PATH}"
  export NODE_PATH
fi

SCHEMA_FILE="$(mktemp)"
PROMPT_FILE="$(mktemp)"
trap 'rm -f "$SCHEMA_FILE" "$PROMPT_FILE"' EXIT

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

  {
    cat <<'HEADER'
Operate under the Autopilot Captain persona—Atlas—and escalate to Director Dana when needed. Your goal is to drive the roadmap to completion with world-class engineering, data/ML, product, and design rigor.

HEADER
    printf 'Current surprise QA ledger:\n%s\n\n' "$AUTOPILOT_STATE_SNIPPET"
    printf 'Task memo cache (recent updates first):\n%s\n\n' "$TASK_MEMO_SNIPPET"
    if [ -s "$CLAUDE_EVAL_FILE" ]; then
      echo "Most recent Claude evaluation:"
      sed 's/^/  /' "$CLAUDE_EVAL_FILE"
      echo ""
    fi
    cat <<'BODY'
Loop:
- Respect roadmap domains: default to WeatherVane product work (domain=`product`, e.g. E1/E4/E5/E7/E11). Only pick MCP platform items (domain=`mcp`, e.g. E6/E8/E9/E10) when product tasks are blocked or explicitly requested. Bundle E6+E10 as one upgrade programme; run PHASE‑5A immediately after, and leave PHASE‑5B items blocked behind E5.
0. Skim cached task memos in state/task_memos to resume active work before loading large contexts; refresh them if reality diverges.
1. Call `plan_next` with `filters: { domain: 'product' }` and `minimal=true`. Only if that queue is empty should you issue a second `plan_next` for `domain: 'mcp'`. Re-run this selection every cycle regardless of which task you just finished.
2. Call `autopilot_status` to refresh the audit ledger.
3. Run `critics_run` with `network_navigator` at session start. If it fails, restart MCP with 
   `make mcp-autopilot danger=1` so both Codex and Claude have full network access.
4. Run `critics_run` with `product_completeness` weekly (or when roadmap changes) to ensure UX milestones are in flight.
5. Run `critics_run` with `integration_fury` after major merges or before releases to exercise the full stack.
6. The `design_system` critic is currently offline (capability skipped). Leave T3.3.x/T3.4.x blocked until a designer reviews them; do **not** loop on “Director Dana” escalations.
7. When any other critic fails or flags work, create/adjust roadmap tasks immediately—critics own the standard and can overrule earlier plans.
8. If any task memo is marked `escalate` (stalled for multiple loops), hand it off to a human reviewer with higher autonomy before taking further automated action.
9. For each chosen task:
   a. Audit docs/code/tests to understand requirements.
   b. Implement via fs_read/fs_write/cmd_run (code + tests + docs + design). Keep slices verifiable.
   c. Run `critics_run` with quiet=true and relevant critics (build, tests, manager_self_check, data_quality, org_pm, exec_review, health_check, human_sync; add allocator/causal/forecast when applicable). Check state/critics timestamps to skip suites covering unchanged artifacts (same git_sha); rerun after commits or meaningful edits.
   d. Fix issues. If blocked (missing critic/test capacity, sandbox limits, outstanding approvals), log the blocker, mark the task blocked with `plan_update`, and move on—do **not** manufacture substitute deliverables or sign-off docs to bypass exit criteria.
   e. Record decisions/risks via `context_write` (keep state/context.md ≤1000 words).
   f. Snapshot via `context_snapshot`.
   g. Update roadmap with `plan_update` only after exit criteria satisfied.
   h. After each loop, sanity-check the product roadmap: make sure M3.3/M3.4 tasks exist and are on deck. Escalate if the roadmap lacks full product experience work.
   i. Review the roadmap (state/roadmap.yaml) weekly: confirm domain balance, that product experience work (M3.3/M3.4) remains on deck, and that blocked critics are tracked. Escalate if gaps persist.
   j. For work >5min, use `heavy_queue_enqueue` (include cmd/context), monitor via `heavy_queue_list`, update with `heavy_queue_update`.
10. At least once per day (or after major roadmap edits), run `critics_run` with `roadmap_completeness` to ensure future enhancement notes have matching tasks.
11. Ship real work over repeated self-review; if nothing changed, move forward vs re-running same suites.
12. Every ~100 tasks, audit a completed roadmap item for gaps/regressions. Call `autopilot_record_audit` (task_id/focus/notes); if issues emerge, open fix tasks before resuming new work. Spread audits across epics/milestones; skip if already inspected this session.
13. Repeat until no progress possible without human intervention.
Maintain production readiness, enforce ML/causal rigor, polish UX, and communicate like a Staff+/startup leader.
Return JSON summarizing completed tasks, tasks still in progress, blockers, next focus items, and overall notes.
BODY
  } > "$PROMPT_FILE"

  PROMPT_CONTENT="$(cat "$PROMPT_FILE")"

  attempt=0
  while true; do
    RUN_LOG="$(mktemp)"
    attempt_number=$((attempt + 1))
    attempt_start_iso="$(timestamp)"
  attempt_start_epoch=$(date -u +%s)
  LAST_FAILURE_REASON=""
  LAST_FAILURE_DETAILS=""
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
  log "Starting WeatherVane autopilot run (attempt ${attempt_number})..."

  if [ "$USE_CLAUDE_FALLBACK" -eq 1 ]; then
      set +e
      run_with_claude_code "$PROMPT_CONTENT" "$RUN_LOG"
      status=$?
      set -e
      cat "$RUN_LOG" >> "$LOG_FILE"
    else
      set +e
      codex exec \
        --profile "$CLI_PROFILE" \
        --model "$AUTOPILOT_MODEL" \
        --dangerously-bypass-approvals-and-sandbox \
        --output-schema "$SCHEMA_FILE" \
        "$PROMPT_CONTENT" >"$RUN_LOG" 2>&1
      status=$?
      set -e
      cat "$RUN_LOG" >> "$LOG_FILE"
    fi

    if grep -qi 'usage limit' "$RUN_LOG"; then
      attempt_end_iso="$(timestamp)"
      attempt_end_epoch=$(date -u +%s)
      duration=$((attempt_end_epoch - attempt_start_epoch))
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
      append_usage_telemetry "retry" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
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
      attempt_end_iso="$(timestamp)"
      attempt_end_epoch=$(date -u +%s)
      duration=$((attempt_end_epoch - attempt_start_epoch))
      append_usage_telemetry "invalid_summary" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
      LAST_FAILURE_REASON="invalid_summary"
      LAST_FAILURE_DETAILS="$(tail -n 20 "$RUN_LOG")"
      log "Autopilot run completed without a valid JSON summary. Retrying in 30 seconds..."
      rm -f "$RUN_LOG"
      attempt=$((attempt + 1))
      if [ "$attempt" -ge "$MAX_RETRY" ]; then
        log "Reached maximum retry count ($MAX_RETRY). Autopilot aborting (invalid summary)."
        if [ -n "$LAST_FAILURE_DETAILS" ]; then
          printf '%s\n' "$LAST_FAILURE_DETAILS" | sed 's/^/   /'
        fi
        exit 1
      fi
      sleep 30
      continue
    }
    printf '%s\n' "$SUMMARY_JSON"
    update_task_memos_from_summary "$SUMMARY_JSON" || true
    rm -f "$RUN_LOG"
    log "Summary saved to $STATE_FILE"
    attempt_end_iso="$(timestamp)"
    attempt_end_epoch=$(date -u +%s)
    duration=$((attempt_end_epoch - attempt_start_epoch))
    append_usage_telemetry "success" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
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
