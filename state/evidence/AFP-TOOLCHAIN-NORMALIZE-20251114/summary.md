# Summary — AFP-TOOLCHAIN-NORMALIZE-20251114

- Added `.editorconfig` enforcing LF endings, final newlines, and 2-space indentation (4 for Python).
- Documented Python test venv process in `state/py/afp-tests/README.md` and ignored `state/py/afp-tests/venv/` artifacts.
- Verified npm toolchain reproducibility (`npm ci` passes); `npm test --workspaces` still fails with "No workspaces found" (legacy deficit).
