# Implementation Notes

- Added shared `DocumentReviewerCritic` helper (`tools/wvo_mcp/src/critics/document_reviewer.ts`) and concrete reviewers `SpecReviewerCritic` / `PlanReviewerCritic` that validate required sections and append approvals to `state/analytics/{spec,plan}_reviews.jsonl`.
- Built CLI runners `run_spec_review.ts` and `run_plan_review.ts` so reviewers can be invoked via `npm run spec:review` / `npm run plan:review`.
- Updated `package.json` scripts to expose the new reviewers.
- Extended gate enforcement: `verifyCriticApprovals` now checks spec/plan approvals and artefact presence, leveraging the new logs.
- Enhanced work-process tests with reusable fixture helpers that seed critic approvals, generate evidence templates, and restore analytics logs; added regression case ensuring gate blocks when spec/plan approvals missing.
