# Deep Thinking Analysis — AFP-AUTOPILOT-LIVE-ENFORCEMENT-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)

---

## Edge Cases

1. **PLAN lacks Wave 0 details.** Autopilot plan lists “run tests” generically. → Fail commit; provide remediation pointing to Wave 0 keywords.
2. **PLAN marks tests N/A but still touches autopilot code.** → Block unless docs-only justification present.
3. **New autopilot code staged without plan update.** → Fail with guidance to update plan before committing.
4. **Docs-only tasks mentioning autopilot (FAQs).** Need allowance; rely on docs-only keyword to bypass.
5. **Autopilot test keywords change (new script names).** Provide extensible list, document update process.
6. **Developers rename Wave 0 script.** Ensure heuristic includes `run_wave0`, `TaskFlow`, `live autopilot` to reduce breakage; update when necessary.
7. **Large staged diff with many plans.** Cache plan docs; exit quickly if autopilot detection not triggered.
8. **Git rename output (R100) for autopilot files.** Parser uses final column, so rename surfaces autopilot path.
9. **Hotfix autopilot config change requiring fast commit.** Policy still blocks; emphasise that plan update can be quick (fail-safe) but no bypass.
10. **Case sensitivity (Wave 0 vs wave0).** Use case-insensitive regex for keywords.

---

## Failure Modes

1. **False positive on non-autopilot work.** Mitigation: require multiple keywords (autopilot/wave0/supervisor) and docs-only override.
2. **False negative (autopilot commit slips through).** If file path lacks keywords (e.g., generic util), enforcement may miss. Encourage developers to update plan anyway; consider follow-up to tag tasks via metadata.
3. **Critic runtime >2s.** Mitigation: parse staged diff once, cache plan docs, short-circuit when nothing staged.
4. **Critic crash due to git absence.** Wrap execSync; treat as empty staged set to avoid blocking unexpectedly.
5. **Keyword drift causing legitimate failures.** Provide guidance in docs and commit message to extend keyword list quickly.
6. **Developers disable hook.** MCP `critics_run` will still fail because ProcessCritic registered server-side.
7. **Wave 0 environment unavailable (credentials).** Policy demands live run; guidance to escalate rather than bypass.

---

## Essential vs Accidental Complexity

- **Essential:** Inspecting staged files, parsing PLAN docs, enforcing Wave 0 keywords, requiring plan updates alongside code.
- **Accidental:** Handling git output formats, maintaining keyword lists, caching plan docs. Keep implementation modular to contain this.

---

## Mitigation Strategy

- Prevention: fail early via pre-commit + MCP critic, update docs to broadcast requirement.
- Detection: vitest coverage for major scenarios, manual smoke via CLI, review critic outputs in `state/critics/process.json`.
- Recovery: guidance includes exact file/plan to fix; docs instruct how to add Wave 0 steps. If false positive, adjust keyword list quickly.

---

## Testing Strategy

1. Vitest: missing tests section (fail), deferral text (fail), docs-only (pass), new test without plan (fail), autopilot plan lacking Wave 0 keyword (fail), autopilot plan with Wave 0 steps (pass), autopilot code diff without plan (fail).
2. Manual: run CLI on staged autopilot change to see block; rerun after plan update to confirm success.
3. Integration: ensure pre-commit hook uses CLI and fails fast.
4. Regression: run full plan checker on repo with no staged files (should print skip quickly).

Success metrics: tests green, CLI failure for missing Wave 0 docs, CLI success after patch.

---

## Assumptions

1. Autopilot work touches files containing `autopilot`, `wave0`, or `supervisor` in path.  
2. PLAN docs include autopilot keywords when relevant.  
3. Developers can run Wave 0 locally (credentials available).  
4. Docs-only autopilot tasks rare; require explicit note.  
5. npx node runtime available for pre-commit CLI.  
6. ProcessCritic integration remains invoked by MCP autopilot flows.

---

## Worst-Case Scenarios

1. Developers attempt to commit autopilot change without plan update → blocked; escalate plan creation as remediation.  
2. Live Wave 0 not runnable due to infra outage → policy still blocks; dev must escalate to leadership for exception.  
3. Keyword drift breaks enforcement → must update keyword list promptly (document location).  
4. ProcessCritic mis-identifies autopilot change → review instructions to adjust patterns; keep logs for debugging.

---

**Thinking Complete:** 2025-11-06
