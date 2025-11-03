# Specification

## Scope
- Create isolated Python venv at `state/py/afp-tests`, install numpy and pytest, and ensure integrity scripts can activate it without global impact.
- Add/update shell shim in integrity runner (or invocation instructions) to source the venv when present.
- Implement TypeScript guard checker scripts (`check_structure_integrity.ts`, `check_dependency_rules.ts`, `check_ownership_and_ttls.ts`) that call the existing guard runner, and register npm scripts for them.
- Ensure ownership metadata exists for `tools/wvo_mcp/scripts` and `tools/wvo_mcp/python` directories.
- Run AFP/mode guard scripts, guard shims (`--dry`), and `run_integrity_tests.sh --suite work-process`; capture all outputs into `state/evidence/AFP-GUARDS-REHYDRATE-20251110/verify/`.
- Restart MCP via `scripts/restart_mcp.sh` after rehydration and log status.

## Non-Goals
- No changes to product runtime code, orchestration core logic, or roadmap metadata beyond tooling updates.
- No attempt to solve deeper Python dependency issues beyond what integrity suite requires today (document if unresolved).
- No modification of existing AFP policy definitions except via wrapper scripts.

## Acceptance Criteria
1. `state/py/afp-tests` exists; `python_venv_path.txt` records the path; `python -c "import numpy, pytest"` succeeds inside it.
2. Guard checker scripts exist, are executable, and `node --import tsx ... --dry` exits 0 with JSON output.
3. `bash tools/wvo_mcp/scripts/run_integrity_tests.sh --suite work-process` completes without NumPy ImportError (test results captured even if later failures occur).
4. Evidence directory contains logs for all commands, including guard shims, AFP mode checks, and integrity run.
5. Branch `task/AFP-GUARDS-REHYDRATE-20251110` pushed with commit message `chore(afp): rehydrate integrity deps and restore guard checker scripts [AFP]` and PR title `AFP-GUARDS-REHYDRATE-20251110 | Integrity deps + guard checkers restored` prepared.
