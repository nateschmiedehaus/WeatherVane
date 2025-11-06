# Implementation Notes

- Added fixture helpers to `tools/wvo_mcp/src/work_process/index.test.ts`:
  * `seedCriticApprovals` creates `state/evidence/<task>/{strategy,think}.md` and appends approved entries to the corresponding analytics JSONL logs.
  * `evidencePathForPhase` maps phases to real artifact filenames so ledger entries reflect actual workflow.
  * `afterEach`/`afterAll` restore repository state by removing seeded evidence directories and resetting analytics logs to their original contents.
- Updated tests to call the helper before transitions (`T-001` seeds both `strategy` and `think`; `T-002` seeds `strategy`) and to use the new evidence-path helper.
- Left error-path evidence (`e/backtrack.md`) intact; only success paths use real artifact names.
