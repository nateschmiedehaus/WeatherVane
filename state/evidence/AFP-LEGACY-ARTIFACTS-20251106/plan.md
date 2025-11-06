# PLAN: AFP-LEGACY-ARTIFACTS-20251106

## Approach
1. Generate inventory of untracked files (`git status --short` + `find`).
2. Categorize items into:
   - Source/logic (e.g., supervisor TS files, taskflow tooling).
   - Evidence/state artifacts (AFP tasks, analytics snapshots).
   - Generated/transient files (decide if any belong in gitignore).
3. Stage and commit meaningful artifacts (likely majority fall here given preference for keeping).
4. Create `.gitignore` entries only for demonstrably generated outputs (document reasoning in evidence if needed).
5. Validate repository clean (`git status`).

## Files to Change
- Newly tracked directories under `autopilot_mvp/`, `shared/schemas/`, `state/evidence/`, `tools/taskflow/`, `tools/wvo_mcp/src/...`, etc.
- Evidence documentation: `state/evidence/AFP-LEGACY-ARTIFACTS-20251106/*`.
- Possibly `.gitignore` (if unavoidable).

## PLAN-authored Tests
- `git status --short` — baseline inventory (captured before/after cleanup).
- `node tools/wvo_mcp/scripts/rotate_overrides.mjs --dry-run` — confirm override ledger clean before staging changes.
- `node tools/wvo_mcp/scripts/rotate_overrides.mjs` — execute rotation if dry-run indicates aged entries.
- `npm --prefix tools/wvo_mcp run test -- rotate_overrides` — ensure rotation helper remains green after tracking artifacts.
- Manual: review `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/summary.md` to verify audit evidence updated with findings.
- Manual autopilot sanity: `npm run wave0 -- --dry-run` to confirm legacy artifact cleanup does not break Wave 0 task execution.
