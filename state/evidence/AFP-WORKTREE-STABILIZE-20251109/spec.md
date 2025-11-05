# Spec — AFP-WORKTREE-STABILIZE-20251109

## Scope
- Snapshot the current dirty worktree before any destructive operations (git status, diff, archive branch/tag, tarball, git note).
- Reset local repository to `origin/main` and ensure pristine status (`git reset --hard`, `git clean -fdx`).
- Move volatile directories (`state/tmp`, `state/soak_runs`, future archives) into quarantined location and author `/meta/scan_exclusions.yaml`.
- Rebuild `tools/wvo_mcp` toolchain (`npm ci`, `npm run build`) and capture `--version` output once SQLite path is fixed.
- Run guard check scripts in dry mode per instructions to confirm readiness.
- Record every significant command output under `state/evidence/AFP-WORKTREE-STABILIZE-20251109/verify/` for auditability.

## Non-goals / Out of scope
- No product-code modifications beyond tooling/tests required for stabilization.
- Do not resolve outstanding roadmap tasks beyond establishing clean baseline.
- Do not push commits or open PR until all verification artifacts exist and MCP restart succeeds (may require follow-up task if toolchain fails).
- Do not delete user data outside directories explicitly listed in instructions.

## Acceptance criteria
- Evidence directory contains pre/post git status snapshots, git diff, build outputs, guard logs.
- Snapshot branch/tag and tarball created with consistent naming `worktree-snapshot-<timestamp>`.
- Local repo matches `origin/main` (no untracked/uncommitted files) after reset.
- MCP build succeeds or failure is documented with environmental root cause and next steps.
- Quarantined volatile paths relocated and excluded via `/meta/scan_exclusions.yaml`.
