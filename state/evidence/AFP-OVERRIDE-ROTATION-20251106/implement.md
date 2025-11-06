# IMPLEMENT — AFP-OVERRIDE-ROTATION-20251106

## Summary

- Added `tools/wvo_mcp/scripts/rotate_overrides.mjs`, exporting reusable helpers plus a CLI that rotates `state/overrides.jsonl`, archives aged entries to gzipped files, and rewrites the ledger atomically.
- Created `tools/wvo_mcp/scripts/rotate_overrides.test.mjs` (Vitest) to cover parsing, partitioning, and end-to-end rotation behaviour using temporary ledgers.
- Extended `ProcessCritic` with daily audit + override freshness enforcement and expanded unit coverage in `src/critics/__tests__/process_critic.test.ts`.
- Published the Daily Artifact Health checklist/template, updated agent checklists (AGENTS.md, claude.md, MANDATORY_WORK_CHECKLIST.md, verification loop), and seeded the first daily audit evidence (`state/evidence/AFP-ARTIFACT-AUDIT-20251106/summary.md`).

## Notes

- Default cutoff set to 24 hours (overridable via CLI flag) so daily automation matches policy.
- Archive filenames derived from the rotation timestamp (sanitised ISO string) and stored under `state/analytics/override_history/`.
- Script supports `--sample` input for simulations and `--dry-run` for diagnostics.
- Tests executed:
  - `npm run test -- rotate_overrides`
  - `npm run test -- process_critic`
