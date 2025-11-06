# Follow-up Task Plan

| Task ID | Scope | Rationale | Status |
| --- | --- | --- | --- |
| AFP-MODULE-REMEDIATION-20251105-A | Restore `ml_task_aggregator` + critic fixtures. | Unblocks ML critic suite. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-B | Rebuild `research_types` & simplify research orchestrator deps. | Required for intelligence flows. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-C | Reintroduce `limits/usage_estimator` or retire references. | Needed for agent budgeting. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-D | Repair domain expert reviewer + evidence bundle. | Quality gate automation. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-E | Provide `code_search` helper bridge. | Context assembler / runtime imports. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-F | Restore orchestrator background task bridge. | Prevent idle orchestrator; clear missing module. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-G | Reinstate guarded command runner and automate missing-module inventory for Autopilot. | Keeps shell execution safe and surfaces module gaps without manual review. | 🚧 in_progress |
| AFP-MODULE-REMEDIATION-20251105-H | Refactor design reviewer CLI into compiled toolchain. | Stabilize AFP gate execution without ts-node errors. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-I | Catalogue TypeScript baseline errors and define remediation strategy. | Enables build stability planning. | 🚧 in_progress |
| AFP-MODULE-REMEDIATION-20251105-J | Implement feature-gate stub helper and update dependent tests. | Fixes TS2740 mocks; unifies gate stubs. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-K | Refresh ML task aggregator fixtures with typed factory helper. | Satisfies MLTaskSummary contract in tests. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-L | Patch pattern mining stub + research orchestrator confidence guard. | Clears remaining TS errors in live code. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-M | Rebaseline LOC analyzer enforcement tests. | Aligns Vitest expectations with current heuristics. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-N | Seed work-process evidence fixtures for phase enforcement tests. | Restores deterministic Critic/phase coverage. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-O | Enhance gate enforcement with upstream phase validation. | Prevents implementation without strategy/spec/plan approvals. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-P | Add spec/plan reviewers and CLI flows. | Enables gate to require spec/plan approvals. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-P3 | Run spec/plan reviewers on live task evidence. | Proves end-to-end workflow and logs approvals. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-P2 | Integrate spec/plan reviewers into routines & docs. | Checklist/docs/test suite updates. | ✅ done |
| AFP-MODULE-REMEDIATION-20251105-Q | Address device profile memory regression test. | Fix memory threshold or implementation leak. | 🆕 pending |
| AFP-MODULE-REMEDIATION-20251105-R | Refresh domain expert reviewer templates/tests. | Align prompts & expectations to current template format. | 🆕 pending |
| AFP-MODULE-REMEDIATION-20251105-I | Catalogue TypeScript baseline errors and define remediation strategy. | Enables build stability planning. | 🚧 in_progress |
| AFP-MODULE-REMEDIATION-20251105-S | Add “surprise-rate” telemetry + dynamic safety case manifests. | IWASS guidance demands live metrics for SCAS assurance. | 🆕 pending |
| AFP-MODULE-REMEDIATION-20251105-T | Build knowledge-graph inventory + module fitness dashboard. | ScienceDirect 2025 highlights KG + LLM integration for autonomy. | 🆕 pending |
| AFP-MODULE-REMEDIATION-20251105-U | Implement near-miss / ODD breach detection service. | Needed for operational safety parity w/ modern autopilot programs. | 🆕 pending |
