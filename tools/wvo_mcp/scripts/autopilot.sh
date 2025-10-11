#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG_FILE="${LOG_FILE:-/tmp/wvo_autopilot.log}"
STATE_FILE="${STATE_FILE:-/tmp/wvo_autopilot_last.json}"
MAX_RETRY=${MAX_RETRY:-5}
SLEEP_SECONDS=${SLEEP_SECONDS:-300}
STOP_ON_BLOCKER=${STOP_ON_BLOCKER:-0}
MCP_ENTRY="${WVO_AUTOPILOT_ENTRY:-$ROOT/tools/wvo_mcp/dist/index.js}"
CLI_PROFILE="${CODEX_PROFILE_NAME:-weathervane_orchestrator}"
WVO_CAPABILITY="${WVO_CAPABILITY:-medium}"
AUTOPILOT_MODEL="${CODEX_AUTOPILOT_MODEL:-gpt-5-codex}"
AUTOPILOT_REASONING="${CODEX_AUTOPILOT_REASONING:-auto}"
BASE_INSTRUCTIONS="${BASE_INSTRUCTIONS:-$ROOT/docs/wvo_prompt.md}"
CONFIG_SCRIPT="$ROOT/tools/wvo_mcp/scripts/configure_codex_profile.py"
USAGE_LIMIT_BACKOFF=${USAGE_LIMIT_BACKOFF:-300}

ACCOUNT_MANAGER="$ROOT/tools/wvo_mcp/scripts/account_manager.py"
ACCOUNTS_CONFIG="$ROOT/state/accounts.yaml"
ACCOUNT_MANAGER_ENABLED=1
DEFAULT_CODEX_HOME="${CODEX_HOME:-$ROOT/.accounts/codex/default}"
ENABLE_CLAUDE_EVAL=${ENABLE_CLAUDE_EVAL:-0}
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
      log "  ⚠️ Claude login not detected. Launching '$bin_cmd login' for '$acc_id'..."
      if run_with_ptty env CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" $bin_cmd login >/dev/null; then
        log "  ✅ Claude login completed for '$acc_id'"
      else
        log "  ⚠️ Claude login exited without success for '$acc_id'. Run 'CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR $bin_cmd login' manually."
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
      local wait
      wait=$(python - <<'PY' "$payload"
import json, sys
data = json.loads(sys.argv[1])
print(int(data.get("wait_seconds", 300)))
PY
)
      log "All Codex accounts on cooldown. Sleeping ${wait}s before retry."
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
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding='utf-8', errors='ignore')
match = re.search(r'try again in (?:(\d+)\s*hour[s]?)?(?:\s*(\d+)\s*minute[s]?)?', text, re.I)
if not match:
    raise SystemExit(1)
hours = int(match.group(1) or 0)
minutes = int(match.group(2) or 0)
seconds = hours * 3600 + minutes * 60
if seconds <= 0:
    seconds = 300
print(seconds)
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
  if "$bin" chat --help 2>&1 | grep -qE '\s--mcp-config\s'; then
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
  local mcp_config_file
  mcp_config_file=$(mktemp)
  cat > "$mcp_config_file" <<EOF
{
  "mcpServers": {
    "weathervane": {
      "command": "node",
      "args": ["$MCP_ENTRY", "--workspace", "$ROOT"]
    }
  }
}
EOF

  local output
  local exit_code

  # Disable set -e temporarily to prevent script exit on Claude failure
  set +e
  if [ ${#env_pairs[@]} -gt 0 ]; then
    output=$(env "${env_pairs[@]}" "$CLAUDE_BIN_CMD" chat --mcp-config "$mcp_config_file" --message "$message" 2>&1)
    exit_code=$?
  else
    output=$("$CLAUDE_BIN_CMD" chat --mcp-config "$mcp_config_file" --message "$message" 2>&1)
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
match = re.search(r'try again in (?:(\d+)\s*hour[s]?)?(?:\s*(\d+)\s*minute[s]?)?', text, re.I)
if not match:
    raise SystemExit(1)
hours = int(match.group(1) or 0)
minutes = int(match.group(2) or 0)
seconds = hours * 3600 + minutes * 60
if seconds <= 0:
    seconds = 300
print(seconds)
PY
}

check_all_accounts_auth() {
  log "Checking authentication status for all configured accounts..."

  local -a needs_auth=()
  local -a codex_accounts=()
  local -a claude_accounts=()

  # Get all codex accounts from config
  if [ "$ACCOUNT_MANAGER_ENABLED" -eq 1 ]; then
    local codex_json
    if codex_json=$(python "$ACCOUNT_MANAGER" list codex 2>/dev/null); then
      while IFS= read -r line; do
        [ -n "$line" ] && codex_accounts+=("$line")
      done < <(python - <<'PY' "$codex_json"
import json, sys
for account in json.loads(sys.argv[1]):
    email = account.get("email") or ""
    label = account.get("label") or ""
    print(f"{account.get('id', '')}|{account.get('home', '')}|{email}|{label}")
PY
)
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
select_codex_account

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

  {
    cat <<'HEADER'
Operate autonomously as the WeatherVane super-team. Your goal is to drive the roadmap to completion with world-class engineering, data/ML, product, and design rigor.

HEADER
    printf 'Current surprise QA ledger:\n%s\n\n' "$AUTOPILOT_STATE_SNIPPET"
    if [ -s "$CLAUDE_EVAL_FILE" ]; then
      echo "Most recent Claude evaluation:"
      sed 's/^/  /' "$CLAUDE_EVAL_FILE"
      echo ""
    fi
    cat <<'BODY'
Loop:
1. Use `plan_next` with minimal=true to get highest-priority tasks (70% token savings vs full details).
2. Call `autopilot_status` to refresh the audit ledger.
3. For each chosen task:
   a. Audit docs/code/tests to understand requirements.
   b. Implement via fs_read/fs_write/cmd_run (code + tests + docs + design). Keep slices verifiable.
   c. Run `critics_run` with quiet=true and relevant critics (build, tests, manager_self_check, data_quality, design_system, org_pm, exec_review, health_check, human_sync; add allocator/causal/forecast when applicable). Check state/critics timestamps to skip suites covering unchanged artifacts (same git_sha); rerun after commits or meaningful edits.
   d. Fix issues. If blocked, log blocker and mark task blocked with `plan_update`.
   e. Record decisions/risks via `context_write` (keep state/context.md ≤1000 words).
   f. Snapshot via `context_snapshot`.
   g. Update roadmap with `plan_update` only after exit criteria satisfied.
   h. For work >5min, use `heavy_queue_enqueue` (include cmd/context), monitor via `heavy_queue_list`, update with `heavy_queue_update`.
4. Ship real work over repeated self-review; if nothing changed, move forward vs re-running same suites.
5. Every ~100 tasks, audit a completed roadmap item for gaps/regressions. Call `autopilot_record_audit` (task_id/focus/notes); if issues emerge, open fix tasks before resuming new work. Spread audits across epics/milestones; skip if already inspected this session.
6. Repeat until no progress possible without human intervention.
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
    log "Starting WeatherVane autopilot run (attempt ${attempt_number})..."
    set +e
    codex exec \
      --profile "$CLI_PROFILE" \
      --model "$AUTOPILOT_MODEL" \
      --full-auto \
      --sandbox danger-full-access \
      --output-schema "$SCHEMA_FILE" \
      "$PROMPT_CONTENT" 2>&1 | tee "$RUN_LOG"
    status=${PIPESTATUS[0]}
    set -e
    cat "$RUN_LOG" >> "$LOG_FILE"

    if grep -qi 'usage limit' "$RUN_LOG"; then
      attempt_end_iso="$(timestamp)"
      attempt_end_epoch=$(date -u +%s)
      duration=$((attempt_end_epoch - attempt_start_epoch))
      append_usage_telemetry "usage_limit" "$attempt_number" "$attempt_start_iso" "$attempt_end_iso" "$duration"
      wait_seconds=$(parse_usage_wait "$RUN_LOG" 2>/dev/null) || true
      if [ -n "$wait_seconds" ]; then
        log "Codex usage limit detected: cooling down current account for ${wait_seconds}s."
      else
        wait_seconds=$USAGE_LIMIT_BACKOFF
        log "Codex usage limit detected (no exact wait supplied). Applying default cooldown ${wait_seconds}s."
      fi
      record_provider_cooldown codex "$CURRENT_CODEX_ACCOUNT" "$wait_seconds"
      rm -f "$RUN_LOG"
      select_codex_account
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
