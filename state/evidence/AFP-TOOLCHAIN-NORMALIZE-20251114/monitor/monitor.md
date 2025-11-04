# Monitor — AFP-TOOLCHAIN-NORMALIZE-20251114

- Toolchain configs committed (.editorconfig, Node v24.10.0 via existing .nvmrc).
- Python venv instructions stored at `state/py/afp-tests/README.md`; actual venv ignored.
- Latest runs:
  - `npm ci` ✅ (`verify/npm_ci.txt`).
  - `npm test --workspaces` 🚫 ("No workspaces found").
- Next: define workspaces or replace `npm test` script so CI can execute tests deterministically.
