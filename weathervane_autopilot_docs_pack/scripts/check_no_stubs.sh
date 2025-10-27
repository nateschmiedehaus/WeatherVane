
#!/usr/bin/env bash
set -euo pipefail
if rg -n "\b(TBD|TO DO|TODO:|Stub|Fill me in)\b" docs/ >/dev/null; then
  echo "❌ Stub/placeholder text found in docs"; exit 1;
fi
echo "✅ No stubs in docs"
