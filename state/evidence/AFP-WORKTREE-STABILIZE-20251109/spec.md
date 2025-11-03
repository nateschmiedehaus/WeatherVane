# Specification

## Scope
- Execute the stabilization procedure defined in prompt AFP-WORKTREE-STABILIZE-20251109.
- Produce phase artifacts for STRATEGIZE and SPEC (this document) prior to other actions.
- Record pre-clean git status/diff into `state/evidence/AFP-WORKTREE-STABILIZE-20251109/verify/`.
- Create snapshot branch/tag/tarball and attach git notes with AFP justification.
- Push snapshot references to origin (if remote push succeeds or log failure).
- Reset repository to `origin/main` and perform `git clean -fdx`, capturing clean status output.
- Quarantine volatile directories (`state/tmp`, `state/soak_runs`) into timestamped archive paths.
- Generate `/meta/scan_exclusions.yaml` with provided exclusions.
- Rebuild MCP toolchain via `npm ci`, `npm run build`, capture version output, run dry checkers, and attempt restart script.
- Update only test/tool fixtures necessary to reflect AFP 10-phase language and current CLI behavior; no product code modifications.
- Run `npm run test:autopilot --workspaces --silent` (allowing failures) and pipe integrity suite output to evidence log.
- Commit stabilized state on task branch, push, and prepare PR metadata per instructions.
- Append monitoring entry to `state/analytics/health_checks.jsonl` with required fields.
- Ensure Git & tree policy statement recorded in `/meta/git_tree_policy.md` (create/update).

## Acceptance Criteria
- Evidence directory contains: strategy/spec, pre/clean git statuses and diff patch, MCP version output, integrity log, test results (stderr/stdout capture via tee or file), scan exclusions file, monitoring entry.
- Snapshot artifacts verifiably created (log branch name/tag, tarball path); command outputs show success or captured failure with remediation plan.
- Post-reset `git status -sb` reports clean tree.
- `/meta/scan_exclusions.yaml` reflects specified glob list exactly.
- MCP restart succeeds or recorded failure details with next-step guidance; toolchain rebuild completes without npm errors.
- Test fixture updates limited to tests/tooling directories; diff reviewed before commit to ensure compliance.
- Commit message follows `chore(afp): … [AFP]` format; PR title matches provided string.
- `state/analytics/health_checks.jsonl` new entry includes `mcp_version`, `restart_status`, `test_summary`, `exclusions_applied`.
- `/meta/git_tree_policy.md` updated with policies supplied in prompt.

## Non-Goals
- No modifications to product feature code or runtime behavior outside of tests/tools.
- No attempt to resolve paused dependency tasks (`AFP-STRUCTURAL-REGEN-20251108`, `AFP-DOCS-20251105`).
- No new roadmap tasks or policy changes beyond mandated git/tree policy document.
- No deployment or CI merges; focus is local stabilization only.
- Do not delete archived data; only relocate as directed.
