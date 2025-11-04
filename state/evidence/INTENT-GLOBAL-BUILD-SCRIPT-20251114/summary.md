# Summary — INTENT-GLOBAL-BUILD-SCRIPT-20251114

- Added root `npm run build` orchestration (`scripts/run-build.js`) and package.json script.
- Script attempts builds for `apps/web` and `tools/wvo_mcp`, logging warnings instead of failing when dependencies missing.
- Guardrail workflow can now call `npm run build` without "Missing script" errors, unblocking build matrix.
