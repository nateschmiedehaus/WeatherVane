# PLAN — Task 1: [MCP-BUILD]

1. **Baseline inspection**
   - Check current `package.json` build script, TypeScript config, and `dist/` contents.
   - Determine if prior dist artifacts exist; plan to clean before rebuild.

2. **Environment configuration**
   - Persist the working `CXXFLAGS`/`CPPFLAGS` (macOS SDK include path) via `.npmrc`, scripts, or documentation so all build invocations succeed without manual export.

3. **Execute clean install + build**
   - Run `npm ci` (already done) — repeat only if necessary after modifications.
   - Run `npm run build` capturing complete log; address any TS errors/warnings.
   - If warnings arise from configuration (e.g., `skipLibCheck`), adjust TypeScript or source accordingly.

4. **Artifact validation**
   - Verify output tree (`ls -R dist`) contains required files and sourcemaps.
   - Ensure no extraneous stale files (consider removing `dist` before building to guarantee clean state).

5. **Documentation & evidence**
   - Record build command/log in `verify/build_output.log`.
   - Save `dist` listing to `verify/dist_tree.txt`.
   - Document environment requirement (e.g., README snippet or script comment) under appropriate doc (possibly `tools/wvo_mcp/README.md`).
   - Note any configuration updates in plan for cross-task awareness.

## Timeline / sequencing
- Steps 1-2: 15-20 minutes.
- Step 3: 5-10 minutes per build attempt.
- Step 4: 5 minutes.
- Step 5: 10 minutes.

## Risks & contingencies
- If new TypeScript errors appear, may need code adjustments (tracked with smaller commits).
- If `CXXFLAGS` approach insufficient for other contributors, consider adding `.npmrc` script or `prebuild` instructions.
- If build remains slow (>30s), note but consider acceptable if clean; optimization optional.
