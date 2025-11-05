#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT_DIR"

npm run readme:update

# Stage generated artifacts
if [ -f state/analytics/readme_manifest.json ]; then
  git add state/analytics/readme_manifest.json
fi

if [ -f .docsyncignore ]; then
  git add .docsyncignore
fi

# Stage README files managed by docsync
find apps docs shared tools -name README.md -print0 2>/dev/null | xargs -0 git add

# Remind about bulk override
echo ""
echo "Staged docsync artifacts. To commit use:"
echo "  ALLOW_DOCSYNC_BULK=1 git commit -m \"docs: regenerate READMEs\""
echo ""
