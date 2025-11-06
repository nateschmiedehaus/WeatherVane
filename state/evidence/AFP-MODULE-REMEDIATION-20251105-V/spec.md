# Spec: AFP-MODULE-REMEDIATION-20251105-V

## Success Criteria
1. `npm run test --prefix tools/wvo_mcp` completes with zero failures (no selective skipping).  
2. Guardrail catalog tests run against the real repo root and confirm the four baseline guardrails without ENOENT errors.  
3. Work-process enforcement tests validate sequential AFP transitions using synthetic evidence directories; enforcement remains strict (still requires artifacts).  
4. Domain expert reviewer tests pass with templates restored (keywords + `criticalConcerns` data).  
5. Wave 0 completes at least one task after the fixes (`state/analytics/wave0_runs.jsonl` shows a run with status ≠ `blocked`).  
6. ML task aggregator critic-result tests either pass or are explicitly documented as deferred (if deferred, document in review + follow-ups why autopilot is unaffected). Target is to fix them if it does not jeopardize the blocking suites.

## Requirements
1. Restore domain expert reviewer templates so statistics/philosopher cues and `criticalConcerns` arrays exist, matching historical reviewer behavior.  
2. Provide a deterministic workspace-root resolver for guardrail catalog tests so `meta/afp_scas_guardrails.yaml` loads without ENOENT.  
3. Create temporary evidence directories for work-process tests so strict AFP lifecycle checks remain enforced without modifying production code.  
4. Parse ML critic results into booleans + blocker strings, covering pass/fail/partial scenarios required by tests.  
5. Demonstrate a successful Wave 0 run after test repairs to prove autopilot routines (spec/plan reviewer commands + Wave0 runner) actually work.  

## Functional Requirements

1. **Domain Expert Reviewer Parity**
   - Templates in `tools/wvo_mcp/src/orchestrator/domain_expert_reviewer.ts` (or adjacent fixtures) must contain the textual cues asserted in tests (`statistics`, `philosophical`, `criticalConcerns` etc.).
   - Reviewer output must include `criticalConcerns` (array) when consensus detects issues, so integration tests can assert the structure.

2. **Guardrail Catalog Root Detection**
   - `tools/wvo_mcp/src/guardrails/__tests__/catalog.test.ts` (or helper) must resolve the real workspace root regardless of test cwd (prefer `process.cwd()` fallbacks or `import.meta.url` resolution).
   - Catalog reader continues to expect `meta/afp_scas_guardrails.yaml` at repo root; no duplication of the file under `tools/wvo_mcp/`.

3. **Work-Process Test Fixtures**
   - Tests must create temporary `state/evidence/<task>` directories populated with `strategy/spec/plan/think` docs (can be synthetic) so the enforcer sees valid artifacts.
   - Tests verify hash chain + sequential enforcement without disabling the new checks.

4. **ML Critic Result Extraction (lower priority but in scope)**
   - Parser in `tools/wvo_mcp/src/critics/ml_task_aggregator.ts` must expose `critic_results.<critic>.passed` booleans and `blockers_detected` list matching tests.
   - If fix proves too large, document deferral and ensure autopilot loop explicitly tolerates missing ML data (but preferred outcome is a working parser).

5. **Autopilot Demonstration**
   - After tests pass, run `npm run wave0 -- --once --epic=WAVE-0` and capture the run details in `state/analytics/wave0_runs.jsonl`.
   - Evidence bundle for the Wave 0 task must show progression beyond discovery (implementation + improvement/resolution).

## Non-Functional Requirements
- **AFP/SCAS guardrails**: ≤5 files, ≤150 net LOC touched; prefer refactors/tests over new production logic.
- **Observability**: Document fix locations plus follow-up status in `state/evidence/AFP-MODULE-REMEDIATION-20251105/followups.md`.
- **Maintainability**: Introduce helper utilities (e.g., `resolveWorkspaceRoot()`, temp evidence factory) instead of duplicating logic inside each test.
- **Determinism**: Tests must not depend on real repo cleanliness (e.g., guardrail worktree check may warn if repo dirty; assertions should allow pass/warn/fail as before).
- **Safety**: Do not relax guardrail/work-process checks; solutions must satisfy enforcement without adding bypass flags.

## Acceptance Criteria
1. `npx vitest run src/orchestrator/domain_expert_reviewer.test.ts` passes and inspection confirms templates still enforce reviewer tone.
2. `npx vitest run src/guardrails/__tests__/catalog.test.ts` passes, reading the catalog from repo root (verified path log or test comment).
3. `npx vitest run src/work_process/index.test.ts` passes using temporary evidence directories; tests still confirm rejection when artifacts missing.
4. `npx vitest run src/critics/__tests__/ml_task_aggregator_critic_results.test.ts` passes (unless explicitly deferred with documented impact analysis).
5. Full `npm run test` passes (no skipped suites) and log captured in evidence.
6. Wave 0 run after fixes completes at least one task with status updated beyond discovery; log stored in `state/analytics/wave0_runs.jsonl` and referenced in verify.md.

## Out of Scope
- Rewriting the guardrail catalog content itself (only path resolution / access).
- Changing ProofSystem behavior or altering which suites it runs.
- Broad refactors of the domain expert reviewer beyond template/parsing adjustments needed for the tests.
- Adding new guardrail checks or work-process phases (handled by other tasks).
