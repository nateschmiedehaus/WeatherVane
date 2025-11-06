# Implementation Notes

- Added `tools/wvo_mcp/src/cli/run_design_review.ts` to host the DesignReviewer CLI under the compiled toolchain with a fallback loader that prefers the `dist/` critic bundle but can execute directly from `src/` when builds are unavailable.
- Removed the legacy ts-node script (`tools/wvo_mcp/scripts/run_design_review.ts`) along with ad-hoc loader/debugging code.
- Updated `tools/wvo_mcp/package.json` so `npm run gate:review` executes the new CLI via Node’s ESM loader, eliminating path hacks while keeping compatibility with existing workflows.
- Extended follow-ups to track task `AFP-MODULE-REMEDIATION-20251105-H` and documented the new plan/design artifacts.
