## Analysis & Risks
- **Completeness risk**: PR summary may omit artifacts (e.g., audit report, evidence backfill). Mitigation: build checklist from spec and cross-reference file paths before finalizing.
- **Drift risk**: Future guardrail changes could render summary stale. Mitigation: emphasize monitoring hooks (evidence backfill script, integrity stages) and note expectation to rerun them.
- **Reviewer overload**: Too much detail without structure could confuse reviewers. Mitigation: use sectioned summary with tables for commands and artifacts.
- **Evidence integrity**: Need to ensure referenced files exist in repo post-commit. Mitigation: run `check_work_process_artifacts` and mention commit hash / state.
