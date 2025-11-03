# Strategy

## Context
- AFP-WORKTREE-STABILIZE-20251109 restored a clean baseline but left two enforcement gaps: Python integrity suites die before execution, and guard checker scripts are missing.
- Without green integrity + guard shims, AFP loop cannot verify structural/ownership compliance, blocking downstream work.

## Problem Statement
Rehydrate the integrity test environment and reinstate the TypeScript guard entrypoints so the enforced STRATEGIZE→AFP ALIGNMENT→…→MONITOR loop regains automated coverage.

## Guiding Principles
- Contain changes to tooling/tests per task constraint; no product logic edits.
- Use minimal, reproducible env (venv under `state/py`) to avoid system-wide pollution.
- Prefer existing guard runner APIs; add thin wrappers to minimize drift.
- Capture evidence for every command per AFP/SCAS.

## High-Level Approach
1. Provision dedicated Python venv containing numpy/pytest; update integrity runner to source it when present.
2. Add guard checker scripts that invoke the policy-aware guard runner; expose npm scripts for CI/CLI parity and ensure ownership coverage.
3. Re-run guard/AFP gates and integrity suite, storing logs and documenting residual issues if any; restart MCP for a clean state.

## Risks & Mitigations
- *Wheel availability*: fallback to source installs only if binaries unavailable; capture versions.
- *Policy API drift*: validate guard runner signature via TypeScript types before wiring scripts.
- *Integrity failures beyond NumPy*: treat as blockers, document in evidence, coordinate follow-up if new issues arise.
