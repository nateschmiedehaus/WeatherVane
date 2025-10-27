
#!/usr/bin/env bash
set -euo pipefail
FAIL=0
# 1. System called
rg -n "systemX\.process" src/ >/dev/null || { echo "❌ SystemX not called"; FAIL=$((FAIL+1)); }
# 2. Output propagated
rg -n "systemX(Output|Result)" src/ >/dev/null || { echo "❌ Output not propagated"; FAIL=$((FAIL+1)); }
# 3. Consumer uses output
rg -n "input\.systemX(Output|Result)" src/ >/dev/null || { echo "❌ Output not used by consumer"; FAIL=$((FAIL+1)); }
# 4. Shared utilities used
rg -n "from .*shared/(logger|config|cache)" src/ >/dev/null || { echo "❌ Not using shared utilities"; FAIL=$((FAIL+1)); }
# 5. Duplicate types
if rg -n "interface SystemX(Output|Result)" src/ | wc -l | grep -q '^[2-9]'; then
  echo "❌ Duplicate interface definitions"; FAIL=$((FAIL+1));
fi
# 6. Logs attribution
rg -n "log(ger)?\.(info|debug|warn).*SystemX" src/ >/dev/null || { echo "❌ Logs missing SystemX attribution"; FAIL=$((FAIL+1)); }
# 7. Integration tests
ls src/__tests__/*systemx*_integration.test.* >/dev/null 2>&1 || { echo "❌ Integration tests missing"; FAIL=$((FAIL+1)); }
# 8. Negative-path test
rg -n "systemx.*(error|fail|fallback)" src/__tests__/ >/dev/null || { echo "❌ Negative-path test missing"; FAIL=$((FAIL+1)); }
[ "$FAIL" -eq 0 ] && echo "✅ Integration checks passed" || { echo "❌ $FAIL check(s) failed"; exit 1; }
