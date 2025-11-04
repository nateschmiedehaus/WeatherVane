# Summary — INTENT-TOOLING-NORMALIZE-20251113

- Added toolchain pins: `.nvmrc` (Node 24.10.0) and `python-toolchain.toml` (Python 3.11.7).  
- Introduced `.editorconfig` for consistent formatting.  
- Regenerated `package-lock.json` via `npm install --package-lock-only` and verified `npm ci`.  
- `npm test --workspaces` still reports "No workspaces found" (existing issue).
