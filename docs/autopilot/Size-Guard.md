
# Core Doc Size Guard (CI)

```bash
# scripts/check_core_size.sh
max=30000
n=$(wc -c < docs/autopilot/ClaudeCouncil-Core.md)
if [ "$n" -gt "$max" ]; then
  echo "Core doc too large: ${n} bytes (> $max)"; exit 1
fi
```
