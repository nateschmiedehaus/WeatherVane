# Deep Thinking Analysis — AFP-PROCESS-CRITIC-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)

---

## Edge Cases

1. **PLAN missing tests section.** Agents leave template placeholder or delete the bullet. → Block commit with explicit guidance.
2. **Tests marked “N/A” without docs-only justification.** Prevents silent bypass; require explicit docs-only phrasing.
3. **Deferral language ("defer", "later", "future sprint").** Detect and fail; otherwise policy becomes optional.
4. **Placeholder text kept (`[list the tests]`, `TBD`).** Indicates plan wasn’t filled in; treat as failure.
5. **New test file staged without plan update.** If plan not staged and no existing plan references path, fail.
6. **Plan references test but spelling differs.** Mitigate by normalising paths and searching without extensions to reduce false negatives.
7. **Large repo with many plan docs.** Cache plan documents per run; bail quickly when no staged files.
8. **Git rename output (R100 old new).** Parser must use last column to avoid missing renamed tests.
9. **Docs-only work legitimately has no tests.** Allow `N/A` if docs-only / documentation-only is stated.
10. **Plan-only commit (planning phase).** Should pass even though code not touched; only enforce test-file rule when tests staged.

---

## Failure Modes

1. **False positives on manual test descriptions.** Ensure heuristic accepts keywords like "manual smoke". Monitor feedback, update matcher quickly.
2. **False negatives for new deferral wording.** Keep keyword list extensible; add monitoring around critic output.
3. **Git command failure (no staging area).** Wrap execSync; treat as zero staged files (pass) to avoid blocking.
4. **Critic slow on CI.** Cache plan docs and skip when staged diff empty; target <2s runtime.
5. **Missing tsx dependency in hook.** Use `npx --yes tsx` and document requirement; fail with clear error if command missing.
6. **Agents bypass hook.** Integrate critic into `critics_run` so autopilot paths enforce rule even without local hook.
7. **Unclear failure messaging.** Return structured issues (code + guidance + plan path).
8. **Docs not updated → agents surprised.** Update AGENTS and Claude setup instructions; mention ProcessCritic explicitly.

---

## Essential vs Accidental Complexity

- **Essential:** Reading plan docs, parsing tests sections, inspecting staged diffs, matching test paths to plans. These enforce the policy.
- **Accidental:** Handling git rename formats, CLI plumbing, caching. Keep minimal by reusing critic base class and leveraging tsx runner.

---

## Mitigation Strategy

- **Prevention:** Detect missing/placeholder/deferral patterns; require docs-only justification; cache plan docs for quick lookups.
- **Detection:** Vitest suite covering success/failure cases; manual dry run on sample commits; review critic logs in `state/critics`.
- **Recovery:** Provide actionable guidance on failure; allow quick keyword updates; fallback to pass when git info unavailable to avoid lockout.

---

## Testing Strategy

1. Vitest: missing tests (fail), deferral text (fail), docs-only with justification (pass), concrete tests listed (pass), new test without plan reference (fail), new test with prior plan reference (pass).
2. Manual: stage sample commits to ensure pre-commit blocks and CLI exits with non-zero code.
3. Integration: run `npx tsx tools/wvo_mcp/scripts/run_process_critic.ts` with no staged files → should pass quickly.
4. Performance: measure runtime with 50 plan docs; ensure <2s.
5. Regression: ensure `critics_run` returns structured JSON (pass/fail) for autopilot.

Success criteria: automated suite green; pre-commit fails intentional violations; autopilot run reports new critic.

---

## Assumptions

1. Git available and staging area accessible.  
2. Plan docs stored at `state/evidence/<task>/plan.md`.  
3. Plans list tests using path fragments or test keywords.  
4. Docs-only work explicitly states so.  
5. Agents run pre-commit or `critics_run` before merge.  
6. `npx tsx` is installed (via devDependencies).  
7. Number of plan docs manageable for caching.  
8. Test files added through tracked sources (not generated).  
9. Plans updated before implementation and reference relevant test paths.  
10. Critic results persisted under `state/critics/process.json` for audits.

---

## Worst-Case / Paranoid Scenarios

1. Agents fake docs-only note to bypass tests while touching code. Mitigation: reviewers monitor; consider future enhancement linking files to plan.
2. Critic crashes and blocks all commits. Mitigation: fail gracefully with message; allow quick revert; wrap execSync errors.
3. Performance regression on large diffs. Mitigation: profile; if needed, limit plan scanning to tasks touched.
4. Keyword misses new deferral phrasing. Mitigation: update keywords quickly; announce in docs for vigilance.
5. Hook disabled locally. Mitigation: autopilot `critics_run` enforces same rules.
6. Conflicting updates to plan/test path naming. Mitigation: normalise path strings, allow extension-less match.

---

**Thinking Complete:** 2025-11-06
