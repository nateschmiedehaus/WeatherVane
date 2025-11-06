# AFP-MODULE-REMEDIATION-20251105-H Phase Notes

## STRATEGIZE
- **Problem**: `npm run gate:review` depends on `scripts/run_design_review.ts` executed via `ts-node`. The loader fails whenever `dist/critics/design_reviewer.js` is absent, yielding opaque `[Object: null prototype]` errors and blocking automated GATE checks.
- **Root cause**: The script lives in `tools/wvo_mcp/scripts/` and is run directly as TypeScript. It bypasses the normal build, so runtime resolution relies on ts-node heuristics instead of compiled artifacts.
- **Goal**: Refactor the DesignReviewer CLI into the compiled toolchain so the build produces a stable JS entrypoint. Update npm scripts to use the compiled binary and remove brittle loader code.

## SPEC
- Relocate CLI logic into `tools/wvo_mcp/src/cli/run_design_review.ts` (or similar) alongside other orchestration utilities.
- Ensure `npm run gate:review` triggers `npm run build` (already does) and calls `node dist/cli/run_design_review.js`.
- Remove dynamic loader/inspection hacks from the legacy script; delete the old `.ts` under `scripts/` once replaced.
- Maintain existing functionality: discover tasks, run DesignReviewerCritic, print colour-coded output, propagate exit codes.
- Update followups tracker and evidence artifacts.

## PLAN
1. Identify target directory (e.g., `src/cli/`) and review existing CLI patterns (check `tools/wvo_mcp/src/cli` or similar) to ensure coherence.
2. Move/refactor logic from `scripts/run_design_review.ts` into the new TypeScript source; adjust imports to absolute paths.
3. Update `package.json` script (`gate:review`) to invoke `node dist/...` instead of `npx tsx`.
4. Remove obsolete script file and add any required exports to maintain bundling.
5. Run `npm run build --prefix tools/wvo_mcp` followed by the updated `npm run gate:review` to confirm behaviour.
6. Update evidence and followup records.

## THINK
- **Edge cases**: GATE may run before build; ensure script references compiled path relative to repo root. Need to confirm CI still works.
- **Failure modes**: If build fails, CLI won't exist—acceptable since build failure should block gating. Need to handle missing design docs gracefully as before.
- **AFP/SCAS**: Promotes coherence (same pattern as other compiled tools), economy (deletes loader hacks), visibility (clear failure surface via build), evolution (compiled artifact tracked by existing telemetry).
- **Assumptions**: `src/` already compiled by `tsc`. No other scripts rely on the old path.
