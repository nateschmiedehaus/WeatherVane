# THINK — AFP-MODULE-REMEDIATION-20251105-V

**Date:** 2025-11-06  
**Author:** Codex

---

## Edge Cases & Boundary Conditions

1. **Workspace root detection fails** — guardrail catalog tests must fall back to `state/roadmap.yaml` detection if `.git` is missing (e.g., sandbox mount). Otherwise ENOENT resurfaces.  
2. **Temp evidence directories linger** — work-process tests must create artifacts outside the repo (OS temp dir) and remove them in `afterEach`, or git becomes dirty.  
3. **Domain templates drift in casing** — tests should assert exact lowercase tokens (`statistics`, `philosophical`) so future edits cannot silently break reviewers.  
4. **`criticalConcerns` array empty** — ensure reviewer aggregator always emits non-empty reasons when concerns exist; tests need to cover this.  
5. **Missing ML critic sections** — parser must handle absent critics (partial payload) without throwing, returning `undefined` while still marking blockers if present.  
6. **Wave 0 still blocked elsewhere** — after tests pass, pick a known-safe verification task or create a synthetic validation so we can actually prove autopilot loops run.  
7. **Guardrail tests mutate repo** — never write to `state/policy` or other live directories; treat catalog fixture as read-only.  
8. **Temp evidence uses full templates** — keep synthetic strategy/spec/plan/think files minimal (single heading) to avoid LOC churn and template coupling.  
9. **ML parser introduces shared-module cycle** — keep parsing logic local to the critic module to avoid TypeScript circular imports.  
10. **Resolver loops to filesystem root** — add max-depth + explicit error message listing inspected paths so CI failures are debuggable.

---

## Failure Modes

| ID | Description | Likelihood | Impact | Detection | Mitigation |
|----|-------------|------------|--------|-----------|------------|
| FM1 | Guardrail catalog still cannot locate `meta/afp_scas_guardrails.yaml` | Medium | High | Tests rerun; log explicitly which paths were checked | Implement dual-signal search (`.git` OR `state/roadmap.yaml`) with max-depth guard |
| FM2 | Work-process tests create real evidence directories | Medium | High | `git status` shows new folders | Use `mkdtemp` under OS temp + `finally` cleanup |
| FM3 | Domain expert reviewer regression returns | High | Medium | Tests fail again after next template edit | Keep tests verifying literal keywords + document expectation in README |
| FM4 | ML critic parser throws on partial payload | Medium | Medium | `npm run test` fails sporadically | Treat missing critics as `undefined` and add test coverage |
| FM5 | Wave 0 verification blocked by unrelated roadmap task | Medium | High | Wave 0 logs show `blocked` with proof failure | Queue a synthetic validation task dedicated to this run and document follow-up if still blocked |

---

## Complexity Analysis

- **Essential complexity (~60%)**: Restoring guardrail catalog, work-process fixtures, ML critic parsing, and reviewer templates are all mandatory for AFP guardrails and ProofSystem.  
- **Accidental complexity (~40%)**: Coping with repo-path detection, temp dirs, and Wave 0 proof plumbing are mainly infrastructure hurdles; keep helpers tiny and well-documented to prevent future churn.

**Cyclomatic hot spots:** guardrail resolver (≤4 branches) and ML parser (≤6). Keep each below 50 lines; extract helper functions if additional cases appear.  
**Integration points:** guardrail catalog, reviewer templates, ML critic aggregator, work-process enforcement, ProofIntegration, and Wave 0 runner (6 systems). Track them explicitly in the verification log.  
**Temporal concerns:** Wave 0 runs + proof integration rely on async filesystem checks; ensure lock handling + telemetry writes remain serialized to avoid race conditions.

---

## Worst-Case Scenarios

1. **Wave 0 cannot run even after fixes** — Autopilot remains blocked. Prevention: run `npm --prefix tools/wvo_mcp run build` + critical test suites before Wave 0; Recovery: document blocker, open follow-up remediation task.  
2. **Tests pass locally but fail in CI** — Path resolver assumptions invalid. Prevention: log inspected roots and add unit tests covering unusual directory layouts; Recovery: update helper to respect `process.env.WORKSPACE`.  
3. **Guardrail fixer writes to real policy files** — Could corrupt live guardrail state. Prevention: read-only file operations inside tests; Recovery: keep git clean so revert is trivial.  
4. **ML critic parser mislabels blockers as passing** — Proof system gives false confidence. Prevention: property tests ensuring any `blocker === true` surfaces; Recovery: revert parser + re-run `npm test`.  
5. **Reviewer templates reintroduce high LOC drift** — Future edits exceed guardrail quotas. Prevention: store cues in compact arrays, not prose paragraphs; Recovery: restructure templates into JSON fixtures if needed.

---

## Mitigation Strategy

- **Prevention:**  
  1. Guardrail resolver explicitly checks both `.git` and `state/roadmap.yaml`.  
  2. Work-process tests isolate state in temp dirs and teardown via `afterEach`.  
  3. Domain reviewer templates include canonical lowercase keywords; tests assert them.  
  4. ML parser guards every optional field before accessing properties.  
  5. Wave 0 verification targets a synthetic validation task with known-good prerequisites.

- **Detection:**  
  1. `npm run test --prefix tools/wvo_mcp` (full suite).  
  2. Focused `node --test tests/wave0_status.test.js` to ensure telemetry availability.  
  3. Wave 0 runner logs inspected after each smoke run.  
  4. ProcessCritic ensures plan-authored tests mention Wave 0 + reviewer runs.  
  5. Guardrail monitor script (`node tools/wvo_mcp/scripts/check_guardrails.mjs`) confirms catalog + work-process enforcement remain intact.

- **Recovery:**  
  1. Revert individual modules if a regression reappears (each change isolated per file).  
  2. Document new blockers in `state/evidence/AFP-MODULE-REMEDIATION-20251105/followups.md`.  
  3. If Wave 0 run fails, capture proof logs and immediately open a follow-up task with STRATEGIZE artifacts.

---

## Testing Strategy (PLAN-authored, executed later)

1. `npm --prefix tools/wvo_mcp run build` — compile orchestrator after reasoning updates.  
2. `npm --prefix tools/wvo_mcp run test -- domain_expert,reviews,guardrails,ml_critic,work_process` — targeted suites before the full run to shorten feedback loop.  
3. `node --test tests/wave0_status.test.js` — ensure status CLI reports stale locks and healthy runs deterministically.  
4. `npm --prefix tools/wvo_mcp run wave0 -- --once --epic=WAVE-0` — prove autopilot loop completes after fixes.  
5. `node tools/wvo_mcp/scripts/check_guardrails.mjs` — verify catalog + work-process guardrails show green before closing the task.
