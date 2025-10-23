#!/usr/bin/env bash
#
# REAL Account Authentication Validator
#
# Verifies that ALL configured accounts (Codex + Claude) are properly authenticated
# and can be used by the unified autopilot system.
#
# This script tests REAL accounts with REAL CLI tools (no mocks).
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ACCOUNTS_CONFIG="$ROOT/state/accounts.yaml"
ACCOUNT_MANAGER="$ROOT/tools/wvo_mcp/scripts/account_manager.py"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════════════"
echo "  WeatherVane Multi-Provider Auth Validation"
echo "════════════════════════════════════════════════════"
echo ""

#
# Check prerequisites
#
echo "━━━ Checking prerequisites ━━━"

if [ ! -f "$ACCOUNTS_CONFIG" ]; then
  echo -e "${RED}✗${NC} Accounts config not found: $ACCOUNTS_CONFIG"
  exit 1
fi
echo -e "${GREEN}✓${NC} Found accounts config: $ACCOUNTS_CONFIG"

if ! command -v codex >/dev/null 2>&1; then
  echo -e "${RED}✗${NC} codex CLI not found in PATH"
  echo "   Install: npm install -g @openai/codex-cli"
  exit 1
fi
echo -e "${GREEN}✓${NC} codex CLI found"

if ! command -v claude >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠${NC} claude CLI not found in PATH"
  echo "   This is OK if you only use Codex, but Claude features won't work"
  CLAUDE_AVAILABLE=0
else
  echo -e "${GREEN}✓${NC} claude CLI found"
  CLAUDE_AVAILABLE=1
fi

if [ ! -f "$ACCOUNT_MANAGER" ]; then
  echo -e "${RED}✗${NC} Account manager not found: $ACCOUNT_MANAGER"
  exit 1
fi
echo -e "${GREEN}✓${NC} Account manager found"

echo ""

#
# Parse accounts from YAML config
#
echo "━━━ Parsing account configuration ━━━"

# Get Codex accounts
CODEX_ACCOUNTS=$(python3 "$ACCOUNT_MANAGER" list codex 2>&1)
if echo "$CODEX_ACCOUNTS" | grep -q "error\|Traceback"; then
  echo -e "${RED}✗${NC} Failed to load Codex accounts:"
  echo "$CODEX_ACCOUNTS"
  exit 1
fi
CODEX_COUNT=$(echo "$CODEX_ACCOUNTS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>&1)

echo -e "${BLUE}Codex accounts configured:${NC} $CODEX_COUNT"
if [ "$CODEX_COUNT" -gt 0 ]; then
  python3 - "$CODEX_ACCOUNTS" <<'PY'
import sys, json
accounts = json.loads(sys.argv[1])
for i, acc in enumerate(accounts, 1):
    print(f"  {i}. {acc.get('label', acc['id'])} ({acc.get('email', 'no email')})")
PY
fi

# Get Claude accounts
CLAUDE_ACCOUNTS=$(python3 "$ACCOUNT_MANAGER" list claude 2>&1)
if echo "$CLAUDE_ACCOUNTS" | grep -q "error\|Traceback"; then
  echo -e "${RED}✗${NC} Failed to load Claude accounts:"
  echo "$CLAUDE_ACCOUNTS"
  exit 1
fi
CLAUDE_COUNT=$(echo "$CLAUDE_ACCOUNTS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>&1)

echo -e "${BLUE}Claude accounts configured:${NC} $CLAUDE_COUNT"
if [ "$CLAUDE_COUNT" -gt 0 ]; then
  python3 - "$CLAUDE_ACCOUNTS" <<'PY'
import sys, json
accounts = json.loads(sys.argv[1])
for i, acc in enumerate(accounts, 1):
    email = acc.get('email', 'no email')
    print(f"  {i}. {acc.get('label', acc['id'])} ({email})")
PY
fi

echo ""

#
# Validate Codex accounts
#
echo "━━━ Validating Codex Accounts ━━━"

CODEX_AUTH_COUNT=0
CODEX_FAILURES=()

if [ "$CODEX_COUNT" -gt 0 ]; then
  echo "$CODEX_ACCOUNTS" | python3 - "$ROOT" <<'PY'
import sys, json, subprocess, os
accounts = json.load(sys.stdin)
root = sys.argv[1]

for acc in accounts:
    acc_id = acc['id']
    acc_home = acc['home']
    acc_email = acc.get('email', 'unknown')
    acc_label = acc.get('label', acc_id)

    env = os.environ.copy()
    env['CODEX_HOME'] = acc_home

    print(f"\nTesting: {acc_label} ({acc_email})")
    print(f"  CODEX_HOME: {acc_home}")

    # Test: codex status
    try:
        result = subprocess.run(
            ['codex', 'status'],
            env=env,
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0 and 'Logged in' in result.stdout:
            # Extract logged-in email
            for line in result.stdout.split('\n'):
                if '@' in line:
                    logged_in_as = line.strip()
                    print(f"  ✓ Authenticated: {logged_in_as}")

                    # Verify email matches
                    if acc_email.lower() in logged_in_as.lower():
                        print(f"  ✓ Email matches config")
                    else:
                        print(f"  ⚠ Email mismatch: expected {acc_email}, got {logged_in_as}")
                    break

            print(f"  ✓ Status: OK")
            sys.exit(0)  # Success
        else:
            print(f"  ✗ Not authenticated")
            print(f"  Run: CODEX_HOME={acc_home} codex login")
            sys.exit(1)

    except subprocess.TimeoutExpired:
        print(f"  ✗ Timeout checking auth")
        sys.exit(1)
    except Exception as e:
        print(f"  ✗ Error: {e}")
        sys.exit(1)
PY

    if [ $? -eq 0 ]; then
      ((CODEX_AUTH_COUNT++))
    else
      CODEX_FAILURES+=("$acc_id")
    fi
  done
else
  echo "No Codex accounts configured"
fi

echo ""

#
# Validate Claude accounts
#
echo "━━━ Validating Claude Accounts ━━━"

CLAUDE_AUTH_COUNT=0
CLAUDE_FAILURES=()

if [ "$CLAUDE_AVAILABLE" -eq 1 ] && [ "$CLAUDE_COUNT" -gt 0 ]; then
  echo "$CLAUDE_ACCOUNTS" | python3 - "$ROOT" <<'PY'
import sys, json, subprocess, os
accounts = json.load(sys.stdin)
root = sys.argv[1]

for acc in accounts:
    acc_id = acc['id']
    acc_env = acc.get('env', {})
    config_dir = acc_env.get('CLAUDE_CONFIG_DIR', '')
    acc_email = acc.get('email', 'unknown')
    acc_label = acc.get('label', acc_id)
    acc_bin = acc.get('bin', 'claude')

    env = os.environ.copy()
    if config_dir:
        env['CLAUDE_CONFIG_DIR'] = config_dir

    print(f"\nTesting: {acc_label} ({acc_email})")
    if config_dir:
        print(f"  CLAUDE_CONFIG_DIR: {config_dir}")

    # Test: claude whoami
    try:
        result = subprocess.run(
            [acc_bin, 'whoami'],
            env=env,
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0 and result.stdout.strip():
            logged_in_as = result.stdout.strip()
            print(f"  ✓ Authenticated: {logged_in_as}")

            # Verify identity matches config
            if acc_email.lower() in logged_in_as.lower() or logged_in_as.lower() in acc_email.lower():
                print(f"  ✓ Identity matches config")
            else:
                print(f"  ⚠ Identity mismatch: expected {acc_email}, got {logged_in_as}")

            print(f"  ✓ Status: OK")
            sys.exit(0)  # Success
        else:
            print(f"  ✗ Not authenticated")
            if config_dir:
                print(f"  Run: CLAUDE_CONFIG_DIR={config_dir} {acc_bin} login")
            else:
                print(f"  Run: {acc_bin} login")
            sys.exit(1)

    except subprocess.TimeoutExpired:
        print(f"  ✗ Timeout checking auth")
        sys.exit(1)
    except Exception as e:
        print(f"  ✗ Error: {e}")
        sys.exit(1)
PY

    if [ $? -eq 0 ]; then
      ((CLAUDE_AUTH_COUNT++))
    else
      CLAUDE_FAILURES+=("$acc_id")
    fi
  done
elif [ "$CLAUDE_AVAILABLE" -eq 0 ]; then
  echo "Claude CLI not available - skipping Claude validation"
else
  echo "No Claude accounts configured"
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "  Validation Summary"
echo "════════════════════════════════════════════════════"
echo ""

# Codex summary
if [ "$CODEX_COUNT" -gt 0 ]; then
  if [ "$CODEX_AUTH_COUNT" -eq "$CODEX_COUNT" ]; then
    echo -e "${GREEN}✓ Codex: $CODEX_AUTH_COUNT/$CODEX_COUNT accounts authenticated${NC}"
  else
    echo -e "${RED}✗ Codex: $CODEX_AUTH_COUNT/$CODEX_COUNT accounts authenticated${NC}"
    echo "  Failed accounts: ${CODEX_FAILURES[*]}"
  fi
else
  echo -e "${YELLOW}⚠ Codex: No accounts configured${NC}"
fi

# Claude summary
if [ "$CLAUDE_AVAILABLE" -eq 1 ]; then
  if [ "$CLAUDE_COUNT" -gt 0 ]; then
    if [ "$CLAUDE_AUTH_COUNT" -eq "$CLAUDE_COUNT" ]; then
      echo -e "${GREEN}✓ Claude: $CLAUDE_AUTH_COUNT/$CLAUDE_COUNT accounts authenticated${NC}"
    else
      echo -e "${RED}✗ Claude: $CLAUDE_AUTH_COUNT/$CLAUDE_COUNT accounts authenticated${NC}"
      echo "  Failed accounts: ${CLAUDE_FAILURES[*]}"
    fi
  else
    echo -e "${YELLOW}⚠ Claude: No accounts configured${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Claude: CLI not available${NC}"
fi

echo ""

# Overall status
TOTAL_CONFIGURED=$((CODEX_COUNT + CLAUDE_COUNT))
TOTAL_AUTHENTICATED=$((CODEX_AUTH_COUNT + CLAUDE_AUTH_COUNT))

if [ "$TOTAL_AUTHENTICATED" -eq 0 ]; then
  echo -e "${RED}✗ FAILED: No providers authenticated${NC}"
  echo "  Autopilot requires at least one authenticated provider."
  exit 1
elif [ "$TOTAL_AUTHENTICATED" -lt "$TOTAL_CONFIGURED" ]; then
  echo -e "${YELLOW}⚠ PARTIAL: $TOTAL_AUTHENTICATED/$TOTAL_CONFIGURED accounts authenticated${NC}"
  echo "  Autopilot will work with reduced capacity."
  echo ""
  echo "To fix unauthenticated accounts, run the login commands shown above."
  exit 2
else
  echo -e "${GREEN}✓ SUCCESS: All $TOTAL_AUTHENTICATED accounts authenticated${NC}"
  echo "  Unified autopilot ready to run!"
  exit 0
fi
