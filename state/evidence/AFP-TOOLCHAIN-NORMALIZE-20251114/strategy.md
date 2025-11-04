# Strategy — AFP-TOOLCHAIN-NORMALIZE-20251114

## Goals
- Establish deterministic Node/Python tooling by committing shared configs.
- Provide a reproducible Python test environment under `state/py/afp-tests` (documented instructions, directory tracked).
- Validate the npm lockfile remains stable via `npm ci`.

## Approach
1. Add `.editorconfig` for consistent formatting across languages.
2. Create `state/py/afp-tests/README.md` describing the venv setup and ignoring artifacts through `.gitignore` updates.
3. Reuse existing `.nvmrc` and `package-lock.json`; run `npm ci` to confirm reproducibility and capture logs.
4. Record commands and results in the evidence directory and produce a monitor note for ongoing follow-up.

## Risk & Mitigation
- **Risk:** Accidental commit of venv artifacts.  
  *Mitigation:* Update `.gitignore` to exclude `state/py/afp-tests/venv` contents.
- **Risk:** Tests fail due to missing scripts.  
  *Mitigation:* Log current status (`npm test`), flag for follow-up once workspaces defined.

## Exit Criteria
- `.editorconfig` + `state/py/afp-tests/README.md` present.
- `.gitignore` updated to ignore venv artifacts.
- `npm ci` evidence stored; summary & monitor documents reproducibility gaps.
