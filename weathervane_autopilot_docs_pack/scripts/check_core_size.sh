
#!/usr/bin/env bash
set -euo pipefail
max=30000
n=$(wc -c < docs/autopilot/ClaudeCouncil-Core.md)
if [ "$n" -gt "$max" ]; then
  echo "Core doc too large: ${n} bytes (> $max)"; exit 1
fi
echo "✅ Core doc within size budget ($n bytes ≤ $max)"
