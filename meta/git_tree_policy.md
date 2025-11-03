# Git & Tree Policy

## Branching
- Protected branches: `main`, `release/*`.
- Working branches follow `task/<ID>-<slug>`.

## Commits
- Use Conventional Commit messages and include `[AFP]` for policy-affecting changes.
- Every task records evidence under `state/evidence/<TASK_ID>/`.

## Structure & Data Hygiene
- Delete code by moving it to `/graveyard/` with a pointer and `ttl_days` (no hard deletes).
- Keep folder depth ≤ 3; shared utilities belong in `/lib/core/`.
- Large or volatile data stays under `/state/`; long-running artifacts live in `/meta/scan_exclusions.yaml`.

## Ownership & Approvals
- Every top-level directory must have an `OWNERS.yaml` listing a steward and reviewer cadence.
- Refactors moving >300 LOC or renaming files require an ADR plus steward approval.
