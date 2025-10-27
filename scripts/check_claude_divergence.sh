
#!/usr/bin/env bash
set -euo pipefail
CHANGED=$(git diff --name-only origin/${GITHUB_BASE_REF:-main}... | rg '^CLAUDE\.md$' || true)
if [ -z "$CHANGED" ]; then echo "✅ No CLAUDE.md changes"; exit 0; fi

COVER=docs/autopilot/migration/claude_v1_coverage.json
[ -f "$COVER" ] || { echo "❌ coverage file missing: $COVER"; exit 1; }

if rg -n '"migrated"\s*:\s*true' "$COVER" >/dev/null; then
  echo "ℹ️ Coverage JSON present; ensure related sections are migrated in review."; exit 0;
fi

echo "❌ CLAUDE.md changed but coverage matrix not updated (no migrated=true rows)."; exit 1
