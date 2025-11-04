# Quality Bar Policy

- Changed-lines coverage >= target for every Verify run; mutation-smoke optional but available for critical flows.
- Reviewer rubric (readability, maintainability, performance, security) must pass with actionable comments or fail the run.
- No placeholder returns, skip/xfail/test.only usage, or no-op config flips to satisfy gates.
- Pull requests require LCP evidence, test output artifacts, and Reviewer+Critical approvals before Supervisor can mark ready.
