# Git & Tree Policy

- Protected branches: `main`, `release/*`.
- Feature branches follow `task/<ID>-<slug>` naming.
- Commits use Conventional Commit style and include `[AFP]` when policy-affecting.
- Evidence for every task lives under `state/evidence/<TASK_ID>/`.
- Large deletions move files into `/graveyard/` with `ttl_days` metadata; no direct hard deletes.
- Shared utilities reside under `/lib/core/` and folder depth stays ≤ 3.
- Volatile data remains under `/state/`; update `/meta/scan_exclusions.yaml` when exclusions change.
- Refactors moving >300 LOC or renaming files require ADR + steward approval.
