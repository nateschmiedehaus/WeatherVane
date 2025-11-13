# Foundation Issues Blocking Autonomous Wave 0

**Date:** 2025-11-11
**Context:** Prepping AUTO-GOL-T1 → GOL-DEMO-001 autonomous run
**Impact:** CRITICAL – Autonomous Wave 0 fails before first phase

## 1. MCP Tools Broken (Node ABI mismatch)
- **Symptom:** `./plan_next '{"minimal":true}' --raw` crashes with `NODE_MODULE_VERSION 115` vs runtime 137.
- **Cause:** System defaulted to Node 24.10.0 while better-sqlite3 was compiled under Node 20.x.
- **Fix Attempt:** Installed `node@20` via Homebrew and rebuilt better-sqlite3. Command now launches but fails later due to roadmap YAML error (separate issue). Foundation task tracks enforcing Node 20 everywhere.
- **Remediation:** Use Node 20 LTS (`nvm use 20` or `brew link --overwrite node@20`) before running MCP tools; rebuild native modules afterwards. Track under `FOUNDATION-FIX-NODE-ABI-001`.

## 2. Python Test Suite Broken (Version mismatch)
- **Symptom:** Consolidated suite (`run_integrity_tests.sh`) aborted with 128 collection errors when Python 3.10 was in PATH.
- **Cause:** `pyproject.toml` requires Python >= 3.11. Without it, dependencies (numpy, polars, etc.) fail.
- **Fix Attempt:** Installed Python 3.11.10, created `.venv`, re-installed editable package. Tests still red due to vendored numpy, but interpreter requirement satisfied.
- **Remediation:** Enforce Python 3.11+ during bootstrap, document steps, rerun suite. Track under `FOUNDATION-FIX-PYTHON-VERSION-001`.

## 3. NumPy Vendoring Issue
- **Symptom:** `python -c "import numpy"` historically failed with `No module named 'numpy._core._multiarray_umath'` when `.deps/numpy` leaked into PYTHONPATH.
- **Cause:** Vendored binaries compiled for mismatched architectures. Real wheels from PyPI work.
- **Remediation:** Remove vendored path from PYTHONPATH and rely on pip wheels. Track under `FOUNDATION-FIX-NUMPY-VENDOR-001`.

## 4. Missing Apple Silicon Lock File
- **Symptom:** `make bootstrap` references `requirements/apple-silicon.lock` which does not exist.
- **Impact:** New Apple Silicon contributors cannot bootstrap without manual editing.
- **Remediation:** Generate lock file or delete special-case from Makefile. Track under `FOUNDATION-FIX-APPLE-LOCK-001`.

## What Works Today
- TypeScript build and unit tests (`npm run build`, `npm test`).
- Forced execution mode (AUTO-GOL-T1 proved mutation patches).
- Critics (DocGuard, StrategyReviewer, ThinkingCritic, ProcessCritic) now passing.

## What Remains Broken
- Autonomous MCP tooling until Node 20 enforced everywhere.
- Python consolidated tests (still red, pending numpy + fixture issues).
- Apple Silicon bootstrap for newcomers.

## Recommendation
1. **Fix Node ABI** (10 min) – ensures MCP tooling works.
2. **Standardize Python 3.11 venv** (15 min) – unlocks consolidated tests.
3. **Remove vendored numpy** (5 min) – stabilize cross-stack suite.
4. **Generate Apple Silicon lock** (5 min) – unblock make bootstrap.

Total effort: ~35 minutes once access/privileges available. After foundation repairs, rerun autonomous Wave 0 for GOL-DEMO-001.
