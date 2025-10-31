## Strategy: Harden CI TypeScript loader enforcement

### Why now
- Reviewer flagged that CI guardrail steps still fail under Node 20 if a TypeScript command ships without a loader.
- Phase -1 guardrail rollout requires CI and integrity harness to share consistent protections before Phase 0 tasks proceed.

### Root cause / diagnosis
- `.github/workflows/ci.yml` uses plain `node` invocations; regressions can sneak in if future edits drop the `--import tsx` flag.
- No automated guard exists to fail CI when a bare TypeScript invocation is introduced.

### Options considered
1. **Manual review only** – rejected; brittle and already failed once.
2. **Prepend shared shell wrapper** – would require editing every workflow and script; high maintenance.
3. **Static analyzer for CI workflows** (chosen) – cheap to run, reusable in integrity harness, and fails fast when a regression appears.

### Success metrics
- New guard script fails if any CI step invokes `.ts` without `tsx` or equivalent loader.
- Guard is wired into CI and integrity harness.
- Evidence captured in Verify to prove clean run after guard is enabled.
