#!/usr/bin/env bash
#
# REAL Account Authentication Validator (Simplified)
#
# Verifies that all configured accounts are authenticated
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "══════════════════════════════════════════════════"
echo "  WeatherVane Account Auth Verification"
echo "══════════════════════════════════════════════════"
echo ""

python3 - "$ROOT" <<'PYTHON'
import sys
import subprocess
import json
from pathlib import Path

root = Path(sys.argv[1])
account_manager = root / "tools" / "wvo_mcp" / "scripts" / "account_manager.py"

# Load normalized accounts using account_manager
result = subprocess.run([sys.executable, str(account_manager), 'list', 'codex'], capture_output=True, text=True)
codex_accounts = json.loads(result.stdout) if result.returncode == 0 else []

result = subprocess.run([sys.executable, str(account_manager), 'list', 'claude'], capture_output=True, text=True)
claude_accounts = json.loads(result.stdout) if result.returncode == 0 else []

print(f"\033[0;34mCodex accounts:\033[0m {len(codex_accounts)}")
print(f"\033[0;34mClaude accounts:\033[0m {len(claude_accounts)}")
print()

codex_auth_count = 0
claude_auth_count = 0

# Test Codex accounts
if codex_accounts:
    print("━━━ Codex Accounts ━━━")
    for acc in codex_accounts:
        acc_id = acc['id']
        acc_home = acc['home']
        acc_email = acc.get('email', 'unknown')
        acc_label = acc.get('label', acc_id)

        print(f"\n{acc_label} ({acc_email})")
        print(f"  CODEX_HOME: {acc_home}")

        try:
            import os
            env = os.environ.copy()
            env['CODEX_HOME'] = acc_home

            result = subprocess.run(
                ['codex', 'status'],
                env=env,
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0 and 'Logged in' in result.stdout:
                for line in result.stdout.split('\n'):
                    if '@' in line:
                        print(f"  \033[0;32m✓\033[0m {line.strip()}")
                        break
                codex_auth_count += 1
            else:
                print(f"  \033[0;31m✗\033[0m Not authenticated")
                print(f"  Run: CODEX_HOME={acc_home} codex login")
        except Exception as e:
            print(f"  \033[0;31m✗\033[0m Error: {e}")
    print()

# Test Claude accounts
if claude_accounts:
    print("━━━ Claude Accounts ━━━")
    for acc in claude_accounts:
        acc_id = acc['id']
        acc_env = acc.get('env', {})
        config_dir = acc_env.get('CLAUDE_CONFIG_DIR', '')
        acc_email = acc.get('email', 'unknown')
        acc_label = acc.get('label', acc_id)
        acc_bin = acc.get('bin', 'claude')

        print(f"\n{acc_label} ({acc_email})")
        if config_dir:
            print(f"  CLAUDE_CONFIG_DIR: {config_dir}")

        try:
            import os
            env = os.environ.copy()
            if config_dir:
                env['CLAUDE_CONFIG_DIR'] = config_dir

            result = subprocess.run(
                [acc_bin, 'whoami'],
                env=env,
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0 and result.stdout.strip():
                print(f"  \033[0;32m✓\033[0m {result.stdout.strip()}")
                claude_auth_count += 1
            else:
                print(f"  \033[0;31m✗\033[0m Not authenticated")
                if config_dir:
                    print(f"  Run: CLAUDE_CONFIG_DIR={config_dir} {acc_bin} login")
                else:
                    print(f"  Run: {acc_bin} login")
        except Exception as e:
            print(f"  \033[0;31m✗\033[0m Error: {e}")
    print()

# Summary
print("══════════════════════════════════════════════════")
print("  Summary")
print("══════════════════════════════════════════════════")
print()

if codex_accounts:
    if codex_auth_count == len(codex_accounts):
        print(f"\033[0;32m✓\033[0m Codex: {codex_auth_count}/{len(codex_accounts)} authenticated")
    else:
        print(f"\033[0;31m✗\033[0m Codex: {codex_auth_count}/{len(codex_accounts)} authenticated")

if claude_accounts:
    if claude_auth_count == len(claude_accounts):
        print(f"\033[0;32m✓\033[0m Claude: {claude_auth_count}/{len(claude_accounts)} authenticated")
    else:
        print(f"\033[0;31m✗\033[0m Claude: {claude_auth_count}/{len(claude_accounts)} authenticated")

print()

total_configured = len(codex_accounts) + len(claude_accounts)
total_authenticated = codex_auth_count + claude_auth_count

if total_authenticated == 0:
    print("\033[0;31m✗ FAILED: No providers authenticated\033[0m")
    sys.exit(1)
elif total_authenticated < total_configured:
    print(f"\033[1;33m⚠ PARTIAL: {total_authenticated}/{total_configured} accounts authenticated\033[0m")
    sys.exit(2)
else:
    print(f"\033[0;32m✓ SUCCESS: All {total_authenticated} accounts authenticated!\033[0m")
    print("  Unified autopilot ready to run!")
    sys.exit(0)
PYTHON
