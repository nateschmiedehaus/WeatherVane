# Implementation Notes

- Guardrail catalog tests now resolve the repo root dynamically (upward search for `.git` + `state/roadmap.yaml`) so they load `meta/afp_scas_guardrails.yaml` regardless of cwd; eliminates ENOENT failures without touching production code.
- Work-process enforcement tests gained temp evidence fixtures that seed minimal `strategy/spec/plan/think` docs + critic approvals under `/tmp`, ensuring the new AFP gate logic can run end-to-end without polluting the real repo.
- Domain expert reviewer shims were restored: statistics/philosopher templates once again include the expected keywords, each review records `domainId`, `concerns`, `modelUsed`, and timestamps, and the multi-domain result now aggregates `criticalConcerns` + top-level timestamp.
- Knowledge extractor/ storage rework:
  - Workspace root detection uses upward traversal so git commands run against the actual repo.
  - `extractFromFile` now persists functions/edges (and filters edges whose callees are unknown) so integration tests can query call graphs without reimplementing storage.
  - Function parsing handles TypeScript return types + nested braces via a brace-matching helper; complexity scoring includes a statement-count heuristic for “simple but long” functions.
- ML task aggregator fixes:
  - `extractSection` regex properly escapes `\s` so critic results are parsed again (unblocks `ml_task_aggregator_critic_results.test.ts`).
  - Sanitized “critical language” detection ignores phrases like “No regressions”, preventing false blockers that previously caused the meta-critic to fail even on perfect reports.
- Added `docs/workflows/AFP_REVIEWER_ROUTINE.md` and linked it from the task lifecycle guide so reviewers/spec-plan commands + Wave 0 smoke instructions are part of the standard routine.
