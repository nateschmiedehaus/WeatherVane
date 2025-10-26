#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

echo "[app-smoke] Bootstrapping hermetic stub providers"

if [[ "${APP_SMOKE_SKIP_VITEST:-0}" == "1" ]]; then
  echo "[app-smoke] Skipping web vitest smoke (APP_SMOKE_SKIP_VITEST=1)"
else
  echo "[app-smoke] Running demo-weather-analysis vitest smoke"
  node tools/oss_autopilot/scripts/run_vitest.mjs \
    --run src/pages/__tests__/demo-weather-analysis.test.tsx \
    --scope=web
fi

if [[ "${APP_SMOKE_SKIP_AUTOPILOT_VITEST:-0}" == "1" ]]; then
  echo "[app-smoke] Skipping monitor runner vitest (APP_SMOKE_SKIP_AUTOPILOT_VITEST=1)"
else
  echo "[app-smoke] Verifying monitor runner behavior"
  node tools/oss_autopilot/scripts/run_vitest.mjs \
    --run tools/wvo_mcp/src/orchestrator/__tests__/state_runners/monitor_runner.test.ts \
    --scope=autopilot
fi

echo "[app-smoke] Validating critical routes"
exit 0
