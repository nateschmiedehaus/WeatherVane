<!-- Unified Autopilot evidence checklist — see docs/autopilot/RECOVERY_PLAYBOOK.md for definitions (legacy templates are archived) -->

## Summary
- Describe the problem and the approach (include plan delta + checkpoints).

## Resolution Proof (required)
- [ ] Failing run / log: <!-- resources://runs/... -->
- [ ] Fix diff reference: <!-- commit / patch id -->
- [ ] Passing run / log: <!-- resources://runs/... -->
- [ ] Changed-lines coverage ≥80% + touched-files delta ≥5% (link):
- [ ] Reviewer rubric JSON attached (path to artifact):
- [ ] App smoke (or stubbed provider evidence) attached if secrets involved:
- [ ] Risk + rollback plan (who owns, how to revert):

## Testing & Quality Gates
- [ ] `tests.run`
- [ ] `lint.run`
- [ ] `typecheck.run`
- [ ] `security.scan`
- [ ] `license.check`
- [ ] Mutation smoke (if enabled)
- [ ] App smoke script (`scripts/app_smoke_e2e.sh`) or equivalent evidence

## Reviewer Notes
- Link to decision journal entry, KB updates, and next measurable milestone.
