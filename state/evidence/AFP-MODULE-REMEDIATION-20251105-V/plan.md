# Plan: AFP-MODULE-REMEDIATION-20251105-V

## Architecture / Approach
1. **Guardrail catalog**  
   - Add a small helper (e.g., `resolveWorkspaceRoot()` inside the test) that climbs directories until it detects `.git` or `state/roadmap.yaml`. This avoids hard-coded `../../../../../../` math and works both locally and in CI.  
   - Keep production code unchanged; only tests need to resolve the proper workspace root. (If necessary, expose a helper via `src/test_helpers/workspace.ts` to share logic with other suites.)

2. **Work-process enforcement fixtures**  
   - Create a temp directory structure (using `tmpdirSync` from `node:os` or `vitest` `beforeEach`) containing `state/evidence/T-00X/{strategy,spec,plan,think}.md`.  
   - Extend the tests to write dummy files + optionally copy from `docs/templates` to satisfy the enforcer.  
   - Inject this temp root into `WorkProcessEnforcer` via constructor options or by stubbing `WORKSPACE_ROOT` to the temp path.

3. **Domain expert reviewer**  
   - Restore template literals for statistics/philosopher reviewers (lowercase keywords, `criticalConcerns` stub).  
   - Ensure `reviewTaskWithMultipleDomains` populates `criticalConcerns` by aggregating reviewer findings; update tests to assert the actual structure (array of strings).  
   - Keep templates extensionless + type-safe per existing coding standard.

4. **ML task aggregator critic results**  
   - Rehydrate the parser to read `critic_results` from the aggregator payload (matching `tools/wvo_mcp/src/critics/ml_task_aggregator.ts`), returning `passed` booleans and reasons.  
   - Update tests to use realistic fixtures (maybe referencing aggregator sample JSON).  
   - If runtime parser already exists, wire tests to the new shape; otherwise, implement minimal parsing logic.

5. **Wave 0 proof run**  
   - After all suites pass, run `npm run wave0 -- --once --epic=WAVE-0` to prove autopilot success.  
   - Capture command output + resulting log line numbers for evidence.

## Files to Change
1. `tools/wvo_mcp/src/orchestrator/domain_expert_reviewer.ts` – template updates + `criticalConcerns` emission.  
2. `tools/wvo_mcp/src/orchestrator/domain_expert_reviewer.test.ts` – adjust assertions to new template strings / verify `criticalConcerns`.  
3. `tools/wvo_mcp/src/guardrails/__tests__/catalog.test.ts` – replace static path math with workspace-root resolver helper; optionally add `tests/helpers/workspace_root.ts`.  
4. `tools/wvo_mcp/src/work_process/index.test.ts` – introduce temp evidence directories & ensure cleanup. May add helper file if needed.  
5. `tools/wvo_mcp/src/critics/ml_task_aggregator.ts` (or helper) – ensure `critic_results` parsing returns pass/fail booleans and `blockers_detected`.  
6. `tools/wvo_mcp/src/critics/__tests__/ml_task_aggregator_critic_results.test.ts` – update fixtures/expectations accordingly.  
7. Evidence + documentation: `state/evidence/AFP-MODULE-REMEDIATION-20251105/followups.md`, `state/evidence/AFP-MODULE-REMEDIATION-20251105-V/phases.md`, plus verify/review files once work completes.

## Work Plan
1. **Guardrail helper** – implement resolver + swap into catalog tests.
2. **Work-process fixtures** – build temp evidence directories + inject into enforcer for each test.
3. **Domain reviewer parity** – update templates + reviewer output, adjust tests.
4. **ML critic results** – finalize parser + test assertions.
5. **Full test run** – execute individual suites, then `npm run test`.
6. **Wave 0 validation** – run Wave 0 once to prove success.
7. **Evidence/doc updates** – update followups + verify/review docs with command outputs.

PLAN-authored tests:
- `npx vitest run src/guardrails/__tests__/catalog.test.ts`
- `npx vitest run src/work_process/index.test.ts`
- `npx vitest run src/orchestrator/domain_expert_reviewer.test.ts`
- `npx vitest run src/critics/__tests__/ml_task_aggregator_critic_results.test.ts`
- `npm run test --prefix tools/wvo_mcp`
- `npm --prefix tools/wvo_mcp run wave0 -- --once --epic=WAVE-0`

## Milestones
| Milestone | Definition of Done | Target |
| --- | --- | --- |
| M1 – Suites fixed | All four Vitest suites green individually | Today |
| M2 – Full test pass | `npm run test --prefix tools/wvo_mcp` succeeds | Immediately after M1 |
| M3 – Wave 0 proof | Wave 0 run completes task (status ≠ blocked) | After M2 |
| M4 – Evidence | followups + verify/review updated, logs captured | Before handoff |

## Verification Strategy
- Unit suites (Vitest):
  - `npx vitest run src/orchestrator/domain_expert_reviewer.test.ts`
  - `npx vitest run src/guardrails/__tests__/catalog.test.ts`
  - `npx vitest run src/work_process/index.test.ts`
  - `npx vitest run src/critics/__tests__/ml_task_aggregator_critic_results.test.ts`
- Full validation:
  - `npm run test --prefix tools/wvo_mcp`
  - `npm run typecheck --prefix tools/wvo_mcp` (smoke, optional if build already runs)
  - `npm run wave0 -- --once --epic=WAVE-0`
- Evidence:
  - Capture command output snippets + log file references in `verify.md`
  - Update `state/analytics/wave0_runs.jsonl` log line references

## Risks & Mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Workspace resolution helper mis-detects root | Tests might point at parent dir again | Detect `.git` + `state/roadmap.yaml`; add assertion when not found |
| Temp evidence directories leak to disk | Flaky tests / clutter | Use `mkdtempSync` + `rm` in `afterEach` |
| Domain reviewer template drift reoccurs | Tests brittle | Keep keywords lowercase + add snapshot-style tests verifying anchor phrases |
| ML critic parser change exceeds LOC budget | Task blocks due to scope creep | Prioritize blocking suites first; if parser fix >50 LOC, defer with documented rationale and update spec/plan accordingly |
| Wave 0 still blocked by unrelated failures | Task cannot close | If new failures appear, document blockers + open targeted follow-up; requirement remains to achieve one successful run before closing |

---

## Addendum – Task Module Execution Plan (2025‑11‑07)

### Architecture Extensions
1. **TaskModuleRunner** – new component under `tools/wvo_mcp/src/wave0/` that:
   - Parses `state/roadmap.yaml` into a flattened list of tasks.
   - Indexes tasks by `set_id` and `id` for dependency lookups.
   - Dispatches to module implementations (currently Review + Reform) based on task title/ID.
2. **Review Module** – consumes the indexed set, computes:
   - Status counts (done/in_progress/pending/blocked).
   - Evidence coverage (does `state/evidence/<taskId>` exist?).
   - Dependency readiness (which dependencies incomplete, which missing entirely).
   - Recommendations grouped into “Unblock dependencies”, “Strengthen evidence”, “Via negativa”.
3. **Reform Module** – extends the review analysis with:
   - Root-cause clustering (dependencies that block ≥2 tasks).
   - ROI-style prioritization (tasks unblocked per dependency fix).
   - Suggested deletions/consolidations when work is already done but set remains open.
4. **EvidenceScaffolder Enhancements** – support `writePhaseDocument(phase, markdown)` + `updatePhaseStatus` so automation can replace boilerplate and mark phases complete once populated.
5. **TaskExecutor Integration** – call the module runner inside `performImplementation`, apply returned phase updates, append implementation logs, and pass the module summary into `summary.md`.

### Updated Work Steps
8. Build roadmap index + helper utilities (evidence detection, dependency health).
9. Implement Review/Reform modules and unit tests covering their data extraction and markdown generation.
10. Expose new EvidenceScaffolder APIs + ensure existing tests cover them (`evidence_scaffolder.test.ts`).
11. Wire TaskExecutor to module runner, update summary + phase statuses based on module output, and keep placeholder path as fallback for unsupported tasks.
12. Re-run `npm run wave0 -- --once --epic=WAVE-0` targeting a pending Review/Reform task to verify evidence now contains data-driven insights.

### Additional Risks
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Selected task lacks `set_id` | Module cannot compute metrics | Detect upfront, log warning, fall back to placeholder and mark task blocked for human follow-up |
| Roadmap parser drifts when schema changes | Runner crashes mid-task | Keep parser tolerant (optional chaining) + add regression tests with fixture roadmap snippets |
| Generated markdown too verbose or noisy | Reviewers ignore automation output | Limit tables to essential columns + highlight top issues with numbered lists |
| Module logic mis-identifies dependencies | Could recommend wrong fix | Cross-reference dependency IDs against roadmap index; include unresolved IDs in “Unknown references” section for manual review |
