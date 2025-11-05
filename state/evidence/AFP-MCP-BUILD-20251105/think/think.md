# THINK — Key considerations

- **Toolchain requirement**: On macOS 15 the standard C++ headers are only under the SDK path. We verified that bare `clang++` fails to locate `<climits>` unless we add `-I$(xcrun --show-sdk-path)/usr/include/c++/v1`. Solution: set `CXXFLAGS`/`CPPFLAGS` when invoking `npm ci` (and `npm rebuild`). `scripts/ensure-sqlite-build.mjs` already sets these flags for rebuilds; documentation must explain how to export them for fresh installs.
- **dist cleanup**: Existing `dist/` already populated. To guarantee deterministic build output we should remove it (or rely on `tsc` to overwrite). We'll remove `dist` before building to avoid stale files.
- **TypeScript config**: `tsconfig.json` uses standard settings; need to watch for suppressed warnings (e.g., `skipLibCheck`, `noImplicitAny`). If TypeScript still emits warnings, adjust source/config accordingly.
- **Command packaging**: `npm run build` simply calls `tsc`; after dependencies installed the build should not trigger native rebuild. Build time expected to be short (<30s). We'll capture start/end time for evidence.
- **Evidence requirements**: need `build_output.log` showing clean run, `dist_tree.txt`, possibly `tsconfig` diff if changed, README update referencing env flags.
