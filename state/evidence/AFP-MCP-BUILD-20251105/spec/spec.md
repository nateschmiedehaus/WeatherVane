# SPEC — Task 1: [MCP-BUILD] Clean TypeScript Build

## In scope
- Ensure `npm ci` (with required environment flags) succeeds in `tools/wvo_mcp`.
- Run `npm run build` and eliminate all TypeScript errors/warnings.
- Confirm generated `dist/` tree includes required entrypoints, sourcemaps, and no stale artifacts.
- Document environment prerequisites (e.g., `CXXFLAGS` for macOS SDK headers) in repo docs and/or build scripts.
- Capture evidence: build log, `dist/` listing, relevant configuration diffs.

## Out of scope / non-goals
- Changing runtime TypeScript configurations beyond what is necessary to eliminate warnings.
- Updating dependencies beyond `npm ci` (no upgrades unless required to fix build).
- Running full MCP boot or health checks (covered by later tasks unless needed for verification).
- Addressing application-level runtime bugs unrelated to the build pipeline.

## Acceptance criteria mapping
- Build command exits 0, no warnings: provide log file under `verify/build_output.log`.
- `dist/index.js`, `dist/index-claude.js`, other key files exist: capture `verify/dist_tree.txt`.
- No implicit `any`: ensure `tsconfig`/source adjustments remove warnings.
- Source maps present (verify `.map` in dist).

## Environment notes
- macOS 15 requires `CXXFLAGS/CPPFLAGS` to include SDK C++ headers (`-I$(xcrun --show-sdk-path)/usr/include/c++/v1`). Incorporate into scripts or docs to avoid future build failures.

## Verification plan
- `npm ci` (already validated) + `npm run build --silent 2>&1 | tee ...`.
- Optional: `npm run lint` if helpful to confirm no stray TS errors (only if quick).
- Manual inspection of `dist/` contents and `package.json` build scripts.
