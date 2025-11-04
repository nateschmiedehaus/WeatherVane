# Spec — AFP-TOOLCHAIN-NORMALIZE-20251114

## Deliverables
- `.editorconfig` at repository root.
- `state/py/afp-tests/README.md` outlining venv creation and usage.
- `.gitignore` entry to ignore `state/py/afp-tests/venv/**` artifacts.
- Evidence bundle `state/evidence/AFP-TOOLCHAIN-NORMALIZE-20251114/verify/` containing:
  - `commands.txt` (npm commands run).
  - `npm_ci.txt` and `npm_test.txt` outputs.
  - `npm_test.txt` may document current failure (no workspaces) — acceptable.
- Summary + monitor notes in `state/evidence/AFP-TOOLCHAIN-NORMALIZE-20251114/`.

## Constraints
- New tracked files ≤ 2 (expected: `.editorconfig`, `state/py/afp-tests/README.md`).
- Added LOC ≤ 400.
- No new binary artifacts; venv contents stay ignored.

## Validation
1. Run `npm ci` and capture the log.
2. Run `npm test --workspaces` (document current behavior).
3. Review `git status` to ensure only intended files staged.

## Completion Definition
- Git status clean post-commit.
- Evidence captures reproducibility attempts.
- Monitor captures outstanding issues (e.g., missing workspaces for npm test).
