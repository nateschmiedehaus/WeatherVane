Version: 2025-10-25

# WeatherVane Definition of Done (Pull Requests)

1. **Tests & Coverage**
   - All modified areas include unit/integration tests.
   - Relevant suites pass locally and in CI.
   - Coverage delta for touched files ≥ 5% unless Supervisor grants exemption.

2. **Quality Gates**
   - Lint, type-check, security, and license scanners are green.
   - Critical/Reviewer agents sign off with structured feedback captured in the decision journal.

3. **Documentation & Risk**
   - PR description states scope, testing evidence, rollout steps, and rollback plan.
   - Any config or schema changes document migration steps.

4. **Observability & Memory**
   - Decision journal entry created for each state transition.
   - Artifacts (test logs, diffs) stored under `resources://runs/<id>/`.
