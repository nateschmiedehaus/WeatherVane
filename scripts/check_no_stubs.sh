
#!/usr/bin/env bash
set -euo pipefail
# Show which files have stubs
if rg -n "\b(TBD|TO DO|TODO:|Stub|Fill me in)\b" docs/  --glob '!**/weathervane_autopilot_docs_pack/**' 2>&1; then
  echo "❌ Stub/placeholder text found in docs"; exit 1;
fi
echo "✅ No stubs in docs"
