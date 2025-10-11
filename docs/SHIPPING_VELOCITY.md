# Shipping Velocity Review

_Date: 2025-10-10_

## Snapshot
- **Phase:** Optimization / shipping acceleration
- **Scope:** Repository hygiene, deployment cadence, release automation readiness

## Signals Collected
- `git log --since "30 days ago"` returns **5 commits**, suggesting sub-weekly pushes.
- Latest commit landed on **2025-10-09 21:02:16 -0500** – currently **1 day** old.
- `git status -sb` shows **40+ tracked files modified** and **80+ untracked paths**, dominated by `tmp/metrics/` artifacts and new documentation. The branch is ahead of `origin/main` by one commit.
- Shell startup emits `brew` and `pyenv` errors, indicating brittle local tooling (`.bash_profile` assumes Homebrew at `/usr/local/bin` and writable pyenv shims).
- `docs/STATUS.md` and `state/context.md` still reference task T2.2.1 as in-progress, diverging from the roadmap where it is marked `done`.
- Prior blockers recorded: local numpy import crashes preventing `make test` / critics runs.

## Bottlenecks Impacting Velocity
1. **Dirty workspace & artifact sprawl** – dozens of tracked edits plus large metric dumps slow down reviews and staging; lack of `tmp/` ignore rules caused repeated churn.
2. **Environment fragility** – shell startup errors and numpy crashes erode confidence in local verification, delaying release-readiness checks.
3. **Stale operational status** – conflicting status docs make it harder to communicate readiness and hand off reviews quickly.
4. **Sparse cadence data** – only five commits in 30 days suggests low iteration throughput or unmerged local work, risking large, hard-to-review changesets.

## Recommended Actions
1. **Stabilise local tooling**
   - Prune `.bash_profile` of hard-coded Homebrew paths; gate brew sourcing on existence to avoid CI noise.
   - Regenerate pyenv shims with a writable prefix (e.g., repo-local `.venv`) to unblock Python tooling.
   - Pin numpy/scientific stack via `make bootstrap` + `.deps` wheels and document working Apple Silicon flow (see docs/DEVELOPMENT.md updates).
2. **Enforce clean working tree policies**
   - Keep `tmp/` artifacts gitignored (landed in `.gitignore` via this task).
   - Add `tmp/metrics/` to CI purge list or emit to `storage/metrics/` which is already ignored.
   - Introduce a `make preflight` (lint + tests + git diff guard) to fail early when dirty.
3. **Refresh operational dashboards**
   - Update `docs/STATUS.md` & `state/context.md` post-task completion (performed alongside this review).
   - Automate status digest generation off roadmap to avoid drift.
4. **Track and raise cadence**
   - Set a daily (or per-PR) deploy log capturing `commit -> deployment` timestamps.
   - Schedule bi-weekly shipping reviews checking critics history, outstanding blockers, and PR queue length.
   - Encourage slicing: merge smaller vertical increments to keep `git log --since 7 days` ≥10 commits.

## Immediate Next Steps
- ✅ Add `tmp/` to `.gitignore` (done in this review).
- ✅ Create automation to clean `tmp/metrics/` directories after tests (`make test` now calls `python -m shared.observability.metrics` and `make clean-metrics` is available for manual runs).
- ☐ Land `.bash_profile` guard rails in developer environment template.
- ☐ Stand up a simple `scripts/velocity_report.py` (cron-able) that surfaces commits per week and open PRs.
- ☐ Ensure numpy/pyenv crash is tracked as a P0 infra ticket; unblock `make test` locally.

## Owner
Task `T_AUTO_1760092275 – Shipping velocity check`
