# STRATEGIZE — Task 1: [MCP-BUILD] Clean TypeScript Build

## Why now
- Wave 1 requires a clean, reproducible MCP build before any higher-level work. Current build status is unknown after recent resets; we need authoritative proof.
- Later tasks (boot/health/dependency enforcement) depend on a working `dist/` bundle, so this is the foundation.
- Previous `npm ci` failures (missing C++ headers) blocked all progress; now that we restored the build toolchain, we can complete the job.

## Desired end state
- `npm run build` in `tools/wvo_mcp` exits 0 with zero TypeScript errors or warnings.
- Fresh `dist/` directory contains both Codex and Claude entrypoints (`index.js`, `index-claude.js`) and sourcemaps.
- Evidence of clean build captured (logs, directory listing) and stored under `state/evidence/AFP-MCP-BUILD-20251105/verify/`.
- Document environment configuration required for future builds (SDK include flags) so the fix persists.

## Success metrics
- Build duration < 30s on local machine.
- No `error TS` nor `warning` lines in output.
- `ls dist/` shows expected artifacts and zero stale files.

## Risks / mitigations
- TypeScript configuration may emit warnings despite success; we must raise strictness or adjust config to eliminate them.
- Previous toolchain issues required custom `CXXFLAGS`; we must ensure build scripts (and documentation) capture these env vars.
- `dist/` might have stale modules if build skips cleaning; confirm by removing old output first.

## Alternatives considered
- Delegate to later tasks: rejected; without a clean build we cannot validate MCP boot/health.
- Use precompiled artifacts: rejected; we need reproducible source-based build.

## Next steps
1. SPEC: document scope, deliverables, non-goals.
2. PLAN/THINK: assess current build config, identify warning sources, determine env var persistence.
3. IMPLEMENT: clean install, run lint/build, fix issues, document env requirements.
4. VERIFY: capture build logs, confirm artifacts, run supportive checks (e.g., `npm run lint` if required).
