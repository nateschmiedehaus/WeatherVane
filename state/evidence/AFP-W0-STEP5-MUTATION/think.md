# Deep Thinking Analysis — AFP-W0-STEP5-MUTATION

**Template Version:** 1.0  
**Date:** 2025-11-09  
**Author:** Codex Autopilot (Wave 0 audit workstream)

---

## Edge Cases

- **Edge Case 1 – Empty evidence directories**  
  **Scenario:** Task directory exists but only plan.md is present.  
  **Impact:** Hooks exit before surfacing guidance, so agents rerun with `--no-verify`.  
  **Mitigation:** Fail fast with actionable error + seed minimal strategy/spec/think.

- **Edge Case 2 – Oversized evidence artifacts (>10 MB)**  
  **Scenario:** Massive strategy.md or ledger JSON causes git diff + reviewers to choke.  
  **Impact:** Hooks time out; agents bypass to land code.  
  **Mitigation:** Chunk evidence into phase-specific files and compress tarballs with sha256 references.

- **Edge Case 3 – Non-UTF8 evidence**  
  **Scenario:** copy/paste from PDF introduces smart quotes; TemplateDetector mis-counts tokens.  
  **Impact:** Relax mode triggers incorrectly because tokenizer splits multi-byte characters.  
  **Mitigation:** Normalize to UTF-8 and strip BOM before running critics.

- **Edge Case 4 – VERIFY log <1 KB**  
  **Scenario:** Vitest output suppressed (CI quiet mode) leaving short log.  
  **Impact:** End-Steps rejects artifacts even though tests ran.  
  **Mitigation:** Stream vitest stdout/stderr into log and pad to ≥1024 bytes with heartbeat metadata.

- **Edge Case 5 – Coverage artifacts missing**  
  **Scenario:** TypeScript compile fails before vitest writes coverage.  
  **Impact:** ProcessCritic flags `coverage_intersection_empty` even though changed files had tests previously.  
  **Mitigation:** Pre-flight `npm --prefix tools/wvo_mcp run build`, detect missing coverage JSON, and emit fallback coverage + guidance.

- **Edge Case 6 – Git diff failure (bad base)**  
  **Scenario:** Fork PR rewrites history; `git diff origin/main...HEAD` errors.  
  **Impact:** SCAS treats failure as pass, allowing unlimited files.  
  **Mitigation:** Fallback to `git merge-base` and fail closed with explicit reasons.

- **Edge Case 7 – Determinism drift (TZ/SOURCE_DATE_EPOCH)**  
  **Scenario:** CI runner uses local timezone; coverage JSON order differs.  
  **Impact:** Noise commits; TemplateDetector history polluted.  
  **Mitigation:** Set `TZ=UTC`, `SOURCE_DATE_EPOCH=1700000000` in workflows and mention in docs.

- **Edge Case 8 – Node version mismatch**  
  **Scenario:** Workflows pinned to 20.x but developers use 24.x (per engines field).  
  **Impact:** `npm ci` fails or better-sqlite3 builds with wrong headers.  
  **Mitigation:** Align `.nvmrc`, workflow pins, and package engines; document fallback instructions.

- **Edge Case 9 – TemplateDetector parsing front matter**  
  **Scenario:** Evidence files begin with YAML front matter; token counts inflated.  
  **Impact:** Detector flags template usage incorrectly.  
  **Mitigation:** Strip front matter before trigram analysis; store body-only tokens.

- **Edge Case 10 – Coverage/critics path drift**  
  **Scenario:** Developer writes coverage to `verify/coverage.json`.  
  **Impact:** End-Steps can't verify canonical artifact; CI fails unpredictably.  
  **Mitigation:** Normalize to `coverage/coverage.json`, delete legacy files, and enforce via check_end_steps.

---

## Failure Modes

1. **Failure Mode: Evidence bypass relapse**  
   *Cause:* Agents reintroduce "compliance theater" (e.g., commit STRATEGIZE only).  
   *Symptom:* ledger_stageX.json missing entries, validation matrix empty; ProcessCritic still passes because plan.md unchanged.  
   *Impact:* Critical (undermines entire audit).  
   *Likelihood:* Medium unless automation enforces.  
   *Detection:* Compare staged files with ledger/validation matrix updates; guard via docsync + hooks.  
   *Mitigation:* Two-phase apply/validate enforced per patch; require ledger + validation matrix updates in same commit.

2. **Failure Mode: VERIFY scope regression**  
   *Cause:* Future change broadens Vitest include glob; smoke now runs entire repo.  
   *Symptom:* VERIFY log >5 MB, runtime >5 min, coverage_artifacts polluted.  
   *Impact:* High (discourages agents from running VERIFY).  
   *Likelihood:* Medium (common to "just run vitest").  
   *Detection:* Track coverage file count + log size in KPI aggregator; alarm if >5 tests run.  
   *Mitigation:* Lock config file under git + pre-commit check ensuring include list equals smoke test.

3. **Failure Mode: Coverage intersection false positives**  
   *Cause:* ProcessCritic normalizes path but changed files tracked from different worktree; `git diff --name-only origin/main...HEAD` returns duplicates/untracked.  
   *Symptom:* Coverage log shows intersection but changed file actually untested.  
   *Impact:* High (coverage gate meaningless).  
   *Likelihood:* Medium (multi-worktree).  
   *Detection:* Store changed file list + coverage list in critic_results.json; audit for mismatched casing/paths.  
   *Mitigation:* Use `path.normalize` before comparison, drop files outside allowlist.

4. **Failure Mode: TemplateDetector relaxation abuse**  
   *Cause:* Relax config allows fallback when plan cites reranker evidence, but agents add empty `drqc_citations`.  
   *Symptom:* TemplateDetector passes low-uniqueness plan.  
   *Impact:* High (resumes template copy/paste).  
   *Likelihood:* Medium.  
   *Detection:* Validate citations array length, verify sha256 exists, reranker JSON contains rationales.  
   *Mitigation:* TemplateDetector already checks drqc_citations; ensure contract runner enforces before relaxation.

5. **Failure Mode: KPI aggregate false alarm**  
   *Cause:* KPIs logged per phase always identical (same metrics reused) → trend detection meaningless.  
   *Symptom:* aggregate.json always flags coverage_pct_changed <25% even after improvement.  
   *Impact:* Medium (alerts ignored).  
   *Likelihood:* Medium initial.  
   *Detection:* Review aggregate JSON for monotonic trend zero; cross-check actual coverage summary.  
   *Mitigation:* Feed actual metrics from coverage, template detector, SGAT logs each run; update aggregator to compute deltas per commit.

6. **Failure Mode: Ledger drift**  
   *Cause:* Developers forget to append stage ledger after commit; patch sha mismatched.  
   *Symptom:* audit_summary references patch not in repo; compliance unverifiable.  
   *Impact:* High (audit worthless).  
   *Likelihood:* Medium.  
   *Detection:* Add parity commands to manual_parity.md referencing ledger path; run `jq` validation script later.  
   *Mitigation:* Bake ledger update into Two-Phase workflow (Apply patch → Validate → record sha → commit evidence-only updates).

7. **Failure Mode: SCAS fail-open on git errors**  
   *Cause:* `check_scas.mjs` swallows git diff failures (bad base ref) and defaults to pass.  
   *Symptom:* attest/scas.json shows pass:true even when diffs > budget.  
   *Impact:* Critical — SCAS gate meaningless.  
   *Likelihood:* High until fail-closed logic implemented.  
   *Detection:* Add explicit `reasons[]` + exit 1 on git errors, fallback merge-base for invalid base, log budgets.

---

## Assumptions

1. **State artifacts live under `state/**`**  
   - *If wrong:* Hooks fail to find evidence → commits blocked.  
   - *Likelihood:* Low (repo structure stable).  
   - *Mitigation:* Document fallback environment variable `WVO_STATE_ROOT`.

2. **Agents run Node 20.x for MCP tooling**  
   - *If wrong:* better-sqlite3 builds against Node 24 headers → runtime crash.  
   - *Mitigation:* Provide `.nvmrc`, CI pins, and guardrails to detect mismatch.

3. **Vitest verify suite remains <5 tests**  
   - *If wrong:* VERIFY runtime explodes; developers skip it.  
   - *Mitigation:* Lock config file and add watchdog script counting executed tests.

4. **State directory resides on fast disk (NVMe)**  
   - *If wrong:* coverage writes take >5s; autopilot timeouts.  
   - *Mitigation:* Document acceptable latency + warn if fsync exceeds budget.

5. **SCAS budgets stored in `state/config/drqc.json`**  
   - *If wrong:* check_scas cannot find budgets → fail closed.  
   - *Mitigation:* Support env overrides + default budgets defined inline.

6. **Git history accessible (`git merge-base` works)**  
   - *If wrong:* diff commands fail.  
   - *Mitigation:* Provide fallback to `origin/HEAD` and log actionable error.

7. **Critics outputs are JSON (UTF-8)**  
   - *If wrong:* TemplateDetector/trend tools crash.  
   - *Mitigation:* Validate JSON before writing and keep backups.

8. **Coverage JSON small enough to store in repo (<500 KB)**  
   - *If wrong:* evidence commits too heavy.  
   - *Mitigation:* Summarize coverage and keep raw artifacts out of git if necessary.

9. **Wave 0 live loop can run locally**  
   - *If wrong:* autopilot validation stalls.  
   - *Mitigation:* Provide TaskFlow sandbox instructions + remote logs.

10. **ProcessCritic intersects changed files with coverage**  
    - *If wrong:* coverage gate meaningless.  
    - *Mitigation:* Add unit tests validating intersection logic and log tracked lists.

## Complexity Analysis

- **Essential complexity:** Need to coordinate VERIFY, SCAS, End-Steps, TemplateDetector, and CI. At least four subsystems touched (executor, scripts, workflows, evidence).
- **Accidental complexity:** Historically large evidence files + stale paths created noise. Current design removes redundant coverage files and simplifies logging.
- **Cyclomatic complexity:** `verify.ts` now has ~4 decision points (log creation, coverage fallback, SCAS trailer, error handling). Manageable but needs tests.
- **Cognitive load:** Contributors must understand evidence conventions (coverage path, critics folder, SCAS budgets). Documented via plan/spec to reduce guesswork.
- **Integration complexity:** GitHub Actions + local scripts share logic (Node version pins, env vars). We mitigate by centralizing config and referencing `state/config/drqc.json`.

## Mitigation Strategies

### Prevention
- Enforce Node 20.x via `.nvmrc`, actions/setup-node, and docs.
- Run `npm --prefix tools/wvo_mcp run build` before verify to catch TypeScript errors.
- Strip front matter + normalize encoding before TemplateDetector analysis.
- Delete legacy coverage paths and guard via `check_end_steps`.

### Detection
- Append vitest output to verify log and check size + SCAS trailer.
- Add structured reasons array to SCAS attestation for budget overruns.
- Log coverage intersection inputs inside ProcessCritic for audits.
- Monitor wave0 process via `ps aux | grep wave0` and startup log tail.

### Recovery
- Provide fallback coverage data (synthetic) if vitest fails; highlight tasks requiring rerun.
- Offer manual remediation path for SCAS diff errors (rerun with explicit base/head).
- Archive previous evidence tarballs with sha256 so auditors can roll back.
- Document steps to restart wave0 harness after crash.

## Testing Strategy

- **Unit tests:** Extend process critic tests to cover allowlist + normalized paths; add TemplateDetector tests for front-matter stripping.
- **Integration tests:** `WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task ...` plus `node tools/wvo_mcp/scripts/check_scas.mjs` + `check_end_steps.mjs`.
- **Edge-case tests:** Simulate missing coverage JSON, SCAS diff failure, and small verify log; assert scripts fail closed with guidance.
- **Failure tests:** Force vitest failure (bad import) and confirm VERIFY surfaces stack trace + fallback coverage.
- **Manual / Live tests:** Run `npm --prefix tools/wvo_mcp run wave0` in background, monitor log, and verify autopilot completes at least one roadmap task without manual intervention.

## Paranoid Thinking (Worst-Case Scenarios)

1. **Complete VERIFY failure:** Command exits before writing log; mitigation: wrap entire run in try/finally and emit error stub.
2. **SCAS gate bypass:** Git diff returns empty because attacker sets HEAD=BASE; mitigation: compare net LOC to `git status --short`.
3. **Coverage forgery:** Contributor edits coverage JSON manually; mitigation: store raw coverage artifacts + hash in attestations.
4. **TemplateDetector false negative:** Body-only analysis still misses templated plan; mitigation: log token uniqueness score + require citations.
5. **CI supply-chain issue:** actions/setup-node fetches compromised toolchain; mitigation: pin SHAs, verify `node --version`, and prefer GitHub's official actions.
6. **Data loss:** Evidence directory accidentally deleted; mitigation: keep tarball + sha256 in `state/evidence/.../patches_bundle`.
7. **Performance regression:** VERIFY grows >60s causing developers to skip; mitigation: track duration in log and alert when exceeding budget.

## Open Questions

- Should reranker evidence + citations be stored per task under `state/logs/<TASK>/kb`, or centralized for reuse? Per-task still preferred for traceability but adds size.
- Mutation stub timeline: when can we replace stub with real harness once Node-gyp stability improves?
- Do we need additional critics (e.g., TemplateDetector relaxed_when overrides) to run in CI for forked PRs with limited state access?

If any assumption proves false, loop back to STRATEGIZE/SPEC/PLAN before implementing the next stage.
